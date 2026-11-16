# Chrome Web Store 送審填寫內容

上架用的素材：

| 項目 | 檔案 |
|---|---|
| 上傳的套件 | `dist/google-chat-markdown-table.zip`（`npm run package` 產生） |
| 商店 icon 128×128 | `icons/icon128.png` |
| 截圖 1280×800 | `store/screenshot-1280x800.png`（由 `store/screenshot.html` 產生） |
| 隱私權政策 | `PRIVACY.md`（需要可公開存取的網址） |

## Store listing

**Name**：Google Chat Markdown Table

**Summary（≤132 字元）**：
Read and write markdown tables in Google Chat: messages show real tables, and pasted or edited tables become markdown.

**Category**：Productivity → Communication

**Language**：English（可再加 中文（繁體））

**Description**：

```
Google Chat doesn't render markdown tables. Messages from bots, AI assistants and teammates that contain tables show up as raw pipe text that's hard to read, and writing a table by hand is tedious.

This extension makes markdown tables work in Google Chat, both when you read them and when you write them.

READ
• Markdown tables in messages are drawn as real tables, right where the markdown was
• Only the table lines are replaced; lists, bold text, links and mentions in the same message stay untouched
• Formatting inside cells: bold, italic, strikethrough, inline code, links and line breaks (<br>)
• Column alignment (:--, :-:, --:) and escaped pipes (\|) supported
• Wide tables scroll horizontally; a "顯示原文" (Show original) toggle sits under every table

WRITE
• Paste a table from Google Sheets, Excel, Notion, Google Docs, Confluence or a web page into the message box and it becomes a markdown table, with bold, links, lists and line breaks kept
• Table editor: right-click the message box and choose "插入 Markdown 表格" (Insert Markdown table), or press Option+Shift+T (Alt+Shift+T on Windows). Move between cells with the arrow keys or Tab, paste blocks of cells, add or remove rows and columns, set column alignment
• A table you are writing is previewed as a real table in the message box; click "編輯表格" (Edit table) to change it in the editor

Works in chat.google.com and Chat inside Gmail, in light and dark themes. The interface is in Traditional Chinese.

Privacy: everything happens locally in your browser. Message text is read only to find tables; nothing is stored, and the extension makes no network requests. Clipboard contents are read only when you paste into the Chat message box, only to convert a table.

Note: tables are rendered only for people who have the extension installed; others see the original markdown, sent inside a code block so it stays readable.
```

## Privacy practices 分頁

**Single purpose**：
Read and write markdown tables in Google Chat: render the markdown tables in messages as HTML tables, and help compose markdown tables in the message box.

**Host permission justification**（content script 的 matches）：
The content script must read message text on chat.google.com, and on mail.google.com where Google Chat is embedded in Gmail, to detect markdown tables and replace them with rendered tables in the page. On chat.google.com it also works in the message box: when the user pastes a table (from a spreadsheet, document or web page) it reads the pasted clipboard data to convert it into a markdown table, and it writes tables created or edited in the extension's table editor into the message box. No data leaves the browser.

**contextMenus justification**：
Adds one item, "插入 Markdown 表格" (Insert Markdown table), to the right-click menu of editable fields on chat.google.com. Choosing it opens the extension's table editor for the Google Chat message box. The item is not shown on any other site, and no data is read from the menu click.

**Are you using remote code?**：No, I am not using remote code.

**Data usage**：勾「個人通訊資料」和「網站內容」（官方 FAQ：只在本機處理也必須揭露；讀取訊息文字找表格、讀取貼上的表格），其餘不勾，並勾選三項聲明：
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL**：
https://github.com/LoopAllan/google-chat-randor-table/blob/main/PRIVACY.md
（repo 必須是 public，且 PRIVACY.md 要已經在 `main` 上）
