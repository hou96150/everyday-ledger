import { db } from "./storage";
import { makeRow, today, type Product, type Entry } from "./domain";

/** Synthetic local records only. Never called by a household production build. */
export async function seedPublicDemo() {
  await db.transaction("rw", db.records, async () => {
    if (await db.records.count()) return;
    const catalog: Product[] = [
      {
        name: "深焙配方豆・1 磅",
        category: "咖啡豆",
        unit: "包",
        price: 880,
        opening: 6,
        sellable: true,
        active: true,
      },
      {
        name: "經典配方豆・半磅",
        category: "咖啡豆",
        unit: "包",
        price: 500,
        opening: 10,
        sellable: true,
        active: true,
      },
      {
        name: "衣索比亞・半磅",
        category: "咖啡豆",
        unit: "包",
        price: 650,
        opening: 8,
        sellable: true,
        active: true,
      },
      {
        name: "濾掛咖啡・10 入",
        category: "濾掛咖啡",
        unit: "盒",
        price: 350,
        opening: 20,
        sellable: true,
        active: true,
      },
    ];
    const items = catalog.map((product) => makeRow("demo", "product", product));
    const entry = (data: Partial<Entry>) =>
      makeRow("demo", "entry", {
        store: "coffee",
        type: "sale",
        date: today(),
        amount: 0,
        category: "",
        note: "示範資料，非真實營業紀錄",
        lines: [],
        voided: false,
        ...data,
      } as Entry);
    await db.records.bulkAdd([
      ...items,
      entry({
        amount: 900,
        lines: [
          {
            productId: items[1].id,
            name: catalog[1].name,
            price: 500,
            quantity: 2,
          },
        ],
        note: "示範：兩包原價 1,000 元，熟客實收 900 元",
      }),
      entry({
        store: "print",
        type: "income",
        amount: 120,
        note: "示範：文件影印",
      }),
      entry({
        store: "print",
        type: "expense",
        amount: 40,
        category: "貨款",
        note: "示範：紙張支出",
      }),
    ]);
  });
}
