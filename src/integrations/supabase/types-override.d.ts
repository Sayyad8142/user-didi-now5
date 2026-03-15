/**
 * Type augmentation for Supabase client.
 * The auto-generated types.ts has empty tables because the app uses
 * an external Supabase project, not Lovable Cloud.
 * This override allows supabase.from() / .rpc() to accept any table/function name.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

declare module '@supabase/supabase-js' {
  interface SupabaseClient<
    Database = any,
    SchemaName extends string & keyof Database = 'public' extends keyof Database
      ? 'public'
      : string & keyof Database,
    Schema extends Record<string, any> = Database[SchemaName] extends Record<string, any>
      ? Database[SchemaName]
      : any
  > {
    from(relation: string): any;
    rpc(fn: string, args?: Record<string, any>, options?: any): any;
  }
}
