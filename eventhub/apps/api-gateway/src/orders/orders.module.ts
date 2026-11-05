import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ExpiredHoldsSweeper } from "./expired-holds.sweeper";
import { OrdersController } from "./orders.controller";
import { OrdersRepository } from "./orders.repository";
import { OrdersService } from "./orders.service";

@Module({
  imports: [AuthModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersRepository, ExpiredHoldsSweeper],
})
export class OrdersModule {}
