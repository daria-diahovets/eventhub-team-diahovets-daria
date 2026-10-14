export interface StoredOrder {
  id: string;
  eventId: string;
  userId: string;
  quantity: number;
  status: "confirmed" | "cancelled";
  totalPriceCents: number;
  currency: string;
  createdAt: Date;
}
