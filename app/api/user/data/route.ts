import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { aiSettings, mcpCallLogs, mcpServers, trips } from "@/db/schema";
import { requireRequestUser } from "@/lib/auth/request-user";

export async function DELETE(request: Request) {
  try {
    const user = await requireRequestUser(request);
    const body = (await request.json()) as { scope?: "trips" | "all" };
    if (body.scope !== "trips" && body.scope !== "all")
      return Response.json({ error: "DELETE_SCOPE_INVALID" }, { status: 400 });
    const db = getDb();
    if (body.scope === "trips")
      await db.delete(trips).where(eq(trips.userId, user.id));
    else
      await db.batch([
        db.delete(trips).where(eq(trips.userId, user.id)),
        db.delete(mcpServers).where(eq(mcpServers.userId, user.id)),
        db.delete(mcpCallLogs).where(eq(mcpCallLogs.userId, user.id)),
        db.delete(aiSettings).where(eq(aiSettings.userId, user.id)),
      ]);
    return Response.json({ ok: true, scope: body.scope });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "DATA_DELETE_FAILED" },
      { status: 500 },
    );
  }
}
