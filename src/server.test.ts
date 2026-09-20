import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
const pg = new PGlite();
const owner = "11111111-1111-4111-8111-111111111111";
let product = crypto.randomUUID(),
  sale = crypto.randomUUID();
const p = {
  name: "測試豆",
  unit: "包",
  category: "咖啡豆",
  price: 500,
  opening: 10,
  sellable: true,
  active: true,
};
const e = (type: string, amount: number, quantity: number, extra = {}) => ({
  store: "coffee",
  type,
  date: "2026-09-19",
  amount,
  note: "測試",
  category: "",
  voided: false,
  lines: quantity
    ? [{ productId: product, name: "測試豆", quantity, price: 500 }]
    : [],
  ...extra,
});
async function submit(
  id: string,
  kind: string,
  data: unknown,
  base = 0,
  op = crypto.randomUUID(),
) {
  return (
    await pg.query<{ result: any }>(
      "select public.submit_ledger_operation($1,$2,$3,$4,$5::jsonb) as result",
      [op, id, kind, base, JSON.stringify(data)],
    )
  ).rows[0].result;
}
beforeAll(async () => {
  await pg.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;insert into auth.users values('${owner}');select set_config('request.jwt.claim.sub','${owner}',false);`,
  );
  await pg.exec(readFileSync("supabase/schema.sql", "utf8"));
  await pg.exec(
    `insert into public.ledger_accounts values('${owner}');set role authenticated;`,
  );
}, 30000);
afterAll(async () => pg.close());
describe("伺服器 PostgreSQL 帳務與權限", () => {
  it("授權帳號可建立品項", async () => {
    expect((await submit(product, "product", p)).ok).toBe(true);
  });
  it("同一操作重送不重複入帳", async () => {
    const op = crypto.randomUUID(),
      data = e("sale", 900, 2);
    expect((await submit(sale, "entry", data, 0, op)).ok).toBe(true);
    expect((await submit(sale, "entry", data, 0, op)).duplicate).toBe(true);
    const n = await pg.query<{ n: number }>(
      "select count(*)::int n from ledger_records where kind='entry'",
    );
    expect(n.rows[0].n).toBe(1);
  });
  it("過期版本回傳衝突且不覆蓋", async () => {
    const res = await submit(sale, "entry", e("sale", 500, 1), 0);
    expect(res.conflict).toBe(true);
    expect(res.current.data.amount).toBe(900);
  });
  it("拒絕無效退款並整筆回滾", async () => {
    const id = crypto.randomUUID();
    await expect(
      submit(
        id,
        "entry",
        e("refund", 1000, 1, {
          originalId: sale,
          lines: [
            {
              productId: product,
              name: "豆",
              quantity: 1,
              price: 500,
              restock: true,
            },
          ],
        }),
      ),
    ).rejects.toThrow("累計退款");
    expect(
      (await pg.query("select id from ledger_records where id=$1", [id])).rows,
    ).toHaveLength(0);
  });
  it("接受部分退款；原單不能改小到超退", async () => {
    await submit(
      crypto.randomUUID(),
      "entry",
      e("refund", 450, 1, {
        originalId: sale,
        lines: [
          {
            productId: product,
            name: "豆",
            quantity: 1,
            price: 500,
            restock: true,
          },
        ],
      }),
    );
    await expect(submit(sale, "entry", e("sale", 400, 1), 1)).rejects.toThrow(
      "累計退款",
    );
  });
  it("盤點遇到別台裝置改變庫存，必須核對", async () => {
    const res = await submit(
      crypto.randomUUID(),
      "entry",
      e("count", 0, 1, { countExpected: 8, countActual: 9 }),
    );
    expect(res.conflict).toBe(true);
  });
  it("不能直接改表繞過帳務驗證", async () => {
    await expect(
      pg.exec(`update ledger_records set version=99`),
    ).rejects.toThrow("permission denied");
  });
  it("外人查不到資料且不能寫入", async () => {
    await pg.exec(
      "select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false)",
    );
    expect((await pg.query("select * from ledger_records")).rows).toHaveLength(
      0,
    );
    await expect(submit(crypto.randomUUID(), "product", p)).rejects.toThrow(
      "權限",
    );
    await pg.exec(
      `select set_config('request.jwt.claim.sub','${owner}',false)`,
    );
  });
  it("非會員與未登入無法呼叫內部寫入", async () => {
    await pg.exec("reset role;set role anon;");
    await expect(submit(crypto.randomUUID(), "product", p)).rejects.toThrow(
      "permission denied",
    );
    await pg.exec("reset role;set role authenticated;");
  });
});
