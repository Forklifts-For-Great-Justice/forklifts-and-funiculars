import * as THREE from 'three';
import { CargoKind } from './types';

export function createCrateTexture(kind: CargoKind, massTons: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  const palette: Record<CargoKind, { bg: string; border: string; badge: string; text: string; sym: string }> = {
    supply: { bg: '#d99b38', border: '#8c5d19', badge: '#2c2214', text: '#fff7e0', sym: '■' },
    heavy: { bg: '#c85a28', border: '#6e2a10', badge: '#1f1918', text: '#ffe9d6', sym: '⚙' },
    fragile: { bg: '#7f3da8', border: '#471d63', badge: '#21132b', text: '#f6e2ff', sym: '🍷' },
    ballast: { bg: '#6e7680', border: '#3e444d', badge: '#1c2026', text: '#e7edf5', sym: '▼' },
  };

  const p = palette[kind];
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, 256, 256);

  // Subtle plank or reinforcement lines
  ctx.strokeStyle = p.border;
  ctx.lineWidth = 14;
  ctx.strokeRect(10, 10, 236, 236);

  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(18, 18);
  ctx.lineTo(238, 238);
  ctx.moveTo(238, 18);
  ctx.lineTo(18, 238);
  ctx.stroke();

  // Center stencil medallion
  ctx.fillStyle = p.badge;
  ctx.beginPath();
  ctx.roundRect(42, 46, 172, 164, 18);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 4;
  ctx.stroke();

  // Weight stencil
  ctx.fillStyle = p.text;
  ctx.font = '900 74px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${massTons}T`, 128, 114);

  // Kind tag
  ctx.font = '800 22px system-ui, sans-serif';
  ctx.fillStyle = '#f5c758';
  const tag =
    kind === 'ballast'
      ? 'BALLAST'
      : kind === 'fragile'
        ? 'FRAGILE'
        : kind === 'heavy'
          ? 'HEAVY'
          : 'SUPPLY';
  ctx.fillText(tag, 128, 176);

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

  ctx.fillStyle = satisfied ? 'rgba(66, 201, 122, 0.34)' : 'rgba(20, 26, 34, 0.45)';
  ctx.fillRect(0, 0, 256, 256);

  // Dashed safety frame
  ctx.strokeStyle = satisfied ? '#42c97a' : color;
  ctx.lineWidth = 14;
  ctx.setLineDash([24, 12]);
  ctx.strokeRect(12, 12, 232, 232);
  ctx.setLineDash([]);

  // Center icon
  ctx.fillStyle = satisfied ? '#80ffb2' : '#ffffff';
  ctx.font = '900 68px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const sym = satisfied ? '✓' : icon === 'gear' ? '⚙' : icon === 'wine' ? '🍷' : '📦';
  ctx.fillText(sym, 128, 108);

  // Label
  ctx.font = '800 22px system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(label.toUpperCase().slice(0, 15), 128, 192);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createSignTexture(
  line1: string,
  line2: string,
  bgColor = '#1c242e',
  accentColor = '#f5b726',
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, 512, 192);
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 10;
  ctx.strokeRect(8, 8, 496, 176);

  ctx.fillStyle = '#b9c7d6';
  ctx.font = '800 32px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(line1, 256, 58);

  ctx.fillStyle = accentColor;
  ctx.font = '900 66px system-ui, sans-serif';
  ctx.fillText(line2, 256, 128);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createHazardStripeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f5b726';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#1e2228';
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
