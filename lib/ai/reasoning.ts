export function reasoningRequestFields(
  provider: string,
  baseUrl: string,
  enabled: boolean,
): Record<string, unknown> {
  if (/silicon(flow)?|硅基流动/i.test(provider) || /api\.siliconflow\.cn/i.test(baseUrl))
    return { enable_thinking: enabled };
  if (
    /deepseek/i.test(provider) ||
    /api\.deepseek\.com/i.test(baseUrl) ||
    /volc|ark|火山|方舟/i.test(provider) ||
    /ark\.[a-z0-9-]+\.volces\.com/i.test(baseUrl)
  )
    return { thinking: { type: enabled ? "enabled" : "disabled" } };
  return {};
}

export type AiProviderKind =
  | "openai"
  | "deepseek"
  | "siliconflow"
  | "volcengine"
  | "openrouter"
  | "compatible";

export function aiProviderKind(provider: string, baseUrl: string): AiProviderKind {
  if (/deepseek/i.test(provider) || /api\.deepseek\.com/i.test(baseUrl))
    return "deepseek";
  if (/silicon(flow)?|硅基流动/i.test(provider) || /api\.siliconflow\.cn/i.test(baseUrl))
    return "siliconflow";
  if (/volc|ark|火山|方舟/i.test(provider) || /ark\.[a-z0-9-]+\.volces\.com/i.test(baseUrl))
    return "volcengine";
  if (/openrouter/i.test(provider) || /openrouter\.ai/i.test(baseUrl))
    return "openrouter";
  if (/openai/i.test(provider) || /api\.openai\.com/i.test(baseUrl))
    return "openai";
  return "compatible";
}

export function completionTokenFields(
  provider: string,
  baseUrl: string,
  tokenLimit: number,
) {
  const kind = aiProviderKind(provider, baseUrl);
  return kind === "deepseek" ||
    kind === "siliconflow" ||
    kind === "openrouter"
    ? { max_tokens: tokenLimit }
    : { max_completion_tokens: tokenLimit };
}

export function toolRequestFields(
  provider: string,
  baseUrl: string,
  required: boolean,
) {
  const kind = aiProviderKind(provider, baseUrl);
  return {
    tool_choice:
      required && ["openai", "deepseek", "openrouter"].includes(kind)
        ? "required"
        : "auto",
    ...(["openai", "openrouter"].includes(kind)
      ? { parallel_tool_calls: true }
      : {}),
    ...(kind === "openrouter"
      ? { provider: { require_parameters: true } }
      : {}),
  };
}
