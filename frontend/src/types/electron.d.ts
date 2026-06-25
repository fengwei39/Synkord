export {};

declare global {
  interface Window {
    synkord?: {
      getAPIBase: () => Promise<string>;
    };
  }
}
