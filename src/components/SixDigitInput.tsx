/**
 * SixDigitInput — six adjacent single-character inputs for a TOTP code.
 *
 * Used by the TOTP enrolment wizard, disable flow, and regenerate-backup-codes
 * flow. Renders six `<input>` elements, one digit each, with the UX
 * conventions every authenticator app and bank UX uses:
 *
 *   - Type a digit → focus auto-advances to the next field.
 *   - Backspace on an empty field → focus moves back to the previous field.
 *   - Arrow keys → move focus left/right without typing.
 *   - Paste a 6-digit string into ANY field → all six fields populate at once
 *     and the last field gets focus (or the first non-digit field if the
 *     paste payload was malformed).
 *   - Non-digit keys are silently ignored. The browser-level `inputMode='numeric'`
 *     gives the right keyboard on mobile; pattern + maxLength stop most
 *     accidental garbage; the keydown filter stops the rest.
 *
 * The component is fully controlled — the parent owns the string value.
 * Reasoning: the wizard's submit-button enabled-state, the auto-submit on
 * the sixth digit, and the inline error rendering all need to read the
 * current value, and they're all in the parent. Trying to lift state out
 * later is fiddly; controlled from day one is simpler.
 *
 * ## Accessibility
 *
 * - Each input has an `aria-label` like "Digit 1 of 6". A single shared
 *   `aria-describedby` points at the parent's error message id when
 *   provided, so screen readers announce the error after every keystroke.
 * - The grouping wrapper has `role='group'` and an `aria-label` so the
 *   widget is announced as a single named control rather than six anonymous
 *   inputs.
 * - `disabled` cascades to all six inputs so submit-in-flight states
 *   don't accept stray keystrokes.
 *
 * ## Why we don't use a single `<input>` with maxLength=6 and CSS letter-spacing
 *
 * Tried it; doesn't survive paste-from-password-manager (1Password sometimes
 * pastes "123 456" with a space) and screen reader announcements lump the
 * whole code into one utterance, which is worse than "1, 2, 3, ..." for
 * users who are listening for typos. Six fields is the conventional shape.
 */

"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";

export interface SixDigitInputProps {
  /** Current value as a 0–6 char digit string. Parent owns this. */
  value: string;
  /** Called with the new digit string after every keystroke or paste. */
  onChange: (next: string) => void;
  /** Called when the user has typed all 6 digits. Parent typically auto-submits here. */
  onComplete?: (full: string) => void;
  /** Whether all six inputs are disabled (e.g. during in-flight submit). */
  disabled?: boolean;
  /** id of an external element describing an error or hint. Forwarded as aria-describedby. */
  describedBy?: string;
  /**
   * Optional aria-label for the group wrapper. Defaults to "Six-digit
   * verification code." Override only if the visible label nearby is more
   * specific (e.g. "Enter the code from your authenticator app").
   */
  ariaLabel?: string;
  /**
   * data-testid on the group wrapper. Each input gets `${dataTestId}-${idx}`.
   * Defaults to "six-digit-input".
   */
  dataTestId?: string;
  /**
   * Focus the first input on mount, and re-focus the first input whenever
   * the controlled `value` transitions from non-empty back to "" (which is
   * the parent's signal that a submit just failed and the user should
   * retry). Opt-in because the widget is rendered on three different
   * surfaces and only the primary-action surface wants this.
   *
   * Default: false (no auto-focus, no clear-recovery focus).
   */
  autoFocus?: boolean;
}

const FIELDS = [0, 1, 2, 3, 4, 5] as const;

/** Canonicalise a paste-payload into 6 digit chars. Strips spaces and
 *  punctuation, returns only the digits. Truncates to 6. */
function extractDigits(raw: string): string {
  return (raw.match(/\d/g) ?? []).join("").slice(0, 6);
}

