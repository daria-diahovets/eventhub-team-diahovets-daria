import { useEffect, useState } from "react";
import type { CatalogFilters } from "./useCatalogFilters";

interface CatalogFiltersFormProps {
  filters: CatalogFilters;
  isEmpty: boolean;
  onChange: (key: keyof CatalogFilters, value: string | undefined) => void;
  onReset: () => void;
}

const SEARCH_DEBOUNCE_MS = 400;

export function CatalogFiltersForm({
  filters,
  isEmpty,
  onChange,
  onReset,
}: CatalogFiltersFormProps) {
  // Затримка стоїть тут, перед оновленням filters.q (а отже й queryKey),
  // а не всередині queryFn: TanStack Query вирішує, відправляти запит чи
  // ні, одразу як побачить новий queryKey. Якщо затримати лише queryFn,
  // запит однаково піде негайно на кожен символ - відтягнеться тільки
  // момент отримання відповіді, а не сам факт відправки.
  const [searchInput, setSearchInput] = useState(filters.q ?? "");

  useEffect(() => {
    setSearchInput(filters.q ?? "");
  }, [filters.q]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      onChange("q", searchInput || undefined);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [searchInput, onChange]);

  return (
    <form className="catalog-filters" onSubmit={(e) => e.preventDefault()}>
      <label>
        Пошук за назвою
        <input
          type="search"
          value={searchInput}
          placeholder="Наприклад, джаз"
          onChange={(e) => setSearchInput(e.target.value)}
        />
      </label>
      <label>
        Місто
        <input
          type="text"
          value={filters.city ?? ""}
          placeholder="Наприклад, Львів"
          onChange={(e) => onChange("city", e.target.value || undefined)}
        />
      </label>
      <label>
        Не раніше
        <input
          type="date"
          value={filters.from ?? ""}
          onChange={(e) => onChange("from", e.target.value || undefined)}
        />
      </label>
      {!isEmpty && (
        <button type="button" onClick={onReset}>
          Скинути фільтри
        </button>
      )}
    </form>
  );
}
