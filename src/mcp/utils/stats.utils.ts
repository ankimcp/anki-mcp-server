/**
 * Statistical utility functions for Anki MCP tools
 */

/**
 * Distribution calculation result
 */
export interface DistributionMetrics {
  /** Mean (average) of the values */
  mean: number;
  /** Median (middle value) of the sorted values */
  median: number;
  /** Minimum value */
  min: number;
  /** Maximum value */
  max: number;
  /** Count of values that contributed to this distribution */
  count: number;
  /** Distribution of values across buckets */
  buckets: Record<string, number>;
}

/**
 * Bucket configuration for distribution calculation
 */
export interface BucketConfig {
  /** Bucket boundary values (must be in ascending order) */
  boundaries: number[];
  /** Optional custom label formatter for bucket ranges */
  formatLabel?: (lower: number | null, upper: number | null) => string;
  /** Optional unit suffix for bucket labels (e.g., "d" for days) */
  unitSuffix?: string;
}

/**
 * Retention calculation result
 */
export interface RetentionMetrics {
  /** Overall retention rate (0.0 - 1.0) */
  overall: number;
  /** Counts by button rating */
  by_rating: {
    /** Number of "Again" presses (failed) */
    again: number;
    /** Number of "Hard" presses */
    hard: number;
    /** Number of "Good" presses */
    good: number;
    /** Number of "Easy" presses */
    easy: number;
  };
}

/**
 * Format a number for bucket labels, preserving decimals where appropriate
 */
function formatNumber(n: number): string {
  // If it's a whole number, return without decimals
  if (Number.isInteger(n)) {
    return n.toString();
  }
  // Otherwise, format with appropriate precision (up to 1 decimal place)
  return n.toFixed(1);
}

/**
 * Create empty buckets structure based on configuration
 */
function createEmptyBuckets(config: BucketConfig): Record<string, number> {
  const buckets: Record<string, number> = {};
  const { boundaries, formatLabel, unitSuffix } = config;

  if (boundaries.length === 0) {
    return buckets;
  }

  // Create bucket labels
  const labels = [
    formatLabel
      ? formatLabel(null, boundaries[0])
      : `<${formatNumber(boundaries[0])}${unitSuffix || ""}`,
  ];

  for (let i = 0; i < boundaries.length - 1; i++) {
    labels.push(
      formatLabel
        ? formatLabel(boundaries[i], boundaries[i + 1])
        : `${formatNumber(boundaries[i])}-${formatNumber(boundaries[i + 1])}${unitSuffix || ""}`,
    );
  }

  labels.push(
    formatLabel
      ? formatLabel(boundaries[boundaries.length - 1], null)
      : `>${formatNumber(boundaries[boundaries.length - 1])}${unitSuffix || ""}`,
  );

  // Initialize all buckets to 0
  labels.forEach((label) => {
    buckets[label] = 0;
  });

  return buckets;
}

/**
 * Compute buckets for distribution
 */
function computeBuckets(
  sortedValues: number[],
  config: BucketConfig,
): Record<string, number> {
  const buckets = createEmptyBuckets(config);
  const { boundaries, formatLabel, unitSuffix } = config;

  if (boundaries.length === 0) {
    return buckets;
  }

  // Count values into buckets
  for (const value of sortedValues) {
    let placed = false;

    // Check first bucket (< first boundary)
    if (value < boundaries[0]) {
      const label = formatLabel
        ? formatLabel(null, boundaries[0])
        : `<${formatNumber(boundaries[0])}${unitSuffix || ""}`;
      buckets[label]++;
      placed = true;
      continue;
    }

    // Check middle buckets
    for (let i = 0; i < boundaries.length - 1; i++) {
      if (value >= boundaries[i] && value < boundaries[i + 1]) {
        const label = formatLabel
          ? formatLabel(boundaries[i], boundaries[i + 1])
          : `${formatNumber(boundaries[i])}-${formatNumber(boundaries[i + 1])}${unitSuffix || ""}`;
        buckets[label]++;
        placed = true;
        break;
      }
    }

    // Check last bucket (>= last boundary)
    if (!placed) {
      const label = formatLabel
        ? formatLabel(boundaries[boundaries.length - 1], null)
        : `>${formatNumber(boundaries[boundaries.length - 1])}${unitSuffix || ""}`;
      buckets[label]++;
    }
  }

  return buckets;
}

