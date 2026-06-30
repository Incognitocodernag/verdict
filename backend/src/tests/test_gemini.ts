import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

async function testGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  console.log('Testing Gemini API with Key starting with:', apiKey?.substring(0, 10));

  if (!apiKey) {
    console.error('No GEMINI_API_KEY found in environment.');
    return;
  }

  const responseSchema: any = {
    type: 'object',
    properties: {
      R_total: { type: 'integer' },
      N_spam: { type: 'integer' },
      N_fatal: { type: 'integer' },
      N_nuance: { type: 'integer' },
      S_mismatch: { type: 'integer' },
      S_hijacked: { type: 'integer' },
      aspects: {
        type: 'object',
        properties: {}
      },
      pros: { 
        type: 'array', 
        items: { type: 'string' }
      },
      cons: { 
        type: 'array', 
        items: { type: 'string' }
      },
      verdict_reason: { type: 'string' },
      fatal_flaw_summary: { type: 'string' },
      reviews_analysis: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            classification: { type: 'string' },
            persona: { type: 'string' }
          },
          required: ['classification', 'persona']
        }
      }
    },
    required: ['R_total', 'N_spam', 'N_fatal', 'N_nuance', 'S_mismatch', 'S_hijacked', 'aspects', 'pros', 'cons', 'verdict_reason', 'fatal_flaw_summary', 'reviews_analysis']
  };

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    
    console.log('\n--- Sending Generation Request ---');
    const model = genAI.getGenerativeModel({
      model: 'gemini-3.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: responseSchema,
        temperature: 0.0
      }
    });

    const result = await model.generateContent("Analyze product reviews. Return mock data for 1 review: [Rating: 5, Verified: YES, Helpful: 2] Good watch.");
    console.log('Response text successfully received:\n', result.response.text());

  } catch (error) {
    console.error('❌ Gemini Test Failed:', error);
  }
}

testGemini();
