import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateOrderRequest } from "@eventhub/contracts";
import { eventKeys, orderKeys } from "../../api/queryKeys";
import { cancelOrder, createOrder, fetchMyOrders, fetchOrder, fetchSeatMap } from "../../api/ordersQueries";

export function useSeatMap(eventId: string) {
  return useQuery({
    queryKey: eventKeys.seats(eventId),
    queryFn: () => fetchSeatMap(eventId),
    enabled: Boolean(eventId),
  });
}

export function useMyOrders() {
  return useQuery({
    queryKey: orderKeys.all,
    queryFn: fetchMyOrders,
  });
}

export function useOrder(orderId: string) {
  return useQuery({
    queryKey: orderKeys.detail(orderId),
    queryFn: () => fetchOrder(orderId),
    enabled: Boolean(orderId),
  });
}

export function useCreateOrder(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ body, idempotencyKey }: { body: CreateOrderRequest; idempotencyKey: string }) =>
      createOrder(body, idempotencyKey),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: eventKeys.seats(eventId) });
      void qc.invalidateQueries({ queryKey: eventKeys.detail(eventId) });
      void qc.invalidateQueries({ queryKey: orderKeys.all });
    },
  });
}

export function useCancelOrder(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => cancelOrder(orderId),
    onSuccess: (order) => {
      void qc.invalidateQueries({ queryKey: orderKeys.all });
      void qc.invalidateQueries({ queryKey: orderKeys.detail(orderId) });
      void qc.invalidateQueries({ queryKey: eventKeys.seats(order.eventId) });
      void qc.invalidateQueries({ queryKey: eventKeys.detail(order.eventId) });
    },
  });
}
