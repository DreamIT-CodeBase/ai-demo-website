
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import dreamItWebsiteLogo from "./assets/dreamit-new-logo.png";
import microsoftPartnerLogo from "./assets/microsoft-solution-partner-logo.png";
import "./App.css";

const API_URL = "http://127.0.0.1:8000";

const iconUrls = {
  openai: "https://latestlogo.com/wp-content/uploads/2024/01/openai-icon.png",
  claude: "https://www.freelogovectors.net/wp-content/uploads/2025/12/claude-logo-icon-freelogovectors.net_-180x180.png",
  azure: "https://www.freelogovectors.net/wp-content/uploads/2023/05/azure_logo_freelogovectors.net_.png",
  fabric: "https://cdn.simpleicons.org/microsoftfabric",
  microsoft365: "https://www.bing.com/images/search?q=Microsoft+365+Logo+Transparent+Background&FORM=IRIBIP",
  teams: "https://www.freelogovectors.net/microsoft-teams-logo/",
  openapi: "https://cdn.simpleicons.org/openapiinitiative",
  mcp: "https://modelcontextprotocol.io/favicon.svg",
  search: "https://cdn.simpleicons.org/microsoftazure",
  knowledge: "https://cdn.simpleicons.org/microsoftazure",
  web: "https://cdn.freelogovectors.net/wp-content/uploads/2023/09/bing_logo-freelogovectors.net_.png",
  ai: "https://cdn.simpleicons.org/openai",
};

const serviceOptions = [
  { key: "foundry", label: "Azure AI Foundry", type: "Technology", description: "Microsoft's platform for building, deploying, and managing AI applications and agents." },
  { key: "fabric", label: "Microsoft Fabric", type: "Technology", description: "An end-to-end analytics platform for data integration, engineering, warehousing, data science, and BI." },
  { key: "microsoft-365", label: "Microsoft 365", type: "Technology", description: "A productivity and collaboration suite that includes services such as Outlook, Teams, and SharePoint." },
  { key: "azure-ai-search", label: "Azure AI Search", type: "Tool", description: "A cloud search service used to index and retrieve relevant content for search and AI applications." },
  { key: "azure-openai", label: "Azure OpenAI", type: "Tool", description: "Azure-hosted access to OpenAI models with Microsoft Azure integration and enterprise capabilities." },
  { key: "microsoft-graph", label: "Microsoft Graph", type: "Tool", description: "A unified API for accessing data and capabilities across Microsoft 365 services." },
  { key: "teams", label: "Microsoft Teams", type: "Tool", description: "Microsoft's collaboration service for chat, meetings, files, and team communication." },
  { key: "web-research", label: "Web research", type: "Tool", description: "A research capability used to retrieve and analyze information from public web sources." },
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
    architectureImage: null,
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
    architectureImage: null,
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
    architectureImage: null,
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
    architectureImage: null,
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
  vectorStoreId: null,
  messages: [],
  loading: false,
  reasoning: "",
  activities: [],
});

const getToolName = (tool) =>
  tool?.name ||
  tool?.server_label ||
  tool?.function?.name ||
  tool?.type ||
  "Connected tool";

const getToolType = (tool) =>
  String(tool?.type || tool?.name || "").toLowerCase();

const getToolIcon = (tool) => {
  const value = `${getToolName(tool)} ${getToolType(tool)} ${tool?.server_url || ""}`.toLowerCase();

  if (
    getToolType(tool) === "mcp" &&
    value.includes("/knowledgebases/")
  ) {
    return iconUrls.knowledge;
  }

  if (value.includes("openapi") || value.includes("api")) return iconUrls.openapi;
  if (value.includes("web") || value.includes("browser")) return iconUrls.web;
  if (value.includes("file_search") || value.includes("knowledge")) return iconUrls.knowledge;
  if (value.includes("search")) return iconUrls.search;
  if (value.includes("fabric")) return iconUrls.fabric;
  if (value.includes("teams")) return iconUrls.teams;
  if (value.includes("graph")) return iconUrls.microsoft365;
  if (value.includes("mcp")) return iconUrls.mcp;

  return iconUrls.ai;
};

