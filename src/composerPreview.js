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
 * outside the cells puts the caret after the code block so typing keeps working.
 *
 * Cells can be edited in place (cellEditing.js). An edited cell rewrites its
 * table's lines in the code block without moving focus, and the preview
 * records the text it expects, so its own write does not rebuild the table
 * being typed in. ↑ / ↓ in the composer on the line next to a table enter it.
 *
 * Cost control (Chat is a large, constantly mutating page):
 * - styles and clipping ancestors are read once per preview build, not per scroll;
 * - the natural height is measured on build, state change and width change only;
 * - scrolling reads all rects first, then writes, once per frame (schedule);
 * - mutations outside composers never search the document; typing inside a
 *   previewed table rebuilds it after a pause (delay).
 */
(function (root) {
  // Chat DOM knowledge lives in chatDom.js (loaded first by the manifest).
  const chatDom = typeof module === 'object' && module.exports ? require('./chatDom.js') : root.MdTable.chatDom;
  const STATE_ATTRIBUTE = 'data-mdtable-preview';
  // A separate name: the code block's state attribute makes everything under it transparent.
  const PREVIEW_STATE_ATTRIBUTE = 'data-mdtable-state';
  const ID_ATTRIBUTE = 'data-mdtable-id';
  const HEIGHTS_STYLE_ATTRIBUTE = 'data-mdtable-preview-heights';
  const LAYER_CLASS = chatDom.PREVIEW_LAYER_CLASS;
  const PREVIEW_CLASS = 'mdtable-composer-preview';
  const SCROLLABLE_OVERFLOW = /(auto|scroll)/;
  const REBUILD_PAUSE_MS = 150;
  const SHOW_TEXT = 4;
  const TEXT_NODE = 3;
  const ELEMENT_NODE = 1;
  const POSITION_PRECEDING = 2;
  const LABEL_EDIT = '編輯表格';
  const LABEL_SHOW_SOURCE = '顯示原文';
  const LABEL_SHOW_TABLE = '顯示表格';

  /**
   * cellEditing (optional) makes cells editable: { editing: { attach, focusCell } from cellEditing.js,
   * toCells: parsed table -> tableModel, setCell: tableModel.setCell, toMarkdown: tableModel -> markdown,
   * replaceInCodeBlock(block, range, markdown) without moving the caret }.
   */
  function createComposerPreview({
    doc, findTables, mapText, textLeafAt, renderTable, overlayPlacement, onEdit,
    MutationObserverImpl, ResizeObserverImpl = null, schedule,
    delay = (callback) => setTimeout(callback, REBUILD_PAUSE_MS),
    cellEditing = null,
  }) {
    const view = doc.defaultView;
    /** code block -> { element, toolbar, toggle, items: Array<{ element, start, end, cells }>, text, state, clippers } */
    const previews = new Map();
    /** data-mdtable-id -> stretched height in px */
    const heights = new Map();
    let layer = null;
    let heightsStyle = null;
    let nextId = 1;
    let mutationObserver = null;
    let resizeObserver = null;
    let refreshPending = false;
    let rebuildPending = false;
    let positionPending = false;
    /** Blocks whose preview changed size while a cell was typed in. */
    const measurePending = new Set();

    const composerOf = (block) => chatDom.editableAncestor(block);
    const elementOf = (node) => (node.nodeType === ELEMENT_NODE ? node : node.parentElement);

    function ensureLayer() {
      if (layer === null || !layer.isConnected) {
        layer = doc.createElement('div');
        layer.className = LAYER_CLASS;
        doc.body.appendChild(layer);
      }
      return layer;
    }

    // ---- code block height (our own stylesheet, never Chat's DOM) -----------------

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

    // ---- handing interaction back to the composer ------------------------------------

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

    /** End of the line before the code block, or the start of the block when nothing precedes it. */
    function placeCaretBefore(block) {
      const previous = block.previousSibling;
      let caret;
      if (previous !== null) {
        const lastText = previous.nodeType === TEXT_NODE ? previous : textNodes(previous).pop();
        caret = lastText === undefined ? collapsedRange(previous, previous.childNodes.length) : collapsedRange(lastText, lastText.length);
      } else {
        const [firstText] = textNodes(block);
        caret = collapsedRange(firstText ?? block, 0);
      }
      chatDom.setCaret(composerOf(block), caret);
    }

    /** Leaving the table by keyboard: above its first row or below its last. */
    function leave(block, where) {
      if (where === 'before') {
        placeCaretBefore(block);
      } else {
        placeCaretAfter(block);
      }
    }

    /** ⌘/Ctrl+Enter in a cell (edits already written): send from the composer, outside the code block where possible. */
    function submit(block) {
      const composer = composerOf(block);
      placeCaretAfter(block);
      chatDom.sendMessage(composer);
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
      chatDom.setCaret(composerOf(block), caret);
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

    /** Opens the editor on the table at the top of what is visible, located in the block's current text. */
    function editTableInView(block, entry) {
      const placement = placementOf(block, entry);
      const visibleTop = placement.visible ? placement.top + placement.toolbarTop : block.getBoundingClientRect().top;
      const item = entry.items.find((candidate) => candidate.element.getBoundingClientRect().bottom > visibleTop)
        ?? entry.items[entry.items.length - 1];
      // Fresh leaves: Chat may have replaced text nodes since the preview was built.
      const leaf = textLeafAt(mapText(block).leaves, item.start);
      if (leaf === undefined) {
        throw new Error(`[md-table] the table at offset ${item.start} is no longer in the code block; cannot open the editor`);
      }
      onEdit(composerOf(block), collapsedRange(leaf.node, item.start - leaf.start));
    }

    // ---- editing cells in place ------------------------------------------------------

    /** The range of [start, end) in the block, which must still hold the text the preview was built from. */
    function rangeOver(block, entry, start, end) {
      const { text, leaves } = mapText(block);
      if (text !== entry.text) {
        throw new Error('[md-table] the code block changed since the preview was built; not writing the edited cell'
          + ' (the preview rebuilds once Chat settles)');
      }
      const first = textLeafAt(leaves, start);
      const last = textLeafAt(leaves, end, { atEnd: true });
      if (first === undefined || last === undefined) {
        throw new Error(`[md-table] the table at ${start}-${end} is no longer in the code block; cannot write the edited cell`);
      }
      const range = doc.createRange();
      range.setStart(first.node, start - first.start);
      range.setEnd(last.node, end - last.start);
      return range;
    }

    /** Rewrites the item's table with one cell changed, and records the text the code block now holds. */
    function writeCell(block, entry, item, row, column, markdown) {
      // The message may have been sent (and the block removed) while the cell was focused.
      if (!block.isConnected || item.cells.cells[row][column] === markdown) {
        return;
      }
      const cells = cellEditing.setCell(item.cells, row, column, markdown);
      const table = cellEditing.toMarkdown(cells);
      cellEditing.replaceInCodeBlock(block, rangeOver(block, entry, item.start, item.end), table);
      // Only once written: a refused write must be retried, not mistaken for "unchanged".
      item.cells = cells;

      const delta = table.length - (item.end - item.start);
      entry.text = entry.text.slice(0, item.start) + table + entry.text.slice(item.end);
      entry.items.filter((other) => other.start > item.start).forEach((other) => {
        other.start += delta;
        other.end += delta;
      });
      item.end += delta;
    }

    /** { item, row, column } of the cell being edited in entry, or null. */
    function focusedCellOf(entry) {
      const active = doc.activeElement;
      if (active === null || !entry.element.contains(active) || !active.matches('th, td')) {
        return null;
      }
      const item = entry.items.findIndex((candidate) => candidate.element.contains(active));
      const rows = [...entry.items[item].element.querySelectorAll('tr')];
      return { item, row: rows.indexOf(active.parentElement), column: active.cellIndex };
    }

    /** After a rebuild (Chat changed the block), puts focus back in the same cell. */
    function restoreFocus(entry, focused) {
      const cell = entry.items[focused.item]?.element.querySelectorAll('tr')[focused.row]?.cells[focused.column];
      if (cell !== undefined) {
        cellEditing.editing.focusCell(cell);
      }
    }

    // ---- entering a table from the composer with ↑ / ↓ ---------------------------------

    /** Whether the text between the caret and the block (between) spans no line of its own. */
    function onAdjacentLine(between) {
      const holder = doc.createElement('div');
      holder.appendChild(between.cloneContents());
      return !mapText(holder).text.replace(/^\n+|\n+$/g, '').includes('\n');
    }

    /** Whether no other visual line (of a wrapped long line) lies between the caret and the block. Layout, read on a key press only. */
    function visuallyAdjacent(caret, block, down) {
      const caretBox = caret.getBoundingClientRect();
      if (caretBox.height === 0) {
        // Chrome gives no box for some caret positions (an empty line): trust the text check.
        return true;
      }
      const blockBox = block.getBoundingClientRect();
      const gap = down ? blockBox.top - caretBox.bottom : caretBox.top - blockBox.bottom;
      return gap < caretBox.height;
    }

    /** The previewed table the caret sits right above (down) or below (up), or null. */
    function tableNextTo(caret, down) {
      for (const [block, entry] of previews) {
        if (entry.state !== 'table' || block.contains(caret.startContainer)) {
          continue;
        }
        const position = block.compareDocumentPosition(caret.startContainer);
        const caretBefore = (position & POSITION_PRECEDING) !== 0;
        if (caretBefore !== down) {
          continue;
        }
        const between = doc.createRange();
        if (down) {
          between.setStart(caret.startContainer, caret.startOffset);
          between.setEndBefore(block);
        } else {
          between.setStartAfter(block);
          between.setEnd(caret.startContainer, caret.startOffset);
        }
        if (onAdjacentLine(between) && visuallyAdjacent(caret, block, down)) {
          return entry;
        }
      }
      return null;
    }

    function onComposerKeydown(event) {
      const down = event.key === 'ArrowDown';
      if ((!down && event.key !== 'ArrowUp') || event.shiftKey || event.altKey || event.metaKey || event.ctrlKey
        || event.isComposing || cellEditing === null || previews.size === 0) {
        return;
      }
      const composer = chatDom.editableAncestor(event.target);
      const selection = doc.getSelection();
      if (composer === null || selection === null || selection.rangeCount === 0 || !selection.isCollapsed) {
        return;
      }
      const caret = selection.getRangeAt(0);
      if (!composer.contains(caret.startContainer)) {
        return;
      }
      const entry = tableNextTo(caret, down);
      if (entry === null) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const item = down ? entry.items[0] : entry.items[entry.items.length - 1];
      const rows = item.element.querySelectorAll('tr');
      cellEditing.editing.focusCell((down ? rows[0] : rows[rows.length - 1]).cells[0]);
    }

    // ---- building ----------------------------------------------------------------------

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

    /** Ancestors that clip overflow (the scrolling composer and its frames); Chat's layout keeps them stable. */
    function clippingAncestorsOf(block) {
      const clippers = [];
      for (let element = block.parentElement; element !== null && element !== doc.body; element = element.parentElement) {
        const { overflow } = view.getComputedStyle(element);
        if (overflow !== '' && overflow !== 'visible') {
          clippers.push(element);
        }
      }
      return clippers;
    }

    /** Copies the look of the composer once: its font (not the code block's monospace) and the block's box. */
    function applyLook(block, element) {
      const blockStyle = view.getComputedStyle(block);
      const composerStyle = view.getComputedStyle(composerOf(block));
      element.style.font = composerStyle.font;
      element.style.color = composerStyle.color;
      element.style.padding = blockStyle.padding;
      element.style.setProperty('--mdtable-block-background', blockStyle.backgroundColor);
    }

    function build(block, tables, state) {
      const element = doc.createElement('div');
      element.className = PREVIEW_CLASS;
      const entry = { element, toolbar: null, toggle: null, items: [], text: null, state, clippers: clippingAncestorsOf(block) };

      tables.forEach((table) => {
        const item = doc.createElement('div');
        item.className = 'mdtable-composer-item';
        item.appendChild(renderTable(table, doc));
        element.appendChild(item);
        const record = { element: item, start: table.start, end: table.end, cells: null };
        entry.items.push(record);
        if (cellEditing !== null) {
          record.cells = cellEditing.toCells(table);
          cellEditing.editing.attach(item.querySelector('table'), {
            onChange: (row, column, markdown) => writeCell(block, entry, record, row, column, markdown),
            onInput: () => requestMeasure(block),
            onLeave: (where) => leave(block, where),
            onSubmit: () => submit(block),
          });
        }
      });

      entry.toolbar = doc.createElement('div');
      entry.toolbar.className = 'mdtable-composer-toolbar';
      entry.toolbar.appendChild(button('mdtable-composer-edit', LABEL_EDIT, () => editTableInView(block, entry)));
      entry.toggle = button('mdtable-toggle', LABEL_SHOW_SOURCE, () => {
        setState(block, entry, entry.state === 'table' ? 'source' : 'table');
      });
      entry.toolbar.appendChild(entry.toggle);
      element.appendChild(entry.toolbar);

      element.addEventListener('click', () => placeCaretAfter(block));
      element.addEventListener('wheel', (event) => forwardVerticalWheel(block, event), { passive: false });
      applyLook(block, element);
      ensureLayer().appendChild(element);
      return entry;
    }

    /** Natural height of the preview, written as the code block's min-height. Not on the scroll path. */
    function measure(block, entry) {
      const { style } = entry.element;
      style.width = `${block.getBoundingClientRect().width}px`;
      style.height = '';
      setHeight(block, entry.state === 'table' ? entry.element.offsetHeight : null);
    }

    function setState(block, entry, state) {
      entry.state = state;
      if (block.getAttribute(STATE_ATTRIBUTE) !== state) {
        block.setAttribute(STATE_ATTRIBUTE, state);
      }
      entry.element.setAttribute(PREVIEW_STATE_ATTRIBUTE, state);
      entry.toggle.textContent = state === 'table' ? LABEL_SHOW_SOURCE : LABEL_SHOW_TABLE;
      measure(block, entry);
      position();
    }

    function release(block) {
      const entry = previews.get(block);
      entry.element.remove();
      resizeObserver?.unobserve(block);
      setHeight(block, null);
      block.removeAttribute(STATE_ATTRIBUTE);
      previews.delete(block);
    }

    function update(block) {
      const { text } = mapText(block);
      const existing = previews.get(block);
      if (existing !== undefined && existing.text === text) {
        return;
      }
      const tables = findTables(text);
      const focused = existing === undefined || cellEditing === null ? null : focusedCellOf(existing);
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
      const entry = build(block, tables, existing === undefined ? 'table' : existing.state);
      entry.text = text;
      previews.set(block, entry);
      resizeObserver?.observe(block);
      setState(block, entry, entry.state);
      if (focused !== null) {
        restoreFocus(entry, focused);
      }
    }

    function refresh() {
      const blocks = new Set(doc.querySelectorAll(chatDom.COMPOSER_CODE_BLOCK));
      [...previews.keys()].filter((block) => !blocks.has(block)).forEach(release);
      blocks.forEach(update);
    }

    // ---- layout on the scroll path: read everything, then write ------------------------

    function placementOf(block, entry) {
      return overlayPlacement(block.getBoundingClientRect(), entry.clippers.map((clipper) => clipper.getBoundingClientRect()));
    }

    function position() {
      // Scroll / resize can fire after Chat removed a block (e.g. on send) but before
      // the MutationObserver callback refreshes, so drop blocks that left the composer.
      [...previews.keys()].filter((block) => !block.isConnected || composerOf(block) === null).forEach(release);
      const placements = [...previews].map(([block, entry]) => [entry, placementOf(block, entry)]);
      placements.forEach(([entry, placement]) => {
        const { style } = entry.element;
        if (!placement.visible) {
          style.visibility = 'hidden';
          return;
        }
        style.visibility = '';
        style.top = `${placement.top}px`;
        style.left = `${placement.left}px`;
        style.width = `${placement.width}px`;
        style.height = `${placement.height}px`;
        style.clipPath = placement.clipPath;
        entry.toolbar.style.top = `${placement.toolbarTop}px`;
      });
    }

    // ---- wiring ------------------------------------------------------------------------

    function requestPosition() {
      if (positionPending) {
        return;
      }
      positionPending = true;
      schedule(() => {
        positionPending = false;
        position();
      });
    }

    /** Typing in a cell can change the table's size: measure once per frame, then reposition. */
    function requestMeasure(block) {
      const alreadyScheduled = measurePending.size > 0;
      measurePending.add(block);
      if (alreadyScheduled) {
        return;
      }
      schedule(() => {
        measurePending.forEach((pending) => {
          const entry = previews.get(pending);
          if (entry !== undefined) {
            measure(pending, entry);
          }
        });
        measurePending.clear();
        position();
      });
    }

    function requestRefresh() {
      if (refreshPending) {
        return;
      }
      refreshPending = true;
      schedule(() => {
        refreshPending = false;
        refresh();
      });
    }

    function requestRebuild() {
      if (rebuildPending) {
        return;
      }
      rebuildPending = true;
      delay(() => {
        rebuildPending = false;
        refresh();
      });
    }

    const isOwnMutation = (record) => elementOf(record.target)?.closest(`.${LAYER_CLASS}`) != null;
    const insideComposer = (record) => elementOf(record.target)?.closest(chatDom.COMPOSER) != null;
    const insidePreviewedBlock = (record) => [...previews.keys()].some((block) => block.contains(record.target));
    const addsComposerCodeBlock = (record) => [...record.addedNodes].some((node) => node.nodeType === ELEMENT_NODE
      && (node.matches(chatDom.COMPOSER_CODE_BLOCK) || node.querySelector(chatDom.COMPOSER_CODE_BLOCK) !== null));

    function onMutations(records) {
      const chatRecords = records.filter((record) => !isOwnMutation(record));
      const composerRecords = chatRecords.filter((record) => insideComposer(record) || addsComposerCodeBlock(record));
      if (composerRecords.length > 0 && composerRecords.every(insidePreviewedBlock)) {
        // Typing inside a previewed table: rebuild once the user pauses.
        requestRebuild();
      } else if (composerRecords.length > 0) {
        requestRefresh();
      }
      // Anything else can only move the composer (e.g. a typing indicator above it).
      if (chatRecords.length > 0 && previews.size > 0) {
        requestPosition();
      }
    }

    function onResize(entries) {
      entries.forEach(({ target }) => {
        const entry = previews.get(target);
        if (entry !== undefined) {
          measure(target, entry);
        }
      });
      requestPosition();
    }

    return {
      refresh,
      start() {
        mutationObserver = new MutationObserverImpl(onMutations);
        // contenteditable: Chat restores a draft before making the composer editable (verified 2026-11-16).
        mutationObserver.observe(doc.body, {
          childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['contenteditable'],
        });
        // Width changes re-flow the table, so its natural height must be measured again.
        resizeObserver = ResizeObserverImpl === null ? null : new ResizeObserverImpl(onResize);
        // Capture catches scrolling inside the composer too; scroll events do not bubble.
        view.addEventListener('scroll', requestPosition, true);
        view.addEventListener('resize', requestPosition);
        // Capture on window: it runs before Chat's own key handlers, which may stop the event.
        view.addEventListener('keydown', onComposerKeydown, true);
        refresh();
      },
      stop() {
        mutationObserver.disconnect();
        resizeObserver?.disconnect();
        view.removeEventListener('scroll', requestPosition, true);
        view.removeEventListener('resize', requestPosition);
        view.removeEventListener('keydown', onComposerKeydown, true);
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
