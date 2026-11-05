import { HttpException } from "@nestjs/common";
import type { Problem } from "@eventhub/contracts";
import {
  AccountExistsWithPassword,
  EmailTaken,
  EventCancelled,
  EventNotFound,
  Forbidden,
  InvalidCredentials,
  InvalidCursor,
  InvalidRefreshToken,
  InvalidVenue,
  OAuthEmailNotVerified,
  OAuthNotConfigured,
  OAuthStateMismatch,
  OrderNotFound,
  RequestValidationFailed,
  SeatsUnavailable,
  Unauthenticated,
  type ValidationIssue,
} from "./domain-errors";

export interface ProblemBody extends Problem {
  errors?: ValidationIssue[];
}

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

  if (err instanceof InvalidCursor) {
    return {
      type: "/errors/invalid-cursor",
      title: "Некоректний курсор",
      status: 400,
      detail: err.message,
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

  if (err instanceof SeatsUnavailable) {
    return {
      type: "/errors/seats-unavailable",
      title: "Недостатньо вільних місць",
      status: 409,
      detail: err.message,
    };
  }

  if (err instanceof EventCancelled) {
    return {
      type: "/errors/event-cancelled",
      title: "Подію скасовано",
      status: 410,
      detail: err.message,
    };
  }

  if (err instanceof OrderNotFound) {
    return {
      type: "/errors/not-found",
      title: "Замовлення не знайдено",
      status: 404,
      detail: err.message,
    };
  }

  if (err instanceof EmailTaken) {
    return {
      type: "/errors/email-taken",
      title: "Ця пошта вже зареєстрована",
      status: 409,
    };
  }

  if (err instanceof InvalidCredentials) {
    return {
      type: "/errors/invalid-credentials",
      title: "Невірна пошта або пароль",
      status: 401,
    };
  }

  if (err instanceof Unauthenticated) {
    return {
      type: "/errors/unauthenticated",
      title: "Необхідна автентифікація",
      status: 401,
    };
  }

  if (err instanceof InvalidRefreshToken) {
    return {
      type: "/errors/invalid-refresh-token",
      title: "Недійсний refresh-токен",
      status: 401,
    };
  }

  if (err instanceof Forbidden) {
    return {
      type: "/errors/forbidden",
      title: "Вашій ролі не дозволено цю дію",
      status: 403,
    };
  }

  if (err instanceof InvalidVenue) {
    return {
      type: "/errors/invalid-venue",
      title: "Майданчик не знайдено",
      status: 422,
      detail: err.message,
    };
  }

  if (err instanceof OAuthNotConfigured) {
    return {
      type: "/errors/oauth-not-configured",
      title: "Вхід через Google не налаштовано",
      status: 503,
    };
  }

  if (err instanceof OAuthStateMismatch) {
    return {
      type: "/errors/oauth-state-mismatch",
      title: "Сеанс входу через Google недійсний",
      status: 401,
    };
  }

  if (err instanceof OAuthEmailNotVerified) {
    return {
      type: "/errors/oauth-email-not-verified",
      title: "Google не підтвердив пошту цього акаунта",
      status: 401,
    };
  }

  if (err instanceof AccountExistsWithPassword) {
    return {
      type: "/errors/account-exists-with-password",
      title: "Ця пошта вже зареєстрована з паролем",
      status: 409,
    };
  }

  if (err instanceof HttpException) {
    const status = err.getStatus();
    const response = err.getResponse();
    const detail =
      typeof response === "string"
        ? response
        : Array.isArray((response as { message?: unknown }).message)
          ? ((response as { message: string[] }).message.join("; "))
          : ((response as { message?: string }).message ?? err.message);

    return { type: "about:blank", title: err.name, status, detail };
  }

  return { type: "about:blank", title: "Внутрішня помилка сервера", status: 500 };
}
