'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { renderTable } = require('../src/tableRenderer.js');

const { document } = new JSDOM('<!doctype html><body></body>').window;

const TABLE = {
  header: ['Name', 'Score'],
  align: [null, 'right'],
  rows: [['Amy', '90'], ['Bob', '85']],
};

test('renders a table with thead and tbody', () => {
  const table = renderTable(TABLE, document).querySelector('table');

  assert.deepEqual([...table.querySelectorAll('thead th')].map((th) => th.textContent), ['Name', 'Score']);
  assert.deepEqual([...table.querySelectorAll('tbody tr')].map((tr) => tr.textContent), ['Amy90', 'Bob85']);
});

test('wraps the table in a horizontally scrollable container', () => {
  const scroll = renderTable(TABLE, document);

  assert.equal(scroll.className, 'mdtable-scroll');
  assert.equal(scroll.firstElementChild.tagName, 'TABLE');
});

test('applies column alignment to header and body cells', () => {
  const table = renderTable(TABLE, document).querySelector('table');

  assert.equal(table.querySelector('thead th:nth-child(2)').style.textAlign, 'right');
  assert.equal(table.querySelector('tbody td:nth-child(2)').style.textAlign, 'right');
  assert.equal(table.querySelector('tbody td:nth-child(1)').style.textAlign, '');
});

test('never interprets cell content as HTML', () => {
  const malicious = { ...TABLE, rows: [['<img src=x onerror=alert(1)>', '<b>x</b>']] };

  const scroll = renderTable(malicious, document);

  assert.equal(scroll.querySelector('img'), null);
  assert.equal(scroll.querySelector('tbody b'), null);
  assert.equal(scroll.querySelector('tbody td').textContent, '<img src=x onerror=alert(1)>');
});
