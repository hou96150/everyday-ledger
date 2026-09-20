import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { openAccount, save, db, list } from "./storage";
import { makeRow, type Product } from "./domain";
beforeEach(() => openAccount(crypto.randomUUID()));
describe("離線持久化", () => {
  it("帳目、待同步與歷史一起保存，重新開啟不遺失", async () => {
    const id = crypto.randomUUID();
    openAccount(id);
    const p = makeRow(id, "product", {
      name: "豆",
      unit: "包",
      category: "豆",
      price: 500,
      opening: 10,
      sellable: true,
      active: true,
    });
    await save(p);
    expect(await db.outbox.count()).toBe(1);
    expect(await db.history.count()).toBe(1);
    openAccount(id);
    expect((await list())[0].data).toEqual(p.data);
    expect(await db.outbox.count()).toBe(1);
  });
  it("同筆連續修改保留正確原版本", async () => {
    const p = makeRow("u", "product", {
      name: "豆",
      unit: "包",
      category: "豆",
      price: 500,
      opening: 10,
      sellable: true,
      active: true,
    });
    await save(p);
    await save({ ...p, data: { ...(p.data as Product), price: 600 } });
    const ops = await db.outbox.toArray();
    expect(ops.map((o) => o.base).sort()).toEqual([0, 1]);
    expect((await list())[0].version).toBe(2);
  });
  it("無效輸入不產生半筆帳", async () => {
    const p = makeRow("u", "product", {
      name: "",
      unit: "包",
      category: "豆",
      price: 500,
      opening: 10,
      sellable: true,
      active: true,
    });
    await expect(save(p)).rejects.toThrow();
    expect(await db.records.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });
});
