// Adds the ready made meditations in scripts/library to the studio, skipping any already there.
// Run with: npm run seed
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as store from '../lib/store.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'library');
const library = JSON.parse(fs.readFileSync(path.join(dir, 'library.json'), 'utf8'));
const have = new Set(store.listMeditations().map((m) => m.libraryId).filter(Boolean));
let added = 0;
for (const item of library) {
  if (have.has(item.libraryId)) continue;
  const script = fs.readFileSync(path.join(dir, `${item.libraryId}.txt`), 'utf8');
  store.createMeditation({ ...item, brand: 'plain', pillar: null, status: 'draft', voiceId: store.getSettings().voiceId, script });
  console.log(`Added "${item.title}"`);
  added += 1;
}
console.log(added ? `${added} meditation${added > 1 ? 's' : ''} added.` : 'Everything in the library is already in the studio.');
