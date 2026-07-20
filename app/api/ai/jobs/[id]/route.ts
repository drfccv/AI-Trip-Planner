import { and, eq } from "drizzle-orm";
import { getRequestExecutionContext } from "vinext/shims/request-context";
import { getDb } from "@/db";
import { aiJobs } from "@/db/schema";
import { publicAiJob } from "@/lib/ai/job-public";
import { requireRequestUser } from "@/lib/auth/request-user";

const auth = (request: Request) =>
  Object.fromEntries(
    ["oai-authenticated-user-email", "oai-authenticated-user-full-name"]
      .map((name) => [name, request.headers.get(name) || ""])
      .filter(([, value]) => value),
  );
const schedule = (promise: Promise<unknown>) => {
  const context = getRequestExecutionContext();
  if (context) context.waitUntil(promise);
  else void promise;
};
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireRequestUser(request);
    const { id } = await context.params;
    let job = (
      await getDb()
        .select()
        .from(aiJobs)
        .where(and(eq(aiJobs.id, id), eq(aiJobs.userId, user.id)))
        .limit(1)
    )[0];
    if (!job)
      return Response.json({ error: "AI_JOB_NOT_FOUND" }, { status: 404 });
    if (
      job.status === "running" &&
      Date.now() - new Date(job.updatedAt).getTime() > 360000
    ) {
      await getDb()
        .update(aiJobs)
        .set({
          status: "queued",
          error: "检测到阶段中断，正在从当前阶段恢复",
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(aiJobs.id, id),
            eq(aiJobs.userId, user.id),
            eq(aiJobs.status, "running"),
          ),
        );
      job = (
        await getDb().select().from(aiJobs).where(eq(aiJobs.id, id)).limit(1)
      )[0];
    }
    if (job.status === "queued")
      schedule(
        fetch(`${new URL(request.url).origin}/api/ai/jobs/${id}/advance`, {
          method: "POST",
          headers: auth(request),
        }),
      );
    return Response.json(
      { job: publicAiJob(job) },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "AI_JOB_READ_FAILED" },
      { status: 500 },
    );
  }
}
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireRequestUser(request);
    const { id } = await context.params;
    await getDb()
      .update(aiJobs)
      .set({
        status: "cancelled",
        stage: "cancelled",
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(aiJobs.id, id), eq(aiJobs.userId, user.id)));
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "AI_JOB_CANCEL_FAILED",
      },
      { status: 500 },
    );
  }
}
