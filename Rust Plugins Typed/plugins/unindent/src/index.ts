const BLOCK = /```([^\n`]*)\n([\s\S]*?)```/g;

function unindent(code: string): string {
  const lines = code.replace(/\t/g, "    ").split("\n");
  let min = Infinity;
  for (const line of lines) {
    if (!line.trim()) continue;
    min = Math.min(min, line.length - line.trimStart().length);
  }
  if (!min || min === Infinity) return code;
  return lines.map((line) => (line.trim() ? line.slice(min) : "")).join("\n");
}

phoenix.messages.onSend((text) => {
  if (!text.includes("```")) return;
  let changed = false;
  const out = text.replace(BLOCK, (whole, lang: string, code: string) => {
    const fixed = unindent(code);
    if (fixed === code) return whole;
    changed = true;
    return "```" + lang + "\n" + fixed + "```";
  });
  return changed ? out : undefined;
});

phoenix.log.info("unindent loaded");
