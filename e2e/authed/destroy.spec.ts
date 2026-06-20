/**
 * Destroy & Unsubscribe modal (D2) — authed e2e.
 *
 * Drives the REAL rendered modal on /admin, but intercepts the money endpoints
 * so nothing is actually destroyed or refunded:
 *   - the refund preview is mocked to load an amount;
 *   - POST /destroy is mocked, so the request never reaches the backend.
 * Both paths tested change NOTHING on the real account.
 *
 * Primary assertion is the NO-SILENT-BLOCK contract: a 409
 * `refund_requires_manual_review` MUST surface honest copy in the modal (the
 * customer is told nothing was charged and the substrate is untouched), with no
 * success and the modal staying open.
 */

import { test, expect } from "@playwright/test";

const PREVIEW_GLOB = "**/api/substrates/*/cancel/refund-preview";
const DESTROY_GLOB = "**/api/substrates/*/destroy";

async function mockRefundPreview(page: import("@playwright/test").Page) {
  await page.route(PREVIEW_GLOB, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        refundCents: 350,
        withheldFeeCents: 0,
        refundableBaseCents: 350,
        currency: "usd",
        reason: "cancellation_prorated",
      }),
    }),
  );
}

async function openDestroyNow(page: import("@playwright/test").Page) {
  await page.goto("/admin");
  const destroyBtn = page.getByRole("button", { name: /destroy substrate/i });
  await expect(
    destroyBtn,
    "expected a running substrate with the Destroy control in the danger zone",
  ).toBeVisible();
  await destroyBtn.click();
  await expect(page.getByTestId("destroy-modal")).toBeVisible();

  // Choose immediate destroy, wait for the (mocked) refund preview, type-to-confirm.
  await page.getByTestId("destroy-timing-now").click();
  await expect(page.getByTestId("destroy-refund-amount")).toBeVisible();
  await page.getByTestId("destroy-confirm-input").fill("destroy");
  const confirm = page.getByTestId("destroy-modal-confirm");
  await expect(confirm).toBeEnabled();
  return confirm;
}

test.describe("Destroy & Unsubscribe modal", () => {
  test("NO SILENT BLOCK: a 409 manual-review surfaces honest copy and destroys nothing", async ({
    page,
  }) => {
    await mockRefundPreview(page);
    let destroyCalled = false;
    await page.route(DESTROY_GLOB, (route) => {
      destroyCalled = true;
      return route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ error: "refund_requires_manual_review" }),
      });
    });

    const confirm = await openDestroyNow(page);
    await confirm.click();

    // The manual-review outcome is surfaced; nothing succeeded.
    const err = page.getByTestId("destroy-modal-error");
    await expect(err).toContainText(/manual review/i);
    await expect(err).toContainText(/not been charged or refunded/i);
    // Modal stays open on failure (so the user can retry / read the message).
    await expect(page.getByTestId("destroy-modal")).toBeVisible();
    expect(destroyCalled).toBe(true);
  });

  test("success: a 200 destroy closes the modal (request mocked — nothing real torn down)", async ({
    page,
  }) => {
    await mockRefundPreview(page);
    await page.route(DESTROY_GLOB, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          timing: "now",
          destroyed: true,
          deprovisioned: true,
          refund: { refunded: true, amountCents: 350, withheldFeeCents: 0 },
          reactivatable: false,
        }),
      }),
    );

    const confirm = await openDestroyNow(page);
    await confirm.click();

    // On success the modal closes (and a success toast fires, not asserted here).
    await expect(page.getByTestId("destroy-modal")).toHaveCount(0);
    await expect(page.getByTestId("destroy-modal-error")).toHaveCount(0);
  });

  // Layout regression: on a short viewport the tall modal (two timing options +
  // refund preview + irreversible warning + type-to-confirm input) used to push
  // the action buttons off the bottom with no way to scroll to them. The footer
  // is now pinned and the body scrolls — so the Destroy button must stay within
  // the viewport. Read-only: we never click confirm (no destroy request).
  test("layout: action buttons stay on-screen on a short viewport", async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 460 });
    await mockRefundPreview(page);

    // openDestroyNow opens the modal and selects "now" (the tallest content),
    // returning the confirm button. It never submits.
    const confirm = await openDestroyNow(page);

    await expect(page.getByTestId("destroy-modal-footer")).toBeInViewport();
    await expect(confirm).toBeInViewport();
  });
});
