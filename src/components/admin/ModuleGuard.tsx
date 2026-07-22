import type { ReactNode } from 'react';
import { useEnabledModules } from '../../hooks/useEnabledModules';
import type { AdminModule } from './adminNav';
import { ModuleNotAvailablePage } from '../../pages/admin/ModuleNotAvailablePage';

// Wraps a module's route content and, if that module is disabled for the active
// tenant (migration 006), renders the SAME "not available" page an unknown URL
// segment gets — so a disabled module reached by typing its URL looks identical
// to one that was never built, rather than exposing a screen the tenant hid.
//
// This is a UX GUARD ONLY. RLS remains the real enforcement (rule 19): the
// module's own tables refuse the data regardless of what this renders. So while
// the flag list is still loading isEnabled fails open and we render children —
// the underlying policies still protect anything sensitive, and the brief window
// never leaks data.
//
// Settings (the one built route today) can never be disabled, so its guard
// always passes; wiring it here establishes the pattern every future module
// route follows.
export function ModuleGuard({
  module,
  children,
}: {
  module: AdminModule;
  children: ReactNode;
}) {
  const { isEnabled } = useEnabledModules();

  if (!isEnabled(module)) {
    return <ModuleNotAvailablePage />;
  }

  return <>{children}</>;
}
