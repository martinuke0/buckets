export type Cents = number;

const fmt = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
  currencyDisplay: "narrowSymbol",
});

export function formatEuros(cents: Cents): string {
  return fmt.format(cents / 100);
}

export function toCents(euros: number): Cents {
  return Math.round(euros * 100);
}
