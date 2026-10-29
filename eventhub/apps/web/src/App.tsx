import { Link, Route, Routes, useNavigate } from "react-router-dom";
import { EventList } from "./features/catalog/EventList";
import { EventDetails } from "./features/catalog/EventDetails";
import { LoginPage } from "./features/auth/LoginPage";
import { MePage } from "./features/auth/MePage";
import { RequireAuth } from "./features/auth/RequireAuth";
import { RequireRole } from "./features/auth/RequireRole";
import { useCurrentUser, useLogout } from "./features/auth/useAuth";
import { OrganizerEventsPage } from "./features/organizer/OrganizerEventsPage";
import { OrganizerEventEditPage } from "./features/organizer/OrganizerEventEditPage";

function AuthStatus() {
  const { data: user } = useCurrentUser();
  const logout = useLogout();
  const navigate = useNavigate();

  if (user) {
    return (
      <div className="auth-status">
        {(user.role === "organizer" || user.role === "admin") && (
          <Link to="/organizer">Кабінет організатора</Link>
        )}
        <Link to="/me">{user.email}</Link>
        <button
          type="button"
          onClick={() => logout.mutate(undefined, { onSuccess: () => navigate("/login") })}
        >
          Вийти
        </button>
      </div>
    );
  }
  return (
    <div className="auth-status">
      <Link to="/login">Увійти</Link>
    </div>
  );
}

export function App() {
  return (
    <main className="page">
      <header className="page__header">
        <h1>EventHub</h1>
        <p className="page__subtitle">Квитки на події</p>
        <AuthStatus />
      </header>

      <Routes>
        <Route path="/" element={<EventList />} />
        <Route path="/events/:eventId" element={<EventDetails />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/me"
          element={
            <RequireAuth>
              <MePage />
            </RequireAuth>
          }
        />
        <Route
          path="/organizer"
          element={
            <RequireRole roles={["organizer", "admin"]}>
              <OrganizerEventsPage />
            </RequireRole>
          }
        />
        <Route
          path="/organizer/events/:eventId"
          element={
            <RequireRole roles={["organizer", "admin"]}>
              <OrganizerEventEditPage />
            </RequireRole>
          }
        />
      </Routes>
    </main>
  );
}
