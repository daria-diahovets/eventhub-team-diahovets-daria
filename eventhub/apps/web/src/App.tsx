import { EventList } from "./features/catalog/EventList";

export function App() {
  return (
    <main className="page">
      <header className="page__header">
        <h1>EventHub</h1>
        <p className="page__subtitle">Квитки на події</p>
      </header>

      <EventList />
    </main>
  );
}
