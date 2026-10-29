import { randomBytes, createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { OAuth2Client, type TokenPayload } from "google-auth-library";
import { env } from "../config/env";
import { OAuthNotConfigured, OAuthStateMismatch } from "../common/problem/domain-errors";

export interface OAuthFlow {
  state: string;
  verifier: string;
  nonce: string;
}

function random(): string {
  return randomBytes(32).toString("base64url");
}

@Injectable()
export class GoogleAuthService {
  private readonly client = new OAuth2Client(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI,
  );

  get isConfigured(): boolean {
    return env.GOOGLE_CLIENT_ID !== "" && env.GOOGLE_CLIENT_SECRET !== "";
  }

  buildAuthUrl(flow: OAuthFlow): string {
    if (!this.isConfigured) throw new OAuthNotConfigured();

    const challenge = createHash("sha256").update(flow.verifier).digest("base64url");

    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: env.GOOGLE_REDIRECT_URI,
      response_type: "code",
      scope: "openid email profile",
      state: flow.state,
      nonce: flow.nonce,
      code_challenge: challenge,
      code_challenge_method: "S256",
      prompt: "select_account",
    }).toString();

    return url.toString();
  }

  startFlow(): { url: string; flow: OAuthFlow } {
    const flow: OAuthFlow = { state: random(), verifier: random(), nonce: random() };
    return { url: this.buildAuthUrl(flow), flow };
  }

  async finish(code: string, flow: OAuthFlow): Promise<TokenPayload> {
    if (!this.isConfigured) throw new OAuthNotConfigured();

    const { tokens } = await this.client.getToken({ code, codeVerifier: flow.verifier });

    const ticket = await this.client.verifyIdToken({
      idToken: tokens.id_token ?? "",
      audience: env.GOOGLE_CLIENT_ID,
    });

    const claims = ticket.getPayload();
    if (!claims || claims.nonce !== flow.nonce) throw new OAuthStateMismatch();
    return claims;
  }
}
