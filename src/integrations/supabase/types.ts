export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      assignments: {
        Row: {
          booking_id: string
          created_at: string
          id: string
          notes: string | null
          status: string
          updated_at: string
          worker_id: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string
          worker_id: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      bathroom_pricing_settings: {
        Row: {
          community: string
          unit_price_inr: number
          updated_at: string
        }
        Insert: {
          community?: string
          unit_price_inr?: number
          updated_at?: string
        }
        Update: {
          community?: string
          unit_price_inr?: number
          updated_at?: string
        }
        Relationships: []
      }
      booking_status_history: {
        Row: {
          booking_id: string
          changed_by: string | null
          created_at: string
          from_status: string | null
          id: string
          note: string | null
          to_status: string | null
        }
        Insert: {
          booking_id: string
          changed_by?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          note?: string | null
          to_status?: string | null
        }
        Update: {
          booking_id?: string
          changed_by?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          note?: string | null
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_status_history_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          assigned_at: string | null
          auto_complete_after_minutes: number | null
          auto_complete_at: string | null
          bathroom_count: number | null
          booking_type: string
          can_cancel_until: string | null
          cancel_reason: string | null
          cancel_source: string | null
          cancelled_at: string | null
          community: string
          completed_at: string | null
          confirmed_at: string | null
          created_at: string
          cust_name: string
          cust_phone: string
          family_count: number | null
          flat_no: string
          flat_size: string | null
          food_pref: string | null
          id: string
          maid_tasks: Database["public"]["Enums"]["maid_task"][] | null
          notes: string | null
          pay_enabled_at: string | null
          prealert_sent: boolean
          price_inr: number | null
          scheduled_date: string | null
          scheduled_time: string | null
          service_type: string
          status: string
          updated_at: string
          user_id: string
          user_marked_paid_at: string | null
          worker_id: string | null
          worker_name: string | null
          worker_phone: string | null
          worker_photo_url: string | null
          worker_upi: string | null
        }
        Insert: {
          assigned_at?: string | null
          auto_complete_after_minutes?: number | null
          auto_complete_at?: string | null
          bathroom_count?: number | null
          booking_type: string
          can_cancel_until?: string | null
          cancel_reason?: string | null
          cancel_source?: string | null
          cancelled_at?: string | null
          community: string
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          cust_name: string
          cust_phone: string
          family_count?: number | null
          flat_no: string
          flat_size?: string | null
          food_pref?: string | null
          id?: string
          maid_tasks?: Database["public"]["Enums"]["maid_task"][] | null
          notes?: string | null
          pay_enabled_at?: string | null
          prealert_sent?: boolean
          price_inr?: number | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          service_type: string
          status?: string
          updated_at?: string
          user_id: string
          user_marked_paid_at?: string | null
          worker_id?: string | null
          worker_name?: string | null
          worker_phone?: string | null
          worker_photo_url?: string | null
          worker_upi?: string | null
        }
        Update: {
          assigned_at?: string | null
          auto_complete_after_minutes?: number | null
          auto_complete_at?: string | null
          bathroom_count?: number | null
          booking_type?: string
          can_cancel_until?: string | null
          cancel_reason?: string | null
          cancel_source?: string | null
          cancelled_at?: string | null
          community?: string
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          cust_name?: string
          cust_phone?: string
          family_count?: number | null
          flat_no?: string
          flat_size?: string | null
          food_pref?: string | null
          id?: string
          maid_tasks?: Database["public"]["Enums"]["maid_task"][] | null
          notes?: string | null
          pay_enabled_at?: string | null
          prealert_sent?: boolean
          price_inr?: number | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          service_type?: string
          status?: string
          updated_at?: string
          user_id?: string
          user_marked_paid_at?: string | null
          worker_id?: string | null
          worker_name?: string | null
          worker_phone?: string | null
          worker_photo_url?: string | null
          worker_upi?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      cook_pricing_settings: {
        Row: {
          base_price_inr: number
          community: string
          non_veg_extra_inr: number
          per_extra_person_inr: number
          updated_at: string
        }
        Insert: {
          base_price_inr?: number
          community?: string
          non_veg_extra_inr?: number
          per_extra_person_inr?: number
          updated_at?: string
        }
        Update: {
          base_price_inr?: number
          community?: string
          non_veg_extra_inr?: number
          per_extra_person_inr?: number
          updated_at?: string
        }
        Relationships: []
      }
      feedback: {
        Row: {
          booking_id: string | null
          category: string
          created_at: string
          id: string
          message: string
          rating: number | null
          user_id: string
        }
        Insert: {
          booking_id?: string | null
          category: string
          created_at?: string
          id?: string
          message: string
          rating?: number | null
          user_id: string
        }
        Update: {
          booking_id?: string | null
          category?: string
          created_at?: string
          id?: string
          message?: string
          rating?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      maid_pricing_tasks: {
        Row: {
          active: boolean
          community: string
          created_at: string
          flat_size: string
          id: number
          price_inr: number
          task: Database["public"]["Enums"]["maid_task"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          community?: string
          created_at?: string
          flat_size: string
          id?: never
          price_inr: number
          task: Database["public"]["Enums"]["maid_task"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          community?: string
          created_at?: string
          flat_size?: string
          id?: never
          price_inr?: number
          task?: Database["public"]["Enums"]["maid_task"]
          updated_at?: string
        }
        Relationships: []
      }
      ops_settings: {
        Row: {
          key: string
          value: string
        }
        Insert: {
          key: string
          value: string
        }
        Update: {
          key?: string
          value?: string
        }
        Relationships: []
      }
      pricing: {
        Row: {
          active: boolean
          community: string | null
          created_at: string
          effective_from: string | null
          flat_size: string
          id: number
          price_inr: number
          service_type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          community?: string | null
          created_at?: string
          effective_from?: string | null
          flat_size: string
          id?: number
          price_inr: number
          service_type: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          community?: string | null
          created_at?: string
          effective_from?: string | null
          flat_size?: string
          id?: number
          price_inr?: number
          service_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          community: string
          created_at: string
          flat_no: string
          full_name: string
          id: string
          is_admin: boolean
          legal_version: string | null
          phone: string
          privacy_accepted_at: string | null
          tos_accepted_at: string | null
          updated_at: string
        }
        Insert: {
          community: string
          created_at?: string
          flat_no: string
          full_name: string
          id?: string
          is_admin?: boolean
          legal_version?: string | null
          phone: string
          privacy_accepted_at?: string | null
          tos_accepted_at?: string | null
          updated_at?: string
        }
        Update: {
          community?: string
          created_at?: string
          flat_no?: string
          full_name?: string
          id?: string
          is_admin?: boolean
          legal_version?: string | null
          phone?: string
          privacy_accepted_at?: string | null
          tos_accepted_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      worker_ratings: {
        Row: {
          booking_id: string
          comment: string | null
          created_at: string
          id: string
          rating: number
          user_id: string
          worker_id: string | null
        }
        Insert: {
          booking_id: string
          comment?: string | null
          created_at?: string
          id?: string
          rating: number
          user_id: string
          worker_id?: string | null
        }
        Update: {
          booking_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          rating?: number
          user_id?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "worker_ratings_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_ratings_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      workers: {
        Row: {
          community: string | null
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          phone: string
          photo_url: string | null
          service_types: string[]
          updated_at: string
          upi_id: string
        }
        Insert: {
          community?: string | null
          created_at?: string
          full_name: string
          id?: string
          is_active?: boolean
          phone: string
          photo_url?: string | null
          service_types?: string[]
          updated_at?: string
          upi_id: string
        }
        Update: {
          community?: string | null
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          phone?: string
          photo_url?: string | null
          service_types?: string[]
          updated_at?: string
          upi_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      worker_rating_stats: {
        Row: {
          avg_rating: number | null
          ratings_count: number | null
          worker_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "worker_ratings_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _get_int_setting: {
        Args: { default_val: number; k: string }
        Returns: number
      }
      _sla_core_work: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      admin_cancel_booking: {
        Args: { p_booking_id: string; p_reason: string }
        Returns: undefined
      }
      admin_get_web_version: {
        Args: Record<PropertyKey, never>
        Returns: {
          force: boolean
          web_version: string
        }[]
      }
      admin_set_booking_status: {
        Args: { p_booking_id: string; p_new_status: string; p_note?: string }
        Returns: undefined
      }
      admin_set_web_version: {
        Args: { force?: boolean; new_version: string }
        Returns: undefined
      }
      admin_upsert_worker: {
        Args:
          | {
              p_community: string
              p_full_name: string
              p_is_active?: boolean
              p_phone: string
              p_photo_url?: string
              p_service_types: string[]
              p_upi_id: string
            }
          | { p_worker: Json }
        Returns: {
          community: string | null
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          phone: string
          photo_url: string | null
          service_types: string[]
          updated_at: string
          upi_id: string
        }
      }
      assign_worker: {
        Args: { p_booking_id: string; p_worker_id: string }
        Returns: undefined
      }
      assign_worker_to_booking: {
        Args:
          | {
              p_assigned_by?: string
              p_booking_id: string
              p_worker_id: string
            }
          | { p_booking_id: string; p_worker_id: string }
        Returns: undefined
      }
      auto_complete_assigned: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      auto_handle_overdue_bookings: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      bath_total_price: {
        Args: { p_community?: string; p_count: number }
        Returns: number
      }
      bytea_to_text: {
        Args: { data: string }
        Returns: string
      }
      delete_my_data: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      escalate_overdue_bookings: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      export_my_data: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      get_setting: {
        Args: { p_default: string; p_key: string }
        Returns: string
      }
      get_setting_int: {
        Args: { p_default: number; p_key: string }
        Returns: number
      }
      gtrgm_compress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_decompress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_in: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_options: {
        Args: { "": unknown }
        Returns: undefined
      }
      gtrgm_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      http: {
        Args: { request: Database["public"]["CompositeTypes"]["http_request"] }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
      }
      http_delete: {
        Args:
          | { content: string; content_type: string; uri: string }
          | { uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
      }
      http_get: {
        Args: { data: Json; uri: string } | { uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
      }
      http_head: {
        Args: { uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
      }
      http_header: {
        Args: { field: string; value: string }
        Returns: Database["public"]["CompositeTypes"]["http_header"]
      }
      http_list_curlopt: {
        Args: Record<PropertyKey, never>
        Returns: {
          curlopt: string
          value: string
        }[]
      }
      http_patch: {
        Args: { content: string; content_type: string; uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
      }
      http_post: {
        Args:
          | { content: string; content_type: string; uri: string }
          | { data: Json; uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
      }
      http_put: {
        Args: { content: string; content_type: string; uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
      }
      http_reset_curlopt: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      http_set_curlopt: {
        Args: { curlopt: string; value: string }
        Returns: boolean
      }
      is_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      maid_total_price: {
        Args: {
          p_community?: string
          p_flat: string
          p_tasks: Database["public"]["Enums"]["maid_task"][]
        }
        Returns: number
      }
      norm_phone: {
        Args: { p: string }
        Returns: string
      }
      pending_sla_minutes: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      run_scheduled_prealerts: {
        Args: { p_window_minutes?: number }
        Returns: undefined
      }
      run_sla_with_secret: {
        Args: { p_secret: string }
        Returns: undefined
      }
      set_limit: {
        Args: { "": number }
        Returns: number
      }
      show_limit: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      show_trgm: {
        Args: { "": string }
        Returns: string[]
      }
      text_to_bytea: {
        Args: { data: string }
        Returns: string
      }
      urlencode: {
        Args: { data: Json } | { string: string } | { string: string }
        Returns: string
      }
      user_cancel_booking: {
        Args: { p_booking_id: string; p_reason: string }
        Returns: undefined
      }
    }
    Enums: {
      maid_task: "floor_cleaning" | "dish_washing"
    }
    CompositeTypes: {
      http_header: {
        field: string | null
        value: string | null
      }
      http_request: {
        method: unknown | null
        uri: string | null
        headers: Database["public"]["CompositeTypes"]["http_header"][] | null
        content_type: string | null
        content: string | null
      }
      http_response: {
        status: number | null
        content_type: string | null
        headers: Database["public"]["CompositeTypes"]["http_header"][] | null
        content: string | null
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      maid_task: ["floor_cleaning", "dish_washing"],
    },
  },
} as const
