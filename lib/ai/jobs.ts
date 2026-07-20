import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { aiJobs, mcpCallLogs } from "@/db/schema";
import {
  assertUsefulPlan,
  discover,
  executeTools,
  extractOutput,
  modelCall,
  removeUnreachablePlanImages,
  runtime,
  systemFor,
  type JobContext,
} from "./planner";
import { looksLikePlanCandidate } from "./dispatch";

const stageProgress = (stage: string, round = 0) =>
  stage === "preparing_format"
    ? 6
    : stage === "discovering_mcp"
      ? 5
      : stage === "planning_tool_calls"
        ? 12
        : stage === "calling_mcp"
          ? Math.min(72, 18 + round * 10)
          : stage === "composing_itinerary"
            ? Math.min(82, 24 + round * 10)
            : stage === "repairing_response"
              ? 92
              : 0;
const nextRequest = async (
  origin: string,
  id: string,
  auth: Record<string, string>,
) => {
  await fetch(`${origin}/api/ai/jobs/${id}/advance`, {
    method: "POST",
    headers: auth,
  }).catch(() => undefined);
};

export async function advanceAiJob(
  jobId: string,
  userId: string,
  auth: Record<string, string>,
  origin: string,
) {
  const db = getDb();
  const now = new Date().toISOString();
  const claimed = await db
    .update(aiJobs)
    .set({ status: "running", startedAt: now, updatedAt: now, error: null })
    .where(
      and(
        eq(aiJobs.id, jobId),
        eq(aiJobs.userId, userId),
        eq(aiJobs.status, "queued"),
      ),
    )
    .returning();
  if (!claimed.length) return;
  const job = claimed[0];
  const context = JSON.parse(job.contextJson || "{}") as JobContext;
  const request = new Request(`${origin}/api/ai/jobs/${jobId}/advance`, {
    headers: auth,
  });
  try {
    let nextStage = job.stage;
    let nextContext = context;
    let result: unknown;
    if (job.stage === "preparing_format") {
      nextContext = {
        ...context,
        events: [
          {
            kind: "system",
            status: "completed",
            title: "已载入确认方案",
            detail: context.confirmedTrace?.length
              ? `已继承前序 ${context.confirmedTrace.length} 项 MCP 调用记录，仍可继续查询核验`
              : "正在与当前行程结构逐项对应，并准备实时核验",
          },
          {
            kind: "assistant",
            status: "completed",
            title: "已读取日期、现有安排与锁定项目",
          },
        ],
      };
      nextStage = "discovering_mcp";
    } else if (job.stage === "discovering_mcp") {
      const catalog = job.useMcp ? await discover(request) : [];
      nextContext = {
        ...context,
        mode: context.mode || "conversation",
        catalog,
        round: 0,
        history: [],
        trace: [],
        events: [
          {
            kind: "system",
            status: "completed",
            title: `已连接 MCP，发现 ${catalog.length} 个实时工具`,
          },
        ],
      };
      nextStage = "planning_tool_calls";
    } else if (job.stage === "planning_tool_calls") {
      const rt = await runtime(userId);
      const mode = context.mode || "conversation";
      const system = await systemFor(
        job.tripId,
        mode,
        context.confirmedAnswer,
        context.responseKind,
      );
      const catalog = context.catalog || [];
      const tools = catalog.map((item) => ({
        type: "function",
        function: {
          name: item.alias,
          description: `${item.providerName} / ${item.toolName}: ${item.description || "实时查询"}`,
          parameters: item.inputSchema || { type: "object", properties: {} },
        },
      }));
      const messages = [
        { role: "system", content: system },
        ...(context.conversation || []),
        { role: "user", content: job.prompt },
      ];
      const answer = await modelCall(
        rt,
        messages,
        tools,
        mode === "format" && tools.length === 0,
        mode === "format" ? 240000 : 90000,
      );
      if (answer.toolCalls.length) {
        nextContext = {
          ...context,
          assistantContent: answer.content,
          calls: answer.toolCalls,
          events: [
            ...(context.events || []),
            {
              kind: "assistant",
              status: "completed",
              title: "AI 已分析对话，开始实时查询",
              detail: `${answer.toolCalls.length} 个工具调用`,
            },
          ],
        };
        nextStage = "calling_mcp";
      } else if (mode === "conversation") {
        result = {
          message: answer.content || "我还需要你补充一些旅行偏好。",
          operations: [],
          requiresConfirmation:
            context.responseKind !== "reply" ||
            context.dispatchIntent === "create_or_revise_plan" ||
            looksLikePlanCandidate(answer.content || ""),
          mcpTrace: [],
          mcpAvailable: catalog.length > 0,
        };
      } else {
        try {
          const output = await assertUsefulPlan(
            job.tripId,
            job.prompt,
            extractOutput(answer.content),
          );
          result = {
            ...(await removeUnreachablePlanImages(output)),
            requiresConfirmation: false,
            mcpTrace: context.confirmedTrace || [],
            mcpAvailable: catalog.length > 0,
          };
        } catch (error) {
          const structureFailure =
            error instanceof Error ? error.message : "AI_RESPONSE_INVALID";
          nextContext = {
            ...context,
            rawAnswer: answer.content,
            structureFailure,
          };
          nextStage = "repairing_response";
        }
      }
    } else if (job.stage === "calling_mcp") {
      const catalog = context.catalog || [];
      const outputs = await executeTools(request, catalog, context.calls || []);
      const toolMessages = outputs.map((x) => ({
        id: x.id,
        content: x.content,
      }));
      const history = [
        ...(context.history || []),
        {
          role: "assistant",
          content: context.assistantContent || null,
          tool_calls: context.calls,
        },
        ...toolMessages.map((item) => ({
          role: "tool",
          content: item.content,
          tool_call_id: item.id,
        })),
      ];
      const toolEvents = outputs.map((output, index) => {
        const call = (context.calls || [])[index];
        const definition = catalog.find(
          (item) => item.alias === call?.function.name,
        );
        return {
          kind: "tool" as const,
          status: output.trace?.status || ("error" as const),
          title: `${definition?.providerName || "MCP"} · ${definition?.toolName || call?.function.name || "未知工具"}`,
          detail: output.trace
            ? output.trace.status === "success"
              ? `调用成功 · ${output.trace.durationMs}ms`
              : `调用失败 · ${output.trace.error || "未知错误"}`
            : "工具不存在",
        };
      });
      nextContext = {
        ...context,
        history,
        toolMessages,
        round: (context.round || 0) + 1,
        events: [...(context.events || []), ...toolEvents],
        trace: [
          ...(context.trace || []),
          ...outputs.flatMap((x) => (x.trace ? [x.trace] : [])),
        ],
      };
      for (const item of outputs)
        if (item.trace)
          await db
            .insert(mcpCallLogs)
            .values({
              id: crypto.randomUUID(),
              userId,
              serverId: item.trace.serverId,
              toolName: item.trace.tool,
              status: item.trace.status,
              durationMs: item.trace.durationMs,
              errorCode: "error" in item.trace ? item.trace.error : null,
            })
            .catch(() => undefined);
      nextStage = "composing_itinerary";
    } else if (job.stage === "composing_itinerary") {
      const rt = await runtime(userId);
      const mode = context.mode || "conversation";
      const system = await systemFor(
        job.tripId,
        mode,
        context.confirmedAnswer,
        context.responseKind,
      );
      const catalog = context.catalog || [];
      const tools = catalog.map((item) => ({
        type: "function",
        function: {
          name: item.alias,
          description: `${item.providerName} / ${item.toolName}: ${item.description || "实时查询"}`,
          parameters: item.inputSchema || { type: "object", properties: {} },
        },
      }));
      const availableTools =
        mode === "format" && (context.round || 0) >= 2 ? [] : tools;
      const messages = [
        { role: "system", content: system },
        ...(context.conversation || []),
        { role: "user", content: job.prompt },
        ...(context.history || []),
      ];
      const answer = await modelCall(
        rt,
        messages,
        availableTools,
        mode === "format" && availableTools.length === 0,
        mode === "format" ? 240000 : 90000,
      );
      if (answer.toolCalls.length) {
        const nextRound = (context.round || 0) + 1;
        nextContext = {
          ...context,
          assistantContent: answer.content,
          calls: answer.toolCalls,
          events: [
            ...(context.events || []),
            {
              kind: "assistant",
              status: "completed",
              title: `AI 根据结果继续第 ${nextRound} 轮查询`,
              detail: `新增 ${answer.toolCalls.length} 个工具调用`,
            },
          ],
        };
        nextStage = "calling_mcp";
      } else if (mode === "conversation") {
        nextContext = {
          ...context,
          events: [
            ...(context.events || []),
            {
              kind: "assistant",
              status: "completed",
              title: `AI 已完成 ${context.round || 0} 轮实时查询并回复`,
            },
          ],
        };
        result = {
          message: answer.content || "查询完成，请告诉我还要怎样调整。",
          operations: [],
          requiresConfirmation: context.responseKind !== "reply",
          mcpTrace: context.trace || [],
          mcpAvailable: catalog.length > 0,
        };
      } else {
        const output = await assertUsefulPlan(
          job.tripId,
          job.prompt,
          extractOutput(answer.content),
        );
        result = {
          ...(await removeUnreachablePlanImages(output)),
          requiresConfirmation: false,
          mcpTrace: context.trace || context.confirmedTrace || [],
          mcpAvailable: catalog.length > 0,
        };
      }
    } else if (job.stage === "repairing_response") {
      const rt = await runtime(userId);
      const system = await systemFor(
        job.tripId,
        "format",
        context.confirmedAnswer,
      );
      const answer = await modelCall(
        rt,
        [
          {
            role: "system",
            content: `${system}\n这是最终结构纠错步骤。上一次失败原因：${context.structureFailure || "结构不符合要求"}。必须输出合法且完整的 json，并尽量精炼 notes 以避免截断。`,
          },
          {
            role: "user",
            content: `待纠正结果：${(context.rawAnswer || "").slice(0, 16000)}`,
          },
        ],
        [],
        true,
        240000,
      );
      const output = await assertUsefulPlan(
        job.tripId,
        job.prompt,
        extractOutput(answer.content),
      );
      result = {
        ...(await removeUnreachablePlanImages(output)),
        requiresConfirmation: false,
        mcpTrace: context.confirmedTrace || [],
        mcpAvailable: false,
      };
    }
    if (result) {
      const finished = new Date().toISOString();
      await db
        .update(aiJobs)
        .set({
          status: "completed",
          stage: "ready_for_review",
          progress: 100,
          resultJson: JSON.stringify(result),
          contextJson: JSON.stringify(nextContext),
          completedAt: finished,
          updatedAt: finished,
          attempts: 0,
        })
        .where(and(eq(aiJobs.id, jobId), eq(aiJobs.status, "running")));
      return;
    }
    await db
      .update(aiJobs)
      .set({
        status: "queued",
        stage: nextStage,
        progress: Math.max(
          job.progress,
          stageProgress(nextStage, nextContext.round || 0),
        ),
        contextJson: JSON.stringify(nextContext),
        attempts: 0,
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(aiJobs.id, jobId), eq(aiJobs.status, "running")));
    await nextRequest(origin, jobId, auth);
  } catch (error) {
    const attempts = job.attempts + 1;
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "当前阶段响应超时"
        : error instanceof Error
          ? error.message
          : "AI_JOB_STAGE_FAILED";
    if (attempts <= 2) {
      await db
        .update(aiJobs)
        .set({
          status: "queued",
          attempts,
          error: `${message}，正在重试当前阶段（${attempts}/2）`,
          contextJson: JSON.stringify({ ...context, lastStageError: message }),
          updatedAt: new Date().toISOString(),
        })
        .where(and(eq(aiJobs.id, jobId), eq(aiJobs.status, "running")));
      await nextRequest(origin, jobId, auth);
    } else {
      const finished = new Date().toISOString();
      await db
        .update(aiJobs)
        .set({
          status: "failed",
          stage: "failed",
          error: `${message}；当前阶段重试失败`,
          attempts,
          completedAt: finished,
          updatedAt: finished,
        })
        .where(and(eq(aiJobs.id, jobId), eq(aiJobs.status, "running")));
    }
  }
}
