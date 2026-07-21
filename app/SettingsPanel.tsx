"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChoiceField } from "./PlanningFields";
import {
  defaultTravelPreferences,
  travelPreferencesKey,
  type UserTravelPreferences,
} from "@/lib/user-preferences";
import "./settings-product.css";

type Tab = "preferences" | "ai" | "mcp" | "privacy";
type Server = {
  id: string;
  name: string;
  endpoint: string;
  homepage?: string;
  enabled: boolean;
  permission: "deny" | "ask" | "readonly";
  authMode: "none" | "bearer" | "authorization";
  source: "builtin" | "custom";
  configured?: boolean;
  secretHint?: string | null;
  status?: "idle" | "testing" | "connected" | "error";
  error?: string;
};
type Props = {
  dark: boolean;
  onThemeChange: (dark: boolean) => void;
  onDataDeleted: () => void;
  onMessage: (message: string) => void;
};
const providerPresets: Record<string, { baseUrl: string; model: string }> = {
  "openai-compatible": {
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5-mini",
  },
  deepseek: { baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  siliconflow: {
    baseUrl: "https://api.siliconflow.cn/v1",
    model: "Qwen/Qwen3-8B",
  },
  volcengine: {
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    model: "doubao-seed-2-0-lite-260215",
  },
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    model: "openai/gpt-4.1-mini",
  },
};

