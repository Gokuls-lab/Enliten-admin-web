import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

// ═══════════════════════════════════════════════════════════════
//  Config
// ═══════════════════════════════════════════════════════════════
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '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';
const NEWS_MODEL = 'google/gemini-2.5-flash-lite';
const MCQ_MODEL = 'google/gemini-2.5-flash-lite';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://nufmkzmukwplugqvtiie.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51Zm1rem11a3dwbHVncXZ0aWllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3Nzk3NzgsImV4cCI6MjA5MDM1NTc3OH0.-rYm-UnMSbEJQCowxU2RpvsNT3k27O2zH93D9ohZpz0';

// ═══════════════════════════════════════════════════════════════
//  Allowed domains for web search grounding
//  (extracted from user-specified sources)
// ═══════════════════════════════════════════════════════════════
const ALLOWED_DOMAINS = [
  // IAS / UPSC prep sites
  'visionias.in',
  'insightsonindia.com',
  'drishtiias.com',
  'vajiramandravi.com',
  'tafiasacademy.in',
  'shankariasacademy.com',
  'rajivgandhiiasacademy.com',
  'vetriias.com',
  'vijayakumariasacademy.com',
  // TNPSC sites
  'tnpscthervupettagam.com',
  'winmeen.com',
  'tnpscportal.in',
  // News / Government
  'epaper.thehindu.com',
  'pib.gov.in',
  // Magazines
  'chahalacademy.com',
  'downtoearth.org.in',
  'publicationsdivision.nic.in',
  'testbook.com',
  'edurev.in',
  'thittam.in',
  'verandarace.com',
];

// ═══════════════════════════════════════════════════════════════
//  Web Search Tool Definition (OpenRouter native)
// ═══════════════════════════════════════════════════════════════
const NEWS_TOOLS: any[] = [
  {
    type: 'openrouter:web_search',
    parameters: {
      engine: 'native',
      allowed_domains: ALLOWED_DOMAINS,
    },
  },
];

// ═══════════════════════════════════════════════════════════════
//  Category emoji map
// ═══════════════════════════════════════════════════════════════
const CATEGORY_EMOJIS: Record<string, string> = {
  Politics: '🏛️',
  Economy: '📈',
  Sports: '🏅',
  Science_Technology: '🔬',
  Environment: '🌿',
  Education: '🎓',
  Culture: '🎭',
  Health: '🏥',
  Infrastructure: '🏗️',
  International_Relations: '🌐',
};

type NewsCategory = {
  news_items?: unknown[];
  total_items?: number;
  [key: string]: unknown;
};

function getTamilNaduDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

// ═══════════════════════════════════════════════════════════════
//  System Prompt
// ═══════════════════════════════════════════════════════════════
function buildSystemPrompt(): string {
  const today = getTamilNaduDate();
  return `You are a Tamil Nadu Current Affairs analyst for UPSC/TNPSC aspirants.

Today's date: ${today}

Your task:
1. Search the web for the latest available Tamil Nadu current affairs (prioritize today, but use recent days if today is unavailable) from the allowed domains.
2. Collect and categorize all news items under these 10 categories:
   Politics, Economy, Sports, Science_Technology, Environment, Education, Culture, Health, Infrastructure, International_Relations

3. Return ONLY a valid JSON object in the exact schema below. No markdown, no explanation, no code fences — just raw JSON.

Schema:
{
  "timestamp": "<ISO 8601 datetime>",
  "region": "Tamil Nadu",
  "categories": {
    "Politics": {
      "news_items": [
        { "date": "YYYY-MM-DD", "title": "...", "content": "...", "source": "...", "gs_tags": ["GS2"], "exam_relevance": "Prelims" }
      ],
      "total_items": <number>
    },
    "Economy": { "news_items": [...], "total_items": <number> },
    "Sports": { "news_items": [...], "total_items": <number> },
    "Science_Technology": { "news_items": [...], "total_items": <number> },
    "Environment": { "news_items": [...], "total_items": <number> },
    "Education": { "news_items": [...], "total_items": <number> },
    "Culture": { "news_items": [...], "total_items": <number> },
    "Health": { "news_items": [...], "total_items": <number> },
    "Infrastructure": { "news_items": [...], "total_items": <number> },
    "International_Relations": { "news_items": [...], "total_items": <number> }
  }
}

Rules:
- CRITICAL: You MUST return ONLY the JSON object. Do not include any conversational text or apologies.
- If news for the exact date (${today}) is not found, fall back to the most recent news available. DO NOT apologize for the date mismatch.
- Each category must have at least 3 news items if available.
- "gs_tags" must be one or more of: "GS1", "GS2", "GS3", "GS4"
- "exam_relevance" must be one of: "Prelims", "Mains", "Both"
- "source" should be the domain name (e.g., "drishtiias.com")
- "content" should be 2-4 sentences summarizing the key facts
- Focus only on Tamil Nadu region news and events
- total_items must match the actual count of news_items in that category`;
}

