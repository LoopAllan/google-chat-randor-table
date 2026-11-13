'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { mapText } = require('../src/textExtractor.js');

function element(html) {
  const { document } = new JSDOM('<!doctype html><body></body>').window;
  document.body.innerHTML = html;
  return document.body.firstElementChild;
}

test('turns <br> into newlines', () => {
  assert.equal(mapText(element('<span>| a |<br>| - |<br>| 1 |</span>')).text, '| a |\n| - |\n| 1 |');
});

test('separates block-level children with a single newline', () => {
  assert.equal(mapText(element('<span><div>line 1</div><div>line 2</div><p>line 3</p></span>')).text, 'line 1\nline 2\nline 3\n');
});

test('keeps newlines that already exist in text nodes (pre / pre-wrap)', () => {
  assert.equal(mapText(element('<span>| a |\n| - |</span>')).text, '| a |\n| - |');
});

test('flattens inline formatting into plain text', () => {
  assert.equal(mapText(element('<span>| <b>bold</b> | <a href="#">link</a> |</span>')).text, '| bold | link |');
});

test('ignores script and style content', () => {
  assert.equal(mapText(element('<span>a<style>.x{}</style><script>1</script></span>')).text, 'a');
});

test('does not depend on layout, so hidden elements give the same text', () => {
  assert.equal(mapText(element('<span style="display:none">a<br>b</span>')).text, 'a\nb');
});

test('skipped subtrees leave no trace, so inserting one does not change the text', () => {
  const el = element('<span>a<div class="own">ignored</div>b</span>');

  const { text } = mapText(el, (node) => node.classList.contains('own'));

  assert.equal(text, 'ab');
});

test('maps text nodes and <br> elements to their character ranges', () => {
  const el = element('<span>ab<br><b>cd</b></span>');

  const { leaves } = mapText(el);

  assert.deepEqual(leaves.map((leaf) => [leaf.node.nodeName, leaf.start, leaf.end]), [
    ['#text', 0, 2],
    ['BR', 2, 3],
    ['#text', 3, 5],
  ]);
});
