"use client";
/* eslint-disable @next/next/no-img-element -- MCP image hosts are dynamic and cannot be preconfigured. */

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { normalizeMarkdownTables } from "@/lib/markdown";
import {
  ArrowUp,
  Pencil,
  PanelRightClose,
  PanelRightOpen,
  RotateCcw,
  Square,
  Settings,
  Sparkles,
  Undo2,
} from "lucide-react";

type Proposal = {
  message: string;
  operations: unknown[];
  requiresConfirmation?: boolean;
  mcpTrace?: Array<{
    provider: string;
    tool: string;
    status: "success" | "error";
    durationMs: number;
    error?: string;
  }>;
  mcpAvailable?: boolean;
};
type Message = { role: "assistant" | "user"; text: string };
type JobActivity = {
  kind: "assistant" | "system" | "tool" | "warning";
  status: "active" | "completed" | "success" | "error";
  title: string;
  detail?: string;
};
type AiJob = {
  id: string;
  tripId: string;
  prompt: string;
  mode: "conversation" | "format";
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  stage: string;
  progress: number;
  attempts: number;
  activity: JobActivity[];
  createdAt: string;
  updatedAt: string;
  result: Proposal | null;
  error: string | null;
};

const markdownComponents: Components = {
  a: (props) => <a {...props} target="_blank" rel="noreferrer" />,
  img: (props) => (
    <img
      {...props}
      loading="lazy"
      referrerPolicy="no-referrer"
      alt={props.alt || "旅行地点图片"}
    />
  ),
};
const markdownPlugins = [remarkGfm];
const jobTimestamp = (value: string) => {
  const normalized = /Z$|[+-]\d\d:\d\d$/.test(value)
    ? value
    : `${value.replace(" ", "T")}Z`;
  return new Date(normalized).getTime();
};

