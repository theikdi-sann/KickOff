
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "app_secrets": {
                  Row: {
                    "key": string,"updated_at": string,"value": string
                  }
                  ComputedFields: never
                  Insert: {
                    "key": string,"updated_at"?: string,"value": string
                  }
                  Update: {
                    "key"?: string,"updated_at"?: string,"value"?: string
                  }
                  Relationships: [
                    
                  ]
                },"app_settings": {
                  Row: {
                    "key": string,"tenant_id": string,"updated_at": string,"updated_by": string | null,"value": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "key": string,"tenant_id"?: string,"updated_at"?: string,"updated_by"?: string | null,"value": NonNullable<Json>
                  }
                  Update: {
                    "key"?: string,"tenant_id"?: string,"updated_at"?: string,"updated_by"?: string | null,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "app_settings_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_logs": {
                  Row: {
                    "action": string,"actor_id": string | null,"created_at": string,"entity": string,"entity_id": string | null,"id": string,"metadata": Json | null,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"created_at"?: string,"entity": string,"entity_id"?: string | null,"id"?: string,"metadata"?: Json | null,"tenant_id"?: string
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"created_at"?: string,"entity"?: string,"entity_id"?: string | null,"id"?: string,"metadata"?: Json | null,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_logs_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"device_tokens": {
                  Row: {
                    "created_at": string,"id": string,"platform": string,"token": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"platform": string,"token": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"platform"?: string,"token"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"fans": {
                  Row: {
                    "created_at": string,"id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "fans_id_fkey"
      columns: ["id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"gates": {
                  Row: {
                    "active": boolean,"created_at": string,"id": string,"name": string,"tenant_id": string,"updated_at": string,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"id": string,"name": string,"tenant_id"?: string,"updated_at"?: string,"venue_id": string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"name"?: string,"tenant_id"?: string,"updated_at"?: string,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "gates_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "gates_venue_id_fkey"
      columns: ["venue_id","tenant_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id","tenant_id"]
    }
                  ]
                },"match_gates": {
                  Row: {
                    "created_at": string,"gate_id": string,"match_id": string,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"gate_id": string,"match_id": string,"tenant_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"gate_id"?: string,"match_id"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "match_gates_gate_id_fkey"
      columns: ["gate_id","tenant_id"]
isOneToOne: false
      referencedRelation: "gates"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "match_gates_match_id_fkey"
      columns: ["match_id","tenant_id"]
isOneToOne: false
      referencedRelation: "matches"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "match_gates_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"match_zone_prices": {
                  Row: {
                    "created_at": string,"match_id": string,"price_minor_units": number,"tenant_id": string,"updated_at": string,"zone_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"match_id": string,"price_minor_units": number,"tenant_id"?: string,"updated_at"?: string,"zone_id": string
                  }
                  Update: {
                    "created_at"?: string,"match_id"?: string,"price_minor_units"?: number,"tenant_id"?: string,"updated_at"?: string,"zone_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "match_zone_prices_match_id_fkey"
      columns: ["match_id"]
isOneToOne: false
      referencedRelation: "match_sales_summary"
      referencedColumns: ["match_id"]
    },{
      foreignKeyName: "match_zone_prices_match_id_fkey"
      columns: ["match_id"]
isOneToOne: false
      referencedRelation: "matches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "match_zone_prices_match_id_tenant_id_fkey"
      columns: ["match_id","tenant_id"]
isOneToOne: false
      referencedRelation: "matches"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "match_zone_prices_zone_id_fkey"
      columns: ["zone_id"]
isOneToOne: false
      referencedRelation: "zones"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "match_zone_prices_zone_id_tenant_id_fkey"
      columns: ["zone_id","tenant_id"]
isOneToOne: false
      referencedRelation: "zones"
      referencedColumns: ["id","tenant_id"]
    }
                  ]
                },"matches": {
                  Row: {
                    "accent": string,"away_score": number | null,"competition": string,"created_at": string,"home_away": string,"home_score": number | null,"id": string,"kickoff_at": string,"opponent": string,"opponent_short": string,"poster_colors": (string)[],"status": Database["public"]['Enums']["match_status"],"tenant_id": string,"updated_at": string,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accent"?: string,"away_score"?: number | null,"competition"?: string,"created_at"?: string,"home_away"?: string,"home_score"?: number | null,"id"?: string,"kickoff_at": string,"opponent": string,"opponent_short": string,"poster_colors"?: (string)[],"status"?: Database["public"]['Enums']["match_status"],"tenant_id"?: string,"updated_at"?: string,"venue_id"?: string
                  }
                  Update: {
                    "accent"?: string,"away_score"?: number | null,"competition"?: string,"created_at"?: string,"home_away"?: string,"home_score"?: number | null,"id"?: string,"kickoff_at"?: string,"opponent"?: string,"opponent_short"?: string,"poster_colors"?: (string)[],"status"?: Database["public"]['Enums']["match_status"],"tenant_id"?: string,"updated_at"?: string,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "matches_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "matches_venue_id_fkey"
      columns: ["venue_id","tenant_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id","tenant_id"]
    }
                  ]
                },"news_items": {
                  Row: {
                    "body": string,"category": string,"created_at": string,"created_by": string | null,"excerpt": string,"id": string,"image_colors": (string)[],"published_at": string,"read_minutes": number,"tenant_id": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string,"category"?: string,"created_at"?: string,"created_by"?: string | null,"excerpt"?: string,"id"?: string,"image_colors"?: (string)[],"published_at"?: string,"read_minutes"?: number,"tenant_id"?: string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "body"?: string,"category"?: string,"created_at"?: string,"created_by"?: string | null,"excerpt"?: string,"id"?: string,"image_colors"?: (string)[],"published_at"?: string,"read_minutes"?: number,"tenant_id"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "news_items_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"order_seats": {
                  Row: {
                    "created_at": string,"id": string,"match_id": string,"number": number,"order_id": string,"price_minor_units": number,"row_label": string,"seat_id": string,"tenant_id": string,"ticket_id": string | null,"zone_name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"match_id": string,"number": number,"order_id": string,"price_minor_units": number,"row_label": string,"seat_id": string,"tenant_id"?: string,"ticket_id"?: string | null,"zone_name": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"match_id"?: string,"number"?: number,"order_id"?: string,"price_minor_units"?: number,"row_label"?: string,"seat_id"?: string,"tenant_id"?: string,"ticket_id"?: string | null,"zone_name"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_seats_match_id_fkey"
      columns: ["match_id","tenant_id"]
isOneToOne: false
      referencedRelation: "matches"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "order_seats_order_id_fkey"
      columns: ["order_id","tenant_id"]
isOneToOne: false
      referencedRelation: "order_receipt_view"
      referencedColumns: ["order_id","tenant_id"]
    },{
      foreignKeyName: "order_seats_order_id_fkey"
      columns: ["order_id","tenant_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "order_seats_seat_id_fkey"
      columns: ["seat_id","tenant_id"]
isOneToOne: false
      referencedRelation: "seats"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "order_seats_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_seats_ticket_id_fkey"
      columns: ["ticket_id","tenant_id"]
isOneToOne: false
      referencedRelation: "tickets"
      referencedColumns: ["id","tenant_id"]
    }
                  ]
                },"orders": {
                  Row: {
                    "amount_minor_units": number,"application_fee_amount": number,"checkout_url": string | null,"created_at": string,"currency": string,"expires_at": string | null,"id": string,"match_id": string,"paid_at": string | null,"payment_intent_id": string | null,"payment_ref": string | null,"status": Database["public"]['Enums']["order_status"],"stripe_session_id": string | null,"tenant_id": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_minor_units": number,"application_fee_amount"?: number,"checkout_url"?: string | null,"created_at"?: string,"currency"?: string,"expires_at"?: string | null,"id"?: string,"match_id": string,"paid_at"?: string | null,"payment_intent_id"?: string | null,"payment_ref"?: string | null,"status"?: Database["public"]['Enums']["order_status"],"stripe_session_id"?: string | null,"tenant_id"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "amount_minor_units"?: number,"application_fee_amount"?: number,"checkout_url"?: string | null,"created_at"?: string,"currency"?: string,"expires_at"?: string | null,"id"?: string,"match_id"?: string,"paid_at"?: string | null,"payment_intent_id"?: string | null,"payment_ref"?: string | null,"status"?: Database["public"]['Enums']["order_status"],"stripe_session_id"?: string | null,"tenant_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "orders_match_id_fkey"
      columns: ["match_id","tenant_id"]
isOneToOne: false
      referencedRelation: "matches"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "orders_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"email": string,"full_name": string,"id": string,"phone": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email": string,"full_name"?: string,"id": string,"phone"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string,"full_name"?: string,"id"?: string,"phone"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"rate_limits": {
                  Row: {
                    "hits": number,"key": string,"window_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "hits"?: number,"key": string,"window_start": string
                  }
                  Update: {
                    "hits"?: number,"key"?: string,"window_start"?: string
                  }
                  Relationships: [
                    
                  ]
                },"refunds": {
                  Row: {
                    "actor_id": string | null,"amount_minor_units": number,"created_at": string,"currency": string,"id": string,"order_id": string,"override_used_tickets": boolean,"reason": string | null,"tenant_id": string,"used_tickets": number
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"amount_minor_units": number,"created_at"?: string,"currency": string,"id"?: string,"order_id": string,"override_used_tickets"?: boolean,"reason"?: string | null,"tenant_id": string,"used_tickets"?: number
                  }
                  Update: {
                    "actor_id"?: string | null,"amount_minor_units"?: number,"created_at"?: string,"currency"?: string,"id"?: string,"order_id"?: string,"override_used_tickets"?: boolean,"reason"?: string | null,"tenant_id"?: string,"used_tickets"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "refunds_order_id_tenant_id_fkey"
      columns: ["order_id","tenant_id"]
isOneToOne: false
      referencedRelation: "order_receipt_view"
      referencedColumns: ["order_id","tenant_id"]
    },{
      foreignKeyName: "refunds_order_id_tenant_id_fkey"
      columns: ["order_id","tenant_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id","tenant_id"]
    }
                  ]
                },"scan_events": {
                  Row: {
                    "admin_id": string,"created_at": string,"gate_id": string,"id": string,"idempotency_key": string,"match_id": string | null,"operator_id": string | null,"raw_hash": string,"result": Database["public"]['Enums']["scan_result"],"tenant_id": string,"ticket_id": string | null,"undone_at": string | null,"undone_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "admin_id": string,"created_at"?: string,"gate_id": string,"id"?: string,"idempotency_key": string,"match_id"?: string | null,"operator_id"?: string | null,"raw_hash": string,"result": Database["public"]['Enums']["scan_result"],"tenant_id"?: string,"ticket_id"?: string | null,"undone_at"?: string | null,"undone_by"?: string | null
                  }
                  Update: {
                    "admin_id"?: string,"created_at"?: string,"gate_id"?: string,"id"?: string,"idempotency_key"?: string,"match_id"?: string | null,"operator_id"?: string | null,"raw_hash"?: string,"result"?: Database["public"]['Enums']["scan_result"],"tenant_id"?: string,"ticket_id"?: string | null,"undone_at"?: string | null,"undone_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "scan_events_gate_id_fkey"
      columns: ["gate_id","tenant_id"]
isOneToOne: false
      referencedRelation: "gates"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "scan_events_match_id_fkey"
      columns: ["match_id","tenant_id"]
isOneToOne: false
      referencedRelation: "matches"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "scan_events_operator_id_fkey"
      columns: ["operator_id","tenant_id"]
isOneToOne: false
      referencedRelation: "staff_members"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "scan_events_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "scan_events_ticket_id_fkey"
      columns: ["ticket_id","tenant_id"]
isOneToOne: false
      referencedRelation: "tickets"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "scan_events_undone_by_fkey"
      columns: ["undone_by","tenant_id"]
isOneToOne: false
      referencedRelation: "staff_members"
      referencedColumns: ["id","tenant_id"]
    }
                  ]
                },"seat_holds": {
                  Row: {
                    "created_at": string,"expires_at": string,"hold_group_id": string,"id": string,"match_id": string,"released_at": string | null,"seat_id": string,"tenant_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"expires_at": string,"hold_group_id": string,"id"?: string,"match_id": string,"released_at"?: string | null,"seat_id": string,"tenant_id"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"expires_at"?: string,"hold_group_id"?: string,"id"?: string,"match_id"?: string,"released_at"?: string | null,"seat_id"?: string,"tenant_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "seat_holds_match_id_fkey"
      columns: ["match_id","tenant_id"]
isOneToOne: false
      referencedRelation: "matches"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "seat_holds_seat_id_fkey"
      columns: ["seat_id","tenant_id"]
isOneToOne: false
      referencedRelation: "seats"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "seat_holds_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"seats": {
                  Row: {
                    "created_at": string,"id": string,"number": number,"row_label": string,"tenant_id": string,"zone_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"number": number,"row_label": string,"tenant_id"?: string,"zone_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"number"?: number,"row_label"?: string,"tenant_id"?: string,"zone_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "seats_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "seats_zone_id_fkey"
      columns: ["zone_id","tenant_id"]
isOneToOne: false
      referencedRelation: "zones"
      referencedColumns: ["id","tenant_id"]
    }
                  ]
                },"staff_members": {
                  Row: {
                    "created_at": string,"granted_by": string | null,"id": string,"staff_role": string,"tenant_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"granted_by"?: string | null,"id": string,"staff_role": string,"tenant_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"granted_by"?: string | null,"id"?: string,"staff_role"?: string,"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "staff_members_granted_by_fkey"
      columns: ["granted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "staff_members_id_fkey"
      columns: ["id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "staff_members_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "staff_members_tenant_id_staff_role_fkey"
      columns: ["tenant_id","staff_role"]
isOneToOne: false
      referencedRelation: "staff_roles"
      referencedColumns: ["tenant_id","code"]
    }
                  ]
                },"staff_roles": {
                  Row: {
                    "can_manage_staff": boolean,"can_operate_gate": boolean,"code": string,"created_at": string,"name": string,"sort_order": number,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "can_manage_staff"?: boolean,"can_operate_gate"?: boolean,"code": string,"created_at"?: string,"name": string,"sort_order"?: number,"tenant_id": string
                  }
                  Update: {
                    "can_manage_staff"?: boolean,"can_operate_gate"?: boolean,"code"?: string,"created_at"?: string,"name"?: string,"sort_order"?: number,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "staff_roles_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"stripe_events": {
                  Row: {
                    "account_id": string | null,"created_at": string,"id": string,"payload": Json | null,"processed_at": string,"tenant_id": string | null,"type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id"?: string | null,"created_at"?: string,"id": string,"payload"?: Json | null,"processed_at"?: string,"tenant_id"?: string | null,"type": string
                  }
                  Update: {
                    "account_id"?: string | null,"created_at"?: string,"id"?: string,"payload"?: Json | null,"processed_at"?: string,"tenant_id"?: string | null,"type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "stripe_events_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"tenants": {
                  Row: {
                    "application_fee_bps": number,"created_at": string,"currency": string,"erased_at": string | null,"id": string,"locale": string,"logo_url": string | null,"name": string,"offboarded_at": string | null,"primary_color": string,"slug": string,"status": Database["public"]['Enums']["tenant_status"],"stripe_account_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "application_fee_bps"?: number,"created_at"?: string,"currency"?: string,"erased_at"?: string | null,"id"?: string,"locale"?: string,"logo_url"?: string | null,"name": string,"offboarded_at"?: string | null,"primary_color"?: string,"slug": string,"status"?: Database["public"]['Enums']["tenant_status"],"stripe_account_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "application_fee_bps"?: number,"created_at"?: string,"currency"?: string,"erased_at"?: string | null,"id"?: string,"locale"?: string,"logo_url"?: string | null,"name"?: string,"offboarded_at"?: string | null,"primary_color"?: string,"slug"?: string,"status"?: Database["public"]['Enums']["tenant_status"],"stripe_account_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"tickets": {
                  Row: {
                    "created_at": string,"id": string,"issued_at": string,"match_id": string,"order_id": string,"order_seat_id": string,"qr_nonce": string,"seat_id": string,"status": Database["public"]['Enums']["ticket_status"],"tenant_id": string,"used_at": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"issued_at"?: string,"match_id": string,"order_id": string,"order_seat_id": string,"qr_nonce"?: string,"seat_id": string,"status"?: Database["public"]['Enums']["ticket_status"],"tenant_id"?: string,"used_at"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"issued_at"?: string,"match_id"?: string,"order_id"?: string,"order_seat_id"?: string,"qr_nonce"?: string,"seat_id"?: string,"status"?: Database["public"]['Enums']["ticket_status"],"tenant_id"?: string,"used_at"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tickets_match_id_fkey"
      columns: ["match_id","tenant_id"]
isOneToOne: false
      referencedRelation: "matches"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "tickets_order_id_fkey"
      columns: ["order_id","tenant_id"]
isOneToOne: false
      referencedRelation: "order_receipt_view"
      referencedColumns: ["order_id","tenant_id"]
    },{
      foreignKeyName: "tickets_order_id_fkey"
      columns: ["order_id","tenant_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "tickets_order_seat_id_fkey"
      columns: ["order_seat_id","tenant_id"]
isOneToOne: false
      referencedRelation: "order_seats"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "tickets_seat_id_fkey"
      columns: ["seat_id","tenant_id"]
isOneToOne: false
      referencedRelation: "seats"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "tickets_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"venues": {
                  Row: {
                    "address": string | null,"city": string | null,"created_at": string,"id": string,"name": string,"tenant_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"city"?: string | null,"created_at"?: string,"id"?: string,"name": string,"tenant_id"?: string,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string | null,"city"?: string | null,"created_at"?: string,"id"?: string,"name"?: string,"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "venues_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"zones": {
                  Row: {
                    "color": string,"created_at": string,"description": string,"id": string,"match_id": string,"name": string,"rows": (string)[],"seats_per_row": number,"tenant_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "color"?: string,"created_at"?: string,"description"?: string,"id"?: string,"match_id": string,"name": string,"rows"?: (string)[],"seats_per_row": number,"tenant_id"?: string,"updated_at"?: string
                  }
                  Update: {
                    "color"?: string,"created_at"?: string,"description"?: string,"id"?: string,"match_id"?: string,"name"?: string,"rows"?: (string)[],"seats_per_row"?: number,"tenant_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "zones_match_id_fkey"
      columns: ["match_id","tenant_id"]
isOneToOne: false
      referencedRelation: "matches"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "zones_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "match_sales_summary": {
                  Row: {
                    "match_id": string,"orders_paid": number | null,"revenue_minor_units": number | null,"tickets_sold": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"order_receipt_view": {
                  Row: {
                    "amount_minor_units": number,"created_at": string,"currency": string,"holder": string,"holder_email": string,"kickoff_at": string,"match_id": string,"opponent": string,"order_id": string,"paid_at": string | null,"payment_ref": string | null,"seats": Json | null,"status": Database["public"]['Enums']["order_status"],"tenant_id": string,"user_id": string,"venue": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "orders_match_id_fkey"
      columns: ["match_id","tenant_id"]
isOneToOne: false
      referencedRelation: "matches"
      referencedColumns: ["id","tenant_id"]
    },{
      foreignKeyName: "orders_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"pg_all_foreign_keys": {
                  Row: {
                    "fk_columns": (unknown)[] | null,"fk_constraint_name": unknown,"fk_schema_name": unknown,"fk_table_name": unknown,"fk_table_oid": unknown,"is_deferrable": boolean | null,"is_deferred": boolean | null,"match_type": string | null,"on_delete": string | null,"on_update": string | null,"pk_columns": (unknown)[] | null,"pk_constraint_name": unknown,"pk_index_name": unknown,"pk_schema_name": unknown,"pk_table_name": unknown,"pk_table_oid": unknown
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"seat_availability": {
                  Row: {
                    "match_id": string | null,"seat_id": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"tap_funky": {
                  Row: {
                    "args": string | null,"is_definer": boolean | null,"is_strict": boolean | null,"is_visible": boolean | null,"kind": unknown,"langoid": unknown,"name": unknown,"oid": unknown,"owner": unknown,"returns": string | null,"returns_set": boolean | null,"schema": unknown,"volatility": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"zone_availability": {
                  Row: {
                    "available_seats": number | null,"tenant_id": string,"total_seats": number | null,"zone_id": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "seats_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "seats_zone_id_fkey"
      columns: ["zone_id","tenant_id"]
isOneToOne: false
      referencedRelation: "zones"
      referencedColumns: ["id","tenant_id"]
    }
                  ]
                }
          }
          Functions: {
            "_cleanup":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"_contract_on":
{ Args: { "": string }; Returns: unknown
                           },
"_currtest":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"_db_privs":
{ Args: Record<PropertyKey, never>; Returns: (unknown)[]
                           },
"_extensions":
{ Args: Record<PropertyKey, never>; Returns: unknown[]
                           },
"_get":
{ Args: { "": string }; Returns: number
                           },
"_get_latest":
{ Args: { "": string }; Returns: (number)[]
                           },
"_get_note":
{ Args: { "": string }; Returns: string
                           },
"_is_verbose":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"_prokind":
{ Args: { "p_oid": unknown }; Returns: unknown
                           },
"_query":
{ Args: { "": string }; Returns: string
                           },
"_refine_vol":
{ Args: { "": string }; Returns: string
                           },
"_retval":
{ Args: { "": string }; Returns: string
                           },
"_table_privs":
{ Args: Record<PropertyKey, never>; Returns: (unknown)[]
                           },
"_temptypes":
{ Args: { "": string }; Returns: string
                           },
"_todo":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"admin_update_match":
{ Args: { "p_match_id": string,"p_patch": Json,"p_reason"?: string }; Returns: Json
                           },
"application_fee_minor_units":
{ Args: { "p_amount_minor_units": number,"p_fee_bps": number }; Returns: number
                           },
"cancel_order":
{ Args: { "p_actor_id"?: string,"p_order_id": string }; Returns: Json
                           },
"cancel_order_internal":
{ Args: { "p_order_id": string }; Returns: Json
                           },
"col_is_null":
{ Args: { "column_name": unknown,"description"?: string,"schema_name": unknown,"table_name": unknown }; Returns: string
                           } |
{ Args: { "column_name": unknown,"description"?: string,"table_name": unknown }; Returns: string
                           },
"col_not_null":
{ Args: { "column_name": unknown,"description"?: string,"schema_name": unknown,"table_name": unknown }; Returns: string
                           } |
{ Args: { "column_name": unknown,"description"?: string,"table_name": unknown }; Returns: string
                           },
"consume_rate_limit":
{ Args: { "p_key": string,"p_max_hits": number,"p_window_seconds": number }; Returns: boolean
                           },
"create_hold":
{ Args: { "p_match_id": string,"p_seat_ids": (string)[] }; Returns: Json
                           },
"create_order_from_hold":
{ Args: { "p_hold_id": string }; Returns: Json
                           },
"current_tenant":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"dblink":
{ Args: { "": string }; Returns: Record<string, unknown>[]
                           },
"dblink_cancel_query":
{ Args: { "": string }; Returns: string
                           },
"dblink_close":
{ Args: { "": string }; Returns: string
                           },
"dblink_connect":
{ Args: { "": string }; Returns: string
                           },
"dblink_connect_u":
{ Args: { "": string }; Returns: string
                           },
"dblink_current_query":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"dblink_disconnect":
{ Args: Record<PropertyKey, never>; Returns: string
                           } |
{ Args: { "": string }; Returns: string
                           },
"dblink_error_message":
{ Args: { "": string }; Returns: string
                           },
"dblink_exec":
{ Args: { "": string }; Returns: string
                           },
"dblink_fdw_validator":
{ Args: { "catalog": unknown,"options": (string)[] }; Returns: undefined
                           },
"dblink_get_connections":
{ Args: Record<PropertyKey, never>; Returns: (string)[]
                           },
"dblink_get_notify":
{ Args: { "conname": string }; Returns: Record<string, unknown>[]
                           } |
{ Args: Record<PropertyKey, never>; Returns: Record<string, unknown>[]
                           },
"dblink_get_pkey":
{ Args: { "": string }; Returns: Database["public"]['CompositeTypes']["dblink_pkey_results"][]
                          SetofOptions: {
        from: "*"
        to: "dblink_pkey_results"
        isOneToOne: false
        isSetofReturn: true
      } },
"dblink_get_result":
{ Args: { "": string }; Returns: Record<string, unknown>[]
                           },
"dblink_is_busy":
{ Args: { "": string }; Returns: number
                           },
"diag":
{ Args: { "msg": unknown }; Returns: { error: true } & "Could not choose the best candidate function between: public.diag(msg => text), public.diag(msg => anyelement). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
                           } |
{ Args: { "msg": string }; Returns: { error: true } & "Could not choose the best candidate function between: public.diag(msg => text), public.diag(msg => anyelement). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
                           },
"diag_test_name":
{ Args: { "": string }; Returns: string
                           },
"do_tap":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           } |
{ Args: { "": string }; Returns: string[]
                           },
"erase_tenant":
{ Args: { "p_tenant_id": string }; Returns: Json
                           },
"expire_pending_orders":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"export_tenant":
{ Args: { "p_tenant_id": string }; Returns: Json
                           },
"fail":
{ Args: Record<PropertyKey, never>; Returns: string
                           } |
{ Args: { "": string }; Returns: string
                           },
"findfuncs":
{ Args: { "": string }; Returns: (string)[]
                           },
"finish":
{ Args: { "exception_on_failure"?: boolean }; Returns: string[]
                           },
"format_type_string":
{ Args: { "": string }; Returns: string
                           },
"free_seats_for_order":
{ Args: { "p_order_id": string }; Returns: number
                           },
"grant_admin":
{ Args: { "p_email": string }; Returns: undefined
                           },
"has_unique":
{ Args: { "": string }; Returns: string
                           },
"in_todo":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_empty":
{ Args: { "": string }; Returns: string
                           },
"is_gate_operator":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_staff":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"isnt_empty":
{ Args: { "": string }; Returns: string
                           },
"lives_ok":
{ Args: { "": string }; Returns: string
                           },
"mark_order_paid":
{ Args: { "p_order_id": string,"p_payment_intent_id"?: string,"p_session_id": string }; Returns: Json
                           },
"mark_order_refunded":
{ Args: { "p_actor_id": string,"p_order_id": string,"p_override_used_tickets"?: boolean,"p_reason"?: string,"p_refund_id": string }; Returns: Json
                           },
"mark_tenant_offboarded":
{ Args: { "p_tenant_id": string }; Returns: undefined
                           },
"minor_units":
{ Args: { "p_currency": string }; Returns: number
                           },
"no_plan":
{ Args: Record<PropertyKey, never>; Returns: boolean[]
                           },
"num_failed":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"os_name":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"pass":
{ Args: Record<PropertyKey, never>; Returns: string
                           } |
{ Args: { "": string }; Returns: string
                           },
"pg_version":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"pg_version_num":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"pgtap_version":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"provision_tenant":
{ Args: { "p_currency"?: string,"p_locale"?: string,"p_name": string,"p_slug": string }; Returns: string
                           },
"release_hold":
{ Args: { "p_hold_id": string }; Returns: number
                           },
"runtests":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           } |
{ Args: { "": string }; Returns: string[]
                           },
"scan_ticket":
{ Args: { "p_admin_id": string,"p_gate_id": string,"p_idempotency_key": string,"p_invalid_reason"?: string,"p_raw_hash"?: string,"p_ticket_id": string }; Returns: Json
                           },
"skip":
{ Args: { "": string }; Returns: string
                           } |
{ Args: { "how_many": number,"why": string }; Returns: string
                           },
"tenant_for_stripe_account":
{ Args: { "p_account_id"?: string }; Returns: string
                           },
"throws_ok":
{ Args: { "": string }; Returns: string
                           },
"todo":
{ Args: { "how_many": number }; Returns: boolean[]
                           } |
{ Args: { "how_many": number,"why": string }; Returns: boolean[]
                           } |
{ Args: { "why": string }; Returns: boolean[]
                           } |
{ Args: { "how_many": number,"why": string }; Returns: boolean[]
                           },
"todo_end":
{ Args: Record<PropertyKey, never>; Returns: boolean[]
                           },
"todo_start":
{ Args: Record<PropertyKey, never>; Returns: boolean[]
                           } |
{ Args: { "": string }; Returns: boolean[]
                           },
"undo_scan":
{ Args: { "p_admin_id": string,"p_gate_id"?: string,"p_scan_event_id": string }; Returns: Json
                           }
          }
          Enums: {
            "match_status": "upcoming"|"live"|"completed","order_status": "pending"|"paid"|"failed"|"cancelled"|"refunded","scan_result": "valid"|"used"|"invalid"|"wrong_match","tenant_status": "active"|"suspended","ticket_status": "valid"|"used"|"void"
          }
          CompositeTypes: {
            "_time_trial_type": {
                        "a_time": number | null
                      },"dblink_pkey_results": {
                        "position": number | null,"colname": string | null
                      }
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "match_status": ["upcoming", "live", "completed"],"order_status": ["pending", "paid", "failed", "cancelled", "refunded"],"scan_result": ["valid", "used", "invalid", "wrong_match"],"tenant_status": ["active", "suspended"],"ticket_status": ["valid", "used", "void"]
          }
        }
} as const
