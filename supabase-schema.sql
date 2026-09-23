-- ============================================================
-- VOITSFEST Event Web Platform — Complete Database Schema
-- Target: Supabase PostgreSQL (execute in SQL Editor)
-- Generated from PRD Section 7: Database Schema
-- ============================================================

-- ============================================================
-- 1. EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- for gen_random_uuid()

-- ============================================================
-- 2. CUSTOM TYPES (ENUMS)
-- ============================================================
CREATE TYPE user_role AS ENUM ('user', 'admin', 'security');
CREATE TYPE registration_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE transaction_status AS ENUM ('Pending', 'Verified', 'Rejected');
CREATE TYPE sub_event_type AS ENUM ('BPC', 'BCC', 'SEMINAR', 'TENANT', 'CFR', 'FESTIVAL');
CREATE TYPE discount_type AS ENUM ('percent', 'nominal', 'bundling');
CREATE TYPE participant_type AS ENUM ('bpc', 'bcc', 'general');
CREATE TYPE ticket_event_type AS ENUM ('CFR', 'FESTIVAL');

-- ============================================================
-- 3. TABLES
-- ============================================================

-- 3.1 profiles
-- Linked to Supabase Auth (auth.users) via id
CREATE TABLE profiles (
    id                      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email                   TEXT UNIQUE NOT NULL,
    full_name               TEXT NOT NULL,
    phone                   TEXT,
    role                    user_role NOT NULL DEFAULT 'user',
    password_change_required BOOLEAN NOT NULL DEFAULT FALSE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE profiles IS 'User profiles linked to Supabase Auth. Stores role and contact info.';
COMMENT ON COLUMN profiles.password_change_required IS 'True for seed accounts; forces password change on first login.';

-- 3.2 bpc_registrations
CREATE TABLE bpc_registrations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_name       TEXT NOT NULL,
    leader_name     TEXT NOT NULL,
    leader_email    TEXT NOT NULL,
    member_names    JSONB NOT NULL DEFAULT '[]'::jsonb,
    institution     TEXT NOT NULL,
    proposal_url    TEXT,
    stage           INTEGER NOT NULL DEFAULT 1 CHECK (stage BETWEEN 1 AND 3),
    status          registration_status NOT NULL DEFAULT 'pending',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE bpc_registrations IS 'Business Plan Competition registrations (guest, no login required).';

-- 3.3 bcc_registrations
CREATE TABLE bcc_registrations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_name       TEXT NOT NULL,
    leader_name     TEXT NOT NULL,
    leader_email    TEXT NOT NULL,
    member_names    JSONB NOT NULL DEFAULT '[]'::jsonb,
    institution     TEXT NOT NULL,
    proposal_url    TEXT,
    stage           INTEGER NOT NULL DEFAULT 1 CHECK (stage BETWEEN 1 AND 3),
    status          registration_status NOT NULL DEFAULT 'pending',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE bcc_registrations IS 'Business Case Competition registrations (guest, no login required).';

-- 3.4 seminar_registrations
CREATE TABLE seminar_registrations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name           TEXT NOT NULL,
    email               TEXT NOT NULL,
    phone               TEXT,
    institution         TEXT NOT NULL,
    ig_proof_url        TEXT,
    story_proof_url     TEXT,
    participant_type    participant_type NOT NULL DEFAULT 'general',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE seminar_registrations IS 'Seminar registrations. BPC/BCC participants auto-detected.';

-- 3.5 tenant_registrations
CREATE TABLE tenant_registrations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_name         TEXT NOT NULL,
    owner_name          TEXT NOT NULL,
    email               TEXT NOT NULL,
    phone               TEXT NOT NULL,
    category            TEXT NOT NULL,
    payment_proof_url   TEXT,
    status              registration_status NOT NULL DEFAULT 'pending',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE tenant_registrations IS 'Tenant booth registrations with payment proof upload.';

-- 3.6 transactions
CREATE TABLE transactions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID REFERENCES profiles(id) ON DELETE SET NULL,
    source_type         TEXT NOT NULL CHECK (source_type IN ('bpc', 'bcc', 'seminar', 'tenant', 'cfr', 'festival')),
    source_id           UUID,
    sub_event_type      sub_event_type NOT NULL,
    amount              NUMERIC(12, 2) NOT NULL DEFAULT 0,
    payment_proof_url   TEXT,
    participant_category TEXT DEFAULT 'Umum',
    student_id_number   TEXT,
    student_card_url    TEXT,
    status              transaction_status NOT NULL DEFAULT 'Pending',
    verified_by         UUID REFERENCES profiles(id) ON DELETE SET NULL,
    verified_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE transactions IS 'Central payment/transaction table for all sub-events.';
COMMENT ON COLUMN transactions.user_id IS 'NULL for guest registrations (BPC, BCC, Seminar, Tenant).';
COMMENT ON COLUMN transactions.source_id IS 'FK to the registration table row that triggered this transaction.';

-- 3.7 tickets
CREATE TABLE tickets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token           TEXT UNIQUE NOT NULL,
    transaction_id  UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    event_type      ticket_event_type NOT NULL,
    scan_count      INTEGER NOT NULL DEFAULT 0,
    scanned_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
    scanned_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE tickets IS 'QR tickets for Festival and CFR. Token is plain text in QR code.';
COMMENT ON COLUMN tickets.token IS 'Unique token (e.g. vts-9x8-11a) embedded in QR code.';
COMMENT ON COLUMN tickets.scan_count IS '0 = unused. >=1 triggers duplicate scan warning.';

-- 3.8 cms_settings
CREATE TABLE cms_settings (
    key         TEXT PRIMARY KEY,
    value       JSONB NOT NULL DEFAULT 'true'::jsonb,
    updated_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE cms_settings IS 'Key-value CMS configuration: registration toggles, content flags, messages.';

-- 3.9 promos
CREATE TABLE promos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title           TEXT NOT NULL,
    description     TEXT NOT NULL,
    discount_type   discount_type NOT NULL,
    discount_value  NUMERIC(12, 2) NOT NULL DEFAULT 0,
    target_event    TEXT,
    kuota_maksimal  INTEGER,
    kuota_terpakai  INTEGER NOT NULL DEFAULT 0,
    kapasitas       INTEGER NOT NULL DEFAULT 1,
    kategori_peserta TEXT DEFAULT 'Semua',
    special_terms   TEXT[] DEFAULT '{}'::TEXT[],
    terms_and_conditions TEXT[] DEFAULT '{}'::TEXT[],
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    start_date      TIMESTAMPTZ NOT NULL,
    end_date        TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE promos IS 'Promo/bundling offers displayed in User Dashboard Hot Deals.';

-- 3.10 sponsors
CREATE TABLE sponsors (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    logo_url    TEXT NOT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    "order"     INTEGER NOT NULL DEFAULT 0,
    category    TEXT NOT NULL DEFAULT 'sponsor',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE sponsors IS 'Sponsor and media partner logos for landing page display.';

-- ============================================================
-- 4. INDEXES
-- ============================================================

-- Profiles
CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_email ON profiles(email);

-- Registrations — search by email and status
CREATE INDEX idx_bpc_registrations_leader_email ON bpc_registrations(leader_email);
CREATE INDEX idx_bpc_registrations_status ON bpc_registrations(status);
CREATE INDEX idx_bcc_registrations_leader_email ON bcc_registrations(leader_email);
CREATE INDEX idx_bcc_registrations_status ON bcc_registrations(status);
CREATE INDEX idx_seminar_registrations_email ON seminar_registrations(email);
CREATE INDEX idx_tenant_registrations_email ON tenant_registrations(email);
CREATE INDEX idx_tenant_registrations_status ON tenant_registrations(status);

-- Transactions — frequently filtered by status and source
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_sub_event_type ON transactions(sub_event_type);
CREATE INDEX idx_transactions_source ON transactions(source_type, source_id);

-- Tickets — lookup by token for QR scan
CREATE INDEX idx_tickets_token ON tickets(token);
CREATE INDEX idx_tickets_user_id ON tickets(user_id);
CREATE INDEX idx_tickets_transaction_id ON tickets(transaction_id);

-- Promos — active promos filter
CREATE INDEX idx_promos_active ON promos(is_active) WHERE is_active = TRUE;

-- Sponsors — active + ordered display
CREATE INDEX idx_sponsors_active_order ON sponsors(is_active, "order") WHERE is_active = TRUE;

-- ============================================================
-- 5. HELPER FUNCTION: Generate Unique Ticket Token
-- ============================================================
-- Generates tokens in format: vts-XXXX-XXX (alphanumeric lowercase)

CREATE OR REPLACE FUNCTION generate_ticket_token()
RETURNS TEXT AS $$
DECLARE
    chars TEXT := 'abcdefghijklmnopqrstuvwxyz0123456789';
    result TEXT := 'vts-';
    i INTEGER;
BEGIN
    -- Generate first segment (4 chars)
    FOR i IN 1..4 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    result := result || '-';
    -- Generate second segment (3 chars)
    FOR i IN 1..3 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 6. TRIGGER: Auto-generate ticket when Festival/CFR transaction is Verified
-- ============================================================

CREATE OR REPLACE FUNCTION fn_auto_generate_ticket()
RETURNS TRIGGER AS $$
DECLARE
    new_token TEXT;
    token_exists BOOLEAN;
BEGIN
    -- Only fire when status changes to 'Verified' for Festival or CFR
    IF NEW.status = 'Verified'
       AND (OLD.status IS DISTINCT FROM 'Verified')
       AND NEW.sub_event_type IN ('CFR', 'FESTIVAL')
       AND NEW.user_id IS NOT NULL
    THEN
        -- Generate a unique token (retry on collision)
        LOOP
            new_token := generate_ticket_token();
            SELECT EXISTS(SELECT 1 FROM tickets WHERE token = new_token) INTO token_exists;
            EXIT WHEN NOT token_exists;
        END LOOP;

        INSERT INTO tickets (token, transaction_id, user_id, event_type)
        VALUES (
            new_token,
            NEW.id,
            NEW.user_id,
            NEW.sub_event_type::text::ticket_event_type
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_auto_generate_ticket
    AFTER UPDATE ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION fn_auto_generate_ticket();

-- ============================================================
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE bpc_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE bcc_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE seminar_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE promos ENABLE ROW LEVEL SECURITY;
ALTER TABLE sponsors ENABLE ROW LEVEL SECURITY;

-- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
-- 7.1 profiles
-- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --

-- Users can read their own profile
CREATE POLICY "Users can view own profile"
    ON profiles FOR SELECT
    USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
    ON profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles"
    ON profiles FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Allow insert during registration (service role handles seed)
CREATE POLICY "Allow insert own profile"
    ON profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

-- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
-- 7.2 Guest registration tables (BPC, BCC, Seminar, Tenant)
-- Guests can insert without login (anon); admins can read/update
-- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --

-- BPC Registrations
CREATE POLICY "Anyone can insert BPC registration"
    ON bpc_registrations FOR INSERT
    WITH CHECK (TRUE);

CREATE POLICY "Admins can view BPC registrations"
    ON bpc_registrations FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Admins can update BPC registrations"
    ON bpc_registrations FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- BCC Registrations
CREATE POLICY "Anyone can insert BCC registration"
    ON bcc_registrations FOR INSERT
    WITH CHECK (TRUE);

CREATE POLICY "Admins can view BCC registrations"
    ON bcc_registrations FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Admins can update BCC registrations"
    ON bcc_registrations FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Seminar Registrations
CREATE POLICY "Anyone can insert Seminar registration"
    ON seminar_registrations FOR INSERT
    WITH CHECK (TRUE);

CREATE POLICY "Admins can view Seminar registrations"
    ON seminar_registrations FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Admins can update Seminar registrations"
    ON seminar_registrations FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Tenant Registrations
CREATE POLICY "Anyone can insert Tenant registration"
    ON tenant_registrations FOR INSERT
    WITH CHECK (TRUE);

CREATE POLICY "Admins can view Tenant registrations"
    ON tenant_registrations FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Admins can update Tenant registrations"
    ON tenant_registrations FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
-- 7.3 transactions
-- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --

-- Anyone can insert transactions (guests for BPC/BCC/etc., users for Festival/CFR)
CREATE POLICY "Anyone can insert transactions"
    ON transactions FOR INSERT
    WITH CHECK (TRUE);

-- Users can view their own transactions
CREATE POLICY "Users can view own transactions"
    ON transactions FOR SELECT
    USING (auth.uid() = user_id);

-- Admins can view all transactions
CREATE POLICY "Admins can view all transactions"
    ON transactions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Admins can update transactions (verify/reject)
CREATE POLICY "Admins can update transactions"
    ON transactions FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
-- 7.4 tickets
-- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --

-- Users can view their own tickets
CREATE POLICY "Users can view own tickets"
    ON tickets FOR SELECT
    USING (auth.uid() = user_id);

-- Admins and Security can view all tickets
CREATE POLICY "Admins can view all tickets"
    ON tickets FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'security')
        )
    );

-- Security can update tickets (scan)
CREATE POLICY "Security can update tickets on scan"
    ON tickets FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'security')
        )
    );

-- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
-- 7.5 cms_settings
-- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --

-- Public read for CMS settings (needed for registration toggle checks)
CREATE POLICY "Anyone can read CMS settings"
    ON cms_settings FOR SELECT
    USING (TRUE);

-- Only admins can update CMS settings
CREATE POLICY "Admins can update CMS settings"
    ON cms_settings FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Only admins can insert CMS settings
CREATE POLICY "Admins can insert CMS settings"
    ON cms_settings FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
-- 7.6 promos
-- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --

-- Public read for active promos (displayed in User Dashboard Hot Deals)
CREATE POLICY "Anyone can read active promos"
    ON promos FOR SELECT
    USING (TRUE);

-- Only admins can manage promos
CREATE POLICY "Admins can insert promos"
    ON promos FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Admins can update promos"
    ON promos FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Admins can delete promos"
    ON promos FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
-- 7.7 sponsors
-- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --

-- Public read for active sponsors (landing page)
CREATE POLICY "Anyone can read sponsors"
    ON sponsors FOR SELECT
    USING (TRUE);

-- Only admins can manage sponsors
CREATE POLICY "Admins can insert sponsors"
    ON sponsors FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Admins can update sponsors"
    ON sponsors FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Admins can delete sponsors"
    ON sponsors FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- ============================================================
-- 8. TRIGGER: Auto-create profile on Supabase Auth signup
-- ============================================================

