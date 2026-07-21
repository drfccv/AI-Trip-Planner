"use client";
/* eslint-disable @next/next/no-img-element -- MCP image hosts are dynamic and cannot be preconfigured. */

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Lock,
  Moon,
  Pencil,
  RefreshCw,
  Trash2,
  Unlock,
  Sun,
  X,
} from "lucide-react";
import { SettingsPanel } from "./SettingsPanel";
import { AiAssistant } from "./AiAssistant";
import { FormChoiceField, PaceField, TravelDateField } from "./PlanningFields";
import { buildTripCalendar } from "@/lib/calendar";
import {
  defaultTravelPreferences,
  type UserTravelPreferences,
} from "@/lib/user-preferences";
import "./product.css";
import "./product-overlays.css";
import "./ai-assistant.css";
import "./mcp-trace.css";
import "./ui-polish.css";
import "./dashboard-polish.css";
import "./planning-fields.css";
import "./job-progress.css";
import "./motion.css";
import { appFetch } from "@/renderer/app/transport";

type TripItem = {
  id: string;
  dayId: string;
  type: string;
  title: string;
  startTime: string;
  durationMinutes: number;
  position: number;
  notes: string;
  locked: boolean;
  cost: number | null;
  sourceType: string;
  metadata?: {
    imageUrl?: string;
    address?: string;
    location?: string;
    poiId?: string;
    introduction?: string;
  };
};
type TripDay = {
  id: string;
  dayIndex: number;
  date: string;
  title: string;
  items: TripItem[];
  weather?: {
    weather: string;
    low: number;
    high: number;
    wind?: string;
    advice: string;
    verifiedAt?: string;
  } | null;
};
type Trip = {
  id: string;
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  status: string;
  revision: number;
  currency: string;
  budgetTotal: number | null;
  days?: TripDay[];
  constraints?: {
    flexibleDates?: boolean;
    dayCount?: number;
    travelers?: number;
    [key: string]: unknown;
  };
};
type Screen = "dashboard" | "create" | "workspace" | "settings";

const fmt = (date: string) =>
  date
    ? new Intl.DateTimeFormat("zh-CN", {
        month: "short",
        day: "numeric",
      }).format(new Date(`${date}T00:00:00`))
    : "日期待定";
const money = (value: number, currency = "CNY") =>
  new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
const budgetPerPerson = (trip: Trip) => {
  const travelers = Number(trip.constraints?.travelers) || 1;
  if (trip.budgetTotal) return trip.budgetTotal / travelers;
  const saved = Number(trip.constraints?.perPersonBudget);
  return saved > 0 ? saved : null;
};
const shouldAutoRefreshWeather = (trip: Trip) => {
  const now = Date.now();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const forecastEnd = today.getTime() + 8 * 24 * 60 * 60 * 1000;
  return (trip.days || []).some((day) => {
    const dayTime = new Date(`${day.date}T00:00:00`).getTime();
    if (!Number.isFinite(dayTime) || dayTime < today.getTime() || dayTime > forecastEnd)
      return false;
    if (!day.weather) return true;
    const verified = day.weather.verifiedAt
      ? new Date(day.weather.verifiedAt).getTime()
      : 0;
    return !verified || now - verified > 6 * 60 * 60 * 1000;
  });
};
const errorText: Record<string, string> = {
  AUTH_REQUIRED: "请先登录后继续",
  REVISION_CONFLICT: "行程已在其他窗口更新，请刷新后重试",
  LOCKED_ITEM_PROTECTED: "该安排已锁定，请先解锁",
  TRIP_INPUT_INVALID: "请填写完整有效的旅行信息",
  TRIP_DATE_RANGE_INVALID: "旅行日期应为 1–31 天",
  UAPI_KEY_INVALID_FORMAT: "UAPI_API_KEY 格式无效，应以 uapi- 开头",
  UAPI_RATE_LIMITED: "天气查询过于频繁，请稍后重试",
  UAPI_CITY_NOT_FOUND: "UAPI 未找到该城市的天气数据",
  UAPI_SERVICE_UNAVAILABLE: "天气服务暂时不可用",
  UAPI_TIMEOUT: "天气查询超时，请稍后重试",
  UAPI_NETWORK_ERROR: "暂时无法连接天气服务",
};

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await appFetch(url, {
    cache: "no-store",
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options?.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      errorText[data.error] || data.error || "请求失败，请稍后再试",
    );
  return data as T;
}

