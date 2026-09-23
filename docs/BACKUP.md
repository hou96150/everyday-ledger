# 完整備份與還原 / Ledger backup and restore

## 繁體中文

在「設定 → 完整備份與還原」下載 `.ledger.json`。內容包含兩店帳目、商品與期初庫存、店面設定及修改歷史；庫存由原始紀錄重建，不會重播銷售而重複扣庫存。Excel 是查帳匯出，不能上傳還原。

1. 雲端帳本：先讓每一台裝置完成同步，再於連網狀態下載。檔案包含當時雲端的完整帳本，不包含其他裝置尚未上傳的內容。
2. 將檔案另存至安全位置。備份未加密，含私人帳務，不要公開到 GitHub、Issues 或共享連結。
3. 還原時選取備份檔，核對來源、時間與筆數，再確認。只接受本機與雲端都沒有紀錄、歷史或待同步操作的空白帳本。既有帳本會被拒絕，不提供覆蓋或合併。
4. 正式備份可匯入已開通且獲授權的新空白帳本；須自行建立帳號／專案並安裝後端。試用與正式備份不能混用。試用版的清空功能只操作該瀏覽器的試用資料。
5. 若還原後網路回應中斷，先重新同步並核對內容；不要刪除資料來重試。

格式版本為 1，附 SHA-256 完整性校驗，用來偵測毀損，不是簽章或加密。單檔上限 20 MB，最多 50,000 筆紀錄與 100,000 筆歷史；這些是保護上限，不是大量資料效能保證。還原的雲端資料寫入在同一資料庫交易中全數成功或回滾。

這是帳本資料備份，不包含密碼、登入權限、網站程式或 Supabase 專案設定。未提供自動排程、加密、Excel 匯入及既有帳本覆蓋還原。請定期手動下載，並以非正式帳本演練。

自架更新：先備份現有資料，在已有 schema 的專案執行 `supabase/backup.sql`，再建置發布前端。不要重跑 `schema.sql` 或 `setup.sql`。SQL 新增受登入及帳本權限保護的匯出／還原函式，不修改現有帳務資料。

## English

Download `.ledger.json` from Settings → 完整備份與還原. It contains both shops' entries, products and opening stock, settings, and edit history. Stock is reconstructed from original records without replaying sales. Excel is a review export and cannot be imported for restore.

1. For cloud ledgers, synchronize every device before downloading while online. The snapshot includes cloud data at capture time, not pending changes on other devices.
2. Store the file privately in a safe location. It is unencrypted and contains business records; never publish it in GitHub, Issues or shared links.
3. Select a file, review its source, time and counts, then confirm. Both local and cloud ledgers must have no records, history or pending operations. Existing ledgers are rejected; overwrite and merge are unsupported.
4. Cloud backups can be restored into a newly provisioned, authorized empty ledger. Provision its account/project and backend separately. Demo and cloud backups cannot be mixed. Demo clearing affects only that browser's demo data.
5. If the network response is lost after restoration, synchronize and check the records first. Do not delete data to retry.

Format version 1 includes a SHA-256 checksum for corruption detection, not a signature or encryption. The file limit is 20 MB, with at most 50,000 records and 100,000 history rows. These are safety limits, not performance guarantees. Cloud restoration is atomic within a database transaction.

This backs up ledger data, not passwords, authorization, application code or Supabase project configuration. Scheduling, encryption, Excel import and overwriting existing ledgers are not included. Download regularly and rehearse on a non-production ledger.

Self-hosted upgrade: back up existing data, run `supabase/backup.sql` on the already initialized project, then build and deploy the frontend. Do not rerun `schema.sql` or `setup.sql`. The additive functions require authentication and ledger membership and do not alter existing ledger data when installed.
