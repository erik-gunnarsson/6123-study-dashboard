import { test, expect } from "playwright/test";

const BASE_URL = process.env.STUDYPREP_BASE_URL ?? "http://127.0.0.1:4173";

test("profile creation and study flow work", async ({ page }) => {
  test.setTimeout(15000);
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });

  await expect(page.getByText("Finance Exam Prep")).toBeVisible();

  await page.locator("#profile-name").fill("Playwright User");
  await page.getByRole("button", { name: "Create profile" }).click();

  await expect(page.locator("#profile-list")).toContainText("Playwright User");
  await expect(page.locator("#next-question")).toBeEnabled();

  await page.getByRole("button", { name: "Load next question" }).click();

  await expect(page.locator("#question-card")).toBeVisible();
  await expect(page.locator("#question-title")).not.toHaveText("");
  await expect(page.locator("#question-prompt")).toContainText("Solve Question");

  await page.getByRole("button", { name: "Reveal solution" }).click();
  await expect(page.locator("#solution-panel")).toBeVisible();
  await expect(page.locator("#solution-text")).not.toHaveText("");

  await page.getByRole("button", { name: "Mark correct" }).click();
  await expect(page.locator("#question-card")).toBeVisible();
});
