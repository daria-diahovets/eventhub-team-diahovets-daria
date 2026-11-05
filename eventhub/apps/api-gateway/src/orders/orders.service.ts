import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { CreateOrderBody, Order } from "@eventhub/contracts";
import type { AuthUser } from "../auth/auth.types";
import { env } from "../config/env";
import { IdempotencyKeyReused } from "../common/problem/domain-errors";
import { OrdersRepository, toOrder, type OrderRow } from "./orders.repository";

const UNIQUE_VIOLATION = "P2002";

function isUniqueViolationOn(err: unknown, field: string): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (err.code !== UNIQUE_VIOLATION) return false;
  const target = err.meta?.["target"];
  return Array.isArray(target) ? target.includes(field) : target === field;
}

export interface CreateOrderResult {
  order: Order;
  replayed: boolean;
}

@Injectable()
export class OrdersService {
  constructor(private readonly repo: OrdersRepository) {}

  async create(
    user: AuthUser,
    body: CreateOrderBody,
    key: string | undefined,
  ): Promise<CreateOrderResult> {
    if (!key) {
      const order = await this.repo.createWithHold({
        userId: user.id,
        eventId: body.eventId,
        seatIds: body.seatIds,
        holdMinutes: env.ORDER_HOLD_MINUTES,
        idempotencyKey: null,
      });
      return { order, replayed: false };
    }

    // Швидкий шлях: ключ уже відомий. Економія, а не захист - два паралельні
    // запити з однаковим ключем обидва можуть побачити "такого немає" й обидва
    // піти вставляти; справжній захист - унікальний індекс нижче.
    const known = await this.repo.findByIdempotencyKey(key);
    if (known) return { order: this.replay(known, user, body), replayed: true };

    try {
      const order = await this.repo.createWithHold({
        userId: user.id,
        eventId: body.eventId,
        seatIds: body.seatIds,
        holdMinutes: env.ORDER_HOLD_MINUTES,
        idempotencyKey: key,
      });
      return { order, replayed: false };
    } catch (err) {
      if (!isUniqueViolationOn(err, "idempotencyKey")) throw err;

      const row = await this.repo.findByIdempotencyKey(key);
      if (!row) throw err;
      return { order: this.replay(row, user, body), replayed: true };
    }
  }

  listMine(userId: string): Promise<Order[]> {
    return this.repo.listMine(userId);
  }

  getOne(orderId: string, userId: string): Promise<Order> {
    return this.repo.getOne(orderId, userId);
  }

  cancel(orderId: string, userId: string): Promise<Order> {
    return this.repo.cancel(orderId, userId);
  }

  private replay(row: OrderRow, user: AuthUser, body: CreateOrderBody): Order {
    // 1. Чужий ключ не повертає чуже замовлення - idempotencyKey унікальний
    // глобально, а не в межах користувача.
    if (row.userId !== user.id) throw new IdempotencyKeyReused();

    // 2. Той самий ключ з іншим тілом - 422, а не тихе повернення не того,
    // що просили, і не створення нового (ключ уже витрачено).
    const requested = [...body.seatIds].sort().join();
    const actual = row.items
      .map((i) => i.seatId)
      .sort()
      .join();
    const same = row.eventId === body.eventId && requested === actual;
    if (!same) throw new IdempotencyKeyReused();

    return toOrder(row);
  }
}
