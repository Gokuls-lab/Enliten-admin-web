import {
  ELEVENLABS_AGENT_ID,
  ELEVENLABS_API_KEY,
  ELEVENLABS_PHONE_NUMBER_ID,
  HttpError,
  applyCors,
  buildDynamicVariables,
  normalizePhoneNumber,
  readResumeMarkdown,
  requireAuthenticatedUser,
} from './_lib/mock-interviews';

async function handleGet(req: any, res: any) {
  const { user, supabase } = await requireAuthenticatedUser(req);

  const [{ data: profile, error: profileError }, { data: sessions, error: sessionsError }] = await Promise.all([
    supabase
      .from('mock_interview_profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('mock_interview_sessions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
  ]);

  if (profileError) {
    throw new Error(profileError.message);
  }

  if (sessionsError) {
    throw new Error(sessionsError.message);
  }

  return res.status(200).json({
    success: true,
    profile,
    sessions: sessions || [],
  });
}

async function handlePost(req: any, res: any) {
  const { user, supabase } = await requireAuthenticatedUser(req);
  const phoneNumber = normalizePhoneNumber(req.body?.phone_number || '');

  if (!ELEVENLABS_API_KEY) {
    throw new HttpError(500, 'ElevenLabs API key is not configured');
  }

  const [{ data: profile }, { data: dbUser }] = await Promise.all([
    supabase.from('mock_interview_profiles').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('users').select('full_name,email').eq('id', user.id).maybeSingle(),
  ]);

  const candidateName =
    req.body?.candidate_name?.trim() ||
    dbUser?.full_name?.trim() ||
    user.user_metadata?.full_name ||
    user.email ||
    'Candidate';

  const resumeMarkdown = await readResumeMarkdown(supabase, profile?.resume_storage_path);
  const dynamicVariables = buildDynamicVariables({
    candidateName,
    phoneNumber,
    resumeMarkdown,
  });

  const payload = {
    agent_id: ELEVENLABS_AGENT_ID,
    agent_phone_number_id: ELEVENLABS_PHONE_NUMBER_ID,
    to_number: phoneNumber,
    conversation_initiation_client_data: {
      dynamic_variables: dynamicVariables,
    },
    call_recording_enabled: false,
  };

  const elevenlabsResponse = await fetch('https://api.elevenlabs.io/v1/convai/twilio/outbound-call', {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVENLABS_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const responseJson = await elevenlabsResponse.json().catch(() => ({}));

  if (!elevenlabsResponse.ok || !responseJson?.success) {
    throw new HttpError(
      elevenlabsResponse.status || 500,
      responseJson?.message || responseJson?.error || 'Failed to create interview call'
    );
  }

  const now = new Date().toISOString();
  const { data: session, error: insertError } = await supabase
    .from('mock_interview_sessions')
    .insert({
      user_id: user.id,
      phone_number: phoneNumber,
      candidate_name: candidateName,
      status: 'initiated',
      resume_storage_path: profile?.resume_storage_path || null,
      resume_used: Boolean(profile?.resume_storage_path),
      elevenlabs_agent_id: ELEVENLABS_AGENT_ID,
      elevenlabs_conversation_id: responseJson.conversation_id || null,
      elevenlabs_call_sid: responseJson.callSid || null,
      dynamic_variables: dynamicVariables,
      initiation_payload: payload,
      initiation_response: responseJson,
      created_at: now,
      updated_at: now,
    })
    .select('*')
    .single();

  if (insertError) {
    throw new Error(insertError.message);
  }

  return res.status(200).json({
    success: true,
    session,
  });
}

export default async function handler(req: any, res: any) {
  applyCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      return await handleGet(req, res);
    }

    if (req.method === 'POST') {
      return await handlePost(req, res);
    }

    throw new HttpError(405, 'Method not allowed');
  } catch (error: any) {
    const status = error instanceof HttpError ? error.status : 500;
    return res.status(status).json({
      error: error?.message || 'Mock interview request failed',
    });
  }
}