function Mark() {
  return <span className="brand-mark">旅</span>;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("dashboard");
  const [trips, setTrips] = useState<Trip[]>([]);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [selectedDay, setSelectedDay] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [dark, setDark] = useState(false);
  const [versions, setVersions] = useState<
    { id: string; revision: number; label: string; createdAt: string }[]
  >([]);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Trip | null>(null);
  const [clearScheduleOpen, setClearScheduleOpen] = useState(false);
  const [addFormOpen, setAddFormOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [expandedItemIds, setExpandedItemIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [dateMode, setDateMode] = useState<"dates" | "days">("dates");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [travelPreferences, setTravelPreferences] =
    useState<UserTravelPreferences>(defaultTravelPreferences);

  const toast = (text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice(""), 2600);
  };
  const loadTrips = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api<{ trips: Trip[] }>("/api/trips");
      setTrips(result.trips);
    } catch (error) {
      toast(error instanceof Error ? error.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);
  // Initial remote synchronization intentionally runs once after hydration.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadTrips();
  }, [loadTrips]);
  useEffect(() => {
    const syncPreferences = () => {
      try {
        void api<{ preferences: UserTravelPreferences | null }>("/api/desktop/preferences").then(result => setTravelPreferences(result.preferences ? { ...defaultTravelPreferences, ...result.preferences } : defaultTravelPreferences));
      } catch {
        setTravelPreferences(defaultTravelPreferences);
      }
    };
    const frame = window.requestAnimationFrame(syncPreferences);
    window.addEventListener("lvji:preferences", syncPreferences);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("lvji:preferences", syncPreferences);
    };
  }, []);
  const openTrip = async (id: string) => {
    setBusy(true);
    try {
      const result = await api<{ trip: Trip }>(`/api/trips/${id}`);
      setTrip(result.trip);
      setSelectedDay(0);
      setScreen("workspace");
      if (shouldAutoRefreshWeather(result.trip))
        void api<{ trip: Trip }>(`/api/trips/${id}/weather`, {
          method: "POST",
        })
          .then((weatherResult) =>
            setTrip((current) =>
              current?.id === id ? weatherResult.trip : current,
            ),
          )
          .catch(() => undefined);
    } catch (error) {
      toast(error instanceof Error ? error.message : "打开失败");
    } finally {
      setBusy(false);
    }
  };

  const createTrip = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (
      dateMode === "dates" &&
      (!form.get("startDate") || !form.get("endDate"))
    ) {
      toast("请选择出发和返程日期");
      return;
    }
    setBusy(true);
    try {
      const result = await api<{ trip: Trip }>("/api/trips", {
        method: "POST",
        body: JSON.stringify({
          destination: form.get("destination"),
          title: form.get("title"),
          startDate: dateMode === "dates" ? form.get("startDate") : undefined,
          endDate: dateMode === "dates" ? form.get("endDate") : undefined,
          dayCount:
            dateMode === "days" ? Number(form.get("dayCount")) : undefined,
          perPersonBudget: Number(form.get("budget")) || undefined,
          currency: travelPreferences.currency,
          constraints: {
            pace: form.get("pace"),
            interests: form.get("interests"),
            travelers: Number(form.get("travelers")) || 1,
            origin: travelPreferences.origin,
            transportPreference: travelPreferences.transport,
          },
        }),
      });
      if (dateMode === "dates") {
        await api<{ trip: Trip }>(`/api/trips/${result.trip.id}/weather`, {
          method: "POST",
        }).catch(() => undefined);
      }
      await loadTrips();
      await openTrip(result.trip.id);
      toast("行程已创建，可以开始添加安排");
    } catch (error) {
      toast(error instanceof Error ? error.message : "创建失败");
    } finally {
      setBusy(false);
    }
  };

  const apply = async (operations: unknown[]) => {
    if (!trip) return;
    setBusy(true);
    try {
      const result = await api<{ trip: Trip; summary: string }>(
        `/api/trips/${trip.id}/operations/apply`,
        {
          method: "POST",
          body: JSON.stringify({
            baseRevision: trip.revision,
            idempotencyKey: crypto.randomUUID(),
            operations,
          }),
        },
      );
      setTrip(result.trip);
      toast(result.summary || "修改已保存");
    } catch (error) {
      toast(error instanceof Error ? error.message : "保存失败");
      if ((error as Error).message.includes("刷新")) await openTrip(trip.id);
    } finally {
      setBusy(false);
    }
  };
  const clearSchedule = async () => {
    if (!trip || busy) return;
    const items = (trip.days || []).flatMap((tripDay) => tripDay.items);
    const removable = items.filter((item) => !item.locked);
    if (!removable.length) {
      setClearScheduleOpen(false);
      toast(items.length ? "当前日程仅包含锁定项目" : "当前日程已经为空");
      return;
    }
    await apply(
      removable.map((item) => ({ type: "remove_item", itemId: item.id })),
    );
    setClearScheduleOpen(false);
    if (removable.length < items.length)
      toast("已清空未锁定安排，锁定项目已保留");
  };
  const refreshWeather = async () => {
    if (!trip?.startDate || busy) return;
    setBusy(true);
    try {
      const result = await api<{ trip: Trip }>(
        `/api/trips/${trip.id}/weather`,
        { method: "POST" },
      );
      setTrip(result.trip);
      toast("天气信息已同步");
    } catch (error) {
      toast(error instanceof Error ? error.message : "天气同步失败");
    } finally {
      setBusy(false);
    }
  };
  const addItem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const day = trip?.days?.[selectedDay];
    if (!day) return;
    const form = new FormData(event.currentTarget);
    const imageUrl = String(form.get("imageUrl") || "").trim();
    const introduction = String(form.get("introduction") || "").trim();
    await apply([
      {
        type: "add_item",
        item: {
          dayId: day.id,
          type: form.get("type"),
          title: form.get("title"),
          startTime: form.get("time"),
          durationMinutes: Number(form.get("duration")),
          notes: form.get("notes") || "",
          cost: Number(form.get("cost")) || undefined,
          sourceType: "user_added",
          ...(imageUrl || introduction
            ? { metadata: { imageUrl: imageUrl || undefined, introduction } }
            : {}),
        },
      },
    ]);
    event.currentTarget.reset();
    setAddFormOpen(false);
  };
  const updateItem = async (
    event: FormEvent<HTMLFormElement>,
    item: TripItem,
  ) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const imageUrl = String(form.get("imageUrl") || "").trim();
    const introduction = String(form.get("introduction") || "").trim();
    await apply([
      {
        type: "update_item",
        itemId: item.id,
        patch: {
          type: String(form.get("type")),
          title: String(form.get("title")),
          startTime: String(form.get("time")),
          durationMinutes: Number(form.get("duration")),
          notes: String(form.get("notes") || ""),
          cost: form.get("cost") === "" ? null : Number(form.get("cost")),
          metadata: {
            ...(item.metadata || {}),
            imageUrl: imageUrl || undefined,
            introduction: introduction || undefined,
          },
        },
      },
    ]);
    setEditingItemId(null);
  };
  const showVersions = async () => {
    if (!trip) return;
    try {
      const result = await api<{ versions: typeof versions }>(
        `/api/trips/${trip.id}/versions`,
      );
      setVersions(result.versions);
      setVersionsOpen(true);
    } catch (error) {
      toast(error instanceof Error ? error.message : "读取版本失败");
    }
  };
  const restoreVersion = async (versionId: string) => {
    if (!trip || busy) return;
    setBusy(true);
    try {
      const result = await api<{ trip: Trip; summary: string }>(
        `/api/trips/${trip.id}/versions`,
        {
          method: "POST",
          body: JSON.stringify({ versionId, baseRevision: trip.revision }),
        },
      );
      setTrip(result.trip);
      setVersionsOpen(false);
      toast(result.summary);
    } catch (error) {
      toast(error instanceof Error ? error.message : "回退失败");
    } finally {
      setBusy(false);
    }
  };
  const deleteTrip = async () => {
    if (!deleteTarget || busy) return;
    setBusy(true);
    try {
      await api(`/api/trips/${deleteTarget.id}`, { method: "DELETE" });
      const removedId = deleteTarget.id;
      setDeleteTarget(null);
      setTrips((rows) => rows.filter((row) => row.id !== removedId));
      if (trip?.id === removedId) {
        setTrip(null);
        setScreen("dashboard");
      }
      toast("行程已删除");
    } catch (error) {
      toast(error instanceof Error ? error.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };
  const exportCalendar = () => {
    if (!trip) return;
    const { text, eventCount } = buildTripCalendar(trip);
    if (!eventCount) {
      toast("当前行程没有可导出的已定日期安排");
      return;
    }
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/calendar;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${trip.title.replaceAll(/[\\/:*?"<>|]/g, "-")}.ics`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const day = trip?.days?.[selectedDay];
  const totalCost = useMemo(
    () =>
      (trip?.days || [])
        .flatMap((d) => d.items)
        .reduce((sum, item) => sum + (item.cost || 0), 0),
    [trip],
  );
  return (
    <main className={dark ? "product dark" : "product"}>
      <header className="topbar">
        <button
          className="wordmark"
          onClick={() => {
            setScreen("dashboard");
            loadTrips();
          }}
        >
          <Mark />
          <span>
            <b>旅迹</b>
            <small>AI TRIP STUDIO</small>
          </span>
        </button>
        <nav>
          <button
            className={screen === "dashboard" ? "active" : ""}
            onClick={() => setScreen("dashboard")}
          >
            我的行程
          </button>
          <button
            className={screen === "create" ? "active" : ""}
            onClick={() => setScreen("create")}
          >
            新建规划
          </button>
          <button
            className={screen === "settings" ? "active" : ""}
            onClick={() => setScreen("settings")}
          >
            设置
          </button>
        </nav>
        <button
          className="theme"
          onClick={() => setDark((x) => !x)}
          aria-label="切换主题"
        >
          {dark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
        </button>
      </header>

      {screen === "dashboard" && (
        <section className="dash shell">
          <div className="dash-intro">
            <div>
              <span className="kicker">YOUR JOURNEYS</span>
              <h1>下一程，去哪里？</h1>
              <p>真实数据、清晰日程、每一次修改都可追溯。</p>
            </div>
          </div>
          {loading ? (
            <div className="empty">正在读取你的行程…</div>
          ) : trips.length === 0 ? (
            <div className="empty">
              <Mark />
              <h2>从第一段旅程开始</h2>
              <p>创建目的地与日期，再逐日安排地点、时间和预算。</p>
              <button className="accent" onClick={() => setScreen("create")}>
                开始规划
              </button>
            </div>
          ) : (
            <div className="trip-cards">
              {trips.map((item, index) => (
                <article className="trip-tile" key={item.id}>
                  <button
                    className="trip-open"
                    onClick={() => openTrip(item.id)}
                    disabled={busy}
                    aria-label={`打开${item.title}`}
                  >
                    <div className={`tile-art tone-${index % 4}`}>
                      <i aria-hidden="true"></i>
                    </div>
                    <div className="tile-body">
                      <small>
                        {fmt(item.startDate)} — {fmt(item.endDate)}
                      </small>
                      <h2>{item.title}</h2>
                      <p>
                        {item.destination} · 版本 {item.revision}
                      </p>
                      <div>
                        <span>
                          {budgetPerPerson(item)
                            ? `人均 ${money(budgetPerPerson(item)!, item.currency)}`
                            : "尚未设置人均预算"}
                        </span>
                        <b>打开 →</b>
                      </div>
                    </div>
                  </button>
                  <button
                    className="trip-delete"
                    onClick={() => setDeleteTarget(item)}
                    aria-label={`删除${item.title}`}
                    title="删除行程"
                  >
                    <Trash2 aria-hidden="true" />
                  </button>
                </article>
              ))}
              <button
                className="trip-create-tile"
                onClick={() => setScreen("create")}
              >
                <span aria-hidden="true">＋</span>
                <b>创建新行程</b>
                <small>从目的地和日期开始规划</small>
              </button>
            </div>
          )}
        </section>
      )}

      {screen === "create" && (
        <section className="create shell">
          <div className="create-copy">
            <span className="kicker">NEW JOURNEY</span>
            <h1>
              让想法成为
              <br />
              <em>可执行的旅程</em>
            </h1>
            <p>
              先建立可靠的旅行骨架。之后可逐日添加真实地点，并通过 MCP
              工具验证交通、酒店和信息。
            </p>
          </div>
          <form className="create-form" onSubmit={createTrip}>
            <label>
              目的地
              <input name="destination" required placeholder="例如：杭州" />
            </label>
            <label>
              行程名称
              <input name="title" placeholder="例如：沿湖慢慢走" />
            </label>
            <div className="date-mode" role="group" aria-label="旅行日期方式">
              <button
                type="button"
                className={dateMode === "dates" ? "active" : ""}
                onClick={() => setDateMode("dates")}
              >
                选择日期
              </button>
              <button
                type="button"
                className={dateMode === "days" ? "active" : ""}
                onClick={() => setDateMode("days")}
              >
                日期待定
              </button>
            </div>
            {dateMode === "dates" ? (
              <div className="two">
                <TravelDateField
                  name="startDate"
                  label="出发日期"
                  value={startDate}
                  min={new Date().toLocaleDateString("sv-SE")}
                  onChange={(value) => {
                    setStartDate(value);
                    if (endDate && endDate < value) setEndDate("");
                  }}
                />
                <TravelDateField
                  name="endDate"
                  label="返程日期"
                  value={endDate}
                  min={startDate || new Date().toLocaleDateString("sv-SE")}
                  onChange={setEndDate}
                />
              </div>
            ) : (
              <label>
                旅行天数
                <input
                  name="dayCount"
                  type="number"
                  min="1"
                  max="31"
                  defaultValue="3"
                  required
                />
              </label>
            )}
            <div className="two">
              <label>
                人均预算
                <input name="budget" type="number" min="0" placeholder="3000" />
              </label>
              <label>
                出行人数
                <input
                  name="travelers"
                  type="number"
                  min="1"
                  max="99"
                  defaultValue="1"
                  required
                />
              </label>
            </div>
            <PaceField
              key={travelPreferences.pace}
              defaultValue={travelPreferences.pace}
            />
            <label>
              偏好与备注
              <textarea
                name="interests"
                placeholder="博物馆、自然风景、少走路、亲子友好…"
              />
            </label>
            <button className="accent submit" disabled={busy}>
              {busy ? "正在创建…" : "创建旅行工作台 →"}
            </button>
          </form>
        </section>
      )}

      {screen === "workspace" && trip && (
        <section className="studio">
          <aside className="studio-side">
            <button
              className="backlink"
              onClick={() => {
                setScreen("dashboard");
                loadTrips();
              }}
            >
              ← 返回全部行程
            </button>
            <h1>{trip.title}</h1>
            <p>
              {trip.startDate
                ? `${fmt(trip.startDate)} — ${fmt(trip.endDate)}`
                : `${trip.constraints?.dayCount || trip.days?.length || 0} 天 · 日期待定`}
              {trip.constraints?.travelers
                ? ` · ${trip.constraints.travelers} 人`
                : ""}
            </p>
            <div className="metric">
              <span>已规划费用</span>
              <b>{money(totalCost, trip.currency)}</b>
              <small>
                {budgetPerPerson(trip)
                  ? `人均预算 ${money(budgetPerPerson(trip)!, trip.currency)}`
                  : "未设置人均预算"}
              </small>
            </div>
            <div className="day-tabs">
              {trip.days?.map((d, index) => (
                <button
                  key={d.id}
                  className={selectedDay === index ? "active" : ""}
                  onClick={() => setSelectedDay(index)}
                >
                  <span>DAY {String(d.dayIndex).padStart(2, "0")}</span>
                  <b>{fmt(d.date)}</b>
                  <small>{d.items.length} 项安排</small>
                </button>
              ))}
            </div>
            <div className="side-actions">
              <button onClick={showVersions}>版本历史</button>
              <button onClick={exportCalendar}>导出日历</button>
              <button
                className="clear-schedule"
                onClick={() => setClearScheduleOpen(true)}
              >
                清空日程
              </button>
            </div>
          </aside>
          <section className="schedule">
            <header>
              <div>
                <span className="kicker">{day?.date}</span>
                <h2>{day?.title}</h2>
              </div>
            </header>
            {day?.weather && (
              <section
                className="weather-strip"
                aria-label="当日天气和穿衣建议"
              >
                <div>
                  <span>{day.weather.weather}</span>
                  <b>
                    {day.weather.low}°–{day.weather.high}°
                  </b>
                </div>
                <div>
                  <span>穿衣建议</span>
                  <p>{day.weather.advice}</p>
                </div>
                <button
                  className="weather-refresh"
                  onClick={() => void refreshWeather()}
                  disabled={busy}
                  aria-label="刷新天气"
                  title="刷新天气"
                >
                  <RefreshCw className={busy ? "spinning" : ""} aria-hidden="true" />
                </button>
              </section>
            )}
            {day?.date && !day.weather && (
              <section
                className="weather-strip weather-empty"
                aria-label="天气预报暂不可用"
              >
                <div>
                  <span>天气预报</span>
                  <b>暂未覆盖该日期</b>
                </div>
                <div>
                  <p>临近出发时可重新同步天气。</p>
                </div>
                <button onClick={() => void refreshWeather()} disabled={busy}>
                  重新同步
                </button>
              </section>
            )}
            <div className="agenda">
              {day?.items.length ? (
                [...day.items]
                  .sort((a, b) => a.position - b.position)
                  .map((item) => (
                    <article className="agenda-item" key={item.id}>
                      <time>{item.startTime}</time>
                      <div className="rail">
                        <i></i>
                      </div>
                      <div className="activity">
                        {editingItemId === item.id ? (
                          <form
                            className="item-edit"
                            onSubmit={(event) => updateItem(event, item)}
                          >
                            <div className="item-edit-grid">
                              <label>
                                时间
                                <input
                                  name="time"
                                  type="time"
                                  defaultValue={item.startTime}
                                  required
                                />
                              </label>
                              <FormChoiceField
                                label="类型"
                                name="type"
                                defaultValue={item.type}
                                options={[
                                  { value: "景点", label: "景点" },
                                  { value: "用餐", label: "用餐" },
                                  { value: "交通", label: "交通" },
                                  { value: "酒店", label: "酒店" },
                                  { value: "自由活动", label: "自由活动" },
                                ]}
                              />
                              <label className="wide">
                                名称
                                <input
                                  name="title"
                                  defaultValue={item.title}
                                  required
                                />
                              </label>
                              <label>
                                时长
                                <input
                                  name="duration"
                                  type="number"
                                  min="5"
                                  max="1440"
                                  defaultValue={item.durationMinutes}
                                  required
                                />
                              </label>
                              <label>
                                费用
                                <input
                                  name="cost"
                                  type="number"
                                  min="0"
                                  defaultValue={item.cost ?? ""}
                                />
                              </label>
                              <label className="wide">
                                备注
                                <input name="notes" defaultValue={item.notes} />
                              </label>
                              <label className="wide">
                                介绍
                                <textarea
                                  name="introduction"
                                  defaultValue={
                                    item.metadata?.introduction || ""
                                  }
                                  placeholder="历史人文、地点特色、口碑评价等"
                                  rows={3}
                                />
                              </label>
                              <label className="wide">
                                图片链接
                                <input
                                  name="imageUrl"
                                  type="url"
                                  defaultValue={item.metadata?.imageUrl || ""}
                                  placeholder="可选"
                                />
                              </label>
                            </div>
                            <div className="item-edit-actions">
                              <button
                                type="button"
                                onClick={() => setEditingItemId(null)}
                                aria-label="取消编辑"
                                title="取消"
                              >
                                <X />
                              </button>
                              <button
                                className="save"
                                disabled={busy}
                                aria-label="保存修改"
                                title="保存"
                              >
                                <Check />
                              </button>
                            </div>
                          </form>
                        ) : (
                          <>
                            <div className="activity-heading">
                              <span>{item.type}</span>
                              <footer>
                                {item.metadata?.introduction && (
                                  <button
                                    className="details-toggle"
                                    onClick={() =>
                                      setExpandedItemIds((current) => {
                                        const next = new Set(current);
                                        if (next.has(item.id))
                                          next.delete(item.id);
                                        else next.add(item.id);
                                        return next;
                                      })
                                    }
                                    aria-expanded={expandedItemIds.has(item.id)}
                                    aria-label={`${expandedItemIds.has(item.id) ? "收起" : "展开"}${item.title}详情`}
                                    title={
                                      expandedItemIds.has(item.id)
                                        ? "收起详情"
                                        : "展开详情"
                                    }
                                  >
                                    {expandedItemIds.has(item.id) ? (
                                      <ChevronUp />
                                    ) : (
                                      <ChevronDown />
                                    )}
                                  </button>
                                )}
                                <button
                                  disabled={item.locked || busy}
                                  onClick={() => setEditingItemId(item.id)}
                                  aria-label={`编辑${item.title}`}
                                  title={item.locked ? "请先解锁" : "编辑"}
                                >
                                  <Pencil />
                                </button>
                                <button
                                  onClick={() =>
                                    apply([
                                      {
                                        type: item.locked
                                          ? "unlock_item"
                                          : "lock_item",
                                        itemId: item.id,
                                      },
                                    ])
                                  }
                                  aria-label={
                                    item.locked
                                      ? `解锁${item.title}`
                                      : `锁定${item.title}`
                                  }
                                  title={item.locked ? "解锁" : "锁定"}
                                >
                                  {item.locked ? <Unlock /> : <Lock />}
                                </button>
                                <button
                                  className="danger"
                                  disabled={item.locked || busy}
                                  onClick={() =>
                                    apply([
                                      { type: "remove_item", itemId: item.id },
                                    ])
                                  }
                                  aria-label={`删除${item.title}`}
                                  title={item.locked ? "请先解锁" : "删除"}
                                >
                                  <Trash2 />
                                </button>
                              </footer>
                            </div>
                            {item.metadata?.imageUrl && (
                              <img
                                className="activity-image"
                                src={item.metadata.imageUrl}
                                alt={item.title}
                                loading="lazy"
                                referrerPolicy="no-referrer"
                              />
                            )}
                            <h3>{item.title}</h3>
                            <p>
                              {item.durationMinutes} 分钟
                              {item.cost
                                ? ` · ${money(item.cost, trip.currency)}`
                                : ""}
                              {item.notes ? ` · ${item.notes}` : ""}
                            </p>
                            {item.metadata?.introduction &&
                              expandedItemIds.has(item.id) && (
                                <div className="activity-details">
                                  <b>地点介绍</b>
                                  <p>{item.metadata.introduction}</p>
                                </div>
                              )}
                          </>
                        )}
                      </div>
                    </article>
                  ))
              ) : (
                <button
                  className="day-empty ai-generate-empty"
                  onClick={() =>
                    window.dispatchEvent(
                      new CustomEvent("lvji:generate-plan", {
                        detail: {
                          tripId: trip.id,
                          prompt: (trip.days || []).some(
                            (tripDay) => tripDay.items.length > 0,
                          )
                            ? "检查当前行程，补全空白日期，并逐项核对相邻地点的通勤时间。为需要移动的项目插入明确的交通安排，修复零间隔或时间不足的项目，同时预留步行、候车、停车等缓冲。"
                            : `为我的${trip.destination}旅行生成完整的逐日行程，兼顾景点、用餐、交通与休息。查询相邻地点的实际路线和通勤时间，为每段必要移动安排交通项目并预留合理缓冲。`,
                        },
                      }),
                    )
                  }
                >
                  <span>✦</span>
                  <h3>一键生成这段旅程</h3>
                  <p>先生成完整建议，确认后再写入行程。</p>
                </button>
              )}
            </div>
            {!addFormOpen ? (
              <button
                className="add-activity-trigger"
                onClick={() => setAddFormOpen(true)}
              >
                <span>＋</span>
                <span>
                  <b>手动添加安排</b>
                  <small>录入已确认的地点、用餐或交通</small>
                </span>
              </button>
            ) : (
              <form className="add-activity compact" onSubmit={addItem}>
                <header>
                  <div>
                    <b>添加安排</b>
                    <small>保存到 {day?.date}</small>
                  </div>
                  <button type="button" onClick={() => setAddFormOpen(false)}>
                    取消
                  </button>
                </header>
                <div className="activity-grid">
                  <label>
                    时间
                    <input
                      name="time"
                      type="time"
                      defaultValue="09:00"
                      required
                    />
                  </label>
                  <FormChoiceField
                    label="类型"
                    name="type"
                    defaultValue="景点"
                    options={[
                      { value: "景点", label: "景点" },
                      { value: "用餐", label: "用餐" },
                      { value: "交通", label: "交通" },
                      { value: "酒店", label: "酒店" },
                      { value: "自由活动", label: "自由活动" },
                    ]}
                  />
                  <label className="span2">
                    名称
                    <input
                      name="title"
                      required
                      placeholder="输入已确认的地点或事项"
                    />
                  </label>
                  <label>
                    时长（分钟）
                    <input
                      name="duration"
                      type="number"
                      min="5"
                      max="1440"
                      defaultValue="90"
                      required
                    />
                  </label>
                  <label>
                    费用
                    <input
                      name="cost"
                      type="number"
                      min="0"
                      placeholder="可选"
                    />
                  </label>
                  <label className="span2">
                    备注
                    <input
                      name="notes"
                      placeholder="地址、预约信息、同行人备注…"
                    />
                  </label>
                  <label className="span2">
                    介绍
                    <textarea
                      name="introduction"
                      placeholder="历史人文、地点特色、推荐亮点、口碑评价等"
                      rows={3}
                    />
                  </label>
                  <label className="span2">
                    图片链接（可选）
                    <input name="imageUrl" type="url" placeholder="https://…" />
                  </label>
                </div>
                <button className="accent" disabled={busy}>
                  {busy ? "保存中…" : "添加到当天"}
                </button>
              </form>
            )}
          </section>
          <AiAssistant
            tripId={trip.id}
            destination={trip.destination}
            hasItems={(trip.days || []).some((d) => d.items.length > 0)}
            busy={busy}
            onApply={apply}
            onSettings={() => setScreen("settings")}
            request={api}
          />
        </section>
      )}

      {screen === "settings" && (
        <SettingsPanel
          dark={dark}
          onThemeChange={setDark}
          onDataDeleted={() => {
            setTrip(null);
            setTrips([]);
            setScreen("dashboard");
            void loadTrips();
          }}
          onMessage={toast}
        />
      )}
      {versionsOpen && (
        <div className="overlay" onClick={() => setVersionsOpen(false)}>
          <section className="versions" onClick={(e) => e.stopPropagation()}>
            <header>
              <div>
                <span className="kicker">AUDIT TRAIL</span>
                <h2>版本历史</h2>
              </div>
              <button onClick={() => setVersionsOpen(false)}>×</button>
            </header>
            {versions.map((v) => (
              <article key={v.id}>
                <i></i>
                <div>
                  <b>
                    版本 {v.revision} · {v.label}
                  </b>
                  <small>{new Date(v.createdAt).toLocaleString("zh-CN")}</small>
                </div>
                {v.revision === trip?.revision ? (
                  <span>当前</span>
                ) : (
                  <button
                    className="restore-version"
                    disabled={busy}
                    onClick={() => restoreVersion(v.id)}
                  >
                    回退到这里
                  </button>
                )}
              </article>
            ))}
          </section>
        </div>
      )}
      {deleteTarget && (
        <div className="overlay" onClick={() => setDeleteTarget(null)}>
          <section
            className="delete-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="delete-title">删除“{deleteTarget.title}”？</h2>
            <p>行程、每日安排和版本历史都会永久删除。</p>
            <footer>
              <button onClick={() => setDeleteTarget(null)}>取消</button>
              <button
                className="confirm-delete"
                disabled={busy}
                onClick={deleteTrip}
              >
                {busy ? "正在删除…" : "确认删除"}
              </button>
            </footer>
          </section>
        </div>
      )}
      {clearScheduleOpen && (
        <div className="overlay" onClick={() => setClearScheduleOpen(false)}>
          <section
            className="delete-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-schedule-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="clear-schedule-title">清空当前日程？</h2>
            <p>所有未锁定的每日安排都会被清空，锁定项目将保留。</p>
            <footer>
              <button onClick={() => setClearScheduleOpen(false)}>取消</button>
              <button
                className="confirm-delete"
                disabled={busy}
                onClick={() => void clearSchedule()}
              >
                {busy ? "正在清空…" : "确认清空"}
              </button>
            </footer>
          </section>
        </div>
      )}
      {notice && (
        <div className="product-notice" role="status">
          {notice}
        </div>
      )}
    </main>
  );
}
