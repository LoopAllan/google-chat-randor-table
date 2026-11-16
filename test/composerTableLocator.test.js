'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { createComposerTableLocator } = require('../src/composerTableLocator.js');
const { findTables } = require('../src/tableParser.js');
const { mapText } = require('../src/textExtractor.js');
const tableModel = require('../src/tableModel.js');

// Shapes taken from the real Chat composer (2026-11-16): one <div> per line,
// a code block is <article role="code"> holding those line divs.
const CODE_BLOCK_COMPOSER = '<div id="composer" role="textbox" contenteditable="true"><article role="code">'
  + '<div>| custno | 公司名稱 |</div><div>| --- | --- |</div><div>| 849 | 藝珂 |</div></article></div>';
const PLAIN_COMPOSER = '<div id="composer" role="textbox" contenteditable="true">'
  + '<div>hello</div><div>| a | b |</div><div>| - | - |</div><div>| 1 | 2 |</div><div>bye</div></div>';

function setup(html) {
  const { window } = new JSDOM(`<!doctype html><body>${html}</body>`);
  const { document } = window;
  const composer = document.getElementById('composer');
  const locator = createComposerTableLocator({ doc: document, mapText, findTables, fromParsed: tableModel.fromParsed });
  const caretIn = (lineIndex, offset) => {
    const line = composer.querySelectorAll('div')[lineIndex];
    const range = document.createRange();
    range.setStart(line.firstChild, offset);
    range.collapse(true);
    return range;
  };
  return { document, composer, locator, caretIn };
}

test('finds the table under the caret inside a Chat code block', () => {
  const { composer, locator, caretIn } = setup(CODE_BLOCK_COMPOSER);

  const found = locator.locate(composer, caretIn(2, 3));

  assert.deepEqual(found.initial.cells, [['custno', '公司名稱'], ['849', '藝珂']]);
  assert.equal(found.codeBlock, composer.querySelector('article'));
  assert.equal(found.range.toString(), '| custno | 公司名稱 || --- | --- || 849 | 藝珂 |');
});

test('finds a plain-text table and selects only its lines', () => {
  const { composer, locator, caretIn } = setup(PLAIN_COMPOSER);

  const found = locator.locate(composer, caretIn(1, 0));

  assert.equal(found.codeBlock, null);
  assert.equal(found.range.startContainer.data, '| a | b |');
  assert.equal(found.range.endContainer.data, '| 1 | 2 |');
  assert.equal(found.range.endOffset, '| 1 | 2 |'.length);
});

test('a caret at the very end of the last row still counts as inside the table', () => {
  const { composer, locator, caretIn } = setup(PLAIN_COMPOSER);

  assert.notEqual(locator.locate(composer, caretIn(3, '| 1 | 2 |'.length)), null);
});

test('returns null when the caret is outside any table', () => {
  const { composer, locator, caretIn } = setup(PLAIN_COMPOSER);

  assert.equal(locator.locate(composer, caretIn(0, 2)), null);
  assert.equal(locator.locate(composer, caretIn(4, 0)), null);
});

test('handles a caret placed on an element boundary rather than in text', () => {
  const { document, composer, locator } = setup(PLAIN_COMPOSER);
  const range = document.createRange();
  range.setStart(composer, 2);
  range.collapse(true);

  assert.notEqual(locator.locate(composer, range), null);
});
