import { eq } from "drizzle-orm";
import { getDb, getSql } from "@/db";
import { users } from "@/db/schema";
import { ensureSchema } from "@/db/ensure-schema";

export type RequestUser = {
  id: string;
  email: string;
  displayName: string;
  anonymous: boolean;
};

const forwardedIdentityHeaders = [
  "oai-authenticated-user-email",
  "oai-authenticated-user-full-name",
  "x-lvji-anonymous-id",
  "cookie",
] as const;

export const requestIdentityHeaders = (request: Request) =>
  Object.fromEntries(
    forwardedIdentityHeaders
      .map((name) => [name, request.headers.get(name) || ""])
      .filter(([, value]) => value),
  );

const digest = async (value: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");

const idFor = async (email: string) =>
  `usr_${(await digest(email.toLowerCase())).slice(0, 32)}`;

async function limitAnonymousCreation(request: Request) {
  const sqlClient = getSql();
  await sqlClient`DELETE FROM anonymous_creation_limits WHERE expires_at < CURRENT_TIMESTAMP`;
  await sqlClient`DELETE FROM users WHERE email LIKE '%@anonymous.lvji.invalid' AND updated_at < CURRENT_TIMESTAMP - INTERVAL '90 days'`;
  await sqlClient`DELETE FROM users WHERE email LIKE '%@anonymous.lvji.invalid' AND updated_at < CURRENT_TIMESTAMP - INTERVAL '1 day' AND NOT EXISTS (SELECT 1 FROM trips WHERE trips.user_id = users.id) AND NOT EXISTS (SELECT 1 FROM ai_settings WHERE ai_settings.user_id = users.id) AND NOT EXISTS (SELECT 1 FROM mcp_servers WHERE mcp_servers.user_id = users.id)`;
  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    "local";
  const ipHash = await digest(ip);
  const now = new Date().toISOString();
  const windows = [
    { key: `hour:${ipHash}:${now.slice(0, 13)}`, limit: 5, expiry: "+2 hours" },
    { key: `day:${ipHash}:${now.slice(0, 10)}`, limit: 20, expiry: "+2 days" },
  ];
  for (const window of windows) {
    const interval = window.expiry === "+2 hours" ? "2 hours" : "2 days";
    const [result] = await sqlClient`INSERT INTO anonymous_creation_limits (bucket_key, count, expires_at) VALUES (${window.key}, 1, CURRENT_TIMESTAMP + ${interval}::interval) ON CONFLICT(bucket_key) DO UPDATE SET count = anonymous_creation_limits.count + 1 RETURNING count`;
    if ((Number(result?.count) || 0) > window.limit)
      throw new Error("ANONYMOUS_CREATION_RATE_LIMITED");
  }
}

export async function requireRequestUser(request: Request): Promise<RequestUser> {
  const authenticatedEmail = request.headers.get(
    "oai-authenticated-user-email",
  );
  const anonymousId = request.headers.get("x-lvji-anonymous-id");
  if (
    !authenticatedEmail &&
    !/^[0-9a-f]{32}$/.test(anonymousId || "")
  )
    throw new Error("AUTH_REQUIRED");

  await ensureSchema();
  const anonymous = !authenticatedEmail;
  const email =
    authenticatedEmail || `${anonymousId}@anonymous.lvji.invalid`;
  const encoded = request.headers.get("oai-authenticated-user-full-name");
  const displayName = anonymous
    ? "匿名访客"
    : encoded
      ? decodeURIComponent(encoded)
      : email;
  const id = anonymous ? `anon_${anonymousId}` : await idFor(email);
  const db = getDb();
  const existing = await db.select().from(users).where(eq(users.id, id)).limit(1);
  const shouldPersist = !["GET", "HEAD", "OPTIONS"].includes(request.method);

  if (!existing.length && shouldPersist) {
    if (anonymous) await limitAnonymousCreation(request);
    await db.insert(users).values({ id, email, displayName });
  } else if (existing.length && shouldPersist) {
    await db
      .update(users)
      .set({ updatedAt: new Date().toISOString() })
      .where(eq(users.id, id));
  }

  if (anonymous && request.method === "PUT" && new URL(request.url).pathname === "/api/mcp/servers") {
    const [row] = await getSql()`SELECT COUNT(*) AS count FROM mcp_servers WHERE user_id = ${id}`;
    if ((Number(row?.count) || 0) >= 20) throw new Error("ANONYMOUS_MCP_LIMIT_REACHED");
  }
  if (anonymous && request.method === "POST" && new URL(request.url).pathname === "/api/ai/jobs") {
    const [row] = await getSql()`SELECT COUNT(*) AS count FROM ai_jobs WHERE user_id = ${id}`;
    if ((Number(row?.count) || 0) >= 1000) throw new Error("ANONYMOUS_AI_JOB_LIMIT_REACHED");
  }

  return { id, email, displayName, anonymous };
}
