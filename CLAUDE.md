# 開發原則

這個專案是 Chrome extension（Manifest V3），在 Google Chat 這種大型、持續變動的頁面上執行。以下原則適用於所有變更。

## 設計：SOLID + DRY，以簡單為界

- **單一職責**：一個模組只做一件事（見 README 的「運作方式」表）。檔案開始同時處理兩件事（例如 UI 事件和資料轉換），就拆成新模組。
- **依賴注入**：模組用 `createXxx({ doc, ... })` 建立，DOM、計時器、observer、其他模組都從參數傳進來，不直接抓全域。這樣才能在 jsdom 裡測試，也讓 `contentScript.js` 是唯一負責接線的地方。
- **純函式優先**：能不碰 DOM 的邏輯（解析、序列化、幾何計算、表格模型）寫成純函式，例如 `tableParser.js`、`tableModel.js`、`overlayGeometry.js`。
- **DRY**：同樣的知識只放一個地方。
  - Google Chat 的 DOM 結構（選擇器、游標設定）只放在 `src/chatDom.js`，Chat 改版只改這裡。
  - markdown 解析與渲染只用 `inlineMarkdown.js` / `tableParser.js`，寫回只用 `markdownTableWriter.js`，不要另寫一套。
  - 第三次出現重複才抽出共用；兩次以內先保持直白。
- **簡單**：YAGNI，不為假想需求加參數或抽象層。用 guard clause 提早 return，比較一律用 `===`。
- **不可變資料**：表格模型的操作回傳新物件（`tableModel.js`）。

## 效能

Chat 頁面一直在變動，任何在 MutationObserver、scroll、input 上執行的程式都要便宜：

- **先讀後寫**：同一個 frame 內先讀完所有 layout（`getBoundingClientRect`、`offsetHeight`），再一次寫入，避免 layout thrashing。
- **合併到每個 frame 一次**：scroll / resize / mutation 觸發的工作用 `schedule`（`requestAnimationFrame`）合併；打字觸發的重建用 `delay` 等停頓。
- **昂貴的東西算一次就快取**：computed style、會裁切的祖先元素在建立時讀一次，不在 scroll 路徑上重讀。
- **縮小範圍**：mutation 先過濾掉自己造成的變動（我們的 layer）和輸入框以外的變動，不要每次都掃整份 document。
- **值沒變就不寫**：寫屬性、樣式前先比對，Chat 的編輯器會對它自己 DOM 的變動做出反應。
- 迴圈內避免建立不必要的物件；O(n²) 只允許用在很小的 n（例如單一儲存格的文字）。

## 安全

- 訊息內容來自其他人：只用 `createElement` / `createTextNode` 建 DOM，**不用 `innerHTML`**。
- 連結只允許 http、https、mailto。

## 錯誤處理

- 失敗要快，訊息帶前綴 `[md-table]` 和足夠的上下文（哪個 offset、哪個元素、接下來會怎樣）。
- 不吞例外；真的要忽略時要寫清楚為什麼。

## 程式風格

- 每個模組用現有的 UMD 包法：`(function (root) { ... })(globalThis)`，Node 用 `module.exports`，瀏覽器掛到 `root.MdTable`。新模組要加進 `manifest.json` 的載入順序（依賴者在後）。
- 常數用 `SCREAMING_SNAKE_CASE`，其他用 camelCase。
- 註解寫「為什麼」。跟 Chat 行為有關的事實要寫驗證日期，例如 `(verified 2026-11-16)`。
- 程式碼與註解用英文；README 與文件用繁體中文。

## 測試

- 先寫會失敗的測試，再寫最少的實作讓它通過，再重構。
- `npm test`（node:test + jsdom）。Chat 輸入框的 DOM 形狀照真實結構寫 fixture（例如 `<article role="code">` 裡一行一個 `<div>`）。
- jsdom 沒有 layout，也沒有真的 contenteditable 編輯行為；這部分要在 chat.google.com 手動驗證，並在回報時說明哪些沒驗證。
- 不要為了讓測試通過而跳過或放寬測試。

## 文件

- 新增或改變模組職責時，同步更新 README 的功能說明與「運作方式」表。
