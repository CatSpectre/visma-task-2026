import { test, expect } from "@playwright/test";
import { searchFor } from "./helpers";

/**
 * ============================================================================
 * Test Scenario: Add to Cart and Proceed to Checkout
 * ============================================================================
 *
 * WHAT THIS TEST DOES:
 *   Searches for "MacBook Air", adds the first result to the shopping cart,
 *   navigates to the cart, clicks "Siirry kassalle" (proceed to checkout),
 *   and asserts that the login prompt appears with the text:
 *   "Jatka tilaamista kirjautumalla sisään sähköpostiosoitteella ja salasanalla."
 *
 * WHY THIS IS A GOOD CANDIDATE FOR AUTOMATION:
 *   The add-to-cart → checkout flow is the most critical user journey in
 *   e-commerce. A broken button or missing redirect means zero sales!
 * ============================================================================
 */
test.describe("Verkkokauppa.com – Cart and checkout", () => {
  test("Adding MacBook Air to cart and proceeding to checkout displays the login prompt", async ({
    page,
  }) => {
    // Step 1: Search for MacBook Air
    await searchFor(page, "MacBook Air");

    // Step 2: Open the first product
    const productCards = page.locator("article:not([role='alert'])");
    await productCards.first().waitFor({ state: "visible", timeout: 10_000 });

    const firstProductLink = productCards
      .first()
      .locator("a[href*='/fi/product/']")
      .first();
    await firstProductLink.click();

    await expect(page).toHaveURL(/\/fi\/product\//i, { timeout: 15_000 });

    // Step 3: Click "Lisää ostoskoriin" (Add to cart)
    const addToCartButton = page.getByRole("button", {
      name: /Lisää ostoskoriin/i,
    });
    await expect(addToCartButton).toBeVisible({ timeout: 10_000 });
    await addToCartButton.click();

    // Step 4: Navigate to the cart directly
    await page.goto("/fi/cart");
    await page.waitForLoadState("domcontentloaded");
    await expect(page).toHaveURL(/\/fi\/cart/i, { timeout: 15_000 });

    // Step 5: Click "Siirry kassalle" (Proceed to checkout)
    const checkoutButton = page.getByRole("button", { name: /Siirry kassalle/i })
      .or(page.getByRole("link", { name: /Siirry kassalle/i }));
    await expect(checkoutButton.first()).toBeVisible({ timeout: 10_000 });
    await checkoutButton.first().click();

    // Step 6: Assert the login prompt appears
    await expect(
      page.locator("text=/Jatka tilaamista kirjautumalla sisään sähköpostiosoitteella ja salasanalla/i")
    ).toBeVisible({ timeout: 15_000 });
  });
});
