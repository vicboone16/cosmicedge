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
      alerts: {
        Row: {
          alert_type: string
          created_at: string
          game_id: string | null
          id: string
          message: string | null
          threshold: number | null
          triggered: boolean
          triggered_at: string | null
          user_id: string
        }
        Insert: {
          alert_type: string
          created_at?: string
          game_id?: string | null
          id?: string
          message?: string | null
          threshold?: number | null
          triggered?: boolean
          triggered_at?: string | null
          user_id: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          game_id?: string | null
          id?: string
          message?: string | null
          threshold?: number | null
          triggered?: boolean
          triggered_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      api_cache: {
        Row: {
          cache_key: string
          payload: Json
          updated_at: string
        }
        Insert: {
          cache_key: string
          payload?: Json
          updated_at?: string
        }
        Update: {
          cache_key?: string
          payload?: Json
          updated_at?: string
        }
        Relationships: []
      }
      api_fetch_log: {
        Row: {
          cooldown_until: string | null
          created_at: string
          endpoint: string
          fetch_key: string
          last_fetched_at: string
          last_http_status: number | null
          params_json: Json
        }
        Insert: {
          cooldown_until?: string | null
          created_at?: string
          endpoint: string
          fetch_key: string
          last_fetched_at?: string
          last_http_status?: number | null
          params_json?: Json
        }
        Update: {
          cooldown_until?: string | null
          created_at?: string
          endpoint?: string
          fetch_key?: string
          last_fetched_at?: string
          last_http_status?: number | null
          params_json?: Json
        }
        Relationships: []
      }
      apify_raw_logs: {
        Row: {
          actor_id: string
          captured_at: string
          id: string
          input_json: Json | null
          items_count: number | null
          payload: Json
        }
        Insert: {
          actor_id: string
          captured_at?: string
          id?: string
          input_json?: Json | null
          items_count?: number | null
          payload?: Json
        }
        Update: {
          actor_id?: string
          captured_at?: string
          id?: string
          input_json?: Json | null
          items_count?: number | null
          payload?: Json
        }
        Relationships: []
      }
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
      audit_log: {
        Row: {
          action: string
          after_data: Json | null
          before_data: Json | null
          correlation_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          meta: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          after_data?: Json | null
          before_data?: Json | null
          correlation_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          meta?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          after_data?: Json | null
          before_data?: Json | null
          correlation_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          meta?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      backtest_presets: {
        Row: {
          created_at: string
          h2h_history: number
          home_away_splits: number
          id: string
          name: string
          recent_form: number
          schedule_fatigue: number
          updated_at: string
          user_id: string
          weights_json: Json | null
        }
        Insert: {
          created_at?: string
          h2h_history?: number
          home_away_splits?: number
          id?: string
          name: string
          recent_form?: number
          schedule_fatigue?: number
          updated_at?: string
          user_id: string
          weights_json?: Json | null
        }
        Update: {
          created_at?: string
          h2h_history?: number
          home_away_splits?: number
          id?: string
          name?: string
          recent_form?: number
          schedule_fatigue?: number
          updated_at?: string
          user_id?: string
          weights_json?: Json | null
        }
        Relationships: []
      }
      backtest_results: {
        Row: {
          accuracy: number
          correct_picks: number
          created_at: string
          date_end: string
          date_start: string
          id: string
          layer_breakdown: Json | null
          league: string
          roi_simulation: Json | null
          total_games: number
          user_id: string
        }
        Insert: {
          accuracy?: number
          correct_picks?: number
          created_at?: string
          date_end: string
          date_start: string
          id?: string
          layer_breakdown?: Json | null
          league: string
          roi_simulation?: Json | null
          total_games?: number
          user_id: string
        }
        Update: {
          accuracy?: number
          correct_picks?: number
          created_at?: string
          date_end?: string
          date_start?: string
          id?: string
          layer_breakdown?: Json | null
          league?: string
          roi_simulation?: Json | null
          total_games?: number
          user_id?: string
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
      conversation_members: {
        Row: {
          conversation_id: string
          id: string
          joined_at: string
          last_read_at: string | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          joined_at?: string
          last_read_at?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          joined_at?: string
          last_read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_members_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          created_by: string
          id: string
          is_group: boolean
          name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          is_group?: boolean
          name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          is_group?: boolean
          name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      cosmic_game_id_map: {
        Row: {
          confidence: number
          created_at: string
          game_key: string
          league: string
          match_method: string
          provider: string
          provider_game_id: string
        }
        Insert: {
          confidence: number
          created_at?: string
          game_key: string
          league: string
          match_method: string
          provider: string
          provider_game_id: string
        }
        Update: {
          confidence?: number
          created_at?: string
          game_key?: string
          league?: string
          match_method?: string
          provider?: string
          provider_game_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cosmic_game_id_map_game_key_fkey"
            columns: ["game_key"]
            isOneToOne: false
            referencedRelation: "cosmic_games"
            referencedColumns: ["game_key"]
          },
        ]
      }
      cosmic_games: {
        Row: {
          away_team_abbr: string
          created_at: string
          game_date: string
          game_key: string
          home_team_abbr: string
          league: string
          season: string | null
          start_time_utc: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          away_team_abbr: string
          created_at?: string
          game_date: string
          game_key?: string
          home_team_abbr: string
          league: string
          season?: string | null
          start_time_utc?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          away_team_abbr?: string
          created_at?: string
          game_date?: string
          game_key?: string
          home_team_abbr?: string
          league?: string
          season?: string | null
          start_time_utc?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      cosmic_unmatched_games: {
        Row: {
          created_at: string
          diagnostics: Json
          id: string
          league: string
          payload: Json
          provider: string
          provider_game_id: string | null
          reason: string
        }
        Insert: {
          created_at?: string
          diagnostics?: Json
          id?: string
          league: string
          payload?: Json
          provider: string
          provider_game_id?: string | null
          reason: string
        }
        Update: {
          created_at?: string
          diagnostics?: Json
          id?: string
          league?: string
          payload?: Json
          provider?: string
          provider_game_id?: string | null
          reason?: string
        }
        Relationships: []
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
      feed_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "feed_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_posts: {
        Row: {
          bet_id: string | null
          content: string | null
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          bet_id?: string | null
          content?: string | null
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          bet_id?: string | null
          content?: string | null
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_posts_bet_id_fkey"
            columns: ["bet_id"]
            isOneToOne: false
            referencedRelation: "bets"
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
          source: string
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
          source?: string
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
          source?: string
          start_time?: string
          status?: string
          updated_at?: string
          venue?: string | null
          venue_lat?: number | null
          venue_lng?: number | null
        }
        Relationships: []
      }
      health_checks: {
        Row: {
          check_type: string
          checked_at: string
          id: string
          meta: Json | null
          status: string
        }
        Insert: {
          check_type?: string
          checked_at?: string
          id?: string
          meta?: Json | null
          status?: string
        }
        Update: {
          check_type?: string
          checked_at?: string
          id?: string
          meta?: Json | null
          status?: string
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
          source: string
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
          source?: string
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
          source?: string
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
      messages: {
        Row: {
          bet_id: string | null
          content: string
          conversation_id: string
          created_at: string
          id: string
          sender_id: string
        }
        Insert: {
          bet_id?: string | null
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          sender_id: string
        }
        Update: {
          bet_id?: string | null
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_bet_id_fkey"
            columns: ["bet_id"]
            isOneToOne: false
            referencedRelation: "bets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      model_backtest_results: {
        Row: {
          brier_score: number | null
          calibration_json: Json | null
          clv_pct: number | null
          created_at: string
          evaluated_at: string
          extra_metrics: Json | null
          id: string
          log_loss: number | null
          mae: number | null
          model_key: string
          prop_type: string | null
          r_squared: number | null
          roi_pct: number | null
          sample_size: number
          split_name: string
        }
        Insert: {
          brier_score?: number | null
          calibration_json?: Json | null
          clv_pct?: number | null
          created_at?: string
          evaluated_at?: string
          extra_metrics?: Json | null
          id?: string
          log_loss?: number | null
          mae?: number | null
          model_key: string
          prop_type?: string | null
          r_squared?: number | null
          roi_pct?: number | null
          sample_size?: number
          split_name?: string
        }
        Update: {
          brier_score?: number | null
          calibration_json?: Json | null
          clv_pct?: number | null
          created_at?: string
          evaluated_at?: string
          extra_metrics?: Json | null
          id?: string
          log_loss?: number | null
          mae?: number | null
          model_key?: string
          prop_type?: string | null
          r_squared?: number | null
          roi_pct?: number | null
          sample_size?: number
          split_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "model_backtest_results_model_key_fkey"
            columns: ["model_key"]
            isOneToOne: false
            referencedRelation: "models_registry"
            referencedColumns: ["model_key"]
          },
        ]
      }
      model_dataset_split: {
        Row: {
          actual_stat: number | null
          closing_line: number | null
          closing_odds: number | null
          created_at: string
          game_date: string
          game_id: string
          id: string
          player_id: string
          prop_type: string
          split: string
        }
        Insert: {
          actual_stat?: number | null
          closing_line?: number | null
          closing_odds?: number | null
          created_at?: string
          game_date: string
          game_id: string
          id?: string
          player_id: string
          prop_type: string
          split: string
        }
        Update: {
          actual_stat?: number | null
          closing_line?: number | null
          closing_odds?: number | null
          created_at?: string
          game_date?: string
          game_id?: string
          id?: string
          player_id?: string
          prop_type?: string
          split?: string
        }
        Relationships: []
      }
      model_predictions: {
        Row: {
          astro_mu_adjust: number | null
          astro_sigma_adjust: number | null
          blowout_risk: number | null
          coeff_of_var: number | null
          created_at: string
          current_line: number | null
          delta_minutes: number | null
          edge_astro: number | null
          edge_hitl10: number | null
          edge_line_move: number | null
          edge_matchup: number | null
          edge_minutes: number | null
          edge_score: number | null
          edge_season: number | null
          edge_vol_penalty: number | null
          expected_possessions: number | null
          game_id: string
          hit_l10: number | null
          hit_l20: number | null
          hit_l5: number | null
          id: string
          input_hash: string | null
          line: number | null
          line_delta: number | null
          minutes_l5_avg: number | null
          minutes_season_avg: number | null
          model_key: string
          mu_base: number | null
          mu_final: number | null
          odds: number | null
          one_liner: string | null
          open_line: number | null
          p_over_base: number | null
          p_over_final: number | null
          player_id: string
          prop_type: string
          quality_flags: string[] | null
          run_id: string | null
          side: string | null
          sigma_base: number | null
          sigma_final: number | null
          snapshot_ts: string
          std_dev_l10: number | null
          tags: string[] | null
          team_pace_delta: number | null
        }
        Insert: {
          astro_mu_adjust?: number | null
          astro_sigma_adjust?: number | null
          blowout_risk?: number | null
          coeff_of_var?: number | null
          created_at?: string
          current_line?: number | null
          delta_minutes?: number | null
          edge_astro?: number | null
          edge_hitl10?: number | null
          edge_line_move?: number | null
          edge_matchup?: number | null
          edge_minutes?: number | null
          edge_score?: number | null
          edge_season?: number | null
          edge_vol_penalty?: number | null
          expected_possessions?: number | null
          game_id: string
          hit_l10?: number | null
          hit_l20?: number | null
          hit_l5?: number | null
          id?: string
          input_hash?: string | null
          line?: number | null
          line_delta?: number | null
          minutes_l5_avg?: number | null
          minutes_season_avg?: number | null
          model_key: string
          mu_base?: number | null
          mu_final?: number | null
          odds?: number | null
          one_liner?: string | null
          open_line?: number | null
          p_over_base?: number | null
          p_over_final?: number | null
          player_id: string
          prop_type: string
          quality_flags?: string[] | null
          run_id?: string | null
          side?: string | null
          sigma_base?: number | null
          sigma_final?: number | null
          snapshot_ts?: string
          std_dev_l10?: number | null
          tags?: string[] | null
          team_pace_delta?: number | null
        }
        Update: {
          astro_mu_adjust?: number | null
          astro_sigma_adjust?: number | null
          blowout_risk?: number | null
          coeff_of_var?: number | null
          created_at?: string
          current_line?: number | null
          delta_minutes?: number | null
          edge_astro?: number | null
          edge_hitl10?: number | null
          edge_line_move?: number | null
          edge_matchup?: number | null
          edge_minutes?: number | null
          edge_score?: number | null
          edge_season?: number | null
          edge_vol_penalty?: number | null
          expected_possessions?: number | null
          game_id?: string
          hit_l10?: number | null
          hit_l20?: number | null
          hit_l5?: number | null
          id?: string
          input_hash?: string | null
          line?: number | null
          line_delta?: number | null
          minutes_l5_avg?: number | null
          minutes_season_avg?: number | null
          model_key?: string
          mu_base?: number | null
          mu_final?: number | null
          odds?: number | null
          one_liner?: string | null
          open_line?: number | null
          p_over_base?: number | null
          p_over_final?: number | null
          player_id?: string
          prop_type?: string
          quality_flags?: string[] | null
          run_id?: string | null
          side?: string | null
          sigma_base?: number | null
          sigma_final?: number | null
          snapshot_ts?: string
          std_dev_l10?: number | null
          tags?: string[] | null
          team_pace_delta?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "model_predictions_model_key_fkey"
            columns: ["model_key"]
            isOneToOne: false
            referencedRelation: "models_registry"
            referencedColumns: ["model_key"]
          },
          {
            foreignKeyName: "model_predictions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "model_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      model_runs: {
        Row: {
          created_at: string
          duration_ms: number | null
          error_message: string | null
          id: string
          input_hash: string | null
          model_key: string
          rows_produced: number
          run_meta: Json | null
          snapshot_ts: string
          status: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          input_hash?: string | null
          model_key: string
          rows_produced?: number
          run_meta?: Json | null
          snapshot_ts?: string
          status?: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          input_hash?: string | null
          model_key?: string
          rows_produced?: number
          run_meta?: Json | null
          snapshot_ts?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "model_runs_model_key_fkey"
            columns: ["model_key"]
            isOneToOne: false
            referencedRelation: "models_registry"
            referencedColumns: ["model_key"]
          },
        ]
      }
      models_registry: {
        Row: {
          config_json: Json | null
          created_at: string
          description: string | null
          display_name: string
          is_active: boolean
          model_key: string
          model_type: string
          updated_at: string
          version: string
        }
        Insert: {
          config_json?: Json | null
          created_at?: string
          description?: string | null
          display_name: string
          is_active?: boolean
          model_key: string
          model_type: string
          updated_at?: string
          version?: string
        }
        Update: {
          config_json?: Json | null
          created_at?: string
          description?: string | null
          display_name?: string
          is_active?: boolean
          model_key?: string
          model_type?: string
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      nba_play_by_play_events: {
        Row: {
          a1: string | null
          a2: string | null
          a3: string | null
          a4: string | null
          a5: string | null
          area: string | null
          area_detail: string | null
          assist: string | null
          away: string | null
          away_score: number | null
          away_team: string | null
          block: string | null
          created_at: string
          data_set: string | null
          date: string | null
          description: string | null
          elapsed: string | null
          entered: string | null
          event_type: string | null
          game_id: string
          h1: string | null
          h2: string | null
          h3: string | null
          h4: string | null
          h5: string | null
          home: string | null
          home_score: number | null
          home_team: string | null
          left_player: string | null
          num: string | null
          official: string | null
          opponent: string | null
          original_x: number | null
          original_y: number | null
          outof: string | null
          period: number | null
          play_id: number
          play_length: string | null
          player: string | null
          points: number | null
          possession: string | null
          qualifiers1: string | null
          qualifiers2: string | null
          qualifiers3: string | null
          qualifiers4: string | null
          reason: string | null
          remaining_time: string | null
          result: string | null
          shot_distance: number | null
          steal: string | null
          team: string | null
          team_possession: string | null
          time_actual: string | null
          type: string | null
        }
        Insert: {
          a1?: string | null
          a2?: string | null
          a3?: string | null
          a4?: string | null
          a5?: string | null
          area?: string | null
          area_detail?: string | null
          assist?: string | null
          away?: string | null
          away_score?: number | null
          away_team?: string | null
          block?: string | null
          created_at?: string
          data_set?: string | null
          date?: string | null
          description?: string | null
          elapsed?: string | null
          entered?: string | null
          event_type?: string | null
          game_id: string
          h1?: string | null
          h2?: string | null
          h3?: string | null
          h4?: string | null
          h5?: string | null
          home?: string | null
          home_score?: number | null
          home_team?: string | null
          left_player?: string | null
          num?: string | null
          official?: string | null
          opponent?: string | null
          original_x?: number | null
          original_y?: number | null
          outof?: string | null
          period?: number | null
          play_id: number
          play_length?: string | null
          player?: string | null
          points?: number | null
          possession?: string | null
          qualifiers1?: string | null
          qualifiers2?: string | null
          qualifiers3?: string | null
          qualifiers4?: string | null
          reason?: string | null
          remaining_time?: string | null
          result?: string | null
          shot_distance?: number | null
          steal?: string | null
          team?: string | null
          team_possession?: string | null
          time_actual?: string | null
          type?: string | null
        }
        Update: {
          a1?: string | null
          a2?: string | null
          a3?: string | null
          a4?: string | null
          a5?: string | null
          area?: string | null
          area_detail?: string | null
          assist?: string | null
          away?: string | null
          away_score?: number | null
          away_team?: string | null
          block?: string | null
          created_at?: string
          data_set?: string | null
          date?: string | null
          description?: string | null
          elapsed?: string | null
          entered?: string | null
          event_type?: string | null
          game_id?: string
          h1?: string | null
          h2?: string | null
          h3?: string | null
          h4?: string | null
          h5?: string | null
          home?: string | null
          home_score?: number | null
          home_team?: string | null
          left_player?: string | null
          num?: string | null
          official?: string | null
          opponent?: string | null
          original_x?: number | null
          original_y?: number | null
          outof?: string | null
          period?: number | null
          play_id?: number
          play_length?: string | null
          player?: string | null
          points?: number | null
          possession?: string | null
          qualifiers1?: string | null
          qualifiers2?: string | null
          qualifiers3?: string | null
          qualifiers4?: string | null
          reason?: string | null
          remaining_time?: string | null
          result?: string | null
          shot_distance?: number | null
          steal?: string | null
          team?: string | null
          team_possession?: string | null
          time_actual?: string | null
          type?: string | null
        }
        Relationships: []
      }
      nba_standings: {
        Row: {
          conference: string | null
          created_at: string
          division: string | null
          gb: number | null
          h2h_record: Json | null
          home_losses: number | null
          home_wins: number | null
          id: string
          last_10: string | null
          losses: number | null
          neutral_losses: number | null
          neutral_wins: number | null
          pct: number | null
          road_losses: number | null
          road_wins: number | null
          season: number
          snapshot_date: string
          streak: string | null
          team_abbr: string
          updated_at: string
          wins: number | null
        }
        Insert: {
          conference?: string | null
          created_at?: string
          division?: string | null
          gb?: number | null
          h2h_record?: Json | null
          home_losses?: number | null
          home_wins?: number | null
          id?: string
          last_10?: string | null
          losses?: number | null
          neutral_losses?: number | null
          neutral_wins?: number | null
          pct?: number | null
          road_losses?: number | null
          road_wins?: number | null
          season?: number
          snapshot_date?: string
          streak?: string | null
          team_abbr: string
          updated_at?: string
          wins?: number | null
        }
        Update: {
          conference?: string | null
          created_at?: string
          division?: string | null
          gb?: number | null
          h2h_record?: Json | null
          home_losses?: number | null
          home_wins?: number | null
          id?: string
          last_10?: string | null
          losses?: number | null
          neutral_losses?: number | null
          neutral_wins?: number | null
          pct?: number | null
          road_losses?: number | null
          road_wins?: number | null
          season?: number
          snapshot_date?: string
          streak?: string | null
          team_abbr?: string
          updated_at?: string
          wins?: number | null
        }
        Relationships: []
      }
      nebula_prop_predictions: {
        Row: {
          astro: Json | null
          book: string
          confidence: number
          created_at: string
          edge_score: number
          edge_score_v11: number | null
          game_id: string
          hit_l10: number | null
          hit_l20: number | null
          id: string
          line: number | null
          microbars: Json | null
          mu: number
          odds: number | null
          one_liner: string | null
          player_id: string
          pred_ts: string
          prop_type: string
          risk: number
          side: string | null
          sigma: number
          streak: number | null
          updated_at: string
        }
        Insert: {
          astro?: Json | null
          book?: string
          confidence?: number
          created_at?: string
          edge_score?: number
          edge_score_v11?: number | null
          game_id: string
          hit_l10?: number | null
          hit_l20?: number | null
          id?: string
          line?: number | null
          microbars?: Json | null
          mu?: number
          odds?: number | null
          one_liner?: string | null
          player_id: string
          pred_ts?: string
          prop_type: string
          risk?: number
          side?: string | null
          sigma?: number
          streak?: number | null
          updated_at?: string
        }
        Update: {
          astro?: Json | null
          book?: string
          confidence?: number
          created_at?: string
          edge_score?: number
          edge_score_v11?: number | null
          game_id?: string
          hit_l10?: number | null
          hit_l20?: number | null
          id?: string
          line?: number | null
          microbars?: Json | null
          mu?: number
          odds?: number | null
          one_liner?: string | null
          player_id?: string
          pred_ts?: string
          prop_type?: string
          risk?: number
          side?: string | null
          sigma?: number
          streak?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nebula_prop_predictions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nebula_prop_predictions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      nfl_games: {
        Row: {
          arena: string | null
          away_score: number | null
          away_team_id: string | null
          away_team_name: string | null
          city: string | null
          country: string | null
          created_at: string
          dome: boolean | null
          event_name: string | null
          field: string | null
          game_id: string
          game_time: string | null
          home_score: number | null
          home_team_id: string | null
          home_team_name: string | null
          latitude: number | null
          longitude: number | null
          postal_code: string | null
          raw_json: Json | null
          round: string | null
          season_type: string | null
          season_year: number
          state: string | null
          status: string | null
          updated_at: string
          week: number | null
        }
        Insert: {
          arena?: string | null
          away_score?: number | null
          away_team_id?: string | null
          away_team_name?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          dome?: boolean | null
          event_name?: string | null
          field?: string | null
          game_id: string
          game_time?: string | null
          home_score?: number | null
          home_team_id?: string | null
          home_team_name?: string | null
          latitude?: number | null
          longitude?: number | null
          postal_code?: string | null
          raw_json?: Json | null
          round?: string | null
          season_type?: string | null
          season_year: number
          state?: string | null
          status?: string | null
          updated_at?: string
          week?: number | null
        }
        Update: {
          arena?: string | null
          away_score?: number | null
          away_team_id?: string | null
          away_team_name?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          dome?: boolean | null
          event_name?: string | null
          field?: string | null
          game_id?: string
          game_time?: string | null
          home_score?: number | null
          home_team_id?: string | null
          home_team_name?: string | null
          latitude?: number | null
          longitude?: number | null
          postal_code?: string | null
          raw_json?: Json | null
          round?: string | null
          season_type?: string | null
          season_year?: number
          state?: string | null
          status?: string | null
          updated_at?: string
          week?: number | null
        }
        Relationships: []
      }
      nfl_injuries: {
        Row: {
          created_at: string
          date_injured: string | null
          id: string
          injury: string
          last_seen_at: string
          player_id: string
          player_name: string
          raw_json: Json | null
          returns: string | null
          team_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          date_injured?: string | null
          id?: string
          injury: string
          last_seen_at?: string
          player_id: string
          player_name: string
          raw_json?: Json | null
          returns?: string | null
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          date_injured?: string | null
          id?: string
          injury?: string
          last_seen_at?: string
          player_id?: string
          player_name?: string
          raw_json?: Json | null
          returns?: string | null
          team_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      nfl_play_by_play: {
        Row: {
          created_at: string
          details_json: Json | null
          down: number | null
          event: string | null
          game_clock: string | null
          game_id: string
          is_blocked: boolean | null
          is_recovered: boolean | null
          is_returned: boolean | null
          is_scoring_play: boolean | null
          is_touchdown: boolean | null
          possession_abbr: string | null
          quarter: number | null
          raw_json: Json | null
          sequence: number
          yard_line: string | null
          yards_to_go: number | null
        }
        Insert: {
          created_at?: string
          details_json?: Json | null
          down?: number | null
          event?: string | null
          game_clock?: string | null
          game_id: string
          is_blocked?: boolean | null
          is_recovered?: boolean | null
          is_returned?: boolean | null
          is_scoring_play?: boolean | null
          is_touchdown?: boolean | null
          possession_abbr?: string | null
          quarter?: number | null
          raw_json?: Json | null
          sequence: number
          yard_line?: string | null
          yards_to_go?: number | null
        }
        Update: {
          created_at?: string
          details_json?: Json | null
          down?: number | null
          event?: string | null
          game_clock?: string | null
          game_id?: string
          is_blocked?: boolean | null
          is_recovered?: boolean | null
          is_returned?: boolean | null
          is_scoring_play?: boolean | null
          is_touchdown?: boolean | null
          possession_abbr?: string | null
          quarter?: number | null
          raw_json?: Json | null
          sequence?: number
          yard_line?: string | null
          yards_to_go?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "nfl_play_by_play_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "nfl_games"
            referencedColumns: ["game_id"]
          },
        ]
      }
      nfl_play_by_play_players: {
        Row: {
          action: string | null
          created_at: string
          game_id: string
          player_id: string
          player_name: string | null
          position: string | null
          role: string
          sequence: number
        }
        Insert: {
          action?: string | null
          created_at?: string
          game_id: string
          player_id: string
          player_name?: string | null
          position?: string | null
          role: string
          sequence: number
        }
        Update: {
          action?: string | null
          created_at?: string
          game_id?: string
          player_id?: string
          player_name?: string | null
          position?: string | null
          role?: string
          sequence?: number
        }
        Relationships: [
          {
            foreignKeyName: "nfl_play_by_play_players_game_id_sequence_fkey"
            columns: ["game_id", "sequence"]
            isOneToOne: false
            referencedRelation: "nfl_play_by_play"
            referencedColumns: ["game_id", "sequence"]
          },
        ]
      }
      nfl_player_game_stats: {
        Row: {
          completions: number | null
          created_at: string
          game_id: string
          interceptions: number | null
          longest_reception: number | null
          longest_rush: number | null
          passing_attempts: number | null
          passing_tds: number | null
          passing_yards: number | null
          player_id: string
          player_name: string | null
          raw_json: Json | null
          receiving_first_downs: number | null
          receiving_tds: number | null
          receiving_yards: number | null
          receptions: number | null
          rush_attempts: number | null
          rushing_first_downs: number | null
          rushing_tds: number | null
          rushing_yards: number | null
          targets: number | null
          team_abbr: string | null
          updated_at: string
        }
        Insert: {
          completions?: number | null
          created_at?: string
          game_id: string
          interceptions?: number | null
          longest_reception?: number | null
          longest_rush?: number | null
          passing_attempts?: number | null
          passing_tds?: number | null
          passing_yards?: number | null
          player_id: string
          player_name?: string | null
          raw_json?: Json | null
          receiving_first_downs?: number | null
          receiving_tds?: number | null
          receiving_yards?: number | null
          receptions?: number | null
          rush_attempts?: number | null
          rushing_first_downs?: number | null
          rushing_tds?: number | null
          rushing_yards?: number | null
          targets?: number | null
          team_abbr?: string | null
          updated_at?: string
        }
        Update: {
          completions?: number | null
          created_at?: string
          game_id?: string
          interceptions?: number | null
          longest_reception?: number | null
          longest_rush?: number | null
          passing_attempts?: number | null
          passing_tds?: number | null
          passing_yards?: number | null
          player_id?: string
          player_name?: string | null
          raw_json?: Json | null
          receiving_first_downs?: number | null
          receiving_tds?: number | null
          receiving_yards?: number | null
          receptions?: number | null
          rush_attempts?: number | null
          rushing_first_downs?: number | null
          rushing_tds?: number | null
          rushing_yards?: number | null
          targets?: number | null
          team_abbr?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nfl_player_game_stats_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "nfl_games"
            referencedColumns: ["game_id"]
          },
        ]
      }
      np_player_prop_odds_history: {
        Row: {
          book: string
          game_id: string
          id: string
          line: number | null
          odds: number | null
          player_id: string | null
          prop_type: string
          side: string | null
          snapshot_minute: string
          snapshot_ts: string
          source: string
        }
        Insert: {
          book: string
          game_id: string
          id?: string
          line?: number | null
          odds?: number | null
          player_id?: string | null
          prop_type: string
          side?: string | null
          snapshot_minute?: string
          snapshot_ts?: string
          source?: string
        }
        Update: {
          book?: string
          game_id?: string
          id?: string
          line?: number | null
          odds?: number | null
          player_id?: string | null
          prop_type?: string
          side?: string | null
          snapshot_minute?: string
          snapshot_ts?: string
          source?: string
        }
        Relationships: []
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
      pbp_events: {
        Row: {
          away_score: number | null
          clock: string | null
          created_at: string
          description: string
          event_type: string | null
          game_key: string
          home_score: number | null
          id: string
          period: number
          player_id: string | null
          player_name: string | null
          provider: string
          provider_event_id: string
          provider_game_id: string
          raw: Json
          team_abbr: string | null
        }
        Insert: {
          away_score?: number | null
          clock?: string | null
          created_at?: string
          description: string
          event_type?: string | null
          game_key: string
          home_score?: number | null
          id?: string
          period: number
          player_id?: string | null
          player_name?: string | null
          provider: string
          provider_event_id: string
          provider_game_id: string
          raw?: Json
          team_abbr?: string | null
        }
        Update: {
          away_score?: number | null
          clock?: string | null
          created_at?: string
          description?: string
          event_type?: string | null
          game_key?: string
          home_score?: number | null
          id?: string
          period?: number
          player_id?: string | null
          player_name?: string | null
          provider?: string
          provider_event_id?: string
          provider_game_id?: string
          raw?: Json
          team_abbr?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pbp_events_game_key_fkey"
            columns: ["game_key"]
            isOneToOne: false
            referencedRelation: "cosmic_games"
            referencedColumns: ["game_key"]
          },
        ]
      }
      pbp_live_games_by_provider: {
        Row: {
          game_key: string | null
          league: string
          provider: string
          provider_game_id: string
          raw: Json
          status: string | null
          updated_at: string
        }
        Insert: {
          game_key?: string | null
          league: string
          provider: string
          provider_game_id: string
          raw?: Json
          status?: string | null
          updated_at?: string
        }
        Update: {
          game_key?: string | null
          league?: string
          provider?: string
          provider_game_id?: string
          raw?: Json
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pbp_live_games_by_provider_game_key_fkey"
            columns: ["game_key"]
            isOneToOne: false
            referencedRelation: "cosmic_games"
            referencedColumns: ["game_key"]
          },
        ]
      }
      pbp_quarter_player_stats: {
        Row: {
          ast: number
          blk: number
          fg3a: number
          fg3m: number
          fga: number
          fgm: number
          fta: number
          ftm: number
          game_key: string
          last_provider_event_id: string | null
          period: number
          pf: number
          player_id: string
          player_name: string
          provider: string
          pts: number
          reb: number
          stl: number
          team_abbr: string | null
          tov: number
          updated_at: string
        }
        Insert: {
          ast?: number
          blk?: number
          fg3a?: number
          fg3m?: number
          fga?: number
          fgm?: number
          fta?: number
          ftm?: number
          game_key: string
          last_provider_event_id?: string | null
          period: number
          pf?: number
          player_id: string
          player_name: string
          provider: string
          pts?: number
          reb?: number
          stl?: number
          team_abbr?: string | null
          tov?: number
          updated_at?: string
        }
        Update: {
          ast?: number
          blk?: number
          fg3a?: number
          fg3m?: number
          fga?: number
          fgm?: number
          fta?: number
          ftm?: number
          game_key?: string
          last_provider_event_id?: string | null
          period?: number
          pf?: number
          player_id?: string
          player_name?: string
          provider?: string
          pts?: number
          reb?: number
          stl?: number
          team_abbr?: string | null
          tov?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pbp_quarter_player_stats_game_key_fkey"
            columns: ["game_key"]
            isOneToOne: false
            referencedRelation: "cosmic_games"
            referencedColumns: ["game_key"]
          },
        ]
      }
      pbp_quarter_team_stats: {
        Row: {
          dreb: number
          fg3a: number
          fg3m: number
          fga: number
          fgm: number
          fouls: number
          fta: number
          ftm: number
          game_key: string
          last_provider_event_id: string | null
          oreb: number
          period: number
          provider: string
          pts: number
          team_abbr: string
          tov: number
          updated_at: string
        }
        Insert: {
          dreb?: number
          fg3a?: number
          fg3m?: number
          fga?: number
          fgm?: number
          fouls?: number
          fta?: number
          ftm?: number
          game_key: string
          last_provider_event_id?: string | null
          oreb?: number
          period: number
          provider: string
          pts?: number
          team_abbr: string
          tov?: number
          updated_at?: string
        }
        Update: {
          dreb?: number
          fg3a?: number
          fg3m?: number
          fga?: number
          fgm?: number
          fouls?: number
          fta?: number
          ftm?: number
          game_key?: string
          last_provider_event_id?: string | null
          oreb?: number
          period?: number
          provider?: string
          pts?: number
          team_abbr?: string
          tov?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pbp_quarter_team_stats_game_key_fkey"
            columns: ["game_key"]
            isOneToOne: false
            referencedRelation: "cosmic_games"
            referencedColumns: ["game_key"]
          },
        ]
      }
      picks_raw: {
        Row: {
          captured_at: string
          id: string
          league: string
          payload: Json
        }
        Insert: {
          captured_at?: string
          id?: string
          league: string
          payload?: Json
        }
        Update: {
          captured_at?: string
          id?: string
          league?: string
          payload?: Json
        }
        Relationships: []
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
      player_boxscores_raw: {
        Row: {
          captured_at: string
          id: string
          payload: Json
        }
        Insert: {
          captured_at?: string
          id?: string
          payload?: Json
        }
        Update: {
          captured_at?: string
          id?: string
          payload?: Json
        }
        Relationships: []
      }
      player_game_stats: {
        Row: {
          assists: number | null
          blocks: number | null
          completions: number | null
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
          league: string | null
          minutes: number | null
          off_rebounds: number | null
          passing_attempts: number | null
          passing_touchdowns: number | null
          passing_yards: number | null
          period: string
          player_id: string
          plus_minus: number | null
          points: number | null
          rebounds: number | null
          receiving_touchdowns: number | null
          receiving_yards: number | null
          rushing_attempts: number | null
          rushing_touchdowns: number | null
          rushing_yards: number | null
          starter: boolean | null
          steals: number | null
          targets: number | null
          team_abbr: string
          three_attempted: number | null
          three_made: number | null
          turnovers: number | null
        }
        Insert: {
          assists?: number | null
          blocks?: number | null
          completions?: number | null
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
          league?: string | null
          minutes?: number | null
          off_rebounds?: number | null
          passing_attempts?: number | null
          passing_touchdowns?: number | null
          passing_yards?: number | null
          period?: string
          player_id: string
          plus_minus?: number | null
          points?: number | null
          rebounds?: number | null
          receiving_touchdowns?: number | null
          receiving_yards?: number | null
          rushing_attempts?: number | null
          rushing_touchdowns?: number | null
          rushing_yards?: number | null
          starter?: boolean | null
          steals?: number | null
          targets?: number | null
          team_abbr: string
          three_attempted?: number | null
          three_made?: number | null
          turnovers?: number | null
        }
        Update: {
          assists?: number | null
          blocks?: number | null
          completions?: number | null
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
          league?: string | null
          minutes?: number | null
          off_rebounds?: number | null
          passing_attempts?: number | null
          passing_touchdowns?: number | null
          passing_yards?: number | null
          period?: string
          player_id?: string
          plus_minus?: number | null
          points?: number | null
          rebounds?: number | null
          receiving_touchdowns?: number | null
          receiving_yards?: number | null
          rushing_attempts?: number | null
          rushing_touchdowns?: number | null
          rushing_yards?: number | null
          starter?: boolean | null
          steals?: number | null
          targets?: number | null
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
          def_rebounds: number | null
          effective_fg_pct: number | null
          fg_attempted: number | null
          fg_made: number | null
          fg_pct: number | null
          ft_attempted: number | null
          ft_made: number | null
          ft_pct: number | null
          games_played: number | null
          games_started: number | null
          id: string
          league: string
          minutes_per_game: number | null
          off_rebounds: number | null
          per: number | null
          period: string
          personal_fouls: number | null
          player_id: string
          points_per_game: number | null
          rebounds_per_game: number | null
          season: number
          stat_type: string
          steals_per_game: number | null
          three_attempted: number | null
          three_made: number | null
          three_pct: number | null
          triple_doubles: number | null
          true_shooting_pct: number | null
          turnovers_per_game: number | null
          two_attempted: number | null
          two_made: number | null
          two_pct: number | null
          updated_at: string
          usage_rate: number | null
          vorp: number | null
          win_shares: number | null
        }
        Insert: {
          assists_per_game?: number | null
          blocks_per_game?: number | null
          bpm?: number | null
          def_rebounds?: number | null
          effective_fg_pct?: number | null
          fg_attempted?: number | null
          fg_made?: number | null
          fg_pct?: number | null
          ft_attempted?: number | null
          ft_made?: number | null
          ft_pct?: number | null
          games_played?: number | null
          games_started?: number | null
          id?: string
          league?: string
          minutes_per_game?: number | null
          off_rebounds?: number | null
          per?: number | null
          period?: string
          personal_fouls?: number | null
          player_id: string
          points_per_game?: number | null
          rebounds_per_game?: number | null
          season: number
          stat_type?: string
          steals_per_game?: number | null
          three_attempted?: number | null
          three_made?: number | null
          three_pct?: number | null
          triple_doubles?: number | null
          true_shooting_pct?: number | null
          turnovers_per_game?: number | null
          two_attempted?: number | null
          two_made?: number | null
          two_pct?: number | null
          updated_at?: string
          usage_rate?: number | null
          vorp?: number | null
          win_shares?: number | null
        }
        Update: {
          assists_per_game?: number | null
          blocks_per_game?: number | null
          bpm?: number | null
          def_rebounds?: number | null
          effective_fg_pct?: number | null
          fg_attempted?: number | null
          fg_made?: number | null
          fg_pct?: number | null
          ft_attempted?: number | null
          ft_made?: number | null
          ft_pct?: number | null
          games_played?: number | null
          games_started?: number | null
          id?: string
          league?: string
          minutes_per_game?: number | null
          off_rebounds?: number | null
          per?: number | null
          period?: string
          personal_fouls?: number | null
          player_id?: string
          points_per_game?: number | null
          rebounds_per_game?: number | null
          season?: number
          stat_type?: string
          steals_per_game?: number | null
          three_attempted?: number | null
          three_made?: number | null
          three_pct?: number | null
          triple_doubles?: number | null
          true_shooting_pct?: number | null
          turnovers_per_game?: number | null
          two_attempted?: number | null
          two_made?: number | null
          two_pct?: number | null
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
          status: string
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
          status?: string
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
          status?: string
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
          starting_bankroll: number | null
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
          starting_bankroll?: number | null
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
          starting_bankroll?: number | null
          sun_sign?: string | null
          timezone?: string | null
          updated_at?: string
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      provider_flags: {
        Row: {
          enabled: boolean
          provider_name: string
          reason: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enabled?: boolean
          provider_name: string
          reason?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enabled?: boolean
          provider_name?: string
          reason?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      quant_cache: {
        Row: {
          computed_at: string
          created_at: string
          entity_id: string
          entity_type: string
          expires_at: string | null
          game_id: string
          id: string
          market_snapshot: Json
          models: Json
          signals: Json
          verdict: Json
        }
        Insert: {
          computed_at?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          expires_at?: string | null
          game_id: string
          id?: string
          market_snapshot?: Json
          models?: Json
          signals?: Json
          verdict?: Json
        }
        Update: {
          computed_at?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          expires_at?: string | null
          game_id?: string
          id?: string
          market_snapshot?: Json
          models?: Json
          signals?: Json
          verdict?: Json
        }
        Relationships: [
          {
            foreignKeyName: "quant_cache_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
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
      sgo_market_odds: {
        Row: {
          available: boolean
          bet_type: string
          bookmaker: string
          captured_at: string
          event_id: string
          game_id: string
          id: string
          is_alternate: boolean
          is_player_prop: boolean
          last_updated_at: string | null
          league: string
          line: number | null
          odd_id: string
          odds: number | null
          period: string
          player_name: string | null
          side: string
          stat_entity_id: string
          stat_id: string | null
          updated_at: string
        }
        Insert: {
          available?: boolean
          bet_type: string
          bookmaker?: string
          captured_at?: string
          event_id: string
          game_id: string
          id?: string
          is_alternate?: boolean
          is_player_prop?: boolean
          last_updated_at?: string | null
          league: string
          line?: number | null
          odd_id: string
          odds?: number | null
          period?: string
          player_name?: string | null
          side: string
          stat_entity_id?: string
          stat_id?: string | null
          updated_at?: string
        }
        Update: {
          available?: boolean
          bet_type?: string
          bookmaker?: string
          captured_at?: string
          event_id?: string
          game_id?: string
          id?: string
          is_alternate?: boolean
          is_player_prop?: boolean
          last_updated_at?: string | null
          league?: string
          line?: number | null
          odd_id?: string
          odds?: number | null
          period?: string
          player_name?: string | null
          side?: string
          stat_entity_id?: string
          stat_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sgo_market_odds_game_id_fkey"
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
      team_astro: {
        Row: {
          city_ruler: string | null
          created_at: string
          element: string | null
          founded_city: string | null
          founded_date: string | null
          founded_lat: number | null
          founded_lng: number | null
          id: string
          league: string
          mascot_sign: string | null
          modality: string | null
          notes: string | null
          relocated_city: string | null
          relocated_date: string | null
          relocated_lat: number | null
          relocated_lng: number | null
          ruling_planet: string | null
          team_abbr: string
          team_name: string
          updated_at: string
        }
        Insert: {
          city_ruler?: string | null
          created_at?: string
          element?: string | null
          founded_city?: string | null
          founded_date?: string | null
          founded_lat?: number | null
          founded_lng?: number | null
          id?: string
          league?: string
          mascot_sign?: string | null
          modality?: string | null
          notes?: string | null
          relocated_city?: string | null
          relocated_date?: string | null
          relocated_lat?: number | null
          relocated_lng?: number | null
          ruling_planet?: string | null
          team_abbr: string
          team_name: string
          updated_at?: string
        }
        Update: {
          city_ruler?: string | null
          created_at?: string
          element?: string | null
          founded_city?: string | null
          founded_date?: string | null
          founded_lat?: number | null
          founded_lng?: number | null
          id?: string
          league?: string
          mascot_sign?: string | null
          modality?: string | null
          notes?: string | null
          relocated_city?: string | null
          relocated_date?: string | null
          relocated_lat?: number | null
          relocated_lng?: number | null
          ruling_planet?: string | null
          team_abbr?: string
          team_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      team_game_stats: {
        Row: {
          assists: number | null
          ast_pct: number | null
          bench_points: number | null
          blk_pct: number | null
          blocks: number | null
          created_at: string
          def_rating: number | null
          def_rebounds: number | null
          efg_pct: number | null
          fast_break_points: number | null
          fg_attempted: number | null
          fg_made: number | null
          ft_attempted: number | null
          ft_made: number | null
          ft_per_fga: number | null
          ftr: number | null
          game_id: string
          id: string
          is_home: boolean
          off_rating: number | null
          off_rebounds: number | null
          opp_efg_pct: number | null
          opp_ft_per_fga: number | null
          opp_orb_pct: number | null
          opp_tov_pct: number | null
          orb_pct: number | null
          overtimes: string | null
          pace: number | null
          points: number | null
          points_in_paint: number | null
          possessions: number | null
          rebounds: number | null
          second_chance_points: number | null
          source: string | null
          steals: number | null
          stl_pct: number | null
          team_abbr: string
          three_attempted: number | null
          three_made: number | null
          three_par: number | null
          tov_pct: number | null
          trb_pct: number | null
          ts_pct: number | null
          turnovers: number | null
        }
        Insert: {
          assists?: number | null
          ast_pct?: number | null
          bench_points?: number | null
          blk_pct?: number | null
          blocks?: number | null
          created_at?: string
          def_rating?: number | null
          def_rebounds?: number | null
          efg_pct?: number | null
          fast_break_points?: number | null
          fg_attempted?: number | null
          fg_made?: number | null
          ft_attempted?: number | null
          ft_made?: number | null
          ft_per_fga?: number | null
          ftr?: number | null
          game_id: string
          id?: string
          is_home: boolean
          off_rating?: number | null
          off_rebounds?: number | null
          opp_efg_pct?: number | null
          opp_ft_per_fga?: number | null
          opp_orb_pct?: number | null
          opp_tov_pct?: number | null
          orb_pct?: number | null
          overtimes?: string | null
          pace?: number | null
          points?: number | null
          points_in_paint?: number | null
          possessions?: number | null
          rebounds?: number | null
          second_chance_points?: number | null
          source?: string | null
          steals?: number | null
          stl_pct?: number | null
          team_abbr: string
          three_attempted?: number | null
          three_made?: number | null
          three_par?: number | null
          tov_pct?: number | null
          trb_pct?: number | null
          ts_pct?: number | null
          turnovers?: number | null
        }
        Update: {
          assists?: number | null
          ast_pct?: number | null
          bench_points?: number | null
          blk_pct?: number | null
          blocks?: number | null
          created_at?: string
          def_rating?: number | null
          def_rebounds?: number | null
          efg_pct?: number | null
          fast_break_points?: number | null
          fg_attempted?: number | null
          fg_made?: number | null
          ft_attempted?: number | null
          ft_made?: number | null
          ft_per_fga?: number | null
          ftr?: number | null
          game_id?: string
          id?: string
          is_home?: boolean
          off_rating?: number | null
          off_rebounds?: number | null
          opp_efg_pct?: number | null
          opp_ft_per_fga?: number | null
          opp_orb_pct?: number | null
          opp_tov_pct?: number | null
          orb_pct?: number | null
          overtimes?: string | null
          pace?: number | null
          points?: number | null
          points_in_paint?: number | null
          possessions?: number | null
          rebounds?: number | null
          second_chance_points?: number | null
          source?: string | null
          steals?: number | null
          stl_pct?: number | null
          team_abbr?: string
          three_attempted?: number | null
          three_made?: number | null
          three_par?: number | null
          tov_pct?: number | null
          trb_pct?: number | null
          ts_pct?: number | null
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
          assists: number | null
          ast_pct: number | null
          ast_to_ratio: number | null
          below_100_opp: number | null
          below_100_own: number | null
          blocks: number | null
          decided_10_losses: number | null
          decided_10_wins: number | null
          decided_3_losses: number | null
          decided_3_wins: number | null
          def_rating: number | null
          def_reb_pct: number | null
          def_rebounds: number | null
          disqualifications: number | null
          fast_break_points: number | null
          fast_break_points_pg: number | null
          fg_attempted: number | null
          fg_made: number | null
          fg_pct: number | null
          ft_attempted: number | null
          ft_made: number | null
          ft_pct: number | null
          games: number | null
          id: string
          league: string
          net_rating: number | null
          off_rating: number | null
          off_reb_pct: number | null
          off_rebounds: number | null
          opp_assists: number | null
          opp_blocks: number | null
          opp_def_rebounds: number | null
          opp_disqualifications: number | null
          opp_fast_break_points: number | null
          opp_fast_break_points_pg: number | null
          opp_fg_attempted: number | null
          opp_fg_made: number | null
          opp_fg_pct: number | null
          opp_ft_attempted: number | null
          opp_ft_made: number | null
          opp_off_rebounds: number | null
          opp_personal_fouls: number | null
          opp_points: number | null
          opp_points_in_paint: number | null
          opp_points_in_paint_pg: number | null
          opp_points_per_game: number | null
          opp_steals: number | null
          opp_three_attempted: number | null
          opp_three_made: number | null
          opp_three_pct: number | null
          opp_tot_rebounds: number | null
          opp_turnovers: number | null
          ot_losses: number | null
          ot_wins: number | null
          pace: number | null
          personal_fouls: number | null
          point_diff: number | null
          points: number | null
          points_in_paint: number | null
          points_in_paint_pg: number | null
          points_per_game: number | null
          reb_pct: number | null
          season: number
          snapshot_date: string | null
          steals: number | null
          stl_to_ratio: number | null
          team_abbr: string
          three_attempted: number | null
          three_made: number | null
          three_pct: number | null
          tot_reb_pct: number | null
          tot_rebounds: number | null
          tov_pct: number | null
          turnovers: number | null
          updated_at: string
        }
        Insert: {
          assists?: number | null
          ast_pct?: number | null
          ast_to_ratio?: number | null
          below_100_opp?: number | null
          below_100_own?: number | null
          blocks?: number | null
          decided_10_losses?: number | null
          decided_10_wins?: number | null
          decided_3_losses?: number | null
          decided_3_wins?: number | null
          def_rating?: number | null
          def_reb_pct?: number | null
          def_rebounds?: number | null
          disqualifications?: number | null
          fast_break_points?: number | null
          fast_break_points_pg?: number | null
          fg_attempted?: number | null
          fg_made?: number | null
          fg_pct?: number | null
          ft_attempted?: number | null
          ft_made?: number | null
          ft_pct?: number | null
          games?: number | null
          id?: string
          league?: string
          net_rating?: number | null
          off_rating?: number | null
          off_reb_pct?: number | null
          off_rebounds?: number | null
          opp_assists?: number | null
          opp_blocks?: number | null
          opp_def_rebounds?: number | null
          opp_disqualifications?: number | null
          opp_fast_break_points?: number | null
          opp_fast_break_points_pg?: number | null
          opp_fg_attempted?: number | null
          opp_fg_made?: number | null
          opp_fg_pct?: number | null
          opp_ft_attempted?: number | null
          opp_ft_made?: number | null
          opp_off_rebounds?: number | null
          opp_personal_fouls?: number | null
          opp_points?: number | null
          opp_points_in_paint?: number | null
          opp_points_in_paint_pg?: number | null
          opp_points_per_game?: number | null
          opp_steals?: number | null
          opp_three_attempted?: number | null
          opp_three_made?: number | null
          opp_three_pct?: number | null
          opp_tot_rebounds?: number | null
          opp_turnovers?: number | null
          ot_losses?: number | null
          ot_wins?: number | null
          pace?: number | null
          personal_fouls?: number | null
          point_diff?: number | null
          points?: number | null
          points_in_paint?: number | null
          points_in_paint_pg?: number | null
          points_per_game?: number | null
          reb_pct?: number | null
          season: number
          snapshot_date?: string | null
          steals?: number | null
          stl_to_ratio?: number | null
          team_abbr: string
          three_attempted?: number | null
          three_made?: number | null
          three_pct?: number | null
          tot_reb_pct?: number | null
          tot_rebounds?: number | null
          tov_pct?: number | null
          turnovers?: number | null
          updated_at?: string
        }
        Update: {
          assists?: number | null
          ast_pct?: number | null
          ast_to_ratio?: number | null
          below_100_opp?: number | null
          below_100_own?: number | null
          blocks?: number | null
          decided_10_losses?: number | null
          decided_10_wins?: number | null
          decided_3_losses?: number | null
          decided_3_wins?: number | null
          def_rating?: number | null
          def_reb_pct?: number | null
          def_rebounds?: number | null
          disqualifications?: number | null
          fast_break_points?: number | null
          fast_break_points_pg?: number | null
          fg_attempted?: number | null
          fg_made?: number | null
          fg_pct?: number | null
          ft_attempted?: number | null
          ft_made?: number | null
          ft_pct?: number | null
          games?: number | null
          id?: string
          league?: string
          net_rating?: number | null
          off_rating?: number | null
          off_reb_pct?: number | null
          off_rebounds?: number | null
          opp_assists?: number | null
          opp_blocks?: number | null
          opp_def_rebounds?: number | null
          opp_disqualifications?: number | null
          opp_fast_break_points?: number | null
          opp_fast_break_points_pg?: number | null
          opp_fg_attempted?: number | null
          opp_fg_made?: number | null
          opp_fg_pct?: number | null
          opp_ft_attempted?: number | null
          opp_ft_made?: number | null
          opp_off_rebounds?: number | null
          opp_personal_fouls?: number | null
          opp_points?: number | null
          opp_points_in_paint?: number | null
          opp_points_in_paint_pg?: number | null
          opp_points_per_game?: number | null
          opp_steals?: number | null
          opp_three_attempted?: number | null
          opp_three_made?: number | null
          opp_three_pct?: number | null
          opp_tot_rebounds?: number | null
          opp_turnovers?: number | null
          ot_losses?: number | null
          ot_wins?: number | null
          pace?: number | null
          personal_fouls?: number | null
          point_diff?: number | null
          points?: number | null
          points_in_paint?: number | null
          points_in_paint_pg?: number | null
          points_per_game?: number | null
          reb_pct?: number | null
          season?: number
          snapshot_date?: string | null
          steals?: number | null
          stl_to_ratio?: number | null
          team_abbr?: string
          three_attempted?: number | null
          three_made?: number | null
          three_pct?: number | null
          tot_reb_pct?: number | null
          tot_rebounds?: number | null
          tov_pct?: number | null
          turnovers?: number | null
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
          result_direction: string | null
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
          result_direction?: string | null
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
          result_direction?: string | null
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
      trending_players: {
        Row: {
          as_of: string
          headshot_url: string | null
          id: string
          league: string
          player_id: string | null
          player_name: string | null
          position: string | null
          rank: number | null
          reason: Json | null
          team: string | null
          trend_score: number | null
        }
        Insert: {
          as_of?: string
          headshot_url?: string | null
          id?: string
          league?: string
          player_id?: string | null
          player_name?: string | null
          position?: string | null
          rank?: number | null
          reason?: Json | null
          team?: string | null
          trend_score?: number | null
        }
        Update: {
          as_of?: string
          headshot_url?: string | null
          id?: string
          league?: string
          player_id?: string | null
          player_name?: string | null
          position?: string | null
          rank?: number | null
          reason?: Json | null
          team?: string | null
          trend_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "trending_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      trending_teams: {
        Row: {
          as_of: string
          id: string
          league: string
          rank: number | null
          reason: Json | null
          team_abbr: string
          team_name: string | null
          trend_score: number | null
        }
        Insert: {
          as_of?: string
          id?: string
          league?: string
          rank?: number | null
          reason?: Json | null
          team_abbr: string
          team_name?: string | null
          trend_score?: number | null
        }
        Update: {
          as_of?: string
          id?: string
          league?: string
          rank?: number | null
          reason?: Json | null
          team_abbr?: string
          team_name?: string | null
          trend_score?: number | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          astro_weight: number
          astrocartography: boolean
          combustion: boolean
          created_at: string
          house_system: string
          id: string
          market_weight: number
          orb_size: string
          reception_dignity: boolean
          retrograde: boolean
          stat_weight: number
          travel_factors: boolean
          updated_at: string
          user_id: string
          void_of_course: boolean
        }
        Insert: {
          astro_weight?: number
          astrocartography?: boolean
          combustion?: boolean
          created_at?: string
          house_system?: string
          id?: string
          market_weight?: number
          orb_size?: string
          reception_dignity?: boolean
          retrograde?: boolean
          stat_weight?: number
          travel_factors?: boolean
          updated_at?: string
          user_id: string
          void_of_course?: boolean
        }
        Update: {
          astro_weight?: number
          astrocartography?: boolean
          combustion?: boolean
          created_at?: string
          house_system?: string
          id?: string
          market_weight?: number
          orb_size?: string
          reception_dignity?: boolean
          retrograde?: boolean
          stat_weight?: number
          travel_factors?: boolean
          updated_at?: string
          user_id?: string
          void_of_course?: boolean
        }
        Relationships: []
      }
    }
    Views: {
      np_player_prop_stat_long: {
        Row: {
          game_id: string | null
          player_id: string | null
          prop_type: string | null
          stat_value: number | null
        }
        Relationships: []
      }
      np_v_backtest_overlay: {
        Row: {
          book: string | null
          closing_line: number | null
          closing_odds: number | null
          closing_ts: string | null
          clv_line_diff: number | null
          confidence: number | null
          edge_score: number | null
          game_id: string | null
          player_id: string | null
          pred_line: number | null
          pred_odds: number | null
          pred_ts: string | null
          prop_type: string | null
          side: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nebula_prop_predictions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nebula_prop_predictions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      np_v_backtest_results: {
        Row: {
          book: string | null
          closing_line: number | null
          closing_odds: number | null
          closing_ts: string | null
          clv_line_diff: number | null
          confidence: number | null
          edge_score: number | null
          game_id: string | null
          player_id: string | null
          pred_line: number | null
          pred_odds: number | null
          pred_ts: string | null
          prop_type: string | null
          side: string | null
          stat_value: number | null
          win_flag: number | null
        }
        Relationships: [
          {
            foreignKeyName: "nebula_prop_predictions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nebula_prop_predictions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      np_v_closing_lines: {
        Row: {
          book: string | null
          closing_line: number | null
          closing_odds: number | null
          closing_ts: string | null
          game_id: string | null
          player_id: string | null
          prop_type: string | null
          side: string | null
        }
        Relationships: []
      }
      np_v_latest_prop_predictions: {
        Row: {
          astro: Json | null
          away_abbr: string | null
          book: string | null
          confidence: number | null
          created_at: string | null
          edge_score: number | null
          game_id: string | null
          game_start_time: string | null
          headshot_url: string | null
          hit_l10: number | null
          hit_l20: number | null
          home_abbr: string | null
          id: string | null
          league: string | null
          line: number | null
          microbars: Json | null
          mu: number | null
          odds: number | null
          one_liner: string | null
          player_id: string | null
          player_name: string | null
          player_team: string | null
          pred_ts: string | null
          prop_type: string | null
          risk: number | null
          side: string | null
          sigma: number | null
          streak: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nebula_prop_predictions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nebula_prop_predictions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      np_v_prop_overlay: {
        Row: {
          astro: Json | null
          away_abbr: string | null
          book: string | null
          confidence: number | null
          created_at: string | null
          edge_score: number | null
          game_id: string | null
          game_start_time: string | null
          headshot_url: string | null
          hit_l10: number | null
          hit_l20: number | null
          home_abbr: string | null
          id: string | null
          league: string | null
          line: number | null
          microbars: Json | null
          mu: number | null
          odds: number | null
          one_liner: string | null
          player_id: string | null
          player_name: string | null
          player_team: string | null
          pred_ts: string | null
          prop_type: string | null
          risk: number | null
          side: string | null
          sigma: number | null
          streak: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nebula_prop_predictions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nebula_prop_predictions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      v_nfl_player_game_metrics: {
        Row: {
          away_team_name: string | null
          catch_percentage: number | null
          completions: number | null
          created_at: string | null
          game_id: string | null
          game_time: string | null
          home_team_name: string | null
          interceptions: number | null
          longest_reception: number | null
          longest_rush: number | null
          passing_attempts: number | null
          passing_tds: number | null
          passing_yards: number | null
          player_id: string | null
          player_name: string | null
          raw_json: Json | null
          receiving_first_downs: number | null
          receiving_tds: number | null
          receiving_yards: number | null
          receiving_yards_per_reception: number | null
          receiving_yards_per_target: number | null
          receptions: number | null
          rush_attempts: number | null
          rush_rec_tds: number | null
          rush_rec_yards: number | null
          rushing_first_downs: number | null
          rushing_tds: number | null
          rushing_yards: number | null
          rushing_yards_per_attempt: number | null
          season_year: number | null
          targets: number | null
          team_abbr: string | null
          updated_at: string | null
          week: number | null
        }
        Relationships: [
          {
            foreignKeyName: "nfl_player_game_stats_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "nfl_games"
            referencedColumns: ["game_id"]
          },
        ]
      }
      v_nfl_player_quarter_metrics: {
        Row: {
          game_id: string | null
          player_id: string | null
          player_name: string | null
          quarter: number | null
          scoring_plays: number | null
          team_abbr: string | null
          total_plays: number | null
          touchdowns: number | null
        }
        Relationships: [
          {
            foreignKeyName: "nfl_play_by_play_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "nfl_games"
            referencedColumns: ["game_id"]
          },
        ]
      }
    }
    Functions: {
      aggregate_period_stats: {
        Args: { p_game_id?: string }
        Returns: undefined
      }
      f_unaccent: { Args: { "": string }; Returns: string }
      get_public_profiles: {
        Args: { user_ids: string[] }
        Returns: {
          avatar_url: string
          bio: string
          display_name: string
          moon_sign: string
          rising_sign: string
          share_astro: boolean
          share_picks: boolean
          sun_sign: string
          user_id: string
          username: string
        }[]
      }
      get_suggested_profiles: {
        Args: { max_results?: number }
        Returns: {
          avatar_url: string
          bio: string
          display_name: string
          moon_sign: string
          rising_sign: string
          share_astro: boolean
          share_picks: boolean
          sun_sign: string
          user_id: string
          username: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_conversation_member: {
        Args: { _conversation_id: string; _user_id: string }
        Returns: boolean
      }
      merge_players: {
        Args: { source_id: string; target_id: string }
        Returns: undefined
      }
      np_apply_edgescore_v11: { Args: { hours_back?: number }; Returns: number }
      np_build_prop_features: {
        Args: {
          p_game_id?: string
          p_line: number
          p_player_id: string
          p_prop_type: string
        }
        Returns: {
          coeff_of_var: number
          delta_minutes: number
          games_count: number
          hit_l10: number
          hit_l20: number
          hit_l5: number
          minutes_l5_avg: number
          minutes_season_avg: number
          mu_rolling_l10: number
          mu_season: number
          role_up: boolean
          sigma_rolling_l10: number
          sigma_season: number
          std_dev_l10: number
          usage_proxy_l10: number
          usage_proxy_season: number
        }[]
      }
      np_norm_cdf: { Args: { z: number }; Returns: number }
      np_persist_edgescore_v11: {
        Args: { minutes_back?: number }
        Returns: number
      }
      np_prop_stat_value: {
        Args: {
          p_assists: number
          p_blocks: number
          p_fg_attempted: number
          p_points: number
          p_prop_type: string
          p_rebounds: number
          p_steals: number
          p_three_made: number
          p_turnovers: number
        }
        Returns: number
      }
      safe_delete_game: { Args: { p_game_id: string }; Returns: Json }
      safe_delete_player: { Args: { p_player_id: string }; Returns: Json }
      search_players_unaccent: {
        Args: { max_results?: number; search_query: string }
        Returns: {
          player_headshot_url: string
          player_id: string
          player_league: string
          player_name: string
          player_position: string
          player_team: string
        }[]
      }
      search_public_profiles: {
        Args: { max_results?: number; search_query: string }
        Returns: {
          avatar_url: string
          bio: string
          display_name: string
          moon_sign: string
          rising_sign: string
          share_astro: boolean
          share_picks: boolean
          sun_sign: string
          user_id: string
          username: string
        }[]
      }
      settle_bets_on_game: { Args: { p_game_id: string }; Returns: undefined }
      sync_live_scores_via_api: { Args: never; Returns: Json }
      unaccent: { Args: { "": string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
