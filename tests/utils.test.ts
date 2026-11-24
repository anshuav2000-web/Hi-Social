import { describe, expect, it } from "vitest";
import { formatNumber, formatPercent, initials, label, pctChange, platformLabel } from "@/lib/utils";

describe("formatting", () => {
  it("formats large numbers compactly", () => {
    expect(formatNumber(999)).toBe("999");
    expect(formatNumber(12_400)).toBe("12.4K");
    expect(formatNumber(2_450_000)).toBe("2.5M");
    expect(formatNumber(-1_500)).toBe("-1.5K");
  });

  it("renders missing metrics as an em dash, never zero", () => {
    expect(formatNumber(null)).toBe("—");
    expect(formatNumber(undefined)).toBe("—");
    expect(formatNumber(Number.NaN)).toBe("—");
    expect(formatPercent(null)).toBe("—");
    expect(formatPercent(3.456)).toBe("3.5%");
    expect(formatPercent(3.456, 2)).toBe("3.46%");
  });

  it("labels snake_case values and known statuses", () => {
    expect(label("needs_changes")).toBe("Needs Changes");
    expect(label(null)).toBe("—");
    expect(label("in_review")).toBe("In Review");
    expect(platformLabel("instagram")).toBe("Instagram");
    expect(platformLabel("threads")).toBe("Threads");
  });

  it("computes percentage change only when a baseline exists", () => {
    expect(pctChange(150, 100)).toBe(50);
    expect(pctChange(50, 100)).toBe(-50);
    expect(pctChange(10, 0)).toBeNull();
    expect(pctChange(null, 100)).toBeNull();
    expect(pctChange(10, null)).toBeNull();
  });

  it("derives initials", () => {
    expect(initials("Ava Mercer")).toBe("AM");
    expect(initials("Lumina")).toBe("L");
  });
});
