import { z } from "zod";

const uuidLike = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    "Очікується ідентифікатор у форматі UUID",
  );

export const listEventsQuery = z.object({
  city: z.string().trim().min(1).optional(),
  category: z.string().trim().min(1).optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type ListEventsQuery = z.infer<typeof listEventsQuery>;

export const eventIdParam = z.object({
  eventId: uuidLike,
});
export type EventIdParam = z.infer<typeof eventIdParam>;

export const createOrderBody = z.object({
  eventId: uuidLike,
  quantity: z.number().int().min(1).max(10),
});
export type CreateOrderBody = z.infer<typeof createOrderBody>;

export const orderIdParam = z.object({
  orderId: uuidLike,
});
export type OrderIdParam = z.infer<typeof orderIdParam>;

export const cancelOrderBody = z.object({
  cancellationToken: z.string().min(1),
});
export type CancelOrderBody = z.infer<typeof cancelOrderBody>;
