'use strict';

/**
 * Shows each Chat composer code block that holds a markdown table as a
 * rendered table.
 *
 * The preview lives in a fixed layer outside the contenteditable and is laid
 * over the code block, whose text is made transparent and whose height is
 * stretched to the preview's. The markdown itself stays in Chat's editor, so
 * what gets sent is unchanged.
 *
 * Chat's editor reacts to changes in its DOM (verified 2026-11-16: an inline
 * height on the code block was dropped, and re-applying it on every scroll
 * made the composer jump back). So the code block only gets two attributes,
 * written when their value changes; its height lives in our own <style>.
 *
 * Because the preview sits on top of the composer, it hands back what it
 * would otherwise swallow: vertical wheel scrolls the composer, and a click
 * puts the caret after the code block so typing keeps working. Its toolbar
 * sticks to the top of the visible part, so it stays reachable for long tables.
 */
(function (root) {
  const COMPOSER_CODE_BLOCK_SELECTOR = '[role="textbox"][contenteditable="true"] article[role="code"]';
  const EDITABLE_SELECTOR = '[contenteditable]:not([contenteditable="false"])';
  const STATE_ATTRIBUTE = 'data-mdtable-preview';
  // A separate name: the code block's state attribute makes everything under it transparent.
  const PREVIEW_STATE_ATTRIBUTE = 'data-mdtable-state';
  const ID_ATTRIBUTE = 'data-mdtable-id';
  const HEIGHTS_STYLE_ATTRIBUTE = 'data-mdtable-preview-heights';
  const LAYER_CLASS = 'mdtable-composer-layer';
  const PREVIEW_CLASS = 'mdtable-composer-preview';
  const SCROLLABLE_OVERFLOW = /(auto|scroll)/;
  const SHOW_TEXT = 4;
  const TEXT_NODE = 3;
  const LABEL_EDIT = '編輯表格';
  const LABEL_SHOW_SOURCE = '顯示原文';
  const LABEL_SHOW_TABLE = '顯示表格';

  function createComposerPreview({ doc, findTables, mapText, renderTable, onEdit, MutationObserverImpl, schedule }) {
    const view = doc.defaultView;
    /** code block -> { element, toolbar, toggle, items: Array<{ element, start }>, leaves, text, state } */
    const previews = new Map();
    let layer = null;
    let heightsStyle = null;
    let nextId = 1;
    /** data-mdtable-id -> stretched height in px */
    const heights = new Map();
    let observer = null;
    let pending = false;

    function ensureLayer() {
      if (layer === null || !layer.isConnected) {
        layer = doc.createElement('div');
        layer.className = LAYER_CLASS;
        doc.body.appendChild(layer);
      }
      return layer;
    }

    const composerOf = (block) => block.closest(EDITABLE_SELECTOR);

    function setAttributeIfChanged(element, name, value) {
      if (element.getAttribute(name) !== value) {
        element.setAttribute(name, value);
      }
    }

    function writeHeights() {
      if (heightsStyle === null || !heightsStyle.isConnected) {
        heightsStyle = doc.createElement('style');
        heightsStyle.setAttribute(HEIGHTS_STYLE_ATTRIBUTE, '');
        (doc.head ?? doc.documentElement).appendChild(heightsStyle);
      }
      const css = [...heights].map(([id, height]) => `[${ID_ATTRIBUTE}="${id}"][${STATE_ATTRIBUTE}="table"]`
        + `{min-height:${height}px !important;max-height:none !important}`).join('\n');
      if (heightsStyle.textContent !== css) {
        heightsStyle.textContent = css;
      }
    }

    function setHeight(block, height) {
      const id = block.getAttribute(ID_ATTRIBUTE);
      if (height === null) {
        heights.delete(id);
      } else {
        heights.set(id, height);
      }
      writeHeights();
    }

    // ---- handing interaction back to the composer ------------------------------

    function collapsedRange(node, offset) {
      const range = doc.createRange();
      range.setStart(node, offset);
      range.collapse(true);
      return range;
    }

    function textNodes(element) {
      const walker = doc.createTreeWalker(element, SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) {
        nodes.push(walker.currentNode);
      }
      return nodes;
    }

    /** Start of the line after the code block, or the end of the block when nothing follows it. */
    function placeCaretAfter(block) {
      const next = block.nextSibling;
      let caret;
      if (next !== null) {
        const [firstText] = next.nodeType === TEXT_NODE ? [next] : textNodes(next);
        caret = collapsedRange(firstText ?? next, 0);
      } else {
        const lastText = textNodes(block).pop();
        caret = lastText === undefined ? collapsedRange(block, block.childNodes.length) : collapsedRange(lastText, lastText.length);
      }
      composerOf(block).focus();
      const selection = doc.getSelection();
      selection.removeAllRanges();
      selection.addRange(caret);
    }

    function scrollParentOf(block) {
      for (let element = block.parentElement; element !== null && element !== doc.body; element = element.parentElement) {
        if (SCROLLABLE_OVERFLOW.test(view.getComputedStyle(element).overflowY)) {
          return element;
        }
      }
      return doc.scrollingElement;
    }

    function forwardVerticalWheel(block, event) {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
        return;
      }
      const scroller = scrollParentOf(block);
      if (scroller === null) {
        return;
      }
      event.preventDefault();
      scroller.scrollBy({ top: event.deltaY });
    }

    // ---- building ----------------------------------------------------------------

    function button(className, label, onClick) {
      const element = doc.createElement('button');
      element.type = 'button';
      element.className = className;
      element.textContent = label;
      // Keep the composer's focus and caret where the user left them.
      element.addEventListener('mousedown', (event) => event.preventDefault());
      element.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      });
      return element;
    }

    /** The table whose rows are at the top of what the user currently sees. */
    function tableInView(block, entry) {
      const visibleTop = visibleRect(block).top;
      const item = entry.items.find((candidate) => candidate.element.getBoundingClientRect().bottom > visibleTop);
      return item ?? entry.items[entry.items.length - 1];
    }

    function setState(block, entry, state) {
      entry.state = state;
      setAttributeIfChanged(block, STATE_ATTRIBUTE, state);
      entry.element.setAttribute(PREVIEW_STATE_ATTRIBUTE, state);
      entry.toggle.textContent = state === 'table' ? LABEL_SHOW_SOURCE : LABEL_SHOW_TABLE;
      placeOver(block, entry);
    }

    function build(block, tables, leaves, state) {
      const element = doc.createElement('div');
      element.className = PREVIEW_CLASS;
      const entry = { element, toolbar: null, toggle: null, items: [], leaves, text: null, state };

      tables.forEach((table) => {
        const item = doc.createElement('div');
        item.className = 'mdtable-composer-item';
        item.appendChild(renderTable(table, doc));
        element.appendChild(item);
        entry.items.push({ element: item, start: table.start });
      });

      entry.toolbar = doc.createElement('div');
      entry.toolbar.className = 'mdtable-composer-toolbar';
      entry.toolbar.appendChild(button('mdtable-composer-edit', LABEL_EDIT, () => {
        const { start } = tableInView(block, entry);
        const leaf = entry.leaves.find((candidate) => candidate.node.nodeType === TEXT_NODE
          && candidate.start <= start && start < candidate.end);
        onEdit(composerOf(block), collapsedRange(leaf.node, start - leaf.start));
      }));
      entry.toggle = button('mdtable-toggle', LABEL_SHOW_SOURCE, () => {
        setState(block, entry, entry.state === 'table' ? 'source' : 'table');
      });
      entry.toolbar.appendChild(entry.toggle);
      element.appendChild(entry.toolbar);

      element.addEventListener('click', () => placeCaretAfter(block));
      element.addEventListener('wheel', (event) => forwardVerticalWheel(block, event), { passive: false });
      ensureLayer().appendChild(element);
      return entry;
    }

    function release(block) {
      const entry = previews.get(block);
      entry.element.remove();
      setHeight(block, null);
      block.removeAttribute(STATE_ATTRIBUTE);
      previews.delete(block);
    }

    function refresh() {
      const blocks = new Set(doc.querySelectorAll(COMPOSER_CODE_BLOCK_SELECTOR));
      [...previews.keys()].filter((block) => !blocks.has(block)).forEach(release);

      blocks.forEach((block) => {
        const { text, leaves } = mapText(block);
        const existing = previews.get(block);
        if (existing !== undefined && existing.text === text) {
          return;
        }
        const tables = findTables(text);
        if (existing !== undefined) {
          release(block);
        }
        if (tables.length === 0) {
          return;
        }
        if (!block.hasAttribute(ID_ATTRIBUTE)) {
          block.setAttribute(ID_ATTRIBUTE, String(nextId));
          nextId += 1;
        }
        const entry = build(block, tables, leaves, existing === undefined ? 'table' : existing.state);
        entry.text = text;
        previews.set(block, entry);
        setState(block, entry, entry.state);
      });
    }

    // ---- layout --------------------------------------------------------------------

    /** Visible area of block: its rect cut by every ancestor that clips overflow (e.g. the scrolling composer). */
    function visibleRect(block) {
      let { top, left, bottom, right } = block.getBoundingClientRect();
      for (let element = block.parentElement; element !== null && element !== doc.body; element = element.parentElement) {
        if (view.getComputedStyle(element).overflow === 'visible') {
          continue;
        }
        const clip = element.getBoundingClientRect();
        top = Math.max(top, clip.top);
        left = Math.max(left, clip.left);
        bottom = Math.min(bottom, clip.bottom);
        right = Math.min(right, clip.right);
      }
      return { top, left, bottom, right };
    }

    function placeOver(block, entry) {
      const style = entry.element.style;
      const blockStyle = view.getComputedStyle(block);
      // Composer font, not the code block's monospace: look like a table in a sent message.
      const composerStyle = view.getComputedStyle(composerOf(block));
      style.font = composerStyle.font;
      style.color = composerStyle.color;
      style.padding = blockStyle.padding;
      style.setProperty('--mdtable-block-background', blockStyle.backgroundColor);
      style.width = `${block.getBoundingClientRect().width}px`;

      // Natural height first: in table view the code block grows to fit the table.
      style.height = '';
      setHeight(block, entry.state === 'table' ? entry.element.offsetHeight : null);

      const box = block.getBoundingClientRect();
      const visible = visibleRect(block);
      if (visible.bottom <= visible.top || visible.right <= visible.left) {
        style.visibility = 'hidden';
        return;
      }
      style.visibility = '';
      style.top = `${box.top}px`;
      style.left = `${box.left}px`;
      style.height = `${box.height}px`;
      style.clipPath = `inset(${Math.max(0, visible.top - box.top)}px ${Math.max(0, box.right - visible.right)}px `
        + `${Math.max(0, box.bottom - visible.bottom)}px ${Math.max(0, visible.left - box.left)}px)`;
      entry.toolbar.style.top = `${Math.max(0, visible.top - box.top)}px`;
    }

    function reposition() {
      // Scroll / resize can fire after Chat removed a block (e.g. on send) but before
      // the MutationObserver callback refreshes, so drop blocks that left the composer.
      [...previews.keys()].filter((block) => !block.isConnected || composerOf(block) === null).forEach(release);
      previews.forEach((entry, block) => placeOver(block, entry));
    }

    // ---- wiring ----------------------------------------------------------------------

    function requestRefresh() {
      if (pending) {
        return;
      }
      pending = true;
      schedule(() => {
        pending = false;
        refresh();
        reposition();
      });
    }

    function isOwnMutation(record) {
      const element = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      return element !== null && element.closest(`.${LAYER_CLASS}`) !== null;
    }

    function onMutations(records) {
      if (records.some((record) => !isOwnMutation(record))) {
        requestRefresh();
      }
    }

    return {
      refresh,
      start() {
        observer = new MutationObserverImpl(onMutations);
        observer.observe(doc.body, { childList: true, subtree: true, characterData: true });
        // Capture catches scrolling inside the composer too; scroll events do not bubble.
        view.addEventListener('scroll', reposition, true);
        view.addEventListener('resize', reposition);
        refresh();
      },
      stop() {
        observer.disconnect();
        view.removeEventListener('scroll', reposition, true);
        view.removeEventListener('resize', reposition);
        [...previews.keys()].forEach(release);
      },
    };
  }

  const api = { createComposerPreview };
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.MdTable = Object.assign(root.MdTable || {}, api);
  }
})(globalThis);
