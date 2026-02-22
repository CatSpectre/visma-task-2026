import { test, expect } from "@playwright/test";
import { searchFor } from "./helpers";

/**
 * ============================================================================
 * Test Scenario: Faceted Search and Filter Persistence
 * ============================================================================
 *
 * WHAT THIS TEST DOES:
 *   Performs a broad search for "puhelin" (phone), then applies the "Brändit"
 *   (Brand) filter from the sidebar to select "Apple". The test verifies that:
 *     1. The URL updates to include the brand filter parameter.
 *     2. Every visible product in the results contains "Apple" in its title.
 *     3. After navigating to a product page and clicking Back, the filters
 *        remain active in the URL and the filtered results are restored.
 *
 * WHY THIS IS A GOOD CANDIDATE FOR AUTOMATION:
 *   Testing filters manually is incredibly tedious and prone to human error,
 *   as it requires checking specific data attributes against a large set of
 *   results. Automation can instantly validate that the logic behind the
 *   product grid remains sound across filter combinations.
 * ============================================================================
 */
test.describe("Verkkokauppa.com – Faceted search and filter persistence", () => {
  test("Applying brand filter shows only matching products and persists after back-navigation", async ({
    page,
  }) => {
    // Step 1: Search for "puhelin" (phone)
    await searchFor(page, "puhelin");

    const productCards = page.locator("article:not([role='alert'])");
    await productCards.first().waitFor({ state: "visible", timeout: 10_000 });

    // Step 2: Apply the "Brändit" (Brand) filter — select Apple
    const branditBtn = page.getByRole("button", { name: /^Brändit$/i });
    await branditBtn.first().waitFor({ state: "visible", timeout: 10_000 });
    await branditBtn.first().click();

    // Click the Apple checkbox label
    const appleLabel = page.locator("label").filter({ hasText: /^Apple\s*\d/i }).first();
    await appleLabel.waitFor({ state: "visible", timeout: 5_000 });
    await appleLabel.click();

    // Wait for the URL to reflect the brand filter
    await page.waitForURL(/filter(%5B|\[)brand(%5D|\])=/i, { timeout: 10_000 });

    // Close the filter sidebar so its overlay doesn't block product cards
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1_000);

    // Wait for filtered results to fully load (not just skeleton placeholders)
    const loadedProduct = productCards.first().locator("a[href*='/fi/product/']");
    await expect(loadedProduct).toBeVisible({ timeout: 15_000 });
    await expect(productCards.first()).not.toContainText("loading", { timeout: 10_000 });

    // Step 3: Verify that every visible product contains "Apple"
    const productCount = await productCards.count();
    expect(productCount, "Should have at least 1 filtered product").toBeGreaterThan(0);

    // Check a sample of products (up to the first 10)
    const sampleSize = Math.min(productCount, 10);
    for (let i = 0; i < sampleSize; i++) {
      const productText = await productCards.nth(i).innerText();
      expect(
        productText.toLowerCase()
      ).toContain("apple");
    }

    // Step 4: Navigate to the first product page, then go Back
    const firstProductLink = productCards
      .first()
      .locator("a[href*='/fi/product/']")
      .first();
    // Extract href and navigate directly — sidebar overlay may intercept clicks
    const productHref = await firstProductLink.getAttribute("href");
    expect(productHref, "Product link should have an href").toBeTruthy();
    await page.goto(productHref!);

    await expect(page).toHaveURL(/\/fi\/product\//i, { timeout: 15_000 });

    // Go back to the filtered search results
    await page.goBack();
    await page.waitForLoadState("domcontentloaded");

    // Step 5: Verify filter persistence after back-navigation
    await expect(page).toHaveURL(/filter(%5B|\[)brand(%5D|\])=/i, { timeout: 10_000 });

    // Wait for products to re-render (not just skeleton placeholders)
    const reloadedProduct = productCards.first().locator("a[href*='/fi/product/']");
    await expect(reloadedProduct).toBeVisible({ timeout: 15_000 });
    await expect(productCards.first()).not.toContainText("loading", { timeout: 10_000 });

    // Re-verify that products are still Apple-only after back-navigation
    const postBackCount = await productCards.count();
    expect(postBackCount, "Should still have filtered products after Back").toBeGreaterThan(0);

    const postBackSample = Math.min(postBackCount, 5);
    for (let i = 0; i < postBackSample; i++) {
      const productText = await productCards.nth(i).innerText();
      expect(
        productText.toLowerCase()
      ).toContain("apple");
    }
  });
});
