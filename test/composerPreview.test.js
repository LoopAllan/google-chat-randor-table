'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { createComposerPreview } = require('../src/composerPreview.js');
const { findTables } = require('../src/tableParser.js');
const { mapText } = require('../src/textExtractor.js');
const { renderTable } = require('../src/tableRenderer.js');

// Composer shape from real Chat (2026-11-16): <article role="code"> holding one <div> per line.
const TABLE_LINES = '<div>| 欄位 | 數量 |</div><div>| :-- | --: |</div><div>| api-a | 12 |</div>';

function setup(composerHtml) {
  const { window } = new JSDOM(`<!doctype html><body><div id="composer" role="textbox" contenteditable="true">${composerHtml}</div></body>`);
  const { document } = window;
  const edits = [];
  const preview = createComposerPreview({
    doc: document,
    findTables,
    mapText,
    renderTable,
    onEdit: (composer, position) => edits.push({ composer, position }),
    MutationObserverImpl: window.MutationObserver,
    schedule: (callback) => callback(),
  });
  const composer = document.getElementById('composer');
  const previews = () => [...document.querySelectorAll('.mdtable-composer-preview')];
  return { window, document, composer, preview, edits, previews };
}

const click = (window, element) => element.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

test('shows a code block holding a table as a rendered table, outside the editable area', () => {
  const { composer, preview, previews } = setup(`<article role="code">${TABLE_LINES}</article>`);

  preview.refresh();

  assert.equal(previews().length, 1);
  assert.equal(composer.contains(previews()[0]), false, 'the preview must never become message content');
  assert.deepEqual([...previews()[0].querySelectorAll('th')].map((cell) => cell.textContent), ['欄位', '數量']);
  assert.equal(composer.querySelector('article').getAttribute('data-mdtable-preview'), 'table');
});

test('leaves code blocks without a table, and tables outside a code block, alone', () => {
  const { composer, preview, previews } = setup('<article role="code"><div>const a = 1;</div></article>'
    + '<div>| a |</div><div>| - |</div>');

  preview.refresh();

  assert.equal(previews().length, 0);
  assert.equal(composer.querySelector('article').hasAttribute('data-mdtable-preview'), false);
});

test('the edit button opens the editor on that table', () => {
  const { window, composer, preview, edits, previews } = setup(`<article role="code">${TABLE_LINES}</article>`);
  preview.refresh();

  click(window, previews()[0].querySelector('.mdtable-composer-edit'));

  assert.equal(edits.length, 1);
  assert.equal(edits[0].composer, composer);
  assert.equal(edits[0].position.startContainer, composer.querySelector('article div').firstChild);
  assert.equal(edits[0].position.startOffset, 0);
});

test('with several tables, edit opens the one at the top of the visible area', () => {
  const { window, composer, preview, edits, previews } = setup(
    `<article role="code">${TABLE_LINES}<div>note</div><div>| x |</div><div>| - |</div></article>`,
  );
  preview.refresh();
  const items = previews()[0].querySelectorAll('.mdtable-composer-item');
  // The first table has been scrolled above the visible area.
  items[0].getBoundingClientRect = () => ({ top: -80, bottom: -10, left: 0, right: 100, width: 100, height: 70 });
  items[1].getBoundingClientRect = () => ({ top: -5, bottom: 50, left: 0, right: 100, width: 100, height: 55 });

  click(window, previews()[0].querySelector('.mdtable-composer-edit'));

  assert.equal(items.length, 2);
  assert.equal(edits[0].position.startContainer.data, '| x |');
});

test('there is a single toolbar, so the buttons can stay in view however long the table is', () => {
  const { preview, previews } = setup(`<article role="code">${TABLE_LINES}</article>`);

  preview.refresh();

  const toolbar = previews()[0].querySelector('.mdtable-composer-toolbar');
  assert.deepEqual([...toolbar.querySelectorAll('button')].map((b) => b.textContent), ['編輯表格', '顯示原文']);
});

test('clicking the table puts the caret on the line after the code block, so typing keeps working', () => {
  const { window, document, composer, preview, previews } = setup(`<article role="code">${TABLE_LINES}</article><div>after</div>`);
  preview.refresh();

  click(window, previews()[0].querySelector('td'));

  const caret = document.getSelection().getRangeAt(0);
  assert.equal(document.activeElement, composer);
  assert.equal(caret.collapsed, true);
  assert.equal(caret.startContainer, composer.lastChild.firstChild);
  assert.equal(caret.startOffset, 0);
});

