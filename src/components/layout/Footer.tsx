import Link from "next/link";
import Image from "next/image";
import CustomHeading from "@/components/ui/CustomHeading";
import { ExternalLink } from "lucide-react";

export default function Footer() {
  return (
    <footer className="w-full rounded-t-[40px] mt-section-gap relative z-20 text-on-background bg-surface-container-lowest bg-gradient-to-t from-background/80 to-transparent py-10 overflow-hidden">
      <img 
        src="https://lh3.googleusercontent.com/aida-public/AB6AXuBxfseeMoK0lqJiYBHHuMdDBbk2ZuoBX5-p1Zm40exNmVIDDR7ne-i8QFEVEfccgwuUsqCKDdjtfKm79J3pEIe5jQ4bmiyl7h4AsRMUAtDYDrc3tOXGRDiFe39IbK_ExL_3wqKy2ptjfPiIvxVfpJbw49y3ZtZa3M5yhg2_xrzWJQr_PGMktwpnHrx0E8UvJYsdUoy-Z8T95eRjtr7g2u131yajhYATRyYO7Zbr5cTtTxmizrWFIOsV8CHu8KFUr1gavA" 
        alt="Bintang-Bintang Presisi" 
        className="absolute inset-0 w-full h-full object-cover opacity-30 z-0 pointer-events-none" 
      />
      <div className="absolute inset-0 z-[-1] overflow-hidden pointer-events-none w-full h-full"></div>
      
      <div className="max-w-container-max mx-auto grid grid-cols-1 md:grid-cols-12 gap-12 py-10 px-margin-mobile md:px-margin-desktop relative z-10">
        {/* Left Column */}
        <div className="md:col-span-5 flex flex-col">
          <div className="flex items-center mb-6">
            <CustomHeading as="span" text="VOITSFEST" className="font-headline-lg text-headline-lg text-on-surface tracking-tighter" />
            <span className="text-primary font-headline-lg text-headline-lg">.</span>
          </div>
          <p className="font-body-md leading-relaxed mb-8 max-w-md text-on-surface/80">
            VOITSFEST adalah signature event unggulan dari Fakultas Vokasi ITS. Ajang kolaborasi inovasi, kreativitas, dan ekonomi kreatif yang berkelanjutan bagi seluruh civitas akademika dan masyarakat umum.
          </p>
          <div className="flex space-x-4">
            <a 
              href="https://www.instagram.com/voitsfest?stkn=MTZpbGt5Mm1vMmJoZw=="
              target="_blank"
              rel="noopener noreferrer"
              aria-label="VOITSFEST on Instagram"
              className="w-10 h-10 rounded-full border flex items-center justify-center overflow-hidden transition-all hover:bg-on-surface/10 hover:border-primary border-primary/50 bg-on-surface/5"
            >
              <img alt="Instagram" className="w-full h-full object-contain p-1" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBTl2UmqpxIGwKZRj4YRh0VfCk0rzWtcTEDRTABCFuE3PDWh6v-8oYCCthi8glenQHMm6XTLpxa5a4cB9Qc8lzNVq-o2nuXDpIuMpjfBYSkdgs-4l5JQbsX98TXCdsb7UPRJVCIHSVtYsa4jQhNOfinSwpp9cRchV3q8yv0_kXM_acM6RdVSl2qAJqcBbcAxKlYMjWJ3mes6H3BV2LhZPQ38jL2ALBlTPZEny0AmoLOlC_RUhdzXR7L-JBugVZwvI6jXpY" />
            </a>
            <a 
              href="https://www.linkedin.com/company/vocation-its-festival/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="VOITSFEST on LinkedIn"
              className="w-10 h-10 rounded-full border flex items-center justify-center overflow-hidden transition-all hover:bg-on-surface/10 hover:border-primary border-primary/50 bg-on-surface/5"
            >
              <img alt="LinkedIn" className="w-full h-full object-contain p-1" src="https://lh3.googleusercontent.com/aida-public/AB6AXuChtDlwwC1tu3mFI1n0MivSKcB_MeEneaMMfmazYFYn3N5c80VPBz2LzJToWpSctvnrDsAZwXr3Dyt20RERGdmGYmoM7UVqVp35X95w4qiAOlRZrGir5ut1BwL71Z4fEUAZ1VZhwp5K09MvQYMbkLGELQ5FVx0hQFt4GS2ViAYtvqoLE2GEAmtFAkoa2y3cxoXOIacf29nig3UPi5tmTPqDtzcHtwtZZ4Hr5yb8kRPW3NtUyuPoNdAzbvZ6V54TjchqwOk" />
            </a>
            <a 
              href="https://www.tiktok.com/@voitsfest?_r=1&_t=ZS-99fVr9UI30P"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="VOITSFEST on TikTok"
              className="w-10 h-10 rounded-full border flex items-center justify-center overflow-hidden transition-all hover:bg-on-surface/10 hover:border-primary border-primary/50 bg-on-surface/5"
            >
              <img alt="TikTok" className="w-full h-full object-contain p-1" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDMh7hiA86g1A5Yr-MNdOUAHmdXwoQhMtF3aHS4_jOsOLv6C1F0PweAe_s7qFTBwAJhfXCU1bCdCXMyrtgVEO9QGE_4HznGv7JYHTeYkgygfffgSqjEsYVko14LB3MB5KsGhelKDMi3q9WohafBNokWkb6FZ_hQPASYs7RWO-cv6gu110Q52ClnBaPBWtPo1MpX82g6-3Ef4V4qvSk2bm6PV7Sr-g_NwVW1lHisW9wv5lo26nazT1g8V2rEIfGVoYIeGRg" />
            </a>
          </div>
        </div>
        
        {/* Middle Column */}
        <div className="md:col-span-3">
          <CustomHeading as="h4" text="Events" className="text-label-sm uppercase mb-6 tracking-widest text-on-background font-bold text-primary-fixed" />
          <ul className="space-y-4">
            <li><Link className="transition-colors font-body-md hover:text-primary text-on-surface" href="/seminar/register">Entrepreneurship Seminar</Link></li>
            <li><Link className="transition-colors font-body-md hover:text-primary text-on-surface" href="/colorfun">ColorFun Run</Link></li>
            <li><Link className="transition-colors font-body-md hover:text-primary text-on-surface" href="/festival">Festival</Link></li>
            <li><Link className="transition-colors font-body-md hover:text-primary text-on-surface" href="#">FAQ</Link></li>
          </ul>
        </div>
        
        {/* Right Column */}
        <div className="md:col-span-4">
          <CustomHeading as="h4" text="Reach Us" className="text-label-sm uppercase mb-6 tracking-widest text-on-background font-bold text-primary-fixed" />
          <ul className="space-y-4">
            <li className="font-body-md text-on-surface">voitsfest2026@gmail.com</li>
            <li>
              <a
                href="https://its.id/m/CHANNELVOITSFEST2026"
                target="_blank"
                rel="noopener noreferrer"
                className="font-body-md text-on-surface hover:text-emerald-400 transition-colors inline-flex items-center gap-1.5 group"
              >
                <span>Join Our Channel</span>
                <ExternalLink className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 transition-opacity" />
              </a>
            </li>
            <li className="font-body-md text-on-surface">
              Fakultas Vokasi,<br />
              Institut Teknologi Sepuluh Nopember
            </li>
          </ul>
        </div>
      </div>
      
      <div className="max-w-container-max mx-auto border-t border-on-surface/10 pt-8 pb-4 flex flex-col md:flex-row justify-between items-center px-margin-mobile md:px-margin-desktop relative z-10">
        <p className="font-poppins text-label-sm uppercase tracking-widest mb-4 md:mb-0 text-on-surface/60">
          © 2026 VOITSFEST. ALL RIGHTS RESERVED.
        </p>
      </div>
    </footer>
  );
}
