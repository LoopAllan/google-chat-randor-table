'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { createComposerPreview } = require('../src/composerPreview.js');
const { findTables } = require('../src/tableParser.js');
const { mapText, textLeafAt } = require('../src/textExtractor.js');
const { overlayPlacement } = require('../src/overlayGeometry.js');
const { renderTable } = require('../src/tableRenderer.js');
const { renderInline } = require('../src/inlineMarkdown.js');
const { applyShortcut } = require('../src/markdownShortcuts.js');
const { createCellEditing } = require('../src/cellEditing.js');
const { createHtmlTableReader } = require('../src/htmlTable.js');
const { createCodeBlockWriter } = require('../src/codeBlockWriter.js');
const { toMarkdownTable } = require('../src/markdownTableWriter.js');
const tableModel = require('../src/tableModel.js');

// Composer shape from real Chat (2026-11-16): <article role="code"> holding one <div> per line.
const TABLE_LINES = '<div>| 欄位 | 數量 |</div><div>| :-- | --: |</div><div>| api-a | 12 |</div>';

/** The cell editing wiring contentScript.js uses, with reports flushed by focusout only. */
function cellEditingFor(document) {
  const writer = createCodeBlockWriter({ doc: document });
  return {
    editing: createCellEditing({
      doc: document, applyShortcut, renderInline, readCell: createHtmlTableReader({ parseHtml: () => null }).readCell, delay: () => {},
    }),
    toCells: tableModel.fromParsed,
    setCell: tableModel.setCell,
    toMarkdown: (table) => toMarkdownTable(table.cells, { align: table.align }),
    replaceInCodeBlock: (block, range, markdown) => writer.replaceLines(block, range, markdown, { moveCaret: false }),
  };
}

function setup(composerHtml, { delay = (callback) => callback(), editable = false } = {}) {
  const { window } = new JSDOM(`<!doctype html><body><div id="composer" role="textbox" contenteditable="true">${composerHtml}</div></body>`);
  const { document } = window;
  const edits = [];
  const preview = createComposerPreview({
    cellEditing: editable ? cellEditingFor(document) : null,
    doc: document,
    findTables,
    mapText,
    textLeafAt,
    renderTable,
    overlayPlacement,
    onEdit: (composer, position) => edits.push({ composer, position }),
    MutationObserverImpl: window.MutationObserver,
    schedule: (callback) => callback(),
    delay,
  });
  const composer = document.getElementById('composer');
  const previews = () => [...document.querySelectorAll('.mdtable-composer-preview')];
  return { window, document, composer, preview, edits, previews };
}

const click = (window, element) => element.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

test('shows a code block holding a table as a rendered table, outside the editable area', () => {
  const { composer, preview, previews } = setup(`<article role="code">${TABLE_LINES}</article>`);

  preview.refresh();

  assert.equal(previews().length, 1);
  assert.equal(composer.contains(previews()[0]), false, 'the preview must never become message content');
  assert.deepEqual([...previews()[0].querySelectorAll('th')].map((cell) => cell.textContent), ['欄位', '數量']);
  assert.equal(composer.querySelector('article').getAttribute('data-mdtable-preview'), 'table');
});

test('leaves code blocks without a table, and tables outside a code block, alone', () => {
  const { composer, preview, previews } = setup('<article role="code"><div>const a = 1;</div></article>'
    + '<div>| a |</div><div>| - |</div>');

  preview.refresh();

  assert.equal(previews().length, 0);
  assert.equal(composer.querySelector('article').hasAttribute('data-mdtable-preview'), false);
});

test('the edit button opens the editor on that table', () => {
  const { window, composer, preview, edits, previews } = setup(`<article role="code">${TABLE_LINES}</article>`);
  preview.refresh();

  click(window, previews()[0].querySelector('.mdtable-composer-edit'));

  assert.equal(edits.length, 1);
  assert.equal(edits[0].composer, composer);
  assert.equal(edits[0].position.startContainer, composer.querySelector('article div').firstChild);
  assert.equal(edits[0].position.startOffset, 0);
});

test('with several tables, edit opens the one at the top of the visible area', () => {
  const { window, composer, preview, edits, previews } = setup(
    `<article role="code">${TABLE_LINES}<div>note</div><div>| x |</div><div>| - |</div></article>`,
  );
  preview.refresh();
  const items = previews()[0].querySelectorAll('.mdtable-composer-item');
  // The first table has been scrolled above the visible area.
  items[0].getBoundingClientRect = () => ({ top: -80, bottom: -10, left: 0, right: 100, width: 100, height: 70 });
  items[1].getBoundingClientRect = () => ({ top: -5, bottom: 50, left: 0, right: 100, width: 100, height: 55 });

  click(window, previews()[0].querySelector('.mdtable-composer-edit'));

  assert.equal(items.length, 2);
  assert.equal(edits[0].position.startContainer.data, '| x |');
});

