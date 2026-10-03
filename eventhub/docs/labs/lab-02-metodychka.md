# Лабораторна робота № 2

**Тема:** Бекенд: шари, валідація, помилки, логи

## 1. Мета роботи

Реалізувати контракт, який був описаний у роботі 1, і перемкнути фронтенд із моксервера на власний бекенд – не змінивши у `apps/web` жодного рядка коду.

Після виконання студент уміє:

- побудувати шаруватий застосунок на NestJS: модуль, контролер, сервіс, репозиторій;
- перевіряти вхідні дані схемою в рантаймі й розуміти, чому типів для цього замало;
- реалізувати курсорну пагінацію й фільтрацію;
- відокремити доменні помилки від HTTP і віддавати їх у форматі `problem+json`;
- налаштувати структуроване логування з наскрізним ідентифікатором запиту.

> **Головна перевірка роботи**
>
> Змінюєте один рядок в `apps/web/.env.local` – і сторінка працює так само. Якщо щось зламалося, винен бекенд: він порушив домовленість, яку обидві сторони прочитали з одного файлу.

## 2. Перед початком

```bash
git checkout -b week-02/<нік-автора>
nvm use
pnpm install
```

Переконайтесь, що стан роботи 1 робочий:

```bash
pnpm mock # термінал 1
curl -i http://127.0.0.1:4010/events # термінал 2 → 200
```

Мок-сервер знадобиться до кінця заняття: він еталон, з яким звіряємо розроблений бекенд.

## 3. План

| Крок | Що робимо | Час |
|------|-----------|-----|
| 1 | Готуємо пакет контрактів до рантайму | 20 хв |
| 2 | Модуль каталогу: три шари | 25 хв |
| 3 | Валідація за контрактом | 25 хв |
| 4 | Фільтрація й курсорна пагінація | 20 хв |
| 5 | Помилки: problem+json | 20 хв |
| 6 | Логи й correlation ID | 15 хв |
| 7 | Перемикання фронтенду | 5 хв |

## 4. Крок 1. Пакет контрактів стає рантаймовим

У роботі №1 `@eventhub/contracts` віддавав `./src/index.ts` напряму. Цього вистачало: звідти брали лише типи, а типи зникають при компіляції – Vite розбирався сам.

В цій роботі в пакеті з'являться Zod-схеми. Це код, який виконується. Його споживач – NestJS, який компілюється в CommonJS і запускається як `node dist/main.js`. Node не вміє імпортувати `.ts` із `node_modules`.

Тому пакету потрібна реальна збірка.

### 1.1. Оновіть `packages/contracts/package.json`

```json
{
  "name": "@eventhub/contracts",
  "version": "0.0.0",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "generate": "openapi-typescript ./openapi.yaml -o ./src/generated/schema.ts",
    "build": "pnpm generate && tsc -p tsconfig.build.json",
    "typecheck": "tsc -p tsconfig.build.json --noEmit"
  },
  "dependencies": {
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "openapi-typescript": "^7.13.0",
    "typescript": "5.9.3"
  }
}
```

Три зміни:

- **Видалено `"type": "module"`.** Пакет тепер збирається в CommonJS, бо його читають обидва споживачі: Nest (CJS) і Vite (вміє і те, і те).
- **Вихід генератора – `schema.ts`, а не `schema.d.ts`.** Файл із розширенням `.d.ts` для компілятора – лише декларація: він його читає, але не кладе в `dist`. Тоді `dist/index.d.ts` посилався б на неіснуючий файл.
- **Добавлено `zod` у `dependencies`, а не в `devDependencies`.** Це не інструмент розробки, а бібліотека, код якої потрапляє в збірку й виконується у споживача.

### 1.2. Додайте `packages/contracts/tsconfig.build.json`

```json
{
  "extends": "../config/tsconfig.base.json",
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "node",
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "noEmit": false
  },
  "include": ["src"]
}
```

І додайте `dist/` у `packages/contracts/.gitignore` – поруч із `src/generated/`.

### 1.3. Оновіть `turbo.json`

```json
"dev": {
  "dependsOn": ["^build"],
  "cache": false,
  "persistent": true
}
```

Без цього рядка `pnpm --filter api-gateway dev` на чистому клоні падає: `dist` пакета контрактів ще не існує. Раніше задача `dev` ні від чого не залежала, бо й залежати не було від чого.

