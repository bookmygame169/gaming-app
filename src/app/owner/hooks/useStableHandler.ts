import { useCallback, useEffect, useRef } from "react";

/**
 * Gives an event handler one identity for the life of the component, while it
 * still sees the newest state.
 *
 * The owner dashboard's context value is memoised so that every screen reading
 * it does not re-render on each keystroke. That memo closes over some
 * thirty-four values, twenty-five of which are handlers, and the honest
 * dependency list would have rebuilt it on every render — the exact thing the
 * memo exists to prevent. So the list was suppressed instead, which meant a
 * handler could go stale with nothing to catch it.
 *
 * useCallback was not the answer here. Fourteen of those handlers call another
 * one, so each would have to name the others; a `const` cannot appear in a
 * dependency array declared above it, and fifteen of them are hoisted `async
 * function` declarations. Making that honest means topologically ordering
 * twenty-five functions in a 2,500-line file and getting every dependency right
 * with no way to run the result.
 *
 * This is the pattern React itself arrived at for the same problem — the ref
 * holds the newest closure, the returned function never changes. There is no
 * dependency list to get wrong, no ordering to work out, and no cycle to break.
 *
 * The one rule: call the result from an event or an effect, never during
 * render. Before the first commit the ref holds the closure from the render
 * that created it, which is correct for anything that happens after paint and
 * wrong for anything that happens during it. That is the same constraint React
 * puts on useEffectEvent.
 */
export function useStableHandler<Args extends unknown[], Result>(
  handler: (...args: Args) => Result
): (...args: Args) => Result {
  const latest = useRef(handler);

  // After every commit, so the identity below always calls the newest closure.
  useEffect(() => {
    latest.current = handler;
  });

  return useCallback((...args: Args) => latest.current(...args), []);
}
