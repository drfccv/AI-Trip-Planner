import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { aiJobs } from "@/db/schema";
import { publicAiJob } from "@/lib/ai/job-public";
import { requireRequestUser } from "@/lib/auth/request-user";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireRequestUser(request);
    const { id } = await context.params;
    const job = (
      await getDb()
        .select()
        .from(aiJobs)
        .where(and(eq(aiJobs.id, id), eq(aiJobs.userId, user.id)))
        .limit(1)
    )[0];
    if (!job)
      return Response.json({ error: "AI_JOB_NOT_FOUND" }, { status: 404 });
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
