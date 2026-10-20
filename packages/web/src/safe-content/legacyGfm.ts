/**
 * Today's GitHub-flavored syntax for `SafeMarkdown` (ARCHITECTURE.md 9.2, spec §5.6). Today's react-markdown 4 parses
 * with remark-parse 5 in its default `gfm` mode; react-markdown 9 parses CommonMark only. This remark plugin rewrites
 * the CommonMark tree with remark-parse 5's own rules, which remark-gfm does not share (it links `www.` and bare e-mail
 * addresses, keeps a balanced `)` in a URL and strikes through `~single~` tildes):
 * - a literal `http://`, `https://` or `mailto:` URL becomes a link; a scheme in capitals only where an inline run
 *   starts, because remark-parse 5 looked for the lowercase schemes; `mailto:` is dropped from the label;
 * - `~~text~~` becomes strikethrough;
 * - a paragraph whose first two lines are a pipe row and an alignment row becomes a table;
 * - a list item that starts with `[ ]` or `[x]` becomes a task item;
 * - an angle autolink to `mailto:` is labelled without the scheme;
 * - bracketed text that CommonMark left as text because no definition names it loses its brackets, as remark-parse 5's
 *   reference did, but is not a link: today's link to the current page led nowhere (P-10). Footnote markers and their
 *   definitions (`[^1]`, `[^1]: text`) and a bare task marker (`- [x]`) are such text;
 * - a link never holds a link: a literal URL is read before the syntax inside it, and link syntax that CommonMark read
 *   inside a link's label or an undefined reference's (an autolink in a link's text, a link in emphasis that a literal
 *   URL takes in) is text, as remark-parse 5 read no link inside a link.
 * A character written as a backslash escape or a character reference is never syntax. The table row test, like
 * remark-parse 5's raw-source rule, reads the line as written: a pipe written as a character reference is no pipe; one
 * written as a backslash escape still makes the row. Links made here still pass through `urlTransform`, so the A11
 * allowlist applies to them.
 */

interface MarkdownPoint {
  readonly offset?: number;
}

/** The parts of an mdast node this plugin reads or writes. */
interface MarkdownNode {
  type: string;
  value?: string;
  url?: string;
  checked?: boolean | null;
  align?: TableAlign[];
  children?: MarkdownNode[];
  position?: { readonly start: MarkdownPoint; readonly end: MarkdownPoint };
}

type TableAlign = "left" | "right" | "center" | null;

/** Where a character of a text value came from: written as itself, as a backslash escape or as a character reference. */
type CharacterSource = "literal" | "backslash" | "reference";

interface Context {
  readonly source: string;
  /** Per text node, where each character came from: itself, a backslash escape or a character reference. */
  readonly escaped: WeakMap<MarkdownNode, readonly CharacterSource[]>;
  /** Per inline node, the summary of its source. */
  readonly summaries: WeakMap<MarkdownNode, Readonly<SourceSummary>>;
  /** The nodes whose content is still to be read, each with the way to read it (`readInline`). */
  readonly unread: Unread[];
}

interface Unread {
  readonly node: MarkdownNode;
  readonly reading: Reading;
}