/**
 * Compute distribution metrics with configurable buckets
 *
 * @param values - Array of numeric values
 * @param config - Bucket configuration
 * @returns Distribution metrics with mean, median, min, max, count, and buckets
 *
 * @example
 * ```typescript
 * const ease = computeDistribution(
 *   [2.1, 2.5, 3.0, 2.8],
 *   { boundaries: [2.0, 2.5, 3.0] }
 * );
 * // Returns:
 * // {
 * //   mean: 2.6,
 * //   median: 2.65,
 * //   min: 2.1,
 * //   max: 3.0,
 * //   count: 4,
 * //   buckets: { "<2.0": 0, "2.0-2.5": 2, "2.5-3.0": 1, ">3.0": 1 }
 * // }
 * ```
 */
export function computeDistribution(
  values: number[],
  config: BucketConfig,
): DistributionMetrics {
  if (values.length === 0) {
    return {
      mean: 0,
      median: 0,
      min: 0,
      max: 0,
      count: 0,
      buckets: createEmptyBuckets(config),
    };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);

  // Calculate median
  const medianIndex = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[medianIndex - 1] + sorted[medianIndex]) / 2
      : sorted[medianIndex];

  return {
    mean: sum / sorted.length,
    median,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    count: sorted.length,
    buckets: computeBuckets(sorted, config),
  };
}

/**
 * Compute retention metrics from review button presses
 *
 * Button values follow Anki's rating system:
 * - 1 = Again (failed to recall)
 * - 2 = Hard (recalled with difficulty)
 * - 3 = Good (recalled with some effort)
 * - 4 = Easy (recalled instantly)
 *
 * Retention is calculated as: (hard + good + easy) / total
 *
 * @param buttonPresses - Array of button values (1=Again, 2=Hard, 3=Good, 4=Easy)
 * @returns Retention metrics with overall rate (0.0-1.0) and counts by rating
 *
 * @example
 * ```typescript
 * const retention = computeRetention([3, 4, 2, 3, 1, 3]);
 * // Returns:
 * // {
 * //   overall: 0.833,  // 5 remembered / 6 total
 * //   by_rating: { again: 1, hard: 1, good: 3, easy: 1 }
 * // }
 * ```
 */
export function computeRetention(buttonPresses: number[]): RetentionMetrics {
  const counts = { again: 0, hard: 0, good: 0, easy: 0 };

  buttonPresses.forEach((button) => {
    if (button === 1) counts.again++;
    else if (button === 2) counts.hard++;
    else if (button === 3) counts.good++;
    else if (button === 4) counts.easy++;
  });

  const total = counts.again + counts.hard + counts.good + counts.easy;
  const remembered = counts.hard + counts.good + counts.easy;

  return {
    overall: total > 0 ? remembered / total : 0,
    by_rating: counts,
  };
}

/**
 * Calculate study streak (consecutive days from today backwards)
 *
 * Counts backwards from today until the first day with no reviews.
 * A day must have at least 1 review to count towards the streak.
 *
 * @param reviewsByDay - Array of review counts by date (ISO format: YYYY-MM-DD)
 * @returns Number of consecutive days studied (0 if no reviews today)
 *
 * @example
 * ```typescript
 * const streak = calculateStreak([
 *   { date: "2026-01-15", count: 10 },  // today
 *   { date: "2026-01-14", count: 5 },
 *   { date: "2026-01-13", count: 0 },   // gap - streak stops here
 *   { date: "2026-01-12", count: 8 },
 * ]);
 * // Returns: 2 (today + yesterday)
 * ```
 */
export function calculateStreak(
  reviewsByDay: Array<{ date: string; count: number }>,
): number {
  if (reviewsByDay.length === 0) {
    return 0;
  }

  // Sort by date descending (most recent first)
  const sorted = [...reviewsByDay].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < sorted.length; i++) {
    const reviewDate = new Date(sorted[i].date);
    reviewDate.setHours(0, 0, 0, 0);

    // Calculate expected date (today - i days)
    const expectedDate = new Date(today);
    expectedDate.setDate(expectedDate.getDate() - i);

    // Check if this date matches and has reviews
    if (
      reviewDate.getTime() === expectedDate.getTime() &&
      sorted[i].count > 0
    ) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}
