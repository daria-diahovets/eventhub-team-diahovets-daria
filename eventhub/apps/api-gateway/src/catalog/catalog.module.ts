import { Module } from "@nestjs/common";
import { CatalogController } from "./catalog.controller";
import { CatalogService } from "./catalog.service";
import { EventRepository } from "./event.repository";

@Module({
  controllers: [CatalogController],
  providers: [CatalogService, EventRepository],
  exports: [CatalogService],
})
export class CatalogModule {}
