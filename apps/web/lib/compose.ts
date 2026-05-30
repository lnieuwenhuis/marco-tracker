export type ComposeAction = "custom" | "preset" | "scan" | "photo" | "recipe";

export function normalizeComposeAction(value?: string | null): ComposeAction | null {
  switch (value) {
    case "custom":
    case "preset":
    case "scan":
    case "photo":
    case "recipe":
      return value;
    default:
      return null;
  }
}
