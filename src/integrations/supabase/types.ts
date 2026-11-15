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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      healthcare_profiles: {
        Row: {
          created_at: string
          created_by: string
          date_of_birth: string | null
          display_name: string
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          id: string
          time_zone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          date_of_birth?: string | null
          display_name: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          id?: string
          time_zone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          date_of_birth?: string | null
          display_name?: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          id?: string
          time_zone?: string
          updated_at?: string
        }
        Relationships: []
      }
      medication_dose_events: {
        Row: {
          healthcare_profile_id: string
          id: string
          idempotency_key: string
          medication_dose_log_id: string
          note: string
          performed_by: string
          recorded_at: string
          status: string
        }
        Insert: {
          healthcare_profile_id: string
          id?: string
          idempotency_key: string
          medication_dose_log_id: string
          note?: string
          performed_by: string
          recorded_at?: string
          status: string
        }
        Update: {
          healthcare_profile_id?: string
          id?: string
          idempotency_key?: string
          medication_dose_log_id?: string
          note?: string
          performed_by?: string
          recorded_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "medication_dose_events_healthcare_profile_id_fkey"
            columns: ["healthcare_profile_id"]
            isOneToOne: false
            referencedRelation: "healthcare_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medication_dose_events_medication_dose_log_id_fkey"
            columns: ["medication_dose_log_id"]
            isOneToOne: false
            referencedRelation: "medication_dose_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      medication_dose_logs: {
        Row: {
          confirmed_by: string | null
          created_at: string
          healthcare_profile_id: string
          id: string
          medication_id: string
          note: string
          scheduled_for: string
          snoozed_until: string | null
          status: string
          taken_at: string | null
        }
        Insert: {
          confirmed_by?: string | null
          created_at?: string
          healthcare_profile_id: string
          id?: string
          medication_id: string
          note?: string
          scheduled_for: string
          snoozed_until?: string | null
          status: string
          taken_at?: string | null
        }
        Update: {
          confirmed_by?: string | null
          created_at?: string
          healthcare_profile_id?: string
          id?: string
          medication_id?: string
          note?: string
          scheduled_for?: string
          snoozed_until?: string | null
          status?: string
          taken_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medication_dose_logs_healthcare_profile_id_fkey"
            columns: ["healthcare_profile_id"]
            isOneToOne: false
            referencedRelation: "healthcare_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medication_dose_logs_medication_id_healthcare_profile_id_fkey"
            columns: ["medication_id", "healthcare_profile_id"]
            isOneToOne: false
            referencedRelation: "medications"
            referencedColumns: ["id", "healthcare_profile_id"]
          },
        ]
      }
      medications: {
        Row: {
          created_at: string
          created_by: string
          dosage: string
          end_date: string | null
          frequency: string
          healthcare_profile_id: string
          id: string
          instructions: string
          is_active: boolean
          name: string
          prescribing_doctor: string
          scheduled_times: string[]
          start_date: string
          updated_at: string
          weekdays: number[]
        }
        Insert: {
          created_at?: string
          created_by: string
          dosage: string
          end_date?: string | null
          frequency: string
          healthcare_profile_id: string
          id?: string
          instructions?: string
          is_active?: boolean
          name: string
          prescribing_doctor?: string
          scheduled_times: string[]
          start_date?: string
          updated_at?: string
          weekdays?: number[]
        }
        Update: {
          created_at?: string
          created_by?: string
          dosage?: string
          end_date?: string | null
          frequency?: string
          healthcare_profile_id?: string
          id?: string
          instructions?: string
          is_active?: boolean
          name?: string
          prescribing_doctor?: string
          scheduled_times?: string[]
          start_date?: string
          updated_at?: string
          weekdays?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "medications_healthcare_profile_id_fkey"
            columns: ["healthcare_profile_id"]
            isOneToOne: false
            referencedRelation: "healthcare_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          code_hash: string
          created_at: string
          created_by: string
          expires_at: string
          healthcare_profile_id: string
          id: string
          role: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          code_hash: string
          created_at?: string
          created_by: string
          expires_at: string
          healthcare_profile_id: string
          id?: string
          role: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          code_hash?: string
          created_at?: string
          created_by?: string
          expires_at?: string
          healthcare_profile_id?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_invitations_healthcare_profile_id_fkey"
            columns: ["healthcare_profile_id"]
            isOneToOne: false
            referencedRelation: "healthcare_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_memberships: {
        Row: {
          created_at: string
          healthcare_profile_id: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          healthcare_profile_id: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          healthcare_profile_id?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_memberships_healthcare_profile_id_fkey"
            columns: ["healthcare_profile_id"]
            isOneToOne: false
            referencedRelation: "healthcare_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_caresync_invitation: {
        Args: { invitation_code: string }
        Returns: {
          healthcare_profile_id: string
          role: string
        }[]
      }
      caresync_has_profile_role: {
        Args: { _profile_id: string; _roles: string[] }
        Returns: boolean
      }
      create_caresync_invitation: {
        Args: { _profile_id: string; _role: string }
        Returns: string
      }
      record_caresync_dose_action: {
        Args: {
          _healthcare_profile_id: string
          _idempotency_key: string
          _medication_id: string
          _note?: string
          _scheduled_for: string
          _status: string
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
