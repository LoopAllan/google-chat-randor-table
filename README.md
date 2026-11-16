# Google Chat Markdown Table

Chrome extension（Manifest V3）：把 Google Chat 訊息泡泡裡的 GFM markdown table 自動渲染成表格。

> 純前端渲染：只有安裝這個 extension 的人看得到表格，其他人看到的還是原文。

## 安裝（開發版）

1. 打開 `chrome://extensions`，開啟右上角「開發人員模式」
2. 「載入未封裝項目」→ 選這個資料夾
3. 重新整理 chat.google.com 或 mail.google.com/chat

## 使用

送出一般的 markdown table 即可：

```
| 服務 | 錯誤數 |
| :-- | --: |
| api-a | 12 |
```

**建議包在 ``` code block 裡送出**：Google Chat 會把儲存格裡的 `*x*`、`_x_` 轉成粗體或斜體，也可能吃掉空白；放在 code block 裡最穩。

每張表格下方有「顯示原文 / 顯示表格」切換。

**從 Excel / Google 試算表貼上**：在 Chat 輸入框貼上兩列兩欄以上的儲存格，會自動轉成包在 ``` 裡的 markdown table（第一列當表頭）。只在 chat.google.com 的輸入框作用，Gmail 寫信不受影響。

**表格編輯器**：在 Chat 輸入框按右鍵選「插入 Markdown 表格」，或按 `Option+Shift+T`（Windows：`Alt+Shift+T`），會跳出表格編輯器，可新增/刪除列與欄、設定每欄對齊；按「插入」（或 `⌘/Ctrl+Enter`）就會在游標位置插入 markdown table。

## 運作方式

| 模組 | 職責 |
|---|---|
| `src/tableParser.js` | 純函式：在文字中找出表格與其字元位置（對齊、跳脫 `\|`、補齊欄位數） |
| `src/textExtractor.js` | 取元素文字並記錄每個 text node / `<br>` 對應的字元範圍（不依賴 layout） |
| `src/tableRenderer.js` | 表格 → DOM，內容一律走 `textContent`（防 XSS） |
| `src/messageEnhancer.js` | 找出含表格的訊息，**只隱藏表格那幾行的節點**並在原位插入表格；處理編輯和移除 |
| `src/tableWatcher.js` | MutationObserver 監看新增、編輯、刪除，批次掃描 |
| `src/clipboardTable.js` | 純函式：從剪貼簿（試算表的 HTML + TSV）讀出表格 |
| `src/markdownTableWriter.js` | 純函式：rows → markdown table（跳脫 `\|`、對齊、可包 ```） |
| `src/composerInserter.js` | 把文字寫進 Chat 輸入框：模擬貼上，失敗時改用 `insertText` |
| `src/pasteConverter.js` | 攔截輸入框的試算表貼上，換成 markdown table |
| `src/tableModel.js` | 純函式：編輯中的表格（新增/刪除列欄、對齊），不可變 |
| `src/tableEditor.js` | 表格編輯器 UI（Shadow DOM，跟 Chat 的樣式隔離） |
| `src/editorLauncher.js` | 快捷鍵 / 右鍵選單開啟編輯器，保存並還原游標位置後插入 |
| `src/background.js` | Service worker：建立右鍵選單，轉送到被點的 frame |
| `src/contentScript.js` | 入口，把以上模組接上真實頁面 |

不依賴 Google Chat 的 class 名稱（混淆過，會隨改版變動），用文字結構找訊息。表格以外的內容（清單、粗體、連結、mention）完全保留 Chat 原本的 DOM；表格那幾行只加 `data-mdtable-hidden` 屬性隱藏（純文字節點會包一層 span），切換回原文就是把它們顯示回來。

## 開發

```bash
npm install
npm test            # node:test + jsdom
open demo/index.html  # 模擬 Chat 泡泡的本機 demo
```

## 發布到 Chrome Web Store

```bash
npm run package   # 產生 dist/google-chat-markdown-table.zip
```

送審要填的內容與素材整理在 `store/listing.md`，隱私權政策在 `PRIVACY.md`。改版時記得先調高 `manifest.json` 的 `version`。

## 已知限制

- `mail.google.com` 整個網域都會掃描，所以 Gmail 純文字信件裡的 markdown table 也會被渲染。
- 表格儲存格裡的連結、mention 會變成純文字，需要時可切回原文。
- 還沒在真實的 Google Chat 驗證過 DOM 結構和 iframe 網址。
