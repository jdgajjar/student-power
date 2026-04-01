/**
 * Groq AI Service
 * Integrates with Groq API for PDF summarization and Q&A.
 * Groq provides blazing-fast inference via its Language Processing Unit (LPU).
 *
 * Migration Note: Replaces the previous Perplexity AI integration.
 * The response structure (OpenAI-compatible) is identical, so all
 * downstream consumers continue to work without modification.
 *
 * Environment variable: GROQ_API_KEY
 * Get your key at: https://console.groq.com/keys
 */

// ──────────────────────────────────────────────
// Configuration
// ──────────────────────────────────────────────

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * Default model – llama-3.3-70b-versatile gives a great balance of
 * speed, quality, and token limits on the free tier.
 * Alternative fast option: "llama3-8b-8192"
 */
const DEFAULT_MODEL = 'llama-3.3-70b-versatile';

// ──────────────────────────────────────────────
// Types (kept API-compatible with old Perplexity types)
// ──────────────────────────────────────────────

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIRequest {
  model: string;
  messages: AIMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
}

/** OpenAI-compatible response shape returned by Groq */
export interface AIResponse {
  id: string;
  model: string;
  created: number;
  choices: {
    index: number;
    finish_reason: string;
    message: {
      role: string;
      content: string;
    };
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ──────────────────────────────────────────────
// GroqAI class
// ──────────────────────────────────────────────

class GroqAI {
  private readonly apiKey: string;
  private readonly apiUrl: string;
  private readonly model: string;

  constructor() {
    this.apiKey = GROQ_API_KEY;
    this.apiUrl = GROQ_API_URL;
    this.model = DEFAULT_MODEL;
  }

  // ── Private helpers ────────────────────────

  /**
   * Core HTTP request to the Groq chat-completions endpoint.
   * Returns the text content of the first choice.
   */
  private async makeRequest(
    messages: AIMessage[],
    options: Partial<AIRequest> = {}
  ): Promise<string> {
    const requestBody: AIRequest = {
      model: this.model,
      messages,
      max_tokens: options.max_tokens ?? 1024,
      temperature: options.temperature ?? 0.2,
      top_p: options.top_p ?? 0.9,
      stream: false,
      ...options,
    };

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Groq API Error:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
      });

      if (response.status === 401) {
        throw new Error('Authentication failed. Please check your GROQ_API_KEY.');
      } else if (response.status === 400) {
        throw new Error(`Bad request: ${errorText}`);
      } else if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      } else {
        throw new Error(`Groq API error (${response.status}): ${response.statusText}`);
      }
    }

    const data: AIResponse = await response.json();

    if (!data.choices || data.choices.length === 0) {
      throw new Error('No response received from Groq AI');
    }

    return data.choices[0].message.content;
  }

  // ── Public methods ─────────────────────────

  /**
   * Summarize the given PDF text using Groq AI.
   */
  async summarize(pdfText: string): Promise<string> {
    if (!pdfText || pdfText.trim().length === 0) {
      throw new Error('No text provided for summarization');
    }

    // Keep first 10 000 chars to stay within context limits
    const truncatedText =
      pdfText.length > 10_000 ? pdfText.substring(0, 10_000) + '...' : pdfText;

    const messages: AIMessage[] = [
      {
        role: 'system',
        content:
          'You are a helpful AI assistant that creates concise, informative summaries of academic documents. Focus on key points, main ideas, and important concepts.',
      },
      {
        role: 'user',
        content: `Please provide a comprehensive summary of the following document. Focus on the main topics, key concepts, and important information:\n\n${truncatedText}`,
      },
    ];

    try {
      return await this.makeRequest(messages, { max_tokens: 512, temperature: 0.3 });
    } catch (error: any) {
      console.error('Groq summarization error:', error);
      throw new Error(error.message || 'Failed to generate summary. Please try again.');
    }
  }

  /**
   * Answer a question about the provided PDF content.
   */
  async answerQuestion(question: string, pdfText: string): Promise<string> {
    if (!question || question.trim().length === 0) {
      throw new Error('No question provided');
    }
    if (!pdfText || pdfText.trim().length === 0) {
      throw new Error('No PDF content available for answering questions');
    }

    const truncatedText =
      pdfText.length > 10_000 ? pdfText.substring(0, 10_000) + '...' : pdfText;

    const messages: AIMessage[] = [
      {
        role: 'system',
        content:
          'You are a helpful AI assistant that answers questions based on the provided document content. Provide accurate, concise answers based only on the information in the document. If the answer is not in the document, say so clearly.',
      },
      {
        role: 'user',
        content: `Document content:\n${truncatedText}\n\nQuestion: ${question}\n\nPlease answer the question based on the document content above.`,
      },
    ];

    try {
      return await this.makeRequest(messages, { max_tokens: 512, temperature: 0.2 });
    } catch (error: any) {
      console.error('Groq question answering error:', error);
      throw new Error(error.message || 'Failed to answer question. Please try again.');
    }
  }

  /**
   * Multi-turn chat about the PDF content with optional conversation history.
   */
  async chat(
    userMessage: string,
    pdfText: string,
    conversationHistory: AIMessage[] = []
  ): Promise<string> {
    if (!userMessage || userMessage.trim().length === 0) {
      throw new Error('No message provided');
    }

    const truncatedText =
      pdfText.length > 8_000 ? pdfText.substring(0, 8_000) + '...' : pdfText;

    const messages: AIMessage[] = [
      {
        role: 'system',
        content: `You are a helpful AI assistant discussing the content of a document. Here is the document content:\n\n${truncatedText}\n\nAnswer questions and discuss topics based on this document.`,
      },
      ...conversationHistory,
      {
        role: 'user',
        content: userMessage,
      },
    ];

    try {
      return await this.makeRequest(messages, { max_tokens: 512, temperature: 0.5 });
    } catch (error: any) {
      console.error('Groq chat error:', error);
      throw new Error(error.message || 'Failed to process chat message. Please try again.');
    }
  }

  /**
   * Verify the Groq API connection is working.
   * Returns true on success, false on failure.
   */
  async testConnection(): Promise<boolean> {
    try {
      const messages: AIMessage[] = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Say "OK" if you can read this.' },
      ];
      await this.makeRequest(messages, { max_tokens: 10 });
      return true;
    } catch (error) {
      console.error('Groq connection test failed:', error);
      return false;
    }
  }
}

// ──────────────────────────────────────────────
// Exports
// ──────────────────────────────────────────────

/** Singleton instance – import this throughout the app */
export const groqAI = new GroqAI();

/**
 * Legacy alias kept for backwards compatibility.
 * Any code that previously imported `perplexityAI` can be
 * updated to import `groqAI` or continue via this alias.
 * @deprecated Use `groqAI` directly.
 */
export const perplexityAI = groqAI;
