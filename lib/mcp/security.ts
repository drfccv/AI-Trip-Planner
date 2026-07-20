const privateIpv4 = /^(0|10|127|169\.254|172\.(1[6-9]|2\d|3[01])|192\.168)\./;
export function assertSafeMcpUrl(raw: string) {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("MCP_ENDPOINT_INVALID"); }
  if (url.protocol !== "https:") throw new Error("MCP_HTTPS_REQUIRED");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "::1" || host === "0:0:0:0:0:0:0:1" || host === "metadata.google.internal" || privateIpv4.test(host) || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:")) throw new Error("MCP_PRIVATE_NETWORK_BLOCKED");
  return url;
}
export const redactSecret = (value?: string) => value ? `••••${value.slice(-4)}` : null;
