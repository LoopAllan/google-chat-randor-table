'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { createMessageEnhancer } = require('../src/messageEnhancer.js');
const { findTables } = require('../src/tableParser.js');
const { mapText } = require('../src/textExtractor.js');
const { renderTable } = require('../src/tableRenderer.js');

const TABLE_HTML = '| a | b |<br>| --- | --- |<br>| 1 | 2 |';

function setup(bodyHtml) {
  const { document } = new JSDOM('<!doctype html><body></body>').window;
  document.body.innerHTML = bodyHtml;
  const enhancer = createMessageEnhancer({ findTables, mapText, renderTable, doc: document });
  return { document, enhancer };
}

/** Text a user would see: skips hidden source nodes and the toggle button. */
function visibleText(node) {
  if (node.nodeType === 3) {
    return node.data;
  }
  if (node.nodeType !== 1 || node.hidden || node.getAttribute('data-mdtable-hidden') === 'table'
    || node.classList.contains('mdtable-toggle')) {
    return '';
  }
  if (node.tagName === 'BR') {
    return '\n';
  }
  if (node.tagName === 'TABLE') {
    return '[table]';
  }
  return [...node.childNodes].map(visibleText).join('');
}

test('keeps the surrounding message DOM untouched and only hides the table lines', () => {
  const { document, enhancer } = setup(
    `<div id="msg">intro <b id="bold">bold</b><br>${TABLE_HTML}<br>after <a id="link" href="#">link</a>`
    + '<ul id="list"><li>item</li></ul></div>',
  );

  enhancer.scan(document.body);

  const msg = document.getElementById('msg');
  assert.equal(visibleText(msg), 'intro bold\n[table]after linkitem');
  assert.equal(document.getElementById('bold').parentElement, msg);
  assert.equal(document.getElementById('link').parentElement, msg);
  assert.equal(document.getElementById('list').getAttribute('data-mdtable-hidden'), null);
});

test('places the rendered table where the markdown table was', () => {
  const { document, enhancer } = setup(`<div id="msg">before<br>${TABLE_HTML}<br>after</div>`);

  enhancer.scan(document.body);

  const wrapper = document.querySelector('.mdtable-wrapper');
  assert.equal(wrapper.parentElement.id, 'msg');
  assert.equal(wrapper.previousSibling.nodeName, 'BR');
  assert.equal(wrapper.previousSibling.previousSibling.data, 'before');
});

test('splits a text node that holds both prose and table lines', () => {
  const { document, enhancer } = setup('<div id="msg"><span id="t">intro\n| a |\n| - |\n| 1 |\noutro</span></div>');

  enhancer.scan(document.body);

  assert.equal(visibleText(document.getElementById('msg')), 'intro\n[table]outro');
});

test('hides whole elements that only contain table content (e.g. a code block)', () => {
  const { document, enhancer } = setup('<div id="msg"><span>look:</span><pre id="code">| a |\n| - |\n| 1 |</pre></div>');

  enhancer.scan(document.body);

  assert.equal(document.getElementById('code').getAttribute('data-mdtable-hidden'), 'table');
  assert.equal(visibleText(document.getElementById('msg')), 'look:[table]');
});

test('hides per-line block elements of a table', () => {
  const { document, enhancer } = setup('<div id="msg"><div>hi</div><div>| a |</div><div>| - |</div><div>| 1 |</div></div>');

  enhancer.scan(document.body);

  assert.equal(visibleText(document.getElementById('msg')), 'hi[table]');
});

test('renders every table in a message', () => {
  const { document, enhancer } = setup(`<div>${TABLE_HTML}<br>between<br>| x |<br>| - |<br>| 9 |</div>`);

  enhancer.scan(document.body);

  assert.equal(document.querySelectorAll('table.mdtable').length, 2);
});

test('is idempotent: scanning twice renders one table', () => {
  const { document, enhancer } = setup(`<div>${TABLE_HTML}</div>`);

  enhancer.scan(document.body);
  enhancer.scan(document.body);

  assert.equal(document.querySelectorAll('.mdtable-wrapper').length, 1);
});

test('leaves the message composer (contenteditable) alone', () => {
  const { document, enhancer } = setup(`<div contenteditable="true"><span>${TABLE_HTML}</span></div>`);

  enhancer.scan(document.body);

  assert.equal(document.querySelector('.mdtable-wrapper'), null);
});

test('ignores messages without a table', () => {
  const { document, enhancer } = setup('<span>a | b<br>just text</span>');

  enhancer.scan(document.body);

  assert.equal(document.querySelector('.mdtable-wrapper'), null);
});

