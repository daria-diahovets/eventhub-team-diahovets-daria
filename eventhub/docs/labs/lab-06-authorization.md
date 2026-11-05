# Лабораторна робота № 6

**Тема:** Авторизація: ролі, власність, вхід через Google

## 1. Мета роботи

Навчитися розробляти систему авторизації, виконувати обмеження доступу користувачів за ролями та реалізовувати вхід в систему з Google акаунту.

Після виконання студент уміє:

- розрізняти три рівні перевірки прав і реалізовувати кожен;
- обмежувати доступ за ролями декларативно, декоратором;
- перевіряти власника запису так, щоб чужий запис для бази просто не існував;
- обирати між 403 і 404 за чітким правилом;
- реалізувати вхід через Google за протоколом OpenID Connect із PKCE, `state` і `nonce`;
- безпечно зв'язувати акаунти з однаковою поштою.

> **Головна перевірка роботи**
>
> Організатор А намагається змінити подію організатора Б, знаючи її ідентифікатор. Отримує 404 – не 403 і тим паче не 200.

### Три рівні, які треба тримати в голові весь час

| Рівень | Питання | Хто перевіряє | Відповідь при відмові |
|--------|---------|---------------|-----------------------|
| 1 | Чи ви увійшли? | `JwtAuthGuard` (тиждень 5) | 401 |
| 2 | Чи дозволено вашій ролі? | `RolesGuard` (сьогодні) | 403 |
| 3 | Чи ваш це запис? | умова в запиті до бази (сьогодні) | 404 |

Кожен рівень не замінює попередній, а додається до нього. Пропуск третього – найпоширеніша вразливість вебзастосунків, у OWASP Top 10 вона стоїть на першому місці.

## 2. Перед початком

```bash
git checkout -b week-06/<нік-автора>
nvm use
pnpm install
docker compose up -d db
cp apps/api-gateway/.env.example apps/api-gateway/.env
```

У `.env` замініть `JWT_ACCESS_SECRET` на випадковий рядок, як минулого тижня. Поля `GOOGLE_*` поки лишіть порожніми – ними займемось у кроці 5.

> **Підготовка до заняття**
>
> Кроку 5 потрібна реєстрація застосунку в Google Cloud Console. Це вимагає власного облікового запису Google. Інструкція – у розділі 7.1. Кроки 1–4 від Google не залежать, а без облікових даних застосунок стартує й коректно повідомляє, що вхід через Google не налаштовано.

## 3. План

| Крок | Що робимо |
|------|-----------|
| 1 | Схема: власник події, OAuth-акаунти |
| 2 | Ролі: декоратор і guard |
| 3 | Кабінет організатора з перевіркою власника |
| 4 | Тест нападника |
| 5 | Вхід через Google |
| 6 | Фронтенд |

## 4. Крок 1. Схема

### 4.1. Власник події

У модель `Event`:

```prisma
organizerId String?  @db.Uuid
organizer   User?    @relation("OrganizedEvents", fields: [organizerId], references: [id], onDelete: SetNull)

@@index([organizerId])
```

У модель `User`:

```prisma
organizedEvents Event[] @relation("OrganizedEvents")
```

