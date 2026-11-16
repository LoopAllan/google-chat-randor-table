'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const model = require('../src/tableModel.js');

test('creates an empty table with a header row', () => {
  const table = model.createTable(2, 3);

  assert.deepEqual(table.cells, [['', '', ''], ['', '', '']]);
  assert.deepEqual(table.align, [null, null, null]);
});

test('sets a cell without mutating the original table', () => {
  const table = model.createTable(2, 2);

  const next = model.setCell(table, 1, 0, 'x');

  assert.equal(next.cells[1][0], 'x');
  assert.equal(table.cells[1][0], '');
});

test('inserts and removes rows', () => {
  const table = model.setCell(model.createTable(2, 2), 1, 0, 'keep');

  const added = model.insertRow(table, 1);
  assert.deepEqual(added.cells.map((row) => row[0]), ['', '', 'keep']);

  const removed = model.removeRow(added, 1);
  assert.deepEqual(removed.cells.map((row) => row[0]), ['', 'keep']);
});

test('keeps at least the header and one body row', () => {
  const table = model.createTable(2, 2);

  assert.equal(model.removeRow(table, 1), table);
  assert.equal(model.removeRow(model.insertRow(table, 2), 0).cells.length, 2);
});

test('inserts and removes columns together with their alignment', () => {
  const table = model.cycleAlign(model.createTable(2, 2), 1);

  const added = model.insertColumn(table, 1);
  assert.deepEqual(added.align, [null, null, 'center']);
  assert.equal(added.cells[0].length, 3);

  const removed = model.removeColumn(added, 2);
  assert.deepEqual(removed.align, [null, null]);
});

test('keeps at least one column', () => {
  const table = model.createTable(2, 1);

  assert.equal(model.removeColumn(table, 0), table);
});

test('cycles alignment left → center → right → left; unset already renders left, so it is the left step', () => {
  let table = model.createTable(2, 1);
  const seen = [];
  for (let step = 0; step < 3; step += 1) {
    table = model.cycleAlign(table, 0);
    seen.push(table.align[0]);
  }

  assert.deepEqual(seen, ['center', 'right', null]);
  assert.equal(model.cycleAlign({ cells: [['a']], align: ['left'] }, 0).align[0], 'center', 'an explicit :-- is the left step too');
});

test('builds a model from a parsed markdown table', () => {
  const table = model.fromParsed({ header: ['a', 'b'], rows: [['1', '2']], align: ['right', null] });

  assert.deepEqual(table.cells, [['a', 'b'], ['1', '2']]);
  assert.deepEqual(table.align, ['right', null]);
});

test('a parsed table with rows wider than its header grows instead of dropping cells', () => {
  const table = model.fromParsed({
    header: ['a', 'b'], align: ['right', null], rows: [['1', ''], ['1', '2']], sourceRows: [['1'], ['1', '2', '3']],
  });

  assert.deepEqual(table.cells, [['a', 'b', ''], ['1', '', ''], ['1', '2', '3']]);
  assert.deepEqual(table.align, ['right', null, null]);
});

test('pastes a block starting at a cell, growing the table as needed', () => {
  const table = model.setCell(model.createTable(2, 2), 0, 0, 'keep');

  const next = model.pasteBlock(table, 1, 1, [['a', 'b', 'c'], ['d']]);

  assert.deepEqual(next.cells, [
    ['keep', '', '', ''],
    ['', 'a', 'b', 'c'],
    ['', 'd', '', ''],
  ]);
  assert.equal(next.align.length, 4);
});

test('pasting inside the table only overwrites the covered cells', () => {
  const table = model.fromParsed({ header: ['h1', 'h2'], rows: [['1', '2'], ['3', '4']], align: [null, null] });

  const next = model.pasteBlock(table, 1, 0, [['x']]);

  assert.deepEqual(next.cells, [['h1', 'h2'], ['x', '2'], ['3', '4']]);
});
