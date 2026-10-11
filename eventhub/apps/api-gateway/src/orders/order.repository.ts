import { createHash, randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { OrderNotFound, SeatsUnavailable } from "../common/problem/domain-errors";
import type { StoredOrder } from "./order.types";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

interface OrderWithItems {
  id: string;
  eventId: string;
  status: "CONFIRMED" | "CANCELLED";
  createdAt: Date;
  items: { priceCentsAtPurchase: number }[];
}

function toStoredOrder(order: OrderWithItems): StoredOrder {
  return {
    id: order.id,
    eventId: order.eventId,
    quantity: order.items.length,
    status: order.status === "CANCELLED" ? "cancelled" : "confirmed",
    totalPriceCents: order.items.reduce((sum, i) => sum + i.priceCentsAtPurchase, 0),
    currency: "UAH",
    createdAt: order.createdAt,
  };
}

@Injectable()
export class OrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    eventId: string,
    quantity: number,
  ): Promise<{ order: StoredOrder; cancellationToken: string }> {
    const cancellationToken = randomBytes(24).toString("base64url");
    const cancellationTokenHash = hashToken(cancellationToken);

    const order = await this.prisma.$transaction(async (tx) => {
      const seats = await tx.seat.findMany({
        where: { eventId, status: "FREE" },
        take: quantity,
        orderBy: { id: "asc" },
      });

      if (seats.length < quantity) {
        throw new SeatsUnavailable(eventId, quantity, seats.length);
      }

      await tx.seat.updateMany({
        where: { id: { in: seats.map((s) => s.id) } },
        data: { status: "SOLD" },
      });

      return tx.order.create({
        data: {
          eventId,
          cancellationTokenHash,
          items: {
            create: seats.map((seat) => ({
              seatId: seat.id,
              eventId,
              priceCentsAtPurchase: seat.priceCents,
            })),
          },
        },
        include: { items: true },
      });
    });

    return { order: toStoredOrder(order), cancellationToken };
  }

  async byId(orderId: string): Promise<StoredOrder | undefined> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    return order ? toStoredOrder(order) : undefined;
  }

  async cancel(orderId: string, cancellationToken: string): Promise<StoredOrder> {
    const hash = hashToken(cancellationToken);

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });

      if (!order || order.cancellationTokenHash !== hash) {
        throw new OrderNotFound(orderId);
      }

      if (order.status === "CONFIRMED") {
        await tx.seat.updateMany({
          where: { id: { in: order.items.map((i) => i.seatId) } },
          data: { status: "FREE" },
        });
        await tx.order.update({ where: { id: orderId }, data: { status: "CANCELLED" } });
      }

      return toStoredOrder({ ...order, status: "CANCELLED" });
    });
  }
}
