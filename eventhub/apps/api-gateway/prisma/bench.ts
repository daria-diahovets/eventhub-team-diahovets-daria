import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BENCH_VENUE_ID = "00000000-0000-7000-8000-0000000000b1";
const BENCH_COUNT = 100_000;

async function clean(): Promise<void> {
  const deleted = await prisma.event.deleteMany({ where: { venueId: BENCH_VENUE_ID } });
  await prisma.venue.deleteMany({ where: { id: BENCH_VENUE_ID } });
  console.log(`Видалено ${deleted.count} тестових подій`);
}

async function run(): Promise<void> {
  await prisma.venue.upsert({
    where: { id: BENCH_VENUE_ID },
    update: {},
    create: { id: BENCH_VENUE_ID, name: "Бенчмарк-майданчик", city: "Бенчмарк" },
  });

  const batchSize = 5000;
  const base = new Date("2027-01-01T00:00:00Z").getTime();
  let created = 0;

  while (created < BENCH_COUNT) {
    const size = Math.min(batchSize, BENCH_COUNT - created);
    const batch = Array.from({ length: size }, (_, i) => {
      const n = created + i;
      return {
        title: `Бенчмарк-подія ${n}`,
        category: "bench",
        startsAt: new Date(base + n * 1000),
        minPriceCents: 10000,
        availableSeats: 100,
        venueId: BENCH_VENUE_ID,
      };
    });
    await prisma.event.createMany({ data: batch });
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
