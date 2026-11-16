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

/** Counts mapText calls, the expensive part of checking a message (walks it and rebuilds its text). */
function setupCounting(bodyHtml) {
  const { window } = new JSDOM('<!doctype html><body></body>');
  const { document } = window;
  document.body.innerHTML = bodyHtml;
  const counter = { reads: 0 };
  const countingMapText = (...args) => {
    counter.reads += 1;
    return mapText(...args);
  };
  const enhancer = createMessageEnhancer({ findTables, mapText: countingMapText, renderTable, doc: document });
  const watcher = createTableWatcher({
    root: document.body,
    enhancer,
    MutationObserverImpl: window.MutationObserver,
    schedule: (callback) => setTimeout(callback, 0),
  });
  return { document, watcher, enhancer, counter };
}

test('rendering a table does not make the watcher re-check the message for its own DOM changes', async () => {
  const { document, watcher, enhancer, counter } = setupCounting('<div id="list"></div>');
  watcher.start();
  let readsAfterRender = null;
  const scan = enhancer.scan;
  enhancer.scan = (node) => {
    scan(node);
    readsAfterRender = counter.reads;
  };

  // Text around the table: rendering splits and wraps text nodes inside the message.
  document.getElementById('list').innerHTML = `<div>intro<br>${TABLE_HTML}<br>outro</div>`;
  await flush();
  await flush();

  assert.equal(document.querySelectorAll('table.mdtable').length, 1);
  assert.equal(counter.reads, readsAfterRender, 'no reads after the render finished');
  watcher.stop();
});

test('several changes to one rendered message in a batch check it once', async () => {
  const { document, watcher, counter } = setupCounting(`<span id="msg">${TABLE_HTML}</span><span id="other">hi</span>`);
  watcher.start();
  await flush();
  const before = counter.reads;

  // Chat decorating a message (e.g. reactions): several mutations inside it, one batch, same text.
  const message = document.getElementById('msg');
  message.appendChild(document.createElement('span'));
  message.appendChild(document.createElement('span'));
  message.appendChild(document.createElement('span'));
  await flush();

  assert.equal(counter.reads - before, 1);
  watcher.stop();
});

test('a rendered table that ends up in an editable area (composer turned editable) is undone', async () => {
  const { document, watcher } = setup(`<div id="box"><span id="msg">${TABLE_HTML}</span></div>`);
  watcher.start();
  assert.equal(document.querySelectorAll('.mdtable-wrapper').length, 1);

  document.getElementById('box').setAttribute('contenteditable', 'true');
  await flush();

  assert.equal(document.querySelectorAll('.mdtable-wrapper').length, 0, 'our table must never become draft content');
  assert.equal(document.querySelectorAll('[data-mdtable-hidden]').length, 0);
  assert.equal(document.getElementById('msg').innerHTML, TABLE_HTML, 'the original text is back as it was');
  watcher.stop();
});
