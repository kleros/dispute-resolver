import * as core from "@dispute-resolver/core";
import { act, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UploadResult } from "../../atlas";
import { fakeUploader, TEST_UPLOAD_PATH } from "../../test/atlas";
import { renderWithProviders } from "../../test/shell";
import { createTestWallet, heldWriteController, installOfflineAppKitEnvironment, type FakeWriteController } from "../../test/wallet";
import { useCreateDispute } from "./useCreateDispute";

vi.mock("@dispute-resolver/core", async (importOriginal) => (await import("../../test/data/mockCoreReads")).mockCoreReads(importOriginal));

const writes = vi.hoisted(() => ({ controller: null as FakeWriteController | null }));

vi.mock("../../wallet", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../wallet")>();
  return {
    ...actual,
    useWrite: () => {
      if (writes.controller === null) throw new Error("No fake write controller for this test.");
      return writes.controller.useWrite();
    },
  };
});

type CreateAction = ReturnType<typeof useCreateDispute>;

const INPUT: core.CreateDisputeInput = {
  courtId: 0n,
  votes: 3n,
  category: "",
  title: "Rent deposit",
  description: "",
  questionType: "single-select",
  question: "Should the deposit be returned?",
  options: [
    { title: "Yes", description: "" },
    { title: "No", description: "" },
  ],
  aliases: {},
  primaryDocument: null,
};

/** The hook alone, its latest action handed out, so a test can call `create()` where no button would let it. */
function Harness({ onAction }: { readonly onAction: (action: CreateAction) => void }) {
  const action = useCreateDispute(INPUT, null);
  useEffect(() => {
    onAction(action);
  });
  return null;
}

interface Mounts {
  first: CreateAction | null;
  second: CreateAction | null;
}

function actionOf(action: CreateAction | null): CreateAction {
  if (action === null) throw new Error("The harness has not rendered.");
  return action;
}

async function renderHarnesses(uploadJson: () => Promise<UploadResult>) {
  const mounts: Mounts = { first: null, second: null };
  const uploader = fakeUploader({ uploadJson });
  const wallet = createTestWallet({ chainId: 1 });
  renderWithProviders(
    <>
      <Harness
        onAction={(action) => {
          mounts.first = action;
        }}
      />
      <Harness
        onAction={(action) => {
          mounts.second = action;
        }}
      />
    </>,
    { path: "/1", wallet, uploader },
  );
  await act(async () => {
    await wallet.connect();
  });
  return { mounts, uploader };
}

beforeEach(() => {
  installOfflineAppKitEnvironment();
  vi.mocked(core.readArbitrationCost).mockResolvedValue({ ok: true, value: 10n ** 16n });
  writes.controller = heldWriteController([{ phase: "pending" }]);
});

afterEach(() => {
  writes.controller = null;
  vi.clearAllMocks();
});

describe("useCreateDispute", () => {
  it("create() neither uploads nor sends while another mount's create on the same page chain is unmined", async () => {
    const { mounts, uploader } = await renderHarnesses(() => Promise.resolve({ ok: true, path: TEST_UPLOAD_PATH }));
    act(() => {
      void actionOf(mounts.first).create();
    });
    await waitFor(() => {
      expect(writes.controller?.executions).toHaveLength(1);
    });

    act(() => {
      void actionOf(mounts.second).create();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(uploader.uploadJson).toHaveBeenCalledTimes(1);
    expect(writes.controller?.executions).toHaveLength(1);
  });

  it("two create() calls before the upload resolves upload once and send one transaction", async () => {
    const control: { finish?: (result: UploadResult) => void } = {};
    const upload = new Promise<UploadResult>((resolve) => {
      control.finish = resolve;
    });
    const { mounts, uploader } = await renderHarnesses(() => upload);
    const action = actionOf(mounts.first);
    act(() => {
      void action.create();
      void action.create();
    });
    act(() => {
      control.finish?.({ ok: true, path: TEST_UPLOAD_PATH });
    });
    await waitFor(() => {
      expect(writes.controller?.executions).toHaveLength(1);
    });
    expect(uploader.uploadJson).toHaveBeenCalledTimes(1);
  });
});
