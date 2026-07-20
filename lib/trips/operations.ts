import { z } from "zod";

const itemInput = z.object({
  id: z.string().uuid().optional(),
  dayId: z.string().uuid(),
  type: z.string().min(1).max(40),
  title: z.string().min(1).max(160),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  durationMinutes: z.number().int().min(5).max(1440),
  notes: z.string().max(4000).default(""),
  cost: z.number().nonnegative().nullable().optional(),
  sourceType: z
    .enum(["user_added", "ai_generated", "mcp_verified"])
    .default("user_added"),
  metadata: z
    .object({
      imageUrl: z.string().url().max(2000).optional(),
      poiId: z.string().max(200).optional(),
      location: z.string().max(100).optional(),
      address: z.string().max(500).optional(),
      introduction: z.string().max(4000).optional(),
    })
    .nullable()
    .optional(),
});

export const tripOperationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("add_item"),
    item: itemInput,
    position: z.number().int().nonnegative().optional(),
  }),
  z.object({ type: z.literal("remove_item"), itemId: z.string().uuid() }),
  z.object({
    type: z.literal("move_item"),
    itemId: z.string().uuid(),
    dayId: z.string().uuid(),
    position: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("update_item"),
    itemId: z.string().uuid(),
    patch: z.object({
      type: z.string().min(1).max(40).optional(),
      title: z.string().min(1).max(160).optional(),
      startTime: z
        .string()
        .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
        .optional(),
      durationMinutes: z.number().int().min(5).max(1440).optional(),
      notes: z.string().max(4000).optional(),
      cost: z.number().nonnegative().nullable().optional(),
      metadata: z
        .object({
          imageUrl: z.string().url().max(2000).optional(),
          poiId: z.string().max(200).optional(),
          location: z.string().max(100).optional(),
          address: z.string().max(500).optional(),
          introduction: z.string().max(4000).optional(),
        })
        .nullable()
        .optional(),
    }),
  }),
  z.object({ type: z.literal("lock_item"), itemId: z.string().uuid() }),
  z.object({ type: z.literal("unlock_item"), itemId: z.string().uuid() }),
  z.object({
    type: z.literal("update_budget"),
    budgetTotal: z.number().nonnegative().nullable(),
  }),
]);
export const operationRequestSchema = z.object({
  baseRevision: z.number().int().positive(),
  idempotencyKey: z.string().min(8).max(128),
  operations: z.array(tripOperationSchema).min(1).max(50),
});
export type TripOperation = z.infer<typeof tripOperationSchema>;

type Item = {
  id: string;
  dayId: string;
  locked: boolean;
  position: number;
  [key: string]: unknown;
};
type Day = { id: string; items: Item[]; [key: string]: unknown };
export type TripSnapshot = {
  revision: number;
  budgetTotal?: number | null;
  days: Day[];
  [key: string]: unknown;
};

export function applyOperations(
  input: TripSnapshot,
  operations: TripOperation[],
) {
  const trip = structuredClone(input);
  const find = (id: string) => {
    for (const day of trip.days) {
      const index = day.items.findIndex((i) => i.id === id);
      if (index >= 0) return { day, index, item: day.items[index] };
    }
    throw new Error(`ITEM_NOT_FOUND:${id}`);
  };
  const normalize = () =>
    trip.days.forEach((day) =>
      day.items.forEach((item, i) => {
        item.position = i;
        item.dayId = day.id;
      }),
    );
  for (const operation of operations) {
    if (operation.type === "add_item") {
      const day = trip.days.find((d) => d.id === operation.item.dayId);
      if (!day) throw new Error("DAY_NOT_FOUND");
      const item = {
        ...operation.item,
        id: operation.item.id || crypto.randomUUID(),
        locked: false,
        lockTime: false,
        position: operation.position ?? day.items.length,
      };
      day.items.splice(Math.min(item.position, day.items.length), 0, item);
    } else if (operation.type === "remove_item") {
      const hit = find(operation.itemId);
      if (hit.item.locked) throw new Error("LOCKED_ITEM_PROTECTED");
      hit.day.items.splice(hit.index, 1);
    } else if (operation.type === "move_item") {
      const hit = find(operation.itemId);
      if (hit.item.locked) throw new Error("LOCKED_ITEM_PROTECTED");
      const target = trip.days.find((d) => d.id === operation.dayId);
      if (!target) throw new Error("DAY_NOT_FOUND");
      hit.day.items.splice(hit.index, 1);
      target.items.splice(
        Math.min(operation.position, target.items.length),
        0,
        hit.item,
      );
    } else if (operation.type === "update_item") {
      const hit = find(operation.itemId);
      if (hit.item.locked) throw new Error("LOCKED_ITEM_PROTECTED");
      Object.assign(hit.item, operation.patch);
    } else if (operation.type === "lock_item")
      find(operation.itemId).item.locked = true;
    else if (operation.type === "unlock_item")
      find(operation.itemId).item.locked = false;
    else if (operation.type === "update_budget")
      trip.budgetTotal = operation.budgetTotal;
    normalize();
  }
  trip.revision = input.revision + 1;
  return trip;
}

export function operationSummary(operations: TripOperation[]) {
  const labels: Record<TripOperation["type"], string> = {
    add_item: "新增安排",
    remove_item: "删除安排",
    move_item: "移动安排",
    update_item: "更新安排",
    lock_item: "锁定安排",
    unlock_item: "解锁安排",
    update_budget: "调整预算",
  };
  return operations.map((o) => labels[o.type]).join("、");
}
