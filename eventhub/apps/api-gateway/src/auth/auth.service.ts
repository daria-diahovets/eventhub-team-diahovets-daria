import { randomBytes, createHash, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Prisma, type User as UserRow } from "@prisma/client";
import * as argon2 from "argon2";
import type { User } from "@eventhub/contracts";
import type { LoginBody, RegisterBody } from "@eventhub/contracts";
import { InjectPinoLogger, type PinoLogger } from "nestjs-pino";
import { PrismaService } from "../prisma/prisma.service";
import { env } from "../config/env";
import {
  EmailTaken,
  InvalidCredentials,
  InvalidRefreshToken,
  Unauthenticated,
} from "../common/problem/domain-errors";
import type { TokenPair } from "./auth.types";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function toUserDto(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    role: row.role.toLowerCase() as User["role"],
    createdAt: row.createdAt.toISOString(),
  };
}

const ARGON2_OPTIONS: argon2.HashOptions = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
};

@Injectable()
export class AuthService {
  private dummyHash: string | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    @InjectPinoLogger(AuthService.name) private readonly logger: PinoLogger,
  ) {}

  private async getDummyHash(): Promise<string> {
    this.dummyHash ??= await argon2.hash(randomBytes(32).toString("hex"), ARGON2_OPTIONS);
    return this.dummyHash;
  }

  private async issuePair(
    user: UserRow,
    familyId: string = randomUUID(),
  ): Promise<TokenPair & { user: UserRow }> {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, role: user.role.toLowerCase() },
      { secret: env.JWT_ACCESS_SECRET, expiresIn: env.JWT_ACCESS_TTL_SECONDS },
    );

    const refreshToken = randomBytes(32).toString("base64url");
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        familyId,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + env.REFRESH_TTL_DAYS * 86_400_000),
      },
    });

    return { accessToken, refreshToken, user };
  }

  async register(body: RegisterBody): Promise<TokenPair & { user: User }> {
    const passwordHash = await argon2.hash(body.password, ARGON2_OPTIONS);

    let user: UserRow;
    try {
      user = await this.prisma.user.create({
        data: { email: body.email, passwordHash },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new EmailTaken(body.email);
      }
      throw err;
    }

    const pair = await this.issuePair(user);
    return { ...pair, user: toUserDto(pair.user) };
  }

  async login(body: LoginBody): Promise<TokenPair & { user: User }> {
    const user = await this.prisma.user.findUnique({ where: { email: body.email } });

    const hash = user?.passwordHash ?? (await this.getDummyHash());
    const ok = await argon2.verify(hash, body.password);

    if (!user || !ok) throw new InvalidCredentials();

    const pair = await this.issuePair(user);
    return { ...pair, user: toUserDto(pair.user) };
  }

  async me(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Unauthenticated();
    return toUserDto(user);
  }

  async rotate(raw: string): Promise<TokenPair & { user: User }> {
    const token = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(raw) },
      include: { user: true },
    });

    if (!token || token.revokedAt || token.expiresAt < new Date()) {
      throw new InvalidRefreshToken();
    }

    if (token.usedAt) {
      await this.revokeFamily(token.familyId);
      this.logger.warn({ familyId: token.familyId }, "refresh token reuse detected");
      throw new InvalidRefreshToken();
    }

    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id: token.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (count === 0) {
      await this.revokeFamily(token.familyId);
      throw new InvalidRefreshToken();
    }

    const pair = await this.issuePair(token.user, token.familyId);
    return { ...pair, user: toUserDto(pair.user) };
  }

  async logout(raw: string | undefined): Promise<void> {
    if (!raw) return;
    const token = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(raw) } });
    if (token) await this.revokeFamily(token.familyId);
  }

  async logoutAll(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
