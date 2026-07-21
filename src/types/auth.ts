// Auth / membership types. Keep in sync with supabase/migrations/001 (the
// tenant_users.role check constraint) — do not add roles the schema does not
// allow, or a value here would fail the DB constraint at write time.

// The full set of roles allowed by tenant_users_role_check in 001. Kept as a
// union so no role string is written as a literal in a component (rule 17-ish:
// membership strings live in one place).
export type TenantRole =
  | 'owner'
  | 'manager'
  | 'front_desk'
  | 'housekeeping_supervisor'
  | 'housekeeper'
  | 'server'
  | 'kitchen'
  | 'barman'
  | 'accountant'
  | 'maintenance';

// Admin roles: the two that is_tenant_admin() recognises in 001. isAdmin in the
// tenant context is derived from this set so the app and the DB agree on who an
// admin is.
export const ADMIN_ROLES: readonly TenantRole[] = ['owner', 'manager'];

// A single tenant_users row for the current user, joined to its tenant so the
// admin UI can show the tenant name. Only the columns the app actually reads.
export interface TenantMembership {
  id: string;
  tenant_id: string;
  role: TenantRole;
  is_active: boolean;
  // Embedded parent tenant (PostgREST `tenant:tenants(...)`). Nullable because a
  // join can, in principle, come back empty; callers treat that as "no name".
  tenant: {
    id: string;
    name: string;
    slug: string;
  } | null;
}
