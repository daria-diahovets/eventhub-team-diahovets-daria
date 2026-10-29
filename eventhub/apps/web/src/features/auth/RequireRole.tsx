import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import type { User } from "@eventhub/contracts";
import { useCurrentUser } from "./useAuth";

interface RequireRoleProps {
  roles: User["role"][];
  children: ReactNode;
}

export function RequireRole({ roles, children }: RequireRoleProps) {
  const { data: user, isPending } = useCurrentUser();

  if (isPending) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}
