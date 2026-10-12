import { Route, Routes } from "react-router-dom";
import { EventList } from "./features/catalog/EventList";
import { EventDetails } from "./features/catalog/EventDetails";

export function App() {
  return (
    <main className="page">
      <header className="page__header">
        <h1>EventHub</h1>
        <p className="page__subtitle">Квитки на події</p>
      </header>

      <Routes>
        <Route path="/" element={<EventList />} />
        <Route path="/events/:eventId" element={<EventDetails />} />
      </Routes>
    </main>
  );
}
