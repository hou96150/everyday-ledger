export type Store = "coffee" | "print";
export type EntryType =
  | "sale"
  | "income"
  | "expense"
  | "purchase"
  | "gift"
  | "use"
  | "waste"
  | "count"
  | "refund";
export interface Product {
  name: string;
  category: string;
  unit: string;
  price: number;
  opening: number;
  sellable: boolean;
  active: boolean;
  deleted?: boolean;
}
export interface Line {
  productId: string;
  name: string;
  quantity: number;
  price: number;
  restock?: boolean;
}
export interface Entry {
  store: Store;
  type: EntryType;
  date: string;
  amount: number;
  note: string;
  category: string;
  lines: Line[];
  voided: boolean;
  originalId?: string;
  countExpected?: number;
  countActual?: number;
}
export interface Settings {
  coffee: string;
  print: string;
  categories: string[];
}
export type Data = Product | Entry | Settings;
export interface RecordRow {
  id: string;
  owner_id: string;
  kind: "product" | "entry" | "settings";
  version: number;
  data: Data;
  updated_at: string;
}
export interface Operation {
  id: string;
  sequence?: number;
  record: RecordRow;
  base: number;
  status: "pending" | "conflict" | "error";
  error?: string;
  remote?: RecordRow;
}
export const entryNames: Record<EntryType, string> = {
  sale: "商品銷售",
  income: "收入",
  expense: "支出",
  purchase: "進貨",
  gift: "贈送",
  use: "耗用",
  waste: "報廢",
  count: "盤點",
  refund: "退貨退款",
};
export const defaults: Settings = {
  coffee: "咖啡店",
  print: "影印店",
  categories: ["貨款", "租金", "水電", "其他"],
};
export const today = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei" }).format(
    new Date(),
  );
export const money = (n: number) =>
  new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(n);
export const round = (n: number) => Math.round(n * 1000) / 1000;
export const products = (rows: RecordRow[]) =>
  rows.filter((r) => r.kind === "product" && !(r.data as Product).deleted);
export const entries = (rows: RecordRow[]) =>
  rows.filter((r) => r.kind === "entry");
