#!/usr/bin/env node
// Gera a badge de cobertura (SVG estilo shields.io) a partir do
// coverage/coverage-final.json produzido pelo Vitest. 100% offline,
// sem depender de serviço externo. Usado pelo CI para publicar a
// badge na branch `badges`.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const input = resolve(root, 'coverage', 'coverage-final.json');
const output = resolve(root, 'coverage', 'badge.svg');

const raw = readFileSync(input, 'utf-8');
const data = JSON.parse(raw);

let covered = 0;
let total = 0;
for (const file of Object.values(data)) {
  for (const count of Object.values(file.s ?? {})) {
    if (count > 0) covered += 1;
    total += 1;
  }
}

if (total === 0) {
  console.error('Nenhum statement encontrado no coverage-final.json');
  process.exit(1);
}

const pct = (covered / total) * 100;
const value = `${pct.toFixed(2).replace(/\.?0+$/, '')}%`;

const color =
  pct >= 80 ? 'brightgreen'
  : pct >= 70 ? 'green'
  : pct >= 60 ? 'yellowgreen'
  : pct >= 50 ? 'yellow'
  : pct >= 30 ? 'orange'
  : 'red';

const COLORS = {
  brightgreen: '#4c1',
  green: '#97ca00',
  yellowgreen: '#a4a61d',
  yellow: '#dfb317',
  orange: '#fe7d37',
  red: '#e05d44',
  grey: '#555',
};

const LABEL = 'coverage';
const HEIGHT = 20;
const PAD = 11;
const CHAR_W = 6.2;

const labelW = Math.round(LABEL.length * CHAR_W + PAD);
const valueW = Math.round(value.length * CHAR_W + PAD);
const totalW = labelW + valueW;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${HEIGHT}" role="img" aria-label="${LABEL}: ${value}">
  <title>${LABEL}: ${value}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r"><rect width="${totalW}" height="${HEIGHT}" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelW}" height="${HEIGHT}" fill="${COLORS.grey}"/>
    <rect x="${labelW}" width="${valueW}" height="${HEIGHT}" fill="${COLORS[color]}"/>
    <rect width="${totalW}" height="${HEIGHT}" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${labelW / 2}" y="15" fill="#010101" fill-opacity=".3">${LABEL}</text>
    <text x="${labelW / 2}" y="14">${LABEL}</text>
    <text x="${labelW + valueW / 2}" y="15" fill="#010101" fill-opacity=".3">${value}</text>
    <text x="${labelW + valueW / 2}" y="14">${value}</text>
  </g>
</svg>
`;

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, svg, 'utf-8');
console.log(`coverage badge gerada: ${value} (${color}) -> ${output}`);
