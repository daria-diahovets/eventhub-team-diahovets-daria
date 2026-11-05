# Лабораторна робота № 7

**Тема:** Замовлення: резерв місць, транзакції й конкурентність

## 1. Мета роботи

Навчитися розробляти програмне забезпечення для використання у багатокористувацькому режимі де присутні ситуації конкурентності в отриманні послуг, купівлі товарів, бронюванні місць тощо.

Після виконання студент уміє:

- відрізняти код, що «працює на одному запиті», від коду, що працює під навантаженням;
- виконувати перевірку й дію однією операцією бази даних;
- користуватися транзакціями Prisma й розуміти, від чого вони захищають, а від чого ні;
- проєктувати життєвий цикл сутності як скінченний автомат;
- робити POST-запит ідемпотентним через `Idempotency-Key` і унікальний індекс;
- доводити правильність навантажувальним тестом, а не припущенням.

> **Головна перевірка роботи**
>
> П'ятдесят паралельних запитів купують одне й те саме останнє місце. Рівно один отримує 201, решта сорок дев'ять – 409, жодного 500. У базі: місце зайняте одним замовленням, лічильник вільних місць збігається з фактом.

> **Правило роботи**
>
> Перевірка умови й дія за цією умовою мусять відбуватися в одній операції бази даних.
>
> Якщо між ними є хоча б один рядок коду застосунку – перевірка не гарантує нічого. Цей прийом вже був тричі:

| Тиждень | Де | Умова у `WHERE` |
|---------|----|-----------------|
| 3 | резерв місця (ескіз) | `status: "FREE"` |
| 5 | обмін refresh-токена | `usedAt: null` |
| 6 | редагування чужої події | `organizerId: user.id` |
| 7 | резерв місць при замовленні | `status: "FREE"` + перевірка `count` |

## 2. Перед початком

```bash
git checkout -b week-07/<нік-автора>
nvm use
pnpm install
docker compose up -d db
cp apps/api-gateway/.env.example apps/api-gateway/.env
cp apps/web/.env.example apps/web/.env.local
```

У `.env` замініть `JWT_ACCESS_SECRET` на випадковий рядок, як і раніше. Нові змінні вже на місці:

```text
ORDER_HOLD_MINUTES=15   # скільки хвилин замовлення тримає місця
SWEEPER_ENABLED=true    # фоновий прибиральник протермінованих резервів
SWEEPER_BATCH=200       # скільки замовлень прибирати за прохід
```

```bash
pnpm build
pnpm --filter @eventhub/api-gateway db:reset
```

### Гілка роботи

У гілку `week-07` потрібно додати:

- пакет `@nestjs/schedule` (знадобиться на кроці 5);
- три змінні оточення вище разом із їхньою перевіркою в `config/env.ts`;
- стилі карти місць і сторінки замовлення в `apps/web/src/index.css`;
- скелет `apps/api-gateway/scripts/race.ts` із двома TODO і командою `race:test` – вхід, вибір місця й перевірку бази вже написано.

## 3. План

| Крок | Що робимо |
|------|-----------|
| 0 | Побачити гонку на власні очі |
| 1 | Контракт: місця, замовлення, три маршрути |
| 2 | Схема й міграція: `Order`, `OrderItem`, TTL |
| 3 | Резерв у транзакції – серце роботи |
| 4 | Ідемпотентність: `Idempotency-Key` |
| 5 | Прибиральник протермінованих резервів |
| 6 | Доведення: 50 потоків |
| 7 | Фронтенд: карта місць і сторінка замовлення |

## 4. Крок 0. Побачити гонку

Перш ніж писати правильний код, варто один раз побачити неправильний. Цей крок не лишає слідів у репозиторії – тільки у вашій пам'яті.

Відкрийте два вікна PowerShell.

**Вікно 1:**

```bash
docker exec -it eventhub-db psql -U postgres -d eventhub
```

```sql
BEGIN;
SELECT status FROM "Seat" WHERE "rowLabel" = 'A' AND number = 1 LIMIT 1;
```

```text
 status
--------
 FREE
```

Транзакція відкрита й не закрита. Місце вільне.

**Вікно 2** – інший «покупець»:

```bash
docker exec -it eventhub-db psql -U postgres -d eventhub
```

```sql
UPDATE "Seat" SET status = 'HELD'
WHERE id = (SELECT id FROM "Seat" WHERE "rowLabel" = 'A' AND number = 1 LIMIT 1);
```

```text
UPDATE 1
```

Поверніться у вікно 1 – транзакція досі відкрита – і повторіть той самий `SELECT`:

```sql
SELECT status FROM "Seat" WHERE "rowLabel" = 'A' AND number = 1 LIMIT 1;
```

```text
 status
--------
 HELD
```

Те саме читання в тій самій транзакції дало інший результат.

**Що це означає для вашого коду.** Якщо ви напишете так:

```ts
const seat = await prisma.seat.findUnique({ where: { id } });
if (seat.status !== "FREE") throw new SeatTaken();
await prisma.seat.update({ where: { id }, data: { status: "HELD" } });
```

– то між перевіркою і записом стан місця може змінитися, і загортання цього коду в `$transaction` нічого не виправить. Транзакція дає «усе або нічого», але не заморожує дані: на рівні ізоляції Read Committed (типовому для PostgreSQL) кожен оператор бачить найсвіжіший зафіксований стан.

```sql
ROLLBACK;
\q
```

Поверніть місце у вихідний стан:

```bash
pnpm --filter @eventhub/api-gateway db:reset
```

**Контрольне питання, яке варто записати.** Скільки рядків коду застосунку має бути між перевіркою умови й дією за нею? Відповідь: нуль. До цього й зводиться вся робота.

## 5. Крок 1. Контракт

Як завжди – спершу `packages/contracts/openapi.yaml`, потім код.

### 5.1. Нові схеми

Додайте в `components.schemas`:

```yaml
Seat:
  type: object
  required: [id, rowLabel, number, price, available]
  properties:
    id: { type: string, format: uuid }
    rowLabel: { type: string }
    number: { type: integer, minimum: 1 }
    price: { $ref: "#/components/schemas/Money" }
    available:
      type: boolean
      description: >
        Чи можна зараз це місце замовити. Внутрішні стани (FREE, HELD,
        SOLD) назовні не віддаємо.

SeatMap:
  type: object
  required: [eventId, seats]
  properties:
    eventId: { type: string, format: uuid }
    seats:
      type: array
      items: { $ref: "#/components/schemas/Seat" }
```

**Чому `available: boolean`, а не `status: FREE | HELD | SOLD`.** Два окремі міркування, і обидва вагомі.

Перше – зобов'язання. Усе, що потрапило в контракт, ви зобов'язані підтримувати. Назви внутрішніх станів змінюються (у тижні 8 додасться оплата, і їх стане більше), а «можна/не можна» – ні.

Друге – витік інформації. За кількістю `HELD` стороння людина порахувала б, скільки людей зараз оформлюють замовлення. Це не ваша таємниця, але й не їхня справа.

Далі – автомат станів і саме замовлення:

