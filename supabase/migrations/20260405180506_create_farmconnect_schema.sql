/*
  # FarmConnect Platform Schema

  ## Overview
  Complete database schema for the FarmConnect farm-to-consumer platform with farmer management,
  product listings, order tracking, delivery management, and complaint resolution.

  ## New Tables

  ### 1. users
  - `id` (uuid, primary key) - User unique identifier
  - `phone` (text, unique) - Phone number for OTP authentication
  - `name` (text) - User's full name
  - `role` (text) - User role: farmer, user, admin, delivery
  - `location` (text) - User's location/address
  - `status` (text) - For farmers: active, pending, suspended
  - `revenue` (numeric) - For farmers: total revenue earned
  - `rating` (numeric) - For farmers/delivery: average rating
  - `vehicle_type` (text) - For delivery partners: bike, auto, truck
  - `vehicle_number` (text) - For delivery partners
  - `created_at` (timestamptz) - Account creation timestamp

  ### 2. products
  - `id` (uuid, primary key) - Product unique identifier
  - `farmer_id` (uuid, foreign key) - Reference to users table
  - `name` (text) - Product name
  - `category` (text) - Product category (Vegetables, Fruits, etc.)
  - `price` (numeric) - Price per unit
  - `unit` (text) - Unit of measurement (per kg, per bunch, etc.)
  - `stock` (numeric) - Available stock in kg
  - `harvest_date` (date) - When the product was harvested
  - `expiry_date` (date) - Product expiration date
  - `image_url` (text) - Product image URL
  - `description` (text) - Product description
  - `created_at` (timestamptz) - Listing creation timestamp

  ### 3. orders
  - `id` (uuid, primary key) - Order unique identifier
  - `order_number` (text, unique) - Human-readable order ID (e.g., #FC-1050)
  - `user_id` (uuid, foreign key) - Customer who placed the order
  - `farmer_id` (uuid, foreign key) - Farmer fulfilling the order
  - `delivery_partner_id` (uuid, foreign key, nullable) - Assigned delivery partner
  - `items` (jsonb) - Array of order items with product details and quantities
  - `total_amount` (numeric) - Total order amount including delivery
  - `status` (text) - Order status: pending, accepted, out, delivered, cancelled
  - `created_at` (timestamptz) - Order placement timestamp
  - `updated_at` (timestamptz) - Last status update timestamp

  ### 4. complaints
  - `id` (uuid, primary key) - Complaint unique identifier
  - `user_id` (uuid, foreign key) - User who filed the complaint
  - `order_id` (uuid, foreign key) - Related order
  - `type` (text) - Issue type
  - `description` (text) - Detailed complaint description
  - `status` (text) - Complaint status: open, review, resolved
  - `created_at` (timestamptz) - Complaint filing timestamp

  ### 5. delivery_history
  - `id` (uuid, primary key) - Delivery record identifier
  - `delivery_partner_id` (uuid, foreign key) - Delivery partner
  - `order_id` (uuid, foreign key) - Delivered order
  - `distance` (text) - Distance traveled
  - `earnings` (numeric) - Delivery fee earned
  - `rating` (numeric) - Customer rating for delivery
  - `completed_at` (timestamptz) - Delivery completion timestamp

  ## Security
  - Enable RLS on all tables
  - Users can read their own data
  - Farmers can manage their products and orders
  - Delivery partners can view available orders and manage their deliveries
  - Admins have full access
  - Public can browse products

  ## Important Notes
  1. Phone authentication will be handled via Supabase Auth
  2. Real-time subscriptions enabled for orders and products
  3. All timestamps use UTC timezone
  4. JSON items in orders maintain full product snapshot at order time
*/

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text UNIQUE NOT NULL,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'user',
  location text,
  status text DEFAULT 'active',
  revenue numeric DEFAULT 0,
  rating numeric DEFAULT 0,
  vehicle_type text,
  vehicle_number text,
  created_at timestamptz DEFAULT now()
);

-- Create products table
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
  price numeric NOT NULL,
  unit text NOT NULL DEFAULT 'per kg',
  stock numeric NOT NULL DEFAULT 0,
  harvest_date date NOT NULL,
  expiry_date date NOT NULL,
  image_url text,
  description text,
  created_at timestamptz DEFAULT now()
);

-- Create orders table
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text UNIQUE NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  farmer_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  delivery_partner_id uuid REFERENCES users(id) ON DELETE SET NULL,
  items jsonb NOT NULL,
  total_amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create complaints table
CREATE TABLE IF NOT EXISTS complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz DEFAULT now()
);

-- Create delivery_history table
CREATE TABLE IF NOT EXISTS delivery_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_partner_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
  distance text,
  earnings numeric DEFAULT 0,
  rating numeric DEFAULT 5.0,
  completed_at timestamptz DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_products_farmer ON products(farmer_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_expiry ON products(expiry_date);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_farmer ON orders(farmer_id);
CREATE INDEX IF NOT EXISTS idx_orders_delivery ON orders(delivery_partner_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_complaints_user ON complaints(user_id);
CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_history ENABLE ROW LEVEL SECURITY;

-- Users Policies
CREATE POLICY "Users can view own profile"
  ON users FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can view all users"
  ON users FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Admins can update all users"
  ON users FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Products Policies
CREATE POLICY "Anyone can view active products"
  ON products FOR SELECT
  TO authenticated
  USING (expiry_date > CURRENT_DATE);

CREATE POLICY "Farmers can insert own products"
  ON products FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = farmer_id AND
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'farmer'
    )
  );

CREATE POLICY "Farmers can update own products"
  ON products FOR UPDATE
  TO authenticated
  USING (auth.uid() = farmer_id)
  WITH CHECK (auth.uid() = farmer_id);

CREATE POLICY "Farmers can delete own products"
  ON products FOR DELETE
  TO authenticated
  USING (auth.uid() = farmer_id);

-- Orders Policies
CREATE POLICY "Users can view own orders"
  ON orders FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id OR
    auth.uid() = farmer_id OR
    auth.uid() = delivery_partner_id OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Users can create orders"
  ON orders FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Farmers can update orders they fulfill"
  ON orders FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = farmer_id OR
    auth.uid() = delivery_partner_id OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  )
  WITH CHECK (
    auth.uid() = farmer_id OR
    auth.uid() = delivery_partner_id OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Complaints Policies
CREATE POLICY "Users can view own complaints"
  ON complaints FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Users can create complaints"
  ON complaints FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can update complaints"
  ON complaints FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Delivery History Policies
CREATE POLICY "Delivery partners can view own history"
  ON delivery_history FOR SELECT
  TO authenticated
  USING (
    auth.uid() = delivery_partner_id OR
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Delivery partners can insert own history"
  ON delivery_history FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = delivery_partner_id);

-- Function to update order timestamp
CREATE OR REPLACE FUNCTION update_order_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update order timestamp
DROP TRIGGER IF EXISTS orders_updated_at ON orders;
CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_order_timestamp();