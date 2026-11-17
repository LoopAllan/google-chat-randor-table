'use strict';

/**
 * Replaces a table that sits inside a Chat code block (<article role="code">,
 * one <div> per line) by rewriting those line elements directly.
 *
 * Selecting the old text and pasting over it (verified 2026-11-16) leaves the
 * last line outside its <div>, and a second update then mixes code block and
 * paragraph text. Rewriting the lines and firing `input` keeps Chat's model in
 * sync: the sent message is exactly the new table.
 */
(function (root) {
  // Chat DOM knowledge lives in chatDom.js (loaded first by the manifest).
  const chatDom = typeof module === 'object' && module.exports ? require('./chatDom.js') : root.MdTable.chatDom;

  function createCodeBlockWriter({ doc }) {
    /** The direct child of codeBlock holding node (a line <div>, or a stray bare text line). */
    function lineOf(codeBlock, node) {
      let line = node;
      while (line !== null && line.parentNode !== codeBlock) {
        line = line.parentNode;
      }
      return line;
    }

    function placeCaretAtEnd(composer, element) {
      const caret = doc.createRange();
      caret.setStart(element.firstChild, element.firstChild.length);
      caret.collapse(true);
      chatDom.setCaret(composer, caret);
    }

    /** moveCaret false keeps focus where it is: an edited preview cell must not lose it to the composer. */
    function replaceLines(codeBlock, range, markdown, { moveCaret = true } = {}) {
      const first = lineOf(codeBlock, range.startContainer);
      const last = lineOf(codeBlock, range.endContainer);
      if (first === null || last === null) {
        throw new Error('[md-table] the table range is not inside the code block; refusing to rewrite it');
      }
      const newLines = markdown.split('\n').map((text) => {
        const div = doc.createElement('div');
        div.textContent = text;
        return div;
      });
      const covered = [];
      for (let line = first; line !== last.nextSibling; line = line.nextSibling) {
        covered.push(line);
      }
      last.after(...newLines);
      covered.forEach((line) => line.remove());

      const composer = chatDom.editableAncestor(codeBlock);
      if (moveCaret) {
        placeCaretAtEnd(composer, newLines[newLines.length - 1]);
      }
      composer.dispatchEvent(new doc.defaultView.InputEvent('input', { bubbles: true, inputType: 'insertReplacementText' }));
    }

    return { replaceLines };
  }

  const api = { createCodeBlockWriter };
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.MdTable = Object.assign(root.MdTable || {}, api);
  }
})(globalThis);