```yaml
OrderStatus:
  type: string
  enum: [PENDING, PAID, CANCELLED, EXPIRED, REFUNDED]

OrderItem:
  type: object
  required: [seatId, rowLabel, number, price]
  properties:
    seatId: { type: string, format: uuid }
    rowLabel: { type: string }
    number: { type: integer }
    price: { $ref: "#/components/schemas/Money" }

Order:
  type: object
  required: [id, eventId, status, total, holdExpiresAt, createdAt, items]
  properties:
    id: { type: string, format: uuid }
    eventId: { type: string, format: uuid }
    eventTitle: { type: string }
    status: { $ref: "#/components/schemas/OrderStatus" }
    total: { $ref: "#/components/schemas/Money" }
    holdExpiresAt:
      type: string
      format: date-time
      description: Момент, до якого місця зарезервовані
    createdAt: { type: string, format: date-time }
    items:
      type: array
      items: { $ref: "#/components/schemas/OrderItem" }

CreateOrderRequest:
  type: object
  required: [eventId, seatIds]
  properties:
    eventId: { type: string, format: uuid }
    seatIds:
      type: array
      minItems: 1
      maxItems: 10
      uniqueItems: true
      items: { type: string, format: uuid }
```

**`maxItems: 10`** – не формальність. Кожне місце в запиті – це рядок, заблокований на час транзакції. Замовлення на тисячу місць тримало б тисячу рядків і зупинило б продаж усієї події.

**`holdExpiresAt` у відповіді** – щоб клієнт міг показати таймер. Зверніть увагу: сервер віддає момент, а не «лишилося 900 секунд». Різниця принципова – секунди протухають у дорозі, момент ні.

### 5.2. Маршрути

Карта місць – у розділі каталогу, бо її читають без входу: `/events/{eventId}/seats`:

```yaml
get:
  operationId: listSeats
  summary: Карта місць події
  tags: [catalog]
  parameters:
    - name: eventId
      in: path
      required: true
      schema: { type: string, format: uuid }
  responses:
    "200":
      description: Місця події
      content:
        application/json:
          schema: { $ref: "#/components/schemas/SeatMap" }
    "400": { $ref: "#/components/responses/BadRequest" }
    "404": { $ref: "#/components/responses/NotFound" }
```

Замовлення:

```yaml
/orders:
  get:
    operationId: listMyOrders
    summary: Замовлення поточного користувача
    tags: [orders]
    security: [{ bearerAuth: [] }]
    responses:
      "200":
        description: Список замовлень, найновіші першими
        content:
          application/json:
            schema:
              type: array
              items: { $ref: "#/components/schemas/Order" }
      "401": { $ref: "#/components/responses/Unauthorized" }
  post:
    operationId: createOrder
    summary: Створити замовлення й зарезервувати місця
    tags: [orders]
    security: [{ bearerAuth: [] }]
    parameters:
      - name: Idempotency-Key
        in: header
        required: false
        schema: { type: string, minLength: 8, maxLength: 200 }
    requestBody:
      required: true
      content:
        application/json:
          schema: { $ref: "#/components/schemas/CreateOrderRequest" }
    responses:
      "200":
        description: Повтор із тим самим Idempotency-Key – наявне замовлення
        content:
          application/json:
            schema: { $ref: "#/components/schemas/Order" }
      "201":
        description: Замовлення створено, місця зарезервовано
        content:
          application/json:
            schema: { $ref: "#/components/schemas/Order" }
      "400": { $ref: "#/components/responses/BadRequest" }
      "401": { $ref: "#/components/responses/Unauthorized" }
      "404": { $ref: "#/components/responses/NotFound" }
      "409":
        description: Хоча б одне місце вже зайняте
        content:
          application/problem+json:
            schema: { $ref: "#/components/schemas/Problem" }
            examples:
              seatsUnavailable:
                value:
                  type: /errors/seats-unavailable
                  title: Місця вже зайняті
                  status: 409
                  seatIds: [018f2c1e-5000-7c3d-9e1f-000000000001]
      "422":
        description: Ключ ідемпотентності вже використано з іншим тілом запиту
        content:
          application/problem+json:
            schema: { $ref: "#/components/schemas/Problem" }
```

І ще два маршрути – `GET /orders/{orderId}` та `POST /orders/{orderId}/cancel`. Напишіть їх самостійно за зразком вище; підказки:

- обидва під `bearerAuth`;
- чуже замовлення → 404, а не 403 (прийом із тижня 6);
- скасування замовлення, яке вже не `PENDING`, → 409 із типом `/errors/order-state`.

Два коди успіху на одному маршруті (200 і 201 у `POST /orders`) – не помилка й не недбалість. Клієнт має розрізняти «створено» і «це ваше попереднє замовлення»: у першому випадку доречно показати підтвердження, у другому – просто відкрити сторінку.

### 5.3. Zod-схеми

`packages/contracts/src/schemas.ts`:

```ts
// ─── Замовлення (тиждень 7) ──────────────────────────────────────────────
export const createOrderBody = z.object({
  eventId: uuidLike,
  seatIds: z
    .array(uuidLike)
    .min(1, "Оберіть хоча б одне місце")
    .max(10, "Не більше десяти місць за раз")
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "Одне й те саме місце вказано двічі",
    }),
});
export type CreateOrderBody = z.infer<typeof createOrderBody>;

export const orderIdParam = z.object({ orderId: uuidLike });
export type OrderIdParam = z.infer<typeof orderIdParam>;

export const idempotencyKey = z.string().trim().min(8).max(200);
```

**Навіщо `refine` проти дублікатів.** Якщо прислати `[A, A]`, то `updateMany` зачепить один рядок, а ми порівнюватимемо `count` із довжиною масиву – тобто з двійкою. Замовлення впаде з 409 «місце зайняте», хоча насправді воно вільне, а помилка в запиті. Повідомлення має називати причину, а не перший симптом.

Не забудьте експортувати типи з `src/index.ts`:

```ts
export type Seat = components["schemas"]["Seat"];
export type SeatMap = components["schemas"]["SeatMap"];
export type Order = components["schemas"]["Order"];
export type OrderItem = components["schemas"]["OrderItem"];
export type OrderStatus = components["schemas"]["OrderStatus"];
export type CreateOrderRequest = components["schemas"]["CreateOrderRequest"];
```

### Контрольна точка 1

```bash
pnpm --filter @eventhub/contracts build
```

Має пройти без помилок. Відкрийте `packages/contracts/src/generated/schema.ts` і переконайтесь, що там з'явилися `Order`, `SeatMap`, `CreateOrderRequest`.

Швидка перевірка специфікації: вставте `openapi.yaml` у https://editor.swagger.io/. Попереджень бути не повинно.

## 6. Крок 2. Схема й міграція

### 6.1. Нове поле в `Seat`

```prisma
model Seat {
  // ...наявні поля...

  // До якого моменту діє резерв.
  holdExpiresAt DateTime? @db.Timestamptz(3)

  orderItem OrderItem?

  @@unique([eventId, rowLabel, number])
  @@index([eventId, status])
  @@index([status, holdExpiresAt]) // під запит прибиральника
}
```

Поле необов'язкове – і це не ліньки. У таблиці вже є 801 рядок, і зробити нову колонку `NOT NULL` одним кроком неможливо. Той самий expand-contract, що й з `organizerId` у роботі 6.

