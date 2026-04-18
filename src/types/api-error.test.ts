import { describe, it, expect } from "vitest";
import { apiError, isApiError } from "./api-error";

describe("ApiError", () => {
  describe("isApiError", () => {
    it("returns true for a valid ApiError with all required fields", () => {
      const validError = {
        error_code: "substrate_provisioning_timeout",
        human_message: "Your compute substrate took too long to start.",
        ai_message: "Substrate creation exceeded 5min. Retry or escalate.",
        next_action: "Try again in 2 minutes or contact support.",
      };
      expect(isApiError(validError)).toBe(true);
    });

    it("returns true for a valid ApiError including optional fields", () => {
      const validErrorWithOptionals = {
        error_code: "substrate_provisioning_timeout",
        human_message: "Your compute substrate took too long to start.",
        ai_message: "Substrate creation exceeded 5min. Retry or escalate.",
        next_action: "Try again in 2 minutes or contact support.",
        remediation_url: "/help/troubleshooting/provisioning",
        detail: "Internal: Worker timed out after 300s on droplet creation.",
      };
      expect(isApiError(validErrorWithOptionals)).toBe(true);
    });

    it("returns false if ai_message is missing", () => {
      const invalidError = {
        error_code: "substrate_provisioning_timeout",
        human_message: "Your compute substrate took too long to start.",
        next_action: "Try again in 2 minutes or contact support.",
      };
      expect(isApiError(invalidError)).toBe(false);
    });

    it("returns false if error_code is a number instead of a string", () => {
      const invalidError = {
        error_code: 123,
        human_message: "Your compute substrate took too long to start.",
        ai_message: "Substrate creation exceeded 5min. Retry or escalate.",
        next_action: "Try again in 2 minutes or contact support.",
      };
      expect(isApiError(invalidError)).toBe(false);
    });

    it("returns false for null", () => {
      expect(isApiError(null)).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(isApiError(undefined)).toBe(false);
    });

    it("returns false for a plain string", () => {
      expect(isApiError("error")).toBe(false);
    });

    it("returns false if remediation_url is present but not a string", () => {
      const invalidError = {
        error_code: "substrate_provisioning_timeout",
        human_message: "Your compute substrate took too long to start.",
        ai_message: "Substrate creation exceeded 5min. Retry or escalate.",
        next_action: "Try again in 2 minutes or contact support.",
        remediation_url: 123,
      };
      expect(isApiError(invalidError)).toBe(false);
    });

    it("returns false if detail is present but not a string", () => {
      const invalidError = {
        error_code: "substrate_provisioning_timeout",
        human_message: "Your compute substrate took too long to start.",
        ai_message: "Substrate creation exceeded 5min. Retry or escalate.",
        next_action: "Try again in 2 minutes or contact support.",
        detail: { status: "timeout" },
      };
      expect(isApiError(invalidError)).toBe(false);
    });
  });

  describe("apiError", () => {
    it("passes input through unchanged", () => {
      const input = {
        error_code: "test_error",
        human_message: "A test error occurred.",
        ai_message: "Test error. Retry.",
        next_action: "Retry the operation.",
      };
      const output = apiError(input);
      expect(output).toEqual(input);
    });
  });
});
