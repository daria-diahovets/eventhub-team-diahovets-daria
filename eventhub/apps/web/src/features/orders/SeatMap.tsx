import type { Seat } from "@eventhub/contracts";

interface SeatMapProps {
  seats: Seat[];
  selected: Set<string>;
  takenIds?: Set<string>;
  onToggle: (seat: Seat) => void;
}

export function SeatMap({ seats, selected, takenIds, onToggle }: SeatMapProps) {
  const rows = new Map<string, Seat[]>();
  for (const seat of seats) {
    const row = rows.get(seat.rowLabel) ?? [];
    row.push(seat);
    rows.set(seat.rowLabel, row);
  }

  return (
    <div className="seat-map">
      {[...rows.entries()].map(([rowLabel, rowSeats]) => (
        <div key={rowLabel} className="seat-map__row">
          <span className="seat-map__row-label">{rowLabel}</span>
          {rowSeats
            .sort((a, b) => a.number - b.number)
            .map((seat) => {
              const isSelected = selected.has(seat.id);
              const isTaken = takenIds?.has(seat.id) ?? false;
              return (
                <button
                  key={seat.id}
                  type="button"
                  className={[
                    "seat",
                    !seat.available && "seat--taken",
                    isSelected && "seat--selected",
                    isTaken && "seat--highlight",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  disabled={!seat.available && !isSelected}
                  aria-pressed={isSelected}
                  aria-label={`Місце ${rowLabel}-${seat.number}`}
                  onClick={() => onToggle(seat)}
                >
                  {seat.number}
                </button>
              );
            })}
        </div>
      ))}
    </div>
  );
}