### 6.2. Замовлення

```prisma
enum OrderStatus {
  PENDING
  PAID
  CANCELLED
  EXPIRED
  REFUNDED
}

model Order {
  id             String      @id @default(uuid(7)) @db.Uuid
  userId         String      @db.Uuid
  eventId        String      @db.Uuid
  status         OrderStatus @default(PENDING)
  totalCents     Int
  currency       String      @default("UAH") @db.Char(3)
  holdExpiresAt  DateTime    @db.Timestamptz(3)
  idempotencyKey String?     @unique
  createdAt      DateTime    @default(now()) @db.Timestamptz(3)
  updatedAt      DateTime    @updatedAt @db.Timestamptz(3)

  user  User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  event Event       @relation(fields: [eventId], references: [id], onDelete: Cascade)
  items OrderItem[]

  @@index([status, holdExpiresAt])
  @@index([userId, createdAt])
}

model OrderItem {
  id         String @id @default(uuid(7)) @db.Uuid
  orderId    String @db.Uuid
  seatId     String @unique @db.Uuid
  priceCents Int

  order Order @relation(fields: [orderId], references: [id], onDelete: Cascade)
  seat  Seat  @relation(fields: [seatId], references: [id], onDelete: Cascade)

  @@index([orderId])
}
```

Не забудьте додати зворотні зв'язки: `orders Order[]` у `User` і в `Event`.

Три рішення, які варто розуміти:

**`OrderItem.seatId @unique`** – остання лінія оборони. Навіть якщо у коді забудуть перевірити кількість змінених рядків, база фізично не дасть покласти одне місце у два замовлення. Перевірити можна просто:

```sql
INSERT INTO "OrderItem" ("id","orderId","seatId","priceCents")
VALUES (gen_random_uuid(), '<інше замовлення>', '<той самий seatId>', 100);
```

```text
ERROR: duplicate key value violates unique constraint "OrderItem_seatId_key"
```

**`totalCents` і `priceCents` зберігаються в замовленні,** хоча ціна є в `Seat`. Ціна події може змінитися завтра – замовлення має пам'ятати, за скільки його оформили. Це стосується будь-яких документів: рахунок не перераховується заднім числом.

**`idempotencyKey String? @unique`** – унікальність гарантує база. Детальніше на кроці 4.

### 6.3. Міграція

```bash
pnpm --filter @eventhub/api-gateway db:migrate --name orders
```

Подивіться, що Prisma згенерувала. У файлі має бути `CREATE TYPE "OrderStatus"`, дві `CREATE TABLE`, `ALTER TABLE "Seat" ADD COLUMN "holdExpiresAt"` і п'ять `CREATE INDEX`, з них два `UNIQUE`.

### 6.4. Сиди

Місця при повторному сиді перестворюються повністю, а `OrderItem` посилається на них. Каскад видалить позиції, але самі замовлення лишаться порожніми. Додайте на початок `main()`:

```ts
const removedOrders = await prisma.order.deleteMany({});
```

– і виведіть кількість у підсумковому рядку. Порядок важливий: спершу замовлення, потім місця.

### Контрольна точка 2

```bash
pnpm --filter @eventhub/api-gateway db:reset
docker exec -it eventhub-db psql -U postgres -d eventhub -c '\d "Order"'
```

Перевірте три речі:

| Що шукати | Норма |
|-----------|-------|
| тип `holdExpiresAt` | `timestamp(3) with time zone` |
| індекси | серед них `Order_idempotencyKey_key` (UNIQUE) |
| зовнішні ключі | `Order_userId_fkey`, `Order_eventId_fkey` з `ON DELETE CASCADE` |

```bash
docker exec -it eventhub-db psql -U postgres -d eventhub -c '\d "OrderItem"'
```

Має бути `OrderItem_seatId_key` – UNIQUE, а не звичайний індекс. Якщо UNIQUE немає, ви пропустили `@unique` у схемі.

## 7. Крок 3. Резерв у транзакції

### 7.1. Одне визначення вільного місця

`apps/api-gateway/src/common/seats/seat-availability.ts`:

```ts
import type { Prisma } from "@prisma/client";

/**
 * Місце доступне, якщо воно FREE або HELD із простроченим резервом.
 */
export function availableSeatWhere(now: Date): Prisma.SeatWhereInput {
  return {
    OR: [{ status: "FREE" }, { status: "HELD", holdExpiresAt: { lt: now } }],
  };
}
```

Друга половина умови – «лінивий» спосіб прибирання. Без неї протягом хвилини після закінчення TTL місце виглядало б зайнятим, хоч насправді вже не було: фоновий прибиральник прокидається раз на хвилину, а покупець дивиться на карту просто зараз.

**Чому час передається аргументом, а не береться всередині.** Усередині однієї транзакції всі перевірки мають використовувати один момент. Якщо кожен виклик братиме свій `new Date()`, перший запит може визнати резерв простроченим, а другий – ні, і ви отримаєте стан, якого не буває.

### 7.2. Автомат станів

`apps/api-gateway/src/orders/order-state.ts`:

```ts
import { OrderStatus } from "@prisma/client";

/**
 * PENDING ──оплата──────────▶ PAID ──повернення──▶ REFUNDED
 *    ├──скасував користувач─▶ CANCELLED
 *    └──минув TTL───────────▶ EXPIRED
 */
export const ALLOWED_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  [OrderStatus.PENDING]: [OrderStatus.PAID, OrderStatus.CANCELLED, OrderStatus.EXPIRED],
  [OrderStatus.PAID]: [OrderStatus.REFUNDED],
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.EXPIRED]: [],
  [OrderStatus.REFUNDED]: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
```

Таблиця переходів лежить окремо від коду, який їх виконує. Завдяки цьому на питання «чи можна з X у Y» відповідає один об'єкт, а не розкидані по сервісу умови. У тижні 8 ви додасте сюди оплату, змінивши один рядок.

### 7.3. Доменні помилки

У `common/problem/domain-errors.ts`:

```ts
export class SeatsUnavailable extends DomainError {
  constructor(readonly seatIds: string[]) {
    super("Хтось випередив вас: ці місця вже зайняті");
  }
}

export class OrderNotFound extends DomainError {
  constructor(readonly orderId: string) {
    super(`Замовлення ${orderId} не знайдено`);
  }
}

export class OrderStateConflict extends DomainError {
  constructor(readonly current: string) {
    super("Замовлення вже не очікує оплати");
  }
}

export class IdempotencyKeyReused extends DomainError {
  constructor() {
    super("Цей ключ ідемпотентності вже використано з іншим запитом");
  }
}
```

`SeatsUnavailable` несе перелік місць, і цей перелік іде в тіло відповіді. RFC 9457 дозволяє додаткові поля понад обов'язкові – скористайтесь цим: фронтенд підсвітить саме ті місця, через які не вдалося, замість «щось пішло не так».

У `problem.ts` додайте переклад (409, 404, 409, 422 відповідно). `SeatsUnavailable` – саме 409, а не 404: місця існують, їх щойно забрали. Для клієнта це різні ситуації – на 409 треба оновити карту й спробувати ще, на 404 робити нема чого.

### 7.4. Репозиторій: транзакція

