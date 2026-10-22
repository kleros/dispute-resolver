import { Roles } from "@kleros/kleros-app";
import { z } from "@dispute-resolver/core";
import type { RoleLimits, UploadRole } from "./types";

/** User files go under `evidence`, generated JSON under `policy`. */
export const LIBRARY_ROLES: Readonly<Record<UploadRole, Roles>> = { evidence: Roles.Evidence, policy: Roles.Policy };

/** One entry of the server's `roles(CourtV1)` answer, untrusted until it parses. */
const roleSchema = z.object({
  name: z.string(),
  restriction: z.object({ maxSize: z.number().nonnegative(), allowedMimeTypes: z.array(z.string()) }),
});

/** The server names roles by the library enum's keys (`"Evidence"`), which the library maps to values (`"evidence"`). */
function libraryRole(name: string): Roles | undefined {
  return Object.hasOwn(Roles, name) ? Roles[name as keyof typeof Roles] : undefined;
}

/** The server's restrictions for `role`, or `null` when they are unknown or malformed. */
export function roleLimits(roles: unknown, role: UploadRole): RoleLimits | null {
  if (!Array.isArray(roles)) return null;
  for (const entry of roles) {
    const parsed = roleSchema.safeParse(entry);
    if (parsed.success && libraryRole(parsed.data.name) === LIBRARY_ROLES[role]) {
      return { maxSize: parsed.data.restriction.maxSize, allowedMimeTypes: parsed.data.restriction.allowedMimeTypes };
    }
  }
  return null;
}

/** The library's rule: an exact type, or a `type/*` entry matching every subtype. */
export function isMimeAllowed(type: string, allowedMimeTypes: readonly string[]): boolean {
  return allowedMimeTypes.some((allowed) => (allowed.endsWith("/*") ? type.startsWith(allowed.slice(0, -1)) : allowed === type));
}

/** Why the server would refuse `file`, checked before anything is signed; `null` when it may be uploaded. */
export function refuseFile(file: File, limits: RoleLimits): "mime-not-allowed" | "too-large" | null {
  if (!isMimeAllowed(file.type, limits.allowedMimeTypes)) return "mime-not-allowed";
  if (file.size > limits.maxSize) return "too-large";
  return null;
}

const KIB = 1024;
const MIB = KIB * KIB;

function trimmed(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** A byte count for people: `20 MB`, `1.5 MB`, `512 KB`. */
export function formatSize(bytes: number): string {
  if (bytes >= MIB) return `${trimmed(bytes / MIB)} MB`;
  if (bytes >= KIB) return `${trimmed(bytes / KIB)} KB`;
  return `${String(bytes)} bytes`;
}

interface Format {
  /** As listed in a hint: `PDF`, `image`. */
  readonly name: string;
  /** As the object of "Choose": `a PDF`, `an image`. */
  readonly choice: string;
}

/** Friendly names for the entries the server is known to list; any other entry is shown as its raw type. */
const KNOWN_FORMATS: ReadonlyMap<string, Format> = new Map([
  ["application/pdf", { name: "PDF", choice: "a PDF" }],
  ["application/json", { name: "JSON", choice: "a JSON file" }],
  ["image/*", { name: "image", choice: "an image" }],
  ["text/*", { name: "text", choice: "a text file" }],
  ["text/plain", { name: "text", choice: "a text file" }],
  ["video/*", { name: "video", choice: "a video" }],
  ["audio/*", { name: "audio", choice: "an audio file" }],
]);

/** The accepted formats, each named once, the friendly ones first so a sentence rarely starts with a raw type. */
function acceptedFormats(allowedMimeTypes: readonly string[]): readonly Format[] {
  const known = new Map<string, Format>();
  const raw = new Map<string, Format>();
  for (const type of allowedMimeTypes) {
    const format = KNOWN_FORMATS.get(type);
    if (format === undefined) raw.set(type, { name: type, choice: type });
    else known.set(format.name, format);
  }
  return [...known.values(), ...raw.values()];
}

function joinWithOr(items: readonly string[]): string {
  if (items.length < 2) return items.join("");
  return `${items.slice(0, -1).join(", ")} or ${items[items.length - 1] ?? ""}`;
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** What the field accepts, as a sentence: `PDF or image, up to 20 MB.` */
export function limitsHint(limits: RoleLimits): string {
  const names = joinWithOr(acceptedFormats(limits.allowedMimeTypes).map((format) => format.name));
  const size = formatSize(limits.maxSize);
  return names === "" ? `Up to ${size}.` : `${capitalized(names)}, up to ${size}.`;
}

/** What to pick instead of a refused file: `Choose a PDF or an image, up to 20 MB.` */
export function limitsChoice(limits: RoleLimits): string {
  const choices = joinWithOr(acceptedFormats(limits.allowedMimeTypes).map((format) => format.choice));
  const size = formatSize(limits.maxSize);
  return choices === "" ? `Choose a file up to ${size}.` : `Choose ${choices}, up to ${size}.`;
}
