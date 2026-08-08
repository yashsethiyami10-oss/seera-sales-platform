import Image from "next/image";
import { Aura } from "@/components/ui/primitives";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex items-center justify-center overflow-hidden px-6" style={{ minHeight: "100svh", background: "var(--ink)" }}>
      <Aura size={520} style={{ top: "-15%", left: "50%", transform: "translateX(-50%)" }} />
      <div className="relative z-10 w-full" style={{ maxWidth: 420 }}>
        <div className="text-center mb-7">
          <Image src="/logo.png" alt="Muv" width={140} height={53} priority style={{ height: 40, width: "auto", margin: "0 auto" }} />
        </div>
        <div className="rounded-3xl p-8" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--card-border)" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
