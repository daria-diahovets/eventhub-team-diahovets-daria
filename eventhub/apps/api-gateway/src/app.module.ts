import { randomUUID } from "node:crypto";
import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { LoggerModule } from "nestjs-pino";
import { env } from "./config/env";
import { PrismaModule } from "./prisma/prisma.module";
import { HealthModule } from "./health/health.module";
import { CatalogModule } from "./catalog/catalog.module";
import { OrdersModule } from "./orders/orders.module";
import { ReportsModule } from "./reports/reports.module";
import { ProblemFilter } from "./common/problem/problem.filter";

@Module({
  imports: [
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
          process.env.NODE_ENV === "production"
            ? undefined
            : { target: "pino-pretty", options: { singleLine: true } },
      },
    }),
    PrismaModule,
    HealthModule,
    CatalogModule,
    OrdersModule,
    ReportsModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: ProblemFilter }],
})
export class AppModule {}
