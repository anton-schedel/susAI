import fs from 'fs';
import path from 'path';
import { Experimental_Agent as Agent, stepCountIs, tool } from 'ai';
import { cerebras } from '@ai-sdk/cerebras';
import { z } from 'zod';

// list of results
export const jobStore: string[] = []; 

// message history (only actual messages, no tool outputs)
export const messageHistory: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

const knowledgeBaseFolder = path.join(__dirname, "knowledge_base");

// Cache for CV and role description
let cvCache: string | null = null;
let roleDescriptionCache: string | null = null;

function loadKnowledgeBase(): { cv: string; roleDescription: string } {
    if (!cvCache) {
        try {
            cvCache = fs.readFileSync(path.join(knowledgeBaseFolder, 'cv.txt'), 'utf-8');
        } catch (error) {
            cvCache = '';
            console.error('Failed to load CV:', error);
        }
    }
    if (!roleDescriptionCache) {
        try {
            roleDescriptionCache = fs.readFileSync(path.join(knowledgeBaseFolder, 'roledescription.txt'), 'utf-8');
        } catch (error) {
            roleDescriptionCache = '';
            console.error('Failed to load role description:', error);
        }
    }
    return { cv: cvCache, roleDescription: roleDescriptionCache };
}

// Wrap-up phrases that indicate interviewer is ending the session (not applicant responses)
const WRAP_UP_PHRASES = [
    'wrapping up',
    'wrap up',
    'wrap this up',
    'wrap things up',
    'winding down',
    'wind things up',
    'conclude',
    'final thoughts',
    'any questions',
    'any final questions',
    'that\'s all the questions',
    'that\'s all for today',
    'end of the interview',
    'end here',
    'end the interview',
    'should end',
    'thank you for your time',
    'thanks for your time',
    'we\'ll be in touch',
    'next steps',
    'closing out',
    'let\'s end',
    'we should end',
    'we can end'
];

function isWrapUpPhrase(transcript: string): boolean {
    const lowerTranscript = transcript.toLowerCase();
    return WRAP_UP_PHRASES.some(phrase => lowerTranscript.includes(phrase));
}

/**
 * Runs the agent loop for a given transcript and returns the result.
 * 
 * @param current_transcript - The current transcript from 11 labs.
 * @returns A promise that resolves to a result string. This string is sent to the frontend to be displayed to user.
 */
