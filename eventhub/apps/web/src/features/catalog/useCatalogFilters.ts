import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

export interface CatalogFilters {
  city?: string;
  from?: string;
  q?: string;
}

type FilterKey = keyof CatalogFilters;

export function useCatalogFilters() {
  const [params, setParams] = useSearchParams();

  const filters: CatalogFilters = useMemo(
    () => ({
      city: params.get("city") ?? undefined,
      from: params.get("from") ?? undefined,
      q: params.get("q") ?? undefined,
    }),
    [params],
  );

  const setFilter = useCallback(
    (key: FilterKey, value: string | undefined) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      });
    },
    [setParams],
  );

  const reset = useCallback(() => {
    setParams(new URLSearchParams());
  }, [setParams]);

  const isEmpty = !filters.city && !filters.from && !filters.q;

  return { filters, setFilter, reset, isEmpty };
}
