/**
 * api/generate-news-mcq.ts
 *
 * GET /api/generate-news-mcq?date=YYYY-MM-DD
 *
 * Returns (or generates) UPSC-style MCQs for a given date, sourced from
 * that day's current_affairs_news records stored in Supabase.
 *
 * Flow:
 *   1. Check news_mcqs table — return cached set if it exists for this date
 *   2. Fetch current_affairs_news records for the date
 *   3. Flatten & sample up to 15 news items across categories
 *   4. Call OpenRouter (Gemini Flash) to generate 8-10 UPSC MCQs
 *   5. Parse, store in news_mcqs, return to client
 *
 * MCQ format stored (RawMCQ):
 *   { question, options: string[], correct_index, explanation, gs_tags, exam_relevance, topic }
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

// ─── Config ──────────────────────────────────────────────────────────────────
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const OPENROUTER_API_KEY =
  process.env.OPENROUTER_API_KEY ||
  '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';
const MCQ_MODEL = 'google/gemini-2.5-flash-lite';

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  'https://nufmkzmukwplugqvtiie.supabase.co';
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51Zm1rem11a3dwbHVncXZ0aWllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3Nzk3NzgsImV4cCI6MjA5MDM1NTc3OH0.-rYm-UnMSbEJQCowxU2RpvsNT3k27O2zH93D9ohZpz0';

const MAX_ITEMS_FOR_MCQ = 15;
const TARGET_MCQ_COUNT = 10;

export const config = { maxDuration: 120 };

// ─── Types ────────────────────────────────────────────────────────────────────
interface NewsItem {
  title: string;
  content: string;
  source?: string;
  gs_tags?: string[];
  exam_relevance?: string;
  category?: string;
}

/** Format stored in Supabase news_mcqs.mcqs — matches RawMCQ in the app */
interface RawMCQ {
  question: string;
  options: string[];       // ["Option A text", "Option B text", "Option C text", "Option D text"]
  correct_index: number;   // 0-based index into options
  explanation: string;
  gs_tags?: string[];
  exam_relevance?: string;
  topic?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getTodayIST(overrideDate?: string): string {
  if (overrideDate && /^\d{4}-\d{2}-\d{2}$/.test(overrideDate)) {
    return overrideDate;
  }
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function flattenNewsItems(categories: Record<string, any>): NewsItem[] {
  const items: NewsItem[] = [];
  for (const [catKey, catData] of Object.entries(categories)) {
    const newsItems = (catData as any)?.news_items;
    if (!Array.isArray(newsItems)) continue;
    for (const item of newsItems) {
      items.push({ ...item, category: catKey });
    }
  }
  return items;
}

function sampleItems(items: NewsItem[], max: number): NewsItem[] {
  if (items.length <= max) return items;
  const byCategory: Record<string, NewsItem[]> = {};
  for (const item of items) {
    const cat = item.category || 'General';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(item);
  }
  const result: NewsItem[] = [];
  const categories = Object.keys(byCategory);
  let i = 0;
  while (result.length < max) {
    const cat = categories[i % categories.length];
    const pool = byCategory[cat];
    if (pool && pool.length > 0) result.push(pool.shift()!);
    i++;
    if (categories.every(c => byCategory[c].length === 0)) break;
  }
  return result.slice(0, max);
}

function buildMCQPrompt(items: NewsItem[], date: string): string {
  const newsBlocks = items
    .map(
      (item, idx) =>
        `[${idx + 1}] Category: ${(item.category || 'General').replace(/_/g, ' ')} | GS: ${(item.gs_tags || []).join(', ') || 'N/A'} | Relevance: ${item.exam_relevance || 'Both'}
Title: ${item.title}
Content: ${item.content}`
    )
    .join('\n\n');

  return `You are a UPSC/TNPSC exam MCQ generator specialising in current affairs.

Date: ${date}
News articles: ${items.length}

${newsBlocks}

Generate exactly ${TARGET_MCQ_COUNT} high-quality MCQs based ONLY on these news articles.

Rules:
- Use UPSC Prelims style where possible: "With reference to X, consider the following statements: 1. ... 2. ... Which of the above is/are correct?"
- OR factual questions about persons, places, figures, schemes, or policies in the news
- Each question has exactly 4 options (plain text, no letter prefix)
- Exactly one correct answer per question; others must be plausible distractors
- correct_index is 0-based (0=first option, 1=second, etc.)
- explanation: 2–3 sentences citing the news
- gs_tags: array of applicable tags from ["GS1","GS2","GS3","GS4"]
- exam_relevance: one of "Prelims", "Mains", "Both"
- topic: the category/subject of the question

Return ONLY a valid JSON array. No markdown, no explanation, no code fences:

[
  {
    "question": "...",
    "options": ["Option A text", "Option B text", "Option C text", "Option D text"],
    "correct_index": 1,
    "explanation": "...",
    "gs_tags": ["GS2"],
    "exam_relevance": "Prelims",
    "topic": "International Relations"
  }
]`;
}

// ─── Generation Logic ─────────────────────────────────────────────────────────
async function generateMCQs(
  supabase: any,
  date: string
): Promise<{ mcqs: RawMCQ[]; newsIds: string[]; error?: string }> {
  // 1. Fetch news records for this date
  const startOfDay = `${date}T00:00:00.000Z`;
  const endOfDay = `${date}T23:59:59.999Z`;

  const { data: newsRecords, error: fetchError } = await supabase
    .from('current_affairs_news')
    .select('id, categories')
    .gte('fetched_at', startOfDay)
    .lte('fetched_at', endOfDay)
    .order('fetched_at', { ascending: false })
    .limit(5);

  if (fetchError) {
    console.error('[MCQ] Failed to fetch news records:', fetchError);
    return { mcqs: [], newsIds: [], error: fetchError.message };
  }

  if (!newsRecords || newsRecords.length === 0) {
    console.warn('[MCQ] No news records found for date:', date);
    return { mcqs: [], newsIds: [], error: 'No news found for this date' };
  }

  const newsIds = newsRecords.map((r: any) => r.id);

  // 2. Flatten all news items
  let allItems: NewsItem[] = [];
  for (const record of newsRecords) {
    if (record.categories) {
      allItems.push(...flattenNewsItems(record.categories));
    }
  }

  if (allItems.length === 0) {
    return { mcqs: [], newsIds, error: 'No news items found in records' };
  }

  // 3. Sample for prompt
  const sampledItems = sampleItems(allItems, MAX_ITEMS_FOR_MCQ);

  // 4. Call AI
  const openai = new OpenAI({
    baseURL: OPENROUTER_BASE_URL,
    apiKey: OPENROUTER_API_KEY,
    defaultHeaders: {
      'HTTP-Referer': 'https://enliten.vercel.app',
      'X-Title': 'Enliten MCQ Generator',
    },
  });

  const response = await openai.chat.completions.create({
    model: MCQ_MODEL,
    messages: [
      {
        role: 'system',
        content: 'You are a UPSC MCQ generator. Return ONLY a valid JSON array. No markdown, no prose.',
      },
      { role: 'user', content: buildMCQPrompt(sampledItems, date) },
    ],
    max_tokens: 6000,
    temperature: 0.3,
  });

  const rawContent = response.choices?.[0]?.message?.content || '';
  if (!rawContent) {
    return { mcqs: [], newsIds, error: 'Empty AI response' };
  }

  // 5. Parse JSON
  let jsonStr = rawContent.trim();
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  } else {
    const firstBracket = jsonStr.indexOf('[');
    const lastBracket = jsonStr.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1) {
      jsonStr = jsonStr.substring(firstBracket, lastBracket + 1);
    }
  }

