export interface NavigationContainerRef {
  getCurrentRoute?: () => { name?: string } | undefined;
  getRootState?: () => unknown;
  addListener: (event: string, callback: () => void) => () => void;
}
