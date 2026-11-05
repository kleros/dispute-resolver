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
  return text.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
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

/** RPC URLs with keys in their path, query and fragment, as a deploy's carry. */
export const KEYED_ENV = {
  REACT_APP_WEB3_PROVIDER_URL: "https://mainnet.infura.io/v3/KEY-MAINNET-0001",
  REACT_APP_WEB3_XDAI_PROVIDER_URL: "https://gnosis.example-rpc.io:8545/rpc/KEY-GNOSIS-0002?token=KEY-QUERY-0003#KEY-HASH-0004",
  REACT_APP_WEB3_SEPOLIA_PROVIDER_URL: "wss://sepolia.example-rpc.io/ws/KEY-WSS-0006",
  REACT_APP_ATLAS_URI: "https://atlas.example.org/graphql",
  REACT_APP_METAEVIDENCE_URL: "https://metaevidence.example.org/api/meta-evidence",
  REACT_APP_IPFS_GATEWAY: "https://cdn.example-ipfs.io",
} as const;
