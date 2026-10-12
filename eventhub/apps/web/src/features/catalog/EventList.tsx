import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { eventKeys } from "../../api/queryKeys";
import { fetchEvents } from "../../api/queries";
import { useCatalogFilters } from "./useCatalogFilters";
import { CatalogFiltersForm } from "./CatalogFiltersForm";
import { EventListSkeleton } from "./EventListSkeleton";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { useFavorites } from "./useFavorites";

export function EventList() {
  const { filters, setFilter, reset, isEmpty } = useCatalogFilters();
  const { isFavorite, toggle } = useFavorites();

  const {
    data,
    isPending,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: eventKeys.list(filters),
    queryFn: ({ pageParam }) => fetchEvents(filters, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const events = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <>
      <CatalogFiltersForm
        filters={filters}
        isEmpty={isEmpty}
        onChange={setFilter}
        onReset={reset}
      />

      {isPending ? (
        <EventListSkeleton />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : events.length === 0 ? (
        <EmptyState isFiltered={!isEmpty} onReset={reset} />
      ) : (
        <>
          <ul className="event-list">
            {events.map((e) => (
              <li key={e.id} className="event-card">
                <button
                  type="button"
                  className="favorite-toggle"
                  aria-pressed={isFavorite(e.id)}
                  aria-label={isFavorite(e.id) ? "Прибрати з обраного" : "Додати в обране"}
                  onClick={() => toggle(e.id)}
                >
                  {isFavorite(e.id) ? "★" : "☆"}
                </button>
                <Link to={`/events/${e.id}`}>
                  <strong>{e.title}</strong> - {e.venue.city},{" "}
                  {new Date(e.startsAt).toLocaleString("uk-UA")}
                  {" · від "}
                  {(e.minPrice.amount / 100).toFixed(2)} грн
                </Link>
              </li>
            ))}
          </ul>
          {hasNextPage && (
            <button
              type="button"
              disabled={isFetchingNextPage}
              onClick={() => void fetchNextPage()}
            >
              {isFetchingNextPage ? "Завантаження…" : "Показати ще"}
            </button>
          )}
        </>
      )}
    </>
  );
}
