'use strict';

/**
 * Opens the table editor for a composer (shortcut or context menu) and puts
 * the result back where the caret was. The editor steals focus and the
 * selection, so the caret range is saved before opening and restored before
 * inserting.
 */
(function (root) {
  const EDITABLE_SELECTOR = '[contenteditable]:not([contenteditable="false"])';

  function isShortcut(event) {
    return event.altKey && event.shiftKey && !event.metaKey && !event.ctrlKey && event.code === 'KeyT';
  }

  /**
   * eventTarget should be window: its capture phase runs before the page's
   * document-level handlers, which may stop keydown / contextmenu propagation.
   */
  function createEditorLauncher({ doc, eventTarget = doc, createInitialTable, openEditor, toMarkdown, insert }) {
    let contextMenuTarget = null;

    function editableFrom(target) {
      return target !== null && target.nodeType === 1 ? target.closest(EDITABLE_SELECTOR) : null;
    }

    function saveCaret(composer) {
      const selection = doc.getSelection();
      if (selection === null || selection.rangeCount === 0) {
        return null;
      }
      const range = selection.getRangeAt(0);
      return composer.contains(range.startContainer) ? range.cloneRange() : null;
    }

    function restoreCaret(composer, range) {
      composer.focus();
      if (range === null) {
        return;
      }
      const selection = doc.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }

    async function openFor(composer) {
      const caret = saveCaret(composer);
      const table = await openEditor(createInitialTable());
      restoreCaret(composer, caret);
      if (table !== null) {
        insert(composer, toMarkdown(table));
      }
    }

    function onKeydown(event) {
      if (!isShortcut(event)) {
        return;
      }
      const composer = editableFrom(event.target);
      if (composer === null) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      openFor(composer);
    }

    function onContextMenu(event) {
      contextMenuTarget = editableFrom(event.target);
    }

    /** Right-clicked editable if we saw the event, otherwise the focused one (right-click focuses it). */
    function openFromContextMenu() {
      const composer = contextMenuTarget !== null && contextMenuTarget.isConnected
        ? contextMenuTarget
        : editableFrom(doc.activeElement);
      if (composer === null) {
        return Promise.reject(new Error('[md-table] no composer was right-clicked or focused in this frame; cannot open the table editor'));
      }
      return openFor(composer);
    }

    return {
      start() {
        eventTarget.addEventListener('keydown', onKeydown, true);
        eventTarget.addEventListener('contextmenu', onContextMenu, true);
      },
      stop() {
        eventTarget.removeEventListener('keydown', onKeydown, true);
        eventTarget.removeEventListener('contextmenu', onContextMenu, true);
      },
      openFromContextMenu,
    };
  }

  const api = { createEditorLauncher };
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.MdTable = Object.assign(root.MdTable || {}, api);
  }
})(globalThis);
