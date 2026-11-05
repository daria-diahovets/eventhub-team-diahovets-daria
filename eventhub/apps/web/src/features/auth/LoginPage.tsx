import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { titleOf } from "../../api/problem";
import { useLogin, useRegister } from "./useAuth";

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  "oauth-not-configured": "Вхід через Google поки не налаштовано",
  "oauth-state-mismatch": "Сеанс входу через Google недійсний, спробуйте ще раз",
  "oauth-email-not-verified": "Google не підтвердив пошту цього акаунта",
  "account-exists-with-password": "Ця пошта вже зареєстрована з паролем - увійдіть ним",
};

export function LoginPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const oauthError = searchParams.get("oauthError");

  const login = useLogin();
  const register = useRegister();
  const mutation = mode === "login" ? login : register;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutation.mutate(
      { email, password },
      { onSuccess: () => navigate("/me") },
    );
  }

  return (
    <div className="auth-page">
      {oauthError && (
        <p role="alert">{OAUTH_ERROR_MESSAGES[oauthError] ?? "Вхід через Google не вдався"}</p>
      )}
      <form onSubmit={handleSubmit} className="auth-form">
        <label>
          Пошта
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Пароль
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={mode === "register" ? 10 : undefined}
            required
          />
        </label>
        {mutation.isError && <p role="alert">{titleOf(mutation.error)}</p>}
        <button type="submit" disabled={mutation.isPending}>
          {mode === "login" ? "Увійти" : "Зареєструватися"}
        </button>
        <button
          type="button"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
        >
          {mode === "login" ? "Ще немає акаунта? Реєстрація" : "Вже є акаунт? Вхід"}
        </button>
      </form>
      <a href={`${import.meta.env.VITE_API_URL}/auth/google`}>Увійти через Google</a>
    </div>
  );
}
