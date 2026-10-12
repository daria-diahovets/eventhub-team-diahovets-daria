const STORAGE_KEY = "eventhub:favorites";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readFavorites(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export const SIMULATE_FAVORITE_FAILURE = false;

export async function fetchFavorites(): Promise<string[]> {
  await delay(150);
  return readFavorites();
}

export async function toggleFavorite(eventId: string): Promise<string[]> {
  await delay(300);
  if (SIMULATE_FAVORITE_FAILURE) {
    throw new Error("Не вдалося оновити обране");
  }
  const current = readFavorites();
  const next = current.includes(eventId)
    ? current.filter((id) => id !== eventId)
    : [...current, eventId];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
