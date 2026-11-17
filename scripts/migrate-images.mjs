// Run with Node 22.18+. Uses your account token, never a service-role key.
import { createClient } from "@supabase/supabase-js";

const {
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_ACCESS_TOKEN,
  SLEEVE_URL,
} = process.env;
if (
  !SUPABASE_URL ||
  !SUPABASE_PUBLISHABLE_KEY ||
  !SUPABASE_ACCESS_TOKEN ||
  !SLEEVE_URL
)
  throw new Error(
    "Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_ACCESS_TOKEN, and SLEEVE_URL. See docs/image-storage.md.",
  );

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  global: { headers: { Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}` } },
  auth: { persistSession: false, autoRefreshToken: false },
});
const {
  data: { user },
  error: authError,
} = await supabase.auth.getUser(SUPABASE_ACCESS_TOKEN);
if (authError || !user)
  throw new Error("The account token is invalid or expired.");

let migrated = 0;
let failed = 0;
for (const [table, field] of [
  ["albums", "artwork_url"],
  ["artists", "photo_url"],
  ["instruments", "image_url"],
]) {
  let lastId = "00000000-0000-0000-0000-000000000000";
  while (true) {
    const { data: rows, error } = await supabase
      .from(table)
      .select(`id,${field}`)
      .eq("user_id", user.id)
      .gt("id", lastId)
      .order("id")
      .limit(100);
    if (error) throw error;
    if (!rows.length) break;
    for (const row of rows) {
      lastId = row.id;
      const source = row[field];
      const prefix = `${SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/library-images/${user.id}/`;
      if (!source || source.startsWith(prefix)) continue;
      try {
        let response;
        for (let attempt = 0; attempt < 12; attempt++) {
          response = await fetch(new URL("/api/images/import", SLEEVE_URL), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`,
            },
            body: JSON.stringify({ url: source }),
            signal: AbortSignal.timeout(90_000),
          });
          if (response.status !== 429 || attempt === 11) break;
          await response.body?.cancel();
          await new Promise((resolve) => setTimeout(resolve, 6000));
        }
        if (response.status === 401) {
          console.error(
            "Account token expired. Supply a fresh token and rerun.",
          );
          process.exit(1);
        }
        const result = await response.json();
        if (!response.ok || !result.url)
          throw new Error(result.error || "Image import failed");
        // Do not overwrite an image changed in another tab during migration.
        const { data: updated, error: updateError } = await supabase
          .from(table)
          .update({ [field]: result.url })
          .eq("id", row.id)
          .eq(field, source)
          .select("id");
        if (updateError) throw updateError;
        if (updated.length) migrated++;
        console.log(
          `${table}/${row.id}: ${updated.length ? "migrated" : "changed elsewhere; skipped"}`,
        );
      } catch (error) {
        failed++;
        // Avoid printing source URLs, which may contain signed query parameters.
        console.error(`${table}/${row.id}: ${error.message}`);
      }
    }
  }
}
console.log(
  `Migrated ${migrated}; failed ${failed}. Rerun to retry failures; migrated rows are skipped.`,
);
if (failed) process.exitCode = 1;
