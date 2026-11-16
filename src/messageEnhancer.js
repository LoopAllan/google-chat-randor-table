'use strict';

/**
 * Finds message elements that contain markdown tables and swaps only the
 * table lines for a rendered table; everything else in the message keeps
 * Chat's own DOM (lists, bold, links, mentions).
 *
 * It does not rely on Google Chat class names (obfuscated, change between
 * releases). It walks up from text nodes containing "|" to the deepest
 * element whose text forms a table, maps the table's character range back
 * to the text nodes / <br>s that produced it, and hides those nodes.
 * Hidden nodes stay in the DOM so the original can be toggled back.
 */
(function (root) {
  const SHOW_TEXT = 4;
  const TEXT_NODE = 3;
  const MAX_ANCESTOR_DEPTH = 8;
  // Chat caps a message at about 4,000 characters, so a larger element is a list of
  // messages: climbing further would stitch a table together across messages and
  // re-read the whole conversation on every change inside it.
  const MAX_CONTAINER_TEXT = 10000;
  const VERDICT = { HAS_TABLE: 'has-table', NO_TABLE: 'no-table', TOO_LARGE: 'too-large' };
  const CONTAINER_ATTRIBUTE = 'data-mdtable-container';
  const HIDDEN_ATTRIBUTE = 'data-mdtable-hidden';
  const WRAPPER_CLASS = 'mdtable-wrapper';
  const SOURCE_SPAN_CLASS = 'mdtable-source';
  // Chat DOM knowledge lives in chatDom.js (loaded first by the manifest).
  const chatDom = typeof module === 'object' && module.exports ? require('./chatDom.js') : root.MdTable.chatDom;
  const EXCLUDED_SELECTOR = [
    `.${WRAPPER_CLASS}`,
    `[${CONTAINER_ATTRIBUTE}]`,
    // The composer preview layer (composerPreview.js) renders its own tables.
    `.${chatDom.PREVIEW_LAYER_CLASS}`,
    chatDom.TYPING_AREA,
    'textarea',
    'script',
    'style',
  ].join(',');
  const LABEL_SHOW_SOURCE = '顯示原文';
  const LABEL_SHOW_TABLE = '顯示表格';

  function createMessageEnhancer({ findTables, mapText, renderTable, doc }) {
    /** container element -> { sourceText, groups: Array<{ wrapper, hidden: Element[], spans: Element[] }> } */
    const processed = new WeakMap();

    const isWrapper = (element) => element.classList.contains(WRAPPER_CLASS);
    const readMap = (element) => mapText(element, isWrapper);
    const hasTable = (text) => text.includes('|') && findTables(text).length > 0;

    function isOwnNode(node) {
      const element = node.nodeType === 1 ? node : node.parentElement;
      return element !== null && element.closest(`.${WRAPPER_CLASS}`) !== null;
    }

    // ---- locating containers -------------------------------------------------

    function isExcluded(textNode) {
      const parent = textNode.parentElement;
      return parent === null || parent.closest(EXCLUDED_SELECTOR) !== null;
    }

    function verdictFor(text) {
      if (text.length > MAX_CONTAINER_TEXT) {
        return VERDICT.TOO_LARGE;
      }
      return hasTable(text) ? VERDICT.HAS_TABLE : VERDICT.NO_TABLE;
    }

    function findContainerFrom(textNode, cache) {
      let element = textNode.parentElement;
      for (let depth = 0; depth < MAX_ANCESTOR_DEPTH && element !== null; depth += 1) {
        if (element === doc.body || element === doc.documentElement) {
          return null;
        }
        if (!cache.has(element)) {
          cache.set(element, verdictFor(readMap(element).text));
        }
        const verdict = cache.get(element);
        if (verdict === VERDICT.TOO_LARGE) {
          return null;
        }
        if (verdict === VERDICT.HAS_TABLE) {
          return element;
        }
        element = element.parentElement;
      }
      return null;
    }

    function collectCandidateTextNodes(scanRoot) {
      if (scanRoot.nodeType === TEXT_NODE) {
        return scanRoot.data.includes('|') ? [scanRoot] : [];
      }
      const walker = doc.createTreeWalker(scanRoot, SHOW_TEXT);
      const nodes = [];
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        if (node.data.includes('|')) {
          nodes.push(node);
        }
      }
      return nodes;
    }

    // ---- mapping a table range to DOM nodes ----------------------------------

    /** Splits text nodes so every range boundary falls between nodes. */
    function splitAtBoundaries(leaves, boundaries) {
      [...boundaries].sort((a, b) => b - a).forEach((boundary) => {
        const leaf = leaves.find((candidate) => candidate.node.nodeType === TEXT_NODE
          && candidate.start < boundary && boundary < candidate.end);
        if (leaf !== undefined) {
          leaf.node.splitText(boundary - leaf.start);
        }
      });
    }

    /** Highest nodes (up to the container) whose every leaf lies inside the range. */
    function topmostNodesIn(container, rangeLeaves) {
      const inRange = new Set(rangeLeaves);
      const coverage = new Map();
      const isCovered = (element) => {
        if (!coverage.has(element)) {
          coverage.set(element, readMap(element).leaves.every((leaf) => inRange.has(leaf.node)
            || (leaf.node.nodeType === TEXT_NODE && leaf.node.data.trim() === '')));
        }
        return coverage.get(element);
      };

      const tops = [];
      rangeLeaves.forEach((leaf) => {
        let top = leaf;
        while (top !== container && top.parentNode !== null && isCovered(top.parentNode)) {
          top = top.parentNode;
        }
        if (!tops.includes(top)) {
          tops.push(top);
        }
      });
      return tops;
    }

    /** Text nodes cannot be hidden with CSS, so they get wrapped in a span we own. */
    function toHideableElements(nodes) {
      const hidden = [];
      const spans = [];
      nodes.forEach((node) => {
        if (node.nodeType !== TEXT_NODE) {
          hidden.push(node);
          return;
        }
        const span = doc.createElement('span');
        span.className = SOURCE_SPAN_CLASS;
        node.parentNode.insertBefore(span, node);
        span.appendChild(node);
        hidden.push(span);
        spans.push(span);
      });
      return { hidden, spans };
    }

    /**
     * A code block hidden as a whole becomes the table, so its tool bar (word wrap)
     * would act on nothing visible; it is hidden and shown together with the source.
     */
    function codeBlockToolsOf(hidden) {
      return hidden
        .filter((element) => element.matches(chatDom.CODE_BLOCK))
        .flatMap((block) => [...block.parentElement.children]
          .filter((sibling) => sibling !== block && sibling.matches(chatDom.CODE_BLOCK_TOOLS)));
    }

    // ---- rendering -----------------------------------------------------------

    function setGroupState(group, state) {
      group.hidden.forEach((element) => element.setAttribute(HIDDEN_ATTRIBUTE, state));
      group.rendered.hidden = state === 'source';
      group.toggle.textContent = state === 'table' ? LABEL_SHOW_SOURCE : LABEL_SHOW_TABLE;
    }

    function createWrapper(table) {
      const wrapper = doc.createElement('div');
      wrapper.className = WRAPPER_CLASS;
      const rendered = wrapper.appendChild(renderTable(table, doc));
      const toggle = doc.createElement('button');
      toggle.type = 'button';
      toggle.className = 'mdtable-toggle';
      wrapper.appendChild(toggle);
      return { wrapper, rendered, toggle };
    }

    function renderGroup(container, leaves, range) {
      const rangeLeaves = leaves
        .filter((leaf) => leaf.start >= range.start && leaf.end <= range.end)
        .map((leaf) => leaf.node);
      const { hidden, spans } = toHideableElements(topmostNodesIn(container, rangeLeaves));
      const { wrapper, rendered, toggle } = createWrapper(range.table);
      hidden[0].parentNode.insertBefore(wrapper, hidden[0]);
      hidden.push(...codeBlockToolsOf(hidden));

      const group = { wrapper, rendered, toggle, hidden, spans };
      toggle.addEventListener('click', (event) => {
        // Keep Chat's own click handlers (open thread, select message) out of it.
        event.stopPropagation();
        const showingTable = hidden[0].getAttribute(HIDDEN_ATTRIBUTE) === 'table';
        setGroupState(group, showingTable ? 'source' : 'table');
      });
      setGroupState(group, 'table');
      return group;
    }

    function enhance(container) {
      const { text, leaves } = readMap(container);
      const ranges = findTables(text).map((table) => ({
        table,
        start: table.start,
        // Swallow the line break after the table so no blank line is left below it.
        end: text[table.end] === '\n' ? table.end + 1 : table.end,
      }));
      if (ranges.length === 0) {
        return;
      }
      splitAtBoundaries(leaves, ranges.flatMap((range) => [range.start, range.end]));
      const splitLeaves = readMap(container).leaves;
      const groups = ranges.map((range) => renderGroup(container, splitLeaves, range));

      container.setAttribute(CONTAINER_ATTRIBUTE, '');
      processed.set(container, { sourceText: text, groups });
    }

    function release(container) {
      const entry = processed.get(container);
      if (entry !== undefined) {
        entry.groups.forEach(({ wrapper, hidden, spans }) => {
          wrapper.remove();
          hidden.forEach((element) => element.removeAttribute(HIDDEN_ATTRIBUTE));
          spans.forEach((span) => span.replaceWith(...span.childNodes));
        });
        processed.delete(container);
      }
      container.removeAttribute(CONTAINER_ATTRIBUTE);
    }

    // ---- public API ----------------------------------------------------------

    function scan(scanRoot) {
      const cache = new Map();
      const containers = new Set();
      collectCandidateTextNodes(scanRoot).forEach((textNode) => {
        if (isExcluded(textNode)) {
          return;
        }
        const container = findContainerFrom(textNode, cache);
        if (container !== null && container.querySelector(`[${CONTAINER_ATTRIBUTE}]`) === null) {
          containers.add(container);
        }
      });
      containers.forEach(enhance);
    }

    /** The processed message holding node, or null. */
    function containerOf(node) {
      const element = node.nodeType === 1 ? node : node.parentElement;
      return element === null ? null : element.closest(`[${CONTAINER_ATTRIBUTE}]`);
    }

    /** Re-renders the processed message containing node, if any. Returns whether one was found. */
    function refreshAround(node) {
      const container = containerOf(node);
      if (container === null) {
        return false;
      }
      const entry = processed.get(container);
      if (entry !== undefined && entry.sourceText === readMap(container).text) {
        return true;
      }
      release(container);
      enhance(container);
      return true;
    }

    /** Processed messages at or under node. */
    function containersWithin(node) {
      if (node.nodeType !== 1) {
        return [];
      }
      const containers = node.matches(`[${CONTAINER_ATTRIBUTE}]`) ? [node] : [];
      containers.push(...node.querySelectorAll(`[${CONTAINER_ATTRIBUTE}]`));
      return containers;
    }

    /** Cleans up rendered tables whose message (node or a descendant) was removed by Chat. */
    function releaseWithin(node) {
      containersWithin(node).forEach(release);
    }

    /** Undoes rendered tables under node that now sit in a typing area (e.g. the composer became editable). */
    function releaseInTypingAreas(node) {
      containersWithin(node).filter((container) => container.closest(chatDom.TYPING_AREA) !== null).forEach(release);
    }

    return { scan, containerOf, refreshAround, releaseWithin, releaseInTypingAreas, isOwnNode };
  }

  const api = { createMessageEnhancer };
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.MdTable = Object.assign(root.MdTable || {}, api);
  }
})(globalThis);
