import { useState } from "react";
import { captureBackup, downloadBackup, restoreBackup } from "./backup";
import {
  backupSummary,
  MAX_BACKUP_BYTES,
  readBackup,
  type Backup,
} from "./backup-format";
import { db } from "./storage";
export function BackupPanel({
  owner,
  onRestored,
}: {
  owner: string;
  onRestored: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [backup, setBackup] = useState<Backup | null>(null),
    [confirmation, setConfirmation] = useState("");
  const summary = backup ? backupSummary(backup) : null;
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel backup-panel">
      <h2>完整備份與還原</h2>
      <p>
        保留兩間店的商品、期初庫存、帳目、退款關聯、設定與修改歷史。Excel
        是查帳報表，請使用這裡下載的專用 JSON 備份還原。
      </p>
      <p className="notice">
        備份含營業資料，未加密；請存放在私人位置。檔案不含密碼、登入憑證或雲端管理金鑰。
      </p>
      <button
        className="primary"
        disabled={busy}
        onClick={() =>
          void run(async () => {
            const b = await captureBackup(owner);
            downloadBackup(b);
            setNotice("備份檔已產生並送出下載，請確認瀏覽器下載完成。");
          })
        }
      >
        {busy ? "處理中…" : "下載完整備份"}
      </button>
      <p className="hint">
        正式帳本需連線並完成本機同步；請先確認其他裝置也已同步。試用備份僅供試用帳本還原。
      </p>
      <label className="field">
        <span>選擇備份檔（.json，最多 20 MB）</span>
        <input
          type="file"
          accept=".json,application/json"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            setBackup(null);
            setConfirmation("");
            e.target.value = "";
            if (!file) return;
            void run(async () => {
              if (file.size > MAX_BACKUP_BYTES) throw Error("檔案超過 20 MB");
              const b = await readBackup(await file.text());
              if ((owner === "demo") !== (b.mode === "demo"))
                throw Error("試用與正式備份不能互相還原");
              setBackup(b);
            });
          }}
        />
      </label>
      {backup && summary && (
        <div className="backup-preview">
          <h3>還原前確認</h3>
          <p>備份時間：{new Date(backup.createdAt).toLocaleString("zh-TW")}</p>
          <dl>
            <div>
              <dt>商品（含停用）</dt>
              <dd>{summary.products} 項</dd>
            </div>
            <div>
              <dt>咖啡店帳目</dt>
              <dd>{summary.coffee} 筆</dd>
            </div>
            <div>
              <dt>影印店帳目</dt>
              <dd>{summary.print} 筆</dd>
            </div>
            <div>
              <dt>修改歷史</dt>
              <dd>{summary.history} 筆</dd>
            </div>
          </dl>
          <p>
            只還原到空白帳本，不合併、不覆蓋現有紀錄，也不會重複扣庫存。還原會把資料歸屬到目前登入的帳本。
          </p>
          <label className="field">
            <span>輸入「還原空白帳本」確認</span>
            <input
              value={confirmation}
              disabled={busy}
              onChange={(e) => setConfirmation(e.target.value)}
              autoComplete="off"
            />
          </label>
          <div className="row-actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => {
                setBackup(null);
                setConfirmation("");
              }}
            >
              取消還原
            </button>
            <button
              className="primary"
              disabled={busy || confirmation !== "還原空白帳本"}
              onClick={() =>
                void run(async () => {
                  const n = await restoreBackup(backup, owner);
                  setBackup(null);
                  setConfirmation("");
                  setNotice(`還原完成，共 ${n} 筆紀錄，庫存依原帳目計算。`);
                  onRestored();
                })
              }
            >
              確認還原
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {owner === "demo" && (
        <details>
          <summary>測試還原：清空試用資料</summary>
          <p>
            先下載備份，再清空這個瀏覽器的試用帳本，便能測試還原。這不會影響正式帳本。
          </p>
          <button
            disabled={busy}
            className="secondary danger"
            onClick={() => {
              if (!confirm("確定清空此瀏覽器的試用帳本？請先下載備份。"))
                return;
              void run(async () => {
                await db.transaction(
                  "rw",
                  [db.records, db.history, db.outbox, db.meta],
                  async () => {
                    await db.records.clear();
                    await db.history.clear();
                    await db.outbox.clear();
                    await db.meta.clear();
                    await db.meta.put({ key: "demoInitialized", value: "yes" });
                  },
                );
                setNotice("試用帳本已清空，可以上傳備份還原。");
                onRestored();
              });
            }}
          >
            清空試用帳本
          </button>
        </details>
      )}
    </section>
  );
}
