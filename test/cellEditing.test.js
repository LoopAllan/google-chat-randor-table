'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { createCellEditing } = require('../src/cellEditing.js');
const { applyShortcut } = require('../src/markdownShortcuts.js');
const { renderInline } = require('../src/inlineMarkdown.js');
const { renderTable } = require('../src/tableRenderer.js');
const { createHtmlTableReader } = require('../src/htmlTable.js');

const { readCell } = createHtmlTableReader({ parseHtml: () => null });

function setup() {
  const { window } = new JSDOM('<!doctype html><body></body>');
  const { document } = window;
  const timers = [];
  const editing = createCellEditing({
    doc: document, applyShortcut, renderInline, readCell, delay: (callback) => timers.push(callback),
  });
  const wrapper = renderTable({ header: ['名稱', '數量'], rows: [['**a**', '1'], ['b', '2']], align: [null, null] }, document,
    { renderCell: renderInline });
  document.body.appendChild(wrapper);
  const table = wrapper.querySelector('table');
  const calls = { changes: [], inputs: 0, leaves: [], submits: 0 };
  editing.attach(table, {
    onChange: (row, column, markdown) => calls.changes.push([row, column, markdown]),
    onInput: () => { calls.inputs += 1; },
    onLeave: (where) => { calls.leaves.push(where); },
    onSubmit: () => { calls.submits += 1; },
  });
  const cells = [...table.querySelectorAll('th, td')];
  const runTimers = () => timers.splice(0).forEach((callback) => callback());
  return { window, document, table, cells, calls, runTimers, timers };
}

/** Simulates typing text at the end of cell (jsdom has no editing engine). */
function typeInto(window, document, cell, text, { isComposing = false } = {}) {
  let node = cell.lastChild;
  if (node === null || node.nodeType !== 3) {
    node = cell.appendChild(document.createTextNode(''));
  }
  node.data += text;
  const range = document.createRange();
  range.setStart(node, node.length);
  document.getSelection().removeAllRanges();
  document.getSelection().addRange(range);
  node.parentNode.dispatchEvent(new window.InputEvent('input', { bubbles: true, isComposing }));
}

const key = (window, target, init) => {
  const event = new window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
};

test('every cell becomes plain-text editable', () => {
  const { cells } = setup();

  assert.ok(cells.every((cell) => cell.getAttribute('contenteditable') === 'plaintext-only'));
});

test('typing **x** turns it bold, and the cell is reported as markdown after a pause', () => {
  const { window, document, cells, calls, runTimers } = setup();
  const cell = cells[4];

  typeInto(window, document, cell, ' **新**');

  assert.equal(cell.querySelector('strong').textContent, '新');
  assert.equal(calls.inputs, 1);
  assert.deepEqual(calls.changes, [], 'reported after the pause, not on every key');
  runTimers();
  assert.deepEqual(calls.changes, [[2, 0, 'b **新**']]);
});

test('keeps the source of formatting already in the cell', () => {
  const { window, document, cells, calls } = setup();

  typeInto(window, document, cells[2], '!');
  cells[2].dispatchEvent(new window.FocusEvent('focusout', { bubbles: true }));

  assert.deepEqual(calls.changes, [[1, 0, '**a**!']]);
});

test('leaving the cell reports at once, without waiting for the pause', () => {
  const { window, document, cells, calls } = setup();

  typeInto(window, document, cells[0], 'X');
  cells[0].dispatchEvent(new window.FocusEvent('focusout', { bubbles: true }));

  assert.deepEqual(calls.changes, [[0, 0, '名稱X']]);
});

test('IME composition: nothing converts or is reported until the composition ends', () => {
  const { window, document, cells, calls, runTimers } = setup();
  const cell = cells[5];

  cell.dispatchEvent(new window.CompositionEvent('compositionstart', { bubbles: true }));
  typeInto(window, document, cell, '`ㄓ`', { isComposing: true });
  runTimers();
  cell.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true }));
  assert.equal(cell.querySelector('code'), null);
  assert.deepEqual(calls.changes, []);

  // The IME commits its text; replacing data resets the selection, so put the caret back at the end.
  cell.lastChild.data = '2`中`';
  document.getSelection().collapse(cell.lastChild, cell.lastChild.length);
  cell.dispatchEvent(new window.CompositionEvent('compositionend', { bubbles: true }));
  runTimers();

  assert.equal(cell.querySelector('code')?.textContent, '中');
  assert.deepEqual(calls.changes, [[2, 1, '2`中`']]);
});

test('Tab / Shift+Tab move between cells, Enter moves down, Enter on the last row leaves', () => {
  const { window, document, cells, calls } = setup();
  cells[0].focus();

  assert.equal(key(window, cells[0], { key: 'Tab' }).defaultPrevented, true);
  assert.equal(document.activeElement, cells[1]);
  key(window, cells[1], { key: 'Tab', shiftKey: true });
  assert.equal(document.activeElement, cells[0]);
  key(window, cells[0], { key: 'Enter' });
  assert.equal(document.activeElement, cells[2]);
  key(window, cells[4], { key: 'Enter' });
  assert.deepEqual(calls.leaves, ['after']);
});

test('Escape leaves the table; Enter while composing is left to the IME', () => {
  const { window, cells, calls } = setup();

  key(window, cells[0], { key: 'Escape' });
  const imeEnter = key(window, cells[0], { key: 'Enter', isComposing: true });

  assert.deepEqual(calls.leaves, ['after']);
  assert.equal(imeEnter.defaultPrevented, false);
});

