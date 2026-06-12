import { useEffect, useState } from "react";

const STORAGE_KEY = "ia-ensayos:theme-colors";

export type ThemeColors = {
  foreground: string;
  background: string;
  primary: string;
  primaryGlow: string;
  paletteId?: string;
};

export type PalettePreset = {
  id: string;
  label: string;
  swatch: string[];
  colors: ThemeColors;
};

export const PALETTES: PalettePreset[] = [
  {
    id: "amber",
    label: "Ámbar (Default)",
    swatch: ["#1a1410", "#f4ece0", "#e0a44a", "#f0c070"],
    colors: {
      paletteId: "amber",
      background: "#1a1410",
      foreground: "#f4ece0",
      primary: "#e0a44a",
      primaryGlow: "#f0c070",
    },
  },
  {
    id: "indigo",
    label: "Índigo nocturno",
    swatch: ["#0f1024", "#e8e9ff", "#7c83ff", "#a4a8ff"],
    colors: {
      paletteId: "indigo",
      background: "#0f1024",
      foreground: "#e8e9ff",
      primary: "#7c83ff",
      primaryGlow: "#a4a8ff",
    },
  },
  {
    id: "emerald",
    label: "Esmeralda",
    swatch: ["#0d1a14", "#e6f5ec", "#3fbf7f", "#6ed79c"],
    colors: {
      paletteId: "emerald",
      background: "#0d1a14",
      foreground: "#e6f5ec",
      primary: "#3fbf7f",
      primaryGlow: "#6ed79c",
    },
  },
  {
    id: "rose",
    label: "Rosa escenario",
    swatch: ["#1a0f14", "#fde8ef", "#ec4f80", "#f47aa1"],
    colors: {
      paletteId: "rose",
      background: "#1a0f14",
      foreground: "#fde8ef",
      primary: "#ec4f80",
      primaryGlow: "#f47aa1",
    },
  },
  {
    id: "slate",
    label: "Slate minimal",
    swatch: ["#f8f9fb", "#0f172a", "#3b82f6", "#60a5fa"],
    colors: {
      paletteId: "slate",
      background: "#f8f9fb",
      foreground: "#0f172a",
      primary: "#3b82f6",
      primaryGlow: "#60a5fa",
    },
  },
];

export const DEFAULT_THEME_COLORS: ThemeColors = PALETTES[0].colors;

function isBrowser() {
  return typeof window !== "undefined";
}

export function loadThemeColors(): ThemeColors {
  if (!isBrowser()) return DEFAULT_THEME_COLORS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_THEME_COLORS;
    const parsed = JSON.parse(raw) as Partial<ThemeColors>;
    return {
      ...DEFAULT_THEME_COLORS,
      ...parsed,
    };
  } catch {
    return DEFAULT_THEME_COLORS;
  }
}

export function applyThemeColors(colors: ThemeColors) {
  if (!isBrowser()) return;
  const root = document.documentElement;
  root.style.setProperty("--foreground", colors.foreground);
  root.style.setProperty("--card-foreground", colors.foreground);
  root.style.setProperty("--popover-foreground", colors.foreground);
  root.style.setProperty("--background", colors.background);
  root.style.setProperty("--primary", colors.primary);
  root.style.setProperty("--primary-glow", colors.primaryGlow);
  root.style.setProperty("--ring", colors.primary);
}

export function saveThemeColors(colors: ThemeColors) {
  if (!isBrowser()) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(colors));
  applyThemeColors(colors);
}

export function useApplyStoredThemeColors() {
  useEffect(() => {
    applyThemeColors(loadThemeColors());
  }, []);
}

export function useThemeColors() {
  const [colors, setColors] = useState<ThemeColors>(DEFAULT_THEME_COLORS);

  useEffect(() => {
    const loaded = loadThemeColors();
    setColors(loaded);
    applyThemeColors(loaded);
  }, []);

  const update = (patch: Partial<ThemeColors>) => {
    setColors((prev) => {
      const next = { ...prev, ...patch, paletteId: patch.paletteId ?? undefined };
      saveThemeColors(next);
      return next;
    });
  };

  const applyPalette = (paletteId: string) => {
    const preset = PALETTES.find((p) => p.id === paletteId);
    if (!preset) return;
    setColors(preset.colors);
    saveThemeColors(preset.colors);
  };

  const reset = () => {
    setColors(DEFAULT_THEME_COLORS);
    saveThemeColors(DEFAULT_THEME_COLORS);
  };

  return { colors, update, applyPalette, reset };
}
