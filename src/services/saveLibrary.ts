import type { LibraryData } from "../types/library";
import { supabase } from "./supabase";

import { reconcileLibraryTimestamps } from "./savedLibraryResult";
import { importLibraryImages } from "./imageImports";
import { libraryDelta } from "./libraryDelta";

// Send a delta, never a replacement of the user's entire library. The RPC
// applies it atomically under the caller's existing row-level policies.
export async function saveLibraryChanges(
  before: LibraryData,
  next: LibraryData,
): Promise<LibraryData> {
  const prepared = await importLibraryImages(before, next, async (url) => {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) throw new Error("Sign in to import images.");

    const response = await fetch("/api/images/import", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${data.session.access_token}`,
      },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(90_000),
    });
    const result = (await response.json()) as { url?: string; error?: string };
    if (!response.ok || !result.url)
      throw new Error(
        result.error ||
          "Image import failed. Retry or clear the image field to save without it.",
      );
    return result.url;
  });
  const changes = libraryDelta(before, prepared);
  const { data, error } = await supabase.rpc("save_library_changes", {
    changes,
  });
  if (error) throw error;
  reconcileLibraryTimestamps(prepared, data);
  return prepared;
}
