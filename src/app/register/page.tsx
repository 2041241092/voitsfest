"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import CustomHeading from "@/components/ui/CustomHeading";
import Link from "next/link";
import { Rocket, Eye, EyeOff, Loader2 } from "lucide-react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    whatsapp: "",
    password: "",
    confirmPassword: ""
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  
  const router = useRouter();
  const supabase = createClient();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    setSuccessMsg(null);

    if (formData.password !== formData.confirmPassword) {
      setError("Kata sandi tidak cocok (Passwords do not match).");
      setIsSubmitting(false);
      return;
    }

    if (formData.password.length < 8) {
      setError("Kata sandi minimal 8 karakter.");
      setIsSubmitting(false);
      return;
    }

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.fullName,
            whatsapp_number: formData.whatsapp
          }
        }
      });

      if (signUpError) {
        setError(signUpError.message);
        setIsSubmitting(false);
      } else {
        setSuccessMsg("Pendaftaran berhasil! Silakan periksa email Anda (jika verifikasi diaktifkan) atau login.");
        setTimeout(() => {
          router.push("/login");
        }, 2000);
      }
    } catch (err: any) {
      setError(err?.message || "Terjadi kesalahan saat memproses pendaftaran.");
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Navbar />
      <main className="flex-grow pt-[120px] pb-20 px-4 md:px-12 max-w-[1280px] mx-auto w-full relative z-10 font-poppins">
        <div className="text-center mb-12">
          <CustomHeading 
            text="Buat Akun Cosmic" 
            className="text-4xl md:text-[72px] text-on-background mb-4 justify-center drop-shadow-[0_4px_12px_rgba(0,0,0,0.9)] drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] [text-shadow:0_3px_12px_rgba(0,0,0,0.85),0_0_20px_rgba(0,0,0,0.6)]" 
          />
          <p className="text-lg text-primary-fixed-dim max-w-2xl mx-auto drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] [text-shadow:0_2px_8px_rgba(0,0,0,0.9)]">
            Bergabunglah dalam perjalanan kosmik VOITSFEST 2026. Lengkapi data diri Anda untuk memulai.
          </p>
        </div>

        <div className="bg-slate-950/60 backdrop-blur-xl border border-white/10 shadow-[0_4px_25px_rgba(0,0,0,0.5)] rounded-2xl p-6 md:p-12 w-full max-w-2xl mx-auto">
          <form onSubmit={handleRegister} className="space-y-8 max-w-md mx-auto">
            
            {error && (
              <div className="bg-error-container/30 border border-error/50 text-error px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}
            
            {successMsg && (
              <div className="bg-tertiary-container/30 border border-tertiary/50 text-tertiary px-4 py-3 rounded-lg text-sm">
                {successMsg}
              </div>
            )}

            <div className="space-y-2">
              <label className="font-semibold text-sm text-slate-100 uppercase tracking-wider">Nama Lengkap</label>
              <input 
                type="text" 
                required
                value={formData.fullName}
                onChange={e => setFormData({...formData, fullName: e.target.value})}
                className="w-full bg-black/30 border border-white/10 rounded-lg px-6 py-3 text-white placeholder:text-slate-400 focus:border-secondary focus:ring-1 focus:ring-secondary focus:outline-none transition-all"
                placeholder="Masukkan nama lengkap" 
              />
              <p className="text-[12px] text-slate-400">
                Gunakan nama asli sesuai KTP/KTM. Nama ini akan tertera pada tiket Anda.
              </p>
            </div>

            <div className="space-y-2">
              <label className="font-semibold text-sm text-slate-100 uppercase tracking-wider">Email Aktif</label>
              <input 
                type="email" 
                required
                value={formData.email}
                onChange={e => setFormData({...formData, email: e.target.value})}
                className="w-full bg-black/30 border border-white/10 rounded-lg px-6 py-3 text-white placeholder:text-slate-400 focus:border-secondary focus:ring-1 focus:ring-secondary focus:outline-none transition-all"
                placeholder="contoh@email.com" 
              />
            </div>

            <div className="space-y-2">
              <label className="font-semibold text-sm text-slate-100 uppercase tracking-wider">Nomor WhatsApp Aktif</label>
              <input 
                type="tel" 
                required
                value={formData.whatsapp}
                onChange={e => setFormData({...formData, whatsapp: e.target.value})}
                className="w-full bg-black/30 border border-white/10 rounded-lg px-6 py-3 text-white placeholder:text-slate-400 focus:border-secondary focus:ring-1 focus:ring-secondary focus:outline-none transition-all"
                placeholder="08xxxxxxxxxx" 
              />
            </div>

            <div className="space-y-2">
              <label className="font-semibold text-sm text-slate-100 uppercase tracking-wider">Kata Sandi (Password)</label>
              <div className="relative">
                <input 
                  type={showPassword ? "text" : "password"} 
                  required
                  value={formData.password}
                  onChange={e => setFormData({...formData, password: e.target.value})}
                  className="w-full bg-black/30 border border-white/10 rounded-lg px-6 py-3 text-white placeholder:text-slate-400 focus:border-secondary focus:ring-1 focus:ring-secondary focus:outline-none transition-all pr-12"
                  placeholder="••••••••" 
                />
                <button 
                  type="button" 
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              <p className="text-[12px] text-slate-400">Minimal 8 karakter</p>
            </div>

            <div className="space-y-2">
              <label className="font-semibold text-sm text-slate-100 uppercase tracking-wider">Konfirmasi Kata Sandi</label>
              <input 
                type={showPassword ? "text" : "password"} 
                required
                value={formData.confirmPassword}
                onChange={e => setFormData({...formData, confirmPassword: e.target.value})}
                className="w-full bg-black/30 border border-white/10 rounded-lg px-6 py-3 text-white placeholder:text-slate-400 focus:border-secondary focus:ring-1 focus:ring-secondary focus:outline-none transition-all"
                placeholder="••••••••" 
              />
            </div>

            <div className="pt-6 space-y-4">
              <button 
                type="submit" 
                disabled={isSubmitting}
                className={`w-full bg-tertiary text-primary-container font-bold px-8 py-3 rounded-full hover:shadow-[0_0_15px_rgba(230,191,160,0.5)] transition-all uppercase flex items-center justify-center gap-2 ${
                  isSubmitting
                    ? "opacity-60 cursor-not-allowed pointer-events-none"
                    : "cursor-pointer"
                }`}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Memproses Pendaftaran...</span>
                  </>
                ) : (
                  <>Buat Akun Cosmic <Rocket className="w-5 h-5" /></>
                )}
              </button>
              
              <div className="text-center">
                <Link href="/login" className="text-sm text-on-surface-variant hover:text-tertiary transition-colors">
                  Sudah punya tiket/akun? <span className="text-tertiary font-bold">Masuk di sini</span>
                </Link>
              </div>
            </div>
          </form>
        </div>
      </main>
      <Footer />
    </>
  );
}
