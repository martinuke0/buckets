export type Breadcrumb = {
  action: string;
  at: string;
  meta?: Record<string, string | number | boolean>;
};

const MAX = 30;
let breadcrumbs: Breadcrumb[] = [];

export function logAction(
  action: string,
  meta?: Breadcrumb["meta"]
): void {
  const breadcrumb: Breadcrumb = {
    action,
    at: new Date().toISOString(),
    ...(meta && { meta }),
  };

  breadcrumbs.push(breadcrumb);

  // Cap at MAX, dropping the oldest
  if (breadcrumbs.length > MAX) {
    breadcrumbs = breadcrumbs.slice(-MAX);
  }
}

export function getBreadcrumbs(): Breadcrumb[] {
  // Return a copy so caller can't mutate internal state
  return breadcrumbs.slice();
}

export function clearBreadcrumbs(): void {
  breadcrumbs = [];
}
