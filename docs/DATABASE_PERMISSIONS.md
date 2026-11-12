# 資料庫權限整理 / Database permission hardening

## 繁體中文

正式 Supabase 專案已套用遷移 `ledger_least_privilege`（2026-09-23）。此變更沒有修改帳目、資料表結構或既有 RLS 政策。

- 登入家庭帳號可讀取經 RLS 限制的自家帳本資料；寫入仍透過資料庫 RPC 驗證。
- `ledger_accounts` 不再授予一般登入者寫入、刪除或 TRUNCATE 權限；這些操作不受 RLS 保護。
- `service_role` 只保留 Edge Function 開通家庭帳號所需的會員讀取／新增、設定列讀取／更新，以及兩個開通 RPC。
- Supabase Data API 的匿名角色不可讀寫帳本。未來由 `postgres` 建立的應用資料表、序列與函式不再自動授權給 API 角色；須明確授權。
- `auth`、`storage`、`realtime` 等 Supabase 管理 schema 及 `supabase_admin` 預設權限沒有更動。管理者仍可透過 SQL Editor 管理資料庫。

新安裝：依序執行 `schema.sql`、`setup.sql`、`backup.sql`、`permissions.sql`。已安裝專案只執行尚未套用的 migration，不要重跑初始 schema。以 `verify-permissions.sql` 唯讀核對實際權限；再用隔離且全數回滾的虛構資料交易檢查記帳、衝突、RLS 與備份還原。絕不可在正式帳本執行 TRUNCATE 作為拒絕測試。

經驗證範圍：正式資料庫唯讀權限閘門通過；隔離交易通過建立與重送記帳、版本衝突、跨帳號隔離、拒絕非空白還原、空白還原及開通 RPC 呼叫，並以 ROLLBACK 清除測試資料。尚未以真實密碼執行瀏覽器登入或兩台店內裝置驗收。Supabase advisor 的既有「外洩密碼保護未開啟」為 Auth 設定提醒，與本次資料庫權限變更無關。

## English

The production Supabase project applied migration `ledger_least_privilege` on 2026-09-23. It changed no ledger rows, table structure, or existing RLS policies.

- Authenticated household members can read their own RLS-filtered ledger data; writes continue through validated database RPCs.
- Authenticated users no longer have write, delete, or TRUNCATE privileges on `ledger_accounts`; those operations are not protected by RLS.
- `service_role` retains only the membership read/insert, setup-row read/update, and two setup RPCs required by the household bootstrap Edge Function.
- The anonymous Data API role cannot access ledger data. Application tables, sequences, and functions created by `postgres` no longer receive automatic API-role grants; access must be granted explicitly.
- Supabase-managed schemas such as `auth`, `storage`, and `realtime`, and `supabase_admin` defaults were not changed. Administrators retain SQL Editor database access.

For a new installation, apply `schema.sql`, `setup.sql`, `backup.sql`, then `permissions.sql`. Existing installations should apply only unapplied migrations; do not rerun the initial schema. Run `verify-permissions.sql` for read-only ACL verification, then use a rollback-only transaction with fictional data to check writes, conflicts, RLS, and backup/restore. Never test denial by issuing TRUNCATE against the production ledger.

Verified: the production read-only permission gate passed. A rollback-only transaction passed save/idempotent retry, version conflict, cross-account isolation, non-empty restore rejection, empty restore, and setup RPC checks; synthetic data was rolled back. Real-password browser login and two physical shop devices were not tested. Supabase's existing leaked-password-protection Auth warning is unrelated to this database ACL change.
