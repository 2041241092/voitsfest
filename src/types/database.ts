// Database types matching the Supabase schema

export type UserRole = "user" | "admin" | "security";
export type RegistrationStatus = "pending" | "approved" | "rejected";
export type TransactionStatus = "Pending" | "Verified" | "Rejected";
export type SubEventType = "BPC" | "BCC" | "SEMINAR" | "TENANT" | "CFR" | "FESTIVAL";
export type DiscountType = "percent" | "nominal" | "bundling";
export type ParticipantType = "bpc" | "bcc" | "general";
export type TicketEventType = "CFR" | "FESTIVAL";

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: UserRole;
  password_change_required: boolean;
  created_at: string;
}

export interface BpcRegistration {
  id: string;
  team_name: string;
  leader_name: string;
  leader_email: string;
  member_names: string[];
  institution: string;
  proposal_url: string | null;
  stage: number;
  status: RegistrationStatus;
  created_at: string;
}

export interface BccRegistration {
  id: string;
  team_name: string;
  leader_name: string;
  leader_email: string;
  member_names: string[];
  institution: string;
  proposal_url: string | null;
  stage: number;
  status: RegistrationStatus;
  created_at: string;
}

export interface SeminarRegistration {
  id: string;
  full_name: string;
  email: string;
  institution: string;
  participant_type: ParticipantType;
  created_at: string;
}

export interface TenantRegistration {
  id: string;
  tenant_name: string;
  owner_name: string;
  email: string;
  phone: string;
  category: string;
  payment_proof_url: string | null;
  status: RegistrationStatus;
  created_at: string;
}

export interface Transaction {
  id: string;
  user_id: string | null;
  source_type: string;
  source_id: string | null;
  sub_event_type: SubEventType;
  amount: number;
  payment_proof_url: string | null;
  status: TransactionStatus;
  verified_by: string | null;
  verified_at: string | null;
  created_at: string;
  participant_category?: string;
  student_id_number?: string | null;
  student_card_url?: string | null;
  promo_id?: string | null;
  promo_proof_url?: string | null;
}

export interface Ticket {
  id: string;
  token: string;
  transaction_id: string;
  user_id: string;
  event_type: TicketEventType;
  scan_count: number;
  scanned_by: string | null;
  scanned_at: string | null;
  created_at: string;
  payment_status?: string | null;
  amount_paid?: number | null;
  ticket_phase?: string | null;
  nomor_bib?: number | null;
  group_id?: string | null;
  is_primary?: boolean | null;
  promo_id?: string | null;
  nama_lengkap?: string | null;
  email?: string | null;
  whatsapp?: string | null;
}

export interface ColorFunRegistration {
  id: string;
  user_id: string | null;
  nama_lengkap: string;
  whatsapp: string;
  email: string;
  kategori_peserta: string;
  nomor_bib?: number | null;
  group_id?: string | null;
  is_primary: boolean;
  ticket_phase?: string | null;
  promo_id?: string | null;
  amount_paid: number;
  payment_status: string;
  bukti_transfer_url?: string | null;
  promo_proof_url?: string | null;
  ktm_url?: string | null;
  created_at: string;
}

export interface FestivalRegistration {
  id: string;
  user_id: string | null;
  nama_lengkap: string;
  whatsapp: string;
  email: string;
  kategori_peserta: string;
  nomor_bib?: number | null;
  group_id?: string | null;
  is_primary: boolean;
  ticket_phase?: string | null;
  promo_id?: string | null;
  amount_paid: number;
  payment_status: string;
  bukti_transfer_url?: string | null;
  promo_proof_url?: string | null;
  ktm_url?: string | null;
  created_at: string;
}

export interface CmsSetting {
  key: string;
  value: unknown;
  updated_by: string | null;
  updated_at: string;
}

export interface Promo {
  id: string;
  title: string;
  description: string;
  discount_type: DiscountType;
  discount_value: number;
  is_active: boolean;
  start_date: string;
  end_date: string;
  created_at: string;
  target_event?: string | null;
  kuota_maksimal?: number | null;
  kuota_terpakai?: number | null;
  kapasitas?: number | null;
  kategori_peserta?: "Semua" | "Umum" | "Mahasiswa ITS" | string | null;
  special_terms?: string[] | string | null;
  terms_and_conditions?: string[] | string | null;
  requires_proof_file?: boolean | null;
  proof_instruction?: string | null;
  proof_instructions?: string | null;
}

export interface ExtraParticipant {
  nama_lengkap: string;
  whatsapp: string;
  email: string;
  kategori_peserta: "Umum" | "Mahasiswa ITS";
  departemen?: string | null;
  nrp?: string | null;
  ktm_url?: string | null;
}

export interface Sponsor {
  id: string;
  name: string;
  logo_url: string;
  website_url?: string | null;
  type?: "Sponsor" | "Media Partner" | string | null;
  is_active: boolean;
  order: number;
  category?: "sponsor" | "media_partner" | string;
  created_at: string;
}

