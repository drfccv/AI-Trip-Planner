export type DsmlToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export function parseDsmlToolCalls(content: string): {
  content: string;
  toolCalls: DsmlToolCall[];
  detected: boolean;
} {
  const normalized = content
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");
  const detected = /<\|DSML\|/i.test(normalized);
  if (!detected) return { content, toolCalls: [], detected: false };

  const toolCalls: DsmlToolCall[] = [];
  const invokePattern =
    /<\|DSML\|\s*invoke\b([^>]*)>([\s\S]*?)<\/\|DSML\|\s*invoke\s*>/gi;
  let invoke: RegExpExecArray | null;
  while ((invoke = invokePattern.exec(normalized))) {
    const name = /\bname\s*=\s*["']([^"']+)["']/i.exec(invoke[1])?.[1];
    if (!name) continue;

    let argumentsText = "";
    const parameterPattern =
      /<\|DSML\|\s*parameter\b([^>]*)>([\s\S]*?)<\/\|DSML\|\s*parameter\s*>/gi;
    let parameter: RegExpExecArray | null;
    while ((parameter = parameterPattern.exec(invoke[2]))) {
      const parameterName =
        /\bname\s*=\s*["']([^"']+)["']/i.exec(parameter[1])?.[1];
      if (parameterName === "arguments") {
        argumentsText = parameter[2].trim();
        break;
      }
    }
    if (!argumentsText) continue;

    try {
      const parsedArguments = JSON.parse(argumentsText);
      toolCalls.push({
        id: `dsml_call_${Date.now()}_${toolCalls.length}`,
        type: "function",
        function: {
          name,
          arguments: JSON.stringify(parsedArguments),
        },
      });
    } catch {
      // A malformed textual tool call must not be executed.
    }
  }

  const visibleContent = normalized
    .replace(
      /<\|DSML\|\s*tool_calls\s*>[\s\S]*?<\/\|DSML\|\s*tool_calls\s*>/gi,
      "",
    )
    .replace(invokePattern, "")
    .replace(/<\/?\|DSML\|[^>]*>/gi, "")
    .trim();
  return { content: visibleContent, toolCalls, detected: true };
}
