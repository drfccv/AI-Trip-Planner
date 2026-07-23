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
import { compactToolEvidence } from "./evidence";
import {
  selectFormatResearchTools,
  selectRelevantTools,
} from "./tool-selection";

const MAX_TOOL_RESULT_CHARS = 8000;
const MAX_TOOL_HISTORY_CHARS = 96000;
const MODEL_AGENT_TIMEOUT_MS = 240000;
const FORMAT_MAX_TOOL_ROUNDS = 4;
const FORMAT_MAX_TOOL_CALLS = 24;
const FINISH_RESEARCH_TOOL = {
  type: "function",
  function: {
    name: "finish_research",
    description:
      "当实时资料已经足够生成可靠的完整行程时调用。调用后系统会进入最终结构化生成，不再提供实时工具。",
    parameters: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description: "简要说明已核验的关键信息",
        },
      },
      required: ["summary"],
    },
  },
};

const callSignature = (call: {
  function: { name: string; arguments: string };
}) => `${call.function.name}:${call.function.arguments}`;

const trimToolHistory = <T extends { role: string; content: string | null }>(
  history: T[],
) => {
  let trimmed = history;
  const size = () =>
    trimmed.reduce(
      (total, message) => total + (message.content?.length || 0) + 512,
      0,
    );
  while (trimmed.length && size() > MAX_TOOL_HISTORY_CHARS) {
    const nextRound = trimmed.findIndex(
      (message, index) => index > 0 && message.role === "assistant",
    );
    if (nextRound < 0) break;
    trimmed = trimmed.slice(nextRound);
  }
  return trimmed;
};

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
            : stage === "finalizing_itinerary"
              ? 88
            : stage === "repairing_response"
              ? 92
              : 0;
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
  if (!claimed.length) return false;
  const job = claimed[0];
  const context = JSON.parse(job.contextJson || "{}") as JobContext;
  const request = new Request(`${origin}/api/ai/jobs/${jobId}/advance`, {
    headers: auth,
  });
  const createStreamReporter = (showContent: boolean) => {
    let lastHeartbeat = 0;
    return async (progress: {
      content: string;
      reasoningChars: number;
      toolCalls: number;
    }) => {
      if (Date.now() - lastHeartbeat < 10000) return;
      lastHeartbeat = Date.now();
      await db
        .update(aiJobs)
        .set({
          contextJson: JSON.stringify({
            ...context,
            streamingContent: showContent
              ? progress.content.slice(0, 30000)
              : undefined,
            streamingContentChars: progress.content.length,
            streamingToolCalls: progress.toolCalls,
          }),
          updatedAt: new Date().toISOString(),
        })
        .where(and(eq(aiJobs.id, jobId), eq(aiJobs.status, "running")));
    };
  };
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
      const relevantCatalog =
        mode === "format"
          ? selectFormatResearchTools(catalog)
          : selectRelevantTools(
              catalog,
              `${job.prompt}\n${context.confirmedAnswer || ""}`,
            );
      const tools = relevantCatalog.map((item) => ({
        type: "function",
        function: {
          name: item.alias,
          description: `${item.providerName} / ${item.toolName}: ${item.description || "实时查询"}`,
          parameters: item.inputSchema || { type: "object", properties: {} },
        },
      }));
      const messages = [
        {
          role: "system",
          content:
            tools.length &&
            context.responseKind !== "reply" &&
            mode === "format"
              ? `${system}\n本轮只允许为确认方案中的重点景点补充可靠介绍和直接对应图片。禁止查询路线、距离、坐标、天气、酒店、餐厅、交通票务或其他信息；已有介绍和图片足够时立即调用 finish_research。互不依赖且参数已知的地点应在同一轮一起查询。`
              : tools.length && context.responseKind !== "reply"
                ? `${system}\n本轮已经提供实时工具。生成或调整旅行方案时必须至少调用一个与用户需求直接相关的工具核验实时信息，不得跳过工具直接给出未经核验的完整方案。`
              : system,
        },
        ...(context.conversation || []),
        { role: "user", content: job.prompt },
      ];
      const modelTools =
        mode === "format" && tools.length
          ? [...tools, FINISH_RESEARCH_TOOL]
          : tools;
      const answer = await modelCall(
        rt,
        messages,
        modelTools,
        mode === "format" && tools.length === 0,
        MODEL_AGENT_TIMEOUT_MS,
        undefined,
        undefined,
        tools.length > 0 && context.responseKind !== "reply",
        createStreamReporter(mode === "conversation"),
      );
      const requestedCalls = answer.toolCalls.filter(
        (call) => call.function.name !== "finish_research",
      );
      const finishedResearch = answer.toolCalls.some(
        (call) => call.function.name === "finish_research",
      );
      if (requestedCalls.length) {
        nextContext = {
          ...context,
          assistantContent: answer.content,
          assistantReasoningContent: answer.reasoningContent,
          calls: requestedCalls,
          events: [
            ...(context.events || []),
            {
              kind: "assistant",
              status: "completed",
              title: "AI 已分析对话，开始实时查询",
              detail: `${requestedCalls.length} 个工具调用`,
            },
          ],
        };
        nextStage = "calling_mcp";
      } else if (mode === "format" && finishedResearch) {
        nextContext = {
          ...context,
          events: [
            ...(context.events || []),
            {
              kind: "assistant",
              status: "completed",
              title: "实时资料核验完成，开始生成最终行程",
            },
          ],
        };
        nextStage = "finalizing_itinerary";
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
      const remainingFormatCalls =
        context.mode === "format"
          ? Math.max(
              0,
              FORMAT_MAX_TOOL_CALLS - (context.trace || []).length,
            )
          : Number.POSITIVE_INFINITY;
      const requestedCalls = (context.calls || []).slice(
        0,
        remainingFormatCalls,
      );
      const cached = new Map<string, string>();
      for (let index = 0; index < (context.history || []).length; index++) {
        const message = (context.history || [])[index];
        if (message.role !== "assistant" || !message.tool_calls?.length) continue;
        for (const call of message.tool_calls) {
          const toolResult = (context.history || [])
            .slice(index + 1)
            .find(
              (candidate) =>
                candidate.role === "tool" &&
                candidate.tool_call_id === call.id,
            );
          if (toolResult?.content)
            cached.set(callSignature(call), toolResult.content);
        }
      }
      const freshBySignature = new Map<string, (typeof requestedCalls)[number]>();
      for (const call of requestedCalls) {
        const signature = callSignature(call);
        if (
          !cached.has(signature) &&
          !freshBySignature.has(signature)
        )
          freshBySignature.set(signature, call);
      }
      const freshOutputs = await executeTools(
        request,
        catalog,
        [...freshBySignature.values()],
      );
      const freshContent = new Map<string, string>();
      const freshOutputById = new Map(
        freshOutputs.map((output) => [output.id, output]),
      );
      for (const [signature, call] of freshBySignature) {
        const output = freshOutputById.get(call.id);
        if (output) freshContent.set(signature, output.content);
      }
      const outputs = requestedCalls.map((call) => {
        const signature = callSignature(call);
        const fresh = freshOutputById.get(call.id);
        if (fresh) return fresh;
        const reusedContent =
          cached.get(signature) || freshContent.get(signature);
        return {
          id: call.id,
          content:
            reusedContent ||
            JSON.stringify({ error: "MCP_TOOL_NO_RESULT" }),
          trace: null,
          reused: Boolean(reusedContent),
        };
      });
      const toolMessages = outputs.map((x) => ({
        id: x.id,
        content: x.content.slice(0, MAX_TOOL_RESULT_CHARS),
      }));
      const history = trimToolHistory([
        ...(context.history || []),
        {
          role: "assistant",
          content: context.assistantContent || null,
          reasoning_content: context.assistantReasoningContent || undefined,
          tool_calls: requestedCalls,
        },
        ...toolMessages.map((item) => ({
          role: "tool",
          content: item.content,
          tool_call_id: item.id,
        })),
      ]);
      const toolEvents = outputs.map((output, index) => {
        const call = (context.calls || [])[index];
        const definition = catalog.find(
          (item) => item.alias === call?.function.name,
        );
        return {
          kind: "tool" as const,
          status:
            output.trace?.status ||
            ("reused" in output && output.reused
              ? ("success" as const)
              : ("error" as const)),
          title: `${definition?.providerName || "MCP"} · ${definition?.toolName || call?.function.name || "未知工具"}`,
          detail: output.trace
            ? output.trace.status === "success"
              ? `调用成功 · ${output.trace.durationMs}ms`
              : `调用失败 · ${output.trace.error || "未知错误"}`
            : "reused" in output && output.reused
              ? "复用本任务中相同参数的既有结果"
              : "工具未返回结果",
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
      const formatResearchComplete =
        mode === "format" &&
        ((context.round || 0) >= FORMAT_MAX_TOOL_ROUNDS ||
          (context.trace || []).length >= FORMAT_MAX_TOOL_CALLS);
      if (formatResearchComplete) {
        nextContext = {
          ...context,
          events: [
            ...(context.events || []),
            {
              kind: "assistant",
              status: "completed",
              title: "细节补充完成，开始按确认方案生成行程",
              detail: `已完成 ${context.round || 0} 轮、${(context.trace || []).length} 次实时核验`,
            },
          ],
        };
        nextStage = "finalizing_itinerary";
      } else {
      const relevantCatalog =
        mode === "format"
          ? selectFormatResearchTools(catalog)
          : selectRelevantTools(
              catalog,
              `${job.prompt}\n${context.confirmedAnswer || ""}`,
            );
      const tools = relevantCatalog.map((item) => ({
        type: "function",
        function: {
          name: item.alias,
          description: `${item.providerName} / ${item.toolName}: ${item.description || "实时查询"}`,
          parameters: item.inputSchema || { type: "object", properties: {} },
        },
      }));
      const availableTools =
        mode === "format" && tools.length
          ? [...tools, FINISH_RESEARCH_TOOL]
          : tools;
      const messages = [
        {
          role: "system",
          content:
            mode === "format" && tools.length
              ? `${system}\n只继续为重点景点补充尚缺少的可靠介绍或直接对应图片。禁止查询路线、距离、坐标、天气、酒店、餐厅、交通票务和其他字段，也不要逐个丰富普通项目。资料足够时必须立即调用 finish_research；不要在工具调用阶段直接生成最终 JSON。`
              : system,
        },
        ...(context.conversation || []),
        { role: "user", content: job.prompt },
        ...(context.history || []),
      ];
      const answer = await modelCall(
        rt,
        messages,
        availableTools,
        mode === "format" && availableTools.length === 0,
        MODEL_AGENT_TIMEOUT_MS,
        undefined,
        undefined,
        false,
        createStreamReporter(mode === "conversation"),
      );
      const requestedCalls = answer.toolCalls.filter(
        (call) => call.function.name !== "finish_research",
      );
      const finishedResearch = answer.toolCalls.some(
        (call) => call.function.name === "finish_research",
      );
      if (requestedCalls.length) {
        const nextRound = (context.round || 0) + 1;
        nextContext = {
          ...context,
          assistantContent: answer.content,
          assistantReasoningContent: answer.reasoningContent,
          calls: requestedCalls,
          events: [
            ...(context.events || []),
            {
              kind: "assistant",
              status: "completed",
              title: `AI 根据结果继续第 ${nextRound} 轮查询`,
              detail: `新增 ${requestedCalls.length} 个工具调用`,
            },
          ],
        };
        nextStage = "calling_mcp";
      } else if (mode === "format" && finishedResearch) {
        nextContext = {
          ...context,
          events: [
            ...(context.events || []),
            {
              kind: "assistant",
              status: "completed",
              title: "实时资料核验完成，开始生成最终行程",
            },
          ],
        };
        nextStage = "finalizing_itinerary";
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
      }
    } else if (job.stage === "finalizing_itinerary") {
      const rt = await runtime(userId);
      const system = await systemFor(
        job.tripId,
        "format",
        context.confirmedAnswer,
        context.responseKind,
      );
      const answer = await modelCall(
        rt,
        [
          {
            role: "system",
            content: `${system}\n实时资料核验已经结束。只能基于已有资料输出最终、完整、合法的 JSON，不得请求或描述任何后续工具调用。`,
          },
          ...(context.conversation || []),
          { role: "user", content: job.prompt },
          {
            role: "user",
            content: `以下是已经去重和压缩的实时核验资料。只提取与已确认方案相关的事实，不得补造缺失字段：${compactToolEvidence(context.history || [])}`,
          },
        ],
        [],
        true,
        MODEL_AGENT_TIMEOUT_MS,
        undefined,
        16000,
        false,
        createStreamReporter(false),
      );
      try {
        const output = await assertUsefulPlan(
          job.tripId,
          job.prompt,
          extractOutput(answer.content),
        );
        result = {
          ...(await removeUnreachablePlanImages(output)),
          requiresConfirmation: false,
          mcpTrace: context.trace || context.confirmedTrace || [],
          mcpAvailable: (context.catalog || []).length > 0,
        };
      } catch (error) {
        nextContext = {
          ...context,
          rawAnswer: answer.content,
          structureFailure:
            error instanceof Error ? error.message : "AI_RESPONSE_INVALID",
        };
        nextStage = "repairing_response";
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
        undefined,
        16000,
        false,
        createStreamReporter(false),
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
    nextContext = {
      ...nextContext,
      streamingContent: undefined,
      streamingContentChars: undefined,
      streamingToolCalls: undefined,
    };
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
      return true;
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
    return true;
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
    return true;
  }
}

export async function runAiJobLoop(
  jobId: string,
  userId: string,
  auth: Record<string, string>,
  origin: string,
) {
  const db = getDb();
  const current = (
    await db
      .select({ status: aiJobs.status, updatedAt: aiJobs.updatedAt })
      .from(aiJobs)
      .where(and(eq(aiJobs.id, jobId), eq(aiJobs.userId, userId)))
      .limit(1)
  )[0];
  if (
    current?.status === "running" &&
    Date.now() - new Date(current.updatedAt).getTime() > 360000
  )
    await db
      .update(aiJobs)
      .set({
        status: "queued",
        error: "检测到后台执行中断，正在从最近检查点恢复",
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(aiJobs.id, jobId),
          eq(aiJobs.userId, userId),
          eq(aiJobs.status, "running"),
        ),
      );
  while (true) {
    const progressed = await advanceAiJob(jobId, userId, auth, origin);
    if (!progressed) return;
    const next = (
      await db
        .select({ status: aiJobs.status })
        .from(aiJobs)
        .where(and(eq(aiJobs.id, jobId), eq(aiJobs.userId, userId)))
        .limit(1)
    )[0];
    if (!next || next.status !== "queued") return;
  }
}
