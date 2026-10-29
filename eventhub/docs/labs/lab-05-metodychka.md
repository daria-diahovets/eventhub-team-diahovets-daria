# Лабораторна робота № 5

**Тема:** Автентифікація: паролі, токени, ротація

## 1. Мета роботи

Додати в EventHub користувачів: реєстрацію, вхід, захищені маршрути й автоматичне продовження сесії – так, щоб витік бази не видав паролів, а крадіжку токена можна було виявити.

Після виконання студент уміє:

- хешувати паролі алгоритмом, придатним для паролів, і пояснити, чому не SHA-256;
- видавати пару access- і refresh-токенів і пояснити, навіщо їх два;
- зберігати refresh-токен так, щоб JavaScript на сторінці не мав до нього доступу;
- реалізувати ротацію з виявленням повторного використання;
- автоматично оновлювати токен на фронтенді без помітних для користувача перерв.

> **Головна перевірка роботи**
>
> Скопіюйте refresh-cookie, законно оновіть токен, а потім пред'явіть стару копію. Сервер має помітити повтор і відкликати весь ланцюжок – зокрема й законного користувача. Це видно в логах одним рядком.

> **Особливість теми**
>
> У цій темі «працює» не означає «правильно». Майже кожен крок можна зробити так, що застосунок пускатиме користувачів, тести проходитимуть – і при цьому існуватиме вразливість. Тому в методичці багато пояснень чому, і їх варто прочитати, а не пропустити.

## 2. Перед початком

Створіть нову гілку з фінальної версії роботи №4

```bash
git checkout -b week-05/<нік-автора>
nvm use
pnpm install
docker compose up -d db # дочекатись healthy
cp apps/api-gateway/.env.example apps/api-gateway/.env
```

### Секрет підпису

Відкрийте `apps/api-gateway/.env` і замініть значення `JWT_ACCESS_SECRET` на випадковий рядок:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

У PowerShell команда та сама.

Зверніть увагу, це важливо. Хто знає секрет, той може підписати токен від імені будь-якого користувача – сервер не відрізнить його від справжнього. Тому секрет живе лише в `.env`, який не потрапляє в git, і різний для розробки та продакшну. Значення `change-me-…` із прикладу стартує, але в реальному проєкті було б прямою діркою в безпеці.

```bash
pnpm build
pnpm --filter @eventhub/api-gateway db:reset
```

## 3. План

| Крок | Що робимо |
|------|-----------|
| 1 | Схема: користувачі й токени |
| 2 | Реєстрація і вхід з Argon2 |
| 3 | Видача пари токенів і cookie |
| 4 | Guard і `/auth/me` |
| 5 | Ротація з виявленням повтору |
| 6 | Фронтенд: вхід і автооновлення |

## 4. Крок 1. Схема

### 4.1. Залежності

```bash
pnpm --filter @eventhub/api-gateway add argon2 @nestjs/jwt cookie-parser
pnpm --filter @eventhub/api-gateway add -D @types/cookie-parser
```

Додайте в `pnpm-workspace.yaml`:

```yaml
allowBuilds:
  # ... наявні рядки
  argon2: true   # нативний модуль хешування паролів
```

`argon2` – не чистий JavaScript, а нативний модуль на C. Під час встановлення він завантажує скомпільовану під вашу платформу бібліотеку, і pnpm 11 блокує цей крок, доки ви явно не дозволите. Без рядка – `ERR_PNPM_IGNORED_BUILDS`.

### 4.2. Моделі

Додайте в `apps/api-gateway/prisma/schema.prisma`:

```prisma
enum Role {
  USER
  ORGANIZER
  ADMIN
}

model User {
  id            String         @id @default(uuid(7)) @db.Uuid
  email         String         @unique
  passwordHash  String
  role          Role           @default(USER)
  createdAt     DateTime       @default(now()) @db.Timestamptz(3)
  refreshTokens RefreshToken[]
}

model RefreshToken {
  id        String    @id @default(uuid(7)) @db.Uuid
  userId    String    @db.Uuid
  familyId  String    @db.Uuid
  tokenHash String    @unique
  expiresAt DateTime  @db.Timestamptz(3)
  usedAt    DateTime? @db.Timestamptz(3)
  revokedAt DateTime? @db.Timestamptz(3)
  createdAt DateTime  @default(now()) @db.Timestamptz(3)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([familyId])
  @@index([userId])
}
```

