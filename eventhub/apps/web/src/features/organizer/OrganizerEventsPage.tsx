import { Link } from "react-router-dom";
import { ErrorState } from "../catalog/ErrorState";
import { useOrganizerEvents } from "./useOrganizerEvents";

export function OrganizerEventsPage() {
  const { data, isPending, isError, error, refetch } = useOrganizerEvents();

  return (
    <div>
      <h2>Кабінет організатора</h2>

      {isPending ? (
        <p>Завантаження…</p>
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <ul className="event-list">
          {data.map((e) => (
            <li key={e.id} className="event-card">
              <Link to={`/organizer/events/${e.id}`}>
                <strong>{e.title}</strong> - {e.venue.city},{" "}
                {new Date(e.startsAt).toLocaleString("uk-UA")}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
