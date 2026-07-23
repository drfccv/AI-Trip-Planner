import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { aiSettings } from "@/db/schema";
import { requireRequestUser } from "@/lib/auth/request-user";
import { decryptSecret, encryptSecret } from "@/lib/mcp/store";
import { assertSafeMcpUrl, redactSecret } from "@/lib/mcp/security";
import { modelCall } from "@/lib/ai/planner";

const defaults = {
  provider: "openai-compatible",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-5-mini",
  thinkingEnabled: false,
};

export async function GET(request: Request) {
  try {
    const user = await requireRequestUser(request);
    const row = (
      await getDb()
        .select()
        .from(aiSettings)
        .where(eq(aiSettings.userId, user.id))
        .limit(1)
    )[0];
    return Response.json(
      {
        settings: row
          ? {
              provider: row.provider,
              baseUrl: row.baseUrl,
              model: row.model,
              thinkingEnabled: row.thinkingEnabled,
              configured: Boolean(row.encryptedApiKey),
              keyHint: row.encryptedApiKey ? "••••已保存" : null,
            }
          : { ...defaults, configured: false, keyHint: null },
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "AI_SETTINGS_READ_FAILED" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireRequestUser(request);
    const body = (await request.json()) as {
      provider?: string;
      baseUrl?: string;
      model?: string;
      apiKey?: string;
      thinkingEnabled?: boolean;
    };
    if (!body.provider?.trim() || !body.baseUrl?.trim() || !body.model?.trim())
      return Response.json(
        { error: "请填写服务商、API 地址和模型名称" },
        { status: 400 },
      );
    const url = assertSafeMcpUrl(body.baseUrl);
    const old = (
      await getDb()
        .select()
        .from(aiSettings)
        .where(eq(aiSettings.userId, user.id))
        .limit(1)
    )[0];
    const incomingKey = body.apiKey?.trim();
    if (old && old.provider !== body.provider && !incomingKey)
      return Response.json(
        { error: "切换服务商后需要填写该服务商的 API Key" },
        { status: 400 },
      );
    const encryptedApiKey = incomingKey
      ? await encryptSecret(incomingKey)
      : old?.encryptedApiKey || null;
    const values = {
      provider: body.provider.trim(),
      baseUrl: url.toString().replace(/\/$/, ""),
      model: body.model.trim(),
      thinkingEnabled: body.thinkingEnabled === true,
      encryptedApiKey,
    };
    await getDb()
      .insert(aiSettings)
      .values({ userId: user.id, ...values })
      .onConflictDoUpdate({
        target: aiSettings.userId,
        set: { ...values, updatedAt: new Date().toISOString() },
      });
    return Response.json({
      ok: true,
      configured: Boolean(encryptedApiKey),
      thinkingEnabled: values.thinkingEnabled,
      keyHint: redactSecret(incomingKey) || (encryptedApiKey ? "••••已保存" : null),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "AI 设置保存失败" },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const user = await requireRequestUser(request);
    const row = (
      await getDb()
        .select()
        .from(aiSettings)
        .where(eq(aiSettings.userId, user.id))
        .limit(1)
    )[0];
    if (!row?.encryptedApiKey)
      return Response.json({ error: "请先填写并保存 API Key" }, { status: 400 });
    const key = await decryptSecret(row.encryptedApiKey);
    const base = assertSafeMcpUrl(row.baseUrl).toString().replace(/\/$/, "");
    const response = await fetch(`${base}/models`, {
      headers: { authorization: `Bearer ${key}`, accept: "application/json" },
      redirect: "manual",
      signal: controller.signal,
    });
    if (response.status >= 300 && response.status < 400)
      throw new Error("模型服务发生了不安全的重定向");
    if (response.status === 401 || response.status === 403)
      throw new Error("API Key 无效或没有访问权限");
    if (response.status === 404)
      throw new Error("API 地址不正确：未找到 /models 接口");
    if (!response.ok) throw new Error(`模型服务连接失败（HTTP ${response.status}）`);
    const probe = await modelCall(
      {
        provider: row.provider,
        base,
        model: row.model,
        key,
        thinkingEnabled: false,
      },
      [
        {
          role: "user",
          content:
            "这是 Function Calling 兼容性测试。必须调用 compatibility_probe 工具一次，参数 value 必须为 ok；不要直接回答文本。",
        },
      ],
      [
        {
          type: "function",
          function: {
            name: "compatibility_probe",
            description:
              "用于验证当前模型能否按照 OpenAI-compatible Function Calling 协议返回工具调用。",
            parameters: {
              type: "object",
              additionalProperties: false,
              properties: { value: { type: "string", enum: ["ok"] } },
              required: ["value"],
            },
          },
        },
      ],
      false,
      30000,
      undefined,
      128,
      true,
    );
    if (
      !probe.toolCalls.some(
        (call) => call.function.name === "compatibility_probe",
      )
    )
      throw new Error(
        "连接成功，但当前模型没有返回工具调用；请换用支持 Function Calling 的模型",
      );
    return Response.json({
      ok: true,
      model: row.model,
      toolCalling: true,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "AI 连接失败" },
      { status: 502 },
    );
  } finally {
    clearTimeout(timer);
  }
}
