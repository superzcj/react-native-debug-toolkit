export const Colors = {
  // Primary accent
  primary: '#4DA3FF',
  primaryLight: '#8CC8FF',
  primaryDim: '#173B5F',
  primaryGhost: 'rgba(77,163,255,0.12)',

  // Text — 3-level hierarchy
  text: '#F3F5F7',
  textSecondary: '#B8C0C8',
  textMuted: '#7D8790',
  textInverse: '#071018',

  // Surface — 3-level depth
  background: '#0F1114',
  surface: '#171A1F',
  surfaceElevated: '#20242B',
  surfaceHover: '#1E232A',
  surfaceInset: '#101317',
  chrome: '#171A1F',
  chromeRaised: '#20242B',
  chromeBorder: '#303741',
  fabBackground: 'rgba(23,26,31,0.96)',
  fabHighlight: 'rgba(255,255,255,0.07)',
  tabActiveBackground: '#242B34',

  // Border
  border: '#303741',
  borderLight: '#242A31',
  borderFocus: '#4DA3FF',

  // Status
  success: '#35C759',
  successDim: 'rgba(53,199,89,0.12)',
  error: '#FF6B6B',
  errorDim: 'rgba(255,107,107,0.12)',
  warning: '#F5A524',
  warningDim: 'rgba(245,165,36,0.12)',
  info: '#60A5FA',

  // Rail
  railBackground: '#171A1F',
  railInactiveText: '#7D8790',
  railActiveText: '#F3F5F7',
  railActiveBg: 'rgba(77,163,255,0.12)',
  railActiveBar: '#4DA3FF',
  railGlow: 'rgba(77,163,255,0.11)',
  railShade: 'rgba(0,0,0,0.18)',
  panelDivider: 'rgba(184,192,200,0.12)',

  // Drag handle
  dragHandle: '#4D5963',

  // HTTP Method Colors
  get: '#60A5FA',
  post: '#35C759',
  put: '#F5A524',
  delete: '#FF6B6B',
  patch: '#A78BFA',

  // Code / JSON viewer
  codeBackground: '#0B0D10',
  codeBorder: '#242A31',
  codeText: '#D8DEE5',
  codeKey: '#8CC8FF',
  codeString: '#B8F3C6',
  codeNumber: '#C4B5FD',
  codeBoolean: '#8CC8FF',
  codeNull: '#FF6B6B',
  codeComment: '#7D8790',
} as const;

export function getMethodColor(method: string): string {
  switch (method.toUpperCase()) {
    case 'GET': return Colors.get;
    case 'POST': return Colors.post;
    case 'PUT': return Colors.put;
    case 'DELETE': return Colors.delete;
    case 'PATCH': return Colors.patch;
    default: return Colors.textSecondary;
  }
}
