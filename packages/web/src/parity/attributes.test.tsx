import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  appealCardAttributes,
  appealPanelAttributes,
  casePageAttributes,
  createCostAttributes,
  createCourtAttributes,
  createOptionCountAttributes,
  createPageAttributes,
  createQuestionTypeAttributes,
  dataAttributes,
  decisionAttributes,
  evidenceItemAttributes,
  fieldAttributes,
  hiddenEvidenceCountAttributes,
  ongoingCardAttributes,
  ongoingPageAttributes,
  rulingOptionsAttributes,
  testId,
  timelineColumnAttributes,
  votesAttributes,
} from "./index";

const ARBITRABLE = "0x99489d7bb33539f3d1a401741e56e8f02b9ae0cf";

describe("testId", () => {
  it("§12: writes data-testid", () => {
    expect(testId("case-title")).toEqual({ "data-testid": "case-title" });
  });

  it("§12: renders as a data-testid attribute in React", () => {
    render(<h1 {...testId("case-title")}>Title</h1>);
    expect(screen.getByTestId("case-title")).toHaveTextContent("Title");
  });
});

describe("dataAttributes", () => {
  it("04 §1: bigint wei is serialized as a decimal string", () => {
    const wei = 123456789012345678901234567890n;
    expect(dataAttributes({ "data-remaining-wei": wei })).toEqual({ "data-remaining-wei": "123456789012345678901234567890" });
  });

  it("04 §1: a ruling code of max uint keeps every digit", () => {
    const max = 2n ** 256n - 1n;
    expect(dataAttributes({ "data-code": max })["data-code"]).toBe(max.toString(10));
  });

  it("§12.1: null and undefined attributes are omitted", () => {
    const attributes = dataAttributes({ "data-state": "dispute", "data-arbitrable": null, "data-family": undefined });
    expect(attributes).toEqual({ "data-state": "dispute" });
    expect("data-arbitrable" in attributes).toBe(false);
    expect("data-family" in attributes).toBe(false);
  });

  it("§12.1: zero, false and the empty string are written, not omitted", () => {
    expect(dataAttributes({ "data-count": 0, "data-available": false, "data-name": "" })).toEqual({ "data-count": "0", "data-available": "false", "data-name": "" });
  });
});

