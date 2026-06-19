/**
 * Tests for PersonaNameEditor (R10 slice 6 — "name your substrate").
 *
 * Covers:
 *   1.  Display mode shows the persona name when set.
 *   2.  Display mode falls back to the slug when persona is null.
 *   3.  Rename → edit mode, input pre-filled with the current name.
 *   4.  Save PATCHes /api/substrates/:slug/persona with the trimmed name.
 *   5.  Blank input saves name: null (clear).
 *   6.  Successful save calls onSaved and leaves edit mode.
 *   7.  too-long error from compute renders a friendly message; stays in edit mode; onSaved NOT called.
 *   8.  invalid-chars error renders its message.
 *   9.  Network failure renders a generic error.
 *  10.  Cancel leaves edit mode without saving.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { act } from "react";
import { PersonaNameEditor } from "./AdminClient";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function okResponse(body: unknown = { slug: "alice-one", personaName: "Acme Prod" }) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
}
function errResponse(error: string, status = 400) {
  return Promise.resolve({ ok: false, status, json: () => Promise.resolve({ error }) });
}

function renderEditor(overrides: { personaName?: string | null; onSaved?: () => void } = {}) {
  const onSaved = overrides.onSaved ?? vi.fn();
  const utils = render(
    <PersonaNameEditor
      slug="alice-one"
      personaName={overrides.personaName ?? null}
      onSaved={onSaved}
    />,
  );
  return { ...utils, onSaved };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockImplementation(() => okResponse());
});

describe("PersonaNameEditor — display mode", () => {
  it("shows the persona name when set", () => {
    renderEditor({ personaName: "Acme Prod" });
    expect(screen.getByTestId("persona-display")).toHaveTextContent("Acme Prod");
  });

  it("falls back to the slug when persona is null", () => {
    renderEditor({ personaName: null });
    expect(screen.getByTestId("persona-display")).toHaveTextContent("alice-one");
  });
});

describe("PersonaNameEditor — editing", () => {
  it("Rename enters edit mode with the input pre-filled", () => {
    renderEditor({ personaName: "Acme Prod" });
    fireEvent.click(screen.getByTestId("persona-edit-button"));
    expect(screen.getByTestId("persona-input")).toHaveValue("Acme Prod");
  });

  it("Save PATCHes the trimmed name and calls onSaved", async () => {
    const onSaved = vi.fn();
    renderEditor({ personaName: null, onSaved });
    fireEvent.click(screen.getByTestId("persona-edit-button"));
    fireEvent.change(screen.getByTestId("persona-input"), { target: { value: "  Acme Prod  " } });

    await act(async () => {
      fireEvent.click(screen.getByTestId("persona-save"));
    });

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/substrates/alice-one/persona");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ name: "Acme Prod" });
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  });

  it("a blank input saves name: null (clear)", async () => {
    renderEditor({ personaName: "Acme Prod" });
    fireEvent.click(screen.getByTestId("persona-edit-button"));
    fireEvent.change(screen.getByTestId("persona-input"), { target: { value: "   " } });

    await act(async () => {
      fireEvent.click(screen.getByTestId("persona-save"));
    });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ name: null });
  });

  it("leaves edit mode after a successful save", async () => {
    renderEditor({ personaName: null });
    fireEvent.click(screen.getByTestId("persona-edit-button"));
    fireEvent.change(screen.getByTestId("persona-input"), { target: { value: "Acme" } });

    await act(async () => {
      fireEvent.click(screen.getByTestId("persona-save"));
    });

    await waitFor(() => expect(screen.queryByTestId("persona-input")).toBeNull());
    expect(screen.getByTestId("persona-display")).toBeInTheDocument();
  });

  it("Cancel leaves edit mode without calling fetch", () => {
    renderEditor({ personaName: "Acme Prod" });
    fireEvent.click(screen.getByTestId("persona-edit-button"));
    fireEvent.click(screen.getByTestId("persona-cancel"));
    expect(screen.queryByTestId("persona-input")).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("PersonaNameEditor — errors", () => {
  it("renders a friendly message for persona_name_too_long and stays in edit mode", async () => {
    const onSaved = vi.fn();
    mockFetch.mockImplementation(() => errResponse("persona_name_too_long"));
    renderEditor({ personaName: null, onSaved });
    fireEvent.click(screen.getByTestId("persona-edit-button"));
    fireEvent.change(screen.getByTestId("persona-input"), { target: { value: "x" } });

    await act(async () => {
      fireEvent.click(screen.getByTestId("persona-save"));
    });

    expect(screen.getByTestId("persona-error")).toHaveTextContent(/80 characters or fewer/i);
    expect(screen.getByTestId("persona-input")).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("renders the invalid-chars message", async () => {
    mockFetch.mockImplementation(() => errResponse("persona_name_invalid_chars"));
    renderEditor({ personaName: null });
    fireEvent.click(screen.getByTestId("persona-edit-button"));
    fireEvent.change(screen.getByTestId("persona-input"), { target: { value: "x" } });

    await act(async () => {
      fireEvent.click(screen.getByTestId("persona-save"));
    });

    expect(screen.getByTestId("persona-error")).toHaveTextContent(/line breaks or control/i);
  });

  it("renders a generic message on network failure", async () => {
    mockFetch.mockImplementation(() => Promise.reject(new Error("ECONNREFUSED")));
    renderEditor({ personaName: null });
    fireEvent.click(screen.getByTestId("persona-edit-button"));
    fireEvent.change(screen.getByTestId("persona-input"), { target: { value: "x" } });

    await act(async () => {
      fireEvent.click(screen.getByTestId("persona-save"));
    });

    expect(screen.getByTestId("persona-error")).toHaveTextContent(/couldn't save/i);
  });
});
