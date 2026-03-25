-- Speed up owner dashboard booking queries as booking history grows.
CREATE INDEX IF NOT EXISTS idx_bookings_cafe_created_at
ON bookings(cafe_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bookings_cafe_booking_date_created_at
ON bookings(cafe_id, booking_date DESC, created_at DESC);
