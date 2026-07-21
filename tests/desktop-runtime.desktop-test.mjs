import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDesktopDatabase, closeDesktopDatabase, databasePath } from "../desktop/runtime/database.ts";
import { dispatch } from "../desktop/runtime/routes.ts";
const headers = { "content-type": "application/json", "x-desktop-runtime": "1", "x-desktop-token": "test" };
const call = async (path, method = "GET", body) => { const response = await dispatch(new Request("http://127.0.0.1" + path, { method, headers, body: method === "GET" ? undefined : JSON.stringify(body || {}) })); return { status: response.status, data: await response.json().catch(() => ({})) }; };
test("desktop migrations, full trip route flow, preferences and masked settings", async () => {
  const dir = mkdtempSync(join(tmpdir(), "trip-desktop-"));
  try {
    openDesktopDatabase(dir); globalThis.__desktopSecretStore = { encrypt: value => "masked:" + value, decrypt: value => value.slice(7) };
    const created = await call("/api/trips", "POST", { destination: "杭州", startDate: "2026-08-01", endDate: "2026-08-02" }); assert.equal(created.status, 201); assert.equal(created.data.trip.userId, "local-user");
    const trip = created.data.trip, item = { dayId: trip.days[0].id, type: "景点", title: "西湖", startTime: "09:00", durationMinutes: 60, notes: "", sourceType: "user_added" }, operation = { baseRevision: 1, idempotencyKey: "desktop-runtime-key", operations: [{ type: "add_item", item }] };
    assert.equal((await call(`/api/trips/${trip.id}/operations/preview`, "POST", operation)).status, 200); assert.equal((await call(`/api/trips/${trip.id}/operations/apply`, "POST", operation)).data.trip.revision, 2); assert.equal((await call(`/api/trips/${trip.id}/operations/apply`, "POST", operation)).data.idempotentReplay, true); assert.equal((await call(`/api/trips/${trip.id}`, "PATCH", { revision: 1, title: "冲突" })).status, 409);
    await call("/api/desktop/preferences", "PUT", { pace: "relaxed" }); assert.equal((await call("/api/desktop/preferences")).data.preferences.pace, "relaxed");
    const aiSave = await call("/api/ai/settings", "PUT", { provider: "openai-compatible", baseUrl: "https://example.com/v1", model: "test-model", apiKey: "desktop-secret" }); assert.equal(aiSave.status, 200, JSON.stringify(aiSave.data)); const ai = (await call("/api/ai/settings")).data.settings; assert.equal(ai.configured, true); assert.equal("apiKey" in ai, false);
    const endpoint = "https://example.modelscope.cn/mcp/public-id"; assert.equal((await call("/api/mcp/servers", "PUT", { id: "12306", name: "12306", endpoint, authMode: "bearer", apiKey: "rail-secret", enabled: true, permission: "ask", source: "builtin" })).status, 200); const rail = (await call("/api/mcp/servers")).data.servers.find(server => server.id === "12306"); assert.equal(rail.endpoint, endpoint); assert.equal("apiKey" in rail, false); assert.equal(databasePath(dir).startsWith(join(dir, "data")), true);
  } finally { closeDesktopDatabase(); rmSync(dir, { recursive: true, force: true }); }
});
test("desktop route allowlist rejects arbitrary paths", async () => { assert.equal((await dispatch(new Request("http://127.0.0.1/api/not-allowed", { headers }))).status, 404); });
