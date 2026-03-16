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
          {
            foreignKeyName: "alerts_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_current_game_players"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "alerts_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_game_live_state"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "alerts_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_oracle_player_validity"
            referencedColumns: ["game_id"]
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
      app_handshake: {
        Row: {
          app_slug: string
          created_at: string
          id: number
          updated_at: string
        }
        Insert: {
          app_slug?: string
          created_at?: string
          id?: number
          updated_at?: string
        }
        Update: {
          app_slug?: string
          created_at?: string
          id?: number
          updated_at?: string
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
      bdl_player_cache: {
        Row: {
          bdl_id: string
          fetched_at: string | null
          first_name: string | null
          full_name: string | null
          last_name: string | null
          team: string | null
        }
        Insert: {
          bdl_id: string
          fetched_at?: string | null
          first_name?: string | null
          full_name?: string | null
          last_name?: string | null
          team?: string | null
        }
        Update: {
          bdl_id?: string
          fetched_at?: string | null
          first_name?: string | null
          full_name?: string | null
          last_name?: string | null
          team?: string | null
        }
        Relationships: []
      }
      bet_slip_picks: {
        Row: {
          created_at: string
          direction: string
          game_id: string | null
          id: string
          line: number
          live_value: number | null
          match_status: string
          player_id: string | null
          player_name_raw: string
          progress: number | null
          prop_shell_id: string | null
          result: string | null
          slip_id: string
          stat_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          direction?: string
          game_id?: string | null
          id?: string
          line: number
          live_value?: number | null
          match_status?: string
          player_id?: string | null
          player_name_raw: string
          progress?: number | null
          prop_shell_id?: string | null
          result?: string | null
          slip_id: string
          stat_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          direction?: string
          game_id?: string | null
          id?: string
          line?: number
          live_value?: number | null
          match_status?: string
          player_id?: string | null
          player_name_raw?: string
          progress?: number | null
          prop_shell_id?: string | null
          result?: string | null
          slip_id?: string
          stat_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bet_slip_picks_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bet_slip_picks_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_current_game_players"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "bet_slip_picks_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_game_live_state"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "bet_slip_picks_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_oracle_player_validity"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "bet_slip_picks_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bet_slip_picks_prop_shell_id_fkey"
            columns: ["prop_shell_id"]
            isOneToOne: false
            referencedRelation: "tracked_prop_shells"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bet_slip_picks_slip_id_fkey"
            columns: ["slip_id"]
            isOneToOne: false
            referencedRelation: "bet_slips"
            referencedColumns: ["id"]
          },
        ]
      }
      bet_slips: {
        Row: {
          book: string
          created_at: string
          entry_type: string | null
          id: string
          intent_state: string
          notes: string | null
          payout: number | null
          result: string | null
          settled_at: string | null
          source: string
          source_url: string | null
          stake: number | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          book?: string
          created_at?: string
          entry_type?: string | null
          id?: string
          intent_state?: string
          notes?: string | null
          payout?: number | null
          result?: string | null
          settled_at?: string | null
          source?: string
          source_url?: string | null
          stake?: number | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          book?: string
          created_at?: string
          entry_type?: string | null
          id?: string
          intent_state?: string
          notes?: string | null
          payout?: number | null
          result?: string | null
          settled_at?: string | null
          source?: string
          source_url?: string | null
          stake?: number | null
          status?: string
          updated_at?: string
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
            foreignKeyName: "bets_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_current_game_players"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "bets_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_game_live_state"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "bets_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_oracle_player_validity"
            referencedColumns: ["game_id"]
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
      ce_astro_overrides: {
        Row: {
          astro_conf_multiplier: number | null
          astro_mean_multiplier: number | null
          astro_tone: string | null
          jupiter_lift: number | null
          mars_boost: number | null
          mercury_chaos: number | null
          neptune_fog: number | null
          note: string | null
          player_id: number
          saturn_clamp: number | null
          sky_noise: string | null
          updated_at: string | null
        }
        Insert: {
          astro_conf_multiplier?: number | null
          astro_mean_multiplier?: number | null
          astro_tone?: string | null
          jupiter_lift?: number | null
          mars_boost?: number | null
          mercury_chaos?: number | null
          neptune_fog?: number | null
          note?: string | null
          player_id: number
          saturn_clamp?: number | null
          sky_noise?: string | null
          updated_at?: string | null
        }
        Update: {
          astro_conf_multiplier?: number | null
          astro_mean_multiplier?: number | null
          astro_tone?: string | null
          jupiter_lift?: number | null
          mars_boost?: number | null
          mercury_chaos?: number | null
          neptune_fog?: number | null
          note?: string | null
          player_id?: number
          saturn_clamp?: number | null
          sky_noise?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      ce_engine_registry: {
        Row: {
          created_at: string | null
          description: string | null
          display_order: number | null
          engine_key: string
          engine_name: string
          id: string
          input_objects: Json | null
          layer: string | null
          notes: string | null
          output_objects: Json | null
          purpose: string | null
          status: string | null
          updated_at: string | null
          version: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          engine_key: string
          engine_name: string
          id?: string
          input_objects?: Json | null
          layer?: string | null
          notes?: string | null
          output_objects?: Json | null
          purpose?: string | null
          status?: string | null
          updated_at?: string | null
          version?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          engine_key?: string
          engine_name?: string
          id?: string
          input_objects?: Json | null
          layer?: string | null
          notes?: string | null
          output_objects?: Json | null
          purpose?: string | null
          status?: string | null
          updated_at?: string | null
          version?: string | null
        }
        Relationships: []
      }
      ce_formulas: {
        Row: {
          category: string | null
          created_at: string | null
          display_order: number | null
          example_input: Json | null
          example_output: Json | null
          formula_name: string
          formula_text: string | null
          id: string
          is_featured: boolean | null
          notes: string | null
          plain_english: string | null
          slug: string | null
          updated_at: string | null
          variables: Json | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          display_order?: number | null
          example_input?: Json | null
          example_output?: Json | null
          formula_name: string
          formula_text?: string | null
          id?: string
          is_featured?: boolean | null
          notes?: string | null
          plain_english?: string | null
          slug?: string | null
          updated_at?: string | null
          variables?: Json | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          display_order?: number | null
          example_input?: Json | null
          example_output?: Json | null
          formula_name?: string
          formula_text?: string | null
          id?: string
          is_featured?: boolean | null
          notes?: string | null
          plain_english?: string | null
          slug?: string | null
          updated_at?: string | null
          variables?: Json | null
        }
        Relationships: []
      }
      ce_game_predictions: {
        Row: {
          away_def_rtg: number | null
          away_net_rating: number | null
          away_off_rtg: number | null
          away_pace: number | null
          blowout_risk: number | null
          book_implied_home: number | null
          created_at: string
          edge_away: number | null
          edge_home: number | null
          expected_possessions: number | null
          fair_ml_away: number | null
          fair_ml_home: number | null
          game_id: string
          home_def_rtg: number | null
          home_net_rating: number | null
          home_off_rtg: number | null
          home_pace: number | null
          id: string
          model_key: string
          mu_away: number | null
          mu_home: number | null
          mu_spread_home: number | null
          mu_total: number | null
          notes_json: Json | null
          p_away_win: number | null
          p_home_win: number | null
          run_ts: string
          sport: string
          updated_at: string
        }
        Insert: {
          away_def_rtg?: number | null
          away_net_rating?: number | null
          away_off_rtg?: number | null
          away_pace?: number | null
          blowout_risk?: number | null
          book_implied_home?: number | null
          created_at?: string
          edge_away?: number | null
          edge_home?: number | null
          expected_possessions?: number | null
          fair_ml_away?: number | null
          fair_ml_home?: number | null
          game_id: string
          home_def_rtg?: number | null
          home_net_rating?: number | null
          home_off_rtg?: number | null
          home_pace?: number | null
          id?: string
          model_key?: string
          mu_away?: number | null
          mu_home?: number | null
          mu_spread_home?: number | null
          mu_total?: number | null
          notes_json?: Json | null
          p_away_win?: number | null
          p_home_win?: number | null
          run_ts?: string
          sport?: string
          updated_at?: string
        }
        Update: {
          away_def_rtg?: number | null
          away_net_rating?: number | null
          away_off_rtg?: number | null
          away_pace?: number | null
          blowout_risk?: number | null
          book_implied_home?: number | null
          created_at?: string
          edge_away?: number | null
          edge_home?: number | null
          expected_possessions?: number | null
          fair_ml_away?: number | null
          fair_ml_home?: number | null
          game_id?: string
          home_def_rtg?: number | null
          home_net_rating?: number | null
          home_off_rtg?: number | null
          home_pace?: number | null
          id?: string
          model_key?: string
          mu_away?: number | null
          mu_home?: number | null
          mu_spread_home?: number | null
          mu_total?: number | null
          notes_json?: Json | null
          p_away_win?: number | null
          p_home_win?: number | null
          run_ts?: string
          sport?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ce_game_predictions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ce_game_predictions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_current_game_players"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "ce_game_predictions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_game_live_state"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "ce_game_predictions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_oracle_player_validity"
            referencedColumns: ["game_id"]
          },
        ]
      }
      ce_glossary: {
        Row: {
          category: string | null
          created_at: string | null
          display_order: number | null
          full_definition: string | null
          id: string
          is_featured: boolean | null
          related_terms: Json | null
          short_definition: string | null
          slug: string | null
          tags: Json | null
          term: string
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          display_order?: number | null
          full_definition?: string | null
          id?: string
          is_featured?: boolean | null
          related_terms?: Json | null
          short_definition?: string | null
          slug?: string | null
          tags?: Json | null
          term: string
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          display_order?: number | null
          full_definition?: string | null
          id?: string
          is_featured?: boolean | null
          related_terms?: Json | null
          short_definition?: string | null
          slug?: string | null
          tags?: Json | null
          term?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      ce_info_pages: {
        Row: {
          audience: string | null
          body_md: string | null
          created_at: string | null
          display_order: number | null
          id: string
          is_published: boolean | null
          page_type: string | null
          sections: Json | null
          slug: string
          summary: string | null
          tags: Json | null
          title: string
          updated_at: string | null
        }
        Insert: {
          audience?: string | null
          body_md?: string | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_published?: boolean | null
          page_type?: string | null
          sections?: Json | null
          slug: string
          summary?: string | null
          tags?: Json | null
          title: string
          updated_at?: string | null
        }
        Update: {
          audience?: string | null
          body_md?: string | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_published?: boolean | null
          page_type?: string | null
          sections?: Json | null
          slug?: string
          summary?: string | null
          tags?: Json | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      ce_injury_overrides: {
        Row: {
          injury_multiplier: number | null
          note: string | null
          player_id: number
          updated_at: string | null
        }
        Insert: {
          injury_multiplier?: number | null
          note?: string | null
          player_id: number
          updated_at?: string | null
        }
        Update: {
          injury_multiplier?: number | null
          note?: string | null
          player_id?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      ce_injury_ripple_overrides: {
        Row: {
          player_id: number
          ripple_multiplier: number | null
          ripple_reason: string | null
          updated_at: string | null
        }
        Insert: {
          player_id: number
          ripple_multiplier?: number | null
          ripple_reason?: string | null
          updated_at?: string | null
        }
        Update: {
          player_id?: number
          ripple_multiplier?: number | null
          ripple_reason?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      ce_injury_status: {
        Row: {
          player_id: number | null
          status: string | null
          team_id: number | null
          updated_at: string | null
          usage_impact: number | null
        }
        Insert: {
          player_id?: number | null
          status?: string | null
          team_id?: number | null
          updated_at?: string | null
          usage_impact?: number | null
        }
        Update: {
          player_id?: number | null
          status?: string | null
          team_id?: number | null
          updated_at?: string | null
          usage_impact?: number | null
        }
        Relationships: []
      }
      ce_matchup_difficulty: {
        Row: {
          difficulty_multiplier: number | null
          note: string | null
          stat_key: string
          team_abbr: string
          updated_at: string | null
        }
        Insert: {
          difficulty_multiplier?: number | null
          note?: string | null
          stat_key: string
          team_abbr: string
          updated_at?: string | null
        }
        Update: {
          difficulty_multiplier?: number | null
          note?: string | null
          stat_key?: string
          team_abbr?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      ce_matchup_overrides: {
        Row: {
          matchup_multiplier: number | null
          note: string | null
          player_id: number
          stat_key: string
          updated_at: string | null
        }
        Insert: {
          matchup_multiplier?: number | null
          note?: string | null
          player_id: number
          stat_key: string
          updated_at?: string | null
        }
        Update: {
          matchup_multiplier?: number | null
          note?: string | null
          player_id?: number
          stat_key?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      ce_props_norm: {
        Row: {
          bdl_player_id: number | null
          game_date: string | null
          game_key: string | null
          id: string
          line_value: number | null
          loaded_at: string | null
          market_type: string | null
          model_player_id: number | null
          over_odds: number | null
          player_name: string | null
          prop_type: string | null
          provider: string | null
          raw: Json | null
          source_table: string | null
          stat_key: string | null
          under_odds: number | null
          vendor: string | null
        }
        Insert: {
          bdl_player_id?: number | null
          game_date?: string | null
          game_key?: string | null
          id: string
          line_value?: number | null
          loaded_at?: string | null
          market_type?: string | null
          model_player_id?: number | null
          over_odds?: number | null
          player_name?: string | null
          prop_type?: string | null
          provider?: string | null
          raw?: Json | null
          source_table?: string | null
          stat_key?: string | null
          under_odds?: number | null
          vendor?: string | null
        }
        Update: {
          bdl_player_id?: number | null
          game_date?: string | null
          game_key?: string | null
          id?: string
          line_value?: number | null
          loaded_at?: string | null
          market_type?: string | null
          model_player_id?: number | null
          over_odds?: number | null
          player_name?: string | null
          prop_type?: string | null
          provider?: string | null
          raw?: Json | null
          source_table?: string | null
          stat_key?: string | null
          under_odds?: number | null
          vendor?: string | null
        }
        Relationships: []
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
      custom_model_runs: {
        Row: {
          calculation_trace: Json | null
          confidence: number | null
          created_at: string | null
          explanation: string | null
          game_id: string | null
          id: string
          inputs: Json | null
          market_type: string | null
          model_id: string | null
          model_key: string | null
          outputs: Json | null
          player_id: string | null
          sport: string | null
          user_id: string
        }
        Insert: {
          calculation_trace?: Json | null
          confidence?: number | null
          created_at?: string | null
          explanation?: string | null
          game_id?: string | null
          id?: string
          inputs?: Json | null
          market_type?: string | null
          model_id?: string | null
          model_key?: string | null
          outputs?: Json | null
          player_id?: string | null
          sport?: string | null
          user_id: string
        }
        Update: {
          calculation_trace?: Json | null
          confidence?: number | null
          created_at?: string | null
          explanation?: string | null
          game_id?: string | null
          id?: string
          inputs?: Json | null
          market_type?: string | null
          model_id?: string | null
          model_key?: string | null
          outputs?: Json | null
          player_id?: string | null
          sport?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_model_runs_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_model_runs_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_current_game_players"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "custom_model_runs_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_game_live_state"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "custom_model_runs_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_oracle_player_validity"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "custom_model_runs_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "custom_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_model_runs_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_models: {
        Row: {
          created_at: string | null
          description: string | null
          factors: Json
          id: string
          is_active: boolean | null
          is_default: boolean | null
          market_type: string
          name: string
          notes: string | null
          sport: string
          tags: string[] | null
          target_output: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          factors?: Json
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          market_type?: string
          name: string
          notes?: string | null
          sport?: string
          tags?: string[] | null
          target_output?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          factors?: Json
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          market_type?: string
          name?: string
          notes?: string | null
          sport?: string
          tags?: string[] | null
          target_output?: string
          updated_at?: string | null
          user_id?: string
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
      fantasy_scoring_rules: {
        Row: {
          assists_weight: number
          blocks_weight: number
          created_at: string
          points_weight: number
          rebounds_weight: number
          sportsbook: string
          steals_weight: number
          turnovers_weight: number
        }
        Insert: {
          assists_weight?: number
          blocks_weight?: number
          created_at?: string
          points_weight?: number
          rebounds_weight?: number
          sportsbook: string
          steals_weight?: number
          turnovers_weight?: number
        }
        Update: {
          assists_weight?: number
          blocks_weight?: number
          created_at?: string
          points_weight?: number
          rebounds_weight?: number
          sportsbook?: string
          steals_weight?: number
          turnovers_weight?: number
        }
        Relationships: []
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
      game_live_wp: {
        Row: {
          computed_at: string
          fair_ml_away: number | null
          fair_ml_home: number | null
          game_key: string
          id: number
          possessions_remaining: number | null
          quarter: number | null
          scope: string
          score_diff: number | null
          sport: string
          time_remaining_sec: number | null
          updated_at: string
          wp_home: number
        }
        Insert: {
          computed_at?: string
          fair_ml_away?: number | null
          fair_ml_home?: number | null
          game_key: string
          id?: never
          possessions_remaining?: number | null
          quarter?: number | null
          scope: string
          score_diff?: number | null
          sport?: string
          time_remaining_sec?: number | null
          updated_at?: string
          wp_home: number
        }
        Update: {
          computed_at?: string
          fair_ml_away?: number | null
          fair_ml_home?: number | null
          game_key?: string
          id?: never
          possessions_remaining?: number | null
          quarter?: number | null
          scope?: string
          score_diff?: number | null
          sport?: string
          time_remaining_sec?: number | null
          updated_at?: string
          wp_home?: number
        }
        Relationships: []
      }
      game_predictions: {
        Row: {
          away_def_rtg: number | null
          away_off_rtg: number | null
          away_pace: number | null
          blowout_risk: number | null
          book_implied_home: number | null
          created_at: string
          edge_away: number | null
          edge_home: number | null
          expected_possessions: number | null
          fair_ml_away: number | null
          fair_ml_home: number | null
          game_id: string
          home_def_rtg: number | null
          home_off_rtg: number | null
          home_pace: number | null
          id: string
          is_live: boolean | null
          live_possession: string | null
          live_quarter: number | null
          live_score_diff: number | null
          live_time_remaining: number | null
          live_wp_home: number | null
          model_key: string
          mu_away: number | null
          mu_home: number | null
          mu_spread_home: number | null
          mu_total: number | null
          notes_json: Json | null
          p_away_win: number | null
          p_home_win: number | null
          p_home_win_ci_high: number | null
          p_home_win_ci_low: number | null
          qtr_fair_ml: Json | null
          qtr_wp_home: Json | null
          run_ts: string
          sport: string
          updated_at: string
        }
        Insert: {
          away_def_rtg?: number | null
          away_off_rtg?: number | null
          away_pace?: number | null
          blowout_risk?: number | null
          book_implied_home?: number | null
          created_at?: string
          edge_away?: number | null
          edge_home?: number | null
          expected_possessions?: number | null
          fair_ml_away?: number | null
          fair_ml_home?: number | null
          game_id: string
          home_def_rtg?: number | null
          home_off_rtg?: number | null
          home_pace?: number | null
          id?: string
          is_live?: boolean | null
          live_possession?: string | null
          live_quarter?: number | null
          live_score_diff?: number | null
          live_time_remaining?: number | null
          live_wp_home?: number | null
          model_key?: string
          mu_away?: number | null
          mu_home?: number | null
          mu_spread_home?: number | null
          mu_total?: number | null
          notes_json?: Json | null
          p_away_win?: number | null
          p_home_win?: number | null
          p_home_win_ci_high?: number | null
          p_home_win_ci_low?: number | null
          qtr_fair_ml?: Json | null
          qtr_wp_home?: Json | null
          run_ts?: string
          sport?: string
          updated_at?: string
        }
        Update: {
          away_def_rtg?: number | null
          away_off_rtg?: number | null
          away_pace?: number | null
          blowout_risk?: number | null
          book_implied_home?: number | null
          created_at?: string
          edge_away?: number | null
          edge_home?: number | null
          expected_possessions?: number | null
          fair_ml_away?: number | null
          fair_ml_home?: number | null
          game_id?: string
          home_def_rtg?: number | null
          home_off_rtg?: number | null
          home_pace?: number | null
          id?: string
          is_live?: boolean | null
          live_possession?: string | null
          live_quarter?: number | null
          live_score_diff?: number | null
          live_time_remaining?: number | null
          live_wp_home?: number | null
          model_key?: string
          mu_away?: number | null
          mu_home?: number | null
          mu_spread_home?: number | null
          mu_total?: number | null
          notes_json?: Json | null
          p_away_win?: number | null
          p_home_win?: number | null
          p_home_win_ci_high?: number | null
          p_home_win_ci_low?: number | null
          qtr_fair_ml?: Json | null
          qtr_wp_home?: Json | null
          run_ts?: string
          sport?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_predictions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_predictions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_current_game_players"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "game_predictions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_game_live_state"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "game_predictions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_oracle_player_validity"
            referencedColumns: ["game_id"]
          },
        ]
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
          {
            foreignKeyName: "game_quarters_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_current_game_players"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "game_quarters_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_game_live_state"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "game_quarters_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_oracle_player_validity"
            referencedColumns: ["game_id"]
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
            foreignKeyName: "game_referees_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_current_game_players"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "game_referees_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_game_live_state"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "game_referees_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_oracle_player_validity"
            referencedColumns: ["game_id"]
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
          clock_seconds_remaining: number | null
          game_id: string
          home_score: number | null
          id: string
          possession: string | null
          quarter: string | null
          status: string | null
        }
        Insert: {
          away_score?: number | null
          captured_at?: string
          clock?: string | null
          clock_seconds_remaining?: number | null
          game_id: string
          home_score?: number | null
          id?: string
          possession?: string | null
          quarter?: string | null
          status?: string | null
        }
        Update: {
          away_score?: number | null
          captured_at?: string
          clock?: string | null
          clock_seconds_remaining?: number | null
          game_id?: string
          home_score?: number | null
          id?: string
          possession?: string | null
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
          {
            foreignKeyName: "game_state_snapshots_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_current_game_players"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "game_state_snapshots_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_game_live_state"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "game_state_snapshots_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_oracle_player_validity"
            referencedColumns: ["game_id"]
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
          {
            foreignKeyName: "historical_odds_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_current_game_players"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "historical_odds_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_game_live_state"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "historical_odds_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_oracle_player_validity"
            referencedColumns: ["game_id"]
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
            foreignKeyName: "intel_notes_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_current_game_players"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "intel_notes_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_game_live_state"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "intel_notes_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_oracle_player_validity"
            referencedColumns: ["game_id"]
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
      live_prop_state: {
        Row: {
          astro_modifier: number | null
          astro_note: string | null
          astro_risk_modifier: number | null
          away_score: number | null
          blowout_probability: number | null
          current_value: number | null
          expected_return: number | null
          foul_count: number | null
          foul_risk_level: string | null
          game_clock: string | null
          game_id: string
          game_quarter: number | null
          hit_probability: number | null
          home_score: number | null
          id: string
          implied_probability: number | null
          line: number
          live_confidence: number | null
          live_edge: number | null
          minutes_played: number | null
          minutes_security_score: number | null
          pace_pct: number | null
          period_scope: string
          player_id: string
          projected_final: number | null
          projected_minutes: number | null
          prop_type: string
          stat_rate: number | null
          status_label: string | null
          updated_at: string
          volatility: number | null
        }
        Insert: {
          astro_modifier?: number | null
          astro_note?: string | null
          astro_risk_modifier?: number | null
          away_score?: number | null
          blowout_probability?: number | null
          current_value?: number | null
          expected_return?: number | null
          foul_count?: number | null
          foul_risk_level?: string | null
          game_clock?: string | null
          game_id: string
          game_quarter?: number | null
          hit_probability?: number | null
          home_score?: number | null
          id?: string
          implied_probability?: number | null
          line: number
          live_confidence?: number | null
          live_edge?: number | null
          minutes_played?: number | null
          minutes_security_score?: number | null
          pace_pct?: number | null
          period_scope?: string
          player_id: string
          projected_final?: number | null
          projected_minutes?: number | null
          prop_type: string
          stat_rate?: number | null
          status_label?: string | null
          updated_at?: string
          volatility?: number | null
        }
        Update: {
          astro_modifier?: number | null
          astro_note?: string | null
          astro_risk_modifier?: number | null
          away_score?: number | null
          blowout_probability?: number | null
          current_value?: number | null
          expected_return?: number | null
          foul_count?: number | null
          foul_risk_level?: string | null
          game_clock?: string | null
          game_id?: string
          game_quarter?: number | null
          hit_probability?: number | null
          home_score?: number | null
          id?: string
          implied_probability?: number | null
          line?: number
          live_confidence?: number | null
          live_edge?: number | null
          minutes_played?: number | null
          minutes_security_score?: number | null
          pace_pct?: number | null
          period_scope?: string
          player_id?: string
          projected_final?: number | null
          projected_minutes?: number | null
          prop_type?: string
          stat_rate?: number | null
          status_label?: string | null
          updated_at?: string
          volatility?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "live_prop_state_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_prop_state_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_current_game_players"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "live_prop_state_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_game_live_state"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "live_prop_state_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_oracle_player_validity"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "live_prop_state_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
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
      model_game_predictions: {
        Row: {
          blowout_risk: number | null
          book_implied_home: number | null
          created_at: string
          edge_away: number | null
          edge_home: number | null
          expected_possessions: number | null
          fair_ml_away: number | null
          fair_ml_home: number | null
          features_json: Json | null
          game_id: string
          id: string
          model_name: string
          model_version: string
          mu_away: number | null
          mu_home: number | null
          mu_spread_home: number | null
          mu_total: number | null
          notes_json: Json | null
          p_away_win: number | null
          p_home_win: number | null
          p_home_win_ci_high: number | null
          p_home_win_ci_low: number | null
          qtr_fair_ml: Json | null
          qtr_wp_home: Json | null
          run_ts: string
          sport: string
        }
        Insert: {
          blowout_risk?: number | null
          book_implied_home?: number | null
          created_at?: string
          edge_away?: number | null
          edge_home?: number | null
          expected_possessions?: number | null
          fair_ml_away?: number | null
          fair_ml_home?: number | null
          features_json?: Json | null
          game_id: string
          id?: string
          model_name?: string
          model_version?: string
          mu_away?: number | null
          mu_home?: number | null
          mu_spread_home?: number | null
          mu_total?: number | null
          notes_json?: Json | null
          p_away_win?: number | null
          p_home_win?: number | null
          p_home_win_ci_high?: number | null
          p_home_win_ci_low?: number | null
          qtr_fair_ml?: Json | null
          qtr_wp_home?: Json | null
          run_ts?: string
          sport: string
        }
        Update: {
          blowout_risk?: number | null
          book_implied_home?: number | null
          created_at?: string
          edge_away?: number | null
          edge_home?: number | null
          expected_possessions?: number | null
          fair_ml_away?: number | null
          fair_ml_home?: number | null
          features_json?: Json | null
          game_id?: string
          id?: string
          model_name?: string
          model_version?: string
          mu_away?: number | null
          mu_home?: number | null
          mu_spread_home?: number | null
          mu_total?: number | null
          notes_json?: Json | null
          p_away_win?: number | null
          p_home_win?: number | null
          p_home_win_ci_high?: number | null
          p_home_win_ci_low?: number | null
          qtr_fair_ml?: Json | null
          qtr_wp_home?: Json | null
          run_ts?: string
          sport?: string
        }
        Relationships: [
          {
            foreignKeyName: "model_game_predictions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "model_game_predictions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_current_game_players"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "model_game_predictions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_game_live_state"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "model_game_predictions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_oracle_player_validity"
            referencedColumns: ["game_id"]
          },
        ]
      }
      model_predictions: {
        Row: {
          astro_mu_adjust: number | null
          astro_sigma_adjust: number | null
          blowout_risk: number | null
          coeff_of_var: number | null
          confidence_tier: string | null
          created_at: string
          current_line: number | null
          delta_minutes: number | null
          edge_astro: number | null
          edge_hitl10: number | null
          edge_line_move: number | null
          edge_matchup: number | null
          edge_minutes: number | null
          edge_raw: number | null
          edge_score: number | null
          edge_score_v20: number | null
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
          p_implied: number | null
          p_model: number | null
          p_over_base: number | null
          p_over_final: number | null
          pace_mu_adjust: number | null
          pace_sigma_adjust: number | null
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
          confidence_tier?: string | null
          created_at?: string
          current_line?: number | null
          delta_minutes?: number | null
          edge_astro?: number | null
          edge_hitl10?: number | null
          edge_line_move?: number | null
          edge_matchup?: number | null
          edge_minutes?: number | null
          edge_raw?: number | null
          edge_score?: number | null
          edge_score_v20?: number | null
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
          p_implied?: number | null
          p_model?: number | null
          p_over_base?: number | null
          p_over_final?: number | null
          pace_mu_adjust?: number | null
          pace_sigma_adjust?: number | null
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
          confidence_tier?: string | null
          created_at?: string
          current_line?: number | null
          delta_minutes?: number | null
          edge_astro?: number | null
          edge_hitl10?: number | null
          edge_line_move?: number | null
          edge_matchup?: number | null
          edge_minutes?: number | null
          edge_raw?: number | null
          edge_score?: number | null
          edge_score_v20?: number | null
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
          p_implied?: number | null
          p_model?: number | null
          p_over_base?: number | null
          p_over_final?: number | null
          pace_mu_adjust?: number | null
          pace_sigma_adjust?: number | null
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
      nba_game_odds: {
        Row: {
          away_line: number | null
          away_odds: number | null
          game_key: string
          home_line: number | null
          home_odds: number | null
          id: number
          market: string
          over_odds: number | null
          provider: string
          raw: Json | null
          total: number | null
          under_odds: number | null
          updated_at: string
          vendor: string
        }
        Insert: {
          away_line?: number | null
          away_odds?: number | null
          game_key: string
          home_line?: number | null
          home_odds?: number | null
          id?: never
          market: string
          over_odds?: number | null
          provider?: string
          raw?: Json | null
          total?: number | null
          under_odds?: number | null
          updated_at?: string
          vendor: string
        }
        Update: {
          away_line?: number | null
          away_odds?: number | null
          game_key?: string
          home_line?: number | null
          home_odds?: number | null
          id?: never
          market?: string
          over_odds?: number | null
          provider?: string
          raw?: Json | null
          total?: number | null
          under_odds?: number | null
          updated_at?: string
          vendor?: string
        }
        Relationships: []
      }
      nba_pbp_events: {
        Row: {
          away_score: number | null
          created_at: string
          description: string | null
          event_ts_game: string | null
          event_type: string | null
          game_key: string
          home_score: number | null
          id: number
          period: number
          player_id: string | null
          player_name: string | null
          provider: string
          provider_event_id: string
          provider_game_id: string | null
          raw: Json | null
          team_abbr: string | null
        }
        Insert: {
          away_score?: number | null
          created_at?: string
          description?: string | null
          event_ts_game?: string | null
          event_type?: string | null
          game_key: string
          home_score?: number | null
          id?: never
          period: number
          player_id?: string | null
          player_name?: string | null
          provider?: string
          provider_event_id: string
          provider_game_id?: string | null
          raw?: Json | null
          team_abbr?: string | null
        }
        Update: {
          away_score?: number | null
          created_at?: string
          description?: string | null
          event_ts_game?: string | null
          event_type?: string | null
          game_key?: string
          home_score?: number | null
          id?: never
          period?: number
          player_id?: string | null
          player_name?: string | null
          provider?: string
          provider_event_id?: string
          provider_game_id?: string | null
          raw?: Json | null
          team_abbr?: string | null
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
      nba_player_props_archive: {
        Row: {
          game_key: string
          id: number
          line_value: number | null
          market_type: string | null
          odds: number | null
          over_odds: number | null
          player_id: string | null
          player_name: string | null
          prop_type: string | null
          provider: string
          snapshot_ts: string
          under_odds: number | null
          vendor: string | null
        }
        Insert: {
          game_key: string
          id?: never
          line_value?: number | null
          market_type?: string | null
          odds?: number | null
          over_odds?: number | null
          player_id?: string | null
          player_name?: string | null
          prop_type?: string | null
          provider?: string
          snapshot_ts?: string
          under_odds?: number | null
          vendor?: string | null
        }
        Update: {
          game_key?: string
          id?: never
          line_value?: number | null
          market_type?: string | null
          odds?: number | null
          over_odds?: number | null
          player_id?: string | null
          player_name?: string | null
          prop_type?: string | null
          provider?: string
          snapshot_ts?: string
          under_odds?: number | null
          vendor?: string | null
        }
        Relationships: []
      }
      nba_player_props_live: {
        Row: {
          game_key: string
          id: number
          line_value: number
          market_type: string
          odds: number | null
          over_odds: number | null
          player_id: string
          player_name: string | null
          prop_type: string
          provider: string
          raw: Json | null
          under_odds: number | null
          updated_at: string
          vendor: string
        }
        Insert: {
          game_key: string
          id?: never
          line_value: number
          market_type?: string
          odds?: number | null
          over_odds?: number | null
          player_id: string
          player_name?: string | null
          prop_type: string
          provider?: string
          raw?: Json | null
          under_odds?: number | null
          updated_at?: string
          vendor: string
        }
        Update: {
          game_key?: string
          id?: never
          line_value?: number
          market_type?: string
          odds?: number | null
          over_odds?: number | null
          player_id?: string
          player_name?: string | null
          prop_type?: string
          provider?: string
          raw?: Json | null
          under_odds?: number | null
          updated_at?: string
          vendor?: string
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
          confidence_adjustment: number | null
          confidence_tier: string | null
          created_at: string
          edge_raw: number | null
          edge_score: number
          edge_score_v11: number | null
          edge_score_v20: number | null
          game_id: string
          hit_l10: number | null
          hit_l20: number | null
          id: string
          line: number | null
          microbars: Json | null
          mu: number
          odds: number | null
          one_liner: string | null
          p_implied: number | null
          p_model: number | null
          pace_mu_adjust: number | null
          pace_sigma_adjust: number | null
          player_id: string
          pred_ts: string
          prop_type: string
          risk: number
          side: string | null
          sigma: number
          streak: number | null
          transit_boost_factor: number | null
          updated_at: string
          volatility_shift: number | null
        }
        Insert: {
          astro?: Json | null
          book?: string
          confidence?: number
          confidence_adjustment?: number | null
          confidence_tier?: string | null
          created_at?: string
          edge_raw?: number | null
          edge_score?: number
          edge_score_v11?: number | null
          edge_score_v20?: number | null
          game_id: string
          hit_l10?: number | null
          hit_l20?: number | null
          id?: string
          line?: number | null
          microbars?: Json | null
          mu?: number
          odds?: number | null
          one_liner?: string | null
          p_implied?: number | null
          p_model?: number | null
          pace_mu_adjust?: number | null
          pace_sigma_adjust?: number | null
          player_id: string
          pred_ts?: string
          prop_type: string
          risk?: number
          side?: string | null
          sigma?: number
          streak?: number | null
          transit_boost_factor?: number | null
          updated_at?: string
          volatility_shift?: number | null
        }
        Update: {
          astro?: Json | null
          book?: string
          confidence?: number
          confidence_adjustment?: number | null
          confidence_tier?: string | null
          created_at?: string
          edge_raw?: number | null
          edge_score?: number
          edge_score_v11?: number | null
          edge_score_v20?: number | null
          game_id?: string
          hit_l10?: number | null
          hit_l20?: number | null
          id?: string
          line?: number | null
          microbars?: Json | null
          mu?: number
          odds?: number | null
          one_liner?: string | null
          p_implied?: number | null
          p_model?: number | null
          pace_mu_adjust?: number | null
          pace_sigma_adjust?: number | null
          player_id?: string
          pred_ts?: string
          prop_type?: string
          risk?: number
          side?: string | null
          sigma?: number
          streak?: number | null
          transit_boost_factor?: number | null
          updated_at?: string
          volatility_shift?: number | null
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
            foreignKeyName: "nebula_prop_predictions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_current_game_players"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "nebula_prop_predictions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_game_live_state"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "nebula_prop_predictions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_oracle_player_validity"
            referencedColumns: ["game_id"]
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
          {
            foreignKeyName: "odds_snapshots_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_current_game_players"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "odds_snapshots_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_game_live_state"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "odds_snapshots_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_oracle_player_validity"
            referencedColumns: ["game_id"]
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
          clock_seconds: number | null
          created_at: string
          description: string | null
          event_type: string
          game_id: string
          home_score: number | null
          id: string
          player_id: string | null
          quarter: number
          seconds_elapsed_game: number | null
          seconds_remaining_game: number | null
          sequence: number
          team_abbr: string | null
        }
        Insert: {
          assist_player_id?: string | null
          away_score?: number | null
          clock?: string | null
          clock_seconds?: number | null
          created_at?: string
          description?: string | null
          event_type: string
          game_id: string
          home_score?: number | null
          id?: string
          player_id?: string | null
          quarter: number
          seconds_elapsed_game?: number | null
          seconds_remaining_game?: number | null
          sequence: number
          team_abbr?: string | null
        }
        Update: {
          assist_player_id?: string | null
          away_score?: number | null
          clock?: string | null
          clock_seconds?: number | null
          created_at?: string
          description?: string | null
          event_type?: string
          game_id?: string
          home_score?: number | null
          id?: string
          player_id?: string | null
          quarter?: number
          seconds_elapsed_game?: number | null
          seconds_remaining_game?: number | null
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
            foreignKeyName: "play_by_play_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_current_game_players"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "play_by_play_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_game_live_state"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "play_by_play_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_oracle_player_validity"
            referencedColumns: ["game_id"]
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
          personal_fouls: number | null
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
          personal_fouls?: number | null
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
          personal_fouls?: number | null
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
            foreignKeyName: "player_game_stats_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_current_game_players"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "player_game_stats_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_game_live_state"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "player_game_stats_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_oracle_player_validity"
            referencedColumns: ["game_id"]
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
            foreignKeyName: "player_projections_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_current_game_players"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "player_projections_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_game_live_state"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "player_projections_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_oracle_player_validity"
            referencedColumns: ["game_id"]
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
          {
            foreignKeyName: "player_props_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_current_game_players"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "player_props_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_game_live_state"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "player_props_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_oracle_player_validity"
            referencedColumns: ["game_id"]
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
      pregame_odds: {
        Row: {
          away_price: number | null
          bookmaker: string | null
          frozen_at: string
          game_id: string
          home_price: number | null
          id: string
          line: number | null
          market_type: string
        }
        Insert: {
          away_price?: number | null
          bookmaker?: string | null
          frozen_at?: string
          game_id: string
          home_price?: number | null
          id?: string
          line?: number | null
          market_type: string
        }
        Update: {
          away_price?: number | null
          bookmaker?: string | null
          frozen_at?: string
          game_id?: string
          home_price?: number | null
          id?: string
          line?: number | null
          market_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "pregame_odds_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pregame_odds_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_current_game_players"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "pregame_odds_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_game_live_state"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "pregame_odds_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_oracle_player_validity"
            referencedColumns: ["game_id"]
          },
        ]
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
      provider_game_map: {
        Row: {
          away_team_abbr: string | null
          created_at: string
          game_date: string | null
          game_key: string
          home_team_abbr: string | null
          league: string
          provider: string
          provider_game_id: string
          start_time_utc: string | null
          updated_at: string
        }
        Insert: {
          away_team_abbr?: string | null
          created_at?: string
          game_date?: string | null
          game_key: string
          home_team_abbr?: string | null
          league?: string
          provider: string
          provider_game_id: string
          start_time_utc?: string | null
          updated_at?: string
        }
        Update: {
          away_team_abbr?: string | null
          created_at?: string
          game_date?: string | null
          game_key?: string
          home_team_abbr?: string | null
          league?: string
          provider?: string
          provider_game_id?: string
          start_time_utc?: string | null
          updated_at?: string
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
          {
            foreignKeyName: "quant_cache_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_current_game_players"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "quant_cache_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_game_live_state"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "quant_cache_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_oracle_player_validity"
            referencedColumns: ["game_id"]
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
          {
            foreignKeyName: "results_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_current_game_players"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "results_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_game_live_state"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "results_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_oracle_player_validity"
            referencedColumns: ["game_id"]
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
          {
            foreignKeyName: "sdio_game_lines_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_current_game_players"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "sdio_game_lines_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_game_live_state"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "sdio_game_lines_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_oracle_player_validity"
            referencedColumns: ["game_id"]
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
          {
            foreignKeyName: "sgo_market_odds_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_current_game_players"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "sgo_market_odds_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_game_live_state"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "sgo_market_odds_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_oracle_player_validity"
            referencedColumns: ["game_id"]
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
          {
            foreignKeyName: "team_game_stats_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_current_game_players"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "team_game_stats_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_game_live_state"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "team_game_stats_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_oracle_player_validity"
            referencedColumns: ["game_id"]
          },
        ]
      }
      team_period_averages: {
        Row: {
          avg_fg_pct: number | null
          avg_ft_pct: number | null
          avg_pace: number | null
          avg_points: number | null
          avg_points_allowed: number | null
          avg_three_pct: number | null
          games_played: number | null
          id: string
          league: string
          period: string
          season: number
          team_abbr: string
          updated_at: string
        }
        Insert: {
          avg_fg_pct?: number | null
          avg_ft_pct?: number | null
          avg_pace?: number | null
          avg_points?: number | null
          avg_points_allowed?: number | null
          avg_three_pct?: number | null
          games_played?: number | null
          id?: string
          league?: string
          period: string
          season?: number
          team_abbr: string
          updated_at?: string
        }
        Update: {
          avg_fg_pct?: number | null
          avg_ft_pct?: number | null
          avg_pace?: number | null
          avg_points?: number | null
          avg_points_allowed?: number | null
          avg_three_pct?: number | null
          games_played?: number | null
          id?: string
          league?: string
          period?: string
          season?: number
          team_abbr?: string
          updated_at?: string
        }
        Relationships: []
      }
      team_season_pace: {
        Row: {
          avg_pace: number
          avg_points: number
          avg_points_allowed: number
          avg_possessions: number
          def_efg_pct: number | null
          def_rating: number | null
          def_tov_pct: number | null
          efg_pct: number | null
          games_played: number
          league: string
          net_rating: number | null
          off_efg_pct: number | null
          off_rating: number | null
          off_tov_pct: number | null
          season: number
          team_abbr: string
          tov_pct: number | null
          ts_pct: number | null
          updated_at: string
        }
        Insert: {
          avg_pace?: number
          avg_points?: number
          avg_points_allowed?: number
          avg_possessions?: number
          def_efg_pct?: number | null
          def_rating?: number | null
          def_tov_pct?: number | null
          efg_pct?: number | null
          games_played?: number
          league?: string
          net_rating?: number | null
          off_efg_pct?: number | null
          off_rating?: number | null
          off_tov_pct?: number | null
          season?: number
          team_abbr: string
          tov_pct?: number | null
          ts_pct?: number | null
          updated_at?: string
        }
        Update: {
          avg_pace?: number
          avg_points?: number
          avg_points_allowed?: number
          avg_possessions?: number
          def_efg_pct?: number | null
          def_rating?: number | null
          def_tov_pct?: number | null
          efg_pct?: number | null
          games_played?: number
          league?: string
          net_rating?: number | null
          off_efg_pct?: number | null
          off_rating?: number | null
          off_tov_pct?: number | null
          season?: number
          team_abbr?: string
          tov_pct?: number | null
          ts_pct?: number | null
          updated_at?: string
        }
        Relationships: []
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
      tracked_prop_shells: {
        Row: {
          book: string | null
          created_at: string
          direction: string | null
          game_id: string | null
          game_label_raw: string | null
          id: string
          line: number
          market_scope: string | null
          market_type: string | null
          match_status: string
          notes: string | null
          opponent: string | null
          player_id: string | null
          player_name_raw: string
          source: string | null
          sport: string | null
          stat_label_raw: string | null
          stat_type: string
          team: string | null
          tracking_mode: string | null
        }
        Insert: {
          book?: string | null
          created_at?: string
          direction?: string | null
          game_id?: string | null
          game_label_raw?: string | null
          id?: string
          line: number
          market_scope?: string | null
          market_type?: string | null
          match_status?: string
          notes?: string | null
          opponent?: string | null
          player_id?: string | null
          player_name_raw: string
          source?: string | null
          sport?: string | null
          stat_label_raw?: string | null
          stat_type: string
          team?: string | null
          tracking_mode?: string | null
        }
        Update: {
          book?: string | null
          created_at?: string
          direction?: string | null
          game_id?: string | null
          game_label_raw?: string | null
          id?: string
          line?: number
          market_scope?: string | null
          market_type?: string | null
          match_status?: string
          notes?: string | null
          opponent?: string | null
          player_id?: string | null
          player_name_raw?: string
          source?: string | null
          sport?: string | null
          stat_label_raw?: string | null
          stat_type?: string
          team?: string | null
          tracking_mode?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tracked_prop_shells_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracked_prop_shells_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_current_game_players"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "tracked_prop_shells_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_game_live_state"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "tracked_prop_shells_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_oracle_player_validity"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "tracked_prop_shells_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
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
            foreignKeyName: "tracked_props_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_current_game_players"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "tracked_props_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_game_live_state"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "tracked_props_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_oracle_player_validity"
            referencedColumns: ["game_id"]
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
      tt_market_odds: {
        Row: {
          match_id: string
          ml_a: number | null
          over_odds: number | null
          spread_a: number | null
          spread_line: number | null
          total_line: number | null
          under_odds: number | null
          updated_at: string
        }
        Insert: {
          match_id: string
          ml_a?: number | null
          over_odds?: number | null
          spread_a?: number | null
          spread_line?: number | null
          total_line?: number | null
          under_odds?: number | null
          updated_at?: string
        }
        Update: {
          match_id?: string
          ml_a?: number | null
          over_odds?: number | null
          spread_a?: number | null
          spread_line?: number | null
          total_line?: number | null
          under_odds?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tt_market_odds_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "tt_admin_dashboard"
            referencedColumns: ["match_id"]
          },
          {
            foreignKeyName: "tt_market_odds_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "tt_best_opportunities"
            referencedColumns: ["match_id"]
          },
          {
            foreignKeyName: "tt_market_odds_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "tt_live_learned_probs"
            referencedColumns: ["match_id"]
          },
          {
            foreignKeyName: "tt_market_odds_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "tt_live_model"
            referencedColumns: ["match_id"]
          },
          {
            foreignKeyName: "tt_market_odds_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "tt_match_list"
            referencedColumns: ["match_id"]
          },
          {
            foreignKeyName: "tt_market_odds_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "tt_matches"
            referencedColumns: ["id"]
          },
        ]
      }
      tt_match_events: {
        Row: {
          created_at: string
          event_type: string
          id: number
          match_id: string
          payload: Json | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: number
          match_id: string
          payload?: Json | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: number
          match_id?: string
          payload?: Json | null
        }
        Relationships: []
      }
      tt_match_metrics: {
        Row: {
          cover_m05: number
          cover_m15: number
          cover_m25: number
          cover_m35: number
          cover_m45: number
          match_id: string
          over_165: number
          over_175: number
          over_185: number
          over_195: number
          over_205: number
          pr: number
          ps: number
          updated_at: string
          win_prob_a: number
        }
        Insert: {
          cover_m05: number
          cover_m15: number
          cover_m25: number
          cover_m35: number
          cover_m45: number
          match_id: string
          over_165: number
          over_175: number
          over_185: number
          over_195: number
          over_205: number
          pr: number
          ps: number
          updated_at?: string
          win_prob_a: number
        }
        Update: {
          cover_m05?: number
          cover_m15?: number
          cover_m25?: number
          cover_m35?: number
          cover_m45?: number
          match_id?: string
          over_165?: number
          over_175?: number
          over_185?: number
          over_195?: number
          over_205?: number
          pr?: number
          ps?: number
          updated_at?: string
          win_prob_a?: number
        }
        Relationships: [
          {
            foreignKeyName: "tt_match_metrics_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "tt_admin_dashboard"
            referencedColumns: ["match_id"]
          },
          {
            foreignKeyName: "tt_match_metrics_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "tt_best_opportunities"
            referencedColumns: ["match_id"]
          },
          {
            foreignKeyName: "tt_match_metrics_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "tt_live_learned_probs"
            referencedColumns: ["match_id"]
          },
          {
            foreignKeyName: "tt_match_metrics_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "tt_live_model"
            referencedColumns: ["match_id"]
          },
          {
            foreignKeyName: "tt_match_metrics_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "tt_match_list"
            referencedColumns: ["match_id"]
          },
          {
            foreignKeyName: "tt_match_metrics_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "tt_matches"
            referencedColumns: ["id"]
          },
        ]
      }
      tt_matches: {
        Row: {
          best_bet_threshold: number
          created_at: string
          edge_threshold: number
          first_server: string
          id: string
          next_server: string
          player_a: string
          player_b: string
          score_a: number
          score_b: number
          serves_left: number
          status: string
          updated_at: string
        }
        Insert: {
          best_bet_threshold?: number
          created_at?: string
          edge_threshold?: number
          first_server?: string
          id?: string
          next_server?: string
          player_a?: string
          player_b?: string
          score_a?: number
          score_b?: number
          serves_left?: number
          status?: string
          updated_at?: string
        }
        Update: {
          best_bet_threshold?: number
          created_at?: string
          edge_threshold?: number
          first_server?: string
          id?: string
          next_server?: string
          player_a?: string
          player_b?: string
          score_a?: number
          score_b?: number
          serves_left?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      tt_point_log: {
        Row: {
          id: number
          logged_at: string
          match_id: string
          score_a_after: number
          score_b_after: number
          server_after: string
          serves_left_after: number
          winner: string
        }
        Insert: {
          id?: never
          logged_at?: string
          match_id: string
          score_a_after: number
          score_b_after: number
          server_after: string
          serves_left_after: number
          winner: string
        }
        Update: {
          id?: never
          logged_at?: string
          match_id?: string
          score_a_after?: number
          score_b_after?: number
          server_after?: string
          serves_left_after?: number
          winner?: string
        }
        Relationships: [
          {
            foreignKeyName: "tt_point_log_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "tt_admin_dashboard"
            referencedColumns: ["match_id"]
          },
          {
            foreignKeyName: "tt_point_log_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "tt_best_opportunities"
            referencedColumns: ["match_id"]
          },
          {
            foreignKeyName: "tt_point_log_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "tt_live_learned_probs"
            referencedColumns: ["match_id"]
          },
          {
            foreignKeyName: "tt_point_log_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "tt_live_model"
            referencedColumns: ["match_id"]
          },
          {
            foreignKeyName: "tt_point_log_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "tt_match_list"
            referencedColumns: ["match_id"]
          },
          {
            foreignKeyName: "tt_point_log_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "tt_matches"
            referencedColumns: ["id"]
          },
        ]
      }
      tt_points: {
        Row: {
          created_at: string
          id: number
          match_id: string
          point_number: number
          server: string
          winner: string
        }
        Insert: {
          created_at?: string
          id?: number
          match_id: string
          point_number: number
          server: string
          winner: string
        }
        Update: {
          created_at?: string
          id?: number
          match_id?: string
          point_number?: number
          server?: string
          winner?: string
        }
        Relationships: []
      }
      tt_prob_history: {
        Row: {
          cover_m15: number | null
          created_at: string | null
          id: number
          match_id: string | null
          over_185: number | null
          score_a: number | null
          score_b: number | null
          win_prob_a: number | null
        }
        Insert: {
          cover_m15?: number | null
          created_at?: string | null
          id?: number
          match_id?: string | null
          over_185?: number | null
          score_a?: number | null
          score_b?: number | null
          win_prob_a?: number | null
        }
        Update: {
          cover_m15?: number | null
          created_at?: string | null
          id?: number
          match_id?: string | null
          over_185?: number | null
          score_a?: number | null
          score_b?: number | null
          win_prob_a?: number | null
        }
        Relationships: []
      }
      tt_recalc_queue: {
        Row: {
          created_at: string
          id: number
          match_id: string
          processed_at: string | null
          reason: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: number
          match_id: string
          processed_at?: string | null
          reason: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: number
          match_id?: string
          processed_at?: string | null
          reason?: string
          status?: string
        }
        Relationships: []
      }
      tt_score_states: {
        Row: {
          id: number
          is_terminal: boolean | null
          score_a: number | null
          score_b: number | null
          server: string | null
          serves_left: number | null
          winner: string | null
        }
        Insert: {
          id?: number
          is_terminal?: boolean | null
          score_a?: number | null
          score_b?: number | null
          server?: string | null
          serves_left?: number | null
          winner?: string | null
        }
        Update: {
          id?: number
          is_terminal?: boolean | null
          score_a?: number | null
          score_b?: number | null
          server?: string | null
          serves_left?: number | null
          winner?: string | null
        }
        Relationships: []
      }
      tt_serve_stats: {
        Row: {
          a_serve_points: number
          a_serve_wins_by_a: number
          b_serve_points: number
          b_serve_wins_by_a: number
          match_id: string
          prior_pr: number
          prior_ps: number
          prior_strength: number
          updated_at: string
        }
        Insert: {
          a_serve_points?: number
          a_serve_wins_by_a?: number
          b_serve_points?: number
          b_serve_wins_by_a?: number
          match_id: string
          prior_pr?: number
          prior_ps?: number
          prior_strength?: number
          updated_at?: string
        }
        Update: {
          a_serve_points?: number
          a_serve_wins_by_a?: number
          b_serve_points?: number
          b_serve_wins_by_a?: number
          match_id?: string
          prior_pr?: number
          prior_ps?: number
          prior_strength?: number
          updated_at?: string
        }
        Relationships: []
      }
      tt_state_matrix: {
        Row: {
          cover_m15: number | null
          cover_m25: number | null
          cover_m35: number | null
          cover_m45: number | null
          over_165: number | null
          over_175: number | null
          over_185: number | null
          over_195: number | null
          over_205: number | null
          pr: number
          ps: number
          score_a: number
          score_b: number
          server: string
          serves_left: number
          win_prob_a: number | null
        }
        Insert: {
          cover_m15?: number | null
          cover_m25?: number | null
          cover_m35?: number | null
          cover_m45?: number | null
          over_165?: number | null
          over_175?: number | null
          over_185?: number | null
          over_195?: number | null
          over_205?: number | null
          pr: number
          ps: number
          score_a: number
          score_b: number
          server: string
          serves_left: number
          win_prob_a?: number | null
        }
        Update: {
          cover_m15?: number | null
          cover_m25?: number | null
          cover_m35?: number | null
          cover_m45?: number | null
          over_165?: number | null
          over_175?: number | null
          over_185?: number | null
          over_195?: number | null
          over_205?: number | null
          pr?: number
          ps?: number
          score_a?: number
          score_b?: number
          server?: string
          serves_left?: number
          win_prob_a?: number | null
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
      ce_active_prop_date: {
        Row: {
          active_game_date: string | null
        }
        Relationships: []
      }
      ce_correlation_flags: {
        Row: {
          player_id: number | null
          pts_ast_corr: number | null
          pts_ast_correlated: boolean | null
          pts_reb_corr: number | null
          pts_reb_correlated: boolean | null
          reb_ast_corr: number | null
          reb_ast_correlated: boolean | null
        }
        Relationships: []
      }
      ce_defense_difficulty: {
        Row: {
          difficulty_multiplier: number | null
          opponent_team_id: number | null
          stat_key: string | null
        }
        Relationships: []
      }
      ce_momentum_live: {
        Row: {
          last_10_avg: number | null
          last_5_avg: number | null
          momentum_score: number | null
          player_id: number | null
          season_avg: number | null
          stat_key: string | null
        }
        Relationships: []
      }
      ce_monte_input_heavy_v5: {
        Row: {
          confidence_tier: string | null
          edge_score: number | null
          game_key: string | null
          lean: string | null
          line_value: number | null
          player_id: number | null
          player_name: string | null
          projection_mean: number | null
          projection_std: number | null
          stat_key: string | null
        }
        Relationships: []
      }
      ce_monte_input_supermodel: {
        Row: {
          astro_multiplier: number | null
          confidence_tier: string | null
          defense_difficulty_multiplier: number | null
          edge_score: number | null
          game_key: string | null
          injury_multiplier: number | null
          lean: string | null
          line_value: number | null
          matchup_multiplier: number | null
          momentum_multiplier: number | null
          player_id: number | null
          player_name: string | null
          projection_mean: number | null
          projection_std: number | null
          pts_ast_correlated: boolean | null
          pts_reb_correlated: boolean | null
          reb_ast_correlated: boolean | null
          stat_key: string | null
          streak_multiplier: number | null
          usage_shift_multiplier: number | null
        }
        Relationships: []
      }
      ce_player_current_team: {
        Row: {
          player_id: number | null
          team_id: number | null
        }
        Relationships: []
      }
      ce_player_game_logs_src: {
        Row: {
          ast: number | null
          blk: number | null
          fg3m: number | null
          game_date: string | null
          game_id: string | null
          minutes: number | null
          opponent_team_id: number | null
          pie: number | null
          player_id: number | null
          plus_minus: number | null
          pts: number | null
          reb: number | null
          stl: number | null
          team_id: number | null
          tov: number | null
        }
        Insert: {
          ast?: never
          blk?: never
          fg3m?: never
          game_date?: never
          game_id?: string | null
          minutes?: never
          opponent_team_id?: never
          pie?: never
          player_id?: never
          plus_minus?: never
          pts?: never
          reb?: never
          stl?: never
          team_id?: never
          tov?: never
        }
        Update: {
          ast?: never
          blk?: never
          fg3m?: never
          game_date?: never
          game_id?: string | null
          minutes?: never
          opponent_team_id?: never
          pie?: never
          player_id?: never
          plus_minus?: never
          pts?: never
          reb?: never
          stl?: never
          team_id?: never
          tov?: never
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
            foreignKeyName: "player_game_stats_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_current_game_players"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "player_game_stats_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_game_live_state"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "player_game_stats_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_oracle_player_validity"
            referencedColumns: ["game_id"]
          },
        ]
      }
      ce_players_name_map: {
        Row: {
          model_player_id: number | null
          player_name_norm: string | null
        }
        Relationships: []
      }
      ce_scorecards_fast: {
        Row: {
          adjusted_projection: number | null
          astro_multiplier: number | null
          base_prob: number | null
          edge_score: number | null
          game_date: string | null
          game_key: string | null
          lean: string | null
          line_value: number | null
          over_odds: number | null
          pie_mean: number | null
          pie_multiplier: number | null
          player_id: number | null
          player_name: string | null
          plus_minus_mean: number | null
          projection_mean: number | null
          prop_id: string | null
          provider: string | null
          stat_key: string | null
          std_dev: number | null
          under_odds: number | null
          vendor: string | null
        }
        Relationships: []
      }
      ce_scorecards_fast_v2: {
        Row: {
          adjusted_projection: number | null
          adjusted_projection_v2: number | null
          astro_multiplier: number | null
          base_prob: number | null
          edge_score: number | null
          edge_score_v2: number | null
          game_date: string | null
          game_key: string | null
          lean: string | null
          line_value: number | null
          momentum_multiplier: number | null
          momentum_score: number | null
          over_odds: number | null
          pie_mean: number | null
          pie_multiplier: number | null
          player_id: number | null
          player_name: string | null
          plus_minus_mean: number | null
          projection_mean: number | null
          prop_id: string | null
          provider: string | null
          stat_key: string | null
          std_dev: number | null
          under_odds: number | null
          vendor: string | null
        }
        Relationships: []
      }
      ce_scorecards_fast_v3: {
        Row: {
          adjusted_projection_v3: number | null
          astro_multiplier: number | null
          astro_tone: string | null
          edge_score_v3: number | null
          game_date: string | null
          game_key: string | null
          line_value: number | null
          momentum_multiplier: number | null
          momentum_score: number | null
          over_odds: number | null
          pie_mean: number | null
          pie_multiplier: number | null
          player_id: number | null
          player_name: string | null
          plus_minus_mean: number | null
          projection_mean: number | null
          prop_id: string | null
          provider: string | null
          stat_key: string | null
          std_dev: number | null
          under_odds: number | null
          vendor: string | null
        }
        Relationships: []
      }
      ce_scorecards_fast_v4: {
        Row: {
          adjusted_projection_v3: number | null
          astro_multiplier: number | null
          astro_tone: string | null
          edge_score_v3: number | null
          game_date: string | null
          game_key: string | null
          line_value: number | null
          momentum_multiplier: number | null
          momentum_score: number | null
          over_odds: number | null
          pie_mean: number | null
          pie_multiplier: number | null
          player_id: number | null
          player_name: string | null
          plus_minus_mean: number | null
          projection_mean: number | null
          prop_id: string | null
          provider: string | null
          stat_key: string | null
          std_dev: number | null
          streak_flag: string | null
          streak_multiplier: number | null
          under_odds: number | null
          vendor: string | null
        }
        Relationships: []
      }
      ce_scorecards_fast_v5: {
        Row: {
          adjusted_projection_v3: number | null
          adjusted_projection_v5: number | null
          astro_multiplier: number | null
          astro_tone: string | null
          edge_score_v3: number | null
          edge_score_v5: number | null
          game_date: string | null
          game_key: string | null
          injury_multiplier: number | null
          line_value: number | null
          momentum_multiplier: number | null
          momentum_score: number | null
          over_odds: number | null
          pie_mean: number | null
          pie_multiplier: number | null
          player_id: number | null
          player_name: string | null
          plus_minus_mean: number | null
          projection_mean: number | null
          prop_id: string | null
          provider: string | null
          stat_key: string | null
          std_dev: number | null
          streak_flag: string | null
          streak_multiplier: number | null
          under_odds: number | null
          vendor: string | null
        }
        Relationships: []
      }
      ce_scorecards_fast_v6: {
        Row: {
          adjusted_projection_v6: number | null
          astro_multiplier: number | null
          astro_tone: string | null
          edge_score_v6: number | null
          game_date: string | null
          game_key: string | null
          injury_multiplier: number | null
          line_value: number | null
          matchup_multiplier: number | null
          momentum_multiplier: number | null
          momentum_score: number | null
          over_odds: number | null
          pie_mean: number | null
          pie_multiplier: number | null
          player_id: number | null
          player_name: string | null
          plus_minus_mean: number | null
          projection_mean: number | null
          prop_id: string | null
          provider: string | null
          stat_key: string | null
          std_dev: number | null
          streak_flag: string | null
          streak_multiplier: number | null
          under_odds: number | null
          vendor: string | null
        }
        Relationships: []
      }
      ce_scorecards_fast_v7: {
        Row: {
          adjusted_projection_v6: number | null
          adjusted_projection_v7: number | null
          astro_multiplier: number | null
          astro_tone: string | null
          defense_difficulty_multiplier: number | null
          edge_score_v6: number | null
          edge_score_v7: number | null
          game_date: string | null
          game_key: string | null
          injury_multiplier: number | null
          line_value: number | null
          matchup_multiplier: number | null
          momentum_multiplier: number | null
          momentum_score: number | null
          over_odds: number | null
          pie_mean: number | null
          pie_multiplier: number | null
          player_id: number | null
          player_name: string | null
          plus_minus_mean: number | null
          projection_mean: number | null
          prop_id: string | null
          provider: string | null
          stat_key: string | null
          std_dev: number | null
          streak_flag: string | null
          streak_multiplier: number | null
          under_odds: number | null
          vendor: string | null
        }
        Relationships: []
      }
      ce_scorecards_fast_v8: {
        Row: {
          adjusted_projection_v6: number | null
          adjusted_projection_v7: number | null
          adjusted_projection_v8: number | null
          astro_multiplier: number | null
          astro_tone: string | null
          defense_difficulty_multiplier: number | null
          edge_score_v6: number | null
          edge_score_v7: number | null
          edge_score_v8: number | null
          game_date: string | null
          game_key: string | null
          injury_multiplier: number | null
          line_value: number | null
          matchup_multiplier: number | null
          momentum_multiplier: number | null
          momentum_score: number | null
          over_odds: number | null
          pie_mean: number | null
          pie_multiplier: number | null
          player_id: number | null
          player_name: string | null
          plus_minus_mean: number | null
          projection_mean: number | null
          prop_id: string | null
          provider: string | null
          stat_key: string | null
          std_dev: number | null
          streak_flag: string | null
          streak_multiplier: number | null
          under_odds: number | null
          usage_shift_multiplier: number | null
          vendor: string | null
        }
        Relationships: []
      }
      ce_scorecards_fast_v9: {
        Row: {
          adjusted_projection_v6: number | null
          adjusted_projection_v7: number | null
          adjusted_projection_v8: number | null
          adjusted_projection_v9: number | null
          astro_multiplier: number | null
          astro_tone: string | null
          confidence_tier: string | null
          defense_difficulty_multiplier: number | null
          edge_score_v6: number | null
          edge_score_v7: number | null
          edge_score_v8: number | null
          edge_score_v9: number | null
          game_date: string | null
          game_key: string | null
          injury_multiplier: number | null
          line_value: number | null
          matchup_multiplier: number | null
          momentum_multiplier: number | null
          momentum_score: number | null
          over_odds: number | null
          pie_mean: number | null
          pie_multiplier: number | null
          player_id: number | null
          player_name: string | null
          plus_minus_mean: number | null
          projection_mean: number | null
          prop_id: string | null
          provider: string | null
          pts_ast_corr: number | null
          pts_ast_correlated: boolean | null
          pts_reb_corr: number | null
          pts_reb_correlated: boolean | null
          reb_ast_corr: number | null
          reb_ast_correlated: boolean | null
          stat_key: string | null
          std_dev: number | null
          streak_flag: string | null
          streak_multiplier: number | null
          supermodel_lean: string | null
          under_odds: number | null
          usage_shift_multiplier: number | null
          vendor: string | null
        }
        Relationships: []
      }
      ce_scorecards_live: {
        Row: {
          base_prob: number | null
          edge_score: number | null
          game_date: string | null
          game_key: string | null
          lean: string | null
          line_value: number | null
          over_odds: number | null
          player_id: number | null
          player_name: string | null
          projection_mean: number | null
          prop_id: string | null
          provider: string | null
          risk_label: string | null
          stat_key: string | null
          std_dev: number | null
          under_odds: number | null
          vendor: string | null
        }
        Relationships: []
      }
      ce_scorecards_top_25_v4: {
        Row: {
          adjusted_projection_v6: number | null
          adjusted_projection_v7: number | null
          adjusted_projection_v8: number | null
          adjusted_projection_v9: number | null
          astro_multiplier: number | null
          astro_tone: string | null
          confidence_tier: string | null
          defense_difficulty_multiplier: number | null
          edge_score_v6: number | null
          edge_score_v7: number | null
          edge_score_v8: number | null
          edge_score_v9: number | null
          game_date: string | null
          game_key: string | null
          injury_multiplier: number | null
          line_value: number | null
          matchup_multiplier: number | null
          momentum_multiplier: number | null
          momentum_score: number | null
          over_odds: number | null
          pie_mean: number | null
          pie_multiplier: number | null
          player_id: number | null
          player_name: string | null
          plus_minus_mean: number | null
          projection_mean: number | null
          prop_id: string | null
          provider: string | null
          pts_ast_corr: number | null
          pts_ast_correlated: boolean | null
          pts_reb_corr: number | null
          pts_reb_correlated: boolean | null
          reb_ast_corr: number | null
          reb_ast_correlated: boolean | null
          stat_key: string | null
          std_dev: number | null
          streak_flag: string | null
          streak_multiplier: number | null
          supermodel_lean: string | null
          under_odds: number | null
          usage_shift_multiplier: number | null
          vendor: string | null
        }
        Relationships: []
      }
      ce_scorecards_top_v4: {
        Row: {
          adjusted_projection_v6: number | null
          adjusted_projection_v7: number | null
          adjusted_projection_v8: number | null
          adjusted_projection_v9: number | null
          astro_multiplier: number | null
          astro_tone: string | null
          confidence_tier: string | null
          defense_difficulty_multiplier: number | null
          edge_score_v6: number | null
          edge_score_v7: number | null
          edge_score_v8: number | null
          edge_score_v9: number | null
          game_date: string | null
          game_key: string | null
          injury_multiplier: number | null
          line_value: number | null
          matchup_multiplier: number | null
          momentum_multiplier: number | null
          momentum_score: number | null
          over_odds: number | null
          pie_mean: number | null
          pie_multiplier: number | null
          player_id: number | null
          player_name: string | null
          plus_minus_mean: number | null
          projection_mean: number | null
          prop_id: string | null
          provider: string | null
          pts_ast_corr: number | null
          pts_ast_correlated: boolean | null
          pts_reb_corr: number | null
          pts_reb_correlated: boolean | null
          reb_ast_corr: number | null
          reb_ast_correlated: boolean | null
          stat_key: string | null
          std_dev: number | null
          streak_flag: string | null
          streak_multiplier: number | null
          supermodel_lean: string | null
          under_odds: number | null
          usage_shift_multiplier: number | null
          vendor: string | null
        }
        Relationships: []
      }
      ce_stat_correlations: {
        Row: {
          player_id: number | null
          pts_ast_corr: number | null
          pts_reb_corr: number | null
          reb_ast_corr: number | null
        }
        Relationships: []
      }
      ce_streaks_live: {
        Row: {
          line_value: number | null
          over_hits_10: number | null
          over_hits_5: number | null
          player_id: number | null
          player_name: string | null
          prop_id: string | null
          stat_key: string | null
          streak_flag: string | null
          streak_multiplier: number | null
          under_hits_10: number | null
          under_hits_5: number | null
        }
        Relationships: []
      }
      ce_supermodel: {
        Row: {
          adjusted_projection_v6: number | null
          adjusted_projection_v7: number | null
          adjusted_projection_v8: number | null
          adjusted_projection_v9: number | null
          astro_multiplier: number | null
          astro_tone: string | null
          confidence_tier: string | null
          defense_difficulty_multiplier: number | null
          edge_score_v6: number | null
          edge_score_v7: number | null
          edge_score_v8: number | null
          edge_score_v9: number | null
          game_date: string | null
          game_key: string | null
          injury_multiplier: number | null
          line_value: number | null
          matchup_multiplier: number | null
          momentum_multiplier: number | null
          momentum_score: number | null
          over_odds: number | null
          pie_mean: number | null
          pie_multiplier: number | null
          player_id: number | null
          player_name: string | null
          plus_minus_mean: number | null
          projection_mean: number | null
          prop_id: string | null
          provider: string | null
          pts_ast_corr: number | null
          pts_ast_correlated: boolean | null
          pts_reb_corr: number | null
          pts_reb_correlated: boolean | null
          reb_ast_corr: number | null
          reb_ast_correlated: boolean | null
          stat_key: string | null
          std_dev: number | null
          streak_flag: string | null
          streak_multiplier: number | null
          supermodel_lean: string | null
          under_odds: number | null
          usage_shift_multiplier: number | null
          vendor: string | null
        }
        Relationships: []
      }
      ce_supermodel_top_plays: {
        Row: {
          adjusted_projection_v6: number | null
          adjusted_projection_v7: number | null
          adjusted_projection_v8: number | null
          adjusted_projection_v9: number | null
          astro_multiplier: number | null
          astro_tone: string | null
          confidence_tier: string | null
          defense_difficulty_multiplier: number | null
          edge_score_v6: number | null
          edge_score_v7: number | null
          edge_score_v8: number | null
          edge_score_v9: number | null
          game_date: string | null
          game_key: string | null
          injury_multiplier: number | null
          line_value: number | null
          matchup_multiplier: number | null
          momentum_multiplier: number | null
          momentum_score: number | null
          over_odds: number | null
          pie_mean: number | null
          pie_multiplier: number | null
          player_id: number | null
          player_name: string | null
          plus_minus_mean: number | null
          projection_mean: number | null
          prop_id: string | null
          provider: string | null
          pts_ast_corr: number | null
          pts_ast_correlated: boolean | null
          pts_reb_corr: number | null
          pts_reb_correlated: boolean | null
          reb_ast_corr: number | null
          reb_ast_correlated: boolean | null
          stat_key: string | null
          std_dev: number | null
          streak_flag: string | null
          streak_multiplier: number | null
          supermodel_lean: string | null
          under_odds: number | null
          usage_shift_multiplier: number | null
          vendor: string | null
        }
        Relationships: []
      }
      ce_usage_baseline: {
        Row: {
          avg_pie_season: number | null
          avg_pra_season: number | null
          player_id: number | null
        }
        Relationships: []
      }
      ce_usage_shift: {
        Row: {
          avg_pra_10: number | null
          avg_pra_season: number | null
          player_id: number | null
          ripple_multiplier_auto: number | null
        }
        Relationships: []
      }
      ce_usage_spikes: {
        Row: {
          avg_pie_10: number | null
          avg_pra_10: number | null
          player_id: number | null
        }
        Relationships: []
      }
      fantasy_scores: {
        Row: {
          assists: number | null
          blocks: number | null
          fantasy_score: number | null
          first_half_points: number | null
          game_id: string | null
          game_points: number | null
          player_id: string | null
          player_name: string | null
          q1_points: number | null
          q2_points: number | null
          q3_points: number | null
          q4_points: number | null
          rebounds: number | null
          second_half_points: number | null
          sportsbook: string | null
          steals: number | null
          team_abbr: string | null
          turnovers: number | null
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
            foreignKeyName: "player_game_stats_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_current_game_players"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "player_game_stats_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_game_live_state"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "player_game_stats_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_oracle_player_validity"
            referencedColumns: ["game_id"]
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
            foreignKeyName: "nebula_prop_predictions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_current_game_players"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "nebula_prop_predictions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_game_live_state"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "nebula_prop_predictions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_oracle_player_validity"
            referencedColumns: ["game_id"]
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
            foreignKeyName: "nebula_prop_predictions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_current_game_players"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "nebula_prop_predictions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_game_live_state"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "nebula_prop_predictions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_oracle_player_validity"
            referencedColumns: ["game_id"]
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
          confidence_adjustment: number | null
          confidence_tier: string | null
          created_at: string | null
          edge_raw: number | null
          edge_score: number | null
          edge_score_v11: number | null
          edge_score_v20: number | null
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
          p_implied: number | null
          p_model: number | null
          pace_mu_adjust: number | null
          pace_sigma_adjust: number | null
          player_id: string | null
          player_name: string | null
          player_team: string | null
          pred_ts: string | null
          prop_type: string | null
          risk: number | null
          side: string | null
          sigma: number | null
          streak: number | null
          transit_boost_factor: number | null
          updated_at: string | null
          volatility_shift: number | null
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
            foreignKeyName: "nebula_prop_predictions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_current_game_players"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "nebula_prop_predictions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_game_live_state"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "nebula_prop_predictions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_oracle_player_validity"
            referencedColumns: ["game_id"]
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
          confidence_adjustment: number | null
          confidence_tier: string | null
          created_at: string | null
          edge_raw: number | null
          edge_score: number | null
          edge_score_v11: number | null
          edge_score_v20: number | null
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
          p_implied: number | null
          p_model: number | null
          pace_mu_adjust: number | null
          pace_sigma_adjust: number | null
          player_id: string | null
          player_name: string | null
          player_team: string | null
          pred_ts: string | null
          prop_type: string | null
          risk: number | null
          side: string | null
          sigma: number | null
          streak: number | null
          transit_boost_factor: number | null
          updated_at: string | null
          volatility_shift: number | null
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
            foreignKeyName: "nebula_prop_predictions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_current_game_players"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "nebula_prop_predictions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_game_live_state"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "nebula_prop_predictions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_oracle_player_validity"
            referencedColumns: ["game_id"]
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
      play_by_play_ordered: {
        Row: {
          assist_player_id: string | null
          away_score: number | null
          clock: string | null
          clock_seconds: number | null
          created_at: string | null
          description: string | null
          event_index: number | null
          event_type: string | null
          game_id: string | null
          home_score: number | null
          id: string | null
          player_id: string | null
          quarter: number | null
          seconds_elapsed_game: number | null
          seconds_remaining_game: number | null
          sequence: number | null
          team_abbr: string | null
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
            foreignKeyName: "play_by_play_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_current_game_players"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "play_by_play_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_game_live_state"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "play_by_play_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_oracle_player_validity"
            referencedColumns: ["game_id"]
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
      play_by_play_quarter_corrected: {
        Row: {
          assist_player_id: string | null
          away_score: number | null
          clock: string | null
          clock_seconds: number | null
          created_at: string | null
          description: string | null
          event_index: number | null
          event_type: string | null
          game_id: string | null
          home_score: number | null
          id: string | null
          player_id: string | null
          quarter: number | null
          quarter_corrected: number | null
          seconds_elapsed_game: number | null
          seconds_remaining_game: number | null
          sequence: number | null
          team_abbr: string | null
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
            foreignKeyName: "play_by_play_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_current_game_players"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "play_by_play_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_game_live_state"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "play_by_play_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_oracle_player_validity"
            referencedColumns: ["game_id"]
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
      play_by_play_scores: {
        Row: {
          away_score_corrected: number | null
          game_id: string | null
          home_score_corrected: number | null
          seconds_elapsed_game: number | null
        }
        Relationships: [
          {
            foreignKeyName: "play_by_play_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "play_by_play_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_current_game_players"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "play_by_play_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_game_live_state"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "play_by_play_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_oracle_player_validity"
            referencedColumns: ["game_id"]
          },
        ]
      }
      player_stats_by_window: {
        Row: {
          assists: number | null
          blocks: number | null
          first_half_points: number | null
          game_id: string | null
          game_points: number | null
          minutes: number | null
          player_id: string | null
          player_name: string | null
          q1_points: number | null
          q2_points: number | null
          q3_points: number | null
          q4_points: number | null
          rebounds: number | null
          second_half_points: number | null
          steals: number | null
          team_abbr: string | null
          three_made: number | null
          turnovers: number | null
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
            foreignKeyName: "player_game_stats_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_current_game_players"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "player_game_stats_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_game_live_state"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "player_game_stats_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_oracle_player_validity"
            referencedColumns: ["game_id"]
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
      tt_admin_dashboard: {
        Row: {
          best_bet_tag: string | null
          best_bet_threshold: number | null
          bet_ml: boolean | null
          bet_over_185: boolean | null
          bet_spread_m15: boolean | null
          bet_under_185: boolean | null
          cover_m05: number | null
          cover_m15: number | null
          cover_m25: number | null
          cover_m35: number | null
          cover_m45: number | null
          edge_threshold: number | null
          first_server: string | null
          match_id: string | null
          match_updated_at: string | null
          metrics_updated_at: string | null
          ml_a: number | null
          ml_be: number | null
          ml_edge: number | null
          next_server: string | null
          over_165: number | null
          over_175: number | null
          over_185: number | null
          over_195: number | null
          over_205: number | null
          over_be: number | null
          over_edge_185: number | null
          over_odds: number | null
          player_a: string | null
          player_b: string | null
          pr: number | null
          ps: number | null
          score_a: number | null
          score_b: number | null
          serves_left: number | null
          spread_a: number | null
          spread_be: number | null
          spread_edge_m15: number | null
          spread_line: number | null
          status: string | null
          total_line: number | null
          under_be: number | null
          under_edge_185: number | null
          under_odds: number | null
          win_prob_a: number | null
        }
        Relationships: []
      }
      tt_best_opportunities: {
        Row: {
          best_edge: number | null
          cover_m15: number | null
          match_id: string | null
          metrics_updated_at: string | null
          ml_a: number | null
          ml_break_even: number | null
          ml_edge: number | null
          next_server: string | null
          over_185: number | null
          over_break_even: number | null
          over_edge: number | null
          over_odds: number | null
          player_a: string | null
          player_b: string | null
          score_a: number | null
          score_b: number | null
          serves_left: number | null
          spread_a: number | null
          spread_break_even: number | null
          spread_edge: number | null
          spread_line: number | null
          status: string | null
          total_line: number | null
          under_odds: number | null
          win_prob_a: number | null
        }
        Relationships: []
      }
      tt_live_learned_probs: {
        Row: {
          a_serve_points: number | null
          b_serve_points: number | null
          match_id: string | null
          pr: number | null
          ps: number | null
        }
        Relationships: []
      }
      tt_live_model: {
        Row: {
          match_id: string | null
          win_prob_a: number | null
        }
        Relationships: []
      }
      tt_match_list: {
        Row: {
          cover_m15: number | null
          match_id: string | null
          metrics_updated_at: string | null
          ml_a: number | null
          ml_break_even: number | null
          ml_edge: number | null
          next_server: string | null
          over_185: number | null
          over_break_even: number | null
          over_edge: number | null
          over_odds: number | null
          player_a: string | null
          player_b: string | null
          score_a: number | null
          score_b: number | null
          serves_left: number | null
          spread_a: number | null
          spread_break_even: number | null
          spread_edge: number | null
          spread_line: number | null
          status: string | null
          total_line: number | null
          under_odds: number | null
          win_prob_a: number | null
        }
        Relationships: []
      }
      tt_momentum_shock: {
        Row: {
          created_at: string | null
          match_id: string | null
          score_a: number | null
          score_b: number | null
          spread_jump: number | null
          win_prob_a: number | null
          win_prob_jump: number | null
        }
        Relationships: []
      }
      tt_momentum_signal: {
        Row: {
          created_at: string | null
          match_id: string | null
          momentum_level: string | null
          score_a: number | null
          score_b: number | null
          spread_jump: number | null
          win_prob_a: number | null
          win_prob_jump: number | null
        }
        Relationships: []
      }
      v_current_game_players: {
        Row: {
          game_id: string | null
          league: string | null
          player_id: string | null
          player_name: string | null
          team_abbr: string | null
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
      v_game_latest_snapshot: {
        Row: {
          away_score: number | null
          captured_at: string | null
          clock: string | null
          clock_seconds_remaining: number | null
          game_id: string | null
          home_score: number | null
          possession: string | null
          quarter: string | null
        }
        Relationships: [
          {
            foreignKeyName: "game_state_snapshots_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_state_snapshots_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_current_game_players"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "game_state_snapshots_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_game_live_state"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "game_state_snapshots_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_oracle_player_validity"
            referencedColumns: ["game_id"]
          },
        ]
      }
      v_game_live_state: {
        Row: {
          away_abbr: string | null
          away_score: number | null
          away_team: string | null
          clock: string | null
          clock_seconds_remaining: number | null
          game_id: string | null
          home_abbr: string | null
          home_score: number | null
          home_team: string | null
          last_snapshot_at: string | null
          possession: string | null
          quarter: string | null
          status: string | null
        }
        Relationships: []
      }
      v_live_game_pace: {
        Row: {
          current_pace: number | null
          est_possessions: number | null
          game_id: string | null
          team_abbr: string | null
          team_fga: number | null
          team_fta: number | null
          team_oreb: number | null
          team_tov: number | null
          total_player_minutes: number | null
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
            foreignKeyName: "player_game_stats_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_current_game_players"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "player_game_stats_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_game_live_state"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "player_game_stats_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_oracle_player_validity"
            referencedColumns: ["game_id"]
          },
        ]
      }
      v_live_player_pie: {
        Row: {
          ast: number | null
          blk: number | null
          dreb: number | null
          fga: number | null
          fgm: number | null
          fta: number | null
          ftm: number | null
          game_id: string | null
          live_pie: number | null
          minutes: number | null
          oreb: number | null
          pf: number | null
          pie_numerator: number | null
          player_id: string | null
          plus_minus: number | null
          pts: number | null
          stl: number | null
          team_abbr: string | null
          total_game_pie: number | null
          tov: number | null
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
            foreignKeyName: "player_game_stats_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_current_game_players"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "player_game_stats_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_game_live_state"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "player_game_stats_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_oracle_player_validity"
            referencedColumns: ["game_id"]
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
      v_oracle_ml_mlb_v1: {
        Row: {
          away_abbr: string | null
          away_score: number | null
          away_team: string | null
          blowout_risk: number | null
          book_implied_home: number | null
          created_at: string | null
          edge_away: number | null
          edge_home: number | null
          expected_possessions: number | null
          fair_ml_away: number | null
          fair_ml_home: number | null
          features_json: Json | null
          game_id: string | null
          home_abbr: string | null
          home_score: number | null
          home_team: string | null
          id: string | null
          model_name: string | null
          model_version: string | null
          mu_away: number | null
          mu_home: number | null
          mu_spread_home: number | null
          mu_total: number | null
          notes_json: Json | null
          p_away_win: number | null
          p_home_win: number | null
          p_home_win_ci_high: number | null
          p_home_win_ci_low: number | null
          qtr_fair_ml: Json | null
          qtr_wp_home: Json | null
          run_ts: string | null
          sport: string | null
          start_time: string | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "model_game_predictions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "model_game_predictions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_current_game_players"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "model_game_predictions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_game_live_state"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "model_game_predictions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_oracle_player_validity"
            referencedColumns: ["game_id"]
          },
        ]
      }
      v_oracle_ml_nba_v1: {
        Row: {
          away_abbr: string | null
          away_score: number | null
          away_team: string | null
          blowout_risk: number | null
          book_implied_home: number | null
          created_at: string | null
          edge_away: number | null
          edge_home: number | null
          expected_possessions: number | null
          fair_ml_away: number | null
          fair_ml_home: number | null
          features_json: Json | null
          game_id: string | null
          home_abbr: string | null
          home_score: number | null
          home_team: string | null
          id: string | null
          model_name: string | null
          model_version: string | null
          mu_away: number | null
          mu_home: number | null
          mu_spread_home: number | null
          mu_total: number | null
          notes_json: Json | null
          p_away_win: number | null
          p_home_win: number | null
          p_home_win_ci_high: number | null
          p_home_win_ci_low: number | null
          qtr_fair_ml: Json | null
          qtr_wp_home: Json | null
          run_ts: string | null
          sport: string | null
          start_time: string | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "model_game_predictions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "model_game_predictions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_current_game_players"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "model_game_predictions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_game_live_state"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "model_game_predictions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_oracle_player_validity"
            referencedColumns: ["game_id"]
          },
        ]
      }
      v_oracle_ml_nfl_v1: {
        Row: {
          away_abbr: string | null
          away_score: number | null
          away_team: string | null
          blowout_risk: number | null
          book_implied_home: number | null
          created_at: string | null
          edge_away: number | null
          edge_home: number | null
          expected_possessions: number | null
          fair_ml_away: number | null
          fair_ml_home: number | null
          features_json: Json | null
          game_id: string | null
          home_abbr: string | null
          home_score: number | null
          home_team: string | null
          id: string | null
          model_name: string | null
          model_version: string | null
          mu_away: number | null
          mu_home: number | null
          mu_spread_home: number | null
          mu_total: number | null
          notes_json: Json | null
          p_away_win: number | null
          p_home_win: number | null
          p_home_win_ci_high: number | null
          p_home_win_ci_low: number | null
          qtr_fair_ml: Json | null
          qtr_wp_home: Json | null
          run_ts: string | null
          sport: string | null
          start_time: string | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "model_game_predictions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "model_game_predictions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_current_game_players"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "model_game_predictions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_game_live_state"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "model_game_predictions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_oracle_player_validity"
            referencedColumns: ["game_id"]
          },
        ]
      }
      v_oracle_ml_nhl_v1: {
        Row: {
          away_abbr: string | null
          away_score: number | null
          away_team: string | null
          blowout_risk: number | null
          book_implied_home: number | null
          created_at: string | null
          edge_away: number | null
          edge_home: number | null
          expected_possessions: number | null
          fair_ml_away: number | null
          fair_ml_home: number | null
          features_json: Json | null
          game_id: string | null
          home_abbr: string | null
          home_score: number | null
          home_team: string | null
          id: string | null
          model_name: string | null
          model_version: string | null
          mu_away: number | null
          mu_home: number | null
          mu_spread_home: number | null
          mu_total: number | null
          notes_json: Json | null
          p_away_win: number | null
          p_home_win: number | null
          p_home_win_ci_high: number | null
          p_home_win_ci_low: number | null
          qtr_fair_ml: Json | null
          qtr_wp_home: Json | null
          run_ts: string | null
          sport: string | null
          start_time: string | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "model_game_predictions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "model_game_predictions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_current_game_players"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "model_game_predictions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_game_live_state"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "model_game_predictions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_oracle_player_validity"
            referencedColumns: ["game_id"]
          },
        ]
      }
      v_oracle_player_validity: {
        Row: {
          game_id: string | null
          is_valid_live_player: boolean | null
          league: string | null
          live_minutes: number | null
          live_points: number | null
          player_id: string | null
          player_name: string | null
          plus_minus: number | null
          team_abbr: string | null
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
      v_prop_overlay_enhanced: {
        Row: {
          astro: Json | null
          away_abbr: string | null
          book: string | null
          confidence: number | null
          confidence_adjustment: number | null
          confidence_tier: string | null
          created_at: string | null
          current_pace: number | null
          edge_raw: number | null
          edge_score: number | null
          edge_score_v11: number | null
          edge_score_v20: number | null
          est_possessions: number | null
          game_id: string | null
          game_start_time: string | null
          headshot_url: string | null
          hit_l10: number | null
          hit_l20: number | null
          home_abbr: string | null
          id: string | null
          is_valid_live_player: boolean | null
          league: string | null
          line: number | null
          live_pie: number | null
          microbars: Json | null
          mu: number | null
          odds: number | null
          one_liner: string | null
          p_implied: number | null
          p_model: number | null
          pace_mu_adjust: number | null
          pace_sigma_adjust: number | null
          pie_numerator: number | null
          player_id: string | null
          player_name: string | null
          player_team: string | null
          plus_minus: number | null
          pred_ts: string | null
          prop_type: string | null
          risk: number | null
          side: string | null
          sigma: number | null
          streak: number | null
          transit_boost_factor: number | null
          updated_at: string | null
          validity_minutes: number | null
          volatility_shift: number | null
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
            foreignKeyName: "nebula_prop_predictions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_current_game_players"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "nebula_prop_predictions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_game_live_state"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "nebula_prop_predictions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_oracle_player_validity"
            referencedColumns: ["game_id"]
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
    }
    Functions: {
      aggregate_period_stats: {
        Args: { p_game_id?: string }
        Returns: undefined
      }
      american_to_break_even_prob: { Args: { odds: number }; Returns: number }
      ce_randn: { Args: never; Returns: number }
      ce_uuid_to_bigint: { Args: { p_text: string }; Returns: number }
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
      mmss_to_seconds: { Args: { p_clock: string }; Returns: number }
      nba_team_conference: { Args: { p_abbr: string }; Returns: string }
      np_apply_edgescore_v11: { Args: { hours_back?: number }; Returns: number }
      np_build_pace_features: {
        Args: { p_game_id: string }
        Returns: {
          away_avg_pace: number
          away_def_rating: number
          away_net_rating: number
          away_off_rating: number
          blowout_risk: number
          expected_possessions: number
          games_away: number
          games_home: number
          home_avg_pace: number
          home_def_rating: number
          home_net_rating: number
          home_off_rating: number
          matchup_pace_avg: number
          team_pace_delta: number
        }[]
      }
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
      np_rebuild_team_pace: {
        Args: { p_league?: string; p_season?: number }
        Returns: number
      }
      rebuild_nba_standings: { Args: { p_season?: number }; Returns: number }
      refresh_game_live_wp: { Args: { p_game_id: string }; Returns: undefined }
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
      tt_advance_serve_state: {
        Args: {
          a_after: number
          b_after: number
          server_before: string
          serves_left_before: number
        }
        Returns: {
          next_server: string
          serves_left: number
        }[]
      }
      tt_cover_prob_dp: {
        Args: {
          a: number
          b: number
          next_server: string
          pr: number
          ps: number
          serves_left: number
          spread_line: number
        }
        Returns: number
      }
      tt_deuce_win_prob: { Args: { pr: number; ps: number }; Returns: number }
      tt_is_terminal: {
        Args: { a: number; b: number }
        Returns: {
          is_terminal: boolean
          win_a: boolean
        }[]
      }
      tt_log_point: {
        Args: { p_match_id: string; p_winner: string }
        Returns: undefined
      }
      tt_next_state: {
        Args: {
          a: number
          b: number
          server: string
          serves_left: number
          winner: string
        }
        Returns: {
          next_a: number
          next_b: number
          next_server: string
          next_serves: number
        }[]
      }
      tt_over_prob_dp: {
        Args: {
          a: number
          b: number
          next_server: string
          pr: number
          ps: number
          serves_left: number
          total_line: number
        }
        Returns: number
      }
      tt_rebuild_state_from_points: {
        Args: { p_match_id: string }
        Returns: undefined
      }
      tt_recompute_metrics: { Args: { p_match_id: string }; Returns: undefined }
      tt_reset_match: { Args: { p_match_id: string }; Returns: undefined }
      tt_start_match: {
        Args: {
          p_first_server?: string
          p_player_a: string
          p_player_b: string
          p_pr?: number
          p_ps?: number
        }
        Returns: string
      }
      tt_undo_last_point: { Args: { p_match_id: string }; Returns: undefined }
      tt_update_odds: {
        Args: {
          p_match_id: string
          p_ml_odds_a?: number
          p_over_odds?: number
          p_spread_line?: number
          p_spread_odds?: number
          p_total_line?: number
          p_under_odds?: number
        }
        Returns: undefined
      }
      tt_win_prob: {
        Args: {
          a: number
          b: number
          pr: number
          ps: number
          server: string
          serves_left: number
        }
        Returns: number
      }
      tt_win_prob_dp: {
        Args: {
          a: number
          b: number
          next_server: string
          pr: number
          ps: number
          serves_left: number
        }
        Returns: number
      }
      tt_win_prob_from_deuce_state: {
        Args: {
          a: number
          b: number
          next_server: string
          pr: number
          ps: number
        }
        Returns: number
      }
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
