export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string;
          updated_at: string;
          updated_by: string | null;
          value: NonNullable<Json>;
        };
        ComputedFields: never;
        Insert: {
          key: string;
          updated_at?: string;
          updated_by?: string | null;
          value: NonNullable<Json>;
        };
        Update: {
          key?: string;
          updated_at?: string;
          updated_by?: string | null;
          value?: NonNullable<Json>;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          entity: string;
          entity_id: string | null;
          id: string;
          metadata: Json | null;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          entity: string;
          entity_id?: string | null;
          id?: string;
          metadata?: Json | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          entity?: string;
          entity_id?: string | null;
          id?: string;
          metadata?: Json | null;
        };
        Relationships: [];
      };
      device_tokens: {
        Row: {
          created_at: string;
          id: string;
          platform: string;
          token: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          platform: string;
          token: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          platform?: string;
          token?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      matches: {
        Row: {
          accent: string;
          away_score: number | null;
          competition: string;
          created_at: string;
          home_away: string;
          home_score: number | null;
          id: string;
          kickoff_at: string;
          opponent: string;
          opponent_short: string;
          poster_colors: string[];
          status: Database["public"]["Enums"]["match_status"];
          updated_at: string;
          venue: string;
        };
        ComputedFields: never;
        Insert: {
          accent?: string;
          away_score?: number | null;
          competition?: string;
          created_at?: string;
          home_away?: string;
          home_score?: number | null;
          id?: string;
          kickoff_at: string;
          opponent: string;
          opponent_short: string;
          poster_colors?: string[];
          status?: Database["public"]["Enums"]["match_status"];
          updated_at?: string;
          venue?: string;
        };
        Update: {
          accent?: string;
          away_score?: number | null;
          competition?: string;
          created_at?: string;
          home_away?: string;
          home_score?: number | null;
          id?: string;
          kickoff_at?: string;
          opponent?: string;
          opponent_short?: string;
          poster_colors?: string[];
          status?: Database["public"]["Enums"]["match_status"];
          updated_at?: string;
          venue?: string;
        };
        Relationships: [];
      };
      news_items: {
        Row: {
          body: string;
          category: string;
          created_at: string;
          created_by: string | null;
          excerpt: string;
          id: string;
          image_colors: string[];
          published_at: string;
          read_minutes: number;
          title: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          body?: string;
          category?: string;
          created_at?: string;
          created_by?: string | null;
          excerpt?: string;
          id?: string;
          image_colors?: string[];
          published_at?: string;
          read_minutes?: number;
          title: string;
          updated_at?: string;
        };
        Update: {
          body?: string;
          category?: string;
          created_at?: string;
          created_by?: string | null;
          excerpt?: string;
          id?: string;
          image_colors?: string[];
          published_at?: string;
          read_minutes?: number;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      order_seats: {
        Row: {
          created_at: string;
          id: string;
          number: number;
          order_id: string;
          price_satang: number;
          row_label: string;
          seat_id: string;
          ticket_id: string | null;
          zone_name: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          number: number;
          order_id: string;
          price_satang: number;
          row_label: string;
          seat_id: string;
          ticket_id?: string | null;
          zone_name: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          number?: number;
          order_id?: string;
          price_satang?: number;
          row_label?: string;
          seat_id?: string;
          ticket_id?: string | null;
          zone_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_seats_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "order_receipt_view";
            referencedColumns: ["order_id"];
          },
          {
            foreignKeyName: "order_seats_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_seats_seat_id_fkey";
            columns: ["seat_id"];
            isOneToOne: false;
            referencedRelation: "seats";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_seats_ticket_id_fkey";
            columns: ["ticket_id"];
            isOneToOne: true;
            referencedRelation: "tickets";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          amount_satang: number;
          created_at: string;
          id: string;
          match_id: string;
          paid_at: string | null;
          payment_intent_id: string | null;
          payment_ref: string | null;
          status: Database["public"]["Enums"]["order_status"];
          stripe_session_id: string | null;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          amount_satang: number;
          created_at?: string;
          id?: string;
          match_id: string;
          paid_at?: string | null;
          payment_intent_id?: string | null;
          payment_ref?: string | null;
          status?: Database["public"]["Enums"]["order_status"];
          stripe_session_id?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          amount_satang?: number;
          created_at?: string;
          id?: string;
          match_id?: string;
          paid_at?: string | null;
          payment_intent_id?: string | null;
          payment_ref?: string | null;
          status?: Database["public"]["Enums"]["order_status"];
          stripe_session_id?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "orders_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "match_sales_summary";
            referencedColumns: ["match_id"];
          },
          {
            foreignKeyName: "orders_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "matches";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          email: string;
          full_name: string;
          id: string;
          phone: string | null;
          role: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          email: string;
          full_name?: string;
          id: string;
          phone?: string | null;
          role?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          full_name?: string;
          id?: string;
          phone?: string | null;
          role?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      rate_limits: {
        Row: {
          hits: number;
          key: string;
          window_start: string;
        };
        ComputedFields: never;
        Insert: {
          hits?: number;
          key: string;
          window_start: string;
        };
        Update: {
          hits?: number;
          key?: string;
          window_start?: string;
        };
        Relationships: [];
      };
      scan_events: {
        Row: {
          admin_id: string;
          created_at: string;
          gate_id: string;
          id: string;
          idempotency_key: string;
          raw_hash: string;
          result: Database["public"]["Enums"]["scan_result"];
          ticket_id: string;
          undone_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          admin_id: string;
          created_at?: string;
          gate_id: string;
          id?: string;
          idempotency_key: string;
          raw_hash: string;
          result: Database["public"]["Enums"]["scan_result"];
          ticket_id: string;
          undone_at?: string | null;
        };
        Update: {
          admin_id?: string;
          created_at?: string;
          gate_id?: string;
          id?: string;
          idempotency_key?: string;
          raw_hash?: string;
          result?: Database["public"]["Enums"]["scan_result"];
          ticket_id?: string;
          undone_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "scan_events_ticket_id_fkey";
            columns: ["ticket_id"];
            isOneToOne: false;
            referencedRelation: "tickets";
            referencedColumns: ["id"];
          },
        ];
      };
      seat_holds: {
        Row: {
          created_at: string;
          expires_at: string;
          hold_group_id: string;
          id: string;
          released_at: string | null;
          seat_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          expires_at: string;
          hold_group_id: string;
          id?: string;
          released_at?: string | null;
          seat_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string;
          hold_group_id?: string;
          id?: string;
          released_at?: string | null;
          seat_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "seat_holds_seat_id_fkey";
            columns: ["seat_id"];
            isOneToOne: false;
            referencedRelation: "seats";
            referencedColumns: ["id"];
          },
        ];
      };
      seats: {
        Row: {
          created_at: string;
          id: string;
          number: number;
          row_label: string;
          status: Database["public"]["Enums"]["seat_status"];
          zone_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          number: number;
          row_label: string;
          status?: Database["public"]["Enums"]["seat_status"];
          zone_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          number?: number;
          row_label?: string;
          status?: Database["public"]["Enums"]["seat_status"];
          zone_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "seats_zone_id_fkey";
            columns: ["zone_id"];
            isOneToOne: false;
            referencedRelation: "zones";
            referencedColumns: ["id"];
          },
        ];
      };
      stripe_events: {
        Row: {
          created_at: string;
          id: string;
          processed_at: string;
          type: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id: string;
          processed_at?: string;
          type: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          processed_at?: string;
          type?: string;
        };
        Relationships: [];
      };
      tickets: {
        Row: {
          created_at: string;
          id: string;
          issued_at: string;
          match_id: string;
          order_id: string;
          order_seat_id: string;
          qr_nonce: string;
          seat_id: string;
          status: Database["public"]["Enums"]["ticket_status"];
          used_at: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          issued_at?: string;
          match_id: string;
          order_id: string;
          order_seat_id: string;
          qr_nonce?: string;
          seat_id: string;
          status?: Database["public"]["Enums"]["ticket_status"];
          used_at?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          issued_at?: string;
          match_id?: string;
          order_id?: string;
          order_seat_id?: string;
          qr_nonce?: string;
          seat_id?: string;
          status?: Database["public"]["Enums"]["ticket_status"];
          used_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tickets_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "match_sales_summary";
            referencedColumns: ["match_id"];
          },
          {
            foreignKeyName: "tickets_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "matches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tickets_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "order_receipt_view";
            referencedColumns: ["order_id"];
          },
          {
            foreignKeyName: "tickets_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tickets_order_seat_id_fkey";
            columns: ["order_seat_id"];
            isOneToOne: false;
            referencedRelation: "order_seats";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tickets_seat_id_fkey";
            columns: ["seat_id"];
            isOneToOne: false;
            referencedRelation: "seats";
            referencedColumns: ["id"];
          },
        ];
      };
      zones: {
        Row: {
          color: string;
          created_at: string;
          description: string;
          id: string;
          match_id: string;
          name: string;
          price_satang: number;
          rows: string[];
          seats_per_row: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          color?: string;
          created_at?: string;
          description?: string;
          id?: string;
          match_id: string;
          name: string;
          price_satang: number;
          rows?: string[];
          seats_per_row: number;
          updated_at?: string;
        };
        Update: {
          color?: string;
          created_at?: string;
          description?: string;
          id?: string;
          match_id?: string;
          name?: string;
          price_satang?: number;
          rows?: string[];
          seats_per_row?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "zones_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "match_sales_summary";
            referencedColumns: ["match_id"];
          },
          {
            foreignKeyName: "zones_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "matches";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      match_sales_summary: {
        Row: {
          match_id: string;
          orders_paid: number | null;
          revenue_satang: number | null;
          tickets_sold: number | null;
        };
        ComputedFields: never;
        Relationships: [];
      };
      order_receipt_view: {
        Row: {
          amount_satang: number;
          created_at: string;
          holder: string;
          holder_email: string;
          kickoff_at: string;
          match_id: string;
          opponent: string;
          order_id: string;
          paid_at: string | null;
          payment_ref: string | null;
          seats: Json | null;
          status: Database["public"]["Enums"]["order_status"];
          user_id: string;
          venue: string;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "orders_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "match_sales_summary";
            referencedColumns: ["match_id"];
          },
          {
            foreignKeyName: "orders_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "matches";
            referencedColumns: ["id"];
          },
        ];
      };
      zone_availability: {
        Row: {
          available_seats: number | null;
          total_seats: number | null;
          zone_id: string;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "seats_zone_id_fkey";
            columns: ["zone_id"];
            isOneToOne: false;
            referencedRelation: "zones";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      consume_rate_limit: {
        Args: { p_key: string; p_max_hits: number; p_window_seconds: number };
        Returns: boolean;
      };
      create_hold: { Args: { p_match_id: string; p_seat_ids: string[] }; Returns: Json };
      create_order_from_hold: { Args: { p_hold_id: string }; Returns: Json };
      dearmor: { Args: { "": string }; Returns: string };
      expire_pending_orders: { Args: Record<PropertyKey, never>; Returns: number };
      fips_mode: { Args: Record<PropertyKey, never>; Returns: boolean };
      gen_random_uuid: { Args: Record<PropertyKey, never>; Returns: string };
      gen_salt: { Args: { "": string }; Returns: string };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      mark_order_paid: {
        Args: { p_order_id: string; p_payment_intent_id: string; p_session_id: string };
        Returns: Json;
      };
      pgp_armor_headers: { Args: { "": string }; Returns: Record<string, unknown>[] };
      release_hold: { Args: { p_hold_id: string }; Returns: number };
      scan_ticket: {
        Args: {
          p_admin_id: string;
          p_gate_id: string;
          p_idempotency_key?: string;
          p_ticket_id: string;
        };
        Returns: Json;
      };
      undo_scan: { Args: { p_admin_id: string; p_scan_event_id: string }; Returns: Json };
    };
    Enums: {
      match_status: "upcoming" | "live" | "completed";
      order_status: "pending" | "paid" | "failed" | "cancelled" | "refunded";
      scan_result: "valid" | "used" | "invalid" | "wrong_match";
      seat_status: "available" | "sold" | "held";
      ticket_status: "valid" | "used" | "void";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      match_status: ["upcoming", "live", "completed"],
      order_status: ["pending", "paid", "failed", "cancelled", "refunded"],
      scan_result: ["valid", "used", "invalid", "wrong_match"],
      seat_status: ["available", "sold", "held"],
      ticket_status: ["valid", "used", "void"],
    },
  },
} as const;
