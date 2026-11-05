import { Injectable } from "@nestjs/common";
import { OrderStatus, SeatStatus, type Prisma } from "@prisma/client";
import type { Order } from "@eventhub/contracts";
import { PrismaService } from "../prisma/prisma.service";
import { availableSeatWhere } from "../common/seats/seat-availability";
import {
  EventNotFound,
  OrderNotFound,
  OrderStateConflict,
  SeatsUnavailable,
} from "../common/problem/domain-errors";
import { canTransition } from "./order-state";

type Tx = Prisma.TransactionClient;

export interface CreateOrderInput {
  userId: string;
  eventId: string;
  seatIds: string[];
  holdMinutes: number;
  idempotencyKey: string | null;
}

const ORDER_INCLUDE = {
  event: { select: { title: true } },
  items: { include: { seat: { select: { rowLabel: true, number: true } } } },
} satisfies Prisma.OrderInclude;

export type OrderRow = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

export function toOrder(row: OrderRow): Order {
  return {
    id: row.id,
    eventId: row.eventId,
    eventTitle: row.event.title,
    status: row.status,
    total: { amount: row.totalCents, currency: row.currency as "UAH" },
    holdExpiresAt: row.holdExpiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    items: row.items.map((item) => ({
      seatId: item.seatId,
      rowLabel: item.seat.rowLabel,
      number: item.seat.number,
      price: { amount: item.priceCents, currency: row.currency as "UAH" },
    })),
  };
}

function statusesThatCanTransitionTo(to: OrderStatus): OrderStatus[] {
  return Object.values(OrderStatus).filter((from) => canTransition(from, to));
}

@Injectable()
export class OrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createWithHold(input: CreateOrderInput): Promise<Order> {
    // Сортування прибирає цілий клас помилок (deadlock): два паралельні
    // замовлення на ті самі місця у протилежному порядку інакше могли б
    // узяти блокування навхрест і зійтися у взаємному очікуванні.
    const seatIds = [...input.seatIds].sort();

    const row = await this.prisma.$transaction(
      async (tx) => {
        const now = new Date();

        const event = await tx.event.findUnique({
          where: { id: input.eventId },
          select: { id: true },
        });
        if (!event) throw new EventNotFound(input.eventId);

        // Крок 0. Прибираємо прострочені резерви саме цієї події - лінива
        // умова нижче показує їх вільними, але лічильник ще не повернутий.
        await this.releaseExpired(tx, now, { eventId: input.eventId });

        // Крок 1. Резерв - одним атомарним UPDATE. Умова "FREE" стоїть
        // усередині updateMany, а не в окремому if перед ним - вікна гонки
        // не існує фізично, бо UPDATE у PostgreSQL атомарний сам по собі.
        const held = await tx.seat.updateMany({
          where: { id: { in: seatIds }, eventId: input.eventId, status: SeatStatus.FREE },
          data: {
            status: SeatStatus.HELD,
            holdExpiresAt: new Date(now.getTime() + input.holdMinutes * 60_000),
          },
        });

        // Крок 2. updateMany не кидає виняток, якщо зачепив менше рядків,
        // ніж очікувалось - перевірка count обов'язкова.
        if (held.count !== seatIds.length) {
          throw new SeatsUnavailable(await this.whichAreTaken(tx, seatIds, input.eventId, now));
        }

        // Крок 3. Ціни - з бази, а не з тіла запиту.
        const seats = await tx.seat.findMany({
          where: { id: { in: seatIds } },
          select: { id: true, priceCents: true },
        });
        const totalCents = seats.reduce((sum, s) => sum + s.priceCents, 0);

        // Крок 4. Лічильник - через decrement, не арифметикою в JS.
        await tx.event.update({
          where: { id: input.eventId },
          data: { availableSeats: { decrement: seatIds.length } },
        });

        // Крок 5. Замовлення разом із позиціями - одним запитом.
        return tx.order.create({
          data: {
            userId: input.userId,
            eventId: input.eventId,
            status: OrderStatus.PENDING,
            totalCents,
            holdExpiresAt: new Date(now.getTime() + input.holdMinutes * 60_000),
            idempotencyKey: input.idempotencyKey,
            items: {
              create: seats.map((s) => ({ seatId: s.id, priceCents: s.priceCents })),
            },
          },
          include: ORDER_INCLUDE,
        });
      },
      { timeout: 10_000, maxWait: 5_000 },
    );