const getToolDescription = (tool) => {
  const value = `${getToolName(tool)} ${getToolType(tool)} ${tool?.server_url || ""}`.toLowerCase();

  if (
    getToolType(tool) === "mcp" &&
    value.includes("/knowledgebases/")
  ) {
    return {
      description: "Azure AI Search knowledge base connected to the agent for grounded information retrieval.",
      why: "Used when the agent needs information from the connected knowledge source.",
    };
  }

  if (value.includes("openapi") || value.includes("api")) {
    return {
      description: "Connects the agent to an external API so it can retrieve product or business data that is not available in its built-in knowledge.",
      why: "Used when the agent needs data from the connected service.",
    };
  }

  if (value.includes("web") || value.includes("browser")) {
    return {
      description: "Retrieves relevant information from public web sources.",
      why: "Used when the agent needs current information from external websites.",
    };
  }

  if (value.includes("file_search") || value.includes("knowledge")) {
    return {
      description: "Provides the agent with relevant information from connected files or knowledge sources.",
      why: "Used to ground the response in the connected knowledge base.",
    };
  }

  if (value.includes("search")) {
    return {
      description: "Searches indexed information and retrieves relevant content for the agent.",
      why: "Used when the agent needs relevant information from indexed data.",
    };
  }

  const name = getToolName(tool);
  const match = serviceOptions.find(
    (service) =>
      name.toLowerCase().includes(service.label.toLowerCase()) ||
      service.key.toLowerCase() === name.toLowerCase()
  );

  return {
    description:
      match?.description ||
      `Provides the ${name} capability to the agent.`,
    why: "Used when the agent determines that this capability is required.",
  };
};

const getModelIcon = (model) => {
  const value = String(model || "").toLowerCase();

  if (value.includes("claude") || value.includes("anthropic")) {
    return iconUrls.claude;
  }

  if (value.includes("gpt") || value.includes("openai")) {
    return iconUrls.openai;
  }

  return iconUrls.ai;
};

const getModelDescription = (model) => {
  if (!model || model === "Model unavailable") {
    return {
      description: "No model deployment information is currently available for this agent.",
      why: "The live Foundry configuration did not expose a model value.",
    };
  }

  return {
    description: "The language model powering this agent. It interprets the user's request and generates the final response.",
    why: `This agent is currently configured to use ${model}.`,
  };
};

const getKnowledgeSourceDescription = (tool) => {
  const type = String(tool?.type || "").toLowerCase();
  const serverUrl = String(tool?.server_url || "").toLowerCase();

  if (type === "mcp" && serverUrl.includes("/knowledgebases/")) {
    return {
      description: "Azure AI Search knowledge base connected to the agent for grounded information retrieval.",
      why: "Used to retrieve grounded information from the connected knowledge base.",
    };
  }

  if (type.includes("fabric_iq")) {
    return {
      description: "Microsoft Fabric IQ knowledge source connected to the agent.",
      why: "Used to retrieve information from connected Fabric data.",
    };
  }

  if (type.includes("work_iq")) {
    return {
      description: "Work IQ knowledge source connected to the agent.",
      why: "Used to retrieve relevant organizational information.",
    };
  }

  if (type.includes("file_search")) {
    return {
      description: "Connected file and knowledge content used to ground responses.",
      why: "Used when the agent needs information from its connected files.",
    };
  }

  return {
    description: "Connected knowledge source used to ground agent responses.",
    why: "Used when the agent needs information from the configured knowledge source.",
  };
};

