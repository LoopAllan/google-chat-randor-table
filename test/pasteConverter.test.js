'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { createPasteConverter } = require('../src/pasteConverter.js');
const { createClipboardReader } = require('../src/clipboardTable.js');
const { createHtmlTableReader } = require('../src/htmlTable.js');
const { findTables } = require('../src/tableParser.js');
const { fromParsed } = require('../src/tableModel.js');
const { toMarkdownTable } = require('../src/markdownTableWriter.js');

const HTML_TABLE = '<table><tr><td>a</td></tr></table>';
const { readHtmlTable } = createHtmlTableReader({ parseHtml: (html) => new JSDOM(html).window.document });
const { tableFromClipboard } = createClipboardReader({ readHtmlTable, findTables, fromParsed });

function setup() {
  const { window } = new JSDOM('<!doctype html><body><div id="composer" contenteditable="true">'
    + '<article role="code"><div id="code-line">x</div></article><div id="text-line">y</div></div><p id="plain"></p></body>');
  const { document } = window;
  const inserted = [];
  const converter = createPasteConverter({
    doc: document,
    tableFromClipboard,
    toMarkdown: (table, { fenced }) => toMarkdownTable(table.cells, { fenced, align: table.align }),
    insert: (el, text) => inserted.push([el.id, text]),
    isUserEvent: (event) => event.simulatedTrusted,
  });
  converter.start();
  return { window, document, inserted, converter };
}

/** jsdom has no ClipboardEvent/DataTransfer, so build an equivalent event. */
function pasteEvent(window, { html, text, trusted = true }) {
  const event = new window.Event('paste', { bubbles: true, cancelable: true });
  const data = { 'text/html': html, 'text/plain': text };
  Object.defineProperty(event, 'clipboardData', { value: { getData: (type) => data[type] ?? '' } });
  event.simulatedTrusted = trusted;
  return event;
}

test('replaces a spreadsheet paste into the composer with a fenced markdown table', () => {
  const { window, document, inserted } = setup();
  const event = pasteEvent(window, { html: HTML_TABLE, text: 'a\tb\n1\t2' });

  document.getElementById('composer').dispatchEvent(event);

  assert.equal(event.defaultPrevented, true);
  assert.deepEqual(inserted, [['composer', '```\n| a | b |\n| --- | --- |\n| 1 | 2 |\n```']]);
});

/** Paste events target the editing host; where the caret is decides what gets written. */
function placeCaretIn(document, id) {
  const range = document.createRange();
  range.setStart(document.getElementById(id).firstChild, 1);
  document.getSelection().removeAllRanges();
  document.getSelection().addRange(range);
}

test('inside a Chat code block, writes the table without a ``` fence (the block already is one)', () => {
  const { window, document, inserted } = setup();
  placeCaretIn(document, 'code-line');

  document.getElementById('composer').dispatchEvent(pasteEvent(window, { html: HTML_TABLE, text: 'a\tb\n1\t2' }));

  assert.deepEqual(inserted, [['composer', '| a | b |\n| --- | --- |\n| 1 | 2 |']]);
});

test('outside a code block the table is fenced', () => {
  const { window, document, inserted } = setup();
  placeCaretIn(document, 'text-line');

  document.getElementById('composer').dispatchEvent(pasteEvent(window, { html: HTML_TABLE, text: 'a\tb\n1\t2' }));

  assert.equal(inserted[0][1].startsWith('```\n'), true);
});

test('a markdown table pasted as plain text is fenced too, so Chat does not reformat its cells', () => {
  const { window, document, inserted } = setup();
  placeCaretIn(document, 'text-line');

  document.getElementById('composer').dispatchEvent(pasteEvent(window, { html: '', text: '| a | b |\n| :- | -: |\n| *x* | 2 |' }));

  assert.deepEqual(inserted, [['composer', '```\n| a | b |\n| :-- | --: |\n| *x* | 2 |\n```']]);
});

test('leaves ordinary text pastes alone', () => {
  const { window, document, inserted } = setup();
  const event = pasteEvent(window, { html: '<p>hi</p>', text: 'hi' });

  document.getElementById('composer').dispatchEvent(event);

  assert.equal(event.defaultPrevented, false);
  assert.deepEqual(inserted, []);
});

test('ignores its own synthetic paste events', () => {
  const { window, document, inserted } = setup();

  document.getElementById('composer').dispatchEvent(pasteEvent(window, { html: HTML_TABLE, text: 'a\tb\n1\t2', trusted: false }));

  assert.deepEqual(inserted, []);
});

test('ignores pastes outside an editable element', () => {
  const { window, document, inserted } = setup();

  document.getElementById('plain').dispatchEvent(pasteEvent(window, { html: HTML_TABLE, text: 'a\tb\n1\t2' }));

  assert.deepEqual(inserted, []);
});

test('stop removes the listener', () => {
  const { window, document, inserted, converter } = setup();
  converter.stop();

  document.getElementById('composer').dispatchEvent(pasteEvent(window, { html: HTML_TABLE, text: 'a\tb\n1\t2' }));

  assert.deepEqual(inserted, []);
});

test('if reading the paste fails, reports why and lets Chat paste normally', () => {
  const { window } = new JSDOM('<!doctype html><body><div id="composer" contenteditable="true"></div></body>');
  const errors = [];
  const inserted = [];
  createPasteConverter({
    doc: window.document,
    tableFromClipboard: () => { throw new TypeError('blocked by Trusted Types'); },
    toMarkdown: () => 'MD',
    insert: (el, text) => inserted.push(text),
    isUserEvent: () => true,
    onError: (message, error) => errors.push([message, error.message]),
  }).start();
  const event = pasteEvent(window, { html: HTML_TABLE, text: 'a\tb\n1\t2' });

  window.document.getElementById('composer').dispatchEvent(event);

  assert.equal(event.defaultPrevented, false);
  assert.deepEqual(inserted, []);
  assert.equal(errors.length, 1);
  assert.match(errors[0][0], /could not read the pasted table/);
  assert.equal(errors[0][1], 'blocked by Trusted Types');
});
