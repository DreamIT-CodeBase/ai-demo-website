import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import dreamItWebsiteLogo from "./assets/dreamit-new-logo.png";
import microsoftPartnerLogo from "./assets/microsoft-solution-partner-logo.png";
import "./App.css";

const API_URL = "http://127.0.0.1:8000";

const serviceOptions = [
  { key: "foundry", label: "Azure AI Foundry", type: "Technology" },
  { key: "fabric", label: "Microsoft Fabric", type: "Technology" },
  { key: "microsoft-365", label: "Microsoft 365", type: "Technology" },
  { key: "azure-ai-search", label: "Azure AI Search", type: "Tool" },
  { key: "azure-openai", label: "Azure OpenAI", type: "Tool" },
  { key: "microsoft-graph", label: "Microsoft Graph", type: "Tool" },
  { key: "teams", label: "Microsoft Teams", type: "Tool" },
  { key: "web-research", label: "Web research", type: "Tool" },
];

const agents = [
  {
    id: "retailinfo",
    name: "RetailInfo",
    shortName: "Retail",
    technology: "Microsoft Fabric",
    technologyKey: "fabric",
    services: ["fabric", "azure-ai-search"],
    createdAt: 4,
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
    technology: "Azure AI Foundry",
    technologyKey: "foundry",
    services: ["foundry", "azure-openai", "azure-ai-search"],
    createdAt: 3,
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
    technology: "Microsoft 365",
    technologyKey: "microsoft-365",
    services: ["microsoft-365", "microsoft-graph", "teams"],
    createdAt: 2,
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
    technology: "Azure AI Foundry",
    technologyKey: "foundry",
    services: ["foundry", "azure-ai-search", "web-research"],
    createdAt: 1,
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
  const [currentView, setCurrentView] = useState("catalog");
  const [selectedAgent, setSelectedAgent] = useState(agents[0]);

  const [agentStates, setAgentStates] = useState({
    retailinfo: createAgentState(),
    productcomparison: createAgentState(),
    "email-teams-extractor": createAgentState(),
    "Tender-agent": createAgentState(),
  });

  const [input, setInput] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogServices, setCatalogServices] = useState([]);
  const [catalogSort, setCatalogSort] = useState("newest");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const abortControllers = useRef({});

  const currentState = agentStates[selectedAgent.id];

  const searchMatches = agents.filter((agent) => {
    const search = catalogSearch.trim().toLowerCase();

    if (!search) {
      return true;
    }

    return [
      agent.name,
      agent.description,
      agent.technology,
      ...agent.services.map(
        (serviceKey) =>
          serviceOptions.find((service) => service.key === serviceKey)?.label || ""
      ),
    ]
      .join(" ")
      .toLowerCase()
      .includes(search);
  });

  const filteredAgents = searchMatches
    .filter((agent) =>
      catalogServices.length === 0 ||
      agent.services.some((serviceKey) => catalogServices.includes(serviceKey))
    )
    .sort((firstAgent, secondAgent) =>
      catalogSort === "alphabetical"
        ? firstAgent.name.localeCompare(secondAgent.name)
        : secondAgent.createdAt - firstAgent.createdAt
    );

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
          } catch {
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

  const openAgent = (agent) => {
    handleAgentChange(agent);
    setCurrentView("chat");
  };

  const toggleCatalogService = (serviceKey) => {
    setCatalogServices((currentServices) =>
      currentServices.includes(serviceKey)
        ? currentServices.filter((key) => key !== serviceKey)
        : [...currentServices, serviceKey]
    );
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

  return currentView === "catalog" ? (
    <div className="catalog-page">
      <header className="catalog-header">
        <div className="catalog-brand-logos">
          <div className="catalog-logo dreamit-website-logo">
            <img
              src={dreamItWebsiteLogo}
              alt="Dream IT Consulting Services"
            />
          </div>
          <div className="catalog-logo microsoft-partner-logo">
            <img
              src={microsoftPartnerLogo}
              alt="Microsoft Solutions Partner"
            />
          </div>
        </div>

        <div className="catalog-header-meta">
          <span className="catalog-status-dot"></span>
          Services connected
        </div>
      </header>

      <main className="catalog-main">
        <div className="catalog-intro">
          <div>
            <p className="catalog-eyebrow">AGENT CATALOG</p>
            <h1>Choose an agent to get started</h1>
            <p className="catalog-description">
              Explore the agents available across your Microsoft and Azure workspace.
            </p>
          </div>

          <div className="catalog-count">
            <strong>{filteredAgents.length}</strong>
            <span>available agents</span>
          </div>
        </div>

        <div className="catalog-layout">
          <aside className="catalog-filters" aria-label="Agent services and technologies">
            <div className="catalog-filters-heading">
              <strong>Services</strong>
            </div>
            {serviceOptions
              .filter((service) =>
                searchMatches.some((agent) => agent.services.includes(service.key))
              )
              .map((service) => {
              const count = searchMatches.filter((agent) =>
                agent.services.includes(service.key)
              ).length;
              const isChecked = catalogServices.includes(service.key);

              return (
                <label className="catalog-filter-option" key={service.key}>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleCatalogService(service.key)}
                  />
                  <span>
                    {service.label}
                    <small className="catalog-filter-type">{service.type}</small>
                  </span>
                  <small>{count}</small>
                </label>
              );
            })}
          </aside>

          <section className="catalog-results">
            <div className="catalog-toolbar">
              <label className="catalog-search">
                <span aria-hidden="true">⌕</span>
                <input
                  type="search"
                  value={catalogSearch}
                  onChange={(event) => setCatalogSearch(event.target.value)}
                  placeholder="Search agents or technologies"
                  aria-label="Search agents or technologies"
                />
              </label>

              <label className="catalog-sort">
                <span>Sort by</span>
                <select
                  value={catalogSort}
                  onChange={(event) => setCatalogSort(event.target.value)}
                  aria-label="Sort agents"
                >
                  <option value="newest">Newest agents</option>
                  <option value="alphabetical">Alphabetical A-Z</option>
                </select>
              </label>
            </div>

            {filteredAgents.length > 0 ? (
              <div className="agent-catalog-grid">
                {filteredAgents.map((agent) => (
                  <button
                    key={agent.id}
                    className="agent-template-card"
                    onClick={() => openAgent(agent)}
                    type="button"
                  >
                    <div className="agent-template-topline">
                      <span className="agent-template-icon">{agent.shortName.charAt(0)}</span>
                      <span className="agent-template-arrow" aria-hidden="true">&#8599;</span>
                    </div>
                    <div className="agent-template-body">
                      <span className="agent-template-technology">{agent.technology}</span>
                      <h2>{agent.name}</h2>
                      <p>{agent.description}</p>
                    </div>
                    <span className="agent-template-action">Open agent <span aria-hidden="true">&#8594;</span></span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="catalog-empty">
                <strong>No agents found</strong>
                <span>Try another name, description, or technology.</span>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  ) : (
    <div className="app">
      <aside className={isSidebarCollapsed ? "sidebar collapsed" : "sidebar"}>
        <div className="brand">
          <div className="brand-mark">
            <img
              className="brand-logo"
              src={dreamItWebsiteLogo}
              alt="Dream IT Consulting Services"
            />
            <img
              className="brand-partner-logo"
              src={microsoftPartnerLogo}
              alt="Microsoft Solutions Partner"
            />
          </div>
          <button
            className="sidebar-toggle"
            onClick={() => setIsSidebarCollapsed((collapsed) => !collapsed)}
            type="button"
            aria-label={isSidebarCollapsed ? "Expand agent list" : "Collapse agent list"}
            title={isSidebarCollapsed ? "Expand agent list" : "Collapse agent list"}
          >
            {isSidebarCollapsed ? ">" : "<"}
          </button>
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
            <button
              className="back-to-catalog"
              onClick={() => setCurrentView("catalog")}
              type="button"
              aria-label="Back to agent catalog"
            >
              &#8592;
            </button>
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

