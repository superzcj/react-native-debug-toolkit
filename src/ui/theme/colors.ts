export const Colors = {
  primary: '#007AFF',
  text: '#1C1C1E',
  textSecondary: '#8E8E93',
  textLight: '#C7C7CC',
  border: '#E5E5EA',
  background: '#F2F2F7',
  surface: '#FFFFFF',

  success: '#34C759',
  error: '#FF3B30',
  warning: '#FF9500',
  info: '#5AC8FA',

  purple: '#AF52DE',

  // Panel-specific
  railBackground: '#E8EEF6',
  panelDivider: '#CED8E4',
  signalRedBg: '#FFE9E7',
  signalAmberBg: '#FFF1D6',
  signalDefaultBg: '#E7EDF5',

  get: '#007AFF',
  post: '#34C759',
  put: '#FF9500',
  delete: '#FF3B30',
  patch: '#5AC8FA',
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
