-- Add image_url column to subjects table
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS image_url TEXT;
