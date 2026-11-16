'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { createEditorLauncher } = require('../src/editorLauncher.js');
const tableModel = require('../src/tableModel.js');

function setup({ editorResult = tableModel.createTable(2, 2), locateTable } = {}) {
  const replaced = [];
  const { window } = new JSDOM('<!doctype html><body><div id="composer" contenteditable="true">hello</div><p id="other">x</p></body>');
  const { document } = window;
  const composer = document.getElementById('composer');
  const inserted = [];
  const opened = [];
  const launcher = createEditorLauncher({
    doc: document,
    eventTarget: window,
    createInitialTable: () => tableModel.createTable(3, 3),
    locateTable,
    openEditor: (initial, options) => {
      opened.push({ initial, options });
      // The editor takes focus away from the composer, like the real one.
      document.getElementById('other').focus();
      document.getSelection().removeAllRanges();
      return Promise.resolve(editorResult);
    },
    toMarkdown: (table, options) => (options.fenced ? 'MD' : 'MD-unfenced'),
    replaceInCodeBlock: (codeBlock, range, text) => replaced.push({ codeBlock, selected: range.toString(), text }),
    insert: (el, text) => {
      const selection = document.getSelection();
      const caret = selection.rangeCount > 0 ? selection.getRangeAt(0).startOffset : null;
      const record = { id: el.id, text, caret };
      if (selection.rangeCount > 0 && !selection.getRangeAt(0).collapsed) {
        record.selected = selection.toString();
      }
      inserted.push(record);
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
  return { window, document, composer, launcher, inserted, replaced, opened, placeCaret, shortcut };
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

function locateFirstWord(existing, codeBlock) {
  let located = null;
  const locateTable = (composer, caret) => {
    located = caret.startOffset;
    const range = composer.ownerDocument.createRange();
    range.setStart(composer.firstChild, 1);
    range.setEnd(composer.firstChild, 4);
    return { initial: existing, range, codeBlock };
  };
  return { locateTable, located: () => located };
}

test('with the caret on a table in a code block, edits it and rewrites the code block lines', async () => {
  const existing = tableModel.fromParsed({ header: ['a'], rows: [['1']], align: [null] });
  const codeBlock = { id: 'block' };
  const locate = locateFirstWord(existing, codeBlock);
  const env = setup({ locateTable: locate.locateTable });
  env.placeCaret(2);

  env.shortcut(env.composer);
  await tick();

  assert.equal(locate.located(), 2);
  assert.equal(env.opened[0].initial, existing);
  assert.deepEqual(env.opened[0].options, { mode: 'edit' });
  // Chat's code block already acts as the fence; a second ``` would nest.
  assert.deepEqual(env.replaced, [{ codeBlock, selected: 'ell', text: 'MD-unfenced' }]);
  assert.deepEqual(env.inserted, []);
});

test('a plain-text table (no code block) is replaced by inserting a fenced table over it', async () => {
  const existing = tableModel.fromParsed({ header: ['a'], rows: [['1']], align: [null] });
  const env = setup({ locateTable: locateFirstWord(existing, null).locateTable });
  env.placeCaret(2);

  env.shortcut(env.composer);
  await tick();

  assert.deepEqual(env.inserted, [{ id: 'composer', text: 'MD', caret: 1, selected: 'ell' }]);
  assert.deepEqual(env.replaced, []);
});

test('editAt opens the table at a given position without relying on the current selection', async () => {
  const existing = tableModel.fromParsed({ header: ['a'], rows: [['1']], align: [null] });
  const codeBlock = { id: 'block' };
  const locate = locateFirstWord(existing, codeBlock);
  const env = setup({ locateTable: locate.locateTable });
  const position = env.document.createRange();
  position.setStart(env.composer.firstChild, 3);

  await env.launcher.editAt(env.composer, position);

  assert.equal(locate.located(), 3);
  assert.equal(env.replaced.length, 1);
});

test('without an existing table, opens in insert mode and writes a fenced table', async () => {
  const env = setup({ locateTable: () => null });
  env.placeCaret(1);

  env.shortcut(env.composer);
  await tick();

  assert.deepEqual(env.opened[0].options, { mode: 'insert' });
  assert.equal(env.inserted[0].text, 'MD');
});

test('with no caret inside the composer, opens a new table and inserts it into the focused composer', async () => {
  const { document, composer, launcher, inserted, opened } = setup();
  composer.focus();
  const elsewhere = document.createRange();
  elsewhere.setStart(document.getElementById('other').firstChild, 0);
  document.getSelection().removeAllRanges();
  document.getSelection().addRange(elsewhere);

  await launcher.openFromContextMenu();

  assert.deepEqual(opened[0].options, { mode: 'insert' });
  assert.equal(inserted[0].id, 'composer');
  assert.equal(document.activeElement, composer);
});

test('stop removes the shortcut listener', async () => {
  const { composer, launcher, opened, placeCaret, shortcut } = setup();
  launcher.stop();
  placeCaret(0);

  shortcut(composer);
  await tick();

  assert.equal(opened.length, 0);
});
