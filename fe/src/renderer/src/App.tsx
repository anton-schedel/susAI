import React, { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import { AudioCapture, AudioData } from './services/audioCapture'
import { ElevenLabsWebSocket } from './services/elevenLabsWebSocket'
import susiAvatar from './assets/susi.png'
import susAILogo from './assets/susAILogo.png'

const BACKEND_URL = 'http://localhost:3000'

function App(): React.JSX.Element {
  const [isListening, setIsListening] = useState<boolean>(false)
  const [isPaused, setIsPaused] = useState<boolean>(false)
  const [isReady, setIsReady] = useState<boolean>(false)
  const [, setPartialTranscript] = useState<string>('')
  const [, setCommittedTranscripts] = useState<string[]>([])
  const [agentMessages, setAgentMessages] = useState<string[]>([])
  const [suggestedQuestions, setSuggestedQuestions] = useState<string | null>(null)
  const [assessment, setAssessment] = useState<string | null>(null)
  const [isLoadingAssessment, setIsLoadingAssessment] = useState<boolean>(false)
  const [position, setPosition] = useState({ x: 0, y: -450 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const cardRef = useRef<HTMLDivElement>(null)
  const audioCaptureRef = useRef<AudioCapture | null>(null)
  const elevenLabsTokenRef = useRef<string | null>(null)
  const elevenLabsWsRef = useRef<ElevenLabsWebSocket | null>(null)

  // Pre-fetch token on mount
  const prefetchToken = async (): Promise<void> => {
    try {
      const token = await fetchElevenLabsToken()
      elevenLabsTokenRef.current = token
      setIsReady(true)
      console.log('Token pre-fetched and ready')
    } catch (error) {
      console.error('Failed to pre-fetch token:', error)
      // Retry after 2 seconds
      setTimeout(prefetchToken, 2000)
    }
  }

  useEffect(() => {
    // Initially set to ignore mouse events
    window.electron.send('set-ignore-mouse', true)

    // Initialize audio capture
    audioCaptureRef.current = new AudioCapture({ sampleRate: 16000, channelCount: 1 })

    // Pre-fetch ElevenLabs token
    prefetchToken()

    return () => {
      if (audioCaptureRef.current) {
        audioCaptureRef.current.stop()
      }
      if (elevenLabsWsRef.current) {
        elevenLabsWsRef.current.disconnect()
      }
    }
  }, [])

  // Handle dragging
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent): void => {
      if (isDragging) {
        const newX = e.clientX - dragStart.x
        const newY = e.clientY - dragStart.y

        // Prevent dragging above the screen (minimum y is 0 so drag handle stays visible)
        const minY = -450
        const constrainedY = Math.max(minY, newY)

        setPosition({
          x: newX,
          y: constrainedY
        })
      }
    }

    const handleMouseUp = (): void => {
      setIsDragging(false)
    }

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, dragStart])

  // Poll for agent messages
  useEffect(() => {
    const intervalId = setInterval(async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/agent/poll`)
        if (response.ok) {
          const data = await response.json()
          if (data.result) {
            setAgentMessages((prev) => {
              const updated = [...prev, data.result]
              // Keep only the last 3 messages
              return updated.slice(-3)
            })
          }
          console.log('Polled agent result:', data.result)
        }
      } catch (error) {
        console.error('Polling error:', error)
      }
    }, 1000)

    return () => clearInterval(intervalId)
  }, [])

  const isPausedRef = useRef<boolean>(false)

  useEffect(() => {
    isPausedRef.current = isPaused
    console.log('isPausedRef updated to:', isPaused)
  }, [isPaused])

  const handleAudioData = (data: AudioData, source: 'mic' | 'system' | 'mixed'): void => {
    // Send mixed audio data to ElevenLabs WebSocket only if not paused
    if (source === 'mixed' && elevenLabsWsRef.current?.connected) {
      if (!isPausedRef.current) {
        elevenLabsWsRef.current.sendAudioChunk(data.buffer)
      }
    }
  }

  const exportAssessmentToPdf = (content: string): void => {
    // Create HTML content for the PDF
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Candidate Assessment - susAI</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              padding: 40px;
              max-width: 800px;
              margin: 0 auto;
              color: #333;
            }
            h1 {
              color: #10b981;
              border-bottom: 2px solid #10b981;
              padding-bottom: 10px;
              margin-bottom: 20px;
            }
            h2, strong {
              color: #047857;
            }
            ul {
              padding-left: 20px;
            }
            li {
              margin-bottom: 8px;
            }
            .timestamp {
              color: #666;
              font-size: 12px;
              margin-top: 30px;
              border-top: 1px solid #ddd;
              padding-top: 10px;
            }
          </style>
        </head>
        <body>
          <h1>Candidate Assessment</h1>
          ${content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>').replace(/•/g, '&bull;')}
          <div class="timestamp">Generated by susAI on ${new Date().toLocaleString()}</div>
        </body>
      </html>
    `

    // Create a hidden iframe for printing
    const iframe = document.createElement('iframe')
    iframe.style.position = 'absolute'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = 'none'
    iframe.style.left = '-9999px'
    document.body.appendChild(iframe)

    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document
    if (!iframeDoc) {
      alert('Failed to create print document')
      document.body.removeChild(iframe)
      return
    }

    iframeDoc.open()
    iframeDoc.write(htmlContent)
    iframeDoc.close()

    // Wait for content to load, then print
    setTimeout(() => {
      iframe.contentWindow?.print()
      // Remove iframe after printing
      setTimeout(() => {
        document.body.removeChild(iframe)
      }, 1000)
    }, 250)
  }

  const fetchElevenLabsToken = async (): Promise<string> => {
    const url = `${BACKEND_URL}/scribe-token`
    console.log('Fetching token from:', url)

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      console.log('Response status:', response.status, response.statusText)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        console.error('Error response:', errorData)
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
      }

      const data = (await response.json()) as { token: string }
      console.log('Token received successfully')
      return data.token
    } catch (error) {
      console.error('Failed to fetch ElevenLabs token:', error)
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error(`Network error: Could not connect 
          to backend at ${url}. Make sure the backend server is running on ${BACKEND_URL}`)
      }
      throw error
    }
  }

  const toggleListening = async (): Promise<void> => {
    if (!audioCaptureRef.current) return

    if (isListening) {
      // Just pause/unpause - don't stop the connection
      const newPausedState = !isPaused
      console.log('Toggling pause state from', isPaused, 'to', newPausedState)
      setIsPaused(newPausedState)
    } else {
      // Start listening - use pre-fetched token
      if (!elevenLabsTokenRef.current) {
        alert('Token not ready yet. Please wait a moment and try again.')
        return
      }
      try {
        const token = elevenLabsTokenRef.current
        console.log('Using pre-fetched token:', token.substring(0, 20) + '...')

        // Connect to ElevenLabs WebSocket
        const ws = new ElevenLabsWebSocket()
        elevenLabsWsRef.current = ws

        await ws.connect(token, {
          onPartialTranscript: (text) => {
            console.log('Partial transcript:', text)
            setPartialTranscript(text)
          },
          onCommittedTranscript: (text) => {
            console.log('Committed transcript:', text)
            setCommittedTranscripts((prev) => [...prev, text])
            setPartialTranscript('') // Clear partial when committed
          },
          onWrapUpDetected: async (allTranscripts) => {
            console.log('🎯 Wrap-up detected! Fetching suggested questions...', allTranscripts.length, 'transcripts')
            try {
              const response = await fetch('http://localhost:3000/agent/suggest-questions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transcripts: allTranscripts })
              })
              const data = await response.json()
              console.log('📋 Suggested questions:', data.questions)
              setSuggestedQuestions(data.questions)
            } catch (error) {
              console.error('Failed to fetch suggested questions:', error)
            }
          },
          onError: (error) => {
            console.error('ElevenLabs WebSocket error:', error)
            alert(`ElevenLabs WebSocket error: ${error.message}`)
          },
          onClose: () => {
            console.log('ElevenLabs WebSocket closed')
          }
        })

        // Start audio capture
        await audioCaptureRef.current.start(handleAudioData)
        setIsListening(true)
        setIsPaused(false)
      } catch (error) {
        console.error('Failed to start audio capture:', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
        alert(
          `Failed to start audio capture:\n\n${errorMessage}\n\n` +
            'Please ensure:\n' +
            '- Backend server is running\n' +
            '- Microphone permissions are granted\n' +
            '- For system audio: Share your screen/tab with audio when prompted'
        )
      }
    }
  }

  const stopAndGetAssessment = async (): Promise<void> => {
    // Stop listening if currently active
    if (isListening && audioCaptureRef.current) {
      await audioCaptureRef.current.stop()
      if (elevenLabsWsRef.current) {
        elevenLabsWsRef.current.disconnect()
        elevenLabsWsRef.current = null
      }
      setIsListening(false)
      elevenLabsTokenRef.current = null
      setPartialTranscript('')
    }

    // Fetch final assessment from the backend
    setIsLoadingAssessment(true)
    setAssessment(null)
    try {
      const response = await fetch(`${BACKEND_URL}/agent/final-assessment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || `HTTP ${response.status}`)
      }

      const data = (await response.json()) as { assessment: string; stats: object }
      setAssessment(data.assessment)
      console.log('Assessment received:', data)
    } catch (error) {
      console.error('Failed to get assessment:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setAssessment(`Error getting assessment: ${errorMessage}`)
    } finally {
      setIsLoadingAssessment(false)
      // Pre-fetch new token for next session
      if (!isReady) {
        prefetchToken()
      }
    }
  }

  const handleMouseEnter = (e: React.MouseEvent): void => {
    const target = e.target as HTMLElement
    // Only enable mouse events if hovering over interactive elements
    if (
      target.closest('.audio-toggle-btn') ||
      target.closest('.drag-handle') ||
      target.closest('.response-section') ||
      target.closest('.assessment-btn') ||
      target.closest('.assessment-section') ||
      target.closest('.suggested-questions-section') ||
      target.closest('.export-pdf-btn')
    ) {
      window.electron.send('set-ignore-mouse', false)
    } else {
      window.electron.send('set-ignore-mouse', true)
    }
  }

  const handleMouseLeave = (): void => {
    window.electron.send('set-ignore-mouse', true)
  }

  const handleDragStart = (e: React.MouseEvent): void => {
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    })
    setIsDragging(true)
  }

  return (
    <div className="app-root">
      <div
        ref={cardRef}
        className="assistant-card"
        style={{
          transform: `translate(${position.x}px, ${position.y}px)`
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        role="dialog"
        aria-label="Interview Authenticity Detector"
      >
        {/* Drag handle at top right */}
        <div className="drag-handle" onMouseDown={handleDragStart} aria-label="Drag to move" />

        {/* susAI avatar and control bar */}
        <div className="susi-header">
          <img src={susiAvatar} alt="susAI Assistant" className="susi-avatar" />
          <div className="susi-info">
            <img src={susAILogo} alt="susAI" className="susi-logo" />
            <span className="susi-role">Interview Assistant</span>
          </div>
        </div>

        {/* Top control bar - single line */}
        <div className="control-bar">
          <button
            className={`audio-toggle-btn ${isListening && !isPaused ? 'listening' : ''} ${!isReady && !isListening ? 'loading' : ''} ${isPaused ? 'paused' : ''}`}
            onClick={toggleListening}
            disabled={!isReady && !isListening}
            aria-label={
              isListening ? (isPaused ? 'Resume listening' : 'Pause listening') : 'Start listening'
            }
            title={
              !isReady && !isListening
                ? 'Initializing...'
                : isListening
                  ? isPaused
                    ? 'Resume audio capture'
                    : 'Pause audio capture'
                  : 'Start audio capture'
            }
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {isListening ? (
                isPaused ? (
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z M19 10v2a7 7 0 0 1-14 0v-2 M12 19v4 M8 23h8" />
                ) : (
                  <>
                    <rect x="6" y="4" width="4" height="16" />
                    <rect x="14" y="4" width="4" height="16" />
                  </>
                )
              ) : (
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z M19 10v2a7 7 0 0 1-14 0v-2 M12 19v4 M8 23h8" />
              )}
            </svg>
          </button>

          <div className="assistant-body">
            {isListening
              ? isPaused
                ? 'Paused'
                : 'Listening...'
              : !isReady
                ? 'Initializing...'
                : 'Click the mic to start'}
          </div>
        </div>

        {/* Response section - expands when there are messages */}
        {agentMessages.length > 0 && (
          <div className="response-section">
            {agentMessages.map((message, index) => (
              <div key={index} className="markdown-content">
                <ReactMarkdown>{message}</ReactMarkdown>
              </div>
            ))}
          </div>
        )}

        {/* Suggested questions section - shown when wrap-up detected */}
        {suggestedQuestions && (
          <div className="suggested-questions-section">
            <div className="suggested-questions-header-row">
              <div className="suggested-questions-header">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <span>Suggested Follow-Up Questions</span>
              </div>
              <button
                className="close-questions-btn"
                onClick={() => setSuggestedQuestions(null)}
                title="Dismiss suggestions"
              >
                ×
              </button>
            </div>
            <div className="suggested-questions-content">
              <div className="markdown-content">
                <ReactMarkdown>{suggestedQuestions}</ReactMarkdown>
              </div>
            </div>
          </div>
        )}

        {/* Assessment button - only shown when interview has started */}
        {(isListening || agentMessages.length > 0) && (
          <button
            className={`assessment-btn ${isLoadingAssessment ? 'loading' : ''}`}
            onClick={stopAndGetAssessment}
            disabled={isLoadingAssessment}
            aria-label="End interview and get assessment"
            title="Stop interview and get candidate assessment with AI usage detection"
          >
            {isLoadingAssessment ? (
              <>
                <svg className="spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
                </svg>
                Analyzing...
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="8.5" cy="7" r="4" />
                  <polyline points="17 11 19 13 23 9" />
                </svg>
                End &amp; Get Assessment
              </>
            )}
          </button>
        )}

        {/* Assessment section - shows when assessment is available */}
        {assessment && (
          <div className="assessment-section">
            <div className="assessment-header">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              <span>Candidate Assessment</span>
              <button
                className="export-pdf-btn"
                onClick={() => exportAssessmentToPdf(assessment)}
                title="Export assessment as PDF"
              >
                PDF
              </button>
              <button 
                className="close-assessment-btn" 
                onClick={() => setAssessment(null)}
                aria-label="Close assessment"
              >
                ×
              </button>
            </div>
            <div className="assessment-content">
              <ReactMarkdown>{assessment}</ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
