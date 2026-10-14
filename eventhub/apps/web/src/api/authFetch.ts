import type { AuthResponse } from "@eventhub/contracts";
import { getAccessToken, setAccessToken } from "./authToken";

const BASE_URL = import.meta.env.VITE_API_URL;

let refreshInFlight: Promise<boolean> | null = null;

export function refreshAccessToken(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const res = await fetch(`${BASE_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        setAccessToken(null);
        return false;
      }
      const data = (await res.json()) as AuthResponse;
      setAccessToken(data.accessToken);
      return true;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

function withToken(input: Request): Request {
  const token = getAccessToken();
  if (!token) return input;
  const headers = new Headers(input.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return new Request(input, { headers });
}

export async function authFetch(input: Request): Promise<Response> {
  const retry = input.clone();
  const response = await fetch(withToken(input));

  const isAuthRoute = new URL(input.url).pathname.includes("/auth/");
  if (response.status !== 401 || isAuthRoute) return response;

  const refreshed = await refreshAccessToken();
  if (!refreshed) return response;

  return fetch(withToken(retry));
}
