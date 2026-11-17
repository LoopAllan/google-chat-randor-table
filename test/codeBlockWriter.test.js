'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { createCodeBlockWriter } = require('../src/codeBlockWriter.js');

// Composer shape from real Chat (2026-11-16): <article role="code"> holding one <div> per line.
function setup(articleHtml) {
  const { window } = new JSDOM(`<!doctype html><body><div id="composer" role="textbox" contenteditable="true">${articleHtml}<div>after</div></div></body>`);
  const { document } = window;
  const composer = document.getElementById('composer');
  const codeBlock = composer.querySelector('article');
  const inputs = [];
  composer.addEventListener('input', (event) => inputs.push(event.inputType));
  const writer = createCodeBlockWriter({ doc: document });
  const rangeOver = (startNode, startOffset, endNode, endOffset) => {
    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    return range;
  };
  return { document, composer, codeBlock, inputs, writer, rangeOver };
}

const linesOf = (codeBlock) => [...codeBlock.childNodes].map((node) => `${node.nodeName}:${node.textContent}`);

test('replaces the table lines with one <div> per new line and tells Chat the content changed', () => {
  const { codeBlock, inputs, writer, rangeOver } = setup('<article role="code"><div>| a |</div><div>| - |</div><div>| 1 |</div></article>');
  const lines = codeBlock.querySelectorAll('div');

  writer.replaceLines(codeBlock, rangeOver(lines[0].firstChild, 0, lines[2].firstChild, 5), '| x | y |\n| - | - |\n| 1 | 2 |');

  assert.deepEqual(linesOf(codeBlock), ['DIV:| x | y |', 'DIV:| - | - |', 'DIV:| 1 | 2 |']);
  assert.deepEqual(inputs, ['insertReplacementText']);
});

test('keeps other lines of the code block untouched', () => {
  const { codeBlock, writer, rangeOver } = setup('<article role="code"><div>before</div><div>| a |</div><div>| - |</div><div>tail</div></article>');
  const lines = codeBlock.querySelectorAll('div');

  writer.replaceLines(codeBlock, rangeOver(lines[1].firstChild, 0, lines[2].firstChild, 5), '| b |\n| - |');

  assert.deepEqual(linesOf(codeBlock), ['DIV:before', 'DIV:| b |', 'DIV:| - |', 'DIV:tail']);
});

test('repairs a line left as bare text directly inside the code block', () => {
  const { codeBlock, writer, rangeOver } = setup('<article role="code"><div>| a |</div><div>| - |</div>| 1 |</article>');
  const first = codeBlock.firstChild.firstChild;

  writer.replaceLines(codeBlock, rangeOver(first, 0, codeBlock.lastChild, 5), '| a |\n| - |\n| 1 |');

  assert.deepEqual(linesOf(codeBlock), ['DIV:| a |', 'DIV:| - |', 'DIV:| 1 |']);
});

test('leaves the caret at the end of the new table', () => {
  const { document, composer, codeBlock, writer, rangeOver } = setup('<article role="code"><div>| a |</div><div>| - |</div></article>');
  const lines = codeBlock.querySelectorAll('div');

  writer.replaceLines(codeBlock, rangeOver(lines[0].firstChild, 0, lines[1].firstChild, 5), '| b |\n| - |');

  const caret = document.getSelection().getRangeAt(0);
  assert.equal(caret.collapsed, true);
  assert.equal(caret.startContainer, codeBlock.lastChild.firstChild);
  assert.equal(caret.startOffset, '| - |'.length);
  assert.equal(document.activeElement, composer);
});

test('refuses a range that is not inside the code block', () => {
  const { composer, codeBlock, writer, rangeOver } = setup('<article role="code"><div>| a |</div></article>');
  const outside = composer.lastChild.firstChild;

  assert.throws(() => writer.replaceLines(codeBlock, rangeOver(outside, 0, outside, 1), '| b |'), /not inside the code block/);
});

test('with moveCaret false, leaves focus and selection where they are (an edited preview cell)', () => {
  const { document, codeBlock, inputs, writer, rangeOver } = setup('<article role="code"><div>| a |</div><div>| - |</div></article>');
  const cell = document.createElement('div');
  cell.setAttribute('contenteditable', 'true');
  cell.textContent = 'typing';
  document.body.appendChild(cell);
  cell.focus();
  const lines = codeBlock.querySelectorAll('div');

  writer.replaceLines(codeBlock, rangeOver(lines[0].firstChild, 0, lines[1].firstChild, 5), '| b |\n| - |', { moveCaret: false });

  assert.deepEqual(linesOf(codeBlock), ['DIV:| b |', 'DIV:| - |']);
  assert.deepEqual(inputs, ['insertReplacementText']);
  assert.equal(document.activeElement, cell);
});
