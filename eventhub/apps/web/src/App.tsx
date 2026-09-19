/**
 * Заготовка фронтенду EventHub.
 *
 * Лабораторна № 1, крок 5: замінити блок-заглушку на <EventList />
 * з features/catalog/EventList.tsx — компонент, який отримує дані
 * через типізований клієнт, згенерований зі специфікації OpenAPI.
 */
export function App() {
  return (
    <main className="page">
      <header className="page__header">
        <h1>EventHub</h1>
        <p className="page__subtitle">Квитки на події</p>
      </header>

      <section className="placeholder">
        <h2>Каталог поки що порожній</h2>
        <p>
          Тут з&apos;явиться список подій із мок-сервера. Дивіться крок 5
          лабораторної роботи № 1.
        </p>
      </section>
    </main>
  );
}