test('Shift+Enter adds a line break, written as <br>', () => {
  const { window, document, cells, calls } = setup();
  const cell = cells[3];
  const range = document.createRange();
  range.setStart(cell.firstChild, 1);
  document.getSelection().removeAllRanges();
  document.getSelection().addRange(range);

  key(window, cell, { key: 'Enter', shiftKey: true });
  cell.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true }));

  assert.ok(cell.querySelector('br'));
  assert.deepEqual(calls.changes, [[1, 1, '1']], 'an empty trailing line is dropped');
});

test('keys do not reach Chat\'s page handlers', () => {
  const { window, document, cells } = setup();
  let reached = 0;
  document.body.addEventListener('keydown', () => { reached += 1; });

  key(window, cells[0], { key: 'k' });

  assert.equal(reached, 0);
});

test('paste inserts plain text only, lines becoming <br>', () => {
  const { window, document, cells, calls } = setup();
  const cell = cells[5];
  const range = document.createRange();
  range.setStart(cell.firstChild, 1);
  document.getSelection().removeAllRanges();
  document.getSelection().addRange(range);
  const paste = new window.Event('paste', { bubbles: true, cancelable: true });
  paste.clipboardData = { getData: (type) => (type === 'text/plain' ? 'x\ny' : '<b>x</b>') };

  cell.dispatchEvent(paste);
  cell.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true }));

  assert.equal(paste.defaultPrevented, true);
  assert.deepEqual(calls.changes, [[2, 1, '2x<br>y']]);
});

test('a click in a cell stays in the table', () => {
  const { window, document, cells } = setup();
  let reached = 0;
  document.body.addEventListener('click', () => { reached += 1; });

  cells[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

  assert.equal(reached, 0);
});

test('deleting back to a closing marker does not convert; only typing does', () => {
  const { window, document, cells } = setup();
  const cell = cells[5];
  cell.textContent = '**粗**';
  document.getSelection().collapse(cell.firstChild, cell.firstChild.length);

  cell.dispatchEvent(new window.InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));

  assert.equal(cell.querySelector('strong'), null);
});

/** Puts the caret at offset in the cell's text (its first text node). */
function caretIn(document, cell, offset) {
  cell.focus();
  document.getSelection().collapse(cell.firstChild, offset);
}

test('ArrowUp / ArrowDown move to the cell above / below, keeping the column', () => {
  const { window, document, cells } = setup();
  caretIn(document, cells[3], 0);

  assert.equal(key(window, cells[3], { key: 'ArrowDown' }).defaultPrevented, true);
  assert.equal(document.activeElement, cells[5]);
  key(window, cells[5], { key: 'ArrowUp' });
  key(window, cells[3], { key: 'ArrowUp' });
  assert.equal(document.activeElement, cells[1]);
});

test('ArrowUp on the header row leaves before the table, ArrowDown on the last row after it', () => {
  const { window, cells, calls } = setup();

  key(window, cells[1], { key: 'ArrowUp' });
  key(window, cells[4], { key: 'ArrowDown' });

  assert.deepEqual(calls.leaves, ['before', 'after']);
});

test('ArrowLeft / ArrowRight move only from the edge of the text, landing on the near edge of the next cell', () => {
  const { window, document, cells } = setup();
  caretIn(document, cells[0], 1);

  assert.equal(key(window, cells[0], { key: 'ArrowRight' }).defaultPrevented, false, 'inside the text: the caret moves');
  assert.equal(document.activeElement, cells[0]);

  caretIn(document, cells[0], cells[0].firstChild.length);
  key(window, cells[0], { key: 'ArrowRight' });
  assert.equal(document.activeElement, cells[1]);
  const beforeCaret = document.createRange();
  beforeCaret.setStart(cells[1], 0);
  beforeCaret.setEnd(document.getSelection().getRangeAt(0).startContainer, document.getSelection().getRangeAt(0).startOffset);
  assert.equal(beforeCaret.toString(), '', 'caret at the start of the next cell');

  key(window, cells[1], { key: 'ArrowLeft' });
  assert.equal(document.activeElement, cells[0]);
});

test('ArrowLeft at the first column, ArrowRight at the last stay in the cell', () => {
  const { window, document, cells, calls } = setup();
  caretIn(document, cells[1], cells[1].firstChild.length);

  key(window, cells[1], { key: 'ArrowRight' });

  assert.equal(document.activeElement, cells[1]);
  assert.deepEqual(calls.leaves, []);
});

test('arrow keys with a modifier or a selection are left to the browser', () => {
  const { window, document, cells } = setup();
  caretIn(document, cells[3], 0);

  assert.equal(key(window, cells[3], { key: 'ArrowDown', shiftKey: true }).defaultPrevented, false);
  assert.equal(document.activeElement, cells[3]);
});

test('Cmd/Ctrl+Enter reports the edited cell first, then submits', () => {
  const { window, document, cells, calls } = setup();
  typeInto(window, document, cells[0], 'X');

  key(window, cells[0], { key: 'Enter', metaKey: true });
  assert.deepEqual(calls.changes, [[0, 0, '名稱X']]);
  assert.equal(calls.submits, 1);

  key(window, cells[0], { key: 'Enter', ctrlKey: true });
  assert.equal(calls.submits, 2);
});
