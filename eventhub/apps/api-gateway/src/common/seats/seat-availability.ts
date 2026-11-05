import type { Prisma } from "@prisma/client";

export function availableSeatWhere(now: Date): Prisma.SeatWhereInput {
  return {
    OR: [{ status: "FREE" }, { status: "HELD", holdExpiresAt: { lt: now } }],
  };
}
