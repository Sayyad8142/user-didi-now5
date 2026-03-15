/**
 * The auto-generated types.ts has empty tables because the app uses
 * an external Supabase project. This augmentation adds permissive
 * overloads so supabase.from() and .rpc() accept any table/function name.
 */
import '@supabase/supabase-js';

declare module '@supabase/postgrest-js' {
  interface PostgrestClient<Schema extends Record<string, any>> {
    from(relation: string): any;
    rpc(fn: string, args?: Record<string, any>, options?: any): any;
  }
}