test('toggle button switches between the rendered table and the original text', () => {
  const { document, enhancer } = setup(`<div id="msg">x<br>${TABLE_HTML}</div>`);
  enhancer.scan(document.body);
  const msg = document.getElementById('msg');
  const button = document.querySelector('.mdtable-toggle');

  button.click();
  assert.equal(visibleText(msg), 'x\n| a | b |\n| --- | --- |\n| 1 | 2 |');
  assert.equal(document.querySelector('.mdtable-scroll').hidden, true);

  button.click();
  assert.equal(visibleText(msg), 'x\n[table]');
  assert.equal(document.querySelector('.mdtable-scroll').hidden, false);
});

test('refresh re-renders when the message text changes (edited message)', () => {
  const { document, enhancer } = setup(`<div id="msg">${TABLE_HTML}</div>`);
  enhancer.scan(document.body);
  const msg = document.getElementById('msg');

  msg.innerHTML = '| x |<br>| - |<br>| 9 |';
  enhancer.refreshAround(msg.firstChild);

  assert.equal(document.querySelectorAll('.mdtable-wrapper').length, 1);
  assert.equal(document.querySelector('table.mdtable th').textContent, 'x');
});

test('refresh is a no-op when only the enhancer itself touched the message', () => {
  const { document, enhancer } = setup(`<div id="msg">${TABLE_HTML}</div>`);
  enhancer.scan(document.body);
  const wrapper = document.querySelector('.mdtable-wrapper');

  assert.equal(enhancer.refreshAround(document.getElementById('msg')), true);
  assert.equal(document.querySelector('.mdtable-wrapper'), wrapper);
});

test('refresh restores the original DOM when the table is edited away', () => {
  const { document, enhancer } = setup('<div id="msg"><span>intro\n| a |\n| - |\n| 1 |</span></div>');
  enhancer.scan(document.body);
  const msg = document.getElementById('msg');
  assert.notEqual(msg.querySelector('.mdtable-source'), null);

  const editedText = msg.querySelector('.mdtable-source').firstChild;
  editedText.data = 'no table';
  enhancer.refreshAround(editedText);

  assert.equal(document.querySelector('.mdtable-wrapper'), null);
  assert.equal(document.querySelector('[data-mdtable-hidden]'), null);
  assert.equal(document.querySelector('.mdtable-source'), null);
  assert.equal(msg.hasAttribute('data-mdtable-container'), false);
});

test('refreshAround reports false for nodes outside processed messages', () => {
  const { document, enhancer } = setup('<span id="other">hi</span>');

  assert.equal(enhancer.refreshAround(document.getElementById('other').firstChild), false);
});

test('releaseWithin removes the rendered tables of a removed message', () => {
  const { document, enhancer } = setup('<div id="bubble"><pre id="code">| a |\n| - |\n| 1 |</pre></div>');
  enhancer.scan(document.body);
  const code = document.getElementById('code');

  code.remove();
  enhancer.releaseWithin(code);

  assert.equal(document.querySelector('.mdtable-wrapper'), null);
});

test('isOwnNode recognises nodes the enhancer inserted', () => {
  const { document, enhancer } = setup(`<div id="msg">${TABLE_HTML}</div>`);
  enhancer.scan(document.body);

  assert.equal(enhancer.isOwnNode(document.querySelector('table.mdtable td')), true);
  assert.equal(enhancer.isOwnNode(document.getElementById('msg')), false);
});

// Sent-message shape from real Chat (2026-11-16): the code block's tool bar (with the
// word-wrap toggle) is a sibling marked exclude-from-clipboard.
const CODE_BLOCK_MESSAGE = '<div id="msg"><article role="code" id="code"><div>| a | b |</div><div>| --- | --- |</div><div>| 1 | 2 |</div></article>'
  + '<div id="tools" exclude-from-clipboard="true"><button aria-label="切換自動換行">wrap</button></div></div>';

test('hides the code block tool bar (word-wrap toggle) while a code block is shown as a table', () => {
  const { document, enhancer } = setup(CODE_BLOCK_MESSAGE);

  enhancer.scan(document.body);
  const tools = document.getElementById('tools');
  assert.equal(tools.getAttribute('data-mdtable-hidden'), 'table');

  document.querySelector('.mdtable-toggle').click();
  assert.equal(tools.getAttribute('data-mdtable-hidden'), 'source', 'the source view gets the tool bar back');

  enhancer.releaseWithin(document.body);
  assert.equal(tools.hasAttribute('data-mdtable-hidden'), false);
});

test('keeps the tool bar when the code block holds more than the table', () => {
  const { document, enhancer } = setup('<div id="msg"><article role="code"><div>npm test</div><div>| a | b |</div><div>| --- | --- |</div>'
    + '<div>| 1 | 2 |</div></article><div id="tools" exclude-from-clipboard="true"><button>wrap</button></div></div>');

  enhancer.scan(document.body);

  assert.equal(document.getElementById('tools').hasAttribute('data-mdtable-hidden'), false);
});
