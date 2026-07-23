import { after } from "next/server";
import { requestIdentityHeaders, requireRequestUser } from "@/lib/auth/request-user";
import { runAiJobLoop } from "@/lib/ai/jobs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireRequestUser(request);
  const { id } = await context.params;
  const auth = requestIdentityHeaders(request);
  const origin = new URL(request.url).origin;
  if (request.headers.get("x-desktop-runtime") === "1")
    void runAiJobLoop(id, user.id, auth, origin);
  else after(() => runAiJobLoop(id, user.id, auth, origin));
  return Response.json({ started: true }, { status: 202 });
}
