interface EmptyStateProps {
  isFiltered: boolean;
  onReset: () => void;
}

export function EmptyState({ isFiltered, onReset }: EmptyStateProps) {
  return (
    <div className="state-card state-card--empty">
      <p>
        {isFiltered
          ? "Під обрані фільтри подій не знайдено."
          : "Подій ще немає."}
      </p>
      {isFiltered && (
        <button type="button" onClick={onReset}>
          Скинути фільтри
        </button>
      )}
    </div>
  );
}
