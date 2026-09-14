
import { useEffect, useRef, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import dreamItWebsiteLogo from "./assets/dreamit-new-logo.png";
import microsoftPartnerLogo from "./assets/microsoft-solution-partner-logo.png";
import openai from "./assets/openai.png";
import azureAISearch from "./assets/azure-ai-search.webp";
import fabric from "./assets/fabric.png";
import foundry from "./assets/ms-foundry.png";
import openapi from "./assets/openapi-logo.png";
import claude from "./assets/claude.png";
import bing from "./assets/bing.png";
import mcp from "./assets/mcp.svg";
import graph from "./assets/ms-graph.png";
import teams from "./assets/ms-teams.png";
import microsoft365 from "./assets/ms-365.jpg";
import file_search from "./assets/file-search.webp";
import code_interpreter from "./assets/code-interpreter.png";
import knowledge from "./assets/knowledge-source.png";
import "./App.css";

const API_URL = "http://127.0.0.1:8000";

const serviceOptions = [
  { key: "foundry", label: "Microsoft Foundry", type: "Technology", description: "Microsoft's platform for building, deploying, and managing AI applications and agents." },
  { key: "fabric", label: "Microsoft Fabric", type: "Technology", description: "An end-to-end analytics platform for data integration, engineering, warehousing, data science, and BI." },
  { key: "microsoft-365", label: "Microsoft 365", type: "Technology", description: "A productivity and collaboration suite that includes services such as Outlook, Teams, and SharePoint." },
  { key: "azure-ai-search", label: "Azure AI Search", type: "Tool", description: "A cloud search service used to index and retrieve relevant content for search and AI applications." },
  { key: "microsoft-graph", label: "Microsoft Graph", type: "Tool", description: "A unified API for accessing data and capabilities across Microsoft 365 services." },
  { key: "teams", label: "Microsoft Teams", type: "Tool", description: "Microsoft's collaboration service for chat, meetings, files, and team communication." },
  { key: "web-research", label: "Web research", type: "Tool", description: "A research capability used to retrieve and analyze information from public web sources." },
];

const agents = [
  {
    id: "retailinfo", name: "RetailInfo", shortName: "Retail", technology: "Microsoft Fabric", technologyKey: "fabric",
    services: ["fabric", "azure-ai-search"], createdAt: 4, architectureImage: null,
    description: "Get information about retail products and data.",
    suggestions: ["Show me 5 internal products", "Find products by category and color", "Give me details about a specific product"],
  },
  {
    id: "productcomparison", name: "Product Comparison", shortName: "Compare", technology: "Microsoft Foundry", technologyKey: "foundry",
    services: ["foundry", "azure-ai-search"], createdAt: 3, architectureImage: null,
    description: "Compare products and provide useful insights.",
    suggestions: ["Compare our products with competitor products", "Which competitor has the closest matching product?", "Show me the price differences between products"],
  },
  {
    id: "email-teams-extractor", name: "Email & Teams Extractor", shortName: "Workspace", technology: "Microsoft 365", technologyKey: "microsoft-365",
    services: ["microsoft-365", "microsoft-graph", "teams"], createdAt: 2, architectureImage: null,
    description: "Extract and analyze information from emails and Teams.",
    suggestions: ["Show me my important emails", "What tasks am I currently working on?", "Were any new tasks assigned to me through Teams?"],
  },
  {
    id: "Tender-agent", name: "Tender Agent", shortName: "Tenders", technology: "Microsoft Foundry", technologyKey: "foundry",
    services: ["foundry", "azure-ai-search", "web-research"], createdAt: 1, architectureImage: null,
    description: "Ask questions about tenders and documents.",
    suggestions: ["Summarize the emails in the shared mailbox and flag anything urgent", "Scrape the latest tenders from Amref and NMS published in the last 3 days", "Show me the latest tenders published on dgMarket from Poland"],
  },
];

const createAgentState = () => ({
  conversationId: null, vectorStoreId: null, messages: [], loading: false, reasoning: "",
  currentEvent: null, eventHistory: [], summary: null, generatedFiles: [],
});

const normalizeSummary = (value) => {
  if (!value) return null;
  if (Array.isArray(value)) {
    const items = value.filter((item) => item !== null && item !== undefined && String(item).trim());
    return items.length ? items : null;
  }
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
};

const getToolName = (tool) => tool?.server_label || tool?.name || tool?.function?.name || tool?.type || "Connected tool";
const getToolType = (tool) => String(tool?.type || tool?.name || "").toLowerCase();
const getConfiguredDescription = (tool) => tool?.description || tool?.function?.description || tool?.openapi?.description || tool?.metadata?.description || null;

const getToolIcon = (tool) => {
  const value = `${getToolName(tool)} ${getToolType(tool)} ${tool?.server_url || ""}`.toLowerCase();
  if (getToolType(tool) === "code_interpreter") return code_interpreter;
  if (getToolType(tool) === "mcp" && value.includes("/knowledgebases/")) return knowledge;
  if (value.includes("openapi") || value.includes("api")) return openapi;
  if (value.includes("web") || value.includes("browser")) return bing;
  if (value.includes("file_search") || value.includes("knowledge")) return file_search;
  if (value.includes("search")) return azureAISearch;
  if (value.includes("fabric")) return fabric;
  if (value.includes("teams")) return teams;
  if (value.includes("graph")) return graph;
  if (value.includes("mcp")) return mcp;
  return openai;
};

const getToolDescription = (tool) => {
  const type = getToolType(tool);
  if (type === "web_search") return { description: "Searches the web for relevant and up-to-date information." };
  if (type === "file_search") return { description: "Searches uploaded files and documents to retrieve relevant information." };
  if (type === "code_interpreter") return { description: "Runs Python code in a secure sandbox to analyze data, create charts and visualizations, solve computational tasks, and generate files such as spreadsheets and reports." };
  return { description: getConfiguredDescription(tool) || "No description configured for this tool." };
};

const getKnowledgeSourceDescription = (tool) => ({ description: getConfiguredDescription(tool) || "No description configured for this knowledge base." });

const getModelIcon = (model) => {
  const value = String(model || "").toLowerCase();
  if (value.includes("claude") || value.includes("anthropic")) return claude;
  if (value.includes("gpt") || value.includes("openai")) return openai;
  return openai;
};

const getModelDescription = (model) => {
  const value = String(model || "").toLowerCase();
  if (!model || model === "Model unavailable") return { description: "The live agent configuration does not expose a model." };
  if (value.includes("gpt-5.1")) return { description: "GPT-5.1 is an advanced AI model with strong reasoning capabilities, text and image processing, structured outputs, and support for tools, functions, and parallel tool calling." };
  if (value.includes("gpt")) return { description: "An OpenAI model designed for natural language understanding, reasoning, analysis, instruction following, and tool-assisted AI applications." };
  if (value.includes("claude") || value.includes("anthropic")) return { description: "Claude is an advanced AI model family from Anthropic with strong language understanding, complex reasoning, code generation, and multimodal capabilities including image analysis." };
  return { description: "The AI model configured for this agent provides language understanding, reasoning, and content generation capabilities." };
};

const getServiceIcon = (serviceKey) => ({
  foundry,
  fabric,
  "microsoft-365": microsoft365,
  "azure-ai-search": azureAISearch,
  "microsoft-graph": graph,
  teams,
  "web-research": bing,
}[serviceKey] || openai);

const getIntegrationItems = (agent) => (Array.isArray(agent?.services) ? agent.services : [])
  .map((serviceKey) => {
    const service = serviceOptions.find((item) => item.key === serviceKey);
    return service ? { key: service.key, label: service.label, description: service.description, icon: getServiceIcon(service.key) } : null;
  })
  .filter(Boolean);

const normalizeGeneratedFile = (file) => {
  if (!file) return null;
  const rawUrl = file.download_url || file.url || file.href || file.downloadUrl;
  const filename = file.filename || file.name || "Generated file";
  if (!rawUrl) return null;
  const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `${API_URL}${rawUrl.startsWith("/") ? rawUrl : `/${rawUrl}`}`;
  return { id: file.id || file.file_id || `${filename}-${url}`, filename, url };
};

function InfoTooltip({ label, description, id, icon }) {
  return (
    <div className="agent-info-item">
      <div className="agent-info-icon-wrap">
        {icon ? <img src={icon} alt="" className="agent-info-icon" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : <span className="agent-info-fallback-icon">◇</span>}
      </div>
      <span className="info-tooltip-trigger" tabIndex="0" aria-describedby={id}>
        <span className="agent-info-item-name">{label}</span>
        <span id={id} className="info-tooltip" role="tooltip"><strong>{label}</strong><span>{description.description}</span></span>
      </span>
    </div>
  );
}

function AgentApp() {
  const navigate = useNavigate();
  const location = useLocation();
  const { agentName } = useParams();
  const routeAgent = agents.find((agent) => agent.id === agentName);
  const isCatalog = location.pathname === "/discover";
  const selectedAgent = routeAgent || agents[0];

  const [agentStates, setAgentStates] = useState({
    retailinfo: createAgentState(), productcomparison: createAgentState(),
    "email-teams-extractor": createAgentState(), "Tender-agent": createAgentState(),
  });
  const [agentMetadata, setAgentMetadata] = useState({});
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [metadataError, setMetadataError] = useState("");
  const [input, setInput] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogServices, setCatalogServices] = useState([]);
  const [openServiceGroups, setOpenServiceGroups] = useState({ Technology: true, Tool: true });
  const [catalogSort, setCatalogSort] = useState("newest");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isInfoSidebarCollapsed, setIsInfoSidebarCollapsed] = useState(false);
  const [infoSidebarWidth, setInfoSidebarWidth] = useState(285);
  const [agentSearch, setAgentSearch] = useState("");

  const abortControllers = useRef({});
  const requestIds = useRef({});
  const silentAbortRequests = useRef(new Set());
  const resizeRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const currentState = agentStates[selectedAgent.id];
  const liveMetadata = agentMetadata[selectedAgent.id];

  useEffect(() => {
    if (!isCatalog && !routeAgent) navigate("/discover", { replace: true });
  }, [isCatalog, routeAgent, navigate]);

  useEffect(() => {
    if (performance.getEntriesByType("navigation")[0]?.type === "reload" && !isCatalog) {
      navigate("/discover", { replace: true });
    }
  }, []);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    requestAnimationFrame(() => { container.scrollTop = container.scrollHeight; });
  }, [selectedAgent.id, currentState.messages.length, currentState.loading]);

  useEffect(() => {
    if (isCatalog) return;
    let cancelled = false;
    const loadMetadata = async () => {
      setMetadataLoading(true);
      setMetadataError("");
      try {
        const response = await fetch(`${API_URL}/agents/${encodeURIComponent(selectedAgent.id)}/metadata`);
        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          throw new Error(errorData?.detail || `Backend returned ${response.status}`);
        }
        const data = await response.json();
        if (!cancelled) setAgentMetadata((previous) => ({ ...previous, [selectedAgent.id]: data }));
      } catch (error) {
        if (!cancelled) setMetadataError(error.message || "Failed to fetch metadata");
      } finally {
        if (!cancelled) setMetadataLoading(false);
      }
    };
    loadMetadata();
    return () => { cancelled = true; };
  }, [selectedAgent.id, isCatalog]);

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
      setInfoSidebarWidth(Math.min(maxWidth, Math.max(minWidth, nextWidth)));
    }
    window.__stopAgentInfoResize = stopResize;
    return () => { stopResize(); delete window.__stopAgentInfoResize; };
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
      setInfoSidebarWidth(Math.min(maxWidth, Math.max(minWidth, nextWidth)));
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
    return [agent.name, agent.description, agent.technology].join(" ").toLowerCase().includes(search);
  });

  const searchMatches = agents.filter((agent) => {
    const search = catalogSearch.trim().toLowerCase();
    if (!search) return true;
    return [agent.name, agent.description, agent.technology, ...agent.services.map((serviceKey) => serviceOptions.find((service) => service.key === serviceKey)?.label || "")]
      .join(" ").toLowerCase().includes(search);
  });

  const filteredAgents = searchMatches.filter((agent) => catalogServices.length === 0 || agent.services.some((serviceKey) => catalogServices.includes(serviceKey)))
    .sort((firstAgent, secondAgent) => catalogSort === "alphabetical" ? firstAgent.name.localeCompare(secondAgent.name) : secondAgent.createdAt - firstAgent.createdAt);

  const updateAgentState = (agentId, updates) => setAgentStates((prev) => ({ ...prev, [agentId]: { ...prev[agentId], ...updates } }));

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

    let finalResponse = "", reasoning = "", newConversationId = conversationId, newVectorStoreId = vectorStoreId;
    let currentEvent = null, eventHistory = [], summary = null, generatedFiles = [];

    updateAgentState(agentId, {
      messages: [...currentState.messages, { role: "user", content: userMessage }],
      loading: true, reasoning: "", currentEvent: null, eventHistory: [], summary: null, generatedFiles: [],
    });
    setInput("");

    try {
      const formData = new FormData();
      formData.append("agent", agentId);
      formData.append("message", userMessage);
      if (conversationId) formData.append("conversation_id", conversationId);
      if (vectorStoreId) formData.append("vector_store_id", vectorStoreId);
      if (selectedFile) formData.append("file", selectedFile);

      const response = await fetch(`${API_URL}/chat`, { method: "POST", body: formData, signal: controller.signal });
      if (!response.ok || !response.body) {
        let errorMessage = `Backend returned ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData?.detail || errorData?.message || errorMessage;
        } catch {}
        throw new Error(errorMessage);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const processEvent = (data) => {
        if (requestIds.current[agentId] !== requestId || !data) return;
        if (data.event === "error") throw new Error(data.message || "Backend error");

        if (data.event === "conversation_state") {
          newConversationId = data.conversation_id || newConversationId;
          newVectorStoreId = data.vector_store_id || newVectorStoreId;
          return;
        }

        if (data.event === "generated_file") {
          const file = normalizeGeneratedFile(data);
          if (file && !generatedFiles.some((item) => item.id === file.id)) {
            generatedFiles = [...generatedFiles, file];
            updateAgentState(agentId, { generatedFiles, currentEvent, eventHistory, summary, reasoning });
          }
          return;
        }

        if (data.event === "generated_file_error") {
          console.error("Generated file error:", data.message || data.error);
          return;
        }

        if (data.event === "text") {
          finalResponse += data.delta || "";
          updateAgentState(agentId, { currentEvent, eventHistory, summary, reasoning, generatedFiles });
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
            updateAgentState(agentId, { currentEvent, eventHistory, summary, reasoning, generatedFiles });
          }
          return;
        }

        if (data.event === "activity") return;

        if (data.event === "completed") {
          newConversationId = data.conversation_id || newConversationId;
          newVectorStoreId = data.vector_store_id || newVectorStoreId;
          const backendSummary = normalizeSummary(data.summary);
          if (backendSummary) summary = backendSummary;
          if (Array.isArray(data.generated_files)) {
            data.generated_files.map(normalizeGeneratedFile).filter(Boolean).forEach((file) => {
              if (!generatedFiles.some((item) => item.id === file.id)) generatedFiles = [...generatedFiles, file];
            });
          }
          return;
        }

        if (!data.type || !String(data.type).startsWith("response.")) return;
        currentEvent = data;
        if (!eventHistory.some((event) => event.type === data.type)) eventHistory = [...eventHistory, data];
        const backendSummary = normalizeSummary(data.summary);
        if (backendSummary) summary = backendSummary;
        if (data.type === "response.output_text.delta") finalResponse += data.delta || "";
        if (data.type === "response.reasoning_summary_text.delta") reasoning += data.delta || "";
        updateAgentState(agentId, { currentEvent, eventHistory, summary, reasoning, generatedFiles });
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
            if (error.message && !error.message.includes("Unexpected token")) throw error;
            console.error("Invalid stream data:", line);
          }
        }
      }

      if (buffer.trim()) {
        try {
          processEvent(JSON.parse(buffer));
        } catch (error) {
          if (error.message && !error.message.includes("Unexpected token")) throw error;
          console.error("Invalid final stream data:", buffer);
        }
      }

      if (requestIds.current[agentId] !== requestId) return;

      setAgentStates((prev) => ({
        ...prev,
        [agentId]: {
          ...prev[agentId], conversationId: newConversationId, vectorStoreId: newVectorStoreId,
          loading: false, reasoning: "", currentEvent, eventHistory, summary, generatedFiles,
          messages: [...prev[agentId].messages, { role: "assistant", content: finalResponse, eventHistory, summary, generatedFiles }],
        },
      }));
    } catch (error) {
      if (requestIds.current[agentId] !== requestId) return;
      if (error.name === "AbortError") {
        const silent = silentAbortRequests.current.has(`${agentId}:${requestId}`);
        if (silent || requestIds.current[agentId] !== requestId) return;
        setAgentStates((prev) => ({
          ...prev,
          [agentId]: {
            ...prev[agentId], loading: false, reasoning: "", currentEvent, eventHistory, summary, generatedFiles,
            messages: [...prev[agentId].messages, ...(finalResponse ? [{ role: "assistant", content: finalResponse, eventHistory, summary, generatedFiles }] : []), { role: "system", content: "Response stopped by user." }],
          },
        }));
        return;
      }
      console.error("Agent error:", error);
      setAgentStates((prev) => ({
        ...prev,
        [agentId]: {
          ...prev[agentId], loading: false, reasoning: "", currentEvent, eventHistory, summary, generatedFiles,
          messages: [...prev[agentId].messages, { role: "assistant", content: `Agent error: ${error.message}`, eventHistory, summary, generatedFiles }],
        },
      }));
    } finally {
      if (abortControllers.current[agentId] === controller) abortControllers.current[agentId] = null;
    }
  };

  const handleAgentChange = (agent) => {
    setInput("");
    setSelectedFile(null);
    navigate(`/agent/${encodeURIComponent(agent.id)}`);
  };

  const openAgent = (agent) => {
    setInput("");
    setSelectedFile(null);
    navigate(`/agent/${encodeURIComponent(agent.id)}`);
  };

  const startNewChat = () => {
    const agentId = selectedAgent.id;
    const activeRequestId = requestIds.current[agentId];
    const controller = abortControllers.current[agentId];
    if (controller && activeRequestId != null) {
      silentAbortRequests.current.add(`${agentId}:${activeRequestId}`);
      requestIds.current[agentId] = activeRequestId + 1;
      abortControllers.current[agentId] = null;
      controller.abort();
    } else {
      requestIds.current[agentId] = (requestIds.current[agentId] || 0) + 1;
    }
    updateAgentState(agentId, createAgentState());
    setInput("");
    setSelectedFile(null);
  };

  const toggleCatalogService = (serviceKey) => setCatalogServices((currentServices) =>
    currentServices.includes(serviceKey) ? currentServices.filter((key) => key !== serviceKey) : [...currentServices, serviceKey]
  );

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
        <div className="activity-header"><span className="activity-icon">✦</span><span>Agent Activity</span></div>
        <div className="activity-current">
          <div className="activity-current-status"><span className="activity-status">●</span><span>{event.type}</span></div>
        </div>
      </div>
    );
  };

  const renderGeneratedFiles = (files) => {
    const normalizedFiles = (files || []).map(normalizeGeneratedFile).filter(Boolean);
    if (!normalizedFiles.length) return null;
    return (
      <div className="generated-files">
        {normalizedFiles.map((file) => (
          <a key={file.id} className="generated-file-link" href={file.url} download={file.filename}>
            <span aria-hidden="true">↓</span><span>{file.filename}</span>
          </a>
        ))}
      </div>
    );
  };

  const renderMarkdown = (content) => (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ href, children, ...props }) => {
          const normalizedHref = href && href.startsWith("/") ? `${API_URL}${href}` : href;
          const isExternal = /^https?:\/\//i.test(normalizedHref || "");
          const isBackendFile = normalizedHref?.startsWith(`${API_URL}/files/`);
          return (
            <a href={normalizedHref} {...props}
              target={isExternal && !isBackendFile ? "_blank" : undefined}
              rel={isExternal && !isBackendFile ? "noopener noreferrer" : undefined}
              download={isBackendFile ? true : undefined}>
              {children}
            </a>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );

  const renderAgentInfo = () => {
    const model = liveMetadata?.model || liveMetadata?.definition?.model || "Model unavailable";
    const knowledgeTools = Array.isArray(liveMetadata?.knowledge_sources) ? liveMetadata.knowledge_sources : [];
    const regularTools = Array.isArray(liveMetadata?.action_tools) ? liveMetadata.action_tools : [];
    const integrationItems = getIntegrationItems(selectedAgent);
    const modelDescription = getModelDescription(model);

    return (
      <aside className={`agent-info-sidebar ${isInfoSidebarCollapsed ? "collapsed" : ""}`} style={{ width: isInfoSidebarCollapsed ? 58 : infoSidebarWidth, minWidth: isInfoSidebarCollapsed ? 58 : infoSidebarWidth }}>
        {!isInfoSidebarCollapsed && <div className="agent-info-resize-handle" onPointerDown={startInfoSidebarResize} title="Drag to resize" aria-label="Resize Agent Info panel" />}
        <div className="agent-info-header">
          {!isInfoSidebarCollapsed && <h3>Agent Info</h3>}
          <button className="info-sidebar-toggle" onClick={() => setIsInfoSidebarCollapsed((collapsed) => !collapsed)} type="button" aria-label={isInfoSidebarCollapsed ? "Expand agent information" : "Collapse agent information"} title={isInfoSidebarCollapsed ? "Expand agent information" : "Collapse agent information"}>{isInfoSidebarCollapsed ? "<" : ">"}</button>
        </div>

        {!isInfoSidebarCollapsed && (
          <div className="agent-info-content">
            <section className="agent-info-section">
              <span className="agent-info-section-title">Overview</span>
              <p className="agent-info-overview">{liveMetadata?.description || selectedAgent.description}</p>
            </section>

            <section className="agent-info-section">
              <span className="agent-info-section-title">Architecture</span>
              <div className="architecture-placeholder">
                {selectedAgent.architectureImage ? <img src={selectedAgent.architectureImage} alt={`${selectedAgent.name} architecture`} /> : <div className="architecture-placeholder-content"><span className="architecture-placeholder-icon">◇</span><span>Architecture diagram</span><small>to be.</small></div>}
              </div>
            </section>

            {metadataLoading && <div className="agent-info-loading">Loading live configuration...</div>}

            <section className="agent-info-section">
              <span className="agent-info-section-title">Model</span>
              <InfoTooltip id={`model-${selectedAgent.id}`} label={model} description={modelDescription} icon={getModelIcon(model)} />
            </section>

            <section className="agent-info-section">
              <span className="agent-info-section-title">Knowledge Sources</span>
              {knowledgeTools.length > 0 ? <div className="agent-info-list">{knowledgeTools.map((source, index) => <InfoTooltip key={`${getToolName(source)}-${index}`} id={`knowledge-${selectedAgent.id}-${index}`} label={getToolName(source)} description={getKnowledgeSourceDescription(source)} icon={getToolIcon(source)} />)}</div> : <div className="agent-info-empty">No knowledge base is configured for this agent.</div>}
            </section>

            <section className="agent-info-section">
              <span className="agent-info-section-title">Tools</span>
              {regularTools.length > 0 ? <div className="agent-info-list">{regularTools.map((tool, index) => <InfoTooltip key={`${getToolName(tool)}-${index}`} id={`tool-${selectedAgent.id}-${index}`} label={getToolType(tool) === "web_search" ? "Web Search" : getToolType(tool) === "file_search" ? "File Search" : getToolType(tool) === "code_interpreter" ? "Code Interpreter" : getToolName(tool)} description={getToolDescription(tool)} icon={getToolIcon(tool)} />)}</div> : <div className="agent-info-empty">No tools are exposed in the live agent definition.</div>}
            </section>

            <section className="agent-info-section">
              <span className="agent-info-section-title">Services & Integrations</span>
              {integrationItems.length > 0 ? <div className="agent-info-list">{integrationItems.map((item, index) => <InfoTooltip key={item.key} id={`integration-${selectedAgent.id}-${index}`} label={item.label} description={{ description: item.description }} icon={item.icon} />)}</div> : <div className="agent-info-empty">No services or integrations are configured for this agent.</div>}
            </section>

            {metadataError && <div className="agent-info-error">Could not load live Foundry metadata: {metadataError}</div>}
          </div>
        )}
      </aside>
    );
  };

  if (isCatalog) {
    return (
      <div className="catalog-page">
        <header className="catalog-header">
          <div className="catalog-brand-logos">
            <div className="catalog-logo dreamit-website-logo"><img src={dreamItWebsiteLogo} alt="Dream IT Consulting Services" /></div>
            <div className="catalog-logo microsoft-partner-logo"><img src={microsoftPartnerLogo} alt="Microsoft Solutions Partner" /></div>
          </div>
          <div className="catalog-header-meta"><span className="catalog-status-dot"></span>Services connected</div>
        </header>

        <main className="catalog-main">
          <div className="catalog-intro">
            <div><p className="catalog-eyebrow">AGENT CATALOG</p><h1>Choose an agent to get started</h1><p className="catalog-description">Explore the agents available across your Microsoft and Azure workspace.</p></div>
            <div className="catalog-count"><strong>{filteredAgents.length}</strong><span>Available Agents</span></div>
          </div>

          <div className="catalog-layout">
            <aside className="catalog-filters">
              <div className="catalog-filters-heading">Services</div>
              {["Technology", "Tool"].map((group) => {
                const groupServices = serviceOptions.filter((service) => service.type === group && searchMatches.some((agent) => agent.services.includes(service.key)));
                if (!groupServices.length) return null;
                const isOpen = openServiceGroups[group];
                return (
                  <div className="catalog-service-group" key={group}>
                    <button type="button" className="catalog-service-group-header" onClick={() => setOpenServiceGroups((previous) => ({ ...previous, [group]: !previous[group] }))} aria-expanded={isOpen}>
                      <span>{group}</span><span className={`catalog-service-group-chevron ${isOpen ? "open" : ""}`} aria-hidden="true">›</span>
                    </button>
                    {isOpen && <div className="catalog-service-group-options">
                      {groupServices.map((service) => {
                        const count = searchMatches.filter((agent) => agent.services.includes(service.key)).length;
                        const isChecked = catalogServices.includes(service.key);
                        return (
                          <label className="catalog-filter-option" key={service.key}>
                            <input type="checkbox" checked={isChecked} onChange={() => toggleCatalogService(service.key)} />
                            <span>{service.label}</span><small>{count}</small>
                          </label>
                        );
                      })}
                    </div>}
                  </div>
                );
              })}
            </aside>

            <section className="catalog-results">
              <div className="catalog-toolbar">
                <label className="catalog-search"><span aria-hidden="true">⌕</span><input type="search" value={catalogSearch} onChange={(event) => setCatalogSearch(event.target.value)} placeholder="Search agents or technologies" aria-label="Search agents or technologies" /></label>
                <label className="catalog-sort"><span>Sort by</span><select value={catalogSort} onChange={(event) => setCatalogSort(event.target.value)} aria-label="Sort agents"><option value="newest">Newest agents</option><option value="alphabetical">Alphabetical A-Z</option></select></label>
              </div>

              {filteredAgents.length > 0 ? <div className="agent-catalog-grid">
                {filteredAgents.map((agent) => (
                  <button key={agent.id} className="agent-template-card" onClick={() => openAgent(agent)} type="button">
                    <div className="agent-template-body">
                      <span className="agent-template-technology">Microsoft</span>
                      <h2>{agent.name}</h2>
                      <p>{agent.description}</p>
                      <div className="agent-template-services" aria-label="Services and integrations">
                        {getIntegrationItems(agent).map((service) => <span className="agent-template-service" key={service.key} title={service.label} aria-label={service.label}><img src={service.icon} alt="" /></span>)}
                      </div>
                    </div>
                    <span className="agent-template-action">Open agent <span aria-hidden="true">&#8594;</span></span>
                  </button>
                ))}
              </div> : <div className="catalog-empty"><strong>No agents found</strong><span>Try another name, description, or technology.</span></div>}
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
          <div className="brand-mark"><img className="brand-logo" src={dreamItWebsiteLogo} alt="Dream IT Consulting Services" /><img className="brand-partner-logo" src={microsoftPartnerLogo} alt="Microsoft Solutions Partner" /></div>
          <button className="sidebar-toggle" onClick={() => setIsSidebarCollapsed((collapsed) => !collapsed)} type="button" aria-label={isSidebarCollapsed ? "Expand agent list" : "Collapse agent list"} title={isSidebarCollapsed ? "Expand agent list" : "Collapse agent list"}>{isSidebarCollapsed ? ">" : "<"}</button>
        </div>

        <div className="sidebar-label">AGENTS</div>

        {!isSidebarCollapsed && <label className="agent-search"><span aria-hidden="true">⌕</span><input type="search" value={agentSearch} onChange={(event) => setAgentSearch(event.target.value)} placeholder="Search agents" aria-label="Search agents" /></label>}

        <div className="agents-list">
          {visibleAgents.map((agent) => {
            const state = agentStates[agent.id];
            const isActive = selectedAgent.id === agent.id;
            return <button key={agent.id} className={`agent-item ${isActive ? "active" : ""}`} onClick={() => handleAgentChange(agent)}><div className="agent-info"><div className="agent-name">{agent.name}</div><div className="agent-description">{agent.description}</div><div className={`agent-status ${state.loading ? "working" : "ready"}`}><span className="status-dot"></span>{state.loading ? "Working" : "Ready"}</div></div></button>;
          })}
          {visibleAgents.length === 0 && <div className="agent-search-empty">No agents found</div>}
        </div>

        <div className="sidebar-footer"><div className="connection-dot"></div><span>AI services connected</span></div>
      </aside>

      <main className="chat-container">
        <header className="chat-header">
          <div className="header-agent" style={{ justifyContent: "flex-start", alignItems: "center", marginRight: "auto", width: "auto", flex: "0 1 auto", textAlign: "left" }}>
            <button className="back-to-catalog" onClick={() => navigate("/discover")} type="button" aria-label="Back to agent catalog">&#8592;</button>
            <div><h2>{selectedAgent.name}</h2><p>{liveMetadata?.description || selectedAgent.description}</p></div>
          </div>
          <div className="header-actions"><button className="new-chat-button" onClick={startNewChat} type="button"><span aria-hidden="true">+</span>New chat</button></div>
        </header>

        <div className="messages-container" ref={messagesContainerRef}>
          {currentState.messages.length === 0 && !currentState.loading && (
            <div className="welcome-wrapper">
              <div className="welcome-icon">✦</div><h3>How can I help you?</h3>
              <p className="welcome-description">Start a conversation with <strong>{selectedAgent.name}</strong></p>
              <div className="suggestions">{selectedAgent.suggestions.map((suggestion, index) => <button key={index} className="suggestion-card" onClick={() => handleSuggestionClick(suggestion)}><span className="suggestion-number">{String(index + 1).padStart(2, "0")}</span><span className="suggestion-text">{suggestion}</span><span className="suggestion-arrow">→</span></button>)}</div>
            </div>
          )}

          {currentState.messages.map((message, index) => {
            if (message.role === "system") return <div key={index} className="stopped-message">{message.content}</div>;
            return (
              <div key={index} className={`message-row ${message.role === "user" ? "user-row" : "assistant-row"}`}>
                {message.role === "assistant" && <div className="message-avatar">✦</div>}
                <div className={`message-bubble ${message.role === "user" ? "user-bubble" : "assistant-bubble"}`}>
                  {message.role === "assistant" ? (
                    <div className="markdown-content">
                      {renderMarkdown(message.content)}
                      {renderGeneratedFiles(message.generatedFiles)}
                      {message.summary && (
                        <details className="activity-summary completed-summary">
                          <summary><span>Summary</span><span className="summary-chevron" aria-hidden="true">›</span></summary>
                          <div className="summary-list">
                            {Array.isArray(message.summary) ? message.summary.map((item, itemIndex) => <div className="summary-item" key={`${item}-${itemIndex}`}><span>•</span><span>{item}</span></div>) : <div className="summary-content">{renderMarkdown(String(message.summary))}</div>}
                          </div>
                        </details>
                      )}
                    </div>
                  ) : message.content}
                </div>
              </div>
            );
          })}

          {currentState.loading && (
            <div className="message-row assistant-row">
              <div className="message-avatar">✦</div>
              <div className="assistant-bubble loading-bubble">
                {renderLiveActivity()}
                {renderGeneratedFiles(currentState.generatedFiles)}
                <div className="loading-content">
                  <div className="loading-indicator"><span className="loading-dot"></span><span className="loading-dot"></span><span className="loading-dot"></span><span className="loading-text">Working...</span></div>
                  <button className="stop-button" onClick={() => stopResponse(selectedAgent.id)} type="button"><span className="stop-icon">■</span><span>Stop</span></button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="input-section">
          {selectedFile && <div className="selected-file"><span className="file-icon">📎</span><span className="file-name">{selectedFile.name}</span><button type="button" onClick={() => setSelectedFile(null)}>×</button></div>}
          <div className="input-box">
            <label className="attach-button file-upload-button" aria-label="Select file to send">
              +
              <input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.json,.md,.html,.csv,.xlsx,.xls" onChange={handleFileChange} hidden />
              <span className="file-upload-tooltip">Select file to send<br /><small>(PDF, DOC, DOCX, PPTX, TXT, JSON, MD, HTML, CSV, XLSX, XLS)</small></span>
            </label>
            <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={handleKeyDown} placeholder={`Message ${selectedAgent.name}...`} disabled={currentState.loading} rows={1} />
            <button className="send-button" onClick={sendMessage} disabled={!input.trim() || currentState.loading}><span>Send</span><span className="send-arrow">↑</span></button>
          </div>
          <div className="input-footer"><span>Enter to send</span><span>•</span><span>Shift + Enter for new line</span><span className="disclaimer">AI can make mistakes. Please verify important information.</span></div>
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
        .header-agent{justify-content:flex-start!important;align-items:center!important;margin-right:auto!important;width:auto!important;text-align:left!important}
        .completed-summary{margin-top:18px;padding-top:14px;border-top:1px solid var(--border-color)}
        .completed-summary>summary{list-style:none;display:flex;align-items:center;justify-content:space-between;gap:12px;cursor:pointer;padding:2px 0;font-size:12px;font-weight:600}
        .completed-summary>summary::-webkit-details-marker{display:none}
        .completed-summary>summary::marker{display:none;content:""}
        .summary-chevron{margin-left:auto;font-size:18px;line-height:1;transition:transform .18s ease}
        .completed-summary[open] .summary-chevron{transform:rotate(90deg)}
        .completed-summary .summary-list{padding-top:12px}
        .completed-summary .summary-item{display:flex;align-items:flex-start;gap:9px;margin-bottom:8px;font-size:12px;line-height:1.5}
        .completed-summary .summary-item>span:first-child{flex:0 0 auto;opacity:.65}
        .generated-files{display:flex;flex-direction:column;gap:8px;margin-top:14px}
        .generated-file-link{display:inline-flex;align-items:center;gap:8px;width:fit-content;max-width:100%;padding:8px 11px;border:1px solid var(--border-color);border-radius:7px;text-decoration:none;font-size:12px;font-weight:600;overflow-wrap:anywhere}
        .generated-file-link:hover{text-decoration:none}
        .catalog-layout{display:grid;grid-template-columns:220px minmax(0,1fr);align-items:start;gap:28px}
        .catalog-filters{display:block;position:sticky;top:20px;padding:16px;border:1px solid #d7e0eb;border-radius:10px;background:#fff;box-shadow:0 6px 16px rgba(30,41,82,.045)}
        .catalog-filters-heading{margin-bottom:10px;font-size:15px;font-weight:700;color:#172033}
        .catalog-service-group{border-top:1px solid #edf1f5}
        .catalog-service-group-header{width:100%;display:flex;align-items:center;justify-content:space-between;border:0;background:transparent;cursor:pointer;padding:10px 0;font-size:13px;font-weight:600;color:#263449}
        .catalog-service-group-chevron{display:inline-flex;align-items:center;justify-content:center;font-size:18px;line-height:1;transition:transform .18s ease}
        .catalog-service-group-chevron.open{transform:rotate(90deg)}
        .catalog-service-group-options{display:flex;flex-direction:column;gap:2px;padding:0 0 8px}
        .catalog-filter-option{display:grid;grid-template-columns:16px minmax(0,1fr) auto;align-items:center;gap:8px;padding:6px 0;font-size:12px;color:#526176;cursor:pointer}
        .catalog-filter-option input{margin:0}
        .catalog-filter-option small{color:#8a96a8;font-size:11px}
        .file-upload-button{position:relative}
        .file-upload-tooltip{position:absolute;left:0;bottom:calc(100% + 10px);display:none;width:260px;padding:9px 11px;border:1px solid var(--border-color);border-radius:7px;background:#fff;box-shadow:0 6px 18px rgba(30,41,82,.12);font-size:11px;font-weight:600;color:#263449;line-height:1.4;z-index:20}
        .file-upload-tooltip small{font-size:10px;font-weight:400;color:#7a8799}
        .file-upload-button:hover .file-upload-tooltip,.file-upload-button:focus-within .file-upload-tooltip{display:block}
        @media (max-width:900px){.catalog-layout{grid-template-columns:180px minmax(0,1fr);gap:18px}}
        @media (max-width:650px){.catalog-layout{display:flex;flex-direction:column;gap:18px;margin-top:28px}.catalog-filters{position:static;width:100%}}
      `}</style>
      <Routes>
        <Route path="/" element={<Navigate to="/discover" replace />} />
        <Route path="/discover" element={<AgentApp />} />
        <Route path="/agent/:agentName" element={<AgentApp />} />
        <Route path="*" element={<Navigate to="/discover" replace />} />
      </Routes>
    </>
  );
}

export default function RootApp() {
  return <BrowserRouter><App /></BrowserRouter>;
}

