import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { aiJobs } from "@/db/schema";
import { modelCall, runtime } from "@/lib/ai/planner";
import { requireRequestUser } from "@/lib/auth/request-user";
import { loadTrip } from "@/lib/trips/serialize";
import {
  deterministicDispatch,
  dispatchAction,
  looksLikePlanCandidate,
  type DispatchDecision,
} from "@/lib/ai/dispatch";

const inputSchema = z.object({
  tripId: z.string().uuid(),
  message: z.string().trim().min(1).max(2000),
  pendingPlan: z.string().max(30000).optional(),
  conversation: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(12000),
      }),
    )
    .max(8)
    .optional(),
});
const outputSchema = z.object({
  pendingPlanDecision: z.enum(["accept", "revise", "reject", "undecided"]),
  requestKind: z.enum(["answer", "plan", "none"]),
});
const dispatchResponseSchema = {
  name: "request_dispatch",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["pendingPlanDecision", "requestKind"],
    properties: {
      pendingPlanDecision: {
        enum: ["accept", "revise", "reject", "undecided"],
      },
      requestKind: { enum: ["answer", "plan", "none"] },
    },
  },
};

function parseAction(content: string) {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI_DISPATCH_INVALID");
  try {
    return outputSchema.parse(JSON.parse(content.slice(start, end + 1)));
  } catch {
    throw new Error(
      `AI_DISPATCH_OUTPUT_INVALID:${content.slice(0, 500)}`,
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireRequestUser(request);
    const input = inputSchema.parse(await request.json());
    const trip = await loadTrip(input.tripId);
    if (!trip || trip.userId !== user.id)
      return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    let recoveredPlan:
      | { message: string; operations: []; requiresConfirmation: true; mcpTrace: unknown[] }
      | undefined;
    if (!input.pendingPlan) {
      const recent = await getDb()
        .select()
        .from(aiJobs)
        .where(and(eq(aiJobs.userId, user.id), eq(aiJobs.tripId, input.tripId)))
        .orderBy(desc(aiJobs.createdAt))
        .limit(20);
      const completedFormatIndex = recent.findIndex((job) => {
        if (job.status !== "completed") return false;
        const context = JSON.parse(job.contextJson || "{}") as { mode?: string };
        const result = job.resultJson
          ? (JSON.parse(job.resultJson) as { operations?: unknown[] })
          : null;
        return context.mode === "format" && Boolean(result?.operations?.length);
      });
      const candidate = recent.find((job, index) => {
        if (completedFormatIndex >= 0 && index > completedFormatIndex) return false;
        if (job.status !== "completed" || !job.resultJson) return false;
        const context = JSON.parse(job.contextJson || "{}") as {
          mode?: string;
          responseKind?: string;
          dispatchIntent?: string;
        };
        const result = JSON.parse(job.resultJson) as {
          message?: string;
          operations?: unknown[];
          requiresConfirmation?: boolean;
        };
        return (
          context.mode === "conversation" &&
          !result.operations?.length &&
          Boolean(result.message) &&
          (result.requiresConfirmation ||
            context.responseKind === "plan" ||
            context.dispatchIntent === "create_or_revise_plan" ||
            looksLikePlanCandidate(result.message!))
        );
      });
      if (candidate?.resultJson) {
        const result = JSON.parse(candidate.resultJson) as {
          message: string;
          mcpTrace?: unknown[];
        };
        recoveredPlan = {
          message: result.message,
          operations: [],
          requiresConfirmation: true,
          mcpTrace: result.mcpTrace || [],
        };
      }
    }
    const pendingPlan = input.pendingPlan || recoveredPlan?.message;
    const deterministic = deterministicDispatch(input.message, Boolean(pendingPlan));
    if (deterministic) {
      return Response.json({
        ...dispatchAction(deterministic, Boolean(pendingPlan)),
        ...deterministic,
        source: "deterministic",
        recoveredPlan,
      });
    }
    const modelRuntime = await runtime(user.id);
    const messages = [
        {
          role: "system",
          content:
            '你是旅行助手的语义状态分析器，只输出 JSON，不直接决定程序动作。结合待确认状态、方案结尾、近期对话和最新消息完成两个独立判断。pendingPlanDecision 表示用户对当前待确认方案的态度：accept=决定采用现有方案，也包括“不了/不用了，就这样吧”这类拒绝额外提问或服务、同时维持现有方案的说法；revise=要求调整现有方案；reject=明确不要现有方案本身；undecided=没有表达对方案的决定。requestKind 表示除此之外的请求：answer=询问事实或请求解释；plan=要求创建、补全或重新规划；none=没有其他请求。注意：“不用查了”“没有别的要求”否定的是额外服务，不是否定方案；“不要这个方案”才是 reject。分析否定、转折和多个分句时，判断每个否定的实际宾语，并以整句话最终表达的决定为准。不存在待确认方案时 pendingPlanDecision 必须为 undecided。输出格式 {"pendingPlanDecision":"accept|revise|reject|undecided","requestKind":"answer|plan|none"}。',
        },
        {
          role: "user",
          content: `是否存在待确认方案：${pendingPlan ? "是" : "否"}\n${pendingPlan ? `待确认方案结尾：${pendingPlan.slice(-4000)}\n` : ""}近期对话结尾：${JSON.stringify((input.conversation || []).slice(-4).map((item) => ({ ...item, content: item.content.slice(-2000) })))}\n最新消息：${input.message}`,
        },
      ];
    const answer = await modelCall(
      modelRuntime,
      messages,
      [],
      true,
      60000,
      dispatchResponseSchema,
      512,
    );
    let result: DispatchDecision;
    try {
      result = parseAction(answer.content);
    } catch {
      const repaired = await modelCall(
        modelRuntime,
        [
          ...messages,
          { role: "assistant", content: answer.content },
          {
            role: "user",
            content:
              '上一个输出不符合语义状态 JSON Schema。保持相同判断，只返回合法的 {"pendingPlanDecision":"accept|revise|reject|undecided","requestKind":"answer|plan|none"}。',
          },
        ],
        [],
        true,
        60000,
        dispatchResponseSchema,
        512,
      );
      result = parseAction(repaired.content);
    }
    const { intent, action } = dispatchAction(result, Boolean(pendingPlan));
    return Response.json({
      action,
      intent,
      pendingPlanDecision: result.pendingPlanDecision,
      requestKind: result.requestKind,
      source: "model",
      recoveredPlan,
    });
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "请求调度模型响应超时，请重试"
        : error instanceof z.ZodError
          ? `调度请求格式不正确：${error.issues.map((issue) => `${issue.path.join(".") || "root"} ${issue.message}`).join("；")}`
          : error instanceof Error
          ? error.message
          : "AI_DISPATCH_FAILED";
    return Response.json({ error: message }, { status: 400 });
  }
}
