import type { CatalogFilters } from "../features/catalog/useCatalogFilters";

export const eventKeys = {
  all: ["events"] as const,
  list: (filters: CatalogFilters) => ["events", "list", filters] as const,
  detail: (eventId: string) => ["events", "detail", eventId] as const,
  seats: (eventId: string) => ["events", "seats", eventId] as const,
};

export const organizerKeys = {
  all: ["organizer", "events"] as const,
};

export const orderKeys = {
  all: ["orders"] as const,
  detail: (orderId: string) => ["orders", "detail", orderId] as const,
};