`apps/api-gateway/src/orders/orders.repository.ts`. Головний метод:

```ts
async createWithHold(input: CreateOrderInput): Promise<OrderRow> {
  // Сортування прибирає цілий клас помилок – див. пояснення нижче.
  const seatIds = [...input.seatIds].sort();

  return this.prisma.$transaction(
    async (tx) => {
      const now = new Date();

      const event = await tx.event.findUnique({
        where: { id: input.eventId },
        select: { id: true },
      });
      if (!event) throw new EventNotFound(input.eventId);

      // Крок 0. Прибираємо прострочені резерви саме цієї події.
      await this.releaseExpired(tx, now, { eventId: input.eventId });

      // Крок 1. Резерв – одним атомарним UPDATE.
      const held = await tx.seat.updateMany({
        where: { id: { in: seatIds }, eventId: input.eventId, status: SeatStatus.FREE },
        data: {
          status: SeatStatus.HELD,
          holdExpiresAt: new Date(now.getTime() + input.holdMinutes * 60_000),
        },
      });

      // Крок 2. Перевірка count – обов'язкова.
      if (held.count !== seatIds.length) {
        throw new SeatsUnavailable(
          await this.whichAreTaken(tx, seatIds, input.eventId, now),
        );
      }

      // Крок 3. Ціни беремо з бази, а не з клієнта.
      const seats = await tx.seat.findMany({
        where: { id: { in: seatIds } },
        select: { id: true, priceCents: true, eventId: true },
      });
      const totalCents = seats.reduce((sum, s) => sum + s.priceCents, 0);

      // Крок 4. Лічильник – у тій самій транзакції.
      await tx.event.update({
        where: { id: input.eventId },
        data: { availableSeats: { decrement: seatIds.length } },
      });

      // Крок 5. Замовлення разом із позиціями – одним запитом.
      return tx.order.create({
        data: {
          userId: input.userId,
          eventId: input.eventId,
          status: OrderStatus.PENDING,
          totalCents,
          holdExpiresAt: new Date(now.getTime() + input.holdMinutes * 60_000),
          idempotencyKey: input.idempotencyKey,
          items: { create: seats.map((s) => ({ seatId: s.id, priceCents: s.priceCents })) },
        },
        include: ORDER_INCLUDE,
      });
    },
    { timeout: 10_000, maxWait: 5_000 },
  );
}
```

Розберем деталі наведеного коду.

**Сортування `seatIds`.** Один рядок, що прибирає цілий клас помилок. Два паралельні замовлення на `[A-12, A-13]` і `[A-13, A-12]` брали б блокування у протилежному порядку й могли зійтися у взаємному очікуванні – deadlock, SQLSTATE `40P01`. Однаковий порядок у всіх запитів робить цикл очікування неможливим. Помилка проявляється рідко й лише під навантаженням, тобто знайти її потім буде дорого.

**Крок 0.** Карта місць показує протермінований резерв як вільне місце. Логічно було б поставити таку саму умову й сюди: `status = FREE` АБО (`HELD` і прострочено). Так робити не можна. Лічильник `Event.availableSeats` за це місце вже зменшено попереднім замовленням – друге зменшення роз'їхало б його з фактом. Тому спершу чесно закриваємо старі замовлення тим самим кодом, що й прибиральник, і далі працюємо з простим `status = FREE`.

**Крок 1.** Умова `status: FREE` стоїть усередині `updateMany`, а не в `if` перед ним. Між перевіркою й записом немає жодного рядка коду застосунку – вікна гонки не існує фізично, бо один оператор `UPDATE` у PostgreSQL атомарний сам по собі.

`eventId` в умові – не надмірність. Без нього можна замовити місце чужої події, підсунувши її ідентифікатор: `seatIds` клієнтські, і довіряти їм не можна.

**Крок 2** – `updateMany` не кидає винятку, коли зачепив менше рядків, ніж ви очікували: нуль змінених рядків для нього – нормальний результат. Без перевірки `count` клієнт отримає 201 Created на замовлення, у якому зарезервовано половину місць або жодного.

Виняток усередині `$transaction` – це і є команда `ROLLBACK`. Уже зарезервовані місця повертаються у `FREE` автоматично; відкочувати руками нічого не потрібно.

**Крок 3 – ціни з бази.** Сума, надіслана браузером, – це побажання, а не факт. Якщо порахувати `total` із тіла запиту, перший же допитливий користувач купить квиток за гривню.

**Крок 4 – `decrement`, а не арифметика в JavaScript.** Порівняйте:

```ts
// ТАК НЕ ТРЕБА: читаємо в JS, віднімаємо в JS, пишемо назад
const ev = await tx.event.findUnique({ where: { id } });
await tx.event.update({ where: { id }, data: { availableSeats: ev.availableSeats - 1 } });

// ТАК ТРЕБА: читає й віднімає сама база, не випускаючи керування
await tx.event.update({ where: { id }, data: { availableSeats: { decrement: 1 } } });
```

Перший варіант – дослівно втрачене оновлення з лекції.

**`timeout: 10_000`.** Транзакція тримає блокування на рядках `Seat` і `Event`: чим вона довша, тим більше запитів чекає. Десять секунд – стеля, за якою щось пішло не так. І категорично ніяких HTTP-запитів, читання файлів чи звернень до черги всередині транзакції: ви тримаєте блокування в базі, поки чекаєте на мережу.

### 7.5. Де живе транзакція

Правило курсу – Prisma не виходить за межі репозиторію, отже `$transaction` теж лишається там. Контролер і сервіс про `tx` не знають.

Але є й наслідок, який варто побачити: репозиторій тут сам кидає доменні винятки, хоча в тижні 6 він повертав `count`, а рішення ухвалював сервіс. Причина технічна й непереборна: виняток усередині колбека `$transaction` і є механізмом відкату. Повернути «не вдалося» значенням означало б зафіксувати половину зробленого.

### 7.6. Скасування

```ts
async cancel(orderId: string, userId: string): Promise<OrderRow> {
  return this.prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: orderId, userId }, // ← умова власника у WHERE
      select: { id: true, eventId: true, status: true, items: { select: { seatId: true } } },
    });
    if (!order) throw new OrderNotFound(orderId);

    const moved = await tx.order.updateMany({
      where: { id: orderId, status: OrderStatus.PENDING }, // ← умова стану у WHERE
      data: { status: OrderStatus.CANCELLED },
    });
    if (moved.count === 0) {
      const fresh = await tx.order.findUnique({
        where: { id: orderId }, select: { status: true },
      });
      throw new OrderStateConflict(fresh?.status ?? order.status);
    }

    await this.releaseSeats(tx, order.eventId, order.items.map((i) => i.seatId));
    // ...перечитати й повернути замовлення
  });
}
```

Перехід теж виконується атомарним `UPDATE` з умовою: `status: PENDING` стоїть у `WHERE`. Два паралельні скасування того самого замовлення дадуть `count = 1` і `count = 0` – місця повернуться рівно один раз.

Повернення місць:

