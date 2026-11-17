import { z } from "zod";

// Zod probes the Function constructor and compiles a parser with it for every object schema, which the app's policy
// forbids (no 'unsafe-eval'). Each schema reads the setting when it is built, so this runs before the first one: every
// schema module takes z from here. vite.config.ts marks this module as having side effects; the workspace rule would
// otherwise drop the call although the export is used.
z.config({ jitless: true });

export { z };
