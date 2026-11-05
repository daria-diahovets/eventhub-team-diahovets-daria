import type { CreateOrderRequest, Order, SeatMap } from "@eventhub/contracts";
import { api } from "./client";

export async function fetchSeatMap(eventId: string): Promise<SeatMap> {
  const { data, error } = await api.GET("/events/{eventId}/seats", {
    params: { path: { eventId } },
  });
  if (error) throw error;
  return data;
}

export async function fetchMyOrders(): Promise<Order[]> {
  const { data, error } = await api.GET("/orders");
  if (error) throw error;
  return data;
}

export async function fetchOrder(orderId: string): Promise<Order> {
  const { data, error } = await api.GET("/orders/{orderId}", {
    params: { path: { orderId } },
  });
  if (error) throw error;
  return data;
}

export async function createOrder(
  body: CreateOrderRequest,
  idempotencyKey: string,
): Promise<Order> {
  const { data, error } = await api.POST("/orders", {
    body,
    headers: { "Idempotency-Key": idempotencyKey },
  });
  if (error) throw error;
  return data;
}

export async function cancelOrder(orderId: string): Promise<Order> {
  const { data, error } = await api.POST("/orders/{orderId}/cancel", {
    params: { path: { orderId } },
  });
  if (error) throw error;
  return data;
}