CREATE OR REPLACE FUNCTION fn_handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO profiles (id, email, full_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'user')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION fn_handle_new_user();

-- ============================================================
-- 9. SEED DATA
-- ============================================================

-- 9.1 CMS Settings defaults
-- All registration toggles set to open; neutral closed message
INSERT INTO cms_settings (key, value) VALUES
    ('gateways', '{"bpc": true, "bcc": true, "seminar": true, "tenant": true, "cfr": true, "festival": true}'::jsonb),
    ('registration_open_festival', 'true'::jsonb),
    ('registration_open_cfr', 'true'::jsonb),
    ('registration_open_seminar', 'true'::jsonb),
    ('registration_open_bcc', 'true'::jsonb),
    ('registration_open_bpc', 'true'::jsonb),
    ('registration_open_tenant', 'true'::jsonb),
    ('registration_closed_message', '"Pendaftaran telah ditutup. Terima kasih atas antusiasme Anda!"'::jsonb),
    ('event_details', 'true'::jsonb),
    ('countdown', 'true'::jsonb),
    ('sponsors_list', 'true'::jsonb),
    ('pricing_tiers', '{"festival": {"phase": "Presale 2", "price": 75000}, "colorfun": {"phase": "Normal Price", "price": 75000}, "seminar": {"phase": "Normal Price", "price": 10000}, "bcc": {"phase": "Batch 1", "price": 79000}, "bpc": {"phase": "Batch 1", "price": 79000}, "tenant": {"phase": "Regular", "price": 10000}}'::jsonb);

