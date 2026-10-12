export function EventListSkeleton() {
  return (
    <ul className="event-list" aria-hidden="true">
      {Array.from({ length: 3 }, (_, i) => (
        <li key={i} className="event-card event-card--skeleton">
          <div className="skeleton-line skeleton-line--title" />
          <div className="skeleton-line skeleton-line--meta" />
          <div className="skeleton-line skeleton-line--price" />
        </li>
      ))}
    </ul>
  );
}
