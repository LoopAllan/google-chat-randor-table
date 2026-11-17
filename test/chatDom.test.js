'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const chatDom = require('../src/chatDom.js');

function setup(html) {
  const { window } = new JSDOM(`<!doctype html><body>${html}</body>`);
  return window.document;
}

test('recognises Chat composer code blocks in both shapes (article role=code, pre)', () => {
  const document = setup('<div role="textbox" contenteditable="true"><article role="code"><div>a</div></article><pre>b</pre></div>'
    + '<article role="code">sent message</article>');

  const blocks = [...document.querySelectorAll(chatDom.COMPOSER_CODE_BLOCK)].map((block) => block.textContent);

  assert.deepEqual(blocks, ['a', 'b'], 'only code blocks inside the composer');
});

test('editableAncestor and codeBlockAncestor accept text nodes and elements', () => {
  const document = setup('<div id="c" contenteditable="true"><article role="code"><div id="line">x</div></article><div id="plain">y</div></div>'
    + '<div contenteditable="false"><span id="off">z</span></div>');
  const composer = document.getElementById('c');

  assert.equal(chatDom.editableAncestor(document.getElementById('line').firstChild), composer);
  assert.equal(chatDom.editableAncestor(document.getElementById('off')), null);
  assert.equal(chatDom.codeBlockAncestor(document.getElementById('line').firstChild, composer), composer.querySelector('article'));
  assert.equal(chatDom.codeBlockAncestor(document.getElementById('plain'), composer), null);
  assert.equal(chatDom.editableAncestor(null), null);
});

test('codeBlockAncestor ignores code blocks outside the given composer', () => {
  const document = setup('<pre><div id="c" contenteditable="true"><div id="line">x</div></div></pre>');
  const composer = document.getElementById('c');

  assert.equal(chatDom.codeBlockAncestor(document.getElementById('line'), composer), null);
});

test('setCaret focuses the composer and selects the range; a null range only focuses', () => {
  const document = setup('<div id="c" contenteditable="true">hello</div><input id="other">');
  const composer = document.getElementById('c');
  const range = document.createRange();
  range.setStart(composer.firstChild, 2);
  document.getElementById('other').focus();

  chatDom.setCaret(composer, range);
  assert.equal(document.activeElement, composer);
  assert.equal(document.getSelection().getRangeAt(0).startOffset, 2);

  document.getElementById('other').focus();
  chatDom.setCaret(composer, null);
  assert.equal(document.activeElement, composer);
});

test('editableAncestor never treats our own preview layer (editable table cells) as a Chat composer', () => {
  const document = setup(`<div class="${chatDom.PREVIEW_LAYER_CLASS}"><table><tr><td id="cell" contenteditable="plaintext-only">x</td></tr></table></div>`);

  assert.equal(chatDom.editableAncestor(document.getElementById('cell').firstChild), null);
  assert.equal(chatDom.editableAncestor(document.getElementById('cell')), null);
});

test('sendMessage presses Enter in the composer, as a user sending the message would', () => {
  const document = setup('<div id="c" role="textbox" contenteditable="true">hi</div>');
  const composer = document.getElementById('c');
  const keys = [];
  composer.addEventListener('keydown', (event) => keys.push([event.key, event.keyCode, event.shiftKey, event.bubbles]));

  chatDom.sendMessage(composer);

  assert.deepEqual(keys, [['Enter', 13, false, true]]);
});
