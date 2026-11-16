'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { createComposerInserter } = require('../src/composerInserter.js');

function setup({ pasteHandled }) {
  const { window } = new JSDOM('<!doctype html><body><div id="composer" contenteditable="true"></div></body>');
  const { document } = window;
  const composer = document.getElementById('composer');
  const calls = [];
  const inserter = createComposerInserter({
    dispatchPaste: (el, text) => {
      calls.push(['paste', text]);
      if (pasteHandled) {
        el.textContent += text;
      }
    },
    execInsertText: (text) => {
      calls.push(['insertText', text]);
      composer.textContent += text;
      return true;
    },
  });
  return { composer, inserter, calls };
}

test('inserts through a synthetic paste so Chat handles the text itself', () => {
  const { composer, inserter, calls } = setup({ pasteHandled: true });

  assert.equal(inserter.insert(composer, 'x'), 'paste');
  assert.deepEqual(calls, [['paste', 'x']]);
  assert.equal(composer.textContent, 'x');
});

test('falls back to insertText when the editor ignores the synthetic paste', () => {
  const { composer, inserter, calls } = setup({ pasteHandled: false });

  assert.equal(inserter.insert(composer, 'x'), 'insertText');
  assert.deepEqual(calls, [['paste', 'x'], ['insertText', 'x']]);
  assert.equal(composer.textContent, 'x');
});

test('fails loudly when neither strategy changes the composer', () => {
  const { window } = new JSDOM('<!doctype html><body><div id="c" contenteditable="true"></div></body>');
  const composer = window.document.getElementById('c');
  const inserter = createComposerInserter({ dispatchPaste: () => {}, execInsertText: () => false });

  assert.throws(() => inserter.insert(composer, 'x'), /could not insert/);
});
