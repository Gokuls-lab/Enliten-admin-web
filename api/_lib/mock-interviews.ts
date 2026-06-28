import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'module';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');
const { parseOffice } = require('officeparser');

export const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  'https://nufmkzmukwplugqvtiie.supabase.co';

export const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51Zm1rem11a3dwbHVncXZ0aWllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3Nzk3NzgsImV4cCI6MjA5MDM1NTc3OH0.-rYm-UnMSbEJQCowxU2RpvsNT3k27O2zH93D9ohZpz0';

export const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || '';
export const ELEVENLABS_AGENT_ID = process.env.ELEVENLABS_AGENT_ID || 'agent_01jz7k73ywe69trm2ek80shae4';
export const ELEVENLABS_PHONE_NUMBER_ID =
  process.env.ELEVENLABS_AGENT_PHONE_NUMBER_ID || 'phnum_4601kw1hp3xve9tsdsjpfb69synx';

export const RESUME_BUCKET = 'mock-interview-resumes';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export function applyCors(res: any) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,PUT,DELETE');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );
}

export function createUserSupabaseClient(token: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export async function requireAuthenticatedUser(req: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    throw new HttpError(401, 'Unauthorized');
  }

  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) {
    throw new HttpError(401, 'Unauthorized');
  }

  const supabase = createUserSupabaseClient(token);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new HttpError(401, 'Invalid token');
  }

  return { user, token, supabase };
}

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function assertMethod(req: any, method: string) {
  if (req.method !== method) {
    throw new HttpError(405, 'Method not allowed');
  }
}

export function validateResumeUpload(payload: any) {
  const { file_base64, file_name, file_type, file_size } = payload || {};

  if (!file_base64 || !file_name || !file_type) {
    throw new HttpError(400, 'Missing required fields: file_base64, file_name, file_type');
  }

  if (!ALLOWED_MIME_TYPES.has(file_type)) {
    throw new HttpError(400, 'Only PDF, DOC, and DOCX resumes are allowed');
  }

  if (file_size && file_size > 10 * 1024 * 1024) {
    throw new HttpError(400, 'Resume file is too large. Maximum 10MB allowed.');
  }
}

export async function extractTextFromResume(buffer: Buffer, fileName: string, mimeType: string) {
  if (mimeType === 'application/pdf') {
    const parsed = await pdfParse(buffer);
    return parsed.text || '';
  }

  const tempFilePath = path.join(os.tmpdir(), `${Date.now()}-${sanitizeFileName(fileName)}`);
  await fs.writeFile(tempFilePath, buffer);

  try {
    const parsed = await parseOffice(tempFilePath);
    return typeof parsed === 'string' ? parsed : '';
  } finally {
    await fs.unlink(tempFilePath).catch(() => undefined);
  }
}

export function convertPlainTextToMarkdown(rawText: string, fileName: string) {
  const normalized = rawText
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n');

  const blocks = normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => block.replace(/\n/g, '  \n'));

  const title = fileName.replace(/\.[^.]+$/, '') || 'Resume';
  return [`# ${title}`, '', ...blocks].join('\n\n').trim();
}

export function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function buildResumeStoragePath(userId: string) {
  return `${userId}/resume.md`;
}

export async function readResumeMarkdown(supabase: any, storagePath?: string | null) {
  if (!storagePath) return '';

  const { data, error } = await supabase.storage.from(RESUME_BUCKET).download(storagePath);
  if (error || !data) {
    return '';
  }

  return await data.text();
}

export function truncateContext(text: string, maxChars = 12000) {
  if (!text) return '';
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}\n\n[Truncated for call context]`;
}

export function normalizePhoneNumber(value: string) {
  const cleaned = (value || '').replace(/[^\d+]/g, '');
  if (!cleaned) {
    throw new HttpError(400, 'Phone number is required');
  }

  if (cleaned.startsWith('+')) {
    if (!/^\+\d{10,15}$/.test(cleaned)) {
      throw new HttpError(400, 'Phone number must be in E.164 format');
    }
    return cleaned;
  }

  const digits = cleaned.replace(/\D/g, '');
  if (digits.length === 10) {
    return `+91${digits}`;
  }

  if (digits.length >= 10 && digits.length <= 15) {
    return `+${digits}`;
  }

  throw new HttpError(400, 'Invalid phone number');
}

export function buildDynamicVariables({
  candidateName,
  phoneNumber,
  resumeMarkdown,
}: {
  candidateName: string;
  phoneNumber: string;
  resumeMarkdown: string;
}) {
  const context = truncateContext(resumeMarkdown, 12000);

  return {
    candidate_name: candidateName,
    user_name: candidateName,
    phone_number: phoneNumber,
    candidate_phone_number: phoneNumber,
    resume_text: context,
    candidate_resume_markdown: context,
    candidate_context: context
      ? `Candidate name: ${candidateName}\nPhone number: ${phoneNumber}\nResume context:\n${context}`
      : `Candidate name: ${candidateName}\nPhone number: ${phoneNumber}\nNo resume was uploaded.`,
  };
}

export function extractPersonaMessage(rawMessage: string) {
  const match = rawMessage?.match(/^<([^>]+)>([\s\S]*?)<\/\1>\s*$/);
  if (!match) {
    return {
      persona: 'Agent',
      message: rawMessage || '',
    };
  }

  return {
    persona: match[1],
    message: match[2].trim(),
  };
}

export function summarizeConversationDetails(details: any) {
  const dataCollectionResults = details?.analysis?.data_collection_results || {};
  const performance = Object.entries(dataCollectionResults)
    .filter(([, value]: any) => value?.json_schema?.type === 'integer')
    .map(([key, value]: any) => ({
      id: key,
      label: key.replace(/_/g, ' '),
      score: value?.value ?? null,
      feedback:
        dataCollectionResults[`${key}_feedback`]?.value ||
        dataCollectionResults[`${key}_feedback`]?.rationale ||
        value?.rationale ||
        '',
    }));

  const transcript = Array.isArray(details?.transcript)
    ? details.transcript.map((item: any) => {
        const parsed = item.role === 'agent' ? extractPersonaMessage(item.message || '') : { persona: 'Candidate', message: item.message || '' };

        return {
          role: item.role,
          persona: parsed.persona,
          message: parsed.message,
          raw_message: item.message || '',
          time_in_call_secs: item.time_in_call_secs ?? null,
          source_medium: item.source_medium ?? null,
        };
      })
    : [];

  return {
    status: details?.status || 'unknown',
    call_summary_title: details?.analysis?.call_summary_title || null,
    transcript_summary: details?.analysis?.transcript_summary || null,
    call_successful: details?.analysis?.call_successful || null,
    start_time_unix_secs: details?.metadata?.start_time_unix_secs || null,
    accepted_time_unix_secs: details?.metadata?.accepted_time_unix_secs || null,
    call_duration_secs: details?.metadata?.call_duration_secs || null,
    performance,
    transcript,
    raw_analysis: details?.analysis || null,
  };
}
