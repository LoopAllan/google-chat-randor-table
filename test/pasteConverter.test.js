'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { createPasteConverter } = require('../src/pasteConverter.js');
const { tableFromClipboard } = require('../src/clipboardTable.js');
const { toMarkdownTable } = require('../src/markdownTableWriter.js');

const HTML_TABLE = '<table><tr><td>a</td></tr></table>';

function setup() {
  const { window } = new JSDOM('<!doctype html><body><div id="composer" contenteditable="true"></div><p id="plain"></p></body>');
  const { document } = window;
  const inserted = [];
  const converter = createPasteConverter({
    doc: document,
    tableFromClipboard,
    toMarkdown: (rows) => toMarkdownTable(rows, { fenced: true }),
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
