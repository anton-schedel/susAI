# 🔍 susAI

**AI-Powered Real-Time Interview Authenticity Detector**

susAI is a desktop application that provides real-time AI assistance during job interviews. It helps HR professionals detect whether applicant responses are authentic personal experiences or potentially LLM-generated, while verifying claims against the candidate's CV.

![Electron](https://img.shields.io/badge/Electron-39.x-47848F?logo=electron)
![React](https://img.shields.io/badge/React-19.x-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript)
![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?logo=node.js)

---

## ✨ Features

### 🎙️ Real-Time Speech-to-Text
- **ElevenLabs Scribe Integration**: Converts live audio to text in real-time
- **Voice Activity Detection (VAD)**: Automatically segments speech for natural conversation flow
- **Microphone + System Audio Capture**: Captures both interviewer and applicant responses

### 🤖 AI-Powered Authenticity Detection
- **CV Alignment Check**: Verifies if answers match the applicant's stated experience
- **LLM Detection**: Identifies generic, buzzword-heavy responses that suggest AI assistance
- **Real-Time Feedback**: Instant assessment with emoji indicators:
  - 🟢 **Authentic** - Specific personal details matching CV
  - 🟡 **Unclear** - Insufficient detail to assess
  - 🔴 **Likely LLM** - Generic structure, no personal examples
  - ⚠️ **CV Mismatch** - Claims don't align with CV

### 📋 Smart Interview Assistance
- **Wrap-Up Detection**: Recognizes when the interview is concluding
- **Follow-Up Questions**: Suggests targeted questions based on CV gaps and role requirements
- **PDF Export**: Export final assessment as a formatted PDF document

### 📊 Final Assessment
- **Authenticity Score**: Overall rating based on detection results
- **CV Alignment Score**: How well answers matched stated experience
- **AI Usage Assessment**: Suspicion level for LLM assistance
- **Hiring Recommendation**: ✅ HIRE | ⚠️ PROCEED WITH CAUTION | ❌ DO NOT HIRE

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (Electron)                       │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────────┐ │
│  │ Audio       │  │ ElevenLabs   │  │ React UI                │ │
│  │ Capture     │──│ WebSocket    │──│ - Real-time transcripts │ │
│  │ (Mic+System)│  │ (STT)        │  │ - Authenticity badges   │ │
│  └─────────────┘  └──────────────┘  │ - Follow-up questions   │ │
│                                      │ - Final assessment      │ │
│                                      └─────────────────────────┘ │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTP
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Backend (Express)                         │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────────┐ │
│  │ Agent Loop  │  │ Knowledge    │  │ External APIs           │ │
│  │ (Cerebras)  │──│ Base         │──│ - Tavily (Web Search)   │ │
│  │             │  │ (CV + Role)  │  │ - ElevenLabs (Tokens)   │ │
│  └─────────────┘  └──────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 20.x or higher
- **pnpm** (for backend)
- **npm** (for frontend)
- **API Keys**:
  - ElevenLabs API Key
  - Cerebras API Key
  - Tavily API Key (for web search)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-org/susAI.git
   cd susAI
   ```

2. **Install Backend Dependencies**
   ```bash
   cd be
   pnpm install
   ```

3. **Install Frontend Dependencies**
   ```bash
   cd ../fe
   npm install
   ```

4. **Configure Environment Variables**
   
   Create `be/.env`:
   ```env
   ELEVENLABS_API_KEY=your_elevenlabs_api_key
   CEREBRAS_API_KEY=your_cerebras_api_key
   TAVILY_API_KEY=your_tavily_api_key
   PORT=3000
   ```

5. **Add Knowledge Base Files**
   
   Place in `be/src/knowledge_base/`:
   - `cv.txt` - Candidate's CV/Resume
   - `roledescription.txt` - Job role requirements

### Running the Application

1. **Start the Backend**
   ```bash
   cd be
   pnpm dev
   ```

2. **Start the Frontend** (in a new terminal)
   ```bash
   cd fe
   npm run dev
   ```

The Electron app will launch automatically.

---

## 📁 Project Structure

```
susAI/
├── be/                          # Backend (Express + AI)
│   ├── src/
│   │   ├── index.ts            # API routes
│   │   ├── agent_loop.ts       # AI authenticity detection logic
│   │   └── knowledge_base/     # Candidate documents
│   │       ├── cv.txt          # Candidate CV
│   │       └── roledescription.txt  # Role requirements
│   └── package.json
│
├── fe/                          # Frontend (Electron + React)
│   ├── src/
│   │   ├── main/               # Electron main process
│   │   ├── preload/            # Electron preload scripts
│   │   └── renderer/           # React application
│   │       └── src/
│   │           ├── App.tsx     # Main component
│   │           ├── services/
│   │           │   ├── audioCapture.ts
│   │           │   └── elevenLabsWebSocket.ts
│   │           └── assets/
│   │               ├── main.css
│   │               └── susi.png  # AI assistant avatar
│   └── package.json
│
├── demo_script.md              # Demo interview script
└── README.md
```

---

## 🔌 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/scribe-token` | GET | Generate ElevenLabs single-use token |
| `/agent/run` | POST | Analyze transcript for authenticity |
| `/agent/poll` | GET | Poll for analysis result |
| `/agent/suggest-questions` | POST | Generate follow-up question |
| `/agent/final-assessment` | POST | Generate hiring recommendation |
| `/agent/reset` | POST | Clear session for new interview |

---

## 🧠 Detection Logic

### Authentic Answer Markers
- Specific dates, names, and numbers
- Company names matching CV
- Emotional language ("frustrated", "excited", "nervous")
- Self-corrections and natural hesitations
- Technical details that can be verified

### LLM Answer Markers
- Perfect STAR method structure
- Buzzword density ("stakeholders", "synergy", "leverage")
- No specific personal examples
- Generic advice-like phrasing
- Overly balanced/diplomatic tone

### Detection Triggers

| Trigger | Pattern | Action |
|---------|---------|--------|
| Specific Example | Dates, names, metrics | ✅ Rate as Authentic |
| Generic Response | "I believe", "best practices" | 🔴 Flag as Likely LLM |
| Perfect Structure | Textbook STAR format | 🔴 Flag as Likely LLM |
| CV Mismatch | Claims not in CV | ⚠️ Flag for clarification |

---

## 🛠️ Development

### Backend Development
```bash
cd be
pnpm dev          # Start with hot reload
pnpm build        # Build for production
pnpm type-check   # TypeScript validation
```

### Frontend Development
```bash
cd fe
npm run dev       # Start Electron with hot reload
npm run build     # Build for production
npm run lint      # Run ESLint
npm run typecheck # TypeScript validation
```

### Building for Distribution
```bash
cd fe
npm run build:mac    # macOS
npm run build:win    # Windows
npm run build:linux  # Linux
```

---

## 🔐 Security & Privacy Notes

- API keys are stored in `.env` files (not committed to git)
- ElevenLabs uses single-use tokens (expire after 15 minutes)
- Candidate CV data stays local - not sent to external services except for analysis
- Audio is processed in real-time and not stored permanently

---

## 📄 License

This project is licensed under the ISC License.

---

## 🙏 Acknowledgments

- [ElevenLabs](https://elevenlabs.io/) - Real-time speech-to-text
- [Cerebras](https://cerebras.ai/) - Fast AI inference
- [Tavily](https://tavily.com/) - AI-powered web search
- [Electron](https://www.electronjs.org/) - Desktop application framework
- [Vercel AI SDK](https://sdk.vercel.ai/) - AI agent framework

---

<p align="center">
  Built with ❤️ for smarter, fairer hiring decisions
</p>