```ts
private async releaseSeats(db: Tx, eventId: string, seatIds: string[]): Promise<void> {
  if (seatIds.length === 0) return;
  const ordered = [...seatIds].sort();

  const released = await db.seat.updateMany({
    where: { id: { in: ordered }, status: SeatStatus.HELD },
    data: { status: SeatStatus.FREE, holdExpiresAt: null },
  });

  if (released.count > 0) {
    await db.event.update({
      where: { id: eventId },
      data: { availableSeats: { increment: released.count } },
    });
  }
}
```

Лічильник збільшується на `released.count`, а не на `seatIds.length`. Якщо частину місць уже звільнили раніше, подвійного повернення не станеться.

### 7.7. Сервіс і контролер

Сервіс поки без ідемпотентності (вона – наступний крок):

```ts
async create(user: AuthUser, body: CreateOrderBody): Promise<Order> {
  const row = await this.repo.createWithHold({
    userId: user.id,
    eventId: body.eventId,
    seatIds: body.seatIds,
    holdMinutes: env.ORDER_HOLD_MINUTES,
    idempotencyKey: null,
  });
  return toOrder(row);
}
```

Контролер – під `JwtAuthGuard`, без перевірки ролей: купувати квитки може будь-хто, хто увійшов.

Карту місць додайте в `CatalogModule` (`SeatRepository` + метод `seatMap` у сервісі + маршрут `GET :eventId/seats` у контролері). Подію перевіряйте окремо: порожній масив місць – це нормальний стан для фестивалю без нумерації, а не ознака того, що події немає.

### Контрольна точка 3

```bash
pnpm --filter @eventhub/api-gateway dev
```

```powershell
function Login($email) {
  $body = @{ email = $email; password = "eventhub-demo-2026" } | ConvertTo-Json
  (Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3000/auth/login `
    -ContentType "application/json" -Body $body).accessToken
}

$t  = Login "student@example.com"
$h  = @{ Authorization = "Bearer $t" }
$ev = "018f2c1e-4a7b-7c3d-9e1f-2a5b6c7d8e9f"

$seats = Invoke-RestMethod "http://127.0.0.1:3000/events/$ev/seats"
$seats.seats.Count        # 143

$free = ($seats.seats | Where-Object available)[0].id
$body = @{ eventId = $ev; seatIds = @($free) } | ConvertTo-Json

$r = Invoke-WebRequest -Method Post -Uri http://127.0.0.1:3000/orders `
  -Headers $h -ContentType "application/json" -Body $body
$r.StatusCode                              # 201
($r.Content | ConvertFrom-Json).status     # PENDING
```

Повторіть той самий запит на те саме місце:

```powershell
$r2 = Invoke-WebRequest -Method Post -Uri http://127.0.0.1:3000/orders `
  -Headers $h -ContentType "application/json" -Body $body -SkipHttpErrorCheck
$r2.StatusCode                             # 409
($r2.Content | ConvertFrom-Json).seatIds   # той самий ідентифікатор
```

І лічильник:

```powershell
(Invoke-RestMethod "http://127.0.0.1:3000/events/$ev").availableSeats   # 142
```

142, а не 143. Якщо бачите 143 – крок 4 пропущено або виконано поза транзакцією.

## 8. Крок 4. Ідемпотентність

### 8.1. Проблема

Подвійний клік – це лише перша з п'яти причин, через які той самий запит прилітає двічі:

| Звідки повтор | Чи контролює фронтенд |
|---------------|-----------------------|
| користувач натиснув кнопку двічі | так (`disabled`) |
| браузер повторив запит після тайм-ауту мережі | ні |
| F5 на сторінці з POST | ні |
| мобільний застосунок перепідключився (Wi-Fi → LTE) | ні |
| платіжна система доставила webhook удруге (тиждень 8) | ні |

Чотири з п'яти рядків фронтенд не контролює взагалі. Отже, захист мусить бути на бекенді.

### 8.2. Контракт

Клієнт генерує ключ один раз на одне натискання і повторює його без змін при будь-якому повторі запиту:

```http
POST /orders
Idempotency-Key: 9f1c4b7e-8d20-4a5f-b3c6-77ee1a2d0b94

{ "eventId": "...", "seatIds": ["..."] }
```

### 8.3. Реалізація

```ts
async create(user: AuthUser, body: CreateOrderBody, key: string | undefined) {
  if (!key) {
    const row = await this.repo.createWithHold({ /* ...idempotencyKey: null */ });
    return { order: toOrder(row), replayed: false };
  }

  // Швидкий шлях: ключ уже відомий.
  const known = await this.repo.findByIdempotencyKey(key);
  if (known) return { order: this.replay(known, user, body), replayed: true };

  try {
    const row = await this.repo.createWithHold({ /* ...idempotencyKey: key */ });
    return { order: toOrder(row), replayed: false };
  } catch (err) {
    if (!isUniqueViolationOn(err, "idempotencyKey")) throw err;

    const row = await this.repo.findByIdempotencyKey(key);
    if (!row) throw err;
    return { order: this.replay(row, user, body), replayed: true };
  }
}
```

Найважливіше в цьому коді – чого в ньому немає.

Перевірка `findByIdempotencyKey` перед вставкою виглядає як захист. Вона ним не є. Два паралельні запити з однаковим ключем обидва побачать «такого немає» й обидва підуть вставляти – це рівно той самий check-then-write, з якого починалося заняття. Її справжня роль – економія: на звичайному (послідовному) повторі не доводиться заходити в транзакцію.

Захищає `catch` на `P2002`: унікальний індекс у базі. Її перевірка атомарна, наша – ні.

```ts
const UNIQUE_VIOLATION = "P2002";

function isUniqueViolationOn(err: unknown, field: string): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (err.code !== UNIQUE_VIOLATION) return false;
  const target = err.meta?.["target"];
  return Array.isArray(target) ? target.includes(field) : target === field;
}
```

Перевіряємо конкретне поле, а не просто «якась унікальність порушилася»: `OrderItem.seatId` теж унікальний, і сплутати ці випадки означало б повернути чуже замовлення замість 409.

### 8.4. Дві перевірки перед поверненням

```ts
private replay(row: OrderRow, user: AuthUser, body: CreateOrderBody): Order {
  // 1. Чужий ключ не повертає чуже замовлення
  if (row.userId !== user.id) throw new IdempotencyKeyReused();

  // 2. Той самий ключ з іншим тілом – 422
  const same =
    row.eventId === body.eventId &&
    row.items.length === body.seatIds.length &&
    [...row.items.map((i) => i.seatId)].sort().join() ===
      [...body.seatIds].sort().join();
  if (!same) throw new IdempotencyKeyReused();

  return toOrder(row);
}
```

Перша перевірка обов'язкова, бо `idempotencyKey` унікальний глобально, а не в межах користувача. Без неї, підібравши ключ, можна було б читати чужі замовлення.

**Питання для обговорення.** Чи не краще зробити `@@unique([userId, idempotencyKey])`? Так, краще. Тут залишено глобальний індекс навмисно, щоб було видно: унікальний індекс сам по собі ще не визначає межу безпеки. Якщо у звіті ви запропонуєте складений індекс із поясненням – це зарахується як покращення.

Друга перевірка: той самий ключ з іншим тілом. Повернути наявне замовлення не можна – клієнт просив не його; створити нове теж не можна – ключ витрачено. Лишається 422 і чесне «згенеруйте новий ключ».

### 8.5. Контролер: 201 проти 200

```ts
@Post()
async create(
  @CurrentUser() user: AuthUser,
  @Body() body: CreateOrderBodyDto,
  @Headers("idempotency-key") rawKey: string | undefined,
  @Res({ passthrough: true }) res: Response,
): Promise<Order> {
  const parsed = idempotencyKey.safeParse(rawKey);
  const key = parsed.success ? parsed.data : undefined;

  const { order, replayed } = await this.orders.create(user, body, key);
  res.status(replayed ? 200 : 201);
  return order;
}
```

`passthrough: true` означає «дай мені `res`, але відповідь формуй сам із повернутого значення» – інакше Nest перестав би серіалізувати результат і довелося б писати `res.json()` руками.

Заголовок не проходить через глобальний pipe (у `@Headers` немає DTO-класу), тому перевіряємо схемою тут. Некоректний ключ ігноруємо, а не відхиляємо весь запит: ідемпотентність – послуга клієнту, а не умова роботи.

### Контрольна точка 4

```powershell
$key = [guid]::NewGuid().ToString()
$hk  = $h + @{ "Idempotency-Key" = $key }

