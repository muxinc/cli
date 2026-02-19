/**
 * Build Data API filter params from CLI options.
 */
export function buildDataFilterParams(options: {
  filters?: string[];
  metricFilters?: string[];
  timeframe?: string[];
}): Record<string, unknown> {
  const params: Record<string, unknown> = {};

  if (options.filters && options.filters.length > 0) {
    params.filters = options.filters;
  }
  if (options.metricFilters && options.metricFilters.length > 0) {
    params.metric_filters = options.metricFilters;
  }
  if (options.timeframe && options.timeframe.length > 0) {
    params.timeframe = options.timeframe;
  }

  return params;
}