test('there is a single toolbar, so the buttons can stay in view however long the table is', () => {
  const { preview, previews } = setup(`<article role="code">${TABLE_LINES}</article>`);

  preview.refresh();

  const toolbar = previews()[0].querySelector('.mdtable-composer-toolbar');
  assert.deepEqual([...toolbar.querySelectorAll('button')].map((b) => b.textContent), ['編輯表格', '顯示原文']);
});

test('clicking the table puts the caret on the line after the code block, so typing keeps working', () => {
  const { window, document, composer, preview, previews } = setup(`<article role="code">${TABLE_LINES}</article><div>after</div>`);
  preview.refresh();

  click(window, previews()[0].querySelector('td'));

  const caret = document.getSelection().getRangeAt(0);
  assert.equal(document.activeElement, composer);
  assert.equal(caret.collapsed, true);
  assert.equal(caret.startContainer, composer.lastChild.firstChild);
  assert.equal(caret.startOffset, 0);
});

test('clicking the table with nothing after the code block puts the caret at its end', () => {
  const { window, document, composer, preview, previews } = setup(`<article role="code">${TABLE_LINES}</article>`);
  preview.refresh();

  click(window, previews()[0].querySelector('td'));

  const caret = document.getSelection().getRangeAt(0);
  const lastLine = composer.querySelector('article').lastChild.firstChild;
  assert.equal(caret.startContainer, lastLine);
  assert.equal(caret.startOffset, lastLine.length);
});

test('vertical wheel over the table scrolls the composer instead of being swallowed', () => {
  const { window, document, preview, previews } = setup(`<article role="code">${TABLE_LINES}</article>`);
  const scroller = document.createElement('div');
  scroller.style.overflowY = 'auto';
  document.body.insertBefore(scroller, document.getElementById('composer'));
  scroller.appendChild(document.getElementById('composer'));
  const scrolled = [];
  scroller.scrollBy = (options) => scrolled.push(options.top);
  preview.refresh();

  const event = new window.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 40 });
  previews()[0].querySelector('td').dispatchEvent(event);
  const sideways = new window.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaX: 40 });
  previews()[0].querySelector('td').dispatchEvent(sideways);

  assert.deepEqual(scrolled, [40]);
  assert.equal(event.defaultPrevented, true);
  assert.equal(sideways.defaultPrevented, false, 'horizontal wheel still scrolls the table itself');
});

test('the source toggle reveals the markdown and can switch back', () => {
  const { window, composer, preview, previews } = setup(`<article role="code">${TABLE_LINES}</article>`);
  preview.refresh();
  const block = composer.querySelector('article');
  const toggle = previews()[0].querySelector('.mdtable-toggle');

  click(window, toggle);
  assert.equal(block.getAttribute('data-mdtable-preview'), 'source');
  assert.equal(toggle.textContent, '顯示表格');

  click(window, toggle);
  assert.equal(block.getAttribute('data-mdtable-preview'), 'table');
  assert.equal(toggle.textContent, '顯示原文');
});

test('follows edits: re-renders when the table text changes and cleans up when it is gone', async () => {
  const { composer, preview, previews } = setup(`<article role="code">${TABLE_LINES}</article>`);
  preview.start();
  const block = composer.querySelector('article');

  block.lastChild.textContent = '| api-b | 340 |';
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(previews()[0].querySelector('td').textContent, 'api-b');

  block.remove();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(previews().length, 0);
  preview.stop();
});

test('keeps the source view chosen by the user while the table is being edited', () => {
  const { window, composer, preview, previews } = setup(`<article role="code">${TABLE_LINES}</article>`);
  preview.refresh();
  click(window, previews()[0].querySelector('.mdtable-toggle'));

  composer.querySelector('article').lastChild.textContent = '| api-b | 340 |';
  preview.refresh();

  assert.equal(composer.querySelector('article').getAttribute('data-mdtable-preview'), 'source');
});

test('the preview element does not carry the code block state attribute (which hides text)', () => {
  const { preview, previews } = setup(`<article role="code">${TABLE_LINES}</article>`);

  preview.refresh();

  assert.equal(previews()[0].hasAttribute('data-mdtable-preview'), false);
  assert.equal(previews()[0].getAttribute('data-mdtable-state'), 'table');
});

