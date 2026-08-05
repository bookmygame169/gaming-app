-- Migration: Re-assert the atomic inventory stock RPC and its grants
-- Description: increment_inventory_stock (added in 20260310000000) does the
-- stock update in a single UPDATE statement, which Postgres executes under
-- a row-level lock -- avoiding the read-then-write race that a later commit
-- (63fbce1) introduced in application code. CREATE OR REPLACE + explicit
-- grants here so the function definitely exists and is callable regardless
-- of what happened to it since.

CREATE OR REPLACE FUNCTION increment_inventory_stock(row_id UUID, amount INT)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_quantity INT;
BEGIN
  UPDATE inventory_items
  SET stock_quantity = GREATEST(0, stock_quantity + amount)
  WHERE id = row_id
  RETURNING stock_quantity INTO new_quantity;

  IF new_quantity IS NULL THEN
    RAISE EXCEPTION 'Inventory item % not found', row_id;
  END IF;

  RETURN new_quantity;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_inventory_stock(UUID, INT) TO anon;
GRANT EXECUTE ON FUNCTION increment_inventory_stock(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_inventory_stock(UUID, INT) TO service_role;
