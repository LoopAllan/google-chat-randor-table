'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { createHtmlTableReader } = require('../src/htmlTable.js');

const { readHtmlTable } = createHtmlTableReader({ parseHtml: (html) => new JSDOM(html).window.document });
const table = (rowsHtml) => `<meta charset="utf-8"><table><tbody>${rowsHtml}</tbody></table>`;

test('reads the cells of the first table', () => {
  assert.deepEqual(readHtmlTable(table('<tr><th>a</th><th>b</th></tr><tr><td>1</td><td>2</td></tr>')), [['a', 'b'], ['1', '2']]);
});

test('returns null when the HTML has no table', () => {
  assert.equal(readHtmlTable('<p>hello</p>'), null);
  assert.equal(readHtmlTable(''), null);
});

test('turns text formatting into markdown', () => {
  const rows = readHtmlTable(table('<tr><td><strong>粗</strong> <b>也粗</b></td><td><em>斜</em> <i>也斜</i></td>'
    + '<td><s>刪</s> <del>也刪</del></td><td><code>npm test</code></td></tr>'));

  assert.deepEqual(rows, [['**粗** **也粗**', '*斜* *也斜*', '~~刪~~ ~~也刪~~', '`npm test`']]);
});

test('reads bold / italic / strikethrough set through inline styles (Google Sheets)', () => {
  const rows = readHtmlTable(table('<tr><td style="font-weight:bold">總計</td>'
    + '<td><span style="font-weight:700">粗</span></td><td><span style="font-style:italic">斜</span></td>'
    + '<td><span style="text-decoration:line-through">刪</span></td><td><span style="font-weight:400">平</span></td></tr>'));

  assert.deepEqual(rows, [['**總計**', '**粗**', '*斜*', '~~刪~~', '平']]);
});

test('turns links into markdown links, or a bare URL when the text is the URL', () => {
  const rows = readHtmlTable(table('<tr><td><a href="https://a.tw/pr/1">PR</a></td>'
    + '<td><a href="https://github.com/104corp/104vip-apps/pull/2754">https://github.com/104corp/104vip-apps/pull/2754</a></td>'
    + '<td><a href="javascript:alert(1)">bad</a></td></tr>'));

  assert.deepEqual(rows, [['[PR](https://a.tw/pr/1)', 'https://github.com/104corp/104vip-apps/pull/2754', 'bad']]);
});

test('keeps line breaks, paragraphs and lists inside a cell as <br> lines (Notion)', () => {
  const rows = readHtmlTable(table('<tr><td>[後端] 合併 pr<ul><li>訂單</li><li>網進</li></ul></td>'
    + '<td><p>第一段</p><p>第二段</p></td><td>a<br>b</td><td><ol><li>一</li><li>二</li></ol></td></tr>'));

  assert.deepEqual(rows, [['[後端] 合併 pr<br>• 訂單<br>• 網進', '第一段<br>第二段', 'a<br>b', '1. 一<br>2. 二']]);
});

test('collapses HTML whitespace like a browser does', () => {
  assert.deepEqual(readHtmlTable(table('<tr><td>\n   hello \n  world  </td><td>  </td></tr>')), [['hello world', '']]);
});

test('escapes characters that would otherwise turn plain text into markdown formatting', () => {
  assert.deepEqual(readHtmlTable(table('<tr><td>2*3*4</td><td>a `b` ~c~</td></tr>')), [['2\\*3\\*4', 'a \\`b\\` \\~c\\~']]);
});

test('spreads merged cells so the columns still line up', () => {
  const rows = readHtmlTable(table('<tr><td colspan="2">ab</td><td rowspan="2">c</td></tr><tr><td>1</td><td>2</td></tr>'));

  assert.deepEqual(rows, [['ab', '', 'c'], ['1', '2', '']]);
});

test('ignores styles, scripts and the Google Sheets wrapper', () => {
  const html = '<google-sheets-html-origin><style>td{color:red}</style><table><colgroup><col></colgroup>'
    + '<tbody><tr><td>a<script>x()</script></td><td>b</td></tr></tbody></table></google-sheets-html-origin>';

  assert.deepEqual(readHtmlTable(html), [['a', 'b']]);
});

test('a link whose href is not a URL keeps only its text', () => {
  assert.deepEqual(readHtmlTable(table('<tr><td><a href="not a url">文件</a></td><td>x</td></tr>')), [['文件', 'x']]);
});

test('a cell merged down the first column pushes the next row\'s cells to the right', () => {
  assert.deepEqual(readHtmlTable(table('<tr><td rowspan="2">a</td><td>b</td></tr><tr><td>c</td></tr>')), [['a', 'b'], ['', 'c']]);
});
