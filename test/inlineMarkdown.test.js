'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { renderInline } = require('../src/inlineMarkdown.js');

const { document } = new JSDOM('<!doctype html><body></body>').window;

/** Serialises the rendered fragment so expectations read like the HTML a user gets. */
function html(source) {
  const container = document.createElement('div');
  container.appendChild(renderInline(source, document));
  return container.innerHTML;
}

test('plain text stays plain text', () => {
  assert.equal(html('api-a 12'), 'api-a 12');
});

test('bold, italic and strikethrough', () => {
  assert.equal(html('**順序**'), '<strong>順序</strong>');
  assert.equal(html('__粗__ and *斜* and _也斜_'), '<strong>粗</strong> and <em>斜</em> and <em>也斜</em>');
  assert.equal(html('~~刪除~~ ~單~'), '<del>刪除</del> <del>單</del>');
  assert.equal(html('***都有***'), '<strong><em>都有</em></strong>');
});

test('formatting nests', () => {
  assert.equal(html('**粗 *斜* 粗**'), '<strong>粗 <em>斜</em> 粗</strong>');
});

test('underscores inside words and lone asterisks are not emphasis', () => {
  assert.equal(html('snake_case_name'), 'snake_case_name');
  assert.equal(html('2 * 3 * 4'), '2 * 3 * 4');
  assert.equal(html('**not closed'), '**not closed');
});

test('inline code keeps its content literal', () => {
  assert.equal(html('run `npm **test**` now'), 'run <code>npm **test**</code> now');
  assert.equal(html('``a `b` c``'), '<code>a `b` c</code>');
});

test('line breaks: <br> in its common spellings', () => {
  assert.equal(html('a<br>b<br/>c<BR />d'), 'a<br>b<br>c<br>d');
});

test('links and bare URLs open in a new tab', () => {
  assert.equal(html('[PR](https://github.com/x/y/pull/1)'),
    '<a href="https://github.com/x/y/pull/1" target="_blank" rel="noopener noreferrer">PR</a>');
  assert.equal(html('see https://example.com/a?b=1.'),
    'see <a href="https://example.com/a?b=1" target="_blank" rel="noopener noreferrer">https://example.com/a?b=1</a>.');
  assert.equal(html('<https://example.com>'),
    '<a href="https://example.com/" target="_blank" rel="noopener noreferrer">https://example.com</a>');
  assert.equal(html('[**粗**連結](https://a.tw)'),
    '<a href="https://a.tw/" target="_blank" rel="noopener noreferrer"><strong>粗</strong>連結</a>');
});

test('a bare URL leaves a sentence parenthesis outside but keeps its own', () => {
  assert.equal(html('(見 https://a.tw/x)'),
    '(見 <a href="https://a.tw/x" target="_blank" rel="noopener noreferrer">https://a.tw/x</a>)');
  assert.equal(html('https://en.wikipedia.org/wiki/A_(b)'),
    '<a href="https://en.wikipedia.org/wiki/A_(b)" target="_blank" rel="noopener noreferrer">https://en.wikipedia.org/wiki/A_(b)</a>');
});

test('backslash escapes make markdown characters literal', () => {
  assert.equal(html('\\*not em\\*'), '*not em*');
});

test('never lets message text become HTML or a script URL', () => {
  assert.equal(html('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(html('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(html('[click](javascript:alert(1))'), '[click](javascript:alert(1))');
  assert.equal(html('[x](data:text/html,hi)'), '[x](data:text/html,hi)');
});
