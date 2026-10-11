# Лабораторна робота № 3

**Тема:** Робота з PostgreSQL і Prisma

## 1. Мета роботи

Замінити масив у пам'яті справжньою базою – не змінивши ані контролер, ані сервіс.

Після виконання студент уміє:

- спроєктувати схему з правильними типами для грошей і часу;
- вести міграції й відтворювати базу з нуля однією командою;
- писати ідемпотентні сиди;
- реалізувати курсорну пагінацію запитом, який лягає на індекс;
- прочитати план запиту й виміряти ефект індексу;
- розпізнати N+1 за журналом запитів і усунути його.

> **Головна перевірка роботи**
>
> ```bash
> git status apps/api-gateway/src/catalog
> ```
>
> Змінився один файл із чотирьох – `event.repository.ts`. Контролер, сервіс і робота з курсором не переписувалися. Заради цього шар репозиторію й виділявся минулого тижня.

## 2. Перед початком

```bash
git checkout -b week-03/<нік-автора>
nvm use
pnpm install
```

### Створіть та підніміть базу даних

Можна використати docker. Помістіть `docker-compose.yml` у проєкт – це інфраструктура, не мета навчання, тому можна скористатися готовим рішенням (див. файл `docker-compose.yml` в закріплених файлах даного завдання).

```bash
docker compose up -d db
docker compose ps
```

```text
NAME          STATUS                    PORTS
eventhub-db   Up 8 seconds (healthy)    0.0.0.0:5432->5432/tcp
```

Дочекайтесь `healthy`. Postgres у контейнері приймає з'єднання не одразу після старту, і перша міграція, запущена надто рано, впаде з `Connection refused`.

```bash
cp apps/api-gateway/.env.example apps/api-gateway/.env
```

Саме `.env`, а не `.env.local`. Prisma CLI читає файл із такою назвою й іншої не шукає. Він у `.gitignore`; у репозиторій іде лише `.env.example`.

У якості альтернативного рішення можна поставити Postgres інсталятором (`winget install PostgreSQL.PostgreSQL.17`), створіть базу `eventhub` і виправте пароль у `DATABASE_URL`. Решта кроків не змінюється.

## 3. План

| Крок | Що робимо |
|------|-----------|
| 1 | Підключаємо Prisma, вчимо застосунок читати `.env` |
| 2 | Описуємо схему |
| 3 | Перша міграція |
| 4 | Сиди |
| 5 | Переписуємо репозиторій |
| 6 | Вимірюємо |

## 4. Крок 1. Prisma й оточення

### 4.1. Залежності

```bash
pnpm --filter @eventhub/api-gateway add @prisma/client dotenv
pnpm --filter @eventhub/api-gateway add -D prisma tsx
```

Додайте в `pnpm-workspace.yaml`:

```yaml
allowBuilds:
  esbuild: true
  "@prisma/client": true   # генерує клієнт під час установки
  prisma: true             # завантажує рушій запитів
  "@scarf/scarf": false
```

Це потрібно, оскільки pnpm 11 за замовчуванням блокує build-скрипти залежностей – захист від зловмисних пакетів. Prisma без своїх скриптів не працює: один пакет генерує клієнт, другий завантажує рушій запитів.

Це дозволяє двом пакетам виконати код на своїй машині. Без цих рядків установка впаде з `ERR_PNPM_IGNORED_BUILDS`.

### 4.2. Читання `.env`

Відкрийте `apps/api-gateway/src/config/env.ts` і додайте на початку:

```ts
import { config as loadDotenv } from "dotenv";
loadDotenv();
```

Далі – нову змінну в схему:

```ts
const envSchema = z.object({
  DATABASE_URL: z.string().url(), // без значення за замовчуванням
  // ... решта без змін
  PRISMA_LOG: z.enum(["query", "off"]).default("off"),
});
```

**Використання `dotenv`, а не `@nestjs/config`.** Цей модуль обчислюється під час імпорту – раніше, ніж Nest починає піднімати модулі. `ConfigModule` заповнив би `process.env` занадто пізно, і валідація впала б на порожньому `DATABASE_URL`. Порядок ініціалізації тут важливіший за вибір бібліотеки. Це типова пастка: рішення виглядає правильним, а падає через те, коли саме виконується код.