### 1.4. Схеми валідації

Створіть `packages/contracts/src/schemas.ts`:

```ts
import { z } from "zod";

// UUID нашого домену – версії 7 (сортовані за часом).
// z.string().uuid() їх ВІДХИЛЯЄ: його регулярний вираз вимагає версію 1–5.
// Тому перевіряємо форму, а не версію.
const uuidLike = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    "Очікується ідентифікатор у форматі UUID",
  );

export const listEventsQuery = z.object({
  city: z.string().trim().min(1).optional(),
  from: z.string().date().optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type ListEventsQuery = z.infer<typeof listEventsQuery>;

export const eventIdParam = z.object({
  eventId: uuidLike,
});
export type EventIdParam = z.infer<typeof eventIdParam>;
```

**`z.coerce.number()`** – дані з рядка запиту завжди рядки. Без `coerce` схема відхилила б навіть коректне `?limit=20`. Зате на `?limit=потяг` перетворення провалиться, і ви отримаєте 400, а не `NaN`, який тихо поїде в логіку.

**Проблеми з `uuid()`.** Це не вигаданий приклад: ідентифікатори в специфікації – UUIDv7, і `z.string().uuid()` відхилить кожен із них. Ви отримаєте 400 на цілком коректний запит і шукатимете помилку в контролері. Валідатор теж треба перевіряти.

Додайте в `packages/contracts/src/index.ts`:

```ts
export * from "./schemas";
```

### Контрольна точка 1

```bash
pnpm contracts
ls packages/contracts/dist/index.js # файл має існувати
```

## 5. Крок 2. Модуль каталогу

Створюємо три шари. Порядок – знизу вгору: спершу дані, потім логіка, потім HTTP.

### 5.1. Дані

`apps/api-gateway/src/catalog/seed.ts` – масив подій, створіть його, важливо, щоб там були щонайменше дві події з однаковим `startsAt` і події в різних містах. Буде використано на кроці 4.

`apps/api-gateway/src/catalog/event.repository.ts`:

```ts
@Injectable()
export class EventRepository {
  private readonly events: Event[] = [...EVENTS].sort(byStartThenId);

  async find(params: FindParams): Promise<Event[]> {
    let rows = this.events;

    if (params.city) {
      const needle = params.city.toLocaleLowerCase("uk");
      rows = rows.filter((e) => e.venue.city.toLocaleLowerCase("uk") === needle);
    }

    if (params.from) {
      rows = rows.filter((e) => e.startsAt >= `${params.from}T00:00:00Z`);
    }

    if (params.after) {
      const { startsAt, id } = params.after;
      rows = rows.filter(
        (e) => e.startsAt > startsAt || (e.startsAt === startsAt && e.id > id),
      );
    }

    // на один рядок більше, ніж просили – див. крок 4
    return rows.slice(0, params.limit + 1);
  }

  async byId(id: string): Promise<Event | undefined> {
    return this.events.find((e) => e.id === id);
  }
}
```

Зверніть увагу, хоча масив синхронний, використовуємо методи `async`, щоб у роботі №3, коли з'явиться Prisma, не довелося міняти сигнатури – а з ними й сервіс, і його тести. Форма інтерфейсу закладається під майбутню реалізацію, а не під теперішню.

Також виконано порівняння рядків, а не `new Date()`. Рядки ISO-8601 в UTC мають фіксовану ширину полів, тому лексикографічне порівняння збігається з хронологічним. Це і швидше, і без сюрпризів із часовими поясами.

### 5.2. Логіка

`catalog.service.ts` – сюди переноситься все, що є рішенням:

```ts
@Injectable()
export class CatalogService {
  constructor(private readonly repo: EventRepository) {}

  async list(query: ListEventsQuery): Promise<EventPage> { /* крок 4 */ }

  async getOne(eventId: string): Promise<Event> {
    const event = await this.repo.byId(eventId);
    if (!event) throw new EventNotFound(eventId); // крок 5
    return event;
  }
}
```

### 5.3. HTTP

`catalog.controller.ts`:

```ts
@Controller("events")
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  list(@Query() query: ListEventsQueryDto): Promise<EventPage> {
    return this.catalog.list(query);
  }

  @Get(":eventId")
  getOne(@Param() params: EventIdParamDto): Promise<Event> {
    return this.catalog.getOne(params.eventId);
  }
}
```

