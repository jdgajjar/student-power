import { NextRequest, NextResponse } from 'next/server';

/**
 * Groq AI Chat API Route
 * Handles AI-powered PDF summarization, question answering, and chat.
 *
 * Migration Note: Replaced Perplexity AI with Groq AI.
 * - Uses GROQ_API_KEY environment variable
 * - Model: llama-3.3-70b-versatile (OpenAI-compatible API)
 * - Response structure is identical; no frontend changes required
 *
 * Supported actions:
 *   POST { action: "summarize",          pdfText }
 *   POST { action: "generate_questions", pdfText }
 *   POST { action: "answer",             pdfText, question }
 *   POST { action: "chat",               pdfText, message, conversationHistory? }
 *
 * GET  – health / config check
 */

// ──────────────────────────────────────────────
// Configuration
// ──────────────────────────────────────────────

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * Primary model – llama-3.3-70b-versatile is excellent for academic tasks.
 * Fallback: "llama3-8b-8192" for lower latency on simple requests.
 */
const MODEL = 'llama-3.3-70b-versatile';

// ──────────────────────────────────────────────
// POST handler
// ──────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // ── 1. Validate API key ─────────────────
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

    console.log('✅ Groq API key configured, processing request...');

    // ── 2. Parse request body ───────────────
    const body = await request.json();
    const { action, question, pdfText, message, conversationHistory } = body;

    if (!pdfText || pdfText.trim().length === 0) {
      return NextResponse.json(
        { error: 'No PDF content provided' },
        { status: 400 }
      );
    }

    // Truncate text to stay within safe token limits
    const truncatedText =
      pdfText.length > 10_000 ? pdfText.substring(0, 10_000) + '...' : pdfText;

    // ── 3. Build message array per action ───
    let messages: { role: string; content: string }[] = [];

    if (action === 'summarize') {
      // Extract a topic hint from the first 500 chars of the document
      const topicMatch = truncatedText
        .substring(0, 500)
        .match(/(?:Chapter|Unit|Section|Topic|Subject)?\s*:?\s*([A-Z][^\n]{10,100})/);
      const topic = topicMatch ? topicMatch[1].trim() : 'Document Content';

      messages = [
        {
          role: 'system',
          content:
            'You are an expert academic assistant specialized in creating well-structured, hierarchical summaries of educational documents. Your summaries must be clear, academically precise, and easy to understand. Use markdown formatting with proper heading levels (# for main title, ## for major sections, ### for subsections). Focus on extracting key concepts, definitions, explanations, and relationships between ideas.',
        },
        {
          role: 'user',
          content: `Please create a comprehensive academic summary of the following document content. Format your response as follows:

# Summary of ${topic}

Then organize the content into 2-3 major sections using ## headings, with subsections using ### headings where appropriate. Each section should:
- Provide clear, academically precise explanations
- Include key concepts and definitions
- Explain relationships between ideas
- Use bullet points for clarity where helpful
- Maintain an easy-to-read but academic tone

Document Content:
${truncatedText}`,
        },
      ];
    } else if (action === 'generate_questions') {
      const topicMatch = truncatedText
        .substring(0, 500)
        .match(/(?:Chapter|Unit|Section|Topic|Subject)?\s*:?\s*([A-Z][^\n]{10,100})/);
      const topic = topicMatch ? topicMatch[1].trim() : 'this topic';

      messages = [
        {
          role: 'system',
          content:
            'You are an expert academic assistant specialized in generating important conceptual and applied questions from educational documents. Your questions should test understanding, application, and critical thinking. Generate questions that cover the main concepts, theories, definitions, applications, and relationships presented in the document.',
        },
        {
          role: 'user',
          content: `Based on the provided document content, generate 10-12 important questions related to "${topic}".

Format your response EXACTLY as follows:

Based on the provided document content, important questions (imp questions) related to '${topic}' could include:

1. [First question - conceptual or definition-based]
2. [Second question - application-based]
3. [Third question - analytical]
... continue through 10-12 questions

Make questions diverse: include conceptual questions, application questions, comparison questions, and analytical questions. Ensure all questions are directly relevant to the document content.

Document Content:
${truncatedText}`,
        },
      ];
    } else if (action === 'answer') {
      if (!question || question.trim().length === 0) {
        return NextResponse.json(
          { error: 'No question provided' },
          { status: 400 }
        );
      }

      messages = [
        {
          role: 'system',
          content:
            'You are a helpful AI assistant that answers questions based on the provided document content. Provide accurate, detailed answers based primarily on the information in the document. Use clear academic language and structure your answers well. If the answer requires information beyond the document, clearly indicate this.',
        },
        {
          role: 'user',
          content: `Document content:\n${truncatedText}\n\nQuestion: ${question}\n\nPlease provide a comprehensive answer based on the document content above. Structure your answer clearly and use academic language.`,
        },
      ];
    } else if (action === 'chat') {
      if (!message || message.trim().length === 0) {
        return NextResponse.json(
          { error: 'No message provided' },
          { status: 400 }
        );
      }

      messages = [
        {
          role: 'system',
          content: `You are a helpful AI assistant discussing the content of a document. Here is the document content:\n\n${truncatedText}\n\nAnswer questions and discuss topics based on this document.`,
        },
        ...(conversationHistory || []),
        {
          role: 'user',
          content: message,
        },
      ];
    } else {
      return NextResponse.json(
        {
          error:
            'Invalid action. Must be "summarize", "generate_questions", "answer", or "chat"',
        },
        { status: 400 }
      );
    }

    // ── 4. Call Groq API ────────────────────
    console.log(`📤 Sending "${action}" request to Groq AI...`);

    const requestBody = {
      model: MODEL,
      messages,
      // Token budgets tuned per action type
      max_tokens:
        action === 'summarize' ? 800 : action === 'generate_questions' ? 1_000 : 600,
      temperature:
        action === 'summarize'
          ? 0.3
          : action === 'generate_questions'
          ? 0.4
          : action === 'answer'
          ? 0.2
          : 0.5,
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

    // ── 5. Handle API errors ────────────────
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Groq API Error:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
        apiKeyPreview: GROQ_API_KEY
          ? `${GROQ_API_KEY.substring(0, 10)}...`
          : 'NOT SET',
      });

      let errorMessage = 'Failed to process request';
      let userFriendlyMessage = '';

      if (response.status === 401) {
        errorMessage = 'Authentication failed. Invalid Groq API key.';
        userFriendlyMessage =
          'The Groq API key is invalid or expired. Please verify your GROQ_API_KEY.';
      } else if (response.status === 400) {
        errorMessage = 'Bad request';
        userFriendlyMessage = `Invalid request format. ${errorText}`;
        console.error(
          '📝 Request body that caused error:',
          JSON.stringify(requestBody, null, 2)
        );
      } else if (response.status === 429) {
        errorMessage = 'Rate limit exceeded';
        userFriendlyMessage = 'Too many requests. Please wait a moment and try again.';
      } else if (response.status === 403) {
        errorMessage = 'Access forbidden';
        userFriendlyMessage =
          'API access denied. Check your subscription and permissions.';
      } else {
        userFriendlyMessage = `API error: ${response.statusText}`;
      }

      return NextResponse.json(
        {
          error: errorMessage,
          message: userFriendlyMessage,
          details: errorText,
          status: response.status,
        },
        { status: response.status }
      );
    }

    // ── 6. Parse and return response ────────
    const data = await response.json();

    console.log('✅ Response received from Groq AI');

    if (!data.choices || data.choices.length === 0) {
      console.error('❌ Invalid response structure:', data);
      return NextResponse.json(
        { error: 'No response received from AI', details: 'API returned empty choices' },
        { status: 500 }
      );
    }

    const aiResponse: string = data.choices[0].message.content;

    console.log(
      `✅ "${action}" completed successfully. Response length: ${aiResponse.length} chars`
    );

    return NextResponse.json({
      success: true,
      response: aiResponse,
      usage: data.usage,
      action,
    });
  } catch (error: any) {
    console.error('❌ Groq AI Chat API error:', error);
    return NextResponse.json(
      {
        error: error.message || 'Internal server error',
        details: error.stack || 'No stack trace available',
        type: error.name || 'UnknownError',
      },
      { status: 500 }
    );
  }
}

// ──────────────────────────────────────────────
// GET handler – health / configuration check
// ──────────────────────────────────────────────

/**
 * GET /api/ai/chat
 * Returns current configuration status (no sensitive data exposed).
 */
export async function GET() {
  const hasApiKey = !!GROQ_API_KEY && GROQ_API_KEY.trim() !== '';

  return NextResponse.json({
    status: hasApiKey ? 'ok' : 'error',
    message: hasApiKey
      ? 'Groq AI Chat API is running and configured'
      : 'GROQ_API_KEY is not configured',
    provider: 'Groq',
    model: MODEL,
    apiKeyConfigured: hasApiKey,
    apiKeyPreview: hasApiKey
      ? `${GROQ_API_KEY.substring(0, 10)}...`
      : 'NOT SET',
    timestamp: new Date().toISOString(),
  });
}
