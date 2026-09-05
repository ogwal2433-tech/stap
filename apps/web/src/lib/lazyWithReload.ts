/* eslint-disable @typescript-eslint/no-explicit-any */
import { lazy, type ComponentType } from 'react';

/**
 * `lazy()` that survives a deploy.
 *
 * Vite names every chunk after a hash of its contents, and a rebuild deletes the
 * previous set. A browser that already has the page open is holding an
 * index.html that names the old chunks, so the first lazy route it visits after
 * a deploy asks for a file that is no longer there and React unmounts the app
 * with "Failed to fetch dynamically imported module".
 *
 * Cache headers cannot fix that one: the page was loaded before the deploy. The
 * only recovery is to fetch the current index.html, which a reload does.
 *
 * The reload is allowed once per session key. Without that guard a genuinely
 * missing chunk — a bad build, an asset that never uploaded — would reload
 * forever, and an endless flicker is a far worse failure than an error message.
 */
export function lazyWithReload<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  key:    string,
) {
  return lazy(() =>
    factory().catch((err) => {
      const flag = `chunk-reloaded:${key}`;

      let alreadyTried = true; // assume tried, so storage failures do not loop
      try {
        alreadyTried = sessionStorage.getItem(flag) === '1';
        if (!alreadyTried) sessionStorage.setItem(flag, '1');
      } catch {
        // Private browsing and blocked site data throw here. Reloading blind
        // could loop, so treat it as already tried and surface the error.
      }

      if (!alreadyTried) {
        window.location.reload();
        // Never settles — the reload replaces the page. Resolving instead would
        // flash an error in the moment before it happens.
        return new Promise<{ default: T }>(() => {});
      }

      throw err;
    }),
  );
}
