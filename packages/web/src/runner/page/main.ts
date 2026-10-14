// Entry of the runner page's classic bootstrap, built on its own by runnerBootstrapPlugin (ARCHITECTURE.md §7.1).
import { bootstrapRunner } from "./bootstrap";
import { realEnvironment } from "./realEnvironment";

bootstrapRunner(realEnvironment());
