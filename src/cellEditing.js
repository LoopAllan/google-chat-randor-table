'use strict';

/**
 * Makes the cells of a rendered table editable as text, with markdown
 * shortcuts, and reports each edited cell back as markdown.
 *
 * Cells are contenteditable="plaintext-only": the browser inserts plain text
 * only (no ⌘B, no rich paste), while the formatting elements built by the
 * shortcuts stay editable. Keys are kept from Chat's page handlers.
 *
 * Changes are reported at most once per pause while typing (so the composer
 * stays close to what is shown when Send is clicked) and at once when a cell
 * loses focus. Nothing is reported mid-composition (IME), where the text is
 * not final yet.
 */
(function (root) {
  const { CARET_SPACER } = typeof module === 'object' && module.exports ? require('./markdownShortcuts.js') : root.MdTable;
  const COMMIT_PAUSE_MS = 300;
  const CELL_SELECTOR = 'th, td';
  /** Deleting or undoing back to a closing marker is not typing it: no shortcut then. */
  const NOT_TYPING = /^(delete|history)/;
  /** Spreadsheet-style: up / down always move a row; left / right move a column only from the edge of the text. */
  const ROW_STEPS = { ArrowUp: -1, ArrowDown: 1 };
  const COLUMN_STEPS = { ArrowLeft: -1, ArrowRight: 1 };

  /**
   * @param applyShortcut markdownShortcuts.applyShortcut
   * @param renderInline inlineMarkdown.renderInline (decides what a shortcut renders to)
   * @param readCell htmlTable's readCell: cell element -> markdown
   */
  function createCellEditing({
    doc, applyShortcut, renderInline, readCell,
    delay = (callback) => setTimeout(callback, COMMIT_PAUSE_MS),
  }) {
    function placeCaret(node, offset) {
      const range = doc.createRange();
      range.setStart(node, offset);
      range.collapse(true);
      const selection = doc.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }

    /** Focuses cell with the caret at its start or (by default) its end. */
    function focusCell(cell, edge = 'end') {
      cell.focus();
      placeCaret(cell, edge === 'start' ? 0 : cell.childNodes.length);
    }

    /** Whether nothing but the caret spacer lies between the caret and the cell's start (step -1) or end (step 1). */
    function caretAtEdge(cell, step) {
      const selection = doc.getSelection();
      if (selection === null || selection.rangeCount === 0 || !selection.isCollapsed) {
        return false;
      }
      const caret = selection.getRangeAt(0);
      const range = doc.createRange();
      if (step < 0) {
        range.setStart(cell, 0);
        range.setEnd(caret.startContainer, caret.startOffset);
      } else {
        range.setStart(caret.startContainer, caret.startOffset);
        range.setEnd(cell, cell.childNodes.length);
      }
      return range.toString().replaceAll(CARET_SPACER, '') === '';
    }

    /** Replaces the selection with nodes and puts the caret after them. */
    function insertAtCaret(nodes) {
      const selection = doc.getSelection();
      if (selection === null || selection.rangeCount === 0 || nodes.length === 0) {
        return;
      }
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const fragment = doc.createDocumentFragment();
      fragment.append(...nodes);
      range.insertNode(fragment);
      const last = nodes[nodes.length - 1];
      placeCaret(last.parentNode, [...last.parentNode.childNodes].indexOf(last) + 1);
    }

    /** Text lines with a <br> between them; a trailing spacer lets the caret sit on a new empty line. */
    function linesToNodes(lines) {
      const nodes = lines.flatMap((line, index) => (index === 0 ? [] : [doc.createElement('br')])
        .concat(line === '' ? [] : [doc.createTextNode(line)]));
      if (nodes.length > 0 && nodes[nodes.length - 1].nodeName === 'BR') {
        nodes.push(doc.createTextNode(CARET_SPACER));
      }
      return nodes;
    }

    function runShortcut() {
      const selection = doc.getSelection();
      if (selection === null || selection.rangeCount === 0 || !selection.isCollapsed) {
        return;
      }
      const { startContainer, startOffset } = selection.getRangeAt(0);
      if (startContainer.nodeType !== 3) {
        return;
      }
      const caret = applyShortcut(startContainer, startOffset, renderInline);
      if (caret !== null) {
        placeCaret(caret.node, caret.offset);
      }
    }

    /**
     * @param table the rendered <table>
     * @param handlers onChange(row, column, markdown) with row 0 the header; onInput() after any edit
     *   (the table may have changed size); onLeave('before' | 'after') when the user leaves the table by
     *   keyboard, above its first row or below its last; onSubmit() on ⌘/Ctrl+Enter, once every edit is reported
     */
    function attach(table, { onChange, onInput, onLeave, onSubmit }) {
      const rows = [...table.querySelectorAll('tr')];
      const dirty = new Set();
      let composing = false;
      let pending = false;

      const cellOf = (target) => (target.nodeType === 1 ? target : target.parentElement)?.closest(CELL_SELECTOR) ?? null;
      const positionOf = (cell) => ({ row: rows.indexOf(cell.parentElement), column: cell.cellIndex });

      function flush() {
        if (composing) {
          return;
        }
        dirty.forEach((cell) => {
          const { row, column } = positionOf(cell);
          onChange(row, column, readCell(cell));
        });
        dirty.clear();
      }

      function changed(cell) {
        dirty.add(cell);
        onInput();
        if (!pending) {
          pending = true;
          delay(() => {
            pending = false;
            flush();
          });
        }
      }

      /** Moves a row up or down; past the first or last row the user leaves the table. */
      function moveRow(cell, step) {
        const { row, column } = positionOf(cell);
        const target = rows[row + step]?.cells[column];
        if (target === undefined) {
          onLeave(step < 0 ? 'before' : 'after');
        } else {
          focusCell(target);
        }
      }

      function moveTab(cell, step) {
        const cells = [...table.querySelectorAll(CELL_SELECTOR)];
        const target = cells[cells.indexOf(cell) + step];
        if (target !== undefined) {
          focusCell(target);
        }
      }

      /** Handles an arrow key; false leaves it to the browser (moving the caret within the text). */
      function onArrow(cell, event) {
        if (event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) {
          return false;
        }
        if (event.key in ROW_STEPS) {
          moveRow(cell, ROW_STEPS[event.key]);
          return true;
        }
        const step = COLUMN_STEPS[event.key];
        const { row, column } = positionOf(cell);
        const target = rows[row].cells[column + step];
        if (target === undefined || !caretAtEdge(cell, step)) {
          return false;
        }
        // Land on the near edge, so holding the key keeps walking across the row.
        focusCell(target, step > 0 ? 'start' : 'end');
        return true;
      }

      function onKeydown(event) {
        // Chat's own shortcuts must not act on what is typed here.
        event.stopPropagation();
        const cell = cellOf(event.target);
        if (cell === null || event.isComposing || composing) {
          return;
        }
        let handled = true;
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          flush();
          onSubmit();
        } else if (event.key === 'Enter' && event.shiftKey) {
          insertAtCaret(linesToNodes(['', '']));
          changed(cell);
        } else if (event.key === 'Enter') {
          moveRow(cell, 1);
        } else if (event.key === 'Tab') {
          moveTab(cell, event.shiftKey ? -1 : 1);
        } else if (event.key === 'Escape') {
          onLeave('after');
        } else if (event.key in ROW_STEPS || event.key in COLUMN_STEPS) {
          handled = onArrow(cell, event);
        } else {
          handled = false;
        }
        if (handled) {
          event.preventDefault();
        }
      }

      function onPaste(event) {
        event.stopPropagation();
        const cell = cellOf(event.target);
        if (cell === null || event.clipboardData === null) {
          return;
        }
        event.preventDefault();
        insertAtCaret(linesToNodes(event.clipboardData.getData('text/plain').split(/\r?\n/)));
        changed(cell);
      }

      function onTyped(event) {
        const cell = cellOf(event.target);
        if (cell === null) {
          return;
        }
        if (!NOT_TYPING.test(event.inputType ?? '')) {
          runShortcut();
        }
        changed(cell);
      }

      table.querySelectorAll(CELL_SELECTOR).forEach((cell) => cell.setAttribute('contenteditable', 'plaintext-only'));
      table.addEventListener('keydown', onKeydown);
      table.addEventListener('paste', onPaste);
      table.addEventListener('input', (event) => {
        if (!event.isComposing && !composing) {
          onTyped(event);
        }
      });
      table.addEventListener('compositionstart', () => {
        composing = true;
      });
      table.addEventListener('compositionend', (event) => {
        composing = false;
        onTyped(event);
      });
      table.addEventListener('focusout', flush);
      // A click in a cell edits it; it must not hand the caret back to the composer.
      table.addEventListener('click', (event) => event.stopPropagation());
    }

    return { attach, focusCell };
  }

  const api = { createCellEditing };
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.MdTable = Object.assign(root.MdTable || {}, api);
  }
})(globalThis);
