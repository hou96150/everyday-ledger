import { db, cloud } from "./storage";
import {
  makeBackup,
  readBackup,
  type Backup,
  type Snapshot,
  type BackupHistory,
} from "./backup-format";
import type { RecordRow } from "./domain";
export async function captureBackup(owner: string): Promise<Backup> {
  const target = db;
  if (owner !== "demo") {
    if (!cloud || !navigator.onLine)
      throw Error("完整雲端備份需要連線並登入；請先恢復網路");
    if (await target.outbox.count())
      throw Error("請先完成本裝置同步並處理衝突，再下載完整備份");
    const { data, error } = await cloud.rpc("export_ledger_backup");
    if (error)
      throw Error("完整備份服務尚未啟用或暫時無法使用：" + error.message);
    if (data.owner !== owner) throw Error("登入帳號已變更，請重新開啟");
    const backup = await makeBackup(data, "cloud");
    if (await target.outbox.count())
      throw Error("備份期間新增了未同步資料，請同步後重試");
    return backup;
  }
  const snapshot = await target.transaction(
    "r",
    [target.records, target.history],
    async () => {
      const records = await target.records.toArray();
      const history: BackupHistory[] = (await target.history.toArray()).map(
        (h) => ({
          op_id: h.id,
          owner_id: owner,
          record_id: h.recordId,
          request: {
            id: h.recordId,
            kind: h.after.kind,
            base: h.before?.version || 0,
            data: h.after.data,
          },
          before_data: h.before?.data || null,
          after_data: h.after.data,
          created_at: h.at,
        }),
      );
      return { owner, records, history };
    },
  );
  return makeBackup(snapshot, "demo");
}
export function downloadBackup(backup: Backup) {
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = `日常帳本-${backup.mode}-${backup.createdAt.replace(/[:.]/g, "-")}.ledger.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function restoreBackup(input: Backup, owner: string) {
  const backup = await readBackup(JSON.stringify(input)),
    target = db;
  if ((owner === "demo") !== (backup.mode === "demo"))
    throw Error("試用備份與正式備份不能互相還原");
  if ((await target.outbox.count()) && owner !== "demo")
    throw Error("本裝置還有未同步資料，不能還原");
  if ((await target.records.count()) || (await target.history.count()))
    throw Error("目前帳本不是空白；為避免覆蓋，請改用空白帳本還原");
  if (owner !== "demo") {
    if (!cloud || !navigator.onLine) throw Error("正式還原需要連線並登入");
    const { data, error } = await cloud.rpc("restore_ledger_backup", {
      p_snapshot: backup.snapshot,
      p_target_owner: owner,
    });
    if (error)
      throw Error(
        "還原未完成：" +
          error.message +
          "。若連線中斷，請先同步檢查，勿重複登記。",
      );
    if (!data?.ok)
      throw Error("無法確認雲端還原結果，請先同步檢查；本機資料未覆蓋");
  }
  const snapshot: Snapshot = {
    ...backup.snapshot,
    owner,
    records: backup.snapshot.records.map((r) => ({
      ...r,
      owner_id: owner,
      version: owner === "demo" ? r.version : Math.max(1, r.version),
    })),
  };
  await target.transaction(
    "rw",
    [target.records, target.history, target.outbox, target.meta],
    async () => {
      if (
        (await target.records.count()) ||
        (await target.outbox.count()) ||
        (await target.history.count())
      )
        throw Error("本機資料已變更；請重新整理並同步確認，不會覆蓋本機紀錄");
      await target.records.bulkAdd(snapshot.records);
      const byId = new Map(snapshot.records.map((r) => [r.id, r]));
      await target.history.bulkAdd(
        backup.snapshot.history.map((h) => {
          const r = byId.get(h.record_id)!;
          const base = (h.request as { base: number }).base;
          return {
            id: h.op_id,
            recordId: h.record_id,
            at: h.created_at,
            before: h.before_data
              ? ({ ...r, version: base, data: h.before_data } as RecordRow)
              : undefined,
            after: {
              ...r,
              version: base + 1,
              data: h.after_data,
              updated_at: h.created_at,
            } as RecordRow,
          };
        }),
      );
      await target.meta.put({ key: "lastRestore", value: backup.createdAt });
      if (owner === "demo")
        await target.meta.put({ key: "demoInitialized", value: "yes" });
    },
  );
  return snapshot.records.length;
}
