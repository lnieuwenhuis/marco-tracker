"use client";

import type { DailySummary, FoodPreset, MacroGoals, MealEntryRecord, MealEntryStatus, MealGroup, QuickAddCandidate, RecipeRecord } from "@macro-tracker/db";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useMemo, useRef, useState, useTransition } from "react";

import { createMealGroupAction, deleteMealGroupAction, deletePresetAction, deleteMealEntryAction, markMealEntryStatusAction, savePresetAction, saveMealEntryAction, touchPresetAction, updateMealGroupAction, updatePresetAction } from "@/lib/actions";
import {
  getDailyMutationCacheKeys,
  getPresetMutationCacheKeys,
} from "@/lib/app-warmup";
import type { ComposeAction } from "@/lib/compose";
import { computeLiveTotals, computeRemaining, rankCandidates } from "@/lib/quick-add";
import { prepareNavigationMotion } from "@/lib/navigation-motion";
import type { OpenFoodFactsProduct } from "@/lib/openfoodfacts";
import { getLocalDateString } from "@/lib/startup-date";
import type { UiMode } from "@/lib/ui-mode";

import { AddFoodButton } from "./add-food-button";
import { AiFoodPhotoModal } from "./ai-food-photo-modal";
import { invalidateAppDataCache } from "./app-data-cache";
import { AppShell } from "./app-shell";
import { BarcodeResult } from "./barcode-result";
import { BarcodeScanner } from "./barcode-scanner";
import { ExperimentalAppShell } from "./experimental-app-shell";
import { FoodSearchModal } from "./food-search-modal";
import { MacroBarGroup } from "./macro-bar";
import { MealCard, type MealDraft } from "./meal-card";
import { PresetModal } from "./preset-modal";
import { QuickAddRail } from "./quick-add-rail";
import { RecipePickerModal } from "./recipe-picker-modal";

type DashboardShellProps = {
  userEmail: string;
  canAccessAdmin: boolean;
  selectedDate: string;
  dailySummary: DailySummary;
  goals: MacroGoals;
  presets: FoodPreset[];
  recipes: RecipeRecord[];
  recentCandidates: QuickAddCandidate[];
  uiMode?: UiMode;
  initialComposeAction?: ComposeAction | null;
};

type ErrorState = Record<string, string | null>;
type PresetMutationState =
  | { type: "save" }
  | { type: "update" | "delete"; presetId: string };

function mealToDraft(meal: MealEntryRecord): MealDraft {
  return {
    clientId: meal.id,
    id: meal.id,
    mealGroupId: meal.mealGroupId,
    status: meal.status,
    productId: meal.productId,
    label: meal.label,
    quantity: String(meal.quantity),
    unit: meal.unit,
    servingMultiplier: String(meal.servingMultiplier),
    // Use String() unconditionally: a falsy check like `meal.proteinG ? ...`
    // incorrectly converts a legitimate 0 value into an empty string.
    proteinG: String(meal.proteinG),
    carbsG: String(meal.carbsG),
    fatG: String(meal.fatG),
    caloriesKcal: String(meal.caloriesKcal),
    sortOrder: meal.sortOrder,
  };
}

function createEmptyDraft(sortOrder: number, status: MealEntryStatus): MealDraft {
  return {
    clientId: `draft-${crypto.randomUUID()}`,
    status,
    label: "",
    quantity: "1",
    unit: "serving",
    servingMultiplier: "1",
    proteinG: "",
    carbsG: "",
    fatG: "",
    caloriesKcal: "",
    sortOrder,
  };
}

function createDraftFromPreset(preset: FoodPreset, sortOrder: number, status: MealEntryStatus): MealDraft {
  return {
    clientId: `draft-${crypto.randomUUID()}`,
    status,
    label: preset.label,
    quantity: "1",
    unit: "serving",
    servingMultiplier: "1",
    proteinG: String(preset.proteinG),
    carbsG: String(preset.carbsG),
    fatG: String(preset.fatG),
    caloriesKcal: String(preset.caloriesKcal),
    sortOrder,
  };
}

function createDraftFromCandidate(
  candidate: QuickAddCandidate,
  sortOrder: number,
  status: MealEntryStatus,
): MealDraft {
  return {
    clientId: `draft-${crypto.randomUUID()}`,
    status,
    label: candidate.label,
    quantity: "1",
    unit: "serving",
    servingMultiplier: "1",
    proteinG: String(candidate.proteinG),
    carbsG: String(candidate.carbsG),
    fatG: String(candidate.fatG),
    caloriesKcal: String(candidate.caloriesKcal),
    sortOrder,
  };
}

