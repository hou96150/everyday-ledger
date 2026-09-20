import Dexie, { type Table } from "dexie";
import { createClient } from "@supabase/supabase-js";
import { type RecordRow, type Operation, validate } from "./domain";
const url = import.meta.env.VITE_SUPABASE_URL,
  key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const cloud =
  import.meta.env.VITE_PUBLIC_DEMO !== "true" && url && key
    ? createClient(url, key)
    : null;
class LedgerDB extends Dexie {
  records!: Table<RecordRow, string>;
  outbox!: Table<Operation, string>;
  meta!: Table<{ key: string; value: string }, string>;
  history!: Table<
    {
      id: string;
      recordId: string;
      at: string;
      before?: RecordRow;
      after: RecordRow;
    },
    string
  >;
  constructor(name: string) {
    super(name);
    this.version(1).stores({
      records: "id,kind",
      outbox: "id,status",
      meta: "key",
      history: "id,recordId,at",
    });
  }
}
export let db = new LedgerDB("ledger-locked");
export function openAccount(id: string) {
  db.close();
  db = new LedgerDB("two-store-ledger-" + id);
}
export async function list(target: LedgerDB = db) {
  return target.records.toArray();
}
export async function save(row: RecordRow, target: LedgerDB = db) {
  await target.transaction(
    "rw",
    [target.records, target.outbox, target.history, target.meta],
    async () => {
      const rows = await list(target);
      validate(row, rows);
      const before = await target.records.get(row.id);
      if (row.version !== 0 && before && row.version !== before.version)
        throw Error("這筆紀錄已更新，請關閉後重新開啟再修改");
      const sequence =
        Number((await target.meta.get("sequence"))?.value || 0) + 1;
      await target.meta.put({ key: "sequence", value: String(sequence) });
      const next = {
        ...row,
        version: (before?.version || 0) + 1,
        updated_at: new Date().toISOString(),
      };
      const id = crypto.randomUUID();
      await target.records.put(next);
      await target.outbox.add({
        id,
        sequence,
        record: next,
        base: before?.version || 0,
        status: "pending",
      });
      await target.history.add({
        id,
        recordId: row.id,
        at: next.updated_at,
        before,
        after: next,
      });
    },
  );
}
let syncing = false;
export async function sync(owner: string) {
  if (!cloud || !navigator.onLine || syncing || owner === "demo") return;
  const target = db;
  syncing = true;
  try {
    const session = await cloud.auth.getSession();
    if (!session.data.session)
      throw Error("請重新登入後同步，待同步資料仍保留在裝置");
    if (session.data.session.user && session.data.session.user.id !== owner)
      throw Error("請重新登入原帳號後同步，待同步資料仍保留在裝置");
    const ops = await target.outbox.toArray();
    ops.sort(
      (a, b) =>
        (a.sequence ?? 0) - (b.sequence ?? 0) ||
        a.record.updated_at.localeCompare(b.record.updated_at) ||
        a.base - b.base,
    );
    const blocked = new Set<string>();
    for (const op of ops) {
      if (op.status === "conflict" || op.status === "error") {
        blocked.add(op.record.id);
        continue;
      }
      if (blocked.has(op.record.id)) continue;
      const { data, error } = await cloud.rpc("submit_ledger_operation", {
        p_op: op.id,
        p_id: op.record.id,
        p_kind: op.record.kind,
        p_base: op.base,
        p_data: op.record.data,
      });
      if (error) {
        if (
          !error.code ||
          (!error.code.startsWith("22") &&
            !error.code.startsWith("23") &&
            error.code !== "P0001")
        )
          throw error;
        await target.outbox.update(op.id, {
          status: "error",
          error: error.message,
        });
        blocked.add(op.record.id);
        continue;
      }
      if (data.conflict) {
        await target.outbox.update(op.id, {
          status: "conflict",
          remote: data.current,
          error: data.reason || "另一台裝置已修改這筆資料",
        });
        blocked.add(op.record.id);
        continue;
      }
      await target.outbox.delete(op.id);
    }
    // Full, paginated snapshots avoid skipped updates caused by out-of-order commit cursors.
    let offset = 0;
    const remote: RecordRow[] = [];
    while (true) {
      const res = await cloud
        .from("ledger_records")
        .select("*")
        .order("id")
        .range(offset, offset + 999);
      if (res.error) throw res.error;
      remote.push(...(res.data as RecordRow[]));
      if (res.data.length < 1000) break;
      offset += 1000;
    }
    await target.transaction(
      "rw",
      [target.records, target.outbox, target.meta],
      async () => {
        const pending = new Set(
          (await target.outbox.toArray()).map((o) => o.record.id),
        );
        await target.records.bulkPut(remote.filter((r) => !pending.has(r.id)));
        await target.meta.put({
          key: "lastSync",
          value: new Date().toISOString(),
        });
      },
    );
  } finally {
    syncing = false;
  }
}
export async function resolve(op: Operation, keepLocal: boolean) {
  const target = db;
  if (!cloud) throw Error("尚未設定雲端");
  const response = await cloud
    .from("ledger_records")
    .select("*")
    .eq("id", op.record.id)
    .maybeSingle();
  if (response.error) throw response.error;
  const remote = response.data as RecordRow | null;
  if(op.status==='conflict'&&(remote?.version||0)!==(op.remote?.version||0)){
    await target.outbox.update(op.id,{remote:remote||undefined,error:'雲端又有新版本，請再次核對後選擇'});
    return;
  }
  const current = await target.records.get(op.record.id);
  if (
    !keepLocal &&
    current &&
    !confirm("使用雲端版本會撤回本機對這筆紀錄尚未同步的修改。確定嗎？")
  )
    return;
  if (keepLocal && op.error?.includes("盤點"))
    throw Error("盤點基準已改變，請先使用雲端版本撤回，再重新盤點");
  await target.transaction(
    "rw",
    [target.records, target.outbox, target.history, target.meta],
    async () => {
      const latest=await target.records.get(op.record.id);
      if(latest?.version!==current?.version)throw Error('本機紀錄剛剛已更新，請重新核對後再選擇');
      const related = (await target.outbox.toArray()).filter(
        (x) => x.record.id === op.record.id,
      );
      await target.outbox.bulkDelete(related.map((x) => x.id));
      if (remote) await target.records.put(remote);
      else await target.records.delete(op.record.id);
      if (keepLocal && current)
        await save({ ...current, version: remote?.version || 0 }, target);
    },
  );
}
