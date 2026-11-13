'use strict';

/** Entry point: wires the modules (loaded before this file by the manifest) to the live page. */
(function (root) {
  const { createMessageEnhancer, createTableWatcher, findTables, mapText, renderTable } = root.MdTable;

  if (document.body === null) {
    throw new Error('[md-table] content script ran before <body> existed; check run_at in manifest.json');
  }

  const enhancer = createMessageEnhancer({
    findTables,
    mapText,
    renderTable,
    doc: document,
  });

  createTableWatcher({
    root: document.body,
    enhancer,
    MutationObserverImpl: MutationObserver,
    schedule: (callback) => requestAnimationFrame(callback),
  }).start();
})(globalThis);
