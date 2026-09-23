import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  makeBackup,
  readBackup,
  validateSnapshot,
  type Snapshot,
} from "./backup-format";
import { captureBackup, restoreBackup } from "./backup";
import { db, openAccount, save } from "./storage";
import { makeRow, stock, totals, defaults } from "./domain";
const date = "2026-09-23";
beforeEach(() => openAccount("test-backup-" + crypto.randomUUID()));
async function fixture() {
  const p = makeRow("demo", "product", {
    name: "測試豆",
    category: "豆",
    price: 500,
    opening: 10,
    unit: "包",
    sellable: true,
    active: true,
  });
  await save(p);
  const sale = makeRow("demo", "entry", {
    store: "coffee",
    type: "sale",
    date,
    amount: 900,
    note: "熟客",
    category: "",
    lines: [{ productId: p.id, name: "測試豆", quantity: 2, price: 500 }],
    voided: false,
  });
  await save(sale);
  await save(
    makeRow("demo", "entry", {
      store: "coffee",
      type: "refund",
      date,
      amount: 400,
      note: "部分退貨",
      category: "",
      originalId: sale.id,
      lines: [
        {
          productId: p.id,
          name: "測試豆",
          quantity: 1,
          price: 500,
          restock: true,
        },
      ],
      voided: false,
    }),
  );
  await save(
    makeRow("demo", "entry", {
      store: "print",
      type: "income",
      date,
      amount: 80,
      note: "影印",
      category: "",
      lines: [],
      voided: false,
    }),
  );
  await save(makeRow("demo", "settings", defaults));
  return p.id;
}
describe("完整備份格式與本機原子還原", () => {
  it("保留試用介面使用的固定設定 ID", async () => {
    await save({ ...makeRow("demo", "settings", defaults), id: "demo-settings" });
    const b = await captureBackup("demo");
    openAccount("restore-settings-" + crypto.randomUUID());
    await restoreBackup(await readBackup(JSON.stringify(b)), "demo");
    expect((await db.records.get("demo-settings"))?.data).toEqual(defaults);
  });
  it("往返保留兩店金額、退款、庫存、設定、歷史，沒有重播交易", async () => {
    const id = await fixture();
    const before = await db.records.toArray();
    const backup = await captureBackup("demo");
    expect(backup.snapshot.history).toHaveLength(5);
    openAccount("restore-" + crypto.randomUUID());
    await restoreBackup(await readBackup(JSON.stringify(backup)), "demo");
    const restored = await db.records.toArray();
    expect(restored).toEqual(before);
    expect(stock(restored, id)).toBe(9);
    expect(totals(restored, "all", date, date)).toEqual(
      totals(before, "all", date, date),
    );
    expect(await db.history.count()).toBe(5);
    expect(await db.outbox.count()).toBe(0);
    expect((await captureBackup("demo")).snapshot).toEqual(backup.snapshot);
  });
  it("拒絕毀損、錯誤版本、重複 ID、孤兒退款與無效歷史", async () => {
    await fixture();
    const b = await captureBackup("demo");
    const corrupt = structuredClone(b);
    corrupt.snapshot.records[0].version++;
    await expect(readBackup(JSON.stringify(corrupt))).rejects.toThrow("完整性");
    await expect(
      readBackup(JSON.stringify({ ...b, version: 2 })),
    ).rejects.toThrow("版本");
    const s = structuredClone(b.snapshot);
    s.records.push(s.records[0]);
    expect(() => validateSnapshot(s)).toThrow();
    const orphan = structuredClone(b.snapshot);
    orphan.records = orphan.records.filter((r) => r.kind !== "product");
    expect(() => validateSnapshot(orphan)).toThrow();
    const history = structuredClone(b.snapshot);
    history.history[0].record_id = crypto.randomUUID();
    expect(() => validateSnapshot(history)).toThrow();
  });
  it("非空白帳本不覆蓋，重複還原不重複記帳", async () => {
    await fixture();
    const b = await captureBackup("demo"),
      before = await db.records.toArray();
    await expect(restoreBackup(b, "demo")).rejects.toThrow("不是空白");
    expect(await db.records.toArray()).toEqual(before);
  });
  it("拒絕正式與試用混用以及無效 JSON", async () => {
    const b = await makeBackup(
      { owner: "demo", records: [], history: [] },
      "demo",
    );
    await expect(restoreBackup(b, crypto.randomUUID())).rejects.toThrow(
      "不能互相",
    );
    await expect(readBackup("not JSON")).rejects.toThrow("JSON");
  });
  it("歷史寫入失敗會回滾紀錄，保留空白帳本", async () => {
    await fixture();
    const b = await captureBackup("demo");
    openAccount("rollback-" + crypto.randomUUID());
    // Existing orphan history simulates an unexpected concurrent local write.
    const h = b.snapshot.history[0];
    await db.history.add({
      id: h.op_id,
      recordId: h.record_id,
      at: h.created_at,
      after: b.snapshot.records[0],
    });
    await expect(restoreBackup(b, "demo")).rejects.toThrow();
    expect(await db.records.count()).toBe(0);
  });
  it("保留過去盤點，不用現在庫存重新驗證盤點基準", async () => {
    const id = await fixture();
    await save(
      makeRow("demo", "entry", {
        store: "coffee",
        type: "count",
        date,
        amount: 0,
        note: "盤點",
        category: "",
        countExpected: 9,
        countActual: 7,
        lines: [{ productId: id, name: "測試豆", price: 500, quantity: -2 }],
        voided: false,
      }),
    );
    const b = await captureBackup("demo");
    expect(stock(b.snapshot.records, id)).toBe(7);
    await expect(readBackup(JSON.stringify(b))).resolves.toBeTruthy();
  });
});
