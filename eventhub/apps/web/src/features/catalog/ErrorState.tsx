import type { Problem } from "@eventhub/contracts";

interface ErrorStateProps {
  error: unknown;
  onRetry: () => void;
}

function titleOf(error: unknown): string {
  if (typeof error === "object" && error !== null && "title" in error) {
    return String((error as Problem).title);
  }
  return "Не вдалося завантажити дані";
}

export function ErrorState({ error, onRetry }: ErrorStateProps) {
  return (
    <div className="state-card state-card--error" role="alert">
      <p>{titleOf(error)}</p>
      <button type="button" onClick={onRetry}>
        Повторити
      </button>
    </div>
  );
}
