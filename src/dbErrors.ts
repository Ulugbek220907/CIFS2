export interface SupabaseErrorLike {
  code?: string;
  message?: string;
}

export interface WriteContext {
  /** Lead sentence of the thrown error, e.g. "Theme names were not saved." */
  failure: string;
  table: string;
  migration: string;
}

export function describeWriteError(error: SupabaseErrorLike, context: WriteContext): string {
  const message = error.message ?? '';
  if (error.code === 'PGRST205' || error.code === '42P01') {
    return `The ${context.table} table does not exist yet. Run supabase/migrations/${context.migration} in the Supabase SQL editor.`;
  }
  if (error.code === '42501' || /row-level security/i.test(message)) {
    return 'Supabase refused the change. Sign out and sign back in as an admin.';
  }
  if (/jwt/i.test(message)) {
    return 'Your admin session has expired. Sign in again and retry.';
  }
  return message || 'Unknown Supabase error.';
}

/** Awaits a Supabase write and throws a readable Error when it was rejected. */
export async function assertWriteOk(
  request: PromiseLike<{ error: SupabaseErrorLike | null }>,
  context: WriteContext,
): Promise<void> {
  const { error } = await request;
  if (error) {
    throw new Error(`${context.failure} ${describeWriteError(error, context)}`);
  }
}