test('never writes inline styles on Chat\'s code block: the height goes into our own stylesheet', () => {
  const { document, composer, preview } = setup(`<article role="code">${TABLE_LINES}</article>`);

  preview.refresh();

  const block = composer.querySelector('article');
  const id = block.getAttribute('data-mdtable-id');
  assert.equal(block.hasAttribute('style'), false);
  assert.match(document.querySelector('style[data-mdtable-preview-heights]').textContent, new RegExp(`\\[data-mdtable-id="${id}"\\]`));
});

test('scrolling does not touch the code block at all (Chat reacts to its DOM changing)', async () => {
  const { window, composer, preview } = setup(`<article role="code">${TABLE_LINES}</article>`);
  preview.start();
  const records = [];
  const watcher = new window.MutationObserver((list) => records.push(...list));
  watcher.observe(composer, { attributes: true, subtree: true, childList: true, characterData: true });

  window.dispatchEvent(new window.Event('scroll'));
  window.dispatchEvent(new window.Event('resize'));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(records.map((record) => `${record.type}:${record.attributeName}`), []);
  watcher.disconnect();
  preview.stop();
});

test('a scroll right after Chat removes the code block (e.g. on send) drops the preview instead of throwing', () => {
  const { window, composer, preview, previews } = setup(`<article role="code">${TABLE_LINES}</article>`);
  preview.start();

  // Synchronously, before the MutationObserver callback runs.
  composer.querySelector('article').remove();
  window.dispatchEvent(new window.Event('scroll'));

  assert.equal(previews().length, 0);
  preview.stop();
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test('a <pre> code block in the composer is previewed like an article one', () => {
  const { preview, previews } = setup('<pre>| a |\n| - |\n| 1 |</pre>');

  preview.refresh();

  assert.equal(previews().length, 1);
});

test('mutations outside every composer do not search the document again', async () => {
  const { document, preview } = setup(`<article role="code">${TABLE_LINES}</article>`);
  preview.start();
  let searches = 0;
  const original = document.querySelectorAll.bind(document);
  document.querySelectorAll = (selector) => {
    searches += 1;
    return original(selector);
  };

  document.body.appendChild(document.createElement('div')).textContent = 'someone is typing…';
  await tick();

  assert.equal(searches, 0);
  preview.stop();
});

test('a composer added later with a table in it (room switch restoring a draft) gets a preview', async () => {
  const { document, preview, previews } = setup('');
  preview.start();

  const other = document.createElement('div');
  other.innerHTML = `<div role="textbox" contenteditable="true"><article role="code">${TABLE_LINES}</article></div>`;
  document.body.appendChild(other);
  await tick();

  assert.equal(previews().length, 1);
  preview.stop();
});

test('typing inside a previewed table rebuilds it only after a pause', async () => {
  const delayed = [];
  const { composer, preview, previews } = setup(`<article role="code">${TABLE_LINES}</article>`, { delay: (callback) => delayed.push(callback) });
  preview.start();

  composer.querySelector('article').lastChild.textContent = '| api-b | 340 |';
  await tick();
  assert.equal(previews()[0].querySelector('td').textContent, 'api-a', 'not rebuilt on every keystroke');

  delayed.forEach((callback) => callback());
  assert.equal(previews()[0].querySelector('td').textContent, 'api-b');
  preview.stop();
});

test('the edit button points at the current text nodes even if Chat replaced them with the same text', () => {
  const { window, composer, preview, edits, previews } = setup(`<article role="code">${TABLE_LINES}</article>`);
  preview.refresh();
  const firstLine = composer.querySelector('article div');
  firstLine.replaceChild(firstLine.ownerDocument.createTextNode(firstLine.textContent), firstLine.firstChild);

  click(window, previews()[0].querySelector('.mdtable-composer-edit'));

  assert.equal(edits[0].position.startContainer, firstLine.firstChild);
  assert.equal(edits[0].position.startContainer.isConnected, true);
});

test('scrolling moves the overlay to the code block using the overlay geometry', () => {
  const { window, composer, preview, previews } = setup(`<article role="code">${TABLE_LINES}</article>`);
  preview.start();
  const block = composer.querySelector('article');
  block.getBoundingClientRect = () => ({ top: 120, left: 40, bottom: 320, right: 540, width: 500, height: 200 });

  window.dispatchEvent(new window.Event('scroll'));

  const { style } = previews()[0];
  assert.deepEqual([style.top, style.left, style.width, style.height], ['120px', '40px', '500px', '200px']);
  preview.stop();
});

test('scrolling reads no computed styles (they are cached when the preview is built)', () => {
  const { window, preview } = setup(`<article role="code">${TABLE_LINES}</article>`);
  preview.start();
  let reads = 0;
  const original = window.getComputedStyle.bind(window);
  window.getComputedStyle = (element) => {
    reads += 1;
    return original(element);
  };

  window.dispatchEvent(new window.Event('scroll'));

  assert.equal(reads, 0);
  preview.stop();
});

test('when the code block changes width, the table height is measured again (re-flowed table)', () => {
  const { window, document, composer, previews } = setup('');
  composer.innerHTML = `<article role="code">${TABLE_LINES}</article>`;
  let notify = null;
  const observed = [];
  class FakeResizeObserver {
    constructor(callback) { notify = callback; }
    observe(target) { observed.push(target); }
    unobserve() {}
    disconnect() { observed.length = 0; }
  }
  const preview = createComposerPreview({
    doc: document, findTables, mapText, textLeafAt, renderTable, overlayPlacement,
    onEdit: () => {}, MutationObserverImpl: window.MutationObserver, ResizeObserverImpl: FakeResizeObserver,
    schedule: (callback) => callback(), delay: (callback) => callback(),
  });
  preview.start();
  const block = composer.querySelector('article');
  assert.deepEqual(observed, [block]);

  Object.defineProperty(previews()[0], 'offsetHeight', { value: 321 });
  notify([{ target: block }]);

  assert.match(document.querySelector('style[data-mdtable-preview-heights]').textContent, /min-height:321px/);
  preview.stop();
  assert.deepEqual(observed, [], 'stop disconnects the resize observer');
});

test('a draft restored into a not-yet-editable composer is previewed once Chat makes it editable', async () => {
  const { document, preview, previews } = setup('');
  preview.start();
  const restored = document.createElement('div');
  restored.setAttribute('role', 'textbox');
  restored.setAttribute('contenteditable', 'false');
  restored.innerHTML = `<article role="code">${TABLE_LINES}</article>`;
  document.body.appendChild(restored);
  await tick();
  assert.equal(previews().length, 0);

  restored.setAttribute('contenteditable', 'true');
  await tick();

  assert.equal(previews().length, 1);
  preview.stop();
});

// ---- editing cells in place ------------------------------------------------------------

const linesOf = (block) => [...block.children].map((line) => line.textContent);

/** Types text at the end of a preview cell and leaves it (jsdom has no editing engine). */
function editCell(window, document, cell, text) {
  cell.focus();
  const node = cell.appendChild(document.createTextNode(text));
  document.getSelection().collapse(node, node.length);
  cell.dispatchEvent(new window.InputEvent('input', { bubbles: true }));
  cell.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true }));
}

