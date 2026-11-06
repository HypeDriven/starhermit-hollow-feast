// Localization: the engine's string tables (assets/strings.json, generated
// from the browser build's nine StarHermit locales) in the interface language
// the runtime reports (the player's choice in Options › Language, else the
// account's preferred language or the device's). The runtime's Options replace
// the browser build's own Language setting (sh-language.js). The account and
// leaderboard lines are the engine's `starhermit.*` keys.
import { strings } from "starhermit:engine";
import * as ui from "starhermit:ui";

strings.load("assets/strings.json");
strings.defaultLocale = "en-US";
ui.setLanguage(strings.locale);
strings.onChange((locale) => ui.setLanguage(locale));

/** A game string by key in the player's language; `{name}` placeholders from vars. */
export function tr(key: string, vars?: Record<string, string | number> | null): string { return strings.t(key, vars ?? undefined); }
