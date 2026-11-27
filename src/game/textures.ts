import * as THREE from 'three';
import { CargoKind } from './types';

export function createCrateTexture(kind: CargoKind, massTons: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  const palette: Record<CargoKind, { body: string; border: string; accent: string; label: string; frame: string }> = {
    supply:  { body: '#1e2838', border: '#334455', accent: '#44ccdd', label: '#ffffff', frame: '#225566' },
    heavy:   { body: '#281e24', border: '#443344', accent: '#cc44aa', label: '#ffffff', frame: '#663355' },
    fragile: { body: '#1e1830', border: '#332244', accent: '#8844cc', label: '#ffffff', frame: '#553366' },
    ballast: { body: '#1a2228', border: '#2a3440', accent: '#668899', label: '#c0c8d0', frame: '#334455' },
  };

  const p = palette[kind];

  // Dark metallic body
  ctx.fillStyle = p.body;
  ctx.fillRect(0, 0, 256, 256);

  // Panel lines
  ctx.strokeStyle = p.border;
  ctx.lineWidth = 8;
  ctx.strokeRect(10, 10, 236, 236);

  // Inner border
  ctx.strokeStyle = p.frame;
  ctx.lineWidth = 4;
  ctx.strokeRect(22, 22, 212, 212);

  // Corner brackets
  ctx.strokeStyle = p.border;
  ctx.lineWidth = 6;
  const corners = [[22, 22], [234, 22], [22, 234], [234, 234]];
  for (const [cx, cy] of corners) {
    const dx = cx < 128 ? 1 : -1;
    const dy = cy < 128 ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(cx + dx * 12, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + dy * 12);
    ctx.stroke();
  }

  // Center holographic badge
  ctx.fillStyle = p.border;
  ctx.beginPath();
  ctx.roundRect(42, 42, 172, 168, 10);
  ctx.fill();

  // Badge inner glow
  ctx.strokeStyle = p.accent;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(48, 48, 160, 156, 8);
  ctx.stroke();

  // Weight — large monospace
  ctx.fillStyle = p.label;
  ctx.font = '900 72px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${massTons}T`, 128, 108);

  // Kind tag with accent color
  ctx.fillStyle = p.accent;
  ctx.font = '800 20px system-ui, sans-serif';
  const tag =
    kind === 'ballast'
      ? 'BALLAST'
      : kind === 'fragile'
        ? 'FRAGILE'
        : kind === 'heavy'
          ? 'HEAVY'
          : 'SUPPLY';
  ctx.fillText(tag, 128, 162);

  // Barcode-like accent lines at bottom
  ctx.fillStyle = p.accent;
  const barWidth = 4;
  const gap = 2;
  for (let bx = 50; bx < 206; bx += barWidth + gap) {
    const bh = 8 + Math.sin(bx * 0.3) * 4;
    ctx.fillRect(bx, 190, barWidth, bh);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function createDropZoneTexture(
  label: string,
  color: string,
  icon: 'crate' | 'gear' | 'wine',
  satisfied: boolean,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Dark holographic background
  const hexColor = satisfied ? '#44ccdd' : color;
  ctx.fillStyle = satisfied ? 'rgba(20, 40, 50, 0.4)' : 'rgba(10, 14, 24, 0.5)';
  ctx.fillRect(0, 0, 256, 256);

  // Concentric target rings
  ctx.strokeStyle = satisfied ? 'rgba(68, 204, 221, 0.5)' : 'rgba(68, 136, 204, 0.35)';
  ctx.lineWidth = 10;
  for (let r = 110; r > 20; r -= 28) {
    ctx.beginPath();
    ctx.arc(128, 100, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Dashed outer frame
  ctx.strokeStyle = hexColor;
  ctx.lineWidth = 14;
  ctx.setLineDash([24, 12]);
  ctx.strokeRect(12, 12, 232, 232);
  ctx.setLineDash([]);

  // Center icon
  ctx.fillStyle = satisfied ? '#88ffff' : '#e0e8f0';
  ctx.font = '900 68px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const sym = satisfied ? '✓' : icon === 'gear' ? '⚙' : icon === 'wine' ? '🍷' : '📦';
  ctx.fillText(sym, 128, 108);

  // Label with tech styling
  ctx.fillStyle = hexColor;
  ctx.font = '800 20px system-ui, sans-serif';
  ctx.fillText(label.toUpperCase().slice(0, 15), 128, 192);

  // Scan line accents
  ctx.strokeStyle = hexColor;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.2;
  for (let sy = 15; sy < 240; sy += 12) {
    ctx.beginPath();
    ctx.moveTo(16, sy);
    ctx.lineTo(240, sy);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createSignTexture(
  line1: string,
  line2: string,
  bgColor = '#0e1620',
  accentColor = '#44ccdd',
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext('2d')!;

  // Dark panel background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, 512, 192);

  // Border with accent glow
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 8;
  ctx.strokeRect(8, 8, 496, 176);

  // Inner border
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 2;
  ctx.strokeRect(18, 18, 476, 156);

  // Scan-line texture
  ctx.fillStyle = 'rgba(255,255,255,0.015)';
  for (let sy = 0; sy < 192; sy += 4) {
    ctx.fillRect(0, sy, 512, 1);
  }

  // Sub-title
  ctx.fillStyle = '#8899aa';
  ctx.font = '700 30px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(line1, 256, 52);

  // Main value
  ctx.fillStyle = accentColor;
  ctx.font = '900 64px system-ui, sans-serif';
  ctx.fillText(line2, 256, 124);

  // Bottom accent line
  ctx.fillStyle = accentColor;
  ctx.fillRect(180, 158, 152, 3);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createHazardStripeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0e1620';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#334455';
  for (let i = -128; i < 256; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 16, 0);
    ctx.lineTo(i + 144, 128);
    ctx.lineTo(i + 128, 128);
    ctx.closePath();
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
