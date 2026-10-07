/**
 * Email side effect of handleCapacityInquiry (added 2026-10-08).
 *
 * Before this, enterprise / capacity inquiries only reached stdout (and an
 * optional webhook) — sales leads could sit unseen in Docker logs. Now each
 * valid inquiry is emailed to support@ with replyTo = the enquirer.
 *
 * Invariants:
 *   - goes to SUPPORT_EMAIL from TRANSACTIONAL_FROM, replyTo = enquirer
 *   - subject is header-safe (no CR/LF from a crafted name)
 *   - invalid payloads send nothing
 *   - missing RESEND_API_KEY → no send, request still ok
 *   - Resend { error } or a throw → logged, request still ok
 *   - per-enquirer limit suppresses repeat emails (request still ok)
 *
 * The limiters are module-level singletons, so each test uses a unique email.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const sendMock = vi.fn();
vi.mock("resend", () => ({ Resend: vi.fn() }));

import { Resend } from "resend";
import { handleCapacityInquiry } from "./handler";
import { SUPPORT_EMAIL, TRANSACTIONAL_FROM } from "@/config/site";

let errorSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  process.env.RESEND_API_KEY = "re_test_key";
  // Re-applied every test: vi.restoreAllMocks() in afterEach also strips
  // implementations from vi.fn() mocks, including the mocked constructor.
  vi.mocked(Resend).mockImplementation(
    () => ({ emails: { send: sendMock } }) as unknown as InstanceType<typeof Resend>,
  );
  sendMock.mockReset().mockResolvedValue({ data: { id: "mock" }, error: null });
  vi.spyOn(console, "log").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.RESEND_API_KEY;
});

const payload = (email: string, overrides: Record<string, string> = {}) => ({
  name: "Ada Lovelace",
  email,
  tier: "pro",
  message: "We need 10x the atoms.",
  ...overrides,
});

describe("handleCapacityInquiry — email to support@", () => {
  it("emails SUPPORT_EMAIL from TRANSACTIONAL_FROM with replyTo = enquirer", async () => {
    const result = await handleCapacityInquiry(payload("lead-1@example.com"));
    expect(result).toEqual({ ok: true });
    expect(sendMock).toHaveBeenCalledTimes(1);
    const mail = sendMock.mock.calls[0][0];
    expect(mail.from).toBe(TRANSACTIONAL_FROM);
    expect(mail.to).toEqual([SUPPORT_EMAIL]);
    expect(mail.replyTo).toBe("lead-1@example.com");
    expect(mail.subject).toBe("[Capacity inquiry] pro — Ada Lovelace");
    expect(mail.text).toContain("We need 10x the atoms.");
    expect(mail.text).toContain("lead-1@example.com");
  });

  it("keeps the subject header-safe when the name contains CR/LF", async () => {
    await handleCapacityInquiry(payload("lead-2@example.com", { name: "Eve\r\nBcc: x@y.z" }));
    const subject: string = sendMock.mock.calls[0][0].subject;
    expect(subject).not.toMatch(/[\r\n]/);
  });

  it("sends nothing for an invalid payload", async () => {
    const result = await handleCapacityInquiry(payload("not-an-email"));
    expect(result).toEqual({ ok: false, status: 400, error: "invalid_email" });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("skips the email (but still succeeds) when RESEND_API_KEY is not set", async () => {
    delete process.env.RESEND_API_KEY;
    const result = await handleCapacityInquiry(payload("lead-3@example.com"));
    expect(result).toEqual({ ok: true });
    expect(sendMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("RESEND_API_KEY not set"));
  });

  it("logs a Resend { error } response and still returns ok", async () => {
    const apiError = { name: "validation_error", message: "domain not verified" };
    sendMock.mockResolvedValueOnce({ data: null, error: apiError });
    const result = await handleCapacityInquiry(payload("lead-4@example.com"));
    expect(result).toEqual({ ok: true });
    expect(errorSpy).toHaveBeenCalledWith("[capacity-inquiry] Email not sent:", apiError);
  });

  it("logs a thrown send error and still returns ok", async () => {
    sendMock.mockRejectedValueOnce(new Error("network down"));
    const result = await handleCapacityInquiry(payload("lead-5@example.com"));
    expect(result).toEqual({ ok: true });
    expect(errorSpy).toHaveBeenCalledWith(
      "[capacity-inquiry] Email delivery threw:",
      expect.any(Error),
    );
  });

  it("suppresses a repeat email from the same enquirer within the window (request still ok)", async () => {
    await handleCapacityInquiry(payload("Lead-6@example.com"));
    const second = await handleCapacityInquiry(payload("lead-6@example.com"));
    expect(second).toEqual({ ok: true });
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("suppressed by rate limit"));
  });
});
