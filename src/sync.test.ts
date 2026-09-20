import "fake-indexeddb/auto";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
const transport = vi.hoisted(() => ({
  rpc: null as any,
  query: null as any,
  authenticated: true,
  fail: false,
  loseResponse: false,
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({
        data: { session: transport.authenticated ? {} : null },
      }),
    },
    rpc: async (_name: string, args: any) => {
      if (transport.fail)
        return {
          error: { message: "Network unavailable", code: "" },
          data: null,
        };
      try {
        const data = await transport.rpc(args);
        if (transport.loseResponse) {
          transport.loseResponse = false;
          throw Error("Response lost");
        }
        return { data, error: null };
      } catch (e) {
        return {
          error: { message: (e as Error).message, code: (e as any).code || "" },
          data: null,
        };
      }
    },
    from: () => ({
      select: () => ({
        eq: (_key:string,id:string)=>({maybeSingle:async()=>({data:(await transport.query()).find((r:any)=>r.id===id)||null,error:null})}),
        order: () => ({
          range: async () => ({ data: await transport.query(), error: null }),
        }),
      }),
    }),
  }),
}));
const pg = new PGlite();
const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
let storage: typeof import("./storage");
let domain: typeof import("./domain");
let productId = "";
let saleId = "";
beforeAll(async () => {
  vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "test");
  vi.stubGlobal("navigator", { onLine: true });
  await pg.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select '${owner}'::uuid$$;insert into auth.users values('${owner}');`,
  );
  await pg.exec(readFileSync("supabase/schema.sql", "utf8"));
  await pg.exec(`insert into public.ledger_accounts values('${owner}');`);
  transport.rpc = async (a: any) =>
    (
      await pg.query<{ result: any }>(
        "select submit_ledger_operation($1,$2,$3,$4,$5::jsonb) result",
        [a.p_op, a.p_id, a.p_kind, a.p_base, JSON.stringify(a.p_data)],
      )
    ).rows[0].result;
  transport.query = async () =>
    (await pg.query("select * from ledger_records order by id")).rows;
  storage = await import("./storage");
  domain = await import("./domain");
  storage.openAccount("test-device-a-" + owner);
}, 30000);
afterAll(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await pg.close();
});
describe("本機佇列到 PostgreSQL 的整合", () => {
  it("離線建立商品與銷售，連線按順序只同步一次", async () => {
    const p = domain.makeRow(owner, "product", {
      name: "豆",
      category: "咖啡",
      unit: "包",
      price: 500,
      opening: 10,
      sellable: true,
      active: true,
    });
    productId = p.id;
    await storage.save(p);
    const s = domain.makeRow(owner, "entry", {
      store: "coffee",
      type: "sale",
      date: "2026-09-19",
      amount: 900,
      note: "",
      category: "",
      voided: false,
      lines: [{ productId: p.id, name: "豆", quantity: 2, price: 500 }],
    });
    saleId = s.id;
    await storage.save(s);
    expect(await storage.db.outbox.count()).toBe(2);
    await storage.sync(owner);
    expect(await storage.db.outbox.count()).toBe(0);
    expect(domain.stock(await storage.list(), p.id)).toBe(8);
  });
  it("伺服器已成功但回應遺失，重試不重複", async () => {
    const s = (await storage.list()).find((r) => r.id === saleId)!;
    await storage.save({
      ...s,
      data: { ...(s.data as import("./domain").Entry), amount: 800 },
    });
    transport.loseResponse = true;
    await expect(storage.sync(owner)).rejects.toThrow("Response lost");
    expect(await storage.db.outbox.count()).toBe(1);
    await storage.sync(owner);
    expect(await storage.db.outbox.count()).toBe(0);
    expect(
      (await transport.query()).find((r: any) => r.id === saleId).version,
    ).toBe(2);
  });
  it("第二台裝置先改同筆，第一台保留本機修改並標示衝突", async () => {
    const local = (await storage.list()).find((r) => r.id === saleId)!;
    await storage.save({
      ...local,
      data: { ...(local.data as import("./domain").Entry), note: "第一台修改" },
    });
    await transport.rpc({
      p_op: crypto.randomUUID(),
      p_id: saleId,
      p_kind: "entry",
      p_base: 2,
      p_data: {
        ...(local.data as import("./domain").Entry),
        note: "第二台修改",
      },
    });
    await storage.sync(owner);
    const [op] = await storage.db.outbox.toArray();
    expect(op.status).toBe("conflict");
    expect((op.remote!.data as import("./domain").Entry).note).toBe(
      "第二台修改",
    );
    expect(
      ((await storage.db.records.get(saleId))!.data as import("./domain").Entry)
        .note,
    ).toBe("第一台修改");
  });
  it("登入過期時保留新紀錄，不當成已同步", async () => {
    const r = domain.makeRow(owner, "entry", {
      store: "print",
      type: "income",
      date: "2026-09-19",
      amount: 80,
      note: "列印",
      category: "",
      voided: false,
      lines: [],
    });
    await storage.save(r);
    transport.authenticated = false;
    await expect(storage.sync(owner)).rejects.toThrow("重新登入");
    expect(await storage.db.outbox.count()).toBe(2);
    transport.authenticated = true;
    await storage.sync(owner);
    expect(await storage.db.outbox.count()).toBe(1);
    expect(
      domain.totals(await storage.list(), "print", "2026-09-19", "2026-09-19")
        .income,
    ).toBe(80);
  });
  it("網路暫時失敗不把待同步改成永久錯誤", async () => {
    const p = (await storage.db.records.get(productId))!;
    await storage.save({
      ...p,
      data: { ...(p.data as import("./domain").Product), price: 550 },
    });
    transport.fail = true;
    await expect(storage.sync(owner)).rejects.toThrow("Network unavailable");
    const op = (await storage.db.outbox.toArray()).find(
      (o) => o.record.id === productId,
    )!;
    expect(op.status).toBe("pending");
    transport.fail = false;
    await storage.sync(owner);
    expect(
      (await transport.query()).find((r: any) => r.id === productId).data.price,
    ).toBe(550);
  });
  it('保留本機版本會以已確認的雲端版本重新提交',async()=>{
    const op=(await storage.db.outbox.toArray()).find(o=>o.record.id===saleId)!;
    await storage.resolve(op,true);await storage.sync(owner);
    expect(await storage.db.outbox.count()).toBe(0);
    expect((await transport.query()).find((r:any)=>r.id===saleId).data.note).toBe('第一台修改');
  });
  it('核對期間雲端再更新，不會直接覆蓋未看過的新版本',async()=>{
    const local=(await storage.db.records.get(saleId))!;
    await storage.save({...local,data:{...local.data as import('./domain').Entry,note:'本機待核對'}});
    await transport.rpc({p_op:crypto.randomUUID(),p_id:saleId,p_kind:'entry',p_base:local.version,p_data:{...local.data,note:'雲端版本一'}});
    await storage.sync(owner);
    const op=(await storage.db.outbox.toArray()).find(o=>o.record.id===saleId)!;
    await transport.rpc({p_op:crypto.randomUUID(),p_id:saleId,p_kind:'entry',p_base:local.version+1,p_data:{...local.data,note:'雲端版本二'}});
    await storage.resolve(op,true);
    const updated=(await storage.db.outbox.get(op.id))!;
    expect((updated.remote!.data as import('./domain').Entry).note).toBe('雲端版本二');
    expect(updated.error).toContain('再次核對');
    expect((await transport.query()).find((r:any)=>r.id===saleId).data.note).toBe('雲端版本二');
  });
});
