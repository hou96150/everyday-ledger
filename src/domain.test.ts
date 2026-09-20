import { describe, it, expect } from "vitest";
import {
  stock,
  totals,
  validate,
  type RecordRow,
  type Entry,
  type Product,
} from "./domain";
const p: RecordRow = {
  id: "p",
  owner_id: "u",
  kind: "product",
  version: 1,
  updated_at: "",
  data: {
    name: "半磅豆",
    category: "豆",
    unit: "包",
    price: 500,
    opening: 10,
    sellable: true,
    active: true,
  } satisfies Product,
};
function entry(
  id: string,
  type: Entry["type"],
  amount = 0,
  qty = 0,
  extra: Partial<Entry> = {},
): RecordRow {
  return {
    id,
    owner_id: "u",
    kind: "entry",
    version: 1,
    updated_at: "",
    data: {
      store: "coffee",
      type,
      date: "2026-09-19",
      amount,
      note: "測試",
      category: "",
      voided: false,
      lines: qty
        ? [{ productId: "p", name: "豆", quantity: qty, price: 500 }]
        : [],
      ...extra,
    },
  };
}
describe("真實帳務情境", () => {
  it("銷售、補貨、付款不重複計算", () => {
    const rows = [
      p,
      entry("s", "sale", 900, 2),
      entry("in", "purchase", 0, 5),
      entry("pay", "expense", 1000),
    ];
    expect(stock(rows, "p")).toBe(13);
    expect(totals(rows, "coffee", "2026-09-19", "2026-09-19")).toMatchObject({
      income: 900,
      expense: 1000,
      balance: -100,
    });
  });
  it("修改銷售與作廢依最新版本修正庫存", () => {
    const s = entry("s", "sale", 900, 2);
    expect(stock([p, s], "p")).toBe(8);
    expect(
      stock(
        [
          p,
          {
            ...s,
            data: {
              ...(s.data as Entry),
              lines: [{ productId: "p", name: "豆", quantity: 1, price: 500 }],
            },
          },
        ],
        "p",
      ),
    ).toBe(9);
    expect(
      stock([p, { ...s, data: { ...(s.data as Entry), voided: true } }], "p"),
    ).toBe(10);
  });
  it("贈送不計收入；退款回補庫存並扣淨收入", () => {
    const s = entry("s", "sale", 900, 2),
      r = entry("r", "refund", 450, 1, {
        originalId: "s",
        lines: [
          {
            productId: "p",
            name: "豆",
            quantity: 1,
            price: 500,
            restock: true,
          },
        ],
      });
    const rows = [p, s, r, entry("gift", "gift", 0, 1)];
    expect(stock(rows, "p")).toBe(8);
    expect(totals(rows, "all", "2026-09-19", "2026-09-19").net).toBe(450);
    expect(() => validate(r, rows)).not.toThrow();
  });
  it("防止超額退款及修改已退貨原單", () => {
    const s = entry("s", "sale", 900, 2),
      r = entry("r", "refund", 901, 1, { originalId: "s" });
    expect(() => validate(r, [p, s])).toThrow("累計退款");
    const returned = entry("r", "refund", 300, 2, { originalId: "s" });
    expect(() =>
      validate(entry("s", "sale", 900, 1), [p, s, returned]),
    ).toThrow("退貨數量");
  });
  it("兩店獨立且合計正確", () => {
    const rows = [
      p,
      entry("s", "sale", 900, 2),
      entry("print", "income", 80, 0, { store: "print" }),
      entry("printExpense", "expense", 20, 0, { store: "print" }),
    ];
    expect(totals(rows, "print", "2026-09-19", "2026-09-19").balance).toBe(60);
    expect(totals(rows, "all", "2026-09-19", "2026-09-19").balance).toBe(960);
    expect(stock(rows, "p")).toBe(8);
  });
  it("可負庫存，但商品數量不可為小數", () => {
    expect(stock([p, entry("s", "sale", 5500, 11)], "p")).toBe(-1);
    expect(() => validate(entry("s", "sale", 1, 0.5), [p])).toThrow("整數");
  });
  it("盤點差額与小數耗用精確", () => {
    const material = {
      ...p,
      data: { ...(p.data as Product), opening: 1, sellable: false },
    };
    expect(
      stock(
        [material, entry("use", "use", 0, 0.1), entry("use2", "use", 0, 0.2)],
        "p",
      ),
    ).toBe(0.7);
    expect(stock([p, entry("count", "count", 0, -2)], "p")).toBe(8);
  });
  it("品項已有紀錄不能刪除或改期初", () => {
    expect(() =>
      validate({ ...p, data: { ...(p.data as Product), deleted: true } }, [
        p,
        entry("s", "sale", 1, 1),
      ]),
    ).toThrow("已有紀錄");
  });
});