    return toOrder(row);
  }

  async findByIdempotencyKey(key: string): Promise<OrderRow | undefined> {
    const row = await this.prisma.order.findUnique({
      where: { idempotencyKey: key },
      include: ORDER_INCLUDE,
    });
    return row ?? undefined;
  }

  async listMine(userId: string): Promise<Order[]> {
    const rows = await this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: ORDER_INCLUDE,
    });
    return rows.map(toOrder);
  }

  async getOne(orderId: string, userId: string): Promise<Order> {
    const row = await this.prisma.order.findFirst({
      where: { id: orderId, userId }, // ← умова власника у WHERE, не 403
      include: ORDER_INCLUDE,
    });
    if (!row) throw new OrderNotFound(orderId);
    return toOrder(row);
  }

  async cancel(orderId: string, userId: string): Promise<Order> {
    const row = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, userId }, // ← умова власника у WHERE
        select: { id: true, eventId: true, status: true, items: { select: { seatId: true } } },
      });
      if (!order) throw new OrderNotFound(orderId);

      const moved = await tx.order.updateMany({
        where: { id: orderId, status: { in: statusesThatCanTransitionTo(OrderStatus.CANCELLED) } },
        data: { status: OrderStatus.CANCELLED },
      });
      if (moved.count === 0) {
        const fresh = await tx.order.findUniqueOrThrow({
          where: { id: orderId },
          select: { status: true },
        });
        throw new OrderStateConflict(fresh.status);
      }

      await this.releaseSeats(
        tx,
        order.eventId,
        order.items.map((i) => i.seatId),
      );

      return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: ORDER_INCLUDE });
    });

    return toOrder(row);
  }

  /** Викликається раз на хвилину фоновим прибиральником (ExpiredHoldsSweeper). */
  async sweepExpired(batch: number): Promise<number> {
    return this.prisma.$transaction(
      async (tx) => this.releaseExpired(tx, new Date(), { batch }),
      { timeout: 10_000 },
    );
  }

  private async releaseExpired(
    db: Tx,
    now: Date,
    scope: { eventId?: string; batch?: number } = {},
  ): Promise<number> {
    const stale = await db.order.findMany({
      where: {
        status: OrderStatus.PENDING,
        holdExpiresAt: { lt: now },
        ...(scope.eventId ? { eventId: scope.eventId } : {}),
      },
      take: scope.batch ?? 100,
      orderBy: { holdExpiresAt: "asc" },
      select: { id: true, eventId: true, items: { select: { seatId: true } } },
    });

    let expired = 0;
    for (const order of stale) {
      const moved = await db.order.updateMany({
        where: { id: order.id, status: OrderStatus.PENDING }, // ← знову умова у WHERE
        data: { status: OrderStatus.EXPIRED },
      });
      if (moved.count === 0) continue; // ← і знову перевірка count

      await this.releaseSeats(
        db,
        order.eventId,
        order.items.map((i) => i.seatId),
      );
      expired += 1;
    }
    return expired;
  }

  private async releaseSeats(db: Tx, eventId: string, seatIds: string[]): Promise<void> {
    if (seatIds.length === 0) return;
    const ordered = [...seatIds].sort();

    const released = await db.seat.updateMany({
      where: { id: { in: ordered }, status: SeatStatus.HELD },
      data: { status: SeatStatus.FREE, holdExpiresAt: null },
    });

    if (released.count > 0) {
      // OrderItem.seatId унікальний глобально (крок 6.2): скасоване чи
      // протерміноване замовлення більше не утримує це місце, тож рядок,
      // що посилався на нього, прибирається разом зі звільненням - інакше
      // та сама unique-умова, що захищає від подвійного продажу, назавжди
      // заблокувала б повторний продаж цього місця будь-кому іншому.
      await db.orderItem.deleteMany({ where: { seatId: { in: ordered } } });
      await db.event.update({
        where: { id: eventId },
        data: { availableSeats: { increment: released.count } },
      });
    }
  }

  private async whichAreTaken(
    tx: Tx,
    seatIds: string[],
    eventId: string,
    now: Date,
  ): Promise<string[]> {
    const rows = await tx.seat.findMany({
      where: { id: { in: seatIds }, eventId, NOT: availableSeatWhere(now) },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }
}
