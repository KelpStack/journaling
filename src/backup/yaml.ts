/** Minimal YAML read/write for vault front matter (no external deps). */

function quoteString(value: string): string {
  return JSON.stringify(value);
}

function serializeScalar(value: unknown, indent: number): string {
  if (value === null || value === undefined) {
    return "null";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value === "string") {
    if (value.includes("\n")) {
      const pad = " ".repeat(indent);
      return "|\n" + value.split("\n").map((line) => `${pad}  ${line}`).join("\n");
    }
    return quoteString(value);
  }
  return quoteString(String(value));
}

function serializeValue(value: unknown, indent: number): string {
  const pad = " ".repeat(indent);

  if (value === null || value === undefined) {
    return "null";
  }
  if (typeof value === "boolean" || typeof value === "number") {
    return serializeScalar(value, indent);
  }
  if (typeof value === "string") {
    return serializeScalar(value, indent);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]";
    }
    return value
      .map((item) => {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          const childIndent = indent + 2;
          const childPad = " ".repeat(childIndent);
          const lines = serializeObject(item as Record<string, unknown>, childIndent)
            .split("\n")
            .filter((line) => line.length > 0);
          const [first, ...rest] = lines;
          const itemPad = " ".repeat(childIndent);
          return (
            `${pad}- ${first!.slice(childPad.length)}` +
            (rest.length
              ? "\n" + rest.map((l) => `${itemPad}${l.slice(childPad.length)}`).join("\n")
              : "")
          );
        }
        return `${pad}- ${serializeScalar(item, indent + 2).trim()}`;
      })
      .join("\n");
  }

  if (typeof value === "object") {
    return serializeObject(value as Record<string, unknown>, indent);
  }

  return serializeScalar(value, indent);
}

function serializeObject(obj: Record<string, unknown>, indent: number): string {
  const pad = " ".repeat(indent);
  const entries = Object.entries(obj);
  if (entries.length === 0) {
    return "{}";
  }

  return entries
    .map(([key, value]) => {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const nested = serializeObject(value as Record<string, unknown>, indent + 2);
        if (nested === "{}") {
          return `${pad}${key}: {}`;
        }
        return `${pad}${key}:\n${nested}`;
      }
      if (Array.isArray(value)) {
        if (value.length === 0) {
          return `${pad}${key}: []`;
        }
        return `${pad}${key}:\n${serializeValue(value, indent + 2)}`;
      }
      return `${pad}${key}: ${serializeScalar(value, indent + 2)}`;
    })
    .join("\n");
}

export function serializeYaml(obj: Record<string, unknown>): string {
  return serializeObject(obj, 0);
}

function unquoteString(raw: string): string {
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return JSON.parse(trimmed.startsWith("'") ? `"${trimmed.slice(1, -1)}"` : trimmed) as string;
  }
  return trimmed;
}

function parseScalar(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null" || trimmed === "~") return null;
  if (trimmed === "[]") return [];
  if (trimmed === "{}") return {};
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return unquoteString(trimmed);
  }
  return trimmed;
}

function countIndent(line: string): number {
  const match = /^(\s*)/.exec(line);
  return match?.[1]?.length ?? 0;
}

type BlockScalarStyle = "literal" | "literal-strip" | "folded" | "folded-strip";

function parseBlockScalarIndicator(raw: string): BlockScalarStyle | null {
  const trimmed = raw.trim();
  if (trimmed === "|") return "literal";
  if (trimmed === "|-") return "literal-strip";
  if (trimmed === ">") return "folded";
  if (trimmed === ">-") return "folded-strip";
  return null;
}

function parseBlockScalarLines(
  lines: string[],
  start: number,
  indicatorIndent: number,
): [string, number] {
  let i = start;
  let contentIndent = -1;
  const contentLines: string[] = [];

  while (i < lines.length) {
    const line = lines[i]!;
    if (line.trim() === "") {
      if (contentLines.length > 0) {
        contentLines.push("");
        i += 1;
        continue;
      }
      i += 1;
      continue;
    }

    const indent = countIndent(line);
    if (indent <= indicatorIndent) {
      break;
    }
    if (contentIndent === -1) {
      contentIndent = indent;
    }
    if (indent < contentIndent) {
      break;
    }
    contentLines.push(line.slice(contentIndent));
    i += 1;
  }

  return [contentLines.join("\n"), i];
}

