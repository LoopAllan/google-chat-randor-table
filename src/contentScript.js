'use strict';

/** Entry point: wires the modules (loaded before this file by the manifest) to the live page. */
(function (root) {
  const {
    createMessageEnhancer, createTableWatcher, findTables, mapText, renderTable,
    createPasteConverter, tableFromClipboard, toMarkdownTable, createComposerInserter, browserStrategies,
  } = root.MdTable;
  // Gmail's own compose window supports real HTML tables, so only Chat frames convert pastes.
  const CHAT_HOSTNAME = 'chat.google.com';

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

  if (root.location.hostname === CHAT_HOSTNAME) {
    const inserter = createComposerInserter(browserStrategies(document));
    createPasteConverter({
      doc: document,
      tableFromClipboard,
      toMarkdown: (rows) => toMarkdownTable(rows, { fenced: true }),
      insert: (composer, text) => inserter.insert(composer, text),
    }).start();
  }
})(globalThis);
