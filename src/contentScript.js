'use strict';

/**
 * Entry point: wires the modules (loaded before this file by the manifest) to the live page.
 * Runs at document_start so our window capture listeners are registered before
 * Chat's own, which may stop keydown / contextmenu propagation.
 */
(function (root) {
  const {
    createMessageEnhancer, createTableWatcher, findTables, mapText, renderTable,
    createPasteConverter, tableFromClipboard, toMarkdownTable, createComposerInserter, browserStrategies,
    tableModel, createTableEditor, createEditorLauncher,
  } = root.MdTable;
  // Gmail's own compose window supports real HTML tables, so only Chat frames get composer features.
  const CHAT_HOSTNAME = 'chat.google.com';
  const OPEN_EDITOR_MESSAGE = 'mdtable:open-editor';

  function startComposerFeatures() {
    const inserter = createComposerInserter(browserStrategies(document));
    const insert = (composer, text) => inserter.insert(composer, text);

    createPasteConverter({
      doc: document,
      eventTarget: root,
      tableFromClipboard,
      toMarkdown: (rows) => toMarkdownTable(rows, { fenced: true }),
      insert,
    }).start();

    const editor = createTableEditor({ doc: document, tableModel });
    const launcher = createEditorLauncher({
      doc: document,
      eventTarget: root,
      createInitialTable: () => tableModel.createTable(3, 3),
      openEditor: (initial) => editor.open(initial),
      toMarkdown: (table) => toMarkdownTable(table.cells, { fenced: true, align: table.align }),
      insert,
    });
    launcher.start();

    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === OPEN_EDITOR_MESSAGE) {
        launcher.openFromContextMenu().catch((error) => console.error(error));
      }
    });
  }

  function startRenderer() {
    const enhancer = createMessageEnhancer({ findTables, mapText, renderTable, doc: document });
    createTableWatcher({
      root: document.body,
      enhancer,
      MutationObserverImpl: MutationObserver,
      schedule: (callback) => requestAnimationFrame(callback),
    }).start();
  }

  if (root.location.hostname === CHAT_HOSTNAME) {
    startComposerFeatures();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startRenderer, { once: true });
  } else {
    startRenderer();
  }

  // The demo pages load this file outside the extension, where chrome.runtime is missing.
  const version = root.chrome?.runtime?.getManifest?.().version ?? 'dev';
  console.debug(`[md-table] v${version} loaded in ${root.location.href}`);
})(globalThis);
