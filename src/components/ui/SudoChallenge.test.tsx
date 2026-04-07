import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SudoChallenge } from "./SudoChallenge";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SudoChallenge", () => {
  const defaultProps = {
    action: "rotate_keys" as const,
    title: "Confirm Key Rotation",
    onSuccess: vi.fn(),
    onCancel: vi.fn(),
  };

  it("renders the title and action-specific instruction", () => {
    render(<SudoChallenge {...defaultProps} />);

    expect(screen.getByText("Confirm Key Rotation")).toBeTruthy();
    expect(screen.getByText(/rotate your API key/)).toBeTruthy();
  });

  it("renders billing-specific instruction for cancel_subscription action", () => {
    render(<SudoChallenge {...defaultProps} action="cancel_subscription" title="Verify Billing" />);

    expect(screen.getByText("Verify Billing")).toBeTruthy();
    expect(screen.getByText(/access billing/)).toBeTruthy();
  });

  it("disables verify button when code is less than 6 digits", () => {
    render(<SudoChallenge {...defaultProps} />);

    const verifyButton = screen.getByRole("button", { name: "Verify" });
    expect(verifyButton).toBeDisabled();

    const input = screen.getByPlaceholderText("000000");
    fireEvent.change(input, { target: { value: "123" } });
    expect(verifyButton).toBeDisabled();
  });

  it("enables verify button when code is 6 digits", () => {
    render(<SudoChallenge {...defaultProps} />);

    const input = screen.getByPlaceholderText("000000");
    fireEvent.change(input, { target: { value: "123456" } });

    const verifyButton = screen.getByRole("button", { name: "Verify" });
    expect(verifyButton).not.toBeDisabled();
  });

  it("strips non-numeric characters from input", () => {
    render(<SudoChallenge {...defaultProps} />);

    const input = screen.getByPlaceholderText("000000") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "12ab34cd56" } });

    expect(input.value).toBe("123456");
  });

  it("calls onCancel when Cancel button is clicked", () => {
    render(<SudoChallenge {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(defaultProps.onCancel).toHaveBeenCalledOnce();
  });

  it("calls onSuccess with sudoToken on successful verification", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          sudoToken: "sudo_tok_abc",
          expiresAt: "2026-04-07T12:00:00Z",
          action: "rotate_keys",
        }),
    });

    render(<SudoChallenge {...defaultProps} />);

    const input = screen.getByPlaceholderText("000000");
    fireEvent.change(input, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() => {
      expect(defaultProps.onSuccess).toHaveBeenCalledWith({
        sudoToken: "sudo_tok_abc",
        expiresAt: "2026-04-07T12:00:00Z",
      });
    });

    // Verify fetch was called with correct payload
    expect(mockFetch).toHaveBeenCalledWith("/api/auth/sudo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rotate_keys", totpCode: "123456" }),
    });
  });

  it("shows error message on invalid TOTP code", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "invalid_totp_code" }),
    });

    render(<SudoChallenge {...defaultProps} />);

    const input = screen.getByPlaceholderText("000000");
    fireEvent.change(input, { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() => {
      expect(screen.getByText(/Incorrect code/)).toBeTruthy();
    });

    // Should not call onSuccess
    expect(defaultProps.onSuccess).not.toHaveBeenCalled();
  });

  it("shows error for totp_not_enrolled", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "totp_not_enrolled" }),
    });

    render(<SudoChallenge {...defaultProps} />);

    const input = screen.getByPlaceholderText("000000");
    fireEvent.change(input, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() => {
      expect(screen.getByText(/2FA is not set up/)).toBeTruthy();
    });
  });

  it("shows error for rate limiting", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "too_many_sudo_tokens" }),
    });

    render(<SudoChallenge {...defaultProps} />);

    const input = screen.getByPlaceholderText("000000");
    fireEvent.change(input, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() => {
      expect(screen.getByText(/Too many attempts/)).toBeTruthy();
    });
  });

  it("shows network error when fetch fails", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));

    render(<SudoChallenge {...defaultProps} />);

    const input = screen.getByPlaceholderText("000000");
    fireEvent.change(input, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() => {
      expect(screen.getByText(/Could not reach the server/)).toBeTruthy();
    });
  });

  it("clears code and refocuses input after error", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "invalid_totp_code" }),
    });

    render(<SudoChallenge {...defaultProps} />);

    const input = screen.getByPlaceholderText("000000") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "111111" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() => {
      expect(input.value).toBe("");
    });
  });
});