Зверніть увагу, `DATABASE_URL` немає значення за замовчуванням. Мовчки підключитися «кудись» гірше, ніж не стартувати з чітким повідомленням. Порівняйте з `PORT`, де замовчування доречне.

### Контрольна точка 1

```bash
pnpm --filter @eventhub/api-gateway dev
```

Застосунок має стартувати. Якщо `DATABASE_URL` не задано – впасти з повідомленням, у якому названо саме цю змінну.

## 5. Крок 2. Схема

Створіть `apps/api-gateway/prisma/schema.prisma`.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum SeatStatus {
  FREE
  HELD
  SOLD
}

model Venue {
  id     String  @id @default(uuid(7)) @db.Uuid
  name   String
  city   String
  events Event[]

  @@index([city])
}

model Event {
  id             String   @id @default(uuid(7)) @db.Uuid
  title          String
  description    String?
  startsAt       DateTime @db.Timestamptz(3)
  minPriceCents  Int
  currency       String   @default("UAH") @db.Char(3)
  availableSeats Int      @default(0)
  venueId        String   @db.Uuid
  createdAt      DateTime @default(now()) @db.Timestamptz(3)

  venue Venue  @relation(fields: [venueId], references: [id])
  seats Seat[]

  @@index([startsAt, id])
  @@index([venueId])
}

model Seat {
  id         String     @id @default(uuid(7)) @db.Uuid
  eventId    String     @db.Uuid
  rowLabel   String
  number     Int
  priceCents Int
  status     SeatStatus @default(FREE)

  event Event @relation(fields: [eventId], references: [id], onDelete: Cascade)

  @@unique([eventId, rowLabel, number])
  @@index([eventId, status])
}
```

### Пояснення до структури моделей

**`@db.Timestamptz(3)`, а не просто `DateTime`.** За замовчуванням Prisma створює колонку `timestamp` – момент часу без пояса. Подія о 19:00 стане різною для клієнта в Києві та в Берліні, а локально помилка не проявиться взагалі: у вас один пояс і на машині, і в базі. Вилізе це в тижні 14, на сервері.

**Гроші двома колонками.** `minPriceCents Int` – копійки цілим числом. `Decimal(12,2)` теж коректний вибір; `Float` – ніколи, бо `0.1 + 0.2 ≠ 0.3` у двійковому поданні. Зверніть увагу: у базі гроші лежать двома колонками, а в контракті це один об'єкт `Money { amount, currency }`. Переклад робитиметься в репозиторії на кроці 5. Це не незручність, а нормальний стан справ: рядок таблиці й об'єкт домену – різні речі.

**`availableSeats` як колонка, а не `COUNT(*)`.** Свідома денормалізація. Рахувати вільні місця на кожен елемент списку – це той самий N+1, лише на рівні агрегації. У тижні 7 цей лічильник оновлюватиметься в одній транзакції з резервом місця.

Для подій без нумерованих місць (фестиваль, ярмарок) рядків у `Seat` немає взагалі – там це просто місткість.

**`@@unique([eventId, rowLabel, number])`.** Два місця з однаковим рядом і номером у межах події неможливі. Це обмеження в базі, а не перевірка в коді: його не можна обійти ані помилкою в сервісі, ані паралельним запитом.

**`@@index([startsAt, id])`.** Порядок полів має збігатися з `orderBy` у репозиторії. Якщо сортувати за `(id, startsAt)`, цей індекс не спрацює – це видно в плані запиту на кроці 6.

### Контрольна точка 2

```bash
pnpm --filter @eventhub/api-gateway exec prisma validate
```

```text
The schema at prisma\schema.prisma is valid
```

## 6. Крок 3. Перша міграція

```bash
pnpm --filter @eventhub/api-gateway exec prisma migrate dev --name init
```

```text
Applying migration `20260915094212_init`

The following migration(s) have been created and applied:

migrations/
  └─ 20260915094212_init/
    └─ migration.sql

