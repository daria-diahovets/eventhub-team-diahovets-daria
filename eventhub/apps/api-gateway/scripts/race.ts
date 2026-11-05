import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const API = process.env["RACE_API_URL"] ?? "http://127.0.0.1:3000";
const EMAIL = "student@example.com";
const PASSWORD = "eventhub-demo-2026";
const CONCURRENCY = 50;

interface LoginResponse {
  accessToken: string;
}

interface SeatMapResponse {
  eventId: string;
  seats: { id: string; rowLabel: string; number: number; available: boolean }[];
}

async function login(): Promise<string> {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Вхід не вдався: ${res.status}`);
  const data = (await res.json()) as LoginResponse;
  return data.accessToken;
}

async function pickEventAndSeat(
  token: string,
): Promise<{ eventId: string; seatId: string; seatLabel: string }> {
  const eventsRes = await fetch(`${API}/events?limit=50`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const events = (await eventsRes.json()) as { items: { id: string; status: string }[] };
  const scheduled = events.items.find((e) => e.status === "scheduled");
  if (!scheduled) throw new Error("Немає запланованих подій для тесту");

  const seatsRes = await fetch(`${API}/events/${scheduled.id}/seats`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const map = (await seatsRes.json()) as SeatMapResponse;
  const free = map.seats.find((s) => s.available);
  if (!free) throw new Error("У цієї події немає вільних місць - запустіть db:reset");

  return { eventId: scheduled.id, seatId: free.id, seatLabel: `${free.rowLabel}-${free.number}` };
}

async function main(): Promise<void> {
  const token = await login();
  const { eventId, seatId, seatLabel } = await pickEventAndSeat(token);

  const body = JSON.stringify({ eventId, seatIds: [seatId] });

  console.log(`Подія:  ${eventId}`);
  console.log(`Місце:  ${seatLabel} (${seatId})`);
  console.log(`Потоків: ${CONCURRENCY}`);
  console.log();

  const startedAt = Date.now();

  // TODO 1 (виконано): справжній паралелізм - спершу масив обіцянок,
  // лише потім await Promise.all. Без Idempotency-Key: тест перевіряє
  // захист від гонки, а не від подвійного кліку.
  const statuses = await Promise.all(
    Array.from({ length: CONCURRENCY }, () =>
      fetch(`${API}/orders`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body,
      })
        .then((r) => r.status)
        .catch(() => 0),
    ),
  );

  const elapsedMs = Date.now() - startedAt;

  // TODO 2 (виконано): підрахунок розподілу кодів відповіді.
  const counts = new Map<number, number>();
  for (const status of statuses) {
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }

  console.log("Розподіл кодів відповіді:");
  for (const [status, count] of [...counts.entries()].sort(([a], [b]) => a - b)) {
    console.log(`  ${status || "мережева помилка"}: ${count}`);
  }
  console.log();
  console.log(`Час: ${elapsedMs} мс`);
  console.log();

  const created = counts.get(201) ?? 0;
  const conflicts = counts.get(409) ?? 0;
  const errors = [...counts.entries()]
    .filter(([status]) => status === 0 || status >= 500)
    .reduce((sum, [, count]) => sum + count, 0);

  const seat = await prisma.seat.findUniqueOrThrow({ where: { id: seatId } });
  const items = await prisma.orderItem.count({ where: { seatId } });

  const checks: [string, boolean][] = [
    ["рівно одне 201 Created", created === 1],
    ["решта - 409 Conflict", conflicts === CONCURRENCY - 1],
    ["жодної помилки 5xx", errors === 0],
    ["місце у стані HELD", seat.status === "HELD"],
    ["місце в одному замовленні", items === 1],
  ];

  console.log();
  for (const [label, ok] of checks) {
    console.log(`${ok ? "✔" : "✖"} ${label}`);
  }
  console.log();

  if (checks.every(([, ok]) => ok)) {
    console.log("Гонку витримано: останній квиток продано один раз.");
  } else {
    console.log("Гонку НЕ витримано - дивіться невдалі перевірки вище.");
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
