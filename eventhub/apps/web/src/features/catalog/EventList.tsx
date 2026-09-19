import { useEffect, useState } from "react";
import type { Event } from "@eventhub/contracts";
import { api } from "../../api/client";

export function EventList() {
  const [events, setEvents] = useState<Event[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    // openapi-fetch не кидає винятків на HTTP-помилках.
    // Замість цього повертає { data } АБО { error } - і TypeScript
    // не дасть звернутись до data, поки ви не перевірили error.
    // Це і є "помилки як частина контракту" з лекції.
    api
      .GET("/events", { params: { query: { limit: 20 } } })
      .then(({ data, error }) => {
        if (error) {
          // error має тип Problem - той самий, що описаний у специфікації
          setProblem(error.title);
          return;
        }
        setEvents(data.items);
      });
  }, []);

  if (problem) return <p role="alert">{problem}</p>;

  return (
    <ul className="event-list">
      {events.map((e) => (
        <li key={e.id}>
          <strong>{e.title}</strong> - {e.venue.city},{" "}
          {new Date(e.startsAt).toLocaleString("uk-UA")}
          {" · від "}
          {/* amount у копійках - ділимо на 100 лише для показу.
              У розрахунках копійки НІКОЛИ не перетворюються
              на дробові гривні. */}
          {(e.minPrice.amount / 100).toFixed(2)} грн
        </li>
      ))}
    </ul>
  );
}
