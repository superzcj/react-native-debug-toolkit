export const Colors = {
  // Primary accent
  primary: '#2DD4BF',
  primaryLight: '#67E8F9',
  primaryDim: '#134E4A',
  primaryGhost: 'rgba(45,212,191,0.12)',

  // Text — 3-level hierarchy
  text: '#F4F7F8',
  textSecondary: '#B7C0C7',
  textMuted: '#7B8790',
  textInverse: '#07100F',

  // Surface — 3-level depth
  background: '#111416',
  surface: '#171B1E',
  surfaceElevated: '#22282C',
  surfaceHover: '#1C2226',

  // Border
  border: '#30383D',
  borderLight: '#242A2E',
  borderFocus: '#2DD4BF',

  // Status
  success: '#84CC16',
  successDim: 'rgba(132,204,22,0.12)',
  error: '#FB7185',
  errorDim: 'rgba(251,113,133,0.12)',
  warning: '#FACC15',
  warningDim: 'rgba(250,204,21,0.12)',
  info: '#38BDF8',

  // Rail
  railBackground: '#0E1113',
  railInactiveText: '#7B8790',
  railActiveText: '#F4F7F8',
  railActiveBg: 'rgba(45,212,191,0.11)',
  railActiveBar: '#2DD4BF',
  panelDivider: 'rgba(183,192,199,0.12)',

  // Drag handle
  dragHandle: '#4B555B',

  // HTTP Method Colors
  get: '#38BDF8',
  post: '#84CC16',
  put: '#FACC15',
  delete: '#FB7185',
  patch: '#A78BFA',

  // Code / JSON viewer
  codeBackground: '#0B0E10',
  codeBorder: '#242A2E',
  codeText: '#D6DEE3',
  codeKey: '#67E8F9',
  codeString: '#BBF7D0',
  codeNumber: '#C4B5FD',
  codeBoolean: '#67E8F9',
  codeNull: '#FB7185',
  codeComment: '#7B8790',
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
