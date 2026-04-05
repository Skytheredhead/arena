export const percentile = (values: number[], p: number): number => {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(
    0,
    Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))
  );
  return sorted[index] ?? 0;
};

export const getLatencyTailMs = (
  values: number[],
  fallback: number,
  tailPercentile = 0.95
): number => {
  if (values.length === 0) {
    return fallback;
  }

  return percentile(values, tailPercentile);
};
