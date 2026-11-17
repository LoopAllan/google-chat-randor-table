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

**儲存格內的格式**：支援 `**粗體**`、`*斜體*`、`~~刪除線~~`、`` `程式碼` ``、`[連結](https://…)`、直接貼網址，以及用 `<br>` 換行（GitHub 的慣例）。Notion 複製出來、儲存格內直接換行的表格也讀得懂。其他 HTML 一律當純文字顯示，連結只允許 http、https、mailto。

**貼上任何表格**：從 Google 試算表、Excel、Notion、Google 文件、Confluence、網頁複製的表格（兩列兩欄以上），或一整段 markdown 表格文字，貼進 Chat 輸入框會自動轉成包在 ``` 裡的 markdown table（第一列當表頭；在程式碼區塊內貼上則不另外加 ```）。粗體、斜體、刪除線、程式碼、連結、清單會轉成 markdown，儲存格內換行轉成 `<br>`。只在 chat.google.com 的輸入框作用，Gmail 寫信不受影響。

**表格編輯器**：在 Chat 輸入框按右鍵選「插入 Markdown 表格」，或按 `Option+Shift+T`（Windows：`Alt+Shift+T`）。

- 游標不在表格上：開一張空白表格，按「插入」寫進游標位置
- 游標在既有的表格上（包括 Chat 的程式碼區塊）：載入那張表格，按「更新」直接取代
- 方向鍵 / Tab 在儲存格間移動（← → 只在文字開頭/結尾時換格）
- 可直接貼上從任何地方複製的多格內容（試算表、Notion、網頁表格、markdown 表格）：從游標所在的格子往右下填入，表格不夠大會自動加列加欄
- 儲存格顯示 markdown 原文（例如 `**粗體**`、`<br>`），更新時原樣保留
- 可新增/刪除列與欄、設定每欄對齊；`⌘/Ctrl+Enter` 送出，`Esc` 取消

**輸入框預覽**：輸入框裡程式碼區塊中的 markdown table 會直接顯示成表格，右上角有「編輯表格」（打開編輯器更新這張表格）和「顯示原文」。送出的內容不變，仍是原本的 markdown。

**直接在預覽上改文字**：點預覽表格的儲存格就能直接打字，改動會寫回輸入框裡的 markdown。在輸入框裡，游標在表格正上方那一行按 ↓ 會進入表頭第一格，在正下方那一行按 ↑ 會進入最後一列第一格。

- 打完 markdown 語法會自動套用：`**粗體**`、`*斜體*`、`_斜體_`、`~~刪除線~~`、`` `程式碼` ``、`[文字](https://…)`
- 方向鍵在格子間移動：↑ ↓ 直接換列，← → 只在文字開頭/結尾時換格；在第一列按 ↑ 會跳到表格上方的輸入框，在最後一列按 ↓ 會跳到表格下方
- `Tab` / `Shift+Tab` 左右換格，`Enter` 往下一格（最後一列離開表格），`Shift+Enter` 在格子內換行（存成 `<br>`），`Esc` 回到輸入框
- `⌘/Ctrl+Enter` 先把改動寫回輸入框，再直接送出訊息
- 貼上只取純文字；中文輸入法選字時不會提前轉換
- 只改文字；新增/刪除列欄、對齊請用「編輯表格」

## 運作方式

| 模組 | 職責 |
|---|---|
| `src/chatDom.js` | Google Chat DOM 結構的唯一來源（輸入框、程式碼區塊、工具列的選擇器、設定游標、送出訊息）；Chat 改版時只改這裡 |
| `src/tableParser.js` | 純函式：在文字中找出表格與其字元位置（對齊、跳脫 `\|`、補齊欄位數） |
| `src/textExtractor.js` | 取元素文字並記錄每個 text node / `<br>` 對應的字元範圍（不依賴 layout） |
| `src/inlineMarkdown.js` | 儲存格內的 markdown（粗體、斜體、刪除線、程式碼、連結、`<br>`）→ DOM，只用 DOM API 建立節點（防 XSS） |
| `src/markdownShortcuts.js` | 打字時游標前剛完成的 markdown 語法換成格式元素；什麼算完成交給 `inlineMarkdown.js` 判斷 |
| `src/cellEditing.js` | 預覽儲存格的就地編輯：方向鍵 / Tab / Enter 移動、輸入法、純文字貼上、⌘/Ctrl+Enter 送出，停頓或離開格子時回報該格的 markdown |
| `src/tableRenderer.js` | 表格 → DOM，儲存格內容交給注入的 `renderCell`（預設純文字） |
| `src/messageEnhancer.js` | 找出含表格的訊息，**只隱藏表格那幾行的節點**並在原位插入表格；處理編輯和移除 |
| `src/tableWatcher.js` | MutationObserver 監看新增、編輯、刪除，批次掃描 |
| `src/htmlTable.js` | 從任何來源的 HTML `<table>` 讀出儲存格，格式轉 markdown、合併儲存格展開；`readCell` 也用來把編輯中的預覽儲存格轉回 markdown |
| `src/clipboardTable.js` | 從剪貼簿讀出表格：markdown 表格文字（Notion 的 HTML 會把清單拆成獨立列，純文字才正確）→ HTML 表格 → TSV |
| `src/markdownTableWriter.js` | 純函式：rows → markdown table（跳脫 `\|`、換行轉 `<br>`、對齊、可包 ```） |
| `src/composerInserter.js` | 把文字寫進 Chat 輸入框：模擬貼上，失敗時改用 `insertText` |
| `src/pasteConverter.js` | 攔截輸入框的表格貼上，換成 markdown table（在程式碼區塊內不加 ```） |
| `src/tableModel.js` | 純函式：編輯中的表格（新增/刪除列欄、對齊），不可變 |
| `src/tableEditor.js` | 表格編輯器 UI（Shadow DOM，跟 Chat 的樣式隔離） |
| `src/composerTableLocator.js` | 找出輸入框游標所在的表格，並建立涵蓋它的 DOM Range 以便取代 |
| `src/codeBlockWriter.js` | 直接改寫 Chat 程式碼區塊裡表格那幾行（選取後貼上會破壞程式碼區塊） |
| `src/overlayGeometry.js` | 純函式：預覽疊在程式碼區塊上的位置、裁切與按鈕列位置 |
| `src/composerPreview.js` | 輸入框預覽：在程式碼區塊上疊一層表格（在可編輯區外），滾動交回輸入框、點儲存格外把游標放到表格後；儲存格改動寫回程式碼區塊且不重建正在編輯的表格；表格上下緊鄰的行按 ↑ ↓ 進入表格 |
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
