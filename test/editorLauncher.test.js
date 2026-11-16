'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { createEditorLauncher } = require('../src/editorLauncher.js');
const tableModel = require('../src/tableModel.js');

function setup({ editorResult = tableModel.createTable(2, 2) } = {}) {
  const { window } = new JSDOM('<!doctype html><body><div id="composer" contenteditable="true">hello</div><p id="other">x</p></body>');
  const { document } = window;
  const composer = document.getElementById('composer');
  const inserted = [];
  const opened = [];
  const launcher = createEditorLauncher({
    doc: document,
    eventTarget: window,
    createInitialTable: () => tableModel.createTable(3, 3),
    openEditor: (initial) => {
      opened.push(initial);
      // The editor takes focus away from the composer, like the real one.
      document.getElementById('other').focus();
      document.getSelection().removeAllRanges();
      return Promise.resolve(editorResult);
    },
    toMarkdown: () => 'MD',
    insert: (el, text) => {
      const selection = document.getSelection();
      inserted.push({ id: el.id, text, caret: selection.rangeCount > 0 ? selection.getRangeAt(0).startOffset : null });
    },
  });
  launcher.start();

  const placeCaret = (offset) => {
    composer.focus();
    const range = document.createRange();
    range.setStart(composer.firstChild, offset);
    range.collapse(true);
    document.getSelection().removeAllRanges();
    document.getSelection().addRange(range);
  };
  const shortcut = (target, init = {}) => target.dispatchEvent(new window.KeyboardEvent('keydown', {
    bubbles: true, cancelable: true, code: 'KeyT', key: 'T', altKey: true, shiftKey: true, ...init,
  }));
  return { window, document, composer, launcher, inserted, opened, placeCaret, shortcut };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test('Alt+Shift+T in the composer opens the editor and inserts at the saved caret', async () => {
  const { composer, inserted, opened, placeCaret, shortcut } = setup();
  placeCaret(2);

  const event = shortcut(composer);
  await tick();

  assert.equal(event, false, 'shortcut keystroke should be cancelled');
  assert.equal(opened.length, 1);
  assert.deepEqual(inserted, [{ id: 'composer', text: 'MD', caret: 2 }]);
});

test('other key combinations are left alone', async () => {
  const { composer, opened, shortcut } = setup();

  shortcut(composer, { shiftKey: false });
  shortcut(composer, { code: 'KeyY' });
  await tick();

  assert.equal(opened.length, 0);
});

test('the shortcut outside an editable element does nothing', async () => {
  const { document, opened, shortcut } = setup();

  shortcut(document.getElementById('other'));
  await tick();

  assert.equal(opened.length, 0);
});

test('cancelling the editor inserts nothing', async () => {
  const { composer, inserted, placeCaret, shortcut } = setup({ editorResult: null });
  placeCaret(0);

  shortcut(composer);
  await tick();

  assert.deepEqual(inserted, []);
});

test('openFromContextMenu uses the editable element that was right-clicked', async () => {
  const { window, composer, launcher, inserted, placeCaret } = setup();
  placeCaret(5);
  composer.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true }));

  launcher.openFromContextMenu();
  await tick();

  assert.deepEqual(inserted, [{ id: 'composer', text: 'MD', caret: 5 }]);
});

test('openFromContextMenu falls back to the focused composer when the right-click was not seen', async () => {
  const { launcher, inserted, placeCaret } = setup();
  placeCaret(3);

  launcher.openFromContextMenu();
  await tick();

  assert.deepEqual(inserted, [{ id: 'composer', text: 'MD', caret: 3 }]);
});

test('openFromContextMenu without any composer fails loudly', async () => {
  const { launcher } = setup();

  await assert.rejects(launcher.openFromContextMenu(), /no composer/);
});

test('still sees the shortcut when the page stops keydown propagation at window capture', async () => {
  const { window, composer, opened, placeCaret, shortcut } = setup();
  // Registered after the launcher, like Chat's handlers once ours run at document_start.
  window.addEventListener('keydown', (event) => event.stopPropagation(), true);
  placeCaret(0);

  shortcut(composer);
  await tick();

  assert.equal(opened.length, 1);
});
