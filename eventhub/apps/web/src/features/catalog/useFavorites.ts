import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchFavorites, toggleFavorite } from "../../api/favorites";

export const favoriteKeys = { all: ["favorites"] as const };

export function useFavorites() {
  const queryClient = useQueryClient();

  const { data: favorites = [] } = useQuery({
    queryKey: favoriteKeys.all,
    queryFn: fetchFavorites,
  });

  const mutation = useMutation({
    mutationFn: toggleFavorite,
    onMutate: async (eventId: string) => {
      await queryClient.cancelQueries({ queryKey: favoriteKeys.all });

      const previous = queryClient.getQueryData<string[]>(favoriteKeys.all) ?? [];
      const next = previous.includes(eventId)
        ? previous.filter((id) => id !== eventId)
        : [...previous, eventId];
      queryClient.setQueryData(favoriteKeys.all, next);

      return { previous };
    },
    onError: (_error, _eventId, context) => {
      if (context) queryClient.setQueryData(favoriteKeys.all, context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: favoriteKeys.all });
    },
  });

  return {
    isFavorite: (eventId: string) => favorites.includes(eventId),
    toggle: (eventId: string) => mutation.mutate(eventId),
  };
}
