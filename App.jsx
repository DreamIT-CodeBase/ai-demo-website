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
  currentEvent: null,
  eventHistory: [],
  summary: null,
});

const normalizeSummary = (value) => {
  if (!value) return null;
  if (Array.isArray(value)) {
    const items = value.filter(
      (item) => item !== null && item !== undefined && String(item).trim()
    );
    return items.length ? items : null;
  }
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
};

const getToolName = (tool) =>
  tool?.server_label ||
  tool?.name ||
  tool?.function?.name ||
  tool?.type ||
  "Connected tool";

const getToolType = (tool) =>
  String(tool?.type || tool?.name || "").toLowerCase();

const getToolIcon = (tool) => {
  const value = `${getToolName(tool)} ${getToolType(tool)} ${tool?.server_url || ""}`.toLowerCase();

  if (getToolType(tool) === "mcp" && value.includes("/knowledgebases/")) {
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

const getToolDescription = (tool, agent) => {
  const value = `${getToolName(tool)} ${getToolType(tool)} ${tool?.server_url || ""}`.toLowerCase();
  const configuredDescription = tool?.description || tool?.function?.description || tool?.openapi?.description;

  if (configuredDescription) {
    return {
      description: configuredDescription,
      why: `Configured on the ${agent.name} agent as part of its available tools.`,
    };
  }

  if (getToolType(tool) === "mcp" && value.includes("/knowledgebases/")) {
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
    description: match?.description || `Provides the ${name} capability to the agent.`,
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

const getModelDescription = (model, agent, metadata) => {
  if (!model || model === "Model unavailable") {
    return {
      description: "The model configuration is not currently exposed by the live agent metadata.",
      why: `The ${agent.name} configuration did not return a model deployment value.`,
    };
  }

  const purpose = metadata?.description || agent.description;

  return {
    description: purpose
      ? `Configured as the model for ${agent.name}. The agent is configured to ${purpose.charAt(0).toLowerCase()}${purpose.slice(1)}`
      : `Configured as the model for ${agent.name}.`,
    why: `${model} is the model returned by the current Foundry agent definition.`,
  };
};

const getKnowledgeSourceDescription = (tool, agent) => {
  const type = String(tool?.type || "").toLowerCase();
  const serverUrl = String(tool?.server_url || "").toLowerCase();
  const name = getToolName(tool);
  const value = `${name} ${type} ${serverUrl}`.toLowerCase();
  const configuredDescription = tool?.description || tool?.function?.description || tool?.openapi?.description;

  if (configuredDescription) {
    return {
      description: configuredDescription,
      why: `Configured on the ${agent.name} agent as a connected knowledge source.`,
    };
  }

  const descriptions = {
    retailinfo: {
      fabric: {
        description: "Provides RetailInfo with access to the connected Microsoft Fabric retail data used for internal product and business questions.",
        why: "Used when RetailInfo needs information from the internal retail data layer.",
      },
      search: {
        description: "Supports RetailInfo with retrieval of relevant indexed knowledge associated with its retail data context.",
        why: "Used to retrieve relevant grounded information for retail questions.",
      },
    },
    productcomparison: {
      search: {
        description: "Provides Product Comparison with indexed knowledge used to retrieve relevant product information for comparison and matching.",
        why: "Used to ground comparisons with information from the configured knowledge source.",
      },
      external: {
        description: "Connects Product Comparison to approved external product information so internal and competitor products can be compared.",
        why: "Used when the comparison requires product details outside the internal retail data.",
      },
    },
    "email-teams-extractor": {
      microsoft: {
        description: "Connects Email & Teams Extractor to Microsoft 365 information relevant to the user's mailbox and Teams workspace.",
        why: "Used to retrieve the emails, messages, and workspace information needed for the user's request.",
      },
    },
    "Tender-agent": {
      search: {
        description: "Provides Tender Agent with indexed tender and document knowledge for targeted tender analysis.",
        why: "Used when the agent needs grounded information from its configured tender knowledge source.",
      },
      external: {
        description: "Provides Tender Agent with access to external tender research sources for finding current tender opportunities.",
        why: "Used when the request requires current information from external tender sources.",
      },
    },
  };

  const agentDescriptions = descriptions[agent.id] || {};
  const isMicrosoft =
    value.includes("microsoft") ||
    value.includes("graph") ||
    value.includes("teams") ||
    value.includes("outlook");
  const isFabric = value.includes("fabric");
  const isSearch =
    value.includes("search") ||
    (type.includes("mcp") && serverUrl.includes("/knowledgebases/"));
  const isExternal =
    value.includes("openapi") ||
    value.includes("api") ||
    value.includes("web") ||
    value.includes("browser");

  if (isFabric && agentDescriptions.fabric) return agentDescriptions.fabric;
  if (isMicrosoft && agentDescriptions.microsoft) return agentDescriptions.microsoft;
  if (isExternal && agentDescriptions.external) return agentDescriptions.external;
  if (isSearch && agentDescriptions.search) return agentDescriptions.search;

  return {
    description: `Configured knowledge source for ${agent.name}: ${name}.`,
    why: `Used when ${agent.name} needs information from this connected source.`,
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

function AgentApp() {
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
  const [openServiceGroups, setOpenServiceGroups] = useState({
    Technology: true,
    Tool: true,
  });
  const [catalogSort, setCatalogSort] = useState("newest");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isInfoSidebarCollapsed, setIsInfoSidebarCollapsed] = useState(false);
  const [infoSidebarWidth, setInfoSidebarWidth] = useState(285);
  const [agentSearch, setAgentSearch] = useState("");

  const abortControllers = useRef({});
  const requestIds = useRef({});
  const silentAbortRequests = useRef(new Set());
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
          throw new Error(errorData?.detail || `Backend returned ${response.status}`);
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
    const requestId = (requestIds.current[agentId] || 0) + 1;

    requestIds.current[agentId] = requestId;
    silentAbortRequests.current.delete(`${agentId}:${requestId}`);
    abortControllers.current[agentId] = controller;

    let finalResponse = "";
    let reasoning = "";
    let newConversationId = conversationId;
    let newVectorStoreId = vectorStoreId;
    let currentEvent = null;
    let eventHistory = [];
    let summary = null;

    updateAgentState(agentId, {
      messages: [
        ...currentState.messages,
        { role: "user", content: userMessage },
      ],
      loading: true,
      reasoning: "",
      currentEvent: null,
      eventHistory: [],
      summary: null,
    });

    setInput("");

    try {
      const formData = new FormData();
      formData.append("agent", agentId);
      formData.append("message", userMessage);

      if (conversationId) {
        formData.append("conversation_id", conversationId);
      }

      if (vectorStoreId) {
        formData.append("vector_store_id", vectorStoreId);
      }

      if (selectedFile) {
        formData.append("file", selectedFile);
      }

      const response = await fetch(`${API_URL}/chat`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        let errorMessage = `Backend returned ${response.status}`;

        try {
          const errorData = await response.json();
          errorMessage =
            errorData?.detail || errorData?.message || errorMessage;
        } catch {
          // Ignore non-JSON error responses.
        }

        throw new Error(errorMessage);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const processEvent = (data) => {
        if (requestIds.current[agentId] !== requestId) return;
        if (!data) return;

        if (data.event === "error") {
          throw new Error(data.message || "Backend error");
        }

        if (data.event === "conversation_state") {
          newConversationId =
            data.conversation_id || newConversationId;
          newVectorStoreId =
            data.vector_store_id || newVectorStoreId;
          return;
        }

        if (data.event === "text") {
          finalResponse += data.delta || "";

          updateAgentState(agentId, {
            currentEvent,
            eventHistory,
            summary,
            reasoning,
          });

          return;
        }

        if (data.event === "reasoning") {
          reasoning += data.delta || "";
          updateAgentState(agentId, { reasoning });
          return;
        }

        if (data.event === "summary") {
          const backendSummary = normalizeSummary(data.summary);

          if (backendSummary) {
            summary = backendSummary;

            updateAgentState(agentId, {
              currentEvent,
              eventHistory,
              summary,
              reasoning,
            });
          }

          return;
        }

        if (data.event === "activity") {
          return;
        }

        if (data.event === "completed") {
          newConversationId =
            data.conversation_id || newConversationId;
          newVectorStoreId =
            data.vector_store_id || newVectorStoreId;

          const backendSummary = normalizeSummary(data.summary);

          if (backendSummary) {
            summary = backendSummary;
          }

          return;
        }

        if (!data.type || !String(data.type).startsWith("response.")) {
          return;
        }

        currentEvent = data;

        if (!eventHistory.some((event) => event.type === data.type)) {
          eventHistory = [...eventHistory, data];
        }

        const backendSummary = normalizeSummary(data.summary);

        if (backendSummary) {
          summary = backendSummary;
        }

        if (data.type === "response.output_text.delta") {
          finalResponse += data.delta || "";
        }

        if (data.type === "response.reasoning_summary_text.delta") {
          reasoning += data.delta || "";
        }

        updateAgentState(agentId, {
          currentEvent,
          eventHistory,
          summary,
          reasoning,
        });
      };

      while (true) {
        const { value, done } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            processEvent(JSON.parse(line));
          } catch (error) {
            if (
              error.message &&
              !error.message.includes("Unexpected token")
            ) {
              throw error;
            }

            console.error("Invalid stream data:", line);
          }
        }
      }

      if (buffer.trim()) {
        try {
          processEvent(JSON.parse(buffer));
        } catch (error) {
          if (
            error.message &&
            !error.message.includes("Unexpected token")
          ) {
            throw error;
          }

          console.error("Invalid final stream data:", buffer);
        }
      }

      if (requestIds.current[agentId] !== requestId) return;

      setAgentStates((prev) => ({
        ...prev,
        [agentId]: {
          ...prev[agentId],
          conversationId: newConversationId,
          vectorStoreId: newVectorStoreId,
          loading: false,
          reasoning: "",
          currentEvent,
          eventHistory,
          summary,
          messages: [
            ...prev[agentId].messages,
            {
              role: "assistant",
              content: finalResponse,
              eventHistory,
              summary,
            },
          ],
        },
      }));
    } catch (error) {
      if (requestIds.current[agentId] !== requestId) return;

      if (error.name === "AbortError") {
        const silent = silentAbortRequests.current.has(
          `${agentId}:${requestId}`
        );

        if (silent || requestIds.current[agentId] !== requestId) return;

        setAgentStates((prev) => ({
          ...prev,
          [agentId]: {
            ...prev[agentId],
            loading: false,
            reasoning: "",
            currentEvent,
            eventHistory,
            summary,
            messages: [
              ...prev[agentId].messages,
              ...(finalResponse
                ? [
                    {
                      role: "assistant",
                      content: finalResponse,
                      eventHistory,
                      summary,
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
          currentEvent,
          eventHistory,
          summary,
          messages: [
            ...prev[agentId].messages,
            {
              role: "assistant",
              content: `Agent error: ${error.message}`,
              eventHistory,
              summary,
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
    setInput("");
    setSelectedFile(null);
    setSelectedAgent(agent);
    setCurrentView("chat");
  };

  const openAgent = (agent) => {
    setInput("");
    setSelectedFile(null);
    setSelectedAgent(agent);
    setCurrentView("chat");
  };

  const startNewChat = () => {
    const agentId = selectedAgent.id;
    const activeRequestId = requestIds.current[agentId];
    const controller = abortControllers.current[agentId];

    if (controller && activeRequestId != null) {
      silentAbortRequests.current.add(
        `${agentId}:${activeRequestId}`
      );
      requestIds.current[agentId] = activeRequestId + 1;
      abortControllers.current[agentId] = null;
      controller.abort();
    } else {
      requestIds.current[agentId] =
        (requestIds.current[agentId] || 0) + 1;
    }

    updateAgentState(agentId, createAgentState());
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

  const renderLiveActivity = () => {
    const event = currentState.currentEvent;

    if (!event) return null;

    return (
      <div className="agent-activity">
        <div className="activity-header">
          <span className="activity-icon">✦</span>
          <span>Agent Activity</span>
        </div>

        <div className="activity-current">
          <div className="activity-current-status">
            <span className="activity-status">●</span>
            <span>{event.type}</span>
          </div>
        </div>
      </div>
    );
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

    const modelDescription = getModelDescription(
      model,
      selectedAgent,
      liveMetadata
    );

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
              <span className="agent-info-section-title">
                Overview
              </span>
              <p className="agent-info-overview">
                {selectedAgent.description}
              </p>
            </section>

            <section className="agent-info-section">
              <span className="agent-info-section-title">
                Architecture
              </span>

              <div className="architecture-placeholder">
                {selectedAgent.architectureImage ? (
                  <img
                    src={selectedAgent.architectureImage}
                    alt={`${selectedAgent.name} architecture`}
                  />
                ) : (
                  <div className="architecture-placeholder-content">
                    <span className="architecture-placeholder-icon">
                      ◇
                    </span>
                    <span>Architecture diagram</span>
                    <small>to be.</small>
                  </div>
                )}
              </div>
            </section>

            <section className="agent-info-section">
              <span className="agent-info-section-title">
                Model
              </span>

              {metadataLoading && (
                <div className="agent-info-loading">
                  Loading live configuration...
                </div>
              )}

              <InfoTooltip
                id={`model-${selectedAgent.id}`}
                label={model}
                description={modelDescription}
                icon={getModelIcon(model)}
              />
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
                      description={getKnowledgeSourceDescription(
                        source,
                        selectedAgent
                      )}
                      icon={getToolIcon(source)}
                    />
                  ))}
                </div>
              ) : (
                <div className="agent-info-empty">
                  No knowledge source was found in the live agent
                  definition.
                </div>
              )}
            </section>

            <section className="agent-info-section">
              <span className="agent-info-section-title">
                Tools
              </span>

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
                      description={getToolDescription(
                        tool,
                        selectedAgent
                      )}
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
              <span>Available Agents</span>
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

              {["Technology", "Tool"].map((group) => {
                const groupServices = serviceOptions.filter(
                  (service) =>
                    service.type === group &&
                    searchMatches.some((agent) =>
                      agent.services.includes(service.key)
                    )
                );

                if (groupServices.length === 0) return null;

                const isOpen = openServiceGroups[group];

                return (
                  <div
                    className="catalog-service-group"
                    key={group}
                  >
                    <button
                      type="button"
                      className="catalog-service-group-header"
                      onClick={() =>
                        setOpenServiceGroups((previous) => ({
                          ...previous,
                          [group]: !previous[group],
                        }))
                      }
                      aria-expanded={isOpen}
                    >
                      <span>{group}</span>

                      <span
                        className={`catalog-service-group-chevron ${
                          isOpen ? "open" : ""
                        }`}
                        aria-hidden="true"
                      >
                        ›
                      </span>
                    </button>

                    {isOpen && (
                      <div className="catalog-service-group-options">
                        {groupServices.map((service) => {
                          const count = searchMatches.filter((agent) =>
                            agent.services.includes(service.key)
                          ).length;

                          const isChecked =
                            catalogServices.includes(service.key);

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

                              <span>{service.label}</span>

                              <small>{count}</small>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
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
                      <div className="agent-template-body">
                        <span className="agent-template-technology">
                          {agent.technology}
                        </span>

                        <h2>{agent.name}</h2>

                        <p>{agent.description}</p>
                      </div>

                      <span className="agent-template-action">
                        Open agent{" "}
                        <span aria-hidden="true">
                          &#8594;
                        </span>
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
      <aside
        className={
          isSidebarCollapsed ? "sidebar collapsed" : "sidebar"
        }
      >
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
                className={`agent-item ${
                  isActive ? "active" : ""
                }`}
                onClick={() => handleAgentChange(agent)}
              >
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
          <div
            className="header-agent"
            style={{
              justifyContent: "flex-start",
              alignItems: "center",
              marginRight: "auto",
              width: "auto",
              flex: "0 1 auto",
              textAlign: "left",
            }}
          >
            <button
              className="back-to-catalog"
              onClick={() => setCurrentView("catalog")}
              type="button"
              aria-label="Back to agent catalog"
            >
              &#8592;
            </button>

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
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                      >
                        {message.content}
                      </ReactMarkdown>

                      {message.summary && (
                        <details className="activity-summary completed-summary">
                          <summary>
                            <span>Summary</span>

                            <span
                              className="summary-chevron"
                              aria-hidden="true"
                            >
                              ›
                            </span>
                          </summary>

                          <div className="summary-list">
                            {Array.isArray(message.summary) ? (
                              message.summary.map(
                                (item, itemIndex) => (
                                  <div
                                    className="summary-item"
                                    key={`${item}-${itemIndex}`}
                                  >
                                    <span>•</span>
                                    <span>{item}</span>
                                  </div>
                                )
                              )
                            ) : (
                              <div className="summary-content">
                                <ReactMarkdown
                                  remarkPlugins={[remarkGfm]}
                                >
                                  {String(message.summary)}
                                </ReactMarkdown>
                              </div>
                            )}
                          </div>
                        </details>
                      )}
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
                {renderLiveActivity()}

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

function App() {
  return (
    <>
      <style>{`
        .header-agent {
          justify-content: flex-start !important;
          align-items: center !important;
          margin-right: auto !important;
          width: auto !important;
          text-align: left !important;
        }

        .completed-summary {
          margin-top: 18px;
          padding-top: 14px;
          border-top: 1px solid var(--border-color);
        }

        .completed-summary > summary {
          list-style: none;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          cursor: pointer;
          padding: 2px 0;
          font-size: 12px;
          font-weight: 600;
        }

        .completed-summary > summary::-webkit-details-marker {
          display: none;
        }

        .completed-summary > summary::marker {
          display: none;
          content: "";
        }

        .summary-chevron {
          margin-left: auto;
          font-size: 18px;
          line-height: 1;
          transition: transform .18s ease;
        }

        .completed-summary[open] .summary-chevron {
          transform: rotate(90deg);
        }

        .completed-summary .summary-list {
          padding-top: 12px;
        }

        .completed-summary .summary-item {
          display: flex;
          align-items: flex-start;
          gap: 9px;
          margin-bottom: 8px;
          font-size: 12px;
          line-height: 1.5;
        }

        .completed-summary .summary-item > span:first-child {
          flex: 0 0 auto;
          opacity: .65;
        }

        .catalog-service-group-header {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border: 0;
          background: transparent;
          cursor: pointer;
          padding: 8px 0;
        }

        .catalog-service-group-chevron {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          line-height: 1;
          transition: transform .18s ease;
        }

        .catalog-service-group-chevron.open {
          transform: rotate(90deg);
        }
      `}</style>

      <AgentApp />
    </>
  );
}

export default App;
