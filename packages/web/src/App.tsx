import { AtlasGate } from "./atlas";
import { AppRoutes } from "./AppRoutes";
import { DataProvider } from "./data";
import { APP_CONFIG } from "./env";
import { AppProviders } from "./shell";

/** The provider tree of ARCHITECTURE.md §2.1 around the route table. */
export default function App() {
  return (
    <AppProviders config={APP_CONFIG} dataProvider={DataProvider} atlasGate={AtlasGate}>
      <AppRoutes />
    </AppProviders>
  );
}