export function AiAssistant({
  tripId,
  destination,
  hasItems,
  busy,
  onApply,
  onSettings,
  request,
}: {
  tripId: string;
  destination: string;
  hasItems: boolean;
  busy: boolean;
  onApply: (operations: unknown[]) => Promise<void>;
  onSettings: () => void;
  request: <T>(url: string, options?: RequestInit) => Promise<T>;
}) {
  const [prompt, setPrompt] = useState("");
  const [thinking, setThinking] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const [expanded, setExpanded] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [confirmedPlan, setConfirmedPlan] = useState<Proposal | null>(null);
  const [job, setJob] = useState<AiJob | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      text: `告诉我你想怎样游览${destination}。我会像普通 AI 助手一样查询实时工具并先与你讨论方案，只有你确认后才会生成行程变更。`,
    },
  ]);
  const eventStreamRef = useRef<HTMLDivElement>(null);
  const chatLogRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const didInitialChatScrollRef = useRef(false);
  useEffect(() => {
    const textarea = composerRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const nextHeight = Math.min(textarea.scrollHeight, 180);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > 180 ? "auto" : "hidden";
  }, [prompt]);
  useEffect(() => {
    if (!thinking) return;
    setClock(Date.now());
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [thinking]);
  const activeJobId = job?.id;
  const activeJobStatus = job?.status;
  useEffect(() => {
    setProposal(null);
    setConfirmedPlan(null);
    didInitialChatScrollRef.current = false;
    setMessages([
      {
        role: "assistant",
        text: `告诉我你想怎样游览${destination}。我会像普通 AI 助手一样查询实时工具并先与你讨论方案，只有你确认后才会生成行程变更。`,
      },
    ]);
  }, [tripId, destination]);
  useEffect(() => {
    let cancelled = false;
    request<{ job: AiJob | null; history: AiJob[] }>(
      `/api/ai/jobs?tripId=${encodeURIComponent(tripId)}`,
    )
      .then(({ job: latest, history }) => {
        if (cancelled) return;
        const restored: Message[] = [
          {
            role: "assistant",
            text: `告诉我你想怎样游览${destination}。我会像普通 AI 助手一样查询实时工具并先与你讨论方案，只有你确认后才会生成行程变更。`,
          },
        ];
        for (const item of history || [])
          if (item.mode === "conversation") {
            restored.push({ role: "user", text: item.prompt });
            if (item.status === "completed" && item.result?.message)
              restored.push({ role: "assistant", text: item.result.message });
            else if (item.status === "failed" && item.error)
              restored.push({ role: "assistant", text: item.error });
          }
        didInitialChatScrollRef.current = false;
        setMessages(restored);
        const active = latest && ["queued", "running"].includes(latest.status);
        if (active) {
          setJob(latest);
          setThinking(true);
          return;
        }
        const reversed = [...(history || [])].reverse();
        const lastFormat = reversed.find(
          (item) =>
            item.mode === "format" &&
            item.status === "completed" &&
            Boolean(item.result?.operations.length),
        );
        const lastConversation = reversed.find(
          (item) =>
            item.mode === "conversation" &&
            item.status === "completed" &&
            item.result?.requiresConfirmation,
        );
        if (
          lastFormat?.result?.operations.length &&
          (!lastConversation ||
            new Date(lastFormat.updatedAt) >
              new Date(lastConversation.updatedAt))
        ) {
          setJob(lastFormat);
          setProposal(lastFormat.result);
        } else if (
          lastConversation?.result &&
          (!lastFormat ||
            new Date(lastConversation.updatedAt) >
              new Date(lastFormat.updatedAt))
        )
          setConfirmedPlan(lastConversation.result);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [tripId, destination, request]);
  useEffect(() => {
    if (
      !activeJobId ||
      !activeJobStatus ||
      !["queued", "running"].includes(activeJobStatus)
    )
      return;
    let stopped = false;
    const poll = async () => {
      try {
        const data = await request<{ job: AiJob }>(
          `/api/ai/jobs/${activeJobId}`,
        );
        if (stopped) return;
        setJob(data.job);
        if (data.job.status === "completed" && data.job.result) {
          if (data.job.result.operations.length) {
            setProposal(data.job.result);
            setConfirmedPlan(null);
          } else if (data.job.result.requiresConfirmation)
            setConfirmedPlan(data.job.result);
          setMessages((current) => [
            ...current,
            { role: "assistant", text: data.job.result!.message },
          ]);
          setThinking(false);
        } else if (
          data.job.status === "failed" ||
          data.job.status === "cancelled"
        ) {
          setMessages((current) => [
            ...current,
            {
              role: "assistant",
              text:
                data.job.error ||
                (data.job.status === "cancelled"
                  ? "后台规划已取消。"
                  : "后台规划失败，请重试。"),
            },
          ]);
          setThinking(false);
        } else window.setTimeout(poll, 1200);
      } catch {
        if (!stopped) window.setTimeout(poll, 2500);
      }
    };
    const timer = window.setTimeout(poll, 500);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [activeJobId, activeJobStatus, request]);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const stream = eventStreamRef.current;
      if (stream)
        stream.scrollTo({ top: stream.scrollHeight, behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [job?.activity?.length, job?.stage]);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const chat = chatLogRef.current;
      if (!chat) return;
      if (didInitialChatScrollRef.current)
        chat.scrollTo({ top: chat.scrollHeight, behavior: "smooth" });
      else {
        chat.scrollTop = chat.scrollHeight;
        didInitialChatScrollRef.current = true;
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages, thinking, proposal, confirmedPlan]);

  const ask = useCallback(
    async (
      text: string,
      responseKind: "reply" | "plan" = "plan",
      dispatchIntent?:
        | "answer"
        | "create_or_revise_plan"
        | "accept_pending_plan",
    ) => {
      const question = text.trim();
      if (!question || thinking) return;
      setMessages((current) => [...current, { role: "user", text: question }]);
      setPrompt("");
      setProposal(null);
      if (responseKind === "plan") setConfirmedPlan(null);
      setThinking(true);
      try {
        const conversation = messages
          .slice(-24)
          .map((message) => ({ role: message.role, content: message.text }));
        const result = await request<{ job: AiJob }>("/api/ai/jobs", {
          method: "POST",
          body: JSON.stringify({
            tripId,
            prompt: question,
            useMcp: true,
            mode: "conversation",
            responseKind,
            dispatchIntent,
            conversation,
          }),
        });
        setJob(result.job);
      } catch (error) {
        setMessages((current) => [
          ...current,
          {
            role: "assistant",
            text:
              error instanceof Error ? error.message : "暂时无法创建规划任务。",
          },
        ]);
        setThinking(false);
      }
    },
    [thinking, messages, request, tripId],
  );
  useEffect(() => {
    const generate = (event: Event) => {
      const detail = (
        event as CustomEvent<{ tripId?: string; prompt?: string }>
      ).detail;
      if (detail?.tripId === tripId && detail.prompt)
        void ask(detail.prompt, "plan");
    };
    window.addEventListener("lvji:generate-plan", generate);
    return () => window.removeEventListener("lvji:generate-plan", generate);
  }, [tripId, ask]);
  const apply = async () => {
    if (!proposal?.operations.length) return;
    await onApply(proposal.operations);
    if (job?.mode === "format")
      await request(`/api/ai/jobs/${job.id}`, { method: "DELETE" }).catch(
        () => undefined,
      );
    setProposal(null);
    setConfirmedPlan(null);
    setMessages((current) => [
      ...current,
      {
        role: "assistant",
        text: "已按你的确认更新行程。你可以继续告诉我下一步怎么调整。",
      },
    ]);
  };
  const formatConfirmedPlan = useCallback(
    async (
      announce = true,
      dispatchIntent?:
        | "answer"
        | "create_or_revise_plan"
        | "accept_pending_plan",
      planOverride?: Proposal,
    ) => {
      const plan = planOverride || confirmedPlan;
      if (!plan || thinking) return;
      setThinking(true);
      if (announce)
        setMessages((current) => [
          ...current,
          { role: "user", text: "确认这个方案，请生成行程变更预览。" },
        ]);
      try {
        const result = await request<{ job: AiJob }>("/api/ai/jobs", {
          method: "POST",
          body: JSON.stringify({
            tripId,
            prompt: "把用户确认的方案完整转换为当前行程的结构化变更。",
            useMcp: true,
            mode: "format",
            dispatchIntent,
            confirmedAnswer: `${plan.message}\n\n结构化要求：用户已经明确要求生成，不要再询问方案末尾尚未回答的少量问题；优先使用当前行程的日期、旅行偏好与备注，并对抵达时间、住宿档次等缺失细节采用保守合理的默认值。把方案中每段必要移动转换为独立的“交通”项目，交通项目从上一地点结束时开始，时长包含已查询的路线耗时和方案中说明的缓冲；后一项目不得在交通结束前开始。不得编造方案中没有的路线或耗时。`,
            confirmedTrace: plan.mcpTrace || [],
          }),
        });
        setJob(result.job);
      } catch (error) {
        setMessages((current) => [
          ...current,
          {
            role: "assistant",
            text:
              error instanceof Error ? error.message : "暂时无法生成行程预览。",
          },
        ]);
        setThinking(false);
      }
    },
    [confirmedPlan, thinking, request, tripId],
  );
  const cancelJob = async () => {
    if (!job) return;
    try {
      await request(`/api/ai/jobs/${job.id}`, { method: "DELETE" });
      setJob((value) =>
        value ? { ...value, status: "cancelled", stage: "cancelled" } : value,
      );
      setThinking(false);
    } catch {
      /* Polling will keep the authoritative state. */
    }
  };
  const resetConversation = async () => {
    if (thinking) return;
    try {
      await request(`/api/ai/jobs?tripId=${encodeURIComponent(tripId)}`, {
        method: "DELETE",
      });
      setJob(null);
      setProposal(null);
      setConfirmedPlan(null);
      setPrompt("");
      setMessages([
        {
          role: "assistant",
          text: `告诉我你想怎样游览${destination}。我会像普通 AI 助手一样查询实时工具并先与你讨论方案，只有你确认后才会生成行程变更。`,
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: error instanceof Error ? error.message : "无法重置聊天记录。",
        },
      ]);
    }
  };
  const lastUserMessageIndex = messages
    .map((message, index) => (message.role === "user" ? index : -1))
    .reduce((latest, index) => Math.max(latest, index), -1);
  const withdrawLastMessage = async (edit = false) => {
    if (thinking || lastUserMessageIndex < 0) return;
    const text = messages[lastUserMessageIndex]?.text || "";
    try {
      await request(
        `/api/ai/jobs?tripId=${encodeURIComponent(tripId)}&scope=latest-conversation`,
        { method: "DELETE" },
      );
      setMessages((current) => current.slice(0, lastUserMessageIndex));
      setJob(null);
      setProposal(null);
      setConfirmedPlan(null);
      if (edit) {
        setPrompt(text);
        window.requestAnimationFrame(() => {
          composerRef.current?.focus();
          composerRef.current?.setSelectionRange(text.length, text.length);
        });
      }
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: error instanceof Error ? error.message : "无法撤回上一条消息。",
        },
      ]);
    }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const question = prompt.trim();
    if (!question || thinking) return;
    setThinking(true);
    try {
      const result = await request<{
        action: "reply" | "plan" | "apply";
        intent:
          | "answer"
          | "create_or_revise_plan"
          | "accept_pending_plan";
        recoveredPlan?: Proposal;
      }>(
        "/api/ai/dispatch",
        {
          method: "POST",
          body: JSON.stringify({
            tripId,
            message: question,
            pendingPlan: confirmedPlan?.message,
            conversation: messages.slice(-8).map((message) => ({
              role: message.role,
              content: message.text.slice(-12000),
            })),
          }),
        },
      );
      setThinking(false);
      const acceptedPlan = confirmedPlan || result.recoveredPlan;
      if (result.action === "apply" && acceptedPlan) {
        setPrompt("");
        setMessages((current) => [
          ...current,
          { role: "user", text: question },
        ]);
        void formatConfirmedPlan(false, result.intent, acceptedPlan);
      } else
        void ask(
          question,
          result.action === "plan" ? "plan" : "reply",
          result.intent,
        );
    } catch (error) {
      setThinking(false);
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          text:
            error instanceof Error
              ? `请求调度失败：${error.message}`
              : "请求调度失败，请重试。",
        },
      ]);
    }
  };

  return (
    <aside className={`ai-dock${expanded ? " expanded" : ""}`}>
      <header>
        <div className="dock-actions">
          <button
            className="complete-plan"
            onClick={() =>
              void ask(
                hasItems
                  ? "检查当前行程，补全空白日期，并逐项核对相邻地点的通勤时间。为需要移动的项目插入明确的交通安排，修复零间隔或时间不足的项目，同时预留步行、候车、停车等缓冲。"
                  : `为我的${destination}旅行生成完整的逐日行程，兼顾景点、用餐、交通与休息。查询相邻地点的实际路线和通勤时间，为每段必要移动安排交通项目并预留合理缓冲。`,
                "plan",
              )
            }
            disabled={thinking}
            aria-label={hasItems ? "智能补全行程" : "生成完整行程"}
            title={hasItems ? "智能补全行程" : "生成完整行程"}
          >
            <Sparkles aria-hidden="true" />
          </button>
          <button
            onClick={() => setExpanded((value) => !value)}
            aria-label={expanded ? "收起 AI 侧边栏" : "展开 AI 侧边栏"}
            aria-pressed={expanded}
            title={expanded ? "收起侧边栏" : "展开侧边栏"}
          >
            {expanded ? (
              <PanelRightClose aria-hidden="true" />
            ) : (
              <PanelRightOpen aria-hidden="true" />
            )}
          </button>
          <button
            className="reset-chat"
            onClick={() => void resetConversation()}
            disabled={thinking}
            aria-label="重置聊天记录"
            title="重置聊天记录"
          >
            <RotateCcw aria-hidden="true" />
          </button>
          <button
            onClick={onSettings}
            aria-label="打开 AI 设置"
            title="AI 设置"
          >
            <Settings aria-hidden="true" />
          </button>
        </div>
      </header>
      <div className="chat-log" ref={chatLogRef} aria-live="polite">
        {messages.map((message, index) => (
          <div key={index} className={`chat-message ${message.role}`}>
            <span>{message.role === "assistant" ? "旅迹 AI" : "你"}</span>
            {message.role === "assistant" ? (
              <div className="markdown-body">
                <ReactMarkdown
                  remarkPlugins={markdownPlugins}
                  components={markdownComponents}
                >
                  {normalizeMarkdownTables(message.text)}
                </ReactMarkdown>
              </div>
            ) : (
              <>
                <p>{message.text}</p>
                {index === lastUserMessageIndex && !thinking && (
                  <div className="message-actions">
                    <button
                      type="button"
                      onClick={() => void withdrawLastMessage(true)}
                      aria-label="编辑并重新发送上一条消息"
                      title="编辑重发"
                    >
                      <Pencil aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void withdrawLastMessage(false)}
                      aria-label="撤回上一条消息"
                      title="撤回"
                    >
                      <Undo2 aria-hidden="true" />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        ))}
        {thinking && (
          <div className="job-stream">
            <header>
              <span>
                <i />
                实时执行
              </span>
              <small>
                {job?.createdAt
                  ? `已用时 ${Math.max(0, Math.floor((clock - jobTimestamp(job.createdAt)) / 1000))} 秒 · ${job.progress}%`
                  : "正在启动"}
              </small>
            </header>
            <div className="job-events" ref={eventStreamRef}>
              {(
                job?.activity || [
                  {
                    kind: "assistant",
                    status: "active",
                    title: "正在创建规划任务",
                  } as JobActivity,
                ]
              ).map((event, index) => (
                <article
                  key={`${index}-${event.title}`}
                  className={`${event.kind} ${event.status}`}
                >
                  <i>
                    {event.kind === "tool"
                      ? "工"
                      : event.kind === "system"
                        ? "系"
                        : event.kind === "warning"
                          ? "!"
                          : "AI"}
                  </i>
                  <div>
                    <b>{event.title}</b>
                    {event.detail && <small>{event.detail}</small>}
                  </div>
                  {event.status === "active" ? (
                    <em>···</em>
                  ) : (
                    <span>{event.status === "error" ? "失败" : "完成"}</span>
                  )}
                </article>
              ))}
            </div>
            <footer>
              <span>
                自动显示最新动态，可向上滚动查看历史
                {job?.attempts ? ` · 当前阶段第 ${job.attempts} 次重试` : ""}
              </span>
              <button onClick={() => void cancelJob()}>取消任务</button>
            </footer>
          </div>
        )}
        {confirmedPlan && !thinking && (
          <section className="proposal conversation-confirm">
            <div>
              <b>方案等待确认</b>
            </div>
            <p>
              你可以继续在下方对话中修改；满意后再生成结构化变更预览，此时仍不会直接写入行程。
            </p>
            <button onClick={() => void formatConfirmedPlan()}>
              确认方案并生成预览
            </button>
          </section>
        )}
        {proposal && (
          <section className="proposal">
            <div>
              <b>行程修改预览</b>
              <span>{proposal.operations.length} 项变更</span>
            </div>
            {proposal.operations.length ? (
              <>
                <p>
                  检查建议后确认，才会写入当前行程并生成新版本。需要回退时可打开左侧“版本历史”。
                </p>
                <button onClick={() => void apply()} disabled={busy}>
                  确认应用到行程
                </button>
                <button className="discard" onClick={() => setProposal(null)}>
                  暂不应用
                </button>
              </>
            ) : (
              <p>当前行程不需要修改，你可以继续提出更具体的要求。</p>
            )}
          </section>
        )}
      </div>
      <form className="chat-composer" onSubmit={submit}>
        <div className="composer-field">
          <textarea
            ref={composerRef}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={1}
            aria-label="向 AI 描述你的行程需求"
          />
          <div className="composer-actions">
            <button
              type={thinking ? "button" : "submit"}
              disabled={!thinking && !prompt.trim()}
              onClick={thinking ? () => void cancelJob() : undefined}
              aria-label={thinking ? "停止生成" : "发送给 AI"}
              title={thinking ? "停止生成" : "发送"}
            >
              {thinking ? (
                <Square className="stop-icon" aria-hidden="true" />
              ) : (
                <ArrowUp aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </form>
    </aside>
  );
}
