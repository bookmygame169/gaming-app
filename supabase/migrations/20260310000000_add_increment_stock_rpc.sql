-- Create an RPC function to atomically increment/decrement inventory stock
-- This prevents race conditions when multiple staff members update stock simultaneously

CREATE OR REPLACE FUNCTION increment_inventory_stock(row_id UUID, amount INT)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER -- Ensures the function can run even with RLS, though we rely on app-level RLS where possible
AS $$
DECLARE
  new_quantity INT;
BEGIN
  -- Update the stock, ensuring it never drops below 0
  UPDATE inventory_items
  SET stock_quantity = GREATEST(0, stock_quantity + amount)
  WHERE id = row_id
  RETURNING stock_quantity INTO new_quantity;
  
  -- Return the new quantity so the client knows the authoritative value
  RETURN new_quantity;
END;
$$;
