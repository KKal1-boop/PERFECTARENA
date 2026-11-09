import { ArenaData } from '../src/arena/arenaData.js';
import { nodeSource } from './lib/nodeSource.mjs';
const data = new ArenaData(nodeSource(process.env.ARENA_PATH || 'C:/ArenaProject/arena/ARENA'), { onWarn: () => {} });
const names = (await data.bsa()).names().map((n) => n.toUpperCase());
const fam = /^(0[1-5]|1[1-5])(UNA|LTR|CHN|PLT|BAR|MAG|MNK)(\w*)\.CFA$/;
const rows = new Map();
for (const n of names) {
  const m = fam.exec(n);
  if (!m) continue;
  const key = `${m[2]} ${m[3] || '(none)'}`;
  rows.set(key, (rows.get(key) ?? 0) + 1);
}
console.log([...rows].sort().map(([k, v]) => `${k}: ${v}`).join('\n'));
console.log('--- die-ish ---');
console.log(names.filter((n) => /^(0[1-5]|1[1-5]).*(D|DIE)[0-9]?\.CFA$/.test(n)).sort().join('\n'));