export function SixDigitInput({
  value,
  onChange,
  onComplete,
  disabled = false,
  describedBy,
  ariaLabel = "Six-digit verification code",
  dataTestId = "six-digit-input",
  autoFocus = false,
}: SixDigitInputProps) {
  const refs = useRef<Array<HTMLInputElement | null>>(Array(6).fill(null));
  // Track the previous value length so we can detect the
  //   "non-empty → empty" transition that signals a parent-side clear
  //   (e.g. after a failed verify). Using a ref rather than a state
  // value because we read it inside an effect and don't want re-renders.
  const prevValueLengthRef = useRef<number>(value.length);

  // Pad to 6 for rendering — the controlled value can be 0..6 chars; we
  // expand to 6 fields so the layout doesn't shift as the user types.
  const digits = useMemo(() => {
    const out = ["", "", "", "", "", ""];
    for (let i = 0; i < Math.min(value.length, 6); i++) out[i] = value[i] ?? "";
    return out;
  }, [value]);

  // ── Focus management ─────────────────────────────────────────────────────
  // 1. On mount, focus field 0 if autoFocus is true. This lets surfaces like
  //    the 2FA login challenge / wizard verify step accept keystrokes the
  //    moment the page renders, without the user having to click.
  // 2. When the controlled value transitions from non-empty back to "",
  //    re-focus field 0. The parent clears the value after a failed verify
  //    so the user can retry; without this they'd need to click input 1
  //    again, which is exactly the complaint that prompted this prop.
  // Both effects are no-ops when autoFocus is false — existing call sites
  // are unaffected.
  useEffect(() => {
    if (!autoFocus) return;
    const el = refs.current[0];
    if (el) el.focus();
    // Intentionally mount-only — listing autoFocus would still only run
    // once because the prop is effectively static at the call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const prevLen = prevValueLengthRef.current;
    prevValueLengthRef.current = value.length;
    if (!autoFocus) return;
    if (prevLen > 0 && value.length === 0) {
      const el = refs.current[0];
      if (el) el.focus();
    }
  }, [value.length, autoFocus]);

  /** Move focus to a specific field if it exists. */
  const focusField = useCallback((idx: number) => {
    const el = refs.current[idx];
    if (el) el.focus();
  }, []);

  /** Update the digit string at position `idx` and emit onChange + onComplete. */
  const setDigitAt = useCallback(
    (idx: number, next: string) => {
      const draft = digits.slice();
      draft[idx] = next;
      // Recompute as a contiguous prefix — if the user clears digit 3, we
      // truncate to "12" rather than leaving "12 4 5 6". This matches how
      // every banking UX treats a hole: backspace erases everything to its
      // right. Tried preserving holes; users found it surprising.
      let joined = "";
      for (const d of draft) {
        if (d === "") break;
        joined += d;
      }
      onChange(joined);
      if (joined.length === 6 && onComplete) onComplete(joined);
    },
    [digits, onChange, onComplete],
  );

  const handleChange = useCallback(
    (idx: number) => (e: ChangeEvent<HTMLInputElement>) => {
      // Browser fires onChange after maxLength rejects extra chars. We only
      // accept a single digit; non-digits get ignored at keydown but a
      // password manager autofill can land in onChange directly with a
      // multi-char string — handle that path by treating it as paste.
      const raw = e.target.value;
      if (raw.length > 1) {
        const cleaned = extractDigits(raw);
        if (cleaned) {
          onChange(cleaned);
          if (cleaned.length === 6 && onComplete) onComplete(cleaned);
          focusField(Math.min(cleaned.length, 5));
        }
        return;
      }
      if (raw === "" || /^\d$/.test(raw)) {
        setDigitAt(idx, raw);
        if (raw !== "" && idx < 5) focusField(idx + 1);
      }
    },
    [focusField, onChange, onComplete, setDigitAt],
  );

  const handleKeyDown = useCallback(
    (idx: number) => (e: KeyboardEvent<HTMLInputElement>) => {
      switch (e.key) {
        case "Backspace": {
          // Standard pattern: if the current field is empty, jump back AND
          // clear the previous one in the same keystroke. If the current
          // field has a digit, just clear it (handleChange will pick up the
          // empty value).
          if (digits[idx] === "" && idx > 0) {
            e.preventDefault();
            setDigitAt(idx - 1, "");
            focusField(idx - 1);
          }
          break;
        }
        case "ArrowLeft": {
          if (idx > 0) {
            e.preventDefault();
            focusField(idx - 1);
          }
          break;
        }
        case "ArrowRight": {
          if (idx < 5) {
            e.preventDefault();
            focusField(idx + 1);
          }
          break;
        }
        case "Home": {
          e.preventDefault();
          focusField(0);
          break;
        }
        case "End": {
          e.preventDefault();
          focusField(5);
          break;
        }
        default: {
          // Filter non-digit, non-control keys so the browser doesn't
          // briefly accept "a" before our onChange rejects it. Single
          // printable chars that aren't digits get blocked at keydown.
          if (e.key.length === 1 && !/^\d$/.test(e.key)) {
            e.preventDefault();
          }
        }
      }
    },
    [digits, focusField, setDigitAt],
  );

  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLInputElement>) => {
      // Pasting anywhere fills all 6 fields. We extract digits regardless
      // of whether the user pasted "123456", "123 456", "123-456", or a
      // copied authenticator-app payload that bundles a label.
      e.preventDefault();
      const cleaned = extractDigits(e.clipboardData.getData("text"));
      if (!cleaned) return;
      onChange(cleaned);
      if (cleaned.length === 6 && onComplete) onComplete(cleaned);
      focusField(Math.min(cleaned.length, 5));
    },
    [focusField, onChange, onComplete],
  );

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      data-testid={dataTestId}
      className="flex items-center gap-2 sm:gap-3"
    >
      {FIELDS.map((idx) => (
        <input
          key={idx}
          ref={(el) => {
            refs.current[idx] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={idx === 0 ? "one-time-code" : "off"}
          pattern="\d{1}"
          maxLength={1}
          value={digits[idx]}
          onChange={handleChange(idx)}
          onKeyDown={handleKeyDown(idx)}
          onPaste={handlePaste}
          disabled={disabled}
          aria-label={`Digit ${idx + 1} of 6`}
          aria-describedby={describedBy}
          data-testid={`${dataTestId}-${idx}`}
          className={[
            "h-12 w-10 rounded-lg border bg-white/[0.03] text-center font-mono text-lg",
            "border-white/10 text-white transition-colors outline-none",
            "focus:border-white/30 focus:bg-white/[0.06]",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "sm:h-14 sm:w-12 sm:text-xl",
          ].join(" ")}
        />
      ))}
    </div>
  );
}
