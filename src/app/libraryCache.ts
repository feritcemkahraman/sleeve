import { isLibrarySnapshot } from "./storageValidation.ts";
import type { LibraryData } from "../types/library";

const prefix = "jazzlog-library-v1:";
export type LibrarySnapshot = {
  version: 1;
  accountId: string;
  syncedAt: number;
  data: LibraryData;
};

export function readLibraryCache(
  accountId: string,
): LibrarySnapshot | undefined {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(prefix + accountId) ?? "null",
    );
    if (!isLibrarySnapshot(value) || value.accountId !== accountId) return;
    return value;
  } catch {
    return;
  }
}

export function writeLibraryCache(
  accountId: string,
  data: LibraryData,
  syncedAt = Date.now(),
): boolean {
  try {
    localStorage.setItem(
      prefix + accountId,
      JSON.stringify({ version: 1, accountId, syncedAt, data }),
    );
    return true;
  } catch {
    return false;
  }
}

export function clearLibraryCache(accountId: string): void {
  try {
    localStorage.removeItem(prefix + accountId);
  } catch {
    /* Storage may be blocked. */
  }
}

// This identifies a locally saved account for offline browsing only. Server
// authorization still goes through Supabase; no token is copied into our cache.
export function cachedAccountId(): string | undefined {
  try {
    const project = new URL(import.meta.env.VITE_SUPABASE_URL).hostname.split(
      ".",
    )[0];
    const session = JSON.parse(
      localStorage.getItem(`sb-${project}-auth-token`) ?? "null",
    );
    return typeof session?.user?.id === "string" && session.access_token
      ? session.user.id
      : undefined;
  } catch {
    return;
  }
}
