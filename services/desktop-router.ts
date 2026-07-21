import { z } from "zod";
import type { DesktopRequest, DesktopResponse } from "../domain/desktop-api";
import { TripService } from "./trip-service";
import { SettingsService } from "./settings-service";
import { AiService } from "./ai-service";
export const requestSchema = z.object({ path: z.string().startsWith("/api/").max(300), method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).optional(), body: z.unknown().optional() });
export class DesktopRouter {
  constructor(private trips: TripService, private settings: SettingsService, private ai: AiService) {}
  async handle(raw: DesktopRequest): Promise<DesktopResponse> {
    const { path, method = "GET", body } = requestSchema.parse(raw), url = new URL(path, "https://desktop.invalid"), route = url.pathname;
    try {
      if (route === "/api/trips" && method === "GET") return { status: 200, data: { trips: this.trips.list() } };
      if (route === "/api/trips" && method === "POST") return { status: 201, data: { trip: this.trips.create(body) } };
      let m = route.match(/^\/api\/trips\/([0-9a-f-]+)$/i);
      if (m && method === "GET") return { status: 200, data: { trip: this.trips.get(m[1]) } };
      if (m && method === "PATCH") return { status: 200, data: { trip: this.trips.update(m[1], body) } };
      if (m && method === "DELETE") { this.trips.delete(m[1]); return { status: 204 }; }
      m = route.match(/^\/api\/trips\/([0-9a-f-]+)\/operations\/(preview|apply)$/i); if (m && method === "POST") return { status: 200, data: m[2] === "preview" ? this.trips.preview(m[1], body) : this.trips.apply(m[1], body) };
      m = route.match(/^\/api\/trips\/([0-9a-f-]+)\/versions$/i); if (m && method === "GET") return { status: 200, data: { versions: this.trips.versions(m[1]) } };
      if (m && method === "POST") return { status: 200, data: this.trips.restoreVersion(m[1], body as { versionId?: string; baseRevision?: number }) };
      if (route === "/api/ai/settings" && method === "GET") { const settings: any = this.settings.getAi(); return { status: 200, data: { settings: { ...settings, keyHint: settings.apiKeyHint } } }; }
      if (route === "/api/ai/settings" && method === "PUT") return { status: 200, data: this.settings.saveAi(body) };
      if (route === "/api/ai/settings" && method === "POST") return { status: 200, data: await this.settings.testAi() };
      if (route === "/api/ai/settings" && method === "DELETE") { this.settings.deleteAi(); return { status: 200, data: { ok: true } }; }
      if (route === "/api/mcp/servers" && method === "GET") return { status: 200, data: { servers: this.settings.listMcp() } };
      if (route === "/api/mcp/servers" && method === "PUT") return { status: 200, data: this.settings.saveMcp(body) };
      if (route === "/api/mcp/servers" && method === "DELETE") { this.settings.deleteMcp((body as any)?.id); return { status: 200, data: { ok: true } }; }
      m = route.match(/^\/api\/mcp\/servers\/([\w-]+)\/test$/); if (m && method === "POST") return { status: 200, data: await this.settings.testMcp(m[1]) };
      if (route === "/api/ai/jobs" && method === "GET") return { status: 200, data: this.ai.list(url.searchParams.get("tripId") || "") };
      if (route === "/api/ai/jobs" && method === "POST") return { status: 202, data: { job: this.ai.create(body) } };
      if (route === "/api/ai/jobs" && method === "DELETE") { this.ai.clear(url.searchParams.get("tripId") || ""); return { status: 200, data: { ok: true } }; }
      m = route.match(/^\/api\/ai\/jobs\/([0-9a-f-]+)$/i); if (m && method === "GET") return { status: 200, data: { job: this.ai.get(m[1]) } }; if (m && method === "DELETE") { this.ai.cancel(m[1]); return { status: 200, data: { ok: true } }; }
      if (route === "/api/ai/dispatch" && method === "POST") { const input = body as any, apply = input?.pendingPlan && /确认|就这样|可以/.test(input?.message || ""); return { status: 200, data: { action: apply ? "apply" : "plan", intent: apply ? "accept_pending_plan" : "create_or_revise_plan" } }; }
      return { status: 501, data: { error: "DESKTOP_ROUTE_NOT_IMPLEMENTED" } };
    } catch (error) { const message = error instanceof Error ? error.message : "DESKTOP_REQUEST_FAILED", status = message === "REVISION_CONFLICT" ? 409 : message.includes("NOT_FOUND") ? 404 : 400; return { status, data: { error: message } }; }
  }
}
