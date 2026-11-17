'use strict';

/**
 * Entry point: wires the modules (loaded before this file by the manifest) to the live page.
 * Runs at document_start so our window capture listeners are registered before
 * Chat's own, which may stop keydown / contextmenu propagation.
 */
(function (root) {
  const {
    createMessageEnhancer, createTableWatcher, findTables, mapText, textLeafAt, renderTable, overlayPlacement,
    createPasteConverter, createClipboardReader, createHtmlTableReader, toMarkdownTable, createComposerInserter, browserStrategies,
    tableModel, createTableEditor, createEditorLauncher, createComposerTableLocator,
    createCodeBlockWriter, createComposerPreview, renderInline, applyShortcut, createCellEditing,
  } = root.MdTable;
  const renderFormattedTable = (table, doc) => renderTable(table, doc, { renderCell: renderInline });
  // Gmail's own compose window supports real HTML tables, so only Chat frames get composer features.
  const CHAT_HOSTNAME = 'chat.google.com';
  const OPEN_EDITOR_MESSAGE = 'mdtable:open-editor';

  function startComposerFeatures() {
    const inserter = createComposerInserter(browserStrategies(document));
    const insert = (composer, text) => inserter.insert(composer, text);

    // DOMParser documents are inert: no scripts run and nothing is fetched.
    const { readHtmlTable, readCell } = createHtmlTableReader({ parseHtml: (html) => new DOMParser().parseFromString(html, 'text/html') });
    const clipboardReader = createClipboardReader({ readHtmlTable, findTables, fromParsed: tableModel.fromParsed });
    const writeTable = (table, { fenced }) => toMarkdownTable(table.cells, { fenced, align: table.align });

    createPasteConverter({
      doc: document,
      eventTarget: root,
      tableFromClipboard: (clipboard) => clipboardReader.tableFromClipboard(clipboard),
      toMarkdown: writeTable,
      insert,
    }).start();

    const editor = createTableEditor({ doc: document, tableModel, readGrid: (clipboard) => clipboardReader.gridFromClipboard(clipboard) });
    const locator = createComposerTableLocator({ doc: document, mapText, textLeafAt, findTables, fromParsed: tableModel.fromParsed });
    const codeBlockWriter = createCodeBlockWriter({ doc: document });
    const launcher = createEditorLauncher({
      doc: document,
      eventTarget: root,
      createInitialTable: () => tableModel.createTable(3, 3),
      locateTable: (composer, caret) => locator.locate(composer, caret),
      openEditor: (initial, options) => editor.open(initial, options),
      toMarkdown: writeTable,
      insert,
      replaceInCodeBlock: (codeBlock, range, markdown) => codeBlockWriter.replaceLines(codeBlock, range, markdown),
    });
    launcher.start();

    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === OPEN_EDITOR_MESSAGE) {
        launcher.openFromContextMenu().catch((error) => console.error(error));
      }
    });

    const cellEditing = {
      editing: createCellEditing({ doc: document, applyShortcut, renderInline, readCell }),
      toCells: tableModel.fromParsed,
      setCell: tableModel.setCell,
      toMarkdown: (table) => writeTable(table, { fenced: false }),
      // Focus stays in the cell being edited.
      replaceInCodeBlock: (codeBlock, range, markdown) => codeBlockWriter.replaceLines(codeBlock, range, markdown, { moveCaret: false }),
    };
    return { launcher, cellEditing };
  }

  function startComposerPreview({ launcher, cellEditing }) {
    createComposerPreview({
      doc: document,
      findTables,
      mapText,
      textLeafAt,
      overlayPlacement,
      renderTable: renderFormattedTable,
      onEdit: (composer, position) => launcher.editAt(composer, position).catch((error) => console.error(error)),
      cellEditing,
      MutationObserverImpl: MutationObserver,
      ResizeObserverImpl: ResizeObserver,
      schedule: (callback) => requestAnimationFrame(callback),
    }).start();
  }

  function startRenderer() {
    const enhancer = createMessageEnhancer({ findTables, mapText, renderTable: renderFormattedTable, doc: document });
    createTableWatcher({
      root: document.body,
      enhancer,
      MutationObserverImpl: MutationObserver,
      schedule: (callback) => requestAnimationFrame(callback),
    }).start();
  }

  const isChat = root.location.hostname === CHAT_HOSTNAME;
  const composerFeatures = isChat ? startComposerFeatures() : null;
  // Both need document.body, which does not exist yet at document_start.
  const startBodyFeatures = () => {
    startRenderer();
    if (composerFeatures !== null) {
      startComposerPreview(composerFeatures);
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
