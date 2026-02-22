import { test, expect } from "@playwright/test";
import { searchFor } from "./helpers";

test.describe("Verkkokauppa.com – Search and Sort", () => {
  test("Sorting Nikon search results by highest price shows Nikon Z30 as the second result", async ({
    page,
  }) => {
    // Step 1: Search for "Nikon"
    await searchFor(page, "Nikon");

    await expect(page.locator("h1")).toContainText(/tulosta haulla/i, {
      timeout: 10_000,
    });

    // Step 2: Sort results from highest to lowest price
    const sortSelect = page.getByRole("combobox", {
      name: /Tuotteiden järjestys/i,
    });
    await sortSelect.waitFor({ state: "visible", timeout: 5_000 });
    await sortSelect.selectOption({ label: "Kalleimmat" });

    // Wait for the sorted results to load (URL sort=price%3Adesc)
    await page.waitForURL(/sort=price(%3A|:)desc/i, { timeout: 10_000 });
    // await page.waitForLoadState("networkidle");

    // Step 3: Select the second product
    const productCards = page.locator("article");
    await productCards.first().waitFor({ state: "visible", timeout: 10_000 });

    const secondProduct = productCards.nth(1).locator("a[href*='/fi/product/']").first();
    await secondProduct.scrollIntoViewIfNeeded();
    await secondProduct.click();

    await expect(page).toHaveURL(/\/fi\/product\//i, { timeout: 15_000 });

    // Step 5: Verify the product title includes "Nikon Z30"
    const productTitle = page.locator("h1");
    await expect(productTitle).toContainText("Nikon Z30", {
      timeout: 10_000,
    });
  });
});
