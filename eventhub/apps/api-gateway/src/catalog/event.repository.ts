import { Injectable } from "@nestjs/common";
import type { Event as EventRow, Venue as VenueRow } from "@prisma/client";
import type { Event } from "@eventhub/contracts";
import { PrismaService } from "../prisma/prisma.service";
import type { FindParams } from "./catalog.types";
import { EventCancelled, EventNotFound, SeatsUnavailable } from "../common/problem/domain-errors";

type EventWithVenue = EventRow & { venue: VenueRow };

function toEvent(row: EventWithVenue): Event {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    category: row.category,
    imageUrl: row.imageUrl ?? undefined,
    status: row.status === "CANCELLED" ? "cancelled" : "scheduled",
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt ? row.endsAt.toISOString() : undefined,
    venue: { id: row.venue.id, name: row.venue.name, city: row.venue.city },
    minPrice: { amount: row.minPriceCents, currency: row.currency.trim() as "UAH" },
    availableSeats: row.availableSeats,
  };
}

@Injectable()
export class EventRepository {
  constructor(private readonly prisma: PrismaService) {}

  async find(params: FindParams): Promise<Event[]> {
    const rows = await this.prisma.event.findMany({
      where: {
        ...(params.city
          ? { venue: { city: { equals: params.city, mode: "insensitive" } } }
          : {}),
        ...(params.category
          ? { category: { equals: params.category, mode: "insensitive" } }
          : {}),
        ...(params.from
          ? { startsAt: { gte: new Date(`${params.from}T00:00:00Z`) } }
          : {}),
        ...(params.to
          ? { startsAt: { lte: new Date(`${params.to}T23:59:59Z`) } }
          : {}),
        ...(params.after
          ? {
              OR: [
                { startsAt: { gt: new Date(params.after.startsAt) } },
                {
                  startsAt: new Date(params.after.startsAt),
                  id: { gt: params.after.id },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      take: params.limit + 1,
      include: { venue: true },
    });

    return rows.map(toEvent);
  }

  async byId(id: string): Promise<Event | undefined> {
    const row = await this.prisma.event.findUnique({
      where: { id },
      include: { venue: true },
    });
    return row ? toEvent(row) : undefined;
  }

  async reserveSeats(eventId: string, quantity: number): Promise<Event> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: { venue: true },
    });
    if (!event) throw new EventNotFound(eventId);
    if (event.status === "CANCELLED") throw new EventCancelled(eventId);

    const result = await this.prisma.event.updateMany({
      where: { id: eventId, availableSeats: { gte: quantity } },
      data: { availableSeats: { decrement: quantity } },
    });

    if (result.count === 0) {
      throw new SeatsUnavailable(eventId, quantity, event.availableSeats);
    }

    const updated = await this.prisma.event.findUniqueOrThrow({
      where: { id: eventId },
      include: { venue: true },
    });
    return toEvent(updated);
  }

  async releaseSeats(eventId: string, quantity: number): Promise<void> {
    await this.prisma.event.updateMany({
      where: { id: eventId },
      data: { availableSeats: { increment: quantity } },
    });
  }
}
