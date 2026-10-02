import CustomHeading from "@/components/ui/CustomHeading";
import { MessageSquare, Store, Footprints, Tent } from "lucide-react";

export default function CelestialEvents() {
  return (
    <section className="max-w-[100vw] mx-auto py-section-gap overflow-hidden w-full relative z-10">
      {/* Curated Atmospheric Accents (Depth of Field & Safe Inset Positioning) */}
      <div className="absolute inset-0 pointer-events-none select-none overflow-hidden -z-10">
        {/* Violet Cosmic Planet: Upper Left Safe Inset */}
        <img
          src="/7.png"
          alt=""
          aria-hidden="true"
          className="absolute top-[6%] left-[6%] lg:left-[9%] w-36 sm:w-48 lg:w-56 h-auto opacity-45 animate-float-slow hidden md:block"
        />

        {/* Golden Solar Aura / Stardust: Bottom-Center Safe Inset */}
        <img
          src="/34.png"
          alt=""
          aria-hidden="true"
          className="absolute bottom-[8%] left-1/2 -translate-x-1/2 w-52 sm:w-68 lg:w-80 h-auto opacity-40 animate-float-subtle hidden sm:block"
          style={{ animationDelay: "2s" }}
        />

        {/* Floating Asteroid Fragment: Lower Right Safe Inset */}
        <img
          src="/50.png"
          alt=""
          aria-hidden="true"
          className="absolute bottom-[10%] right-[6%] lg:right-[10%] w-20 sm:w-28 lg:w-32 h-auto opacity-50 animate-drift-subtle hidden lg:block"
          style={{ animationDelay: "3.5s" }}
        />
      </div>

      <CustomHeading 
        as="h2" 
        text="Our Events" 
        className="font-headline-lg text-headline-lg text-amber-400 mb-stack-lg text-center drop-shadow-[0_4px_12px_rgba(0,0,0,0.9)] drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] [text-shadow:0_3px_12px_rgba(0,0,0,0.9),0_0_20px_rgba(245,158,11,0.4)]" 
      />
      <div className="relative group py-10 w-full flex overflow-hidden max-w-container-max mx-auto">
        <div className="scroll-track">
          <div className="flex gap-gutter pr-[24px] shrink-0">
            {/* Entrepreneurship Seminar */}
            <div className="bg-slate-950/45 backdrop-blur-lg rounded-2xl p-stack-lg border border-white/10 shadow-[0_4px_20px_rgba(0,0,0,0.4)] hover:border-white/20 glow-effect group cursor-pointer w-[300px] md:w-[400px] flex-shrink-0 flex flex-col transition-all duration-300">
              <div className="w-full h-48 mb-6 rounded-xl overflow-hidden relative">
                <img alt="Bright Constellation Komet" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" src="https://lh3.googleusercontent.com/aida-public/AB6AXuB_yNY2ldi60fTsNdDxYI1Pw3lj0gDaKyq4eP2WblfqEAxaov-acm5DkwMLDzaLQmji4sbBlmhfVeXKjgPOPMEBBeipTlTCl-5t360EtdHJaMDhPsJLe9M4tP9YYuMN0FOgvFe9F1lAC3gXEpTfbqH29R-A56r-QF4VtqO2abl5ZlZcZcJvHBvdPQlnhAAl5uUKqe_HiNKjYr-ZKWTPXcSktoDV4huHKU3xtj7KIMIfvPFyOH5KNxQ5lOqs6z_Gr3A38w" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 to-transparent"></div>
              </div>
              <div className="flex items-center space-x-4 mb-stack-md">
                <MessageSquare className="w-9 h-9 text-secondary-fixed" />
                <h3 className="font-headline-md text-headline-md text-slate-100 group-hover:text-amber-300 transition-colors font-bold drop-shadow-sm">Entrepreneurship Seminar</h3>
              </div>
              <p className="font-body-md text-slate-200/90 leading-relaxed">Insights from industry stars and tech constellations.</p>
            </div>
            
            {/* Tenant Registration */}
            <div className="bg-slate-950/45 backdrop-blur-lg rounded-2xl p-stack-lg border border-white/10 shadow-[0_4px_20px_rgba(0,0,0,0.4)] hover:border-white/20 glow-effect group cursor-pointer w-[300px] md:w-[400px] flex-shrink-0 flex flex-col transition-all duration-300">
              <div className="w-full h-48 mb-6 rounded-xl overflow-hidden relative">
                <img alt="Bazaar Market Asset BATU" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCTJ2i8nt5ctaRAUQGuz3DewKNCVam_SNOQkdP6QLcJilUUvY-CLXA3FkcYbfAIxamnHyo7yUn5JilXW2MQGO4ArQa3o1lrw0L5_09VxXomwNmrpzbQHyxmuKFi4xE8rBTnREvXmFafEGUcrXoz9LS-7HQsAmWMFlqXpWC0cx4mRu1KqRTup0HqTzpyHIBig677LObYuZWNhuj3UR23EV4iNWZtS68rwVNpwQeykJPnSqXUNlkwwLcgoimvniziAnecmA" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 to-transparent"></div>
              </div>
              <div className="flex items-center space-x-4 mb-stack-md">
                <Store className="w-9 h-9 text-secondary-fixed" />
                <h3 className="font-headline-md text-headline-md text-slate-100 group-hover:text-amber-300 transition-colors font-bold drop-shadow-sm">Tenant Registration</h3>
              </div>
              <p className="font-body-md text-slate-200/90 leading-relaxed">Explore earthly delights and secure your cosmic merchandise spot.</p>
            </div>
            
            {/* ColorFun Run */}
            <div className="bg-slate-950/45 backdrop-blur-lg rounded-2xl p-stack-lg border border-white/10 shadow-[0_4px_20px_rgba(0,0,0,0.4)] hover:border-white/20 glow-effect group cursor-pointer w-[300px] md:w-[400px] flex-shrink-0 flex flex-col relative overflow-hidden transition-all duration-300">
              <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-secondary/10 opacity-0 group-hover:opacity-100 transition-opacity z-0 pointer-events-none"></div>
              <div className="w-full h-48 mb-6 rounded-xl overflow-hidden relative z-10">
                <img alt="Vibrant Planetary Asset" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" src="https://lh3.googleusercontent.com/aida-public/AB6AXuC7XbrYLFAHIVT17K3pNLM7Q8wRAAmwe-SXrHE-dgc-a4kp6XPQpuJKwexKguS8x5w1iRf-alkSbX5JGwZKXJIWVcMI7QiMO-CVHneXR6VgbeDRhkmjcKd8bgxpdfGYkshgn0VwaVtuBg1q9HtsPiHOWcJthZrqmWuJqODeQ6L6XkVxd3qx212q3pbpzvGOsu9Ujd9SxXUNirZoIjKbnOlRueB8oR1WrJ6_OmMug37dT9v-DGLiRFJ76MeK_AVcU1PF0A" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 to-transparent"></div>
              </div>
              <div className="relative z-10 flex items-center space-x-4 mb-stack-md">
                <Footprints className="w-9 h-9 text-primary" />
                <h3 className="font-headline-md text-headline-md text-slate-100 group-hover:text-amber-300 transition-colors font-bold drop-shadow-sm">ColorFun Run</h3>
              </div>
              <p className="font-body-md text-slate-200/90 leading-relaxed relative z-10">A vibrant dash through cosmic dust. Experience the physical manifestation of our parade of stars.</p>
            </div>
            
            {/* Festival */}
            <div className="bg-slate-950/45 backdrop-blur-lg rounded-2xl p-stack-lg border border-white/10 shadow-[0_4px_20px_rgba(0,0,0,0.4)] hover:border-white/20 glow-effect group cursor-pointer w-[300px] md:w-[400px] flex-shrink-0 flex flex-col transition-all duration-300">
              <div className="w-full h-48 mb-6 rounded-xl overflow-hidden relative">
                <img alt="Grand Celestial Festival Asset" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAmvA3wQGoAq4vR8zT-X7M-Pg8KYreqmIa3FhhcEdDScgxQIQ7ByFS2amCTTD4tsGopBim5nbvug1JzwE14nxfJ_mquRM3I3vzpCbm9YXkxXwWJ79Oj-fovmUbi7lyygJBr-5__3ZyTVsaxVZi0FCPvi9SFfOo4SXPU6ldvO5oK_-dqtVk8MVx6UBvAxb1azq5MxJTfqbVuSP6RbJCAyZv63Ousy6h6YJ6Y829QruawNEp9YDAVgvv2YmQqZSA_rUl-nw" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 to-transparent"></div>
              </div>
              <div className="flex items-center space-x-4 mb-stack-md">
                <Tent className="w-9 h-9 text-secondary-fixed" />
                <h3 className="font-headline-md text-headline-md text-slate-100 group-hover:text-amber-300 transition-colors font-bold drop-shadow-sm">Festival</h3>
              </div>
              <p className="font-body-md text-slate-200/90 leading-relaxed">The grand finale. A spectacular celebration to close the cosmic parade.</p>
            </div>
          </div>
          
          <div className="flex gap-gutter pr-[24px] shrink-0">
            {/* Entrepreneurship Seminar (Duplicate) */}
            <div className="bg-slate-950/45 backdrop-blur-lg rounded-2xl p-stack-lg border border-white/10 shadow-[0_4px_20px_rgba(0,0,0,0.4)] hover:border-white/20 glow-effect group cursor-pointer w-[300px] md:w-[400px] flex-shrink-0 flex flex-col transition-all duration-300">
              <div className="w-full h-48 mb-6 rounded-xl overflow-hidden relative">
                <img alt="Bright Constellation Komet" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCCGc76to5NhOWrEo3N9DA2yy5BfUrSoNUfxEDdsPjNLpbbjUXdP1PxkqIV5s6BsZ2Uayrz-dX9GOEuj39b9o7GZfa5b4IquifuCfANjthtmiUuqD5yySKD_52YVN_C222iTp7bsuaIPo0C_GxUASqW-UbEbNdl3cx0qlQNrfMfUv4KtS7U6_RVLmfgVuErxnQAcQeSJ4qeW1c4R0DEVHdkKqKmwa7bgqHMsjOB8qaJPHdLYbK4yLxKIJySqD9SLs6y3A" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 to-transparent"></div>
              </div>
              <div className="flex items-center space-x-4 mb-stack-md">
                <MessageSquare className="w-9 h-9 text-secondary-fixed" />
                <h3 className="font-headline-md text-headline-md text-slate-100 group-hover:text-amber-300 transition-colors font-bold drop-shadow-sm">Entrepreneurship Seminar</h3>
              </div>
              <p className="font-body-md text-slate-200/90 leading-relaxed">Insights from industry stars and tech constellations.</p>
            </div>
            
            {/* Tenant Registration (Duplicate) */}
            <div className="bg-slate-950/45 backdrop-blur-lg rounded-2xl p-stack-lg border border-white/10 shadow-[0_4px_20px_rgba(0,0,0,0.4)] hover:border-white/20 glow-effect group cursor-pointer w-[300px] md:w-[400px] flex-shrink-0 flex flex-col transition-all duration-300">
              <div className="w-full h-48 mb-6 rounded-xl overflow-hidden relative">
                <img alt="Bazaar Market Asset BATU" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCzXACdX3Rzs-EJ6937HmJR4F1-XT4fVNinPg564zdjX_kbieyizRjqQUsGoazbI38erzbtSzVCrQAAAJ0DFwC0Xd5hBPyAO36Obn9sugJ5-FkNRxVB8NV2ZhJJlbF71arfkptYCVj6ak1b0U_2J0LpVoHEQ2hF2wjSPrws7f-Sr4UphTASP8rK_IWUdXEnox1Er91vesauCYg2OxOjFWHS-upnt4LW4VYf6jww2JSzuw-sq_83O1_UqshM_7d0nAHX7g" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 to-transparent"></div>
              </div>
              <div className="flex items-center space-x-4 mb-stack-md">
                <Store className="w-9 h-9 text-secondary-fixed" />
                <h3 className="font-headline-md text-headline-md text-slate-100 group-hover:text-amber-300 transition-colors font-bold drop-shadow-sm">Tenant Registration</h3>
              </div>
              <p className="font-body-md text-slate-200/90 leading-relaxed">Explore earthly delights and secure your cosmic merchandise spot.</p>
            </div>
            
            {/* ColorFun Run (Duplicate) */}
            <div className="bg-slate-950/45 backdrop-blur-lg rounded-2xl p-stack-lg border border-white/10 shadow-[0_4px_20px_rgba(0,0,0,0.4)] hover:border-white/20 glow-effect group cursor-pointer w-[300px] md:w-[400px] flex-shrink-0 flex flex-col relative overflow-hidden transition-all duration-300">
              <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-secondary/10 opacity-0 group-hover:opacity-100 transition-opacity z-0 pointer-events-none"></div>
              <div className="w-full h-48 mb-6 rounded-xl overflow-hidden relative z-10">
                <img alt="Vibrant Planetary Asset" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAyFgjo1OLjUOL6XOlFYXYdNi1HLoz03eiiJpzaJyDU-pn41SrNdUQLC5gFTNUpEl6WUu8Jjl4mQkp6rC2Sq_oJcHD6Qq26LWQI2VzkB_Om3uGXviLxH7IcrQ4pZdx-hsZ9tkRZSPBGeDjVaARttd0EGikIcIutRDXtwVKHivRlBPg5MlcELnwBW0rIOwjQbao4MlafoM748lZwyrba4lkbIsUJ45Smn-GnZF7Llc7gQ_JZ-Oq_szClYZLvZ1Xneg-apA" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 to-transparent"></div>
              </div>
              <div className="relative z-10 flex items-center space-x-4 mb-stack-md">
                <Footprints className="w-9 h-9 text-primary" />
                <h3 className="font-headline-md text-headline-md text-slate-100 group-hover:text-amber-300 transition-colors font-bold drop-shadow-sm">ColorFun Run</h3>
              </div>
              <p className="font-body-md text-slate-200/90 leading-relaxed relative z-10">A vibrant dash through cosmic dust. Experience the physical manifestation of our parade of stars.</p>
            </div>
            
            {/* Festival (Duplicate) */}
            <div className="bg-slate-950/45 backdrop-blur-lg rounded-2xl p-stack-lg border border-white/10 shadow-[0_4px_20px_rgba(0,0,0,0.4)] hover:border-white/20 glow-effect group cursor-pointer w-[300px] md:w-[400px] flex-shrink-0 flex flex-col transition-all duration-300">
              <div className="w-full h-48 mb-6 rounded-xl overflow-hidden relative">
                <img alt="Grand Celestial Festival Asset" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAmpiLiCK6xLcpHQ3LXPwEuOTFNZFpxZEmYsthrzSceNpzf2qwvqsa2bd3H0AmTS4XFmSd1JeF6pOyKBbbl7WjWTUvz8H3jtwZ-9zLbvdaTFj46v1mcMte38l-ovm_bF4bjdPO9ccNxxDd-UCQHz97PWpi-T_kC7wt_RuPy_q6BzqqvzujWxI942HnR0He1gnwYAo219taDgU-Q4svdkUARA_XcYc8_nP87fp3CjyxEM9HPOx6Iwn_e7GzPOeQxR7gTRA" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 to-transparent"></div>
              </div>
              <div className="flex items-center space-x-4 mb-stack-md">
                <Tent className="w-9 h-9 text-secondary-fixed" />
                <h3 className="font-headline-md text-headline-md text-slate-100 group-hover:text-amber-300 transition-colors font-bold drop-shadow-sm">Festival</h3>
              </div>
              <p className="font-body-md text-slate-200/90 leading-relaxed">The grand finale. A spectacular celebration to close the cosmic parade.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
