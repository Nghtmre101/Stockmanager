// Curated professional theme palettes for the POS app.
//
// The old implementation generated fully *random* oklch colors (random hue +
// random light/dark). Because a random hue could land in the yellow band, the
// whole UI — background, sidebar, cards — sometimes rendered as neon yellow.
//
// This version keeps the same public surface (generateTheme / applyTheme /
// GeneratedTheme) but cycles through a hand-picked set of tasteful, high-
// contrast palettes. Surfaces (background, card, sidebar) stay neutral so the
// accent colour carries the brand, never the big panels.

export type ThemeVars = Record<string, string>;

export type GeneratedTheme = {
  name: string;
  dark: boolean;
  vars: ThemeVars;
};

/** Build a complete, professional token set from an accent hue. */
function build(name: string, hue: number, dark: boolean): GeneratedTheme {
  const accentHue = (hue + 25) % 360;

  // Neutral surfaces (no colour tint) keep the UI calm and professional.
  const vars: ThemeVars = dark
    ? {
        "--background": "oklch(0.15 0 0)",
        "--foreground": "oklch(0.97 0.004 260)",
        "--card": "oklch(0.2 0.008 260)",
        "--card-foreground": "oklch(0.97 0.004 260)",
        "--popover": "oklch(0.2 0.008 260)",
        "--popover-foreground": "oklch(0.97 0.004 260)",
        "--secondary": "oklch(0.26 0.012 260)",
        "--secondary-foreground": "oklch(0.97 0.004 260)",
        "--muted": "oklch(0.26 0.012 260)",
        "--muted-foreground": "oklch(0.72 0.02 260)",
        "--accent": `oklch(0.32 0.06 ${accentHue})`,
        "--accent-foreground": "oklch(0.98 0.004 260)",
        "--border": "oklch(1 0 0 / 12%)",
        "--input": "oklch(1 0 0 / 16%)",
        "--sidebar": "oklch(0.17 0.01 260)",
        "--sidebar-foreground": "oklch(0.97 0.004 260)",
        "--sidebar-accent": "oklch(0.28 0.02 260)",
        "--sidebar-accent-foreground": "oklch(0.97 0.004 260)",
        "--sidebar-border": "oklch(1 0 0 / 12%)",
      }
    : {
        "--background": "oklch(0.985 0 0)",
        "--foreground": "oklch(0.21 0.02 260)",
        "--card": "oklch(1 0 0)",
        "--card-foreground": "oklch(0.21 0.02 260)",
        "--popover": "oklch(1 0 0)",
        "--popover-foreground": "oklch(0.21 0.02 260)",
        "--secondary": "oklch(0.965 0.005 260)",
        "--secondary-foreground": "oklch(0.25 0.03 260)",
        "--muted": "oklch(0.965 0.004 260)",
        "--muted-foreground": "oklch(0.52 0.025 260)",
        "--accent": `oklch(0.94 0.03 ${accentHue})`,
        "--accent-foreground": `oklch(0.28 0.06 ${accentHue})`,
        "--border": "oklch(0.92 0.006 260)",
        "--input": "oklch(0.92 0.006 260)",
        "--sidebar": "oklch(0.98 0.002 260)",
        "--sidebar-foreground": "oklch(0.25 0.03 260)",
        "--sidebar-accent": "oklch(0.95 0.015 260)",
        "--sidebar-accent-foreground": "oklch(0.28 0.04 260)",
        "--sidebar-border": "oklch(0.92 0.006 260)",
      };

  // Accent / brand colour is the only strongly-coloured token.
  vars["--primary"] = dark
    ? `oklch(0.62 0.17 ${hue})`
    : `oklch(0.55 0.17 ${hue})`;
  vars["--primary-foreground"] = `oklch(0.99 0.004 ${hue})`;
  vars["--primary-glow"] = `oklch(0.7 0.14 ${accentHue})`;
  vars["--ring"] = vars["--primary"];
  vars["--sidebar-primary"] = vars["--primary"];
  vars["--sidebar-primary-foreground"] = vars["--primary-foreground"];
  vars["--sidebar-ring"] = vars["--ring"];

  // Status colours (intentionally kept, not yellow backgrounds).
  vars["--success"] = `oklch(${dark ? 0.72 : 0.58} 0.16 155)`;
  vars["--success-foreground"] = `oklch(0.99 0.01 155)`;
  vars["--warning"] = `oklch(${dark ? 0.78 : 0.7} 0.16 75)`;
  vars["--warning-foreground"] = `oklch(0.2 0.05 75)`;
  vars["--destructive"] = `oklch(${dark ? 0.68 : 0.57} 0.21 27)`;
  vars["--destructive-foreground"] = `oklch(0.99 0.01 27)`;

  vars["--gradient-brand"] =
    `linear-gradient(135deg, ${vars["--primary"]}, ${vars["--primary-glow"]})`;
  vars["--shadow-soft"] =
    `0 18px 40px -22px color-mix(in oklab, ${vars["--primary"]} 55%, transparent)`;
  vars["--radius"] = "0.625rem";

  return { name, dark, vars };
}

// Hand-picked accent hues — deliberately excluding the yellow/green-yellow
// band (~60–110) so the interface never trends neon.
const CURATED: GeneratedTheme[] = [
  build("Indigo", 265, false),
  build("Ocean", 230, false),
  build("Violet", 290, false),
  build("Teal", 195, false),
  build("Emerald", 160, false),
  build("Rose", 350, false),
  build("Indigo Night", 265, true),
  build("Ocean Night", 230, true),
  build("Violet Night", 290, true),
  build("Teal Night", 195, true),
  build("Emerald Night", 160, true),
  build("Rose Night", 350, true),
];

let cursor = 0;

/** Returns the next curated theme in a stable rotation. */
export function generateTheme(): GeneratedTheme {
  const theme = CURATED[cursor % CURATED.length];
  cursor += 1;
  return theme;
}

export function applyTheme(theme: GeneratedTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const [k, v] of Object.entries(theme.vars)) root.style.setProperty(k, v);
  root.classList.toggle("dark", theme.dark);
}