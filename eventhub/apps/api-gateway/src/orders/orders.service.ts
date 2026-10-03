import { Injectable } from "@nestjs/common";
import type { CreateOrderResponse, Order } from "@eventhub/contracts";
import { CatalogService } from "../catalog/catalog.service";
import { OrderNotFound } from "../common/problem/domain-errors";
import { OrderRepository } from "./order.repository";
import type { StoredOrder } from "./order.types";

function toOrderDto(order: StoredOrder): Order {
  const { cancellationTokenHash: _hash, ...dto } = order;
  return dto;
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly orders: OrderRepository,
    private readonly catalog: CatalogService,
  ) {}

  async create(eventId: string, quantity: number): Promise<CreateOrderResponse> {
    const event = await this.catalog.reserveSeats(eventId, quantity);

    const totalPrice = {
      amount: event.minPrice.amount * quantity,
      currency: event.minPrice.currency,
    };

    const { order, cancellationToken } = this.orders.create(eventId, quantity, totalPrice);
    return { ...toOrderDto(order), cancellationToken };
  }

  async getOne(orderId: string): Promise<Order> {
    const order = this.orders.byId(orderId);
    if (!order) throw new OrderNotFound(orderId);
    return toOrderDto(order);
  }

  async cancel(orderId: string, cancellationToken: string): Promise<Order> {
    const wasConfirmed = this.orders.byId(orderId)?.status === "confirmed";

    const order = this.orders.cancel(orderId, cancellationToken);

    if (wasConfirmed) {
      await this.catalog.releaseSeats(order.eventId, order.quantity);
    }

    return toOrderDto(order);
  }
}
