'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { tableFromClipboard } = require('../src/clipboardTable.js');

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

test('ignores clipboard content that did not come from a table', () => {
  assert.equal(tableFromClipboard({ html: '<p>hi</p>', text: 'a\tb\n1\t2' }), null);
  assert.equal(tableFromClipboard({ html: '', text: 'a\tb\n1\t2' }), null);
});

test('ignores a single cell, a single row or a single column', () => {
  assert.equal(tableFromClipboard({ html: HTML_TABLE, text: 'only' }), null);
  assert.equal(tableFromClipboard({ html: HTML_TABLE, text: 'a\tb\tc' }), null);
  assert.equal(tableFromClipboard({ html: HTML_TABLE, text: 'a\nb\nc' }), null);
});
