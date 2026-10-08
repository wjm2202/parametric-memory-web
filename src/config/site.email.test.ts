/**
 * Regression (2026-10-08): after moving the domain to the Pro Resend account,
 * every website email failed with Resend 403 "The send.parametric-memory.dev
 * domain is not verified" — TRANSACTIONAL_FROM used the `send.` subdomain,
 * which on the new setup is only Resend's return-path CNAME, not a sending
 * domain. The From must be on the exact verified domain.
 */
import { describe, it, expect } from "vitest";
import { TRANSACTIONAL_FROM, SUPPORT_EMAIL, LEGAL_EMAIL } from "./site";

const VERIFIED_RESEND_DOMAIN = "parametric-memory.dev";

function addressOf(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return (m ? m[1] : from).trim();
}

describe("TRANSACTIONAL_FROM", () => {
  it("sends from the exact Resend-verified domain (no subdomain)", () => {
    const domain = addressOf(TRANSACTIONAL_FROM).split("@")[1];
    expect(domain).toBe(VERIFIED_RESEND_DOMAIN);
  });

  it("is never the send. return-path host", () => {
    expect(TRANSACTIONAL_FROM).not.toMatch(/@send\./);
  });

  it("has a display name and a noreply local part", () => {
    expect(TRANSACTIONAL_FROM).toBe("Parametric Memory <noreply@parametric-memory.dev>");
  });
});

describe("human-facing aliases stay on the company domain", () => {
  it.each([SUPPORT_EMAIL, LEGAL_EMAIL])("%s", (addr) => {
    expect(addr.endsWith(`@${VERIFIED_RESEND_DOMAIN}`)).toBe(true);
  });
});
