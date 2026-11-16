'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { toMarkdownTable } = require('../src/markdownTableWriter.js');
const { findTables } = require('../src/tableParser.js');

test('writes the first row as header followed by a delimiter row', () => {
  assert.equal(
    toMarkdownTable([['name', 'age'], ['Amy', '30']]),
    '| name | age |\n| --- | --- |\n| Amy | 30 |',
  );
});

test('wraps the table in a code fence when asked', () => {
  assert.equal(toMarkdownTable([['a', 'b'], ['1', '2']], { fenced: true }), '```\n| a | b |\n| --- | --- |\n| 1 | 2 |\n```');
});

test('escapes pipes and flattens line breaks inside cells', () => {
  assert.equal(
    toMarkdownTable([['expr', 'note'], ['a | b', 'line 1\nline 2']]),
    '| expr | note |\n| --- | --- |\n| a \\| b | line 1 line 2 |',
  );
});

test('writes alignment markers when given', () => {
  const markdown = toMarkdownTable([['l', 'c', 'r', 'n'], ['1', '2', '3', '4']], { align: ['left', 'center', 'right', null] });

  assert.equal(markdown.split('\n')[1], '| :-- | :-: | --: | --- |');
});

test('round-trips through the parser', () => {
  const rows = [['服務', '錯誤數'], ['api | a', '12'], ['api-b', '']];

  const [table] = findTables(toMarkdownTable(rows));

  assert.deepEqual([table.header, ...table.rows], rows);
});
