export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  __InternalSupabase: { PostgrestVersion: '14.5' }
  public: {
    Tables: {
      exercises: {
        Row: { created_at: string; id: string; name: string; user_id: string; kind: string }
        Insert: { created_at?: string; id?: string; name: string; user_id: string; kind?: string }
        Update: { created_at?: string; id?: string; name?: string; user_id?: string; kind?: string }
        Relationships: []
      }
      profiles: {
        Row: { created_at: string; id: string; unit: string; weekly_goal: number; distance_unit: string }
        Insert: { created_at?: string; id: string; unit?: string; weekly_goal?: number; distance_unit?: string }
        Update: { created_at?: string; id?: string; unit?: string; weekly_goal?: number; distance_unit?: string }
        Relationships: []
      }
      sets: {
        Row: { created_at: string; id: string; reps: number; set_number: number; unit: string; user_id: string; weight: number; workout_exercise_id: string; set_type: string; duration_seconds: number | null; distance: number | null; distance_unit: string | null }
        Insert: { created_at?: string; id?: string; reps?: number; set_number?: number; unit?: string; user_id: string; weight?: number; workout_exercise_id: string; set_type?: string; duration_seconds?: number | null; distance?: number | null; distance_unit?: string | null }
        Update: { created_at?: string; id?: string; reps?: number; set_number?: number; unit?: string; user_id?: string; weight?: number; workout_exercise_id?: string; set_type?: string; duration_seconds?: number | null; distance?: number | null; distance_unit?: string | null }
        Relationships: [
          { foreignKeyName: 'sets_workout_exercise_id_fkey'; columns: ['workout_exercise_id']; isOneToOne: false; referencedRelation: 'workout_exercises'; referencedColumns: ['id'] },
        ]
      }
      workout_exercises: {
        Row: { created_at: string; exercise_id: string; id: string; notes: string; position: number; user_id: string; workout_id: string }
        Insert: { created_at?: string; exercise_id: string; id?: string; notes?: string; position?: number; user_id: string; workout_id: string }
        Update: { created_at?: string; exercise_id?: string; id?: string; notes?: string; position?: number; user_id?: string; workout_id?: string }
        Relationships: [
          { foreignKeyName: 'workout_exercises_exercise_id_fkey'; columns: ['exercise_id']; isOneToOne: false; referencedRelation: 'exercises'; referencedColumns: ['id'] },
          { foreignKeyName: 'workout_exercises_workout_id_fkey'; columns: ['workout_id']; isOneToOne: false; referencedRelation: 'workouts'; referencedColumns: ['id'] },
        ]
      }
      workouts: {
        Row: { created_at: string; date: string; id: string; notes: string; title: string; updated_at: string; user_id: string; finished_at: string | null }
        Insert: { created_at?: string; date?: string; id?: string; notes?: string; title?: string; updated_at?: string; user_id: string; finished_at?: string | null }
        Update: { created_at?: string; date?: string; id?: string; notes?: string; title?: string; updated_at?: string; user_id?: string; finished_at?: string | null }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type TablesInsert<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert']
export type TablesUpdate<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']
