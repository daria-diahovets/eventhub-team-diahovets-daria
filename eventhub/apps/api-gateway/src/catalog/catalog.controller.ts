import { Controller, Get, Param, Query } from "@nestjs/common";
import type { Event, EventPage } from "@eventhub/contracts";
import { CatalogService } from "./catalog.service";
import { EventIdParamDto, ListEventsQueryDto } from "./catalog.dto";

@Controller("events")
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  list(@Query() query: ListEventsQueryDto): Promise<EventPage> {
    return this.catalog.list(query);
  }

  @Get(":eventId")
  getOne(@Param() params: EventIdParamDto): Promise<Event> {
    return this.catalog.getOne(params.eventId);
  }
}
