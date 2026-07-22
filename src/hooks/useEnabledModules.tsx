import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { supabase } from '../lib/supabase';
import { useTenantContext } from './useTenantContext';
import type { AdminModule } from '../components/admin/adminNav';

// Which admin modules the active tenant has bought (migration 006). Read once
// from tenant_settings.enabled_modules and shared — like ActivePropertyProvider,
// the provider holds the fetch so both the sidebar (which hides unbought
// modules) and the route guard (which blocks their URLs) consume ONE query
// rather than each refetching.
//
// This is a UX guard only. RLS remains the real enforcement (rule 19): hiding a
// nav item does not protect the data behind it — the module's own tables do,
// via their policies. So the failure modes here fail OPEN cosmetically (see
// isEnabled) rather than risk hiding a module a tenant legitimately paid for.

interface EnabledModulesValue {
  // The raw list for the active tenant, or null while loading / on error / when
  // there is no active tenant.
  enabledModules: string[] | null;
  // Settings is never disableable (a DB check constraint guarantees it), so it
  // is always enabled. Every other module is enabled only once the list has
  // loaded and contains it; while the list is unknown (loading, error, no
  // tenant) callers fail open, because RLS — not this filter — is the real gate.
  isEnabled: (module: AdminModule) => boolean;
  loading: boolean;
  error: Error | null;
}

const EnabledModulesContext = createContext<EnabledModulesValue | undefined>(
  undefined,
);

export function EnabledModulesProvider({ children }: { children: ReactNode }) {
  const { tenantId, loading: tenantLoading } = useTenantContext();

  const [enabledModules, setEnabledModules] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Wait for the tenant context to settle before deciding there is none.
    if (tenantLoading) return;

    (async () => {
      // No active tenant → nothing to resolve; clear and stop.
      if (!tenantId) {
        if (cancelled) return;
        setEnabledModules(null);
        setError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        // A single row keyed by tenant_id (not a list), so maybeSingle — no
        // pagination needed. Still scoped to the active tenant per rule 19:
        // RLS restricts to the user's tenants, this .eq narrows to the one
        // active tenant among them.
        const { data, error: qErr } = await supabase
          .from('tenant_settings')
          .select('enabled_modules')
          .eq('tenant_id', tenantId)
          .maybeSingle();
        if (qErr) throw qErr;
        if (cancelled) return;
        // A settings row is guaranteed by the 001 AFTER INSERT trigger, so data
        // should never be null; treat a missing row defensively as "unknown".
        setEnabledModules(data?.enabled_modules ?? null);
      } catch (e) {
        if (cancelled) return;
        // Surfaced via `error` (rule 11). Consumers fail open cosmetically —
        // RLS still guards the data — so a transient read error never hides a
        // paid-for module.
        setError(e instanceof Error ? e : new Error(String(e)));
        setEnabledModules(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tenantId, tenantLoading]);

  function isEnabled(module: AdminModule): boolean {
    // Settings can never be disabled — enforced in the DB, mirrored here.
    if (module === 'settings') return true;
    // Unknown list (loading / error / no tenant) → fail open (RLS is the gate).
    if (enabledModules === null) return true;
    return enabledModules.includes(module);
  }

  const value: EnabledModulesValue = {
    enabledModules,
    isEnabled,
    loading,
    error,
  };

  return (
    <EnabledModulesContext.Provider value={value}>
      {children}
    </EnabledModulesContext.Provider>
  );
}

export function useEnabledModules(): EnabledModulesValue {
  const value = useContext(EnabledModulesContext);
  if (value === undefined) {
    throw new Error(
      'useEnabledModules must be used within an EnabledModulesProvider',
    );
  }
  return value;
}
