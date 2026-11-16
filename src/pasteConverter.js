'use strict';

/**
 * Turns a spreadsheet paste into the composer into a markdown table.
 * Listens in the capture phase so it runs before Chat's own paste handler.
 */
(function (root) {
  const EDITABLE_SELECTOR = '[contenteditable]:not([contenteditable="false"])';

  /** isUserEvent is injectable because isTrusted cannot be faked in tests. */
  function createPasteConverter({ doc, eventTarget = doc, tableFromClipboard, toMarkdown, insert, isUserEvent = (event) => event.isTrusted }) {
    function onPaste(event) {
      // Our own synthetic paste (composerInserter) must reach Chat untouched.
      if (!isUserEvent(event) || event.clipboardData === null) {
        return;
      }
      const composer = event.target.nodeType === 1 ? event.target.closest(EDITABLE_SELECTOR) : null;
      if (composer === null) {
        return;
      }
      const rows = tableFromClipboard({
        html: event.clipboardData.getData('text/html'),
        text: event.clipboardData.getData('text/plain'),
      });
      if (rows === null) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      insert(composer, toMarkdown(rows));
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