✔ Your database is now in sync with your schema.
✔ Generated Prisma Client (v6.3.0)
```

Відкрийте `migration.sql` і прочитайте його. Там звичайний SQL – `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE ... ADD CONSTRAINT`. Саме цей файл комітиться й проходить рев'ю разом із рештою коду.

Додайте зручні скрипти в `apps/api-gateway/package.json`:

```json
"scripts": {
  "build": "prisma generate && nest build",
  "dev": "prisma generate && nest start --watch",
  "db:migrate": "prisma migrate dev",
  "db:deploy": "prisma migrate deploy",
  "db:reset": "prisma migrate reset --force",
  "db:seed": "tsx prisma/seed.ts"
},
"prisma": {
  "seed": "tsx prisma/seed.ts"
}
```

**`migrate dev` проти `migrate deploy`.** Перший призначений для розробки: він порівнює схему з базою, створює нові файли й за потреби перестворює базу. Другий лише застосовує наявні міграції й нічого не питає.

**Не використовуємо `db push`**, оскільки він приводить базу у відповідність до схеми просто зараз, не лишаючи сліду. Зручно на прототипі, неприйнятно далі: неможливо відтворити ту саму послідовність змін на іншій машині, а видалення колонки з даними відбувається мовчки.

### Контрольна точка 3

```bash
git status apps/api-gateway/prisma
```

Папка `migrations/` має бути в списку нових файлів. Якщо її немає – значить було використано `db push`.

## 7. Крок 4. Сиди

Створіть `apps/api-gateway/prisma/seed.ts`. Перенесіть у нього самі десять подій, що були масивом у тижні 2, і додайте майданчики та місця.

Ключовий фрагмент:

```ts
for (const v of VENUES) {
  await prisma.venue.upsert({ where: { id: v.id }, update: v, create: v });
}
```

### Дві вимоги до сидів

**Ідемпотентність.** Повторний запуск не створює дублів. Тому `upsert` за фіксованим ідентифікатором, а не `create`. Перевірте:

```bash
pnpm --filter @eventhub/api-gateway db:seed
pnpm --filter @eventhub/api-gateway db:seed
```

Другий запуск має завершитися так само успішно, а кількість подій – лишитися десятьма.

**Детермінованість.** Ідентифікатори фіксовані, а не випадкові.

Місця перестворюються повністю. У сидах є `deleteMany` перед `createMany` для місць. Це простіше, ніж узгоджувати `upsert` для восьмисот рядків, і робить сид незалежним від того, що з ними робили попередні запуски.

Після цього видаліть `src/catalog/seed.ts` – масив більше не потрібен.

### Контрольна точка 4

```bash
pnpm --filter @eventhub/api-gateway db:reset
```

```text
✔ Database reset successful
Applying migration `20260915094212_init`
Running seed command `tsx prisma/seed.ts` ...
Створено 9 майданчиків, 10 подій, 801 місце
```

Це дуже важлива команда лабораторної. Вона доводить, що базу можна відтворити з нуля – а отже, нова людина в команді отримає однаковий стан.

## 8. Крок 5. Репозиторій

### 8.1. Prisma як провайдер

`src/prisma/prisma.service.ts`:

```ts
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      log: env.PRISMA_LOG === "query" ? ["query"] : ["warn", "error"],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
```

`src/prisma/prisma.module.ts` – з `@Global()`, щоб не імпортувати його в кожен модуль із репозиторієм. Підключіть `PrismaModule` в `app.module.ts`.

Не дивлячись на те, що `PrismaClient` і так клас, використано обгортку, щоб з'єднання відкривалося й закривалося разом із життєвим циклом застосунку. Без `onModuleDestroy` процес після Ctrl+C лишає відкрите з'єднання – локально непомітно.

**`@Global()`.** Це одне з небагатьох виправданих застосувань: доступ до бази потрібен усюди. Зловживати не варто – глобальні модулі приховують залежності, і граф перестає бути видимим.

### 8.2. Запит

```ts
async find(params: FindParams): Promise<Event[]> {
  const rows = await this.prisma.event.findMany({
    where: {
      ...(params.city
        ? { venue: { city: { equals: params.city, mode: "insensitive" } } }
        : {}),
      ...(params.from
        ? { startsAt: { gte: new Date(`${params.from}T00:00:00Z`) } }
        : {}),
      ...(params.after
        ? {
            OR: [
              { startsAt: { gt: new Date(params.after.startsAt) } },
              {
                startsAt: new Date(params.after.startsAt),
                id: { gt: params.after.id },
              },
            ],
          }
        : {}),
    },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    take: params.limit + 1,
    include: { venue: true },
  });
  return rows.map(toEvent);
}
```

Предикат курсора – той самий, що був для масиву. Це не особливість Prisma, а звичайне порівняння пари значень: або дата більша, або дата та сама, а ідентифікатор більший.

`mode: "insensitive"` віддає порівняння без урахування регістру базі, замість того щоб тягти рядки в застосунок і порівнювати там.

`include: { venue: true }` – одним запитом замість двадцяти одного. Без нього майданчик довелося б довантажувати для кожної події окремо.

### 8.3. Мапер – найважливіша частина кроку

```ts
function toEvent(row: EventRow): Event {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    startsAt: row.startsAt.toISOString(),
    venue: { id: row.venue.id, name: row.venue.name, city: row.venue.city },
    minPrice: { amount: row.minPriceCents, currency: row.currency.trim() as "UAH" },
    availableSeats: row.availableSeats,
  };
}
```

Рядок таблиці – це не об'єкт домену. У базі гроші лежать двома колонками, у контракті – одним об'єктом. Час у базі – `Date`, у контракті – рядок ISO. `Char(3)` доповнює значення пробілами, тому `.trim()`.

Якщо повернути результат Prisma напряму, це ламає контракт. Перевірити просто: відповідь `curl` має збігатися з тим, що віддавав мок-сервер.

### Контрольна точка 5

```bash
pnpm --filter @eventhub/api-gateway dev

