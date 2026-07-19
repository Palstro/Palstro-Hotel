import type { PostgrestError } from '@supabase/supabase-js';

// CLAUDE.md rule 1: no unbounded reads. Every list query pages through the
// result set with an explicit .range() so it can never silently truncate at
// Supabase's row cap and return partial data as if it were complete.
//
// `build` returns a Supabase query for one page. We keep the parameter type
// permissive (any thenable resolving to { data, error }) rather than tying it
// to a specific PostgrestFilterBuilder/TransformBuilder class, because .range()
// yields a transform builder and pinning the exact class only creates friction
// without adding safety.
type PagedResponse<T> = PromiseLike<{
  data: T[] | null;
  error: PostgrestError | null;
}>;

export async function fetchAllPaged<T>(
  build: (from: number, to: number) => PagedResponse<T>,
  page = 1000,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await build(from, from + page - 1);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < page) break;
  }
  return rows;
}
