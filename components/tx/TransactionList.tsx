import type { Transaction } from "@/lib/model/types";
import { formatEuros } from "@/lib/model/money";

interface Props {
  transactions: Transaction[];
}

export function TransactionList({ transactions }: Props) {
  if (transactions.length === 0) {
    return (
      <div style={{ color: "var(--color-muted)", padding: "2rem", textAlign: "center" }}>
        No transactions yet — connect a bank.
      </div>
    );
  }

  return (
    <div>
      {transactions.map((tx) => {
        const isPositive = tx.amount > 0;
        const amountColor = isPositive ? "var(--color-success)" : "var(--color-muted)";

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
