import { Injectable } from "@nestjs/common";
import type { Event, EventPage, ListEventsQuery, SeatMap } from "@eventhub/contracts";
import { EventRepository } from "./event.repository";
import { SeatRepository } from "./seat.repository";
import { EventNotFound } from "../common/problem/domain-errors";
import { decodeCursor, encodeCursor } from "./cursor";

@Injectable()
export class CatalogService {
  constructor(
    private readonly repo: EventRepository,
    private readonly seats: SeatRepository,
  ) {}

  async list(query: ListEventsQuery): Promise<EventPage> {
    const after = query.cursor ? decodeCursor(query.cursor) : undefined;

    const rows = await this.repo.find({
      city: query.city,
      category: query.category,
      q: query.q,
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

  seatMap(eventId: string): Promise<SeatMap> {
    return this.seats.seatMap(eventId);
  }
}
