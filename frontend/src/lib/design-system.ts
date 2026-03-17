export type DesignMode = 'light' | 'dark'

export type SurfaceKind = 'panel' | 'panel-muted' | 'stage' | 'sidebar'
export type ControlKind = 'default' | 'outline' | 'ghost'
export type TableChromeKind = 'toolbar' | 'header' | 'row'

export interface DesignLanguage {
  mode: DesignMode
  palette: {
    neutralFamily: 'paper-slate'
    accentFamily: 'ink-steel'
    canvasTone: 'folio' | 'night'
  }
  radius: {
    control: '10px'
    panel: '16px'
    stage: '22px'
  }
  shadow: {
    panel: 'flush' | 'anchored'
    stage: 'shelf' | 'deep-shelf'
  }
  density: {
    controls: 'dense'
    panels: 'tight'
  }
}

export interface SurfaceRecipe {
  kind: SurfaceKind
  emphasis: 'structured' | 'medium' | 'low'
  border: 'gridline' | 'divider' | 'quiet'
  background: 'worktop' | 'section' | 'canvas' | 'frame'
  shadow: 'trace' | 'none' | 'flush' | 'anchored' | 'shelf' | 'deep-shelf'
  temperature: 'paper' | 'neutral'
}

export interface ControlChrome {
  kind: ControlKind
  emphasis: 'high' | 'medium' | 'low'
  palette: 'ink-steel' | 'graphite'
  surface: 'solid' | 'lined' | 'subtle'
  radius: '10px'
  focus: 'ring'
}

export interface TableChrome {
  kind: TableChromeKind
  surface: 'workbar' | 'rule-strip' | 'quiet-row'
  border: 'divider' | 'quiet'
  emphasis: 'low'
}

const DESIGN_LANGUAGES: Record<DesignMode, DesignLanguage> = {
  light: {
    mode: 'light',
    palette: {
      neutralFamily: 'paper-slate',
      accentFamily: 'ink-steel',
      canvasTone: 'folio',
    },
    radius: {
      control: '10px',
      panel: '16px',
      stage: '22px',
    },
    shadow: {
      panel: 'flush',
      stage: 'shelf',
    },
    density: {
      controls: 'dense',
      panels: 'tight',
    },
  },
  dark: {
    mode: 'dark',
    palette: {
      neutralFamily: 'paper-slate',
      accentFamily: 'ink-steel',
      canvasTone: 'night',
    },
    radius: {
      control: '10px',
      panel: '16px',
      stage: '22px',
    },
    shadow: {
      panel: 'anchored',
      stage: 'deep-shelf',
    },
    density: {
      controls: 'dense',
      panels: 'tight',
    },
  },
}

const SURFACE_RECIPES: Record<DesignMode, Record<SurfaceKind, SurfaceRecipe>> = {
  light: {
    panel: {
      kind: 'panel',
      emphasis: 'structured',
      border: 'divider',
      background: 'section',
      shadow: 'trace',
      temperature: 'paper',
    },
    'panel-muted': {
      kind: 'panel-muted',
      emphasis: 'low',
      border: 'quiet',
      background: 'canvas',
      shadow: 'none',
      temperature: 'paper',
    },
    stage: {
      kind: 'stage',
      emphasis: 'structured',
      border: 'gridline',
      background: 'worktop',
      shadow: 'shelf',
      temperature: 'paper',
    },
    sidebar: {
      kind: 'sidebar',
      emphasis: 'low',
      border: 'divider',
      background: 'frame',
      shadow: 'none',
      temperature: 'neutral',
    },
  },
  dark: {
    panel: {
      kind: 'panel',
      emphasis: 'structured',
      border: 'divider',
      background: 'section',
      shadow: 'anchored',
      temperature: 'neutral',
    },
    'panel-muted': {
      kind: 'panel-muted',
      emphasis: 'low',
      border: 'quiet',
      background: 'canvas',
      shadow: 'none',
      temperature: 'neutral',
    },
    stage: {
      kind: 'stage',
      emphasis: 'structured',
      border: 'gridline',
      background: 'worktop',
      shadow: 'deep-shelf',
      temperature: 'neutral',
    },
    sidebar: {
      kind: 'sidebar',
      emphasis: 'low',
      border: 'divider',
      background: 'frame',
      shadow: 'none',
      temperature: 'neutral',
    },
  },
}

const CONTROL_CHROME: Record<ControlKind, ControlChrome> = {
  default: {
    kind: 'default',
    emphasis: 'high',
    palette: 'ink-steel',
    surface: 'solid',
    radius: '10px',
    focus: 'ring',
  },
  outline: {
    kind: 'outline',
    emphasis: 'medium',
    palette: 'graphite',
    surface: 'lined',
    radius: '10px',
    focus: 'ring',
  },
  ghost: {
    kind: 'ghost',
    emphasis: 'low',
    palette: 'graphite',
    surface: 'subtle',
    radius: '10px',
    focus: 'ring',
  },
}

const TABLE_CHROME: Record<TableChromeKind, TableChrome> = {
  toolbar: {
    kind: 'toolbar',
    surface: 'workbar',
    border: 'divider',
    emphasis: 'low',
  },
  header: {
    kind: 'header',
    surface: 'rule-strip',
    border: 'divider',
    emphasis: 'low',
  },
  row: {
    kind: 'row',
    surface: 'quiet-row',
    border: 'quiet',
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
