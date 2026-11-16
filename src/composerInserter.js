'use strict';

/**
 * Puts text into Chat's composer in a way Chat's editor state notices.
 *
 * Verified in Chat (2026-11-16 spike): a synthetic paste is handled by Chat's
 * own paste handler (untrusted events have no browser default, so any text
 * that appears was inserted by Chat). execCommand('insertText') also works
 * and is the fallback. A synthetic beforeinput event is ignored by Chat.
 */
(function (root) {
  function createComposerInserter({ dispatchPaste, execInsertText }) {
    function insert(composer, text) {
      const before = composer.textContent;
      dispatchPaste(composer, text);
      if (composer.textContent !== before) {
        return 'paste';
      }
      if (execInsertText(text) && composer.textContent !== before) {
        return 'insertText';
      }
      throw new Error('[md-table] could not insert text into the composer: both synthetic paste and insertText left it unchanged');
    }

    return { insert };
  }

  /** Browser implementations of the two strategies, kept apart so the logic above is testable. */
  function browserStrategies(doc) {
    return {
      dispatchPaste(composer, text) {
        const data = new DataTransfer();
        data.setData('text/plain', text);
        composer.focus();
        composer.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
      },
      execInsertText(text) {
        return doc.execCommand('insertText', false, text);
      },
    };
  }

  const api = { createComposerInserter, browserStrategies };
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.MdTable = Object.assign(root.MdTable || {}, api);
  }
})(globalThis);
