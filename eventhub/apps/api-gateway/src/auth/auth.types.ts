export interface AuthUser {
  id: string;
  role: "user" | "organizer" | "admin";
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}