**Чому `String?` – необов'язкове.** У таблиці вже є події. Зробити нову колонку обов'язковою одним кроком неможливо: база не знає, яке значення поставити наявним рядкам, і міграція впаде. Спершу розширюємо (додаємо необов'язкову колонку), потім заповнюємо, і лише тоді звужуємо до `NOT NULL`. Останній крок – у домашньому завданні.

Події без власника може редагувати лише адміністратор.

**Чому ім'я зв'язку `"OrganizedEvents"`.** Між `User` і `Event` у майбутньому з'являться інші зв'язки (наприклад, «хто купив квиток»). Prisma вимагає розрізняти їх іменами, щойно їх більше одного. Дати ім'я одразу – дешевше, ніж перейменовувати потім.

### 4.2. Користувач без пароля

```prisma
model User {
  // ...
  passwordHash  String?                       // було String
  emailVerified Boolean        @default(false) // нове
  oauthAccounts OAuthAccount[]                // нове
}

model OAuthAccount {
  id              String   @id @default(uuid(7)) @db.Uuid
  userId          String   @db.Uuid
  provider        String
  providerSubject String
  createdAt       DateTime @default(now()) @db.Timestamptz(3)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerSubject])
  @@index([userId])
}
```

**`passwordHash String?`** – у того, хто зареєструвався через Google, пароля немає зовсім.

**`emailVerified`** – чи підтверджено, що пошта належить користувачу. Від цього поля залежить, чи можна безпечно зв'язати акаунт із Google (крок 5).

**`OAuthAccount`** – окрема таблиця, а не поле `googleId` у користувача. Так можна прив'язати кілька провайдерів (Google, GitHub) без зміни схеми.

**`@@unique([provider, providerSubject])`** – користувача Google ми впізнаємо за парою «провайдер + `sub`». Не за поштою: пошту в Google можна змінити, `sub` – ніколи.

```bash
pnpm --filter @eventhub/api-gateway db:migrate --name authorization
```

### 4.3. Сиди

Сиди тепер створюють користувачів перед подіями – бо події посилаються на організатора. Додайте другого організатора й адміністратора:

| Пошта | Роль |
|-------|------|
| `student@example.com` | `USER` |
| `organizer@example.com` | `ORGANIZER` |
| `organizer2@example.com` | `ORGANIZER` |
| `admin@example.com` | `ADMIN` |

Перші п'ять подій призначте першому організатору, решту – другому. Без двох організаторів неможливо перевірити третій рівень прав.

### Контрольна точка 1

```bash
pnpm --filter @eventhub/api-gateway db:reset
```

```text
Applying migration `…_authorization`
Створено 9 майданчиків, 10 подій, 801 місць, 4 користувачі
```

## 5. Крок 2. Ролі

### 5.1. Декоратор

`apps/api-gateway/src/common/authz/roles.decorator.ts`:

```ts
export const ROLES_KEY = "roles";
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
```

Декоратор нічого не перевіряє. Він лише записує в метадані методу список ролей.

### 5.2. Guard

```ts
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY, [ctx.getHandler(), ctx.getClass()],
    );
    if (!required || required.length === 0) return true;

    const req = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (!req.user) throw new Unauthenticated(); // страховка
    if (!required.includes(req.user.role)) throw new Forbidden();
    return true;
  }
}
```

**`getAllAndOverride`** шукає метадані спершу на методі, потім на класі. Так `@Roles` над класом задає правило для всіх методів, а над окремим методом – перевизначає його.

**`if (!req.user)`** – не дублювання. Це страховка на випадок, коли хтось переставить guard'и місцями. Принцип безпечного коду: за замовчуванням – відмовити. Guard, який не зрозумів ситуацію, має забороняти, а не пропускати.

### 5.3. Порядок guard'ів

```ts
@UseGuards(JwtAuthGuard, RolesGuard) // ✓ правильно
@UseGuards(RolesGuard, JwtAuthGuard) // ✗ роль читається до того, як з'явився користувач
```

Guard'и виконуються в порядку перелічення. Роль береться з `request.user`, а туди його кладе `JwtAuthGuard`. Переставите місцями – отримаєте 401 замість 403 (завдяки страховці) або 500 (без неї).

Не забудьте додати `Forbidden` у `problem.ts` зі статусом 403.

### Контрольна точка 2

Поки немає маршрутів організатора – перевіримо на кроці 3.

## 6. Крок 3. Кабінет організатора

### 6.1. Контролер: рівні 1 і 2 – декларативно

```ts
@Controller("organizer/events")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ORGANIZER, Role.ADMIN)
export class OrganizerController {
  @Get()
  list(@CurrentUser() user: AuthUser) { return this.organizer.list(user); }

  @Post()
  @HttpCode(201)
  create(@CurrentUser() user: AuthUser, @Body() body: CreateEventBodyDto) { … }

  @Patch(":eventId")
  update(@CurrentUser() user: AuthUser, @Param() params, @Body() body: UpdateEventBodyDto) { … }
}
```

Перші два рівні – над класом, один раз на всі методи. Третій неможливо описати декоратором: він залежить від конкретного запису, а не від маршруту.

### 6.2. Сервіс: хто що бачить – в одному місці

```ts
function scopeFor(user: AuthUser): OwnerScope {
  return user.role === Role.ADMIN ? undefined : { organizerId: user.id };
}
```

`undefined` – «без обмеження» (адміністратор). Об'єкт – «лише події цього організатора».

### 6.3. Репозиторій: рівень 3 – у самому запиті

Спершу варіант, як не слід робити:

```ts
// ✗ неправильно
const event = await prisma.event.findUnique({ where: { id: eventId } });
if (event.organizerId !== user.id) throw new Forbidden();
await prisma.event.update({ where: { id: eventId }, data });
```

Три проблеми одразу. Два запити з вікном між ними. Перевірку легко забути в наступному методі – вона живе окремо від запиту. І `Forbidden` – це 403, який підтверджує, що подія існує.

Розглянемо зразок коду, який усуває проблеми попереднього рішення:

```ts
// ✓ правильно
async update(eventId: string, scope: OwnerScope, data) {
  const { count } = await this.prisma.event.updateMany({
    where: scope ? { id: eventId, organizerId: scope.organizerId } : { id: eventId },
    data,
  });
  return count;
}
```

І в сервісі:

```ts
const count = await this.repo.update(eventId, scopeFor(user), data);
if (count === 0) throw new EventNotFound(eventId);
```

**Умова в `WHERE` замість перевірки після читання.** Чужа подія для бази просто не існує: її не прочитати, не змінити й не дізнатися, що вона є.

Нуль рядків – це 404. І неважливо, чи події немає взагалі, чи вона чужа. Для цього користувача вона не існує, і відповідь не повинна підтверджувати протилежне.

### 6.4. Власник – лише з токена

```ts
async create(user: AuthUser, body: CreateEventBody) {
  return this.repo.create({
    ...,
    organizerId: user.id, // ← з токена, не з body
  });
}
```

Якщо брати `organizerId` з тіла запиту, організатор зможе створити подію від імені іншого. Zod-схема `createEventBody` це поле навіть не оголошує – і зайве значення в запиті просто відкидається.

### 6.5. Коли 403, а коли 404

| Ситуація | Код | Чому |
|----------|-----|------|
| Користувач відкриває `/organizer/events` | 403 | Кабінет організатора існує, приховувати нічого |
| Організатор А змінює подію організатора Б | 404 | 403 підтвердив би, що подія з таким id існує |
| Майданчик у тілі запиту не існує | 422 | Відсутній не ресурс за адресою, а значення в тілі |

Перевірка, яку можна робити щоразу: чи змінилося б щось для зловмисника, якби він знав, що ресурс існує? Якщо так – 404.

### Контрольна точка 3

PowerShell – отримуємо токени:

```powershell
function Login($email) {
  $body = @{ email = $email; password = "eventhub-demo-2026" } | ConvertTo-Json
  (Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3000/auth/login `
    -ContentType "application/json" -Body $body).accessToken
}

