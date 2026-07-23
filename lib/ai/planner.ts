import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { aiSettings } from "@/db/schema";
import { callTool, discoverTools } from "@/lib/mcp/gateway";
import { assertSafeMcpUrl } from "@/lib/mcp/security";
import { configs, decryptSecret } from "@/lib/mcp/store";
import { tripOperationSchema } from "@/lib/trips/operations";
import { loadTrip } from "@/lib/trips/serialize";
import {
  completionTokenFields,
  reasoningRequestFields,
  toolRequestFields,
} from "./reasoning";
import { parseDsmlToolCalls } from "./dsml";
import { buildBudgetGuidance } from "./budget-guidance";

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type CatalogItem = {
  alias: string;
  providerId: string;
  providerName: string;
  toolName: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};
export type AgentEvent = {
  kind: "assistant" | "tool" | "system";
  status: "completed" | "success" | "error";
  title: string;
  detail?: string;
};
export type JobContext = {
  mode?: "conversation" | "format";
  responseKind?: "reply" | "plan";
  dispatchIntent?:
    | "answer"
    | "create_or_revise_plan"
    | "accept_pending_plan";
  confirmedAnswer?: string;
  confirmedTrace?: Array<{
    serverId: string;
    provider: string;
    tool: string;
    status: "success" | "error";
    durationMs: number;
    error?: string;
  }>;
  conversation?: ChatMessage[];
  catalog?: CatalogItem[];
  assistantContent?: string | null;
  assistantReasoningContent?: string | null;
  calls?: ToolCall[];
  toolMessages?: Array<{ id: string; content: string }>;
  history?: ChatMessage[];
  round?: number;
  events?: AgentEvent[];
  trace?: Array<{
    serverId: string;
    provider: string;
    tool: string;
    status: "success" | "error";
    durationMs: number;
    error?: string;
  }>;
  rawAnswer?: string;
  structureFailure?: string;
  lastStageError?: string;
  streamingContent?: string;
  streamingContentChars?: number;
  streamingToolCalls?: number;
};
type ChatMessage = {
  role: string;
  content: string | null;
  reasoning_content?: string | null;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
};
const outputSchema = z.object({
  message: z.string().min(1).max(4000),
  operations: z.array(tripOperationSchema).max(40),
});
type PlanOutput = z.infer<typeof outputSchema>;

async function reachableImage(url: string) {
  try {
    assertSafeMcpUrl(url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          accept: "image/avif,image/webp,image/png,image/jpeg,image/*",
          range: "bytes=0-1023",
          "user-agent": "Mozilla/5.0 (compatible; LvjiImageCheck/1.0)",
        },
      });
      return (
        response.ok &&
        (response.headers.get("content-type") || "")
          .toLowerCase()
          .startsWith("image/")
      );
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false;
  }
}

export async function removeUnreachablePlanImages(output: PlanOutput) {
  const urls = [
    ...new Set(
      output.operations.flatMap((operation) => {
        const metadata =
          operation.type === "add_item"
            ? operation.item.metadata
            : operation.type === "update_item"
              ? operation.patch.metadata
              : undefined;
        return metadata?.imageUrl ? [metadata.imageUrl] : [];
      }),
    ),
  ];
  const checked = new Map<string, boolean>();
  await Promise.all(
    urls.slice(0, 12).map(async (url) => {
      checked.set(url, await reachableImage(url));
    }),
  );
  return {
    ...output,
    operations: output.operations.map((operation) => {
      const metadata =
        operation.type === "add_item"
          ? operation.item.metadata
          : operation.type === "update_item"
            ? operation.patch.metadata
            : undefined;
      if (!metadata?.imageUrl || checked.get(metadata.imageUrl) === true)
        return operation;
      const { imageUrl: _, ...safeMetadata } = metadata;
      void _;
      return operation.type === "add_item"
        ? {
            ...operation,
            item: { ...operation.item, metadata: safeMetadata },
          }
        : operation.type === "update_item"
          ? {
              ...operation,
              patch: { ...operation.patch, metadata: safeMetadata },
            }
          : operation;
    }),
  } satisfies PlanOutput;
}

