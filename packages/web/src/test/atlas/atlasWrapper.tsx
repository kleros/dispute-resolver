import type { ReactNode } from "react";
import { AtlasGate } from "../../atlas";
import { APP_CONFIG } from "../../env";
import { walletWrapper, type TestWallet } from "../wallet";
import { TEST_ATLAS_URI } from "./fakeAtlasServer";

/**
 * A `wrapper` for `render`/`renderHook` that runs the real `AtlasGate` and `@kleros/kleros-app` provider over the test
 * wallet. With the default URI, pair it with `installFakeAtlasServer()`; `atlasUri: null` is a deployment without Atlas.
 */
export function atlasWrapper(wallet: TestWallet, atlasUri: string | null = TEST_ATLAS_URI) {
  const config = { ...APP_CONFIG, atlasUri };
  const Wallet = walletWrapper(wallet);
  return function AtlasWrapper({ children }: { readonly children?: ReactNode }) {
    return (
      <Wallet>
        <AtlasGate config={config}>{children}</AtlasGate>
      </Wallet>
    );
  };
}
