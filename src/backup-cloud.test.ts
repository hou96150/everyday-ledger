import "fake-indexeddb/auto";
import { beforeEach, describe, it, expect, vi } from "vitest";
const transport = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ rpc: transport.rpc }),
}));
vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "test");
vi.stubEnv("VITE_PUBLIC_DEMO", "false");
const { db: initial, openAccount } = await import("./storage");
const storage = await import("./storage");
const { captureBackup, restoreBackup } = await import("./backup");
const { makeBackup } = await import("./backup-format");
const { makeRow } = await import("./domain");
const owner = "33333333-3333-4333-8333-333333333333";
beforeEach(() => {
  openAccount("cloud-backup-test-" + crypto.randomUUID());
  vi.stubGlobal("navigator", { onLine: true });
  transport.rpc.mockReset();
});
describe("雲端備份前置檢查與錯誤處理", () => {
  it("離線不冒充完整雲端備份", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    await expect(captureBackup(owner)).rejects.toThrow("需要連線");
    expect(transport.rpc).not.toHaveBeenCalled();
  });
  it("待同步或衝突會阻止完整備份", async () => {
    const r = makeRow(owner, "settings", {
      coffee: "咖啡",
      print: "影印",
      categories: [],
    });
    await storage.save(r);
    await expect(captureBackup(owner)).rejects.toThrow("先完成");
    expect(transport.rpc).not.toHaveBeenCalled();
  });
  it("雲端帳號改變，拒絕將其他帳號資料當成目前備份", async () => {
    transport.rpc.mockResolvedValue({
      data: { owner: crypto.randomUUID() },
      error: null,
    });
    await expect(captureBackup(owner)).rejects.toThrow("帳號已變更");
  });
  it("RPC 失敗不寫入本機，傳入預期帳號防止還原到其他帳本", async () => {
    const b = await makeBackup({ owner, records: [], history: [] }, "cloud");
    transport.rpc.mockResolvedValue({
      error: { message: "network lost" },
      data: null,
    });
    await expect(restoreBackup(b, owner)).rejects.toThrow("同步檢查");
    expect(transport.rpc).toHaveBeenCalledWith("restore_ledger_backup", {
      p_snapshot: b.snapshot,
      p_target_owner: owner,
    });
    expect(await storage.db.records.count()).toBe(0);
  });
});
