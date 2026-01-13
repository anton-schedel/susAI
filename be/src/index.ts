import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { runAgentLoop, poll, messageHistory, getKnowledgeBase, clearHistory } from './agent_loop';
import { cerebras } from '@ai-sdk/cerebras';
import { generateText } from 'ai';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Healthcheck endpoint
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    service: 'susai-backend'
  });
});

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({
    message: 'susAI - Interview Authenticity Detector API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      agentRun: '/agent/run (POST)',
      agentPoll: '/agent/poll (GET)',
      suggestQuestions: '/agent/suggest-questions (POST)',
      finalAssessment: '/agent/final-assessment (POST)',
      resetSession: '/agent/reset (POST)'
    }
  });
});

// ElevenLabs token generation endpoint
app.get('/scribe-token', async (req: Request, res: Response) => {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    
    if (!apiKey) {
      return res.status(500).json({
        error: 'ELEVENLABS_API_KEY is not configured. Please set it in your .env file.'
      });
    }

    const response = await fetch(
      'https://api.elevenlabs.io/v1/single-use-token/realtime_scribe',
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      return res.status(response.status).json({
        error: 'Failed to generate token',
        details: errorData
      });
    }

    const data = await response.json() as { token: string };
    res.json({ token: data.token });
  } catch (error) {
    console.error('Error generating ElevenLabs token:', error);
    res.status(500).json({
      error: 'Internal server error while generating token'
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 susAI Server is running on http://localhost:${PORT}`);
  console.log(`📊 Healthcheck available at http://localhost:${PORT}/health`);
});


app.post('/agent/run', async (req: Request, res: Response) => {
  const { transcript } = req.body;

  // log that we received the request
  console.log('Received request to run agent loop:', req.body)
  
  if (!transcript) {
    return res.status(400).json({ error: 'Missing required fields: transcript' });
  }
  
  runAgentLoop(transcript);
  res.status(200).json({ message: 'Agent loop started' });
});

app.get('/agent/poll', (req: Request, res: Response) => {
  const result = poll();
  if (result) {
    console.log("Polled: ", result);
  }
  res.status(200).json({ result });
});

// Suggest follow-up questions based on CV and role description - triggered when wrap-up phrases detected
app.post('/agent/suggest-questions', async (req: Request, res: Response) => {
  try {
    const { transcripts } = req.body;
    const { cv, roleDescription } = getKnowledgeBase();
    
    console.log('📋 [Suggest] Generating follow-up questions...');

    const suggestPrompt = `You are an expert HR interviewer. Based on the CV and role description, suggest 1 targeted follow-up question.

### APPLICANT CV
${cv}

### ROLE DESCRIPTION  
${roleDescription}

### INTERVIEW SO FAR
${transcripts && Array.isArray(transcripts) ? transcripts.map((t: string, i: number) => `[${i + 1}] ${t}`).join('\n') : 'No transcripts yet'}

Generate exactly 1 follow-up question that probes the most important gap between the CV and role requirements, or tests authenticity of a claim made during the interview.

Output ONLY the question itself - no numbering, no prefix, just the question. Keep it to 1-2 sentences max.`;

    const result = await generateText({
      model: cerebras('gpt-oss-120b'),
      prompt: suggestPrompt,
    });

    console.log('✅ [Suggest] Questions generated successfully');
    
    res.status(200).json({ 
      questions: result.text,
      transcriptCount: transcripts?.length || 0
    });
  } catch (error) {
    console.error('❌ [Suggest] Error generating questions:', error);
    res.status(500).json({ 
      error: 'Failed to generate questions',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Final assessment endpoint - generates hire/no-hire recommendation with AI usage assessment
app.post('/agent/final-assessment', async (req: Request, res: Response) => {
  try {
    console.log('📝 [Assessment] Generating final candidate assessment...');
    
    const { cv, roleDescription } = getKnowledgeBase();
    
    // Get conversation history
    const conversationHistory = messageHistory.filter(m => m.role === 'user' || m.role === 'assistant');
    
    if (conversationHistory.length === 0) {
      return res.status(400).json({ 
        error: 'No interview history available. Conduct an interview first.' 
      });
    }

    // Count authenticity assessments
    const assistantMessages = messageHistory.filter(m => m.role === 'assistant');
    const authenticCount = assistantMessages.filter(m => m.content.includes('🟢')).length;
    const llmSuspectedCount = assistantMessages.filter(m => m.content.includes('🔴')).length;
    const unclearCount = assistantMessages.filter(m => m.content.includes('🟡')).length;
    const mismatchCount = assistantMessages.filter(m => m.content.includes('⚠️')).length;

    // Get user transcripts only (applicant responses)
    const userTranscripts = messageHistory.filter(m => m.role === 'user').map(m => m.content);

    const assessmentPrompt = `You are an expert HR consultant providing a final candidate assessment.

### APPLICANT CV
${cv}

### ROLE DESCRIPTION
${roleDescription}

### INTERVIEW TRANSCRIPT & AUTHENTICITY ANALYSIS
${conversationHistory.map(m => `[${m.role.toUpperCase()}]: ${m.content}`).join('\n\n')}

### REAL-TIME DETECTION SUMMARY
- Authentic responses (🟢): ${authenticCount}
- LLM-suspected responses (🔴): ${llmSuspectedCount}
- Unclear responses (🟡): ${unclearCount}
- CV mismatches (⚠️): ${mismatchCount}

Provide a final assessment with these sections (NO SCORES - due to data protection):

**Summary**: Brief overview of the interview and key observations about the candidate's responses.

**Role Fit**: Brief analysis of how the candidate matches the role requirements.

**AI Usage Assessment**: 🟢 LOW SUSPICION | 🟡 MODERATE SUSPICION | 🔴 HIGH SUSPICION
(with brief justification based on response patterns)

**Recommendation**: ✅ HIRE | ⚠️ PROCEED WITH CAUTION | ❌ DO NOT HIRE
(with 1-2 sentence justification)

Be concise and direct. Do NOT include numerical scores.`;

    const result = await generateText({
      model: cerebras('gpt-oss-120b'),
      prompt: assessmentPrompt,
    });

    console.log('✅ [Assessment] Final assessment generated successfully');
    
    res.status(200).json({ 
      assessment: result.text,
      transcript: userTranscripts,
      stats: {
        totalResponses: assistantMessages.length,
        authentic: authenticCount,
        llmSuspected: llmSuspectedCount,
        unclear: unclearCount,
        cvMismatch: mismatchCount
      }
    });
  } catch (error) {
    console.error('❌ [Assessment] Error generating assessment:', error);
    res.status(500).json({ 
      error: 'Failed to generate assessment',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Reset session - clears history for new interview
app.post('/agent/reset', (req: Request, res: Response) => {
  console.log('🔄 [Reset] Clearing interview session...');
  clearHistory();
  res.status(200).json({ message: 'Session reset successfully' });
});