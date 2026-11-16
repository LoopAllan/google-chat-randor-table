'use strict';

/**
 * Finds the markdown table under the caret in Chat's composer and builds a DOM
 * range covering exactly its text, so the editor result can replace it.
 *
 * Composer shape (verified 2026-11-16): one <div> per line; Chat code blocks
 * are <article role="code"> wrapping those line divs. A table already inside a
 * code block must be written back without its own ``` fence.
 */
(function (root) {
  const TEXT_NODE = 3;
  // Chat DOM knowledge lives in chatDom.js (loaded first by the manifest).
  const chatDom = typeof module === 'object' && module.exports ? require('./chatDom.js') : root.MdTable.chatDom;

  function createComposerTableLocator({ doc, mapText, textLeafAt, findTables, fromParsed }) {
    function caretOffset(leaves, textLength, caret) {
      const container = caret.startContainer;
      if (container.nodeType === TEXT_NODE) {
        const leaf = leaves.find((candidate) => candidate.node === container);
        return leaf === undefined ? null : leaf.start + caret.startOffset;
      }
      // Caret between elements: it sits at the start of the first leaf that follows it.
      const following = leaves.find((leaf) => caret.comparePoint(leaf.node, 0) >= 0);
      return following === undefined ? textLength : following.start;
    }

    function rangeFor(leaves, start, end) {
      const first = textLeafAt(leaves, start);
      const last = textLeafAt(leaves, end, { atEnd: true });
      if (first === undefined || last === undefined) {
        throw new Error(`[md-table] could not map table text [${start}, ${end}) back to composer nodes`);
      }
      const range = doc.createRange();
      range.setStart(first.node, start - first.start);
      range.setEnd(last.node, end - last.start);
      return range;
    }

    /** @returns {{ initial, range: Range, codeBlock: Element | null } | null} */
    function locate(composer, caret) {
      const { text, leaves } = mapText(composer);
      const offset = caretOffset(leaves, text.length, caret);
      if (offset === null) {
        return null;
      }
      const table = findTables(text).find((candidate) => candidate.start <= offset && offset <= candidate.end);
      if (table === undefined) {
        return null;
      }
      const range = rangeFor(leaves, table.start, table.end);
      const codeBlock = chatDom.codeBlockAncestor(range.startContainer, composer);
      return {
        initial: fromParsed(table),
        range,
        codeBlock,
      };
    }

    return { locate };
  }

  const api = { createComposerTableLocator };
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.MdTable = Object.assign(root.MdTable || {}, api);
  }
})(globalThis);