function finalizeBlockScalar(content: string, style: BlockScalarStyle): string {
  if (style === "literal-strip") {
    return content.replace(/\n$/, "");
  }
  if (style === "folded" || style === "folded-strip") {
    const folded = content
      .split("\n")
      .map((line) => line.trim())
      .filter((line, index, all) => line.length > 0 || (index > 0 && all[index - 1]!.length > 0))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    return folded;
  }
  return content;
}

function parseKeyedValue(
  lines: string[],
  index: number,
  keyIndent: number,
  rest: string,
): [unknown, number] {
  const blockStyle = parseBlockScalarIndicator(rest);
  if (blockStyle) {
    const [content, next] = parseBlockScalarLines(lines, index + 1, keyIndent);
    return [finalizeBlockScalar(content, blockStyle), next];
  }
  if (!rest) {
    if (index + 1 < lines.length && countIndent(lines[index + 1]!) > keyIndent) {
      const [value, next] = parseBlock(lines, index + 1, keyIndent + 2);
      return [value, next];
    }
    return [{}, index + 1];
  }
  return [parseScalar(rest), index + 1];
}

function parseBlock(lines: string[], start: number, baseIndent: number): [unknown, number] {
  if (start >= lines.length) {
    return [null, start];
  }

  const line = lines[start]!;
  const indent = countIndent(line);
  if (indent < baseIndent) {
    return [null, start];
  }

  const trimmed = line.trim();
  if (trimmed.startsWith("- ")) {
    const items: unknown[] = [];
    let i = start;
    while (i < lines.length) {
      const current = lines[i]!;
      if (countIndent(current) < baseIndent) break;
      if (!current.trim().startsWith("- ")) break;

      const afterDash = current.trim().slice(2);
      if (afterDash.includes(":")) {
        const obj: Record<string, unknown> = {};
        const [firstKey, ...firstRest] = afterDash.split(":");
        const firstVal = firstRest.join(":").trim();
        const firstKeyName = firstKey!.trim();
        if (firstVal) {
          const blockStyle = parseBlockScalarIndicator(firstVal);
          if (blockStyle) {
            const [value, next] = parseBlockScalarLines(lines, i + 1, countIndent(current));
            obj[firstKeyName] = finalizeBlockScalar(value, blockStyle);
            i = next;
          } else {
            obj[firstKeyName] = parseScalar(firstVal);
            i += 1;
          }
        } else {
          i += 1;
        }
        while (i < lines.length && countIndent(lines[i]!) > baseIndent) {
          const nested = lines[i]!;
          const nestedTrim = nested.trim();
          if (nestedTrim.startsWith("- ")) break;
          const colon = nestedTrim.indexOf(":");
          if (colon === -1) break;
          const k = nestedTrim.slice(0, colon).trim();
          const v = nestedTrim.slice(colon + 1).trim();
          const [value, next] = parseKeyedValue(lines, i, countIndent(nested), v);
          obj[k] = value;
          i = next;
        }
        items.push(obj);
      } else {
        items.push(parseScalar(afterDash));
        i += 1;
      }
    }
    return [items, i];
  }

  const obj: Record<string, unknown> = {};
  let i = start;
  while (i < lines.length) {
    const current = lines[i]!;
    if (countIndent(current) < baseIndent) break;
    const nestedTrim = current.trim();
    if (nestedTrim.startsWith("- ")) break;

    const colon = nestedTrim.indexOf(":");
    if (colon === -1) break;
    const key = nestedTrim.slice(0, colon).trim();
    const rest = nestedTrim.slice(colon + 1).trim();

    const [value, next] = parseKeyedValue(lines, i, indent, rest);
    obj[key] = value;
    i = next;
  }
  return [obj, i];
}

export function parseYaml(text: string): Record<string, unknown> {
  const lines = text.split("\n");
  const [value] = parseBlock(lines, 0, 0);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function splitFrontMatter(markdown: string): {
  frontMatter: Record<string, unknown>;
  body: string;
} {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/u.exec(markdown);
  if (!match) {
    throw new Error("Markdown missing YAML front matter");
  }
  return {
    frontMatter: parseYaml(match[1]!),
    body: match[2] ?? "",
  };
}
