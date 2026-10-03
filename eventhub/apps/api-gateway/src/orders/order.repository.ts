import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { Money } from "@eventhub/contracts";
import { OrderNotFound } from "../common/problem/domain-errors";
import type { StoredOrder } from "./order.types";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

@Injectable()
export class OrderRepository {
  private readonly orders = new Map<string, StoredOrder>();

  create(
    eventId: string,
    quantity: number,
    totalPrice: Money,
  ): { order: StoredOrder; cancellationToken: string } {
    const cancellationToken = randomBytes(24).toString("base64url");

    const order: StoredOrder = {
      id: randomUUID(),
      eventId,
      quantity,
      status: "confirmed",
      totalPrice,
      createdAt: new Date().toISOString(),
      cancellationTokenHash: hashToken(cancellationToken),
    };

    this.orders.set(order.id, order);
    return { order, cancellationToken };
  }

  byId(orderId: string): StoredOrder | undefined {
    return this.orders.get(orderId);
  }

  cancel(orderId: string, cancellationToken: string): StoredOrder {
    const order = this.orders.get(orderId);
    if (!order || order.cancellationTokenHash !== hashToken(cancellationToken)) {
      throw new OrderNotFound(orderId);
    }

    order.status = "cancelled";
    return order;
  }
}
