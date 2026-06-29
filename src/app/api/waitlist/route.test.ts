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
    const res = await POST(req({ email: "x@evil.com", ip: "10.0.0.2", origin: "https://evil.example" }));
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
