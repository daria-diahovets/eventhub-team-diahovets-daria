import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import type { AuthResponse, User } from "@eventhub/contracts";
import { env } from "../config/env";
import { InvalidRefreshToken, OAuthStateMismatch } from "../common/problem/domain-errors";
import { toProblem } from "../common/problem/problem";
import { AuthService } from "./auth.service";
import { LoginBodyDto, RegisterBodyDto } from "./auth.dto";
import { GoogleAuthService, type OAuthFlow } from "./google.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { CurrentUser } from "./current-user.decorator";
import type { AuthUser } from "./auth.types";

const OAUTH_FLOW_COOKIE = "oauthFlow";

function setRefreshCookie(res: Response, token: string): void {
  res.cookie("refreshToken", token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/auth",
    maxAge: env.REFRESH_TTL_DAYS * 86_400_000,
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie("refreshToken", { path: "/auth" });
}

function setOAuthFlowCookie(res: Response, flow: OAuthFlow): void {
  res.cookie(OAUTH_FLOW_COOKIE, JSON.stringify(flow), {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    // Lax, а не Strict: повернення з accounts.google.com - це перехід,
    // ініційований іншим сайтом, і Strict-cookie в такому переході браузер
    // не надсилає (методичка ЛР6, 8.4).
    sameSite: "lax",
    path: "/auth",
    maxAge: 10 * 60 * 1000,
  });
}

function readOAuthFlowCookie(req: Request): OAuthFlow | undefined {
  const raw = req.cookies?.[OAUTH_FLOW_COOKIE] as string | undefined;
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as OAuthFlow;
  } catch {
    return undefined;
  }
}

function clearOAuthFlowCookie(res: Response): void {
  res.clearCookie(OAUTH_FLOW_COOKIE, { path: "/auth" });
}

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly google: GoogleAuthService,
  ) {}

  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() body: RegisterBodyDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const { accessToken, refreshToken, user } = await this.auth.register(body);
    setRefreshCookie(res, refreshToken);
    return { accessToken, user };
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: LoginBodyDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const { accessToken, refreshToken, user } = await this.auth.login(body);
    setRefreshCookie(res, refreshToken);
    return { accessToken, user };
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const raw = req.cookies?.refreshToken as string | undefined;
    if (!raw) throw new InvalidRefreshToken();

    const { accessToken, refreshToken, user } = await this.auth.rotate(raw);
    setRefreshCookie(res, refreshToken);
    return { accessToken, user };
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(req.cookies?.refreshToken as string | undefined);
    clearRefreshCookie(res);
  }

  @Post("logout-all")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async logoutAll(
    @CurrentUser() current: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logoutAll(current.id);
    clearRefreshCookie(res);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() current: AuthUser): Promise<User> {
    return this.auth.me(current.id);
  }

  @Get("google")
  googleLogin(@Res() res: Response): void {
    try {
      const { url, flow } = this.google.startFlow();
      setOAuthFlowCookie(res, flow);
      res.redirect(url);
    } catch (err) {
      const code = toProblem(err).type.replace("/errors/", "");
      res.redirect(`/login?oauthError=${encodeURIComponent(code)}`);
    }
  }

  @Get("google/callback")
  async googleCallback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Query("error") error: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const flow = readOAuthFlowCookie(req);
    clearOAuthFlowCookie(res); // одноразово

    try {
      if (error) throw new OAuthStateMismatch(); // натиснули «Скасувати»
      if (!flow || !code || state !== flow.state) throw new OAuthStateMismatch();

      const claims = await this.google.finish(code, flow);
      const { refreshToken } = await this.auth.loginWithGoogle(claims);

      setRefreshCookie(res, refreshToken);
      res.redirect("/me");
    } catch (err) {
      const errorCode = toProblem(err).type.replace("/errors/", "");
      res.redirect(`/login?oauthError=${encodeURIComponent(errorCode)}`);
    }
  }
}
