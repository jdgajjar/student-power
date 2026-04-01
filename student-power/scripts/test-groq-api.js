#!/usr/bin/env node

/**
 * Test script for Groq AI API
 *
 * Migration: Replaced test-perplexity-api.js
 * Tests the GROQ_API_KEY and connection to ensure proper authentication.
 *
 * Usage:
 *   GROQ_API_KEY=gsk_xxx node scripts/test-groq-api.js
 */

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';

async function testGroqAPI() {
  console.log('🧪 Testing Groq AI API...\n');
  console.log('API URL :', GROQ_API_URL);
  console.log('Model   :', MODEL);
  console.log(
    'API Key :',
    GROQ_API_KEY ? GROQ_API_KEY.substring(0, 15) + '...' : '⚠️  NOT SET\n'
  );

  if (!GROQ_API_KEY) {
    console.error('❌ GROQ_API_KEY is not set. Export it before running this script.');
    console.error('   Example: GROQ_API_KEY=gsk_xxx node scripts/test-groq-api.js');
    process.exit(1);
  }

  // ── Test 1: Simple completion ──────────────────
  console.log('\n📝 Test 1: Simple completion request...');
  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          {
            role: 'user',
            content: 'Say "Hello! Groq API is working correctly." if you can read this.',
          },
        ],
        max_tokens: 50,
        temperature: 0.2,
        stream: false,
      }),
    });

    const responseText = await response.text();

    console.log('Status:', response.status, response.statusText);

    if (!response.ok) {
      console.error('❌ Test 1 FAILED');
      console.error('Error details:', responseText);
      return false;
    }

    const data = JSON.parse(responseText);

    if (data.choices && data.choices.length > 0) {
      console.log('✅ Test 1 PASSED');
      console.log('AI Response:', data.choices[0].message.content);
      console.log('Tokens used:', data.usage);
    } else {
      console.error('❌ Test 1 FAILED: No response from AI');
      return false;
    }
  } catch (error) {
    console.error('❌ Test 1 FAILED with exception:', error.message);
    return false;
  }

  // ── Test 2: Summarization request ─────────────
  console.log('\n📝 Test 2: Summarization request...');
  try {
    const testText =
      'This is a test document about artificial intelligence and machine learning. ' +
      'AI is transforming various industries by enabling computers to learn from data ' +
      'and make intelligent decisions. Machine learning is a subset of AI that focuses ' +
      'on algorithms that can learn patterns from data.';

    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful AI assistant that creates concise summaries.',
          },
          {
            role: 'user',
            content: `Please provide a brief summary of the following text:\n\n${testText}`,
          },
        ],
        max_tokens: 200,
        temperature: 0.3,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Test 2 FAILED');
      console.error('Error details:', errorText);
      return false;
    }

    const data = await response.json();

    if (data.choices && data.choices.length > 0) {
      console.log('✅ Test 2 PASSED');
      console.log('Summary:', data.choices[0].message.content);
    } else {
      console.error('❌ Test 2 FAILED: No response from AI');
      return false;
    }
  } catch (error) {
    console.error('❌ Test 2 FAILED with exception:', error.message);
    return false;
  }

  console.log('\n🎉 All tests passed! Groq AI API is working correctly.');
  return true;
}

// Run the tests
testGroqAPI()
  .then((success) => process.exit(success ? 0 : 1))
  .catch((error) => {
    console.error('Test script failed:', error);
    process.exit(1);
  });
