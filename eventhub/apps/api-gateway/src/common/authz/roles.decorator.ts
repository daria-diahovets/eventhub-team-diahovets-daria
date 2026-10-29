import { SetMetadata } from "@nestjs/common";
import type { AuthUser } from "../../auth/auth.types";

export const ROLES_KEY = "roles";
export const Roles = (...roles: AuthUser["role"][]) => SetMetadata(ROLES_KEY, roles);
