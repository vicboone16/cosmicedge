import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import cosmicLogo from "@/assets/cosmic-edge-logo.webp";

export default function SplashScreen({ onComplete }: { onComplete: () => void }) {
  const [phase, setPhase] = useState<"stars" | "logo" | "tagline" | "exit">("stars");

  const advance = useCallback(() => {
    setPhase((p) => {
      if (p === "stars") return "logo";
      if (p === "logo") return "tagline";
      if (p === "tagline") return "exit";
      return p;
    });
  }, []);

  useEffect(() => {
    const t1 = setTimeout(() => advance(), 900);   // stars → logo
    const t2 = setTimeout(() => advance(), 2800);  // logo → tagline
    const t3 = setTimeout(() => advance(), 4600);  // tagline → exit
    const t4 = setTimeout(() => onComplete(), 5600); // unmount
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, [advance, onComplete]);

  return (
    <AnimatePresence>
      {phase !== "exit" ? null : null}
      <motion.div
        key="splash"
        className="fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden"
        style={{ background: "#000000" }}
        initial={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        animate={phase === "exit" ? { opacity: 0, scale: 1.1 } : { opacity: 1 }}
        transition={{ duration: 1.2, ease: "easeInOut" }}
        onAnimationComplete={() => {
          if (phase === "exit") onComplete();
        }}
      >

        {/* Logo / Brand */}
        <motion.div
          className="relative z-10 flex flex-col items-center gap-3"
          initial={{ opacity: 0, scale: 0.5, y: 20 }}
          animate={
            phase === "logo" || phase === "tagline"
              ? { opacity: 1, scale: 1, y: 0 }
              : phase === "exit"
              ? { opacity: 0, scale: 1.1, y: -20 }
              : { opacity: 0, scale: 0.5, y: 20 }
          }
          transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Logo */}
          <motion.img
            src={cosmicLogo}
            alt="Cosmic Edge"
            width={200}
            height={200}
            fetchPriority="high"
            decoding="async"
            className="relative z-10 rounded-3xl"
            style={{ width: 200, height: 200, objectFit: "contain" }}
          />

          <motion.h1
            className="text-4xl font-light tracking-[0.15em] uppercase text-white"
            style={{ fontFamily: "'Outfit', sans-serif" }}
          >
          CosmicEdge<sup className="text-xs font-normal align-super ml-1" style={{ fontSize: '0.5em' }}>™</sup>
          </motion.h1>
        </motion.div>

        {/* Tagline */}
        <motion.p
          className="relative z-10 mt-4 text-sm tracking-widest uppercase"
          style={{ color: "hsl(260 40% 75%)" }}
          initial={{ opacity: 0, y: 10 }}
          animate={
            phase === "tagline"
              ? { opacity: 1, y: 0 }
              : phase === "exit"
              ? { opacity: 0, y: -10 }
              : { opacity: 0, y: 10 }
          }
          transition={{ duration: 1.0, ease: "easeOut" }}
        >
          Cosmic Signs & Moneylines
        </motion.p>
      </motion.div>
    </AnimatePresence>
  );
}
