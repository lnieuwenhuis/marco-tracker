type VisualViewportMetrics = Pick<VisualViewport, "height" | "offsetTop">;

export function getVisualViewportBottomOffset({
  layoutViewportHeight,
  visualViewport,
}: {
  layoutViewportHeight: number;
  visualViewport?: VisualViewportMetrics | null;
}) {
  if (!visualViewport) {
    return 0;
  }

  const { height, offsetTop } = visualViewport;
  if (
    !Number.isFinite(layoutViewportHeight) ||
    !Number.isFinite(height) ||
    !Number.isFinite(offsetTop)
  ) {
    return 0;
  }

  const obscuredHeight = layoutViewportHeight - height - offsetTop;
  return obscuredHeight < 1 ? 0 : Math.round(obscuredHeight);
}