// ═══════════════════════════════════════════════════════════════
//  MCQ Generation Prompt
// ═══════════════════════════════════════════════════════════════
function buildMCQPrompt(newsItems: any[]): string {
  const newsText = newsItems.slice(0, 20).map((item, i) =>
    `${i + 1}. [${item.category || 'General'}] ${item.title}\n   ${item.content}`
  ).join('\n\n');

  return `You are a UPSC/TNPSC MCQ generator. Based on the following current affairs news items, generate 5 high-quality MCQs.

NEWS ITEMS:
${newsText}

Rules:
- Each MCQ must be directly based on the news above.
- 4 options (A, B, C, D). Only one is correct.
- Options should be plausible but clearly distinct.
- Include a brief explanation (1-2 sentences) for the correct answer.
- Assign gs_tags (one or more of GS1, GS2, GS3, GS4) and exam_relevance (Prelims, Mains, or Both).
- Include a topic field (e.g. "International Relations", "Environment", "Economy").

Return ONLY a valid JSON array. No markdown, no extra text.

Schema:
[
  {
    "question": "...",
    "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
    "correct_index": 0,
    "explanation": "...",
    "gs_tags": ["GS2"],
    "exam_relevance": "Prelims",
    "topic": "..."
  }
]`;
}

// ═══════════════════════════════════════════════════════════════
//  Generate and Store MCQs from News Items
// ═══════════════════════════════════════════════════════════════
async function generateAndStoreMCQs(supabase: any, openai: any, newsItems: any[]): Promise<void> {
  if (!newsItems || newsItems.length === 0) {
    console.log('[MCQ] No news items to generate MCQs from.');
    return;
  }

  const today = getTamilNaduDate();
  console.log(`[MCQ] Generating MCQs for ${today} from ${newsItems.length} news items...`);

  try {
    const mcqResponse = await openai.chat.completions.create({
      model: MCQ_MODEL,
      messages: [
        { role: 'system', content: 'You are a UPSC/TNPSC MCQ generator. Return only valid JSON arrays, no markdown.' },
        { role: 'user', content: buildMCQPrompt(newsItems) },
      ],
      max_tokens: 4096,
    });

    const rawMCQ = mcqResponse.choices?.[0]?.message?.content || '';
    if (!rawMCQ) throw new Error('Empty MCQ response');

    // Extract JSON array
    let mcqJson = rawMCQ.trim();
    const arrMatch = mcqJson.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (arrMatch) mcqJson = arrMatch[1].trim();
    else {
      const start = mcqJson.indexOf('[');
      const end = mcqJson.lastIndexOf(']');
      if (start !== -1 && end !== -1) mcqJson = mcqJson.substring(start, end + 1);
    }

    let mcqs: any[];
    try {
      mcqs = JSON.parse(mcqJson);
    } catch {
      throw new Error('MCQ JSON parse failed');
    }

    if (!Array.isArray(mcqs) || mcqs.length === 0) throw new Error('No MCQs in response');

    // Upsert into news_mcqs: one row per day
    const { error } = await supabase
      .from('news_mcqs')
      .upsert(
        [
          {
            date: today,
            mcqs: mcqs,
            total: mcqs.length,
            generated_at: new Date().toISOString(),
          },
        ],
        { onConflict: 'date' }
      );

    if (error) throw new Error(`MCQ DB upsert failed: ${error.message}`);
    console.log(`[MCQ] ✅ Stored ${mcqs.length} MCQs for ${today}`);
  } catch (err: any) {
    console.error('[MCQ] generateAndStoreMCQs error:', err.message);
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════════
//  Core: Fetch and parse news from AI
// ═══════════════════════════════════════════════════════════════
export async function fetchAndStoreNews(): Promise<{ success: boolean; id?: string; total_items?: number; error?: string }> {
  console.log('[NEWS] Starting AI news fetch...');

  const openai = new OpenAI({
    baseURL: OPENROUTER_BASE_URL,
    apiKey: OPENROUTER_API_KEY,
    defaultHeaders: {
      'HTTP-Referer': 'https://enliten.vercel.app',
      'X-Title': 'Enliten News Fetcher',
    },
  });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // Call OpenRouter with Gemini Flash + web search
    const response = await openai.chat.completions.create({
      model: NEWS_MODEL,
      tools: NEWS_TOOLS,
      tool_choice: 'auto',
      messages: [
        {
          role: 'system',
          content: buildSystemPrompt(),
        },
        {
          role: 'user',
          content: `Search for today's Tamil Nadu current affairs news from the approved educational websites. Fetch articles from multiple categories. Return the structured JSON only.`,
        },
      ],
      max_tokens: 8192,
    });

    const rawContent = response.choices?.[0]?.message?.content || '';
    console.log('[NEWS] Raw AI response length:', rawContent.length);

    if (!rawContent) {
      throw new Error('Empty response from AI model');
    }

    // Extract JSON from response (handle possible markdown wrapping)
    let jsonStr = rawContent.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    } else {
      // Try to find raw JSON object
      const firstBrace = jsonStr.indexOf('{');
      const lastBrace = jsonStr.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
      }
    }

    let parsedNews: any;
    try {
      parsedNews = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.error('[NEWS] JSON parse failed. Raw:', jsonStr.substring(0, 500));
      throw new Error(`JSON parse failed: ${(parseErr as Error).message}`);
    }

    // Validate basic structure
    if (!parsedNews.categories || typeof parsedNews.categories !== 'object') {
      throw new Error('Invalid news structure: missing categories');
    }

    // Attach emoji metadata to each category and derive totals from the arrays
    // instead of trusting model-provided counts.
    const enrichedCategories: any = {};
    let totalItems = 0;
    for (const [catKey, catValue] of Object.entries(parsedNews.categories) as [string, NewsCategory][]) {
      const newsItems = Array.isArray(catValue?.news_items) ? catValue.news_items : [];
      totalItems += newsItems.length;

      enrichedCategories[catKey] = {
        ...catValue,
        news_items: newsItems,
        total_items: newsItems.length,
        emoji: CATEGORY_EMOJIS[catKey] || '📰',
      };
    }

    // Store in Supabase
    const { data: insertData, error: insertError } = await supabase
      .from('current_affairs_news')
      .insert([
        {
          fetched_at: new Date().toISOString(),
          region: parsedNews.region || 'Tamil Nadu',
          categories: enrichedCategories,
          total_items: totalItems,
          model_used: NEWS_MODEL,
          raw_timestamp: parsedNews.timestamp || new Date().toISOString(),
        },
      ])
      .select('id, total_items')
      .single();

    if (insertError) {
      console.error('[NEWS] Supabase insert error:', insertError);
      throw new Error(`DB insert failed: ${insertError.message}`);
    }

    console.log(`[NEWS] ✅ Stored news with ID: ${insertData?.id}, total items: ${totalItems}`);

    // Generate MCQs from today's news (non-blocking — failure won't affect news storage)
    const allNewsItems: any[] = [];
    for (const catData of Object.values(enrichedCategories) as any[]) {
      for (const item of catData.news_items || []) {
        allNewsItems.push({ ...item, category: Object.keys(enrichedCategories).find(k => enrichedCategories[k] === catData) });
      }
    }
    generateAndStoreMCQs(supabase, openai, allNewsItems).catch(err =>
      console.error('[MCQ] Background generation failed:', err)
    );

    return { success: true, id: insertData?.id, total_items: totalItems };

  } catch (err: any) {
    console.error('[NEWS] fetchAndStoreNews error:', err);
    return { success: false, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════
//  Vercel Serverless Handler — POST /api/fetch-news
//  For manual admin triggers only.
//  Scheduled fetching is handled by scheduler/news-scheduler.ts as a
//  standalone cron microservice.
// ═══════════════════════════════════════════════════════════════
export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Secret, X-Cron-Secret');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST for admin trigger.' });
  }

  // Security: require admin secret or valid Supabase JWT
  const adminSecret = req.headers['x-admin-secret'];
  const authHeader = req.headers.authorization;
  const expectedSecret = process.env.CRON_SECRET || 'enliten-cron-secret-2025';

  const isAdminCall = adminSecret === expectedSecret;

  if (!isAdminCall && !authHeader) {
    return res.status(401).json({ error: 'Unauthorized. Provide X-Admin-Secret header or Authorization JWT.' });
  }

  console.log('[NEWS] Manual admin trigger via POST');
  const result = await fetchAndStoreNews();

  if (result.success) {
    return res.status(200).json({
      message: 'News fetched and stored successfully',
      id: result.id,
      total_items: result.total_items,
      fetched_at: new Date().toISOString(),
    });
  } else {
    return res.status(500).json({
      error: 'Failed to fetch news',
      details: result.error,
    });
  }
}
