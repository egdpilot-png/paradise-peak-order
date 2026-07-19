// Shared types for the guest ordering flow.
// These mirror the Supabase schema in paradise_peak_schema.sql.

export type ServiceType = 'buffet' | 'plated' | 'weekend_special';
export type Course = 'starter' | 'main' | 'dessert' | 'side' | 'amuse';
// Alias used throughout the dashboard/publisher code.
export type CourseType = Course;
export type OrderStatus =
  | 'draft'
  | 'submitted'
  | 'locked'
  | 'served'
  | 'cancelled';

export type DietaryFlag =
  | 'vegetarian'
  | 'vegan'
  | 'gluten_free'
  | 'dairy_free'
  | 'nut_free'
  | 'nut_allergy'
  | 'shellfish_allergy'
  | 'pescatarian'
  | 'halal'
  | 'kosher'
  | 'no_pork'
  | 'no_alcohol'
  | 'other';

export interface MenuItem {
  id: string;
  course: Course;
  name: string;
  name_fr: string | null;
  description: string | null;
  description_fr: string | null;
  allergens: string[];
  dietary_tags: DietaryFlag[];
  is_default: boolean;
  display_order: number;
  photo_url: string | null;
}

export interface Menu {
  id: string;
  service_date: string; // ISO YYYY-MM-DD
  service_type: ServiceType;
  title: string;
  title_fr: string | null;
  subtitle: string | null;
  subtitle_fr: string | null;
  items: MenuItem[];
}

export interface Guest {
  id: string;
  room_number: string;
  guest_name: string;
  dietary_flags: DietaryFlag[];
  allergy_notes: string | null;
  vip_notes: string | null;
  language: 'en' | 'fr';
}

export interface Order {
  id: string;
  order_ref: string;
  service_date: string;
  menu_id: string;
  guest_id: string | null;
  room_number: string;
  cover_count: number;
  status: OrderStatus;
  notes: string | null;
  submitted_at: string | null;
  locked_at: string | null;
  items: OrderItem[];
}

export interface OrderItem {
  id: string;
  menu_item_id: string;
  course: Course;
  quantity: number;
  guest_note: string | null;
}

// The signed payload baked into every QR code.
export interface QrTokenPayload {
  room: string;              // room number
  guest_id?: string;         // optional pre-linked guest
  issued_at: number;         // unix seconds
  expires_at: number;        // unix seconds — typically end of stay
  property: 'paradise_peak';
}