const WHITESPACE = /\s/;
const ASCII_PUNCTUATION = /[!-/:-@[-`{-~]/;
const CHARACTER_REFERENCE = /^&(?:#\d{1,7}|#[Xx][\dA-Fa-f]{1,6}|[A-Za-z][\dA-Za-z]{1,31});/;
/** The pipe's code point, and the named character references that decode to it. */
const PIPE_CODE = 0x7c;
const PIPE_REFERENCE_NAMES = new Set(["vert", "verbar", "VerticalLine"]);
const TASK_MARKER = /^\[([\t xX])\][\t ]/;
const URL_PROTOCOLS = ["http://", "https://", "mailto:"] as const;
const MAILTO = "mailto:";
/** Characters remark-parse 5 left out of a literal URL when they end the text or precede whitespace. */
const URL_TRAILING = new Set([".", ",", ":", ";", '"', "'", ")", "]"]);
/** Inline nodes a literal URL never runs into. */
const URL_STOPS = new Set(["link", "linkReference", "image", "imageReference", "html", "break"]);
const LINE_PREFIX = new Set([" ", "\t", ">"]);
/**
 * The object replacement character: an inline node other than text in a run, and the source of a node whose source is
 * unknown (one this plugin made).
 */
const NODE_CHARACTER = "\uFFFC";

/** A character written as a backslash escape or a character reference, which is never syntax. */
function isEscaped(source: CharacterSource | undefined): boolean {
  return source === "backslash" || source === "reference";
}

function isWhitespace(character: string): boolean {
  return character !== "" && WHITESPACE.test(character);
}

function rawSource(node: MarkdownNode, context: Context): string | undefined {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  return start === undefined || end === undefined ? undefined : context.source.slice(start, end);
}

// --- Escaped characters ---------------------------------------------------------------------------------------------

/** Where the source continues after a line ending of a text value: past trailing blanks and the next line's prefix. */
function skipLineEnding(source: string, from: number, next: string): number | undefined {
  let index = from;
  while (source.charAt(index) === " " || source.charAt(index) === "\t") index++;
  if (source.charAt(index) !== "\n") return undefined;
  index++;
  while (LINE_PREFIX.has(source.charAt(index)) && source.charAt(index) !== next) index++;
  return index;
}

/** How many characters of `value` a character reference decoded to, judged by where the source resumes. */
function referenceLength(value: string, at: number, source: string, resume: number): number | undefined {
  for (const length of [1, 2]) {
    const following = value.charAt(at + length);
    if (following === "" || following === "\n" || following === source.charAt(resume) || source.charAt(resume) === "\\" || source.charAt(resume) === "&") {
      return length;
    }
  }
  return undefined;
}

interface AlignedCharacters {
  /** How many characters of the value this step covers, and where they came from. */
  readonly count: number;
  readonly source: CharacterSource;
  /** Where the source continues. */
  readonly next: number;
}

/** Matches the source at `at` to the value's characters at `index`: a line ending, an escape, a reference or itself. */
function alignCharacter(value: string, index: number, source: string, at: number): AlignedCharacters | undefined {
  const character = value.charAt(index);
  if (character === "\n") {
    const next = skipLineEnding(source, at, value.charAt(index + 1));
    return next === undefined ? undefined : { count: 1, source: "literal", next };
  }
  if (source.charAt(at) === "\\" && ASCII_PUNCTUATION.test(character) && source.charAt(at + 1) === character) {
    return { count: 1, source: "backslash", next: at + 2 };
  }
  const reference = source.charAt(at) === "&" ? CHARACTER_REFERENCE.exec(source.slice(at, at + 40)) : null;
  const decoded = reference === null ? undefined : referenceLength(value, index, source, at + reference[0].length);
  if (reference !== null && decoded !== undefined) return { count: decoded, source: "reference", next: at + reference[0].length };
  return source.charAt(at) === character ? { count: 1, source: "literal", next: at + 1 } : undefined;
}

/** Aligns a text value with its source and marks where each character came from; `undefined` when they do not align. */
function alignEscapes(value: string, source: string, start: number): CharacterSource[] | undefined {
  const sources: CharacterSource[] = [];
  let at = start;
  while (sources.length < value.length) {
    const step = alignCharacter(value, sources.length, source, at);
    if (step === undefined) return undefined;
    for (let count = 0; count < step.count; count++) sources.push(step.source);
    at = step.next;
  }
  return sources;
}

/** Whether a character reference (`&…;`) decodes to a pipe. Names are case-sensitive: `&Vert;` is `‖`. */
function isPipeReference(reference: string): boolean {
  const name = reference.slice(1, -1);
  if (name.startsWith("#x") || name.startsWith("#X")) return Number.parseInt(name.slice(2), 16) === PIPE_CODE;
  if (name.startsWith("#")) return Number.parseInt(name.slice(1), 10) === PIPE_CODE;
  return PIPE_REFERENCE_NAMES.has(name);
}

interface SourceStep {
  /** Where the pipe this step writes came from; `undefined` when it writes no pipe. */
  readonly pipe: CharacterSource | undefined;
  readonly next: number;
}

/** Reads one character of a text's source as written: a backslash escape, a character reference or itself. */
function readSourceCharacter(raw: string, at: number): SourceStep {
  const character = raw.charAt(at);
  if (character === "\\" && ASCII_PUNCTUATION.test(raw.charAt(at + 1))) {
    return { pipe: raw.charAt(at + 1) === "|" ? "backslash" : undefined, next: at + 2 };
  }
  const reference = character === "&" ? CHARACTER_REFERENCE.exec(raw.slice(at, at + 40)) : null;
  if (reference !== null) return { pipe: isPipeReference(reference[0]) ? "reference" : undefined, next: at + reference[0].length };
  return { pipe: character === "|" ? "literal" : undefined, next: at + 1 };
}

/** Where each pipe of a text's source came from, in the order they are written. */
function pipeSources(raw: string): CharacterSource[] {
  const pipes: CharacterSource[] = [];
  let at = 0;
  while (at < raw.length) {
    const step = readSourceCharacter(raw, at);
    if (step.pipe !== undefined) pipes.push(step.pipe);
    at = step.next;
  }
  return pipes;
}

/**
 * A text node that cannot be aligned with its source, as backslash escapes: never syntax. Its pipes keep where they
 * came from, read from the source in order, since a text holds its source's pipes in the order they are written: a
 * pipe written as a character reference stays a reference, so the row test still reads the line as written (MC-12).
 * When the pipes of the value and the source do not match, each pipe counts as a reference; without a source, none does.
 */
function unalignedSources(value: string, raw: string | undefined): CharacterSource[] {
  const sources = new Array<CharacterSource>(value.length).fill("backslash");
  if (raw === undefined) return sources;
  const written = pipeSources(raw);
  const pipes: number[] = [];
  for (let index = value.indexOf("|"); index !== -1; index = value.indexOf("|", index + 1)) pipes.push(index);
  pipes.forEach((index, order) => {
    if (written.length !== pipes.length || written[order] === "reference") sources[index] = "reference";
  });
  return sources;
}

/**
 * Where each character of a text node came from. A node that cannot be aligned with its source counts as backslash
 * escapes, except a pipe written as a character reference (`unalignedSources`): never syntax, yet a pipe written as
 * itself or as a backslash escape still counts for the row test.
 */
function escapesOf(node: MarkdownNode, context: Context): readonly CharacterSource[] {
  const known = context.escaped.get(node);
  if (known !== undefined) return known;
  const value = node.value ?? "";
  const raw = rawSource(node, context);
  const start = node.position?.start.offset;
  let escaped: readonly CharacterSource[];
  if (raw === value) escaped = new Array<CharacterSource>(value.length).fill("literal");
  else escaped = (start === undefined ? undefined : alignEscapes(value, context.source, start)) ?? unalignedSources(value, raw);
  context.escaped.set(node, escaped);
  return escaped;
}

function textNode(value: string, escaped: readonly CharacterSource[], context: Context): MarkdownNode {
  const node: MarkdownNode = { type: "text", value };
  context.escaped.set(node, escaped);
  return node;
}

/** The characters `from` to `to` of a text node, as a new text node. */
function sliceText(node: MarkdownNode, from: number, to: number, context: Context): MarkdownNode {
  return textNode((node.value ?? "").slice(from, to), escapesOf(node, context).slice(from, to), context);
}

// --- Source summaries -----------------------------------------------------------------------------------------------

/**
 * What the inline syntax reads in an inline node's markdown source, kept so that the source is not read again: a run
 * holds each node other than text as one character standing for this summary. A node's summary is composed from its
 * children's, so each source character is read once however deeply the nodes nest.
 */
interface SourceSummary {
  /** Whether the source holds whitespace or `<`, either of which ends a literal URL. */
  breaks: boolean;
  hasAt: boolean;
  /** Whether the source holds a `[` that no backslash precedes, which remark-parse 5 counted as a bracket. */
  opens: boolean;
  /**
   * The source's brackets as remark-parse 5 counted them, none after a backslash: how many `]` close a `[` opened
   * before the source, and how many `[` the source leaves open.
   */
  closes: number;
  unclosed: number;
  /** The bracket depth at the end of the source (`(` and `[` open, `)` and `]` close) and the lowest it reaches. */
  depth: number;
  lowest: number;
  first: string;
  last: string;
  /** Whether every character is whitespace. */
  blank: boolean;
}

function emptySummary(): SourceSummary {
  return { breaks: false, hasAt: false, opens: false, closes: 0, unclosed: 0, depth: 0, lowest: 0, first: "", last: "", blank: true };
}

function bracketStep(character: string): number {
  if (character === "(" || character === "[") return 1;
  return character === ")" || character === "]" ? -1 : 0;
}

/** Adds the characters `from` to `to` of `text` to a summary. */
function addCharacters(summary: SourceSummary, text: string, from: number, to: number): void {
  let escaping = false;
  for (let index = from; index < to; index++) {
    const character = text.charAt(index);
    const blank = isWhitespace(character);
    summary.breaks ||= blank || character === "<";
    summary.hasAt ||= character === "@";
    if (!escaping) addBracket(summary, character);
    escaping = !escaping && character === "\\";
    summary.depth += bracketStep(character);
    summary.lowest = Math.min(summary.lowest, summary.depth);
    summary.blank &&= blank;
    if (summary.first === "") summary.first = character;
    summary.last = character;
  }
}

/** Counts a bracket of the source that no backslash precedes. */
function addBracket(summary: SourceSummary, character: string): void {
  if (character === "[") {
    summary.opens = true;
    summary.unclosed++;
  } else if (character === "]" && summary.unclosed > 0) {
    summary.unclosed--;
  } else if (character === "]") {
    summary.closes++;
  }
}

/** Adds the summary of the source that follows. */
function addSummary(summary: SourceSummary, next: Readonly<SourceSummary>): void {
  summary.breaks ||= next.breaks;
  summary.hasAt ||= next.hasAt;
  summary.opens ||= next.opens;
  const paired = Math.min(summary.unclosed, next.closes);
  summary.closes += next.closes - paired;
  summary.unclosed += next.unclosed - paired;
  summary.lowest = Math.min(summary.lowest, summary.depth + next.lowest);
  summary.depth += next.depth;
  summary.blank &&= next.blank;
  if (summary.first === "") summary.first = next.first;
  if (next.last !== "") summary.last = next.last;
}

/** Where a child other than text lies in its parent's source after `cursor`; text counts as the parent's own source. */
function childSpan(child: MarkdownNode, cursor: number, end: number): readonly [from: number, to: number] | undefined {
  const from = child.position?.start.offset;
  const to = child.position?.end.offset;
  if (child.type === "text" || from === undefined || to === undefined || from < cursor || to > end || from >= to) return undefined;
  return [from, to];
}

/**
 * The summary of an inline node's source, `NODE_CHARACTER` when the source is unknown. It is composed from the source
 * positions of the node's children, so the run around the node asks for it before `readInline` replaces them.
 */
function summaryOf(node: MarkdownNode, context: Context): Readonly<SourceSummary> {
  const known = context.summaries.get(node);
  if (known !== undefined) return known;
  const summary = emptySummary();
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (start === undefined || end === undefined || start >= end) {
    addCharacters(summary, NODE_CHARACTER, 0, NODE_CHARACTER.length);
  } else {
    let cursor = start;
    for (const child of node.children ?? []) {
      const span = childSpan(child, cursor, end);
      if (span === undefined) continue;
      addCharacters(summary, context.source, cursor, span[0]);
      addSummary(summary, summaryOf(child, context));
      cursor = span[1];
    }
    addCharacters(summary, context.source, cursor, end);
  }
  context.summaries.set(node, summary);
  return summary;
}

/** A node's markdown source; `NODE_CHARACTER` when it is unknown. */
function nodeSource(node: MarkdownNode, context: Context): string {
  const raw = rawSource(node, context);
  return raw === undefined || raw === "" ? NODE_CHARACTER : raw;
}

// --- Inline runs ----------------------------------------------------------------------------------------------------

type SegmentKind = "text" | "inline" | "stop";

interface Segment {
  readonly node: MarkdownNode;
  readonly start: number;
  readonly end: number;
  readonly kind: SegmentKind;
  /** For a node other than text, which the run holds as one `NODE_CHARACTER`: the summary of its source. */
  readonly summary?: Readonly<SourceSummary>;
}

/** A run's characters: text values, and one `NODE_CHARACTER` for each other node. */
interface RunCharacters {
  readonly text: string;
  readonly segments: readonly Segment[];
  /** Per character, the index of its segment. */
  readonly segmentOf: readonly number[];
  /** Per character, whether it is a literal character of a text node, which alone can be syntax. */
  readonly literal: readonly boolean[];
}

/**
 * A parent's inline children as one string with per-character tables computed once. A node other than text is one
 * character that stands for its source's summary, so a nesting level reads only its own characters and scanning stays
 * linear in the length of the content however deeply its nodes nest.
 */
interface Run extends RunCharacters {
  /**
   * Per character, the next index that ends any literal URL: whitespace, `<`, or a node whose source holds either or
   * that a URL never runs into.
   */
  readonly nextBreak: readonly number[];
  /** Per character, the index of the next `@` or of the next node whose source holds one. */
  readonly nextAt: readonly number[];
  /** The ascending indexes of each `~~` that can close a strikethrough: literal and not preceded by whitespace. */
  readonly closers: readonly number[];
  /** Per literal `[`, the index of the literal `]` that closes it (`pairBrackets`), or -1 when none does. */
  readonly bracketClose: readonly number[];
  /** Per character, the index of the next literal `[` or of the next node whose source holds one (`opens`). */
  readonly nextOpen: readonly number[];
}

interface Construct {
  readonly nodes: readonly MarkdownNode[];
  readonly end: number;
}

function segmentKind(node: MarkdownNode): SegmentKind {
  if (node.type === "text") return "text";
  return URL_STOPS.has(node.type) ? "stop" : "inline";
}

function buildSegments(children: readonly MarkdownNode[], context: Context): { text: string; segments: Segment[] } {
  const segments: Segment[] = [];
  let text = "";
  for (const node of children) {
    const kind = segmentKind(node);
    const start = text.length;
    if (kind === "text") {
      text += node.value ?? "";
      segments.push({ node, start, end: text.length, kind });
    } else {
      text += NODE_CHARACTER;
      segments.push({ node, start, end: text.length, kind, summary: summaryOf(node, context) });
    }
  }
  return { text, segments };
}

function segmentAt(run: RunCharacters, index: number): Segment | undefined {
  const position = run.segmentOf[index];
  return position === undefined ? undefined : run.segments[position];
}

/** The summary that the character at `index` stands for; `undefined` for a character of a text node. */
function summaryAt(run: RunCharacters, index: number): Readonly<SourceSummary> | undefined {
  return segmentAt(run, index)?.summary;
}

/** Whether the source at `index` starts with whitespace. */
function startsBlank(run: RunCharacters, index: number): boolean {
  return isWhitespace(summaryAt(run, index)?.first ?? run.text.charAt(index));
}

/** Whether the source at `index` ends with whitespace. */
function endsBlank(run: RunCharacters, index: number): boolean {
  return isWhitespace(summaryAt(run, index)?.last ?? run.text.charAt(index));
}

/** Whether the source at `index` is whitespace only. */
function isBlankAt(run: RunCharacters, index: number): boolean {
  const summary = summaryAt(run, index);
  return summary === undefined ? isWhitespace(run.text.charAt(index)) : summary.blank;
}

/** Whether a literal URL ends at a character: whitespace, `<`, or a node that holds either or that it never enters. */
function breaksUrl(segment: Segment | undefined, character: string): boolean {
  if (segment?.summary === undefined) return isWhitespace(character) || character === "<";
  return segment.kind === "stop" || segment.summary.breaks;
}

function holdsAt(segment: Segment | undefined, character: string): boolean {
  return segment?.summary === undefined ? character === "@" : segment.summary.hasAt;
}

function buildRun(children: readonly MarkdownNode[], context: Context): Run {
  const { text, segments } = buildSegments(children, context);
  const segmentOf: number[] = [];
  const literal: boolean[] = [];
  segments.forEach((segment, position) => {
    const escaped = segment.kind === "text" ? escapesOf(segment.node, context) : [];
    for (let index = segment.start; index < segment.end; index++) {
      segmentOf.push(position);
      literal.push(segment.kind === "text" && escaped[index - segment.start] === "literal");
    }
  });
  const characters: RunCharacters = { text, segments, segmentOf, literal };
  const nextBreak: number[] = new Array<number>(text.length + 1).fill(text.length);
  const nextAt: number[] = new Array<number>(text.length + 1).fill(text.length);
  for (let index = text.length - 1; index >= 0; index--) {
    const segment = segmentAt(characters, index);
    const character = text.charAt(index);
    nextBreak[index] = breaksUrl(segment, character) ? index : (nextBreak[index + 1] ?? text.length);
    nextAt[index] = holdsAt(segment, character) ? index : (nextAt[index + 1] ?? text.length);
  }
  const closers: number[] = [];
  for (let index = 1; index + 1 < text.length; index++) {
    if (isTildes(text, literal, index) && !endsBlank(characters, index - 1)) closers.push(index);
  }
  return { ...characters, nextBreak, nextAt, closers, ...pairBrackets(characters) };
}

/** Brackets still open while a run is paired: a literal `[` at `index`, or `count` that a node's source left open. */
interface OpenBrackets {
  /** The literal `[`'s index, or -1 for brackets in a node's source, which close no reference. */
  readonly index: number;
  count: number;
}

/**
 * Closes `count` open brackets, innermost first, and returns the `index` of the last one closed: -1 when none was open
 * or when it was in a node's source.
 */
function closeBrackets(open: OpenBrackets[], count: number): number {
  let left = count;
  let closed = -1;
  for (let top = open.at(-1); left > 0 && top !== undefined; top = open.at(-1)) {
    const taken = Math.min(left, top.count);
    top.count -= taken;
    left -= taken;
    closed = top.index;
    if (top.count === 0) open.pop();
  }
  return closed;
}

/**
 * Pairs a run's brackets in one pass as remark-parse 5 counted them in the source: the literal ones, and those in the
 * source of each node other than text (its summary), none after a backslash. A literal `[` pairs only with a literal
 * `]`, but a bracket in a node's source still opens or closes, and so decides which `]` closes a `[`.
 */
function pairBrackets(run: RunCharacters) {
  const { text, literal } = run;
  const bracketClose: number[] = new Array<number>(text.length).fill(-1);
  const open: OpenBrackets[] = [];
  for (let index = 0; index < text.length; index++) {
    const character = text.charAt(index);
    const summary = summaryAt(run, index);
    if (summary !== undefined) {
      closeBrackets(open, summary.closes);
      if (summary.unclosed > 0) open.push({ index: -1, count: summary.unclosed });
    } else if (literal[index] === true && character === "[") {
      open.push({ index, count: 1 });
    } else if (literal[index] === true && character === "]") {
      const opener = closeBrackets(open, 1);
      if (opener >= 0) bracketClose[opener] = index;
    }
  }
  return { bracketClose, nextOpen: nextOpens(run) };
}

/** Per character of a run, the index of the next `[` in the source (`opensAt`). */
function nextOpens(run: RunCharacters): number[] {
  const nextOpen: number[] = new Array<number>(run.text.length + 1).fill(run.text.length);
  for (let index = run.text.length - 1; index >= 0; index--) {
    nextOpen[index] = opensAt(run, index) ? index : (nextOpen[index + 1] ?? run.text.length);
  }
  return nextOpen;
}

/** Whether the source at `index` holds a `[`: a literal one, or one in the source of a node other than text. */
function opensAt(run: RunCharacters, index: number): boolean {
  const summary = summaryAt(run, index);
  return summary === undefined ? run.literal[index] === true && run.text.charAt(index) === "[" : summary.opens;
}

function isLiteralCharacter(run: Run, index: number, character: string): boolean {
  return run.literal[index] === true && run.text.charAt(index) === character;
}

function isTildes(text: string, literal: readonly boolean[], index: number): boolean {
  return text.startsWith("~~", index) && literal[index] === true && literal[index + 1] === true;
}

/** The segments that overlap `from` to `to`. */
function segmentsIn(run: RunCharacters, from: number, to: number): Segment[] {
  const found: Segment[] = [];
  for (let position = run.segmentOf[from] ?? run.segments.length; position < run.segments.length; position++) {
    const segment = run.segments[position];
    if (segment === undefined || segment.start >= to) break;
    found.push(segment);
  }
  return found;
}

/** The nodes covering `from` to `to` of a run; text nodes are cut, other nodes are never split by the callers. */
function nodesIn(run: Run, from: number, to: number, context: Context): MarkdownNode[] {
  return segmentsIn(run, from, to).flatMap((segment) => {
    if (segment.kind !== "text") return [segment.node];
    const piece = sliceText(segment.node, Math.max(from, segment.start) - segment.start, Math.min(to, segment.end) - segment.start, context);
    return piece.value === "" ? [] : [piece];
  });
}

/** The characters `from` to `to` of a run as markdown: text as it reads, any other node as its source. */
function sourceText(run: Run, from: number, to: number, context: Context): string {
  return segmentsIn(run, from, to)
    .map((segment) => (segment.kind === "text" ? run.text.slice(Math.max(from, segment.start), Math.min(to, segment.end)) : nodeSource(segment.node, context)))
    .join("");
}

/**
 * remark-parse 5's literal URL: from the scheme to whitespace, `<`, an unbalanced `)` or `]`, or punctuation that ends
 * the text or precedes whitespace. A URL that would end inside an inline node (emphasis, code) ends before it.
 */
function urlEnd(run: Run, from: number): number {
  const limit = run.nextBreak[from] ?? run.text.length;
  let depth = 0;
  for (let index = from; index < limit; index++) {
    const summary = summaryAt(run, index);
    const character = run.text.charAt(index);
    const last = summary?.last ?? character;
    if (URL_TRAILING.has(last) && (index + 1 === run.text.length || startsBlank(run, index + 1))) return index;
    if (depth + (summary?.lowest ?? bracketStep(character)) < 0) return index;
    depth += summary?.depth ?? bracketStep(character);
  }
  return limit;
}

/**
 * What one scan has learnt: no `mailto:` that starts before `mailtoEnd` can be a link. A `mailto:` inside a literal URL
 * without `@` ends where that URL ends or earlier (the same breaks, an unbalanced bracket no later), so it has no `@`
 * either and is not walked again: scanning stays linear.
 */
interface ScanState {
  mailtoEnd: number;
}

/**
 * How a run's inline syntax is read, as remark-parse 5 read it where the run sits:
 * - `links`: literal URLs, undefined references and strikethrough, as in a block's text;
 * - `anchor`: in a link's label, or in the label of an undefined reference, which remark-parse 5 read as a link's and
 *   which renders as text: strikethrough only, and link syntax that CommonMark read there (an autolink, or a link or
 *   reference in a node that a literal URL took in) is text, since remark-parse 5 read no link inside a link.
 */
type Reading = "links" | "anchor";

/** remark-parse 5's literal URL, which it found in the source: its scheme is literal characters of one text node. */
function matchUrl(run: Run, index: number, runStart: boolean, context: Context, state: ScanState): Construct | undefined {
  const segment = segmentAt(run, index);
  if (segment === undefined) return undefined;
  const head = run.text.slice(index, index + 8);
  const protocol = URL_PROTOCOLS.find((candidate) => (runStart ? head.toLowerCase() : head).startsWith(candidate));
  if (protocol === undefined || segment.end < index + protocol.length) return undefined;
  if (run.literal.slice(index, index + protocol.length).includes(false)) return undefined;
  const start = index + protocol.length;
  const isMail = protocol === MAILTO;
  const at = run.nextAt[start] ?? run.text.length;
  if (isMail && (index < state.mailtoEnd || at >= (run.nextBreak[start] ?? run.text.length))) return undefined;
  const end = urlEnd(run, start);
  if (end === start) return undefined;
  if (isMail && at >= end) {
    state.mailtoEnd = end;
    return undefined;
  }
  const label = nodesIn(run, isMail ? start : index, end, context);
  const node: MarkdownNode = { type: "link", url: sourceText(run, index, end, context), children: scan(label, context, "anchor") };
  return { nodes: [node], end };
}

/** The first index in an ascending list that is at least `minimum`. */
function firstFrom(sorted: readonly number[], minimum: number): number | undefined {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((sorted[middle] ?? minimum) < minimum) low = middle + 1;
    else high = middle;
  }
  return sorted[low];
}

/** remark-parse 5's strikethrough: `~~`, a non-blank character, and the next `~~` not preceded by whitespace. */
function matchStrike(run: Run, index: number, reading: Reading, context: Context): Construct | undefined {
  if (!isTildes(run.text, run.literal, index) || index + 2 >= run.text.length || startsBlank(run, index + 2)) return undefined;
  const close = isTildes(run.text, run.literal, index + 2) ? index + 2 : firstFrom(run.closers, index + 3);
  if (close === undefined) return undefined;
  const node: MarkdownNode = { type: "delete", children: scan(nodesIn(run, index + 2, close, context), context, reading) };
  return { nodes: [node], end: close + 2 };
}

/** What follows a reference's `]` for remark-parse 5: nothing, an unclosed `[`, `[]`, or `[identifier]`. */
type ReferenceSuffix = "none" | "unclosed" | "collapsed" | "full";

/**
 * Where remark-parse 5's reference ends after its `]`: past whitespace, `[`, an identifier without brackets (in its
 * nodes' source too) and `]`. An identifier that never closes still took the whitespace and the `[`.
 */
function referenceSuffix(run: Run, close: number): readonly [end: number, suffix: ReferenceSuffix] {
  let index = close + 1;
  while (isBlankAt(run, index)) index++;
  if (!isLiteralCharacter(run, index, "[")) return [close + 1, "none"];
  const opener = index;
  for (index = opener + 1; index < run.text.length; index++) {
    const summary = summaryAt(run, index);
    if (summary !== undefined && (summary.opens || summary.closes > 0)) break;
    if (isLiteralCharacter(run, index, "]")) return [index + 1, index === opener + 1 ? "collapsed" : "full"];
    if (isLiteralCharacter(run, index, "[")) break;
  }
  return [opener + 1, "unclosed"];
}

/**
 * Bracketed text that CommonMark left as text (no definition names it), read with remark-parse 5's reference rule: a
 * `[` not preceded by `!`, its closing `]`, and an optional `[identifier]` after optional whitespace. Without anything
 * after it the label must not be empty, and only a non-empty identifier allows brackets in the label, a `[` in the
 * source of a node in the label among them, since remark-parse 5 read the label's source. Today it became a link to
 * the current page; it now renders its label's text without the brackets and without a link (P-10). The label is read
 * as link text was, so nothing in it becomes a link.
 */
function matchReference(run: Run, index: number, context: Context): Construct | undefined {
  if (!isLiteralCharacter(run, index, "[") || isLiteralCharacter(run, index - 1, "!")) return undefined;
  const close = run.bracketClose[index] ?? -1;
  if (close < 0) return undefined;
  const [end, suffix] = referenceSuffix(run, close);
  const bracketed = (run.nextOpen[index + 1] ?? run.text.length) < close;
  if ((suffix !== "full" && bracketed) || (suffix === "none" && close === index + 1)) return undefined;
  return { nodes: scan(nodesIn(run, index + 1, close, context), context, "anchor"), end };
}

/**
 * Turns literal URLs and undefined references (in the `links` reading) and strikethrough among inline siblings into
 * nodes, left to right, and queues the content of each node it keeps to be read in the way of the construct that holds
 * the node (`readInline`). The nodes are gathered in pieces and joined once: a run can hold more nodes than a function
 * call takes arguments.
 */
function scan(children: MarkdownNode[], context: Context, reading: Reading): MarkdownNode[] {
  const run = buildRun(children, context);
  const state: ScanState = { mailtoEnd: 0 };
  const pieces: (readonly MarkdownNode[])[] = [];
  let emitted = 0;
  let runStart = 0;
  let index = 0;
  while (index < run.text.length) {
    const segment = segmentAt(run, index);
    if (segment !== undefined && segment.kind !== "text") {
      index = runStart = segment.end;
      continue;
    }
    const construct =
      reading === "links"
        ? (matchUrl(run, index, index === runStart, context, state) ?? matchStrike(run, index, reading, context) ?? matchReference(run, index, context))
        : matchStrike(run, index, reading, context);
    if (construct === undefined) {
      index++;
      continue;
    }
    pieces.push(readInside(nodesIn(run, emitted, index, context), context, reading), construct.nodes);
    index = emitted = runStart = construct.end;
  }
  if (emitted === 0) return readInside(children, context, reading);
  pieces.push(readInside(nodesIn(run, emitted, run.text.length, context), context, reading));
  return pieces.flat();
}

/** remark-parse 5 labels `<mailto:a@b.co>` as `a@b.co`; CommonMark keeps the scheme. */
function relabelMailAutolink(link: MarkdownNode, context: Context): void {
  const [label] = link.children ?? [];
  const url = link.url ?? "";
  if (link.children?.length !== 1 || label?.type !== "text" || label.value !== url || !url.toLowerCase().startsWith(MAILTO)) return;
  if (rawSource(link, context)?.startsWith("<") !== true) return;
  link.children = [sliceText(label, MAILTO.length, url.length, context)];
}

/** Source shown as it is written, which is never syntax. */
function sourceNode(from: number, to: number, context: Context): MarkdownNode {
  const value = context.source.slice(from, to);
  return textNode(value, new Array<CharacterSource>(value.length).fill("backslash"), context);
}

/**
 * A link that CommonMark read inside a link's label, as text: its label's content, read in the label's way, between its
 * source before and after the label (`[` and `](url)`, `<` and `>`). A link without a label is its source.
 */
function unlink(link: MarkdownNode, context: Context): MarkdownNode[] {
  const children = link.children ?? [];
  const start = link.position?.start.offset;
  const end = link.position?.end.offset;
  const from = children.length === 0 ? end : children[0]?.position?.start.offset;
  const to = children.length === 0 ? end : children.at(-1)?.position?.end.offset;
  const content = scan(children, context, "anchor");
  if (start === undefined || end === undefined || from === undefined || to === undefined) return content;
  return [sourceNode(start, from, context), ...content, sourceNode(to, end, context)].filter((node) => node.value !== "");
}

/**
 * The nodes that a run keeps, each with its content queued to be read once, in the run's way; a link's label in the
 * `anchor` way. Inside a link's label or an undefined reference's, a link is text.
 */
function readInside(nodes: readonly MarkdownNode[], context: Context, reading: Reading): MarkdownNode[] {
  return nodes.flatMap((node) => {
    if (node.children === undefined) return [node];
    const isLink = node.type === "link" || node.type === "linkReference";
    if (isLink && reading === "anchor") return unlink(node, context);
    if (node.type === "link") relabelMailAutolink(node, context);
    context.unread.push({ node, reading: isLink ? "anchor" : reading });
    return [node];
  });
}

/**
 * Reads a block's inline content: the block's own run first, then the content of each node a run keeps, so that the
 * outer syntax is read first, as remark-parse 5 read it. A node's summary is composed before its children are replaced,
 * because the run around it is built first. The queue, rather than recursion, keeps deep nesting off the call stack.
 */
function readInline(block: MarkdownNode, context: Context): void {
  context.unread.push({ node: block, reading: "links" });
  let next = context.unread.pop();
  while (next !== undefined) {
    next.node.children = scan(next.node.children ?? [], context, next.reading);
    next = context.unread.pop();
  }
}

// --- Tables ---------------------------------------------------------------------------------------------------------

interface Line {
  readonly nodes: MarkdownNode[];
  /** The hard break that ended the line, if any. */
  readonly ending?: MarkdownNode;
}

/** A text node cut at its line endings: the pieces of each line, empty pieces left out. */
function textLines(node: MarkdownNode, context: Context): MarkdownNode[][] {
  const value = node.value ?? "";
  const lines: MarkdownNode[][] = [];
  let from = 0;
  for (let newline = value.indexOf("\n"); newline !== -1; newline = value.indexOf("\n", from)) {
    lines.push(newline > from ? [sliceText(node, from, newline, context)] : []);
    from = newline + 1;
  }
  if (from === 0) lines.push([node]);
  else lines.push(from < value.length ? [sliceText(node, from, value.length, context)] : []);
  return lines;
}

/** A paragraph's inline children cut into its source lines; `undefined` when an inline node spans lines. */
function splitLines(children: readonly MarkdownNode[], context: Context): Line[] | undefined {
  const lines: Line[] = [];
  let nodes: MarkdownNode[] = [];
  for (const node of children) {
    if (node.type === "break") {
      lines.push({ nodes, ending: node });
      nodes = [];
    } else if (node.type === "text") {
      const [first = [], ...others] = textLines(node, context);
      nodes.push(...first);
      for (const pieces of others) {
        lines.push({ nodes });
        nodes = pieces;
      }
    } else if (rawSource(node, context)?.includes("\n") === true) {
      return undefined;
    } else {
      nodes.push(node);
    }
  }
  lines.push({ nodes });
  return lines;
}

/** A text node's value with each character decoded from a character reference as `NODE_CHARACTER`. */
function withoutReferences(node: MarkdownNode, context: Context): string {
  const value = node.value ?? "";
  const sources = escapesOf(node, context);
  if (!sources.includes("reference")) return value;
  let text = "";
  for (let index = 0; index < value.length; index++) text += sources[index] === "reference" ? NODE_CHARACTER : value.charAt(index);
  return text;
}

/** A line as remark-parse 5's row test read it: references are not their characters, other nodes are their source. */
function rowText(line: Line, context: Context): string {
  return line.nodes.map((node) => (node.type === "text" ? withoutReferences(node, context) : (rawSource(node, context) ?? NODE_CHARACTER))).join("");
}

/**
 * remark-parse 5 took a line as a table row when its source has a pipe after its first character, so a pipe written as
 * a character reference makes no row and one written as a backslash escape does.
 */
function isRow(line: Line, context: Context): boolean {
  return rowText(line, context).includes("|", 1);
}

/** An alignment row being read. It is changed in place, so a row of any width is read in linear time. */
interface AlignmentRow {
  /** The alignments of the columns closed so far. */
  readonly align: TableAlign[];
  /** The column being read; `false` before its first dash or colon. */
  alignment: TableAlign | false;
  hasDash: boolean;
  first: boolean;
}

/** A pipe of the alignment row closes the column being read; an empty column is allowed only before the first pipe. */
function closeColumn(row: AlignmentRow): boolean {
  if (row.alignment === false && !row.first) return false;
  if (row.alignment !== false) row.align.push(row.alignment);
  row.alignment = false;
  row.hasDash = false;
  row.first = false;
  return true;
}

/** Reads one character of remark-parse 5's alignment row; `false` when the row is not one. */
function readAlignment(row: AlignmentRow, character: string): boolean {
  if (character === "|") return closeColumn(row);
  if (character === "-") {
    row.hasDash = true;
    if (row.alignment === false) row.alignment = null;
  } else if (character === ":") {
    row.alignment = colonAlignment(row);
  } else {
    return isWhitespace(character);
  }
  return true;
}

function colonAlignment({ alignment, hasDash }: AlignmentRow): TableAlign {
  if (alignment === "left") return "center";
  return hasDash && alignment === null ? "right" : "left";
}

/**
 * remark-parse 5's alignment row: pipes, dashes, colons and blanks, no empty column between two pipes. It read the
 * row's source, so an escaped character or a character reference is none of these.
 */
function parseAlignment(line: Line, context: Context): TableAlign[] | undefined {
  const row: AlignmentRow = { align: [], alignment: false, hasDash: false, first: true };
  for (const node of line.nodes) {
    if (node.type !== "text") return undefined;
    const value = node.value ?? "";
    const escaped = escapesOf(node, context);
    for (let index = 0; index < value.length; index++) {
      if (isEscaped(escaped[index]) || !readAlignment(row, value.charAt(index))) return undefined;
    }
  }
  if (row.alignment !== false) row.align.push(row.alignment);
  return row.align.length === 0 ? undefined : row.align;
}

function isBlank(nodes: readonly MarkdownNode[]): boolean {
  return nodes.every((node) => node.type === "text" && (node.value ?? "").trim() === "");
}

function trimCell(nodes: MarkdownNode[], context: Context): MarkdownNode[] {
  const cell = [...nodes];
  const head = cell[0];
  if (head?.type === "text") {
    const value = head.value ?? "";
    cell[0] = sliceText(head, value.length - value.trimStart().length, value.length, context);
  }
  const tail = cell.at(-1);
  if (tail?.type === "text") cell[cell.length - 1] = sliceText(tail, 0, (tail.value ?? "").trimEnd().length, context);
  return cell.filter((node) => node.type !== "text" || node.value !== "");
}

/** A row's cells: split at literal pipes, without the leading pipe and an empty cell after the trailing one. */
function rowCells(line: Line, context: Context): MarkdownNode[][] {
  const cells: MarkdownNode[][] = [];
  let cell: MarkdownNode[] = [];
  for (const node of line.nodes) {
    if (node.type !== "text") {
      cell.push(node);
      continue;
    }
    const value = node.value ?? "";
    const escaped = escapesOf(node, context);
    let from = 0;
    for (let index = 0; index < value.length; index++) {
      if (value.charAt(index) !== "|" || isEscaped(escaped[index])) continue;
      cell.push(sliceText(node, from, index, context));
      cells.push(cell);
      cell = [];
      from = index + 1;
    }
    cell.push(sliceText(node, from, value.length, context));
  }
  cells.push(cell);
  if (cells.length > 1 && isBlank(cells[0] ?? [])) cells.shift();
  if (cells.length > 1 && isBlank(cells.at(-1) ?? [])) cells.pop();
  return cells.map((nodes) => trimCell(nodes, context));
}

function joinLines(lines: readonly Line[], context: Context): MarkdownNode[] {
  return lines.flatMap((line, index) => {
    if (index === lines.length - 1) return line.nodes;
    return [...line.nodes, line.ending ?? textNode("\n", ["literal"], context)];
  });
}

/** A paragraph that starts with a table, as the table and the paragraph of the lines after it. */
function splitTable(paragraph: MarkdownNode, context: Context): MarkdownNode[] {
  const lines = splitLines(paragraph.children ?? [], context);
  const [header, delimiter] = lines ?? [];
  if (lines === undefined || header === undefined || delimiter === undefined) return [paragraph];
  if (!isRow(header, context) || !isRow(delimiter, context)) return [paragraph];
  const align = parseAlignment(delimiter, context);
  if (align === undefined) return [paragraph];
  let end = 2;
  while (end < lines.length && isRow(lines[end] ?? { nodes: [] }, context)) end++;
  const rows = [header, ...lines.slice(2, end)].map((line) => rowCells(line, context));
  const columns = rows.reduce((widest, cells) => Math.max(widest, cells.length), align.length);
  const table: MarkdownNode = {
    type: "table",
    align: Array.from({ length: columns }, (_, index) => align[index] ?? null),
    children: rows.map((cells) => ({ type: "tableRow", children: cells.map((cell) => ({ type: "tableCell", children: cell })) })),
  };
  const rest = lines.slice(end);
  return rest.length === 0 ? [table] : [table, { type: "paragraph", children: joinLines(rest, context) }];
}

// --- Blocks ---------------------------------------------------------------------------------------------------------

/** remark-parse 5's task item: `[ ]`, `[x]` or `[X]` and a blank at the start of a list item. */
function markTask(item: MarkdownNode, context: Context): void {
  const [paragraph] = item.children ?? [];
  const [head, ...rest] = paragraph?.type === "paragraph" ? (paragraph.children ?? []) : [];
  if (paragraph === undefined || head?.type !== "text") return;
  const marker = TASK_MARKER.exec(head.value ?? "");
  if (marker === null || escapesOf(head, context).slice(0, marker[0].length).some(isEscaped)) return;
  item.checked = marker[1]?.toLowerCase() === "x";
  const remainder = sliceText(head, marker[0].length, (head.value ?? "").length, context);
  paragraph.children = remainder.value === "" ? rest : [remainder, ...rest];
}

function transformBlock(node: MarkdownNode, context: Context): void {
  if (node.children === undefined) return;
  if (node.type === "paragraph" || node.type === "heading" || node.type === "tableCell") {
    readInline(node, context);
    return;
  }
  node.children = node.children.flatMap((child) => (child.type === "paragraph" ? splitTable(child, context) : [child]));
  if (node.type === "listItem") markTask(node, context);
  for (const child of node.children) transformBlock(child, context);
}

/** The remark plugin: `remarkPlugins={[remarkLegacyGfm]}`. */
export function remarkLegacyGfm() {
  return (tree: MarkdownNode, file: { readonly value: unknown }): void => {
    transformBlock(tree, { source: typeof file.value === "string" ? file.value : "", escaped: new WeakMap(), summaries: new WeakMap(), unread: [] });
  };
}
