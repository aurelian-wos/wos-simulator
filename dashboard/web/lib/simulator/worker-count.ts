export function recommendedBrowserWorkerCount(
  hardwareConcurrency: number | null | undefined,
): number {
  const available = Number.isFinite(hardwareConcurrency)
    ? Math.max(1, Math.floor(hardwareConcurrency as number))
    : 1;
  return Math.max(1, available - 1);
}
