import type { Problem } from "@eventhub/contracts";

export function titleOf(error: unknown): string {
  if (typeof error === "object" && error !== null && "title" in error) {
    return String((error as Problem).title);
  }
  return "Не вдалося завантажити дані";
}
