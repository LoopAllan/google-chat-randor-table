'use strict';

/**
 * Reads an element's text with line breaks preserved, and records which
 * character range each text node / <br> produced so a table found in the
 * text can be mapped back to DOM nodes.
 *
 * innerText is not used because it depends on layout: hidden nodes would
 * read differently and the "has the text changed?" check would flap.
 */
(function (root) {
  const TEXT_NODE = 3;
  const ELEMENT_NODE = 1;
  const SKIPPED_TAGS = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT']);
  const BLOCK_TAGS = new Set([
    'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DIV', 'DL', 'DT', 'FIGCAPTION', 'FIGURE',
    'FOOTER', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P',
    'PRE', 'SECTION', 'TABLE', 'TR', 'UL',
  ]);

  /**
   * @param {Node} node
   * @param {(element: Element) => boolean} [shouldSkip] subtrees to leave out entirely
   * @returns {{ text: string, leaves: Array<{ node: Node, start: number, end: number }> }}
   */
  function mapText(node, shouldSkip = () => false) {
    let text = '';
    const leaves = [];

    function append(leafNode, value) {
      leaves.push({ node: leafNode, start: text.length, end: text.length + value.length });
      text += value;
    }

    function ensureLineBreak() {
      if (text !== '' && !text.endsWith('\n')) {
        text += '\n';
      }
    }

    function visit(current) {
      if (current.nodeType === TEXT_NODE) {
        append(current, current.data);
        return;
      }
      if (current.nodeType !== ELEMENT_NODE || SKIPPED_TAGS.has(current.tagName) || shouldSkip(current)) {
        return;
      }
      if (current.tagName === 'BR') {
        append(current, '\n');
        return;
      }
      const isBlock = BLOCK_TAGS.has(current.tagName);
      if (isBlock) {
        ensureLineBreak();
      }
      current.childNodes.forEach(visit);
      if (isBlock) {
        ensureLineBreak();
      }
    }

    visit(node);
    return { text, leaves };
  }

  const api = { mapText };
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.MdTable = Object.assign(root.MdTable || {}, api);
  }
})(globalThis);
