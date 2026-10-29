import { titleOf } from "../../api/problem";

interface ErrorStateProps {
  error: unknown;
  onRetry: () => void;
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
