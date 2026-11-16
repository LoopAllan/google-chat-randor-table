'use strict';

/**
 * Modal grid editor for a markdown table. Rendered in a shadow root so Chat's
 * CSS cannot reach in and ours cannot leak out. open() resolves with the
 * edited table, or null when cancelled.
 */
(function (root) {
  const ALIGN_LABELS = { null: '預設', left: '靠左', center: '置中', right: '靠右' };

  const STYLES = `
    :host { all: initial; }
    .backdrop { position: fixed; inset: 0; z-index: 2147483647; display: flex; align-items: center; justify-content: center;
      background: rgb(0 0 0 / 0.45); font: 14px/1.4 system-ui, sans-serif; }
    .panel { --bg: #fff; --fg: #1f1f1f; --line: #c7c7c7; --muted: #5f6368; --accent: #0b57d0;
      background: var(--bg); color: var(--fg); border-radius: 16px; padding: 20px; max-width: min(90vw, 960px);
      max-height: 85vh; display: flex; flex-direction: column; gap: 12px; box-shadow: 0 8px 32px rgb(0 0 0 / 0.3); }
    @media (prefers-color-scheme: dark) {
      .panel { --bg: #2b2c2f; --fg: #e3e3e3; --line: #5f6368; --muted: #a8abaf; --accent: #a8c7fa; }
    }
    h2 { margin: 0; font-size: 16px; }
    .grid-scroll { overflow: auto; }
    table { border-collapse: collapse; }
    td, th { border: 1px solid var(--line); padding: 0; }
    th.control, td.control { border: none; padding: 2px; text-align: center; }
    input.cell { box-sizing: border-box; width: 10em; padding: 6px 8px; border: none; background: transparent; color: inherit; font: inherit; }
    input.cell:focus { outline: 2px solid var(--accent); outline-offset: -2px; }
    tr.header input.cell { font-weight: 600; }
    button { font: inherit; color: inherit; background: none; border: 1px solid var(--line); border-radius: 8px; padding: 4px 10px; cursor: pointer; }
    button.icon { border: none; color: var(--muted); padding: 2px 6px; }
    button.primary { background: var(--accent); color: var(--bg); border-color: var(--accent); }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .spacer { flex: 1; }
    .hint { color: var(--muted); font-size: 12px; }
  `;

  function createTableEditor({ doc, tableModel }) {
    function open(initial) {
      return new Promise((resolve) => {
        let table = initial;
        const host = doc.createElement('div');
        host.className = 'mdtable-editor-host';
        const shadow = host.attachShadow({ mode: 'open' });

        function close(result) {
          host.remove();
          resolve(result);
        }

        function element(tag, props = {}, children = []) {
          const node = doc.createElement(tag);
          Object.assign(node, props);
          children.forEach((child) => node.appendChild(child));
          return node;
        }

        function actionButton(action, label, { index, className = '', title = '' } = {}) {
          const button = element('button', { type: 'button', textContent: label, className, title });
          button.dataset.action = action;
          if (index !== undefined) {
            button.dataset.index = String(index);
          }
          return button;
        }

        function renderGrid() {
          const controls = element('tr', {}, [
            ...table.align.map((align, column) => element('th', { className: 'control' }, [
              actionButton('align', ALIGN_LABELS[align], { index: column, className: 'icon', title: '切換對齊' }),
              actionButton('remove-column', '✕', { index: column, className: 'icon', title: '刪除這一欄' }),
            ])),
            element('th', { className: 'control' }),
          ]);
          const rows = table.cells.map((cells, row) => element('tr', { className: row === 0 ? 'header' : '' }, [
            ...cells.map((value, column) => {
              const input = element('input', { className: 'cell', value, placeholder: row === 0 ? `欄位 ${column + 1}` : '' });
              input.dataset.row = String(row);
              input.dataset.column = String(column);
              input.style.textAlign = table.align[column] ?? '';
              return element('td', {}, [input]);
            }),
            element('td', { className: 'control' }, row === 0 ? [] : [
              actionButton('remove-row', '✕', { index: row, className: 'icon', title: '刪除這一列' }),
            ]),
          ]));
          return element('table', {}, [element('thead', {}, [controls]), element('tbody', {}, rows)]);
        }

        function render(focus) {
          gridScroll.replaceChildren(renderGrid());
          if (focus !== undefined) {
            const target = shadow.querySelector(`input[data-row="${focus.row}"][data-column="${focus.column}"]`);
            target?.focus();
          }
        }

        const ACTIONS = {
          'add-row': () => {
            table = tableModel.insertRow(table, table.cells.length);
            render({ row: table.cells.length - 1, column: 0 });
          },
          'add-column': () => {
            table = tableModel.insertColumn(table, table.align.length);
            render({ row: 0, column: table.align.length - 1 });
          },
          'remove-row': (index) => {
            table = tableModel.removeRow(table, index);
            render();
          },
          'remove-column': (index) => {
            table = tableModel.removeColumn(table, index);
            render();
          },
          align: (index) => {
            table = tableModel.cycleAlign(table, index);
            render();
          },
          submit: () => close(table),
          cancel: () => close(null),
        };

        const gridScroll = element('div', { className: 'grid-scroll' });
        const panel = element('div', { className: 'panel' }, [
          element('h2', { textContent: '插入表格' }),
          gridScroll,
          element('div', { className: 'actions' }, [
            actionButton('add-row', '+ 列'),
            actionButton('add-column', '+ 欄'),
            element('span', { className: 'spacer' }),
            element('span', { className: 'hint', textContent: 'Tab 切換儲存格 · ⌘/Ctrl+Enter 插入 · Esc 取消' }),
            actionButton('cancel', '取消'),
            actionButton('submit', '插入', { className: 'primary' }),
          ]),
        ]);
        const backdrop = element('div', { className: 'backdrop' }, [panel]);

        shadow.append(element('style', { textContent: STYLES }), backdrop);

        shadow.addEventListener('click', (event) => {
          const button = event.target.closest('button[data-action]');
          if (button !== null) {
            ACTIONS[button.dataset.action](Number(button.dataset.index));
          }
        });
        backdrop.addEventListener('mousedown', (event) => {
          if (event.target === backdrop) {
            close(null);
          }
        });
        shadow.addEventListener('input', (event) => {
          const { row, column } = event.target.dataset;
          table = tableModel.setCell(table, Number(row), Number(column), event.target.value);
        });
        // Chat has global shortcuts; keep every keystroke typed here away from it.
        ['keydown', 'keyup', 'keypress'].forEach((type) => host.addEventListener(type, (event) => {
          event.stopPropagation();
        }));
        host.addEventListener('keydown', (event) => {
          if (event.key === 'Escape') {
            ACTIONS.cancel();
          } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            ACTIONS.submit();
          }
        });

        doc.body.appendChild(host);
        render({ row: 0, column: 0 });
      });
    }

    return { open };
  }

  const api = { createTableEditor };
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.MdTable = Object.assign(root.MdTable || {}, api);
  }
})(globalThis);
