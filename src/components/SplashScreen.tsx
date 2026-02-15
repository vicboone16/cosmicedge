import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  delay: number;
  duration: number;
  opacity: number;
}

function generateParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 3 + 1,
    delay: Math.random() * 1.5,
    duration: Math.random() * 2 + 2,
    opacity: Math.random() * 0.7 + 0.3,
  }));
}

const PARTICLES = generateParticles(60);

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
    const t1 = setTimeout(() => advance(), 600);   // stars → logo
    const t2 = setTimeout(() => advance(), 2000);  // logo → tagline
    const t3 = setTimeout(() => advance(), 3400);  // tagline → exit
    const t4 = setTimeout(() => onComplete(), 4200); // unmount
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, [advance, onComplete]);

  return (
    <AnimatePresence>
      {phase !== "exit" ? null : null}
      <motion.div
        key="splash"
        className="fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden"
        style={{ background: "linear-gradient(135deg, hsl(240 30% 8%), hsl(260 40% 12%), hsl(230 25% 6%))" }}
        initial={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        animate={phase === "exit" ? { opacity: 0, scale: 1.1 } : { opacity: 1 }}
        transition={{ duration: 0.8, ease: "easeInOut" }}
        onAnimationComplete={() => {
          if (phase === "exit") onComplete();
        }}
      >
        {/* Particle field */}
        {PARTICLES.map((p) => (
          <motion.div
            key={p.id}
            className="absolute rounded-full"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: p.size,
              height: p.size,
              background: `radial-gradient(circle, hsl(260 80% 80%), hsl(195 70% 60%))`,
            }}
            initial={{ opacity: 0, scale: 0 }}
            animate={{
              opacity: [0, p.opacity, p.opacity * 0.3, p.opacity],
              scale: [0, 1, 0.6, 1],
            }}
            transition={{
              duration: p.duration,
              delay: p.delay,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        ))}

        {/* Cosmic glow rings */}
        <motion.div
          className="absolute rounded-full"
          style={{
            width: 300,
            height: 300,
            background: "radial-gradient(circle, hsl(260 60% 55% / 0.15), transparent 70%)",
          }}
          animate={{ scale: [1, 1.4, 1], opacity: [0.5, 0.2, 0.5] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute rounded-full"
          style={{
            width: 200,
            height: 200,
            background: "radial-gradient(circle, hsl(195 70% 45% / 0.2), transparent 70%)",
          }}
          animate={{ scale: [1.2, 0.8, 1.2], opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
        />

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
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Icon placeholder — swap with your logo */}
          <motion.div
            className="relative flex items-center justify-center"
            style={{ width: 80, height: 80 }}
          >
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{
                background: "linear-gradient(135deg, hsl(260 60% 55%), hsl(195 70% 45%))",
                boxShadow: "0 0 40px hsl(260 60% 55% / 0.5), 0 0 80px hsl(195 70% 45% / 0.3)",
              }}
              animate={{ rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            />
            <span className="relative text-4xl z-10">✦</span>
          </motion.div>

          <motion.h1
            className="text-3xl font-bold tracking-tight text-white"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Cosmic Edge
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
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          Read the Stars. Beat the Line.
        </motion.p>
      </motion.div>
    </AnimatePresence>
  );
}