function completeObjects(text: string) {
  const marker = text.indexOf('"operations"');
  const arrayStart = marker < 0 ? -1 : text.indexOf("[", marker);
  if (arrayStart < 0) return [];
  const values: unknown[] = [];
  let start = -1,
    depth = 0,
    inString = false,
    escaped = false;
  for (let i = arrayStart + 1; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (c === "}" && depth > 0 && --depth === 0 && start >= 0) {
      try {
        values.push(JSON.parse(text.slice(start, i + 1)));
      } catch {
        /* Ignore only this incomplete operation. */
      }
      start = -1;
    } else if (c === "]" && depth === 0) break;
  }
  return values;
}
export function extractOutput(text: string) {
  const start = text.indexOf("{");
  let parsed: unknown;
  if (start >= 0) {
    let depth = 0,
      inString = false,
      escaped = false;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (c === "\\") escaped = true;
        else if (c === '"') inString = false;
        continue;
      }
      if (c === '"') inString = true;
      else if (c === "{") depth++;
      else if (c === "}" && --depth === 0) {
        try {
          parsed = JSON.parse(text.slice(start, i + 1));
        } catch {
          /* Continue with operation-level recovery. */
        }
        break;
      }
    }
  }
  const exact = outputSchema.safeParse(parsed);
  if (exact.success) return exact.data;
  const candidate = parsed as
    | { message?: unknown; operations?: unknown[] }
    | undefined;
  const rawOperations = Array.isArray(candidate?.operations)
    ? candidate.operations
    : completeObjects(text);
  const operations = rawOperations
    .flatMap((operation) => {
      const checked = tripOperationSchema.safeParse(operation);
      return checked.success ? [checked.data] : [];
    })
    .slice(0, 40);
  if (!operations.length) throw new Error("AI_RESPONSE_INVALID");
  const match = text.match(/"message"\s*:\s*("(?:\\.|[^"\\])*")/);
  let message =
    typeof candidate?.message === "string"
      ? candidate.message
      : "AI 回复尾部不完整，已安全保留其中可执行的行程安排。";
  if (match)
    try {
      message = JSON.parse(match[1]);
    } catch {
      /* Use fallback message. */
    }
  return { message, operations };
}
export async function runtime(userId: string) {
  const row = (
    await getDb()
      .select()
      .from(aiSettings)
      .where(eq(aiSettings.userId, userId))
      .limit(1)
  )[0];
  if (!row?.encryptedApiKey)
    throw new Error("请先在设置中保存 AI 模型与 API Key");
  return {
    provider: row.provider,
    model: row.model,
    key: await decryptSecret(row.encryptedApiKey),
    base: assertSafeMcpUrl(row.baseUrl).toString().replace(/\/$/, ""),
    thinkingEnabled: row.thinkingEnabled,
  };
}
const string = { type: "string" };
const uuid = { type: "string", format: "uuid" };
const itineraryResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["message", "operations"],
  properties: {
    message: string,
    operations: {
      type: "array",
      maxItems: 40,
      items: {
        anyOf: [
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "item"],
            properties: {
              type: { const: "add_item" },
              position: { type: "integer", minimum: 0 },
              item: {
                type: "object",
                additionalProperties: false,
                required: [
                  "dayId",
                  "type",
                  "title",
                  "startTime",
                  "durationMinutes",
                  "notes",
                  "cost",
                  "sourceType",
                ],
                properties: {
                  dayId: uuid,
                  type: string,
                  title: string,
                  startTime: {
                    type: "string",
                    pattern: "^([01]\\d|2[0-3]):[0-5]\\d$",
                  },
                  durationMinutes: {
                    type: "integer",
                    minimum: 5,
                    maximum: 1440,
                  },
                  notes: string,
                  cost: { type: ["number", "null"], minimum: 0 },
                  sourceType: {
                    enum: ["user_added", "ai_generated", "mcp_verified"],
                  },
                  metadata: {
                    type: ["object", "null"],
                    properties: {
                      imageUrl: string,
                      poiId: string,
                      location: string,
                      address: string,
                      introduction: string,
                    },
                    additionalProperties: false,
                  },
                },
              },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "itemId"],
            properties: { type: { const: "remove_item" }, itemId: uuid },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "itemId", "dayId", "position"],
            properties: {
              type: { const: "move_item" },
              itemId: uuid,
              dayId: uuid,
              position: { type: "integer", minimum: 0 },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "itemId", "patch"],
            properties: {
              type: { const: "update_item" },
              itemId: uuid,
              patch: {
                type: "object",
                properties: {
                  title: string,
                  startTime: string,
                  durationMinutes: { type: "integer" },
                  notes: string,
                  cost: { type: ["number", "null"] },
                  metadata: {
                    type: ["object", "null"],
                    properties: {
                      imageUrl: string,
                      poiId: string,
                      location: string,
                      address: string,
                      introduction: string,
                    },
                    additionalProperties: false,
                  },
                },
                additionalProperties: false,
              },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "budgetTotal"],
            properties: {
              type: { const: "update_budget" },
              budgetTotal: { type: ["number", "null"], minimum: 0 },
            },
          },
        ],
      },
    },
  },
};
type AiRuntime = Awaited<ReturnType<typeof runtime>>;