curl http://127.0.0.1:3000/events                                       # 10 подій
curl -G --data-urlencode "city=Львів" http://127.0.0.1:3000/events      # 2 події
curl "http://127.0.0.1:3000/events?limit=2"                             # + nextCursor
```

Пройдіть каталог посторінково з `limit=2` до кінця: 5 сторінок, кожна подія рівно раз. Дві події на 19.10 починаються в ту саму секунду – саме на них перевіряється вторинний ключ у курсорі.

```bash
git status apps/api-gateway/src/catalog
```

Змінений має бути лише `event.repository.ts`.

## 9. Крок 6. Вимірювання

На десяти подіях різниці немає ніякої. Потрібен обсяг.

```bash
pnpm --filter @eventhub/api-gateway db:bench
```

```text
Створено 100000 з 100000
Готово за 24.3 с
```

### 9.1. План запиту

```bash
docker exec -it eventhub-db psql -U postgres -d eventhub
```

```sql
EXPLAIN ANALYZE
SELECT * FROM "Event" ORDER BY "startsAt", "id" LIMIT 21;
```

Індекс уже існує – його створила міграція. Приберіть його й подивіться, що буде без нього:

```sql
DROP INDEX "Event_startsAt_id_idx";

EXPLAIN ANALYZE
SELECT * FROM "Event" ORDER BY "startsAt", "id" LIMIT 21;
```

```text
Sort  (cost=9241.82..9491.82 rows=100000)
  Sort Method: top-N heapsort  Memory: 41kB
  ->  Seq Scan on "Event"  (rows=100000)
