import type { Event, UpdateEventRequest } from "@eventhub/contracts";
import { api } from "./client";

export async function fetchOrganizerEvents(): Promise<Event[]> {
  const { data, error } = await api.GET("/organizer/events");
  if (error) throw error;
  return data;
}

export async function updateOrganizerEvent(
  eventId: string,
  body: UpdateEventRequest,
): Promise<Event> {
  const { data, error } = await api.PATCH("/organizer/events/{eventId}", {
    params: { path: { eventId } },
    body,
  });
  if (error) throw error;
  return data;
}
