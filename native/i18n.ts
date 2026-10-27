// Localization: js/strings.js's nine StarHermit locales in the interface
// language the runtime reports (preferences().language: the player's choice
// in Options › Language, else the account's preferred language or the
// device's). The runtime's Options replace the browser build's own Language
// setting (sh-language.js).
import { onPreferencesChange, preferences } from "starhermit:engine";
import * as ui from "starhermit:ui";
import { Strings } from "./classic.ts";

const PRIMARY: Record<string, string> = { en: "en-US", es: "es-419", de: "de-DE", fr: "fr-FR", pt: "pt-BR", it: "it-IT" };

/** The shipped locale nearest a BCP 47 tag (en-GB, es-ES and fr-CA by region). */
export function pickLocale(tag: string): string {
  const s = String(tag || "en-US");
  const exact = Strings.LOCALES.find((l) => l.toLowerCase() === s.toLowerCase());
  if (exact) return exact;
  const lang = s.split("-")[0]!.toLowerCase();
  if (lang === "en" && /-(gb|uk|ie|au|nz|za|in)$/i.test(s)) return "en-GB";
  if (lang === "es" && /-es$/i.test(s)) return "es-ES";
  if (lang === "fr" && /-ca$/i.test(s)) return "fr-CA";
  return PRIMARY[lang] ?? "en-US";
}

let locale = "";
function apply(tag: string): void {
  const next = pickLocale(tag);
  if (next === locale) return;
  locale = next;
  ui.setLanguage(locale);
}
apply(preferences().language);
onPreferencesChange((p) => apply(p.language));

export function currentLocale(): string { return locale; }
/** A game string by key in the player's language; `{name}` placeholders from vars. */
export function tr(key: string, vars?: Record<string, string | number> | null): string { return Strings.t(locale, key, vars ?? null); }
