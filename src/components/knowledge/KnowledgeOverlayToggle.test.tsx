/**
 * Tests for KnowledgeOverlayToggle (sprint 2026-W17).
 *
 * Scope: behavioural — the component is a thin controlled wrapper, but the
 * tests guard the contract that consumers (KnowledgeClient) rely on:
 *   - Both checkboxes render with the expected testids.
 *   - The `checked` prop reflects in the input.
 *   - Toggling fires the corresponding callback with the new value.
 *   - Clicking the label toggles the checkbox (native <label htmlFor> behaviour
 *     via wrapping, so this is implicit — but we still assert it because a
 *     future refactor that splits label and input would silently break it).
 */

import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import KnowledgeOverlayToggle from "./KnowledgeOverlayToggle";

describe("KnowledgeOverlayToggle", () => {
  it("renders the panel + both checkbox testids", () => {
    render(
      <KnowledgeOverlayToggle
        showSearch={true}
        showWeight={true}
        onToggleSearch={vi.fn()}
        onToggleWeight={vi.fn()}
      />,
    );
    expect(screen.getByTestId("knowledge-overlay-toggle")).toBeInTheDocument();
    expect(screen.getByTestId("knowledge-toggle-search")).toBeInTheDocument();
    expect(screen.getByTestId("knowledge-toggle-weight")).toBeInTheDocument();
  });

  it("reflects the controlled `checked` props", () => {
    render(
      <KnowledgeOverlayToggle
        showSearch={true}
        showWeight={false}
        onToggleSearch={vi.fn()}
        onToggleWeight={vi.fn()}
      />,
    );
    expect(screen.getByTestId("knowledge-toggle-search")).toBeChecked();
    expect(screen.getByTestId("knowledge-toggle-weight")).not.toBeChecked();
  });

  it("calls onToggleSearch with the inverse value when search box is clicked", () => {
    const onToggleSearch = vi.fn();
    render(
      <KnowledgeOverlayToggle
        showSearch={true}
        showWeight={true}
        onToggleSearch={onToggleSearch}
        onToggleWeight={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("knowledge-toggle-search"));
    expect(onToggleSearch).toHaveBeenCalledWith(false);
  });

  it("calls onToggleWeight with the inverse value when weight box is clicked", () => {
    const onToggleWeight = vi.fn();
    render(
      <KnowledgeOverlayToggle
        showSearch={true}
        showWeight={false}
        onToggleSearch={vi.fn()}
        onToggleWeight={onToggleWeight}
      />,
    );
    fireEvent.click(screen.getByTestId("knowledge-toggle-weight"));
    // showWeight starts false → click flips to true.
    expect(onToggleWeight).toHaveBeenCalledWith(true);
  });

  it("clicking the wrapping <label> toggles the input (native behaviour)", () => {
    const onToggleSearch = vi.fn();
    render(
      <KnowledgeOverlayToggle
        showSearch={false}
        showWeight={true}
        onToggleSearch={onToggleSearch}
        onToggleWeight={vi.fn()}
      />,
    );
    // The label wraps the input; clicking the label fires the input's
    // onChange. Some testing-library setups fire the label's click and the
    // bubbling reaches the input — that's what we want to guard.
    fireEvent.click(screen.getByTestId("knowledge-toggle-search-label"));
    expect(onToggleSearch).toHaveBeenCalledWith(true);
  });
});
