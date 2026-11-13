'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { findTables, containsTable } = require('../src/tableParser.js');

test('parses a basic table with header, delimiter and body rows', () => {
  const text = '| Name | Age |\n| --- | --- |\n| Amy | 30 |\n| Bob | 25 |';

  assert.deepEqual(findTables(text), [{
    header: ['Name', 'Age'],
    align: [null, null],
    rows: [['Amy', '30'], ['Bob', '25']],
    start: 0,
    end: text.length,
  }]);
});

test('reports character offsets of the table inside surrounding text', () => {
  const text = 'Report:\n| a | b |\n|---|---|\n| 1 | 2 |\n\nThanks';

  const [table] = findTables(text);

  assert.equal(text.slice(table.start, table.end), '| a | b |\n|---|---|\n| 1 | 2 |');
});

test('accepts tables without leading and trailing pipes', () => {
  const [table] = findTables('a | b\n--|--\n1 | 2');

  assert.deepEqual(table.header, ['a', 'b']);
  assert.deepEqual(table.rows, [['1', '2']]);
});

test('reads column alignment from the delimiter row', () => {
  const [table] = findTables('| l | c | r | n |\n|:--|:-:|--:|---|\n| 1 | 2 | 3 | 4 |');

  assert.deepEqual(table.align, ['left', 'center', 'right', null]);
});

test('keeps escaped pipes inside a cell', () => {
  const [table] = findTables('| expr |\n| --- |\n| a \\| b |');

  assert.deepEqual(table.rows, [['a | b']]);
});

test('pads short rows and truncates long rows to the header width', () => {
  const [table] = findTables('| a | b |\n| - | - |\n| 1 |\n| 1 | 2 | 3 |');

  assert.deepEqual(table.rows, [['1', ''], ['1', '2']]);
});

test('ends the table at the first line without a pipe', () => {
  const text = '| a |\n| - |\n| 1 |\nafter';

  const [table] = findTables(text);

  assert.deepEqual(table.rows, [['1']]);
  assert.equal(text.slice(table.end), '\nafter');
});

test('finds multiple tables in one message', () => {
  const text = '| a |\n|---|\n| 1 |\n\n| b |\n|---|\n| 2 |';

  const tables = findTables(text);

  assert.equal(tables.length, 2);
  assert.deepEqual(tables[1].header, ['b']);
  assert.equal(text.slice(tables[1].start, tables[1].end), '| b |\n|---|\n| 2 |');
});

test('rejects a delimiter row whose column count differs from the header', () => {
  assert.equal(containsTable('| a | b | c |\n| --- | --- |\n| 1 | 2 | 3 |'), false);
});

test('does not treat plain text with pipes or dashes as a table', () => {
  assert.equal(containsTable('a | b\nsome text'), false);
  assert.equal(containsTable('---\n----'), false);
  assert.equal(containsTable('foo\n| --- |'), false);
});

test('handles CRLF line endings without shifting offsets', () => {
  const text = 'x\r\n| a |\r\n| - |\r\n| 1 |';

  const [table] = findTables(text);

  assert.deepEqual(table.rows, [['1']]);
  assert.equal(text.slice(table.start, table.start + 5), '| a |');
});

test('returns no tables for plain text', () => {
  assert.deepEqual(findTables('hello'), []);
});