`catalog.module.ts`:

```ts
@Module({
  controllers: [CatalogController],
  providers: [CatalogService, EventRepository],
  exports: [CatalogService],
})
export class CatalogModule {}
```

`EventRepository` не в `exports`. Інші модулі мають ходити в каталог через його сервіс, а не ходити в його дані напряму. Це межа, яка потім стане межею окремого сервісу – і те, що зараз лише домовленість, тоді буде мережевою границею.

Підключіть `CatalogModule` в `app.module.ts`.

### Контрольна точка 2

```bash
pnpm --filter @eventhub/api-gateway dev
curl -i http://127.0.0.1:3000/events
```

200 і список подій. Фільтри поки не працюють – це наступні кроки.

> **Самоперевірка шарів**
>
> Відкрийте `catalog.service.ts` і пошукайте слова `req`, `res`, `@Get`, число `404`. Якщо щось знайшлося – HTTP протік у домен.
>
> Надалі буде реалізація, де цей сервіс викликатиметься з воркера черги, а потім – з обробника події RabbitMQ. Обидва рази без HTTP.

## 6. Крок 3. Валідація

### 6.1. Спершу виконайте аналіз і знайдіть проблему

Перед тим як писати валідацію, переконайтеся, що вона потрібна:

```bash
curl "http://127.0.0.1:3000/events?limit=потяг"
```

Запит проходить. У `query.limit` лежить рядок `"потяг"`, хоча тип каже `number`.

Типи не існують у рантаймі. TypeScript стирається при компіляції; у зібраному JavaScript від `ListEventsQuery` не лишається нічого. Це була анотація для компілятора, а дані з мережі приходять уже після того, як компілятор закінчив роботу.

### 6.2. Pipe

`common/validation/zod-dto.ts`:

```ts
export interface ZodDtoClass<S extends z.ZodTypeAny = z.ZodTypeAny> {
  new (): z.infer<S>;
  zodSchema: S;
}

export function createZodDto<S extends z.ZodTypeAny>(schema: S): ZodDtoClass<S> {
  class Dto {
    static zodSchema = schema;
  }
  return Dto as unknown as ZodDtoClass<S>;
}
```

`common/validation/zod-validation.pipe.ts`:

```ts
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    const dto = metadata.metatype;
    if (!hasZodSchema(dto)) return value;

    const result = dto.zodSchema.safeParse(value);
    if (result.success) return result.data;

    throw new RequestValidationFailed(
      result.error.issues.map((i) => ({
        field: i.path.join(".") || "(корінь)",
        code: i.code,
        message: i.message,
      })),
    );
  }
}
```

`catalog/catalog.dto.ts`:

```ts
export class ListEventsQueryDto extends createZodDto(listEventsQuery) {}
export class EventIdParamDto extends createZodDto(eventIdParam) {}
```

І в `main.ts`:

```ts
app.useGlobalPipes(new ZodValidationPipe());
```

**Призначення обгортки `createZodDto`.** Глобальний pipe отримує значення, але сам по собі не знає, якою схемою його перевіряти. Nest передає в pipe тип параметра (завдяки `emitDecoratorMetadata`), тому схему надаємо в статичному полі класу.

Простіша альтернатива – вказувати схему в кожному контролері: `@Query(new ZodValidationPipe(listEventsQuery)) q: ListEventsQuery`. Вона теж робоча, просто повторюється в кожному методі. Бібліотека `nestjs-zod` робить рівно те, що ці двадцять рядків.

### Контрольна точка 3

```bash
curl -i "http://127.0.0.1:3000/events?limit=потяг" # 400
curl -i "http://127.0.0.1:3000/events?limit=999" # 400
curl -i "http://127.0.0.1:3000/events?limit=20" # 200
```

Тіло помилки поки що у форматі Nest – приведемо його до `problem+json` на кроці 5.

## 7. Крок 4. Фільтрація й курсорна пагінація

### 7.1. Курсор

`catalog/cursor.ts`:

