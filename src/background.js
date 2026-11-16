'use strict';

/**
 * Service worker: owns the "插入 Markdown 表格" context-menu item and forwards
 * clicks to the content script in the frame that was right-clicked (Chat may
 * run inside an iframe in Gmail).
 */
const MENU_ID = 'mdtable-insert-table';
const OPEN_EDITOR_MESSAGE = 'mdtable:open-editor';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: '插入 Markdown 表格',
    contexts: ['editable'],
    documentUrlPatterns: ['https://chat.google.com/*'],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || tab === undefined || tab.id === undefined) {
    return;
  }
  chrome.tabs.sendMessage(tab.id, { type: OPEN_EDITOR_MESSAGE }, { frameId: info.frameId }).catch((error) => {
    console.error(`[md-table] could not reach the content script in tab ${tab.id} frame ${info.frameId}:`, error);
  });
});
