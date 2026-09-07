import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import dreamItLogo from "./assets/dream-it-logo.png";
import "./App.css";

const API_URL = "http://127.0.0.1:8001";

const agents = [
  {
    id: "retailinfo",
    name: "RetailInfo",
    shortName: "Retail",
    description: "Get information about retail products and data.",
    suggestions: [
      "Show me 5 internal products",
      "Find products by category and color",
      "Give me details about a specific product",
    ],
  },
  {
    id: "productcomparison",
    name: "Product Comparison",
    shortName: "Compare",
    description: "Compare products and provide useful insights.",
    suggestions: [
      "Compare our products with competitor products",
      "Which competitor has the closest matching product?",
      "Show me the price differences between products",
    ],
  },
  {
    id: "email-teams-extractor",
    name: "Email & Teams Extractor",
    shortName: "Workspace",
    description: "Extract and analyze information from emails and Teams.",
    suggestions: [
      "Show me my important emails",
      "What tasks am I currently working on?",
      "Were any new tasks assigned to me through Teams?",
    ],
  },
  {
    id: "Tender-agent",
    name: "Tender Agent",
    shortName: "Tenders",
    description: "Ask questions about tenders and documents.",
    suggestions: [
      "Summarize the tender requirements",
      "What are the eligibility criteria?",
      "What are the important dates and deadlines?",
    ],
  },
];

const createAgentState = () => ({
  conversationId: null,
  messages: [],
  loading: false,
  reasoning: "",
});

