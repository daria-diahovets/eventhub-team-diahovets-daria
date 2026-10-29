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
  q: z.string().trim().min(1).optional(),
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

const email = z.string().trim().toLowerCase().email().max(254);

export const registerBody = z.object({
  email,
  password: z.string().min(10).max(128),
});
export type RegisterBody = z.infer<typeof registerBody>;

export const loginBody = z.object({
  email,
  password: z.string().min(1).max(128),
});
export type LoginBody = z.infer<typeof loginBody>;

export const createEventBody = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2000).optional(),
  category: z.string().trim().min(1).max(50),
  imageUrl: z.string().url().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().optional(),
  venueId: uuidLike,
  minPriceCents: z.number().int().min(0),
  availableSeats: z.number().int().min(0).default(0),
});
export type CreateEventBody = z.infer<typeof createEventBody>;

export const updateEventBody = createEventBody.partial().extend({
  status: z.enum(["scheduled", "cancelled"]).optional(),
});
export type UpdateEventBody = z.infer<typeof updateEventBody>;