```ts
export function encodeCursor(pos: CursorPosition): string {
  return Buffer.from(`${pos.startsAt}|${pos.id}`, "utf8").toString("base64url");
}

export function decodeCursor(raw: string): CursorPosition {
  let decoded: string;
  try {
    decoded = Buffer.from(raw, "base64url").toString("utf8");
  } catch {
    throw new InvalidCursor(raw);
  }

  const parts = decoded.split("|");
  const startsAt = parts[0];
  const id = parts[1];
  if (parts.length !== 2 || !startsAt || !id) throw new InvalidCursor(raw);

  return { startsAt, id };
}
```

Використано дві складові, оскільки `startsAt` не унікальний – у сидах додайте навмисно дві події на `2026-10-19T20:00:00Z`. Курсор лише за датою не визначає позицію однозначно: одна з цих подій або загубиться, або з'явиться двічі. Саме це ви обґрунтовували в ADR-001.

Використання base64, а не читабельний рядок, пов'язано з тим, що курсор має бути непрозорим для клієнта. Щойно хтось почне його розбирати, ви більше не зможете змінити ключ сортування, не зламавши клієнтів.

### 7.2. Сервіс

```ts
async list(query: ListEventsQuery): Promise<EventPage> {
  const after = query.cursor ? decodeCursor(query.cursor) : undefined;

  const rows = await this.repo.find({
    city: query.city,
    from: query.from,
    after,
    limit: query.limit,
  });

  const hasMore = rows.length > query.limit;
  const items = hasMore ? rows.slice(0, query.limit) : rows;
  const last = items.at(-1);

  return {
    items,
    nextCursor: hasMore && last ? encodeCursor(last) : null,
  };
}
```

Навмисно використано `limit + 1`, так репозиторій бере на рядок більше, ніж просили. Якщо зайвий рядок є – значить, є й наступна сторінка. Альтернатива – окремий `COUNT(*)`, тобто другий запит до бази на кожне гортання.

`nextCursor: null` – це відповідь, а не помилка. Порожнє значення означає «сторінок більше немає», і фронтенд зобов'язаний це обробити: у контракті тип `[string, "null"]`.

### Контрольна точка 4

```bash
# фільтр працює
curl -G --data-urlencode "city=Львів" http://127.0.0.1:3000/events

# перша сторінка
curl "http://127.0.0.1:3000/events?limit=2"

# друга сторінка: підставте nextCursor із попередньої відповіді
curl "http://127.0.0.1:3000/events?limit=2&cursor=<NEXT_CURSOR>"

# остання сторінка → nextCursor: null
curl "http://127.0.0.1:3000/events?limit=50"
```

**Головна перевірка:** пройдіть каталог посторінково з `limit=2` до кінця й переконайтеся, що жодна подія не трапилася двічі й жодна не зникла. Обидві події на 19.10 мають з'явитися рівно по разу.

## 8. Крок 5. Помилки

### 8.1. Доменні винятки

`common/problem/domain-errors.ts`:

```ts
export abstract class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class EventNotFound extends DomainError {
  constructor(readonly eventId: string) {
    super(`Подію ${eventId} не знайдено`);
  }
}

export class InvalidCursor extends DomainError { /* ... */ }
export class RequestValidationFailed extends DomainError { /* ... */ }
```

В даній частині навмисно не взято `NotFoundException` із Nest, хоча він коротший і працює – але прив'язує домен до HTTP. У подальшому цей самий сервіс викликатиметься з обробника події RabbitMQ, де поняття «404» не існує, і доведеться або «ловити» HTTP-винятки в брокері повідомлень, або переписувати сервіс.

### 8.2. Переклад на мову HTTP

`common/problem/problem.ts` – чиста функція:

```ts
export function toProblem(err: unknown): ProblemBody {
  if (err instanceof RequestValidationFailed) {
    return {
      type: "/errors/invalid-query",
      title: "Некоректний параметр запиту",
      status: 400,
      detail: err.issues.map((i) => `${i.field}: ${i.message}`).join("; "),
      errors: err.issues,
    };
  }
  if (err instanceof EventNotFound) {
    return {
      type: "/errors/not-found",
      title: "Подію не знайдено",
      status: 404,
      detail: err.message,
    };
  }
  // ... InvalidCursor, HttpException
  return { type: "about:blank", title: "Внутрішня помилка сервера", status: 500 };
}
```

Вона нічого не знає про запит і відповідь, тож тестується без Nest і без сервера.