### Кожне поле обосновано присутнє в навелених моделях

**`email @unique`** – обмеження в базі, а не перевірка в коді. Дві одночасні реєстрації з однаковою поштою інакше обидві пройшли б попередню перевірку `findUnique`.

**`passwordHash`, а не `password`.** Самого пароля немає ніде – ані в базі, ані в логах, ані в пам'яті після реєстрації.

**`familyId`** – ідентифікатор ланцюжка оновлень, що почався з одного входу. Саме він дозволяє відкликати всі пов'язані токени одразу.

**`tokenHash`, а не сам токен.** Refresh-токен – такий самий секрет, як пароль. Витік бази не повинен давати готові до використання токени.

**`usedAt`** – найважливіше поле таблиці. Без позначки «вже обміняний» неможливо відрізнити повторне використання від невідомого токена, а саме повтор і є ознакою крадіжки.

```bash
pnpm --filter @eventhub/api-gateway db:migrate --name auth
```

### Контрольна точка 1

```bash
git status apps/api-gateway/prisma/migrations
```

Нова папка `…_auth` з `migration.sql`.

## 5. Крок 2. Реєстрація і вхід

### 5.1. Контракт

Спершу – специфікація, як завжди. Додайте в `openapi.yaml` ендпоїнти `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/me` і схеми `User`, `RegisterRequest`, `LoginRequest`, `AuthResponse`. Повну версію – в еталоні.

Зверніть увагу на дві речі:

```yaml
RegisterRequest:
  properties:
    password: { type: string, minLength: 10, maxLength: 128 }
```

**`maxLength: 128`** – не забаганка. Argon2 навмисно повільний. Пароль на мегабайт перетворив би кожну спробу входу на навантаження, здатне покласти сервер. Верхня межа – захист від відмови в обслуговуванні.

```yaml
/auth/login:
  post:
    responses:
      "401":
        # Однакова відповідь і на «немає такої пошти», і на «невірний пароль»
        $ref: "#/components/responses/InvalidCredentials"
```

Zod-схеми в `packages/contracts/src/schemas.ts`:

```ts
const email = z.string().trim().toLowerCase().email().max(254);

export const registerBody = z.object({
  email,
  password: z.string().min(10).max(128),
});
```

**`toLowerCase()` на межі.** Інакше `Student@Example.com` і `student@example.com` стали б двома різними користувачами.

### 5.2. Хешування

```ts
const passwordHash = await argon2.hash(body.password, {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 МБ на одну перевірку
  timeCost: 3,
});
```

**Чому Argon2id, а не SHA-256.** SHA-256 не зламаний – він швидкий, а для паролів це недолік. Відеокарта рахує мільярди хешів за секунду, і перебір восьмисимвольного пароля займає години. Argon2 навмисно повільний і вимагає багато пам'яті, а пам'ять на відеокарті дорога. Затримка в 100 мс непомітна для користувача, але перетворює мільярд спроб перебору на роки.

### 5.3. Реєстрація: унікальність перевіряє база

```ts
try {
  const user = await this.prisma.user.create({
    data: { email: body.email, passwordHash },
  });
  return { ...(await this.tokens.issuePair(user)), user };
} catch (err) {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    throw new EmailTaken();
  }
  throw err;
}
```

**Чому не `findUnique` перед `create`.** Два одночасні запити обидва побачили б «пошти немає» й обидва пішли б створювати. Обмеження в базі не обійти ніякою гонкою. `P2002` – код Prisma для порушення унікальності.

### 5.4. Вхід: однакова відповідь і однаковий час

```ts
async login(body: LoginBody) {
  const user = await this.prisma.user.findUnique({ where: { email: body.email } });

  // Перевіряємо пароль ЗАВЖДИ – навіть якщо користувача немає
  const hash = user?.passwordHash ?? (await this.getDummyHash());
  const ok = await argon2.verify(hash, body.password);

  if (!user || !ok) throw new InvalidCredentials();
  // ...
}
```

Зверніть увагу на дві проблеми в безпеці, які захищає даний варіант рішення:

**Різні тексти помилок.** «Такої пошти немає» і «невірний пароль» – це інструмент розвідки: зловмисник перевіряє список адрес і дізнається, які з них зареєстровані. Тому помилка одна – `InvalidCredentials`.