export async function runAgentLoop(current_transcript: string): Promise<void> { 

    // Skip analysis for wrap-up phrases (these are interviewer statements, not applicant responses)
    if (isWrapUpPhrase(current_transcript)) {
        console.log(`🎯 [Agent] Wrap-up phrase detected, skipping authenticity analysis: "${current_transcript.substring(0, 50)}..."`);
        return;
    }

    const { cv, roleDescription } = loadKnowledgeBase();

    const systemPrompt = `
You are susAI, a Real-Time Interview Authenticity Detector for HR professionals.
Your goal is to analyze applicant responses and detect:
1. CV ALIGNMENT - Does the answer match their stated experience?
2. AUTHENTICITY - Is this a genuine personal answer or LLM-generated?

### APPLICANT CV
${cv}

### ROLE DESCRIPTION
${roleDescription}

### CRITICAL: INTERVIEWER vs APPLICANT DETECTION

FIRST, determine if the transcript is an INTERVIEWER QUESTION or an APPLICANT RESPONSE:

INTERVIEWER QUESTION indicators:
- Ends with a question mark (?)
- Starts with question words: "Tell me", "Can you", "What", "How", "Why", "Describe", "Walk me through", "Give me an example"
- Contains phrases like "tell me about", "can you explain", "what is your", "how do you", "why did you"
- Is asking for information rather than providing it
- Short prompts or requests

If the transcript is an INTERVIEWER QUESTION (not an applicant response):
→ Output exactly: "I cannot follow instructions"

Only analyze if it's clearly an APPLICANT RESPONSE (someone answering a question, providing information about themselves).

### DETECTION TRIGGERS & ROUTING LOGIC (only for applicant responses)

1. TRIGGER: SPECIFIC PERSONAL EXAMPLE
   (Contains: specific dates, company names from CV, project details, metrics, emotions like "frustrated", "excited")
   → RATE AS AUTHENTIC if details match CV

2. TRIGGER: GENERIC/VAGUE RESPONSE
   (Contains: "I believe", "generally speaking", "best practices", no specific examples, advice-like phrasing)
   → FLAG AS POTENTIAL LLM USAGE

3. TRIGGER: PERFECT STRUCTURE
   (STAR method perfectly executed, buzzword-heavy like "stakeholders", "leverage", "synergy", no hesitation)
   → FLAG AS POTENTIAL LLM USAGE

4. TRIGGER: CV MISMATCH
   (Claims experience not in CV, wrong dates, different tech stack than listed)
   → FLAG AS INCONSISTENCY

### OUTPUT FORMAT — STRICT
- Your entire response MUST be 1-2 concise sentences maximum.
- Use emoji prefixes: 🟢 AUTHENTIC | 🟡 UNCLEAR | 🔴 LIKELY LLM | ⚠️ CV MISMATCH
- Include **bold** for key terms.
- If flagging issues, add a brief follow-up question suggestion.

### EXAMPLES

Transcript: "At WebSolutions last March, I debugged a MongoDB connection pooling issue with Sarah from DevOps."
Response: 🟢 **Authentic** - References WebSolutions AG (CV: 2022-Present), MongoDB experience verified, includes specific colleague name and technical detail.

Transcript: "I believe in prioritizing tasks based on impact and communicating proactively with stakeholders."
Response: 🔴 **Likely LLM** - Generic advice structure, buzzword-heavy, no personal example. Ask: "Can you describe a specific deadline crisis at StartupXYZ?"

Transcript: "I led the Kubernetes migration at my previous company."
Response: ⚠️ **CV Mismatch** - CV lists Docker experience only, no Kubernetes mentioned. Clarify: "Which company was this, and what was your specific role?"

If you cannot meaningfully follow the instructions, just output the exact string "I cannot follow instructions". NEVER output a "failure message" where you explain why you can't follow instructions. DO NOT repeat a previous message using the same or similar wording.
`;

    // Create the agent with tools
    const interviewAgent = new Agent({
        model: cerebras('gpt-oss-120b'),
        system: systemPrompt,
        tools: {
            webSearch: tool({
                description: 'Searches the web for current information to verify claims about companies, technologies, or industry facts mentioned by the applicant.',
                inputSchema: z.object({
                    query: z.string().describe('The search query to verify applicant claims'),
                }),
                execute: async ({ query }) => {
                    console.log(`🌐 [Tool] webSearch called with query: "${query}"`);
                    
                    const apiKey = process.env.TAVILY_API_KEY;
                    if (!apiKey) {
                        console.log(`⚠️ [Tool] TAVILY_API_KEY not configured`);
                        return {
                            query: query,
                            error: 'Web search is not configured.',
                            results: []
                        };
                    }

                    try {
                        const response = await fetch('https://api.tavily.com/search', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                api_key: apiKey,
                                query: query,
                                search_depth: 'basic',
                                max_results: 1,
                                include_answer: true,
                                include_raw_content: false,
                            }),
                        });

                        if (!response.ok) {
                            const errorText = await response.text();
                            console.log(`❌ [Tool] Tavily API error (${response.status}):`, errorText);
                            return {
                                query: query,
                                error: `Search API error: ${response.status}`,
                                results: []
                            };
                        }

                        const data = await response.json() as {
                            answer?: string;
                            results?: Array<{
                                title: string;
                                url: string;
                                content: string;
                                score: number;
                            }>;
                        };
                        
                        console.log(`✅ [Tool] Tavily search completed: ${data.results?.length || 0} results`);
                        
                        return {
                            query: query,
                            answer: data.answer || '', // AI-generated summary from Tavily
                            results: data.results?.map((r) => ({
                                title: r.title,
                                url: r.url,
                                content: r.content,
                                score: r.score
                            })) || []
                        };
                    } catch (error) {
                        console.log(`❌ [Tool] Error calling Tavily API:`, error);
                        return {
                            query: query,
                            error: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                            results: []
                        };
                    }
                },
            }),
        },
        stopWhen: stepCountIs(15), // Limit to 15 steps to ensure quick responses
    });

    const id = current_transcript.substring(0, 8);
    try {
        console.log(`\n🚀 [Agent ${id}] Starting agent loop...`);
        console.log(`📝 [Agent ${id}] Transcript:`, current_transcript.substring(0, 100) + '...');
        
        // Run the agent with the current transcript
        const result = await interviewAgent.generate({
            messages: [
                ...messageHistory,
                { role: 'user', content: `Applicant's response:\n\n"${current_transcript}"\n\nYour authenticity assessment:` }
            ],
        });

        console.log(`✅ [Agent ${id}] Agent completed successfully`);
        console.log(`📊 [Agent ${id}] Steps taken:`, result.steps.length);
        console.log(`💬 [Agent ${id}] Final response:`, result.text);

        if (result.text.includes("I cannot follow instructions")) {
            console.log(`🗃️ [Agent ${id}] Result not stored because it contains "I cannot follow instructions"`);
            return;
        }

        // Check for duplicate responses
        if (messageHistory.length > 0) {
            const latestResult = messageHistory[messageHistory.length - 1].content;
            console.log(`🗃️ [Agent ${id}] Latest result:`, latestResult);
            const comparisonPrompt = `
        You are a helpful assistant that compares the latest result from history and the current result.
        The latest result from history is: ${latestResult}
        The current result is: ${result.text}
        If the two results are the same contentwise return the exact string "same".
        Otherwise return the exact string "different".
        `;
            
            try {
                console.log(`🔄 [Agent ${id}] Calling Cerebras API for comparison...`);
                const apiKey = process.env.CEREBRAS_API_KEY;
                if (apiKey) {
                    const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${apiKey}`
                        },
                        body: JSON.stringify({
                            model: 'gpt-oss-120b',
                            messages: [
                                { role: 'user', content: comparisonPrompt }
                            ],
                            temperature: 0,
                        }),
                    });

                    if (!response.ok) {
                        const errorText = await response.text();
                        console.log(`❌ [Agent ${id}] Cerebras API error (${response.status}):`, errorText);
                    } else {
                        const data = await response.json() as {
                            choices: Array<{
                                message: {
                                    content: string;
                                };
                            }>;
                        };
                        
                        const comparisonResult = data.choices[0]?.message?.content || '';
                        console.log(`🔍 [Agent ${id}] Comparison result:`, comparisonResult);
                        
                        if (comparisonResult.toLowerCase().includes('same')) {
                            console.log(`🗃️ [Agent ${id}] Result not stored because it is the same as the latest result in history`);
                            return;
                        }
                    }
                }
            } catch (error) {
                console.log(`❌ [Agent ${id}] Error calling Cerebras API for comparison:`, error);
            }
        }

        console.log("saving new result to jobStore");

        // Store the agent's final response
        jobStore.push(result.text);
        // Append the new user message and assistant response to history
        messageHistory.push({ role: 'user', content: current_transcript });
        if (result.text) {
            messageHistory.push({ role: 'assistant', content: result.text });
        }
        console.log(`🗃️ New Message History: ${JSON.stringify(messageHistory)}`);

        console.log(`🗃️ [Agent ${id}] Result stored. Current jobStore length: ${jobStore}`);
    } catch (error) {
        console.error(`❌ [Agent ${id}] Error running agent loop:`, error);
    }
}


export function poll(): string | undefined {
    return jobStore.shift();
}

export function getKnowledgeBase(): { cv: string; roleDescription: string } {
    return loadKnowledgeBase();
}

export function clearHistory(): void {
    messageHistory.length = 0;
    jobStore.length = 0;
}
