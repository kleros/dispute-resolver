import { AtlasGate } from "./atlas";
import { AppRoutes } from "./AppRoutes";
import { DataProvider } from "./data";
import { APP_CONFIG } from "./env";
import { AppProviders, type PageScroll } from "./shell";
import type { ColorSchemeStore } from "./theme";

export interface AppProps {
  readonly colorScheme: ColorSchemeStore;
  readonly pageScroll: PageScroll;
}

export default function App({ colorScheme, pageScroll }: AppProps) {
  return (
    <AppProviders config={APP_CONFIG} dataProvider={DataProvider} atlasGate={AtlasGate} colorScheme={colorScheme} pageScroll={pageScroll}>
      <AppRoutes />
    </AppProviders>
  );
}
