import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { aiSettings, mcpCallLogs } from "@/db/schema";
import { requireRequestUser } from "@/lib/auth/request-user";
import { callTool, discoverTools } from "@/lib/mcp/gateway";
import { assertSafeMcpUrl } from "@/lib/mcp/security";
import { configs, decryptSecret } from "@/lib/mcp/store";
import type { McpServerConfig, McpTool } from "@/lib/mcp/types";
import { tripOperationSchema } from "@/lib/trips/operations";
import { loadTrip } from "@/lib/trips/serialize";
import { reasoningRequestFields } from "@/lib/ai/reasoning";

const inputSchema = z.object({ tripId: z.string().uuid(), prompt: z.string().trim().min(1).max(2000), useMcp: z.boolean().default(true) });
type ChatMessage = { role: "system" | "user" | "assistant" | "tool"; content: string | null; tool_call_id?: string; tool_calls?: ToolCall[] };
type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
type Trace = { provider: string; tool: string; status: "success" | "error"; durationMs: number; error?: string };

function extractJson(text: string) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""); const start = cleaned.indexOf("{");
  if (start < 0) throw new Error("AI_RESPONSE_INVALID");
  let depth = 0; let inString = false; let escaped = false;
  for (let index = start; index < cleaned.length; index += 1) { const char = cleaned[index]; if (inString) { if (escaped) escaped = false; else if (char === "\\") escaped = true; else if (char === '"') inString = false; continue; } if (char === '"') inString = true; else if (char === "{") depth += 1; else if (char === "}") { depth -= 1; if (depth === 0) return JSON.parse(cleaned.slice(start, index + 1)); } }
  throw new Error("AI_RESPONSE_INVALID");
}
function choice(payload: unknown) { return (payload as { choices?: Array<{ message?: { content?: string | null | Array<{ text?: string }>; tool_calls?: ToolCall[] } }> }).choices?.[0]?.message; }
function contentText(content: ReturnType<typeof choice> extends infer T ? T : never) { const value = (content as { content?: string | null | Array<{ text?: string }> } | undefined)?.content; return typeof value === "string" ? value : Array.isArray(value) ? value.map(part => part.text || "").join("") : ""; }

async function modelCall(base: string, key: string, model: string, messages: ChatMessage[], tools: unknown[], signal: AbortSignal, structured = false, reasoning: Record<string, unknown> = {}) {
  const send = (jsonMode: boolean) => fetch(`${base}/chat/completions`, { method: "POST", redirect: "manual", signal, headers: { authorization: `Bearer ${key}`, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ model, messages, ...reasoning, ...(tools.length ? { tools, tool_choice: "auto" } : {}), ...(jsonMode ? { response_format: { type: "json_object" } } : {}) }) });
  let response = await send(structured); if (structured && response.status === 400) response = await send(false);
  if (response.status >= 300 && response.status < 400) throw new Error("模型服务发生了不安全的重定向");
  if (response.status === 401 || response.status === 403) throw new Error("API Key 无效、模型无访问权限，或服务商配置不匹配");
  if (response.status === 404) throw new Error("模型 API 地址不正确：未找到 /chat/completions");
  if (!response.ok) throw new Error(`AI 规划失败（HTTP ${response.status}）`);
  return choice(await response.json());
}

async function availableMcp(request: Request) {
  const all = await configs(request); const entries: Array<{ alias: string; config: McpServerConfig; tool: McpTool }> = []; const enabled = Object.values(all).filter(item => item.enabled && item.permission !== "deny" && item.endpoint);
  const discovered = await Promise.allSettled(enabled.map(async config => ({ config, tools: await discoverTools(config) })));
  for (const result of discovered) { if (result.status !== "fulfilled") continue; for (const tool of result.value.tools.slice(0, 12)) { entries.push({ alias: `mcp_${entries.length}`, config: result.value.config, tool }); if (entries.length >= 30) return entries; } }
  return entries;
}