$student = Login "student@example.com"
$org1    = Login "organizer@example.com"

curl.exe -i http://127.0.0.1:3000/organizer/events
# 401
curl.exe -i http://127.0.0.1:3000/organizer/events -H "Authorization: Bearer $student"
# 403
curl.exe -i http://127.0.0.1:3000/organizer/events -H "Authorization: Bearer $org1"
# 200, 5 подій
```

Bash:

```bash
TOKEN=$(curl -s -X POST http://127.0.0.1:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"organizer@example.com","password":"eventhub-demo-2026"}' | jq -r .accessToken)

curl -i http://127.0.0.1:3000/organizer/events -H "Authorization: Bearer $TOKEN"
```

## 7. Крок 4. Тест нападника

Тести на власних даних ніколи не знайдуть IDOR – вони пишуться з позиції чесного користувача. Потрібен сценарій з позиції нападника.

```powershell
$org2 = Login "organizer2@example.com"
$foreign = "018f2c1e-4a7b-7c3d-9e1f-2a5b6c7d8ea8"   # подія organizer2

# Організатор 1 намагається змінити чужу подію
curl.exe -i -X PATCH http://127.0.0.1:3000/organizer/events/$foreign `
  -H "Authorization: Bearer $org1" -H "Content-Type: application/json" `
  -d '{\"title\":\"Захоплено\"}'
```

Очікується: **404 Not Found**. Не 403, не 200.

```powershell
# Власник – може
curl.exe -i -X PATCH http://127.0.0.1:3000/organizer/events/$foreign `
  -H "Authorization: Bearer $org2" -H "Content-Type: application/json" `
  -d '{\"title\":\"Новорічний гала-концерт (оновлено)\"}'
```

Очікується: **200**.

### Контрольна точка 4

У описі PR – вивід обох команд. Це і є головна перевірка лабораторної.

## 8. Крок 5. Вхід через Google

### 8.1. Налаштування в Google Cloud Console

1. https://console.cloud.google.com → створити проєкт `eventhub-dev`.
2. APIs & Services → OAuth consent screen → тип **External**, режим **Testing**. Заповнити назву застосунку й пошту підтримки.
3. У тому ж розділі – **Test users** → додати свою пошту. У режимі Testing увійти можуть лише перелічені користувачі.
4. Credentials → Create credentials → OAuth client ID → тип **Web application**.
5. Authorized redirect URIs:

   ```text
   http://localhost:5173/api/auth/google/callback
   ```

   Символ у символ. Без слеша в кінці, `localhost`, а не `127.0.0.1`, порт 5173, а не 3000.
6. Скопіюйте Client ID і Client secret у `apps/api-gateway/.env`.

**`:5173/api`, а не `:3000`** – бо cookie мусить належати тому самому сайту, що й сторінка. Google поверне браузер на цю адресу, проксі Vite перешле запит на бекенд.

**`redirect_uri_mismatch`** – найчастіша помилка налаштування. Google порівнює адресу посимвольно.

Інтерфейс консолі час від часу перейменовує розділи. Якщо назва відрізняється – шукайте за змістом.

```bash
pnpm --filter @eventhub/api-gateway add google-auth-library
```

### 8.2. Три випадкові значення

```ts
function random(): string {
  return randomBytes(32).toString("base64url");
}

const flow = {
  state: random(),    // захист від login CSRF
  verifier: random(), // PKCE: секрет, що лишається в нас
  nonce: random(),    // захист від повторного використання id_token
};
const challenge = createHash("sha256").update(flow.verifier).digest("base64url");
```

**`randomBytes`, а не `Math.random`.** `Math.random` передбачуваний: його результати можна відновити за кількома попередніми. Для всього, що стосується безпеки, – лише криптографічний генератор.

| Значення | Від чого захищає | Як перевіряється |
|----------|------------------|------------------|
| `state` | Зловмисник підсовує вам посилання зі своїм кодом – і ви входите в його акаунт | Має збігтися зі значенням у cookie |
| `verifier` | Перехоплений по дорозі код обмінюють на токени | Google хешує його й порівнює з `challenge` |
| `nonce` | Старий перехоплений `id_token` використовують повторно | Має збігтися зі значенням усередині `id_token` |

Бібліотеки OIDC роблять усе це автоматично. Ми пишемо вручну, щоб побачити, навіщо кожне.

### 8.3. Адреса сторінки згоди

```ts
const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
url.search = new URLSearchParams({
  client_id: env.GOOGLE_CLIENT_ID!,
  redirect_uri: env.GOOGLE_REDIRECT_URI,
  response_type: "code",
  scope: "openid email profile",
  state: flow.state,
  nonce: flow.nonce,
  code_challenge: challenge,
  code_challenge_method: "S256",
  prompt: "select_account",
}).toString();
```

**`scope: "openid"`** – саме це слово перетворює OAuth на OpenID Connect і змушує Google видати `id_token` із даними про особу.

### 8.4. Cookie потоку – `Lax`, а не `Strict`

```ts
res.cookie("oauthFlow", encoded, {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax", // ← УВАГА
  path: "/auth",
  maxAge: 10 * 60 * 1000,
});
```

Це найнеочевидніше місце лабораторної. Refresh-cookie у нас `Strict`, і природно зробити таку саму. Тоді вхід не працюватиме ніколи.

Повернення з Google – це перехід, ініційований іншим сайтом (`accounts.google.com`). Cookie з `SameSite=Strict` браузер у такому переході не надсилає. Бекенд не знайде `state` і відповість «сеанс недійсний».

`Lax` дозволяє надсилання саме для переходів верхнього рівня методом GET – рівно цей випадок. Для refresh-cookie `Lax` був би гіршим вибором. Дві cookie з різними політиками – не непослідовність, а свідоме рішення під різні задачі.

### 8.5. Повернення з Google

```ts
@Get("callback")
async callback(
  @Query("code") code, @Query("state") state, @Query("error") error,
  @Req() req, @Res() res,
) {
  const flow = readOAuthCookie(req);
  clearOAuthCookie(res); // одноразово

  try {
    if (error) throw new OAuthStateMismatch(); // натиснули «Скасувати»
    if (!flow || !code || state !== flow.state) throw new OAuthStateMismatch();

    const claims = await this.google.finish(code, flow);
    const user = await this.auth.loginWithGoogle(claims);
    const { refreshToken } = await this.tokens.issuePair(user);

    setRefreshCookie(res, refreshToken);
    res.redirect("/me");
  } catch (err) {
    const code = toProblem(err).type.replace("/errors/", "");
    res.redirect(`/login?oauthError=${encodeURIComponent(code)}`);
  }
}
```

**Помилки – перенаправлення, а не JSON,** бо цей маршрут відкривається переходом браузера, а не `fetch`. Якби помилка поверталась як `problem+json`, користувач побачив би сирий JSON замість сторінки. Тип помилки передаємо в адресі, текст для людини – на фронтенді.

**Після входу – наша власна пара токенів.** Рівно та сама, що й при вході паролем. Токени Google ми не зберігаємо: нам потрібна лише відповідь на питання «хто це», і вона вже в `id_token`.

### 8.6. Перевірка `id_token`

```ts
const { tokens } = await client.getToken({ code, codeVerifier: flow.verifier });

const ticket = await client.verifyIdToken({
  idToken: tokens.id_token,
  audience: env.GOOGLE_CLIENT_ID!, // ← не пропускати
});

const claims = ticket.getPayload();
if (!claims || claims.nonce !== flow.nonce) throw new OAuthStateMismatch();
```

`verifyIdToken` перевіряє підпис ключами Google, видавця (`iss`) і термін дії (`exp`). `audience` – обов'язково: без нього підійде `id_token`, виданий зовсім іншому сайту для того самого користувача. Це реальна історична вразливість.

`nonce` бібліотека не знає – перевіряємо самі.

### 8.7. Зв'язування акаунтів

```ts
async loginWithGoogle(claims: TokenPayload): Promise<User> {
  // 1. Уже прив'язаний – за парою «провайдер + sub»
  const linked = await this.prisma.oAuthAccount.findUnique({
    where: { provider_providerSubject: { provider: "google", providerSubject: claims.sub } },
    include: { user: true },
  });
  if (linked) return linked.user;

  if (!claims.email || claims.email_verified !== true) throw new OAuthEmailNotVerified();
  const email = claims.email.toLowerCase();

  // 2. Пошта вже зареєстрована
  const existing = await this.prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (!existing.emailVerified) throw new AccountExistsWithPassword();
    // … прив'язати й повернути
  }

  // 3. Новий користувач – без пароля
  return this.prisma.user.create({ … });
}
```

**Чому не можна просто знайти користувача за поштою й увійти** – атака захоплення акаунта наперед:

1. Зловмисник реєструється з паролем на пошту жертви. Підтвердження пошти немає – система пропускає.
2. Жертва, нічого не підозрюючи, входить через Google. Система бачить ту саму пошту й «зручно» зв'язує акаунти.
3. У зловмисника тепер є пароль до акаунта жертви – і все, що вона туди внесе.

Тому автоматично зв'язуємо лише якщо пошту підтверджено з обох боків. Наші пароль-акаунти пошту не підтверджують – отже, вхід через Google з поштою `student@example.com` дасть «ця пошта вже зареєстрована з паролем». Явне прив'язування з кабінету – домашнє завдання.

### Контрольна точка 5

| Дія | Очікується |
|-----|------------|
| «Увійти через Google» | перехід на `accounts.google.com` |
| DevTools → Cookies до переходу | `oauthFlow`: HttpOnly, SameSite Lax |
| Обрати акаунт | повернення на `/me`, видно пошту Google |
| DevTools → Cookies після | `oauthFlow` зникла, є `refreshToken` |
| «Скасувати» на сторінці Google | `/login` з повідомленням |

## 9. Крок 6. Фронтенд

- На сторінці входу – посилання «Увійти через Google» на `/api/auth/google` і показ помилки з `?oauthError`.
- `RequireRole` – обгортка для маршрутів організатора.
- `/organizer` – список власних подій; `/organizer/events/:id` – форма редагування.
- У шапці – посилання «Кабінет організатора» для ролей `ORGANIZER` і `ADMIN`.

**Посилання, а не `fetch`,** бо вхід через Google – це перехід браузера на чужу сторінку й назад. `fetch` не може показати користувачу сторінку згоди Google.

**`RequireRole` не захищає даних.** Як і `RequireAuth` минулого тижня – лише прибирає екран, яким користувач однаково не зміг би скористатися. Справжній захист – на сервері.

Після збереження форми – інвалідація за префіксом:

```ts
onSuccess: () => {
  void qc.invalidateQueries({ queryKey: eventKeys.all });
  void qc.invalidateQueries({ queryKey: organizerKeys.all });
},
```

### Контрольна точка 6

Увійдіть як `organizer@example.com`, змініть назву події, поверніться в каталог – назва оновлена без перезавантаження сторінки.

## 10. Критерії приймання

| № | Критерій | Перевірка |
|---|----------|-----------|
| 1 | Без токена → 401 | curl |
| 2 | `USER` на маршрутах організатора → 403 | curl |
| 3 | Чужа подія → 404 | сценарій кроку 4 |
| 4 | Власник може змінити свою подію → 200 | сценарій кроку 4 |
| 5 | Адміністратор бачить усі події | 10 подій у списку |
| 6 | Власник при створенні – з токена | POST з чужим `organizerId` |
| 7 | Власник у `WHERE`, а не окремою перевіркою | читання коду |
| 8 | `JwtAuthGuard` перед `RolesGuard` | читання коду |
| 9 | `state`, PKCE і `nonce` генеруються й перевіряються | читання коду |
| 10 | `audience` у `verifyIdToken` | читання коду |
| 11 | Користувач Google шукається за `sub` | читання коду |
| 12 | Cookie потоку – `SameSite=Lax` | DevTools |

## 11. Типові проблеми

**Вхід через Google завжди закінчується «Сеанс входу недійсний»**
Cookie потоку має `SameSite=Strict`. Має бути `Lax` – див. 8.4.

**`redirect_uri_mismatch` на сторінці Google**
Адреса в Cloud Console і в `GOOGLE_REDIRECT_URI` відрізняються хоча б одним символом.

**`Error 403: access_denied` на сторінці Google**
Ваша пошта не додана в Test users у режимі Testing.

**Кнопка Google одразу повертає «не налаштовано»**
Порожні `GOOGLE_CLIENT_ID` або `GOOGLE_CLIENT_SECRET` у `.env`, або бекенд не перезапущено після їх заповнення.

**500 замість 401 на маршрутах організатора**
`RolesGuard` стоїть перед `JwtAuthGuard` і немає страховки `if (!req.user)`.

**Організатор отримує 403 на чужу подію замість 404**
Перевірка власника зроблена окремим `if` після читання, а не умовою в `WHERE`.

**Міграція падає з помилкою про `NOT NULL`**
`organizerId` оголошено обов'язковим. Для таблиці з даними – лише необов'язковим.

**Сиди падають з порушенням зовнішнього ключа**
Події створюються раніше за користувачів. Порядок має бути зворотним.

**Після F5 викидає з системи**
Перевірте `cookiePathRewrite` у `vite.config.ts` – див. методичку тижня 5, розділ 9.1.

**PowerShell: `ConvertTo-Json` видає щось дивне**
Кирилиця в тілі. Для тестів використовуйте латиницю або `curl.exe` з екранованими лапками.

## 12. Здача

Текстовий звіт та pull request `lab-06`: авторизація. В описі – склад команди, ролі, вивід тесту нападника з кроку 4 і посилання на ADR-006.

## 13. Домашнє завдання

1. **Явне прив'язування Google.** Користувач, що увійшов паролем, натискає в кабінеті «Прив'язати Google» – і далі може входити обома способами. Подумайте: чим цей потік відрізняється від звичайного входу і чому тут зв'язування безпечне без підтвердження пошти.

2. **Звуження `organizerId` до `NOT NULL`.** Друга й третя фази expand-contract: міграція, що призначає всім подіям без власника адміністратора, і міграція, що робить колонку обов'язковою. Поясніть, чому ці дві зміни – окремі міграції.

3. **Зміна ролі адміністратором.** Ендпоїнт, яким адміністратор змінює роль користувача. Роль лежить у токені, а токен живе 15 хвилин. Чи прийнятно, що зміна набуде сили із затримкою? Для підвищення прав, для зниження? Запропонуйте рішення.

4. **ADR-006: коли 403, а коли 404.** Сформулюйте правило для всього API EventHub і перевірте на ньому всі наявні ендпоїнти.
