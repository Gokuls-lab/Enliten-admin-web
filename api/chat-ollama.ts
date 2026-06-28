import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');
const { parseOffice } = require('officeparser');
const IS_LOCAL_LLM = false;
const LLM_BASE_URL = IS_LOCAL_LLM ? 'http://127.0.0.1:11434/v1' : 'https://openrouter.ai/api/v1';
// ═══════════════════════════════════════════════════════════════
//  Tool Definitions — UUID-free, model-friendly
// ═══════════════════════════════════════════════════════════════
const MENTOR_TOOLS: any[] = [
  {
    type: 'function',
    function: {
      name: 'get_student_overview',
      description:
        'Get a comprehensive overview of the student: total questions answered, accuracy rate, study streak, last studied date, and overall progress. Call this first when the user asks about "my progress" or "how am I doing".',
      parameters: {
        type: 'object',
        properties: {
          dummy: {
            type: 'string',
            description: 'Optional placeholder parameter to ignore.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_quiz_history',
      description:
        'Get the student\'s recent quiz sessions. Returns score, quiz type, exam name, time taken, and date for each session. Use when the user asks "show my quizzes", "my recent tests", or "quiz history".',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Number of recent sessions to fetch. Defaults to 5. Max 20.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_recent_quiz_review',
      description:
        'Get a detailed review of the student\'s most recent quiz session, including the exact questions asked, what they selected, and the actual correct options. Use when the user asks "what did I get wrong", "review my last test", or wants question-by-question analysis.',
      parameters: {
        type: 'object',
        properties: {
          rank: {
            type: 'number',
            description: 'Which recent quiz to review. 1 is the most recent (default), 2 is the second most recent, etc.',
          }
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_subject_performance',
      description:
        'Get the student\'s accuracy and attempt count broken down by each subject (e.g., Physics, Biology, History). Use when the user asks "which subjects am I weak in", "subject analysis", "my strengths", etc.',
      parameters: {
        type: 'object',
        properties: {
          dummy: {
            type: 'string',
            description: 'Optional placeholder parameter to ignore.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_weak_subjects',
      description:
        'Get the student\'s weakest subjects ranked by lowest accuracy. Use when the user asks "where should I improve", "weak areas", "what to focus on".',
      parameters: {
        type: 'object',
        properties: {
          top_n: {
            type: 'number',
            description: 'Number of weakest subjects to return. Defaults to 3.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_score_trend',
      description:
        'Get the student\'s quiz score trend over time (chronological). Use for progress graphs and "am I improving" questions.',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Number of recent quiz sessions to include in the trend. Defaults to 10.',
          },
        },
      },
    },
  },
  {
    type: 'openrouter:web_search',
    parameters: {
      engine: 'native'
    }
  }
];

// ═══════════════════════════════════════════════════════════════
//  Tool Executor — Runs queries using the user's JWT via RLS
// ═══════════════════════════════════════════════════════════════
async function executeTool(
  toolName: string,
  args: any,
  supabase: any,
  userId: string
): Promise<string> {
  console.log(`[TOOL] Executing: ${toolName}`, args);

  try {
    switch (toolName) {
      // ── 1. Student Overview ──────────────────────────────
      case 'get_student_overview': {
        const [progressRes, sessionsRes, answersRes] = await Promise.all([
          supabase.from('user_progress').select('*').eq('user_id', userId).maybeSingle(),
          supabase.from('quiz_sessions').select('id, score, total_questions').eq('user_id', userId),
          supabase.from('user_answers').select('is_correct').eq('user_id', userId),
        ]);

        const progress = progressRes.data;
        const sessions = sessionsRes.data || [];
        const answers = answersRes.data || [];

        const totalAnswers = answers.length;
        const correctAnswers = answers.filter((a: any) => a.is_correct).length;
        const accuracy = totalAnswers > 0 ? Math.round((correctAnswers / totalAnswers) * 100) : 0;

        const result = {
          total_quizzes_taken: sessions.length,
          total_questions_answered: progress?.questions_answered ?? totalAnswers,
          total_correct: progress?.questions_correct ?? correctAnswers,
          overall_accuracy: `${accuracy}%`,
          study_streak: progress?.study_streak ?? 0,
          last_studied: progress?.last_studied ?? null,
        };
        console.log(`[TOOL] ${toolName} result:`, result);
        return JSON.stringify(result);
      }

      // ── 2. Quiz History ──────────────────────────────────
      case 'get_quiz_history': {
        const limit = Math.min(args.limit || 5, 20);
        const { data, error } = await supabase
          .from('quiz_sessions')
          .select('quiz_type, score, total_questions, time_taken_seconds, completed_at, exam_id')
          .eq('user_id', userId)
          .order('completed_at', { ascending: false })
          .limit(limit);

        if (error) {
          console.error(`[TOOL] ${toolName} error:`, error);
          return JSON.stringify({ error: error.message });
        }

        // Resolve exam names in batch
        const examIds = [...new Set((data || []).map((s: any) => s.exam_id).filter(Boolean))];
        let examMap: Record<string, string> = {};
        if (examIds.length > 0) {
          const { data: exams } = await supabase.from('exams').select('id, title').in('id', examIds);
          (exams || []).forEach((e: any) => { examMap[e.id] = e.title; });
        }

        const sessions = (data || []).map((s: any, i: number) => ({
          rank: i + 1,
          quiz_type: s.quiz_type,
          score: s.score,
          total_questions: s.total_questions,
          accuracy: s.total_questions > 0 ? `${Math.round((s.score / s.total_questions) * 100)}%` : 'N/A',
          time_taken: `${Math.floor((s.time_taken_seconds || 0) / 60)}m ${(s.time_taken_seconds || 0) % 60}s`,
          exam: examMap[s.exam_id] || 'General',
          date: s.completed_at,
        }));

        console.log(`[TOOL] ${toolName} result: ${sessions.length} sessions`);
        return JSON.stringify(sessions);
      }

      // ── 2.5. Recent Quiz Review ───────────────────────────
      case 'get_recent_quiz_review': {
        const rank = Math.max(1, args.rank || 1);

        // Find the quiz session ID
        const { data: sessionData, error: sessionError } = await supabase
          .from('quiz_sessions')
          .select('id, quiz_type, completed_at, exams(title)')
          .eq('user_id', userId)
          .order('completed_at', { ascending: false })
          .range(rank - 1, rank - 1)
          .single();

        if (sessionError || !sessionData) {
          return JSON.stringify({ error: sessionError ? sessionError.message : 'No quiz session found at that rank.' });
        }

        // Fetch answers for this session
        const { data: answers, error: ansError } = await supabase
          .from('user_answers')
          .select('is_correct, selected_option_id, questions(id, question_text, explanation, subject_id)')
          .eq('user_id', userId)
          .eq('quiz_session_id', sessionData.id);

        if (ansError) {
          return JSON.stringify({ error: ansError.message });
        }

        // We need options for these questions to show what they picked vs what was correct
        const questionIds = [...new Set((answers || []).map((a: any) => a.questions?.id).filter(Boolean))];
        let optionsMap: Record<string, any[]> = {};
        if (questionIds.length > 0) {
          const { data: opts } = await supabase
            .from('question_options')
            .select('id, question_id, option_text, is_correct')
            .in('question_id', questionIds);

          (opts || []).forEach((o: any) => {
            if (!optionsMap[o.question_id]) optionsMap[o.question_id] = [];
            optionsMap[o.question_id].push(o);
          });
        }

        // Resolve subject names
        const subjectIds = [...new Set((answers || []).map((a: any) => a.questions?.subject_id).filter(Boolean))];
        let subjectMap: Record<string, string> = {};
        if (subjectIds.length > 0) {
          const { data: subs } = await supabase.from('subjects').select('id, name').in('id', subjectIds);
          (subs || []).forEach((s: any) => { subjectMap[s.id] = s.name; });
        }

        const examName = sessionData.exams?.title || 'General';

        const reviewData = {
          quiz_type: sessionData.quiz_type,
          exam: examName,
          date: sessionData.completed_at,
          questions: (answers || []).map((ans: any, i: number) => {
            const q = ans.questions;
            const opts = optionsMap[q?.id] || [];
            const correctOpt = opts.find((o: any) => o.is_correct);
            const selectedOpt = opts.find((o: any) => o.id === ans.selected_option_id);

            return {
              no: i + 1,
              subject: subjectMap[q?.subject_id] || 'Unknown',
              question: q?.question_text,
              is_correct: ans.is_correct,
              user_selected: selectedOpt ? selectedOpt.option_text : 'Skipped/None',
              correct_answer: correctOpt ? correctOpt.option_text : 'Unknown',
              explanation: q?.explanation
            };
          })
        };

        console.log(`[TOOL] ${toolName} result: ${reviewData.questions?.length} questions reviewed`);
        return JSON.stringify(reviewData);
      }

      // ── 3. Subject Performance ───────────────────────────
      case 'get_subject_performance': {
        const { data, error } = await supabase
          .from('user_answers')
          .select('is_correct, questions(subject_id)')
          .eq('user_id', userId);

        if (error) {
          console.error(`[TOOL] ${toolName} error:`, error);
          return JSON.stringify({ error: error.message });
        }

        // Collect subject IDs
        const subjectIds = [...new Set((data || []).map((a: any) => a.questions?.subject_id).filter(Boolean))];
        let subjectMap: Record<string, string> = {};
        if (subjectIds.length > 0) {
          const { data: subs } = await supabase.from('subjects').select('id, name').in('id', subjectIds);
          (subs || []).forEach((s: any) => { subjectMap[s.id] = s.name; });
        }

        const analysis: Record<string, { correct: number; total: number }> = {};
        (data || []).forEach((ans: any) => {
          const subId = ans.questions?.subject_id;
          const subName = subjectMap[subId] || 'Unknown';
          if (!analysis[subName]) analysis[subName] = { correct: 0, total: 0 };
          analysis[subName].total++;
          if (ans.is_correct) analysis[subName].correct++;
        });

        const result = Object.entries(analysis)
          .map(([subject, stats]) => ({
            subject,
            accuracy: `${Math.round((stats.correct / stats.total) * 100)}%`,
            correct: stats.correct,
            total_attempted: stats.total,
          }))
          .sort((a, b) => parseInt(b.accuracy) - parseInt(a.accuracy));

        console.log(`[TOOL] ${toolName} result:`, result);
        return JSON.stringify(result);
      }

      // ── 4. Weak Subjects ─────────────────────────────────
      case 'get_weak_subjects': {
        const topN = args.top_n || 3;

        const { data, error } = await supabase
          .from('user_answers')
          .select('is_correct, questions(subject_id)')
          .eq('user_id', userId);

        if (error) {
          console.error(`[TOOL] ${toolName} error:`, error);
          return JSON.stringify({ error: error.message });
        }

        const subjectIds = [...new Set((data || []).map((a: any) => a.questions?.subject_id).filter(Boolean))];
        let subjectMap: Record<string, string> = {};
        if (subjectIds.length > 0) {
          const { data: subs } = await supabase.from('subjects').select('id, name').in('id', subjectIds);
          (subs || []).forEach((s: any) => { subjectMap[s.id] = s.name; });
        }

        const analysis: Record<string, { correct: number; total: number }> = {};
        (data || []).forEach((ans: any) => {
          const subId = ans.questions?.subject_id;
          const subName = subjectMap[subId] || 'Unknown';
          if (!analysis[subName]) analysis[subName] = { correct: 0, total: 0 };
          analysis[subName].total++;
          if (ans.is_correct) analysis[subName].correct++;
        });

        const result = Object.entries(analysis)
          .map(([subject, stats]) => ({
            subject,
            accuracy_pct: Math.round((stats.correct / stats.total) * 100),
            correct: stats.correct,
            total_attempted: stats.total,
            recommendation: Math.round((stats.correct / stats.total) * 100) < 50
              ? 'Needs significant improvement — revise fundamentals'
              : Math.round((stats.correct / stats.total) * 100) < 75
                ? 'Moderate — practice more questions'
                : 'Strong — maintain with periodic revision',
          }))
          .sort((a, b) => a.accuracy_pct - b.accuracy_pct)
          .slice(0, topN);

        console.log(`[TOOL] ${toolName} result:`, result);
        return JSON.stringify(result);
      }

      // ── 5. Score Trend ───────────────────────────────────
      case 'get_score_trend': {
        const limit = Math.min(args.limit || 10, 20);
        const { data, error } = await supabase
          .from('quiz_sessions')
          .select('score, total_questions, completed_at, quiz_type')
          .eq('user_id', userId)
          .gt('total_questions', 0)
          .order('completed_at', { ascending: true })
          .limit(limit);

        if (error) {
          console.error(`[TOOL] ${toolName} error:`, error);
          return JSON.stringify({ error: error.message });
        }

        const trend = (data || []).map((s: any, i: number) => ({
          session: i + 1,
          score_pct: Math.round((s.score / s.total_questions) * 100),
          score: `${s.score}/${s.total_questions}`,
          quiz_type: s.quiz_type,
          date: s.completed_at,
        }));

        console.log(`[TOOL] ${toolName} result: ${trend.length} data points`);
        return JSON.stringify(trend);
      }
      case 'openrouter:web_search': {
        console.log(`[TOOL] Intercepted web search. OpenRouter should handle this server-side.`);
        return JSON.stringify({
          note: "This search was processed, continue answering the student's question based on the web results provided in your context."
        });
      }

      default:
        console.warn(`[TOOL] Unknown tool: ${toolName}`);
        return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }
  } catch (err: any) {
    console.error(`[TOOL] Exception in ${toolName}:`, err);
    return JSON.stringify({ error: `Tool execution failed: ${err.message}` });
  }
}

// ═══════════════════════════════════════════════════════════════
//  Image URL Validator — strips hallucinated image URLs
// ═══════════════════════════════════════════════════════════════
async function validateImageUrls(text: string): Promise<{ cleaned: string; removed: number }> {
  const imageMarkdownRegex = /!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g;
  const matches: { full: string; url: string }[] = [];
  let match;
  while ((match = imageMarkdownRegex.exec(text)) !== null) {
    matches.push({ full: match[0], url: match[2] });
  }

  if (matches.length === 0) return { cleaned: text, removed: 0 };

  console.log(`[IMG_VALIDATE] Found ${matches.length} image(s) to validate`);

  const results = await Promise.allSettled(
    matches.map(async (m) => {
      try {
        const resp = await fetch(m.url, {
          method: 'HEAD',
          signal: AbortSignal.timeout(3000),
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EnlitenBot/1.0)' },
          redirect: 'follow',
        });
        const contentType = resp.headers.get('content-type') || '';
        const isValid = resp.ok && contentType.startsWith('image/');
        console.log(`[IMG_VALIDATE] ${m.url} → ${resp.status} (${contentType}) → ${isValid ? 'VALID' : 'INVALID'}`);
        return { ...m, valid: isValid };
      } catch (err: any) {
        console.log(`[IMG_VALIDATE] ${m.url} → FAILED (${err.message})`);
        return { ...m, valid: false };
      }
    })
  );

  let cleaned = text;
  let removed = 0;
  for (const r of results) {
    if (r.status === 'fulfilled' && !r.value.valid) {
      // Remove the invalid image markdown entirely (including any surrounding blank lines)
      cleaned = cleaned.replace(r.value.full, '');
      removed++;
    }
  }

  // Clean up leftover double blank lines from removed images
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  console.log(`[IMG_VALIDATE] Result: ${matches.length - removed} valid, ${removed} removed`);
  return { cleaned, removed };
}

// ═══════════════════════════════════════════════════════════════
//  Streaming tool-call accumulator (fixes name duplication bug)
// ═══════════════════════════════════════════════════════════════
function accumulateToolCalls(toolCalls: any[], delta: any) {
  if (!delta.tool_calls) return;
  for (const tc of delta.tool_calls) {
    const idx = tc.index;
    if (!toolCalls[idx]) {
      // First chunk for this tool call — SET (not append) the name
      toolCalls[idx] = {
        id: tc.id || '',
        type: 'function',
        function: { name: tc.function?.name || '', arguments: '' },
      };
    } else {
      // Subsequent chunks — only update if id was missing, only APPEND arguments
      if (tc.id && !toolCalls[idx].id) toolCalls[idx].id = tc.id;
      if (tc.function?.name && !toolCalls[idx].function.name) {
        toolCalls[idx].function.name = tc.function.name;
      }
    }
    // Arguments are always appended (they stream in chunks)
    if (tc.function?.arguments) {
      toolCalls[idx].function.arguments += tc.function.arguments;
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  Vercel Serverless Config — extend timeout for streaming LLM
// ═══════════════════════════════════════════════════════════════
export const config = {
  maxDuration: 600, // 5 minutes (default is 30s which is too short for LLM streaming + tool loops)
};

// ═══════════════════════════════════════════════════════════════
//  Main Handler
// ═══════════════════════════════════════════════════════════════
export default async function handler(req: any, res: any) {
  // CORS Headers for Expo app
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.replace('Bearer ', '');

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://nufmkzmukwplugqvtiie.supabase.co';
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51Zm1rem11a3dwbHVncXZ0aWllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3Nzk3NzgsImV4cCI6MjA5MDM1NTc3OH0.-rYm-UnMSbEJQCowxU2RpvsNT3k27O2zH93D9ohZpz0';

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

  // Pre-flight check for user usage limit
  const { data: status, error: statusError } = await supabase.rpc('get_user_usage_status', { p_user_id: user.id });

  if (statusError) {
    console.error('Usage status error:', statusError);
    // Don't block completely on db error, but log it
  } else if (status?.is_blocked) {
    return res.status(429).json({
      error: 'Rate limit exceeded. Please wait for your window to refresh.',
      nextReset: status.five_hour.next_reset,
      limit_status: status
    });
  }

  const { message, thread_id, user_info, attachments, evaluation_context } = req.body;
  if (!message) return res.status(400).json({ error: 'Message is required' });


  // Validate attachments format if provided
  // attachments: [{ url, name, type, size, storage_path }]
  const validAttachments: any[] = Array.isArray(attachments) ? attachments.filter((a: any) => a && a.url && a.type) : [];

  const OLLAMA_MODEL = 'qwen3:4b-instruct-2507-q4_K_M';
  // const OLLAMA_MODEL = 'qwen3.5:4b';
  // const OLLAMA_MODEL = 'google/gemini-3-flash-preview'
  // const openai = new OpenAI({ baseURL: 'http://127.0.0.1:11434/v1', apiKey: 'ollama' });
  const openai = new OpenAI({ baseURL: LLM_BASE_URL, apiKey: IS_LOCAL_LLM ? 'ollama' : process.env.OPENROUTER_API_KEY });
  // sk - cv - bdccdc6877c24f558a2e9e10a60ad6f0
  // const openai = new OpenAI({ baseURL: 'https://openrouter.ai/api/v1', apiKey: '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' });

  //groq = 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
  //openadaptor = sk-cv-bdccdc6877c24f558a2e9e10a60ad6f0

  try {
    let studentName = 'Student';
    let studentEmail = user?.email;

    if (user_info) {
      studentName = user_info.full_name || 'Student';
      studentEmail = user_info.email || user?.email;
    } else {
      try {
        const { data: dbUser } = await supabase.from('users').select('full_name, email').eq('id', user.id).maybeSingle();
        studentName = dbUser?.full_name || user.user_metadata?.full_name || 'Student';
        studentEmail = dbUser?.email || user.email;
      } catch (e) {
        console.warn('Failed to fetch user fallback info from DB:', e);
      }
    }

    let currentThreadId = thread_id;

    // Create thread if needed
    if (!currentThreadId) {
      let title = 'Untitled';
      try {
        const titleRes = await openai.chat.completions.create({
          // model: IS_LOCAL_LLM ? OLLAMA_MODEL : 'google/gemini-2.5-flash-lite',
          model: IS_LOCAL_LLM ? OLLAMA_MODEL : 'openrouter/free',
          messages: [
            { role: 'system', content: 'You are a strict title generator. Your ONLY job is to output a 2-4 word title for the user\'s message. NEVER answer the user\'s question. NEVER write a full sentence. Output ONLY the raw title text.' },
            { role: 'user', content: message }
          ]
        });
        const gen = titleRes.choices[0]?.message?.content?.trim();
        if (gen) {
          title = gen.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^["']|["']$/g, '').trim();
        }
      } catch (e) { console.warn('Title gen failed', e); }

      const { data: threadData, error: threadError } = await supabase
        .from('ai_chat_threads').insert([{ user_id: user.id, title }]).select().single();
      if (threadError) throw threadError;
      currentThreadId = threadData.id;
    }

    // Save user message with attachments
    await supabase.from('ai_chat_messages').insert([{
      thread_id: currentThreadId,
      sender: 'user',
      text: message,
      attachments: validAttachments.length > 0 ? validAttachments : null,
    }]);

    // Fetch history
    const { data: historyData } = await supabase
      .from('ai_chat_messages').select('*').eq('thread_id', currentThreadId).order('created_at', { ascending: true });

    const chatMessages: any[] = [];
    for (const msg of (historyData || [])) {
      const role = (msg.sender === 'ai' ? 'assistant' : 'user') as 'assistant' | 'user';

      // If the message has attachments, build multimodal content
      if (msg.attachments && Array.isArray(msg.attachments) && msg.attachments.length > 0) {
        const contentParts: any[] = [];

        // Add text part
        if (msg.text) {
          contentParts.push({ type: 'text', text: msg.text });
        }

        // Add attachment parts
        for (const att of msg.attachments) {
          if (att.type && att.type.startsWith('image/')) {
            // Image attachments — use image_url with base64 for local vision models
            try {
              const res = await fetch(att.url);
              if (res.ok) {
                const arr = await res.arrayBuffer();
                const base64 = Buffer.from(arr).toString('base64');
                contentParts.push({
                  type: 'image_url',
                  image_url: { url: `data:${att.type};base64,${base64}` },
                });
              } else {
                contentParts.push({ type: 'text', text: `[Failed to load attached image: ${att.name}]` });
              }
            } catch (err) {
              console.error(`Failed to fetch image ${att.url}:`, err);
              contentParts.push({ type: 'text', text: `[Error loading attached image: ${att.name}]` });
            }
          } else {
            // Document attachments — include as text context with file info
            let attachmentText = `[Attached file: ${att.name} (${att.type}, ${Math.round((att.size || 0) / 1024)}KB)] — File URL: ${att.url}`;

            try {
              if (att.type === 'application/pdf') {
                const res = await fetch(att.url);
                if (res.ok) {
                  const arr = await res.arrayBuffer();
                  const data = await pdfParse(Buffer.from(arr));
                  const MAX_LEN = 15000;
                  const extracted = data.text.trim();
                  attachmentText += `\n\n--- FILE CONTENT START ---\n${extracted.substring(0, MAX_LEN)}${extracted.length > MAX_LEN ? '... (truncated)' : ''}\n--- FILE CONTENT END ---`;
                }
              } else if (att.type.startsWith('text/') || att.type === 'application/json' || att.name.endsWith('.csv') || att.name.endsWith('.md')) {
                const res = await fetch(att.url);
                if (res.ok) {
                  const text = await res.text();
                  const MAX_LEN = 15000;
                  attachmentText += `\n\n--- FILE CONTENT START ---\n${text.substring(0, MAX_LEN)}${text.length > MAX_LEN ? '... (truncated)' : ''}\n--- FILE CONTENT END ---`;
                }
              } else {
                const extMatch = att.name.match(/\.([a-zA-Z0-9]+)$/);
                const ext = extMatch ? extMatch[1].toLowerCase() : '';
                if (ext) {
                  const res = await fetch(att.url);
                  if (res.ok) {
                    const arr = await res.arrayBuffer();
                    try {
                      const ast = await parseOffice(Buffer.from(arr), { fileType: ext });
                      if (ast) {
                        const MAX_LEN = 15000;
                        const extracted = (typeof ast === 'string')
                          ? ast.trim()
                          : (ast.toText ? ast.toText().trim() : String(ast).trim());
                        attachmentText += `\n\n--- FILE CONTENT START ---\n${extracted.substring(0, MAX_LEN)}${extracted.length > MAX_LEN ? '... (truncated)' : ''}\n--- FILE CONTENT END ---`;
                      }
                    } catch (officeErr) {
                      console.warn(`OfficeParser could not parse ${att.name}:`, officeErr);
                    }
                  }
                }
              }
            } catch (err) {
              console.error(`Failed to parse text from ${att.url}:`, err);
            }

            contentParts.push({
              type: 'text',
              text: attachmentText,
            });
          }
        }

        chatMessages.push({ role, content: contentParts });
      } else {
        chatMessages.push({ role, content: msg.text });
      }
    }

    // ============================================================
    //  ENLITEN ACADEMY — TNPSC AI MENTOR SYSTEM PROMPT
    //  World-class, pedagogically engineered, production-ready
    // ============================================================

    const TNPSC_SYSTEM_PROMPT = `
<identity>
You are an AI Mentor powering Enliten Academy, purpose-built for TNPSC exam aspirants. You are not a general assistant; you are a precision-engineered study partner who combines the knowledge of a TNPSC subject expert, the instincts of an experienced teacher, and the clarity of a top coaching institute — all personalized to one student.

Your three non-negotiable principles:
1. PRECISION — TNPSC answers are correct or incorrect; never approximate, never speculate
2. CLARITY — every explanation must *land*, not just sound complete
3. MOMENTUM — every interaction must leave the student more capable AND more confident than before
</identity>


<exam_coverage>
You possess deep, current, exam-accurate knowledge across:

GROUPS:
• Group 1 — Combined Civil Services (Prelims → Mains 9 papers → Interview)
• Group 2 — Direct Recruitment (Prelims → Mains, no interview)
• Group 2A — Direct Recruitment (Prelims → Mains, no interview)
• Group 4 — VAO, LDC, Junior Assistant (Combined Objective Paper only)

CORE SUBJECT UNITS:
1. General Science — Physics, Chemistry, Biology, Environmental Science, Sci & Tech
2. Current Events — National, International, Tamil Nadu state level
3. Geography — Indian + Tamil Nadu geography (rivers, dams, districts, terrain, soil types)
4. History & Culture — Ancient, Medieval, Modern India + Tamil Nadu heritage
5. Indian Polity & Constitution — Articles, Amendments, Schedules, Judicial review, Governance
6. Indian Economy — Budget, GDP, Five-Year Plans, NITI Aayog, welfare schemes, poverty metrics
7. Indian National Movement — Freedom struggle, key leaders, dates, major events
8. Unit 8 — Aptitude & Mental Ability — Reasoning, number series, data sufficiency, verbal ability
9. Tamil Language & Tamil Literature — Classical Tamil, Sangam literature, Thirukkural, modern Tamil
10. General English — Grammar, comprehension, vocabulary (Groups 1 & 2)

HIGH-YIELD TNPSC-SPECIFIC ZONES (questions cluster here — treat as priority):
• Tamil Nadu Chief Minister's flagship schemes & welfare programs (current year-aware)
• Tamil Nadu state budget figures, economic indicators, key state statistics
• Tamil Nadu districts — formation years, revenue divisions, taluk structure
• Sangam Age: Akam/Puram divisions, Five Epics (Aintilakkiyam), Thirukkural (chapter + verse themes)
• Dravidian Movement — Periyar, Ambedkar, E. V. Ramasamy, Justice Party
• Tamil Nadu-specific Acts: Tamil Nadu Panchayati Raj Act, TN Prohibition Act, TN Shops Act
• State-level Polity: Governor's role, TN Legislative Assembly, Tamil Nadu PSC structure
• Key TNPSC repeat themes: Match-the-following on dynasties, Arrange-chronologically on national movement
</exam_coverage>


<language_intelligence>
BILINGUAL PROTOCOL:
• Default language: English
• If the student writes in Tamil (தமிழ்): respond entirely in Tamil, using English only for untranslatable technical/legal terms
• For Tamil Nadu-specific topics, naturally weave in Tamil script or romanized terms:
  e.g., "Akam (அகம்) poetry deals with love themes; Puram (புறம்) deals with heroism"
• For memory aids: suggest Tamil-language mnemonics or phonetic memory hooks where they are stronger than English equivalents
• Never artificially translate well-established English TNPSC terms (e.g., "Judicial Review", "Directive Principles of State Policy", "Separation of Powers")
</language_intelligence>


<pedagogy>
Apply these teaching methods intelligently based on context — do not apply all of them to every response:

── ACTIVE RECALL PROBING ──
When a student says they've studied a topic, probe before re-explaining:
"Before I walk through this — tell me what you already remember about [concept]. Testing your recall strengthens retention more than re-reading."

── SOCRATIC QUESTIONING ──
For conceptual "why" or "how" questions, lead with a guiding question:
Student: "Why did the Doctrine of Lapse fail in the long run?"
You: "Think about it — how would Indian rulers react when their adopted sons could not inherit the throne? What does that do to British-Indian political relations?"
Then reveal the answer after a moment, or when the student responds.

── 3-STEP ERROR CORRECTION ──
When a student answers incorrectly (after a quiz or conversation):
  Step 1 — Normalize the mistake: "That's one of the most common mix-ups in this topic."
  Step 2 — Diagnose the root misconception specifically (don't just say "that's wrong")
  Step 3 — Deliver the correct concept with a memory anchor or visual hook
Never just state "The correct answer is X." Always explain the why.

── SPACED REPETITION TRIGGERS ──
When you detect a student revisiting a topic they've covered before, add:
"(Quick — before I explain, this is a great moment to test your recall first!)" and launch a 1-question quiz.
Use maximum once per session to avoid over-triggering.

── DIFFICULTY CALIBRATION ──
• Student scoring 80%+ consistently → escalate to Group 1 difficulty, analytical questions
• Student scoring below 50% → step back to fundamentals; use real-life Tamil Nadu analogies before abstractions
• Group 4 students → prioritize objective speed + accuracy over depth; time-per-question focus

── TNPSC EXAM FRAMING ──
After any concept explanation, optionally add:
**TNPSC Angle:** "This topic typically appears as [match-the-following / chronological order / direct fact] — here's how to spot it in the paper."

── CONCEPTUAL ANCHORING ──
For abstract topics (Fundamental Rights, Five-Year Plans, Constitutional Amendments), always anchor to a concrete Tamil Nadu real-world example the student would recognize before abstracting to the national level.
</pedagogy>


<generative_ui>
You support inline Generative UI elements rendered natively in the Enliten app.

CRITICAL RULES:
• NEVER announce these tools. Do NOT say "I'll generate a quiz" or "let me create a chart." Embed them organically.
• UI tags must be valid JSON — malformed JSON breaks the renderer.
• Only chart real data (from tools or student-provided). Never fabricate data values.
• Maximum one QUIZ_UI and one CHART_UI per response unless the student explicitly asks for more.


━━━━━━━━━━━━━━━━━━━━━━━━━━
UI 1 — QUIZ_UI
━━━━━━━━━━━━━━━━━━━━━━━━━━
Trigger when:
  ✓ Student asks to be tested, quizzed, or wants practice questions
  ✓ After explaining a topic — embed 1-2 reinforcement questions
  ✓ After an error — 1 targeted re-check question
  ✓ To diagnose knowledge level at the start of a topic

Question design rules:
  • Rotate formats: direct fact → application → assertion-reason → match-the-following
  • For match-the-following: options look like "A-2, B-3, C-1, D-4"
  • Explanation must teach — explain why correct AND why the primary distractor is wrong
  • Add difficulty in the title: "Easy", "Medium", "Hard", or "Group 1 Level"

<QUIZ_UI>{"title":"[Subject] — [Difficulty]","questions":[{"id":1,"question":"Full TNPSC-style question text?","options":["Option A","Option B","Option C","Option D"],"correctIndex":0,"explanation":"Why this is correct. Why the most common wrong choice (distractor) is wrong. Memory hook to prevent future errors."}]}</QUIZ_UI>


━━━━━━━━━━━━━━━━━━━━━━━━━━
UI 2 — CHART_UI
━━━━━━━━━━━━━━━━━━━━━━━━━━
Trigger → Chart type mapping:
  Subject-wise performance scores        → "bar"      (capsule bar, comparative)
  Score trend across test sessions       → "line"     (area chart with smooth curve)
  Study time or syllabus topic split     → "donut"    (segmented circle with legend)
  Single subject completion / goal       → "progress" (concentric rings)
  Subject coverage proportions           → "pie"
  Weekly accuracy improvement            → "line"

Color convention:
  Strong performance  → #22C55E (green)
  Improving           → #F59E0B (amber)
  Needs attention     → #EF4444 (red)
  Neutral / general   → #38BDF8 (sky blue)

Suffix convention:
  Accuracy / completion %   → yAxisSuffix: "%"
  Test scores               → yAxisSuffix: " pts"
  Hours studied             → yAxisSuffix: " hr"

After every chart, add 1 line of sharp insight:
  e.g., "History is your strongest subject — shift 30% of your remaining time to Current Affairs."

<CHART_UI>{"title":"Chart Title","type":"bar","yAxisSuffix":"%","data":[{"label":"History","value":82,"color":"#22C55E"},{"label":"Polity","value":61,"color":"#F59E0B"},{"label":"Current Affairs","value":44,"color":"#EF4444"}]}</CHART_UI>


━━━━━━━━━━━━━━━━━━━━━━━━━━
UI 3 — TIMELINE_UI
━━━━━━━━━━━━━━━━━━━━━━━━━━
Trigger when:
  ✓ Creating a weekly/monthly study plan or revision schedule
  ✓ Explaining a historical sequence (dynasties, national movement, Five-Year Plans)
  ✓ Mapping exam preparation phases (Foundation → Practice → Revision → Mocks)
  ✓ Showing the TNPSC exam lifecycle (Notification → Prelims → Mains → Counselling)
  ✓ Breaking down any multi-stage legislative or constitutional process

Rules:
  • Maximum 8 steps — summarize or combine if more needed
  • Study plan steps: actionable and time-bound ("Complete Units 3 & 4; take 1 mock")
  • Historical steps: include year/date in the title field
  • Descriptions should be dense with relevant facts, not vague

<TIMELINE_UI>{"title":"Timeline Title","steps":[{"id":1,"title":"1919 — Rowlatt Act","description":"British law allowing detention without trial. Triggered widespread protests across India, directly leading to the Jallianwala Bagh massacre."}]}</TIMELINE_UI>
</generative_ui>


<student_profile>
Student Name: ${studentName}

PERSONALIZATION RULES:
• Use ${studentName}'s name in: opening greetings, after quiz results, after corrections, when celebrating a milestone
• Never use the name robotically — maximum 2-3 times per response, always meaningfully
• Vary all encouragement — never repeat the same motivational phrase twice in a row
• Adapt explanation depth based on what the student reveals about their knowledge during the conversation
• If the student mentions their target group (1, 2, 2A, 4) or exam date, factor that into all advice
</student_profile>


<tool_protocol>
TOOL CALL SEQUENCING — strictly follow this order:
  1. Call ALL required tools BEFORE writing any analysis
  2. Never narrate tool usage ("Let me check your data..." → just call it silently)
  3. For broad questions ("how am I doing?") → combine data from multiple tools, then synthesize

CALL RULES:
  • No-parameter tools: call normally, never append "{}" to the function name
  • Never invent IDs (exam IDs, session IDs) — tools resolve them automatically
  • Never guess data values — if a tool returns empty, acknowledge it honestly

DATA → VISUALIZATION MAPPING:
  Subject-wise accuracy returned     → CHART_UI bar chart, color-coded by strength
  Score across multiple sessions     → CHART_UI line chart (trend line)
  Time spent per subject             → CHART_UI donut chart
  Syllabus completion percentage     → CHART_UI progress rings
  Weak topics list                   → summarize in text, then offer a targeted quiz

EMPTY DATA PROTOCOL:
  "There's no test data yet — once you complete your first mock test, I'll generate a full performance breakdown with charts."

CURRENT AFFAIRS & LIVE DATA RULE:
  ALWAYS use openrouter:web_search for:
    • TNPSC exam dates, notifications, syllabus updates
    • New government scheme names, budget figures, welfare program details
    • Current year statistics (GDP, poverty rate, census data)
    • Any fact that changes year-to-year
  After searching, cite sources naturally inline as markdown links.
  Format: [source name](URL) — use the actual URLs from the search results provided to you.
  Example: [The Hindu](https://www.thehindu.com/news/national/article12345.ece)
  CRITICAL: Only use URLs that were returned by the web search tool. NEVER fabricate, guess, or construct URLs from memory. If you don't have a real URL from search results, omit the link rather than inventing one.
  Place all source links at the END of your response under a "**Sources:**" heading.
  Never omit the URLs — the app renders them as clickable source buttons for the student.
  Never state current affairs facts from training memory alone.
</tool_protocol>


<response_format>
RESPONSE LENGTH — match to query type:
  Simple factual question               → 2-4 lines, direct answer first
  Conceptual explanation                → Structured: heading + explanation + TN example + TNPSC angle
  Broad performance analysis            → Tool call → CHART_UI → paragraph insight
  Study plan request                    → TIMELINE_UI + brief rationale per phase
  Error correction                      → 3-step correction (normalize → diagnose → anchor)
  Motivational check-in                 → Personal, specific, grounded in their actual progress

FORMATTING RULES:
  • **Bold** — key terms, Article numbers, Act names, landmark judgements
  • > Blockquotes — Thirukkural lines, Preamble text, important constitutional phrases
  • Numbered lists — sequences, steps, chronological orders
  • Bullet points — non-sequential lists, features, comparisons
  • Images — You MAY include relevant images using markdown: ![description](url)
    Proactively include images when they genuinely enhance understanding — do NOT wait for the student to ask:
    ✓ Scientific diagrams (human heart, solar system, cell structure)
    ✓ Maps when discussing Tamil Nadu geography, rivers, districts
    ✓ Historical photos or illustrations for national movement events
    ✓ Infographics for economic data, government schemes
    RULES:
    - ONLY use image URLs that appear in web search results returned to you. Copy the exact URL from the search results.
    - NEVER construct, guess, or modify image URLs. Do not try to build Wikipedia Commons thumbnail URLs from memory.
    - If no image URL was returned in search results, do NOT include any images — skip them entirely.
    - The server validates all image URLs. Invalid ones are automatically stripped, so fabricated URLs will simply disappear.
  • Avoid over-formatting simple responses — a direct fact question gets a direct sentence answer

HEADING STRUCTURE:
  ## Main Section    (H2 — for multi-part explanations)
  ### Sub-section    (H3 — for breakdown within a section)

CLOSING LINE RULE:
  For motivational endings — make it specific, never generic:
  ✓ "You've covered 40% of polity this week — the next 10% is lighter territory."
  ✗ "Keep studying, you can do it!"
  Never end with "Would you like me to quiz you?" unless the student has just finished a heavy explanation and needs a natural next step.
</response_format>


<exam_strategy>
GROUP-SPECIFIC COACHING MODES:

GROUP 1 ASPIRANTS:
• Depth over breadth — analytical understanding beats rote memorization
• Mains answer writing structure: Point → Explanation → Example → Significance
• Current affairs depth: consistent 18-month reading habit required
• Emphasize: essay writing, interview awareness, inter-disciplinary connections

GROUP 2 / 2A ASPIRANTS:
• Target accuracy: 65%+ in GS, 70%+ in Aptitude for competitive cutoff
• Time strategy: 1.5 minutes per question average
• High-ROI: Tamil Nadu-specific questions often appear 25-30% of the paper
• Focus on previous 5-year TNPSC question bank — themes repeat

GROUP 4 ASPIRANTS:
• Objective paper only — speed + accuracy over analytical depth
• Elimination technique: always advise using it on unfamiliar questions
• Tamil Nadu content is disproportionately weighted — make it the top priority
• Last-30-day strategy: daily 100-question timed mock tests > any new reading

UNIVERSAL STRATEGIES (all groups):
• Previous year papers = highest ROI study material (TNPSC recycles question themes every 3-4 years)
• Last 3 months before exam: shift entirely from learning to retrieval practice
• Spaced repetition > re-reading for factual retention
• Mock test debrief is more valuable than the mock test itself
</exam_strategy>


<guardrails>
KNOWLEDGE CONFIDENCE PROTOCOL:
  CERTAIN     → Stable constitutional facts, historical dates, established science
  CAVEAT      → TNPSC "expected" question predictions, coaching tips, cutoff estimates
  MUST SEARCH → Exam dates, new scheme names, budget figures, TNPSC notifications, anything year-specific

WHEN YOU DON'T KNOW SOMETHING:
  Say directly: "I want to give you accurate information on this — let me search for the latest data."
  Then use web_search. NEVER fabricate facts for a competitive exam. Wrong TNPSC preparation causes real harm.

FORBIDDEN BEHAVIORS:
  ✗ Never say "Great question!" or hollow affirmations — be warm but genuine
  ✗ Never pad responses with filler text to appear thorough
  ✗ Never state current affairs data from memory without web_search verification
  ✗ Never generate UI elements just because you can — only when they add real value
  ✗ Never tell the student they got something right if they got it wrong
  ✗ Never repeat the same motivational line twice in a conversation
  ✗ Never overwhelm a struggling student with a wall of information — simplify first

STUDENT WELLBEING:
  If a student expresses exam anxiety, frustration, or burnout: pause the academic content.
  Acknowledge it directly, briefly normalize it (TNPSC preparation is genuinely demanding),
  then offer a concrete small action: "Let's do just 5 questions right now — small wins rebuild momentum."
  Never dismiss stress or immediately pivot back to study content.
</guardrails>
`;

    // ── SSE STREAMING ──
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    let clientConnected = true;
    req.on('close', () => {
      console.log(`[STREAM] Client disconnected for thread ${currentThreadId}. Continuing in background to save to DB.`);
      clientConnected = false;
    });

    const safeWrite = (data: string) => {
      if (clientConnected && res.writable && !res.writableEnded) {
        try {
          res.write(data);
        } catch (e) {
          console.warn('[STREAM] Failed to write to client (likely disconnected).');
          clientConnected = false;
        }
      }
    };

    const safeEnd = () => {
      if (clientConnected && res.writable && !res.writableEnded) {
        try {
          res.end();
        } catch (e) {
          console.warn('[STREAM] Failed to end stream.');
          clientConnected = false;
        }
      }
    };

    // Send thread_id immediately
    safeWrite(`data: ${JSON.stringify({ type: 'thread_id', thread_id: currentThreadId })}\n\n`);

    // ── AGENTIC TOOL LOOP ──
    // The model can call tools, we execute them and feed results back.
    // We loop up to MAX_TOOL_ROUNDS to prevent infinite loops.
    const MAX_TOOL_ROUNDS = 3;
    let messages: any[] = [{ role: 'system', content: TNPSC_SYSTEM_PROMPT }, ...chatMessages];

    // Inject evaluation context if provided (hidden from frontend, injected only for LLM)
    if (evaluation_context) {
      const ctxStr = typeof evaluation_context === 'string' ? evaluation_context : JSON.stringify(evaluation_context, null, 2);
      messages.splice(1, 0, {
        role: 'system',
        content: `[EVALUATION CONTEXT — DO NOT show this raw data to the student. Use it to provide informed, personalized mentorship.]\n\nThe student's answer sheet was evaluated with the following results:\n\n${ctxStr}\n\n[END EVALUATION CONTEXT]`,
      });
    }
    let fullText = '';
    let streamAnnotations: any[] = [];

    let totalCostToLog = 0;
    let mainGenerationId = '';

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const isToolRound = round < MAX_TOOL_ROUNDS;

      console.log(`[STREAM] Round ${round}, tools=${isToolRound}`);

      const stream = await openai.chat.completions.create({
        model: IS_LOCAL_LLM ? OLLAMA_MODEL : 'google/gemini-3-flash-preview',
        messages,
        ...(isToolRound ? { tools: MENTOR_TOOLS } : {}),
        stream: true,
        stream_options: { include_usage: true },
      });

      let toolCalls: any[] = [];

      for await (const chunk of stream) {
        if (chunk.id && !mainGenerationId) {
          mainGenerationId = chunk.id;
        }
        if ((chunk as any).usage?.cost) {
          totalCostToLog += (chunk as any).usage.cost;
        } else if ((chunk as any).cost) {
          totalCostToLog += (chunk as any).cost;
        }

        const delta = chunk.choices && chunk.choices.length > 0 ? chunk.choices[0]?.delta : null;
        if (!delta) continue;

        // Capture annotations from streaming chunks (OpenRouter sends url_citation here)
        if ((delta as any).annotations) {
          streamAnnotations.push(...(delta as any).annotations);
        }
        // Also check for annotations at the choice level (some models attach them on final chunk)
        const choiceAny = chunk.choices[0] as any;
        if (choiceAny?.annotations) {
          streamAnnotations.push(...choiceAny.annotations);
        }

        if (delta.tool_calls) {
          accumulateToolCalls(toolCalls, delta);
        } else {
          const content = delta.content || '';
          if (content) {
            fullText += content;
            safeWrite(`data: ${JSON.stringify({ type: 'text', content })}\n\n`);
          }
        }
      }

      // If no tool calls, the model produced its final text — break
      if (toolCalls.length === 0) {
        console.log(`[STREAM] Round ${round} — no tool calls, done. Annotations collected: ${streamAnnotations.length}`);
        break;
      }

      // Execute tool calls
      const validToolCalls = toolCalls.filter(tc => tc && tc.id);
      console.log(`[TOOL] Round ${round} — ${validToolCalls.length} tool call(s):`,
        validToolCalls.map(tc => tc.function.name));

      safeWrite(`data: ${JSON.stringify({ type: 'status', status: 'Analyzing your data...' })}\n\n`);

      messages.push({ role: 'assistant', content: null, tool_calls: validToolCalls });

      for (const tc of validToolCalls) {
        let args: any = {};
        try { args = JSON.parse(tc.function.arguments || '{}'); } catch { }

        const result = await executeTool(tc.function.name, args, supabase, user.id);
        messages.push({ role: 'tool', tool_call_id: tc.id, content: result });
      }

      // Continue loop — next iteration will stream the model's response to the tool results
    }

    // Strip <think> tags for storage
    let cleanText = fullText.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

    // Validate image URLs — strip hallucinated/broken ones
    const { cleaned: validatedText, removed: removedImageCount } = await validateImageUrls(cleanText);
    if (removedImageCount > 0) {
      console.log(`[IMG_VALIDATE] Stripped ${removedImageCount} invalid image(s) from response`);
      cleanText = validatedText;
      // Send correction event so client can replace streamed text with validated version
      safeWrite(`data: ${JSON.stringify({ type: 'text_correction', content: cleanText })}\n\n`);
    }

    // DEBUG: Log the response text to see if model includes markdown links
    console.log(`[DEBUG] cleanText (first 500 chars):`, cleanText.substring(0, 500));
    console.log(`[DEBUG] fullText length: ${fullText.length}, cleanText length: ${cleanText.length}`);
    const debugLinks = cleanText.match(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g);
    console.log(`[DEBUG] Markdown links found:`, debugLinks || 'NONE');

    // --- Extract sources: prefer OpenRouter annotations, fallback to markdown links ---
    let dbSources: any = null;
    const seenUrls = new Set<string>();
    const groundingChunks: any[] = [];

    // 1. Primary: Use OpenRouter url_citation annotations (verified, real URLs)
    if (streamAnnotations.length > 0) {
      console.log(`[SOURCES] Found ${streamAnnotations.length} annotation(s) from OpenRouter`);
      for (const ann of streamAnnotations) {
        if (ann.type === 'url_citation' && ann.url_citation?.url) {
          const url = ann.url_citation.url;
          if (seenUrls.has(url)) continue;
          seenUrls.add(url);
          let title = ann.url_citation.title || '';
          try {
            const hostname = new URL(url).hostname.replace('www.', '');
            if (!title || title.startsWith('http') || title.length > 60) {
              title = hostname;
            }
          } catch (e) { }
          groundingChunks.push({
            web: { uri: url, title }
          });
        }
      }
    }

    // 2. Fallback: Parse markdown links from the response text
    //    (only if no annotations were found — annotations are more reliable)
    if (groundingChunks.length === 0) {
      const markdownLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
      let linkMatch;
      while ((linkMatch = markdownLinkRegex.exec(cleanText)) !== null) {
        const [, linkText, url] = linkMatch;
        if (seenUrls.has(url)) continue;
        seenUrls.add(url);
        let title = linkText;
        try {
          const hostname = new URL(url).hostname.replace('www.', '');
          if (title.startsWith('http') || title.length > 60) {
            title = hostname;
          }
        } catch (e) { }
        groundingChunks.push({
          web: { uri: url, title }
        });
      }
    }

    if (groundingChunks.length > 0) {
      dbSources = { groundingChunks };
      console.log(`[SOURCES] Final: ${groundingChunks.length} citation(s) extracted`);
    }
    // ------------------------------------------------------------------

    // Generate follow-up questions (non-streaming)
    let followUpQuestions: string[] = [];
    try {
      safeWrite(`data: ${JSON.stringify({ type: 'status', status: 'Generating follow-ups...' })}\n\n`);
      const fqRes = await openai.chat.completions.create({
        model: IS_LOCAL_LLM ? OLLAMA_MODEL : 'google/gemini-3-flash-preview',
        messages: [
          ...chatMessages,
          { role: 'assistant', content: cleanText },
          { role: 'user', content: 'Based on the conversation above, generate exactly 3 concise follow-up questions that I (the student) might want to ask you (the AI mentor) next. Return ONLY a valid JSON array of strings like ["How does X work?", "Can you explain Y?", "What is Z?"]. Do not include any conversational text or prefixes. Output ONLY the JSON array.' }
        ]
      });
      let fqText = (fqRes.choices[0]?.message?.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      const first = fqText.indexOf('[');
      const last = fqText.lastIndexOf(']');
      if (first !== -1 && last !== -1) {
        try { followUpQuestions = JSON.parse(fqText.substring(first, last + 1)); } catch (e) { }
      }
      if (!Array.isArray(followUpQuestions)) followUpQuestions = [];

      if ((fqRes as any).usage?.cost) {
        totalCostToLog += (fqRes as any).usage.cost;
      }
    } catch (e) { console.warn('Follow-up gen failed', e); }

    // Save AI message to DB
    const { data: aiMsgData } = await supabase
      .from('ai_chat_messages')
      .insert([{ thread_id: currentThreadId, sender: 'ai', text: cleanText, sources: dbSources, follow_up_questions: followUpQuestions, attachments: null }])
      .select().single();

    // Send final done event
    safeWrite(`data: ${JSON.stringify({ type: 'done', thread_id: currentThreadId, message: aiMsgData })}\n\n`);
    safeEnd();

    // ── LOG USAGE COST (fire-and-forget after response) ──
    try {
      // If we couldn't capture the cost from the chunks natively, fallback to fetching from OpenRouter Generation API
      if (totalCostToLog === 0 && mainGenerationId && !IS_LOCAL_LLM) {
        try {
          const gr = await fetch(`https://openrouter.ai/api/v1/generation?id=${mainGenerationId}`, {
            headers: { "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}` }
          });
          const grData = await gr.json();
          if (grData?.data?.cost) {
            totalCostToLog += grData.data.cost;
          } else if (grData?.data?.total_cost) {
            totalCostToLog += grData.data.total_cost;
          }
        } catch (grErr) {
          console.warn('[USAGE] OpenRouter /generation API fetch failed', grErr);
        }
      }

      // Final fallback if absolutely nothing was found (prevent 0 logs for paid models)
      if (totalCostToLog === 0 && !IS_LOCAL_LLM) {
        const textLength = (fullText || '').length;
        totalCostToLog = Math.max((textLength / 4) * 0.0000005, 0.000001);
      }

      if (totalCostToLog > 0) {
        await supabase.from('user_usage_ledger').insert({
          user_id: user.id,
          cost_usd: totalCostToLog
        });
        console.log(`[USAGE] Logged exact OpenRouter cost: $${totalCostToLog.toFixed(6)}`);
      }
    } catch (costErr) {
      console.error('[USAGE] Failed to log cost:', costErr);
    }

  } catch (err: any) {
    console.error('Chat API Error:', err);
    if (res.headersSent) {
      if (res.writable && !res.writableEnded) {
        try {
          res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
          res.end();
        } catch (e) { }
      }
    } else {
      return res.status(500).json({ error: 'Internal server error', details: err.message });
    }
  }
}
