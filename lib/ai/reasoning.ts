export function reasoningRequestFields(
  provider: string,
  baseUrl: string | boolean,
  enabledValue?: boolean,
): Record<string, unknown> {
  const enabled = typeof baseUrl === "boolean" ? baseUrl : Boolean(enabledValue);
  const normalizedBaseUrl = typeof baseUrl === "string" ? baseUrl : "";
  if (/silicon(flow)?|硅基流动/i.test(provider) || /api\.siliconflow\.cn/i.test(normalizedBaseUrl))
    return { enable_thinking: enabled };
  if (
    /deepseek/i.test(provider) ||
    /api\.deepseek\.com/i.test(normalizedBaseUrl) ||
    /volc|ark|火山|方舟/i.test(provider) ||
    /ark\.[a-z0-9-]+\.volces\.com/i.test(normalizedBaseUrl)
  )
    return { thinking: { type: enabled ? "enabled" : "disabled" } };
  return {};
}
