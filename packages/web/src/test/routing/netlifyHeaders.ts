/** One rule of a Netlify `_headers` file: a path pattern and the headers it adds. */
export interface HeaderRule {
  readonly pattern: string;
  readonly headers: readonly (readonly [name: string, value: string])[];
}

/**
 * Parses Netlify's `_headers` format: a line starting at column 0 is a path pattern, each indented `Name: value` line
 * below it is a header of that pattern, and `#` lines are comments.
 */
export function parseNetlifyHeaders(text: string): readonly HeaderRule[] {
  const rules: { pattern: string; headers: (readonly [string, string])[] }[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      rules.push({ pattern: line.trim(), headers: [] });
      continue;
    }
    const current = rules.at(-1);
    const separator = line.indexOf(":");
    if (current === undefined || separator === -1) throw new Error(`Unexpected line in the headers file: ${line}`);
    current.headers.push([line.slice(0, separator).trim(), line.slice(separator + 1).trim()]);
  }
  return rules;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whether a Netlify pattern matches `path`: `:placeholder` is one segment, a trailing `*` is the rest of the path. */
export function matchesPattern(pattern: string, path: string): boolean {
  const source = pattern
    .split("/")
    .map((segment) => {
      if (segment === "*") return ".*";
      if (segment.startsWith(":")) return "[^/]+";
      return escapeRegExp(segment);
    })
    .join("/");
  return new RegExp(`^${source}$`).test(path);
}

/** The rules whose pattern matches `path`. */
export function matchingRules(rules: readonly HeaderRule[], path: string): readonly HeaderRule[] {
  return rules.filter((rule) => matchesPattern(rule.pattern, path));
}

/** Every value of header `name` (case-insensitive) that the matching rules add to `path`, in file order. */
export function headerValues(rules: readonly HeaderRule[], path: string, name: string): readonly string[] {
  const wanted = name.toLowerCase();
  return matchingRules(rules, path).flatMap((rule) => rule.headers.filter(([header]) => header.toLowerCase() === wanted).map(([, value]) => value));
}

/**
 * The policies a browser enforces for `path` from header `name`: Netlify joins the values of every matching rule with
 * commas, and a comma separates policies in one header.
 */
export function policies(rules: readonly HeaderRule[], path: string, name: string): readonly string[] {
  return headerValues(rules, path, name)
    .join(",")
    .split(",")
    .map((policy) => policy.trim())
    .filter((policy) => policy !== "");
}
