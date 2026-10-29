import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RolesGuard } from "../common/authz/roles.guard";
import { OrganizerController } from "./organizer.controller";
import { OrganizerService } from "./organizer.service";
import { OrganizerRepository } from "./organizer.repository";

@Module({
  imports: [AuthModule],
  controllers: [OrganizerController],
  providers: [OrganizerService, OrganizerRepository, RolesGuard],
})
export class OrganizerModule {}
