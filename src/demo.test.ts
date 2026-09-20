import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

it("public demo never constructs a cloud client even with environment credentials", async () => {
  vi.stubEnv("VITE_PUBLIC_DEMO", "true");
  vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "example-key");
  const storage = await import("./storage");
  expect(storage.cloud).toBeNull();
  storage.db.close();
});

it("demo seeds once, preserves edits, and never creates upload operations", async () => {
  vi.stubEnv("VITE_PUBLIC_DEMO", "true");
  const storage = await import("./storage");
  storage.openAccount("demo-test-" + crypto.randomUUID());
  const { seedPublicDemo } = await import("./demo");
  const { totals, today, stock } = await import("./domain");
  await seedPublicDemo();
  const rows = await storage.list();
  expect(rows).toHaveLength(7);
  expect(totals(rows, "all", today(), today()).balance).toBe(980);
  const soldProduct = rows.find(
    (row) =>
      row.kind === "product" && (row.data as { price: number }).price === 500,
  )!;
  expect(stock(rows, soldProduct.id)).toBe(8);
  await storage.db.records.update(soldProduct.id, {
    data: { ...soldProduct.data, name: "My edited product" },
  });
  await seedPublicDemo();
  expect(await storage.db.records.count()).toBe(7);
  expect((await storage.db.records.get(soldProduct.id))?.data).toHaveProperty(
    "name",
    "My edited product",
  );
  expect(await storage.db.outbox.count()).toBe(0);
  await storage.db.delete();
});
