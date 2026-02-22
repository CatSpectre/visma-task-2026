import type { Page } from "@playwright/test";


// Dismiss the cookie consent banner if it appears.
export async function dismissCookieConsent(page: Page): Promise<void> {
  const consentButton = page.getByRole("button", {
    name: /Hyväksy kaikki/i,
  });

  try {
    await consentButton.waitFor({ state: "visible", timeout: 5_000 });
    await consentButton.click();
    await consentButton.waitFor({ state: "hidden", timeout: 5_000 });
  } catch {
    // Cookie banner may not appear (e.g. already accepted), we can continue
  }
}

/**
 * Perform a search from the homepage.
 * Navigates to the homepage, dismisses cookies, fills the search box, and submits.
 */
export async function searchFor(page: Page, query: string): Promise<void> {
  await page.goto("/fi/etusivu");
  await page.waitForLoadState("domcontentloaded");
  await dismissCookieConsent(page);

  const searchInput = page.getByRole("combobox", { name: /Hae kaupasta/i });
  await searchInput.waitFor({ state: "visible", timeout: 10_000 });
  await searchInput.fill(query);
  await searchInput.press("Enter");

  // Build a URL-safe regex: replace spaces with a pattern matching both literal space and %20
  const urlSafeQuery = query.replace(/ /g, "(%20|\\+| )");
  await page.waitForURL(new RegExp(`search.*query=${urlSafeQuery}`, "i"), {
    timeout: 15_000,
  });
}
