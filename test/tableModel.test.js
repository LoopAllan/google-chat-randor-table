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
  assert.deepEqual(added.align, [null, null, 'left']);
  assert.equal(added.cells[0].length, 3);

  const removed = model.removeColumn(added, 2);
  assert.deepEqual(removed.align, [null, null]);
});

test('keeps at least one column', () => {
  const table = model.createTable(2, 1);

  assert.equal(model.removeColumn(table, 0), table);
});

test('cycles alignment none → left → center → right → none', () => {
  let table = model.createTable(2, 1);
  const seen = [];
  for (let step = 0; step < 4; step += 1) {
    table = model.cycleAlign(table, 0);
    seen.push(table.align[0]);
  }

  assert.deepEqual(seen, ['left', 'center', 'right', null]);
});

test('builds a model from a parsed markdown table', () => {
  const table = model.fromParsed({ header: ['a', 'b'], rows: [['1', '2']], align: ['right', null] });

  assert.deepEqual(table.cells, [['a', 'b'], ['1', '2']]);
  assert.deepEqual(table.align, ['right', null]);
});
