/**
 * Groq AI Chat API Route — RAG Edition
 *
 * ═══════════════════════════════════════════════════════════════════
 * WHAT CHANGED (RAG Upgrade)
 * ═══════════════════════════════════════════════════════════════════
 *
 * BEFORE (inefficient):
 *   • Client sent full pdfText (~10 000 chars) in every POST body
 *   • Server truncated it to the first 10 000 chars (missed later content)
 *   • ~2 500 input tokens wasted per request regardless of question
 *   • Answers could be inaccurate because relevant content was cut off
 *
 * AFTER (RAG):
 *   Mode A — pdfId provided (preferred):
 *     1. Client sends only { action, pdfId, question }  (no raw text)
 *     2. Server calls /api/ai/chunks internally to get top-K relevant chunks
 *     3. Only those chunks (~1 500–2 500 chars) go to Groq
 *     Token saving: ~70–80 % fewer input tokens
 *
 *   Mode B — pdfText provided (backwards-compatible fallback):
 *     1. Client sends { action, pdfText, question } (legacy behaviour)
 *     2. Server cleans + chunks the text in-memory
 *     3. Retrieves top-K relevant chunks and sends only those to Groq
 *     Token saving: ~60–70 % vs old substring approach
 *
 * ═══════════════════════════════════════════════════════════════════
 * SUPPORTED ACTIONS
 * ═══════════════════════════════════════════════════════════════════
 *
 *   POST { action: "summarize",          pdfId }
 *   POST { action: "summarize",          pdfText }           ← fallback
 *   POST { action: "generate_questions", pdfId }
 *   POST { action: "generate_questions", pdfText }           ← fallback
 *   POST { action: "answer",             pdfId,    question }
 *   POST { action: "answer",             pdfText,  question } ← fallback
 *   POST { action: "chat",               pdfId,    message, conversationHistory? }
 *   POST { action: "chat",               pdfText,  message, conversationHistory? }
 *
 *   GET — health / configuration check
 *
 * ═══════════════════════════════════════════════════════════════════
 * ENVIRONMENT VARIABLES
 * ═══════════════════════════════════════════════════════════════════
 *   GROQ_API_KEY  — https://console.groq.com/keys
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  cleanExtractedText,
  splitIntoChunks,
  retrieveRelevantChunks,
  buildOptimizedPrompt,
  TextChunk,
  MAX_CHUNKS_PER_REQUEST,
} from '@/lib/ai/pdf-analyzer';

// ── Configuration ─────────────────────────────────────────────────────────────

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * llama-3.3-70b-versatile: high quality, generous free-tier context window.
 * Fallback to llama3-8b-8192 for lower-latency needs.
 */
