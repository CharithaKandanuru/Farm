import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface User {
  id: string;
  phone: string;
  name: string;
  role: 'farmer' | 'user' | 'admin' | 'delivery';
  location: string | null;
  status: string;
  revenue: number;
  rating: number;
  vehicle_type: string | null;
  vehicle_number: string | null;
  created_at: string;
}

export interface Product {
  id: string;
  farmer_id: string;
  name: string;
  category: string;
  price: number;
  unit: string;
  stock: number;
  harvest_date: string;
  expiry_date: string;
  image_url: string | null;
  description: string | null;
  created_at: string;
  farmer?: User;
}

export interface OrderItem {
  id: string;
  name: string;
  price: number;
  qty: number;
  img: string;
  unit: string;
}

export interface Order {
  id: string;
  order_number: string;
  user_id: string;
  farmer_id: string;
  delivery_partner_id: string | null;
  items: OrderItem[];
  total_amount: number;
  status: 'pending' | 'accepted' | 'out' | 'delivered' | 'cancelled';
  created_at: string;
  updated_at: string;
  user?: User;
  farmer?: User;
  delivery_partner?: User;
}

export interface Complaint {
  id: string;
  user_id: string;
  order_id: string;
  type: string;
  description: string;
  status: 'open' | 'review' | 'resolved';
  created_at: string;
  user?: User;
  order?: Order;
}

export interface DeliveryHistory {
  id: string;
  delivery_partner_id: string;
  order_id: string;
  distance: string | null;
  earnings: number;
  rating: number;
  completed_at: string;
  order?: Order;
}
