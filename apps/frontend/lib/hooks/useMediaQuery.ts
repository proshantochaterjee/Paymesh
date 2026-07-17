import { useEffect, useState } from "react";

/**
 * SSR-safe media query hook. Starts `false` on the server/first client
 * render (no `window` yet) and syncs to the real value in an effect —
 * used to decide when the desktop-only sidebar-collapse preference
 * should actually apply, since that decision needs the real viewport
 * width, not just a CSS breakpoint (see Sidebar.tsx).
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mediaQueryList = window.matchMedia(query);
    setMatches(mediaQueryList.matches);

    const listener = (event: MediaQueryListEvent) => setMatches(event.matches);
    mediaQueryList.addEventListener("change", listener);
    return () => mediaQueryList.removeEventListener("change", listener);
  }, [query]);

  return matches;
}
