import { useEffect, useState } from 'react';

/**
 * The value, once it has stopped changing for `delayMs`.
 *
 * For search-as-you-type: without it every keystroke becomes a request, and a
 * slow early response can land after a later one and replace newer results.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
