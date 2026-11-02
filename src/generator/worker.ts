/// <reference lib="webworker" />
import { search, type SearchOptions } from './search';

self.onmessage = (e: MessageEvent<SearchOptions>) => {
  const result = search(e.data);
  (self as DedicatedWorkerGlobalScope).postMessage(result);
};
