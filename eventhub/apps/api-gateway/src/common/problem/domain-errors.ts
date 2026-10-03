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
