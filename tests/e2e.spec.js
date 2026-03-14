import { test, expect } from "playwright/test";

const BASE_URL = process.env.STUDYPREP_BASE_URL ?? "http://127.0.0.1:4175";

async function createProfile(page, suffix = Date.now()) {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "What should we call you?" })).toBeVisible();
  await page.locator("#onboarding-name").fill(`Playwright ${suffix}`);
  await page.getByRole("button", { name: "Start studying" }).click();
  await expect(page.locator("#question-card")).toBeVisible();
}

test("onboarding and study flow work", async ({ page }) => {
  test.setTimeout(15000);

  await createProfile(page);

  await expect(page.locator("#question-title")).toContainText("Question 1");
  await expect(page.locator("#question-prompt")).not.toHaveText("");

  await page.getByRole("button", { name: "Reveal solution" }).click();
  await expect(page.locator("#solution-panel")).toBeVisible();
  await expect(page.locator("#solution-text")).not.toHaveText("");

  await page.getByRole("button", { name: "Mark correct" }).click();
  await expect(page.locator("#question-card")).toBeVisible();
});

test("tabs stay equal width and page does not overflow horizontally", async ({ page }) => {
  test.setTimeout(15000);
  await page.setViewportSize({ width: 1440, height: 1100 });

  await createProfile(page, "layout");

  const tabWidths = await page.locator(".tab-row .tab").evaluateAll((tabs) =>
    tabs.map((tab) => Math.round(tab.getBoundingClientRect().width)),
  );

  expect(tabWidths).toHaveLength(3);
  expect(Math.max(...tabWidths) - Math.min(...tabWidths)).toBeLessThanOrEqual(1);

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});
