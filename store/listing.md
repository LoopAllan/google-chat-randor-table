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
Render markdown tables in Google Chat messages as real tables, keeping the rest of each message's formatting.

**Category**：Productivity → Communication

**Language**：English（可再加 中文（繁體））

**Description**：

```
Google Chat doesn't render markdown tables. Messages from bots, AI assistants and teammates that contain tables show up as raw pipe text that's hard to read.

This extension detects GitHub-flavored markdown tables in Google Chat messages and draws them as real tables, right where the markdown was.

• Works automatically on new, existing and edited messages
• Only the table lines are replaced; lists, bold text, links and mentions in the same message stay untouched
• Column alignment (:--, :-:, --:) and escaped pipes (\|) supported
• Wide tables scroll horizontally inside the message bubble
• "Show original" toggle under every table
• Works in chat.google.com and Chat inside Gmail, light and dark themes

Privacy: everything happens locally in your browser. The extension collects nothing, stores nothing and makes no network requests.

Tip: for best results, send tables inside a ``` code block so Google Chat doesn't apply its own formatting to the cells.

Note: tables are rendered only for people who have the extension installed; others still see the original text.
```

## Privacy practices 分頁

**Single purpose**：
Render markdown tables that appear in Google Chat messages as HTML tables.

**Host permission justification**（content script 的 matches）：
The content script must read message text on chat.google.com, and on mail.google.com where Google Chat is embedded in Gmail, to detect markdown tables and replace them with rendered tables in the page. No data leaves the browser.

**Are you using remote code?**：No, I am not using remote code.

**Data usage**：全部不勾（不收集任何類別的使用者資料），並勾選三項聲明：
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL**：
https://github.com/LoopAllan/google-chat-randor-table/blob/main/PRIVACY.md
（repo 必須是 public，且 PRIVACY.md 要已經在 `main` 上）
