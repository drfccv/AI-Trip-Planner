import { logs } from "@/lib/mcp/audit";
export async function GET() { return Response.json({ logs: logs() }, { headers: { "cache-control": "no-store" } }); }
