# 自行部署 / Self-hosting

[README](../README.md) · [架構 / Architecture](ARCHITECTURE.md)

## 繁體中文

### A. 只要離線試用

執行 README 的本機啟動指令即可。若要自動載入虛構範例，將 `VITE_PUBLIC_DEMO=true` 寫進 `.env.local`。試用版沒有雲端帳號或同步，請勿當成已備份的正式帳本。

### B. 建立自己的家庭雲端帳本

每個家庭使用獨立 Supabase 專案與前端網址。不要將資料寫入作者的部署。本指南適用於**空白新專案**；基礎 schema／setup SQL 不是可重複執行的更新腳本。

1. 在 Supabase 建立新專案。依序將 `supabase/schema.sql`、`supabase/setup.sql`、`supabase/backup.sql` 放入該專案 SQL Editor 執行。
2. 在 Authentication 設定保留 Email/password 登入，關閉公開註冊（Allow new users to sign up）、匿名登入及不需要的登入提供者。開通函式使用管理 API 建立並確認帳號，不依賴公開註冊或真正寄信。
3. 依官方 [CLI 安裝指南](https://supabase.com/docs/guides/local-development/cli/getting-started) 準備 CLI。先用 `supabase functions deploy --help` 確認版本支援的參數，再部署：

```bash
supabase login
supabase functions deploy setup-household --project-ref YOUR_PROJECT_REF --no-verify-jwt
```

這裡允許未登入呼叫，是因為使用者還沒有帳號。**函式改以 256-bit 單次設定碼驗證**，伺服器只保存其 SHA-256 雜湊，成功開通後失效；不是沒有驗證的註冊 API。不要移除 token 檢查。管理金鑰由 Supabase Edge runtime 提供，禁止放入前端。

4. 在本機專案執行：

```bash
node scripts/create-setup-code.mjs
```

腳本只建立兩個本機私密檔案，**不連線資料庫**：`private/setup-code.txt`（稍後貼入網站）與 `private/setup.sql`（只含雜湊）。把後者內容貼到自己的 Supabase SQL Editor 執行一次。腳本不覆寫已存在的檔案；SQL 不覆寫已有的 bootstrap row。若遇到既有紀錄，先核對專案與帳號狀態。

5. 從 `.env.example` 建立 `.env.local`，填入你自己專案的 URL 與 **publishable key**：

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

不要設定 `VITE_PUBLIC_DEMO=true`。不要把 service-role 或 secret key 放入任何 `VITE_` 變數。公開連線資訊不是授權機制；真正資料隔離依賴會員檢查與 RLS。

6. `npm test`、`npm run build`。將 `dist` 部署到支援 HTTPS 的靜態主機；只有該目錄應被上傳。

提供的 `wrangler.toml` 可用於 Cloudflare Pages。先將 `name` 改成你自己的唯一專案名稱，再使用 CLI：

```bash
npx wrangler login
npx wrangler pages project create YOUR_PAGES_NAME --production-branch main
npx wrangler pages deploy dist --project-name YOUR_PAGES_NAME --branch main
```

某些新版 Wrangler 對不存在的 Pages 專案會自動轉交 Workers。若回報這類轉交失敗，確認目前 CLI 的 `pages project create --help`；支援時僅在建立指令加 `--force` 選擇原 Pages 模式，既有專案部署不加此參數。主機方案、配額與費用請以供應商當時設定為準。

7. 開啟你部署的網站，選「第一次使用？設定家庭帳號」，貼入本機設定碼，自訂 3–32 位英文數字或底線的帳號及至少 12 位密碼。密碼不要放進 GitHub、Issues 或截圖。
8. 完成開通後，家人以同一帳號登入。內部身份以 `username@household-ledger.invalid` 表示，不是真實信箱。若忘記密碼，由管理者用 Supabase 管理 API 安全重設；不要刪除帳號再建同名帳號，因為資料依 UUID 歸屬。

部署流程參考 [Supabase 官方文件](https://supabase.com/docs/guides/functions/deploy)；驗證公開註冊設定可參考 [Auth configuration](https://supabase.com/docs/guides/auth/general-configuration)。

### C. 正式使用前的驗收

在 A、B 兩台裝置登入你的家庭帳號。先新增一個測試品項，確認另一台能讀取。A 斷網後登記一筆，等待「已儲存」再重開；恢復網路，B 應只看到一次。兩台修改同筆紀錄，應顯示衝突。下載 Excel 核對單店與合計；完成後將測試交易作廢、停用測試品項，保留稽核歷史。打烊時確認每台裝置無待同步紀錄。

「設定」提供手動完整備份與空白帳本還原，見 [備份指南](BACKUP.md)。既有部署只需新增執行 `supabase/backup.sql`，不要重跑 schema／setup。正式使用前以虛構資料演練；Excel 匯出不能替代還原方案。

### D. Fork 的公開試用網站

`.github/workflows/demo.yml` 只建置本機試用，不使用任何 Supabase secrets。Fork 後將 deploy job 的 `github.repository` 條件改成自己的 `OWNER/REPO`，並在 Settings → Pages 選擇 GitHub Actions。基底路徑自動使用倉庫名稱。不要將家庭部署的環境變數放入公開試用 workflow。

## English

### A. Local demo only

Follow the README quick start. Set `VITE_PUBLIC_DEMO=true` in `.env.local` to populate fictional examples. The demo has no cloud accounts or synchronization and is not a backed-up production ledger.

### B. Your own household backend

Use a separate Supabase project and frontend URL per household. Never use the author's deployment. These instructions are for a **new, empty project**; the SQL files are not repeatable upgrade migrations.

1. Create a Supabase project. Execute `supabase/schema.sql`, then `supabase/setup.sql` and `supabase/backup.sql`, in its SQL Editor.
2. Keep Email/password login enabled, but disable public signups, anonymous sign-in and unused providers. Bootstrap uses the admin API to create a confirmed identity, without public signup or real email delivery.
3. Install the CLI using the [official guide](https://supabase.com/docs/guides/local-development/cli/getting-started), inspect `supabase functions deploy --help`, and run:

```bash
supabase login
supabase functions deploy setup-household --project-ref YOUR_PROJECT_REF --no-verify-jwt
```

Bootstrap cannot require a login that does not yet exist. Instead, the function validates a **256-bit one-time setup code**, storing only its SHA-256 hash and consuming it after setup. Keep that check intact. Administrative credentials remain in the Edge runtime, never the frontend.

4. Run `node scripts/create-setup-code.mjs`. This is a local-only generator, not a database command. It creates `private/setup-code.txt` and a hash-only `private/setup.sql`. Execute the generated SQL once in your own project's SQL Editor. Existing files and bootstrap rows are not overwritten; investigate existing state before retrying.
5. Copy `.env.example` to `.env.local` and supply your project's URL and publishable key:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Leave `VITE_PUBLIC_DEMO` unset. Never put secret or service-role keys in `VITE_` variables. Public connection details do not grant ledger membership; server authorization and RLS enforce ownership.

6. Run `npm test` and `npm run build`, then upload only `dist` to an HTTPS static host. For Cloudflare Pages, change the name in `wrangler.toml` and use:

```bash
npx wrangler login
npx wrangler pages project create YOUR_PAGES_NAME --production-branch main
npx wrangler pages deploy dist --project-name YOUR_PAGES_NAME --branch main
```

Some newer Wrangler versions delegate creation to Workers. If that delegation fails, inspect `pages project create --help`; where supported, use `--force` only on project creation to select the original Pages mode. Do not add it to deployment of an existing project. Hosting plans, quotas and charges depend on your provider settings.

7. Visit your site, choose **第一次使用？設定家庭帳號**, paste the setup code and choose a 3–32-character alphanumeric/underscore username plus a password of at least 12 characters. Keep passwords out of GitHub, issues and screenshots.
8. Family members share this account. Internally it maps to `username@household-ledger.invalid`, not a real inbox. Forgotten passwords require a trusted admin reset. Do not delete/recreate the identity: records belong to its UUID.

References: [Supabase deployment](https://supabase.com/docs/guides/functions/deploy), [Auth configuration](https://supabase.com/docs/guides/auth/general-configuration).

### C. Acceptance before business use

Sign in on two actual devices. Add a test product and confirm the other device reads it. Disconnect A, save an entry and wait for confirmation before reopening. Reconnect; B should see the entry exactly once. Edit the same record on both devices and verify conflict handling. Export Excel and reconcile shop/combined totals. Void test transactions and deactivate the test product afterward, retaining history. Check every device for pending operations at closing time.

Settings provides manual ledger backups and empty-ledger restore; see [Backup guide](BACKUP.md). Existing deployments should run only the additive `supabase/backup.sql`, not schema/setup again. Rehearse with fictional data before business use. Excel is not a restoration plan.

### D. Demo on a fork

The demo workflow builds without Supabase secrets. Change its deploy job's repository condition to your `OWNER/REPO` and select GitHub Actions under Settings → Pages. The base path is derived from the repository name. Do not add household deployment variables to the public-demo workflow.
