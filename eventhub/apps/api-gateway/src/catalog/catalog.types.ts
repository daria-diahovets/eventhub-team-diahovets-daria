export interface CursorPosition {
  startsAt: string;
  id: string;
}

export interface FindParams {
  city?: string;
  category?: string;
  from?: string;
  to?: string;
  after?: CursorPosition;
  limit: number;
}
