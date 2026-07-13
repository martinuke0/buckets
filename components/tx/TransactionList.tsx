import type { Transaction, Bucket } from "@/lib/model/types";
import { formatEuros } from "@/lib/model/money";

interface Props {
  transactions: Transaction[];
  buckets?: Bucket[];
  onRecategorize?: (txnId: string, bucketId: string) => void;
}

export function TransactionList({ transactions, buckets, onRecategorize }: Props) {
  if (transactions.length === 0) {
    return (
      <div style={{ color: "var(--color-muted)", padding: "2rem", textAlign: "center" }}>
        No transactions yet — connect a bank.
      </div>
    );
  }

  const showRecategorize = buckets && onRecategorize;

  return (
    <div>
      {transactions.map((tx) => {
        const isPositive = tx.amount > 0;
        const amountColor = isPositive ? "var(--color-success)" : "var(--color-muted)";
        const isSpend = !tx.isIncome;

        return (
          <div
            key={tx.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "0.75rem 0",
              borderBottom: "1px solid var(--color-border)",
              color: "var(--color-text)",
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>{tx.description}</div>
              <div style={{ fontSize: "0.875rem", color: "var(--color-muted)" }}>
                {tx.bookedAt}
              </div>
              {showRecategorize && isSpend && (
                <select
                  data-testid={`recat-${tx.id}`}
                  value={tx.bucketId || ""}
                  onChange={(e) => onRecategorize(tx.id, e.target.value)}
                  style={{
                    marginTop: "0.5rem",
                    padding: "0.25rem 0.5rem",
                    borderRadius: "0.25rem",
                    border: "1px solid var(--color-border)",
                    background: "var(--color-bg)",
                    color: "var(--color-text)",
                    fontSize: "0.875rem",
                  }}
                >
                  {buckets.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div style={{ fontWeight: 600, color: amountColor }}>
              {formatEuros(tx.amount)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
