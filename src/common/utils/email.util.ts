export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

export function normalizeEmailInput(value: unknown): unknown {
  return typeof value === 'string' ? normalizeEmail(value) : value;
}
