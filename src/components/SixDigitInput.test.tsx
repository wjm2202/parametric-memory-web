/**
 * Tests for SixDigitInput.
 *
 * Coverage:
 *   1. Renders six inputs with correct aria-labels.
 *   2. Typing digits auto-advances focus.
 *   3. Backspace on an empty field jumps back AND clears the previous field.
 *   4. Arrow keys move focus without typing.
 *   5. Non-digit keys are blocked.
 *   6. Paste fills all six fields and triggers onComplete.
 *   7. Paste with separators (spaces, hyphens) is canonicalised.
 *   8. onComplete fires once when the sixth digit lands, never before.
 *   9. disabled state cascades to all six inputs.
 *  10. describedBy propagates to every input's aria-describedby.
 *  11. Password-manager-style multi-char onChange is treated as paste.
 *
 * The widget is the foundation for three TOTP flows (enrol, disable,
 * regenerate). Every flow trusts the widget to call onComplete exactly
 * once with a 6-character digit string when the user finishes typing —
 * those tests live here, not in the flow tests, to keep flow tests focused
 * on flow logic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useState } from "react";
import { SixDigitInput } from "./SixDigitInput";

// ─── Test harness ────────────────────────────────────────────────────────────

/**
 * Controlled wrapper — the production component is fully controlled, so
 * tests need a parent that holds value state. This wrapper also captures
 * the raw onChange and onComplete calls for assertions.
 */
