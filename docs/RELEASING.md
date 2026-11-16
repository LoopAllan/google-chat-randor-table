# 發布到 Chrome Web Store

## 發布新版本

1. 修改 `manifest.json` 的 `version`（必須比商店上的版本大），合併到 `main`。
2. 在 `main` 上打標籤並推送，標籤要跟版本號一致：

   ```bash
   git tag v0.6.1
   git push origin v0.6.1
   ```

3. GitHub Actions 的「Release to Chrome Web Store」會先跑測試，接著等待核准。到 repo 的 Actions 頁面按「Review deployments」→「Approve and deploy」。
4. 核准後會打包、上傳並送出審查。審查通過後自動上架。

流程會在以下情況停止，不會送審：

- 測試失敗。
- 標籤和 `manifest.json` 的版本不一致。
- 標籤所在的 commit 不在 `main` 上。
- 上傳失敗，最常見的原因是版本號沒有提高。

**新增權限的版本**：資訊主頁「隱私權」分頁的權限理由欄位，要等新套件上傳後才會出現。自動發布會在上傳後立刻送審，所以送審後要盡快到資訊主頁補上新權限的理由（0.6.1 新增 `contextMenus` 時就是這樣處理）。

**仍需手動處理**：商店頁面的說明、截圖、權限理由、隱私欄位，要在[開發人員資訊主頁](https://chrome.google.com/webstore/devconsole)修改；API 只負責上傳套件和送審。

## 設定（已完成，2026-11-16）

GitHub 不存任何金鑰。每次執行時，GitHub 用 OIDC 向 Google 證明「我是這個 repo」，換取一小時有效的通行證，再以服務帳號的身分呼叫 [Chrome Web Store API v2](https://developer.chrome.com/docs/webstore/using-api)。

| 項目 | 值 |
|---|---|
| GCP 專案（個人帳號 ad6885971@gmail.com） | `mdtable-release-40e9b6`（專案編號 538322556952） |
| 服務帳號 | `cws-publisher@mdtable-release-40e9b6.iam.gserviceaccount.com`，已加入 Chrome Web Store 發布者帳戶 |
| Workload Identity 提供者 | `projects/538322556952/locations/global/workloadIdentityPools/github/providers/google-chat-randor-table` |
| 允許的來源 | 只接受 repo ID `1456365459`（LoopAllan/google-chat-randor-table）、擁有者 ID `41807202` |
| GitHub environment | `chrome-web-store`，需要 repo 擁有者核准 |

Repo 變數（Settings → Secrets and variables → Actions → Variables，都不是機密）：

| 變數 | 值 |
|---|---|
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | 上表的 Workload Identity 提供者 |
| `GCP_SERVICE_ACCOUNT` | 上表的服務帳號 |
| `CWS_PUBLISHER_ID` | `5125c6ca-bf37-4bc0-97fc-c9923be53e35` |
| `CWS_EXTENSION_ID` | `lcgnjnbljiadidcahklmnfcmfmdgncmh` |

## 本機手動檢查狀態

需要暫時給自己 `roles/iam.serviceAccountTokenCreator`（專案擁有者預設沒有），用完記得移除：

```bash
SA=cws-publisher@mdtable-release-40e9b6.iam.gserviceaccount.com
gcloud iam service-accounts add-iam-policy-binding $SA --project mdtable-release-40e9b6 \
  --role roles/iam.serviceAccountTokenCreator --member user:ad6885971@gmail.com
TOKEN=$(gcloud auth print-access-token --impersonate-service-account=$SA \
  --scopes=https://www.googleapis.com/auth/chromewebstore)
curl -H "Authorization: Bearer $TOKEN" \
  "https://chromewebstore.googleapis.com/v2/publishers/5125c6ca-bf37-4bc0-97fc-c9923be53e35/items/lcgnjnbljiadidcahklmnfcmfmdgncmh:fetchStatus"
gcloud iam service-accounts remove-iam-policy-binding $SA --project mdtable-release-40e9b6 \
  --role roles/iam.serviceAccountTokenCreator --member user:ad6885971@gmail.com
```
