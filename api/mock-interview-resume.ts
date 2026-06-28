import {
  HttpError,
  RESUME_BUCKET,
  applyCors,
  assertMethod,
  buildResumeStoragePath,
  convertPlainTextToMarkdown,
  extractTextFromResume,
  requireAuthenticatedUser,
  sanitizeFileName,
  validateResumeUpload,
} from './_lib/mock-interviews';

export default async function handler(req: any, res: any) {
  applyCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    assertMethod(req, 'POST');
    const { user, supabase } = await requireAuthenticatedUser(req);
    validateResumeUpload(req.body);

    const { file_base64, file_name, file_type } = req.body;
    const fileBuffer = Buffer.from(file_base64, 'base64');
    const rawText = (await extractTextFromResume(fileBuffer, file_name, file_type)).trim();

    if (!rawText) {
      throw new HttpError(400, 'Could not extract text from the uploaded resume');
    }

    const markdown = convertPlainTextToMarkdown(rawText, file_name);
    const storagePath = buildResumeStoragePath(user.id);

    const { error: uploadError } = await supabase.storage
      .from(RESUME_BUCKET)
      .upload(storagePath, Buffer.from(markdown, 'utf8'), {
        contentType: 'text/markdown',
        upsert: true,
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { error: profileError } = await supabase.from('mock_interview_profiles').upsert({
      user_id: user.id,
      resume_storage_path: storagePath,
      resume_file_name: sanitizeFileName(file_name),
      resume_source_mime_type: file_type,
      resume_markdown_char_count: markdown.length,
      updated_at: new Date().toISOString(),
    });

    if (profileError) {
      throw new Error(profileError.message);
    }

    return res.status(200).json({
      success: true,
      resume: {
        storage_path: storagePath,
        file_name: sanitizeFileName(file_name),
        markdown_char_count: markdown.length,
        preview: markdown.slice(0, 4000),
      },
    });
  } catch (error: any) {
    const status = error instanceof HttpError ? error.status : 500;
    return res.status(status).json({
      error: error?.message || 'Failed to upload resume',
    });
  }
}
