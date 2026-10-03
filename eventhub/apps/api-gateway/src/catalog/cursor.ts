import { InvalidCursor } from "../common/problem/domain-errors";
import type { CursorPosition } from "./catalog.types";

export function encodeCursor(pos: CursorPosition): string {
  return Buffer.from(`${pos.startsAt}|${pos.id}`, "utf8").toString("base64url");
}

export function decodeCursor(raw: string): CursorPosition {
  let decoded: string;
  try {
    decoded = Buffer.from(raw, "base64url").toString("utf8");
  } catch {
    throw new InvalidCursor(raw);
  }

  const parts = decoded.split("|");
  const startsAt = parts[0];
  const id = parts[1];
  if (parts.length !== 2 || !startsAt || !id) throw new InvalidCursor(raw);

  return { startsAt, id };
}
