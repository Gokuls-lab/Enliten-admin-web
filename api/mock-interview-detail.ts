import {
  ELEVENLABS_API_KEY,
  HttpError,
  applyCors,
  requireAuthenticatedUser,
  summarizeConversationDetails,
} from './_lib/mock-interviews';

export default async function handler(req: any, res: any) {
  applyCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method !== 'GET') {
      throw new HttpError(405, 'Method not allowed');
    }

    const { user, supabase } = await requireAuthenticatedUser(req);
    const sessionId = req.query?.id;

    if (!sessionId || typeof sessionId !== 'string') {
      throw new HttpError(400, 'Interview session id is required');
    }

    const { data: session, error: sessionError } = await supabase
      .from('mock_interview_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single();

    if (sessionError || !session) {
      throw new HttpError(404, 'Interview session not found');
    }

    let details = session.conversation_details;
    let performanceSummary = session.performance_summary;

    if (session.elevenlabs_conversation_id) {
      if (!ELEVENLABS_API_KEY) {
        throw new HttpError(500, 'ElevenLabs API key is not configured');
      }

      const response = await fetch(
        `https://api.elevenlabs.io/v1/convai/conversations/${session.elevenlabs_conversation_id}`,
        {
          headers: {
            'xi-api-key': ELEVENLABS_API_KEY,
          },
        }
      );

      details = await response.json().catch(() => null);

      if (response.ok && details) {
        performanceSummary = summarizeConversationDetails(details);

        await supabase
          .from('mock_interview_sessions')
          .update({
            status: details.status || session.status,
            conversation_details: details,
            performance_summary: performanceSummary,
            transcript_summary: performanceSummary?.transcript_summary || session.transcript_summary,
            call_summary_title: performanceSummary?.call_summary_title || session.call_summary_title,
            duration_secs: details?.metadata?.call_duration_secs || session.duration_secs,
            synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', session.id);
      }
    }

    return res.status(200).json({
      success: true,
      session: {
        ...session,
        conversation_details: details,
        performance_summary: performanceSummary,
      },
    });
  } catch (error: any) {
    const status = error instanceof HttpError ? error.status : 500;
    return res.status(status).json({
      error: error?.message || 'Failed to fetch interview details',
    });
  }
}
