type EvidenceMessage = {
  role: string;
  content: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    function: { name: string; arguments: string };
  }>;
};

const omittedKey =
  /^(polyline|geometry|raw|raw_data|rawData|raw_json|rawJson|debug|request_id|requestId)$/i;

function compactValue(value: unknown, depth = 0): unknown {
  if (depth >= 6) return "[omitted:depth]";
  if (typeof value === "string")
    return value.length > 1200 ? `${value.slice(0, 1200)}…` : value;
  if (Array.isArray(value))
    return value.slice(0, 8).map((item) => compactValue(item, depth + 1));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !omittedKey.test(key))
        .slice(0, 40)
        .map(([key, item]) => [key, compactValue(item, depth + 1)]),
    );
  return value;
}

export function compactToolEvidence(
  history: EvidenceMessage[],
  maxChars = 40000,
) {
  const toolResults = new Map(
    history
      .filter(
        (message) =>
          message.role === "tool" &&
          message.tool_call_id &&
          message.content != null,
      )
      .map((message) => [message.tool_call_id!, message.content!]),
  );
  const seen = new Set<string>();
  const evidence: Array<Record<string, unknown>> = [];

  for (const message of history) {
    for (const call of message.tool_calls || []) {
      const signature = `${call.function.name}:${call.function.arguments}`;
      if (seen.has(signature)) continue;
      seen.add(signature);
      const content = toolResults.get(call.id);
      if (!content) continue;
      let result: unknown = content;
      try {
        result = JSON.parse(content);
      } catch {
        // Keep non-JSON tool output as bounded text.
      }
      let args: unknown = call.function.arguments;
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        // Preserve invalid arguments for diagnostics.
      }
      evidence.push({
        tool: call.function.name,
        arguments: compactValue(args),
        result: compactValue(result),
      });
    }
  }

  let serialized = JSON.stringify(evidence);
  while (evidence.length > 1 && serialized.length > maxChars) {
    evidence.pop();
    serialized = JSON.stringify(evidence);
  }
  return serialized;
}
