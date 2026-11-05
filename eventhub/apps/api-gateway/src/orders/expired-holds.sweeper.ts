import { Injectable } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectPinoLogger, type PinoLogger } from "nestjs-pino";
import { env } from "../config/env";
import { OrdersRepository } from "./orders.repository";

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
        this.logger.info(
          { expired, ms: Date.now() - started },
          "прибрано протермінованих замовлень",
        );
      }
    } catch (err) {
      this.logger.error({ err }, "прибиральник резервів упав");
    }
  }
}
