import { Link } from "react-router-dom";
import { ErrorState } from "../catalog/ErrorState";
import { useMyOrders } from "./useOrders";

export function MyOrdersPage() {
  const { data, isPending, isError, error, refetch } = useMyOrders();

  return (
    <div>
      <h2>Мої замовлення</h2>

      {isPending ? (
        <p>Завантаження…</p>
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : data.length === 0 ? (
        <p>Замовлень ще немає.</p>
      ) : (
        <ul className="event-list">
          {data.map((order) => (
            <li key={order.id} className="event-card">
              <Link to={`/orders/${order.id}`}>
                <strong>{order.eventTitle ?? order.eventId}</strong> · {order.status} ·{" "}
                {(order.total.amount / 100).toFixed(2)} грн
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
