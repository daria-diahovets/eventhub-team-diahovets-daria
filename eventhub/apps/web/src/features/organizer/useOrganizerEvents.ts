import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UpdateEventRequest } from "@eventhub/contracts";
import { eventKeys, organizerKeys } from "../../api/queryKeys";
import { fetchOrganizerEvents, updateOrganizerEvent } from "../../api/organizerQueries";

export function useOrganizerEvents() {
  return useQuery({
    queryKey: organizerKeys.all,
    queryFn: fetchOrganizerEvents,
  });
}

export function useUpdateOrganizerEvent(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateEventRequest) => updateOrganizerEvent(eventId, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: eventKeys.all });
      void qc.invalidateQueries({ queryKey: organizerKeys.all });
    },
  });
}
