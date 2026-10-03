import { Module } from "@nestjs/common";
import { CatalogModule } from "../catalog/catalog.module";
import { OrderRepository } from "./order.repository";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";

@Module({
  imports: [CatalogModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrderRepository],
})
export class OrdersModule {}
