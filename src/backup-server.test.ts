import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
const pg = new PGlite();
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222";
const p = crypto.randomUUID(),
  sale = crypto.randomUUID(),
  refund = crypto.randomUUID(),
  setting = crypto.randomUUID();
const data = {
  name: "豆",
  category: "豆",
  unit: "包",
  price: 500,
  opening: 10,
  sellable: true,
  active: true,
};
const time = "2026-09-23T00:00:00.000Z";
const row = (id: string, kind: string, data: unknown) => ({
  id,
  kind,
  data,
  owner_id: a,
  version: 1,
  updated_at: time,
});
const saleData = {
  store: "coffee",
  type: "sale",
  date: "2026-09-23",
  amount: 900,
  note: "",
  category: "",
  lines: [{ productId: p, name: "豆", price: 500, quantity: 2 }],
  voided: false,
};
const snapshot = {
  owner: a,
  records: [
    row(p, "product", data),
    row(sale, "entry", saleData),
    row(refund, "entry", {
      ...saleData,
      type: "refund",
      originalId: sale,
      amount: 400,
      lines: [{ ...saleData.lines[0], quantity: 1, restock: true }],
    }),
    row(setting, "settings", {
      coffee: "咖啡店",
      print: "影印店",
      categories: ["貨款"],
    }),
  ],
  history: [
    {
      op_id: crypto.randomUUID(),
      owner_id: a,
      record_id: p,
      request: { id: p, kind: "product", base: 0, data },
      before_data: null,
      after_data: data,
      created_at: time,
    },
  ],
};
async function rpc(name: string, value?: unknown) {
  return (
    await pg.query<{ r: any }>(
      `select public.${name}(${value === undefined ? "" : "$1::jsonb,auth.uid()"}) r`,
      value === undefined ? [] : [JSON.stringify(value)],
    )
  ).rows[0].r;
}
beforeAll(async () => {
  await pg.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;insert into auth.users values('${a}'),('${b}');`,
  );
  await pg.exec(readFileSync("supabase/schema.sql", "utf8"));
  await pg.exec(readFileSync("supabase/backup.sql", "utf8"));
  await pg.exec(
    `insert into ledger_accounts values('${a}'),('${b}');select set_config('request.jwt.claim.sub','${a}',false);set role authenticated;`,
  );
}, 30000);
afterAll(() => pg.close());
describe("PostgreSQL 完整備份及原子還原", () => {
  it("拒絕孤兒品項並全數回滾", async () => {
    const bad = structuredClone(snapshot);
    bad.records = bad.records.filter((r) => r.id !== p);
    await expect(rpc("restore_ledger_backup", bad)).rejects.toThrow();
    expect((await rpc("export_ledger_backup")).records).toHaveLength(0);
  });
  it("拒絕超額退款並全數回滾", async () => {
    const bad = structuredClone(snapshot);
    (bad.records[2].data as any).amount = 1000;
    await expect(rpc("restore_ledger_backup", bad)).rejects.toThrow("退款");
    expect((await rpc("export_ledger_backup")).records).toHaveLength(0);
  });
  it("歷史錯誤發生於紀錄寫入後，仍全數回滾", async () => {
    const bad = structuredClone(snapshot);
    bad.history[0].record_id = crypto.randomUUID();
    await expect(rpc("restore_ledger_backup", bad)).rejects.toThrow("歷史");
    expect((await rpc("export_ledger_backup")).records).toHaveLength(0);
  });
  it("空白帳本完整還原，保留原版號／歴史，庫存為 9", async () => {
    expect((await rpc("restore_ledger_backup", snapshot)).ok).toBe(true);
    const out = await rpc("export_ledger_backup");
    expect(out.records).toHaveLength(4);
    expect(out.records.every((r: any) => r.version === 1)).toBe(true);
    expect(out.history).toHaveLength(1);
    expect(out.history[0].op_id).toBe(snapshot.history[0].op_id);
    await pg.exec("reset role");
    const result = await pg.query<{ n: string }>(
      "select ledger_private.stock($1,$2) n",
      [a, p],
    );
    expect(Number(result.rows[0].n)).toBe(9);
    await pg.exec("set role authenticated");
  });
  it("再次還原拒絕，不改動既有帳本", async () => {
    await expect(rpc("restore_ledger_backup", snapshot)).rejects.toThrow(
      "不是空白",
    );
    expect((await rpc("export_ledger_backup")).records).toHaveLength(4);
  });
  it("其他帳號不能讀取帳本，ID 衝突不能覆蓋他人", async () => {
    await pg.exec(`select set_config('request.jwt.claim.sub','${b}',false)`);
    expect((await rpc("export_ledger_backup")).records).toHaveLength(0);
    await expect(rpc("restore_ledger_backup", snapshot)).rejects.toThrow();
    expect((await rpc("export_ledger_backup")).records).toHaveLength(0);
  });
  it("未登入角色不能呼叫備份或還原", async () => {
    await pg.exec("reset role;set role anon");
    await expect(rpc("export_ledger_backup")).rejects.toThrow();
    await expect(
      pg.query("select public.restore_ledger_backup($1::jsonb,$2::uuid)", [
        JSON.stringify(snapshot),
        a,
      ]),
    ).rejects.toThrow();
  });
  it("確認期間帳號改變，伺服器拒絕寫到另一個帳號", async () => {
    await pg.exec("reset role;set role authenticated");
    await expect(
      pg.query("select public.restore_ledger_backup($1::jsonb,$2::uuid)", [
        JSON.stringify(snapshot),
        a,
      ]),
    ).rejects.toThrow("帳號已變更");
  });
  it("超過 1000 筆歷史完整備份，還原到新的空白帳號會重新指定擁有者", async () => {
    const imported = JSON.parse(
      JSON.stringify(snapshot)
        .replaceAll(p, crypto.randomUUID())
        .replaceAll(sale, crypto.randomUUID())
        .replaceAll(refund, crypto.randomUUID())
        .replaceAll(setting, crypto.randomUUID()),
    );
    imported.history = Array.from({ length: 1005 }, () => ({
      ...imported.history[0],
      op_id: crypto.randomUUID(),
    }));
    expect((await rpc("restore_ledger_backup", imported)).ok).toBe(true);
    const result = await rpc("export_ledger_backup");
    expect(result.records.every((r: any) => r.owner_id === b)).toBe(true);
    expect(result.history).toHaveLength(1005);
    expect(result.history.every((h: any) => h.owner_id === b)).toBe(true);
  });
});