function App() {
  const [selectedAgent, setSelectedAgent] = useState(agents[0]);

  const [agentStates, setAgentStates] = useState({
    retailinfo: createAgentState(),
    productcomparison: createAgentState(),
    "email-teams-extractor": createAgentState(),
    "Tender-agent": createAgentState(),
  });

  const [input, setInput] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);

  const currentState = agentStates[selectedAgent.id];

  const updateAgentState = (agentId, updates) => {
    setAgentStates((prev) => ({
      ...prev,
      [agentId]: {
        ...prev[agentId],
        ...updates,
      },
    }));
  };

  const sendMessage = async () => {
    const userMessage = input.trim();

    if (!userMessage || currentState.loading) return;

    const agentId = selectedAgent.id;
    const conversationId = currentState.conversationId;

    updateAgentState(agentId, {
      messages: [
        ...currentState.messages,
        {
          role: "user",
          content: userMessage,
        },
      ],
      loading: true,
      reasoning: "",
    });

    setInput("");

    try {
      const response = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agent: agentId,
          message: userMessage,
          conversation_id: conversationId,
        }),
      });

      if (!response.ok) {
        throw new Error("Agent unavailable");
      }

      const data = await response.json();

      if (data.error || typeof data.response !== "string") {
        throw new Error("Agent unavailable");
      }

      setAgentStates((prev) => ({
        ...prev,
        [agentId]: {
          ...prev[agentId],
          conversationId,
          loading: false,
          reasoning: "",
          messages: [
            ...prev[agentId].messages,
            {
              role: "assistant",
              content: data.response,
            },
          ],
        },
      }));
    } catch (error) {
      console.error("Agent error:", error);

      setAgentStates((prev) => ({
        ...prev,
        [agentId]: {
          ...prev[agentId],
          loading: false,
          reasoning: "",
          messages: [
            ...prev[agentId].messages,
            {
              role: "assistant",
              content:
                "The agent is currently unavailable. Please check its connectivity and try again.",
            },
          ],
        },
      }));
    }
  };

  const handleAgentChange = (agent) => {
    setSelectedAgent(agent);
    setInput("");
    setSelectedFile(null);
  };

  const handleSuggestionClick = (suggestion) => {
    setInput(suggestion);
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];

    if (file) {
      setSelectedFile(file);
    }
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <img src={dreamItLogo} alt="Dream IT Consulting Services" />
          </div>

          <div>
            <div className="brand-title">AI Agent Workspace</div>

            <div className="brand-subtitle">
              Cloud powered · data driven
            </div>
          </div>
        </div>

        <div className="sidebar-label">AGENTS</div>

        <div className="agents-list">
          {agents.map((agent) => {
            const state = agentStates[agent.id];

            const isActive =
              selectedAgent.id === agent.id;

            return (
              <button
                key={agent.id}
                className={`agent-item ${
                  isActive ? "active" : ""
                }`}
                onClick={() => handleAgentChange(agent)}
              >
                <div
                  className={`agent-icon ${
                    isActive ? "active-icon" : ""
                  }`}
                >
                  {agent.shortName.charAt(0)}
                </div>

                <div className="agent-info">
                  <div className="agent-name">
                    {agent.name}
                  </div>

                  <div className="agent-description">
                    {agent.description}
                  </div>

                  {state.loading && (
                    <div className="working-status">
                      <span className="status-dot"></span>
                      Working...
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div className="sidebar-footer">
          <div className="connection-dot"></div>
          <span>AI services connected</span>
        </div>
      </aside>

      <main className="chat-container">
        <header className="chat-header">
          <div className="header-agent">
            <div className="header-agent-icon">
              {selectedAgent.shortName.charAt(0)}
            </div>

            <div>
              <h2>{selectedAgent.name}</h2>
              <p>{selectedAgent.description}</p>
            </div>
          </div>

          <div className="header-status">
            <span></span>
            Ready
          </div>
        </header>

        <div className="messages-container">
          {currentState.messages.length === 0 &&
            !currentState.loading && (
              <div className="welcome-wrapper">
                <div className="welcome-icon">✦</div>

                <h3>How can I help you?</h3>

                <p className="welcome-description">
                  Start a conversation with{" "}
                  <strong>{selectedAgent.name}</strong>
                </p>

                <div className="suggestions">
                  {selectedAgent.suggestions.map(
                    (suggestion, index) => (
                      <button
                        key={index}
                        className="suggestion-card"
                        onClick={() =>
                          handleSuggestionClick(
                            suggestion
                          )
                        }
                      >
                        <span className="suggestion-number">
                          {String(index + 1).padStart(2, "0")}
                        </span>

                        <span className="suggestion-text">
                          {suggestion}
                        </span>

                        <span className="suggestion-arrow">
                          →
                        </span>
                      </button>
                    )
                  )}
                </div>
              </div>
            )}

          {currentState.messages.map(
            (message, index) => (
              <div
                key={index}
                className={`message-row ${
                  message.role === "user"
                    ? "user-row"
                    : "assistant-row"
                }`}
              >
                {message.role === "assistant" && (
                  <div className="message-avatar">
                    ✦
                  </div>
                )}

                <div
                  className={`message-bubble ${
                    message.role === "user"
                      ? "user-bubble"
                      : "assistant-bubble"
                  }`}
                >
                  {message.role === "assistant" ? (
                    <div className="markdown-content">
                      {message.reasoning && (
                        <div className="reasoning-box">
                          <div className="reasoning-title">
                            Reasoning
                          </div>

                          <div className="reasoning-content">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                            >
                              {message.reasoning}
                            </ReactMarkdown>
                          </div>
                        </div>
                      )}

                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                      >
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    message.content
                  )}
                </div>
              </div>
            )
          )}

          {currentState.loading && (
            <div className="message-row assistant-row">
              <div className="message-avatar">
                ✦
              </div>

              <div className="assistant-bubble loading-bubble">
                <div className="loading-content">
                  <span className="loading-dot"></span>
                  <span className="loading-dot"></span>
                  <span className="loading-dot"></span>

                  <span className="loading-text">
                    {currentState.reasoning ||
                      "Working..."}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="input-section">
          {selectedFile && (
            <div className="selected-file">
              <span className="file-icon">📎</span>

              <span className="file-name">
                {selectedFile.name}
              </span>

              <button
                type="button"
                onClick={() =>
                  setSelectedFile(null)
                }
              >
                ×
              </button>
            </div>
          )}

          <div className="input-box">
            <label className="attach-button">
              +

              <input
                type="file"
                accept=".pdf,.doc,.docx,.txt,.csv,.xlsx"
                onChange={handleFileChange}
                hidden
              />
            </label>

            <textarea
              value={input}
              onChange={(event) =>
                setInput(event.target.value)
              }
              onKeyDown={handleKeyDown}
              placeholder={`Message ${selectedAgent.name}...`}
              disabled={currentState.loading}
              rows={1}
            />

            <button
              className="send-button"
              onClick={sendMessage}
              disabled={
                !input.trim() ||
                currentState.loading
              }
            >
              <span>Send</span>

              <span className="send-arrow">
                ↑
              </span>
            </button>
          </div>

          <div className="input-footer">
            <span>Enter to send</span>

            <span>•</span>

            <span>
              Shift + Enter for new line
            </span>

            <span className="powered">
              Powered by Microsoft Foundry
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;