export type PresetTemplateKind = "food" | "day";

type PresetTemplateCounts = {
  foodItemCount: number;
  dayCount: number;
};

export function getInitialPresetTemplateKind({
  foodItemCount,
  dayCount,
}: PresetTemplateCounts): PresetTemplateKind {
  return foodItemCount > 0 || dayCount === 0 ? "food" : "day";
}

export function normalizePresetTemplateKind(
  value?: string | null,
): PresetTemplateKind | null {
  return value === "food" || value === "day" ? value : null;
}

export function resolvePresetModalActiveKind({
  selectedKind,
}: PresetTemplateCounts & {
  selectedKind: PresetTemplateKind;
}): PresetTemplateKind {
  return selectedKind;
}
