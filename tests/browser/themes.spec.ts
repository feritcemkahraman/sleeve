import { test, expect } from "@playwright/test";

const palettes = {
  editorial: "rgb(245, 241, 232)",
  midnight: "rgb(30, 32, 36)",
  modern: "rgb(248, 248, 246)",
  sage: "rgb(24, 27, 23)",
};

test("themes switch immediately, style every page, and persist through refresh", async ({
  page,
}) => {
  await page.goto("/#profile");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "editorial");
  await page.locator("#auth-demo").click();
  for (const [theme, background] of Object.entries(palettes)) {
    await page.locator("#theme-select").selectOption(theme);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.locator("body")).toHaveCSS(
      "background-color",
      background,
    );
    await expect(page.locator(".chart-bar").first()).toHaveCSS(
      "background-color",
      await page
        .locator("html")
        .evaluate((el) =>
          getComputedStyle(el).getPropertyValue("--color-accent").trim(),
        )
        .then((hex) => {
          const color = hex.replace("#", "");
          return `rgb(${[0, 2, 4].map((i) => parseInt(color.slice(i, i + 2), 16)).join(", ")})`;
        }),
    );
    expect(
      await page.evaluate(() => localStorage.getItem("sleeve-theme")),
    ).toBe(theme);

    await page.reload();
    // Theme applies on the auth screen too, before entering the library.
    await expect(page.locator("body")).toHaveCSS(
      "background-color",
      background,
    );
    await page.locator("#auth-demo").click();
    await expect(page.locator("#theme-select")).toHaveValue(theme);
    await expect(page.locator("#page-title")).toHaveCSS(
      "font-family",
      /^("?Newsreader"?|Georgia|"?Inter"?)/,
    );
    await page.screenshot({
      path: `test-results/theme-${theme}-${test.info().project.name}.png`,
      fullPage: true,
    });
    await page.locator("#theme-select").focus();
    await expect(page.locator("#theme-select")).toHaveCSS(
      "outline-style",
      "solid",
    );

    for (const destination of ["artists", "genres", "instruments", ""]) {
      await page.evaluate((hash) => {
        location.hash = hash;
      }, destination);
      await expect(page.locator("#page-title")).toBeVisible();
      await expect(page.locator("body")).toHaveCSS(
        "background-color",
        background,
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page.locator('a[href^="#album/"]').first().click();
    await expect(page.locator(".album-artwork")).toBeVisible();
    await page.locator('[data-action="edit"]').click();
    await expect(page.locator("#editor")).toBeVisible();
    const expected = await page.locator("html").evaluate((el) => {
      const probe = document.createElement("span");
      probe.style.backgroundColor = "var(--color-surface-raised)";
      el.append(probe);
      const color = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return color;
    });
    await expect(page.locator("#editor")).toHaveCSS(
      "background-color",
      expected,
    );
    await page.keyboard.press("Escape");
    await expect(page.locator("#editor")).toBeHidden();
    await page.getByRole("link", { name: "Profile", exact: true }).click();
  }
});

test("invalid stored themes and unavailable storage use a usable default", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("sleeve-theme", "invalid"),
  );
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "editorial");
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new Error("Storage blocked");
    };
    Storage.prototype.setItem = () => {
      throw new Error("Storage blocked");
    };
  });
  await page.goto("/#profile");
  await page.locator("#auth-demo").click();
  await page.locator("#theme-select").selectOption("midnight");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "midnight");
});
