import { test, expect } from "@playwright/test";
import { dismissCookieConsent } from "./helpers";

/**
 * ============================================================================
 * Test Scenario: Product Comparison via Category Navigation
 * ============================================================================
 *
 * WHAT THIS TEST DOES:
 *   Navigates: Etusivu → Tietotekniikka → Tietokoneiden komponentit →
 *   RAM-muistit. Selects the first two products for comparison using the
 *   compare button on each product card, clicks "Vertaile" in the comparison
 *   bar that appears, and asserts that:
 *     1. The comparison view has the heading "Tuotevertailu".
 *     2. Both selected products are listed in the comparison.
 *
 * WHY THIS IS A GOOD CANDIDATE FOR AUTOMATION:
 *   Product comparison is a core feature in verkkokauppa.com, especially for technical
 *   products. The test involves category navigation, UI state management (the
 *   floating comparison bar), and a dedicated comparison view. Multiple
 *   components that can break independently after deployments. Automated tests
 *   ensure the feature works end-to-end on every build.
 * ============================================================================
 */
test.describe("Verkkokauppa.com – Product comparison", () => {
  test("Selecting two RAM products via category navigation and comparing them opens the Tuotevertailu view", async ({
    page,
  }) => {
    // Step 1: Navigate to the homepage and dismiss cookies
    await page.goto("/fi/etusivu");
    await page.waitForLoadState("domcontentloaded");
    await dismissCookieConsent(page);

    // Step 2: Click "Tietotekniikka" category
    const tietotekniikkaLink = page.getByRole("link", { name: /^Tietotekniikka$/i })
      .or(page.locator("a[data-testid='information_technology']"));
    await tietotekniikkaLink.first().waitFor({ state: "visible", timeout: 10_000 });
    await tietotekniikkaLink.first().click();

    // Step 3: Click "Tietokoneiden komponentit"
    const komponentitLink = page.getByRole("link", { name: /Tietokoneiden komponentit/i });
    await komponentitLink.first().waitFor({ state: "visible", timeout: 10_000 });
    await komponentitLink.first().click();

    // Step 4: Click "RAM-muistit"
    const ramLink = page.getByRole("link", { name: /RAM-muistit/i });
    await ramLink.first().waitFor({ state: "visible", timeout: 10_000 });
    await ramLink.first().click();

    // Wait for products to load
    const productCards = page.locator("article:not([role='alert'])");
    await productCards.first().waitFor({ state: "visible", timeout: 10_000 });

    // Step 5: Capture product names and add both to comparison
    const firstProductTitle = await productCards.nth(0)
      .locator("a[href*='/fi/product/']").first().innerText();
    const secondProductTitle = await productCards.nth(1)
      .locator("a[href*='/fi/product/']").first().innerText();

    // Click the compare button on the first product card
    const firstCompareBtn = productCards.nth(0)
      .getByRole("button", { name: /Lisää tuote vertailuun/i });
    await firstCompareBtn.waitFor({ state: "visible", timeout: 5_000 });
    await firstCompareBtn.click();

    // Click the compare button on the second product card
    const secondCompareBtn = productCards.nth(1)
      .getByRole("button", { name: /Lisää tuote vertailuun/i });
    await secondCompareBtn.waitFor({ state: "visible", timeout: 5_000 });
    await secondCompareBtn.click();

    // Step 6: Navigate to the comparison page via the floating comparison bar link
    const vertaileLink = page.getByRole("link", { name: /Siirry tuotevertailusivulle/i })
      .or(page.locator("a[href*='/fi/product/comparison/']"));
    await vertaileLink.first().waitFor({ state: "visible", timeout: 10_000 });
    const comparisonHref = await vertaileLink.first().getAttribute("href");
    await page.goto(comparisonHref!);

    // Step 7: Assert the comparison view
    const comparisonHeading = page.locator("h1").filter({ hasText: /Tuotevertailu/i });
    await expect(comparisonHeading).toBeVisible({ timeout: 15_000 });

    // Both selected products must appear in the comparison view
    const firstTitleShort = firstProductTitle.trim().substring(0, 25);
    const secondTitleShort = secondProductTitle.trim().substring(0, 25);

    await expect(page.locator("body")).toContainText(firstTitleShort, { timeout: 10_000 });
    await expect(page.locator("body")).toContainText(secondTitleShort, { timeout: 10_000 });
  });
});
