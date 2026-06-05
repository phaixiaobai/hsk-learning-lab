/**
 * update-vocab.mjs
 * Merges HSK_Vocabulary_Complete.xlsx with existing vocabulary.json.
 *
 * Rules:
 * - Excel is source of truth for word list per level
 * - Existing words (matched by hanzi) → preserve ID + example sentences, update en/th/pos
 * - New words from Excel → generate ID, generate example sentence
 * - Existing words NOT in Excel → keep (backward compat for quizzes/progress)
 * - Deduplicate by hanzi within each level
 *
 * Run: node scripts/update-vocab.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const XLSX    = require('xlsx');

const ROOT    = path.resolve(fileURLToPath(import.meta.url), '../../');
const EXCEL   = '/Users/pasorn/Desktop/HSK_Vocabulary_Complete.xlsx';
const VOCAB   = path.join(ROOT, 'src/data/vocabulary.json');
const BACKUP  = path.join(ROOT, 'src/data/vocabulary.backup.json');

// ── Example sentence templates by POS ─────────────────────────────────────
// Each template is a function(hanzi, en) → { zh, pinyin, en, th }
// Using simple, natural daily-life patterns.

function makePinyin(hanzi) {
  // Pinyin is generated as placeholder — real pinyin stored per-word separately
  // We use the word's own pinyin from the vocab entry
  return null; // caller fills from word.pinyin
}

// Templates now take (hanzi, en, th) — use th in Thai sentences, not en
const TEMPLATES = {
  n: [
    (h, e, t) => ({ zh: `这个${h}很好用。`,   en: `This ${e} is very useful.`,  th: `${t}นี้ใช้ได้ดี` }),
    (h, e, t) => ({ zh: `我需要一个${h}。`,   en: `I need a ${e}.`,              th: `ฉันต้องการ${t}` }),
    (h, e, t) => ({ zh: `他买了一个${h}。`,   en: `He bought a ${e}.`,           th: `เขาซื้อ${t}มา` }),
    (h, e, t) => ({ zh: `桌上有一个${h}。`,   en: `There is a ${e} on the table.`, th: `มี${t}อยู่บนโต๊ะ` }),
    (h, e, t) => ({ zh: `我喜欢这个${h}。`,   en: `I like this ${e}.`,           th: `ฉันชอบ${t}นี้` }),
  ],
  v: [
    (h, e, t) => ({ zh: `我喜欢${h}。`,       en: `I like to ${e}.`,             th: `ฉันชอบ${t}` }),
    (h, e, t) => ({ zh: `他每天${h}。`,       en: `He ${e}s every day.`,         th: `เขา${t}ทุกวัน` }),
    (h, e, t) => ({ zh: `我们一起${h}吧。`,   en: `Let's ${e} together.`,        th: `มา${t}ด้วยกันเลย` }),
    (h, e, t) => ({ zh: `她很会${h}。`,       en: `She is good at ${e}ing.`,     th: `เธอ${t}เก่งมาก` }),
    (h, e, t) => ({ zh: `你想${h}吗？`,       en: `Do you want to ${e}?`,        th: `คุณอยาก${t}ไหม?` }),
  ],
  adj: [
    (h, e, t) => ({ zh: `今天天气很${h}。`,   en: `The weather is very ${e} today.`, th: `วันนี้อากาศ${t}มาก` }),
    (h, e, t) => ({ zh: `这个地方非常${h}。`, en: `This place is very ${e}.`,     th: `ที่นี่${t}มาก` }),
    (h, e, t) => ({ zh: `他看起来很${h}。`,   en: `He looks very ${e}.`,         th: `เขาดู${t}มาก` }),
    (h, e, t) => ({ zh: `这件衣服很${h}。`,   en: `This clothes is very ${e}.`,  th: `เสื้อนี้${t}มาก` }),
    (h, e, t) => ({ zh: `这道题很${h}。`,     en: `This question is very ${e}.`, th: `คำถามนี้${t}มาก` }),
  ],
  adv: [
    (h, e, t) => ({ zh: `他${h}到了。`,       en: `He has ${e} arrived.`,        th: `เขา${t}มาถึงแล้ว` }),
    (h, e, t) => ({ zh: `请${h}说。`,         en: `Please speak ${e}.`,          th: `กรุณาพูด${t}` }),
    (h, e, t) => ({ zh: `我${h}明白了。`,     en: `I ${e} understand now.`,      th: `ฉัน${t}เข้าใจแล้ว` }),
  ],
  prep: [
    (h, e, t) => ({ zh: `书${h}桌子上。`,     en: `The book is ${e} the table.`, th: `หนังสืออยู่${t}โต๊ะ` }),
    (h, e, t) => ({ zh: `他${h}图书馆学习。`, en: `He studies ${e} the library.`,th: `เขาเรียน${t}ห้องสมุด` }),
  ],
  pron: [
    (h, e, t) => ({ zh: `${h}来了吗？`,       en: `Is ${e} here?`,               th: `${t}มาแล้วหรือยัง?` }),
    (h, e, t) => ({ zh: `${h}是我的朋友。`,   en: `${e} is my friend.`,          th: `${t}คือเพื่อนของฉัน` }),
    (h, e, t) => ({ zh: `${h}叫什么名字？`,   en: `What is ${e}'s name?`,        th: `${t}ชื่ออะไร?` }),
  ],
  conj: [
    (h, e, t) => ({ zh: `我${h}他都去了。`,   en: `Both he ${e} I went.`,        th: `ฉัน${t}เขาก็ไป` }),
    (h, e, t) => ({ zh: `${h}今天${h}明天都可以。`, en: `${e} today ${e} tomorrow is fine.`, th: `วันนี้${t}พรุ่งนี้ก็ได้` }),
  ],
  measure: [
    (h, e, t) => ({ zh: `我买了两${h}书。`,   en: `I bought two ${e} of books.`, th: `ฉันซื้อหนังสือสอง${t}` }),
    (h, e, t) => ({ zh: `一${h}水。`,         en: `A ${e} of water.`,            th: `น้ำหนึ่ง${t}` }),
  ],
  num: [
    (h, e, t) => ({ zh: `我有${h}个朋友。`,   en: `I have ${e} friends.`,        th: `ฉันมีเพื่อน${t}คน` }),
    (h, e, t) => ({ zh: `请给我${h}个。`,     en: `Please give me ${e}.`,        th: `กรุณาให้ฉัน${t}` }),
  ],
  default: [
    (h, e, t) => ({ zh: `这是${h}。`,         en: `This is ${e}.`,               th: `นี่คือ${t}` }),
    (h, e, t) => ({ zh: `他用${h}。`,         en: `He uses ${e}.`,               th: `เขาใช้${t}` }),
    (h, e, t) => ({ zh: `${h}很重要。`,       en: `${e} is important.`,          th: `${t}สำคัญมาก` }),
  ],
};

function getTemplates(pos) {
  if (!pos) return TEMPLATES.default;
  // Use the first part of combined POS (e.g. 'n/v' → 'n')
  const p = pos.toLowerCase().trim().split('/')[0].split(',')[0].trim();
  // Check specific tags first to avoid substring collisions
  // e.g. 'pron' contains 'n', 'adv' contains 'v', 'conj' contains 'n'
  if (p === 'pron' || p === 'pronoun' || p.startsWith('pron')) return TEMPLATES.pron;
  if (p === 'conj' || p === 'conjunction')                      return TEMPLATES.conj;
  if (p.startsWith('adv'))                                       return TEMPLATES.adv;
  if (p.startsWith('prep'))                                      return TEMPLATES.prep;
  if (p.startsWith('adj') || p === 'a')                         return TEMPLATES.adj;
  if (p === 'num' || p === 'number')                             return TEMPLATES.num;
  if (p === 'm' || p === 'mw' || p.startsWith('meas'))          return TEMPLATES.measure;
  if (p === 'n' || p === 'noun' || p.startsWith('n.') || p === 'np') return TEMPLATES.n;
  if (p === 'v' || p === 'verb' || p === 'vi' || p === 'vt' || p.startsWith('v.')) return TEMPLATES.v;
  // Fallback substring match
  if (p.includes('adj')) return TEMPLATES.adj;
  if (p.includes('adv')) return TEMPLATES.adv;
  if (p.includes('n'))   return TEMPLATES.n;
  if (p.includes('v'))   return TEMPLATES.v;
  return TEMPLATES.default;
}

// Simple deterministic pick (not random — reproducible)
function pickTemplate(hanzi, pos) {
  const code = [...hanzi].reduce((s, c) => s + c.charCodeAt(0), 0);
  const tpls = getTemplates(pos);
  return tpls[code % tpls.length];
}

function generateExample(hanzi, en, pos, th = '') {
  const tpl = pickTemplate(hanzi, pos);
  const enClean = en.split('/')[0].split('(')[0].trim().toLowerCase();
  const thClean = th.split('/')[0].split('(')[0].trim() || enClean;
  const result = tpl(hanzi, enClean, thClean);
  return {
    exampleZh:     result.zh,
    examplePinyin: '',
    exampleEn:     result.en,
    exampleTh:     result.th,
  };
}

// ── Main ────────────────────────────────────────────────────────────────────

console.log('📂 Loading files...');
const existingVocab = JSON.parse(readFileSync(VOCAB, 'utf-8'));
const wb = XLSX.readFile(EXCEL);

// Backup
writeFileSync(BACKUP, JSON.stringify(existingVocab, null, 2), 'utf-8');
console.log('✅ Backup saved to vocabulary.backup.json');

// Build lookup map: hanzi → existing entry (by level priority)
const existingByHanzi = new Map();
for (const w of existingVocab) {
  existingByHanzi.set(`${w.level}:${w.hanzi}`, w);
  // Also index by hanzi alone (for cross-level lookup)
  if (!existingByHanzi.has(w.hanzi)) existingByHanzi.set(w.hanzi, w);
}

// Stats
let added = 0, updated = 0, duplicates = 0;
const missingFields = [];
const allWords = [];
const seenHanziPerLevel = new Map(); // "level:hanzi" → true

// Max IDs per level
const maxId = { 2: 175, 3: 230, 4: 251 };

// Process each sheet
for (const sheetName of wb.SheetNames) {
  const level = parseInt(sheetName.replace('HSK', ''));
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }).slice(1); // skip header

  console.log(`\n📋 Processing ${sheetName}: ${rows.length} rows`);

  for (const row of rows) {
    const [num, hanzi, pinyin, en, th, pos] = row;
    if (!hanzi || !pinyin) continue;

    const hanziClean = String(hanzi).trim();
    const pinyinClean = String(pinyin).trim();
    const enClean = String(en || '').trim();
    const thClean = String(th || '').trim();
    const posClean = String(pos || '').trim();
    const levelKey = `${level}:${hanziClean}`;

    // Deduplicate within level
    if (seenHanziPerLevel.has(levelKey)) {
      duplicates++;
      console.log(`  ⚠️  Duplicate: ${hanziClean} in HSK${level}`);
      continue;
    }
    seenHanziPerLevel.set(levelKey, true);

    // Find existing entry
    const existing = existingByHanzi.get(levelKey) || existingByHanzi.get(`${level}:${hanziClean}`);

    if (existing) {
      // UPDATE existing entry — preserve ID, examples, category
      const updated_entry = {
        ...existing,
        pinyin:   pinyinClean,
        en:       enClean || existing.en,
        th:       thClean || existing.th,
        pos:      posClean || existing.pos,
        // Preserve all example fields
        example:            existing.example || existing.exampleZh || '',
        exampleTranslation: existing.exampleTranslation || existing.exampleEn || '',
        exampleZh:          existing.exampleZh || existing.example || '',
        examplePinyin:      existing.examplePinyin || '',
        exampleEn:          existing.exampleEn || existing.exampleTranslation || '',
        exampleTh:          existing.exampleTh || '',
      };

      // Generate example if missing
      if (!updated_entry.exampleZh) {
        const gen = generateExample(hanziClean, enClean, posClean, thClean);
        Object.assign(updated_entry, gen);
        updated_entry.example = gen.exampleZh;
        updated_entry.exampleTranslation = gen.exampleEn;
        missingFields.push({ id: updated_entry.id, field: 'exampleZh', action: 'generated' });
      }

      allWords.push(updated_entry);
      updated++;
    } else {
      // NEW entry from Excel
      maxId[level] = (maxId[level] || 0) + 1;
      const newId = `hsk${level}_${maxId[level]}`;

      const gen = generateExample(hanziClean, enClean, posClean, thClean);

      const newEntry = {
        id:                 newId,
        hanzi:              hanziClean,
        simplified:         hanziClean,
        traditional:        '',
        pinyin:             pinyinClean,
        en:                 enClean,
        th:                 thClean,
        level,
        pos:                posClean,
        category:           '',
        example:            gen.exampleZh,
        exampleTranslation: gen.exampleEn,
        exampleZh:          gen.exampleZh,
        examplePinyin:      gen.examplePinyin,
        exampleEn:          gen.exampleEn,
        exampleTh:          gen.exampleTh,
      };

      allWords.push(newEntry);
      added++;
    }
  }
}

// ── Preserve existing words NOT in Excel ───────────────────────────────────
console.log('\n🔍 Checking for existing words not in Excel...');
const outputHanziLevels = new Set(allWords.map(w => `${w.level}:${w.hanzi}`));
let preserved = 0;

for (const w of existingVocab) {
  const key = `${w.level}:${w.hanzi}`;
  if (!outputHanziLevels.has(key)) {
    // Ensure examples exist
    if (!w.exampleZh && w.example) {
      w.exampleZh = w.example;
    }
    if (!w.exampleEn && w.exampleTranslation) {
      w.exampleEn = w.exampleTranslation;
    }
    if (!w.exampleZh) {
      const gen = generateExample(w.hanzi, w.en, w.pos, w.th);
      Object.assign(w, gen);
      w.example = gen.exampleZh;
      w.exampleTranslation = gen.exampleEn;
    }
    allWords.push(w);
    preserved++;
  }
}

// ── Sort by level then ID ──────────────────────────────────────────────────
allWords.sort((a, b) => {
  if (a.level !== b.level) return a.level - b.level;
  const numA = parseInt(a.id.split('_')[1] || '0');
  const numB = parseInt(b.id.split('_')[1] || '0');
  return numA - numB;
});

// ── Validate ───────────────────────────────────────────────────────────────
console.log('\n🔍 Validating...');
const validationIssues = [];
for (const w of allWords) {
  if (!w.hanzi) validationIssues.push({ id: w.id, issue: 'missing hanzi' });
  if (!w.pinyin) validationIssues.push({ id: w.id, issue: 'missing pinyin' });
  if (!w.en) validationIssues.push({ id: w.id, issue: 'missing en' });
  if (!w.exampleZh) validationIssues.push({ id: w.id, issue: 'missing exampleZh' });
  if (!w.pos) validationIssues.push({ id: w.id, issue: 'missing pos' });
}

// ── Write output ───────────────────────────────────────────────────────────
writeFileSync(VOCAB, JSON.stringify(allWords, null, 2), 'utf-8');

// ── Report ─────────────────────────────────────────────────────────────────
const hsk2Out = allWords.filter(w => w.level === 2).length;
const hsk3Out = allWords.filter(w => w.level === 3).length;
const hsk4Out = allWords.filter(w => w.level === 4).length;

console.log('\n' + '═'.repeat(55));
console.log('📊 VOCABULARY UPDATE REPORT');
console.log('═'.repeat(55));
console.log(`Total output:      ${allWords.length} words`);
console.log(`  HSK 2:           ${hsk2Out}`);
console.log(`  HSK 3:           ${hsk3Out}`);
console.log(`  HSK 4:           ${hsk4Out}`);
console.log('─'.repeat(55));
console.log(`Records updated:   ${updated}`);
console.log(`Records added:     ${added}`);
console.log(`Duplicates removed:${duplicates}`);
console.log(`Preserved (not in Excel): ${preserved}`);
console.log('─'.repeat(55));
console.log(`Validation issues: ${validationIssues.length}`);
if (validationIssues.length > 0) {
  validationIssues.slice(0, 10).forEach(v => console.log(`  ⚠️  ${v.id}: ${v.issue}`));
  if (validationIssues.length > 10) console.log(`  ... and ${validationIssues.length - 10} more`);
}
console.log('─'.repeat(55));
console.log(`Missing field fixes: ${missingFields.length}`);
console.log('═'.repeat(55));
console.log('\n✅ vocabulary.json updated.');
console.log('💾 Backup at src/data/vocabulary.backup.json');
