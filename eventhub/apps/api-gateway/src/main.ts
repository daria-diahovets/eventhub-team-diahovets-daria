import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Дозволяємо запити з dev-сервера Vite.
  // У тижні 14 це значення прийде з оточення продакшн-сервера.
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
    credentials: true,
  });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);

  new Logger("Bootstrap").log(`api-gateway слухає http://localhost:${port}`);
}

void bootstrap();
