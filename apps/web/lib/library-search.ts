export function normalizeLibraryQuery(query: string) {
  return query.trim().toLowerCase();
}

export function filterLibraryItemsByQuery<T>(
  items: T[],
  query: string,
  getLabel: (item: T) => string,
) {
  const normalizedQuery = normalizeLibraryQuery(query);
  return normalizedQuery
    ? items.filter((item) => getLabel(item).toLowerCase().includes(normalizedQuery))
    : items;
}
