'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const BACKGROUND = path.join(__dirname, '../src/background.js');

/** Loads the service worker against a fake chrome API and returns what it registered. */
function loadBackground({ sendMessage = () => Promise.resolve() } = {}) {
  const listeners = {};
  const created = [];
  const sent = [];
  globalThis.chrome = {
    runtime: { onInstalled: { addListener: (listener) => { listeners.installed = listener; } } },
    contextMenus: {
      create: (item) => created.push(item),
      onClicked: { addListener: (listener) => { listeners.clicked = listener; } },
    },
    tabs: {
      sendMessage: (...args) => {
        sent.push(args);
        return sendMessage(...args);
      },
    },
  };
  // The listeners read the global chrome when they run, so it stays installed
  // (each test file runs in its own process).
  delete require.cache[BACKGROUND];
  require(BACKGROUND);
  return { listeners, created, sent };
}

test('on install, adds the menu item to editable fields on chat.google.com only', () => {
  const { listeners, created } = loadBackground();

  listeners.installed();

  assert.deepEqual(created, [{
    id: 'mdtable-insert-table',
    title: '插入 Markdown 表格',
    contexts: ['editable'],
    documentUrlPatterns: ['https://chat.google.com/*'],
  }]);
});

test('a click on the item asks the content script in the clicked frame to open the editor', () => {
  const { listeners, sent } = loadBackground();

  listeners.clicked({ menuItemId: 'mdtable-insert-table', frameId: 7 }, { id: 42 });

  assert.deepEqual(sent, [[42, { type: 'mdtable:open-editor' }, { frameId: 7 }]]);
});

test('ignores other menu items and clicks without a tab', () => {
  const { listeners, sent } = loadBackground();

  listeners.clicked({ menuItemId: 'something-else', frameId: 0 }, { id: 1 });
  listeners.clicked({ menuItemId: 'mdtable-insert-table', frameId: 0 }, undefined);

  assert.deepEqual(sent, []);
});

test('reports a tab whose content script cannot be reached (e.g. opened before the extension loaded)', async (t) => {
  const logged = t.mock.method(console, 'error', () => {});
  const { listeners } = loadBackground({ sendMessage: () => Promise.reject(new Error('Receiving end does not exist.')) });

  listeners.clicked({ menuItemId: 'mdtable-insert-table', frameId: 3 }, { id: 9 });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(logged.mock.callCount(), 1);
  assert.match(logged.mock.calls[0].arguments[0], /tab 9 frame 3/);
});