test('an edited cell is written back into the code block as markdown; focus and the preview stay', async () => {
  const { window, document, composer, preview, previews } = setup(`<article role="code">${TABLE_LINES}</article>`, { editable: true });
  preview.start();
  const element = previews()[0];
  const cell = element.querySelectorAll('td')[0];

  editCell(window, document, cell, ' **新**');
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(linesOf(composer.querySelector('article')), ['| 欄位 | 數量 |', '| :-- | --: |', '| api-a **新** | 12 |']);
  assert.equal(document.activeElement, cell, 'typing continues in the cell');
  assert.equal(previews()[0], element, 'our own write does not rebuild the table being edited');
  assert.equal(cell.querySelector('strong').textContent, '新');
});

test('an unchanged cell writes nothing', () => {
  const { window, document, composer, preview, previews } = setup(`<article role="code">${TABLE_LINES}</article>`, { editable: true });
  preview.refresh();
  const before = composer.innerHTML;
  const cell = previews()[0].querySelector('th');

  cell.dispatchEvent(new window.InputEvent('input', { bubbles: true }));
  cell.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true }));

  assert.equal(composer.innerHTML, before);
});

test('editing the first table keeps the second table\'s position right', () => {
  const { window, document, composer, preview, previews } = setup(
    `<article role="code">${TABLE_LINES}<div>note</div><div>| x |</div><div>| - |</div><div>| 1 |</div></article>`, { editable: true },
  );
  preview.refresh();

  editCell(window, document, previews()[0].querySelectorAll('td')[0], '-longer');
  editCell(window, document, previews()[0].querySelectorAll('.mdtable-composer-item')[1].querySelector('td'), '2');

  assert.deepEqual(linesOf(composer.querySelector('article')), [
    '| 欄位 | 數量 |', '| :-- | --: |', '| api-a-longer | 12 |', 'note', '| x |', '| --- |', '| 12 |',
  ]);
});

