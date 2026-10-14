import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useCurrentUser } from "./useAuth";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { data: user, isPending } = useCurrentUser();

  if (isPending) return null;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}
