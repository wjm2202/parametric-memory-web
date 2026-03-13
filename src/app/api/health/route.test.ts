import { describe, it, expect } from "vitest";
import { GET } from "./route";

describe("GET /api/health", () => {
  it("returns status ok with expected fields", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body).toHaveProperty("version");
    expect(body).toHaveProperty("commit");
    expect(body).toHaveProperty("uptime");
    expect(body).toHaveProperty("timestamp");
    expect(typeof body.uptime).toBe("number");
  });
});
