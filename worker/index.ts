/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  APP_ENCRYPTION_KEY?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

const ANON_COOKIE = "lvji_anon";
const ANON_HEADER = "x-lvji-anonymous-id";
const encoder = new TextEncoder();

function base64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function signature(id: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(id))));
}

function cookieValue(request: Request, name: string) {
  for (const part of (request.headers.get("cookie") || "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return "";
}

async function anonymousIdentity(request: Request, env: Env) {
  const secret = env.APP_ENCRYPTION_KEY || (process.env.NODE_ENV !== "production" ? "lvji-development-only-anonymous-cookie-key" : "");
  if (!secret) throw new Error("APP_ENCRYPTION_KEY_REQUIRED");
  const [candidate, suppliedSignature] = cookieValue(request, ANON_COOKIE).split(".");
  if (/^[0-9a-f]{32}$/.test(candidate || "") && suppliedSignature === await signature(candidate, secret)) return { id: candidate, cookie: "" };
  const id = crypto.randomUUID().replaceAll("-", "");
  const value = `${id}.${await signature(id, secret)}`;
  return { id, cookie: `${ANON_COOKIE}=${value}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax` };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    const headers = new Headers(request.headers);
    headers.delete(ANON_HEADER);
    let setCookie = "";
    if (!headers.get("oai-authenticated-user-email")) {
      const anonymous = await anonymousIdentity(request, env);
      headers.set(ANON_HEADER, anonymous.id);
      setCookie = anonymous.cookie;
      if (setCookie) {
        const signedCookie = setCookie.split(";", 1)[0];
        const existingCookies = headers.get("cookie");
        headers.set("cookie", existingCookies ? `${existingCookies}; ${signedCookie}` : signedCookie);
      }
    }
    const response = await handler.fetch(new Request(request, { headers }), env, ctx);
    if (!setCookie) return response;
    const outgoing = new Response(response.body, response);
    outgoing.headers.append("set-cookie", setCookie);
    outgoing.headers.set("cache-control", "private, no-store");
    return outgoing;
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(env.DB.batch([
      env.DB.prepare("DELETE FROM anonymous_creation_limits WHERE expires_at < CURRENT_TIMESTAMP"),
      env.DB.prepare("DELETE FROM users WHERE email LIKE '%@anonymous.lvji.invalid' AND updated_at < datetime('now', '-90 days')"),
      env.DB.prepare("DELETE FROM users WHERE email LIKE '%@anonymous.lvji.invalid' AND updated_at < datetime('now', '-1 day') AND NOT EXISTS (SELECT 1 FROM trips WHERE trips.user_id = users.id) AND NOT EXISTS (SELECT 1 FROM ai_settings WHERE ai_settings.user_id = users.id) AND NOT EXISTS (SELECT 1 FROM mcp_servers WHERE mcp_servers.user_id = users.id)"),
    ]));
  },
};

export default worker;
