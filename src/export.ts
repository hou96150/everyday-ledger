import {
  entries,
  products,
  stock,
  stockDelta,
  totals,
  entryNames,
  type Entry,
  type Product,
  type RecordRow,
  type Settings,
  type Store,
} from "./domain";
export async function exportExcel(
  rows: RecordRow[],
  settings: Settings,
  store: Store | "all",
  from: string,
  to: string,
  status: string,
) {
  const { Workbook } = await import("exceljs");
  const book = new Workbook();
  book.creator = "日常帳本";
  book.created = new Date();
  const sheet = (
    name: string,
    head: string[],
    values: (string | number | boolean)[][],
  ) => {
    const ws = book.addWorksheet(name);
    ws.addRow(head);
    values.forEach((r) => ws.addRow(r));
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF76543D" },
    };
    ws.columns.forEach((c) => {
      c.width = 22;
    });
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(1, ws.rowCount), column: head.length },
    };
  };
  const stores: Store[] = store === "all" ? ["coffee", "print"] : [store];
  sheet(
    "摘要",
    [
      "店面",
      "起日",
      "迄日",
      "收入",
      "退款",
      "淨收入",
      "支出",
      "收支差額",
      "同步狀態",
    ],
    stores.map((s) => {
      const t = totals(rows, s, from, to);
      return [
        settings[s],
        from,
        to,
        t.income,
        t.refund,
        t.net,
        t.expense,
        t.balance,
        status,
      ];
    }),
  );
  if (store === "all") {
    const t = totals(rows, "all", from, to);
    const summary = book.getWorksheet("摘要")!;
    const totalRow = summary.addRow([
      "兩店合計",
      from,
      to,
      t.income,
      t.refund,
      t.net,
      t.expense,
      t.balance,
      status,
    ]);
    totalRow.font = { bold: true };
  }
  const es = entries(rows).filter((r) => {
    const e = r.data as Entry;
    return stores.includes(e.store) && e.date >= from && e.date <= to;
  });
  sheet(
    "收支明細",
    ["紀錄編號", "店面", "日期", "類型", "金額", "分類", "備註", "狀態"],
    es.map((r) => {
      const e = r.data as Entry;
      return [
        r.id,
        settings[e.store],
        e.date,
        entryNames[e.type],
        e.amount,
        e.category,
        e.note,
        e.voided ? "已作廢" : "有效",
      ];
    }),
  );
  sheet(
    "銷售與退貨明細",
    [
      "交易編號",
      "店面",
      "日期",
      "類型",
      "商品",
      "數量",
      "原單價",
      "整筆實收或退款",
      "備註",
      "狀態",
    ],
    es
      .filter((r) => ["sale", "refund"].includes((r.data as Entry).type))
      .flatMap((r) => {
        const e = r.data as Entry;
        return e.lines.map((l) => [
          r.id,
          settings[e.store],
          e.date,
          entryNames[e.type],
          l.name,
          l.quantity,
          l.price,
          e.amount,
          e.note,
          e.voided ? "已作廢" : "有效",
        ]);
      }),
  );
  if (stores.includes("coffee")) {
    sheet(
      "目前庫存",
      [
        "品項編號",
        "名稱",
        "分類",
        "單位",
        "目前數量",
        "期初數量",
        "售價",
        "狀態",
      ],
      products(rows).map((r) => {
        const p = r.data as Product;
        return [
          r.id,
          p.name,
          p.category,
          p.unit,
          stock(rows, r.id),
          p.opening,
          p.price,
          p.active ? "使用中" : "停用",
        ];
      }),
    );
    sheet(
      "庫存異動",
      ["交易編號", "日期", "類型", "品項", "數量變動", "備註", "狀態"],
      es.flatMap((r) => {
        const e = r.data as Entry;
        return e.lines.map((l) => [
          r.id,
          e.date,
          entryNames[e.type],
          l.name,
          stockDelta(e, l.productId),
          e.note,
          e.voided ? "已作廢" : "有效",
        ]);
      }),
    );
  }
  sheet(
    "匯出說明",
    ["項目", "內容"],
    [
      ["同步狀態", status],
      ["資料範圍", "本裝置已下載資料；有未同步裝置時可能尚未完整"],
      ["庫存時間", "目前庫存為匯出當下，非區間結束日庫存"],
      ["金額說明", "銷售明細的整筆實收重複顯示，不可按明細列加總"],
      ["備份限制", "本檔為查帳報表，非完整資料庫備份"],
    ],
  );
  const bytes = await book.xlsx.writeBuffer();
  const blob = new Blob([bytes as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `日常帳本_${store === "all" ? "兩店合計" : settings[store]}_${from}_${to}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
