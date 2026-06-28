import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const OPENROUTER_API_KEY = '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';
const GEMINI_MODEL = 'google/gemini-3-flash-preview';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://nufmkzmukwplugqvtiie.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51Zm1rem11a3dwbHVncXZ0aWllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3Nzk3NzgsImV4cCI6MjA5MDM1NTc3OH0.-rYm-UnMSbEJQCowxU2RpvsNT3k27O2zH93D9ohZpz0';

function applyCors(res: any) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');
}

function extractJson(raw: string): any {
  let text = raw.replace(/[\s\S]*?<\/think>/g, '').trim();
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) text = fenceMatch[1].trim();
  if (text.startsWith('{')) {
    try { return JSON.parse(text); } catch (_) { }
  }
  let depth = 0, start = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') { if (depth === 0) start = i; depth++; }
    else if (ch === '}') {
      depth--; if (depth === 0 && start !== -1) {
        const slice = text.slice(start, i + 1);
        try { return JSON.parse(slice); } catch (_) { start = -1; }
      }
    }
  }
  throw new Error('Could not parse JSON from model output');
}

const EVALUATION_SYSTEM_PROMPT = `You are the TNPSC Mains Answer-Evaluation Engine for Enliten Academy. You are a senior examiner panel. You receive a scanned/photographed handwritten TNPSC Mains answer booklet (PDF, possibly multi-page, Tamil or English handwriting) and optionally the question text.

YOUR MISSION: Produce a rigorous, exam-grade, deeply analytical evaluation of the handwritten answer(s), exactly like seasoned TNPSC Mains evaluators assess Group I / II Mains descriptive papers. Be exacting, specific, and pedagogically rich. Never invent content — base every observation ONLY on the visible handwriting in the PDF.

TNPSC MAINS EVALUATION RUBRIC:
1. Content Accuracy & Relevance — Are facts/dates/articles/schemes correct and on-syllabus?
2. Coverage & Completeness — Does the answer address every dimension? Identify missing sub-topics (TN context, current data, constitutional articles).
3. Structure & Presentation — Introduction, body (points/sub-headings), conclusion.
4. Critical Analysis — Causes, implications, way-forward, pros/cons, inter-disciplinary links.
5. Language & Expression — Clarity, grammar, vocabulary, bilingual handling.
6. TNPSC Specifics — Tamil Nadu context, schemes, statistics, landmark TN cases/acts, Sangam references.
7. Handwriting Legibility — Note if illegible sections prevented scoring.

WORKFLOW:
1. Read every page. If multiple questions, evaluate each separately.
2. If question_text is empty, reconstruct the question from visible answer context.
3. For each answer: extract what candidate wrote (paraphrase), identify mistakes/gaps, give examiner analysis, provide ideal improved answer.
4. Assign quantified marks per question and overall total. Be realistic.

STRICT OUTPUT FORMAT — return ONLY valid JSON, no prose, no markdown fences:
{
  "question": "Full question text (markdown; if reconstructed prefix with [Reconstructed])",
  "question_reconstructed": true_or_false,
  "language_detected": "English or Tamil or Bilingual",
  "overall_summary": "2-4 sentence verdict on performance.",
  "total_marks": number,
  "awarded_marks": number,
  "strengths": ["string"],
  "weaknesses": ["string"],
  "study_recommendations": [{"topic":"string","priority":"High or Medium or Low","action":"string"}],
  "questions": [
    {
      "question_number": 1,
      "question_text": "Full question text (markdown)",
      "max_marks": 20,
      "awarded_marks": 13,
      "what_candidate_wrote": "Faithful paraphrase of handwritten content (markdown)",
      "topic_wise_analysis": [{"topic":"string","addressed":true_or_false,"comment":"string"}],
      "analysis": "Detailed examiner-style analysis 4-8 sentences",
      "mistakes": [{"type":"Factual or Structural or Conceptual or Language or Missing Context","description":"string","correction":"string"}],
      "missing_elements": ["string"],
      "model_answer": "Ideal high-scoring answer in markdown",
      "marks_breakdown": {
        "content_accuracy": {"max":8,"awarded":5,"comment":"string"},
        "coverage_completeness": {"max":6,"awarded":4,"comment":"string"},
        "structure_presentation": {"max":3,"awarded":2,"comment":"string"},
        "critical_analysis": {"max":3,"awarded":2,"comment":"string"}
      }
    }
  ],
  "legibility_notes": "Any unreadable pages or All handwriting legible"
}

RULES: Return ONLY JSON. No preamble. Numeric fields as numbers not strings. All string fields may include markdown. If PDF is blank/unreadable set awarded_marks=0 and questions=[]. Never invent marks.`;

