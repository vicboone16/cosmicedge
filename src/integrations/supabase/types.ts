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
      astro_calculations: {
        Row: {
          calc_date: string | null
          calc_type: string
          created_at: string
          entity_id: string
          entity_type: string
          expires_at: string | null
          id: string
          location_lat: number | null
          location_lng: number | null
          provider: string
          result: Json
        }
        Insert: {
          calc_date?: string | null
          calc_type: string
          created_at?: string
          entity_id: string
          entity_type: string
          expires_at?: string | null
          id?: string
          location_lat?: number | null
          location_lng?: number | null
          provider?: string
          result?: Json
        }
        Update: {
          calc_date?: string | null
          calc_type?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          expires_at?: string | null
          id?: string
          location_lat?: number | null
          location_lng?: number | null
          provider?: string
          result?: Json
        }
        Relationships: []
      }
      bets: {
        Row: {
          away_team: string | null
          book: string | null
          confidence: number | null
          created_at: string
          edge_score: number | null
          edge_tier: string | null
          external_game_id: number | null
          game_date: string | null
          game_id: string
          home_team: string | null
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
          result_notes: string | null
          season: number | null
          selection: string
          settled_at: string | null
          side: string | null
          sport: string | null
          stake: number | null
          stake_amount: number | null
          stake_unit: string | null
          start_time: string | null
          status: string | null
          to_win_amount: number | null
          transit_boost: number | null
          updated_at: string
          user_id: string
          volatility: string | null
          why_summary: string | null
        }
        Insert: {
          away_team?: string | null
          book?: string | null
          confidence?: number | null
          created_at?: string
          edge_score?: number | null
          edge_tier?: string | null
          external_game_id?: number | null
          game_date?: string | null
          game_id: string
          home_team?: string | null
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
          result_notes?: string | null
          season?: number | null
          selection: string
          settled_at?: string | null
          side?: string | null
          sport?: string | null
          stake?: number | null
          stake_amount?: number | null
          stake_unit?: string | null
          start_time?: string | null
          status?: string | null
          to_win_amount?: number | null
          transit_boost?: number | null
          updated_at?: string
          user_id: string
          volatility?: string | null
          why_summary?: string | null
        }
        Update: {
          away_team?: string | null
          book?: string | null
          confidence?: number | null
          created_at?: string
          edge_score?: number | null
          edge_tier?: string | null
          external_game_id?: number | null
          game_date?: string | null
          game_id?: string
          home_team?: string | null
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
          result_notes?: string | null
          season?: number | null
          selection?: string
          settled_at?: string | null
          side?: string | null
          sport?: string | null
          stake?: number | null
          stake_amount?: number | null
          stake_unit?: string | null
          start_time?: string | null
          status?: string | null
          to_win_amount?: number | null
          transit_boost?: number | null
          updated_at?: string
          user_id?: string
          volatility?: string | null
          why_summary?: string | null
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
      depth_charts: {
        Row: {
          created_at: string
          depth_order: number
          external_player_id: string | null
          id: string
          league: string
          player_id: string | null
          player_name: string
          position: string
          team_abbr: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          depth_order?: number
          external_player_id?: string | null
          id?: string
          league?: string
          player_id?: string | null
          player_name: string
          position: string
          team_abbr: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          depth_order?: number
          external_player_id?: string | null
          id?: string
          league?: string
          player_id?: string | null
          player_name?: string
          position?: string
          team_abbr?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "depth_charts_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      friendships: {
        Row: {
          addressee_id: string
          created_at: string
          id: string
          requester_id: string
          status: string
          updated_at: string
        }
        Insert: {
          addressee_id: string
          created_at?: string
          id?: string
          requester_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          addressee_id?: string
          created_at?: string
          id?: string
          requester_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      game_quarters: {
        Row: {
          away_score: number | null
          created_at: string
          game_id: string
          home_score: number | null
          id: string
          quarter: number
        }
        Insert: {
          away_score?: number | null
          created_at?: string
          game_id: string
          home_score?: number | null
          id?: string
          quarter: number
        }
        Update: {
          away_score?: number | null
          created_at?: string
          game_id?: string
          home_score?: number | null
          id?: string
          quarter?: number
        }
        Relationships: [
          {
            foreignKeyName: "game_quarters_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      game_referees: {
        Row: {
          created_at: string
          game_id: string
          id: string
          referee_id: string
          role: string | null
        }
        Insert: {
          created_at?: string
          game_id: string
          id?: string
          referee_id: string
          role?: string | null
        }
        Update: {
          created_at?: string
          game_id?: string
          id?: string
          referee_id?: string
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "game_referees_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_referees_referee_id_fkey"
            columns: ["referee_id"]
            isOneToOne: false
            referencedRelation: "referees"
            referencedColumns: ["id"]
          },
        ]
      }
      game_state_snapshots: {
        Row: {
          away_score: number | null
          captured_at: string
          clock: string | null
          game_id: string
          home_score: number | null
          id: string
          quarter: string | null
          status: string | null
        }
        Insert: {
          away_score?: number | null
          captured_at?: string
          clock?: string | null
          game_id: string
          home_score?: number | null
          id?: string
          quarter?: string | null
          status?: string | null
        }
        Update: {
          away_score?: number | null
          captured_at?: string
          clock?: string | null
          game_id?: string
          home_score?: number | null
          id?: string
          quarter?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "game_state_snapshots_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
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
      historical_odds: {
        Row: {
          away_price: number | null
          away_team: string
          bookmaker: string
          captured_at: string
          external_event_id: string | null
          game_id: string | null
          home_price: number | null
          home_team: string
          id: string
          league: string
          line: number | null
          market_type: string
          snapshot_date: string
          start_time: string
        }
        Insert: {
          away_price?: number | null
          away_team: string
          bookmaker: string
          captured_at?: string
          external_event_id?: string | null
          game_id?: string | null
          home_price?: number | null
          home_team: string
          id?: string
          league: string
          line?: number | null
          market_type: string
          snapshot_date: string
          start_time: string
        }
        Update: {
          away_price?: number | null
          away_team?: string
          bookmaker?: string
          captured_at?: string
          external_event_id?: string | null
          game_id?: string | null
          home_price?: number | null
          home_team?: string
          id?: string
          league?: string
          line?: number | null
          market_type?: string
          snapshot_date?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "historical_odds_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      injuries: {
        Row: {
          body_part: string | null
          created_at: string
          external_player_id: string | null
          id: string
          league: string
          notes: string | null
          player_id: string | null
          player_name: string
          start_date: string | null
          status: string | null
          team_abbr: string
          updated_at: string
        }
        Insert: {
          body_part?: string | null
          created_at?: string
          external_player_id?: string | null
          id?: string
          league?: string
          notes?: string | null
          player_id?: string | null
          player_name: string
          start_date?: string | null
          status?: string | null
          team_abbr: string
          updated_at?: string
        }
        Update: {
          body_part?: string | null
          created_at?: string
          external_player_id?: string | null
          id?: string
          league?: string
          notes?: string | null
          player_id?: string | null
          player_name?: string
          start_date?: string | null
          status?: string | null
          team_abbr?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "injuries_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
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
      live_board_items: {
        Row: {
          bet_id: string
          created_at: string
          id: string
          is_pinned: boolean | null
          order_index: number | null
          user_id: string
        }
        Insert: {
          bet_id: string
          created_at?: string
          id?: string
          is_pinned?: boolean | null
          order_index?: number | null
          user_id: string
        }
        Update: {
          bet_id?: string
          created_at?: string
          id?: string
          is_pinned?: boolean | null
          order_index?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_board_items_bet_id_fkey"
            columns: ["bet_id"]
            isOneToOne: false
            referencedRelation: "bets"
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
      play_by_play: {
        Row: {
          assist_player_id: string | null
          away_score: number | null
          clock: string | null
          created_at: string
          description: string | null
          event_type: string
          game_id: string
          home_score: number | null
          id: string
          player_id: string | null
          quarter: number
          sequence: number
          team_abbr: string | null
        }
        Insert: {
          assist_player_id?: string | null
          away_score?: number | null
          clock?: string | null
          created_at?: string
          description?: string | null
          event_type: string
          game_id: string
          home_score?: number | null
          id?: string
          player_id?: string | null
          quarter: number
          sequence: number
          team_abbr?: string | null
        }
        Update: {
          assist_player_id?: string | null
          away_score?: number | null
          clock?: string | null
          created_at?: string
          description?: string | null
          event_type?: string
          game_id?: string
          home_score?: number | null
          id?: string
          player_id?: string | null
          quarter?: number
          sequence?: number
          team_abbr?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "play_by_play_assist_player_id_fkey"
            columns: ["assist_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "play_by_play_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "play_by_play_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_game_stats: {
        Row: {
          assists: number | null
          blocks: number | null
          created_at: string
          def_rebounds: number | null
          fantasy_points: number | null
          fg_attempted: number | null
          fg_made: number | null
          fouls: number | null
          ft_attempted: number | null
          ft_made: number | null
          game_id: string
          id: string
          minutes: number | null
          off_rebounds: number | null
          player_id: string
          plus_minus: number | null
          points: number | null
          rebounds: number | null
          starter: boolean | null
          steals: number | null
          team_abbr: string
          three_attempted: number | null
          three_made: number | null
          turnovers: number | null
        }
        Insert: {
          assists?: number | null
          blocks?: number | null
          created_at?: string
          def_rebounds?: number | null
          fantasy_points?: number | null
          fg_attempted?: number | null
          fg_made?: number | null
          fouls?: number | null
          ft_attempted?: number | null
          ft_made?: number | null
          game_id: string
          id?: string
          minutes?: number | null
          off_rebounds?: number | null
          player_id: string
          plus_minus?: number | null
          points?: number | null
          rebounds?: number | null
          starter?: boolean | null
          steals?: number | null
          team_abbr: string
          three_attempted?: number | null
          three_made?: number | null
          turnovers?: number | null
        }
        Update: {
          assists?: number | null
          blocks?: number | null
          created_at?: string
          def_rebounds?: number | null
          fantasy_points?: number | null
          fg_attempted?: number | null
          fg_made?: number | null
          fouls?: number | null
          ft_attempted?: number | null
          ft_made?: number | null
          game_id?: string
          id?: string
          minutes?: number | null
          off_rebounds?: number | null
          player_id?: string
          plus_minus?: number | null
          points?: number | null
          rebounds?: number | null
          starter?: boolean | null
          steals?: number | null
          team_abbr?: string
          three_attempted?: number | null
          three_made?: number | null
          turnovers?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "player_game_stats_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_game_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_news: {
        Row: {
          categories: string | null
          content: string | null
          created_at: string
          external_news_id: number | null
          id: string
          is_breaking: boolean
          league: string
          player_id: string | null
          player_name: string | null
          published_at: string | null
          source: string | null
          source_url: string | null
          team_abbr: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          categories?: string | null
          content?: string | null
          created_at?: string
          external_news_id?: number | null
          id?: string
          is_breaking?: boolean
          league?: string
          player_id?: string | null
          player_name?: string | null
          published_at?: string | null
          source?: string | null
          source_url?: string | null
          team_abbr?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          categories?: string | null
          content?: string | null
          created_at?: string
          external_news_id?: number | null
          id?: string
          is_breaking?: boolean
          league?: string
          player_id?: string | null
          player_name?: string | null
          published_at?: string | null
          source?: string | null
          source_url?: string | null
          team_abbr?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_news_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_projections: {
        Row: {
          created_at: string
          external_player_id: string | null
          game_date: string
          game_id: string | null
          id: string
          league: string
          player_id: string | null
          player_name: string
          projected_assists: number | null
          projected_blocks: number | null
          projected_fantasy_points: number | null
          projected_fg_attempted: number | null
          projected_fg_made: number | null
          projected_ft_attempted: number | null
          projected_ft_made: number | null
          projected_minutes: number | null
          projected_points: number | null
          projected_rebounds: number | null
          projected_steals: number | null
          projected_three_made: number | null
          projected_turnovers: number | null
          salary: number | null
          slate_id: string | null
          team_abbr: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          external_player_id?: string | null
          game_date: string
          game_id?: string | null
          id?: string
          league?: string
          player_id?: string | null
          player_name: string
          projected_assists?: number | null
          projected_blocks?: number | null
          projected_fantasy_points?: number | null
          projected_fg_attempted?: number | null
          projected_fg_made?: number | null
          projected_ft_attempted?: number | null
          projected_ft_made?: number | null
          projected_minutes?: number | null
          projected_points?: number | null
          projected_rebounds?: number | null
          projected_steals?: number | null
          projected_three_made?: number | null
          projected_turnovers?: number | null
          salary?: number | null
          slate_id?: string | null
          team_abbr: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          external_player_id?: string | null
          game_date?: string
          game_id?: string | null
          id?: string
          league?: string
          player_id?: string | null
          player_name?: string
          projected_assists?: number | null
          projected_blocks?: number | null
          projected_fantasy_points?: number | null
          projected_fg_attempted?: number | null
          projected_fg_made?: number | null
          projected_ft_attempted?: number | null
          projected_ft_made?: number | null
          projected_minutes?: number | null
          projected_points?: number | null
          projected_rebounds?: number | null
          projected_steals?: number | null
          projected_three_made?: number | null
          projected_turnovers?: number | null
          salary?: number | null
          slate_id?: string | null
          team_abbr?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_projections_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_projections_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_props: {
        Row: {
          bookmaker: string
          captured_at: string
          created_at: string
          external_event_id: string | null
          game_id: string | null
          id: string
          line: number | null
          market_key: string
          market_label: string | null
          over_price: number | null
          player_name: string
          under_price: number | null
        }
        Insert: {
          bookmaker: string
          captured_at?: string
          created_at?: string
          external_event_id?: string | null
          game_id?: string | null
          id?: string
          line?: number | null
          market_key: string
          market_label?: string | null
          over_price?: number | null
          player_name: string
          under_price?: number | null
        }
        Update: {
          bookmaker?: string
          captured_at?: string
          created_at?: string
          external_event_id?: string | null
          game_id?: string | null
          id?: string
          line?: number | null
          market_key?: string
          market_label?: string | null
          over_price?: number | null
          player_name?: string
          under_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "player_props_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      player_season_stats: {
        Row: {
          assists_per_game: number | null
          blocks_per_game: number | null
          bpm: number | null
          effective_fg_pct: number | null
          fg_pct: number | null
          ft_pct: number | null
          games_played: number | null
          id: string
          league: string
          minutes_per_game: number | null
          per: number | null
          player_id: string
          points_per_game: number | null
          rebounds_per_game: number | null
          season: number
          steals_per_game: number | null
          three_pct: number | null
          true_shooting_pct: number | null
          turnovers_per_game: number | null
          updated_at: string
          usage_rate: number | null
          vorp: number | null
          win_shares: number | null
        }
        Insert: {
          assists_per_game?: number | null
          blocks_per_game?: number | null
          bpm?: number | null
          effective_fg_pct?: number | null
          fg_pct?: number | null
          ft_pct?: number | null
          games_played?: number | null
          id?: string
          league?: string
          minutes_per_game?: number | null
          per?: number | null
          player_id: string
          points_per_game?: number | null
          rebounds_per_game?: number | null
          season: number
          steals_per_game?: number | null
          three_pct?: number | null
          true_shooting_pct?: number | null
          turnovers_per_game?: number | null
          updated_at?: string
          usage_rate?: number | null
          vorp?: number | null
          win_shares?: number | null
        }
        Update: {
          assists_per_game?: number | null
          blocks_per_game?: number | null
          bpm?: number | null
          effective_fg_pct?: number | null
          fg_pct?: number | null
          ft_pct?: number | null
          games_played?: number | null
          id?: string
          league?: string
          minutes_per_game?: number | null
          per?: number | null
          player_id?: string
          points_per_game?: number | null
          rebounds_per_game?: number | null
          season?: number
          steals_per_game?: number | null
          three_pct?: number | null
          true_shooting_pct?: number | null
          turnovers_per_game?: number | null
          updated_at?: string
          usage_rate?: number | null
          vorp?: number | null
          win_shares?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "player_season_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
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
          headshot_url: string | null
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
          headshot_url?: string | null
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
          headshot_url?: string | null
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
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          default_book: string | null
          display_name: string | null
          first_name: string | null
          id: string
          last_name: string | null
          moon_sign: string | null
          phone: string | null
          rising_sign: string | null
          share_astro: boolean
          share_picks: boolean
          sun_sign: string | null
          timezone: string | null
          updated_at: string
          user_id: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          default_book?: string | null
          display_name?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          moon_sign?: string | null
          phone?: string | null
          rising_sign?: string | null
          share_astro?: boolean
          share_picks?: boolean
          sun_sign?: string | null
          timezone?: string | null
          updated_at?: string
          user_id: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          default_book?: string | null
          display_name?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          moon_sign?: string | null
          phone?: string | null
          rising_sign?: string | null
          share_astro?: boolean
          share_picks?: boolean
          sun_sign?: string | null
          timezone?: string | null
          updated_at?: string
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      referees: {
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
      sdio_game_lines: {
        Row: {
          away_line: number | null
          away_price: number | null
          captured_at: string
          created_at: string
          external_game_id: string | null
          game_id: string | null
          home_line: number | null
          home_price: number | null
          id: string
          is_live: boolean
          league: string
          market_type: string
          over_price: number | null
          sportsbook: string
          under_price: number | null
        }
        Insert: {
          away_line?: number | null
          away_price?: number | null
          captured_at?: string
          created_at?: string
          external_game_id?: string | null
          game_id?: string | null
          home_line?: number | null
          home_price?: number | null
          id?: string
          is_live?: boolean
          league?: string
          market_type: string
          over_price?: number | null
          sportsbook: string
          under_price?: number | null
        }
        Update: {
          away_line?: number | null
          away_price?: number | null
          captured_at?: string
          created_at?: string
          external_game_id?: string | null
          game_id?: string | null
          home_line?: number | null
          home_price?: number | null
          id?: string
          is_live?: boolean
          league?: string
          market_type?: string
          over_price?: number | null
          sportsbook?: string
          under_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sdio_game_lines_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      sportsbooks: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          key: string
          name: string
          region: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          key: string
          name: string
          region?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          key?: string
          name?: string
          region?: string | null
        }
        Relationships: []
      }
      stadiums: {
        Row: {
          capacity: number | null
          city: string | null
          country: string | null
          created_at: string
          external_id: string | null
          id: string
          latitude: number
          league: string | null
          longitude: number
          name: string
          state: string | null
          team_abbr: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          capacity?: number | null
          city?: string | null
          country?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          latitude: number
          league?: string | null
          longitude: number
          name: string
          state?: string | null
          team_abbr?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          capacity?: number | null
          city?: string | null
          country?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          latitude?: number
          league?: string | null
          longitude?: number
          name?: string
          state?: string | null
          team_abbr?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      standings: {
        Row: {
          away_record: string | null
          clinched: string | null
          conference: string | null
          created_at: string
          division: string | null
          external_team_id: string | null
          games_back: number | null
          home_record: string | null
          id: string
          last_10: string | null
          league: string
          losses: number
          net_points: number | null
          overtime_losses: number | null
          playoff_seed: number | null
          points_against: number | null
          points_for: number | null
          provider: string
          season: number
          streak: string | null
          team_abbr: string
          team_name: string
          ties: number | null
          updated_at: string
          win_pct: number | null
          wins: number
        }
        Insert: {
          away_record?: string | null
          clinched?: string | null
          conference?: string | null
          created_at?: string
          division?: string | null
          external_team_id?: string | null
          games_back?: number | null
          home_record?: string | null
          id?: string
          last_10?: string | null
          league: string
          losses?: number
          net_points?: number | null
          overtime_losses?: number | null
          playoff_seed?: number | null
          points_against?: number | null
          points_for?: number | null
          provider?: string
          season: number
          streak?: string | null
          team_abbr: string
          team_name: string
          ties?: number | null
          updated_at?: string
          win_pct?: number | null
          wins?: number
        }
        Update: {
          away_record?: string | null
          clinched?: string | null
          conference?: string | null
          created_at?: string
          division?: string | null
          external_team_id?: string | null
          games_back?: number | null
          home_record?: string | null
          id?: string
          last_10?: string | null
          league?: string
          losses?: number
          net_points?: number | null
          overtime_losses?: number | null
          playoff_seed?: number | null
          points_against?: number | null
          points_for?: number | null
          provider?: string
          season?: number
          streak?: string | null
          team_abbr?: string
          team_name?: string
          ties?: number | null
          updated_at?: string
          win_pct?: number | null
          wins?: number
        }
        Relationships: []
      }
      team_game_stats: {
        Row: {
          assists: number | null
          bench_points: number | null
          blocks: number | null
          created_at: string
          def_rating: number | null
          def_rebounds: number | null
          fast_break_points: number | null
          fg_attempted: number | null
          fg_made: number | null
          ft_attempted: number | null
          ft_made: number | null
          game_id: string
          id: string
          is_home: boolean
          off_rating: number | null
          off_rebounds: number | null
          pace: number | null
          points: number | null
          points_in_paint: number | null
          possessions: number | null
          rebounds: number | null
          second_chance_points: number | null
          steals: number | null
          team_abbr: string
          three_attempted: number | null
          three_made: number | null
          turnovers: number | null
        }
        Insert: {
          assists?: number | null
          bench_points?: number | null
          blocks?: number | null
          created_at?: string
          def_rating?: number | null
          def_rebounds?: number | null
          fast_break_points?: number | null
          fg_attempted?: number | null
          fg_made?: number | null
          ft_attempted?: number | null
          ft_made?: number | null
          game_id: string
          id?: string
          is_home: boolean
          off_rating?: number | null
          off_rebounds?: number | null
          pace?: number | null
          points?: number | null
          points_in_paint?: number | null
          possessions?: number | null
          rebounds?: number | null
          second_chance_points?: number | null
          steals?: number | null
          team_abbr: string
          three_attempted?: number | null
          three_made?: number | null
          turnovers?: number | null
        }
        Update: {
          assists?: number | null
          bench_points?: number | null
          blocks?: number | null
          created_at?: string
          def_rating?: number | null
          def_rebounds?: number | null
          fast_break_points?: number | null
          fg_attempted?: number | null
          fg_made?: number | null
          ft_attempted?: number | null
          ft_made?: number | null
          game_id?: string
          id?: string
          is_home?: boolean
          off_rating?: number | null
          off_rebounds?: number | null
          pace?: number | null
          points?: number | null
          points_in_paint?: number | null
          possessions?: number | null
          rebounds?: number | null
          second_chance_points?: number | null
          steals?: number | null
          team_abbr?: string
          three_attempted?: number | null
          three_made?: number | null
          turnovers?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "team_game_stats_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      team_season_stats: {
        Row: {
          ast_pct: number | null
          def_rating: number | null
          fg_pct: number | null
          ft_pct: number | null
          id: string
          league: string
          net_rating: number | null
          off_rating: number | null
          opp_fg_pct: number | null
          opp_points_per_game: number | null
          opp_three_pct: number | null
          pace: number | null
          points_per_game: number | null
          reb_pct: number | null
          season: number
          team_abbr: string
          three_pct: number | null
          tov_pct: number | null
          updated_at: string
        }
        Insert: {
          ast_pct?: number | null
          def_rating?: number | null
          fg_pct?: number | null
          ft_pct?: number | null
          id?: string
          league?: string
          net_rating?: number | null
          off_rating?: number | null
          opp_fg_pct?: number | null
          opp_points_per_game?: number | null
          opp_three_pct?: number | null
          pace?: number | null
          points_per_game?: number | null
          reb_pct?: number | null
          season: number
          team_abbr: string
          three_pct?: number | null
          tov_pct?: number | null
          updated_at?: string
        }
        Update: {
          ast_pct?: number | null
          def_rating?: number | null
          fg_pct?: number | null
          ft_pct?: number | null
          id?: string
          league?: string
          net_rating?: number | null
          off_rating?: number | null
          opp_fg_pct?: number | null
          opp_points_per_game?: number | null
          opp_three_pct?: number | null
          pace?: number | null
          points_per_game?: number | null
          reb_pct?: number | null
          season?: number
          team_abbr?: string
          three_pct?: number | null
          tov_pct?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      tracked_props: {
        Row: {
          book: string | null
          created_at: string
          direction: string
          game_id: string
          id: string
          line: number
          live_stat_value: number | null
          market_type: string
          notes: string | null
          odds: number | null
          player_id: string | null
          player_name: string
          progress: number | null
          settled_at: string | null
          stake: number | null
          stake_unit: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          book?: string | null
          created_at?: string
          direction: string
          game_id: string
          id?: string
          line: number
          live_stat_value?: number | null
          market_type: string
          notes?: string | null
          odds?: number | null
          player_id?: string | null
          player_name: string
          progress?: number | null
          settled_at?: string | null
          stake?: number | null
          stake_unit?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          book?: string | null
          created_at?: string
          direction?: string
          game_id?: string
          id?: string
          line?: number
          live_stat_value?: number | null
          market_type?: string
          notes?: string | null
          odds?: number | null
          player_id?: string | null
          player_name?: string
          progress?: number | null
          settled_at?: string | null
          stake?: number | null
          stake_unit?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracked_props_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracked_props_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
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