test('clicking the table with nothing after the code block puts the caret at its end', () => {
  const { window, document, composer, preview, previews } = setup(`<article role="code">${TABLE_LINES}</article>`);
  preview.refresh();

  click(window, previews()[0].querySelector('td'));

  const caret = document.getSelection().getRangeAt(0);
  const lastLine = composer.querySelector('article').lastChild.firstChild;
  assert.equal(caret.startContainer, lastLine);
  assert.equal(caret.startOffset, lastLine.length);
});

test('vertical wheel over the table scrolls the composer instead of being swallowed', () => {
  const { window, document, preview, previews } = setup(`<article role="code">${TABLE_LINES}</article>`);
  const scroller = document.createElement('div');
  scroller.style.overflowY = 'auto';
  document.body.insertBefore(scroller, document.getElementById('composer'));
  scroller.appendChild(document.getElementById('composer'));
  const scrolled = [];
  scroller.scrollBy = (options) => scrolled.push(options.top);
  preview.refresh();

  const event = new window.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 40 });
  previews()[0].querySelector('td').dispatchEvent(event);
  const sideways = new window.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaX: 40 });
  previews()[0].querySelector('td').dispatchEvent(sideways);

  assert.deepEqual(scrolled, [40]);
  assert.equal(event.defaultPrevented, true);
  assert.equal(sideways.defaultPrevented, false, 'horizontal wheel still scrolls the table itself');
});

test('the source toggle reveals the markdown and can switch back', () => {
  const { window, composer, preview, previews } = setup(`<article role="code">${TABLE_LINES}</article>`);
  preview.refresh();
  const block = composer.querySelector('article');
  const toggle = previews()[0].querySelector('.mdtable-toggle');

  click(window, toggle);
  assert.equal(block.getAttribute('data-mdtable-preview'), 'source');
  assert.equal(toggle.textContent, '顯示表格');

  click(window, toggle);
  assert.equal(block.getAttribute('data-mdtable-preview'), 'table');
  assert.equal(toggle.textContent, '顯示原文');
});

test('follows edits: re-renders when the table text changes and cleans up when it is gone', async () => {
  const { composer, preview, previews } = setup(`<article role="code">${TABLE_LINES}</article>`);
  preview.start();
  const block = composer.querySelector('article');

  block.lastChild.textContent = '| api-b | 340 |';
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(previews()[0].querySelector('td').textContent, 'api-b');

  block.remove();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(previews().length, 0);
  preview.stop();
});

test('keeps the source view chosen by the user while the table is being edited', () => {
  const { window, composer, preview, previews } = setup(`<article role="code">${TABLE_LINES}</article>`);
  preview.refresh();
  click(window, previews()[0].querySelector('.mdtable-toggle'));

  composer.querySelector('article').lastChild.textContent = '| api-b | 340 |';
  preview.refresh();

  assert.equal(composer.querySelector('article').getAttribute('data-mdtable-preview'), 'source');
});

test('the preview element does not carry the code block state attribute (which hides text)', () => {
  const { preview, previews } = setup(`<article role="code">${TABLE_LINES}</article>`);

  preview.refresh();

  assert.equal(previews()[0].hasAttribute('data-mdtable-preview'), false);
  assert.equal(previews()[0].getAttribute('data-mdtable-state'), 'table');
});

test('never writes inline styles on Chat\'s code block: the height goes into our own stylesheet', () => {
  const { document, composer, preview } = setup(`<article role="code">${TABLE_LINES}</article>`);

  preview.refresh();

  const block = composer.querySelector('article');
  const id = block.getAttribute('data-mdtable-id');
  assert.equal(block.hasAttribute('style'), false);
  assert.match(document.querySelector('style[data-mdtable-preview-heights]').textContent, new RegExp(`\\[data-mdtable-id="${id}"\\]`));
});

test('scrolling does not touch the code block at all (Chat reacts to its DOM changing)', async () => {
  const { window, composer, preview } = setup(`<article role="code">${TABLE_LINES}</article>`);
  preview.start();
  const records = [];
  const watcher = new window.MutationObserver((list) => records.push(...list));
  watcher.observe(composer, { attributes: true, subtree: true, childList: true, characterData: true });

  window.dispatchEvent(new window.Event('scroll'));
  window.dispatchEvent(new window.Event('resize'));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(records.map((record) => `${record.type}:${record.attributeName}`), []);
  watcher.disconnect();
  preview.stop();
});

test('a scroll right after Chat removes the code block (e.g. on send) drops the preview instead of throwing', () => {
  const { window, composer, preview, previews } = setup(`<article role="code">${TABLE_LINES}</article>`);
  preview.start();

  // Synchronously, before the MutationObserver callback runs.
  composer.querySelector('article').remove();
  window.dispatchEvent(new window.Event('scroll'));

  assert.equal(previews().length, 0);
  preview.stop();
});
