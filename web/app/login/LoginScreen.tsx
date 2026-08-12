"use client";

import React, { useEffect, useRef, useState } from 'react';
import { signIn } from 'next-auth/react';
import { AlertCircle } from 'lucide-react';
import './cover.css';

export default function LoginScreen({ error: errorParam, callbackUrl = '/' }: { error?: string; callbackUrl?: string }) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(
    errorParam === 'AccessDenied'
      ? 'Tu cuenta no está autorizada para este panel. Usá tu correo de la empresa.'
      : errorParam ? 'No se pudo iniciar sesión. Intentá de nuevo.' : ''
  );
  const [stamp, setStamp] = useState('—');

  const globeRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<HTMLCanvasElement | null>(null);

  // Fecha (igual al script original: ayer)
  useEffect(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const pad = (n: number) => String(n).padStart(2, '0');
    setStamp(`${pad(d.getDate())} / ${pad(d.getMonth() + 1)} / ${d.getFullYear()}`);
  }, []);

  // Globe wireframe
  useEffect(() => {
    const c = globeRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;

    type Pt = { bx: number; by: number; bz: number; x: number; y: number; sx: number; sy: number; size: number };
    const pts: Pt[] = [];
    const R = 78;
    const jit = () => (Math.random() - 0.5) * 2.4;

    const N1 = 5400;
    const N2 = 2700;
    for (let i = 0; i < N1; i++) {
      const t = i / (N1 - 1), lat = (t - 0.5) * Math.PI, lon = t * 24 * Math.PI * 2, cl = Math.cos(lat);
      pts.push({ bx: R * cl * Math.cos(lon) + jit(), by: -R * Math.sin(lat) + jit(), bz: R * cl * Math.sin(lon) + jit(), x: 0, y: 0, sx: 0, sy: 0, size: 1.0 });
    }
    for (let i = 0; i < N2; i++) {
      const t = i / (N2 - 1), lat = (t - 0.5) * Math.PI, lon = t * 24 * Math.PI * 2 + Math.PI / 24, cl = Math.cos(lat);
      pts.push({ bx: R * cl * Math.cos(lon) + jit(), by: -R * Math.sin(lat) + jit(), bz: R * cl * Math.sin(lon) + jit(), x: 0, y: 0, sx: 0, sy: 0, size: 0.85 });
    }

    let w = 0, h = 0, dpr = 1, angle = 0, raf = 0;
    const cTX = Math.cos(0.95), sTX = Math.sin(0.95), cTZ = Math.cos(-0.42), sTZ = Math.sin(-0.42);
    let phase: 'assembled' | 'scattering' | 'scattered' | 'reassembling' = 'reassembling';
    let phaseStart = performance.now();
    let first = true;
    const D = { assembled: 6500, scattering: 1700, scattered: 1400, reassembling: 3600 };
    const FIRST_MS = 7500, FIRST_EASE = 0.013;

    function scatter() {
      for (const p of pts) {
        p.sx = w * (0.05 + Math.random() * 0.9);
        p.sy = h * (0.05 + Math.random() * 0.9);
      }
    }
    function resize() {
      if (!c) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      w = c.clientWidth; h = c.clientHeight;
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.imageSmoothingEnabled = true;
      ctx!.imageSmoothingQuality = 'high';
      scatter();
      if (first) { for (const p of pts) { p.x = p.sx; p.y = p.sy; } }
    }
    function tick(now: number) {
      const dur = (phase === 'reassembling' && first) ? FIRST_MS : D[phase];
      const el = now - phaseStart;
      if (el > dur) {
        if (phase === 'assembled') { phase = 'scattering'; scatter(); }
        else if (phase === 'scattering') phase = 'scattered';
        else if (phase === 'scattered') phase = 'reassembling';
        else { phase = 'assembled'; first = false; }
        phaseStart = now;
      }
      ctx!.clearRect(0, 0, w, h);
      angle += 0.0035;
      const cY = Math.cos(angle), sY = Math.sin(angle);
      const cx = w - 180, cy = h - 160;
      const ease = phase === 'scattering' ? 0.035 : phase === 'reassembling' ? (first ? FIRST_EASE : 0.038) : phase === 'scattered' ? 0.04 : 0.22;
      const onGlobe = phase === 'assembled' || phase === 'reassembling';
      for (const p of pts) {
        const yx = p.bx * cY - p.bz * sY, yz = p.bx * sY + p.bz * cY;
        const xy = p.by * cTX - yz * sTX, rrz = p.by * sTX + yz * cTX;
        const rx = yx * cTZ - xy * sTZ, ry = yx * sTZ + xy * cTZ;
        const persp = 260 / (260 + rrz);
        const gx = cx + rx * persp, gy = cy + ry * persp;
        const tx = onGlobe ? gx : p.sx, ty = onGlobe ? gy : p.sy;
        p.x += (tx - p.x) * ease; p.y += (ty - p.y) * ease;
        const cl = Math.max(0, Math.min(1, (70 - rrz) / 140));
        const fade = cl * cl;
        let a = fade * 1.0, r = p.size * persp * 0.45;
        if (phase === 'scattered') { a *= 0.6; r *= 0.85; }
        else if (phase === 'scattering') { const t = el / D.scattering; a *= 1 - t * 0.4; }
        else if (phase === 'reassembling') { const t = el / D.reassembling; a *= 0.6 + t * 0.4; }
        ctx!.fillStyle = 'rgba(150,180,255,' + a.toFixed(3) + ')';
        ctx!.beginPath(); ctx!.arc(p.x, p.y, r, 0, Math.PI * 2); ctx!.fill();
      }
      raf = requestAnimationFrame(tick);
    }
    resize();
    window.addEventListener('resize', resize);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => resize()) : null;
    if (ro && c) ro.observe(c);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      if (ro) ro.disconnect();
    };
  }, []);

  // Network particles
  useEffect(() => {
    const c = particlesRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;

    type P = { x: number; y: number; vx: number; vy: number; r: number };
    let w = 0, h = 0, dpr = 1, raf = 0;
    let P: P[] = [];
    const N = 15, MAX = 180;

    function resize() {
      if (!c) return;
      dpr = window.devicePixelRatio || 1;
      w = c.clientWidth; h = c.clientHeight;
      c.width = w * dpr; c.height = h * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function init() {
      resize();
      P = [];
      for (let i = 0; i < N; i++) {
        P.push({
          x: Math.random() * w, y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.28, vy: (Math.random() - 0.5) * 0.28,
          r: Math.random() * 1.4 + 0.7,
        });
      }
    }
    function tick() {
      ctx!.clearRect(0, 0, w, h);
      for (let i = 0; i < P.length; i++) {
        for (let j = i + 1; j < P.length; j++) {
          const dx = P[i].x - P[j].x, dy = P[i].y - P[j].y, d = Math.sqrt(dx * dx + dy * dy);
          if (d < MAX) {
            ctx!.strokeStyle = 'rgba(25,69,226,' + ((1 - d / MAX) * 0.35).toFixed(3) + ')';
            ctx!.lineWidth = 0.6;
            ctx!.beginPath();
            ctx!.moveTo(P[i].x, P[i].y);
            ctx!.lineTo(P[j].x, P[j].y);
            ctx!.stroke();
          }
        }
      }
      for (const p of P) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        ctx!.fillStyle = 'rgba(138,170,255,.55)';
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx!.fill();
      }
      raf = requestAnimationFrame(tick);
    }
    window.addEventListener('resize', init);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => init()) : null;
    if (ro && c) ro.observe(c);
    init();
    tick();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', init);
      if (ro) ro.disconnect();
    };
  }, []);

  const handleGoogle = async () => {
    setError('');
    setIsLoading(true);
    try {
      await signIn('google', { callbackUrl });
    } catch {
      setError('Error inesperado. Intentá nuevamente.');
      setIsLoading(false);
    }
  };

  const tickerItems = Array.from({ length: 8 });

  return (
    <section className="cover-login">
      <div className="cover-orb" />
      <div className="cover-grid" />
      <canvas className="cover-globe" ref={globeRef} aria-hidden="true" />
      <canvas className="cover-particles" ref={particlesRef} aria-hidden="true" />
      <div className="cover-noise" aria-hidden="true" />

      <svg className="svg-defs" aria-hidden="true">
        <defs>
          <filter id="gridWave" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.004" numOctaves={1} seed={4} result="noise">
              <animate attributeName="baseFrequency" values="0.003;0.008;0.005;0.009;0.003" keyTimes="0;0.3;0.55;0.8;1" dur="13s" repeatCount="indefinite" />
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="0">
              <animate attributeName="scale" values="0;20;8;24;0" keyTimes="0;0.3;0.55;0.8;1" dur="13s" repeatCount="indefinite" />
            </feDisplacementMap>
          </filter>
        </defs>
      </svg>

      <div className="cover-ticker" aria-hidden="true">
        <div className="cover-ticker-track">
          {tickerItems.map((_, i) => (
            <React.Fragment key={i}>
              <span className="t">NODS · Performance & Analítica</span>
              <span className="d">●</span>
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="brand">
        <span className="brand-label">NODS</span>
        <span className="brand-sep" />
        <span>Plataforma · <em>Sales AI</em></span>
      </div>
      <div className="stamp">
        <span className="dot" />
        <span>{stamp}</span>
      </div>

      <div className="cover-content">
        <div className="cover-eyebrow">Acceso seguro</div>
        <h1 className="cover-title">
          Bienvenido de vuelta<br /><em className="blue">Iniciá sesión.</em>
        </h1>
        <p className="cover-lead">Ingresá tus credenciales para acceder a los paneles de performance, leads e inversión.</p>

        <div className="cover-form">
          {error && (
            <div className="cover-error">
              <AlertCircle className="w-5 h-5" />
              <span>{error}</span>
            </div>
          )}

          <button type="button" onClick={handleGoogle} disabled={isLoading} className="cover-submit">
            {isLoading ? (
              <span className="cover-submit-loading">
                <span className="cover-spinner" aria-hidden="true" />
                Redirigiendo a Google…
              </span>
            ) : (
              <>
                <GoogleIcon />
                <span>Continuar con Google</span>
                <span className="cover-submit-arrow" aria-hidden="true">→</span>
              </>
            )}
          </button>

          <p className="cover-hint">Usá tu cuenta de correo corporativa. El acceso está restringido al dominio de la empresa.</p>
        </div>

        <div className="cover-meta">
          <div className="m">Acceso<b>Privado · Google</b></div>
          <div className="m">Seguridad<b>OAuth 2.0 · SSO</b></div>
          <div className="m">Estado<b id="lastUpdate">{stamp}</b></div>
        </div>
      </div>
    </section>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path fill="#FFC107" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62z" />
      <path fill="#FF3D00" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#4CAF50" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.05l3.01-2.33z" />
      <path fill="#1976D2" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}
