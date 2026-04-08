-- Normalize station_pricing station names/types so legacy rows like
-- "RACING SIM-01" and "RACING_SIM-01" collapse into one canonical key.

CREATE OR REPLACE FUNCTION canonical_station_type_key(raw_type TEXT, raw_name TEXT)
RETURNS TEXT AS $$
  SELECT CASE
    WHEN normalized IN ('steering_wheel', 'steeringwheel', 'steering') THEN 'steering'
    WHEN normalized IN ('racing_sim', 'racingsim') THEN 'racing_sim'
    ELSE normalized
  END
  FROM (
    SELECT regexp_replace(
      lower(
        trim(
          coalesce(
            nullif(raw_type, ''),
            regexp_replace(coalesce(raw_name, ''), '[-_ ]*\d+\s*$', '')
          )
        )
      ),
      '[-\s]+',
      '_',
      'g'
    ) AS normalized
  ) source;
$$ LANGUAGE SQL IMMUTABLE;

CREATE OR REPLACE FUNCTION canonical_station_type_label(type_key TEXT)
RETURNS TEXT AS $$
  SELECT CASE type_key
    WHEN 'ps5' THEN 'PS5'
    WHEN 'ps4' THEN 'PS4'
    WHEN 'xbox' THEN 'Xbox'
    WHEN 'pc' THEN 'PC'
    WHEN 'vr' THEN 'VR'
    WHEN 'pool' THEN 'Pool'
    WHEN 'snooker' THEN 'Snooker'
    WHEN 'arcade' THEN 'Arcade'
    WHEN 'steering' THEN 'Steering Wheel'
    WHEN 'racing_sim' THEN 'Racing Sim'
    ELSE initcap(replace(type_key, '_', ' '))
  END;
$$ LANGUAGE SQL IMMUTABLE;

CREATE OR REPLACE FUNCTION canonical_station_name(raw_type TEXT, raw_name TEXT, raw_number INTEGER)
RETURNS TEXT AS $$
  SELECT canonical_station_type_key(raw_type, raw_name)
    || '-'
    || lpad(
      coalesce(
        nullif(substring(coalesce(raw_name, '') FROM '(\d+)\s*$'), ''),
        raw_number::TEXT
      ),
      2,
      '0'
    );
$$ LANGUAGE SQL IMMUTABLE;

WITH ranked AS (
  SELECT
    id,
    cafe_id,
    canonical_station_name(station_type, station_name, station_number) AS canonical_name,
    ROW_NUMBER() OVER (
      PARTITION BY cafe_id, canonical_station_name(station_type, station_name, station_number)
      ORDER BY
        updated_at DESC,
        created_at DESC,
        CASE
          WHEN lower(trim(station_name)) = canonical_station_name(station_type, station_name, station_number) THEN 0
          ELSE 1
        END,
        id DESC
    ) AS rn
  FROM station_pricing
)
DELETE FROM station_pricing sp
USING ranked r
WHERE sp.id = r.id
  AND r.rn > 1;

WITH normalized AS (
  SELECT
    id,
    canonical_station_type_key(station_type, station_name) AS canonical_type_key,
    canonical_station_type_label(canonical_station_type_key(station_type, station_name)) AS canonical_type_label,
    canonical_station_name(station_type, station_name, station_number) AS canonical_name,
    coalesce(
      nullif(substring(coalesce(station_name, '') FROM '(\d+)\s*$'), '')::INTEGER,
      station_number
    ) AS canonical_number
  FROM station_pricing
)
UPDATE station_pricing sp
SET
  station_type = normalized.canonical_type_label,
  station_name = normalized.canonical_name,
  station_number = normalized.canonical_number
FROM normalized
WHERE sp.id = normalized.id
  AND (
    sp.station_type IS DISTINCT FROM normalized.canonical_type_label
    OR sp.station_name IS DISTINCT FROM normalized.canonical_name
    OR sp.station_number IS DISTINCT FROM normalized.canonical_number
  );

DROP FUNCTION IF EXISTS canonical_station_name(TEXT, TEXT, INTEGER);
DROP FUNCTION IF EXISTS canonical_station_type_label(TEXT);
DROP FUNCTION IF EXISTS canonical_station_type_key(TEXT, TEXT);
