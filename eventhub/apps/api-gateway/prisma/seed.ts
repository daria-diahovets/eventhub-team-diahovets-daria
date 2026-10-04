import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const VENUES = [
  { id: "018f2c1e-0000-7c3d-9e1f-2a5b6c7d8e00", name: "Філармонія", city: "Вінниця" },
  { id: "018f2c1e-0000-7c3d-9e1f-2a5b6c7d8e01", name: "Клуб «Підвал»", city: "Вінниця" },
  { id: "018f2c1e-0000-7c3d-9e1f-2a5b6c7d8e02", name: "Театр ім. Заньковецької", city: "Львів" },
  { id: "018f2c1e-0000-7c3d-9e1f-2a5b6c7d8e03", name: "НСК «Олімпійський»", city: "Київ" },
  { id: "018f2c1e-0000-7c3d-9e1f-2a5b6c7d8e04", name: "Арена Львів", city: "Львів" },
  { id: "018f2c1e-0000-7c3d-9e1f-2a5b6c7d8e05", name: "Національна опера", city: "Київ" },
];

const EVENTS = [
  {
    id: "018f2c1e-4a7b-7c3d-9e1f-2a5b6c7d8e9f",
    title: "Симфонічний вечір",
    description: "Програма з творів Лисенка та Дворжака",
    category: "concert",
    status: "SCHEDULED" as const,
    startsAt: new Date("2026-10-12T19:00:00Z"),
    endsAt: new Date("2026-10-12T21:30:00Z"),
    minPriceCents: 25000,
    availableSeats: 143,
    venueId: VENUES[0].id,
  },
  {
    id: "018f2c1e-4a7b-7c3d-9e1f-2a5b6c7d8ea0",
    title: "Джазовий квартет",
    category: "concert",
    status: "SCHEDULED" as const,
    startsAt: new Date("2026-10-19T20:00:00Z"),
    minPriceCents: 18000,
    availableSeats: 12,
    venueId: VENUES[1].id,
  },
  {
    id: "018f2c1e-4a7b-7c3d-9e1f-2a5b6c7d8ea1",
    title: "Вистава «Ревізор»",
    category: "theatre",
    status: "SCHEDULED" as const,
    startsAt: new Date("2026-10-19T20:00:00Z"),
    minPriceCents: 15000,
    availableSeats: 80,
    venueId: VENUES[2].id,
  },
  {
    id: "018f2c1e-4a7b-7c3d-9e1f-2a5b6c7d8ea2",
    title: "Футбольний матч",
    category: "sport",
    status: "SCHEDULED" as const,
    startsAt: new Date("2026-10-25T18:00:00Z"),
    minPriceCents: 30000,
    availableSeats: 500,
    venueId: VENUES[3].id,
  },
  {
    id: "018f2c1e-4a7b-7c3d-9e1f-2a5b6c7d8ea3",
    title: "Рок-концерт",
    category: "concert",
    status: "SCHEDULED" as const,
    startsAt: new Date("2026-11-01T19:00:00Z"),
    minPriceCents: 22000,
    availableSeats: 60,
    venueId: VENUES[4].id,
  },
  {
    id: "018f2c1e-4a7b-7c3d-9e1f-2a5b6c7d8ea4",
    title: "Балет «Лебедине озеро»",
    category: "theatre",
    status: "CANCELLED" as const,
    startsAt: new Date("2026-11-05T19:00:00Z"),
    minPriceCents: 35000,
    availableSeats: 20,
    venueId: VENUES[5].id,
  },
];

function buildSeats(eventId: string, count: number, priceCents: number) {
  const seats: { eventId: string; rowLabel: string; number: number; priceCents: number }[] = [];
  const perRow = 20;
  for (let i = 0; i < count; i++) {
    const rowIndex = Math.floor(i / perRow);
    const rowLabel = String.fromCharCode(65 + (rowIndex % 26));
    const number = (i % perRow) + 1;
    seats.push({ eventId, rowLabel, number, priceCents });
  }
  return seats;
}

async function main(): Promise<void> {
  for (const v of VENUES) {
    await prisma.venue.upsert({ where: { id: v.id }, update: v, create: v });
  }

  for (const e of EVENTS) {
    await prisma.event.upsert({ where: { id: e.id }, update: e, create: e });
    await prisma.seat.deleteMany({ where: { eventId: e.id } });
    await prisma.seat.createMany({
      data: buildSeats(e.id, e.availableSeats, e.minPriceCents),
    });
  }

  const venuesCount = await prisma.venue.count();
  const eventsCount = await prisma.event.count();
  const seatsCount = await prisma.seat.count();
  console.log(`Створено ${venuesCount} майданчиків, ${eventsCount} подій, ${seatsCount} місць`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