function Harness({
  initial = "",
  disabled = false,
  describedBy,
  onChange,
  onComplete,
}: {
  initial?: string;
  disabled?: boolean;
  describedBy?: string;
  onChange?: (next: string) => void;
  onComplete?: (full: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <SixDigitInput
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
      onComplete={onComplete}
      disabled={disabled}
      describedBy={describedBy}
    />
  );
}

beforeEach(() => {
  cleanup();
});

afterEach(() => {
  cleanup();
});

// ─── 1. Render ───────────────────────────────────────────────────────────────

describe("SixDigitInput — render", () => {
  it("renders six inputs with sequential aria-labels", () => {
    render(<Harness />);
    for (let i = 0; i < 6; i++) {
      expect(screen.getByLabelText(`Digit ${i + 1} of 6`)).toBeTruthy();
    }
  });

  it("hydrates from an initial value", () => {
    render(<Harness initial="42" />);
    expect((screen.getByTestId("six-digit-input-0") as HTMLInputElement).value).toBe("4");
    expect((screen.getByTestId("six-digit-input-1") as HTMLInputElement).value).toBe("2");
    expect((screen.getByTestId("six-digit-input-2") as HTMLInputElement).value).toBe("");
  });

  it("group has role=group and an accessible name", () => {
    render(<Harness />);
    const group = screen.getByRole("group", { name: /six-digit verification code/i });
    expect(group).toBeTruthy();
  });
});

// ─── 2. Auto-advance ─────────────────────────────────────────────────────────

describe("SixDigitInput — typing", () => {
  it("auto-advances focus after each digit", () => {
    render(<Harness />);
    const input0 = screen.getByTestId("six-digit-input-0") as HTMLInputElement;
    const input1 = screen.getByTestId("six-digit-input-1") as HTMLInputElement;

    input0.focus();
    fireEvent.change(input0, { target: { value: "1" } });
    expect(document.activeElement).toBe(input1);
  });

  it("non-digit keys are blocked at keydown", () => {
    render(<Harness />);
    const input0 = screen.getByTestId("six-digit-input-0") as HTMLInputElement;
    input0.focus();
    const keyEvent = fireEvent.keyDown(input0, { key: "a" });
    // preventDefault was called → keyEvent returns false from fireEvent
    expect(keyEvent).toBe(false);
  });

  it("does not auto-advance from the last field", () => {
    render(<Harness initial="12345" />);
    const input5 = screen.getByTestId("six-digit-input-5") as HTMLInputElement;
    input5.focus();
    fireEvent.change(input5, { target: { value: "6" } });
    // Stays focused on the last field — there's no field 6.
    expect(document.activeElement).toBe(input5);
  });
});

// ─── 3. Backspace ────────────────────────────────────────────────────────────

describe("SixDigitInput — backspace", () => {
  it("on an empty field, jumps back AND clears the previous", () => {
    const onChange = vi.fn();
    render(<Harness initial="123" onChange={onChange} />);
    const input3 = screen.getByTestId("six-digit-input-3") as HTMLInputElement;
    const input2 = screen.getByTestId("six-digit-input-2") as HTMLInputElement;

    input3.focus();
    fireEvent.keyDown(input3, { key: "Backspace" });

    // Previous field is now empty.
    expect((screen.getByTestId("six-digit-input-2") as HTMLInputElement).value).toBe("");
    // Focus moved back.
    expect(document.activeElement).toBe(input2);
    // onChange called with truncated value.
    expect(onChange).toHaveBeenLastCalledWith("12");
  });

  it("on a non-empty field, just clears the field (no jump)", () => {
    render(<Harness initial="12345" />);
    const input3 = screen.getByTestId("six-digit-input-3") as HTMLInputElement;
    input3.focus();
    fireEvent.change(input3, { target: { value: "" } });
    expect(document.activeElement).toBe(input3);
  });
});

// ─── 4. Arrow keys ───────────────────────────────────────────────────────────

describe("SixDigitInput — arrow keys", () => {
  it("ArrowLeft moves focus left", () => {
    render(<Harness initial="123" />);
    const input2 = screen.getByTestId("six-digit-input-2") as HTMLInputElement;
    const input1 = screen.getByTestId("six-digit-input-1") as HTMLInputElement;

    input2.focus();
    fireEvent.keyDown(input2, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(input1);
  });

  it("ArrowRight moves focus right", () => {
    render(<Harness initial="123456" />);
    const input2 = screen.getByTestId("six-digit-input-2") as HTMLInputElement;
    const input3 = screen.getByTestId("six-digit-input-3") as HTMLInputElement;

    input2.focus();
    fireEvent.keyDown(input2, { key: "ArrowRight" });
    expect(document.activeElement).toBe(input3);
  });

  it("Home jumps to first field, End jumps to last", () => {
    render(<Harness initial="123456" />);
    const input2 = screen.getByTestId("six-digit-input-2") as HTMLInputElement;
    const input0 = screen.getByTestId("six-digit-input-0") as HTMLInputElement;
    const input5 = screen.getByTestId("six-digit-input-5") as HTMLInputElement;

    input2.focus();
    fireEvent.keyDown(input2, { key: "Home" });
    expect(document.activeElement).toBe(input0);

    fireEvent.keyDown(input0, { key: "End" });
    expect(document.activeElement).toBe(input5);
  });
});

// ─── 5. Paste ────────────────────────────────────────────────────────────────

describe("SixDigitInput — paste", () => {
  it("pasting a 6-digit string fills all fields and fires onComplete", () => {
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);
    const input0 = screen.getByTestId("six-digit-input-0") as HTMLInputElement;

    fireEvent.paste(input0, {
      clipboardData: { getData: () => "654321" },
    });

    for (let i = 0; i < 6; i++) {
      expect((screen.getByTestId(`six-digit-input-${i}`) as HTMLInputElement).value).toBe(
        "654321"[i],
      );
    }
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith("654321");
  });

  it("pasting '123 456' (with space) canonicalises to 123456", () => {
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);
    const input0 = screen.getByTestId("six-digit-input-0") as HTMLInputElement;

    fireEvent.paste(input0, {
      clipboardData: { getData: () => "123 456" },
    });
    expect(onComplete).toHaveBeenCalledWith("123456");
  });

  it("pasting '123-456' (with hyphen) canonicalises to 123456", () => {
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);
    const input0 = screen.getByTestId("six-digit-input-0") as HTMLInputElement;

    fireEvent.paste(input0, {
      clipboardData: { getData: () => "123-456" },
    });
    expect(onComplete).toHaveBeenCalledWith("123456");
  });

  it("pasting an empty/non-digit payload is a no-op", () => {
    const onChange = vi.fn();
    const onComplete = vi.fn();
    render(<Harness onChange={onChange} onComplete={onComplete} />);
    const input0 = screen.getByTestId("six-digit-input-0") as HTMLInputElement;

    fireEvent.paste(input0, {
      clipboardData: { getData: () => "abc-def" },
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("pasting a partial 4-digit code does NOT fire onComplete", () => {
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);
    const input0 = screen.getByTestId("six-digit-input-0") as HTMLInputElement;

    fireEvent.paste(input0, {
      clipboardData: { getData: () => "1234" },
    });
    expect(onComplete).not.toHaveBeenCalled();
  });
});

// ─── 6. Multi-char onChange (password manager autofill) ──────────────────────

describe("SixDigitInput — password manager autofill", () => {
  it("multi-char onChange is treated as paste", () => {
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);
    const input0 = screen.getByTestId("six-digit-input-0") as HTMLInputElement;

    // 1Password sometimes fills the focused field with the full code in one
    // event rather than synthesising six keystrokes. Production component
    // detects this via raw.length > 1 and routes through the digit extractor.
    fireEvent.change(input0, { target: { value: "987654" } });
    expect(onComplete).toHaveBeenCalledWith("987654");
  });
});

// ─── 7. onComplete timing ────────────────────────────────────────────────────

describe("SixDigitInput — onComplete timing", () => {
  it("fires only when length reaches 6", () => {
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);
    const input0 = screen.getByTestId("six-digit-input-0") as HTMLInputElement;

    fireEvent.change(input0, { target: { value: "1" } });
    fireEvent.change(screen.getByTestId("six-digit-input-1"), { target: { value: "2" } });
    fireEvent.change(screen.getByTestId("six-digit-input-2"), { target: { value: "3" } });
    fireEvent.change(screen.getByTestId("six-digit-input-3"), { target: { value: "4" } });
    fireEvent.change(screen.getByTestId("six-digit-input-4"), { target: { value: "5" } });
    expect(onComplete).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId("six-digit-input-5"), { target: { value: "6" } });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith("123456");
  });
});

// ─── 8. Disabled / a11y ──────────────────────────────────────────────────────

describe("SixDigitInput — disabled and a11y", () => {
  it("disabled cascades to every input", () => {
    render(<Harness disabled />);
    for (let i = 0; i < 6; i++) {
      const input = screen.getByTestId(`six-digit-input-${i}`) as HTMLInputElement;
      expect(input.disabled).toBe(true);
    }
  });

  it("describedBy propagates to every input's aria-describedby", () => {
    render(<Harness describedBy="totp-error-msg" />);
    for (let i = 0; i < 6; i++) {
      const input = screen.getByTestId(`six-digit-input-${i}`);
      expect(input.getAttribute("aria-describedby")).toBe("totp-error-msg");
    }
  });
});
