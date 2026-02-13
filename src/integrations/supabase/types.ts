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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      bets: {
        Row: {
          confidence: number | null
          created_at: string
          game_id: string
          horary_lean: string | null
          horary_strength: number | null
          id: string
          likelihood: number | null
          line: number | null
          market_type: string
          notes: string | null
          odds: number
          payout: number | null
          player_id: string | null
          recommendation: string | null
          result: string | null
          selection: string
          stake: number | null
          transit_boost: number | null
          updated_at: string
          user_id: string
          volatility: string | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          game_id: string
          horary_lean?: string | null
          horary_strength?: number | null
          id?: string
          likelihood?: number | null
          line?: number | null
          market_type: string
          notes?: string | null
          odds: number
          payout?: number | null
          player_id?: string | null
          recommendation?: string | null
          result?: string | null
          selection: string
          stake?: number | null
          transit_boost?: number | null
          updated_at?: string
          user_id: string
          volatility?: string | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          game_id?: string
          horary_lean?: string | null
          horary_strength?: number | null
          id?: string
          likelihood?: number | null
          line?: number | null
          market_type?: string
          notes?: string | null
          odds?: number
          payout?: number | null
          player_id?: string | null
          recommendation?: string | null
          result?: string | null
          selection?: string
          stake?: number | null
          transit_boost?: number | null
          updated_at?: string
          user_id?: string
          volatility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bets_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bets_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          away_abbr: string
          away_score: number | null
          away_team: string
          created_at: string
          external_id: string | null
          home_abbr: string
          home_score: number | null
          home_team: string
          id: string
          league: string
          start_time: string
          status: string
          updated_at: string
          venue: string | null
          venue_lat: number | null
          venue_lng: number | null
        }
        Insert: {
          away_abbr: string
          away_score?: number | null
          away_team: string
          created_at?: string
          external_id?: string | null
          home_abbr: string
          home_score?: number | null
          home_team: string
          id?: string
          league: string
          start_time: string
          status?: string
          updated_at?: string
          venue?: string | null
          venue_lat?: number | null
          venue_lng?: number | null
        }
        Update: {
          away_abbr?: string
          away_score?: number | null
          away_team?: string
          created_at?: string
          external_id?: string | null
          home_abbr?: string
          home_score?: number | null
          home_team?: string
          id?: string
          league?: string
          start_time?: string
          status?: string
          updated_at?: string
          venue?: string | null
          venue_lat?: number | null
          venue_lng?: number | null
        }
        Relationships: []
      }
      intel_notes: {
        Row: {
          content: string
          created_at: string
          game_id: string | null
          id: string
          player_id: string | null
          source: string | null
          tag: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          game_id?: string | null
          id?: string
          player_id?: string | null
          source?: string | null
          tag: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          game_id?: string | null
          id?: string
          player_id?: string | null
          source?: string | null
          tag?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intel_notes_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intel_notes_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      odds_snapshots: {
        Row: {
          away_price: number | null
          bookmaker: string
          captured_at: string
          game_id: string
          home_price: number | null
          id: string
          line: number | null
          market_type: string
        }
        Insert: {
          away_price?: number | null
          bookmaker: string
          captured_at?: string
          game_id: string
          home_price?: number | null
          id?: string
          line?: number | null
          market_type: string
        }
        Update: {
          away_price?: number | null
          bookmaker?: string
          captured_at?: string
          game_id?: string
          home_price?: number | null
          id?: string
          line?: number | null
          market_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "odds_snapshots_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          birth_date: string | null
          birth_lat: number | null
          birth_lng: number | null
          birth_place: string | null
          birth_time: string | null
          created_at: string
          external_id: string | null
          id: string
          league: string | null
          name: string
          natal_data_quality: string | null
          position: string | null
          team: string | null
          updated_at: string
        }
        Insert: {
          birth_date?: string | null
          birth_lat?: number | null
          birth_lng?: number | null
          birth_place?: string | null
          birth_time?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          league?: string | null
          name: string
          natal_data_quality?: string | null
          position?: string | null
          team?: string | null
          updated_at?: string
        }
        Update: {
          birth_date?: string | null
          birth_lat?: number | null
          birth_lng?: number | null
          birth_place?: string | null
          birth_time?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          league?: string | null
          name?: string
          natal_data_quality?: string | null
          position?: string | null
          team?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      results: {
        Row: {
          actual_outcome: string | null
          bet_id: string | null
          game_id: string
          id: string
          predicted_likelihood: number | null
          settled_at: string
          was_correct: boolean | null
        }
        Insert: {
          actual_outcome?: string | null
          bet_id?: string | null
          game_id: string
          id?: string
          predicted_likelihood?: number | null
          settled_at?: string
          was_correct?: boolean | null
        }
        Update: {
          actual_outcome?: string | null
          bet_id?: string | null
          game_id?: string
          id?: string
          predicted_likelihood?: number | null
          settled_at?: string
          was_correct?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "results_bet_id_fkey"
            columns: ["bet_id"]
            isOneToOne: false
            referencedRelation: "bets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "results_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
