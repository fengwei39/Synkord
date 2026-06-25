export {};

declare global {
  interface Window {
    synkord?: {
      getAPIBase: () => Promise<string>;
      windowControl: (action: 'minimize' | 'maximize' | 'close') => void;
    };
  }
}
