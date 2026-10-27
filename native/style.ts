// The look of the header, HUD, controls and Settings: the browser build's
// index.html style sheet, rewritten class-based in tools/ui-style.css and
// converted with `starhermit css` into assets/ui-style.json (`npm run css`),
// registered at start, plus the built-in widgets' looks (the Settings dialog
// as the old panel card) in the same palette. High contrast, larger text and
// the interface size are the runtime's.
import { files } from "starhermit:engine";
import * as ui from "starhermit:ui";

export const COLORS = { bg: "#0b0d12", panel: "#121826", line: "#2c3a55", control: "#233047", text: "#e8ecf4", dim: "#9aa7bd", focus: "#6ea3ff", gold: "#f6e7b2" };

export function initStyles(): void {
  const css = files.readJson("assets/ui-style.json") as unknown as ui.CssStyles;
  ui.setTheme({
    fontSize: 16, smallSize: 13, headingSize: 20, padding: 8, spacing: 8, radius: 8,
    text: COLORS.text, muted: COLORS.dim, panel: COLORS.panel, control: COLORS.control, hovered: "#2d3c57",
    pressed: "#1b2538", field: "#1b2436", accent: COLORS.focus, focus: COLORS.focus, outline: COLORS.line,
  });
  ui.setTokens(css.tokens);
  ui.setAnimations(css.animations);
  ui.setStyles({
    ...css.styles,
    label: { text: { color: COLORS.text } },
    paragraph: { text: { color: COLORS.text } },
    heading: { text: { color: "#ffffff" } },
    widget: { focusRing: { color: COLORS.focus, width: 2, offset: 1 } },
    dialog: {
      background: COLORS.panel, radius: 12, padding: 16, border: { width: 1, color: COLORS.line }, shadow: { y: 12, blur: 40, color: "#0000008c" },
      parts: { backdrop: { background: "#05070b9e" } },
    },
    scrollArea: { parts: { bar: { background: "#4a5a72", radius: 4 } } },
  });
}
