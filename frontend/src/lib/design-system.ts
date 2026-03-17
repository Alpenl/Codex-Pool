export type DesignMode = 'light' | 'dark'

export type SurfaceKind = 'panel' | 'panel-muted' | 'stage' | 'sidebar'
export type ControlKind = 'default' | 'outline' | 'ghost'
export type TableChromeKind = 'toolbar' | 'header' | 'row'

export interface DesignLanguage {
  mode: DesignMode
  palette: {
    neutralFamily: 'graphite'
    accentFamily: 'mineral-teal'
    canvasTone: 'soft' | 'deep'
  }
  radius: {
    control: '14px'
    panel: '24px'
    stage: '32px'
  }
  shadow: {
    panel: 'soft' | 'deep-soft'
    stage: 'lifted' | 'deep-lifted'
  }
  density: {
    controls: 'comfortable'
    panels: 'relaxed'
  }
}

export interface SurfaceRecipe {
  kind: SurfaceKind
  emphasis: 'high' | 'medium' | 'low'
  border: 'defined' | 'soft' | 'glow-edge'
  background: 'elevated' | 'subtle' | 'atmospheric' | 'chrome'
  shadow: 'soft' | 'softest' | 'lifted' | 'deep-soft' | 'deep-lifted' | 'none'
  temperature: 'neutral' | 'cool'
}

export interface ControlChrome {
  kind: ControlKind
  emphasis: 'high' | 'medium' | 'low'
  palette: 'mineral-teal' | 'graphite'
  surface: 'filled' | 'tinted-outline' | 'quiet'
  radius: '14px'
  focus: 'ring'
}

export interface TableChrome {
  kind: TableChromeKind
  surface: 'muted-panel' | 'tinted-strip' | 'interactive-row'
  border: 'soft' | 'defined'
  emphasis: 'medium' | 'low'
}

const DESIGN_LANGUAGES: Record<DesignMode, DesignLanguage> = {
  light: {
    mode: 'light',
    palette: {
      neutralFamily: 'graphite',
      accentFamily: 'mineral-teal',
      canvasTone: 'soft',
    },
    radius: {
      control: '14px',
      panel: '24px',
      stage: '32px',
    },
    shadow: {
      panel: 'soft',
      stage: 'lifted',
    },
    density: {
      controls: 'comfortable',
      panels: 'relaxed',
    },
  },
  dark: {
    mode: 'dark',
    palette: {
      neutralFamily: 'graphite',
      accentFamily: 'mineral-teal',
      canvasTone: 'deep',
    },
    radius: {
      control: '14px',
      panel: '24px',
      stage: '32px',
    },
    shadow: {
      panel: 'deep-soft',
      stage: 'deep-lifted',
    },
    density: {
      controls: 'comfortable',
      panels: 'relaxed',
    },
  },
}

const SURFACE_RECIPES: Record<DesignMode, Record<SurfaceKind, SurfaceRecipe>> = {
  light: {
    panel: {
      kind: 'panel',
      emphasis: 'medium',
      border: 'defined',
      background: 'elevated',
      shadow: 'soft',
      temperature: 'neutral',
    },
    'panel-muted': {
      kind: 'panel-muted',
      emphasis: 'low',
      border: 'soft',
      background: 'subtle',
      shadow: 'softest',
      temperature: 'neutral',
    },
    stage: {
      kind: 'stage',
      emphasis: 'high',
      border: 'glow-edge',
      background: 'atmospheric',
      shadow: 'lifted',
      temperature: 'cool',
    },
    sidebar: {
      kind: 'sidebar',
      emphasis: 'medium',
      border: 'soft',
      background: 'chrome',
      shadow: 'none',
      temperature: 'cool',
    },
  },
  dark: {
    panel: {
      kind: 'panel',
      emphasis: 'medium',
      border: 'defined',
      background: 'elevated',
      shadow: 'deep-soft',
      temperature: 'neutral',
    },
    'panel-muted': {
      kind: 'panel-muted',
      emphasis: 'low',
      border: 'soft',
      background: 'subtle',
      shadow: 'softest',
      temperature: 'neutral',
    },
    stage: {
      kind: 'stage',
      emphasis: 'high',
      border: 'glow-edge',
      background: 'atmospheric',
      shadow: 'deep-lifted',
      temperature: 'cool',
    },
    sidebar: {
      kind: 'sidebar',
      emphasis: 'medium',
      border: 'soft',
      background: 'chrome',
      shadow: 'none',
      temperature: 'cool',
    },
  },
}

const CONTROL_CHROME: Record<ControlKind, ControlChrome> = {
  default: {
    kind: 'default',
    emphasis: 'high',
    palette: 'mineral-teal',
    surface: 'filled',
    radius: '14px',
    focus: 'ring',
  },
  outline: {
    kind: 'outline',
    emphasis: 'medium',
    palette: 'graphite',
    surface: 'tinted-outline',
    radius: '14px',
    focus: 'ring',
  },
  ghost: {
    kind: 'ghost',
    emphasis: 'low',
    palette: 'graphite',
    surface: 'quiet',
    radius: '14px',
    focus: 'ring',
  },
}

const TABLE_CHROME: Record<TableChromeKind, TableChrome> = {
  toolbar: {
    kind: 'toolbar',
    surface: 'muted-panel',
    border: 'soft',
    emphasis: 'medium',
  },
  header: {
    kind: 'header',
    surface: 'tinted-strip',
    border: 'soft',
    emphasis: 'low',
  },
  row: {
    kind: 'row',
    surface: 'interactive-row',
    border: 'defined',
    emphasis: 'low',
  },
}

export function resolveDesignLanguage(mode: DesignMode | string | undefined): DesignLanguage {
  if (mode === 'dark') {
    return DESIGN_LANGUAGES.dark
  }

  return DESIGN_LANGUAGES.light
}

export function resolveSurfaceRecipe(
  kind: SurfaceKind | string | undefined,
  mode: DesignMode | string | undefined = 'light',
): SurfaceRecipe {
  const resolvedMode = resolveDesignLanguage(mode).mode
  const resolvedKind = kind && kind in SURFACE_RECIPES.light ? (kind as SurfaceKind) : 'panel'

  return SURFACE_RECIPES[resolvedMode][resolvedKind]
}

export function resolveControlChrome(kind: ControlKind | string | undefined): ControlChrome {
  if (kind === 'outline' || kind === 'ghost') {
    return CONTROL_CHROME[kind]
  }

  return CONTROL_CHROME.default
}

export function resolveTableChrome(kind: TableChromeKind | string | undefined): TableChrome {
  if (kind === 'header' || kind === 'row') {
    return TABLE_CHROME[kind]
  }

  return TABLE_CHROME.toolbar
}
