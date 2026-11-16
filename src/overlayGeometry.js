'use strict';

/**
 * Where to put an overlay laid over an element that may be scrolled partly out
 * of its clipping ancestors. Pure, so the composer preview's geometry is
 * unit-tested without a layout engine.
 */
(function (root) {
  /**
   * @param box the element's client rect ({ top, left, bottom, right, width, height })
   * @param clips client rects of ancestors that clip overflow (e.g. the scrolling composer)
   * @returns {{ visible: false } | { visible: true, top, left, width, height, clipPath, toolbarTop }}
   */
  function overlayPlacement(box, clips) {
    const visible = clips.reduce((area, clip) => ({
      top: Math.max(area.top, clip.top),
      left: Math.max(area.left, clip.left),
      bottom: Math.min(area.bottom, clip.bottom),
      right: Math.min(area.right, clip.right),
    }), { top: box.top, left: box.left, bottom: box.bottom, right: box.right });
    if (visible.bottom <= visible.top || visible.right <= visible.left) {
      return { visible: false };
    }
    const inset = {
      top: visible.top - box.top,
      right: box.right - visible.right,
      bottom: box.bottom - visible.bottom,
      left: visible.left - box.left,
    };
    return {
      visible: true,
      top: box.top,
      left: box.left,
      width: box.width,
      height: box.height,
      clipPath: `inset(${inset.top}px ${inset.right}px ${inset.bottom}px ${inset.left}px)`,
      // The toolbar sticks to the top of the visible part, so long tables keep it reachable.
      toolbarTop: inset.top,
    };
  }

  const api = { overlayPlacement };
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.MdTable = Object.assign(root.MdTable || {}, api);
  }
})(globalThis);