$seats = Invoke-RestMethod "http://127.0.0.1:3000/events/$ev/seats"
$free  = ($seats.seats | Where-Object available)[0].id
$body  = @{ eventId = $ev; seatIds = @($free) } | ConvertTo-Json

(Invoke-WebRequest -Method Post -Uri http://127.0.0.1:3000/orders `
  -Headers $hk -ContentType "application/json" -Body $body).StatusCode   # 201
(Invoke-WebRequest -Method Post -Uri http://127.0.0.1:3000/orders `
  -Headers $hk -ContentType "application/json" -Body $body).StatusCode   # 200
```

І в базі:

```sql
SELECT count(*) FROM "Order" WHERE "idempotencyKey" = '<ваш ключ>';
```

```text
 count
-------
     1
```

Одне замовлення, хоч запитів було два.

## 9. Крок 5. Прибиральник

### 9.1. Навіщо, якщо є «лінива» умова

Лінива умова `availableSeatWhere` дає правильну відповідь, але не приводить дані до ладу:

- замовлення назавжди лишається `PENDING`, і користувач бачить у «моїх замовленнях» щось незрозуміле;
- `Event.availableSeats` лишається заниженим – його зменшили при резерві й ніхто не збільшив назад;
- таблиця `Seat` заростає рядками `HELD`, які нікому не належать.

Потрібні обидва механізми: лінива умова – для читання, прибиральник – для порядку в даних.

### 9.2. Метод репозиторію

```ts
private async releaseExpired(
  db: Tx,
  now: Date,
  scope: { eventId?: string; batch?: number } = {},
): Promise<number> {
  const stale = await db.order.findMany({
    where: {
      status: OrderStatus.PENDING,
      holdExpiresAt: { lt: now },
      ...(scope.eventId ? { eventId: scope.eventId } : {}),
    },
    take: scope.batch ?? 100, // порціями
    orderBy: { holdExpiresAt: "asc" },
    select: { id: true, eventId: true, items: { select: { seatId: true } } },
  });

  let expired = 0;
  for (const order of stale) {
    const moved = await db.order.updateMany({
      where: { id: order.id, status: OrderStatus.PENDING }, // ← знову умова у WHERE
      data: { status: OrderStatus.EXPIRED },
    });
    if (moved.count === 0) continue; // ← і знову перевірка count

    await this.releaseSeats(db, order.eventId, order.items.map((i) => i.seatId));
    expired += 1;
  }
  return expired;
}
```

**`moved.count === 0` → `continue`** – та сама умова у `WHERE`, тепер у фоновому завданні. Якщо замовлення вже скасував користувач або прибрав інший екземпляр застосунку, місця ми не чіпаємо. Без цієї перевірки два прибиральники повернули б одні й ті самі місця двічі й роздули лічильник.

**`take`** – не оптимізація, а захист: один запит не повинен блокувати тисячі рядків.

### 9.3. Завдання за розкладом

`ScheduleModule.forRoot()` – в `AppModule`, один раз на застосунок. Якщо покласти його в `OrdersModule`, то при появі другого завдання в іншому модулі планувальник підніметься двічі.

```ts
@Injectable()
export class ExpiredHoldsSweeper {
  constructor(
    private readonly repo: OrdersRepository,
    @InjectPinoLogger(ExpiredHoldsSweeper.name) private readonly logger: PinoLogger,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: "expired-holds" })
  async sweep(): Promise<void> {
    if (!env.SWEEPER_ENABLED) return;

    const started = Date.now();
    try {
      const expired = await this.repo.sweepExpired(env.SWEEPER_BATCH);
      if (expired > 0) {
        this.logger.info({ expired, ms: Date.now() - started },
          "прибрано протермінованих замовлень");
      }
    } catch (err) {
      this.logger.error({ err }, "прибиральник резервів упав");
    }
  }
}
```

`try/catch` обов'язковий. Виняток із фонового завдання нікуди не поширюється: немає ані запиту, ані клієнта, який побачив би 500. Без `catch` помилка просто зникне, а разом із нею – і розуміння, що прибирання більше не працює.

### Контрольна точка 5

Щоб не чекати чверть години, поставте в `.env`:

```text
ORDER_HOLD_MINUTES=1
```

Перезапустіть бекенд, створіть замовлення й зачекайте дві хвилини. У логах:

```text
[18:16:00] INFO: прибрано протермінованих замовлень {"expired":1,"ms":14}
```

```powershell
(Invoke-RestMethod "http://127.0.0.1:3000/orders/$id" -Headers $h).status          # EXPIRED
(Invoke-RestMethod "http://127.0.0.1:3000/events/$ev").availableSeats              # відновилось
```

Окремо подивіться на ліниву умову. Поставте `SWEEPER_ENABLED=false`, перезапустіть, створіть замовлення й зачекайте хвилину:

```powershell
($seats.seats | Where-Object { $_.id -eq $free }).available   # True
```

```sql
SELECT status FROM "Seat" WHERE id = '<той самий>';   -- досі HELD
```

Карта каже «вільне», база каже `HELD`. Обидві відповіді правильні – і саме тому потрібні обидва механізми.

Поверніть `ORDER_HOLD_MINUTES=15` і `SWEEPER_ENABLED=true`.

## 10. Крок 6. Доведення

### 10.1. Що треба дописати

У `apps/api-gateway/scripts/race.ts` два TODO. Вхід, вибір місця й перевірка стану бази вже написані.

**TODO 1 – паралельний обстріл.** Найчастіша помилка:

```ts
// ЦЕ НЕ ТЕСТ НА ГОНКИ: запити йдуть ПО ЧЕРЗІ
for (let i = 0; i < 50; i++) {
  const r = await fetch(url, { ... });
  statuses.push(r.status);
}
```

Тут другий запит почнеться після того, як перший повністю завершиться. Жодного перекриття в часі – отже, жодної гонки, і тест пройде навіть на зламаному коді.

Правильно: спершу створити масив обіцянок, і лише потім чекати на всі.

```ts
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
```

`.catch(() => 0)` – щоб мережева помилка не загубилась: вона теж результат, і дуже поганий.

Заголовок `Idempotency-Key` тут не надсилаємо. Ми перевіряємо захист від гонки, а не від подвійного кліку. З однаковим ключем усі 50 запитів злилися б в одне замовлення, і тест проходив би навіть на зламаному резерві.

**TODO 2 – підрахунок.** `Map<number, number>` або `reduce` – на ваш смак.

### 10.2. Чому перевірки стану бази важливіші за коди відповіді

Погляньте, що перевіряє готова частина скрипта:

```ts
const checks: [string, boolean, string][] = [
  ["рівно одне 201 Created", created === 1, ...],
  ["решта – 409 Conflict", conflicts === CONCURRENCY - 1, ...],
  ["жодної помилки 5xx", errors === 0, ...],
  ["місце у стані HELD", seat.status === "HELD", ...],
  ["місце в одному замовленні", items === 1, ...],
];
```

Перші три дивляться на відповіді, останні дві – на дані. Другі важливіші. Розподіл кодів може бути «правильним» і при зламаній логіці: якщо 49 запитів упали з 500, а один відповів 201, то `created === 1` виконається. Правду каже лише стан даних після.

### 10.3. Запуск

```bash
# термінал 1
pnpm --filter @eventhub/api-gateway dev

