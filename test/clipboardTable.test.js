'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { createClipboardReader } = require('../src/clipboardTable.js');
const { createHtmlTableReader } = require('../src/htmlTable.js');
const { findTables } = require('../src/tableParser.js');
const { fromParsed } = require('../src/tableModel.js');

const { readHtmlTable } = createHtmlTableReader({ parseHtml: (html) => new JSDOM(html).window.document });
const reader = createClipboardReader({ readHtmlTable, findTables, fromParsed });
/** Cells of the pasted table, or null when the paste is not taken as a table. */
const tableFromClipboard = (clipboard) => reader.tableFromClipboard(clipboard)?.cells ?? null;

const HTML_TABLE = '<meta charset="utf-8"><table><tr><td>a</td></tr></table>';

test('reads rows and cells from spreadsheet TSV', () => {
  const rows = tableFromClipboard({ html: HTML_TABLE, text: 'name\tage\nAmy\t30\nBob\t25' });

  assert.deepEqual(rows, [['name', 'age'], ['Amy', '30'], ['Bob', '25']]);
});

test('handles CRLF and the trailing line break Excel adds', () => {
  const rows = tableFromClipboard({ html: HTML_TABLE, text: 'a\tb\r\n1\t2\r\n' });

  assert.deepEqual(rows, [['a', 'b'], ['1', '2']]);
});

test('unquotes cells that contain line breaks, tabs or quotes', () => {
  const rows = tableFromClipboard({ html: HTML_TABLE, text: 'note\tq\n"line 1\nline 2"\t"say ""hi"""' });

  assert.deepEqual(rows, [['note', 'q'], ['line 1\nline 2', 'say "hi"']]);
});

test('pads uneven rows to the widest row', () => {
  const rows = tableFromClipboard({ html: HTML_TABLE, text: 'a\tb\tc\n1' });

  assert.deepEqual(rows, [['a', 'b', 'c'], ['1', '', '']]);
});

test('ignores tab-separated text that did not come from a table', () => {
  assert.equal(tableFromClipboard({ html: '<p>hi</p>', text: 'a\tb\n1\t2' }), null);
  assert.equal(tableFromClipboard({ html: '', text: 'a\tb\n1\t2' }), null);
});

test('prefers the cells of the HTML table, which keep formatting and work for any source', () => {
  const html = '<table><tr><th><strong>順序</strong></th><th>項目</th></tr>'
    + '<tr><td>-2</td><td>[後端] 合併 pr<ul><li>訂單</li><li>網進</li></ul></td></tr></table>';
  // Notion puts markdown, not TSV, in the plain-text flavour.
  const text = '| **順序** | 項目 |\n| --- | --- |\n| -2 | [後端] 合併 pr\n  • 訂單\n  • 網進 |';

  assert.deepEqual(tableFromClipboard({ html, text }), [['**順序**', '項目'], ['-2', '[後端] 合併 pr<br>• 訂單<br>• 網進']]);
});

test('reads a markdown table pasted as plain text (AI answers, docs, other chats), keeping alignment', () => {
  const table = reader.tableFromClipboard({ html: '', text: '\n| 欄位 | 數量 |\n| :-- | --: |\n| api-a | 12 |\n' });

  assert.deepEqual(table, { cells: [['欄位', '數量'], ['api-a', '12']], align: ['left', 'right'] });
});

test('leaves a paste alone when the markdown table is only part of the text', () => {
  assert.equal(tableFromClipboard({ html: '', text: '結果如下：\n| a | b |\n| - | - |\n| 1 | 2 |' }), null);
});

test('ignores a single cell, a single row or a single column', () => {
  assert.equal(tableFromClipboard({ html: HTML_TABLE, text: 'only' }), null);
  assert.equal(tableFromClipboard({ html: HTML_TABLE, text: 'a\tb\tc' }), null);
  assert.equal(tableFromClipboard({ html: HTML_TABLE, text: 'a\nb\nc' }), null);
});

test('gridFromClipboard reads any block of cells for the editor, without size or header requirements', () => {
  const grid = (clipboard) => reader.gridFromClipboard({ html: '', text: '', ...clipboard });

  assert.deepEqual(grid({ text: 'a\tb\r\nc\td\r\n' }), [['a', 'b'], ['c', 'd']]);
  assert.deepEqual(grid({ text: 'single' }), [['single']]);
  assert.deepEqual(grid({ text: '"x\ny"\tz' }), [['x\ny', 'z']]);
  assert.deepEqual(grid({ html: '<table><tr><td><b>x</b></td></tr></table>', text: 'x' }), [['**x**']]);
  assert.deepEqual(grid({ text: '| a |\n| - |\n| 1 |' }), [['a'], ['1']]);
});

// Real Notion clipboard (2026-11-16): its HTML splits each list item of a cell into a row
// of its own, while its plain text is a correct markdown table.
const NOTION = {
  html: require('node:fs').readFileSync(require('node:path').join(__dirname, 'fixtures/notion-clipboard.html'), 'utf8'),
  text: require('node:fs').readFileSync(require('node:path').join(__dirname, 'fixtures/notion-table.md'), 'utf8').trimEnd(),
};

test('a Notion paste uses its markdown text, keeping list items inside their cell', () => {
  const cells = tableFromClipboard(NOTION);

  assert.equal(cells.length, 7, 'header + 6 rows, not one row per list item');
  assert.deepEqual(cells[1], ['', '', '-2', '1700', '1710', '10m', '[後端] 合併 pr<br>• 訂單<br>• 網進', '']);
  assert.equal(cells[0][2], '**順序**');
});

test('pasting the Notion table into the editor uses the markdown text too', () => {
  assert.equal(reader.gridFromClipboard(NOTION).length, 7);
});

test('a markdown table already wrapped in a ``` fence is read too', () => {
  assert.deepEqual(tableFromClipboard({ html: '', text: '```\n| a | b |\n| - | - |\n| 1 | 2 |\n```\n' }), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(tableFromClipboard({ html: '', text: '```markdown\n| a |\n| - |\n| 1 |\n```' }), [['a'], ['1']]);
});
