import type { Money } from "@eventhub/contracts";

export interface StoredOrder {
  id: string;
  eventId: string;
  quantity: number;
  status: "confirmed" | "cancelled";
  totalPrice: Money;
  createdAt: string;
  cancellationTokenHash: string;
}