function InfoTooltip({ label, description, id, icon }) {
  return (
    <div className="agent-info-item">
      <div className="agent-info-icon-wrap">
        {icon ? (
          <img
            src={icon}
            alt=""
            className="agent-info-icon"
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <span className="agent-info-fallback-icon">◇</span>
        )}
      </div>

      <span className="info-tooltip-trigger" tabIndex="0" aria-describedby={id}>
        <span className="agent-info-item-name">{label}</span>
        <span id={id} className="info-tooltip" role="tooltip">
          <strong>{label}</strong>
          <span>{description.description}</span>
          <span className="info-tooltip-why">
            <b>Why used:</b> {description.why}
          </span>
        </span>
      </span>
    </div>
  );
}

function App() {
  const [currentView, setCurrentView] = useState("catalog");
  const [selectedAgent, setSelectedAgent] = useState(agents[0]);
  const [agentStates, setAgentStates] = useState({
    retailinfo: createAgentState(),
    productcomparison: createAgentState(),
    "email-teams-extractor": createAgentState(),
    "Tender-agent": createAgentState(),
  });
  const [agentMetadata, setAgentMetadata] = useState({});
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [metadataError, setMetadataError] = useState("");
  const [input, setInput] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogServices, setCatalogServices] = useState([]);
  const [catalogSort, setCatalogSort] = useState("newest");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isInfoSidebarCollapsed, setIsInfoSidebarCollapsed] = useState(false);
  const [infoSidebarWidth, setInfoSidebarWidth] = useState(285);
  const [agentSearch, setAgentSearch] = useState("");

  const abortControllers = useRef({});
  const resizeRef = useRef(null);
  const currentState = agentStates[selectedAgent.id];
  const liveMetadata = agentMetadata[selectedAgent.id];

  useEffect(() => {
    let cancelled = false;

    const loadMetadata = async () => {
      setMetadataLoading(true);
      setMetadataError("");

      try {
        const response = await fetch(
          `${API_URL}/agents/${encodeURIComponent(selectedAgent.id)}/metadata`
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          throw new Error(
            errorData?.detail || `Backend returned ${response.status}`
          );
        }

        const data = await response.json();

        if (!cancelled) {
          setAgentMetadata((previous) => ({
            ...previous,
            [selectedAgent.id]: data,
          }));
        }
      } catch (error) {
        if (!cancelled) {
          setMetadataError(error.message || "Failed to fetch metadata");
        }
      } finally {
        if (!cancelled) setMetadataLoading(false);
      }
    };

    loadMetadata();

    return () => {
      cancelled = true;
    };
  }, [selectedAgent.id]);

  useEffect(() => {
    const stopResize = () => {
      if (resizeRef.current) {
        resizeRef.current = null;
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
        window.removeEventListener("pointermove", resizePanel);
        window.removeEventListener("pointerup", stopResize);
      }
    };

    function resizePanel(event) {
      const minWidth = 240;
      const maxWidth = Math.min(420, window.innerWidth - 500);
      const nextWidth = window.innerWidth - event.clientX;

      setInfoSidebarWidth(
        Math.min(maxWidth, Math.max(minWidth, nextWidth))
      );
    }

    window.__stopAgentInfoResize = stopResize;

    return () => {
      stopResize();
      delete window.__stopAgentInfoResize;
    };
  }, []);

  const startInfoSidebarResize = (event) => {
    if (isInfoSidebarCollapsed) return;

    event.preventDefault();
    resizeRef.current = true;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    const resizePanel = (moveEvent) => {
      const minWidth = 240;
      const maxWidth = Math.min(420, window.innerWidth - 500);
      const nextWidth = window.innerWidth - moveEvent.clientX;

      setInfoSidebarWidth(
        Math.min(maxWidth, Math.max(minWidth, nextWidth))
      );
    };

    const stopResize = () => {
      resizeRef.current = null;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", resizePanel);
      window.removeEventListener("pointerup", stopResize);
    };

    window.addEventListener("pointermove", resizePanel);
    window.addEventListener("pointerup", stopResize);
  };

  const visibleAgents = agents.filter((agent) => {
    const search = agentSearch.trim().toLowerCase();
    if (!search) return true;

    return [agent.name, agent.description, agent.technology]
      .join(" ")
      .toLowerCase()
      .includes(search);
  });

  const searchMatches = agents.filter((agent) => {
    const search = catalogSearch.trim().toLowerCase();
    if (!search) return true;

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
    .filter(
      (agent) =>
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
      [agentId]: { ...prev[agentId], ...updates },
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
    if (!userMessage || currentState.loading) return;

    const agentId = selectedAgent.id;
    const conversationId = currentState.conversationId;
    const vectorStoreId = currentState.vectorStoreId;
    const controller = new AbortController();

    abortControllers.current[agentId] = controller;

    let finalResponse = "";
    let reasoning = "";
    let newConversationId = conversationId;
    let newVectorStoreId = vectorStoreId;

    let activities = [
      { id: "request", label: "Request received", status: "completed" },
      { id: "processing", label: "Processing request", status: "active" },
    ];

    updateAgentState(agentId, {
      messages: [
        ...currentState.messages,
        { role: "user", content: userMessage },
      ],
      loading: true,
      reasoning: "",
      activities,
    });

    setInput("");

    try {
      const formData = new FormData();
      formData.append("agent", agentId);
      formData.append("message", userMessage);

      if (conversationId) formData.append("conversation_id", conversationId);
      if (vectorStoreId) formData.append("vector_store_id", vectorStoreId);
      if (selectedFile) formData.append("file", selectedFile);

      const response = await fetch(`${API_URL}/chat`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`Backend returned ${response.status}`);
      }

      const contentType = response.headers.get("content-type") || "";

      if (
        contentType.includes("application/json") &&
        !contentType.includes("ndjson")
      ) {
        const data = await response.json();

        if (data.error) throw new Error(data.details || data.error);

        finalResponse =
          data.response ||
          data.reply ||
          "No response received from the agent.";

        activities = activities.map((activity) => ({
          ...activity,
          status:
            activity.status === "active" ? "completed" : activity.status,
        }));

        activities.push({
          id: "response-completed",
          label: "Response completed",
          status: "completed",
        });

        setAgentStates((prev) => ({
          ...prev,
          [agentId]: {
            ...prev[agentId],
            conversationId: data.conversation_id || newConversationId,
            loading: false,
            reasoning: "",
            activities,
            messages: [
              ...prev[agentId].messages,
              { role: "assistant", content: finalResponse, activities },
            ],
          },
        }));

        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;

          let data;

          try {
            data = JSON.parse(line);
          } catch {
            console.error("Invalid stream data:", line);
            continue;
          }

          if (data.event === "reasoning") {
            reasoning += data.delta || "";
            updateAgentState(agentId, { reasoning });
            continue;
          }

          if (data.event === "activity") {
            if (data.type === "response.mcp_list_tools.in_progress") {
              activities = activities.map((activity) =>
                activity.id === "processing"
                  ? { ...activity, status: "completed" }
                  : activity
              );

              if (
                !activities.some(
                  (activity) => activity.id === "tool-discovery"
                )
              ) {
                activities.push({
                  id: "tool-discovery",
                  label: "Discovering connected tools",
                  status: "active",
                });
              }

              updateAgentState(agentId, { activities });
              continue;
            }

            if (data.type === "response.mcp_list_tools.completed") {
              activities = activities.map((activity) =>
                activity.id === "tool-discovery"
                  ? { ...activity, status: "completed" }
                  : activity
              );

              if (
                !activities.some(
                  (activity) => activity.id === "tools-discovered"
                )
              ) {
                activities.push({
                  id: "tools-discovered",
                  label: "Connected tools discovered",
                  status: "completed",
                });
              }

              updateAgentState(agentId, { activities });
              continue;
            }

            if (data.type === "response.mcp_list_tools.failed") {
              activities = activities.map((activity) =>
                activity.id === "tool-discovery"
                  ? {
                      ...activity,
                      label: "Tool discovery failed",
                      status: "failed",
                    }
                  : activity
              );

              updateAgentState(agentId, { activities });
              continue;
            }

            if (data.type === "response.mcp_call.in_progress") {
              activities = activities.map((activity) =>
                activity.id === "processing"
                  ? { ...activity, status: "completed" }
                  : activity
              );

              const toolName =
                data.name || data.server_label || "connected tool";

              activities.push({
                id: `mcp-call-${data.item_id || Date.now()}`,
                label: `Executing ${toolName}`,
                status: "active",
              });

              updateAgentState(agentId, { activities });
              continue;
            }

            if (data.type === "response.mcp_call.completed") {
              activities = activities.map((activity) =>
                activity.id === `mcp-call-${data.item_id}`
                  ? { ...activity, status: "completed" }
                  : activity
              );

              updateAgentState(agentId, { activities });
              continue;
            }

            if (data.type === "response.mcp_call.failed") {
              activities = activities.map((activity) =>
                activity.id === `mcp-call-${data.item_id}`
                  ? {
                      ...activity,
                      label: "Tool execution failed",
                      status: "failed",
                    }
                  : activity
              );

              updateAgentState(agentId, { activities });
              continue;
            }
          }

          if (data.event === "text") {
            finalResponse += data.delta || "";

            if (!activities.some((activity) => activity.id === "preparing")) {
              activities = activities.map((activity) =>
                activity.status === "active"
                  ? { ...activity, status: "completed" }
                  : activity
              );

              activities.push({
                id: "preparing",
                label: "Preparing response",
                status: "active",
              });
            }

            updateAgentState(agentId, { activities });
            continue;
          }

          if (data.event === "completed") {
            newConversationId = data.conversation_id;
            newVectorStoreId =
              data.vector_store_id || newVectorStoreId;

            activities = activities.map((activity) => ({
              ...activity,
              status:
                activity.status === "active"
                  ? "completed"
                  : activity.status,
            }));

            if (
              !activities.some(
                (activity) => activity.id === "response-completed"
              )
            ) {
              activities.push({
                id: "response-completed",
                label: "Response completed",
                status: "completed",
              });
            }

            updateAgentState(agentId, { activities });
            continue;
          }

          if (data.event === "error") {
            throw new Error(data.message || "Backend error");
          }
        }

        updateAgentState(agentId, { reasoning, activities });
      }

      setAgentStates((prev) => ({
        ...prev,
        [agentId]: {
          ...prev[agentId],
          conversationId: newConversationId,
          vectorStoreId: newVectorStoreId,
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
              { role: "system", content: "Response stopped by user." },
            ],
          },
        }));

        return;
      }

      console.error("Agent error:", error);

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
              content: `Agent error: ${error.message}`,
            },
          ],
        },
      }));
    } finally {
      if (abortControllers.current[agentId] === controller) {
        abortControllers.current[agentId] = null;
      }
    }
  };

  const handleAgentChange = (agent) => {
    setSelectedAgent(agent);
    setInput("");
    setSelectedFile(null);
  };

  const openAgent = (agent) => {
    handleAgentChange(agent);
    setCurrentView("chat");
  };

  const startNewChat = () => {
    if (currentState.loading) stopResponse(selectedAgent.id);

    updateAgentState(selectedAgent.id, {
      conversationId: null,
      vectorStoreId: null,
      messages: [],
      loading: false,
      reasoning: "",
      activities: [],
    });

    setInput("");
    setSelectedFile(null);
  };

  const toggleCatalogService = (serviceKey) => {
    setCatalogServices((currentServices) =>
      currentServices.includes(serviceKey)
        ? currentServices.filter((key) => key !== serviceKey)
        : [...currentServices, serviceKey]
    );
  };

  const handleSuggestionClick = (suggestion) => setInput(suggestion);

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (file) setSelectedFile(file);
  };

  const renderAgentInfo = () => {
    const model =
      liveMetadata?.model ||
      liveMetadata?.definition?.model ||
      "Model unavailable";

    const knowledgeTools = liveMetadata?.knowledge_sources || [];
    const regularTools = liveMetadata?.action_tools || [];

    const serviceItems = selectedAgent.services
      .map((serviceKey) =>
        serviceOptions.find((service) => service.key === serviceKey)
      )
      .filter(Boolean);

    const modelDescription = getModelDescription(model);

    return (
      <aside
        className={`agent-info-sidebar ${
          isInfoSidebarCollapsed ? "collapsed" : ""
        }`}
        style={{
          width: isInfoSidebarCollapsed ? 58 : infoSidebarWidth,
          minWidth: isInfoSidebarCollapsed ? 58 : infoSidebarWidth,
        }}
      >
        {!isInfoSidebarCollapsed && (
          <div
            className="agent-info-resize-handle"
            onPointerDown={startInfoSidebarResize}
            title="Drag to resize"
            aria-label="Resize Agent Info panel"
          />
        )}

        <div className="agent-info-header">
          {!isInfoSidebarCollapsed && <h3>Agent Info</h3>}

          <button
            className="info-sidebar-toggle"
            onClick={() =>
              setIsInfoSidebarCollapsed((collapsed) => !collapsed)
            }
            type="button"
            aria-label={
              isInfoSidebarCollapsed
                ? "Expand agent information"
                : "Collapse agent information"
            }
            title={
              isInfoSidebarCollapsed
                ? "Expand agent information"
                : "Collapse agent information"
            }
          >
            {isInfoSidebarCollapsed ? "<" : ">"}
          </button>
        </div>

        {!isInfoSidebarCollapsed && (
          <div className="agent-info-content">
            <section className="agent-info-section">
              <span className="agent-info-section-title">Overview</span>
              <p className="agent-info-overview">
                {selectedAgent.description}
              </p>
            </section>

            <section className="agent-info-section">
              <span className="agent-info-section-title">Architecture</span>

              <div className="architecture-placeholder">
                {selectedAgent.architectureImage ? (
                  <img
                    src={selectedAgent.architectureImage}
                    alt={`${selectedAgent.name} architecture`}
                  />
                ) : (
                  <div className="architecture-placeholder-content">
                    <span className="architecture-placeholder-icon">◇</span>
                    <span>Architecture diagram</span>
                    <small>to be.</small>
                  </div>
                )}
              </div>
            </section>

            <section className="agent-info-section">
              <span className="agent-info-section-title">Model</span>

              <InfoTooltip
                id={`model-${selectedAgent.id}`}
                label={model}
                description={modelDescription}
                icon={getModelIcon(model)}
              />

              {metadataLoading && (
                <div className="agent-info-loading">
                  Loading live configuration...
                </div>
              )}
            </section>

            <section className="agent-info-section">
              <span className="agent-info-section-title">
                Knowledge Sources
              </span>

              {knowledgeTools.length > 0 ? (
                <div className="agent-info-list">
                  {knowledgeTools.map((source, index) => (
                    <InfoTooltip
                      key={`${getToolName(source)}-${index}`}
                      id={`knowledge-${selectedAgent.id}-${index}`}
                      label={getToolName(source)}
                      description={getKnowledgeSourceDescription(source)}
                      icon={getToolIcon(source)}
                    />
                  ))}
                </div>
              ) : (
                <div className="agent-info-empty">
                  No knowledge source was found in the live agent definition.
                </div>
              )}
            </section>

            <section className="agent-info-section">
              <span className="agent-info-section-title">Tools</span>

              {regularTools.length > 0 ? (
                <div className="agent-info-list">
                  {regularTools.map((tool, index) => (
                    <InfoTooltip
                      key={`${getToolName(tool)}-${index}`}
                      id={`tool-${selectedAgent.id}-${index}`}
                      label={
                        getToolType(tool) === "web_search"
                          ? "Web Search"
                          : getToolName(tool)
                      }
                      description={getToolDescription(tool)}
                      icon={getToolIcon(tool)}
                    />
                  ))}
                </div>
              ) : (
                <div className="agent-info-empty">
                  No tools are exposed in the live agent definition.
                </div>
              )}
            </section>

            <section className="agent-info-section">
              <span className="agent-info-section-title">
                Services & Integrations
              </span>

              <div className="agent-info-list">
                {serviceItems.map((service) => (
                  <InfoTooltip
                    key={service.key}
                    id={`service-${selectedAgent.id}-${service.key}`}
                    label={service.label}
                    description={{
                      description: service.description,
                      why: "Part of the configured services associated with this agent.",
                    }}
                    icon={
                      service.key === "fabric"
                        ? iconUrls.fabric
                        : service.key === "foundry"
                        ? iconUrls.azure
                        : service.key === "microsoft-365"
                        ? iconUrls.microsoft365
                        : service.key === "teams"
                        ? iconUrls.teams
                        : service.key === "azure-ai-search"
                        ? iconUrls.search
                        : service.key === "azure-openai"
                        ? iconUrls.openai
                        : iconUrls.ai
                    }
                  />
                ))}
              </div>
            </section>

            {metadataError && (
              <div className="agent-info-error">
                Could not load live Foundry metadata: {metadataError}
              </div>
            )}
          </div>
        )}
      </aside>
    );
  };

  if (currentView === "catalog") {
    return (
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
                Explore the agents available across your Microsoft and Azure
                workspace.
              </p>
            </div>

            <div className="catalog-count">
              <strong>{filteredAgents.length}</strong>
              <span>available agents</span>
            </div>
          </div>

          <div className="catalog-layout">
            <aside
              className="catalog-filters"
              aria-label="Agent services and technologies"
            >
              <div className="catalog-filters-heading">
                <strong>Services</strong>
              </div>

              {serviceOptions
                .filter((service) =>
                  searchMatches.some((agent) =>
                    agent.services.includes(service.key)
                  )
                )
                .map((service) => {
                  const count = searchMatches.filter((agent) =>
                    agent.services.includes(service.key)
                  ).length;

                  const isChecked = catalogServices.includes(service.key);

                  return (
                    <label
                      className="catalog-filter-option"
                      key={service.key}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() =>
                          toggleCatalogService(service.key)
                        }
                      />

                      <span>
                        {service.label}

                        <small className="catalog-filter-type">
                          {service.type}
                        </small>
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
                    onChange={(event) =>
                      setCatalogSearch(event.target.value)
                    }
                    placeholder="Search agents or technologies"
                    aria-label="Search agents or technologies"
                  />
                </label>

                <label className="catalog-sort">
                  <span>Sort by</span>

                  <select
                    value={catalogSort}
                    onChange={(event) =>
                      setCatalogSort(event.target.value)
                    }
                    aria-label="Sort agents"
                  >
                    <option value="newest">Newest agents</option>
                    <option value="alphabetical">
                      Alphabetical A-Z
                    </option>
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
                        <span className="agent-template-icon">
                          {agent.shortName.charAt(0)}
                        </span>

                        <span
                          className="agent-template-arrow"
                          aria-hidden="true"
                        >
                          &#8599;
                        </span>
                      </div>

                      <div className="agent-template-body">
                        <span className="agent-template-technology">
                          {agent.technology}
                        </span>

                        <h2>{agent.name}</h2>

                        <p>{agent.description}</p>
                      </div>

                      <span className="agent-template-action">
                        Open agent <span aria-hidden="true">&#8594;</span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="catalog-empty">
                  <strong>No agents found</strong>

                  <span>
                    Try another name, description, or technology.
                  </span>
                </div>
              )}
            </section>
          </div>
        </main>
      </div>
    );
  }

  return (
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
            onClick={() =>
              setIsSidebarCollapsed((collapsed) => !collapsed)
            }
            type="button"
            aria-label={
              isSidebarCollapsed
                ? "Expand agent list"
                : "Collapse agent list"
            }
            title={
              isSidebarCollapsed
                ? "Expand agent list"
                : "Collapse agent list"
            }
          >
            {isSidebarCollapsed ? ">" : "<"}
          </button>
        </div>

        <div className="sidebar-label">AGENTS</div>

        {!isSidebarCollapsed && (
          <label className="agent-search">
            <span aria-hidden="true">⌕</span>

            <input
              type="search"
              value={agentSearch}
              onChange={(event) =>
                setAgentSearch(event.target.value)
              }
              placeholder="Search agents"
              aria-label="Search agents"
            />
          </label>
        )}

        <div className="agents-list">
          {visibleAgents.map((agent) => {
            const state = agentStates[agent.id];
            const isActive = selectedAgent.id === agent.id;

            return (
              <button
                key={agent.id}
                className={`agent-item ${isActive ? "active" : ""}`}
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
                  <div className="agent-name">{agent.name}</div>

                  <div className="agent-description">
                    {agent.description}
                  </div>

                  <div
                    className={`agent-status ${
                      state.loading ? "working" : "ready"
                    }`}
                  >
                    <span className="status-dot"></span>
                    {state.loading ? "Working" : "Ready"}
                  </div>
                </div>
              </button>
            );
          })}

          {visibleAgents.length === 0 && (
            <div className="agent-search-empty">
              No agents found
            </div>
          )}
        </div>

        <div className="sidebar-footer">
          <div className="connection-dot"></div>
          <span>AI services connected</span>
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
              {selectedAgent.shortName.charAt(0)}
            </div>

            <div>
              <h2>{selectedAgent.name}</h2>
              <p>{selectedAgent.description}</p>
            </div>
          </div>

          <div className="header-actions">
            <button
              className="new-chat-button"
              onClick={startNewChat}
              type="button"
            >
              <span aria-hidden="true">+</span>
              New chat
            </button>
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
                          handleSuggestionClick(suggestion)
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

          {currentState.messages.map((message, index) => {
            if (message.role === "system") {
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
                  message.role === "user"
                    ? "user-row"
                    : "assistant-row"
                }`}
              >
                {message.role === "assistant" && (
                  <div className="message-avatar">✦</div>
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
            );
          })}

          {currentState.loading && (
            <div className="message-row assistant-row">
              <div className="message-avatar">✦</div>

              <div className="assistant-bubble loading-bubble">
                {currentState.reasoning && (
                  <div className="reasoning-box">
                    <div className="reasoning-title">
                      Reasoning
                    </div>

                    <div className="reasoning-content">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                      >
                        {currentState.reasoning}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}

                {currentState.activities.length > 0 && (
                  <div className="agent-activity">
                    <div className="activity-header">
                      <span className="activity-icon">✦</span>
                      <span>Agent Activity</span>
                    </div>

                    <div className="activity-list">
                      {currentState.activities.map(
                        (activity) => (
                          <div
                            key={activity.id}
                            className={`activity-item ${activity.status}`}
                          >
                            <span className="activity-status">
                              {activity.status === "completed"
                                ? "✓"
                                : activity.status === "failed"
                                ? "!"
                                : "●"}
                            </span>

                            <span>{activity.label}</span>
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
                      stopResponse(selectedAgent.id)
                    }
                    type="button"
                  >
                    <span className="stop-icon">■</span>
                    <span>Stop</span>
                  </button>
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
                onClick={() => setSelectedFile(null)}
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
                !input.trim() || currentState.loading
              }
            >
              <span>Send</span>
              <span className="send-arrow">↑</span>
            </button>
          </div>

          <div className="input-footer">
            <span>Enter to send</span>
            <span>•</span>
            <span>Shift + Enter for new line</span>

            <span className="powered">
              Powered by Microsoft Foundry
            </span>
          </div>
        </div>
      </main>

      {renderAgentInfo()}
    </div>
  );
}

export default App;