**Різний час відповіді.** Навіть з однаковим текстом: якщо пошти немає й ми одразу повертаємо помилку, відповідь приходить за 2 мс. Якщо пошта є – за 100 мс, бо рахуємо Argon2. Різниця в часі розповідає те саме, що й різні тексти. Тому для неіснуючої пошти все одно перевіряємо пароль – проти фіктивного хешу.

**`argon2.verify`, а не порівняння рядків.** Не намагайтеся самі захешувати введений пароль і порівняти через `===`: сіль і параметри лежать у збереженому рядку, і бібліотека знає, як їх звідти дістати.

### Контрольна точка 2

```powershell
curl.exe -i -X POST http://127.0.0.1:3000/auth/login `
  -H "Content-Type: application/json" `
  -d '{\"email\":\"nobody@example.com\",\"password\":\"whatever\"}'

curl.exe -i -X POST http://127.0.0.1:3000/auth/login `
  -H "Content-Type: application/json" `
  -d '{\"email\":\"student@example.com\",\"password\":\"wrong-password\"}'
```

Обидві відповіді – 401 з однаковим тілом.

У bash замініть `curl.exe` на `curl`, `` ` `` на `\`, а лапки в JSON пишіть без екранування: `-d '{"email":"…"}'`.

## 6. Крок 3. Пара токенів

### 6.1. Access-токен

```ts
const accessToken = await this.jwt.signAsync(
  { sub: user.id, role: user.role },
  { secret: env.JWT_ACCESS_SECRET, expiresIn: env.JWT_ACCESS_TTL_SECONDS },
);
```

**Мінімум у payload.** Вміст JWT читає будь-хто – розберіть токен у PowerShell, як на лекції, і переконайтесь самі. Підпис захищає від зміни, а не від читання. Тому тут лише ідентифікатор і роль; пошта, телефон, будь-що інше – ні.

### 6.2. Refresh-токен – не JWT

```ts
const refreshToken = randomBytes(32).toString("base64url");

