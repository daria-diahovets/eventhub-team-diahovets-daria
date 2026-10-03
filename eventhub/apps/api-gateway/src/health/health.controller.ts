import { Controller, Get } from "@nestjs/common";

interface HealthResponse {
  status: "ok";
  uptime: number;
  version: string;
}

/**
 * Перевірка живості сервісу.
 *
 * Виглядає тривіально, але саме цей ендпоїнт у тижні 12 читатиме
 * healthcheck Docker-контейнера, а в тижні 14 — балансувальник Nginx,
 * вирішуючи, чи можна направляти сюди трафік.
 *
 * Тому він навмисно не звертається до бази й не робить нічого,
 * що може зависнути: healthcheck має відповідати швидко й завжди.
 */
@Controller("health")
export class HealthController {
  @Get()
  check(): HealthResponse {
    return {
      status: "ok",
      uptime: Number(process.uptime().toFixed(2)),
      version: process.env.npm_package_version ?? "0.1.0",
    };
  }
}
