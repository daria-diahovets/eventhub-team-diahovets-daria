import { Injectable } from "@nestjs/common";
import type { EventRevenue } from "@eventhub/contracts";
import { PrismaService } from "../prisma/prisma.service";

interface RevenueRow {
  eventId: string;
  title: string;
  soldSeats: bigint;
  revenueCents: bigint;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async revenueByEvent(): Promise<EventRevenue[]> {
    const rows = await this.prisma.$queryRaw<RevenueRow[]>`
      SELECT
        e.id AS "eventId",
        e.title AS "title",
        COUNT(o.id) AS "soldSeats",
        COALESCE(SUM(CASE WHEN o.id IS NOT NULL THEN oi."priceCentsAtPurchase" END), 0) AS "revenueCents"
      FROM "Event" e
      LEFT JOIN "OrderItem" oi ON oi."eventId" = e.id
      LEFT JOIN "Order" o ON o.id = oi."orderId" AND o.status = 'CONFIRMED'
      GROUP BY e.id, e.title
      ORDER BY e.title
    `;

    return rows.map((row) => ({
      eventId: row.eventId,
      title: row.title,
      soldSeats: Number(row.soldSeats),
      revenue: { amount: Number(row.revenueCents), currency: "UAH" },
    }));
  }
}