async function json(url: string, options?: RequestInit) {
  const response = await fetch(url, {
    cache: "no-store",
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options?.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

export function SettingsPanel({
  dark,
  onThemeChange,
  onDataDeleted,
  onMessage,
}: Props) {
  const [tab, setTab] = useState<Tab>("preferences");
  const [preferences, setPreferences] = useState<UserTravelPreferences>(
    defaultTravelPreferences,
  );
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Server | null>(null);
  const [secret, setSecret] = useState("");
  const [formError, setFormError] = useState("");
  const [ai, setAi] = useState({
    provider: "openai-compatible",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5-mini",
    thinkingEnabled: false,
    configured: false,
    keyHint: "",
  });
  const [aiKey, setAiKey] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [deleteScope, setDeleteScope] = useState<"trips" | "all" | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await json("/api/mcp/servers");
      setServers(
        data.servers.map((server: Server) => ({ ...server, status: "idle" })),
      );
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "MCP 配置读取失败");
    } finally {
      setLoading(false);
    }
  }, [onMessage]);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void load());
    return () => window.cancelAnimationFrame(frame);
  }, [load]);
  useEffect(() => {
    json("/api/ai/settings")
      .then((data) => setAi(data.settings))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const saved = window.localStorage.getItem(travelPreferencesKey);
        if (saved)
          setPreferences({ ...defaultTravelPreferences, ...JSON.parse(saved) });
      } catch {
        /* Keep defaults if stored preferences are malformed. */
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    if (!editing) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [editing]);
  const patch = (id: string, value: Partial<Server>) =>
    setServers((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...value } : row)),
    );
  const saveToggle = async (server: Server, enabled: boolean) => {
    patch(server.id, { enabled });
    try {
      await json("/api/mcp/servers", {
        method: "PUT",
        body: JSON.stringify({ ...server, enabled }),
      });
    } catch (error) {
      patch(server.id, { enabled: !enabled });
      onMessage(error instanceof Error ? error.message : "保存失败");
    }
  };
  const test = async (server: Server) => {
    patch(server.id, { status: "testing", error: "" });
    try {
      const data = await json(`/api/mcp/servers/${server.id}/test`, {
        method: "POST",
      });
      patch(server.id, { status: "connected" });
      onMessage(`${server.name} 已连接，发现 ${data.toolCount || 0} 个工具`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "连接失败";
      patch(server.id, { status: "error", error: message });
    }
  };
  const save = async () => {
    if (!editing) return;
    setFormError("");
    try {
      const url = new URL(editing.endpoint);
      if (url.protocol !== "https:") throw new Error("仅允许公开 HTTPS 地址");
      if (editing.id === "amap" && url.searchParams.has("key"))
        throw new Error(
          "请从 URL 中移除 key，并在下方 API Key 输入框填写，避免密钥返回前端",
        );
      await json("/api/mcp/servers", {
        method: "PUT",
        body: JSON.stringify({
          ...editing,
          apiKey:
            editing.authMode === "bearer" ? secret || undefined : undefined,
          authHeader:
            editing.authMode === "authorization"
              ? secret || undefined
              : undefined,
        }),
      });
      setEditing(null);
      setSecret("");
      await load();
      onMessage("MCP 配置已保存");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "保存失败");
    }
  };
  const add = () =>
    setEditing({
      id: `custom_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`,
      name: "",
      endpoint: "",
      enabled: true,
      permission: "ask",
      authMode: "none",
      source: "custom",
    });
  const remove = async (server: Server) => {
    try {
      await json("/api/mcp/servers", {
        method: "DELETE",
        body: JSON.stringify({ id: server.id }),
      });
      setServers((rows) => rows.filter((row) => row.id !== server.id));
      onMessage("自定义 MCP 已删除");
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "删除失败");
    }
  };
  const saveAi = async () => {
    setAiBusy(true);
    try {
      const data = await json("/api/ai/settings", {
        method: "PUT",
        body: JSON.stringify({
          provider: ai.provider,
          baseUrl: ai.baseUrl,
          model: ai.model,
          thinkingEnabled: ai.thinkingEnabled,
          apiKey: aiKey || undefined,
        }),
      });
      setAi((value) => ({
        ...value,
        configured: data.configured,
        keyHint: data.keyHint || value.keyHint,
      }));
      setAiKey("");
      onMessage("AI 模型配置已加密保存");
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "AI 配置保存失败");
    } finally {
      setAiBusy(false);
    }
  };
  const changeProvider = (provider: string) => {
    const preset = providerPresets[provider];
    setAi((value) => ({
      ...value,
      provider,
      ...(preset || {}),
      configured: false,
      keyHint: "",
    }));
    setAiKey("");
  };
  const testAi = async () => {
    setAiBusy(true);
    try {
      const saved = await json("/api/ai/settings", {
        method: "PUT",
        body: JSON.stringify({
          provider: ai.provider,
          baseUrl: ai.baseUrl,
          model: ai.model,
          thinkingEnabled: ai.thinkingEnabled,
          apiKey: aiKey || undefined,
        }),
      });
      setAi((value) => ({
        ...value,
        configured: saved.configured,
        keyHint: saved.keyHint || value.keyHint,
      }));
      setAiKey("");
      await json("/api/ai/settings", { method: "POST" });
      onMessage(`AI 模型 ${ai.model} 连接正常`);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "AI 连接失败");
    } finally {
      setAiBusy(false);
    }
  };
  const savePreferences = () => {
    window.localStorage.setItem(
      travelPreferencesKey,
      JSON.stringify(preferences),
    );
    window.dispatchEvent(new Event("lvji:preferences"));
    onMessage("默认旅行偏好已保存在当前设备");
  };
  const deleteData = async () => {
    if (!deleteScope) return;
    const scope = deleteScope;
    setDeleteBusy(true);
    try {
      await json("/api/user/data", {
        method: "DELETE",
        body: JSON.stringify({ scope }),
      });
      if (scope === "all") {
        window.localStorage.removeItem(travelPreferencesKey);
        setPreferences(defaultTravelPreferences);
        window.dispatchEvent(new Event("lvji:preferences"));
      }
      setDeleteScope(null);
      onDataDeleted();
      onMessage(scope === "all" ? "全部数据已删除" : "行程数据已删除");
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "删除失败");
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <section className="settings-studio shell">
      <header className="settings-hero">
        <div>
          <h1>设置</h1>
          <p>管理旅行偏好、AI 模型、实时工具与个人数据。</p>
        </div>
      </header>
      <div className="settings-grid">
        <nav>
          <button
            className={tab === "preferences" ? "active" : ""}
            onClick={() => setTab("preferences")}
          >
            <i>偏</i>
            <span>
              <b>旅行偏好</b>
              <small>默认节奏与交通</small>
            </span>
          </button>
          <button
            className={tab === "ai" ? "active" : ""}
            onClick={() => setTab("ai")}
          >
            <i>AI</i>
            <span>
              <b>AI 模型</b>
              <small>服务商、地址与模型</small>
            </span>
          </button>
          <button
            className={tab === "mcp" ? "active" : ""}
            onClick={() => setTab("mcp")}
          >
            <i>链</i>
            <span>
              <b>MCP 服务</b>
              <small>地图、搜索与预订</small>
            </span>
          </button>
          <button
            className={tab === "privacy" ? "active" : ""}
            onClick={() => setTab("privacy")}
          >
            <i>安</i>
            <span>
              <b>隐私与数据</b>
              <small>外观与导出</small>
            </span>
          </button>
        </nav>
        <main>
          {tab === "preferences" && (
            <section className="settings-card">
              <span className="kicker">DEFAULTS</span>
              <h2>默认旅行偏好</h2>
              <p>这些值用于新建规划的初始建议，可以在每次旅行中覆盖。</p>
              <div className="settings-fields">
                <label>
                  默认出发地
                  <input
                    value={preferences.origin}
                    onChange={(event) =>
                      setPreferences({
                        ...preferences,
                        origin: event.target.value,
                      })
                    }
                    placeholder="例如：武汉"
                  />
                </label>
                <ChoiceField
                  label="预算币种"
                  value={preferences.currency}
                  options={[
                    { value: "CNY", label: "CNY" },
                    { value: "USD", label: "USD" },
                    { value: "JPY", label: "JPY" },
                  ]}
                  onChange={(currency) =>
                    setPreferences({ ...preferences, currency })
                  }
                />
                <ChoiceField
                  label="旅行节奏"
                  value={preferences.pace}
                  options={[
                    {
                      value: "relaxed",
                      label: "轻松",
                      detail: "每天少量安排，留出休息时间",
                    },
                    {
                      value: "balanced",
                      label: "均衡",
                      detail: "游览与休息保持平衡",
                    },
                    {
                      value: "packed",
                      label: "紧凑",
                      detail: "尽可能体验更多地点",
                    },
                  ]}
                  onChange={(pace) => setPreferences({ ...preferences, pace })}
                />
                <ChoiceField
                  label="交通偏好"
                  value={preferences.transport}
                  options={[
                    { value: "transit", label: "公共交通" },
                    { value: "walk", label: "步行优先" },
                    { value: "drive", label: "驾车优先" },
                  ]}
                  onChange={(transport) =>
                    setPreferences({ ...preferences, transport })
                  }
                />
              </div>
              <button className="accent" onClick={savePreferences}>
                保存偏好
              </button>
            </section>
          )}
          {tab === "ai" && (
            <section className="settings-card">
              <h2>AI 模型</h2>
              <p>选择服务商会自动填写常用地址和推荐模型，你仍可手动修改。</p>
              <div className="settings-fields">
                <ChoiceField
                  label="服务商"
                  value={ai.provider}
                  options={[
                    { value: "openai-compatible", label: "OpenAI" },
                    { value: "deepseek", label: "DeepSeek" },
                    { value: "siliconflow", label: "硅基流动" },
                    { value: "volcengine", label: "火山方舟" },
                    { value: "openrouter", label: "OpenRouter" },
                  ]}
                  onChange={changeProvider}
                />
                <label>
                  模型名称
                  <input
                    value={ai.model}
                    onChange={(e) => setAi({ ...ai, model: e.target.value })}
                  />
                </label>
                <label className="settings-wide">
                  API 地址
                  <input
                    value={ai.baseUrl}
                    onChange={(e) => setAi({ ...ai, baseUrl: e.target.value })}
                  />
                </label>
                <label className="settings-wide">
                  API Key
                  <input
                    type="password"
                    value={aiKey}
                    onChange={(e) => setAiKey(e.target.value)}
                    placeholder={
                      ai.keyHint ||
                      (ai.configured ? "已保存，留空保持不变" : "输入 API Key")
                    }
                    autoComplete="new-password"
                  />
                </label>
                <div className="preference-row settings-wide">
                  <div>
                    <b>深度思考</b>
                    <small>
                      关闭可缩短规划等待时间；复杂行程需要更强推理时再开启
                    </small>
                  </div>
                  <label className="modern-switch">
                    <input
                      type="checkbox"
                      checked={ai.thinkingEnabled}
                      onChange={(e) =>
                        setAi({ ...ai, thinkingEnabled: e.target.checked })
                      }
                    />
                    <i></i>
                  </label>
                </div>
              </div>
              <div className="ai-actions">
                <button
                  className="accent"
                  disabled={aiBusy || !ai.baseUrl || !ai.model}
                  onClick={saveAi}
                >
                  {aiBusy ? "处理中…" : "保存设置"}
                </button>
                <button
                  disabled={aiBusy || (!ai.configured && !aiKey)}
                  onClick={testAi}
                >
                  保存并测试
                </button>
              </div>
              <p className="credential-note">
                API Key 仅在服务端加密保存，不会显示在页面或导出文件中。
              </p>
            </section>
          )}
          {tab === "mcp" && (
            <section className="settings-card">
              <div className="card-title">
                <div>
                  <h2>实时数据服务</h2>
                  <p>每个服务都可以更改 URL、认证方式和权限。</p>
                </div>
                <button className="accent" onClick={add}>
                  ＋ 新增服务
                </button>
              </div>
              {loading ? (
                <div className="connector-empty">正在读取服务配置…</div>
              ) : (
                <div className="connector-list">
                  {servers.map((server) => (
                    <article key={server.id}>
                      <i className={`connector-dot ${server.status}`}></i>
                      <div className="connector-main">
                        <span>
                          <b>{server.name}</b>
                          {server.source === "builtin" && <small>内置</small>}
                        </span>
                        <code className={server.endpoint ? "" : "unconfigured"}>
                          {server.endpoint || "未配置 Streamable HTTP URL"}
                        </code>
                        <p className={server.status === "error" ? "error" : ""}>
                          {server.status === "testing"
                            ? "正在连接真实服务…"
                            : server.status === "connected"
                              ? "连接正常"
                              : server.status === "error"
                                ? server.error
                                : `${server.authMode === "none" ? "无认证" : server.secretHint || "需要凭证"} · ${server.permission === "readonly" ? "允许只读" : server.permission === "ask" ? "每次询问" : "禁止"}`}
                        </p>
                      </div>
                      <label className="modern-switch">
                        <input
                          type="checkbox"
                          checked={server.enabled}
                          disabled={!server.endpoint}
                          onChange={(e) => saveToggle(server, e.target.checked)}
                        />
                        <i></i>
                      </label>
                      <div className="connector-actions">
                        <button
                          disabled={!server.endpoint}
                          onClick={() => test(server)}
                        >
                          测试
                        </button>
                        <button
                          onClick={() => {
                            setEditing(server);
                            setSecret("");
                            setFormError("");
                          }}
                        >
                          配置
                        </button>
                        {server.homepage && (
                          <a
                            href={server.homepage}
                            target="_blank"
                            rel="noreferrer"
                          >
                            项目主页
                          </a>
                        )}
                        {server.source === "custom" && (
                          <button
                            className="danger"
                            onClick={() => remove(server)}
                          >
                            删除
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}
          {tab === "privacy" && (
            <section className="settings-card">
              <span className="kicker">PRIVACY</span>
              <h2>外观与个人数据</h2>
              <p>界面偏好保留在设备上，旅行数据存储在你的隔离账户空间。</p>
              <div className="preference-row">
                <div>
                  <b>深色模式</b>
                  <small>适合低光环境</small>
                </div>
                <label className="modern-switch">
                  <input
                    type="checkbox"
                    checked={dark}
                    onChange={(e) => onThemeChange(e.target.checked)}
                  />
                  <i></i>
                </label>
              </div>
              <div className="preference-row danger-row">
                <div>
                  <b>删除行程数据</b>
                  <small>删除全部行程、每日安排和版本历史</small>
                </div>
                <button onClick={() => setDeleteScope("trips")}>删除</button>
              </div>
              <div className="preference-row danger-row">
                <div>
                  <b>删除全部数据</b>
                  <small>同时删除行程、AI 配置、MCP 配置与设备旅行偏好</small>
                </div>
                <button onClick={() => setDeleteScope("all")}>删除</button>
              </div>
            </section>
          )}
        </main>
      </div>
      {editing &&
        createPortal(
          <div className="settings-overlay" onClick={() => setEditing(null)}>
            <section
              className="connector-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <header>
                <div>
                  <h2>
                    {editing.source === "custom" &&
                    !servers.some((s) => s.id === editing.id)
                      ? "新增 MCP 服务"
                      : "配置 MCP 服务"}
                  </h2>
                </div>
                <button onClick={() => setEditing(null)}>×</button>
              </header>
              <label>
                服务名称
                <input
                  value={editing.name}
                  onChange={(e) =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                />
              </label>
              <label>
                Streamable HTTP URL
                <input
                  value={editing.endpoint}
                  onChange={(e) =>
                    setEditing({ ...editing, endpoint: e.target.value })
                  }
                  placeholder="https://example.com/mcp"
                />
              </label>
              <div className="modal-two">
                <ChoiceField
                  label="认证方式"
                  value={editing.authMode}
                  options={[
                    { value: "none", label: "无认证" },
                    { value: "bearer", label: "Bearer Token" },
                    { value: "authorization", label: "自定义 Authorization" },
                  ]}
                  onChange={(authMode) =>
                    setEditing({
                      ...editing,
                      authMode: authMode as Server["authMode"],
                    })
                  }
                />
                <ChoiceField
                  label="调用权限"
                  value={editing.permission}
                  options={[
                    { value: "readonly", label: "允许只读" },
                    { value: "ask", label: "每次询问" },
                    { value: "deny", label: "禁止" },
                  ]}
                  onChange={(permission) =>
                    setEditing({
                      ...editing,
                      permission: permission as Server["permission"],
                    })
                  }
                />
              </div>
              {editing.authMode !== "none" && (
                <label>
                  {editing.authMode === "bearer"
                    ? "Bearer Token"
                    : "Authorization 值"}
                  <input
                    type="password"
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    placeholder={editing.secretHint || "留空则保留现有凭证"}
                    autoComplete="new-password"
                  />
                </label>
              )}
              {formError && <p className="form-error">⚠ {formError}</p>}
              <footer>
                <button onClick={() => setEditing(null)}>取消</button>
                <button
                  className="accent"
                  disabled={!editing.name.trim() || !editing.endpoint.trim()}
                  onClick={save}
                >
                  保存配置
                </button>
              </footer>
            </section>
          </div>,
          document.querySelector(".product") || document.body,
        )}
      {deleteScope &&
        createPortal(
          <div
            className="settings-overlay"
            onClick={() => setDeleteScope(null)}
          >
            <section
              className="delete-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="settings-delete-title"
              onClick={(event) => event.stopPropagation()}
            >
              <h2 id="settings-delete-title">
                {deleteScope === "all" ? "删除全部数据？" : "删除全部行程？"}
              </h2>
              <p>
                {deleteScope === "all"
                  ? "行程、模型与 MCP 配置以及设备偏好都会永久删除。"
                  : "所有行程、每日安排和版本历史都会永久删除。"}
              </p>
              <footer>
                <button onClick={() => setDeleteScope(null)}>取消</button>
                <button
                  className="confirm-delete"
                  disabled={deleteBusy}
                  onClick={deleteData}
                >
                  {deleteBusy ? "正在删除…" : "确认删除"}
                </button>
              </footer>
            </section>
          </div>,
          document.querySelector(".product") || document.body,
        )}
    </section>
  );
}