test('a click in a cell edits it instead of moving the caret to the composer', () => {
  const { window, document, composer, preview, previews } = setup(`<article role="code">${TABLE_LINES}</article><div>after</div>`, { editable: true });
  preview.refresh();

  click(window, previews()[0].querySelector('td'));

  assert.notEqual(document.activeElement, composer);
  assert.equal(previews()[0].querySelector('td').getAttribute('contenteditable'), 'plaintext-only');
});

test('Escape in a cell hands the caret back to the composer after the code block', () => {
  const { window, document, composer, preview, previews } = setup(`<article role="code">${TABLE_LINES}</article><div>after</div>`, { editable: true });
  preview.refresh();
  const cell = previews()[0].querySelector('td');
  cell.focus();

  cell.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

  assert.equal(document.activeElement, composer);
  assert.equal(document.getSelection().getRangeAt(0).startContainer, composer.lastChild.firstChild);
});

test('when Chat changes the block itself, the rebuilt preview keeps focus in the same cell', () => {
  const { document, composer, preview, previews } = setup(`<article role="code">${TABLE_LINES}</article>`, { editable: true });
  preview.refresh();
  previews()[0].querySelectorAll('td')[1].focus();

  composer.querySelector('article').lastChild.textContent = '| api-b | 99 |';
  preview.refresh();

  const cell = previews()[0].querySelectorAll('td')[1];
  assert.equal(cell.textContent, '99');
  assert.equal(document.activeElement, cell);
});

test('refuses to write a cell when Chat changed the block since the preview was built (offsets would be stale)', () => {
  const { window, document, composer, preview, previews } = setup(`<article role="code"><div>intro</div>${TABLE_LINES}</article>`,
    { editable: true, delay: () => {} });
  preview.start();
  const cell = previews()[0].querySelector('td');
  composer.querySelector('article').firstChild.textContent = 'a much longer intro';
  const errors = [];
  window.addEventListener('error', (event) => { errors.push(event.error.message); event.preventDefault(); });
  const before = linesOf(composer.querySelector('article'));

  cell.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true }));
  cell.appendChild(document.createTextNode('!'));
  cell.dispatchEvent(new window.InputEvent('input', { bubbles: true }));
  cell.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true }));

  assert.deepEqual(linesOf(composer.querySelector('article')), before);
  assert.match(errors.join('\n'), /changed since the preview was built/);
});

const keydown = (window, target, init) => target.dispatchEvent(new window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));

test('ArrowUp on the header row puts the caret at the end of the line before the code block', () => {
  const { window, document, composer, preview, previews } = setup(`<div>before</div><article role="code">${TABLE_LINES}</article>`, { editable: true });
  preview.refresh();

  keydown(window, previews()[0].querySelector('th'), { key: 'ArrowUp' });

  const caret = document.getSelection().getRangeAt(0);
  assert.equal(document.activeElement, composer);
  assert.equal(caret.startContainer, composer.firstChild.firstChild);
  assert.equal(caret.startOffset, 'before'.length);
});

test('ArrowUp with nothing before the code block puts the caret at its start', () => {
  const { window, document, composer, preview, previews } = setup(`<article role="code">${TABLE_LINES}</article>`, { editable: true });
  preview.refresh();

  keydown(window, previews()[0].querySelector('th'), { key: 'ArrowUp' });

  const caret = document.getSelection().getRangeAt(0);
  assert.equal(caret.startContainer, composer.querySelector('article div').firstChild);
  assert.equal(caret.startOffset, 0);
});

test('ArrowDown on the last row puts the caret on the line after the code block', () => {
  const { window, document, composer, preview, previews } = setup(`<article role="code">${TABLE_LINES}</article><div>after</div>`, { editable: true });
  preview.refresh();

  keydown(window, previews()[0].querySelector('td'), { key: 'ArrowDown' });

  assert.equal(document.getSelection().getRangeAt(0).startContainer, composer.lastChild.firstChild);
});

