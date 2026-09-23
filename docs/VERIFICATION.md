# 驗證紀錄 / Verification

## 繁體中文

更新：2026-09-23。此文件區分可重跑測試、開發時人工驗證與尚未完成的驗收。

### 可重跑

`npm ci` → `npm test` → `npm run build`。GitHub Actions 在 push 與 PR 執行相同檢查。

| 測試檔            | 範圍                                                                     |
| ----------------- | ------------------------------------------------------------------------ |
| `domain.test.ts`  | 金額、庫存、分店統計、退款與輸入規則                                     |
| `storage.test.ts` | 本機存取、批次分類全數回滾、歷史與版本處理                               |
| `server.test.ts`  | PGlite 執行 SQL；授權、重送、衝突、退款、直接寫入拒絕                    |
| `sync.test.ts`    | 佇列到 PostgreSQL 的整合、批次分類同步、回應遺失重送、過期登入與衝突處理 |
| `demo.test.ts`    | 公開模式禁用雲端 client；示範資料只植入一次且不覆蓋修改、不入上傳佇列    |

目前合計 52 個測試。既有測試可能依同檔內順序建構情境；PGlite 提供資料庫引擎，並不包含完整 Supabase Auth 或 Edge runtime。

### 開發時已驗證

- 原始獨立部署的 Supabase API：未授權拒絕、單次帳號開通、密碼登入、操作重送不重複、版本衝突、進貨付款、部分退款、拒絕超額退款、第二個 client 讀取、歷史、禁止直接寫表。臨時 QA 帳號與資料已在啟用前清理；此紀錄不宣稱現在家庭資料庫仍是空白。
- 瀏覽器：商品期初 10，售出 2 後 8，進貨 5 後 13，退回 1 後 14。
- 離線：儲存完成後重開頁面，交易仍在本機。真正兩台店內裝置跨網路同步仍需使用者驗收。
- Excel：下載後以 ExcelJS 重新讀取，確認 6 張工作表與兩店合計。
- 手機：390px 版面無橫向溢出，實際畫面已檢視。截圖全部為示範資料。
- 家用站 2026-09-21 版：81 個虛構品項測試卡片／條列、搜尋、目前結果全選 27 項、批次分類、離線重開與手機版面；這些操作不代表公開試用站已通過同等驗收。
- 公開試用版 2026-09-22 本機預覽：4 個虛構品項，確認切換條列後點整列加入商品、切回卡片仍保留交易；庫存分類篩選後全選目前 3 項，批次變更對話框列出所選品項；未對正式家庭帳本寫入。

### 尚未證明

沒有長期真實營業數據、負載測試、外部滲透測試或正式無障礙認證。不保證瀏覽器永不清除資料、不保證關閉後背景同步、不保證未下載備份的資料可以復原。免費主機可用性與限制不屬於本專案的服務保證。依賴通報見 [SECURITY.md](../SECURITY.md)。

## English

Updated on 2026-09-23. Reproducible tests, development checks and outstanding acceptance are intentionally separated.

Run `npm ci`, `npm test`, and `npm run build`. CI repeats them for pushes and pull requests. The eight test files cover domain arithmetic/validation, atomic bulk recategorization, device persistence/history, SQL authorization and idempotency, outbox-to-PostgreSQL integration, repeated conflicts, expired sessions, and cloud-disabled demo seeding. There are currently 52 tests. Some database scenarios share ordered state; PGlite does not provide the complete Supabase Auth/Edge platform.

Development verification included actual Supabase bootstrap/login, unauthorized rejection, idempotency, conflicts, purchases/payments, partial and excessive refunds, a second client, history and denied direct writes. Disposable QA records/accounts were cleaned up before household activation; this is not a claim about the current household database.

Browser checks observed stock 10 → 8 after selling two → 13 after receiving five → 14 after restocking one return. Saved offline entries survived reopening. An exported workbook was read back to check six worksheets and combined totals. Mobile layout was inspected at 390px without horizontal overflow; all published screenshots use fictional data.

The household site's 2026-09-21 build was exercised with 81 fictional products: card/list switching, search, selecting 27 visible items, bulk recategorization, offline reopening and mobile layout. This does not claim the public demo has passed identical acceptance.

In a 2026-09-22 local preview of the public demo with four fictional products, switching to rows, adding a product by clicking its row, and switching back preserved the sale. Inventory category filtering selected three visible items, which appeared in the bulk-category confirmation. No household record was written.

Two actual shop devices still need acceptance across disconnect/reconnect conditions. There are no long-term operating metrics, load-test results, independent penetration tests or accessibility certification. Browser storage eviction, closed-app background sync and recovery without a saved backup are not guaranteed. Hosting-provider availability and free-tier limits are not a project SLA. See [Security](../SECURITY.md) for dependencies.

## 2026-09-23 備份驗證 / Backup verification

新增 20 項測試，涵蓋 JSON 完整性、兩店資料往返、試用設定固定 ID、非空白拒絕、雲端登入與待同步保護、權限、無效退款及歷史全數回滾，以及超過 1,000 筆歷史完整匯出。本機瀏覽器以虛構資料下載並重新上傳，8 筆紀錄及 1 筆歷史往返一致，重開仍保留；390px 手機無橫向溢出。未對真實家庭帳目執行清空或還原。

Twenty added tests cover JSON integrity, round-trip data for both shops, the fixed demo settings ID, nonempty-ledger rejection, cloud authentication and outbox guards, authorization, atomic rollback for invalid refunds/history, and exports exceeding 1,000 history rows. A local browser downloaded and reuploaded fictional data with matching 8 records and 1 history row, preserved after reload; the 390px layout had no horizontal overflow. No real household ledger was cleared or restored.
