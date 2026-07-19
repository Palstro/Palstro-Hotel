import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { resolveProperty } from '../lib/resolveProperty';
import type { Property, PropertySettings, Tenant } from '../types/tenant';

interface PropertyContextValue {
  property: Property | null;
  settings: PropertySettings | null;
  tenant: Tenant | null;
  loading: boolean;
  error: Error | null;
}

const PropertyContext = createContext<PropertyContextValue | undefined>(
  undefined,
);

export function PropertyContextProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [property, setProperty] = useState<Property | null>(null);
  const [settings, setSettings] = useState<PropertySettings | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const ctx = await resolveProperty();
        if (cancelled) return;
        if (ctx) {
          setProperty(ctx.property);
          setSettings(ctx.settings);
          setTenant(ctx.tenant);
        }
        // ctx === null is "not-found": no state set, no error raised.
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PropertyContext.Provider
      value={{ property, settings, tenant, loading, error }}
    >
      {children}
    </PropertyContext.Provider>
  );
}

export function usePropertyContext(): PropertyContextValue {
  const value = useContext(PropertyContext);
  if (value === undefined) {
    throw new Error(
      'usePropertyContext must be used within a PropertyContextProvider',
    );
  }
  return value;
}