const MODEL = 'llama-3.3-70b-versatile';

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // ── 1. Validate API key ──────────────────────────────────────────────────
    if (!GROQ_API_KEY || GROQ_API_KEY.trim() === '') {
      console.error('❌ Groq API key is not configured');
      return NextResponse.json(
        {
          error: 'API configuration error. Groq API key is missing.',
          details: 'Please set GROQ_API_KEY environment variable.',
        },
        { status: 500 }
      );
    }

    // ── 2. Parse request body ────────────────────────────────────────────────
    const body = await request.json();
    const {
      action,
      question,
      pdfText,   // legacy / fallback: raw PDF text from client
      pdfId,     // preferred: MongoDB ID, used to fetch pre-stored chunks
      message,
      conversationHistory,
      chunks: clientChunks, // optional: client may send pre-computed chunks
    } = body;

    if (!action) {
      return NextResponse.json(
        { error: 'action is required (summarize | generate_questions | answer | chat)' },
        { status: 400 }
      );
    }

    // ── 3. Resolve relevant chunks ───────────────────────────────────────────
    //
    // TOKEN SAVING EXPLANATION:
    //   We never send the full pdfText to Groq anymore.
    //   Instead we resolve the smallest set of chunks that contain
    //   the answer, dramatically cutting input token usage.
    //
    //   Priority order for chunk resolution:
    //     1. clientChunks  — pre-scored by the client (fastest)
    //     2. pdfId         — server-side DB lookup (most accurate, no raw text transfer)
    //     3. pdfText       — in-memory chunking fallback (backwards-compatible)

    let relevantChunks: TextChunk[] = [];
    const questionText = question || message || '';

    if (clientChunks && Array.isArray(clientChunks) && clientChunks.length > 0) {
      // ── Path 1: Client already sent pre-selected chunks ──────────────────
      // This is the lightest path — minimal DB and compute overhead.
      // Used when PDFViewer has in-memory chunks from a previous extraction.
      relevantChunks = clientChunks.slice(0, MAX_CHUNKS_PER_REQUEST);

    } else if (pdfId && typeof pdfId === 'string') {
      // ── Path 2: Server-side DB retrieval (preferred production path) ─────
      // The client sends ONLY pdfId + question (no raw text).
      // We query MongoDB for the relevant chunks — no full text in transit.
      //
      // TOKEN SAVING: request payload shrinks from ~10 000 chars to ~100 chars.
      try {
        const baseUrl = request.nextUrl.origin;
        const chunkUrl = new URL('/api/ai/chunks', baseUrl);
        chunkUrl.searchParams.set('pdfId', pdfId);
        if (questionText.trim()) {
          chunkUrl.searchParams.set('question', questionText);
        }
        chunkUrl.searchParams.set('topK', String(MAX_CHUNKS_PER_REQUEST));

        const chunkResponse = await fetch(chunkUrl.toString(), {
          headers: { 'Content-Type': 'application/json' },
        });

        if (chunkResponse.ok) {
          const chunkData = await chunkResponse.json();
          if (chunkData.success && chunkData.chunks?.length > 0) {
            relevantChunks = chunkData.chunks;
            console.log(
              `📦 Retrieved ${relevantChunks.length} chunks via ${chunkData.meta?.retrievalMethod} ` +
              `(~${chunkData.meta?.estimatedTokens} tokens)`
            );
          }
        }
      } catch (dbErr) {
        console.warn('⚠️ DB chunk retrieval failed, falling back to pdfText:', dbErr);
      }
    }

    // ── Path 3: In-memory fallback (legacy pdfText) ──────────────────────────
    // If no chunks resolved from DB, fall back to processing pdfText.
    // This preserves backwards compatibility for clients not yet sending pdfId.
    //
    // TOKEN SAVING vs. OLD behaviour:
    //   Old: pdfText.substring(0, 10_000) sent directly to Groq (no filtering)
    //   New: pdfText cleaned → chunked → top-K retrieved → only relevant chunks sent
    if (relevantChunks.length === 0) {
      if (!pdfText || pdfText.trim().length === 0) {
        return NextResponse.json(
          { error: 'No PDF content available. Provide pdfId or pdfText.' },
          { status: 400 }
        );
      }

      console.log(
        `⚙️  In-memory RAG fallback: cleaning and chunking ${pdfText.length} chars of pdfText`
      );

      const cleaned = cleanExtractedText(pdfText);
      const allChunks = splitIntoChunks(cleaned);

      if (allChunks.length === 0) {
        return NextResponse.json(
          { error: 'Could not extract usable text from PDF' },
          { status: 422 }
        );
      }

      // For answer/chat: retrieve relevant chunks; for others: use first N
      if (action === 'answer' || action === 'chat') {
        relevantChunks = retrieveRelevantChunks(questionText, allChunks, MAX_CHUNKS_PER_REQUEST);
      } else {
        // summarize / generate_questions — use top of document
        relevantChunks = allChunks.slice(0, MAX_CHUNKS_PER_REQUEST);
      }
    }

    if (relevantChunks.length === 0) {
      return NextResponse.json(
        { error: 'No relevant content found in PDF for this query.' },
        { status: 422 }
      );
    }

    // ── 4. Validate action-specific inputs ───────────────────────────────────
    if ((action === 'answer') && !questionText.trim()) {
      return NextResponse.json({ error: 'No question provided' }, { status: 400 });
    }
    if (action === 'chat' && !questionText.trim()) {
      return NextResponse.json({ error: 'No message provided' }, { status: 400 });
    }

    // ── 5. Build optimised RAG prompt ────────────────────────────────────────
    //
    // buildOptimizedPrompt assembles ONLY the selected chunks (not full PDF).
    // It also applies minimal system prompts and capped max_tokens:
    //   summarize        → max_tokens: 600  (was 800)
    //   generate_questions → max_tokens: 800  (was 1 000)
    //   answer / chat    → max_tokens: 400  (was 600–800)
    //
    // Combined with sending only 3–5 chunks instead of full text,
    // total token usage per request drops by ~70–80 %.
    const { messages, max_tokens, temperature } = buildOptimizedPrompt(
      action as 'summarize' | 'generate_questions' | 'answer' | 'chat',
      relevantChunks,
      questionText,
      conversationHistory
    );

    // Log token estimate (helps verify savings in logs)
    const contextWords = relevantChunks.reduce((s, c) => s + (c.wordCount || 0), 0);
    const estimatedInputTokens = Math.round(contextWords * 1.33);
    console.log(
      `📤 Sending "${action}" to Groq | chunks: ${relevantChunks.length} | ` +
      `~${estimatedInputTokens} context tokens | max_tokens: ${max_tokens}`
    );

    // ── 6. Call Groq API ─────────────────────────────────────────────────────
    const requestBody = {
      model: MODEL,
      messages,
      max_tokens,
      temperature,
      top_p: 0.9,
      stream: false,
    };

    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    // ── 7. Handle API errors ─────────────────────────────────────────────────
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Groq API Error:', {
        status: response.status,
        body: errorText,
        apiKeyPreview: GROQ_API_KEY ? `${GROQ_API_KEY.substring(0, 10)}...` : 'NOT SET',
      });

      let errorMessage = 'Failed to process request';
      let userFriendlyMessage = '';

      if (response.status === 401) {
        errorMessage = 'Authentication failed. Invalid Groq API key.';
        userFriendlyMessage = 'The Groq API key is invalid or expired.';
      } else if (response.status === 400) {
        errorMessage = 'Bad request';
        userFriendlyMessage = `Invalid request: ${errorText}`;
      } else if (response.status === 429) {
        errorMessage = 'Rate limit exceeded';
        userFriendlyMessage = 'Too many requests. Please wait a moment and try again.';
      } else if (response.status === 403) {
        errorMessage = 'Access forbidden';
        userFriendlyMessage = 'API access denied. Check your subscription.';
      } else {
        userFriendlyMessage = `API error: ${response.statusText}`;
      }

      return NextResponse.json(
        { error: errorMessage, message: userFriendlyMessage, status: response.status },
        { status: response.status }
      );
    }

    // ── 8. Parse and return response ─────────────────────────────────────────
    const data = await response.json();

    if (!data.choices || data.choices.length === 0) {
      return NextResponse.json(
        { error: 'No response from AI', details: 'Empty choices array' },
        { status: 500 }
      );
    }

    const aiResponse: string = data.choices[0].message.content;

    console.log(
      `✅ "${action}" completed | response: ${aiResponse.length} chars | ` +
      `usage: ${JSON.stringify(data.usage)}`
    );

    return NextResponse.json({
      success: true,
      response: aiResponse,
      usage: data.usage,
      action,
      // Return RAG metadata so the client can display token savings info
      rag: {
        chunksUsed: relevantChunks.length,
        estimatedInputTokens,
      },
    });
  } catch (error: any) {
    console.error('❌ Groq AI Chat API error:', error);
    return NextResponse.json(
      {
        error: error.message || 'Internal server error',
        type: error.name || 'UnknownError',
      },
      { status: 500 }
    );
  }
}

// ── GET handler — health / configuration check ────────────────────────────────

/**
 * GET /api/ai/chat
 * Returns configuration status without exposing sensitive values.
 */
export async function GET() {
  const hasApiKey = !!GROQ_API_KEY && GROQ_API_KEY.trim() !== '';

  return NextResponse.json({
    status: hasApiKey ? 'ok' : 'error',
    message: hasApiKey
      ? 'Groq AI Chat API is running (RAG mode)'
      : 'GROQ_API_KEY is not configured',
    provider: 'Groq',
    model: MODEL,
    ragEnabled: true,
    maxChunksPerRequest: MAX_CHUNKS_PER_REQUEST,
    apiKeyConfigured: hasApiKey,
    apiKeyPreview: hasApiKey ? `${GROQ_API_KEY.substring(0, 10)}...` : 'NOT SET',
    timestamp: new Date().toISOString(),
  });
}
