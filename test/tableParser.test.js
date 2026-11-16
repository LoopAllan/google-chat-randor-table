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
    sourceRows: [['Amy', '30'], ['Bob', '25']],
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

test('keeps the cells as written in sourceRows so an editor does not lose extra cells', () => {
  const [table] = findTables('| a | b |\n| - | - |\n| 1 |\n| 1 | 2 | 3 |');

  assert.deepEqual(table.sourceRows, [['1'], ['1', '2', '3']]);
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

// Notion copies a table as markdown but keeps line breaks inside cells as raw newlines (2026-11-16).
const NOTION_TABLE = require('node:fs').readFileSync(require('node:path').join(__dirname, 'fixtures/notion-table.md'), 'utf8').trimEnd();

test('reads Notion tables whose cells contain raw line breaks, joining them with <br>', () => {
  const [table] = findTables(NOTION_TABLE);

  assert.deepEqual(table.header, ['STG', 'PROD', '**順序**', '**開始時間**', '**結束時間**', '**耗時**', '**項目**', '**負責工程**']);
  assert.deepEqual(table.rows, [
    ['', '', '-2', '1700', '1710', '10m', '[後端] 合併 pr<br>• 訂單<br>• 網進', ''],
    ['https://github.com/104corp/104vip-apps/pull/2754', 'https://github.com/104corp/104vip-apps/pull/2755', '-1', '1710', '1720', '10m',
      '[後端] Gitops pr<br>• rebase master<br>• ap 更新 image 版號<br>• merge (當天可以先 merge)', ''],
    ['', '', '-1', '1710', '1730', '20m', '[後端] 更新 API 文件<br>• 訂單 api.json<br>• 訂單 meshapi.json<br>• 網進 api.json', ''],
    ['', '', '', '1800', '1810', '10m', '[後端] 部署', ''],
    ['', '', '', '1810', '1830', '20m', '[前端] 部署', ''],
    ['', '', '', '1830', '', '', 'QA 驗收', ''],
  ]);
  assert.equal(table.start, 0);
  assert.equal(table.end, NOTION_TABLE.length, 'the table range covers the continuation lines');
});

test('a row that never closes with a pipe is read as a normal GFM row', () => {
  const [table] = findTables('| a | b |\n| - | - |\n| 1 | 2\nplain text after');

  assert.deepEqual(table.rows, [['1', '2']]);
});

test('text after a closed table is not taken as part of a cell', () => {
  const text = '| a | b |\n| - | - |\n| 1 | 2 |\n  indented note |';

  const [table] = findTables(text);

  assert.deepEqual(table.rows, [['1', '2'], ['indented note', '']]);
});

test('a blank line ends a cell that never closed', () => {
  const [table] = findTables('| a | b |\n| - | - |\n| 1 | 2\n\nmore |');

  assert.deepEqual(table.rows, [['1', '2']]);
});
