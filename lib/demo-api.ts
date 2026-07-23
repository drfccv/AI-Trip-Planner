"use client";

import { applyOperations, type TripOperation } from "@/lib/trips/operations";
import { demoJobSeeds, demoTripSeeds } from "@/lib/demo-seeds.generated";

const TRIPS_KEY = "lvji-current-trips-demo-v2";
const JOBS_KEY = "lvji-current-conversations-demo-v2";

type Json = Record<string, unknown>;
type DemoJob = {
  id: string;
  tripId: string;
  prompt: string;
  mode: "conversation" | "format";
  status: "running" | "completed";
  stage: string;
  progress: number;
  attempts: number;
  activity: Array<Record<string, unknown>>;
  createdAt: string;
  updatedAt: string;
  result: { message: string; operations: unknown[]; requiresConfirmation?: boolean } | null;
  error: null;
};

const id = () => crypto.randomUUID();
const day = (date: string, index: number, title: string, items: Json[]) => {
  const dayId = id();
  return {
    id: dayId,
    dayIndex: index,
    date,
    title,
    weather: {
      weather: index === 2 ? "多云" : "晴",
      low: 18 + index,
      high: 25 + index,
      wind: "东风 2 级",
      advice: "早晚微凉，建议携带薄外套和舒适步行鞋。",
      verifiedAt: new Date().toISOString(),
    },
    items: items.map((item, position) => ({
      id: id(),
      dayId,
      position,
      locked: false,
      sourceType: "ai_generated",
      ...item,
    })),
  };
};

function seeds() {
  return structuredClone(demoTripSeeds) as Json[];
}

function read<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "") as T;
  } catch {
    localStorage.setItem(key, JSON.stringify(fallback));
    return fallback;
  }
}
const trips = () => read<Json[]>(TRIPS_KEY, seeds());
const writeTrips = (value: Json[]) =>
  localStorage.setItem(TRIPS_KEY, JSON.stringify(value));
function seedJobs(allTrips: Json[]): DemoJob[] {
  const tripIds = new Set(allTrips.map((trip) => String(trip.id)));
  return structuredClone(demoJobSeeds).filter((job) =>
    tripIds.has(job.tripId),
  ) as DemoJob[];
}
const jobs = () => read<DemoJob[]>(JOBS_KEY, seedJobs(trips()));
const writeJobs = (value: DemoJob[]) =>
  localStorage.setItem(JOBS_KEY, JSON.stringify(value));

function aiReply(prompt: string, destination: string) {
  if (/预算|费用|省钱/.test(prompt))
    return `这段${destination}行程建议把约 20% 预算留给交通和临时体验。当前示例中的景点费用较低，可以把更多预算留给住宿与当地餐饮。`;
  if (/吃|美食|餐/.test(prompt))
    return `${destination}的安排可以加入一次当地早餐和一次老街小吃探索。建议不要把正餐夹在两个紧凑景点之间，至少预留 60–90 分钟。`;
  if (/松弛|轻松|不要太赶/.test(prompt))
    return "我建议每天保留 1–2 个主要目的地，并在午后留出弹性休息时间。现有日程已经接近这个节奏，可以继续减少跨区域移动。";
  return `这是 GitHub Pages Demo 的本地模拟回复。我已参考当前${destination}示例行程；你可以继续询问预算、美食或慢节奏安排。真实版本会调用 AI 与旅行工具。`;
}