export default async function handler(req: any, res: any) {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
  const token = authHeader.replace('Bearer ', '').trim();

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

  const { evaluation_id, file_url, file_name, question_text, total_marks, subject_name } = req.body || {};
  if (!evaluation_id || !file_url || !file_name) {
    return res.status(400).json({ error: 'Missing required fields: evaluation_id, file_url, file_name' });
  }

  const { data: evalRow, error: fetchErr } = await supabase
    .from('main_evaluations')
    .select('id,user_id,status')
    .eq('id', evaluation_id)
    .maybeSingle();
  if (fetchErr) return res.status(500).json({ error: `DB fetch failed: ${fetchErr.message}` });
  if (!evalRow) return res.status(404).json({ error: 'Evaluation row not found' });
  if (evalRow.user_id !== user.id) return res.status(403).json({ error: 'Forbidden' });
  if (evalRow.status !== 'processing') return res.status(409).json({ error: `Evaluation already ${evalRow.status}` });

  const openai = new OpenAI({ baseURL: 'https://openrouter.ai/api/v1', apiKey: OPENROUTER_API_KEY });

  const hasQt = question_text && question_text.trim().length > 0;
  const totalMarksNum = typeof total_marks === 'number' && total_marks > 0 ? total_marks : null;
  const subjectStr = subject_name && typeof subject_name === 'string' && subject_name.trim().length > 0 ? subject_name.trim() : null;

  let userPromptText = hasQt
    ? `The candidate has provided the question text:\n"""\n${question_text.trim()}\n"""\n\nEvaluate the handwritten TNPSC Mains answer booklet in the attached PDF strictly per the JSON schema. Use the question text above as authoritative.`
    : `No question text was provided. The question is likely embedded in the handwritten booklet. Reconstruct the question from visible handwriting and evaluate strictly per the JSON schema. Set question_reconstructed to true.`;

  if (totalMarksNum) {
    userPromptText += `\n\nThe exam TOTAL marks for this paper is ${totalMarksNum}. Use this as the overall total_marks in the output. Scale all marks proportionally.`;
  }
  if (subjectStr) {
    userPromptText += `\n\nThe subject for this answer is: "${subjectStr}". Focus evaluation within this subject's scope and expectations.`;
  }

  try {
    console.log(`[EVAL] Starting ${evaluation_id} user=${user.id} file=${file_name}`);

    const completion = await openai.chat.completions.create({
      model: GEMINI_MODEL,
      messages: [
        { role: 'system', content: EVALUATION_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: userPromptText },
            { type: 'file', file: { filename: file_name, file_data: file_url } },
          ],
        },
      ],
      temperature: 0.2,
      max_tokens: 8000,
    });

    const rawOutput = completion.choices[0]?.message?.content || '';
    console.log(`[EVAL] Raw output length: ${rawOutput.length}`);

    const result = extractJson(rawOutput);
    console.log(`[EVAL] Parsed JSON. questions=${result.questions?.length || 0}`);

    const awardedMarks = typeof result.awarded_marks === 'number' ? result.awarded_marks : null;
    const totalMarks = typeof result.total_marks === 'number' ? result.total_marks : null;
    const modelQuestion = result.question || '';

    const { data: updated, error: updateErr } = await supabase
      .from('main_evaluations')
      .update({
        status: 'completed',
        evaluation: result,
        total_marks: totalMarks,
        awarded_marks: awardedMarks,
        model_question: modelQuestion || null,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', evaluation_id)
      .select('*')
      .single();

    if (updateErr) {
      console.error('[EVAL] DB update failed:', updateErr.message);
      return res.status(500).json({ error: `DB update failed: ${updateErr.message}` });
    }

    console.log(`[EVAL] Completed ${evaluation_id} — ${awardedMarks}/${totalMarks}`);
    return res.status(200).json({ success: true, evaluation: updated, result });
  } catch (err: any) {
    console.error('[EVAL] Evaluation failed:', err?.message || err);

    await supabase
      .from('main_evaluations')
      .update({
        status: 'failed',
        error_message: (err?.message || 'Evaluation failed').slice(0, 1000),
        updated_at: new Date().toISOString(),
      })
      .eq('id', evaluation_id);

    return res.status(500).json({ error: err?.message || 'Evaluation failed' });
  }
}
