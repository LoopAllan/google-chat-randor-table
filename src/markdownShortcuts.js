'use strict';

/**
 * Markdown shortcuts while typing in an editable cell: once the syntax right
 * before the caret closes (**粗**, *斜*, ~~刪~~, `code`, [文字](url)), it is
 * replaced by the formatted element, the way Notion does it.
 *
 * What counts as closed is decided by renderInline itself (no second parser):
 * the text from an opening marker up to the caret must render as exactly one
 * element. A zero-width space follows the new element so the caret lands
 * outside it; otherwise browsers keep typing in bold (readCell strips it).
 */
(function (root) {
  const ELEMENT_NODE = 1;
  /** Not content: readCell strips it. */
  const CARET_SPACER = '\u200B';
  /** Characters that can close a shortcut. */
  const CLOSERS = new Set(['*', '_', '~', '`', ')']);
  /** Characters that can open one. */
  const OPENERS = new Set(['*', '_', '~', '`', '[']);
  const WORD_CHARACTER = /[\p{L}\p{N}]/u;

  /** Leftmost opener whose text up to the caret renders as one element; markers inside a longer run do not open. */
  function findShortcut(typed, renderInline, doc) {
    for (let start = 0; start < typed.length - 1; start += 1) {
      const char = typed[start];
      const before = typed[start - 1];
      if (!OPENERS.has(char) || before === char || before === '\\' || (char === '_' && WORD_CHARACTER.test(before ?? ''))) {
        continue;
      }
      const fragment = renderInline(typed.slice(start), doc);
      if (fragment.childNodes.length === 1 && fragment.firstChild.nodeType === ELEMENT_NODE) {
        return { start, element: fragment.firstChild };
      }
    }
    return null;
  }

  /**
   * Converts the markdown that closes at offset in textNode.
   * @returns {{ node: Text, offset: number } | null} where the caret goes, or null when nothing converted
   */
  function applyShortcut(textNode, offset, renderInline) {
    const typed = textNode.data.slice(0, offset);
    const closer = typed[typed.length - 1];
    // A closer followed by the same character is still being typed (the first "*" of a closing "**").
    if (!CLOSERS.has(closer) || textNode.data[offset] === closer) {
      return null;
    }
    const doc = textNode.ownerDocument;
    const shortcut = findShortcut(typed, renderInline, doc);
    if (shortcut === null) {
      return null;
    }
    const after = textNode.splitText(offset);
    textNode.data = typed.slice(0, shortcut.start);
    const spacer = doc.createTextNode(CARET_SPACER);
    after.before(shortcut.element, spacer);
    [textNode, after].filter((node) => node.data === '').forEach((node) => node.remove());
    return { node: spacer, offset: spacer.length };
  }

  const api = { applyShortcut, CARET_SPACER };
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.MdTable = Object.assign(root.MdTable || {}, api);
  }
})(globalThis);