export async function demoApi<T>(
  rawUrl: string,
  options: RequestInit = {},
): Promise<T> {
  const url = new URL(rawUrl, location.origin);
  const method = options.method || "GET";
  const body = options.body ? (JSON.parse(String(options.body)) as Json) : {};
  let all = trips();
  const tripMatch = url.pathname.match(/^\/api\/trips\/([^/]+)$/);

  if (url.pathname === "/api/trips" && method === "GET")
    return { trips: all } as T;
  if (url.pathname === "/api/trips" && method === "POST") {
    const start = String(body.startDate || new Date().toISOString().slice(0, 10));
    const count = body.endDate
      ? Math.max(
          1,
          Math.round(
            (new Date(String(body.endDate)).getTime() -
              new Date(start).getTime()) /
              86400000,
          ) + 1,
        )
      : Number(body.dayCount || 3);
    const created = {
      id: id(),
      title: String(body.title || `${body.destination}之旅`),
      destination: String(body.destination),
      startDate: body.startDate ? start : "",
      endDate: body.endDate ? String(body.endDate) : "",
      status: "planning",
      revision: 1,
      currency: String(body.currency || "CNY"),
      budgetTotal:
        Number(body.perPersonBudget || 0) *
          Number((body.constraints as Json)?.travelers || 1) || null,
      constraints: {
        ...((body.constraints as Json) || {}),
        dayCount: count,
        perPersonBudget: Number(body.perPersonBudget || 0) || undefined,
      },
      days: Array.from({ length: count }, (_, index) => {
        const date = new Date(`${start}T00:00:00`);
        date.setDate(date.getDate() + index);
        return day(
          body.startDate ? date.toISOString().slice(0, 10) : "",
          index + 1,
          index === 0 ? "抵达与初见" : "自由探索",
          [],
        );
      }),
    };
    all = [created, ...all];
    writeTrips(all);
    return { trip: created } as T;
  }
  if (tripMatch && method === "GET") {
    const trip = all.find((item) => item.id === tripMatch[1]);
    return { trip } as T;
  }
  if (tripMatch && method === "DELETE") {
    writeTrips(all.filter((item) => item.id !== tripMatch[1]));
    return {} as T;
  }
  if (url.pathname.endsWith("/weather") && method === "POST") {
    const tripId = url.pathname.split("/")[3];
    return { trip: all.find((item) => item.id === tripId) } as T;
  }
  if (url.pathname.endsWith("/operations/apply") && method === "POST") {
    const tripId = url.pathname.split("/")[3];
    const index = all.findIndex((item) => item.id === tripId);
    const updated = applyOperations(
      all[index] as Parameters<typeof applyOperations>[0],
      body.operations as TripOperation[],
    ) as Json;
    all[index] = updated;
    writeTrips(all);
    return { trip: updated, summary: "Demo 修改已保存到浏览器" } as T;
  }
  if (url.pathname.endsWith("/versions") && method === "GET") {
    const tripId = url.pathname.split("/")[3];
    const trip = all.find((item) => item.id === tripId);
    return {
      versions: [
        {
          id: `demo-version-${tripId}`,
          revision: trip?.revision || 1,
          label: "当前本地版本",
          createdAt: new Date().toISOString(),
        },
      ],
    } as T;
  }
  if (url.pathname === "/api/ai/dispatch")
    return {
      action: /生成|规划|调整|修改/.test(String(body.message))
        ? "plan"
        : "reply",
      intent: /生成|规划|调整|修改/.test(String(body.message))
        ? "create_or_revise_plan"
        : "answer",
    } as T;
  if (url.pathname === "/api/ai/jobs" && method === "GET") {
    const history = jobs().filter(
      (job) => job.tripId === url.searchParams.get("tripId"),
    );
    return { job: history.at(-1) || null, history } as T;
  }
  if (url.pathname === "/api/ai/jobs" && method === "DELETE") {
    writeJobs(jobs().filter((job) => job.tripId !== url.searchParams.get("tripId")));
    return {} as T;
  }
  if (url.pathname === "/api/ai/jobs" && method === "POST") {
    const trip = all.find((item) => item.id === body.tripId);
    const now = new Date().toISOString();
    const job: DemoJob = {
      id: id(),
      tripId: String(body.tripId),
      prompt: String(body.prompt),
      mode: body.mode === "format" ? "format" : "conversation",
      status: "running",
      stage: "demo_thinking",
      progress: 55,
      attempts: 0,
      activity: [
        {
          kind: "assistant",
          status: "active",
          title: "正在分析示例行程",
          detail: "Demo 使用本地规则生成回复",
        },
      ],
      createdAt: now,
      updatedAt: now,
      result: null,
      error: null,
    };
    writeJobs([...jobs(), job]);
    return { job } as T;
  }
  const jobMatch = url.pathname.match(/^\/api\/ai\/jobs\/([^/]+)$/);
  if (jobMatch && method === "GET") {
    const allJobs = jobs();
    const index = allJobs.findIndex((job) => job.id === jobMatch[1]);
    const current = allJobs[index];
    const trip = all.find((item) => item.id === current.tripId);
    current.status = "completed";
    current.stage = "completed";
    current.progress = 100;
    current.updatedAt = new Date().toISOString();
    current.activity = [
      {
        kind: "assistant",
        status: "completed",
        title: "示例回复已生成",
      },
    ];
    current.result = {
      message: aiReply(current.prompt, String(trip?.destination || "目的地")),
      operations: [],
    };
    writeJobs(allJobs);
    return { job: current } as T;
  }

  throw new Error(`DEMO_API_UNSUPPORTED:${method}:${url.pathname}`);
}

export function resetDemoData() {
  localStorage.setItem(TRIPS_KEY, JSON.stringify(seeds()));
  localStorage.removeItem(JOBS_KEY);
}
