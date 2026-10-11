import { Injectable } from "@nestjs/common";
import type { CreateOrderResponse, Order } from "@eventhub/contracts";
import { CatalogService } from "../catalog/catalog.service";
import { OrderNotFound } from "../common/problem/domain-errors";
import { OrderRepository } from "./order.repository";
import type { StoredOrder } from "./order.types";

function toOrderDto(order: StoredOrder): Order {
  return {
    id: order.id,
    eventId: order.eventId,
    quantity: order.quantity,
    status: order.status,
    totalPrice: { amount: order.totalPriceCents, currency: order.currency as "UAH" },
    createdAt: order.createdAt.toISOString(),
  };
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly orders: OrderRepository,
    private readonly catalog: CatalogService,
  ) {}

  async create(eventId: string, quantity: number): Promise<CreateOrderResponse> {
    await this.catalog.reserveSeats(eventId, quantity);

    try {
      const { order, cancellationToken } = await this.orders.create(eventId, quantity);
      return { ...toOrderDto(order), cancellationToken };
    } catch (err) {
      await this.catalog.releaseSeats(eventId, quantity);
      throw err;
    }
  }

  async getOne(orderId: string): Promise<Order> {
    const order = await this.orders.byId(orderId);
    if (!order) throw new OrderNotFound(orderId);
    return toOrderDto(order);
  }

  async cancel(orderId: string, cancellationToken: string): Promise<Order> {
    const existing = await this.orders.byId(orderId);
    const wasConfirmed = existing?.status === "confirmed";

    const order = await this.orders.cancel(orderId, cancellationToken);

    if (wasConfirmed) {
      await this.catalog.releaseSeats(order.eventId, order.quantity);
    }

    return toOrderDto(order);
  }
}
