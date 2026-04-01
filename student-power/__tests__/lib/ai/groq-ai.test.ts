/**
 * Unit tests for the Groq AI service
 *
 * These tests mock the global `fetch` so no real network calls are made.
 * They verify that GroqAI correctly:
 *  - Builds the right request payload
 *  - Parses a successful response
 *  - Throws meaningful errors for 401 / 429 / non-OK responses
 *  - Returns a boolean from testConnection()
 */

// We need to import after we set up env vars (done via jest.config.js / jest.setup.js)
// but the module reads process.env at import time, so we mock the API calls instead.

// ──────────────────────────────────────────────
// Mock global fetch
// ──────────────────────────────────────────────

const mockFetch = jest.fn();
global.fetch = mockFetch;

// Helper: create an OpenAI-compatible success response
function makeMockResponse(content: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: async () => ({
      id: 'chatcmpl-test',
      model: 'llama-3.3-70b-versatile',
      created: Date.now(),
      choices: [
        {
          index: 0,
          finish_reason: 'stop',
          message: { role: 'assistant', content },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    }),
    text: async () => JSON.stringify({ error: 'mock error' }),
  };
}

// Helper: create an error response
function makeErrorResponse(status: number, errorText = 'error body') {
  return {
    ok: false,
    status,
    statusText: 'Error',
    json: async () => ({}),
    text: async () => errorText,
  };
}

// ──────────────────────────────────────────────
// Import module under test AFTER mocks are set up
// ──────────────────────────────────────────────

import { groqAI } from '@/lib/ai/groq-ai';

// ──────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────

describe('GroqAI service', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  // ── summarize ───────────────────────────────

  describe('summarize()', () => {
    it('returns the AI response text on success', async () => {
      mockFetch.mockResolvedValueOnce(makeMockResponse('This is a great summary.'));

      const result = await groqAI.summarize('Some PDF text content here.');

      expect(result).toBe('This is a great summary.');
    });

    it('calls the Groq API endpoint', async () => {
      mockFetch.mockResolvedValueOnce(makeMockResponse('summary'));

      await groqAI.summarize('text');

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    });

    it('sends the correct model in the request body', async () => {
      mockFetch.mockResolvedValueOnce(makeMockResponse('summary'));

      await groqAI.summarize('text');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.model).toBe('llama-3.3-70b-versatile');
    });

    it('truncates input text longer than 10 000 chars', async () => {
      mockFetch.mockResolvedValueOnce(makeMockResponse('summary'));
      const longText = 'a'.repeat(15_000);

      await groqAI.summarize(longText);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const userMsg: string = body.messages[1].content;
      // The truncated text + '...' should appear in the user message
      expect(userMsg).toContain('...');
      // Total user message length should be well under 15 000 + overhead
      expect(userMsg.length).toBeLessThan(12_000);
    });

    it('throws on empty text', async () => {
      await expect(groqAI.summarize('')).rejects.toThrow(
        'No text provided for summarization'
      );
    });

    it('throws a meaningful error on 401', async () => {
      mockFetch.mockResolvedValueOnce(makeErrorResponse(401));

      await expect(groqAI.summarize('text')).rejects.toThrow(
        'Authentication failed'
      );
    });

    it('throws a meaningful error on 429', async () => {
      mockFetch.mockResolvedValueOnce(makeErrorResponse(429));

      await expect(groqAI.summarize('text')).rejects.toThrow(
        'Rate limit exceeded'
      );
    });
  });

  // ── answerQuestion ───────────────────────────

  describe('answerQuestion()', () => {
    it('returns the AI answer on success', async () => {
      mockFetch.mockResolvedValueOnce(makeMockResponse('The answer is 42.'));

      const result = await groqAI.answerQuestion('What is the answer?', 'PDF content');

      expect(result).toBe('The answer is 42.');
    });

    it('throws on empty question', async () => {
      await expect(groqAI.answerQuestion('', 'PDF content')).rejects.toThrow(
        'No question provided'
      );
    });

    it('throws when no PDF content is provided', async () => {
      await expect(
        groqAI.answerQuestion('What is this?', '')
      ).rejects.toThrow('No PDF content available');
    });
  });

  // ── chat ────────────────────────────────────

  describe('chat()', () => {
    it('returns the AI response on success', async () => {
      mockFetch.mockResolvedValueOnce(makeMockResponse('Sure, let me explain that.'));

      const result = await groqAI.chat('Explain Chapter 1', 'PDF text here');

      expect(result).toBe('Sure, let me explain that.');
    });

    it('appends conversation history to the messages array', async () => {
      mockFetch.mockResolvedValueOnce(makeMockResponse('response'));

      const history = [
        { role: 'user' as const, content: 'First message' },
        { role: 'assistant' as const, content: 'First reply' },
      ];

      await groqAI.chat('Follow-up question', 'PDF text', history);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      // System message + 2 history messages + new user message = 4
      expect(body.messages).toHaveLength(4);
      expect(body.messages[1].content).toBe('First message');
      expect(body.messages[3].content).toBe('Follow-up question');
    });

    it('throws on empty message', async () => {
      await expect(groqAI.chat('', 'PDF text')).rejects.toThrow(
        'No message provided'
      );
    });
  });

  // ── testConnection ───────────────────────────

  describe('testConnection()', () => {
    it('returns true when the API responds successfully', async () => {
      mockFetch.mockResolvedValueOnce(makeMockResponse('OK'));

      const result = await groqAI.testConnection();

      expect(result).toBe(true);
    });

    it('returns false when the API call fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await groqAI.testConnection();

      expect(result).toBe(false);
    });

    it('returns false on a non-OK HTTP response', async () => {
      mockFetch.mockResolvedValueOnce(makeErrorResponse(500, 'server error'));

      const result = await groqAI.testConnection();

      expect(result).toBe(false);
    });
  });
});
