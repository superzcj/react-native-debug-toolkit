export const Colors = {
  // Primary accent — teal/cyan
  primary: '#0EA5E9',
  primaryLight: '#38BDF8',
  primaryDim: '#0C4A6E',
  primaryGhost: 'rgba(14,165,233,0.12)',

  // Text — 3-level hierarchy
  text: '#E2E8F0',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  textInverse: '#0F172A',

  // Surface — 3-level depth
  background: '#1E293B',
  surface: '#0F172A',
  surfaceElevated: '#334155',
  surfaceHover: '#1E293B',

  // Border
  border: '#334155',
  borderLight: '#1E293B',
  borderFocus: '#0EA5E9',

  // Status
  success: '#22C55E',
  successDim: 'rgba(34,197,94,0.12)',
  error: '#EF4444',
  errorDim: 'rgba(239,68,68,0.12)',
  warning: '#F59E0B',
  warningDim: 'rgba(245,158,11,0.12)',
  info: '#0EA5E9',

  // Rail
  railBackground: '#0F172A',
  railInactiveText: '#64748B',
  railActiveText: '#E2E8F0',
  railActiveBg: 'rgba(14,165,233,0.08)',
  railActiveBar: '#0EA5E9',
  panelDivider: '#1E293B',

  // Drag handle
  dragHandle: '#475569',

  // HTTP Method Colors
  get: '#38BDF8',
  post: '#22C55E',
  put: '#F59E0B',
  delete: '#EF4444',
  patch: '#A78BFA',

  // Code / JSON viewer
  codeBackground: '#0F172A',
  codeBorder: '#1E293B',
  codeText: '#CBD5E1',
  codeKey: '#7DD3FC',
  codeString: '#86EFAC',
  codeNumber: '#C4B5FD',
  codeBoolean: '#7DD3FC',
  codeNull: '#F87171',
  codeComment: '#64748B',
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
