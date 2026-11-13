'use strict';

/**
 * Turns a parsed table into DOM. Every piece of message content goes through
 * textContent, never innerHTML: the text comes from other people's messages.
 */
(function (root) {
  function createCell(doc, tagName, text, align) {
    const cell = doc.createElement(tagName);
    cell.textContent = text;
    if (align !== null) {
      cell.style.textAlign = align;
    }
    return cell;
  }

  function createRow(doc, tagName, cells, align) {
    const row = doc.createElement('tr');
    cells.forEach((text, column) => row.appendChild(createCell(doc, tagName, text, align[column])));
    return row;
  }

  function renderTable(table, doc) {
    const element = doc.createElement('table');
    element.className = 'mdtable';

    const thead = doc.createElement('thead');
    thead.appendChild(createRow(doc, 'th', table.header, table.align));
    element.appendChild(thead);

    const tbody = doc.createElement('tbody');
    table.rows.forEach((cells) => tbody.appendChild(createRow(doc, 'td', cells, table.align)));
    element.appendChild(tbody);

    const scroll = doc.createElement('div');
    scroll.className = 'mdtable-scroll';
    scroll.appendChild(element);
    return scroll;
  }

  const api = { renderTable };
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.MdTable = Object.assign(root.MdTable || {}, api);
  }
})(globalThis);