-- 9.2 Seed Admin & Security accounts
-- NOTE: These accounts must be created via Supabase Auth API (signUp) or
-- Supabase Dashboard > Authentication > Users. After creating the auth users,
-- update their profiles with the commands below.
--
-- IMPORTANT: Run the following AFTER creating the auth users via Supabase Auth.
-- Replace '<ADMIN_AUTH_UUID>' and '<SECURITY_AUTH_UUID>' with the actual UUIDs
-- generated by Supabase Auth when you create these users.
--
-- Step 1: Create users in Supabase Dashboard > Authentication > Users:
--   - Email: admin@voitsfest.id     | Password: VoitsAdmin2025!
--   - Email: security@voitsfest.id  | Password: V0itsSecurity!2025
--
-- Step 2: After creating, get their UUIDs and run:
--
-- UPDATE profiles
-- SET role = 'admin',
--     password_change_required = TRUE,
--     full_name = 'Admin VOITSFEST'
-- WHERE email = 'admin@voitsfest.id';
--
-- UPDATE profiles
-- SET role = 'security',
--     password_change_required = TRUE,
--     full_name = 'Security VOITSFEST'
-- WHERE email = 'security@voitsfest.id';

-- ============================================================
-- 10. STORAGE BUCKETS (run separately or via Supabase Dashboard)
-- ============================================================
-- Create the following storage buckets in Supabase Dashboard > Storage:
--
-- 1. "payment-proofs"  — for transaction payment proof uploads
-- 2. "proposals"       — for BPC/BCC proposal uploads
-- 3. "sponsor-logos"   — for sponsor logo uploads
--
-- Set appropriate RLS policies for each bucket:
--   - payment-proofs: authenticated users can upload; admins can read all
--   - proposals: anon/authenticated can upload; admins can read all
--   - sponsor-logos: admins can upload/read; public can read active ones

