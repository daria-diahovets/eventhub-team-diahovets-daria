import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import { env } from "./config/env";
import { AppModule } from "./app.module";
import { ZodValidationPipe } from "./common/validation/zod-validation.pipe";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  app.useGlobalPipes(new ZodValidationPipe());

  // Дозволяємо запити з dev-сервера Vite.
  // У тижні 14 це значення прийде з оточення продакшн-сервера.
  app.enableCors({
    origin: env.WEB_ORIGIN,
    credentials: true,
  });

  await app.listen(env.PORT);

  app.get(Logger).log(`api-gateway слухає http://localhost:${env.PORT}`, "Bootstrap");
}

void bootstrap();