await this.prisma.refreshToken.create({
  data: {
    userId: user.id,
    familyId,
    tokenHash: sha256(refreshToken),
    expiresAt: new Date(Date.now() + env.REFRESH_TTL_DAYS * 86_400_000),
  },
});
```

**Чому випадкові байти, а не JWT.** Refresh-токену нічого не потрібно нести всередині: сервер однаково шукає його в базі. JWT тут дав би лише зайву довжину.

**Чому `sha256`, якщо для паролів він поганий.** Це не суперечність. Argon2 потрібен, бо паролі короткі й передбачувані. Токен – 256 випадкових бітів: перебирати його безглуздо, тож швидкий хеш тут достатній.

### 6.3. Cookie

```ts
res.cookie("refreshToken", token, {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "strict",
  path: "/auth",
  maxAge: env.REFRESH_TTL_DAYS * 86_400_000,
});
```

Кожен прапорець закриває окрему загрозу:

| Прапорець | Від чого захищає |
|-----------|------------------|
| `httpOnly` | JavaScript на сторінці не має доступу – навіть ваш власний. XSS не винесе токен назовні |
| `secure` | Лише через HTTPS. Локально HTTPS немає, тому вмикаємо лише в продакшні – з'явиться в подальшому розвитку роботи |
| `sameSite: "strict"` | Браузер не додасть cookie, якщо запит ініціював інший сайт. Основний захист від CSRF |
| `path: "/auth"` | Cookie іде лише на маршрути `/auth/*`, в інші запити не потрапляє |

І в `main.ts`:

```ts
app.use(cookieParser());
```

Без цього `req.cookies` буде `undefined`, і оновлення ніколи не спрацює.

**Refresh-токен у тіло відповіді НЕ потрапляє.** Лише в cookie. «Для зручності» віддати його ще й у JSON означає звести нанівець увесь сенс `httpOnly`.

### Контрольна точка 3

Увійдіть у браузері (крок 6 ще не зроблено – можна через `curl` з `-c jar.txt` і відкрити файл). У DevTools → Application → Cookies має бути `refreshToken` з позначками HttpOnly, SameSite Strict, Path `/auth`.

## 7. Крок 4. Guard і поточний користувач

```ts
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw new Unauthenticated();

    try {
      const payload = await this.jwt.verifyAsync(header.slice(7), {
        secret: env.JWT_ACCESS_SECRET,
      });
      req.user = { id: payload.sub, role: payload.role };
      return true;
    } catch {
      throw new Unauthenticated();
    }
  }
}
```

**Звернення до бази немає.** Перевіряється лише підпис і термін дії – це і є перевага JWT. І його ціна: змінили роль у базі, а токен про це не знає ще до 15 хвилин.

**Одна помилка на всі випадки.** Протермінований, підроблений, пошкоджений – клієнту однаково. Деталі допомагають лише тому, хто підбирає токен.

**Guard спрацьовує до pipe** – доступ перевіряється раніше, ніж валідуються дані.

Декоратор `@CurrentUser()` замість прямого `request.user` – щоб контролер не працював з об'єктом Express напряму:

```ts
@UseGuards(JwtAuthGuard)
@Get("me")
async me(@CurrentUser() current: AuthUser): Promise<UserDto> {
  return toUserDto(await this.auth.me(current.id));
}
```

**`toUserDto` – обов'язково.** Повернути рядок Prisma напряму означає віддати назовні `passwordHash`. Та сама помилка, що й у роботі №3 з грошима, – але тут наслідки серйозніші.

### Контрольна точка 4

```powershell
curl.exe -i http://127.0.0.1:3000/auth/me
```

401 з `application/problem+json`.

## 8. Крок 5. Ротація з виявленням повтору

Це головний крок даної роботи.

```ts
async rotate(raw: string) {
  const token = await this.prisma.refreshToken.findUnique({
    where: { tokenHash: sha256(raw) },
    include: { user: true },
  });

  if (!token || token.revokedAt || token.expiresAt < new Date()) {
    throw new InvalidRefreshToken();
  }

  if (token.usedAt) {
    await this.revokeFamily(token.familyId);
    this.logger.warn({ familyId: token.familyId }, "refresh token reuse detected");
    throw new InvalidRefreshToken();
  }

  const { count } = await this.prisma.refreshToken.updateMany({
    where: { id: token.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (count === 0) {
    await this.revokeFamily(token.familyId);
    throw new InvalidRefreshToken();
  }

  return this.issuePair(token.user, token.familyId);
}
```

### Логіка виявлення

Кожен refresh-токен дійсний рівно один раз. Сценарій крадіжки:

1. Зловмисник має копію токена.
2. Він оновлюється першим – отримує нову пару, старий токен позначено використаним.
3. Законний користувач приходить оновитися з тим самим старим токеном.
4. Сервер бачить: токен уже використаний. При чесній роботі це неможливо.
5. Невідомо, хто з двох – власник. Тому відкликаємо все сімейство: обидва викидаються і мають увійти заново.

Примусовий вихід користувача тут – не збій, а спрацювання захисту. Краще незручність, ніж тихий доступ зловмисника на місяць.

### Чому `updateMany` з умовою, а не просто `update`

```ts
where: { id: token.id, usedAt: null }
```

Той самий прийом, що й `status: "free"` на лекції 3. Між перевіркою `if (token.usedAt)` і записом може вклинитися інший запит із тим самим токеном. Умова в `where` робить позначку атомарною: із двох одночасних запитів один отримає `count = 1`, другий – `count = 0`.

Без цієї умови виявлення повтору працює при послідовних запитах і ламається під гонкою – тобто саме тоді, коли воно найпотрібніше.

### Контрольна точка 5 – головна перевірка

PowerShell, команди йдуть на бекенд напряму:

```powershell
# 1. Вхід – cookie у файл
curl.exe -s -c jar1.txt -X POST http://127.0.0.1:3000/auth/login `
  -H "Content-Type: application/json" `
  -d '{\"email\":\"student@example.com\",\"password\":\"eventhub-demo-2026\"}'

# 2. «Крадемо» копію
Copy-Item jar1.txt jar-stolen.txt

# 3. Законне оновлення
curl.exe -s -b jar1.txt -c jar1.txt -X POST http://127.0.0.1:3000/auth/refresh

# 4. «Зловмисник» пред'являє старий токен → 401
curl.exe -s -i -b jar-stolen.txt -X POST http://127.0.0.1:3000/auth/refresh

# 5. Законний користувач теж вилетів → 401
curl.exe -s -i -b jar1.txt -X POST http://127.0.0.1:3000/auth/refresh
```

У терміналі бекенду після кроку 4:

```text
WARN: refresh token reuse detected {"familyId":"018f4a…"}
```

Bash – те саме з `curl`, `\` і `cp jar1.txt jar-stolen.txt`.

Перевірте й у базі:

```sql
SELECT "familyId", "usedAt" IS NOT NULL AS used, "revokedAt" IS NOT NULL AS revoked
FROM "RefreshToken" ORDER BY "createdAt";
```

Усі токени одного сімейства – `revoked = t`.

## 9. Крок 6. Фронтенд

### 9.1. Проксі – без нього нічого не запрацює

`apps/web/vite.config.ts`:

```ts
server: {
  port: 5173,
  strictPort: true,
  proxy: {
    "/api": {
      target: "http://127.0.0.1:3000",
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api/, ""),
      cookiePathRewrite: { "/auth": "/api/auth" },
    },
  },
},
```

**`cookiePathRewrite`** – не менш важливий за сам проксі. Бекенд ставить cookie з `Path=/auth`, бо бачить свої маршрути як `/auth/…`. Але браузер звертається на `/api/auth/…`, а шлях `/api/auth` не починається з `/auth` – і cookie не надсилається. Проксі переписує шлях у заголовку `Set-Cookie`.

Помилка: у DevTools → Cookies значення є, усе виглядає правильно. Видно її лише у вкладці Network – запит refresh іде без заголовка `Cookie`.

`apps/web/.env.local`:

```text
VITE_API_URL=/api
```

**Чому це обов'язково.** Сторінка на `localhost:5173`, API на `127.0.0.1:3000` – для браузера це різні сайти. Cookie з `SameSite=Strict` у запитах між різними сайтами не надсилається. Вхід працюватиме (відповідь приходить), а оновлення – ніколи: після F5 користувача викидатиме з системи.

Симптом виглядає як помилка в коді оновлення, хоча причина – у конфігурації. Через проксі сторінка й API стають одним сайтом. У тижні 14 ту саму роль виконає Nginx, і причина буде та сама.

Перезапустіть Vite після зміни `.env.local`.

### 9.2. Access-токен у пам'яті

```ts
let accessToken: string | null = null;
export function getAccessToken() { return accessToken; }
export function setAccessToken(t: string | null) { accessToken = t; }
```

Звичайна змінна модуля. Не `localStorage` – там токен дістане будь-який скрипт на сторінці.

Наслідок, який треба передбачити: після F5 токена немає. Застосунок мовчки отримує новий через refresh-cookie.

### 9.3. Автоматичне оновлення при 401

```ts
let refreshInFlight: Promise<boolean> | null = null;

export function refreshAccessToken(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const res = await fetch(`${BASE_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) { setAccessToken(null); return false; }
      setAccessToken((await res.json()).accessToken);
      return true;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}
```

**`refreshInFlight`** – одне оновлення на всіх. Якщо одночасно «летіло» п'ять запитів і всі отримали 401, оновлення має статися один раз. Інакше перший запит обміняє refresh-токен, решта прийдуть зі старим – і ваш власний сервер, побачивши повтор, відкличе сімейство. Користувача викине через вашу ж помилку.

Власна функція `fetch` для клієнта:

```ts
async function authFetch(input: Request): Promise<Response> {
  const retry = input.clone(); // тіло можна прочитати лише раз
  const response = await fetch(withToken(input));

  const isAuthRoute = new URL(input.url).pathname.includes("/auth/");
  if (response.status !== 401 || isAuthRoute) return response;

  const refreshed = await refreshAccessToken();
  if (!refreshed) return response;

  return fetch(withToken(retry));
}

export const api = createClient<paths>({ baseUrl: BASE_URL, fetch: authFetch });
```

**Маршрути `/auth/*` не повторюємо.** 401 на вході означає «невірний пароль», а не «протермінований токен».

### 9.4. Сторінки

- `/login` – форма з перемиканням вхід / реєстрація;
- `/me` – кабінет, загорнутий у `RequireAuth`;
- у шапці – пошта користувача й кнопка «Вийти» або «Увійти».

`RequireAuth` не захищає даних. Він лише прибирає зайвий екран. Справжня перевірка – на сервері, у `JwtAuthGuard`. Хто знає адресу API, звернеться до неї напряму, і приховування сторінки в браузері йому не завадить.

### Контрольна точка 6

| Дія | Очікується |
|-----|------------|
| Відкрити `/me` без входу | перенаправлення на `/login` |
| Увійти | повернення на `/me` |
| DevTools → Console: `document.cookie` | порожньо |
| F5 | лишаєтесь у системі |
| Вийти | `/me` знову недоступна |

## 10. Критерії приймання

| № | Критерій | Перевірка |
|---|----------|-----------|
| 1 | Паролі – лише хеш Argon2id | `SELECT "passwordHash" FROM "User"` |
| 2 | Однакова відповідь на обидві помилки входу | два curl |
| 3 | Refresh лише в httpOnly-cookie, не в тілі | DevTools, тіло відповіді |
| 4 | `document.cookie` порожній | консоль браузера |
| 5 | Access не в `localStorage` | `grep -rn localStorage apps/web/src` |
| 6 | `/auth/me` без токена → 401 | curl |
| 7 | `passwordHash` не виходить назовні | тіло відповіді `/auth/me` |
| 8 | Повторний refresh відкликає сімейство | сценарій КТ 5 |
| 9 | Попередження в логах | термінал бекенду |
| 10 | F5 не викидає з системи | браузер |
| 11 | Секрет не в коді | `grep -rn "JWT_ACCESS_SECRET" apps/api-gateway/src` – лише `env` |

## 11. Типові проблеми

**Вхід працює, але після F5 викидає**
Дві можливі причини, обидві – у 9.1. Або `VITE_API_URL` лишився `http://127.0.0.1:3000` (має бути `/api`), або в проксі немає `cookiePathRewrite`. Відрізнити просто: DevTools → Network → запит refresh → чи є заголовок `Cookie`.

**`refresh` завжди 401, навіть одразу після входу**
Немає `app.use(cookieParser())` у `main.ts`.

**`ERR_PNPM_IGNORED_BUILDS` із згадкою `argon2`**
Не додано `argon2: true` в `allowBuilds`.

**`Некоректне оточення: JWT_ACCESS_SECRET: щонайменше 32 символи`**
Не скопійовано `.env.example` або секрет закороткий.

**`P2002` при реєстрації падає як 500**
Не перехоплено помилку унікальності Prisma – див. 5.3.

**Повторний `refresh` не відкликає сімейство**
Немає позначки `usedAt`, або вона ставиться без умови `usedAt: null` у `where`.

**Користувача викидає, коли відкрито дві вкладки**
Обидві вкладки одночасно пішли оновлюватися, і одна спрацювала як «повтор». Відоме обмеження простої ротації – див. домашнє завдання.

**Cookie не видно в DevTools**
Ви дивитесь cookie для `127.0.0.1:3000`, а сторінка на `localhost:5173`. Через проксі cookie належить `localhost`.

**`curl` у PowerShell повертає дивну помилку парсингу**
У Windows PowerShell 5.1 `curl` – псевдонім `Invoke-WebRequest`. Пишіть `curl.exe`.

**Лапки в JSON ламаються в PowerShell**
Екрануйте внутрішні лапки: `'{\"email\":\"…\"}'`. Або працюйте в Git Bash.

## 12. Здача

Pull request `lab-05`: автентифікація. В описі – склад команди, ролі, вивід сценарію з контрольної точки 5 (п'ять команд і рядок із логу) і посилання на ADR-005.

## 13. Домашнє завдання

1. **Вихід з усіх пристроїв.** Ендпоїнт, що відкликає всі сімейства токенів поточного користувача. Подумайте: чому access-токени на інших пристроях продовжать працювати ще до 15 хвилин, і чи прийнятно це.

2. **Замовлення належать користувачу.** Додайте `userId` у таблицю замовлень із домашніх завдань робіт 2–3 й захистіть перегляд guard'ом. Чуже замовлення – 404, не 403.

3. **ADR-005: де зберігати access-токен.** В роботі обрано пам'ять. Опишіть щонайменше два варіанти, чим платимо за кожен і за яких умов рішення варто переглянути. Окремо – як поводитися з кількома вкладками.
