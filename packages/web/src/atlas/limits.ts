import { Roles } from "@kleros/kleros-app";
import { z } from "@dispute-resolver/core";
import type { RoleLimits, UploadRole } from "./types";

/** The library role each upload role is sent as (A16): user files under `evidence`, generated JSON under `policy`. */
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

/** The server's restrictions for `role` (D-42, B16), or `null` when they are unknown or malformed. */
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

/** Why the server would refuse `file`, checked before anything is signed (B16, D-42); `null` when it may be uploaded. */
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
