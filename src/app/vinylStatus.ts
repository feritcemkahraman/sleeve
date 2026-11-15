import type { VinylStatus } from "../types/albums";

export const vinylStatuses = [
  "owned",
  "wishlisted",
] as const satisfies readonly VinylStatus[];

export function isVinylStatus(value: unknown): value is VinylStatus {
  return value === "owned" || value === "wishlisted";
}

export function vinylStatusLabel(status: VinylStatus): string {
  switch (status) {
    case "owned":
      return "Owned on vinyl";
    case "wishlisted":
      return "Vinyl wishlist";
  }
}

export function vinylStatusIcon(
  status: VinylStatus | null | undefined,
): string {
  switch (status) {
    case "owned":
      return "disc";
    case "wishlisted":
      return "disc-wishlist";
    default:
      return "plus";
  }
}
