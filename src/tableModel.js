'use strict';

/**
 * Immutable table being edited: cells[0] is the header row.
 * Every operation returns a new table (or the same one when the edit is not allowed).
 */
(function (root) {
  const MIN_ROWS = 2;
  const MIN_COLUMNS = 1;
  const ALIGN_CYCLE = [null, 'left', 'center', 'right'];

  function createTable(rowCount, columnCount) {
    return {
      cells: Array.from({ length: rowCount }, () => Array(columnCount).fill('')),
      align: Array(columnCount).fill(null),
    };
  }

  /** Uses sourceRows (cells as written) when present, widening the table to the widest row. */
  function fromParsed({ header, rows, align, sourceRows = rows }) {
    const width = Math.max(header.length, ...sourceRows.map((row) => row.length));
    const pad = (list, filler) => [...list, ...Array(width - list.length).fill(filler)];
    return { cells: [pad(header, ''), ...sourceRows.map((row) => pad(row, ''))], align: pad(align, null) };
  }

  function setCell(table, row, column, value) {
    const cells = table.cells.map((cells) => [...cells]);
    cells[row][column] = value;
    return { ...table, cells };
  }

  function insertRow(table, index) {
    const cells = [...table.cells];
    cells.splice(index, 0, Array(table.align.length).fill(''));
    return { ...table, cells };
  }

  function removeRow(table, index) {
    if (table.cells.length <= MIN_ROWS) {
      return table;
    }
    return { ...table, cells: table.cells.filter((_, row) => row !== index) };
  }

  function insertColumn(table, index) {
    const withCell = (list, value) => [...list.slice(0, index), value, ...list.slice(index)];
    return {
      cells: table.cells.map((row) => withCell(row, '')),
      align: withCell(table.align, null),
    };
  }

  function removeColumn(table, index) {
    if (table.align.length <= MIN_COLUMNS) {
      return table;
    }
    const without = (list) => list.filter((_, column) => column !== index);
    return { cells: table.cells.map(without), align: without(table.align) };
  }

  function cycleAlign(table, column) {
    const align = [...table.align];
    align[column] = ALIGN_CYCLE[(ALIGN_CYCLE.indexOf(align[column]) + 1) % ALIGN_CYCLE.length];
    return { ...table, align };
  }

  /** Writes block (rows of cells) starting at [row, column], adding rows/columns when it overflows. */
  function pasteBlock(table, row, column, block) {
    const width = Math.max(...block.map((cells) => cells.length));
    let grown = table;
    while (grown.cells.length < row + block.length) {
      grown = insertRow(grown, grown.cells.length);
    }
    while (grown.align.length < column + width) {
      grown = insertColumn(grown, grown.align.length);
    }
    const cells = grown.cells.map((cellsOfRow) => [...cellsOfRow]);
    block.forEach((values, rowOffset) => values.forEach((value, columnOffset) => {
      cells[row + rowOffset][column + columnOffset] = value;
    }));
    return { ...grown, cells };
  }

  const api = { createTable, fromParsed, setCell, insertRow, removeRow, insertColumn, removeColumn, cycleAlign, pasteBlock };
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.MdTable = Object.assign(root.MdTable || {}, { tableModel: api });
  }
})(globalThis);
