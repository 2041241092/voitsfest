import CustomHeading from "@/components/ui/CustomHeading";

export default function JourneyMap() {
  return (
    <section className="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-section-gap relative z-10 overflow-hidden">
      {/* Curated Atmospheric Accents (Depth of Field & Safe Inset Positioning) */}
      <div className="absolute inset-0 pointer-events-none select-none overflow-hidden -z-10">
        {/* Cosmic Planet: Upper Right Safe Inset */}
        <img
          src="/3.png"
          alt=""
          aria-hidden="true"
          className="absolute top-[6%] right-[6%] lg:right-[9%] w-36 sm:w-48 lg:w-56 h-auto opacity-45 animate-float-slow hidden md:block"
        />

        {/* Floating Asteroid: Mid-Left Safe Inset */}
        <img
          src="/49.png"
          alt=""
          aria-hidden="true"
          className="absolute top-[38%] left-[4%] lg:left-[8%] w-20 sm:w-28 lg:w-32 h-auto opacity-50 animate-drift-subtle hidden lg:block"
          style={{ animationDelay: "2s" }}
        />

        {/* Warm Stardust Glow: Lower Left Safe Inset */}
        <img
          src="/37.png"
          alt=""
          aria-hidden="true"
          className="absolute bottom-[8%] left-[6%] lg:left-[10%] w-48 sm:w-60 lg:w-72 h-auto opacity-40 animate-float-reverse hidden md:block"
          style={{ animationDelay: "1s" }}
        />
      </div>

      <CustomHeading 
        as="h2" 
        text="Journey Map" 
        className="font-headline-lg text-headline-lg text-amber-400 mb-stack-lg text-center drop-shadow-[0_4px_12px_rgba(0,0,0,0.9)] drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] [text-shadow:0_3px_12px_rgba(0,0,0,0.9),0_0_20px_rgba(245,158,11,0.4)]" 
      />
      <div className="relative max-w-container-max mx-auto py-10">
        <div className="relative flex flex-col gap-12 md:gap-16">
          {/* Timeline Connector Line */}
          <div 
            className="absolute left-6 md:left-1/2 top-[60px] bottom-[60px] w-[2px] bg-gradient-to-b from-primary/30 via-primary/60 to-primary/40 -translate-x-1/2"
            aria-hidden="true"
          />

          {/* Milestone 1: Entrepreneurship Seminar (Left) */}
          <div className="flex flex-col md:flex-row items-center w-full relative group">
            <div className="w-full pl-12 sm:pl-14 md:pl-0 md:w-1/2 md:pr-12 flex justify-start md:justify-end">
              <div className="bg-slate-950/45 backdrop-blur-lg p-6 rounded-xl border border-white/10 hover:border-primary/40 shadow-[0_4px_20px_rgba(0,0,0,0.4)] transition-all duration-300 text-center w-full md:w-[400px] min-h-[120px] flex flex-col justify-center">
                <span className="text-[11px] font-bold uppercase tracking-widest text-amber-400/90 mb-1">Milestone 1</span>
                <h4 className="font-headline-md text-amber-300 font-bold mb-1 drop-shadow-sm">Entrepreneurship Seminar</h4>
                <p className="font-body-md text-slate-200/90 text-sm font-medium">September 2026</p>
              </div>
            </div>
            <div className="absolute left-6 md:left-1/2 -translate-x-1/2 flex items-center justify-center top-1/2 -translate-y-1/2 z-10">
              <div className="w-4 h-4 rounded-full bg-primary shadow-[0_0_15px_rgba(240,192,77,0.9)] ring-4 ring-slate-950"></div>
            </div>
            <div className="hidden md:block md:w-1/2"></div>
          </div>
          
          {/* Milestone 2: Tenant Registration (Right) */}
          <div className="flex flex-col md:flex-row items-center w-full relative group">
            <div className="hidden md:block md:w-1/2"></div>
            <div className="absolute left-6 md:left-1/2 -translate-x-1/2 flex items-center justify-center top-1/2 -translate-y-1/2 z-10">
              <div className="w-4 h-4 rounded-full bg-primary shadow-[0_0_15px_rgba(240,192,77,0.9)] ring-4 ring-slate-950"></div>
            </div>
            <div className="w-full pl-12 sm:pl-14 md:pl-12 md:w-1/2 flex justify-start">
              <div className="bg-slate-950/45 backdrop-blur-lg p-6 rounded-xl border border-white/10 hover:border-primary/40 shadow-[0_4px_20px_rgba(0,0,0,0.4)] transition-all duration-300 text-center w-full md:w-[400px] min-h-[120px] flex flex-col justify-center">
                <span className="text-[11px] font-bold uppercase tracking-widest text-amber-400/90 mb-1">Milestone 2</span>
                <h4 className="font-headline-md text-amber-300 font-bold mb-1 drop-shadow-sm">Tenant Registration</h4>
                <p className="font-body-md text-slate-200/90 text-sm font-medium">August - September 2026</p>
              </div>
            </div>
          </div>
          
          {/* Milestone 3: ColorFun Run (Left) */}
          <div className="flex flex-col md:flex-row items-center w-full relative group">
            <div className="w-full pl-12 sm:pl-14 md:pl-0 md:w-1/2 md:pr-12 flex justify-start md:justify-end">
              <div className="bg-slate-950/45 backdrop-blur-lg p-6 rounded-xl border border-white/10 hover:border-primary/40 shadow-[0_4px_20px_rgba(0,0,0,0.4)] transition-all duration-300 text-center w-full md:w-[400px] min-h-[120px] flex flex-col justify-center">
                <span className="text-[11px] font-bold uppercase tracking-widest text-amber-400/90 mb-1">Milestone 3</span>
                <h4 className="font-headline-md text-amber-300 font-bold mb-1 drop-shadow-sm">ColorFun Run</h4>
                <p className="font-body-md text-slate-200/90 text-sm font-medium">Oktober 2026</p>
              </div>
            </div>
            <div className="absolute left-6 md:left-1/2 -translate-x-1/2 flex items-center justify-center top-1/2 -translate-y-1/2 z-10">
              <div className="w-4 h-4 rounded-full bg-primary shadow-[0_0_15px_rgba(240,192,77,0.9)] ring-4 ring-slate-950"></div>
            </div>
            <div className="hidden md:block md:w-1/2"></div>
          </div>
          
          {/* Milestone 4: Festival (Main Event) (Right) */}
          <div className="flex flex-col md:flex-row items-center w-full relative group">
            <div className="hidden md:block md:w-1/2"></div>
            <div className="absolute left-6 md:left-1/2 -translate-x-1/2 flex items-center justify-center top-1/2 -translate-y-1/2 z-10">
              <div className="w-6 h-6 rounded-full bg-primary shadow-[0_0_25px_rgba(240,192,77,1)] ring-4 ring-slate-950 animate-pulse"></div>
            </div>
            <div className="w-full pl-12 sm:pl-14 md:pl-12 md:w-1/2 flex justify-start">
              <div className="bg-slate-950/60 backdrop-blur-lg p-6 rounded-xl border border-primary/40 hover:border-primary/70 shadow-[0_0_25px_rgba(240,192,77,0.35)] transition-all duration-300 text-center w-full md:w-[400px] min-h-[120px] flex flex-col justify-center">
                <span className="text-[11px] font-bold uppercase tracking-widest text-amber-400/90 mb-1">Milestone 4</span>
                <h4 className="font-headline-md text-amber-300 font-bold mb-1 text-glow drop-shadow-md">Festival (Main Event)</h4>
                <p className="font-body-md text-slate-100 text-sm font-medium">Oktober 2026</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
