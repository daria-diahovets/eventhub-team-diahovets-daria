import { Link, useNavigate, useParams } from "react-router-dom";
import { titleOf } from "../../api/problem";
import { ErrorState } from "../catalog/ErrorState";
import { useCancelOrder, useOrder } from "./useOrders";
import { useCountdown } from "./useCountdown";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Очікує оплати",
  PAID: "Оплачено",
  CANCELLED: "Скасовано",
  EXPIRED: "Протерміновано",
  REFUNDED: "Повернено",
};

export function OrderPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { data, isPending, isError, error, refetch } = useOrder(orderId ?? "");
  const cancel = useCancelOrder(orderId ?? "");

  if (isPending) return <p>Завантаження…</p>;
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;

  return (
    <div className="order-page">
      <Link to="/orders">← До моїх замовлень</Link>
      <h2>{data.eventTitle ?? "Замовлення"}</h2>
      <p>Статус: {STATUS_LABEL[data.status] ?? data.status}</p>
      <ul className="order-page__items">
        {data.items.map((item) => (
          <li key={item.seatId}>
            {item.rowLabel}-{item.number} · {(item.price.amount / 100).toFixed(2)} грн
          </li>
        ))}
      </ul>
      <p>Разом: {(data.total.amount / 100).toFixed(2)} грн</p>

      {data.status === "PENDING" && <Countdown deadlineIso={data.holdExpiresAt} />}

      {cancel.isError && <p role="alert">{titleOf(cancel.error)}</p>}
      {data.status === "PENDING" && (
        <button
          type="button"
          disabled={cancel.isPending}
          onClick={() => cancel.mutate(undefined, { onSuccess: () => void navigate("/orders") })}
        >
          Скасувати
        </button>
      )}
    </div>
  );
}

function Countdown({ deadlineIso }: { deadlineIso: string }) {
  const seconds = useCountdown(deadlineIso);
  if (seconds <= 0) return <p>Час вийшов - оновіть сторінку.</p>;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return (
    <p>
      Місця зарезервовано ще {minutes}:{rest.toString().padStart(2, "0")}
    </p>
  );
}
