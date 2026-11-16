'use strict';

/**
 * Turns a table paste into the composer into a markdown table.
 * Listens in the capture phase so it runs before Chat's own paste handler.
 */
(function (root) {
  // Chat DOM knowledge lives in chatDom.js (loaded first by the manifest).
  const chatDom = typeof module === 'object' && module.exports ? require('./chatDom.js') : root.MdTable.chatDom;

  /**
   * isUserEvent is injectable because isTrusted cannot be faked in tests.
   * onError reports a paste we could not read; Chat then pastes it as usual.
   */
  function createPasteConverter({
    doc, eventTarget = doc, tableFromClipboard, toMarkdown, insert,
    isUserEvent = (event) => event.isTrusted,
    onError = (message, error) => console.error(message, error),
  }) {
    /** The paste event targets the editing host, so the caret tells whether we are in a code block. */
    function caretInCodeBlock(composer) {
      const selection = doc.getSelection();
      const node = selection === null || selection.rangeCount === 0 ? null : selection.getRangeAt(0).startContainer;
      return chatDom.codeBlockAncestor(node, composer) !== null;
    }

    function onPaste(event) {
      // Our own synthetic paste (composerInserter) must reach Chat untouched.
      if (!isUserEvent(event) || event.clipboardData === null) {
        return;
      }
      const composer = chatDom.editableAncestor(event.target);
      if (composer === null) {
        return;
      }
      const clipboard = {
        html: event.clipboardData.getData('text/html'),
        text: event.clipboardData.getData('text/plain'),
      };
      let table;
      try {
        table = tableFromClipboard(clipboard);
      } catch (error) {
        onError(`[md-table] could not read the pasted table (html ${clipboard.html.length} chars, text ${clipboard.text.length} chars); leaving the paste to Chat`, error);
        return;
      }
      if (table === null) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      // Chat's code block already acts as the fence; a second ``` would nest.
      insert(composer, toMarkdown(table, { fenced: !caretInCodeBlock(composer) }));
    }

    return {
      start: () => eventTarget.addEventListener('paste', onPaste, true),
      stop: () => eventTarget.removeEventListener('paste', onPaste, true),
    };
  }

  const api = { createPasteConverter };
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.MdTable = Object.assign(root.MdTable || {}, api);
  }
})(globalThis);
