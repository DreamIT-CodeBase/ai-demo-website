import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import dreamItLogo from "./assets/dream-it-logo.png";
import "./App.css";

const API_URL = "http://127.0.0.1:8000";

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
      "Summarize the emails in the shared mailbox and flag anything urgent",
      "Scrape the latest tenders from Amref and NMS published in the last 3 days",
      "Show me the latest tenders published on dgMarket from Poland",
    ],
  },
];

const createAgentState = () => ({
  conversationId: null,
  messages: [],
  loading: false,
  reasoning: "",
  activities: [],
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

  const abortControllers = useRef({});

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

  const stopResponse = (agentId) => {
    const controller = abortControllers.current[agentId];

    if (controller) {
      controller.abort();
      abortControllers.current[agentId] = null;
    }
  };

  const sendMessage = async () => {
    const userMessage = input.trim();

    if (!userMessage || currentState.loading) {
      return;
    }

    const agentId = selectedAgent.id;
    const conversationId = currentState.conversationId;

    const controller = new AbortController();

    abortControllers.current[agentId] = controller;

    let finalResponse = "";
    let reasoning = "";
    let newConversationId = conversationId;

    let activities = [
      {
        id: "request",
        label: "Request received",
        status: "completed",
      },
      {
        id: "processing",
        label: "Processing request",
        status: "active",
      },
    ];

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
      activities,
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
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(
          `Backend returned ${response.status}`
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, {
          stream: true,
        });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) {
            continue;
          }

          let data;

          try {
            data = JSON.parse(line);
          } catch (error) {
            console.error(
              "Invalid stream data:",
              line
            );
            continue;
          }

          if (data.event === "reasoning") {
            reasoning += data.delta || "";

            updateAgentState(agentId, {
              reasoning,
            });

            continue;
          }

          if (data.event === "activity") {
            if (
              data.type ===
              "response.mcp_list_tools.in_progress"
            ) {
              activities = activities.map(
                (activity) =>
                  activity.id === "processing"
                    ? {
                        ...activity,
                        status: "completed",
                      }
                    : activity
              );

              const hasDiscoveryStep =
                activities.some(
                  (activity) =>
                    activity.id ===
                    "tool-discovery"
                );

              if (!hasDiscoveryStep) {
                activities.push({
                  id: "tool-discovery",
                  label:
                    "Discovering connected tools",
                  status: "active",
                });
              }

              updateAgentState(agentId, {
                activities,
              });

              continue;
            }

            if (
              data.type ===
              "response.mcp_list_tools.completed"
            ) {
              activities = activities.map(
                (activity) =>
                  activity.id ===
                  "tool-discovery"
                    ? {
                        ...activity,
                        status: "completed",
                      }
                    : activity
              );

              const hasDiscoveredStep =
                activities.some(
                  (activity) =>
                    activity.id ===
                    "tools-discovered"
                );

              if (!hasDiscoveredStep) {
                activities.push({
                  id: "tools-discovered",
                  label:
                    "Connected tools discovered",
                  status: "completed",
                });
              }

              updateAgentState(agentId, {
                activities,
              });

              continue;
            }

            if (
              data.type ===
              "response.mcp_list_tools.failed"
            ) {
              activities = activities.map(
                (activity) =>
                  activity.id ===
                  "tool-discovery"
                    ? {
                        ...activity,
                        label:
                          "Tool discovery failed",
                        status: "failed",
                      }
                    : activity
              );

              updateAgentState(agentId, {
                activities,
              });

              continue;
            }

            if (
              data.type ===
              "response.mcp_call.in_progress"
            ) {
              activities = activities.map(
                (activity) =>
                  activity.id === "processing"
                    ? {
                        ...activity,
                        status: "completed",
                      }
                    : activity
              );

              const toolName =
                data.name ||
                data.server_label ||
                "connected tool";

              activities.push({
                id: `mcp-call-${data.item_id || Date.now()}`,
                label: `Executing ${toolName}`,
                status: "active",
              });

              updateAgentState(agentId, {
                activities,
              });

              continue;
            }

            if (
              data.type ===
              "response.mcp_call.completed"
            ) {
              activities = activities.map(
                (activity) =>
                  activity.id ===
                  `mcp-call-${data.item_id}`
                    ? {
                        ...activity,
                        status: "completed",
                      }
                    : activity
              );

              updateAgentState(agentId, {
                activities,
              });

              continue;
            }

            if (
              data.type ===
              "response.mcp_call.failed"
            ) {
              activities = activities.map(
                (activity) =>
                  activity.id ===
                  `mcp-call-${data.item_id}`
                    ? {
                        ...activity,
                        label:
                          "Tool execution failed",
                        status: "failed",
                      }
                    : activity
              );

              updateAgentState(agentId, {
                activities,
              });

              continue;
            }
          }

          if (data.event === "text") {
            finalResponse += data.delta || "";

            const hasPreparingStep =
              activities.some(
                (activity) =>
                  activity.id === "preparing"
              );

            if (!hasPreparingStep) {
              activities = activities.map(
                (activity) =>
                  activity.status === "active"
                    ? {
                        ...activity,
                        status: "completed",
                      }
                    : activity
              );

              activities.push({
                id: "preparing",
                label: "Preparing response",
                status: "active",
              });
            }

            updateAgentState(agentId, {
              activities,
            });

            continue;
          }

          if (data.event === "completed") {
            newConversationId =
              data.conversation_id;

            activities = activities.map(
              (activity) => ({
                ...activity,
                status:
                  activity.status === "active"
                    ? "completed"
                    : activity.status,
              })
            );

            if (
              !activities.some(
                (activity) =>
                  activity.id ===
                  "response-completed"
              )
            ) {
              activities.push({
                id: "response-completed",
                label: "Response completed",
                status: "completed",
              });
            }

            updateAgentState(agentId, {
              activities,
            });

            continue;
          }

          if (data.event === "error") {
            throw new Error(
              data.message || "Backend error"
            );
          }
        }

        updateAgentState(agentId, {
          reasoning,
          activities,
        });
      }

      setAgentStates((prev) => ({
        ...prev,
        [agentId]: {
          ...prev[agentId],
          conversationId: newConversationId,
          loading: false,
          reasoning: "",
          activities,
          messages: [
            ...prev[agentId].messages,
            {
              role: "assistant",
              content: finalResponse,
              reasoning,
              activities,
            },
          ],
        },
      }));
    } catch (error) {
      if (error.name === "AbortError") {
        console.log(
          "Response stopped by user."
        );

        setAgentStates((prev) => ({
          ...prev,
          [agentId]: {
            ...prev[agentId],
            loading: false,
            reasoning: "",
            activities,
            messages: [
              ...prev[agentId].messages,

              ...(finalResponse
                ? [
                    {
                      role: "assistant",
                      content: finalResponse,
                      reasoning,
                      activities,
                    },
                  ]
                : []),

              {
                role: "system",
                content:
                  "Response stopped by user.",
              },
            ],
          },
        }));

        return;
      }

      console.error(
        "Agent error:",
        error
      );

      setAgentStates((prev) => ({
        ...prev,
        [agentId]: {
          ...prev[agentId],
          loading: false,
          reasoning: "",
          activities: [],
          messages: [
            ...prev[agentId].messages,
            {
              role: "assistant",
              content:
                `Agent error: ${error.message}`,
            },
          ],
        },
      }));
    } finally {
      if (
        abortControllers.current[agentId] ===
        controller
      ) {
        abortControllers.current[agentId] = null;
      }
    }
  };

  const handleAgentChange = (agent) => {
    const previousAgentId =
      selectedAgent.id;

    if (
      agentStates[previousAgentId].loading
    ) {
      stopResponse(previousAgentId);
    }

    setSelectedAgent(agent);
    setInput("");
    setSelectedFile(null);
  };

  const handleSuggestionClick = (
    suggestion
  ) => {
    setInput(suggestion);
  };

  const handleKeyDown = (event) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();
      sendMessage();
    }
  };

  const handleFileChange = (event) => {
    const file =
      event.target.files?.[0];

    if (file) {
      setSelectedFile(file);
    }
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
        <div className="brand-mark">
          <img
            src={dreamItLogo}
            alt="Dream IT Consulting Services"
          />
        </div>

          <div>
            <div className="brand-title">
              AI Agent Workspace
            </div>

            <div className="brand-subtitle">
               Cloud powered · Data driven
            </div>
          </div>
        </div>

        <div className="sidebar-label">
          AGENTS
        </div>

        <div className="agents-list">
          {agents.map((agent) => {
            const state =
              agentStates[agent.id];

            const isActive =
              selectedAgent.id ===
              agent.id;

            return (
              <button
                key={agent.id}
                className={`agent-item ${
                  isActive
                    ? "active"
                    : ""
                }`}
                onClick={() =>
                  handleAgentChange(
                    agent
                  )
                }
              >
                <div
                  className={`agent-icon ${
                    isActive
                      ? "active-icon"
                      : ""
                  }`}
                >
                  {agent.shortName.charAt(
                    0
                  )}
                </div>

                <div className="agent-info">
                  <div className="agent-name">
                    {agent.name}
                  </div>

                  <div className="agent-description">
                    {
                      agent.description
                    }
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

          <span>
            AI services connected
          </span>
        </div>
      </aside>

      <main className="chat-container">
        <header className="chat-header">
          <div className="header-agent">
            <div className="header-agent-icon">
              {selectedAgent.shortName.charAt(
                0
              )}
            </div>

            <div>
              <h2>
                {selectedAgent.name}
              </h2>

              <p>
                {
                  selectedAgent.description
                }
              </p>
            </div>
          </div>

          <div className="header-status">
            <span></span>
            Ready
          </div>
        </header>

        <div className="messages-container">
          {currentState.messages.length ===
            0 &&
            !currentState.loading && (
              <div className="welcome-wrapper">
                <div className="welcome-icon">
                  ✦
                </div>

                <h3>
                  How can I help you?
                </h3>

                <p className="welcome-description">
                  Start a conversation
                  with{" "}
                  <strong>
                    {
                      selectedAgent.name
                    }
                  </strong>
                </p>

                <div className="suggestions">
                  {selectedAgent.suggestions.map(
                    (
                      suggestion,
                      index
                    ) => (
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
                          {String(
                            index + 1
                          ).padStart(
                            2,
                            "0"
                          )}
                        </span>

                        <span className="suggestion-text">
                          {
                            suggestion
                          }
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
            (message, index) => {
              if (
                message.role ===
                "system"
              ) {
                return (
                  <div
                    key={index}
                    className="stopped-message"
                  >
                    {message.content}
                  </div>
                );
              }

              return (
                <div
                  key={index}
                  className={`message-row ${
                    message.role ===
                    "user"
                      ? "user-row"
                      : "assistant-row"
                  }`}
                >
                  {message.role ===
                    "assistant" && (
                    <div className="message-avatar">
                      ✦
                    </div>
                  )}

                  <div
                    className={`message-bubble ${
                      message.role ===
                      "user"
                        ? "user-bubble"
                        : "assistant-bubble"
                    }`}
                  >
                    {message.role ===
                    "assistant" ? (
                      <div className="markdown-content">
                        {message.reasoning && (
                          <div className="reasoning-box">
                            <div className="reasoning-title">
                              Reasoning
                            </div>

                            <div className="reasoning-content">
                              <ReactMarkdown
                                remarkPlugins={[
                                  remarkGfm,
                                ]}
                              >
                                {
                                  message.reasoning
                                }
                              </ReactMarkdown>
                            </div>
                          </div>
                        )}

                        <ReactMarkdown
                          remarkPlugins={[
                            remarkGfm,
                          ]}
                        >
                          {
                            message.content
                          }
                        </ReactMarkdown>
                      </div>
                    ) : (
                      message.content
                    )}
                  </div>
                </div>
              );
            }
          )}

          {currentState.loading && (
            <div className="message-row assistant-row">
              <div className="message-avatar">
                ✦
              </div>

              <div className="assistant-bubble loading-bubble">
                {currentState.reasoning && (
                  <div className="reasoning-box">
                    <div className="reasoning-title">
                      Reasoning
                    </div>

                    <div className="reasoning-content">
                      <ReactMarkdown
                        remarkPlugins={[
                          remarkGfm,
                        ]}
                      >
                        {
                          currentState.reasoning
                        }
                      </ReactMarkdown>
                    </div>
                  </div>
                )}

                {currentState.activities.length >
                  0 && (
                  <div className="agent-activity">
                    <div className="activity-header">
                      <span className="activity-icon">
                        ✦
                      </span>

                      <span>
                        Agent Activity
                      </span>
                    </div>

                    <div className="activity-list">
                      {currentState.activities.map(
                        (
                          activity
                        ) => (
                          <div
                            key={
                              activity.id
                            }
                            className={`activity-item ${
                              activity.status
                            }`}
                          >
                            <span className="activity-status">
                              {activity.status ===
                              "completed"
                                ? "✓"
                                : activity.status ===
                                  "failed"
                                ? "!"
                                : "●"}
                            </span>

                            <span>
                              {
                                activity.label
                              }
                            </span>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}

                <div className="loading-content">
                  <div className="loading-indicator">
                    <span className="loading-dot"></span>
                    <span className="loading-dot"></span>
                    <span className="loading-dot"></span>

                    <span className="loading-text">
                      Working...
                    </span>
                  </div>

                  <button
                    className="stop-button"
                    onClick={() =>
                      stopResponse(
                        selectedAgent.id
                      )
                    }
                    type="button"
                  >
                    <span className="stop-icon">
                      ■
                    </span>

                    <span>
                      Stop
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="input-section">
          {selectedFile && (
            <div className="selected-file">
              <span className="file-icon">
                📎
              </span>

              <span className="file-name">
                {selectedFile.name}
              </span>

              <button
                type="button"
                onClick={() =>
                  setSelectedFile(
                    null
                  )
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
                onChange={
                  handleFileChange
                }
                hidden
              />
            </label>

            <textarea
              value={input}
              onChange={(event) =>
                setInput(
                  event.target.value
                )
              }
              onKeyDown={
                handleKeyDown
              }
              placeholder={`Message ${selectedAgent.name}...`}
              disabled={
                currentState.loading
              }
              rows={1}
            />

            <button
              className="send-button"
              onClick={
                sendMessage
              }
              disabled={
                !input.trim() ||
                currentState.loading
              }
            >
              <span>
                Send
              </span>

              <span className="send-arrow">
                ↑
              </span>
            </button>
          </div>

          <div className="input-footer">
            <span>
              Enter to send
            </span>

            <span>•</span>

            <span>
              Shift + Enter for new
              line
            </span>

            <span className="powered">
              Powered by Microsoft
              Foundry
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;

