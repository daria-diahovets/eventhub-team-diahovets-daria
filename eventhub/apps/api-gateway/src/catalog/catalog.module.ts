import { Module } from "@nestjs/common";
import { CatalogController } from "./catalog.controller";
import { CatalogService } from "./catalog.service";
import { EventRepository } from "./event.repository";
import { SeatRepository } from "./seat.repository";

@Module({
  controllers: [CatalogController],
  providers: [CatalogService, EventRepository, SeatRepository],
  exports: [CatalogService],
})
export class CatalogModule {}
