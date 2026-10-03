import { Injectable } from "@nestjs/common";
import type { Event } from "@eventhub/contracts";
import { EVENTS } from "./seed";
import type { FindParams } from "./catalog.types";
import {
  EventCancelled,
  EventNotFound,
  SeatsUnavailable,
} from "../common/problem/domain-errors";

function byStartThenId(a: Event, b: Event): number {
  if (a.startsAt !== b.startsAt) return a.startsAt < b.startsAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

@Injectable()
export class EventRepository {
  private readonly events: Event[] = [...EVENTS].sort(byStartThenId);

  async find(params: FindParams): Promise<Event[]> {
    let rows = this.events;

    if (params.city) {
      const needle = params.city.toLocaleLowerCase("uk");
      rows = rows.filter((e) => e.venue.city.toLocaleLowerCase("uk") === needle);
    }

    if (params.category) {
      const needle = params.category.toLocaleLowerCase("uk");
      rows = rows.filter((e) => e.category.toLocaleLowerCase("uk") === needle);
    }

    if (params.from) {
      rows = rows.filter((e) => e.startsAt >= `${params.from}T00:00:00Z`);
    }

    if (params.to) {
      rows = rows.filter((e) => e.startsAt <= `${params.to}T23:59:59Z`);
    }

    if (params.after) {
      const { startsAt, id } = params.after;
      rows = rows.filter(
        (e) => e.startsAt > startsAt || (e.startsAt === startsAt && e.id > id),
      );
    }

    return rows.slice(0, params.limit + 1);
  }

  async byId(id: string): Promise<Event | undefined> {
    return this.events.find((e) => e.id === id);
  }

  async reserveSeats(eventId: string, quantity: number): Promise<Event> {
    const event = this.events.find((e) => e.id === eventId);
    if (!event) throw new EventNotFound(eventId);
    if (event.status === "cancelled") throw new EventCancelled(eventId);
    if (event.availableSeats < quantity) {
      throw new SeatsUnavailable(eventId, quantity, event.availableSeats);
    }

    event.availableSeats -= quantity;
    return event;
  }

  async releaseSeats(eventId: string, quantity: number): Promise<void> {
    const event = this.events.find((e) => e.id === eventId);
    if (!event) return;
    event.availableSeats += quantity;
  }
}