# термінал 2
pnpm --filter @eventhub/api-gateway db:reset
pnpm --filter @eventhub/api-gateway race:test
```

```text
Подія:  018f2c1e-4a7b-7c3d-9e1f-2a5b6c7d8e9f
Місце:  A-1 (018f2c1e-5000-...)
Потоків: 50

Розподіл кодів відповіді:
  201: 1
  409: 49

Час: 612 мс

✔ рівно одне 201 Created
✔ решта – 409 Conflict
✔ жодної помилки 5xx
✔ місце у стані HELD
✔ місце в одному замовленні

Гонку витримано: останній квиток продано один раз.
```

Прогоніть тест щонайменше тричі, щоразу після `db:reset`. Гонка нестабільна за природою: помилка, що проявляється раз на три запуски, нічим не краща за ту, що проявляється щоразу.

### 10.4. Зламайте й подивіться

Цей підпункт обов'язковий – без нього ви не знатимете, чи тест узагалі щось перевіряє. Числа нижче виміряні на PostgreSQL 16 і 50 паралельних з'єднаннях; у вас вони будуть близькими, але не обов'язково такими самими.

#### Експеримент А. Прибрати перевірку `count`

Закоментуйте в `createWithHold`:

```ts
// if (held.count !== seatIds.length) throw new SeatsUnavailable(...);
```

```text
Розподіл кодів відповіді:
  201: 1
  500: 49
```

```sql
SELECT count(*) FROM "Order";                              -- 1
SELECT "availableSeats" FROM "Event" WHERE id = '...';     -- 142
```

Прочитайте це уважно, бо висновок не той, якого очікуєш.

Подвійного продажу не сталося – але не завдяки вашому коду. Сорок дев'ять транзакцій дійшли до вставки `OrderItem` і впали на унікальному індексі `OrderItem_seatId_key`. Спрацювала остання лінія оборони, про яку йшлося на кроці 2.

Ціна цього порятунку: замість зрозумілого `409 Місця вже зайняті` сорок дев'ять користувачів отримали `500 Внутрішня помилка сервера`. Для них застосунок просто зламався.

Подивіться, що було б без індексу. Приберіть його – і одразу поверніть усе назад через `db:reset`:

```sql
DROP INDEX "OrderItem_seatId_key";
```

```text
Розподіл кодів відповіді:
  201: 50
