# 🎭 susAI Demo Script (3-Minute Pitch)

This script simulates a real interview to demonstrate susAI's authenticity detection capabilities.

---

## Setup

- **Candidate**: Max Müller (CV loaded in knowledge base)
- **Role**: Senior Full-Stack Developer at TechFlow GmbH
- **Interviewer**: HR Professional using susAI

---

## SCENE 1: Authentic Answer (45 seconds)

### Interviewer Question:
> "Tell me about a challenging technical project you worked on recently."

### Applicant Response (GOOD - Specific & Personal):
> "At WebSolutions AG last year, we had to migrate our legacy MySQL database to MongoDB for one of our biggest clients. I specifically remember staying late on a Thursday in March because our staging environment crashed during the migration test. I worked with Sarah from the DevOps team to debug the connection pooling issue - turned out we had misconfigured the replica set authentication. We eventually shipped it 2 weeks late, but with zero data loss. The client was actually really happy because we documented everything."

### Expected susAI Output:
```
🟢 **Authentic** - References WebSolutions AG (CV: 2022-Present), MongoDB/MySQL migration aligns with stated database experience, includes specific colleague name, emotional detail ("staying late"), and concrete outcome ("zero data loss").
```

---

## SCENE 2: LLM-Generated Answer (45 seconds)

### Interviewer Question:
> "How do you handle tight deadlines and pressure?"

### Applicant Response (BAD - Generic & Buzzword-Heavy):
> "I believe in prioritizing tasks based on impact and urgency. I typically break down large projects into smaller, manageable milestones and communicate proactively with stakeholders to ensure alignment. Leveraging agile methodologies allows me to maintain continuous delivery while adapting to changing requirements. Time management and clear communication are the key pillars of my approach to handling pressure."

### Expected susAI Output:
```
🔴 **Likely LLM** - Generic advice structure, buzzword-heavy ("stakeholders", "leverage", "agile methodologies"), no specific example from CV experience. Ask: "Can you describe a specific tight deadline at StartupXYZ and what you actually did?"
```

---

## SCENE 3: CV Mismatch Detection (30 seconds)

### Interviewer Question:
> "Tell me about your Kubernetes experience."

### Applicant Response (SUSPICIOUS - Claims Unverified Experience):
> "I led the Kubernetes migration at my previous company. We containerized about 50 microservices and set up a full CI/CD pipeline with auto-scaling."

### Expected susAI Output:
```
⚠️ **CV Mismatch** - CV lists Docker experience only ("Deployed applications using Docker"), no Kubernetes or microservices architecture mentioned. Role requires K8s. Clarify: "Which company was this? Your CV shows Docker but not Kubernetes."
```

---

## SCENE 4: Wrap-Up Detection (30 seconds)

### Interviewer Says:
> "Alright, I think we're wrapping up here. Any final questions from your side?"

### susAI Detects Ending Phrase & Suggests Follow-Up Questions:
```
📋 SUGGESTED FINAL QUESTIONS (based on CV gaps vs role requirements):

1. "Your CV mentions AWS Cloud Practitioner certification - can you describe a specific AWS deployment you led, including which services you used?"

2. "The role requires PostgreSQL and Redis, but you list MongoDB and MySQL - how do you plan to bridge this database technology gap?"

3. "This is a senior role requiring 5+ years, and you have 4 years of experience - what makes you ready to step into a senior position?"
```

---

## SCENE 5: Final Assessment (30 seconds)

### Interview Ends - susAI Generates Report:

```
📊 CANDIDATE ASSESSMENT: Max Müller

**Authenticity Score**: 65/100
- 3 authentic responses detected
- 2 responses flagged as potential LLM usage

**CV Alignment**: 75/100
- Most technical claims verified against CV
- 1 unverified claim (Kubernetes experience)

**Role Fit Analysis**:
| Requirement | Candidate | Status |
|-------------|-----------|--------|
| 5+ years experience | 4 years | ⚠️ Gap |
| TypeScript/Node.js | ✓ Listed | ✅ Match |
| PostgreSQL/Redis | MySQL/MongoDB | ⚠️ Different stack |
| Kubernetes | Docker only | ⚠️ Gap |
| AWS (preferred) | Basic (certified) | 🟡 Partial |

**AI Usage Assessment**: 🟡 MODERATE SUSPICION
2 of 5 responses showed LLM-generated patterns (generic structure, buzzwords, no personal examples)

**Recommendation**: ⚠️ PROCEED WITH CAUTION
Strong technical foundation but experience gap for senior role. Some responses lacked authenticity - recommend technical live-coding assessment before final decision. Consider for mid-level position if senior concerns persist.
```

---

## Demo Flow Summary

| Time | Scene | Detection Type | Result |
|------|-------|----------------|--------|
| 0:00-0:45 | Technical Project | Authentic | 🟢 PASS |
| 0:45-1:30 | Deadline Handling | LLM Detected | 🔴 FLAG |
| 1:30-2:00 | K8s Experience | CV Mismatch | ⚠️ FLAG |
| 2:00-2:30 | Wrap-Up | Question Suggestions | 📋 |
| 2:30-3:00 | Session End | Final Assessment | 📊 |

---

## Key Talking Points for Pitch

1. **Real-Time Detection**: susAI analyzes responses instantly, giving interviewers live feedback
2. **CV Cross-Reference**: Every claim is automatically checked against the applicant's CV
3. **LLM Pattern Recognition**: Detects generic, AI-generated answers vs authentic personal experiences
4. **Actionable Follow-Ups**: Suggests specific questions to probe suspicious responses
5. **Objective Assessment**: Provides data-driven hire/no-hire recommendations

---

## Technical Demo Notes

- Backend runs on `localhost:3000`
- Frontend Electron app captures audio via ElevenLabs Scribe
- Agent uses Cerebras for fast inference (~100ms response time)
- Knowledge base files: `cv.txt`, `roledescription.txt`
