/**
 * PDF Analyzer using Groq AI API
 *
 * Migration Note: Previously used Perplexity AI; now uses Groq for
 * faster inference and free-tier support.
 *
 * Environment variable: GROQ_API_KEY
 * Get your key at: https://console.groq.com/keys
 */

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Using llama-3.3-70b-versatile – high quality with a generous context window
const MODEL = 'llama-3.3-70b-versatile';

class PDFAnalyzer {
  private isInitialized = false;
  private currentPDFText: string = '';
  private apiKey: string = '';

  async initialize() {
    if (this.isInitialized) return;

    try {
      console.log('Initializing Groq AI...');

      // Read API key from server-side environment variable
      this.apiKey = GROQ_API_KEY;

      if (!this.apiKey) {
        throw new Error(
          'Groq API key not found. Please set GROQ_API_KEY environment variable.'
        );
      }

      this.isInitialized = true;
      console.log('Groq AI initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Groq AI:', error);
      throw new Error('Failed to initialize AI. Please check your API key configuration.');
    }
  }

  /** Store the extracted text of the currently open PDF */
  setPDFText(text: string) {
    this.currentPDFText = text;
  }

  /**
   * Generate a concise academic summary of the provided (or stored) PDF text.
   */
  async summarize(text?: string): Promise<string> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const textToSummarize = text || this.currentPDFText;

    if (!textToSummarize || textToSummarize.trim().length === 0) {
      throw new Error('No text available to summarize');
    }

    try {
      // Groq supports large context windows; we still truncate to keep costs low
      const maxChars = 8_000;
      const truncatedText = textToSummarize.substring(0, maxChars);

      const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            {
              role: 'system',
              content:
                'You are a helpful assistant that summarizes academic documents. Focus on extracting key concepts, main ideas, and important details from the provided PDF content. Provide a concise yet comprehensive summary.',
            },
            {
              role: 'user',
              content: `Please summarize the following PDF content:\n\n${truncatedText}`,
            },
          ],
          temperature: 0.2,
          max_tokens: 500,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `Groq API error: ${response.status} - ${(errorData as any).error || response.statusText}`
        );
      }

      const data = await response.json();

      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error('Invalid response from Groq API');
      }

      return data.choices[0].message.content;
    } catch (error) {
      console.error('Groq summarization error:', error);
      if (error instanceof Error) {
        throw new Error(`Failed to generate summary: ${error.message}`);
      }
      throw new Error('Failed to generate summary. Please try again.');
    }
  }

  /**
   * Answer a question based on the provided (or stored) PDF text.
   */
  async answerQuestion(question: string, context?: string): Promise<string> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const contextText = context || this.currentPDFText;

    if (!contextText || contextText.trim().length === 0) {
      throw new Error('No PDF content loaded to answer questions');
    }
    if (!question || question.trim().length === 0) {
      throw new Error('Please provide a question');
    }

    try {
      const maxChars = 8_000;
      const truncatedContext = contextText.substring(0, maxChars);

      const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            {
              role: 'system',
              content:
                'You are a helpful assistant that answers questions based on PDF documents. PRIORITIZE information from the PDF content provided. If the answer is in the PDF, use that information first. You may supplement with general knowledge only if needed, but always indicate when you do so. Be precise and cite relevant parts of the document.',
            },
            {
              role: 'user',
              content: `PDF Content:\n${truncatedContext}\n\nQuestion: ${question}\n\nPlease answer based primarily on the PDF content above. If you use information beyond the PDF, clearly indicate it.`,
            },
          ],
          temperature: 0.3,
          max_tokens: 800,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `Groq API error: ${response.status} - ${(errorData as any).error || response.statusText}`
        );
      }

      const data = await response.json();

      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error('Invalid response from Groq API');
      }

      return data.choices[0].message.content;
    } catch (error) {
      console.error('Groq question answering error:', error);
      if (error instanceof Error) {
        throw new Error(`Failed to answer question: ${error.message}`);
      }
      throw new Error('Failed to answer question. Please try again.');
    }
  }

  /** Return the current initialization and content status */
  getStatus(): { initialized: boolean; hasContent: boolean } {
    return {
      initialized: this.isInitialized,
      hasContent: this.currentPDFText.length > 0,
    };
  }
}

// Export singleton instance
export const pdfAnalyzer = new PDFAnalyzer();
