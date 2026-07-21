import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { ensureSchema } from "@/db/ensure-schema";
export type RequestUser = { id: string; email: string; displayName: string };
const idFor = async (email: string) => { const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email.toLowerCase()))); return `usr_${Array.from(bytes.slice(0, 16), b => b.toString(16).padStart(2, "0")).join("")}`; };
export async function requireRequestUser(request: Request): Promise<RequestUser> { const desktop = request.headers.get("x-desktop-runtime") === "1"; const email = desktop ? "local-user" : request.headers.get("oai-authenticated-user-email") || (process.env.NODE_ENV !== "production" ? "local@lvji.dev" : ""); if (!email) throw new Error("AUTH_REQUIRED"); await ensureSchema(); const encoded = request.headers.get("oai-authenticated-user-full-name"); const displayName = desktop ? "本地用户" : encoded ? decodeURIComponent(encoded) : email; const id = desktop ? "local-user" : await idFor(email); const db = getDb(); const existing = await db.select().from(users).where(eq(users.id, id)).limit(1); if (!existing.length) await db.insert(users).values({ id, email, displayName }); return { id, email, displayName }; }