-- ============================================================
-- 11. DYNAMIC SPECIAL REQUIREMENTS & PROOFS
-- ============================================================
-- Alter promos table for special terms and proof upload requirements
ALTER TABLE public.promos ADD COLUMN IF NOT EXISTS special_terms TEXT[] DEFAULT '{}'::TEXT[];
ALTER TABLE public.promos ADD COLUMN IF NOT EXISTS terms_and_conditions TEXT[] DEFAULT '{}'::TEXT[];
ALTER TABLE public.promos ADD COLUMN IF NOT EXISTS requires_proof_file BOOLEAN DEFAULT false;
ALTER TABLE public.promos ADD COLUMN IF NOT EXISTS proof_instructions TEXT;

-- Alter registration tables for promo proof storage URL
ALTER TABLE public.colorfun_registrations ADD COLUMN IF NOT EXISTS promo_proof_url TEXT;
ALTER TABLE public.festival_registrations ADD COLUMN IF NOT EXISTS promo_proof_url TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS promo_proof_url TEXT;

-- Dedicated Supabase Storage bucket for promo proof files
INSERT INTO storage.buckets (id, name, public)
VALUES ('promo_proofs', 'promo_proofs', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public Select Promo Proofs" 
ON storage.objects FOR SELECT 
TO public 
USING (bucket_id = 'promo_proofs');

CREATE POLICY "Public Insert Promo Proofs" 
ON storage.objects FOR INSERT 
TO public 
WITH CHECK (bucket_id = 'promo_proofs');


