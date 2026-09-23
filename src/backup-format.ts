import {
  defaults,
  entryNames,
  validate,
  type RecordRow,
  type Entry,
  type Product,
} from "./domain";
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;
export type BackupHistory = {
  op_id: string;
  owner_id: string;
  record_id: string;
  request: unknown;
  before_data: unknown;
  after_data: unknown;
  created_at: string;
};
export type Snapshot = {
  owner: string;
  records: RecordRow[];
  history: BackupHistory[];
};
export type Backup = {
  format: "everyday-ledger-backup";
  version: 1;
  createdAt: string;
  mode: "cloud" | "demo";
  snapshot: Snapshot;
  checksum: string;
};
const fail = (message = "備份格式不正確或資料關聯不完整") => {
  throw Error(message);
};
const obj = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === "string";
const uuid = (v: unknown) =>
  str(v) &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  if (obj(v))
    return (
      "{" +
      Object.keys(v)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + canonical(v[k]))
        .join(",") +
      "}"
    );
  return JSON.stringify(v);
}
async function digest(value: unknown) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical(value)),
  );
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export function validateSnapshot(value: unknown): asserts value is Snapshot {
  if (
    !obj(value) ||
    !str(value.owner) ||
    !Array.isArray(value.records) ||
    !Array.isArray(value.history)
  )
    fail();
  const s = value as Snapshot;
  if (s.owner !== "demo" && !uuid(s.owner)) fail();
  if (s.records.length > 50000 || s.history.length > 100000)
    fail("備份資料量超過本版支援範圍");
  const ids = new Set<string>();
  for (const r of s.records) {
    if (
      !obj(r) ||
      (!uuid(r.id) && !(s.owner === "demo" && r.kind === "settings" && r.id === "demo-settings")) ||
      r.owner_id !== s.owner ||
      ids.has(r.id) ||
      !Number.isSafeInteger(r.version) ||
      r.version < 0 ||
      !str(r.updated_at) ||
      !Number.isFinite(Date.parse(r.updated_at)) ||
      !obj(r.data)
    )
      fail();
    ids.add(r.id);
    const d = r.data as any;
    if (r.kind === "product") {
      if (
        !["name", "category", "unit"].every((k) => str(d[k])) ||
        typeof d.active !== "boolean" ||
        typeof d.sellable !== "boolean" ||
        (d.deleted !== undefined && typeof d.deleted !== "boolean")
      )
        fail();
    } else if (r.kind === "settings") {
      if (
        !str(d.coffee) ||
        !str(d.print) ||
        !Array.isArray(d.categories) ||
        !d.categories.every(str)
      )
        fail();
    } else if (r.kind === "entry") {
      if (
        !Object.hasOwn(entryNames, d.type) ||
        !["coffee", "print"].includes(d.store) ||
        !str(d.note) ||
        !str(d.category) ||
        !str(d.date) ||
        typeof d.voided !== "boolean" ||
        !Array.isArray(d.lines)
      )
        fail();
      for (const l of d.lines)
        if (
          !obj(l) ||
          !uuid(l.productId) ||
          !str(l.name) ||
          (d.type === "refund" && typeof l.restock !== "boolean")
        )
          fail();
    } else fail();
  }
  if (s.records.filter((r) => r.kind === "settings").length > 1)
    fail("備份包含重複店面設定");
  // Existing rows as the baseline preserve historical stock counts; never replay sales.
  for (const r of s.records) validate(r, s.records);
  const historyIds = new Set<string>();
  for (const h of s.history) {
    if (
      !obj(h) ||
      !uuid(h.op_id) ||
      historyIds.has(h.op_id) ||
      h.owner_id !== s.owner ||
      !ids.has(h.record_id) ||
      !obj(h.request) ||
      h.request.id !== h.record_id ||
      !Number.isSafeInteger(h.request.base) ||
      h.request.base < 0 ||
      !obj(h.after_data) ||
      (h.before_data !== null && !obj(h.before_data)) ||
      !str(h.created_at) ||
      !Number.isFinite(Date.parse(h.created_at))
    )
      fail("修改歷史格式或關聯不正確");
    historyIds.add(h.op_id);
  }
}
export async function makeBackup(
  snapshot: Snapshot,
  mode: Backup["mode"],
): Promise<Backup> {
  validateSnapshot(snapshot);
  const body = {
    format: "everyday-ledger-backup" as const,
    version: 1 as const,
    createdAt: new Date().toISOString(),
    mode,
    snapshot,
  };
  const backup = { ...body, checksum: await digest(body) };
  if (
    new TextEncoder().encode(JSON.stringify(backup, null, 2)).length >
    MAX_BACKUP_BYTES
  )
    fail("完整備份超過 20 MB，請改由管理者執行資料庫備份");
  return backup;
}
export async function readBackup(text: string): Promise<Backup> {
  if (new TextEncoder().encode(text).length > MAX_BACKUP_BYTES)
    fail("檔案超過 20 MB，請改由管理者處理");
  let b: any;
  try {
    b = JSON.parse(text);
  } catch {
    fail("無法讀取 JSON；Excel 不能當作完整備份上傳");
  }
  if (
    !obj(b) ||
    b.format !== "everyday-ledger-backup" ||
    b.version !== 1 ||
    !["cloud", "demo"].includes(b.mode) ||
    !str(b.createdAt) ||
    !Number.isFinite(Date.parse(b.createdAt)) ||
    !str(b.checksum)
  )
    fail("不是支援的日常帳本備份（版本 1）");
  const { checksum, ...body } = b;
  if (checksum !== (await digest(body)))
    fail("檔案完整性檢查失敗，請使用未修改的原始備份");
  validateSnapshot(b.snapshot);
  if ((b.mode === "demo") !== (b.snapshot.owner === "demo")) fail();
  return b as Backup;
}
export function backupSummary(b: Backup) {
  const rows = b.snapshot.records;
  return {
    products: rows.filter((r) => r.kind === "product").length,
    coffee: rows.filter(
      (r) => r.kind === "entry" && (r.data as Entry).store === "coffee",
    ).length,
    print: rows.filter(
      (r) => r.kind === "entry" && (r.data as Entry).store === "print",
    ).length,
    history: b.snapshot.history.length,
    settings: rows.find((r) => r.kind === "settings")?.data || defaults,
    inactive: rows.filter(
      (r) => r.kind === "product" && !(r.data as Product).active,
    ).length,
  };
}
