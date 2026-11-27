import { render } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { describe, expect, it } from "vitest";
import { useMounted } from "./useMounted";

const seen: { atUnmount: boolean | null } = { atUnmount: null };

function Owner() {
  const mounted = useMounted();
  useLayoutEffect(
    () => () => {
      seen.atUnmount = mounted.current;
    },
    [mounted],
  );
  return null;
}

describe("useMounted", () => {
  it("reports the component unmounted within the commit that removes it, before passive effects clean up", () => {
    const { unmount } = render(<Owner />);

    unmount();

    expect(seen.atUnmount).toBe(false);
  });
});