describe("case page hooks (§12.1)", () => {
  it("§12.1: case-page carries state, arbitrable, family, compatibility, period, last change and Reality notice", () => {
    expect(
      casePageAttributes({
        state: "dispute",
        arbitrable: ARBITRABLE,
        family: "idr-v2",
        compatibility: "full",
        period: 4,
        lastPeriodChange: 1700000000,
        realityNotice: "none",
      }),
    ).toEqual({
      "data-testid": "case-page",
      "data-state": "dispute",
      "data-arbitrable": ARBITRABLE,
      "data-family": "idr-v2",
      "data-compatibility": "full",
      "data-period": "4",
      "data-last-period-change": "1700000000",
      "data-reality-notice": "none",
    });
  });

  it("§12.1: a period of 0 is written", () => {
    expect(casePageAttributes({ state: "dispute", period: 0 })["data-period"]).toBe("0");
  });

  it.each(["not-found", "no-arbitrator", "unavailable", "no-id", "loading"] as const)("§12.1: the %s state carries no dispute data", (state) => {
    expect(casePageAttributes({ state })).toEqual({ "data-testid": "case-page", "data-state": state });
  });

  it("§12.1: the arbitrable address is written in lowercase", () => {
    expect(casePageAttributes({ state: "dispute", arbitrable: "0x99489D7bb33539F3D1A401741E56e8f02B9AE0Cf" as typeof ARBITRABLE })["data-arbitrable"]).toBe(ARBITRABLE);
  });

  it("§12.1: an undetected family is written as unknown", () => {
    expect(casePageAttributes({ state: "dispute", family: "unknown" })["data-family"]).toBe("unknown");
  });

  it("§12.1: ruling-options JSON carries type, titles, reserved and precision", () => {
    const attributes = rulingOptionsAttributes({ type: "uint", titles: ["Yes", "No"], reserved: { "0xff": "Answered Too Soon" }, precision: 0 });
    expect(attributes["data-testid"]).toBe("case-ruling-options");
    expect(JSON.parse(attributes["data-ruling-options"] ?? "")).toEqual({ type: "uint", titles: ["Yes", "No"], reserved: { "0xff": "Answered Too Soon" }, precision: 0 });
  });

  it("§12.1: ruling options without titles or reserved answers write empty ones and no precision", () => {
    const parsed: unknown = JSON.parse(rulingOptionsAttributes({ type: "single-select" })["data-ruling-options"] ?? "");
    expect(parsed).toEqual({ type: "single-select", titles: [], reserved: {} });
    expect(parsed).not.toHaveProperty("precision");
  });

  it("§12.1: timeline-column carries the column name and its state", () => {
    expect(timelineColumnAttributes({ name: "appeal", state: "current" })).toEqual({ "data-testid": "timeline-column", "data-name": "appeal", "data-state": "current" });
  });

  it("§12.1: case-votes carries the number of votes", () => {
    expect(votesAttributes(3)).toEqual({ "data-testid": "case-votes", "data-value": "3" });
    expect(votesAttributes(0n)).toEqual({ "data-testid": "case-votes", "data-value": "0" });
  });

  it("§12.1: a winner carries who decided it", () => {
    expect(decisionAttributes({ kind: "winner", wonBy: "jury" })).toEqual({ "data-testid": "case-decision", "data-kind": "winner", "data-won-by": "jury" });
  });

  it.each(["none", "jury-decision"] as const)("§12.1: a %s decision carries no winner", (kind) => {
    expect(decisionAttributes({ kind, wonBy: "default" })).toEqual({ "data-testid": "case-decision", "data-kind": kind });
  });

  it("§12.1: the withdrawable amount is written only for the withdraw panel", () => {
    expect(appealPanelAttributes({ kind: "withdraw", withdrawableWei: 5n })).toEqual({ "data-testid": "appeal-panel", "data-kind": "withdraw", "data-withdrawable-wei": "5" });
    expect(appealPanelAttributes({ kind: "withdraw", withdrawableWei: 0n })["data-withdrawable-wei"]).toBe("0");
    expect(appealPanelAttributes({ kind: "crowdfunding", withdrawableWei: 5n })).toEqual({ "data-testid": "appeal-panel", "data-kind": "crowdfunding" });
  });

  it.each(["hidden", "handled-by-arbitrable", "escrow-appeal", "escrow-ended", "crowdfunding", "fees-unavailable", "withdraw", "withdraw-unsupported"] as const)(
    "§12.1: the appeal panel kind %s is written verbatim",
    (kind) => {
      expect(appealPanelAttributes({ kind })["data-kind"]).toBe(kind);
    },
  );

  it("§12.1: appeal-card carries code, funded percent, remaining wei and deadline", () => {
    expect(appealCardAttributes({ code: 2n, fundedPercent: 37.5, remainingWei: 1000000000000000000n, deadline: 1700003600 })).toEqual({
      "data-testid": "appeal-card",
      "data-code": "2",
      "data-funded-percent": "37.5",
      "data-remaining-wei": "1000000000000000000",
      "data-deadline": "1700003600",
    });
  });

  it("§12.1: an appeal card without a deadline omits it", () => {
    expect(appealCardAttributes({ code: 0n, fundedPercent: 0, remainingWei: 0n, deadline: null })).not.toHaveProperty("data-deadline");
  });

  it("§12.1: evidence-item carries submitter and timestamp", () => {
    expect(evidenceItemAttributes({ submitter: "0xabc", timestamp: 1700000000 })).toEqual({
      "data-testid": "evidence-item",
      "data-submitter": "0xabc",
      "data-timestamp": "1700000000",
    });
  });

  it("§12.1: evidence-hidden-count carries the count", () => {
    expect(hiddenEvidenceCountAttributes(2)).toEqual({ "data-testid": "evidence-hidden-count", "data-count": "2" });
  });
});

