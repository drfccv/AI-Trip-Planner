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