export async function POST(request: Request) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 110000);
  try {
    const user = await requireRequestUser(request); const input = inputSchema.parse(await request.json()); const trip = await loadTrip(input.tripId);
    if (!trip || trip.userId !== user.id) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    const settings = (await getDb().select().from(aiSettings).where(eq(aiSettings.userId, user.id)).limit(1))[0];
    if (!settings?.encryptedApiKey) return Response.json({ error: "请先在设置中保存 AI 模型与 API Key" }, { status: 400 });
    const key = await decryptSecret(settings.encryptedApiKey); const base = assertSafeMcpUrl(settings.baseUrl).toString().replace(/\/$/, "");
    const itinerary = trip.days.map(day => ({ dayId: day.id, date: day.date, title: day.title, items: day.items.map(item => ({ id: item.id, title: item.title, type: item.type, startTime: item.startTime, durationMinutes: item.durationMinutes, cost: item.cost, locked: item.locked, sourceType: item.sourceType })) }));
    const system = `你是“旅迹”的专业旅行规划助手。需要实时地点、路线、酒店、车票或网页信息时，优先调用提供的 MCP 工具；不要编造工具结果。工具调用结束后的最终回复必须是且只能是一个 JSON 对象：{"message":"中文说明","operations":[TripOperation]}。禁止 Markdown、代码围栏、注释、前后解释、连续多个 JSON、NaN 和 undefined。所有字符串内的换行必须转义。允许 add_item、remove_item、update_item、move_item、update_budget。add_item.item 必须包含有效 dayId、type、title、HH:mm 格式 startTime、durationMinutes、notes、cost、sourceType。notes 只写预约、集合点、同行人、交通衔接等行程执行信息；景点或餐厅的历史人文、特色和评价写入 metadata.introduction。使用 MCP 结果新增的项目 sourceType="mcp_verified"，否则为 "ai_generated"。可编辑、删除、移动现有未锁定项目；绝不改动 locked=true 项目。完整规划每天 2–4 项，最多 40 项操作。行程：${JSON.stringify({ title: trip.title, destination: trip.destination, startDate: trip.startDate, endDate: trip.endDate, currency: trip.currency, budgetTotal: trip.budgetTotal, constraints: trip.constraints, days: itinerary })}`;
    const mcp = input.useMcp ? await availableMcp(request) : [];
    const tools = mcp.map(entry => ({ type: "function", function: { name: entry.alias, description: `${entry.config.name} / ${entry.tool.name}: ${entry.tool.description || "MCP 实时查询"}`, parameters: entry.tool.inputSchema || { type: "object", properties: {} } } }));
    const messages: ChatMessage[] = [{ role: "system", content: system }, { role: "user", content: input.prompt }];
    const reasoning = reasoningRequestFields(settings.provider, base, settings.thinkingEnabled);
    let answer; try { answer = await modelCall(base, key, settings.model, messages, tools, controller.signal, tools.length === 0, reasoning); } catch (error) { if (tools.length && error instanceof Error && error.message.includes("HTTP 400")) answer = await modelCall(base, key, settings.model, messages, [], controller.signal, true, reasoning); else throw error; } const trace: Trace[] = [];
    if (answer?.tool_calls?.length) {
      const calls = answer.tool_calls.slice(0, 6); messages.push({ role: "assistant", content: answer.content == null || typeof answer.content === "string" ? answer.content : contentText(answer), tool_calls: calls });
      for (const call of calls) {
        const entry = mcp.find(item => item.alias === call.function.name); if (!entry) continue; const started = Date.now();
        try { const args = JSON.parse(call.function.arguments || "{}"); const result = await callTool(entry.config, entry.tool.name, args); const durationMs = Date.now() - started; trace.push({ provider: entry.config.name, tool: entry.tool.name, status: "success", durationMs }); await getDb().insert(mcpCallLogs).values({ id: crypto.randomUUID(), userId: user.id, serverId: entry.config.id, toolName: entry.tool.name, status: "success", durationMs }).catch(() => undefined); messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result).slice(0, 16000) }); }
        catch (error) { const code = error instanceof Error ? error.message : "MCP_CALL_FAILED"; const durationMs = Date.now() - started; trace.push({ provider: entry.config.name, tool: entry.tool.name, status: "error", durationMs, error: code }); await getDb().insert(mcpCallLogs).values({ id: crypto.randomUUID(), userId: user.id, serverId: entry.config.id, toolName: entry.tool.name, status: "error", durationMs, errorCode: code }).catch(() => undefined); messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ error: code }) }); }
      }
      answer = await modelCall(base, key, settings.model, messages, [], controller.signal, true, reasoning);
    }
    let raw; const firstText = contentText(answer);
    try { raw = extractJson(firstText); } catch {
      const repairMessages: ChatMessage[] = [...messages, { role: "assistant", content: firstText }, { role: "user", content: "上一个回复不是合法的单一 JSON 对象。只修复格式，不改变规划内容。现在仅返回 {\"message\":string,\"operations\":array}，禁止 Markdown、代码围栏、前后说明和第二个 JSON。" }];
      const repaired = await modelCall(base, key, settings.model, repairMessages, [], controller.signal, true, reasoning); try { raw = extractJson(contentText(repaired)); } catch { throw new Error("AI 返回格式异常，系统已自动修复一次但仍未成功。请重试，或在设置中选择支持 JSON 输出的模型。"); }
    }
    const candidate = z.object({ message: z.string().min(1).max(4000), operations: z.array(z.unknown()).max(40) }).parse(raw); const operations = candidate.operations.map(operation => tripOperationSchema.parse(operation));
    return Response.json({ message: candidate.message, operations, mcpTrace: trace, mcpAvailable: mcp.length > 0 });
  } catch (error) { const message = error instanceof z.ZodError ? "AI 返回的行程字段不完整，系统无法安全写入。请重试一次。" : error instanceof Error && error.name === "AbortError" ? "AI 或 MCP 响应超时，请稍后重试" : error instanceof Error && error.message === "AI_RESPONSE_INVALID" ? "AI 没有返回可识别的行程数据，请重试或更换支持 JSON 输出的模型。" : error instanceof Error ? error.message : "AI 规划暂时失败，请稍后重试"; return Response.json({ error: message }, { status: message === "NOT_FOUND" ? 404 : 502 }); }
  finally { clearTimeout(timer); }
}
