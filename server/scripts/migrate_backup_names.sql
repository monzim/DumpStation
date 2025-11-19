-- Migration script to add names to existing backups
-- Run this after the server has added the 'name' column to the backups table

-- This script generates unique names for existing backups that don't have names yet

-- Generate names based on timestamp and a sequential number for uniqueness
WITH numbered_backups AS (
  SELECT
    id,
    started_at,
    ROW_NUMBER() OVER (PARTITION BY DATE(started_at) ORDER BY started_at) as seq_num
  FROM backups
  WHERE name IS NULL OR name = ''
),
adjectives AS (
  SELECT unnest(ARRAY[
    'swift', 'bright', 'calm', 'eager', 'gentle',
    'happy', 'jolly', 'kind', 'lively', 'merry',
    'noble', 'proud', 'quiet', 'rapid', 'serene',
    'brave', 'clever', 'daring', 'wise', 'mighty',
    'golden', 'silver', 'crystal', 'stellar', 'cosmic'
  ]) as adj,
  generate_series(1, 25) as adj_id
),
nouns AS (
  SELECT unnest(ARRAY[
    'falcon', 'eagle', 'hawk', 'raven', 'phoenix',
    'tiger', 'lion', 'bear', 'wolf', 'fox',
    'dragon', 'unicorn', 'griffin', 'pegasus', 'kraken',
    'atlas', 'titan', 'neptune', 'mercury', 'venus',
    'comet', 'meteor', 'nova', 'quasar', 'pulsar'
  ]) as noun,
  generate_series(1, 25) as noun_id
)
UPDATE backups b
SET name = CONCAT(
  a.adj, '-',
  n.noun, '-',
  TO_CHAR(nb.started_at, 'YYYYMMDD'),
  CASE WHEN nb.seq_num > 1 THEN CONCAT('-', LPAD(nb.seq_num::TEXT, 3, '0')) ELSE '' END
)
FROM numbered_backups nb
CROSS JOIN LATERAL (
  SELECT adj FROM adjectives WHERE adj_id = (ABS(HASHTEXT(nb.id::TEXT)) % 25) + 1
) a
CROSS JOIN LATERAL (
  SELECT noun FROM nouns WHERE noun_id = (ABS(HASHTEXT(nb.id::TEXT || 'salt')) % 25) + 1
) n
WHERE b.id = nb.id;

-- Verify the update
SELECT
  COUNT(*) as total_backups,
  COUNT(CASE WHEN name IS NOT NULL AND name != '' THEN 1 END) as backups_with_names,
  COUNT(CASE WHEN name IS NULL OR name = '' THEN 1 END) as backups_without_names
FROM backups;

-- Show sample of updated backups
SELECT id, name, started_at, status
FROM backups
ORDER BY started_at DESC
LIMIT 10;
