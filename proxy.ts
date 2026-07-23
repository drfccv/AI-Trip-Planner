import { NextRequest, NextResponse } from "next/server";

const COOKIE = "lvji_anon";
const HEADER = "x-lvji-anonymous-id";
const encoder = new TextEncoder();

const base64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");

async function sign(id: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(id))));
}

export async function proxy(request: NextRequest) {
  const secret = process.env.APP_ENCRYPTION_KEY;
  if (!secret) return NextResponse.json({ error: "APP_ENCRYPTION_KEY_REQUIRED" }, { status: 500 });
  const supplied = request.cookies.get(COOKIE)?.value || "";
  const [candidate, candidateSignature] = supplied.split(".");
  const valid = /^[0-9a-f]{32}$/.test(candidate || "") && candidateSignature === await sign(candidate, secret);
  const id = valid ? candidate : crypto.randomUUID().replaceAll("-", "");
  const value = valid ? supplied : `${id}.${await sign(id, secret)}`;
  const headers = new Headers(request.headers);
  headers.delete("oai-authenticated-user-email");
  headers.delete("oai-authenticated-user-full-name");
  headers.delete(HEADER);
  headers.set(HEADER, id);
  headers.set("cookie", `${request.headers.get("cookie") || ""}; ${COOKIE}=${value}`);
  const response = NextResponse.next({ request: { headers } });
  if (!request.nextUrl.pathname.startsWith("/api/")) {
    response.headers.set(
      "cache-control",
      "private, no-store, no-cache, must-revalidate",
    );
  }
  if (!valid) response.cookies.set(COOKIE, value, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 31536000 });
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
