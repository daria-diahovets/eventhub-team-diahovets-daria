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
    // "Продано" тут - будь-яке замовлення, що не скасоване й не протерміноване
    // (PENDING/PAID/REFUNDED): оплати ще немає (див. тиждень 8), а місце вже
    // утримує цей рядок, тож для звіту воно вважається зайнятим.
    const rows = await this.prisma.$queryRaw<RevenueRow[]>`
      SELECT
        e.id AS "eventId",
        e.title AS "title",
        COUNT(oi.id) AS "soldSeats",
        COALESCE(SUM(oi."priceCents"), 0) AS "revenueCents"
      FROM "Event" e
      LEFT JOIN "Order" o ON o."eventId" = e.id AND o.status NOT IN ('CANCELLED', 'EXPIRED')
      LEFT JOIN "OrderItem" oi ON oi."orderId" = o.id
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
