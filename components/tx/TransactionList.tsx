"use client";
import { useState } from "react";
import Link from "next/link";
import type { Transaction } from "@/lib/model/types";
import { formatEuros } from "@/lib/model/money";

interface Props {
  transactions: Transaction[];
  pageSize?: number;
}

export function TransactionList({ transactions, pageSize = 20 }: Props) {
  const [visible, setVisible] = useState(pageSize);

  if (transactions.length === 0) {
    return (
      <div style={{ color: "var(--color-muted)", padding: "2rem", textAlign: "center" }}>
        No transactions yet — connect a bank.
      </div>
    );
  }

  const shown = transactions.slice(0, visible);

  return (
    <div>
      {shown.map((tx) => {
        const amountColor = tx.amount > 0 ? "var(--color-success)" : "var(--color-muted)";
        return (
          <Link
            key={tx.id}
            href={`/dashboard/tx/${tx.id}`}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "0.75rem 0",
              borderBottom: "1px solid var(--color-border)",
              color: "var(--color-text)",
              textDecoration: "none",
            }}
            className="hover:opacity-80"
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>{tx.description}</div>
              <div style={{ fontSize: "0.875rem", color: "var(--color-muted)" }}>{tx.bookedAt}</div>
            </div>
            <div style={{ fontWeight: 600, color: amountColor }}>{formatEuros(tx.amount)}</div>
          </Link>
        );
      })}

      {visible < transactions.length && (
        <button
          type="button"
          onClick={() => setVisible((v) => v + pageSize)}
          className="w-full rounded-lg py-2 px-3 text-sm font-semibold mt-3"
          style={{ background: "var(--color-card)", border: "1px solid var(--color-border)", color: "var(--color-text)", cursor: "pointer" }}
        >
          Load more
        </button>
      )}
    </div>
  );
}
