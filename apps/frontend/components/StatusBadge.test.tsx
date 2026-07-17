import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "./StatusBadge";

describe("StatusBadge", () => {
  it.each([
    ["COMPLETED", "bg-success"],
    ["RELEASED", "bg-success"],
    ["CONFIRMED", "bg-success"],
    ["PENDING", "bg-warning"],
    ["SCHEDULED", "bg-warning"],
    ["FAILED", "text-destructive"],
    ["CANCELLED", "text-destructive"],
    ["SUBMITTED", "bg-info"],
    ["EXECUTING", "bg-info"],
  ])("colors %s using the correct status class", (status, expectedClass) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(status)).toHaveClass(expectedClass);
  });

  it("is case-insensitive when matching known statuses", () => {
    render(<StatusBadge status="completed" />);
    expect(screen.getByText("completed")).toHaveClass("bg-success");
  });

  it("falls back to a neutral badge for unrecognized statuses", () => {
    render(<StatusBadge status="DRAFT" />);
    const badge = screen.getByText("DRAFT");
    expect(badge).toHaveClass("text-muted-foreground");
    expect(badge).not.toHaveClass("bg-success");
  });
});
