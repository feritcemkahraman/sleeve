import type { LibraryData } from "../types/library";
import { supabase } from "./supabase";

import { reconcileLibraryTimestamps } from "./savedLibraryResult";
import { libraryDelta } from "./libraryDelta";

// Send a delta, never a replacement of the user's entire library. The RPC
// applies it atomically under the caller's existing row-level policies.
export async function saveLibraryChanges(
  before: LibraryData,
  next: LibraryData,
): Promise<LibraryData> {
  const changes = libraryDelta(before, next);
  const { data, error } = await supabase.rpc("save_library_changes", {
    changes,
  });
  if (error) throw error;
  reconcileLibraryTimestamps(next, data);
  return next;
}
