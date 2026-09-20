import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  Coffee,
  Printer,
  BookOpen,
  Package,
  ChartNoAxesCombined,
  Settings as SettingsIcon,
  Plus,
  Minus,
  Search,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  CloudCheck,
  WifiOff,
  ChevronRight,
  X,
  Download,
  LogOut,
  History,
  ReceiptText,
} from "lucide-react";
import { cloud, db, openAccount, list, save, sync, resolve } from "./storage";
import {
  defaults,
  entries,
  products,
  stock,
  stockDelta,
  totals,
  validate,
  makeRow,
  today,
  money,
  round,
  entryNames,
  type Product,
  type Entry,
  type RecordRow,
  type Settings,
  type Store,
  type EntryType,
  type Line,
  type Operation,
} from "./domain";
import { exportExcel } from "./export";
import { AuthForm } from "./Auth";
type Page = "register" | "journal" | "inventory" | "reports" | "settings";
const nav: { id: Page; name: string; icon: typeof Coffee }[] = [
  { id: "register", name: "記一筆", icon: Plus },
  { id: "journal", name: "帳目明細", icon: BookOpen },
  { id: "inventory", name: "庫存管理", icon: Package },
  { id: "reports", name: "營業報表", icon: ChartNoAxesCombined },
  { id: "settings", name: "設定", icon: SettingsIcon },
];
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="overlay" onClick={onClose}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="關閉">
            <X />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export default function App() {
  const [user, setUser] = useState<string | null>(null),
    [authReady, setAuthReady] = useState(false),
    [rows, setRows] = useState<RecordRow[]>([]),
    [ops, setOps] = useState<Operation[]>([]),
    [store, setStore] = useState<Store>("coffee"),
    [page, setPage] = useState<Page>("register"),
    [online, setOnline] = useState(navigator.onLine),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState(""),
    [lastSync, setLastSync] = useState(""),
    [syncFailed, setSyncFailed] = useState(false),
    [reauth, setReauth] = useState(false);
  const [editor, setEditor] = useState<RecordRow | null>(null),
    [productEditor, setProductEditor] = useState<RecordRow | null>(null),
    [historyFor, setHistoryFor] = useState<RecordRow | null>(null);
  const settings =
    (rows.find((r) => r.kind === "settings")?.data as Settings) || defaults;
  async function reload() {
    setRows(await list());
    setOps(await db.outbox.toArray());
    setLastSync((await db.meta.get("lastSync"))?.value || "");
  }
  const notify = (m: string) => setToast(m);
  async function synchronize() {
    if (!user || user === "demo") return;
    setBusy(true);
    try {
      await sync(user);
      setSyncFailed(false);
    } catch (e) {
      setSyncFailed(true);
      notify("同步未完成：" + (e as Error).message);
    } finally {
      await reload();
      setBusy(false);
    }
  }
  useEffect(() => {
    if (import.meta.env.VITE_PUBLIC_DEMO === "true") {
      setUser("demo");
      setAuthReady(true);
      return;
    }
    if (localStorage.getItem("ledger-demo") === "yes") {
      setUser("demo");
      setAuthReady(true);
      return;
    }
    if (!cloud) {
      setAuthReady(true);
      return;
    }
    if (!navigator.onLine) {
      setUser(localStorage.getItem("ledger-last-owner"));
      setAuthReady(true);
      return;
    }
    cloud.auth
      .getSession()
      .then(({ data }) => {
        setUser(
          data.session?.user.id || localStorage.getItem("ledger-last-owner"),
        );
        setAuthReady(true);
      })
      .catch(() => {
        setUser(localStorage.getItem("ledger-last-owner"));
        setAuthReady(true);
      });
  }, []);
  useEffect(() => {
    if (!user) return;
    openAccount(user);
    const ready = import.meta.env.VITE_PUBLIC_DEMO === "true"
      ? import("./demo").then(({ seedPublicDemo }) => seedPublicDemo())
      : Promise.resolve();
    ready.then(reload).then(() => {
      if (user !== "demo") synchronize();
    });
  }, [user]);
  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, []);
  useEffect(() => {
    if (online && user && user !== "demo") {
      synchronize();
      const timer = setInterval(synchronize, 30000);
      const visible = () => {
        if (document.visibilityState === "visible") synchronize();
      };
      document.addEventListener("visibilitychange", visible);
      return () => {
        clearInterval(timer);
        document.removeEventListener("visibilitychange", visible);
      };
    }
  }, [online, user]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 6500);
    return () => clearTimeout(t);
  }, [toast]);
  async function persist(row: RecordRow) {
    validate(row, rows);
    const old = rows.find((r) => r.id === row.id);
    if (row.kind === "entry") {
      const e = row.data as Entry;
      const warning = e.lines.some(
        (l) =>
          round(
            stock(rows, l.productId) -
              (old ? stockDelta(old.data as Entry, l.productId) : 0) +
              stockDelta(e, l.productId),
          ) < 0,
      );
      if (
        warning &&
        !confirm("這筆紀錄會使庫存低於 0。仍要記帳，稍後補登或盤點嗎？")
      )
        throw Error("尚未儲存");
    }
    await save(row);
    await reload();
    notify(user === "demo" ? "已儲存在獨立試用帳本" : "已儲存，等待同步");
    if (online && user !== "demo") void synchronize();
  }
  const newEntry = (type: EntryType) =>
    makeRow(user!, "entry", {
      store,
      type,
      date: today(),
      amount: 0,
      note: "",
      category: type === "expense" ? "貨款" : "",
      lines: [],
      voided: false,
    } as Entry);
  async function logout() {
    if (ops.length && user !== "demo") {
      notify("還有待同步資料，請先完成同步或處理衝突再登出");
      return;
    }
    localStorage.removeItem("ledger-demo");
    localStorage.removeItem("ledger-last-owner");
    if (cloud && user !== "demo") await cloud.auth.signOut();
    setUser(null);
    setRows([]);
  }
  if (!authReady) return <div className="loading">正在開啟帳本…</div>;
  if (!user)
    return (
      <Login
        onDemo={() => {
          localStorage.setItem("ledger-demo", "yes");
          setUser("demo");
        }}
        onLogin={setUser}
      />
    );
  const stats = totals(rows, store, today(), today());
  const problems = ops.filter((o) => o.status !== "pending");
  return (
    <div className={`app ${store}`}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <BookOpen size={22} />
          </span>
          <div>
            日常帳本<small>把每天，好好記下來。</small>
          </div>
        </div>
        <div className="store-switch">
          <button
            className={store === "coffee" ? "selected" : ""}
            onClick={() => setStore("coffee")}
          >
            <Coffee size={19} />
            {settings.coffee}
          </button>
          <button
            className={store === "print" ? "selected" : ""}
            onClick={() => {
              setStore("print");
              if (page === "inventory") setPage("register");
            }}
          >
            <Printer size={19} />
            {settings.print}
          </button>
        </div>
        <div className="nav-label">店務管理</div>
        <nav>
          {nav
            .filter((n) => store === "coffee" || n.id !== "inventory")
            .map((n) => (
              <button
                key={n.id}
                className={page === n.id ? "active" : ""}
                onClick={() => setPage(n.id)}
              >
                <n.icon size={20} />
                {n.name}
                {page === n.id && <ChevronRight size={16} />}
              </button>
            ))}
        </nav>
        <div className="sidebar-foot">
          <span className="dot" />{" "}
          {user === "demo" ? "獨立試用帳本" : "家庭共用帳本"}
          <button onClick={logout}>
            <LogOut size={16} />
            登出
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>
            <span className="store-dot" />
            {settings[store]}
            <small>／ {nav.find((n) => n.id === page)?.name}</small>
          </span>
          <button
            className="sync-button"
            onClick={synchronize}
            disabled={busy || user === "demo"}
          >
            {online ? <CloudCheck size={17} /> : <WifiOff size={17} />}
            <span>
              {user === "demo"
                ? "試用模式・僅存本機"
                : busy
                  ? "同步中…"
                  : !online
                    ? `離線・待同步 ${ops.length} 筆`
                    : problems.length
                      ? `${problems.length} 筆需要處理`
                      : ops.length
                        ? `待同步 ${ops.length} 筆`
                        : syncFailed
                          ? "同步未完成"
                          : lastSync
                            ? "已同步"
                            : "尚未同步"}
            </span>
            <RefreshCw size={14} className={busy ? "spin" : ""} />
          </button>
        </header>
        {user === "demo" && (
          <div className="notice">
            這是獨立試用帳本，不會上傳正式資料。雲端尚未啟用時，請勿當成正式營業帳本。
          </div>
        )}
        {!online && (
          <div className="notice">
            離線紀錄已保存在此裝置。請勿清除網站資料；恢復連線並開啟網站後會繼續同步。
          </div>
        )}
        {problems.length > 0 && (
          <div className="notice warning">
            <button onClick={() => setPage("settings")}>
              {problems.length} 筆資料需要處理，點此檢查
            </button>
          </div>
        )}
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {new Intl.DateTimeFormat("zh-TW", {
                  dateStyle: "full",
                  timeZone: "Asia/Taipei",
                }).format(new Date())}
              </div>
              <h1>
                {page === "register"
                  ? "今天，也好好記一筆。"
                  : nav.find((n) => n.id === page)?.name}
              </h1>
              <p>
                {page === "register"
                  ? "收入、支出與庫存，各自清楚。"
                  : page === "inventory"
                    ? "從進貨到盤點，每一份存量都有紀錄。"
                    : page === "reports"
                      ? "看看這段時間，店裡的日常。"
                      : page === "journal"
                        ? "查找、修正，每一筆都有跡可循。"
                        : "管理你的兩間店與同步狀態。"}
              </p>
            </div>
            {page === "inventory" && (
              <button
                className="primary"
                onClick={() =>
                  setProductEditor(
                    makeRow(user, "product", {
                      name: "",
                      category: "咖啡豆",
                      unit: "包",
                      price: 0,
                      opening: 0,
                      sellable: true,
                      active: true,
                    }),
                  )
                }
              >
                <Plus size={18} />
                新增品項
              </button>
            )}
          </div>
          {page === "register" && (
            <>
              <div className="stats">
                <Stat
                  label="今日淨收入"
                  value={stats.net}
                  icon={<ArrowUpRight />}
                />
                <Stat
                  label="今日支出"
                  value={stats.expense}
                  icon={<ArrowDownLeft />}
                />
                <Stat
                  label="今日收支差額"
                  value={stats.balance}
                  muted
                  foot="淨收入 − 支出，非利潤"
                />
              </div>
              {store === "coffee" ? (
                <Register
                  rows={rows}
                  owner={user}
                  onSave={persist}
                  onExpense={() => setEditor(newEntry("expense"))}
                  onIncome={() => setEditor(newEntry("income"))}
                  onNewProduct={() => {
                    setPage("inventory");
                    setProductEditor(
                      makeRow(user, "product", {
                        name: "",
                        category: "咖啡豆",
                        unit: "包",
                        price: 0,
                        opening: 0,
                        sellable: true,
                        active: true,
                      }),
                    );
                  }}
                />
              ) : (
                <QuickCash onSave={persist} owner={user} />
              )}
              <Recent rows={rows} store={store} onEdit={setEditor} />
            </>
          )}
          {page === "journal" && (
            <Journal
              rows={rows}
              store={store}
              onEdit={setEditor}
              onHistory={setHistoryFor}
              onRefund={(r) => {
                setEditor({
                  ...newEntry("refund"),
                  data: {
                    ...(newEntry("refund").data as Entry),
                    originalId: r.id,
                  },
                });
              }}
            />
          )}
          {page === "inventory" && (
            <Inventory
              rows={rows}
              onEdit={setProductEditor}
              onMove={(type, id) => {
                const p = rows.find((r) => r.id === id)!.data as Product;
                const e = newEntry(type);
                e.data = {
                  ...(e.data as Entry),
                  lines: [
                    {
                      productId: id,
                      name: p.name,
                      quantity: type === "count" ? 0 : 1,
                      price: 0,
                    },
                  ],
                  countExpected: type === "count" ? stock(rows, id) : undefined,
                  countActual: type === "count" ? stock(rows, id) : undefined,
                };
                setEditor(e);
              }}
            />
          )}
          {page === "reports" && (
            <Reports
              rows={rows}
              store={store}
              settings={settings}
              exportFile={async (s, f, t) => {
                setBusy(true);
                try {
                  let exportSyncError = false;
                  if (user !== "demo") {
                    try {
                      await sync(user);
                    } catch {
                      exportSyncError = true;
                    }
                  }
                  await reload();
                  const fresh = await list();
                  const pending = await db.outbox.count();
                  await exportExcel(
                    fresh,
                    settings,
                    s,
                    f,
                    t,
                    `${user === "demo" ? "試用資料" : pending || !online || exportSyncError ? "本機資料，可能尚未完整" : "本裝置已同步"}；待同步 ${pending} 筆；最後同步 ${(await db.meta.get("lastSync"))?.value || "尚未同步"}`,
                  );
                  notify("Excel 已下載");
                } catch (e) {
                  notify((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            />
          )}
          {page === "settings" && (
            <SettingsPage
              rows={rows}
              settings={settings}
              onSave={async (value) => {
                const r = rows.find((r) => r.kind === "settings") || {
                  ...makeRow(user, "settings", value),
                  id: user === "demo" ? "demo-settings" : user,
                };
                await persist({ ...r, data: value });
              }}
              ops={ops}
              lastSync={lastSync}
              resolveOp={async (op, keep) => {
                try {
                  await resolve(op, keep);
                  await synchronize();
                } catch (e) {
                  notify((e as Error).message);
                }
              }}
              onRetry={async (op) => {
                await db.outbox.update(op.id, {
                  status: "pending",
                  error: undefined,
                });
                await synchronize();
              }}
            />
          )}
        </main>
        <footer>
          日常帳本 <span>兩間店，各自清楚。</span>
        </footer>
      </div>
      {syncFailed && user !== "demo" && (
        <button className="reauth-button" onClick={() => setReauth(true)}>
          同步未完成・重新驗證登入
        </button>
      )}
      {reauth && (
        <Modal title="重新驗證登入" onClose={() => setReauth(false)}>
          <p>待同步帳目仍保留。請使用原本的共用帳號。</p>
          <AuthForm
            expectedUser={user}
            onSuccess={() => {
              setReauth(false);
              void synchronize();
            }}
          />
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      {editor && (
        <EntryEditor
          key={editor.id}
          row={editor}
          rows={rows}
          settings={settings}
          onClose={() => setEditor(null)}
          onSave={async (r) => {
            await persist(r);
            setEditor(null);
          }}
        />
      )}
      {productEditor && (
        <ProductEditor
          row={productEditor}
          rows={rows}
          onClose={() => setProductEditor(null)}
          onSave={async (r) => {
            await persist(r);
            setProductEditor(null);
          }}
        />
      )}
      {historyFor && (
        <HistoryModal row={historyFor} onClose={() => setHistoryFor(null)} />
      )}
    </div>
  );
}
function Stat({
  label,
  value,
  icon,
  muted,
  foot,
}: {
  label: string;
  value: number;
  icon?: ReactNode;
  muted?: boolean;
  foot?: string;
}) {
  return (
    <div className={"stat " + (muted ? "tinted" : "")}>
      <div>
        {label}
        {icon}
      </div>
      <strong>{money(value)}</strong>
      <small>{foot || "新臺幣・現金"}</small>
    </div>
  );
}
function Login({
  onDemo,
  onLogin,
}: {
  onDemo: () => void;
  onLogin: (id: string) => void;
}) {
  const [setup, setSetup] = useState(false);
  return (
    <div className="login-shell">
      <section className="login-intro">
        <BookOpen size={42} />
        <div className="eyebrow">OUR EVERYDAY LEDGER</div>
        <h1>
          兩間店的日常，
          <br />
          一本帳就清楚。
        </h1>
        <p>
          咖啡的香氣，紙張的溫度。
          <br />
          讓每筆收入、支出與庫存，都有自己的位置。
        </p>
        <div className="login-store">
          <Coffee /> 咖啡店 <span>＋</span>
          <Printer /> 影印店
        </div>
      </section>
      <section className="login-form">
        <h2>開啟今天的帳本</h2>
        <p>使用家人共用帳號登入</p>
        <AuthForm onSuccess={onLogin} setup={setup} />
        {cloud && (
          <button className="text-button full" onClick={() => setSetup(!setup)}>
            {setup ? "返回登入" : "第一次使用？設定家庭帳號"}
          </button>
        )}
        {!cloud && (
          <div className="notice">
            雲端服務尚未設定。可先使用獨立試用帳本，體驗記帳與庫存流程。
          </div>
        )}
        <button className="text-button full" onClick={onDemo}>
          開啟獨立試用帳本 <ChevronRight size={16} />
        </button>
        <small>試用資料僅存本機，不與正式帳本混合。</small>
      </section>
    </div>
  );
}
function Register({
  rows,
  owner,
  onSave,
  onExpense,
  onIncome,
  onNewProduct,
}: {
  rows: RecordRow[];
  owner: string;
  onSave: (r: RecordRow) => Promise<void>;
  onExpense: () => void;
  onIncome: () => void;
  onNewProduct: () => void;
}) {
  const [cart, setCart] = useState<Line[]>([]),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("全部"),
    [amount, setAmount] = useState<string | null>(null),
    [date, setDate] = useState(today()),
    [note, setNote] = useState(""),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  const ps = products(rows).filter(
    (r) => (r.data as Product).active && (r.data as Product).sellable,
  );
  const cats = [
    "全部",
    ...new Set(ps.map((r) => (r.data as Product).category)),
  ];
  const original = cart.reduce((s, l) => s + l.quantity * l.price, 0);
  function change(r: RecordRow, n: number) {
    const p = r.data as Product;
    setCart((c) => {
      const old = c.find((l) => l.productId === r.id);
      return old
        ? c
            .map((l) =>
              l.productId === r.id ? { ...l, quantity: l.quantity + n } : l,
            )
            .filter((l) => l.quantity > 0)
        : [
            ...c,
            { productId: r.id, name: p.name, quantity: 1, price: p.price },
          ];
    });
    setAmount(null);
  }
  return (
    <div className="register-grid" inert={saving}>
      <section className="panel catalogue">
        <div className="section-head">
          <h2>
            商品銷售 <small>{ps.length} 個品項</small>
          </h2>
          <div>
            <button className="secondary" onClick={onIncome}>
              其他收入
            </button>{" "}
            <button className="secondary" onClick={onExpense}>
              <Minus size={16} />
              記支出
            </button>
          </div>
        </div>
        <div className="search">
          <Search size={18} />
          <input
            aria-label="搜尋商品"
            placeholder="搜尋商品名稱…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="chips">
          {cats.map((c) => (
            <button
              key={c}
              className={category === c ? "selected" : ""}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="product-grid">
          {ps
            .filter((r) => {
              const p = r.data as Product;
              return (
                p.name.includes(query) &&
                (category === "全部" || category === p.category)
              );
            })
            .map((r) => {
              const p = r.data as Product,
                n = stock(rows, r.id);
              return (
                <button
                  className="product-tile"
                  key={r.id}
                  onClick={() => change(r, 1)}
                >
                  <div className="product-top">
                    <span>{p.category || "商品"}</span>
                    <Plus size={18} />
                  </div>
                  <strong>{p.name}</strong>
                  <div className="product-bottom">
                    <b>{money(p.price)}</b>
                    <small className={n < 0 ? "negative" : ""}>
                      庫存 {n} {p.unit}
                    </small>
                  </div>
                </button>
              );
            })}
        </div>
        {ps.length === 0 && (
          <div className="empty">
            <Package size={36} />
            <h3>從第一個商品開始</h3>
            <p>新增規格、售價與目前庫存，就能點選記帳。</p>
            <button className="primary" onClick={onNewProduct}>
              <Plus size={17} />
              新增第一個品項
            </button>
          </div>
        )}
      </section>
      <section className="panel receipt">
        <div className="section-head">
          <h2>
            <ReceiptText size={20} />
            這筆交易
          </h2>
          <span className="pill">現金</span>
        </div>
        <Field label="交易日期">
          <input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <div className="cart-lines">
          {cart.length === 0 ? (
            <div className="empty small">
              <Coffee size={30} />
              <p>
                點選左側商品
                <br />
                加入這筆交易
              </p>
            </div>
          ) : (
            cart.map((l) => (
              <div className="cart-line" key={l.productId}>
                <div>
                  <strong>{l.name}</strong>
                  <small>{money(l.price)}／件</small>
                </div>
                <div className="stepper">
                  <button
                    aria-label={"減少 " + l.name}
                    onClick={() =>
                      change(
                        rows.find((r) => r.id === l.productId)!,
                        -1,
                      )
                    }
                  >
                    <Minus size={14} />
                  </button>
                  <b>{l.quantity}</b>
                  <button
                    aria-label={"增加 " + l.name}
                    onClick={() =>
                      change(
                        rows.find((r) => r.id === l.productId)!,
                        1,
                      )
                    }
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="subtotal">
          <span>商品原價</span>
          <b>{money(original)}</b>
        </div>
        <Field label="實收金額（可修改）">
          <div className="money-input">
            <span>NT$</span>
            <input
              aria-label="實收金額"
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={amount ?? original}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
        </Field>
        <Field label="備註（選填）">
          <input
            placeholder="例如：熟客優惠"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        {error && <p className="error">{error}</p>}
        <button
          className="primary full checkout"
          disabled={!cart.length || saving}
          onClick={async () => {
            setSaving(true);
            setError("");
            try {
              await onSave(
                makeRow(owner, "entry", {
                  store: "coffee",
                  type: "sale",
                  date,
                  amount: Number(amount ?? original),
                  note,
                  category: "",
                  lines: cart,
                  voided: false,
                }),
              );
              setCart([]);
              setAmount(null);
              setNote("");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "儲存中…" : "完成記帳"}
          <ArrowUpRight size={20} />
        </button>
        <p className="hint">儲存後，自動扣除商品庫存</p>
      </section>
    </div>
  );
}
function QuickCash({
  owner,
  onSave,
}: {
  owner: string;
  onSave: (r: RecordRow) => Promise<void>;
}) {
  const [type, setType] = useState<"income" | "expense">("income"),
    [amount, setAmount] = useState(""),
    [date, setDate] = useState(today()),
    [note, setNote] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="panel quick-cash">
      <h2>快速記帳</h2>
      <div className="segmented">
        <button
          className={type === "income" ? "selected" : ""}
          disabled={busy}
          onClick={() => setType("income")}
        >
          ＋ 收入
        </button>
        <button
          className={type === "expense" ? "selected" : ""}
          disabled={busy}
          onClick={() => setType("expense")}
        >
          − 支出
        </button>
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await onSave(
              makeRow(owner, "entry", {
                store: "print",
                type,
                date,
                amount: Number(amount),
                note,
                category: "",
                lines: [],
                voided: false,
              }),
            );
            setAmount("");
            setNote("");
            setError("");
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="金額">
          <input
            autoFocus
            disabled={busy}
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className="large-input"
          />
        </Field>
        <div className="form-grid">
          <Field label="日期">
            <input
              type="date"
              required
              disabled={busy}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label="備註（選填）">
            <input
              value={note}
              disabled={busy}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例如：黑白影印、紙張貨款"
            />
          </Field>
        </div>
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy}>
          儲存{type === "income" ? "收入" : "支出"}
          <ArrowUpRight size={18} />
        </button>
      </form>
    </section>
  );
}
function Recent({
  rows,
  store,
  onEdit,
}: {
  rows: RecordRow[];
  store: Store;
  onEdit: (r: RecordRow) => void;
}) {
  const es = entries(rows)
    .filter((r) => (r.data as Entry).store === store)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 5);
  return (
    <section className="panel recent">
      <h2>最近紀錄</h2>
      {!es.length ? (
        <p className="muted">還沒有紀錄。今天的第一筆，就從這裡開始。</p>
      ) : (
        es.map((r) => {
          const e = r.data as Entry;
          return (
            <button className="recent-row" key={r.id} onClick={() => onEdit(r)}>
              <span className="entry-icon">
                {e.type === "expense" ? (
                  <ArrowDownLeft size={18} />
                ) : (
                  <ReceiptText size={18} />
                )}
              </span>
              <div>
                <strong>
                  {entryNames[e.type]}
                  {e.voided ? "（已作廢）" : ""}
                </strong>
                <small>
                  {e.note ||
                    e.lines
                      .map((l) => `${l.name} × ${l.quantity}`)
                      .join("、") ||
                    "—"}
                </small>
              </div>
              <span>{e.date}</span>
              <b>
                {["sale", "income", "expense", "refund"].includes(e.type)
                  ? money(e.amount)
                  : "—"}
              </b>
              <ChevronRight size={16} />
            </button>
          );
        })
      )}
    </section>
  );
}
function ProductEditor({
  row,
  rows,
  onClose,
  onSave,
}: {
  row: RecordRow;
  rows: RecordRow[];
  onClose: () => void;
  onSave: (r: RecordRow) => Promise<void>;
}) {
  const [p, setP] = useState(row.data as Product),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const used = entries(rows).some((r) =>
    (r.data as Entry).lines.some((l) => l.productId === row.id),
  );
  const set = (key: keyof Product, value: unknown) =>
    setP((v) => ({ ...v, [key]: value }));
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await onSave({ ...row, data: p });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={row.version ? "修改品項" : "新增品項"} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="品項名稱（包含規格）">
          <input
            required
            value={p.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="例如：經典配方豆・半磅"
          />
        </Field>
        <div className="form-grid">
          <Field label="分類">
            <input
              value={p.category}
              onChange={(e) => set("category", e.target.value)}
              placeholder="咖啡豆／濾掛／耗材"
            />
          </Field>
          <Field label="庫存單位">
            <input
              required
              disabled={used}
              value={p.unit}
              onChange={(e) => set("unit", e.target.value)}
              placeholder="包、盒、公斤"
            />
          </Field>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={p.sellable}
            disabled={used}
            onChange={(e) => set("sellable", e.target.checked)}
          />
          可販售商品（整件計數）
        </label>
        <div className="form-grid">
          <Field label="預設售價">
            <input
              type="number"
              min="0"
              step="1"
              required
              value={p.price}
              onChange={(e) => set("price", Number(e.target.value))}
            />
          </Field>
          <Field label="期初庫存">
            <input
              disabled={used}
              type="number"
              min="0"
              step={p.sellable ? "1" : "0.001"}
              required
              value={p.opening}
              onChange={(e) => set("opening", Number(e.target.value))}
            />
          </Field>
        </div>
        <p className="hint">
          期初數量不算進貨支出。有交易後，請用盤點修正庫存。
        </p>
        <label className="check">
          <input
            type="checkbox"
            checked={p.active}
            onChange={(e) => set("active", e.target.checked)}
          />
          使用中（取消勾選可停用並保留歷史）
        </label>
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          {row.version > 0 && !used && (
            <button
              type="button"
              className="danger"
              onClick={async () => {
                if (confirm("刪除這個未使用品項？")) {
                  try {
                    await onSave({
                      ...row,
                      data: { ...p, deleted: true, active: false },
                    });
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }
              }}
            >
              刪除品項
            </button>
          )}
          <button className="primary" disabled={busy}>
            儲存品項
          </button>
        </div>
      </form>
    </Modal>
  );
}
function EntryEditor({
  row,
  rows,
  settings,
  onClose,
  onSave,
}: {
  row: RecordRow;
  rows: RecordRow[];
  settings: Settings;
  onClose: () => void;
  onSave: (r: RecordRow) => Promise<void>;
}) {
  const [e, setE] = useState(row.data as Entry),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const set = (key: keyof Entry, value: unknown) =>
    setE((v) => ({ ...v, [key]: value }));
  const monetary = ["sale", "income", "expense", "refund"].includes(e.type);
  const inventory = !["income", "expense"].includes(e.type);
  const ps = products(rows);
  const sales = entries(rows).filter((r) => {
    const x = r.data as Entry;
    return x.type === "sale" && !x.voided;
  });
  const available =
    e.type === "refund"
      ? ps.filter((p) =>
          (
            (rows.find((r) => r.id === e.originalId)?.data as Entry)?.lines ||
            []
          ).some((l) => l.productId === p.id),
        )
      : ps.filter((p) => e.type !== "sale" || (p.data as Product).sellable);
  function add(id: string) {
    const p = ps.find((r) => r.id === id)?.data as Product;
    if (!p || e.lines.some((l) => l.productId === id)) return;
    setE((v) => ({
      ...v,
      lines: [
        ...v.lines,
        {
          productId: id,
          name: p.name,
          quantity: 1,
          price: p.price,
          restock: true,
        },
      ],
    }));
  }
  async function submit(next: Entry) {
    setBusy(true);
    setError("");
    try {
      if (next.type === "count" && !row.version) {
        const id = next.lines[0]?.productId;
        if (id && stock(rows, id) !== next.countExpected)
          throw Error("庫存已改變，請關閉後重新盤點");
      }
      await onSave({ ...row, data: next });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={`${row.version ? "修改" : "新增"}${entryNames[e.type]}`}
      onClose={onClose}
    >
      <form
        onSubmit={(evt) => {
          evt.preventDefault();
          void submit(e);
        }}
      >
        <div className="form-grid">
          <Field label="店面">
            <input disabled value={settings[e.store]} />
          </Field>
          <Field label="日期">
            <input
              type="date"
              required
              value={e.date}
              onChange={(evt) => set("date", evt.target.value)}
            />
          </Field>
        </div>
        {e.voided && <div className="notice">這筆紀錄已作廢，不列入統計。</div>}
        {e.type === "refund" && (
          <Field label="原銷售交易">
            <select
              required
              value={e.originalId || ""}
              onChange={(evt) =>
                setE((v) => ({ ...v, originalId: evt.target.value, lines: [] }))
              }
            >
              <option value="">選擇原交易</option>
              {sales.map((r) => {
                const s = r.data as Entry;
                return (
                  <option key={r.id} value={r.id}>
                    {s.date} · {s.lines.map((l) => l.name).join("、")} ·{" "}
                    {money(s.amount)} · {r.id.slice(0, 6)}
                  </option>
                );
              })}
            </select>
          </Field>
        )}
        {inventory && (
          <div className="edit-lines">
            {e.lines.map((l, i) => (
              <div className="edit-line" key={l.productId}>
                <strong>{l.name}</strong>
                {e.type === "count" ? (
                  <>
                    <p>盤點前帳面：{e.countExpected}</p>
                    <Field label="實際剩餘數量">
                      <input
                        type="number"
                        required
                        min="0"
                        step={
                          (
                            ps.find((p) => p.id === l.productId)
                              ?.data as Product
                          )?.sellable
                            ? "1"
                            : "0.001"
                        }
                        value={e.countActual ?? 0}
                        onChange={(evt) => {
                          const actual = Number(evt.target.value);
                          setE((v) => ({
                            ...v,
                            countActual: actual,
                            lines: [
                              {
                                ...l,
                                quantity: round(
                                  actual - (v.countExpected || 0),
                                ),
                              },
                            ],
                          }));
                        }}
                      />
                    </Field>
                    <p className="hint">
                      調整差額：{l.quantity > 0 ? "+" : ""}
                      {l.quantity}
                    </p>
                  </>
                ) : (
                  <>
                    <div className="form-grid">
                      <Field label="數量">
                        <input
                          type="number"
                          required
                          min={
                            (
                              ps.find((p) => p.id === l.productId)
                                ?.data as Product
                            )?.sellable
                              ? 1
                              : 0.001
                          }
                          step={
                            (
                              ps.find((p) => p.id === l.productId)
                                ?.data as Product
                            )?.sellable
                              ? "1"
                              : "0.001"
                          }
                          value={l.quantity}
                          onChange={(evt) =>
                            set(
                              "lines",
                              e.lines.map((x, j) =>
                                j === i
                                  ? { ...x, quantity: Number(evt.target.value) }
                                  : x,
                              ),
                            )
                          }
                        />
                      </Field>
                      {e.type === "sale" && (
                        <Field label="原單價">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={l.price}
                            onChange={(evt) =>
                              set(
                                "lines",
                                e.lines.map((x, j) =>
                                  j === i
                                    ? { ...x, price: Number(evt.target.value) }
                                    : x,
                                ),
                              )
                            }
                          />
                        </Field>
                      )}
                    </div>
                    {e.type === "refund" && (
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={!!l.restock}
                          onChange={(evt) =>
                            set(
                              "lines",
                              e.lines.map((x, j) =>
                                j === i
                                  ? { ...x, restock: evt.target.checked }
                                  : x,
                              ),
                            )
                          }
                        />
                        商品回補庫存
                      </label>
                    )}
                    <button
                      type="button"
                      className="text-button danger"
                      onClick={() =>
                        set(
                          "lines",
                          e.lines.filter((_, j) => j !== i),
                        )
                      }
                    >
                      移除此品項
                    </button>
                  </>
                )}
              </div>
            ))}
            {e.type !== "count" && (
              <Field label="加入品項">
                <select value="" onChange={(evt) => add(evt.target.value)}>
                  <option value="">選擇品項…</option>
                  {available
                    .filter((p) => !e.lines.some((l) => l.productId === p.id))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {(p.data as Product).name}
                      </option>
                    ))}
                </select>
              </Field>
            )}
          </div>
        )}
        {monetary && (
          <Field
            label={
              e.type === "sale"
                ? "整筆實收金額"
                : e.type === "refund"
                  ? "實際退款金額"
                  : "金額"
            }
          >
            <input
              type="number"
              inputMode="numeric"
              required
              min="0"
              step="1"
              value={e.amount}
              onChange={(evt) => set("amount", Number(evt.target.value))}
            />
          </Field>
        )}
        {e.type === "expense" && (
          <Field label="支出分類">
            <select
              value={e.category}
              onChange={(evt) => set("category", evt.target.value)}
            >
              <option value="">未分類</option>
              {[...new Set([...settings.categories, e.category])]
                .filter(Boolean)
                .map((c) => (
                  <option key={c}>{c}</option>
                ))}
            </select>
          </Field>
        )}
        <Field label="備註／原因">
          <textarea
            required={["gift", "use", "waste", "count"].includes(e.type)}
            value={e.note}
            onChange={(evt) => set("note", evt.target.value)}
            placeholder={
              e.type === "purchase"
                ? "例如：供應商、到貨批次。貨款請另外記支出。"
                : "留下方便查帳的說明"
            }
          />
        </Field>
        {e.type === "purchase" && (
          <div className="notice">這裡只增加庫存。付款時請另外登記支出。</div>
        )}
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          {row.version > 0 && !e.voided && (
            <button
              className="danger"
              type="button"
              disabled={busy}
              onClick={() => {
                if (
                  confirm(
                    "作廢後會撤銷這筆收支與庫存影響，並保留紀錄。確定作廢？",
                  )
                )
                  void submit({ ...e, voided: true });
              }}
            >
              作廢這筆紀錄
            </button>
          )}
          <button className="primary" disabled={busy || e.voided}>
            儲存紀錄
          </button>
        </div>
      </form>
    </Modal>
  );
}
function Inventory({
  rows,
  onEdit,
  onMove,
}: {
  rows: RecordRow[];
  onEdit: (r: RecordRow) => void;
  onMove: (t: EntryType, id: string) => void;
}) {
  const [q, setQ] = useState(""),
    [showInactive, setShowInactive] = useState(false);
  const ps = products(rows).filter((r) => {
    const p = r.data as Product;
    return p.name.includes(q) && (p.active || showInactive);
  });
  return (
    <section className="panel">
      <div className="toolbar">
        <div className="search">
          <Search size={18} />
          <input
            aria-label="搜尋庫存"
            placeholder="搜尋品項…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          包含停用品項
        </label>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>品項／規格</th>
              <th>分類</th>
              <th>目前庫存</th>
              <th>售價</th>
              <th>庫存操作</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {ps.map((r) => {
              const p = r.data as Product,
                n = stock(rows, r.id);
              return (
                <tr key={r.id}>
                  <td>
                    <strong>{p.name}</strong>
                    <small>
                      {p.sellable ? "販售商品" : "原料／耗材"}
                      {!p.active ? " · 已停用" : ""}
                    </small>
                  </td>
                  <td>{p.category}</td>
                  <td className={n < 0 ? "negative" : ""}>
                    <b>{n}</b> {p.unit}
                    {n < 0 && <small>待核對</small>}
                  </td>
                  <td>{p.sellable ? money(p.price) : "—"}</td>
                  <td>
                    <select
                      aria-label={"庫存操作 " + p.name}
                      value=""
                      onChange={(e) => {
                        if (e.target.value)
                          onMove(e.target.value as EntryType, r.id);
                      }}
                    >
                      <option value="">選擇操作</option>
                      <option value="purchase">進貨補貨</option>
                      <option value="gift">贈送</option>
                      <option value="use">耗用</option>
                      <option value="waste">報廢</option>
                      <option value="count">盤點</option>
                    </select>
                  </td>
                  <td>
                    <button className="secondary" onClick={() => onEdit(r)}>
                      修改
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!ps.length && (
        <div className="empty">
          <Package />
          <h3>尚無符合的品項</h3>
          <p>新增商品或耗材，設定現場已有的數量。</p>
        </div>
      )}
    </section>
  );
}
function Journal({
  rows,
  store,
  onEdit,
  onHistory,
  onRefund,
}: {
  rows: RecordRow[];
  store: Store;
  onEdit: (r: RecordRow) => void;
  onHistory: (r: RecordRow) => void;
  onRefund: (r: RecordRow) => void;
}) {
  const [from, setFrom] = useState(today().slice(0, 7) + "-01"),
    [to, setTo] = useState(today()),
    [q, setQ] = useState(""),
    [type, setType] = useState("all");
  const es = entries(rows)
    .filter((r) => {
      const e = r.data as Entry;
      return (
        e.store === store &&
        e.date >= from &&
        e.date <= to &&
        (type === "all" || e.type === type) &&
        (e.note + e.lines.map((l) => l.name).join("")).includes(q)
      );
    })
    .sort(
      (a, b) =>
        (b.data as Entry).date.localeCompare((a.data as Entry).date) ||
        b.updated_at.localeCompare(a.updated_at),
    );
  return (
    <section className="panel">
      <div className="filters">
        <Field label="起日">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field label="迄日">
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </Field>
        <Field label="類型">
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="all">全部紀錄</option>
            {Object.entries(entryNames).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="搜尋備註或品項">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="輸入關鍵字"
          />
        </Field>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>日期</th>
              <th>類型</th>
              <th>內容／備註</th>
              <th>金額</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {es.map((r) => {
              const e = r.data as Entry;
              return (
                <tr key={r.id} className={e.voided ? "voided" : ""}>
                  <td>{e.date}</td>
                  <td>
                    <span className="pill">{entryNames[e.type]}</span>
                    {e.voided && <small>已作廢</small>}
                  </td>
                  <td>
                    <strong>
                      {e.lines
                        .map((l) => `${l.name} × ${l.quantity}`)
                        .join("、") ||
                        e.category ||
                        "—"}
                    </strong>
                    <small>{e.note}</small>
                  </td>
                  <td>
                    {["sale", "income", "expense", "refund"].includes(e.type)
                      ? money(e.amount)
                      : "—"}
                  </td>
                  <td>
                    <div className="row-actions">
                      <button onClick={() => onEdit(r)}>查看／修改</button>
                      <button
                        aria-label="修改歷史"
                        onClick={() => onHistory(r)}
                      >
                        <History size={17} />
                      </button>
                      {e.type === "sale" && !e.voided && (
                        <button onClick={() => onRefund(r)}>退貨</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!es.length && (
        <div className="empty">
          <BookOpen />
          <p>這段期間還沒有符合的紀錄。</p>
        </div>
      )}
    </section>
  );
}
function Reports({
  rows,
  store,
  settings,
  exportFile,
}: {
  rows: RecordRow[];
  store: Store;
  settings: Settings;
  exportFile: (s: Store | "all", f: string, t: string) => Promise<void>;
}) {
  const [scope, setScope] = useState<Store | "all">(store),
    [from, setFrom] = useState(today().slice(0, 7) + "-01"),
    [to, setTo] = useState(today()),
    [busy, setBusy] = useState(false);
  const t = totals(rows, scope, from, to);
  const filtered = entries(rows)
    .map((r) => r.data as Entry)
    .filter(
      (e) =>
        !e.voided &&
        (scope === "all" || e.store === scope) &&
        e.date >= from &&
        e.date <= to,
    );
  const dates = [...new Set(filtered.map((e) => e.date))].sort().reverse();
  const ranking = products(rows)
    .map((p) => {
      const lines = filtered
        .filter((e) => ["sale", "refund"].includes(e.type))
        .flatMap((e) =>
          e.lines
            .filter((l) => l.productId === p.id)
            .map((l) => ({ qty: l.quantity, refund: e.type === "refund" })),
        );
      const sold = lines
          .filter((l) => !l.refund)
          .reduce((s, l) => s + l.qty, 0),
        returned = lines.filter((l) => l.refund).reduce((s, l) => s + l.qty, 0);
      return {
        name: (p.data as Product).name,
        sold,
        returned,
        net: sold - returned,
      };
    })
    .filter((p) => p.sold || p.returned)
    .sort((a, b) => b.net - a.net);
  return (
    <>
      <section className="panel report-filters">
        <div className="filters">
          <Field label="店面">
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as Store | "all")}
            >
              <option value="coffee">{settings.coffee}</option>
              <option value="print">{settings.print}</option>
              <option value="all">兩店合計</option>
            </select>
          </Field>
          <Field label="起日">
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
          <Field label="迄日">
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </Field>
          <button
            className="secondary"
            onClick={() => {
              setFrom(today());
              setTo(today());
            }}
          >
            今天
          </button>
          <button
            className="secondary"
            onClick={() => {
              setFrom(today().slice(0, 7) + "-01");
              setTo(today());
            }}
          >
            本月
          </button>
          <button
            className="primary"
            disabled={busy || from > to}
            onClick={async () => {
              setBusy(true);
              try {
                await exportFile(scope, from, to);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Download size={17} />
            {busy ? "匯出中…" : "匯出 Excel"}
          </button>
        </div>
      </section>
      <div className="stats">
        <Stat
          label="淨收入"
          value={t.net}
          foot={`收入 ${money(t.income)} − 退款 ${money(t.refund)}`}
        />
        <Stat label="實際支出" value={t.expense} />
        <Stat
          label="收支差額"
          value={t.balance}
          muted
          foot="未攤提成本，不代表利潤"
        />
      </div>
      <div className="report-grid">
        <section className="panel">
          <h2>每日收支</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>日期</th>
                  <th>淨收入</th>
                  <th>支出</th>
                  <th>差額</th>
                </tr>
              </thead>
              <tbody>
                {dates.map((d) => {
                  const s = totals(rows, scope, d, d);
                  return (
                    <tr key={d}>
                      <td>{d}</td>
                      <td>{money(s.net)}</td>
                      <td>{money(s.expense)}</td>
                      <td>{money(s.balance)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!dates.length && <p className="muted">這段期間尚無紀錄。</p>}
        </section>
        {scope !== "print" && (
          <section className="panel">
            <h2>商品銷量排行</h2>
            {ranking.map((p, i) => (
              <div className="rank" key={p.name}>
                <span>{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{p.name}</strong>
                  <small>
                    售出 {p.sold} · 退貨 {p.returned}
                  </small>
                  <div className="bar">
                    <i
                      style={{
                        width: `${(Math.max(0, p.net) / Math.max(1, ...ranking.map((x) => x.net))) * 100}%`,
                      }}
                    />
                  </div>
                </div>
                <b>{p.net}</b>
              </div>
            ))}
            {!ranking.length && <p className="muted">尚無商品銷售紀錄。</p>}
          </section>
        )}
      </div>
    </>
  );
}
function SettingsPage({
  rows,
  settings,
  onSave,
  ops,
  lastSync,
  resolveOp,
  onRetry,
}: {
  rows: RecordRow[];
  settings: Settings;
  onSave: (s: Settings) => Promise<void>;
  ops: Operation[];
  lastSync: string;
  resolveOp: (o: Operation, keep: boolean) => Promise<void>;
  onRetry: (o: Operation) => Promise<void>;
}) {
  const [s, setS] = useState(settings),
    [cats, setCats] = useState(settings.categories.join("\n")),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="settings-grid">
      <section className="panel">
        <h2>店面與分類</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await onSave({
                ...s,
                categories: cats
                  .split("\n")
                  .map((x) => x.trim())
                  .filter(Boolean),
              });
              setError("");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="咖啡店名稱">
            <input
              required
              value={s.coffee}
              onChange={(e) => setS({ ...s, coffee: e.target.value })}
            />
          </Field>
          <Field label="影印店名稱">
            <input
              required
              value={s.print}
              onChange={(e) => setS({ ...s, print: e.target.value })}
            />
          </Field>
          <Field label="支出分類（一行一個）">
            <textarea
              value={cats}
              onChange={(e) => setCats(e.target.value)}
              rows={5}
            />
          </Field>
          {error && <p className="error">{error}</p>}
          <button className="primary" disabled={busy}>
            儲存設定
          </button>
        </form>
      </section>
      <section className="panel">
        <h2>同步與資料</h2>
        <p>
          最後同步：
          {lastSync ? new Date(lastSync).toLocaleString("zh-TW") : "尚未同步"}
        </p>
        <p>
          本裝置待同步：<b>{ops.length}</b> 筆
        </p>
        <p className="muted">
          請在打烊時確認每台裝置均已同步。Excel
          是查帳報表，不是可完整還原的備份。
        </p>
        {ops
          .filter((o) => o.status !== "pending")
          .map((o) => (
            <div className="conflict" key={o.id}>
              <h3>{o.status === "conflict" ? "版本需要核對" : "上傳未完成"}</h3>
              <p>{o.error}</p>
              <details>
                <summary>查看本機與雲端內容</summary>
                <h4>本機</h4>
                <RecordSummary value={(rows.find(r=>r.id===o.record.id)||o.record).data}/>
                <h4>雲端</h4>
                <RecordSummary value={o.remote?.data}/>
              </details>
              <div className="row-actions">
                {o.status === "conflict" ? (
                  <>
                    <button onClick={() => resolveOp(o, false)}>
                      使用雲端版本
                    </button>
                    <button onClick={() => resolveOp(o, true)}>
                      保留本機版本
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => onRetry(o)}>重試</button>
                    <button onClick={() => resolveOp(o, false)}>
                      撤回本機修改
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
      </section>
    </div>
  );
}
function HistoryModal({
  row,
  onClose,
}: {
  row: RecordRow;
  onClose: () => void;
}) {
  const [items, setItems] = useState<
      { at: string; before?: unknown; after: unknown }[]
    >([]),
    [error, setError] = useState("");
  useEffect(() => {
    (async () => {
      const local = await db.history.where("recordId").equals(row.id).toArray();
      setItems(local);
      if (cloud && row.owner_id !== "demo" && navigator.onLine) {
        const res = await cloud
          .from("ledger_history")
          .select("*")
          .eq("record_id", row.id)
          .order("created_at", { ascending: false });
        if (res.error) setError("雲端歷史暫時無法取得，以下顯示本機紀錄");
        else {
          const ids = new Set(res.data.map((x) => x.op_id));
          setItems([
            ...res.data.map((x) => ({
              at: x.created_at,
              before: x.before_data,
              after: x.after_data,
            })),
            ...local.filter((x) => !ids.has(x.id)),
          ]);
        }
      }
    })();
  }, [row.id]);
  return (
    <Modal title="修改紀錄" onClose={onClose}>
      {error && <p className="error">{error}</p>}
      {items.length ? (
        items.map((h, i) => (
          <details key={i} className="history-item">
            <summary>
              {new Date(h.at).toLocaleString("zh-TW")} ·{" "}
              {h.before ? "修改" : "建立"}
            </summary>
            <h4>修改前</h4>
            <RecordSummary value={h.before}/>
            <h4>修改後</h4>
            <RecordSummary value={h.after}/>
          </details>
        ))
      ) : (
        <p>沒有可顯示的修改紀錄。</p>
      )}
    </Modal>
  );
}
function RecordSummary({value}:{value:unknown}){
 if(!value||typeof value!=='object')return <p className="muted">尚無紀錄</p>;
 const item=('data' in value?value.data:value) as Product|Entry|Settings;
 let fields:[string,ReactNode][]=[];
 if('store' in item){fields=[['類型',entryNames[item.type]],['日期',item.date],['金額',money(item.amount)],['品項',item.lines.map(l=>`${l.name} × ${l.quantity}${item.type==='refund'?(l.restock?'（回補庫存）':'（不回補）'):''}`).join('、')||'—'],['分類',item.category||'—'],['備註',item.note||'—'],['狀態',item.voided?'已作廢':'有效']];}
 else if('name' in item){fields=[['名稱',item.name],['分類',item.category],['售價',money(item.price)],['期初庫存',`${item.opening} ${item.unit}`],['品項類型',item.sellable?'販售商品':'原料／耗材'],['狀態',item.deleted?'已刪除':item.active?'使用中':'已停用']];}
 else{fields=[['咖啡店',item.coffee],['影印店',item.print],['支出分類',item.categories.join('、')]];}
 return <dl className="record-summary">{fields.map(([label,content])=><div key={label}><dt>{label}</dt><dd>{content}</dd></div>)}</dl>;
}
