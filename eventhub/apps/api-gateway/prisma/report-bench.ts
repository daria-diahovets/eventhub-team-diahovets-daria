import { createHash, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BENCH_VENUE_ID = "00000000-0000-7000-8000-0000000000b1";
const BENCH_EVENT_ID = "00000000-0000-7000-8000-0000000000b2";
const BENCH_COUNT = 50_000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function clean(): Promise<void> {
  await prisma.orderItem.deleteMany({ where: { eventId: BENCH_EVENT_ID } });
  await prisma.order.deleteMany({ where: { eventId: BENCH_EVENT_ID } });
  await prisma.seat.deleteMany({ where: { eventId: BENCH_EVENT_ID } });
  await prisma.event.deleteMany({ where: { id: BENCH_EVENT_ID } });
  console.log("Тестові замовлення видалено");
}

async function run(): Promise<void> {
  await prisma.venue.upsert({
    where: { id: BENCH_VENUE_ID },
    update: {},
    create: { id: BENCH_VENUE_ID, name: "Бенчмарк-майданчик", city: "Бенчмарк" },
  });

  await prisma.event.upsert({
    where: { id: BENCH_EVENT_ID },
    update: {},
    create: {
      id: BENCH_EVENT_ID,
      title: "Бенчмарк-подія для звіту",
      category: "bench",
      startsAt: new Date("2027-06-01T00:00:00Z"),
      minPriceCents: 10000,
      availableSeats: 0,
      venueId: BENCH_VENUE_ID,
    },
  });

  const batchSize = 2000;
  let created = 0;

  while (created < BENCH_COUNT) {
    const size = Math.min(batchSize, BENCH_COUNT - created);

    const seats = await prisma.seat.createManyAndReturn({
      data: Array.from({ length: size }, (_, i) => ({
        eventId: BENCH_EVENT_ID,
        rowLabel: "Z",
        number: created + i,
        priceCents: 10000,
        status: "SOLD" as const,
      })),
    });

    const orders = await prisma.order.createManyAndReturn({
      data: seats.map(() => ({
        eventId: BENCH_EVENT_ID,
        cancellationTokenHash: hashToken(randomBytes(8).toString("hex")),
      })),
    });

    await prisma.orderItem.createMany({
      data: seats.map((seat, i) => ({
        orderId: orders[i].id,
        seatId: seat.id,
        eventId: BENCH_EVENT_ID,
        priceCentsAtPurchase: seat.priceCents,
      })),
    });

    created += size;
    process.stdout.write(`\rСтворено ${created} з ${BENCH_COUNT}`);
  }
  console.log();
}

async function main(): Promise<void> {
  if (process.argv.includes("--clean")) {
    await clean();
    return;
  }
  const start = Date.now();
  await run();
  console.log(`Готово за ${((Date.now() - start) / 1000).toFixed(1)} с`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
