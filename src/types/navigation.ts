export interface DebugNavigationRef {
  isReady?(): boolean;
  getCurrentRoute(): { key?: string; name: string } | undefined;
  getRootState(): unknown;
  addListener(event: 'state', callback: () => void): () => void;
}
