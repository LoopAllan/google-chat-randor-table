'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { createTableEditor } = require('../src/tableEditor.js');
const { createClipboardReader } = require('../src/clipboardTable.js');
const { createHtmlTableReader } = require('../src/htmlTable.js');
const { findTables } = require('../src/tableParser.js');
const tableModel = require('../src/tableModel.js');

const { readHtmlTable } = createHtmlTableReader({ parseHtml: (html) => new JSDOM(html).window.document });
const clipboardReader = createClipboardReader({ readHtmlTable, findTables, fromParsed: tableModel.fromParsed });

function setup() {
  const { window } = new JSDOM('<!doctype html><body></body>');
  const { document } = window;
  const results = [];
  const editor = createTableEditor({ doc: document, tableModel, readGrid: (clipboard) => clipboardReader.gridFromClipboard(clipboard) });
  const open = (initial = tableModel.createTable(2, 2), options) => editor.open(initial, options).then(
    (value) => results.push(value),
  );
  const shadow = () => document.querySelector('.mdtable-editor-host')?.shadowRoot ?? null;
  const inputs = () => [...shadow().querySelectorAll('input.cell')];
  const button = (action, index) => shadow().querySelector(`[data-action="${action}"]${index === undefined ? '' : `[data-index="${index}"]`}`);
  const key = (target, init) => target.dispatchEvent(new window.KeyboardEvent('keydown', { bubbles: true, composed: true, ...init }));
  const type = (input, value) => {
    input.value = value;
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  };
  const paste = (target, text, html = '') => {
    const event = new window.Event('paste', { bubbles: true, cancelable: true, composed: true });
    const data = { 'text/plain': text, 'text/html': html };
    Object.defineProperty(event, 'clipboardData', { value: { getData: (kind) => data[kind] ?? '' } });
    target.dispatchEvent(event);
    return event;
  };
  return { document, open, results, shadow, inputs, button, key, type, paste };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test('opens an overlay with one input per cell, header first', () => {
  const { open, inputs, shadow } = setup();

  open(tableModel.fromParsed({ header: ['a', 'b'], rows: [['1', '2']], align: [null, null] }));

  assert.deepEqual(inputs().map((input) => input.value), ['a', 'b', '1', '2']);
  assert.equal(shadow().activeElement, inputs()[0]);
});

test('submit resolves with the edited table and closes the editor', async () => {
  const { open, inputs, button, type, results, document } = setup();
  open();

  type(inputs()[0], 'name');
  button('submit').click();
  await tick();

  assert.equal(results[0].cells[0][0], 'name');
  assert.equal(document.querySelector('.mdtable-editor-host'), null);
});

test('cancel resolves with null', async () => {
  const { open, button, results } = setup();
  open();

  button('cancel').click();
  await tick();

  assert.deepEqual(results, [null]);
});

test('Escape cancels and Ctrl/Cmd+Enter submits', async () => {
  const first = setup();
  first.open();
  first.key(first.inputs()[0], { key: 'Escape' });
  await tick();
  assert.deepEqual(first.results, [null]);

  const second = setup();
  second.open();
  second.key(second.inputs()[0], { key: 'Enter', metaKey: true });
  await tick();
  assert.equal(second.results.length, 1);
  assert.notEqual(second.results[0], null);
});

test('adds a row and a column, keeping typed values', async () => {
  const { open, inputs, button, type, results } = setup();
  open();

  type(inputs()[0], 'kept');
  button('add-row').click();
  button('add-column').click();
  button('submit').click();
  await tick();

  assert.equal(results[0].cells.length, 3);
  assert.equal(results[0].cells[0].length, 3);
  assert.equal(results[0].cells[0][0], 'kept');
});

test('removes a body row and a column', async () => {
  const { open, button, results } = setup();
  open(tableModel.fromParsed({ header: ['a', 'b'], rows: [['1', '2'], ['3', '4']], align: [null, null] }));

  button('remove-row', 1).click();
  button('remove-column', 0).click();
  button('submit').click();
  await tick();

  assert.deepEqual(results[0].cells, [['b'], ['4']]);
});

test('alignment button shows 靠左 for an unset column (no separate 預設) and cycles from there', () => {
  const { open, button } = setup();
  open();

  assert.equal(button('align', 1).textContent, '靠左');
  button('align', 1).click();
  assert.equal(button('align', 1).textContent, '置中');
});

test('keystrokes inside the editor do not reach the page', () => {
  const { open, inputs, key, document } = setup();
  let leaked = 0;
  document.body.addEventListener('keydown', () => { leaked += 1; });
  open();

  key(inputs()[0], { key: 'a' });

  assert.equal(leaked, 0);
});

function focusedCell(shadow) {
  const active = shadow.activeElement;
  return active === null ? null : [Number(active.dataset.row), Number(active.dataset.column)];
}

function caretAt(input, position) {
  input.focus();
  input.setSelectionRange(position, position);
}

test('ArrowDown / ArrowUp move between rows in the same column', () => {
  const { open, inputs, key, shadow } = setup();
  open(tableModel.createTable(3, 2));

  caretAt(inputs()[1], 0);
  key(inputs()[1], { key: 'ArrowDown' });
  assert.deepEqual(focusedCell(shadow()), [1, 1]);

  key(shadow().activeElement, { key: 'ArrowUp' });
  assert.deepEqual(focusedCell(shadow()), [0, 1]);
});

test('ArrowLeft / ArrowRight move cells only from the edge of the text', () => {
  const { open, inputs, key, type, shadow } = setup();
  open(tableModel.createTable(2, 2));
  const first = inputs()[0];
  type(first, 'abc');

  caretAt(first, 1);
  key(first, { key: 'ArrowRight' });
  assert.deepEqual(focusedCell(shadow()), [0, 0], 'caret in the middle keeps editing the text');

  caretAt(first, 3);
  key(first, { key: 'ArrowRight' });
  assert.deepEqual(focusedCell(shadow()), [0, 1]);

  key(shadow().activeElement, { key: 'ArrowLeft' });
  assert.deepEqual(focusedCell(shadow()), [0, 0]);
  assert.equal(first.selectionStart, 3, 'moving left lands at the end of the text');
});

test('arrows stop at the table edges', () => {
  const { open, inputs, key, shadow } = setup();
  open(tableModel.createTable(2, 2));

  caretAt(inputs()[0], 0);
  key(inputs()[0], { key: 'ArrowUp' });
  key(shadow().activeElement, { key: 'ArrowLeft' });

  assert.deepEqual(focusedCell(shadow()), [0, 0]);
});

test('arrows used to pick IME candidates do not move cells', () => {
  const { open, inputs, key, shadow } = setup();
  open(tableModel.createTable(2, 2));

  caretAt(inputs()[0], 0);
  key(inputs()[0], { key: 'ArrowDown', isComposing: true });

  assert.deepEqual(focusedCell(shadow()), [0, 0]);
});

test('pasting spreadsheet cells fills from the focused cell and grows the table', async () => {
  const { open, inputs, paste, button, results } = setup();
  open(tableModel.createTable(2, 2));

  const event = paste(inputs()[3], 'a\tb\nc\td');
  button('submit').click();
  await tick();

  assert.equal(event.defaultPrevented, true);
  assert.deepEqual(results[0].cells, [['', '', ''], ['', 'a', 'b'], ['', 'c', 'd']]);
});

test('pasting a table from Notion fills the cells with its formatting kept as markdown', async () => {
  const { open, inputs, paste, button, results } = setup();
  open(tableModel.createTable(2, 2));
  const html = '<table><tr><td><strong>順序</strong></td><td>項目</td></tr><tr><td>-2</td><td>合併 pr<ul><li>訂單</li></ul></td></tr></table>';

  paste(inputs()[0], '| **順序** | 項目 |\n| --- | --- |\n| -2 | 合併 pr\n  • 訂單 |', html);
  button('submit').click();
  await tick();

  assert.deepEqual(results[0].cells, [['**順序**', '項目'], ['-2', '合併 pr<br>• 訂單']]);
});

test('pasting a markdown table as plain text fills the cells', async () => {
  const { open, inputs, paste, button, results } = setup();
  open(tableModel.createTable(2, 2));

  paste(inputs()[0], '| a | b |\n| - | - |\n| 1 | 2 |');
  button('submit').click();
  await tick();

  assert.deepEqual(results[0].cells, [['a', 'b'], ['1', '2']]);
});

test('pasting a single value is left to the input', () => {
  const { open, inputs, paste } = setup();
  open();

  assert.equal(paste(inputs()[0], 'plain').defaultPrevented, false);
});

test('edit mode changes the title and the submit label', () => {
  const { open, shadow, button } = setup();

  open(tableModel.createTable(2, 2), { mode: 'edit' });

  assert.equal(shadow().querySelector('h2').textContent, '編輯表格');
  assert.equal(button('submit').textContent, '更新');
  assert.match(shadow().querySelector('.hint').textContent, /試算表/);
});

test('clicking the dimmed backdrop cancels, clicking inside the dialog does not', async () => {
  const { open, shadow, results, inputs } = setup();
  open();
  const backdrop = shadow().querySelector('.backdrop');

  inputs()[0].dispatchEvent(new backdrop.ownerDocument.defaultView.MouseEvent('mousedown', { bubbles: true, composed: true }));
  await tick();
  assert.deepEqual(results, []);

  backdrop.dispatchEvent(new backdrop.ownerDocument.defaultView.MouseEvent('mousedown', { bubbles: true }));
  await tick();
  assert.deepEqual(results, [null]);
});
