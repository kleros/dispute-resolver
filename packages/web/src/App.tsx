import { AtlasGate } from "./atlas";
import { AppRoutes } from "./AppRoutes";
import { DataProvider } from "./data";
import { APP_CONFIG } from "./env";
import { AppProviders } from "./shell";
import type { ColorSchemeStore } from "./theme";

export interface AppProps {
  readonly colorScheme: ColorSchemeStore;
}

export default function App({ colorScheme }: AppProps) {
  return (
    <AppProviders config={APP_CONFIG} dataProvider={DataProvider} atlasGate={AtlasGate} colorScheme={colorScheme}>
      <AppRoutes />
    </AppProviders>
  );
}