```

```sql
SELECT count(*) FROM "OrderItem";                          -- 50 позицій на ОДНЕ місце
SELECT "availableSeats" FROM "Event" WHERE id = '...';     -- -49
```

П'ятдесят успішних відповідей, п'ятдесят проданих квитків на одне крісло й від'ємна кількість вільних місць. Жодної помилки в логах: з погляду застосунку все пройшло ідеально.

І найгірше – індекс уже не повернути:

```text
ERROR: could not create unique index "OrderItem_seatId_key"
DETAIL: Key ("seatId")=(...) is duplicated.
```

Обмеження в базі захищає тільки доти, доки його додали до того, як дані зіпсувалися.

Поверніть перевірку `count` і виконайте `db:reset`.

#### Експеримент Б. Перевірка перед записом

Замініть атомарний `updateMany` на те, з чого починалася лекція:

```ts
const seat = await tx.seat.findUnique({ where: { id: seatIds[0] } });
if (seat?.status !== "FREE") throw new SeatsUnavailable(seatIds);
await tx.seat.update({ where: { id: seatIds[0] }, data: { status: "HELD" } });
```

Зверніть увагу: код усередині транзакції, і все одно ламається. Три прогони поспіль:

```text
прогін 1:  201: 1   409: 48   500: 1
прогін 2:  201: 1   409: 49
прогін 3:  201: 1   409: 47   500: 2
```

Прогін 2 виглядає бездоганно. Якби ви запустили тест один раз і потрапили на нього – здали б роботу з дірявим кодом і нічого б не запідозрили.

Решта двох прогонів показують правду: один-два запити встигли прослизнути між `findUnique` і `update`, обидва вважали місце вільним, обидва пішли створювати замовлення – і впали на унікальному індексі. Без нього це були б зайві 201.

Два висновки, які варто записати в звіт:

1. Транзакція дає «усе або нічого», але не захищає від конкурентів. Код усередині `$transaction` помилявся так само, як помилявся б поза нею.
2. Один успішний прогін навантажувального тесту не доводить нічого. Гонка нестабільна за природою – тому прогонів має бути щонайменше три, а краще п'ять.

Зафіксуйте фактичні числа обох експериментів у звіті. Поверніть код і виконайте `db:reset`.

### Контрольна точка 6

- [ ] `race:test` проходить три рази поспіль після `db:reset`
- [ ] експеримент А зафіксовано: розподіл кодів і стан бази
- [ ] експеримент Б зафіксовано: три прогони, бо результат нестабільний
- [ ] код повернуто до робочого стану, `db:reset` виконано

## 11. Крок 7. Фронтенд (домашнє)

Нових ідей тут немає, але є дві деталі, на які варто звернути увагу.

### 11.1. Де народжується ключ ідемпотентності

```ts
function buy(): void {
  order.mutate({
    eventId: eventId!,
    seatIds: [...selected],
    idempotencyKey: crypto.randomUUID(), // ← саме тут
  });
}
```

Ключ генерується в обробнику натискання, а не всередині функції запиту. Якби він створювався в `createOrder`, кожна повторна спроба – у тому числі автоматичний повтор після 401 і оновлення токена в `api/client.ts` – отримала б новий ключ, і захист зник би рівно тоді, коли потрібен.

### 11.2. Таймер нічого не вирішує

```ts
export function useCountdown(deadlineIso: string): number { /* ... */ }
```

Хук показує час до `holdExpiresAt`, який прислав сервер. Коли лічильник добігає нуля, сторінка пише «час вийшов» – але рішення однаково ухвалює сервер при наступному запиті. Інакше достатньо було б перевести годинник на комп'ютері, щоб «продовжити» резерв.

Не забудьте зняти інтервал у `return` з `useEffect`: без цього після переходу на іншу сторінку таймер працюватиме далі.

### 11.3. Що зробити

- `SeatMap.tsx` – карта місць; зайняте місце `disabled`, обране підсвічене;
- `EventPage.tsx` – вибір місць, підсумок, кнопка «Замовити»; при 409 підсвітити місця зі списку `seatIds` у тілі помилки й перечитати карту;
- `OrderPage.tsx` – позиції, сума, таймер, кнопка «Скасувати»;
- `MyOrdersPage.tsx` – список замовлень;
- маршрути `/orders` і `/orders/:orderId` під `RequireAuth`.

Стилі вже є в `index.css` – верстку писати не треба.

Після створення замовлення інвалідуйте три ключі: карту місць, саму подію (змінився `availableSeats`) і список замовлень.

## 12. Критерії приймання

- [ ] `race:test` дає рівно один 201, решта 409, жодного 5xx – тричі поспіль
- [ ] тест перевіряє стан бази, а не лише коди відповіді
- [ ] у коді немає `if` із перевіркою поля перед `update` цього ж поля
- [ ] після `updateMany` завжди перевіряється `count`
- [ ] усередині `$transaction` немає звертань до `this.prisma` замість `tx`
- [ ] `seatIds` сортуються перед резервом
- [ ] лічильник оновлюється через `{ decrement }` / `{ increment }`, а не арифметикою в JS
- [ ] ціни беруться з бази, а не з тіла запиту
- [ ] повторний POST із тим самим `Idempotency-Key` → 200 і той самий id
- [ ] унікальність ключа забезпечує індекс + `catch (P2002)`, а не `SELECT` перед вставкою
- [ ] той самий ключ з іншим тілом → 422
- [ ] чуже замовлення → 404, не 403
- [ ] повторне скасування → 409 із поточним станом
- [ ] прибиральник перевіряє `count` при переході `PENDING → EXPIRED`
- [ ] `@Cron` обгорнуто в `try/catch`
- [ ] ADR-007 із розділом «Наслідки»
- [ ] звіт із числами експериментів А і Б

## 13. Типові проблеми

| Симптом | Причина | Дія |
|---------|---------|-----|
| `race:test`: кілька 201 | перевірка стоїть перед записом, а не в `WHERE` | умова `status: "FREE"` – усередині `updateMany` |
| `race:test`: усі 201, частина 500 | немає перевірки `count`; падає унікальний індекс `OrderItem_seatId_key` | додати перевірку `held.count !== seatIds.length` |
| `race:test`: усі 409, жодного 201 | `db:reset` не виконано, усі місця вже зайняті | `db:reset` перед кожним прогоном |
| `race:test`: 50 × 201 і 50 замовлень | забуто `.catch` і `Promise.all` – запити йдуть по черзі | створити масив обіцянок, потім `await Promise.all` |
| `availableSeats` не змінюється | `tx.event.update` поза транзакцією або забуто | крок 4 у `createWithHold` |
| `availableSeats` стає від'ємним | лічильник зменшується, але не збільшується при скасуванні/прибиранні | `releaseSeats` має робити `increment` |
| `availableSeats` росте без причини | прибиральник повертає місця двічі | перевірка `moved.count === 0` → `continue` |
| Замовлення створилося, а місця вільні | `updateMany` виконано на `this.prisma`, а не на `tx` | `grep -n "this.prisma" orders.repository.ts` |
| `deadlock detected`, `40P01` | `seatIds` не сортуються | `[...input.seatIds].sort()` |
| `Transaction already closed` | транзакція довша за `timeout` або в ній є `await fetch` | прибрати мережу з транзакції, підняти `timeout` |
| Повтор із ключем дає 201, а не 200 | статус не виставляється вручну | `@Res({ passthrough: true })` + `res.status(...)` |
| Повтор із ключем дає 500 | `catch` ловить `P2002`, але не знаходить замовлення | перевіряти саме поле `idempotencyKey` в `err.meta.target` |
| `@Cron` ніколи не викликається | немає `ScheduleModule.forRoot()` в `AppModule` | додати |
| Прибиральник мовчки перестав працювати | виняток у `@Cron` нікуди не поширюється | обгорнути в `try/catch` з логуванням |
| Карта місць показує `HELD` як зайняте після TTL | немає «лінивої» умови | `availableSeatWhere` з `holdExpiresAt: { lt: now }` |
| `ERR_PNPM_PEER_DEP_ISSUES` на `@nestjs/schedule` | версія пакета не збіглася з лінією NestJS | `pnpm --filter @eventhub/api-gateway add @nestjs/schedule` |
| `Unknown argument 'holdExpiresAt'` | клієнт Prisma не перегенеровано | `pnpm --filter @eventhub/api-gateway build` |
| Кракозябри в `psql` під Windows | кодування консолі | `chcp 65001` перед `docker exec` |

## 14. Здача

```bash
git add .
git commit -m "feat(orders): резерв місць із TTL, ідемпотентність, прибиральник"
git push -u origin week-07/<нік-автора>
```

Pull request у `main`. До опису PR додайте:

1. вивід `race:test` (три прогони);
2. числа експериментів А і Б із кроку 6.4;
3. посилання на ADR-007.

Рев'ювер зобов'язаний перевірити дві речі, які не видно з тесту:

- чи немає `this.prisma` всередині `$transaction`;
- чи перевіряється `count` після кожного `updateMany`.

## 15. Домашнє завдання

1. **Скасування резерву (обов'язкове).** Якщо не встигли на занятті – `POST /orders/{id}/cancel`: перехід `PENDING → CANCELLED`, повернення місць у `FREE`, відновлення `availableSeats`. Дозволено лише власнику (умова у `WHERE`, не `if`) і лише зі стану `PENDING`.

2. **Фронтенд (обов'язкове).** Крок 7.

3. **ADR-007 (обов'язкове).** «Стратегія конкурентності при резерві місць». Структура як завжди: Контекст – Рішення – Наслідки. Відповідайте на три питання:

   - чому атомарний `UPDATE`, а не `SELECT ... FOR UPDATE`;
   - чому Read Committed, а не Serializable;
   - що саме ви втратили, обравши цей шлях.

   Розділ «Наслідки» без жодного мінуса означає, що ви не аналізували, а виправдовувались.

4. **Обмеження «не більше 4 квитків на користувача на подію» (на оцінку).** Задача навмисно складніша, ніж здається. Умова охоплює кілька рядків одразу: треба порахувати вже куплені квитки й не дати перевищити межу. Записати це в `WHERE` одного `UPDATE` не вийде.

   Запропонуйте й обґрунтуйте рішення. Варіанти, які варто розглянути:

   - рівень ізоляції Serializable із повтором при `40001`;
   - `SELECT ... FOR UPDATE` на рядку користувача як точка серіалізації;
   - денормалізований лічильник із унікальним обмеженням.

   У звіті – чому обрали саме цей і чим він гірший за інші.

5. **Черга очікування.** Коли місце звільняється, воно дістається тому, хто першим натисне кнопку. Як зробити чесну чергу? Підказка: `SELECT ... FOR UPDATE SKIP LOCKED`.
