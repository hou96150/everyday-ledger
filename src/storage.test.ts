import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { openAccount, save, saveCategories, db, list } from "./storage";
import { makeRow, stock, type Product } from "./domain";
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
  it("批次分類一次儲存商品、歷史與待同步操作，重開後保留", async () => {
    const owner = crypto.randomUUID();
    openAccount(owner);
    const product = (name: string) =>
      makeRow(owner, "product", {
        name,
        unit: "包",
        category: "咖啡豆",
        price: 500,
        opening: 10,
        sellable: true,
        active: true,
      });
    const a = product("深焙"),
      b = product("淺焙");
    await save(a);
    await save(b);
    const before = await list();
    const changes = before.map((row) => ({
      id: row.id,
      version: row.version,
      category: "新品類",
    }));
    expect(await saveCategories(changes)).toBe(2);
    expect(await db.outbox.count()).toBe(4);
    expect(await db.history.count()).toBe(4);
    openAccount(owner);
    const after = await list();
    expect(after.map((row) => (row.data as Product).category)).toEqual([
      "新品類",
      "新品類",
    ]);
    expect(after.map((row) => stock(after, row.id))).toEqual([10, 10]);
    expect(
      await saveCategories(
        after.map((row) => ({
          id: row.id,
          version: row.version,
          category: "新品類",
        })),
      ),
    ).toBe(0);
    expect(await db.outbox.count()).toBe(4);
  });
  it("批次中有舊版本時全部回滾，不產生半筆分類", async () => {
    const owner = crypto.randomUUID();
    openAccount(owner);
    const product = (name: string) =>
      makeRow(owner, "product", {
        name,
        unit: "包",
        category: "咖啡豆",
        price: 500,
        opening: 10,
        sellable: true,
        active: true,
      });
    const a = product("甲"),
      b = product("乙");
    await save(a);
    await save(b);
    const before = await list();
    await expect(
      saveCategories(
        before.map((row, index) => ({
          id: row.id,
          version: index === 1 ? 0 : row.version,
          category: "新分類",
        })),
      ),
    ).rejects.toThrow("已變動");
    expect((await list()).map((row) => (row.data as Product).category)).toEqual(
      ["咖啡豆", "咖啡豆"],
    );
    expect(await db.outbox.count()).toBe(2);
    expect(await db.history.count()).toBe(2);
  });
});