  let parsedMCQs: RawMCQ[];
  try {
    parsedMCQs = JSON.parse(jsonStr);
  } catch (parseErr) {
    console.error('[MCQ] JSON parse error. Raw:', jsonStr.substring(0, 300));
    return { mcqs: [], newsIds, error: `JSON parse failed: ${(parseErr as Error).message}` };
  }

  if (!Array.isArray(parsedMCQs) || parsedMCQs.length === 0) {
    return { mcqs: [], newsIds, error: 'AI returned empty or invalid MCQ array' };
  }

  // 6. Validate & sanitize each MCQ
  const mcqs: RawMCQ[] = parsedMCQs
    .filter(mcq =>
      mcq.question &&
      Array.isArray(mcq.options) &&
      mcq.options.length === 4 &&
      typeof mcq.correct_index === 'number' &&
      mcq.correct_index >= 0 &&
      mcq.correct_index <= 3
    )
    .map(mcq => ({
      question: mcq.question,
      options: mcq.options.map((o: string) => String(o).replace(/^[A-D][\.\)\s]+/, '').trim()),
      correct_index: mcq.correct_index,
      explanation: mcq.explanation || '',
      gs_tags: Array.isArray(mcq.gs_tags) ? mcq.gs_tags : [],
      exam_relevance: mcq.exam_relevance || 'Both',
      topic: mcq.topic || '',
    }));

  return { mcqs, newsIds };
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, X-Cron-Secret, X-Force-Regenerate');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const date = getTodayIST(req.query?.date as string);
  const forceRegenerate =
    req.headers['x-force-regenerate'] === 'true' ||
    req.headers['x-cron-secret'] === (process.env.CRON_SECRET || 'enliten-cron-secret-2025');

  console.log(`[MCQ] Request for date: ${date}, force: ${forceRegenerate}`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // 1. Check cache
    if (!forceRegenerate) {
      const { data: cached, error: cacheError } = await supabase
        .from('news_mcqs')
        .select('id, date, mcqs, total, model_used, generated_at')
        .eq('date', date)
        .single();

      if (!cacheError && cached) {
        console.log(`[MCQ] ✅ Cache hit for ${date}. Total: ${cached.total}`);
        return res.status(200).json({
          ok: true,
          cached: true,
          date,
          total: cached.total,
          mcqs: cached.mcqs,
          generated_at: cached.generated_at,
          model_used: cached.model_used,
        });
      }
    }

    // 2. Generate
    console.log(`[MCQ] 🤖 Generating MCQs for ${date}...`);
    const { mcqs, newsIds, error: genError } = await generateMCQs(supabase, date);

    if (genError || mcqs.length === 0) {
      console.warn(`[MCQ] Generation failed: ${genError}`);
      return res.status(404).json({
        ok: false,
        error: genError || 'Could not generate MCQs for this date',
        date,
      });
    }

    // 3. Store in cache (upsert by date)
    const { error: upsertError } = await supabase
      .from('news_mcqs')
      .upsert(
        {
          date,
          news_ids: newsIds,
          mcqs,
          total: mcqs.length,
          model_used: MCQ_MODEL,
          generated_at: new Date().toISOString(),
        },
        { onConflict: 'date' }
      );

    if (upsertError) {
      console.error('[MCQ] Upsert error:', upsertError);
    } else {
      console.log(`[MCQ] ✅ Stored ${mcqs.length} MCQs for ${date}`);
    }

    return res.status(200).json({
      ok: true,
      cached: false,
      date,
      total: mcqs.length,
      mcqs,
      generated_at: new Date().toISOString(),
      model_used: MCQ_MODEL,
    });
  } catch (err: any) {
    console.error('[MCQ] Unhandled error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
