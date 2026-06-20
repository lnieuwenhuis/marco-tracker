export type ComposeAction = "custom" | "template" | "scan" | "photo" | "recipe";

export function normalizeComposeAction(value?: string | null): ComposeAction | null {
  switch (value) {
    case "custom":
      return "custom";
    case "preset":
      return "template";
    case "template":
    case "scan":
    case "photo":
    case "recipe":
      return value;
    default:
      return null;
  }
}
