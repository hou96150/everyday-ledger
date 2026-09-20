import { randomBytes, createHash } from 'node:crypto';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';

const files = ['private/setup-code.txt', 'private/setup.sql'];
if (files.some(existsSync)) {
  console.error('Existing setup files found. Nothing overwritten. / 已有設定檔，未覆寫。');
  process.exit(1);
}
mkdirSync('private', { recursive: true });
const token = randomBytes(32).toString('hex');
const hash = createHash('sha256').update(token).digest('hex');
writeFileSync(files[0], token + '\n', { flag: 'wx', mode: 0o600 });
writeFileSync(files[1], `-- New empty household project only. Does not overwrite existing state.\ninsert into public.ledger_setup (id, token_hash) values (1, '${hash}');\n`, { flag: 'wx', mode: 0o600 });
console.log('Created private/setup-code.txt and private/setup.sql. No database changes made.');
console.log('已建立私密設定碼與雜湊 SQL；尚未修改資料庫。請依 docs/SELF_HOSTING.md 操作。');
