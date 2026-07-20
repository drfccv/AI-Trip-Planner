export type McpProviderId = string;
export type McpPermission = "deny" | "ask" | "readonly";
export type McpAuthMode = "none" | "bearer" | "authorization";
export type McpServerConfig = {
  id: McpProviderId;
  name: string;
  endpoint: string;
  homepage?: string;
  apiKey?: string;
  authHeader?: string;
  authMode: McpAuthMode;
  enabled: boolean;
  permission: McpPermission;
  source: "builtin" | "custom";
};
export type PublicMcpServer = Omit<McpServerConfig, "apiKey" | "authHeader"> & {
  configured: boolean;
  secretHint: string | null;
  transport: "streamable-http";
  tools?: number;
  lastError?: string;
};
export type McpTool = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};
