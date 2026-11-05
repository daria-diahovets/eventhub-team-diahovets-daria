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

export class InvalidCursor extends DomainError {
  constructor(readonly cursor: string) {
    super(`Некоректний курсор: ${cursor}`);
  }
}

export class EventCancelled extends DomainError {
  constructor(readonly eventId: string) {
    super(`Подію ${eventId} скасовано`);
  }
}

export class SeatsUnavailable extends DomainError {
  constructor(
    readonly eventId: string,
    readonly requested: number,
    readonly available: number,
  ) {
    super(`Запитано ${requested} місць, вільно ${available}`);
  }
}

export class OrderNotFound extends DomainError {
  constructor(readonly orderId: string) {
    super(`Замовлення ${orderId} не знайдено`);
  }
}

export interface ValidationIssue {
  field: string;
  code: string;
  message: string;
}

export class RequestValidationFailed extends DomainError {
  constructor(readonly issues: ValidationIssue[]) {
    super("Помилка валідації запиту");
  }
}

export class EmailTaken extends DomainError {
  constructor(readonly email: string) {
    super(`Пошта ${email} вже зареєстрована`);
  }
}

export class InvalidCredentials extends DomainError {
  constructor() {
    super("Невірна пошта або пароль");
  }
}

export class Unauthenticated extends DomainError {
  constructor() {
    super("Відсутній або недійсний access-токен");
  }
}

export class InvalidRefreshToken extends DomainError {
  constructor() {
    super("Відсутній, протермінований або вже використаний refresh-токен");
  }
}

export class Forbidden extends DomainError {
  constructor() {
    super("Вашій ролі не дозволено цю дію");
  }
}

export class InvalidVenue extends DomainError {
  constructor(readonly venueId: string) {
    super(`Майданчик ${venueId} не знайдено`);
  }
}

export class OAuthNotConfigured extends DomainError {
  constructor() {
    super("Вхід через Google не налаштовано на сервері");
  }
}

export class OAuthStateMismatch extends DomainError {
  constructor() {
    super("Сеанс входу через Google недійсний або протермінований");
  }
}

export class OAuthEmailNotVerified extends DomainError {
  constructor() {
    super("Google не підтвердив пошту цього акаунта");
  }
}

export class AccountExistsWithPassword extends DomainError {
  constructor() {
    super("Ця пошта вже зареєстрована з паролем");
  }
}
