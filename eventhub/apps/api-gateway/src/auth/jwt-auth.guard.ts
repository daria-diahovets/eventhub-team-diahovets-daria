import { Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { env } from "../config/env";
import { Unauthenticated } from "../common/problem/domain-errors";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw new Unauthenticated();

    try {
      const payload = await this.jwt.verifyAsync(header.slice(7), {
        secret: env.JWT_ACCESS_SECRET,
      });
      req.user = { id: payload.sub, role: payload.role };
      return true;
    } catch {
      throw new Unauthenticated();
    }
  }
}
