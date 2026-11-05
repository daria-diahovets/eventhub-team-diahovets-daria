import { Injectable } from "@nestjs/common";
import { EventStatus, Prisma } from "@prisma/client";
import type { CreateEventBody, Event, UpdateEventBody } from "@eventhub/contracts";
import { PrismaService } from "../prisma/prisma.service";
import { toEvent } from "../catalog/event.repository";
import { EventNotFound, InvalidVenue } from "../common/problem/domain-errors";
import type { OwnerScope } from "./organizer.types";

function toEventStatus(status: "scheduled" | "cancelled"): EventStatus {
  return status === "cancelled" ? EventStatus.CANCELLED : EventStatus.SCHEDULED;
}

@Injectable()
export class OrganizerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(scope: OwnerScope): Promise<Event[]> {
    const rows = await this.prisma.event.findMany({
      where: scope ? { organizerId: scope.organizerId } : {},
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      include: { venue: true },
    });
    return rows.map(toEvent);
  }

  async create(organizerId: string, body: CreateEventBody): Promise<Event> {
    try {
      const row = await this.prisma.event.create({
        data: {
          title: body.title,
          description: body.description,
          category: body.category,
          imageUrl: body.imageUrl,
          startsAt: new Date(body.startsAt),
          endsAt: body.endsAt ? new Date(body.endsAt) : undefined,
          venueId: body.venueId,
          minPriceCents: body.minPriceCents,
          availableSeats: body.availableSeats,
          organizerId, // ← з токена, не з тіла запиту
        },
        include: { venue: true },
      });
      return toEvent(row);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
        throw new InvalidVenue(body.venueId);
      }
      throw err;
    }
  }

  async update(eventId: string, scope: OwnerScope, body: UpdateEventBody): Promise<Event> {
    let count: number;
    try {
      const result = await this.prisma.event.updateMany({
        where: scope ? { id: eventId, organizerId: scope.organizerId } : { id: eventId },
        data: {
          title: body.title,
          description: body.description,
          category: body.category,
          imageUrl: body.imageUrl,
          startsAt: body.startsAt ? new Date(body.startsAt) : undefined,
          endsAt: body.endsAt ? new Date(body.endsAt) : undefined,
          venueId: body.venueId,
          minPriceCents: body.minPriceCents,
          availableSeats: body.availableSeats,
          status: body.status ? toEventStatus(body.status) : undefined,
        },
      });
      count = result.count;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
        throw new InvalidVenue(body.venueId ?? "");
      }
      throw err;
    }

    // Нуль рядків - чужа подія або подія, якої не існує. Для цього
    // організатора вона не існує, тож 404, а не 403 (методичка ЛР6, 6.5).
    if (count === 0) throw new EventNotFound(eventId);

    const updated = await this.prisma.event.findUniqueOrThrow({
      where: { id: eventId },
      include: { venue: true },
    });
    return toEvent(updated);
  }
}
