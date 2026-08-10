-- Migration: the two coupon functions the app has always called
--
-- Coupons have never worked. The coupons and coupon_usage tables are live and
-- the owner can create codes, but neither function behind them exists in the
-- database, so every code a customer typed came back as an error.
--
-- Why they are missing is worth recording, because it is two different causes:
--
-- * validate_coupon is defined in 20260117000001_create_coupons.sql, which was
--   never applied to this database. That file cannot simply be run now: it
--   opens with DROP TABLE IF EXISTS coupons CASCADE and would delete every
--   coupon and its usage history. Only the function is copied here.
--
-- * use_coupon was never written at all. It has been called since the original
--   checkout page and exists nowhere in the repo.
--
-- Everything below is CREATE OR REPLACE and touches no table, so this is safe
-- to run against the live database.

-- ---------------------------------------------------------------------------
-- validate_coupon — unchanged from the original migration.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION validate_coupon(
  p_code VARCHAR,
  p_cafe_id UUID,
  p_order_amount DECIMAL,
  p_user_phone VARCHAR DEFAULT NULL
)
RETURNS TABLE (
  is_valid BOOLEAN,
  coupon_id UUID,
  discount_type VARCHAR,
  discount_value DECIMAL,
  max_discount_amount DECIMAL,
  bonus_minutes INTEGER,
  error_message VARCHAR
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_coupon RECORD;
  v_usage_count INTEGER;
  v_customer_bookings INTEGER;
BEGIN
  SELECT * INTO v_coupon
  FROM coupons
  WHERE code = UPPER(p_code)
    AND cafe_id = p_cafe_id
    AND is_active = true;

  IF v_coupon IS NULL THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::VARCHAR, NULL::DECIMAL, NULL::DECIMAL, NULL::INTEGER, 'Invalid coupon code'::VARCHAR;
    RETURN;
  END IF;

  IF v_coupon.valid_from > now() THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::VARCHAR, NULL::DECIMAL, NULL::DECIMAL, NULL::INTEGER, 'Coupon not yet valid'::VARCHAR;
    RETURN;
  END IF;

  IF v_coupon.valid_until IS NOT NULL AND v_coupon.valid_until < now() THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::VARCHAR, NULL::DECIMAL, NULL::DECIMAL, NULL::INTEGER, 'Coupon has expired'::VARCHAR;
    RETURN;
  END IF;

  IF v_coupon.max_uses IS NOT NULL AND v_coupon.uses_count >= v_coupon.max_uses THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::VARCHAR, NULL::DECIMAL, NULL::DECIMAL, NULL::INTEGER, 'Coupon usage limit reached'::VARCHAR;
    RETURN;
  END IF;

  IF p_order_amount < v_coupon.min_order_amount THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::VARCHAR, NULL::DECIMAL, NULL::DECIMAL, NULL::INTEGER,
      ('Minimum order amount is Rs' || v_coupon.min_order_amount)::VARCHAR;
    RETURN;
  END IF;

  IF p_user_phone IS NOT NULL THEN
    IF v_coupon.single_use_per_customer THEN
      SELECT COUNT(*) INTO v_usage_count
      FROM coupon_usage
      WHERE coupon_id = v_coupon.id AND user_phone = p_user_phone;

      IF v_usage_count > 0 THEN
        RETURN QUERY SELECT false, NULL::UUID, NULL::VARCHAR, NULL::DECIMAL, NULL::DECIMAL, NULL::INTEGER, 'You have already used this coupon'::VARCHAR;
        RETURN;
      END IF;
    END IF;

    IF v_coupon.new_customer_only THEN
      SELECT COUNT(*) INTO v_customer_bookings
      FROM bookings
      WHERE customer_phone = p_user_phone AND status != 'cancelled';

      IF v_customer_bookings > 0 THEN
        RETURN QUERY SELECT false, NULL::UUID, NULL::VARCHAR, NULL::DECIMAL, NULL::DECIMAL, NULL::INTEGER, 'Coupon valid for new customers only'::VARCHAR;
        RETURN;
      END IF;
    END IF;

    IF v_coupon.min_visits > 0 THEN
      SELECT COUNT(*) INTO v_customer_bookings
      FROM bookings
      WHERE customer_phone = p_user_phone AND status = 'completed';

      IF v_customer_bookings < v_coupon.min_visits THEN
        RETURN QUERY SELECT false, NULL::UUID, NULL::VARCHAR, NULL::DECIMAL, NULL::DECIMAL, NULL::INTEGER,
          ('Requires at least ' || v_coupon.min_visits || ' previous visits')::VARCHAR;
        RETURN;
      END IF;
    END IF;
  END IF;

  RETURN QUERY SELECT
    true,
    v_coupon.id,
    v_coupon.discount_type,
    v_coupon.discount_value,
    v_coupon.max_discount_amount,
    v_coupon.bonus_minutes,
    NULL::VARCHAR;
END;
$$;

-- ---------------------------------------------------------------------------
-- use_coupon — records that a code was spent.
--
-- Writing the usage row and bumping the counter in one function keeps them from
-- drifting apart: a coupon capped at 100 uses is enforced on uses_count, so a
-- usage row without the increment gives the code away for free.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION use_coupon(
  p_coupon_id UUID,
  p_booking_id UUID,
  p_user_phone VARCHAR DEFAULT NULL,
  p_user_email VARCHAR DEFAULT NULL,
  p_discount_applied DECIMAL DEFAULT 0,
  p_extra_minutes INTEGER DEFAULT 0
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_already_recorded INTEGER;
BEGIN
  -- A booking can only spend a coupon once. Without this a retried request
  -- counts the same redemption twice and burns through a usage limit.
  SELECT COUNT(*) INTO v_already_recorded
  FROM coupon_usage
  WHERE coupon_id = p_coupon_id
    AND booking_id = p_booking_id;

  IF v_already_recorded > 0 THEN
    RETURN false;
  END IF;

  INSERT INTO coupon_usage (
    coupon_id,
    booking_id,
    user_phone,
    user_email,
    discount_applied,
    extra_minutes_applied
  ) VALUES (
    p_coupon_id,
    p_booking_id,
    p_user_phone,
    p_user_email,
    p_discount_applied,
    p_extra_minutes
  );

  -- Read-modify-write in SQL rather than in the caller, so two redemptions
  -- landing together cannot both read the same count and overwrite each other.
  UPDATE coupons
  SET uses_count = COALESCE(uses_count, 0) + 1,
      updated_at = now()
  WHERE id = p_coupon_id;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION use_coupon IS
  'Records a coupon redemption and increments its counter. Returns false if this booking already used this coupon.';
