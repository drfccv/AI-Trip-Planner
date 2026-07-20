import { configs } from "@/lib/mcp/store";
import { discoverTools } from "@/lib/mcp/gateway";
import type { McpProviderId } from "@/lib/mcp/types";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { const { id } = await context.params; const config = (await configs(request))[id as McpProviderId]; if (!config) return Response.json({ error: "NOT_FOUND" }, { status: 404 }); if (!config.endpoint) return Response.json({ ok: false, error: "MCP_NOT_CONFIGURED" }, { status: 503 }); try { const tools = await discoverTools(config); return Response.json({ ok: true, mode: "live", toolCount: tools.length }); } catch (error) { return Response.json({ ok: false, error: error instanceof Error ? error.message : "MCP_TEST_FAILED" }, { status: 502 }); } }