export function stockDelta(e: Entry, id: string) {
  if (e.voided) return 0;
  return round(
    e.lines
      .filter((l) => l.productId === id)
      .reduce(
        (s, l) =>
          s +
          l.quantity *
            (e.type === "purchase" || e.type === "count"
              ? 1
              : ["sale", "gift", "use", "waste"].includes(e.type)
                ? -1
                : e.type === "refund" && l.restock
                  ? 1
                  : 0),
        0,
      ),
  );
}
export function stock(rows: RecordRow[], id: string) {
  const p = rows.find((r) => r.id === id)?.data as Product | undefined;
  return round(
    (p?.opening || 0) +
      entries(rows).reduce((s, r) => s + stockDelta(r.data as Entry, id), 0),
  );
}
export function totals(
  rows: RecordRow[],
  store: Store | "all",
  from: string,
  to: string,
) {
  const es = entries(rows)
    .map((r) => r.data as Entry)
    .filter(
      (e) =>
        !e.voided &&
        (store === "all" || e.store === store) &&
        e.date >= from &&
        e.date <= to,
    );
  const income = es
    .filter((e) => ["sale", "income"].includes(e.type))
    .reduce((s, e) => s + e.amount, 0);
  const refund = es
    .filter((e) => e.type === "refund")
    .reduce((s, e) => s + e.amount, 0);
  const expense = es
    .filter((e) => e.type === "expense")
    .reduce((s, e) => s + e.amount, 0);
  return {
    income,
    refund,
    expense,
    net: income - refund,
    balance: income - refund - expense,
    count: es.length,
  };
}
export function validate(row: RecordRow, rows: RecordRow[]) {
  if (row.kind === "product") {
    const p = row.data as Product;
    if (!p.name.trim() || !p.unit.trim()) throw Error("請填寫品項名稱與單位");
    if (
      !Number.isSafeInteger(p.price) ||
      p.price < 0 ||
      !Number.isFinite(p.opening) ||
      p.opening < 0 ||
      Math.abs(p.opening * 1000 - Math.round(p.opening * 1000)) > 0.0001
    )
      throw Error("售價須為非負整數，期初庫存最多 3 位小數");
    if (p.sellable && !Number.isInteger(p.opening))
      throw Error("販售商品的期初庫存須為整數");
    const used = entries(rows).some((r) =>
      (r.data as Entry).lines.some((l) => l.productId === row.id),
    );
    const old = rows.find((r) => r.id === row.id)?.data as Product | undefined;
    if (
      used &&
      old &&
      (p.unit !== old.unit ||
        p.opening !== old.opening ||
        p.sellable !== old.sellable ||
        p.deleted)
    )
      throw Error(
        "已有紀錄的品項不能變更單位、期初庫存、販售方式或刪除，請使用盤點或停用",
      );
    return;
  }
  if (row.kind === "settings") {
    const s = row.data as Settings;
    if (!s.coffee.trim() || !s.print.trim()) throw Error("請填寫兩間店名");
    return;
  }
  const e = row.data as Entry;
  const previous = rows.find((r) => r.id === row.id)?.data as Entry | undefined;
  if (previous && (previous.store !== e.store || previous.type !== e.type))
    throw Error("請作廢後重登，不可直接更換店面或類型");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(e.date) ||
    Number.isNaN(Date.parse(e.date)) ||
    new Date(e.date + "T00:00:00Z").toISOString().slice(0, 10) !== e.date
  )
    throw Error("請填寫正確日期");
  if (!Number.isSafeInteger(e.amount) || e.amount < 0)
    throw Error("金額須為非負整數");
  if (e.store === "print" && !["income", "expense"].includes(e.type))
    throw Error("影印店只登記收入與支出");
  if (
    !["sale", "income", "expense", "refund"].includes(e.type) &&
    e.amount !== 0
  )
    throw Error("庫存異動不產生收支金額");
  if (["income", "expense"].includes(e.type) && e.lines.length)
    throw Error("一般收支不可改動庫存");
  if (["gift", "use", "waste", "count"].includes(e.type) && !e.note.trim())
    throw Error("請填寫庫存異動原因");
  if (
    ["sale", "purchase", "gift", "use", "waste", "count", "refund"].includes(
      e.type,
    ) &&
    !e.lines.length
  )
    throw Error("請選擇品項");
  if (new Set(e.lines.map((l) => l.productId)).size !== e.lines.length)
    throw Error("同一品項請合併數量");
  for (const l of e.lines) {
    const p = rows.find((r) => r.id === l.productId && r.kind === "product")
      ?.data as Product | undefined;
    if (!p || p.deleted) throw Error("找不到品項");
    if (
      !Number.isFinite(l.quantity) ||
      Math.abs(l.quantity * 1000 - Math.round(l.quantity * 1000)) > 0.0001 ||
      (e.type !== "count" && l.quantity <= 0)
    )
      throw Error("數量須大於 0，最多 3 位小數");
    if (p.sellable && !Number.isInteger(l.quantity))
      throw Error("販售商品數量須為整數");
    if (e.type === "sale" && !p.sellable)
      throw Error("原料耗材不能作為銷售商品");
    if (!Number.isSafeInteger(l.price) || l.price < 0)
      throw Error("單價須為非負整數");
  }
  const merged = rows.filter((r) => r.id !== row.id).concat(row);
  if (e.type === "count") {
    if (
      e.lines.length !== 1 ||
      typeof e.countExpected !== "number" ||
      typeof e.countActual !== "number" ||
      e.countActual < 0 ||
      e.lines[0].quantity !== round(e.countActual - e.countExpected)
    )
      throw Error("盤點數量與差額不符");
    if (
      !e.voided &&
      (!previous ||
        JSON.stringify(previous.lines) !== JSON.stringify(e.lines)) &&
      stock(
        rows.filter((r) => r.id !== row.id),
        e.lines[0].productId,
      ) !== e.countExpected
    )
      throw Error("庫存已變動，請關閉後重新盤點");
  }
  for (const s of entries(merged).filter(
    (r) => (r.data as Entry).type === "sale",
  )) {
    const sale = s.data as Entry;
    const refunds = entries(merged)
      .map((r) => r.data as Entry)
      .filter((x) => x.type === "refund" && !x.voided && x.originalId === s.id);
    if (sale.voided && refunds.length)
      throw Error("這筆銷售已有退款，請先作廢退款");
    if (refunds.some((r) => r.date < sale.date))
      throw Error("銷售日期不可晚於既有退貨日期");
    if (refunds.reduce((n, r) => n + r.amount, 0) > sale.amount)
      throw Error("累計退款不可超過原實收金額");
    for (const l of refunds.flatMap((r) => r.lines)) {
      const sold =
        sale.lines.find((x) => x.productId === l.productId)?.quantity || 0;
      const returned = refunds
        .flatMap((r) => r.lines)
        .filter((x) => x.productId === l.productId)
        .reduce((n, x) => n + x.quantity, 0);
      if (returned > sold) throw Error("退貨數量不可超過原銷售數量");
    }
  }
  if (e.type === "refund" && !e.voided) {
    const original = merged.find((r) => r.id === e.originalId)?.data as
      Entry | undefined;
    if (!original || original.type !== "sale" || original.voided)
      throw Error("請選擇有效的原銷售交易");
    if (e.date < original.date) throw Error("退貨日期不可早於原銷售日期");
  }
}
export function makeRow(
  owner: string,
  kind: RecordRow["kind"],
  data: Data,
): RecordRow {
  return {
    id: crypto.randomUUID(),
    owner_id: owner,
    kind,
    version: 0,
    data,
    updated_at: new Date().toISOString(),
  };
}
