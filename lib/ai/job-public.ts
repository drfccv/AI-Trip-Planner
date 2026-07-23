import { aiJobs } from "@/db/schema";
import type { JobContext } from "./planner";

const timestampMs = (value: string | Date) => {
  if (value instanceof Date) return value.getTime();
  const normalized = value
    .replace(" ", "T")
    .replace(/([+-]\d\d)$/, "$1:00")
    .replace(/([+-]\d\d)(\d\d)$/, "$1:$2");
  const timestamp = Date.parse(
    /Z$|[+-]\d\d:\d\d$/.test(normalized)
      ? normalized
      : `${normalized}Z`,
  );
  return Number.isFinite(timestamp) ? timestamp : Date.now();
};

export function publicAiJob(job: typeof aiJobs.$inferSelect) {
  const context = JSON.parse(job.contextJson || "{}") as JobContext;
  const activity: Array<{
    kind: "assistant" | "system" | "tool" | "warning";
    status: "active" | "completed" | "success" | "error";
    title: string;
    detail?: string;
  }> = [
    {
      kind: "assistant",
      status: "completed",
      title: "已读取你的需求和当前行程",
    },
    ...(context.events || []),
  ];
  if (job.status === "queued" || job.status === "running")
    activity.push({
      kind: job.stage === "calling_mcp" ? "tool" : "assistant",
      status: "active",
      title:
        context.mode === "format"
          ? job.stage === "preparing_format"
            ? "正在准备生成行程变更"
            : job.stage === "finalizing_itinerary"
              ? "正在生成最终结构化行程"
            : job.stage === "repairing_response"
              ? "正在校验并修复行程结构"
              : "正在生成逐日安排、通勤与执行字段"
          : job.stage === "discovering_mcp"
            ? "正在连接 MCP 工具"
            : job.stage === "calling_mcp"
              ? "正在执行实时工具调用"
              : job.stage === "repairing_response"
                ? "正在严格校验并修复结构"
                : "AI 正在根据实时结果继续规划",
      detail:
        context.mode === "format"
          ? job.stage === "repairing_response"
            ? context.structureFailure === "AI_JSON_TRUNCATED"
              ? "首次输出因长度限制被截断，正在压缩后重新生成"
              : context.structureFailure === "AI_JSON_EMPTY"
                ? "模型首次返回空内容，正在重新请求"
                : context.structureFailure === "AI_RESPONSE_INVALID"
                  ? "首次输出不是可执行的行程 json，正在重新生成"
                  : context.structureFailure
                    ? `首次输出未通过完整性校验：${context.structureFailure}`
                    : undefined
            : job.stage === "calling_mcp"
              ? "正在补充资料与图片"
              : "正在沿用确认方案生成结构化行程，并按需补充地点介绍与图片"
          : undefined,
    });
  if (
    context.lastStageError &&
    (job.status === "queued" || job.status === "running")
  )
    activity.push({
      kind: "warning",
      status: "active",
      title: `上一次尝试：${context.lastStageError}`,
    });
  if (job.error)
    activity.push({
      kind: "warning",
      status: job.status === "failed" ? "error" : "active",
      title: job.error,
    });
  return {
    id: job.id,
    tripId: job.tripId,
    prompt: job.prompt,
    mode: context.mode || "conversation",
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    attempts: job.attempts,
    activity,
    result: job.resultJson ? JSON.parse(job.resultJson) : null,
    error: job.error,
    streamingContent:
      job.status === "queued" || job.status === "running"
        ? context.streamingContent || null
        : null,
    streamingContentChars: context.streamingContentChars || 0,
    streamingToolCalls: context.streamingToolCalls || 0,
    createdAt: job.createdAt,
    createdAtMs: timestampMs(job.createdAt),
    updatedAt: job.updatedAt,
  };
}
