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

export function resolvePresetModalActiveKind({
  selectedKind,
}: PresetTemplateCounts & {
  selectedKind: PresetTemplateKind;
}): PresetTemplateKind {
  return selectedKind;
}
