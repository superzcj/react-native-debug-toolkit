export const Colors = {
  // Primary
  primary: '#007AFF',
  primaryLight: '#4DA3FF',
  primaryDark: '#0055CC',

  // Text
  text: '#1C1C1E',
  textSecondary: '#8E8E93',
  textLight: '#C7C7CC',
  textInverse: '#FFFFFF',

  // Surface & Background
  background: '#F2F2F7',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  border: '#E5E5EA',
  borderLight: '#F0F0F5',

  // Status
  success: '#34C759',
  successLight: '#E8F9EE',
  error: '#FF3B30',
  errorLight: '#FFF0EF',
  warning: '#FF9500',
  warningLight: '#FFF5E5',
  info: '#5AC8FA',
  infoLight: '#EDF8FF',

  // Accent
  purple: '#AF52DE',
  purpleLight: '#F3E8FF',

  // Panel
  railBackground: '#1C2433',
  railInactiveText: '#8899AA',
  railActiveText: '#FFFFFF',
  railActiveBg: 'rgba(255,255,255,0.12)',
  panelDivider: '#2A3544',
  panelAccentStart: '#007AFF',
  panelAccentEnd: '#AF52DE',
  dragHandle: '#B0B8C4',

  // Signal backgrounds
  signalRedBg: '#FFE9E7',
  signalAmberBg: '#FFF1D6',
  signalDefaultBg: '#E7EDF5',

  // HTTP Method Colors
  get: '#007AFF',
  post: '#34C759',
  put: '#FF9500',
  delete: '#FF3B30',
  patch: '#5AC8FA',

  // Code / JSON viewer
  codeBackground: '#1E1E2E',
  codeBorder: '#313244',
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
