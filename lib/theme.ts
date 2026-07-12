export const BUCKET_DOT_COLORS = [
  "#9945FF", "#14F195", "#4DA3FF", "#FF8A3D", "#B8BdC7", "#FF5E57", "#F5C518", "#7C5CFF",
] as const;

export function pickDotColor(index: number): string {
  return BUCKET_DOT_COLORS[index % BUCKET_DOT_COLORS.length];
}
