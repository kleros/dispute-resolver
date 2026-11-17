// Built on its own as a classic script by runnerBootstrapPlugin, outside the app bundle.
import { bootstrapRunner } from "./bootstrap";
import { realEnvironment } from "./realEnvironment";

bootstrapRunner(realEnvironment());
