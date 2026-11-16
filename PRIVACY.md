# Privacy Policy — Google Chat Markdown Table

_Last updated: 2026-11-16_

Google Chat Markdown Table ("the extension") helps you read and write markdown tables in Google Chat: it renders markdown tables in messages as HTML tables, and helps you compose markdown tables in the message box.

## Data handling

The extension reads two kinds of data, **only inside your browser**, and **never stores, transmits, or shares them**:

- **Personal communications**: the text of Google Chat messages on the page, to find markdown tables.
- **Website content**: the page text above, and a table you paste into the Google Chat message box.

Details:

- Message text is read only inside your browser, only to detect markdown tables and draw them on the page.
- When you paste into the Google Chat message box, the pasted clipboard data is read only at that moment, only to check whether it is a table and convert it into a markdown table. The clipboard is never read at any other time.
- Tables you create or edit in the extension's table editor are written only into the message box you are using. Nothing is sent until you send the message yourself, through Google Chat.
- Nothing is sent to any server. The extension makes no network requests.
- Nothing is saved: no cookies, no `localStorage`, no `chrome.storage`, no analytics, no tracking.
- No personal or sensitive information is sold or transferred to third parties.

## Permissions

- **Content script on `https://chat.google.com/*` and `https://mail.google.com/*`** (where Google Chat is embedded in Gmail): renders tables in the page you are viewing, and on chat.google.com converts table pastes and writes edited tables into the message box.
- **`contextMenus`**: adds "插入 Markdown 表格" (Insert Markdown table) to the right-click menu of editable fields on chat.google.com, to open the table editor.

## Contact

Questions: open an issue at https://github.com/LoopAllan/google-chat-randor-table/issues
