import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { eventKeys } from "../../api/queryKeys";
import { fetchEvent } from "../../api/queries";
import { titleOf } from "../../api/problem";
import { useUpdateOrganizerEvent } from "./useOrganizerEvents";

export function OrganizerEventEditPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();

  const { data, isPending } = useQuery({
    queryKey: eventKeys.detail(eventId ?? ""),
    queryFn: () => fetchEvent(eventId!),
    enabled: Boolean(eventId),
  });

  const update = useUpdateOrganizerEvent(eventId ?? "");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const title = new FormData(e.currentTarget).get("title");
    update.mutate(
      { title: String(title ?? "").trim() },
      { onSuccess: () => navigate("/organizer") },
    );
  }

  if (isPending) return <p>Завантаження…</p>;
  if (!data) return null;

  return (
    <div className="auth-page">
      <Link to="/organizer">← До кабінету</Link>
      <h2>Редагувати подію</h2>
      <form onSubmit={handleSubmit} className="auth-form">
        <label>
          Назва
          <input name="title" defaultValue={data.title} required />
        </label>
        {update.isError && <p role="alert">{titleOf(update.error)}</p>}
        <button type="submit" disabled={update.isPending}>
          Зберегти
        </button>
      </form>
    </div>
  );
}
