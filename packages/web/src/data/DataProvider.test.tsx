import type { Court, Outcome } from "@dispute-resolver/core";
import { useIsRestoring, useQueryClient } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildAppConfig } from "../env";
import { testCourt } from "../test/data";
import { CACHE_VERSION, PERSISTED_CACHE_KEY } from "./constants";
import { useCoreDeps } from "./context";
import { DataProvider } from "./DataProvider";
import { queryKeys } from "./queryKeys";

const CONFIG = buildAppConfig({ REACT_APP_WEB3_PROVIDER_URL: "https://read.rpc.test/mainnet" }, { host: "resolve.kleros.io", origin: "https://resolve.kleros.io" });
const COURTS: Outcome<readonly Court[]> = { ok: true, value: [testCourt()] };

function Probe() {
  const client = useQueryClient();
  const deps = useCoreDeps();
  const restoring = useIsRestoring();
  if (restoring) return <output aria-label="probe">restoring</output>;
  const courts = client.getQueryData<Outcome<readonly Court[]>>(queryKeys.courts(1));
  const restored = courts?.ok === true ? String(courts.value.length) : "none";
  const rpc = deps.getReadClient(1) === undefined ? "no-rpc" : "rpc";
  return <output aria-label="probe">{`restored:${restored}:${rpc}`}</output>;
}

function storedCourts(buster: string): string {
  const data = JSON.parse(JSON.stringify(COURTS, (_key, value: unknown) => (typeof value === "bigint" ? { $bigint: value.toString() } : value))) as unknown;
  return JSON.stringify({
    buster,
    timestamp: Date.now(),
    clientState: { mutations: [], queries: [{ queryKey: queryKeys.courts(1), queryHash: "x", state: { status: "success", data, dataUpdatedAt: Date.now() } }] },
  });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DataProvider", () => {
  it("restores the validated cache on mount without any network request", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    localStorage.setItem(PERSISTED_CACHE_KEY, storedCourts(CACHE_VERSION));
    render(
      <DataProvider config={CONFIG}>
        <Probe />
      </DataProvider>,
    );
    await waitFor(() => {
      expect(screen.getByLabelText("probe").textContent).toBe("restored:1:rpc");
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(document.querySelectorAll("iframe")).toHaveLength(0);
  });

  it("discards a cache written under another version at boot", async () => {
    localStorage.setItem(PERSISTED_CACHE_KEY, storedCourts("dr-cache-0"));
    render(
      <DataProvider config={CONFIG}>
        <Probe />
      </DataProvider>,
    );
    await waitFor(() => {
      expect(screen.getByLabelText("probe").textContent).toBe("restored:none:rpc");
    });
    expect(localStorage.getItem(PERSISTED_CACHE_KEY)).toBeNull();
  });

  it("gives a chain without a configured RPC no read client", async () => {
    render(
      <DataProvider config={buildAppConfig({}, { host: "localhost", origin: "http://localhost" })}>
        <Probe />
      </DataProvider>,
    );
    await waitFor(() => {
      expect(screen.getByLabelText("probe").textContent).toBe("restored:none:no-rpc");
    });
  });
});
