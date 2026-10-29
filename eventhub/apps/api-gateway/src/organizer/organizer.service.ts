import { Injectable } from "@nestjs/common";
import type { CreateEventBody, Event, UpdateEventBody } from "@eventhub/contracts";
import type { AuthUser } from "../auth/auth.types";
import { OrganizerRepository } from "./organizer.repository";
import type { OwnerScope } from "./organizer.types";

function scopeFor(user: AuthUser): OwnerScope {
  return user.role === "admin" ? undefined : { organizerId: user.id };
}

@Injectable()
export class OrganizerService {
  constructor(private readonly repo: OrganizerRepository) {}

  list(user: AuthUser): Promise<Event[]> {
    return this.repo.list(scopeFor(user));
  }

  create(user: AuthUser, body: CreateEventBody): Promise<Event> {
    return this.repo.create(user.id, body);
  }

  update(user: AuthUser, eventId: string, body: UpdateEventBody): Promise<Event> {
    return this.repo.update(eventId, scopeFor(user), body);
  }
}