describe("ongoing and create hooks (§12.2)", () => {
  it("§12.2: ongoing-page carries chain and state", () => {
    expect(ongoingPageAttributes({ chain: 100, state: "no-arbitrator" })).toEqual({ "data-testid": "ongoing-page", "data-chain": "100", "data-state": "no-arbitrator" });
  });

  it("§12.2: ongoing-card carries dispute id and period", () => {
    expect(ongoingCardAttributes({ disputeId: 1454n, period: 0 })).toEqual({ "data-testid": "ongoing-card", "data-dispute-id": "1454", "data-period": "0" });
  });

  it("§12.2: create-page carries chain and availability", () => {
    expect(createPageAttributes({ chain: 1, available: true })).toEqual({ "data-testid": "create-page", "data-chain": "1", "data-available": "true" });
    expect(createPageAttributes({ chain: 130, available: false })["data-available"]).toBe("false");
  });

  it("§12.2: create-court and create-question-type options are JSON arrays", () => {
    const courts = createCourtAttributes(["General Court", 'Quote "Court"']);
    expect(courts["data-testid"]).toBe("create-court");
    expect(JSON.parse(courts["data-options"] ?? "")).toEqual(["General Court", 'Quote "Court"']);
    const types = createQuestionTypeAttributes(["Single Select", "Multiple Select"]);
    expect(types["data-testid"]).toBe("create-question-type");
    expect(JSON.parse(types["data-options"] ?? "")).toEqual(["Single Select", "Multiple Select"]);
  });

  it("§12.2: create-cost carries the default cost in wei", () => {
    expect(createCostAttributes(1000000000000000n)).toEqual({ "data-testid": "create-cost", "data-wei": "1000000000000000" });
  });

  it("§12.2: create-option-count carries the range", () => {
    expect(createOptionCountAttributes({ min: 2, max: 10 })).toEqual({ "data-testid": "create-option-count", "data-min": "2", "data-max": "10" });
  });

  it('§12.2: a required field carries data-required="true", an optional one does not', () => {
    expect(fieldAttributes({ field: "title", required: true })).toEqual({ "data-field": "title", "data-required": "true" });
    expect(fieldAttributes({ field: "alias", required: false })).toEqual({ "data-field": "alias" });
  });
});

describe("React rendering", () => {
  it("§12.1: a spread hook renders as attributes the extractor can read", () => {
    render(
      <div
        {...casePageAttributes({
          state: "dispute",
          arbitrable: ARBITRABLE,
          family: "idr-v2",
          compatibility: "view-only",
          period: 3,
          lastPeriodChange: 1700000000,
          realityNotice: "malformed",
        })}
      >
        <span {...appealPanelAttributes({ kind: "withdraw", withdrawableWei: 42n })} />
        <span {...timelineColumnAttributes({ name: "vote", state: "concluded" })} />
        <div {...fieldAttributes({ field: "title", required: true })} />
      </div>,
    );
    const page = screen.getByTestId("case-page");
    expect(page.getAttribute("data-state")).toBe("dispute");
    expect(page.getAttribute("data-arbitrable")).toBe(ARBITRABLE);
    expect(page.getAttribute("data-family")).toBe("idr-v2");
    expect(page.getAttribute("data-compatibility")).toBe("view-only");
    expect(page.getAttribute("data-period")).toBe("3");
    expect(page.getAttribute("data-last-period-change")).toBe("1700000000");
    expect(page.getAttribute("data-reality-notice")).toBe("malformed");
    expect(screen.getByTestId("appeal-panel").getAttribute("data-withdrawable-wei")).toBe("42");
    expect(screen.getByTestId("timeline-column").getAttribute("data-name")).toBe("vote");
    expect(page.querySelector('[data-field="title"][data-required="true"]')).not.toBeNull();
  });

  it("§12: values are written by React, so markup in a value stays an attribute value", () => {
    render(<div {...createCourtAttributes(['"><img src=x onerror=alert(1)>'])} />);
    const element = screen.getByTestId("create-court");
    expect(element.querySelector("img")).toBeNull();
    expect(JSON.parse(element.getAttribute("data-options") ?? "")).toEqual(['"><img src=x onerror=alert(1)>']);
  });
});