Execution Time: 68.412 ms
```

Поверніть індекс:

```sql
CREATE INDEX "Event_startsAt_id_idx" ON "Event" ("startsAt", "id");
```

```text
Index Scan using "Event_startsAt_id_idx"  (rows=21)
Execution Time: 0.087 ms
```

Прочитайте обидва плани, а не лише час. `Seq Scan` означає, що база прочитала всі сто тисяч рядків і відсортувала їх, щоб віддати двадцять один. `Index Scan` – що вона пройшла по індексу й прочитала рівно стільки, скільки просили.

### 9.2. N+1

Увімкніть журнал запитів:

```text
# apps/api-gateway/.env
PRISMA_LOG=query
```

Перезапустіть бекенд і зробіть один запит до `/events`. У терміналі має бути один `prisma:query`.

Тепер тимчасово приберіть `include: { venue: true }` і довантажуйте майданчик у циклі:

```ts
for (const row of rows) {
  row.venue = await this.prisma.venue.findUnique({ where: { id: row.venueId } });
}
```

Той самий запит дасть 21 рядок у журналі.

Локально база в сусідньому контейнері, кожен запит – частка мілісекунди. На сервері база в іншій мережі, і двадцять зайвих обходів перетворюються на пів секунди затримки.

За кодом N+1 часто непомітний, особливо коли цикл захований у сервісі. Журнал запитів – єдиний надійний спосіб.

Поверніть `include` і вимкніть журнал (`PRISMA_LOG=off`).

### 9.3. Приберіть тестові дані

```bash
pnpm --filter @eventhub/api-gateway db:bench -- --clean
```

### Контрольна точка 6

У звіті (можна прямо в описі PR) наведіть два плани – до й після індексу – і кількість запитів у журналі до й після `include`.

## 10. Критерії приймання

| № | Критерій | Перевірка |
|---|----------|-----------|
| 1 | `db:reset` відтворює базу з нуля | видалити том контейнера й повторити |
| 2 | Сиди ідемпотентні | `db:seed` двічі, кількість подій незмінна |
| 3 | Міграція в репозиторії | `git ls-files \| grep migrations` |
| 4 | Змінився лише `event.repository.ts` | `git status apps/api-gateway/src/catalog` |
| 5 | Відповіді API збігаються з тими, що були на масиві | curl проти збережених прикладів |
| 6 | Прохід каталогу без дублів і пропусків | `limit=2`, 5 сторінок |
| 7 | `Timestamptz`, гроші цілим числом | читання схеми |
| 8 | Обмеження унікальності на місцях | спроба вставити дубль ряду й номера |
| 9 | Звіт із двома планами запиту | опис PR |
| 10 | Один запит на сторінку каталогу | журнал Prisma |

## 11. Типові проблеми

**`ERR_PNPM_IGNORED_BUILDS` після встановлення Prisma**
Не додано `prisma: true` і `"@prisma/client": true` в `allowBuilds`.

**`Environment variable not found: DATABASE_URL`**
Файл називається `.env.local` замість `.env`, або ви в неправильній папці: Prisma CLI шукає `.env` поруч зі схемою.

**`Can't reach database server at localhost:5432`**
Контейнер ще не `healthy`. Перевірте `docker compose ps` і зачекайте.

**`prisma migrate dev` хоче створити нову міграцію на чистому клоні**
Ваша версія Prisma генерує SQL трохи інакше, ніж той, що в репозиторії. Видаліть `prisma/migrations` і створіть міграцію заново.

**Порт 5432 зайнятий**
Локально вже стоїть Postgres. Або зупиніть службу, або змініть порт у `docker-compose.yml` на `5433:5432` і в `DATABASE_URL`.

**`Type 'Date' is not assignable to type 'string'`**
Ви повертаєте рядок Prisma напряму, без мапера.

**Другий запуск сидів падає**
Використано `create` замість `upsert`.

**У плані запиту `Sort` замість `Index Scan`**
`orderBy` не збігається з порядком полів в індексі.

**Кирилиця в `psql` відображається кракозябрами (Windows)**
Виконайте в PowerShell `chcp 65001` перед запуском `docker exec`.

## 12. Здача

Pull request `lab-03`: каталог на PostgreSQL. В описі – склад команди, ролі, два плани запиту зі кроку 6 і посилання на ADR-003.

## 13. Домашнє завдання

1. **Замовлення в базі.** Додайте до схеми `Order` і зв'язок із `Seat` явною проміжною таблицею, у якій зберігається ціна на момент покупки. Поясніть у коментарі, чому ціну не можна брати з `Seat` у момент перегляду замовлення.

2. **Звіт організатора.** Одним запитом порахуйте для кожної події кількість проданих місць і суму виручки. Наведіть план виконання й додайте індекс, якщо він потрібен.

3. **ADR-003: тип для грошей.** Було обрано `Int` у копійках. Розгляньте щонайменше два варіанти (`Decimal`, `Int`, можливо `BigInt`), опишіть наслідки кожного й обґрунтуйте вибір. Окремо – що зміниться, коли в системі з'явиться друга валюта.
