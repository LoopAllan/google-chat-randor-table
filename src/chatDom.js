'use strict';

/**
 * Everything this extension knows about Google Chat's DOM, in one place: when
 * a Chat release changes its markup, this is the file to update.
 * Verified against chat.google.com on 2026-11-16.
 */
(function (root) {
  const EDITABLE = '[contenteditable]:not([contenteditable="false"])';
  const COMPOSER = '[role="textbox"][contenteditable="true"]';
  /**
   * Anywhere the user types, editable or not right now: Chat restores a draft
   * into the composer before making it editable (verified 2026-11-16), and
   * anything rendered there in that moment becomes part of the draft.
   */
  const TYPING_AREA = `[role="textbox"], ${EDITABLE}`;
  /** Chat code blocks are <article role="code"> (composer and sent messages); <pre> covers older markup. */
  const CODE_BLOCK = '[role="code"], pre';
  const COMPOSER_CODE_BLOCK = CODE_BLOCK.split(', ').map((block) => `${COMPOSER} ${block}`).join(', ');
  /** Tool bar Chat puts next to a sent code block (word-wrap toggle). */
  const CODE_BLOCK_TOOLS = '[exclude-from-clipboard]';
  /** Our own layer for composer previews; the message renderer must not scan it. */
  const PREVIEW_LAYER_CLASS = 'mdtable-composer-layer';

  const elementOf = (node) => (node === null || node.nodeType === 1 ? node : node.parentElement);

  /** The editable holding node; our preview layer's editable table cells are not Chat's. */
  function editableAncestor(node) {
    const element = elementOf(node);
    if (element === null || element.closest(`.${PREVIEW_LAYER_CLASS}`) !== null) {
      return null;
    }
    return element.closest(EDITABLE);
  }

  /** The code block holding node, only when it lies inside composer. */
  function codeBlockAncestor(node, composer) {
    const element = elementOf(node);
    const block = element === null ? null : element.closest(CODE_BLOCK);
    return block !== null && composer.contains(block) ? block : null;
  }

  /** Focuses the composer and, when given, puts the selection on range. */
  function setCaret(composer, range) {
    composer.focus();
    if (range === null) {
      return;
    }
    const selection = composer.ownerDocument.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  /**
   * Sends the composer's message the way a user does: Enter in the composer.
   * Not yet verified against chat.google.com (2026-11-17): if Chat ignores a
   * synthetic Enter, this is the one place to switch to its send button.
   */
  function sendMessage(composer) {
    const KeyboardEventImpl = composer.ownerDocument.defaultView.KeyboardEvent;
    composer.dispatchEvent(new KeyboardEventImpl('keydown', {
      key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true,
    }));
  }

  const api = {
    EDITABLE, COMPOSER, TYPING_AREA, CODE_BLOCK, COMPOSER_CODE_BLOCK, CODE_BLOCK_TOOLS, PREVIEW_LAYER_CLASS,
    editableAncestor, codeBlockAncestor, setCaret, sendMessage,
  };
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.MdTable = Object.assign(root.MdTable || {}, { chatDom: api });
  }
})(globalThis);
