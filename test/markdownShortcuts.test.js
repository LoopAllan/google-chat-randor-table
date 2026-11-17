'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { applyShortcut } = require('../src/markdownShortcuts.js');
const { renderInline } = require('../src/inlineMarkdown.js');

const { document } = new JSDOM('<!doctype html><body></body>').window;
const ZWSP = '\u200B';

/** A cell holding text, typed up to offset (the end by default). */
function type(text, offset = text.length) {
  const cell = document.createElement('td');
  cell.textContent = text;
  const caret = applyShortcut(cell.firstChild, offset, renderInline);
  return { cell, caret, html: cell.innerHTML.replaceAll(ZWSP, '|caret-spacer|') };
}

test('a closed **bold** right before the caret becomes bold, with the caret after it', () => {
  const { cell, caret, html } = type('a **粗**');

  assert.equal(html, 'a <strong>粗</strong>|caret-spacer|');
  assert.equal(caret.node, cell.lastChild);
  assert.equal(caret.offset, 1, 'typing continues outside the bold element');
});

test('italic, strikethrough, inline code and links convert when closed', () => {
  assert.equal(type('*斜*').html, '<em>斜</em>|caret-spacer|');
  assert.equal(type('_斜_').html, '<em>斜</em>|caret-spacer|');
  assert.equal(type('~~刪~~').html, '<del>刪</del>|caret-spacer|');
  assert.equal(type('`npm test`').html, '<code>npm test</code>|caret-spacer|');
  assert.equal(type('看 [文件](https://a.tw/doc)').html,
    '看 <a href="https://a.tw/doc" target="_blank" rel="noopener noreferrer">文件</a>|caret-spacer|');
});

test('does not convert half-typed markers: **粗* must not become * + italic', () => {
  const { caret, html } = type('**粗*');

  assert.equal(caret, null);
  assert.equal(html, '**粗*');
});

test('keeps text after the caret in place', () => {
  const { html } = type('**粗** 後面', '**粗**'.length);

  assert.equal(html, '<strong>粗</strong>|caret-spacer| 後面');
});

test('leaves text alone when nothing closes at the caret', () => {
  assert.equal(type('a * b').caret, null);
  assert.equal(type('2*3').caret, null);
  assert.equal(type('**粗** 之後').caret, null, 'only the syntax just typed, not older text');
  assert.equal(type('snake_case_x_').caret, null, 'intraword underscores stay literal');
  assert.equal(type('\\*字*').caret, null, 'an escaped opener is literal');
  assert.equal(type('[壞](javascript:alert(1))').caret, null, 'unsafe links stay text');
});

test('converts inside an existing element too (typing within bold)', () => {
  const cell = document.createElement('td');
  cell.innerHTML = '<strong>a `b`</strong>';

  const caret = applyShortcut(cell.firstChild.firstChild, 'a `b`'.length, renderInline);

  assert.notEqual(caret, null);
  assert.equal(cell.innerHTML.replaceAll(ZWSP, ''), '<strong>a <code>b</code></strong>');
});
