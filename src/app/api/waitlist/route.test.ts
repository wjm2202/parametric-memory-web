import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Abuse-prevention tests for POST /api/waitlist.
 *
 * This route sends two emails per call — one to support, one to the
 * caller-supplied address. Without controls it is an email-bomb + Resend cost
 * amplifier. These tests lock the invariants:
 *   - cross-site requests (no/foreign Origin) are rejected before any send;
 *   - a per-IP burst cap fires;
 *   - a per-email cooldown fires;
 *   - none of the above ever calls Resend.
 *
 * Resend is mocked so no network/email happens. The in-process limiters are
 * module-level singletons, so each test uses unique IPs/emails to isolate.
 */

const sendMock = vi.fn().mockResolvedValue({ id: "mock" });
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({ emails: { send: sendMock } })),
}));

process.env.RESEND_API_KEY = "re_test_key";

let POST: (req: NextRequest) => Promise<Response>;
beforeAll(async () => {
  ({ POST } = await import("./route"));
});
afterEach(() => sendMock.mockClear());

const ORIGIN = "http://localhost";

function req(opts: { email?: string; ip?: string; origin?: string | null }) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.origin !== null) headers["origin"] = opts.origin ?? ORIGIN;
  if (opts.ip) headers["x-forwarded-for"] = opts.ip;
  return new NextRequest("http://localhost/api/waitlist", {
    method: "POST",
    headers,
    body: JSON.stringify({ email: opts.email ?? "a@b.com" }),
  });
}

describe("POST /api/waitlist — abuse prevention", () => {
  it("accepts a valid same-origin signup and sends two emails", async () => {
    const res = await POST(req({ email: "ok@example.com", ip: "10.0.0.1" }));
    expect(res.status).toBe(200);
    expect(sendMock).toHaveBeenCalledTimes(2); // internal + confirmation
  });

  it("rejects a cross-site request (foreign Origin) with 403 and sends nothing", async () => {
    const res = await POST(
      req({ email: "x@evil.com", ip: "10.0.0.2", origin: "https://evil.example" }),
    );
    expect(res.status).toBe(403);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("rejects a mutating request with no Origin/Referer (403) and sends nothing", async () => {
    const res = await POST(req({ email: "y@evil.com", ip: "10.0.0.3", origin: null }));
    expect(res.status).toBe(403);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid email with 400 before any rate-limit token or send", async () => {
    const res = await POST(req({ email: "not-an-email", ip: "10.0.0.4" }));
    expect(res.status).toBe(400);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("trips the per-IP burst cap (5/min) and stops sending on the 6th", async () => {
    const ip = "10.9.9.9";
    // 5 distinct emails from one IP — allowed (email cooldown not hit).
    for (let i = 0; i < 5; i++) {
      const ok = await POST(req({ email: `burst${i}@example.com`, ip }));
      expect(ok.status).toBe(200);
    }
    sendMock.mockClear();
    const sixth = await POST(req({ email: "burst5@example.com", ip }));
    expect(sixth.status).toBe(429);
    expect(sendMock).not.toHaveBeenCalled(); // no email on the throttled call
  });

  it("trips the per-email cooldown (same address, different IPs)", async () => {
    const email = "repeat@example.com";
    const first = await POST(req({ email, ip: "10.1.1.1" }));
    expect(first.status).toBe(200);
    sendMock.mockClear();
    const second = await POST(req({ email, ip: "10.2.2.2" })); // different IP → isolates the email cap
    expect(second.status).toBe(429);
    expect(sendMock).not.toHaveBeenCalled();
  });
});

/**
 * Addressing + escaping (Proton cutover, 2026-10-08).
 *
 * - The sending subdomain has no inbox, so the confirmation must set replyTo
 *   to the support@ Proton alias or replies are silently lost.
 * - The internal alert goes to support@ (never a personal mailbox) with
 *   replyTo = the signer, so Reply goes straight back to them.
 * - The signer's address is caller-supplied and the validation regex allows
 *   `<`, `>` and `"`, so it must be HTML-escaped in the confirmation body.
 */
describe("POST /api/waitlist — addressing and escaping", () => {
  it("sends the internal alert to SUPPORT_EMAIL with replyTo = signer", async () => {
    const { SUPPORT_EMAIL, TRANSACTIONAL_FROM } = await import("@/config/site");
    const res = await POST(req({ email: "alert-check@example.com", ip: "10.9.0.1" }));
    expect(res.status).toBe(200);
    const alert = sendMock.mock.calls[0][0];
    expect(alert.from).toBe(TRANSACTIONAL_FROM);
    expect(alert.to).toEqual([SUPPORT_EMAIL]);
    expect(alert.replyTo).toBe("alert-check@example.com");
  });

  it("sends the confirmation to the signer with replyTo = SUPPORT_EMAIL", async () => {
    const { SUPPORT_EMAIL, TRANSACTIONAL_FROM } = await import("@/config/site");
    await POST(req({ email: "confirm-check@example.com", ip: "10.9.0.2" }));
    const confirmation = sendMock.mock.calls[1][0];
    expect(confirmation.from).toBe(TRANSACTIONAL_FROM);
    expect(confirmation.to).toEqual(["confirm-check@example.com"]);
    expect(confirmation.replyTo).toBe(SUPPORT_EMAIL);
    expect(SUPPORT_EMAIL).toBe("support@parametric-memory.dev");
  });

  it("HTML-escapes a crafted signer address in the confirmation body", async () => {
    const crafted = 'x"><b>pwn</b>@evil.example';
    const res = await POST(req({ email: crafted, ip: "10.9.0.3" }));
    expect(res.status).toBe(200);
    const html: string = sendMock.mock.calls[1][0].html;
    expect(html).not.toContain("<b>pwn</b>");
    expect(html).toContain("x&quot;&gt;&lt;b&gt;pwn&lt;/b&gt;@evil.example");
  });
});

/**
 * Resend v3+ resolves { data: null, error } instead of throwing. Before
 * 2026-10-08 the route ignored that and reported success even when no mail
 * went out. These tests pin the explicit error handling.
 */
describe("POST /api/waitlist — Resend API errors", () => {
  const apiError = {
    data: null,
    error: { name: "validation_error", message: "domain not verified" },
  };

  it("returns 502 when the confirmation send reports an error", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    sendMock
      .mockResolvedValueOnce({ data: { id: "alert" }, error: null })
      .mockResolvedValueOnce(apiError);
    const res = await POST(req({ email: "confirm-fails@example.com", ip: "10.9.1.1" }));
    expect(res.status).toBe(502);
    expect(errSpy).toHaveBeenCalledWith("[waitlist] Confirmation not sent:", apiError.error);
    errSpy.mockRestore();
  });

  it("still confirms the signer (200) when only the internal alert fails, and logs it", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    sendMock
      .mockResolvedValueOnce(apiError)
      .mockResolvedValueOnce({ data: { id: "confirmation" }, error: null });
    const res = await POST(req({ email: "alert-fails@example.com", ip: "10.9.1.2" }));
    expect(res.status).toBe(200);
    expect(sendMock).toHaveBeenCalledTimes(2);
    expect(errSpy).toHaveBeenCalledWith("[waitlist] Internal alert not sent:", apiError.error);
    errSpy.mockRestore();
  });
});
