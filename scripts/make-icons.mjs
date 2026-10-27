// Genera los iconos de la PWA (se corre una vez y los PNG se guardan en el repositorio): node scripts/make-icons.mjs
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const GOLD = "#ffd700", PURPLE = "#8b3dff", BLACK = "#0b0713";
const glyph = (fill, star) => `
  <rect x="170" y="120" width="64" height="250" rx="10" fill="${fill}"/>
  <rect x="170" y="306" width="190" height="64" rx="10" fill="${fill}"/>
  <path d="M330 110 L346 154 L390 170 L346 186 L330 230 L314 186 L270 170 L314 154 Z" fill="${star}"/>`;
const svg = (rx, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="${rx}" fill="${BLACK}"/>${body}</svg>`;

const any = svg(104, glyph(GOLD, PURPLE));          // esquinas redondeadas
const full = svg(0, glyph(GOLD, PURPLE));           // sin esquinas: maskable y iOS (el sistema las recorta)
const badge = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 512 512">${glyph("#fff", "#fff")}</svg>`;

mkdirSync("public/icons", { recursive: true });
const out = (s, size, path) => sharp(Buffer.from(s)).resize(size, size).png().toFile(path);
await Promise.all([
  out(any, 192, "public/icons/icon-192.png"),
  out(any, 512, "public/icons/icon-512.png"),
  out(full, 512, "public/icons/icon-maskable-512.png"),
  out(full, 180, "app/apple-icon.png"),
  out(any, 512, "app/icon.png"),
  out(badge, 96, "public/icons/badge-96.png"),
]);
console.log("iconos listos");
