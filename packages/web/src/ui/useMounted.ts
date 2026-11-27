import { useLayoutEffect, useRef } from "react";

/**
 * Whether the calling component is still mounted, for work that settles after an await. A layout effect clears the flag
 * in the commit that removes the component; a passive effect would clear it later, leaving a gap in which a settling
 * read still sees it mounted.
 */
export function useMounted(): { readonly current: boolean } {
  const mounted = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return mounted;
}
