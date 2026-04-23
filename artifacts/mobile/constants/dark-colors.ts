/**
 * Backwards-compatibility shim. Dark palettes now live in `colors.ts`
 * and are swapped into the same mutable `Colors` object via `applyTheme`.
 * This module re-exports the active `Colors` so any old code that did
 * `import DarkColors from "@/constants/dark-colors"` keeps working.
 */
import Colors, { applyTheme } from "./colors";

export function applyMinimalDarkPalette(_minimal: boolean) {
  // No-op: theme/palette swapping is now driven by `applyTheme` in colors.ts.
  // Kept to avoid breaking older imports.
}

export { applyTheme };
export default Colors;
