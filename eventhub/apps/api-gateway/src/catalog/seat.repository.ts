import { Injectable } from "@nestjs/common";
import type { SeatMap } from "@eventhub/contracts";
import { PrismaService } from "../prisma/prisma.service";
import { availableSeatWhere } from "../common/seats/seat-availability";
import { EventNotFound } from "../common/problem/domain-errors";

@Injectable()
export class SeatRepository {
  constructor(private readonly prisma: PrismaService) {}

  async seatMap(eventId: string): Promise<SeatMap> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true },
    });
    if (!event) throw new EventNotFound(eventId);

    const now = new Date();

    const [seats, availableRows] = await Promise.all([
      this.prisma.seat.findMany({
        where: { eventId },
        orderBy: [{ rowLabel: "asc" }, { number: "asc" }],
      }),
      this.prisma.seat.findMany({
        where: { eventId, ...availableSeatWhere(now) },
        select: { id: true },
      }),
    ]);

    const availableIds = new Set(availableRows.map((s) => s.id));

    return {
      eventId,
      seats: seats.map((seat) => ({
        id: seat.id,
        rowLabel: seat.rowLabel,
        number: seat.number,
        price: { amount: seat.priceCents, currency: "UAH" },
        available: availableIds.has(seat.id),
      })),
    };
  }
}
