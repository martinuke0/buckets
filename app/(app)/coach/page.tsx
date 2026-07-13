import { Card, SectionLabel } from "@/components/ui/primitives";

export default function Page() {
  return (
    <div style={{ padding: "1rem" }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <SectionLabel>Your AI Coach</SectionLabel>
      </div>
      <Card style={{ textAlign: "center", padding: "3rem 2rem" }}>
        <div style={{ fontSize: "1.25rem", fontWeight: "600", marginBottom: "0.75rem" }}>
          Coming Soon
        </div>
        <div style={{ color: "var(--color-muted)", fontSize: "0.875rem" }}>
          Your personal AI finance coach will help you make smarter spending decisions and reach your goals faster.
        </div>
      </Card>
    </div>
  );
}
