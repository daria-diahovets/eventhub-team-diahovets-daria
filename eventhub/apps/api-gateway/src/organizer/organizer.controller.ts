import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from "@nestjs/common";
import type { Event } from "@eventhub/contracts";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { Roles } from "../common/authz/roles.decorator";
import { RolesGuard } from "../common/authz/roles.guard";
import { OrganizerService } from "./organizer.service";
import { CreateEventBodyDto, OrganizerEventIdParamDto, UpdateEventBodyDto } from "./organizer.dto";

@Controller("organizer/events")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("organizer", "admin")
export class OrganizerController {
  constructor(private readonly organizer: OrganizerService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<Event[]> {
    return this.organizer.list(user);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: AuthUser, @Body() body: CreateEventBodyDto): Promise<Event> {
    return this.organizer.create(user, body);
  }

  @Patch(":eventId")
  update(
    @CurrentUser() user: AuthUser,
    @Param() params: OrganizerEventIdParamDto,
    @Body() body: UpdateEventBodyDto,
  ): Promise<Event> {
    return this.organizer.update(user, params.eventId, body);
  }
}