### 8.3. Фільтр

```ts
@Catch()
export class ProblemFilter implements ExceptionFilter {
  constructor(
    @InjectPinoLogger(ProblemFilter.name) private readonly logger: PinoLogger,
  ) {}

  catch(err: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const problem = toProblem(err);

    if (problem.status >= 500) {
      this.logger.error({ err, url: req.url }, "unhandled error");
    } else {
      this.logger.debug({ type: problem.type, url: req.url }, "request rejected");
    }

    ctx.getResponse<Response>()
      .status(problem.status)
      .type("application/problem+json")
      .json({ ...problem, instance: req.originalUrl });
  }
}
```

Реєструється в `app.module.ts`:

```ts
providers: [{ provide: APP_FILTER, useClass: ProblemFilter }]
```

Використано `APP_FILTER`, а не `app.useGlobalFilters()`. Фільтру потрібен логер. Об'єкт, створений через `new`, поза графом DI, і впровадити в нього нічого не можна. `APP_FILTER` реєструє фільтр глобально й водночас лишає його провайдером.

**4xx не логуються як помилки.** 4xx – очікувана поведінка системи: користувач надіслав некоректний запит, система коректно відмовила. Якщо писати їх на рівні `error`, справжні аварії потонуть у шумі.

**500 не містить деталей.** Стектрейс іде в лог, а не в тіло відповіді. Інакше ви віддаєте назовні структуру свого коду – і зручність налагодження перетворюється на подарунок для того, хто шукає вразливості.

### Контрольна точка 5

```bash
curl -i "http://127.0.0.1:3000/events?limit=999"
curl -i "http://127.0.0.1:3000/events?cursor=нісенітниця"
curl -i "http://127.0.0.1:3000/events/018f2c1e-4a7b-7c3d-9e1f-000000000000"
curl -i "http://127.0.0.1:3000/nonexistent"
```

Усі чотири мають повернути `content-type: application/problem+json` і тіло потрібної форми. Останній – це помилка самого Nest, і вона теж має пройти через ваш фільтр.

Звірте з моком: ті самі запити на `:4010` мають давати ту саму форму відповіді. Розбіжність означає, що бекенд відхилився від контракту.

## 9. Крок 6. Логи й correlation ID

```bash
pnpm --filter @eventhub/api-gateway add nestjs-pino pino-http
pnpm --filter @eventhub/api-gateway add -D pino-pretty
```

В `app.module.ts`:

```ts
LoggerModule.forRoot({
  pinoHttp: {
    level: env.LOG_LEVEL,
    genReqId: (req, res) => {
      const incoming = req.headers["x-request-id"];
      const id = typeof incoming === "string" && incoming ? incoming : randomUUID();
      res.setHeader("x-request-id", id);
      return id;
    },
    redact: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers['set-cookie']",
    ],
    transport:
      env.NODE_ENV === "development"
        ? { target: "pino-pretty", options: { singleLine: true } }
        : undefined,
  },
}),
```

І в `main.ts`:

```ts
const app = await NestFactory.create(AppModule, { bufferLogs: true });
app.useLogger(app.get(Logger));
```

**`incoming ?? randomUUID()`** – якщо клієнт або проксі перед вами прислали свій ідентифікатор, беремо його. Так трасування не переривається на межі сервісів; `setHeader` – повертаємо ідентифікатор клієнту. Користувач зі скріншотом помилки приносить вам ключ до точного місця в логах. Це найдешевша підтримка, яку можна собі влаштувати.

**`redact`** – перелік полів, які ніколи не потраплять у лог. Лог живе довше за інцидент; у подальшому сюди додадуться платіжні дані.

**`transport` лише в development.** У продакшні в stdout має йти JSON: його читає збирач логів, а не людина. `pino-pretty` – інструмент розробника, і в продакшні він лише витрачає процесорний час.

### Контрольна точка 6

```bash
curl -i http://127.0.0.1:3000/events | grep -i x-request-id
```

У терміналі бекенду знайдіть цей самий ідентифікатор. Усі рядки одного запиту мають його містити.

## 10. Крок 7. Перемикання фронтенду

```bash
# apps/web/.env.local
VITE_API_URL=http://127.0.0.1:3000
```

Перезапустіть dev-сервер Vite (він читає `.env.local` лише при старті).

