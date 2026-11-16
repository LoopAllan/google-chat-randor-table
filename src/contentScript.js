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
    tableModel, createTableEditor, createEditorLauncher, parseClipboardGrid, createComposerTableLocator,
    createCodeBlockWriter, createComposerPreview,
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

    const editor = createTableEditor({ doc: document, tableModel, parseGrid: parseClipboardGrid });
    const locator = createComposerTableLocator({ doc: document, mapText, findTables, fromParsed: tableModel.fromParsed });
    const codeBlockWriter = createCodeBlockWriter({ doc: document });
    const launcher = createEditorLauncher({
      doc: document,
      eventTarget: root,
      createInitialTable: () => tableModel.createTable(3, 3),
      locateTable: (composer, caret) => locator.locate(composer, caret),
      openEditor: (initial, options) => editor.open(initial, options),
      toMarkdown: (table, { fenced }) => toMarkdownTable(table.cells, { fenced, align: table.align }),
      insert,
      replaceInCodeBlock: (codeBlock, range, markdown) => codeBlockWriter.replaceLines(codeBlock, range, markdown),
    });
    launcher.start();

    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === OPEN_EDITOR_MESSAGE) {
        launcher.openFromContextMenu().catch((error) => console.error(error));
      }
    });
    return launcher;
  }

  function startComposerPreview(launcher) {
    createComposerPreview({
      doc: document,
      findTables,
      mapText,
      renderTable,
      onEdit: (composer, position) => launcher.editAt(composer, position).catch((error) => console.error(error)),
      MutationObserverImpl: MutationObserver,
      schedule: (callback) => requestAnimationFrame(callback),
    }).start();
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

  const isChat = root.location.hostname === CHAT_HOSTNAME;
  const launcher = isChat ? startComposerFeatures() : null;
  // Both need document.body, which does not exist yet at document_start.
  const startBodyFeatures = () => {
    startRenderer();
    if (launcher !== null) {
      startComposerPreview(launcher);
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startBodyFeatures, { once: true });
  } else {
    startBodyFeatures();
  }

  // The demo pages load this file outside the extension, where chrome.runtime is missing.
  const version = root.chrome?.runtime?.getManifest?.().version ?? 'dev';
  console.debug(`[md-table] v${version} loaded in ${root.location.href}`);
})(globalThis);
