import { count, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { tripDays, trips, tripVersions } from "@/db/schema";
import { requireRequestUser } from "@/lib/auth/request-user";
export async function GET(request: Request) {
  try {
    const user = await requireRequestUser(request);
    const rows = await getDb()
      .select()
      .from(trips)
      .where(eq(trips.userId, user.id))
      .orderBy(desc(trips.updatedAt));
    return Response.json({
      trips: rows.map((x) => ({
        ...x,
        constraints: JSON.parse(x.constraintsJson),
      })),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "TRIPS_LIST_FAILED" },
      { status: 500 },
    );
  }
}
export async function POST(request: Request) {
  try {
    const user = await requireRequestUser(request);
    if (user.anonymous) {
      const [{ value }] = await getDb().select({ value: count() }).from(trips).where(eq(trips.userId, user.id));
      if (value >= 50) return Response.json({ error: "匿名用户最多保存 50 个行程" }, { status: 429 });
    }
    const body = (await request.json()) as {
      title?: string;
      destination?: string;
      startDate?: string;
      endDate?: string;
      dayCount?: number;
      perPersonBudget?: number;
      currency?: string;
      constraints?: Record<string, unknown>;
    };
    const fixedDates =
      /^\d{4}-\d{2}-\d{2}$/.test(body.startDate || "") &&
      /^\d{4}-\d{2}-\d{2}$/.test(body.endDate || "");
    if (!body.destination || (!fixedDates && !body.dayCount))
      return Response.json({ error: "TRIP_INPUT_INVALID" }, { status: 400 });
    const start = fixedDates ? new Date(`${body.startDate}T00:00:00Z`) : null;
    const end = fixedDates ? new Date(`${body.endDate}T00:00:00Z`) : null;
    const dayCount = fixedDates
      ? Math.floor((end!.getTime() - start!.getTime()) / 86400000) + 1
      : Number(body.dayCount);
    if (!Number.isInteger(dayCount) || dayCount < 1 || dayCount > 31)
      return Response.json(
        { error: "TRIP_DATE_RANGE_INVALID" },
        { status: 400 },
      );
    const id = crypto.randomUUID();
    const travelers = Math.max(1, Number(body.constraints?.travelers) || 1);
    const constraints = {
      ...(body.constraints || {}),
      flexibleDates: !fixedDates,
      dayCount,
      travelers,
      perPersonBudget: body.perPersonBudget,
    };
    const trip = {
      id,
      userId: user.id,
      title: body.title?.trim() || `${body.destination}之旅`,
      destination: body.destination.trim(),
      startDate: fixedDates ? body.startDate! : "",
      endDate: fixedDates ? body.endDate! : "",
      budgetTotal: body.perPersonBudget
        ? body.perPersonBudget * travelers
        : undefined,
      currency: body.currency || "CNY",
      constraintsJson: JSON.stringify(constraints),
      status: "draft" as const,
      sourceType: "user_added",
    };
    const days = Array.from({ length: dayCount }, (_, index) => {
      const date = start
        ? new Date(start.getTime() + index * 86400000)
            .toISOString()
            .slice(0, 10)
        : "";
      return {
        id: crypto.randomUUID(),
        tripId: id,
        dayIndex: index + 1,
        date,
        title:
          index === 0
            ? "抵达与探索"
            : index === dayCount - 1
              ? "从容返程"
              : `第 ${index + 1} 天`,
      };
    });
    const snapshot = JSON.stringify({
      ...trip,
      constraints,
      revision: 1,
      days: days.map((day) => ({ ...day, items: [], routes: [] })),
    });
    await getDb().batch([
      getDb().insert(trips).values(trip),
      getDb().insert(tripDays).values(days),
      getDb().insert(tripVersions).values({
        id: crypto.randomUUID(),
        tripId: id,
        revision: 1,
        label: "创建行程",
        snapshotJson: snapshot,
        createdBy: user.id,
      }),
    ]);
    return Response.json(
      { trip: { ...trip, constraints, revision: 1, days } },
      { status: 201 },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "TRIP_CREATE_FAILED" },
      { status: 500 },
    );
  }
}
