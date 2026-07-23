import { and, desc, eq } from "drizzle-orm";
import { after } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { aiJobs, trips } from "@/db/schema";
import { publicAiJob } from "@/lib/ai/job-public";
import { runAiJobLoop } from "@/lib/ai/jobs";
import {
  requestIdentityHeaders,
  requireRequestUser,
} from "@/lib/auth/request-user";

const input = z.object({
  tripId: z.string().uuid(),
  prompt: z.string().trim().min(1).max(12000),
  useMcp: z.boolean().default(true),
  mode: z.enum(["conversation", "format"]).default("conversation"),
  responseKind: z.enum(["reply", "plan"]).default("plan"),
  dispatchIntent: z
    .enum(["answer", "create_or_revise_plan", "accept_pending_plan"])
    .optional(),
  confirmedAnswer: z.string().max(30000).optional(),
  confirmedTrace: z
    .array(
      z.object({
        serverId: z.string().optional().default(""),
        provider: z.string(),
        tool: z.string(),
        status: z.enum(["success", "error"]),
        durationMs: z.number(),
        error: z.string().optional(),
      }),
    )
    .max(100)
    .optional(),
  conversation: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(12000),
      }),
    )
    .max(30)
    .optional(),
});
export async function POST(request: Request) {
  try {
    const user = await requireRequestUser(request);
    const body = input.parse(await request.json());
    const owned = await getDb()
      .select({ id: trips.id })
      .from(trips)
      .where(and(eq(trips.id, body.tripId), eq(trips.userId, user.id)))
      .limit(1);
    if (!owned.length)
      return Response.json({ error: "TRIP_NOT_FOUND" }, { status: 404 });
    if (body.mode === "format" && !body.confirmedAnswer)
      return Response.json(
        { error: "CONFIRMED_PLAN_REQUIRED" },
        { status: 400 },
      );
    const id = crypto.randomUUID();
    const contextJson = JSON.stringify({
      mode: body.mode,
      responseKind: body.responseKind,
      dispatchIntent: body.dispatchIntent,
      confirmedAnswer: body.confirmedAnswer,
      confirmedTrace: body.confirmedTrace || [],
      conversation: body.conversation || [],
    });
    await getDb()
      .insert(aiJobs)
      .values({
        id,
        userId: user.id,
        tripId: body.tripId,
        prompt: body.prompt,
        useMcp: body.useMcp,
        stage: body.mode === "format" ? "preparing_format" : "discovering_mcp",
        contextJson,
      });
    const job = (
      await getDb().select().from(aiJobs).where(eq(aiJobs.id, id)).limit(1)
    )[0];
    const auth = requestIdentityHeaders(request);
    const origin = new URL(request.url).origin;
    if (request.headers.get("x-desktop-runtime") === "1")
      void runAiJobLoop(id, user.id, auth, origin);
    else after(() => runAiJobLoop(id, user.id, auth, origin));
    return Response.json({ job: publicAiJob(job) }, { status: 202 });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? "AI 规划请求格式不正确"
        : error instanceof Error &&
            /no column|has no column|database schema/i.test(error.message)
          ? "AI 任务存储正在升级，请刷新后重试"
          : error instanceof Error
            ? error.message
            : "AI 任务创建失败";
    return Response.json({ error: message }, { status: 400 });
  }
}
export async function GET(request: Request) {
  try {
    const user = await requireRequestUser(request);
    const tripId = new URL(request.url).searchParams.get("tripId");
    if (!tripId)
      return Response.json({ error: "TRIP_ID_REQUIRED" }, { status: 400 });
    const rows = await getDb()
      .select()
      .from(aiJobs)
      .where(and(eq(aiJobs.userId, user.id), eq(aiJobs.tripId, tripId)))
      .orderBy(desc(aiJobs.createdAt))
      .limit(50);
    return Response.json(
      {
        job: rows[0] ? publicAiJob(rows[0]) : null,
        history: rows.reverse().map(publicAiJob),
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "AI_JOB_READ_FAILED" },
      { status: 500 },
    );
  }
}
export async function DELETE(request: Request) {
  try {
    const user = await requireRequestUser(request);
    const url = new URL(request.url);
    const tripId = url.searchParams.get("tripId");
    if (!tripId)
      return Response.json({ error: "TRIP_ID_REQUIRED" }, { status: 400 });
    if (url.searchParams.get("scope") === "latest-conversation") {
      const rows = await getDb()
        .select()
        .from(aiJobs)
        .where(and(eq(aiJobs.userId, user.id), eq(aiJobs.tripId, tripId)))
        .orderBy(desc(aiJobs.createdAt))
        .limit(50);
      const latest = rows.find((row) => {
        const context = JSON.parse(row.contextJson || "{}") as {
          mode?: string;
        };
        return (context.mode || "conversation") === "conversation";
      });
      if (latest)
        await getDb()
          .delete(aiJobs)
          .where(and(eq(aiJobs.id, latest.id), eq(aiJobs.userId, user.id)));
    } else
      await getDb()
        .delete(aiJobs)
        .where(and(eq(aiJobs.userId, user.id), eq(aiJobs.tripId, tripId)));
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "AI_HISTORY_RESET_FAILED",
      },
      { status: 500 },
    );
  }
}
