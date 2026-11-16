'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { overlayPlacement } = require('../src/overlayGeometry.js');

const rect = (top, left, bottom, right) => ({ top, left, bottom, right, width: right - left, height: bottom - top });

test('an unclipped block gets the overlay right on top of it', () => {
  assert.deepEqual(overlayPlacement(rect(100, 50, 300, 550), []), {
    visible: true, top: 100, left: 50, width: 500, height: 200, clipPath: 'inset(0px 0px 0px 0px)', toolbarTop: 0,
  });
});

test('a block scrolled partly above the composer is clipped there, with the toolbar at the visible top', () => {
  const placement = overlayPlacement(rect(100, 50, 300, 550), [rect(160, 0, 1000, 1000)]);

  assert.equal(placement.clipPath, 'inset(60px 0px 0px 0px)');
  assert.equal(placement.toolbarTop, 60);
});

test('every clipping ancestor narrows the visible part', () => {
  const placement = overlayPlacement(rect(100, 50, 300, 550), [rect(0, 0, 250, 1000), rect(0, 80, 1000, 500)]);

  assert.equal(placement.clipPath, 'inset(0px 50px 50px 30px)');
});

test('a block scrolled out of view is hidden', () => {
  assert.deepEqual(overlayPlacement(rect(100, 50, 300, 550), [rect(400, 0, 800, 1000)]), { visible: false });
});
