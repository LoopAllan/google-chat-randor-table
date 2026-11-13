'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { createTableWatcher } = require('../src/tableWatcher.js');
const { createMessageEnhancer } = require('../src/messageEnhancer.js');
const { findTables } = require('../src/tableParser.js');
const { mapText } = require('../src/textExtractor.js');
const { renderTable } = require('../src/tableRenderer.js');

const TABLE_HTML = '| a | b |<br>| --- | --- |<br>| 1 | 2 |';
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(bodyHtml) {
  const { window } = new JSDOM('<!doctype html><body></body>');
  const { document } = window;
  document.body.innerHTML = bodyHtml;
  const enhancer = createMessageEnhancer({ findTables, mapText, renderTable, doc: document });
  const watcher = createTableWatcher({
    root: document.body,
    enhancer,
    MutationObserverImpl: window.MutationObserver,
    schedule: (callback) => setTimeout(callback, 0),
  });
  return { document, watcher };
}

test('renders tables already on the page when started', () => {
  const { document, watcher } = setup(`<span>${TABLE_HTML}</span>`);

  watcher.start();

  assert.equal(document.querySelectorAll('table.mdtable').length, 1);
  watcher.stop();
});

test('renders tables in messages that arrive later', async () => {
  const { document, watcher } = setup('<div id="list"></div>');
  watcher.start();

  const message = document.createElement('div');
  message.innerHTML = `<span>${TABLE_HTML}</span>`;
  document.getElementById('list').appendChild(message);
  await flush();
  await flush();

  assert.equal(document.querySelectorAll('table.mdtable').length, 1);
  watcher.stop();
});

test('re-renders when a processed message is edited in place', async () => {
  const { document, watcher } = setup(`<span id="text">${TABLE_HTML}</span>`);
  watcher.start();

  document.getElementById('text').innerHTML = '| x |<br>| - |<br>| 9 |';
  await flush();
  await flush();

  assert.equal(document.querySelectorAll('.mdtable-wrapper').length, 1);
  assert.equal(document.querySelector('table.mdtable th').textContent, 'x');
  watcher.stop();
});

test('renders a table when a plain message text node is edited into one', async () => {
  const { document, watcher } = setup('<span id="text">| a |\nplain</span>');
  watcher.start();

  document.getElementById('text').firstChild.data = '| a |\n| - |\n| 1 |';
  await flush();
  await flush();

  assert.equal(document.querySelectorAll('table.mdtable').length, 1);
  watcher.stop();
});

test('removes the rendered table when Chat removes the original message', async () => {
  const { document, watcher } = setup(`<div id="bubble"><span id="text">${TABLE_HTML}</span></div>`);
  watcher.start();

  document.getElementById('text').remove();
  await flush();
  await flush();

  assert.equal(document.querySelector('.mdtable-wrapper'), null);
  watcher.stop();
});

test('clicking the toggle does not trigger another render', async () => {
  const { document, watcher } = setup(`<span>${TABLE_HTML}</span>`);
  watcher.start();

  document.querySelector('.mdtable-toggle').click();
  await flush();
  await flush();

  assert.equal(document.querySelectorAll('.mdtable-wrapper').length, 1);
  assert.equal(document.querySelector('.mdtable-scroll').hidden, true);
  watcher.stop();
});

test('stop disconnects the observer', async () => {
  const { document, watcher } = setup('<div id="list"></div>');
  watcher.start();
  watcher.stop();

  document.getElementById('list').innerHTML = `<span>${TABLE_HTML}</span>`;
  await flush();
  await flush();

  assert.equal(document.querySelector('table.mdtable'), null);
});