test('Cmd/Ctrl+Enter writes the edited cell, then sends from the composer', () => {
  const { window, document, composer, preview, previews } = setup(`<article role="code">${TABLE_LINES}</article><div>after</div>`, { editable: true });
  preview.refresh();
  const sent = [];
  composer.addEventListener('keydown', (event) => sent.push({ key: event.key, text: composer.querySelector('article').lastChild.textContent }));
  const cell = previews()[0].querySelector('td');
  cell.focus();
  const node = cell.appendChild(document.createTextNode('!'));
  document.getSelection().collapse(node, 1);
  cell.dispatchEvent(new window.InputEvent('input', { bubbles: true }));

  keydown(window, cell, { key: 'Enter', ctrlKey: true });

  assert.deepEqual(sent, [{ key: 'Enter', text: '| api-a! | 12 |' }], 'the composer holds the edit when the message is sent');
  assert.equal(document.activeElement, composer);
});

// ---- entering the table from the composer with ↑ / ↓ -----------------------------------

/** A preview started on composerHtml, with the caret put in the text node found by caretText. */
function caretSetup(composerHtml, caretText, offset, { caretRect = null, blockRect = null } = {}) {
  const context = setup(composerHtml, { editable: true });
  const { window, document, composer, preview } = context;
  // jsdom has no layout; Chrome gives the caret's line box.
  window.Range.prototype.getBoundingClientRect = () => caretRect ?? { top: 0, bottom: 0, height: 0 };
  if (blockRect !== null) {
    composer.querySelector('article').getBoundingClientRect = () => blockRect;
  }
  preview.start();
  const walker = document.createTreeWalker(composer, 4);
  while (walker.nextNode() && walker.currentNode.data !== caretText);
  composer.focus();
  document.getSelection().collapse(walker.currentNode, offset);
  return context;
}

const arrow = (window, composer, key, init = {}) => {
  const event = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  composer.dispatchEvent(event);
  return event;
};

test('ArrowDown on the line right above the table enters its first header cell', () => {
  const { window, document, composer, previews } = caretSetup(`<div>before</div><article role="code">${TABLE_LINES}</article>`, 'before', 2);

  const event = arrow(window, composer, 'ArrowDown');

  assert.equal(event.defaultPrevented, true);
  assert.equal(document.activeElement, previews()[0].querySelector('th'));
});

test('ArrowDown also enters when lines are text and <br> directly in the composer', () => {
  const { window, document, composer, previews } = caretSetup(`before<br><article role="code">${TABLE_LINES}</article>`, 'before', 6);

  arrow(window, composer, 'ArrowDown');

  assert.equal(document.activeElement, previews()[0].querySelector('th'));
});

test('ArrowUp on the line right below the table enters the first cell of its last row', () => {
  const { window, document, composer, previews } = caretSetup(`<article role="code">${TABLE_LINES}</article><div>after</div>`, 'after', 3);

  arrow(window, composer, 'ArrowUp');

  const cells = previews()[0].querySelectorAll('tr');
  assert.equal(document.activeElement, cells[cells.length - 1].cells[0]);
});

test('arrows further away from the table, or pointing away from it, are left to Chat', () => {
  const html = `<div>l1</div><div>l2</div><article role="code">${TABLE_LINES}</article><div>after</div>`;
  const { window, document, composer } = caretSetup(html, 'l1', 1);

  assert.equal(arrow(window, composer, 'ArrowDown').defaultPrevented, false, 'a line in between');
  document.getSelection().collapse(composer.lastChild.firstChild, 1);
  assert.equal(arrow(window, composer, 'ArrowDown').defaultPrevented, false, 'below the table, going down');
  assert.equal(arrow(window, composer, 'ArrowDown', { shiftKey: true }).defaultPrevented, false, 'extending a selection');
  assert.equal(document.activeElement, composer);
});

test('on a long wrapped line, only its visual line next to the table enters', () => {
  const { window, document, composer } = caretSetup(`<div>long line</div><article role="code">${TABLE_LINES}</article>`, 'long line', 1, {
    caretRect: { top: 100, bottom: 120, height: 20 },
    blockRect: { top: 160, bottom: 300, height: 140 },
  });

  assert.equal(arrow(window, composer, 'ArrowDown').defaultPrevented, false, 'another visual line lies between');
  assert.equal(document.activeElement, composer);
});

test('in the source view the arrows move through the markdown as usual', () => {
  const { window, composer, previews } = caretSetup(`<div>before</div><article role="code">${TABLE_LINES}</article>`, 'before', 2);
  click(window, previews()[0].querySelector('.mdtable-toggle'));

  assert.equal(arrow(window, composer, 'ArrowDown').defaultPrevented, false);
});
