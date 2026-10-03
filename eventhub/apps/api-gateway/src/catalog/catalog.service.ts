import { Injectable } from "@nestjs/common";
import type { Event, EventPage, ListEventsQuery } from "@eventhub/contracts";
import { EventRepository } from "./event.repository";
import { EventNotFound } from "../common/problem/domain-errors";
import { decodeCursor, encodeCursor } from "./cursor";

@Injectable()
export class CatalogService {
  constructor(private readonly repo: EventRepository) {}

  async list(query: ListEventsQuery): Promise<EventPage> {
    const after = query.cursor ? decodeCursor(query.cursor) : undefined;

    const rows = await this.repo.find({
      city: query.city,
      category: query.category,
      from: query.from,
      to: query.to,
      after,
      limit: query.limit,
    });

    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    const last = items.at(-1);

    return {
      items,
      nextCursor: hasMore && last ? encodeCursor(last) : null,
    };
  }

  async getOne(eventId: string): Promise<Event> {
    const event = await this.repo.byId(eventId);
    if (!event) throw new EventNotFound(eventId);
    return event;
  }

  async reserveSeats(eventId: string, quantity: number): Promise<Event> {
    return this.repo.reserveSeats(eventId, quantity);
  }

  async releaseSeats(eventId: string, quantity: number): Promise<void> {
    return this.repo.releaseSeats(eventId, quantity);
  }
}