export async function modelCall(
  runtime: AiRuntime,
  messages: ChatMessage[],
  tools: unknown[] = [],
  structured = false,
  timeoutMs = 90000,
  responseSchema: { name: string; schema: Record<string, unknown> } = {
    name: "itinerary_operations",
    schema: itineraryResponseSchema,
  },
  maxOutputTokens?: number,
  requireToolCall = false,
  onStreamProgress?: (progress: {
    content: string;
    reasoningChars: number;
    toolCalls: number;
  }) => void | Promise<void>,
) {
  const isJsonObjectProvider =
    /deepseek/i.test(runtime.provider || "") ||
    /api\.deepseek\.com/i.test(runtime.base) ||
    /silicon(flow)?|硅基流动/i.test(runtime.provider || "") ||
    /api\.siliconflow\.cn/i.test(runtime.base);
  const controller = new AbortController();
  let timer = setTimeout(() => controller.abort(), timeoutMs);
  const resetTimeout = (durationMs: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(), durationMs);
  };
  try {
    const tokenLimit = maxOutputTokens ?? (structured ? 8192 : 6000);
    const modes = structured
      ? isJsonObjectProvider
        ? (["json", "json", "plain"] as const)
        : (["schema", "json", "plain"] as const)
      : (["plain"] as const);
    let lastStatus = 0;
    let lastDetail = "";
    for (const mode of modes) {
      const body = {
        model: runtime.model,
        messages,
        stream: true,
        ...reasoningRequestFields(
          runtime.provider,
          runtime.base,
          runtime.thinkingEnabled,
        ),
        ...completionTokenFields(runtime.provider, runtime.base, tokenLimit),
        ...(tools.length
          ? {
              tools,
              ...toolRequestFields(
                runtime.provider,
                runtime.base,
                requireToolCall,
              ),
            }
          : {}),
        ...(mode === "schema"
          ? {
              response_format: {
                type: "json_schema",
                json_schema: {
                  name: responseSchema.name,
                  strict: false,
                  schema: responseSchema.schema,
                },
              },
            }
          : mode === "json"
            ? { response_format: { type: "json_object" } }
            : {}),
      };
      const send = (payload: Record<string, unknown>) =>
        fetch(`${runtime.base}/chat/completions`, {
          method: "POST",
          redirect: "manual",
          signal: controller.signal,
          headers: {
            authorization: `Bearer ${runtime.key}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(payload),
        });
      let requestBody: Record<string, unknown> = body;
      let response = await send(requestBody);
      let compatibilityError =
        response.status === 400 ? await response.clone().text() : "";
      if (/max_completion_tokens/i.test(compatibilityError)) {
        const { max_completion_tokens: _, ...compatibleBody } = requestBody;
        void _;
        requestBody = { ...compatibleBody, max_tokens: tokenLimit };
        response = await send(requestBody);
        compatibilityError =
          response.status === 400 ? await response.clone().text() : "";
      }
      if (/parallel_tool_calls/i.test(compatibilityError)) {
        const { parallel_tool_calls: _, ...compatibleBody } = requestBody;
        void _;
        requestBody = compatibleBody;
        response = await send(requestBody);
      }
      if (response.ok) {
        let payload: {
          choices?: Array<{
            finish_reason?: string;
            message?: {
              content?: string | null;
              reasoning_content?: string | null;
              tool_calls?: ToolCall[];
            };
          }>;
        };
        if (requestBody.stream === true) {
          if (!response.body) throw new Error("AI_STREAM_EMPTY");
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let content = "";
          let reasoningContent = "";
          let finishReason = "unknown";
          const streamedToolCalls = new Map<
            number,
            {
              id: string;
              type: "function";
              function: { name: string; arguments: string };
            }
          >();
          resetTimeout(90000);
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const contentBefore = content.length;
            const reasoningBefore = reasoningContent.length;
            const toolArgumentsBefore = [...streamedToolCalls.values()].reduce(
              (total, call) =>
                total +
                call.id.length +
                call.function.name.length +
                call.function.arguments.length,
              0,
            );
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() || "";
            for (const line of lines) {
              if (!line.startsWith("data:")) continue;
              const data = line.slice(5).trim();
              if (!data || data === "[DONE]") continue;
              const event = JSON.parse(data) as {
                choices?: Array<{
                  finish_reason?: string | null;
                  delta?: {
                    content?: string | null;
                    reasoning_content?: string | null;
                    tool_calls?: Array<{
                      index: number;
                      id?: string;
                      type?: "function";
                      function?: {
                        name?: string;
                        arguments?: string;
                      };
                    }>;
                  };
                }>;
              };
              const delta = event.choices?.[0];
              content += delta?.delta?.content || "";
              reasoningContent += delta?.delta?.reasoning_content || "";
              for (const toolDelta of delta?.delta?.tool_calls || []) {
                const call = streamedToolCalls.get(toolDelta.index) || {
                  id: "",
                  type: "function" as const,
                  function: { name: "", arguments: "" },
                };
                call.id += toolDelta.id || "";
                call.function.name += toolDelta.function?.name || "";
                call.function.arguments +=
                  toolDelta.function?.arguments || "";
                streamedToolCalls.set(toolDelta.index, call);
              }
              if (delta?.finish_reason) finishReason = delta.finish_reason;
            }
            const toolArgumentsAfter = [...streamedToolCalls.values()].reduce(
              (total, call) =>
                total +
                call.id.length +
                call.function.name.length +
                call.function.arguments.length,
              0,
            );
            if (
              content.length > contentBefore ||
              reasoningContent.length > reasoningBefore ||
              toolArgumentsAfter > toolArgumentsBefore
            ) {
              resetTimeout(90000);
              await onStreamProgress?.({
                content,
                reasoningChars: reasoningContent.length,
                toolCalls: streamedToolCalls.size,
              });
            }
          }
          payload = {
            choices: [
              {
                finish_reason: finishReason,
                message: {
                  content,
                  reasoning_content: reasoningContent || null,
                  tool_calls: [...streamedToolCalls.entries()]
                    .sort(([left], [right]) => left - right)
                    .map(([, call]) => call),
                },
              },
            ],
          };
        } else {
          payload = (await response.json()) as typeof payload;
        }
        const choice = payload.choices?.[0];
        if (!choice?.message) throw new Error("AI_RESPONSE_EMPTY");
        const dsml = parseDsmlToolCalls(choice.message.content || "");
        const toolCalls = choice.message.tool_calls?.length
          ? choice.message.tool_calls
          : dsml.toolCalls;
        if (tools.length && dsml.detected && !toolCalls.length)
          throw new Error("AI_TOOL_CALL_PROTOCOL_INVALID");
        if (structured && choice.finish_reason === "length")
          throw new Error("AI_JSON_TRUNCATED");
        if (
          structured &&
          !dsml.content &&
          !toolCalls.length
        ) {
          lastStatus = 200;
          lastDetail = "AI_JSON_EMPTY";
          continue;
        }
        return {
          content: dsml.content,
          reasoningContent: choice.message.reasoning_content || null,
          toolCalls,
          finishReason: choice.finish_reason || "unknown",
          responseMode: mode,
        };
      }
      lastStatus = response.status;
      lastDetail = (await response.text()).slice(0, 300);
      if (response.status !== 400 && response.status !== 422) break;
    }
    if (lastStatus === 401 || lastStatus === 403)
      throw new Error("API Key 无效或模型无访问权限");
    if (lastStatus === 200 && lastDetail === "AI_JSON_EMPTY")
      throw new Error("AI_JSON_EMPTY");
    throw new Error(`AI_STAGE_HTTP_${lastStatus}:${lastDetail}`);
  } finally {
    clearTimeout(timer);
  }
}
export async function systemFor(
  tripId: string,
  mode: "conversation" | "format" = "conversation",
  confirmedAnswer = "",
  responseKind: "reply" | "plan" = "plan",
) {
  const trip = await loadTrip(tripId);
  if (!trip) throw new Error("TRIP_NOT_FOUND");
  const days = trip.days.map((day) => ({
    dayId: day.id,
    date: day.date,
    title: day.title,
    items: day.items.map((item) => ({
      id: item.id,
      title: item.title,
      type: item.type,
      startTime: item.startTime,
      durationMinutes: item.durationMinutes,
      cost: item.cost,
      locked: item.locked,
      sourceType: item.sourceType,
    })),
  }));
  const tripData = JSON.stringify({
    title: trip.title,
    destination: trip.destination,
    startDate: trip.startDate,
    endDate: trip.endDate,
    currency: trip.currency,
    budgetTotal: trip.budgetTotal,
    constraints: trip.constraints,
    days,
  });
  const travelers = Math.max(
    1,
    Number((trip.constraints as { travelers?: unknown })?.travelers) || 1,
  );
  const budgetGuidance = buildBudgetGuidance({
    budgetTotal: trip.budgetTotal,
    currency: trip.currency,
    dayCount: days.length,
    travelers,
  });
  const imageTarget = Math.min(8, Math.max(2, days.length));
  if (mode === "conversation")
    return `你是旅迹旅行规划助手，像普通 AI 助手一样与用户自然对话。可用 MCP 工具会在本次请求中以实时工具定义提供；只能依据实际提供的工具名称、说明、参数结构和调用结果选择及使用工具，不得假定某个服务或工具一定存在。你可以自主连续调用任意次数的可用 MCP；每次获得工具结果后自行判断是否需要继续查询，不要预先固定工具清单，也不要为了凑数量调用无关工具。不得编造工具结果。${responseKind === "reply" ? "本次是直接问答：准确回答用户当前问题，不要擅自扩写成完整逐日方案，也不要要求用户确认写入。" : `本次是方案生成或调整：给出完整、可讨论的方案，并明确等待用户确认后再写入行程。排程时必须逐一检查同一天相邻地点：地点不同且需要移动时，优先从本次实际提供的工具中选择合适的路线工具，获取步行、公交或驾车耗时；在方案时间轴中单独列出交通方式、出发时间和预计耗时，并在工具耗时之外预留合理的步行进出、候车、停车或拥堵缓冲。下一项开始时间不得早于上一项结束时间加通勤与缓冲；没有合适工具或无法查询路线时必须明确标注为估算，不得假装已验证。检查已有行程时，重点找出零间隔、通勤不足和跨区域折返。查询充分后，用清晰中文给出可讨论的逐日方案、交通衔接、用餐与休息建议。${budgetGuidance}`}生成完整方案时，先选出每天最有代表性的 1–2 个核心景点。若网页搜索或网页正文工具可用，应优先联网检索这些核心景点的可靠资料，并综合地点详情与网页资料，为每个核心景点写约 150–300 字的实用介绍，至少包含历史或人文背景、最值得看的特色、推荐游览方式和一项预约/开放时间/避坑提示；不要只写一句泛泛介绍。普通景点写 50–120 字即可，餐饮、交通和休息项目保持简洁。涉及会变化的票价、开放时间或预约政策时必须以工具结果为准，无法核实时明确提示用户复核，不得编造。若地点搜索或详情工具能够返回图片，应合并查询这些核心景点的详情，目标是在全程方案中获得约 ${imageTarget} 个不同核心地点的可靠主图，而不是只给少数地点配图。工具返回与地点直接对应的公开 HTTPS 图片 URL 时，原样使用 Markdown 图片语法紧随该地点介绍展示。优先保证核心景点图片，再按推荐价值补充特色酒店、餐厅或体验图片；普通交通和休息项目无需图片。图片 URL 必须来自本轮工具结果，禁止猜测、拼接、改写或使用无关图片；每个地点最多一张主图，同一图片不得重复展示。某地点查不到可靠图片就跳过，不得反复查询或为了达到数量而阻塞方案生成。此阶段禁止输出 JSON 或 operations，也不要声称已经写入行程。当前行程：${tripData}`;
  const empty = days.every((day) => day.items.length === 0);
  return `你是行程结构化执行器。你的主要任务不是重新思考或重新规划，而是把用户已经确认的文字方案准确转换为行程 operations。已确认方案中的日期、地点、顺序、时间、交通与取舍是权威内容；不得擅自替换地点、增加无关安排、改变节奏或重新做可行性评审。${budgetGuidance}
工具查询只允许由重点景点的“介绍或图片缺口”驱动：
1. 只补充确认方案中重点景点尚缺少的可靠简介或直接对应图片。核心景点简介不足时可使用网页搜索或正文读取工具补充历史人文、核心看点和实用游览提示，目标约 150–300 字；优先让每天至少一个核心景点拥有可靠主图。
2. 严禁在本阶段查询路线、距离、通勤时间、地址、坐标、POI ID、天气、酒店、餐厅、航班、火车票或其他信息；这些内容必须完全依据已确认方案转换。
3. 不得为了丰富内容逐个查询普通地点，不得重复核验已有可靠介绍或图片，不得搜索、比价、替换或扩展任何候选。
4. 能在同一轮确定的重点景点应合并查询；介绍和图片已经足够时立即调用 finish_research。
搜索不到补充信息就省略，不得阻塞最终生成，不得用模型记忆冒充工具结果。最终必须只输出一个合法、完整的 json 对象，禁止 Markdown、代码围栏和额外文字。json 顶层格式示例：{"message":"已生成行程变更预览","operations":[{"type":"add_item","item":{"dayId":"必须替换为当前行程中的真实 dayId","type":"景点","title":"示例地点","startTime":"09:00","durationMinutes":120,"notes":"预约、集合点等行程信息","cost":0,"sourceType":"mcp_verified","metadata":{"introduction":"地点的历史人文、特色与评价","imageUrl":"工具返回的公开 HTTPS 图片 URL"}}}]}。operations 仅允许 add_item、remove_item、update_item、move_item、update_budget；新增项目必须包含 dayId、type、title、startTime(HH:mm)、durationMinutes、notes、cost、sourceType。严格区分 notes 与 metadata.introduction：notes 只记录预约、集合点、同行人、交通衔接等行程执行信息；景点或餐厅的历史人文、特色、推荐亮点和评价写入 metadata.introduction。输出 JSON 前必须逐项检查已确认方案：凡方案中某个地点已经紧邻展示了可靠 Markdown 图片，该地点写入 add_item 或 update_item 时必须把其中的 HTTPS URL 原样复制到 metadata.imageUrl，不得遗漏；不得把图片分配给其他地点。若本阶段工具返回更直接对应的地点图片，也应原样写入。每个项目最多一张主图，同一图片不得复用。metadata.imageUrl 必须与项目直接对应并原样保留；严禁猜测、拼接或改写 URL，没有可靠图片时必须省略 imageUrl。若工具结果含 POI ID、坐标、地址、评价或来源信息，可写入对应 metadata。使用工具核验的项目 sourceType="mcp_verified"，未核验的项目 sourceType="ai_generated"。不可修改 locked=true 项目，最多40项。${empty ? `当前行程为空，必须覆盖全部 ${days.length} 天且每天至少2项。` : "对照确认方案与现有行程：保留仍需要的安排；同一安排发生变化时优先 update_item 或 move_item；确认方案已替换或不再需要的未锁定旧安排必须 remove_item；只为真正新增的安排使用 add_item，禁止重复追加。"} 当前行程：${tripData}\n已确认方案：${confirmedAnswer}`;
}

const priorities: Record<string, string[]> = {
  amap: [
    "maps_weather",
    "maps_text_search",
    "maps_around_search",
    "maps_search_detail",
    "maps_geo",
    "maps_direction_transit_integrated",
    "maps_direction_walking",
    "maps_distance",
  ],
  rollinggo: [
    "searchHotels",
    "getHotelDetail",
    "getHotelSearchTags",
    "searchAirports",
    "searchFlights",
  ],
  rail: [
    "search_stations",
    "get-current-date",
    "get-tickets",
    "get-train-route",
  ],
  searxng: [
    "searxng_web_search",
    "web_url_read",
    "searxng_search_suggestions",
    "searxng_instance_info",
  ],
};
function prioritized<T extends { name: string }>(provider: string, tools: T[]) {
  const key = provider.toLowerCase();
  const order =
    key.includes("高德") || key.includes("amap")
      ? priorities.amap
      : key.includes("道旅") || key.includes("rolling")
        ? priorities.rollinggo
        : key.includes("12306") || key.includes("rail")
          ? priorities.rail
          : key.includes("searx")
            ? priorities.searxng
            : [];
  return [...tools].sort((a, b) => {
    const ai = order.indexOf(a.name),
      bi = order.indexOf(b.name);
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
  });
}
export async function discover(request: Request) {
  const all = await configs(request);
  const enabled = Object.values(all).filter(
    (c) => c.enabled && c.permission !== "deny" && c.endpoint,
  );
  const results = await Promise.race([
    Promise.allSettled(
      enabled.map(async (config) => ({
        config,
        tools: await discoverTools(config),
      })),
    ),
    new Promise<PromiseRejectedResult[]>((resolve) =>
      setTimeout(
        () =>
          resolve(
            enabled.map(() => ({
              status: "rejected",
              reason: new Error("MCP_DISCOVERY_TIMEOUT"),
            })),
          ),
        15000,
      ),
    ),
  ]);
  const catalog: CatalogItem[] = [];
  for (const result of results)
    if (result.status === "fulfilled")
      for (const tool of prioritized(
        result.value.config.name,
        result.value.tools,
      ).slice(0, 8))
        catalog.push({
          alias: `mcp_${catalog.length}`,
          providerId: result.value.config.id,
          providerName: result.value.config.name,
          toolName: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        });
  return catalog.slice(0, 32);
}

export async function assertUsefulPlan(
  tripId: string,
  prompt: string,
  output: z.infer<typeof outputSchema>,
) {
  const trip = await loadTrip(tripId);
  if (!trip) throw new Error("TRIP_NOT_FOUND");
  const empty = trip.days.every((day) => day.items.length === 0);
  const full = /完整|生成|规划|补全|一键/.test(prompt);
  if (empty || full) {
    const additions = output.operations.filter(
      (operation) => operation.type === "add_item",
    );
    const covered = new Set([
      ...trip.days
        .filter((day) => !empty && day.items.length > 0)
        .map((day) => day.id),
      ...additions.map((operation) =>
        operation.type === "add_item" ? operation.item.dayId : "",
      ),
    ]);
    const minimum = empty ? Math.min(40, trip.days.length * 2) : 0;
    if (
      additions.length < minimum ||
      trip.days.some((day) => !covered.has(day.id))
    )
      throw new Error("AI_PLAN_INCOMPLETE");
  }
  return output;
}
export async function executeTools(
  request: Request,
  catalog: CatalogItem[],
  calls: ToolCall[],
) {
  const safeMcpResult = (value: unknown) => {
    const json = JSON.stringify(value);
    return json.replace(
      /http:\/\/(store\.is\.autonavi\.com|aos-comment\.amap\.com)(?=\/)/gi,
      "https://$1",
    );
  };
  const all = await configs(request);
  return Promise.all(
    calls.map(async (call) => {
      const item = catalog.find((c) => c.alias === call.function.name);
      if (!item || !all[item.providerId])
        return {
          id: call.id,
          content: JSON.stringify({ error: "MCP_TOOL_NOT_FOUND" }),
          trace: null,
        };
      const started = Date.now();
      try {
        const result = await callTool(
          all[item.providerId],
          item.toolName,
          JSON.parse(call.function.arguments || "{}"),
        );
        return {
          id: call.id,
          content: safeMcpResult(result).slice(0, 8000),
          trace: {
            serverId: item.providerId,
            provider: item.providerName,
            tool: item.toolName,
            status: "success" as const,
            durationMs: Date.now() - started,
          },
        };
      } catch (error) {
        const code = error instanceof Error ? error.message : "MCP_CALL_FAILED";
        return {
          id: call.id,
          content: JSON.stringify({ error: code }),
          trace: {
            serverId: item.providerId,
            provider: item.providerName,
            tool: item.toolName,
            status: "error" as const,
            durationMs: Date.now() - started,
            error: code,
          },
        };
      }
    }),
  );
}
