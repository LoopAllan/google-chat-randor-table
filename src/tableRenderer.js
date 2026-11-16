'use strict';

/**
 * Turns a parsed table into DOM. Message content never goes through
 * innerHTML (the text comes from other people's messages): cells are plain
 * text, or whatever DOM the injected renderCell builds (inlineMarkdown.js).
 */
(function (root) {
  const plainText = (text, doc) => doc.createTextNode(text);

  function createCell(doc, tagName, text, align, renderCell) {
    const cell = doc.createElement(tagName);
    cell.appendChild(renderCell(text, doc));
    if (align !== null) {
      cell.style.textAlign = align;
    }
    return cell;
  }

  function createRow(doc, tagName, cells, align, renderCell) {
    const row = doc.createElement('tr');
    cells.forEach((text, column) => row.appendChild(createCell(doc, tagName, text, align[column], renderCell)));
    return row;
  }

  /** renderCell(text, doc) returns the cell's content as a Node; plain text by default. */
  function renderTable(table, doc, { renderCell = plainText } = {}) {
    const element = doc.createElement('table');
    element.className = 'mdtable';

    const thead = doc.createElement('thead');
    thead.appendChild(createRow(doc, 'th', table.header, table.align, renderCell));
    element.appendChild(thead);

    const tbody = doc.createElement('tbody');
    table.rows.forEach((cells) => tbody.appendChild(createRow(doc, 'td', cells, table.align, renderCell)));
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
