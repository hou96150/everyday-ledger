# 參與日常帳本 / Contributing

## 繁體中文

先看 [README](README.md)、[設計](docs/DESIGN.md) 與 [架構](docs/ARCHITECTURE.md)。歡迎具體小修改：重現錯誤、鍵盤操作、文字可讀性、測試或文件。

1. 以 Issue 說明店務情境或錯誤。較大功能先討論，避免做出不同方向。
2. Fork 後用 Node.js 24，`npm ci`、`npm run dev`。
3. 使用虛構資料。不要提交 `.env*`（範例除外）、金鑰、帳號密碼、設定碼或真實帳本。
4. 有帳務或同步變更時加入能抓出回歸的測試，執行 `npm test`、`npm run build`。介面變更附手機與桌面截圖。
5. PR 說明問題、使用者行為如何改變、驗證方式及限制；文件關鍵事實保持中英文一致。

不要為現有家庭部署直接執行 schema 腳本、清除資料或重跑首次設定。討論請尊重彼此，保持聚焦。安全漏洞請見 [SECURITY.md](SECURITY.md)。提交貢獻前，請先確認 [授權狀態](docs/LICENSING.md)。

## English

Read the README, design and architecture first. Focused contributions are welcome: reproducible bugs, keyboard access, readable copy, tests and documentation. Open an issue before a substantial feature to agree on scope.

Fork, install Node.js 24, run `npm ci` and `npm run dev`. Use fictional records; never commit environment files except the example, credentials, setup codes or actual business data. Changes to bookkeeping or sync need meaningful regression coverage. Run `npm test` and `npm run build`; include mobile and desktop screenshots for UI changes.

Explain the problem, resulting user behavior, verification and limits in your PR. Keep key documentation facts equivalent in Chinese and English. Never rerun initial schema/setup or clear records on an existing household backend. Keep discussion respectful and focused. See the security policy for vulnerabilities and [licensing status](docs/LICENSING.md) before contributing code.
