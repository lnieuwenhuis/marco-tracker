export function normalizeFoodSearchQuery(query: string) {
  return query.trim();
}

export function hasCurrentFoodSearchResults(resultQuery: string, currentQuery: string) {
  const normalizedCurrentQuery = normalizeFoodSearchQuery(currentQuery);
  return Boolean(normalizedCurrentQuery) && resultQuery === normalizedCurrentQuery;
}
