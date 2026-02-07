import OpenAI from 'openai';
import { toFile } from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export interface TranscriptionResult {
  text: string;
  duration?: number;
  language?: string;
}

export interface SummaryResult {
  summary: string;
  keyPoints: string[];
  actionItems: string[];
}

/**
 * Transcribe audio using OpenAI Whisper API
 * @param audioBuffer - Buffer containing audio data
 * @param fileName - Original filename with extension
 * @param language - Optional language code (e.g., 'en', 'es'). Auto-detects if not provided.
 * @returns Transcription result with text and duration
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  fileName: string,
  language?: string
): Promise<TranscriptionResult> {
  try {
    console.log(`[Transcription] Starting transcription for: ${fileName}`);

    // Convert Buffer to File object for OpenAI API
    const file = await toFile(audioBuffer, fileName);

    const response = await openai.audio.transcriptions.create({
      file: file,
      model: 'whisper-1',
      language: language,
      response_format: 'verbose_json'
    });

    const duration = typeof response.duration === 'number'
      ? response.duration
      : parseFloat(response.duration as string) || undefined;

    console.log(`[Transcription] Completed. Duration: ${duration}s`);

    return {
      text: response.text,
      duration: duration,
      language: response.language as string | undefined
    };
  } catch (error) {
    console.error('[Transcription] Error:', error);
    throw new Error(`Failed to transcribe audio: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Transcribe audio from URL
 * @param audioUrl - URL of the audio file (S3, CDN, etc.)
 * @param language - Optional language code
 * @returns Transcription result
 */
export async function transcribeAudioFromUrl(
  audioUrl: string,
  language?: string
): Promise<TranscriptionResult> {
  try {
    console.log(`[Transcription] Fetching audio from URL: ${audioUrl}`);

    // Fetch audio from URL
    const response = await fetch(audioUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch audio: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    // Extract filename from URL or use default
    const urlParts = audioUrl.split('/');
    const fileName = urlParts[urlParts.length - 1] || 'audio.webm';

    return transcribeAudio(audioBuffer, fileName, language);
  } catch (error) {
    console.error('[Transcription] Error fetching/transcribing from URL:', error);
    throw error;
  }
}

/**
 * Summarize a long transcription using GPT-4
 * @param transcription - The transcribed text
 * @returns Summary with key points and action items
 */
export async function summarizeTranscription(
  transcription: string
): Promise<SummaryResult> {
  try {
    console.log(`[Transcription] Summarizing text (${transcription.length} chars)`);

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: `Summarize this voice message or meeting transcript. Provide:
1. A brief summary (2-3 sentences)
2. Key points discussed (bullet list)
3. Action items if any (bullet list)

If it's a short message, just provide the summary.

Transcript:
${transcription}

Respond in JSON format:
{
  "summary": "...",
  "keyPoints": ["point1", "point2"],
  "actionItems": ["action1", "action2"]
}`
      }],
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('No response from summarization');
    }

    const result = JSON.parse(content);

    return {
      summary: result.summary || '',
      keyPoints: result.keyPoints || [],
      actionItems: result.actionItems || []
    };
  } catch (error) {
    console.error('[Transcription] Summarization error:', error);
    throw new Error(`Failed to summarize: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
