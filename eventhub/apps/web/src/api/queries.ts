import type { Event, EventPage } from "@eventhub/contracts";
import type { CatalogFilters } from "../features/catalog/useCatalogFilters";
import { api } from "./client";

export const PAGE_SIZE = 3;

export async function fetchEvents(
  filters: CatalogFilters,
  cursor?: string | undefined,
): Promise<EventPage> {
  const { data, error } = await api.GET("/events", {
    params: {
      query: {
        ...(filters.city ? { city: filters.city } : {}),
        ...(filters.from ? { from: filters.from } : {}),
        ...(filters.q ? { q: filters.q } : {}),
        ...(cursor ? { cursor } : {}),
        limit: PAGE_SIZE,
      },
    },
  });
  if (error) throw error;
  return data;
}

export async function fetchEvent(eventId: string): Promise<Event> {
  const { data, error } = await api.GET("/events/{eventId}", {
    params: { path: { eventId } },
  });
  if (error) throw error;
  return data;
}
