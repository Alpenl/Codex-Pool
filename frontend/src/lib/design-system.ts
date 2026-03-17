export type DesignMode = 'light' | 'dark'

export type SurfaceKind = 'panel' | 'panel-muted' | 'stage' | 'sidebar'
export type ControlKind = 'default' | 'outline' | 'ghost'
export type TableChromeKind = 'toolbar' | 'header' | 'row'

export interface DesignLanguage {
  mode: DesignMode
  palette: {
    neutralFamily: 'stone-graphite'
    accentFamily: 'oxide-blue'
    canvasTone: 'paper' | 'ink'
  }
  radius: {
    control: '12px'
    panel: '20px'
    stage: '28px'
  }
  shadow: {
    panel: 'resting' | 'deep-resting'
    stage: 'settled' | 'deep-settled'
  }
  density: {
    controls: 'comfortable'
    panels: 'relaxed'
  }
}

export interface SurfaceRecipe {
  kind: SurfaceKind
  emphasis: 'high' | 'medium' | 'low'
  border: 'etched' | 'soft' | 'quiet'
  background: 'vellum' | 'powder' | 'matte' | 'cabinet'
  shadow: 'resting' | 'barely-there' | 'settled' | 'deep-resting' | 'deep-settled' | 'none'
  temperature: 'warm' | 'neutral'
}

export interface ControlChrome {
  kind: ControlKind
  emphasis: 'high' | 'medium' | 'low'
  palette: 'oxide-blue' | 'graphite'
  surface: 'ink-solid' | 'lined' | 'quiet'
  radius: '12px'
  focus: 'ring'
}

export interface TableChrome {
  kind: TableChromeKind
  surface: 'tool-plate' | 'linen-strip' | 'quiet-row'
  border: 'soft' | 'etched'
  emphasis: 'medium' | 'low'
}

const DESIGN_LANGUAGES: Record<DesignMode, DesignLanguage> = {
  light: {
    mode: 'light',
    palette: {
      neutralFamily: 'stone-graphite',
      accentFamily: 'oxide-blue',
      canvasTone: 'paper',
    },
    radius: {
      control: '12px',
      panel: '20px',
      stage: '28px',
    },
    shadow: {
      panel: 'resting',
      stage: 'settled',
    },
    density: {
      controls: 'comfortable',
      panels: 'relaxed',
    },
  },
  dark: {
    mode: 'dark',
    palette: {
      neutralFamily: 'stone-graphite',
      accentFamily: 'oxide-blue',
      canvasTone: 'ink',
    },
    radius: {
      control: '12px',
      panel: '20px',
      stage: '28px',
    },
    shadow: {
      panel: 'deep-resting',
      stage: 'deep-settled',
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
      border: 'etched',
      background: 'vellum',
      shadow: 'resting',
      temperature: 'warm',
    },
    'panel-muted': {
      kind: 'panel-muted',
      emphasis: 'low',
      border: 'soft',
      background: 'powder',
      shadow: 'barely-there',
      temperature: 'warm',
    },
    stage: {
      kind: 'stage',
      emphasis: 'medium',
      border: 'etched',
      background: 'matte',
      shadow: 'settled',
      temperature: 'warm',
    },
    sidebar: {
      kind: 'sidebar',
      emphasis: 'medium',
      border: 'soft',
      background: 'cabinet',
      shadow: 'none',
      temperature: 'neutral',
    },
  },
  dark: {
    panel: {
      kind: 'panel',
      emphasis: 'medium',
      border: 'etched',
      background: 'vellum',
      shadow: 'deep-resting',
      temperature: 'neutral',
    },
    'panel-muted': {
      kind: 'panel-muted',
      emphasis: 'low',
      border: 'soft',
      background: 'powder',
      shadow: 'barely-there',
      temperature: 'neutral',
    },
    stage: {
      kind: 'stage',
      emphasis: 'medium',
      border: 'etched',
      background: 'matte',
      shadow: 'deep-settled',
      temperature: 'neutral',
    },
    sidebar: {
      kind: 'sidebar',
      emphasis: 'medium',
      border: 'soft',
      background: 'cabinet',
      shadow: 'none',
      temperature: 'neutral',
    },
  },
}

const CONTROL_CHROME: Record<ControlKind, ControlChrome> = {
  default: {
    kind: 'default',
    emphasis: 'high',
    palette: 'oxide-blue',
    surface: 'ink-solid',
    radius: '12px',
    focus: 'ring',
  },
  outline: {
    kind: 'outline',
    emphasis: 'medium',
    palette: 'graphite',
    surface: 'lined',
    radius: '12px',
    focus: 'ring',
  },
  ghost: {
    kind: 'ghost',
    emphasis: 'low',
    palette: 'graphite',
    surface: 'quiet',
    radius: '12px',
    focus: 'ring',
  },
}

const TABLE_CHROME: Record<TableChromeKind, TableChrome> = {
  toolbar: {
    kind: 'toolbar',
    surface: 'tool-plate',
    border: 'soft',
    emphasis: 'medium',
  },
  header: {
    kind: 'header',
    surface: 'linen-strip',
    border: 'soft',
    emphasis: 'low',
  },
  row: {
    kind: 'row',
    surface: 'quiet-row',
    border: 'etched',
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
