import { useCallback, useEffect, useState } from 'react';
import { useBlocker } from 'react-router-dom';

// Guards against silently losing unsaved edits (3.txt §5). A hotel admin edits a
// page, gets distracted, clicks elsewhere — and must be asked before their work
// is thrown away. Losing it once loses their trust in the whole product.
//
// Two escape routes are covered:
//   - IN-APP navigation (clicking another nav item, switching property) —
//     react-router's useBlocker intercepts the transition so we can confirm.
//   - TAB CLOSE / reload / external navigation — the browser's beforeunload,
//     the only hook available for those, shows the browser's own prompt.
//
// useBlocker requires a DATA router (createBrowserRouter + RouterProvider); the
// app is wired that way for exactly this reason.
//
// Usage: const { isDirty, markDirty, markClean } = useDirtyForm();
//   call markDirty() on the first edit, markClean() after a successful save.

interface DirtyForm {
  isDirty: boolean;
  markDirty: () => void;
  markClean: () => void;
}

export function useDirtyForm(): DirtyForm {
  const [isDirty, setIsDirty] = useState(false);

  const markDirty = useCallback(() => setIsDirty(true), []);
  const markClean = useCallback(() => setIsDirty(false), []);

  // Only block a transition that actually changes location while dirty — never
  // block a same-URL update (e.g. a query-string tweak), which would trap the
  // user with a confirm they cannot escape.
  const blocker = useBlocker(
    useCallback(
      ({ currentLocation, nextLocation }) =>
        isDirty &&
        currentLocation.pathname !== nextLocation.pathname,
      [isDirty],
    ),
  );

  // When the blocker fires, confirm with the user. Proceeding lets the
  // navigation continue and clears the dirty flag (they chose to discard);
  // cancelling resets the blocker and keeps them on the page.
  //
  // Reacting to the blocker's EXTERNAL state transition by opening a confirm
  // dialog is exactly what an effect is for, and is the canonical useBlocker
  // pattern from react-router's own docs — so the set-state-in-effect rule is
  // disabled for the one intentional line rather than contorting the flow.
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    const discard = window.confirm(
      'You have unsaved changes. Leave this page and discard them?',
    );
    if (discard) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsDirty(false);
      blocker.proceed();
    } else {
      blocker.reset();
    }
  }, [blocker]);

  // Tab close / reload: the browser only honours a cancelled beforeunload with a
  // returnValue set. Attach the listener only while dirty so a clean form never
  // nags on close.
  useEffect(() => {
    if (!isDirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      // Modern browsers ignore custom text and show their own message, but
      // returnValue must be set (to any string) to trigger the prompt.
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  return { isDirty, markDirty, markClean };
}
