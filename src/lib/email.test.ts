import { describe, it, expect } from "vitest";
import { escapeHtml, toHeaderValue } from "./email";

describe("escapeHtml", () => {
  it("escapes all five HTML-significant characters", () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe(
      "&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;",
    );
  });

  it("leaves ordinary email addresses untouched", () => {
    expect(escapeHtml("ada.lovelace+tag@example.co.nz")).toBe("ada.lovelace+tag@example.co.nz");
  });

  it("neutralises an address crafted to inject markup (passes the waitlist regex)", () => {
    const crafted = 'x"><img/src=//evil.example/p.png>@evil.example';
    const out = escapeHtml(crafted);
    expect(out).not.toContain("<");
    expect(out).not.toContain('"');
  });
});

describe("toHeaderValue", () => {
  it("removes CR/LF so a value cannot start a new header", () => {
    expect(toHeaderValue("Hello\r\nBcc: victim@example.com")).toBe("Hello Bcc: victim@example.com");
  });

  it("collapses whitespace and trims", () => {
    expect(toHeaderValue("  a \t  b  ")).toBe("a b");
  });

  it("truncates long values with an ellipsis at the limit", () => {
    const out = toHeaderValue("x".repeat(500), 20);
    expect(out).toHaveLength(20);
    expect(out.endsWith("…")).toBe(true);
  });

  it("returns short values unchanged", () => {
    expect(toHeaderValue("Ada Lovelace")).toBe("Ada Lovelace");
  });
});
