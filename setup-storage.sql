-- Run this in your Supabase SQL Editor to create the buckets for registrations and payment-proofs

-- 1. Create the buckets if they don't exist
INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('registrations', 'registrations', true),
  ('payment-proofs', 'payment-proofs', true),
  ('payment_proofs', 'payment_proofs', true),
  ('promo_proofs', 'promo_proofs', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Policies for registrations bucket
CREATE POLICY "Public Insert Registrations" 
ON storage.objects FOR INSERT 
TO public 
WITH CHECK (bucket_id = 'registrations');

CREATE POLICY "Public Select Registrations" 
ON storage.objects FOR SELECT 
TO public 
USING (bucket_id = 'registrations');

-- 3. Policies for payment-proofs bucket
CREATE POLICY "Public Select Payment Proofs" 
ON storage.objects FOR SELECT 
TO public 
USING (bucket_id = 'payment-proofs' OR bucket_id = 'payment_proofs');

CREATE POLICY "Authenticated Insert Payment Proofs" 
ON storage.objects FOR INSERT 
TO authenticated 
WITH CHECK (bucket_id = 'payment-proofs' OR bucket_id = 'payment_proofs');

CREATE POLICY "Public Insert Payment Proofs Fallback" 
ON storage.objects FOR INSERT 
TO public 
WITH CHECK (bucket_id = 'payment-proofs' OR bucket_id = 'payment_proofs');

-- 4. Policies for dedicated promo_proofs bucket
CREATE POLICY "Public Select Promo Proofs" 
ON storage.objects FOR SELECT 
TO public 
USING (bucket_id = 'promo_proofs');

CREATE POLICY "Authenticated Insert Promo Proofs" 
ON storage.objects FOR INSERT 
TO authenticated 
WITH CHECK (bucket_id = 'promo_proofs');

-- 5. Promos Table Columns Migration
ALTER TABLE public.promos ADD COLUMN IF NOT EXISTS special_terms TEXT[] DEFAULT '{}'::TEXT[];
ALTER TABLE public.promos ADD COLUMN IF NOT EXISTS terms_and_conditions TEXT[] DEFAULT '{}'::TEXT[];
ALTER TABLE public.promos ADD COLUMN IF NOT EXISTS requires_proof_file BOOLEAN DEFAULT false;
ALTER TABLE public.promos ADD COLUMN IF NOT EXISTS proof_instructions TEXT;

