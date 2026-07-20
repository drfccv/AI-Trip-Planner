export function apiError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const status = message === "AUTH_REQUIRED" ? 401 : message.includes("NOT_FOUND") ? 404 : message.includes("LOCKED_") || message.includes("CONFLICT") ? 409 : message.includes("INVALID") || message.includes("DAY_NOT") ? 400 : 500;
  return Response.json({ error: message }, { status });
}
