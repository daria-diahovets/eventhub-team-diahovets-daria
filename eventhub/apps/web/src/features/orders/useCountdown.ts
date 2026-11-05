import { useEffect, useState } from "react";

export function useCountdown(deadlineIso: string): number {
  const deadline = new Date(deadlineIso).getTime();
  const [remainingMs, setRemainingMs] = useState(() => deadline - Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setRemainingMs(deadline - Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [deadline]);

  return Math.max(0, Math.round(remainingMs / 1000));
}
