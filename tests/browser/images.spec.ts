import { test, expect } from "@playwright/test";

test("account image imports retain failed input, retry, and save owned URLs across catalogs", async ({
  page,
}) => {
  await page.route("**/src/services/supabase.ts", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `export const supabase = {
      auth: { getSession: async () => ({ data: { session: { access_token: "account-token" } }, error: null }) },
      rpc: async (name, payload) => {
        window.savedChanges = payload.changes;
        return { error: null, data: { albums: payload.changes.albums.saved.map(row => ({ ...row, created_at: "2026-01-01", updated_at: "2026-11-16" })) } };
      }
    };`,
    }),
  );
  await page.route("https://owned.supabase.co/**", (route) =>
    route.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=",
        "base64",
      ),
    }),
  );
  let fail = true;
  const requests: string[] = [];
  await page.route("**/api/images/import", async (route) => {
    expect(route.request().headers().authorization).toBe(
      "Bearer account-token",
    );
    requests.push(route.request().postDataJSON().url);
    await route.fulfill({
      status: fail ? 502 : 200,
      contentType: "application/json",
      body: JSON.stringify(
        fail
          ? {
              error:
                "Image provider unavailable. Retry or clear the image field.",
            }
          : {
              url: "https://owned.supabase.co/storage/v1/object/public/library-images/user/asset.webp",
            },
      ),
    });
  });
  await page.goto("/");
  await page.evaluate(async () => {
    const storagePath = "/src/app/storage.ts";
    const {
      readAlbums,
      readArtistCatalog,
      readInstrumentCatalog,
      readGenreCatalog,
    } = await import(/* @vite-ignore */ storagePath);
    const albums = readAlbums();
    sessionStorage.setItem(
      "image-account",
      JSON.stringify({
        albums,
        artists: readArtistCatalog(albums),
        instruments: readInstrumentCatalog(albums),
        genres: readGenreCatalog(albums),
      }),
    );
  });
  await page.reload();
  await page.evaluate(async () => {
    const controllerPath = "/src/app/controller.ts";
    const appPath = "/src/app/app.ts";
    const { initializeApp } = await import(/* @vite-ignore */ controllerPath);
    const { renderApp } = await import(/* @vite-ignore */ appPath);
    document.querySelector("#app")!.innerHTML = renderApp(true);
    initializeApp(
      JSON.parse(sessionStorage.getItem("image-account")!),
      "test-account",
    );
  });
  await page.locator('a[href^="#album/"]').first().click();
  await page.locator('[data-action="edit"]').click();
  await page.locator('[name="artwork"]').fill("https://source.net/album.jpg");
  await page.locator('#album-form button[type="submit"]').click();
  await expect(page.locator("#form-error")).toContainText(
    "Image provider unavailable",
  );
  await expect(page.locator('[name="artwork"]')).toHaveValue(
    "https://source.net/album.jpg",
  );
  expect(
    await page.evaluate(() => (window as any).savedChanges),
  ).toBeUndefined();
  fail = false;
  await page.locator('#album-form button[type="submit"]').click();
  await expect(page.locator("#editor")).not.toBeVisible();
  await expect(page.locator(".album-artwork .cover img")).toHaveAttribute(
    "src",
    /owned\.supabase\.co/,
  );
  expect(
    await page.evaluate(
      () => (window as any).savedChanges.albums.saved[0].artwork_url,
    ),
  ).toContain("asset.webp");

  await page.getByRole("button", { name: "Add album", exact: true }).click();
  await page.locator('[data-action="manual"]').click();
  await page.locator('[name="title"]').fill("New managed album");
  await page
    .locator('[name="artwork"]')
    .fill("https://upload.wikimedia.org/new-album.jpg");
  await page.locator('#album-form button[type="submit"]').click();
  await expect(page.locator("#editor")).not.toBeVisible();
  await expect(page.locator("#page-title")).toHaveText("New managed album");
  expect(
    await page.evaluate(
      () => (window as any).savedChanges.albums.saved[0].artwork_url,
    ),
  ).toContain("asset.webp");

  await page.goto("/#artists");
  await page.locator('[data-action="new-catalog-artist"]').click();
  await page.locator('[name="artistName"]').fill("Managed artist");
  await page
    .locator('[name="catalogImage"]')
    .fill("https://source.net/artist.png");
  await page.locator('#catalog-artist-form button[type="submit"]').click();
  await expect(page.locator("#editor")).not.toBeVisible();
  expect(
    await page.evaluate(
      () => (window as any).savedChanges.artists.saved[0].photo_url,
    ),
  ).toContain("asset.webp");

  await page.goto("/#instruments");
  await page.locator('[data-action="new-catalog-instrument"]').click();
  await page.locator('[name="instrumentName"]').fill("Managed instrument");
  await page
    .locator('[name="catalogImage"]')
    .fill("https://source.net/instrument.png");
  await page.locator('#catalog-instrument-form button[type="submit"]').click();
  await expect(page.locator("#editor")).not.toBeVisible();
  expect(
    await page.evaluate(
      () => (window as any).savedChanges.instruments.saved[0].image_url,
    ),
  ).toContain("asset.webp");
  expect(requests).toEqual([
    "https://source.net/album.jpg",
    "https://source.net/album.jpg",
    "https://upload.wikimedia.org/new-album.jpg",
    "https://source.net/artist.png",
    "https://source.net/instrument.png",
  ]);
});
