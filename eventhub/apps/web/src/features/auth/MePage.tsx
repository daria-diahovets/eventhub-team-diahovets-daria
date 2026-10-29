import { useNavigate } from "react-router-dom";
import { useCurrentUser, useLogout, useLogoutAll } from "./useAuth";

export function MePage() {
  const { data: user } = useCurrentUser();
  const logout = useLogout();
  const logoutAll = useLogoutAll();
  const navigate = useNavigate();

  if (!user) return null;

  return (
    <div className="auth-page">
      <h2>Кабінет</h2>
      <p>{user.email}</p>
      <p>Роль: {user.role}</p>
      <p>Зареєстровано: {new Date(user.createdAt).toLocaleString("uk-UA")}</p>
      <button
        type="button"
        onClick={() => logout.mutate(undefined, { onSuccess: () => navigate("/login") })}
      >
        Вийти
      </button>
      <button
        type="button"
        onClick={() => logoutAll.mutate(undefined, { onSuccess: () => navigate("/login") })}
      >
        Вийти з усіх пристроїв
      </button>
    </div>
  );
}
