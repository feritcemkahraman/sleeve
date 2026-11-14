import { test, expect } from "@playwright/test";

test("album validation preserves first-error focus and editable values through retry", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#auth-demo").click();
  await page.locator('a[href^="#album/"]').first().click();
  await page.locator('[data-action="edit"]').click();
  // Exercise the application validation independently of native URL feedback.
  await page.locator("#album-form").evaluate((form: HTMLFormElement) => {
    form.noValidate = true;
  });
  await page.locator('[name="title"]').fill("   ");
  await page
    .locator('[name="artwork"]')
    .fill("https://user:password@example.com/art.jpg");
  await page.locator('[data-action="add-link"]').click();
  await page
    .locator('[name="linkUrl"]')
    .last()
    .fill("ftp://example.com/record");
  await page.locator('[name="linkLabel"]').last().fill("Kept label");
  await page.locator('#album-form button[type="submit"]').click();
  await expect(page.locator("#form-error")).toHaveText("Enter an album title.");
  await expect(page.locator('[name="title"]')).toBeFocused();

  await page.locator('[name="title"]').fill("  Validation retry  ");
  await page.locator('#album-form button[type="submit"]').click();
  await expect(page.locator("#form-error")).toHaveText(
    "Enter an HTTP or HTTPS artwork URL.",
  );
  await expect(page.locator('[name="artwork"]')).toBeFocused();

  await page.locator('[name="artwork"]').fill("");
  await page.locator('#album-form button[type="submit"]').click();
  await expect(page.locator("#form-error")).toHaveText(
    "Enter an HTTP or HTTPS URL for each music link.",
  );
  await expect(page.locator('[name="linkUrl"]').last()).toBeFocused();
  await expect(page.locator('[name="linkLabel"]').last()).toHaveValue(
    "Kept label",
  );

  await page
    .locator('[name="linkUrl"]')
    .last()
    .fill("https://example.com/record");
  await page.locator('#album-form button[type="submit"]').click();
  await expect(page.locator("#editor")).not.toBeVisible();
  await expect(page.locator("#page-title")).toHaveText("Validation retry");
  await expect(
    page.getByRole("link", {
      name: "Kept label (opens in a new tab)",
      exact: true,
    }),
  ).toHaveAttribute("href", "https://example.com/record");
});