function toNumber(value: string, fallback = 0) {
  if (!value.trim()) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function DashboardShell({
  userEmail,
  canAccessAdmin,
  selectedDate,
  dailySummary,
  goals,
  presets: initialPresets,
  recipes,
  recentCandidates,
  uiMode = "experimental",
  initialComposeAction = null,
}: DashboardShellProps) {
  const router = useRouter();
  const composeHandledRef = useRef<string | null>(null);
  const [drafts, setDrafts] = useState<MealDraft[]>(() =>
    dailySummary.meals.map(mealToDraft),
  );
  const [savedMeals, setSavedMeals] = useState<MealEntryRecord[]>(
    dailySummary.meals,
  );
  const [errors, setErrors] = useState<ErrorState>({});
  const [activeMutation, setActiveMutation] = useState<string | null>(null);
  const [isPending, beginMutation] = useTransition();

  const [showPresetsModal, setShowPresetsModal] = useState(false);
  const [localPresets, setLocalPresets] = useState<FoodPreset[]>(initialPresets);
  const [presetMutation, setPresetMutation] = useState<PresetMutationState | null>(null);
  const [presetError, setPresetError] = useState<string | null>(null);
  const [localMealGroups, setLocalMealGroups] = useState<MealGroup[]>(
    dailySummary.mealGroups,
  );
  const [showGroupManager, setShowGroupManager] = useState(false);
  const [newGroupLabel, setNewGroupLabel] = useState("");
  const [groupError, setGroupError] = useState<string | null>(null);
  const [groupMutationId, setGroupMutationId] = useState<string | null>(null);

  // Recipe picker state
  const [showRecipePickerModal, setShowRecipePickerModal] = useState(false);

  // Food search state
  const [showSearchModal, setShowSearchModal] = useState(false);

  // AI photo estimate state
  const [showPhotoModal, setShowPhotoModal] = useState(false);

  useEffect(() => {
    setSavedMeals(dailySummary.meals);
  }, [dailySummary.meals]);

  // Tracks cards that were recently copied to today so the button can give
  // brief visual confirmation before returning to its normal state.
  const [copiedCardIds, setCopiedCardIds] = useState<Set<string>>(new Set());

  // Barcode scanner state
  const [showScanner, setShowScanner] = useState(false);
  const [scanResult, setScanResult] = useState<OpenFoodFactsProduct | null>(null);
  const [notFoundBarcode, setNotFoundBarcode] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Live totals + remaining (react to unsaved drafts immediately)
  // ---------------------------------------------------------------------------

  const liveTotals = useMemo(() => computeLiveTotals(drafts), [drafts]);
  const remaining = useMemo(
    () => computeRemaining(liveTotals, goals),
    [liveTotals, goals],
  );
  const todayStr = useMemo(() => getLocalDateString(), []);
  const defaultEntryStatus: MealEntryStatus =
    selectedDate > todayStr ? "planned" : "eaten";

  // ---------------------------------------------------------------------------
  // Quick-add rails
  // ---------------------------------------------------------------------------

  // Build a unified candidate pool: preset candidates + recent history candidates
  const allCandidates = useMemo<QuickAddCandidate[]>(() => {
    const presetCandidates: QuickAddCandidate[] = localPresets.map((p) => ({
      label: p.label,
      proteinG: p.proteinG,
      carbsG: p.carbsG,
      fatG: p.fatG,
      caloriesKcal: p.caloriesKcal,
      source: "preset" as const,
      presetId: p.id,
    }));
    return [...presetCandidates, ...recentCandidates];
  }, [localPresets, recentCandidates]);

  // Single unified quick-add list: ranked by routine signals, not macro fit.
  const quickAddItems = useMemo(
    () =>
      rankCandidates(allCandidates, remaining, {
        limit: 10,
        currentHourUtc: new Date().getUTCHours(),
        referenceDate: todayStr,
      }),
    [allCandidates, remaining, todayStr],
  );

  // ---------------------------------------------------------------------------
  // Draft helpers
  // ---------------------------------------------------------------------------

  function nextSortOrder() {
    return drafts.reduce((highest, draft) => Math.max(highest, draft.sortOrder), -1) + 1;
  }

  function updateDraft(
    clientId: string,
    field: keyof Omit<MealDraft, "clientId" | "id" | "sortOrder">,
    value: string,
  ) {
    setDrafts((currentDrafts) =>
      currentDrafts.map((draft) =>
        draft.clientId === clientId
          ? {
              ...draft,
              [field]: field === "mealGroupId" && value === "" ? null : value,
            }
          : draft,
      ),
    );
    setErrors((currentErrors) => ({
      ...currentErrors,
      [clientId]: null,
    }));
  }

  function isOnlyGroupDirty(draft: MealDraft, nextGroupId: string | null) {
    if (!draft.id) return false;
    const saved = savedMeals.find((meal) => meal.id === draft.id);
    if (!saved) return false;

    const sameNumber = (draftValue: string, savedValue: number) =>
      Math.abs(toNumber(draftValue) - savedValue) < 0.01;

    return (
      (saved.mealGroupId ?? null) !== nextGroupId &&
      draft.label.trim() === saved.label &&
      draft.status === saved.status &&
      (draft.productId ?? null) === (saved.productId ?? null) &&
      sameNumber(draft.quantity, saved.quantity) &&
      draft.unit === saved.unit &&
      sameNumber(draft.servingMultiplier, saved.servingMultiplier) &&
      sameNumber(draft.proteinG, saved.proteinG) &&
      sameNumber(draft.carbsG, saved.carbsG) &&
      sameNumber(draft.fatG, saved.fatG) &&
      Math.round(toNumber(draft.caloriesKcal)) === saved.caloriesKcal &&
      draft.sortOrder === saved.sortOrder
    );
  }

  function handleGroupChange(clientId: string, mealGroupId: string | null) {
    const draft = drafts.find((entry) => entry.clientId === clientId);
    if (!draft) return;

    setDrafts((currentDrafts) =>
      currentDrafts.map((item) =>
        item.clientId === clientId ? { ...item, mealGroupId } : item,
      ),
    );
    setErrors((currentErrors) => ({
      ...currentErrors,
      [clientId]: null,
    }));

    if (!draft.id || !isOnlyGroupDirty(draft, mealGroupId)) {
      return;
    }

    setActiveMutation(clientId);
    beginMutation(async () => {
      const result = await saveMealEntryAction({
        id: draft.id,
        date: selectedDate,
        mealGroupId,
        status: draft.status,
        productId: draft.productId ?? null,
        label: draft.label,
        sortOrder: draft.sortOrder,
        quantity: toNumber(draft.quantity, 1),
        unit: draft.unit,
        servingMultiplier: toNumber(draft.servingMultiplier, 1),
        proteinG: toNumber(draft.proteinG),
        carbsG: toNumber(draft.carbsG),
        fatG: toNumber(draft.fatG),
        caloriesKcal: Math.round(toNumber(draft.caloriesKcal)),
      });

      if (!result.ok) {
        setErrors((currentErrors) => ({
          ...currentErrors,
          [clientId]: result.error ?? "Unable to update group.",
        }));
        setActiveMutation(null);
        return;
      }

      invalidateAppDataCache(getDailyMutationCacheKeys(selectedDate));
      router.refresh();
    });
  }

  function addCustomDraft() {
    setDrafts((currentDrafts) => [...currentDrafts, createEmptyDraft(nextSortOrder(), defaultEntryStatus)]);
  }

  function addDraftFromPreset(preset: FoodPreset) {
    setDrafts((currentDrafts) => [
      ...currentDrafts,
      createDraftFromPreset(preset, nextSortOrder(), defaultEntryStatus),
    ]);
    setPresetError(null);
    // Fire-and-forget: mark this preset as most-recently-used so the next time
    // the modal opens it floats to the top of the list. We don't block the UI
    // on the result or surface errors — sort order is best-effort.
    void touchPresetAction({ id: preset.id });
    setShowPresetsModal(false);
  }

  function addDraftFromRecipe(recipe: RecipeRecord) {
    const macros = recipe.perPortionMacros;
    setDrafts((currentDrafts) => [
      ...currentDrafts,
      {
        clientId: `draft-${crypto.randomUUID()}`,
        status: defaultEntryStatus,
        label: `${recipe.label} (1 portion)`,
        quantity: "1",
        unit: "serving",
        servingMultiplier: "1",
        proteinG: String(macros.proteinG),
        carbsG: String(macros.carbsG),
        fatG: String(macros.fatG),
        caloriesKcal: String(macros.caloriesKcal),
        sortOrder: nextSortOrder(),
      },
    ]);
    setShowRecipePickerModal(false);
  }

  /** Source-agnostic: tap any quick-add card to open a prefilled draft (no auto-save). */
  function addDraftFromCandidate(candidate: QuickAddCandidate) {
    setDrafts((currentDrafts) => [
      ...currentDrafts,
      createDraftFromCandidate(candidate, nextSortOrder(), defaultEntryStatus),
    ]);

    // If this was a preset candidate, touch it so its sort order floats up.
    if (candidate.source === "preset" && candidate.presetId) {
      void touchPresetAction({ id: candidate.presetId });
    }
  }

  function removeLocalDraft(clientId: string) {
    setDrafts((currentDrafts) =>
      currentDrafts.filter((draft) => draft.clientId !== clientId),
    );
    setErrors((currentErrors) => {
      const nextErrors = { ...currentErrors };
      delete nextErrors[clientId];
      return nextErrors;
    });
  }

  function discardDraftChanges(clientId: string) {
    const draft = drafts.find((entry) => entry.clientId === clientId);
    if (!draft?.id) {
      return;
    }

    const saved = savedMeals.find((meal) => meal.id === draft.id);
    if (!saved) {
      return;
    }

    const knownGroupIds = new Set(localMealGroups.map((group) => group.id));
    const restored = mealToDraft(saved);
    if (restored.mealGroupId && !knownGroupIds.has(restored.mealGroupId)) {
      restored.mealGroupId = null;
    }

    setDrafts((currentDrafts) =>
      currentDrafts.map((currentDraft) =>
        currentDraft.clientId === clientId ? restored : currentDraft,
      ),
    );
    setErrors((currentErrors) => ({
      ...currentErrors,
      [clientId]: null,
    }));
  }

  function handleSave(clientId: string) {
    const draft = drafts.find((entry) => entry.clientId === clientId);
    if (!draft) {
      return;
    }

    setActiveMutation(clientId);
    beginMutation(async () => {
      const result = await saveMealEntryAction({
        id: draft.id,
        date: selectedDate,
        mealGroupId: draft.mealGroupId ?? null,
        status: draft.status,
        productId: draft.productId ?? null,
        label: draft.label,
        sortOrder: draft.sortOrder,
        quantity: toNumber(draft.quantity, 1),
        unit: draft.unit,
        servingMultiplier: toNumber(draft.servingMultiplier, 1),
        proteinG: toNumber(draft.proteinG),
        carbsG: toNumber(draft.carbsG),
        fatG: toNumber(draft.fatG),
        caloriesKcal: Math.round(toNumber(draft.caloriesKcal)),
      });

      if (!result.ok) {
        setErrors((currentErrors) => ({
          ...currentErrors,
          [clientId]: result.error ?? "Unable to save food item.",
        }));
        setActiveMutation(null);
        return;
      }

      // Stamp the server-assigned ID onto the draft so subsequent edits go
      // through the update path rather than creating a duplicate entry.
      if (result.entry) {
        setDrafts((currentDrafts) =>
          currentDrafts.map((d) =>
            d.clientId === clientId ? { ...d, id: result.entry!.id } : d,
          ),
        );
      }

      invalidateAppDataCache(getDailyMutationCacheKeys(selectedDate));
      router.refresh();
    });
  }

  function handleDelete(clientId: string) {
    const draft = drafts.find((entry) => entry.clientId === clientId);
    if (!draft) {
      return;
    }

    if (!draft.id) {
      removeLocalDraft(clientId);
      return;
    }

    setActiveMutation(clientId);
    beginMutation(async () => {
      const result = await deleteMealEntryAction({
        id: draft.id!,
      });

      if (!result.ok) {
        setErrors((currentErrors) => ({
          ...currentErrors,
          [clientId]: result.error ?? "Unable to delete food item.",
        }));
        setActiveMutation(null);
        return;
      }

      invalidateAppDataCache(getDailyMutationCacheKeys(selectedDate));
      router.refresh();
    });
  }

  function handleStatusChange(clientId: string, status: MealEntryStatus) {
    const draft = drafts.find((entry) => entry.clientId === clientId);
    if (!draft?.id) {
      setDrafts((currentDrafts) =>
        currentDrafts.map((item) =>
          item.clientId === clientId ? { ...item, status } : item,
        ),
      );
      return;
    }

    setActiveMutation(clientId);
    beginMutation(async () => {
      const result = await markMealEntryStatusAction({
        id: draft.id!,
        status,
      });

      if (!result.ok) {
        setErrors((currentErrors) => ({
          ...currentErrors,
          [clientId]: result.error ?? "Unable to update status.",
        }));
        setActiveMutation(null);
        return;
      }

      setDrafts((currentDrafts) =>
        currentDrafts.map((item) =>
          item.clientId === clientId ? { ...item, status } : item,
        ),
      );
      invalidateAppDataCache(getDailyMutationCacheKeys(selectedDate));
      router.refresh();
    });
  }

  async function handleSavePreset(input: Omit<FoodPreset, "id" | "userId">) {
    setPresetError(null);
    setPresetMutation({ type: "save" });

    try {
      const result = await savePresetAction(input);
      const savedPreset = result.preset;
      if (!result.ok || !savedPreset) {
        setPresetError(result.error ?? "Unable to save preset.");
        return false;
      }

      setLocalPresets((prev) =>
        [...prev, savedPreset].sort((a, b) => a.label.localeCompare(b.label)),
      );
      invalidateAppDataCache(getPresetMutationCacheKeys());
      return true;
    } finally {
      setPresetMutation(null);
    }
  }

  async function handleDeletePreset(presetId: string) {
    const previousPresets = localPresets;

    setPresetError(null);
    setPresetMutation({ type: "delete", presetId });
    setLocalPresets((prev) => prev.filter((p) => p.id !== presetId));

    try {
      const result = await deletePresetAction({ id: presetId });
      if (!result.ok) {
        setLocalPresets(previousPresets);
        setPresetError(result.error ?? "Unable to delete preset.");
        return false;
      }

      invalidateAppDataCache(getPresetMutationCacheKeys());
      return true;
    } finally {
      setPresetMutation(null);
    }
  }

  async function handleUpdatePreset(id: string, input: Omit<FoodPreset, "id" | "userId">) {
    setPresetError(null);
    setPresetMutation({ type: "update", presetId: id });

    try {
      const result = await updatePresetAction({ id, ...input });
      const updatedPreset = result.preset;
      if (!result.ok || !updatedPreset) {
        setPresetError(result.error ?? "Unable to update preset.");
        return false;
      }

      setLocalPresets((prev) =>
        prev
          .map((preset) => (preset.id === id ? updatedPreset : preset))
          .sort((a, b) => a.label.localeCompare(b.label)),
      );
      invalidateAppDataCache(getPresetMutationCacheKeys());
      return true;
    } finally {
      setPresetMutation(null);
    }
  }

  async function handleCreateMealGroup() {
    const label = newGroupLabel.trim();
    if (!label) return;

    setGroupError(null);
    setGroupMutationId("new");
    try {
      const result = await createMealGroupAction({ label });
      if (!result.ok || !result.group) {
        setGroupError(result.error ?? "Unable to create group.");
        return;
      }

      setLocalMealGroups((groups) => [...groups, result.group!]);
      setNewGroupLabel("");
    } finally {
      setGroupMutationId(null);
    }
  }

  async function handleRenameMealGroup(groupId: string, label: string) {
    const trimmed = label.trim();
    if (!trimmed) return;

    const previousGroups = localMealGroups;
    setLocalMealGroups((groups) =>
      groups.map((group) =>
        group.id === groupId ? { ...group, label: trimmed } : group,
      ),
    );
    setGroupError(null);
    setGroupMutationId(groupId);
    try {
      const result = await updateMealGroupAction({ id: groupId, label: trimmed });
      if (!result.ok || !result.group) {
        setLocalMealGroups(previousGroups);
        setGroupError(result.error ?? "Unable to rename group.");
      }
    } finally {
      setGroupMutationId(null);
    }
  }

  async function handleDeleteMealGroup(groupId: string) {
    const previousGroups = localMealGroups;
    const previousDrafts = drafts;
    setLocalMealGroups((groups) => groups.filter((group) => group.id !== groupId));
    setDrafts((currentDrafts) =>
      currentDrafts.map((draft) =>
        draft.mealGroupId === groupId ? { ...draft, mealGroupId: null } : draft,
      ),
    );
    setGroupError(null);
    setGroupMutationId(groupId);
    try {
      const result = await deleteMealGroupAction({ id: groupId });
      if (!result.ok) {
        setLocalMealGroups(previousGroups);
        setDrafts(previousDrafts);
        setGroupError(result.error ?? "Unable to delete group.");
        return;
      }

      setSavedMeals((meals) =>
        meals.map((meal) =>
          meal.mealGroupId === groupId ? { ...meal, mealGroupId: null } : meal,
        ),
      );
      invalidateAppDataCache(getDailyMutationCacheKeys(selectedDate));
      router.refresh();
    } finally {
      setGroupMutationId(null);
    }
  }

  const isViewingToday = selectedDate === todayStr;
  const isExperimental = uiMode === "experimental";
  const localMealGroupIds = new Set(localMealGroups.map((group) => group.id));
  const groupedDrafts = localMealGroups.map((group) => ({
    group,
    drafts: drafts.filter((draft) => draft.mealGroupId === group.id),
  }));
  const ungroupedDrafts = drafts.filter(
    (draft) => !draft.mealGroupId || !localMealGroupIds.has(draft.mealGroupId),
  );

  function handleDuplicate(clientId: string) {
    setDrafts((currentDrafts) => {
      const draft = currentDrafts.find((d) => d.clientId === clientId);
      if (!draft) return currentDrafts;

      const maxSortOrder = currentDrafts.reduce(
        (max, d) => Math.max(max, d.sortOrder),
        -1,
      );

      return [
        ...currentDrafts,
        {
          clientId: `draft-${crypto.randomUUID()}`,
          mealGroupId: draft.mealGroupId,
          status: defaultEntryStatus,
          productId: draft.productId,
          label: draft.label,
          quantity: draft.quantity,
          unit: draft.unit,
          servingMultiplier: draft.servingMultiplier,
          proteinG: draft.proteinG,
          carbsG: draft.carbsG,
          fatG: draft.fatG,
          caloriesKcal: draft.caloriesKcal,
          sortOrder: maxSortOrder + 1,
        },
      ];
    });
  }

  function handleCopyToToday(clientId: string) {
    const draft = drafts.find((d) => d.clientId === clientId);
    if (!draft) return;

    setActiveMutation(clientId);
    beginMutation(async () => {
      const result = await saveMealEntryAction({
        date: todayStr,
        mealGroupId: draft.mealGroupId ?? null,
        status: "eaten",
        productId: draft.productId ?? null,
        label: draft.label,
        quantity: toNumber(draft.quantity, 1),
        unit: draft.unit,
        servingMultiplier: toNumber(draft.servingMultiplier, 1),
        proteinG: toNumber(draft.proteinG),
        carbsG: toNumber(draft.carbsG),
        fatG: toNumber(draft.fatG),
        caloriesKcal: Math.round(toNumber(draft.caloriesKcal)),
      });

      if (!result.ok) {
        setErrors((currentErrors) => ({
          ...currentErrors,
          [clientId]: result.error ?? "Unable to copy entry to today.",
        }));
      } else {
        invalidateAppDataCache(getDailyMutationCacheKeys(todayStr));
        // Show a brief "copied" confirmation on the button, then clear it.
        setCopiedCardIds((prev) => new Set([...prev, clientId]));
        setTimeout(() => {
          setCopiedCardIds((prev) => {
            const next = new Set(prev);
            next.delete(clientId);
            return next;
          });
        }, 2000);
      }

      setActiveMutation(null);
    });
  }

  function handleComposeAction(action: ComposeAction) {
    switch (action) {
      case "custom":
        addCustomDraft();
        break;
      case "preset":
        setPresetError(null);
        setShowPresetsModal(true);
        break;
      case "scan":
        setScanResult(null);
        setNotFoundBarcode(null);
        setShowScanner(true);
        break;
      case "photo":
        setShowPhotoModal(true);
        break;
      case "recipe":
        setShowRecipePickerModal(true);
        break;
    }
  }

  const handleComposeActionEffect = useEffectEvent((action: ComposeAction) => {
    handleComposeAction(action);
  });

  useEffect(() => {
    if (!initialComposeAction) {
      return;
    }

    const composeKey = `${selectedDate}:${initialComposeAction}`;
    if (composeHandledRef.current === composeKey) {
      return;
    }

    composeHandledRef.current = composeKey;
    handleComposeActionEffect(initialComposeAction);

    const params = new URLSearchParams(window.location.search);
    params.delete("compose");
    const href = params.toString() ? `/?${params.toString()}` : "/";
    router.replace(href, { scroll: false });
  }, [initialComposeAction, router, selectedDate]);

  const content = (
    <div className={isExperimental ? "space-y-6" : "space-y-5"}>
      <section className={isExperimental
        ? "overflow-hidden rounded-[2rem] border border-[var(--color-border)] bg-[var(--color-surface-strong)] shadow-[0_20px_40px_rgba(0,0,0,0.08)]"
        : "rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-5 shadow-[0_12px_32px_rgba(0,0,0,0.06)]"}
      >
        <div className={isExperimental ? "border-b border-[var(--color-border)] p-5 pb-4" : "mb-4 flex items-center justify-between"}>
          <div className={isExperimental ? "flex items-start justify-between gap-4" : "flex items-center justify-between w-full"}>
            <div>
              <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-muted-strong)]">
                Daily Report
              </h2>
              {isExperimental ? (
                <p className="mt-1.5 text-sm text-[var(--color-muted)]">
                  Your logged intake for {isViewingToday ? "today" : "this selected day"}.
                </p>
              ) : null}
            </div>
            <span className="text-2xl font-bold tabular-nums text-[var(--color-ink)]">
              {liveTotals.caloriesKcal}
              <span className="ml-1 text-xs font-semibold text-[var(--color-muted)]">kcal</span>
            </span>
          </div>
        </div>

        <div className={isExperimental ? "p-5 pt-4" : ""}>
          <MacroBarGroup
            proteinG={liveTotals.proteinG}
            carbsG={liveTotals.carbsG}
            fatG={liveTotals.fatG}
            caloriesKcal={liveTotals.caloriesKcal}
            goals={goals}
          />
          {dailySummary.plannedTotals.caloriesKcal > 0 || dailySummary.skippedTotals.caloriesKcal > 0 ? (
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl bg-[var(--color-card-muted)] px-3 py-2">
                <span className="font-semibold text-[var(--color-muted-strong)]">Planned</span>
                <span className="ml-2 tabular-nums text-[var(--color-ink)]">{dailySummary.plannedTotals.caloriesKcal} kcal</span>
              </div>
              <div className="rounded-xl bg-[var(--color-card-muted)] px-3 py-2">
                <span className="font-semibold text-[var(--color-muted-strong)]">Skipped</span>
                <span className="ml-2 tabular-nums text-[var(--color-ink)]">{dailySummary.skippedTotals.caloriesKcal} kcal</span>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section>
        <div className={isExperimental ? "mb-3 flex items-end justify-between gap-3" : ""}>
          <div>
            <h2 className="mb-2.5 text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-muted-strong)]">
              Quick Add
            </h2>
            {isExperimental ? (
              <p className="mb-2 text-sm text-[var(--color-muted)]">
                Repeat foods that already fit your routine.
              </p>
            ) : null}
          </div>
        </div>
        <QuickAddRail
          items={quickAddItems}
          onAdd={addDraftFromCandidate}
          emptyState={
            <p className="text-sm text-[var(--color-muted)]">
              Log some foods or add presets to see suggestions here.
            </p>
          }
        />
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-muted-strong)]">
              Food Items
            </h2>
            {isExperimental ? (
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                The main log for the day. Use the center + button to add more.
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSearchModal(true)}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-[var(--color-muted)] transition hover:bg-[var(--color-card-muted)] hover:text-[var(--color-ink)]"
              aria-label="Search food history"
            >
              <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="7.5" cy="7.5" r="5" />
                <line x1="11.5" y1="11.5" x2="15" y2="15" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => {
                setGroupError(null);
                setShowGroupManager((open) => !open);
              }}
              className="flex h-9 items-center rounded-xl px-3 text-xs font-semibold text-[var(--color-muted)] transition hover:bg-[var(--color-card-muted)] hover:text-[var(--color-ink)]"
            >
              Groups
            </button>
            {!isExperimental ? (
              <AddFoodButton
                onCustom={addCustomDraft}
                onPreset={() => {
                  setPresetError(null);
                  setShowPresetsModal(true);
                }}
                onScan={() => {
                  setScanResult(null);
                  setNotFoundBarcode(null);
                  setShowScanner(true);
                }}
                onPhoto={() => setShowPhotoModal(true)}
                onRecipe={() => setShowRecipePickerModal(true)}
              />
            ) : null}
          </div>
        </div>

        {drafts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--color-border-strong)] bg-[var(--color-shell-panel)] px-5 py-8 text-center">
            <p className="text-sm text-[var(--color-muted)]">No food items logged yet.</p>
            <div className="mt-3 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setPresetError(null);
                  setShowPresetsModal(true);
                }}
                className="rounded-full border border-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-accent)] transition hover:-translate-y-0.5"
              >
                From preset
              </button>
              <button
                type="button"
                onClick={addCustomDraft}
                className="rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5"
              >
                Add custom
              </button>
            </div>
          </div>
        ) : null}

        {showGroupManager ? (
          <div className="mb-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-muted-strong)]">
                Meal Groups
              </h3>
              <button
                type="button"
                onClick={() => setShowGroupManager(false)}
                className="text-xs font-semibold text-[var(--color-muted)] hover:text-[var(--color-ink)]"
              >
                Done
              </button>
            </div>
            <div className="space-y-2">
              {localMealGroups.map((group) => (
                <div key={group.id} className="flex items-center gap-2">
                  <input
                    type="text"
                    defaultValue={group.label}
                    disabled={groupMutationId === group.id}
                    onBlur={(event) => {
                      if (event.target.value.trim() !== group.label) {
                        void handleRenameMealGroup(group.id, event.target.value);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.currentTarget.blur();
                      }
                    }}
                    className="min-w-0 flex-1 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-card-muted)] px-3 py-2 text-sm text-[var(--color-ink)] outline-none transition focus:border-[var(--color-accent)] disabled:opacity-60"
                  />
                  <button
                    type="button"
                    disabled={groupMutationId === group.id}
                    onClick={() => void handleDeleteMealGroup(group.id)}
                    className="rounded-xl px-3 py-2 text-xs font-semibold text-[var(--color-danger)] transition hover:bg-[color-mix(in_srgb,var(--color-danger)_10%,transparent)] disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={newGroupLabel}
                onChange={(event) => setNewGroupLabel(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void handleCreateMealGroup();
                  }
                }}
                placeholder="New group"
                className="min-w-0 flex-1 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-card-muted)] px-3 py-2 text-sm text-[var(--color-ink)] outline-none transition focus:border-[var(--color-accent)]"
              />
              <button
                type="button"
                disabled={!newGroupLabel.trim() || groupMutationId === "new"}
                onClick={() => void handleCreateMealGroup()}
                className="rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Add
              </button>
            </div>
            {groupError ? (
              <p className="mt-3 text-sm text-[var(--color-danger)]">{groupError}</p>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-5">
          {[...groupedDrafts, { group: null, drafts: ungroupedDrafts }].map(({ group, drafts: groupDrafts }) => {
            if (groupDrafts.length === 0) return null;
            return (
              <div key={group?.id ?? "ungrouped"} className="space-y-2">
                <h3 className="px-1 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-muted-strong)]">
                  {group?.label ?? "Ungrouped"}
                </h3>
                <div className="space-y-3">
                  {groupDrafts.map((draft) => {
            const busy = isPending && activeMutation === draft.clientId;

            return (
              <MealCard
                key={draft.clientId}
                draft={draft}
                busy={busy}
                error={errors[draft.clientId]}
                isCopied={copiedCardIds.has(draft.clientId)}
                mealGroups={localMealGroups}
                onChange={updateDraft}
                onSave={handleSave}
                onDelete={handleDelete}
                onDuplicate={handleDuplicate}
                onGroupChange={handleGroupChange}
                onStatusChange={handleStatusChange}
                onCopyToToday={isViewingToday ? undefined : handleCopyToToday}
                onDiscardChanges={discardDraftChanges}
              />
            );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );

  return (
    <>
      {isExperimental ? (
        <ExperimentalAppShell
          userEmail={userEmail}
          canAccessAdmin={canAccessAdmin}
          selectedDate={selectedDate}
          title="Food Log"
          activeTab="log"
          showDateNavigation
          onComposeAction={handleComposeAction}
        >
          {content}
        </ExperimentalAppShell>
      ) : (
        <AppShell
          userEmail={userEmail}
          canAccessAdmin={canAccessAdmin}
          selectedDate={selectedDate}
          activeTab="log"
        >
          {content}
        </AppShell>
      )}

      {showSearchModal && (
        <FoodSearchModal
          onClose={() => setShowSearchModal(false)}
          onViewDate={(date) => {
            setShowSearchModal(false);
            const href = `/?date=${date}`;
            prepareNavigationMotion(href, "day-jump");
            router.push(href);
          }}
        />
      )}

      {showPresetsModal && (
        <PresetModal
          presets={localPresets}
          mutation={presetMutation}
          errorMessage={presetError}
          onClose={() => {
            setPresetError(null);
            setShowPresetsModal(false);
          }}
          onSelect={addDraftFromPreset}
          onSave={handleSavePreset}
          onUpdate={handleUpdatePreset}
          onDelete={handleDeletePreset}
        />
      )}

      {showRecipePickerModal && (
        <RecipePickerModal
          recipes={recipes}
          onClose={() => setShowRecipePickerModal(false)}
          onSelect={addDraftFromRecipe}
        />
      )}

      {showPhotoModal && (
        <AiFoodPhotoModal
          onClose={() => setShowPhotoModal(false)}
          onAddToLog={(macros) => {
            setDrafts((currentDrafts) => [
              ...currentDrafts,
              {
                clientId: `draft-${crypto.randomUUID()}`,
                status: defaultEntryStatus,
                label: macros.label,
                quantity: "1",
                unit: "serving",
                servingMultiplier: "1",
                proteinG: String(macros.proteinG),
                carbsG: String(macros.carbsG),
                fatG: String(macros.fatG),
                caloriesKcal: String(macros.caloriesKcal),
                sortOrder: nextSortOrder(),
              },
            ]);
            invalidateAppDataCache(getDailyMutationCacheKeys(selectedDate));
            setShowPhotoModal(false);
          }}
          onSaveAsPreset={(input) => {
            handleSavePreset(input);
          }}
        />
      )}

      {showScanner && (
        <BarcodeScanner
          onScan={(product) => {
            setShowScanner(false);
            setScanResult(product);
            setNotFoundBarcode(null);
          }}
          onNotFound={(barcode) => {
            setShowScanner(false);
            setScanResult(null);
            setNotFoundBarcode(barcode);
          }}
          onClose={() => setShowScanner(false)}
        />
      )}

      {(scanResult || notFoundBarcode) && (
        <BarcodeResult
          product={scanResult}
          notFoundBarcode={notFoundBarcode}
          onAddToLog={(macros) => {
            setDrafts((currentDrafts) => [
              ...currentDrafts,
              {
                clientId: `draft-${crypto.randomUUID()}`,
                status: defaultEntryStatus,
                label: macros.label,
                quantity: "1",
                unit: "serving",
                servingMultiplier: "1",
                proteinG: String(macros.proteinG),
                carbsG: String(macros.carbsG),
                fatG: String(macros.fatG),
                caloriesKcal: String(macros.caloriesKcal),
            sortOrder: nextSortOrder(),
          },
        ]);
        invalidateAppDataCache(getDailyMutationCacheKeys(selectedDate));
        setScanResult(null);
        setNotFoundBarcode(null);
          }}
          onSaveAsPreset={(input) => {
            handleSavePreset(input);
          }}
          onScanAnother={() => {
            setScanResult(null);
            setNotFoundBarcode(null);
            setShowScanner(true);
          }}
          onClose={() => {
            setScanResult(null);
            setNotFoundBarcode(null);
          }}
        />
      )}
    </>
  );
}
