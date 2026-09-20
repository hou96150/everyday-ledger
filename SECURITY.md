# 安全與資料邊界 / Security

## 繁體中文

本專案尚未接受獨立安全稽核。不要把家庭金鑰、密碼、設定碼、客戶資訊或真實帳本貼到公開 Issue。

發現可能洩漏資料或繞過權限的問題，請使用 GitHub Security 頁籤的 **Report a vulnerability** 私密通報。一般錯誤才使用公開 Issue。

- 前端只使用 publishable key；service-role／secret key 僅在伺服器。
- RLS 限制讀取，提交函式另查帳號會員資格；登入不等於擁有帳本權限。
- 初次開通碼只允許一次使用，伺服器存雜湊。`private/` 與 `.env*` 不提交。
- 本機 IndexedDB 未另外加密。共用瀏覽器設定檔會共用裝置資料；共用帳號也無個人操作歸屬。
- 對外部署需關閉 Supabase 公開註冊、使用 HTTPS，且自行備份及更新依賴。

### 已知相依通報

2026-09-20 的乾淨安裝報告 2 個 moderate 受影響項目，涉及 ExcelJS 的相依鏈。請用 `npm audit` 取得當前細節。此產品只匯出工作簿，不匯入外來 Excel；未主動使用 UUID 外部 buffer 路徑，但這不等同於正式不可利用性證明。尚未以不相容的強制升級替換相依；修復與回歸驗證列入 roadmap。

## English

This project has not had an independent security audit. Never post household credentials, bootstrap codes, customer data or actual ledger records in public issues. Use **Report a vulnerability** on GitHub's Security tab for potential data exposure or authorization bypass; use public issues for ordinary bugs.

Browsers use publishable keys only. Administrative keys remain on the server. RLS constrains reads and the submission function explicitly verifies membership. Bootstrap codes are one-time, hash-stored credentials. Private files and environment values are excluded from Git.

IndexedDB is not additionally encrypted. Shared browser profiles share device data; a shared account cannot attribute actions to individuals. Self-hosters should disable public Supabase signup, use HTTPS, maintain backups and update dependencies.

A clean installation on 2026-09-20 reported two moderate affected dependency entries involving the ExcelJS chain. Run `npm audit` for current detail. The app exports workbooks rather than importing untrusted Excel and does not intentionally call the UUID external-buffer path; this is not a formal non-exploitability finding. Breaking forced overrides have not been applied. Remediation and regression verification are on the roadmap.