У `apps/web` не має змінитися жодного файлу, крім `.env`. Перевірте:

```bash
git status apps/web
```

### Контрольна точка 7 – вона ж головна

Сторінка на `http://localhost:5173` показує список подій, отриманих від вашого бекенду. У DevTools → Network запит іде на `127.0.0.1:3000`, у заголовках відповіді є `x-request-id`.

## 11. Критерії приймання

| № | Критерій | Перевірка |
|---|----------|-----------|
| 1 | `pnpm build` проходить на чистому клоні | `rm -rf node_modules && pnpm install && pnpm build` |
| 2 | Фронтенд працює проти `:3000` | `git diff` по `apps/web` – лише `.env` |
| 3 | `?limit=потяг` → 400, а не `NaN` у логіці | curl |
| 4 | Фільтр за `city` і `from` працює | curl |
| 5 | Посторінкове гортання без дублів і пропусків | пройти каталог із `limit=2` |
| 6 | `nextCursor: null` на останній сторінці | `?limit=50` |
| 7 | Усі помилки – `application/problem+json` | `curl -i`, чотири випадки з КТ 5 |
| 8 | У `catalog.service.ts` немає HTTP | `grep -nE "req\|res\|@Get\|404" src/catalog/catalog.service.ts` |
| 9 | `x-request-id` у відповіді й у логах | curl + термінал |
| 10 | `redact` налаштований | читання коду |

## 12. Типові проблеми

**`Cannot find module '@eventhub/contracts'` при старті Nest**
Пакет не зібраний. Виконайте `pnpm build` або `pnpm contracts`. Якщо повторюється після кожного `pnpm install` – ви не додали `dependsOn: ["^build"]` у задачу `dev`.

**`Unexpected token 'export'` при старті Nest**
Пакет контрактів збирається в ESM. Приберіть `"type": "module"` з його `package.json` і перевірте `module: CommonJS` у `tsconfig.build.json`.

**`dist/index.d.ts` посилається на неіснуючий `generated/schema`**
Генератор пише в `.d.ts`. Змініть вихід на `./src/generated/schema.ts`.

**400 на кожен коректний `eventId`**
Ви використали `z.string().uuid()`. Наші ідентифікатори – UUIDv7, а Zod 3 приймає лише версії 1–5.

**`?limit=20` відхиляється як «очікувалося число»**
Забули `z.coerce`. Параметри рядка запиту завжди приходять рядками.

**Друга сторінка дублює подію з першої**
Курсор не містить вторинного ключа. Перевірте на подіях з однаковим `startsAt`.

**`nextCursor` ніколи не `null`**
Ви кодуєте останній елемент без перевірки, чи є наступна сторінка. Потрібен прийом `limit + 1`.

**CORS-помилка у браузері**
`origin` у `enableCors` не збігається з адресою dev-сервера Vite. Перевірте `WEB_ORIGIN`.

**Логи не з'являються**
`app.useLogger(app.get(Logger))` пропущено, або `LOG_LEVEL` вищий за рівень ваших повідомлень.

## 13. Домашнє завдання

1. **Замовлення.** Реалізуйте ендпоїнти, які ви описали в контракті минулої роботи: створення, перегляд, скасування. Дані – в пам'яті, оплати поки немає. Помилки – ті самі коди, які ви обґрунтували в домашньому роботи 1.

2. **Дублювання правил – знайдіть спосіб його знешкодити.**
   Зараз `maximum: 50` записано двічі: в `openapi.yaml` і в Zod-схемі. Якщо змінити одне й забути друге, нічого не зламається – розбіжність виявиться на продакшні.

   Завдання: зробити так, щоб така розбіжність ламала збірку.

   Готової відповіді немає, є кілька життєздатних напрямів:

  - генерувати Zod-схеми зі специфікації (наприклад, `openapi-zod-client`) – тоді джерело одне;
  - писати схеми першими, а специфікацію генерувати з них (`zod-to-json-schema`);
  - лишити обидва джерела, але додати тест, який звіряє межі зі специфікацією;
  - тип-рівнева перевірка: домогтися, щоб `z.infer` не збігався зі згенерованим типом при розходженні.

   Оберіть один, реалізуйте й оформіть як **ADR-002** – з розділом «Наслідки» й мінусами.
