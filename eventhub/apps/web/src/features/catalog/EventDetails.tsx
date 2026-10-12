import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { eventKeys } from "../../api/queryKeys";
import { fetchEvent } from "../../api/queries";
import { ErrorState } from "./ErrorState";
import { useFavorites } from "./useFavorites";

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
        </article>
      )}
    </div>
  );
}
