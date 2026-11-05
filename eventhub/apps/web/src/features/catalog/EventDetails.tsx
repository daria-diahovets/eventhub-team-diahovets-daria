import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Seat } from "@eventhub/contracts";
import { eventKeys } from "../../api/queryKeys";
import { fetchEvent } from "../../api/queries";
import { titleOf } from "../../api/problem";
import { ErrorState } from "./ErrorState";
import { useFavorites } from "./useFavorites";
import { useCreateOrder, useSeatMap } from "../orders/useOrders";
import { SeatMap } from "../orders/SeatMap";
import { useCurrentUser } from "../auth/useAuth";

function BuySeats({ eventId }: { eventId: string }) {
  const { data: user } = useCurrentUser();
  const navigate = useNavigate();
  const { data: seatMap, isPending, isError, error, refetch } = useSeatMap(eventId);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [takenIds, setTakenIds] = useState<Set<string>>(new Set());
  const createOrder = useCreateOrder(eventId);

  if (isPending) return <p>Завантаження місць…</p>;
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;

  function toggle(seat: Seat) {
    setTakenIds(new Set());
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(seat.id)) next.delete(seat.id);
      else if (next.size < 10) next.add(seat.id);
      return next;
    });
  }

  const totalCents = seatMap.seats
    .filter((s) => selected.has(s.id))
    .reduce((sum, s) => sum + s.price.amount, 0);

  function buy() {
    if (selected.size === 0) return;
    createOrder.mutate(
      { body: { eventId, seatIds: [...selected] }, idempotencyKey: crypto.randomUUID() },
      {
        onSuccess: (order) => navigate(`/orders/${order.id}`),
        onError: (err) => {
          const seatIds = (err as { seatIds?: string[] }).seatIds;
          if (Array.isArray(seatIds)) setTakenIds(new Set(seatIds));
        },
      },
    );
  }

  if (!user) {
    return (
      <p>
        <Link to="/login">Увійдіть</Link>, щоб купити квитки.
      </p>
    );
  }

  return (
    <div className="buy-seats">
      <SeatMap seats={seatMap.seats} selected={selected} takenIds={takenIds} onToggle={toggle} />
      {createOrder.isError && <p role="alert">{titleOf(createOrder.error)}</p>}
      <div className="buy-seats__summary">
        <span>
          Обрано місць: {selected.size} · {(totalCents / 100).toFixed(2)} грн
        </span>
        <button
          type="button"
          disabled={selected.size === 0 || createOrder.isPending}
          onClick={buy}
        >
          {createOrder.isPending ? "Замовляємо…" : "Замовити"}
        </button>
      </div>
    </div>
  );
}

export function EventDetails() {
  const { eventId } = useParams<{ eventId: string }>();
  const { isFavorite, toggle } = useFavorites();

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: eventKeys.detail(eventId ?? ""),
    queryFn: () => fetchEvent(eventId!),
    enabled: Boolean(eventId),
  });

  return (
    <div className="event-details">
      <Link to="/">← До каталогу</Link>

      {isPending ? (
        <p>Завантаження…</p>
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <article>
          <h2>
            {data.title}{" "}
            <button
              type="button"
              className="favorite-toggle"
              aria-pressed={isFavorite(data.id)}
              aria-label={isFavorite(data.id) ? "Прибрати з обраного" : "Додати в обране"}
              onClick={() => toggle(data.id)}
            >
              {isFavorite(data.id) ? "★" : "☆"}
            </button>
          </h2>
          <p>
            {data.venue.name}, {data.venue.city}
          </p>
          <p>{new Date(data.startsAt).toLocaleString("uk-UA")}</p>
          {data.description && <p>{data.description}</p>}
          <p>Від {(data.minPrice.amount / 100).toFixed(2)} грн</p>
          <p>Вільних місць: {data.availableSeats}</p>

          {data.status === "cancelled" ? (
            <p role="alert">Подію скасовано</p>
          ) : (
            <BuySeats eventId={data.id} />
          )}
        </article>
      )}
    </div>
  );
}
