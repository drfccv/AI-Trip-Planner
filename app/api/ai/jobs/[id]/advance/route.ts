import { getRequestExecutionContext } from "vinext/shims/request-context";
import { requireRequestUser } from "@/lib/auth/request-user";
import { advanceAiJob } from "@/lib/ai/jobs";
const headersFor = (request: Request) => Object.fromEntries(["oai-authenticated-user-email", "oai-authenticated-user-full-name", "x-desktop-runtime", "x-desktop-token"].map(name => [name, request.headers.get(name) || ""]).filter(([, value]) => value));
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { const user = await requireRequestUser(request); const { id } = await context.params; const task = advanceAiJob(id, user.id, headersFor(request), new URL(request.url).origin); const execution = getRequestExecutionContext(); if (execution) execution.waitUntil(task); else void task; return Response.json({ accepted: true }, { status: 202 }); }
