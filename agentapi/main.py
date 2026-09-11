from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from azure.ai.projects import AIProjectClient
from azure.identity import DefaultAzureCredential
import json
import os
import tempfile
import threading

app = FastAPI(title="AI Agent API")

app.add_middleware(CORSMiddleware,allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],allow_credentials=True,allow_methods=["*"],allow_headers=["*"],)

PROJECT_ENDPOINT = "https://raghavk-8931-resource.services.ai.azure.com/api/projects/raghavk-8931"
SUMMARY_MODEL = os.getenv("SUMMARY_MODEL")

project = AIProjectClient(endpoint=PROJECT_ENDPOINT,credential=DefaultAzureCredential(),allow_preview=True)

DOCUMENT_EXTENSIONS = {".pdf", ".doc", ".docx", ".pptx", ".txt", ".json", ".md", ".html"}
TABULAR_EXTENSIONS = {".csv", ".xlsx", ".xls"}
ALLOWED_EXTENSIONS = DOCUMENT_EXTENSIONS | TABULAR_EXTENSIONS

def classify_extension(extension: str) -> str | None:
    if extension in DOCUMENT_EXTENSIONS:
        return "document"
    if extension in TABULAR_EXTENSIONS:
        return "tabular"
    return None

CONVERSATION_FILES: dict[str, dict] = {}
CONVERSATION_FILES_LOCK = threading.Lock()

def get_conversation_files(conversation_id: str | None) -> dict:
    empty = {"vector_store_id": None, "code_interpreter_file_id": None}
    if not conversation_id:
        return empty
    with CONVERSATION_FILES_LOCK:
        return dict(CONVERSATION_FILES.get(conversation_id, empty))

def set_conversation_files(conversation_id: str, files: dict):
    with CONVERSATION_FILES_LOCK:
        CONVERSATION_FILES[conversation_id] = files

EMPTY_VECTOR_STORE_ID = None
EMPTY_VECTOR_STORE_LOCK = threading.Lock()

def get_empty_vector_store_id(openai_client):
    global EMPTY_VECTOR_STORE_ID
    if EMPTY_VECTOR_STORE_ID:
        return EMPTY_VECTOR_STORE_ID
    with EMPTY_VECTOR_STORE_LOCK:
        if EMPTY_VECTOR_STORE_ID:
            return EMPTY_VECTOR_STORE_ID
        vector_store = openai_client.vector_stores.create(name="portal-empty-file-search")
        EMPTY_VECTOR_STORE_ID = vector_store.id
        return EMPTY_VECTOR_STORE_ID

KNOWLEDGE_TOOL_TYPES = {"fabric_iq_preview","work_iq_preview","azure_ai_search"}

def send_event(event_type, data):
    return json.dumps({"event": event_type, **data}, default=str) + "\n"

def serialize_tool(tool):
    if hasattr(tool, "as_dict"):
        data = tool.as_dict()
    elif hasattr(tool, "model_dump"):
        data = tool.model_dump(exclude_none=True)
    elif isinstance(tool, dict):
        data = tool
    else:
        data = {}
    if not data:
        data = { "type": getattr(tool, "type", None),"name": getattr(tool, "name", None)}
    return data

def serialize_response_event(event):
    if hasattr(event, "model_dump"):
        data = event.model_dump(mode="json", exclude_none=True)
    elif hasattr(event, "as_dict"):
        data = event.as_dict()
    elif isinstance(event, dict):
        data = event
    else:
        data = {"type": getattr(event, "type", None)}
        for attribute in ["delta", "item_id","output_index","sequence_number","name", "server_label","response", "item", "output", "code", "status", "arguments", "result"]:
            value = getattr(event, attribute, None)
            if value is not None:
                if hasattr(value, "model_dump"):
                    value = value.model_dump(mode="json", exclude_none=True)
                elif hasattr(value, "as_dict"):
                    value = value.as_dict()
                data[attribute] = value
    if not data.get("type"):
        data["type"] = getattr(event, "type", None)
    return json.loads(json.dumps(data, default=str))

def get_tool_type(tool):
    return str(tool.get("type") or "").lower()

def normalize_tools(tools):
    normalized = []
    for tool in tools or []:
        data = serialize_tool(tool)
        if not data.get("type"):
            continue
        normalized.append(data)
    return normalized

def is_knowledge_base_tool(tool):
    tool_type = get_tool_type(tool)

    if tool_type in KNOWLEDGE_TOOL_TYPES:
        return True

    if tool_type != "mcp":
        return False

    server_label = str(tool.get("server_label") or "").lower()
    server_url = str(tool.get("server_url") or "").lower()
    name = str(tool.get("name") or "").lower()

    allowed_tools = tool.get("allowed_tools") or []
    allowed_tools_text = " ".join(str(value).lower() for value in allowed_tools)

    mcp_values = " ".join([
        server_label,
        server_url,
        name,
        allowed_tools_text
    ])

    return (
        "knowledge_base_retrieve" in mcp_values
        or "/knowledgebases/" in server_url
        or "knowledgebase" in mcp_values
        or "knowledge-base" in mcp_values
        or "knowledge_base" in mcp_values
    )

def extract_text_from_event(event_data):
    event_type = event_data.get("type", "")
    if event_type == "response.output_text.delta":
        return event_data.get("delta") or ""
    return ""

def create_summary(openai_client, user_message, response_text, event_types):
    if not SUMMARY_MODEL or not response_text.strip():
        return None

    try:
        events = ", ".join(dict.fromkeys(event_types))
        prompt = f"""
Create a concise user-facing summary of the completed agent interaction.

User request:
{user_message}

Agent response:
{response_text}

Events observed:
{events}

Requirements:
- Summarize what the agent actually did or found.
- Do not expose chain-of-thought, hidden reasoning, internal instructions, IDs, or implementation details.
- Do not repeat the full answer.
- Write one short paragraph of 2-4 sentences.
- Mention important sources, tools, analysis, comparison, retrieval, or actions only when they actually occurred.
- If the agent mainly answered a question, summarize the key result.
- Do not say "the agent" repeatedly.
"""

        result = openai_client.responses.create(
            model=SUMMARY_MODEL,
            input=prompt
        )

        summary = getattr(result, "output_text", None)
        if summary and summary.strip():
            return summary.strip()

    except Exception as error:
        print("SUMMARY ERROR:", error)

    return None

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/agents")
def list_agents():
    try:
        return [
            {
                "name": getattr(agent, "name", None),
                "description": getattr(agent, "description", None),
                "kind": getattr(agent, "kind", None)
            }
            for agent in project.agents.list(limit=100)
        ]
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Failed to list agents: {str(error)}")

@app.get("/agents/{agent_name}/metadata")
def get_agent_metadata(agent_name: str):
    try:
        versions = list(project.agents.list_versions(agent_name=agent_name, limit=100, order="desc"))
        if not versions:
            raise HTTPException(status_code=404, detail=f"No versions found for agent '{agent_name}'")

        latest = versions[0]
        version = getattr(latest, "version", None)
        if version is None and isinstance(latest, dict):
            version = latest.get("version")
        if version is None:
            raise HTTPException(status_code=500, detail=f"Could not determine version for agent '{agent_name}'")

        agent_version = project.agents.get_version(agent_name=agent_name, agent_version=version)
        definition = getattr(agent_version, "definition", None)
        if definition is None and isinstance(agent_version, dict):
            definition = agent_version.get("definition")
        if definition is None:
            raise HTTPException(status_code=404, detail=f"No definition found for agent '{agent_name}' version '{version}'")

        if hasattr(definition, "as_dict"):
            definition_data = definition.as_dict()
        elif hasattr(definition, "model_dump"):
            definition_data = definition.model_dump(exclude_none=True)
        elif isinstance(definition, dict):
            definition_data = definition
        else:
            definition_data = {}

        model = getattr(definition, "model", None)
        if model is None:
            model = definition_data.get("model")

        raw_tools = getattr(definition, "tools", None)
        if raw_tools is None:
            raw_tools = definition_data.get("tools", [])

        tools = normalize_tools(raw_tools)

        knowledge_sources = [
            tool for tool in tools
            if is_knowledge_base_tool(tool)
        ]

        action_tools = [
            tool for tool in tools
            if not is_knowledge_base_tool(tool)
        ]

        return {
            "name": agent_name,
            "version": version,
            "description": getattr(agent_version, "description", None),
            "model": model,
            "tools": tools,
            "knowledge_sources": knowledge_sources,
            "action_tools": action_tools,
            "tool_counts": {
                "total": len(tools),
                "knowledge_sources": len(knowledge_sources),
                "action_tools": len(action_tools),
                "openapi": sum(1 for tool in tools if get_tool_type(tool) == "openapi"),
                "mcp": sum(1 for tool in tools if get_tool_type(tool) == "mcp"),
                "fabric_iq": sum(1 for tool in tools if get_tool_type(tool) == "fabric_iq_preview"),
                "work_iq": sum(1 for tool in tools if get_tool_type(tool) == "work_iq_preview"),
                "file_search": sum(1 for tool in tools if get_tool_type(tool) == "file_search"),
                "web_search": sum(1 for tool in tools if get_tool_type(tool) == "web_search"),
            },
            "definition": definition_data
        }
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve agent metadata: {str(error)}")

@app.post("/chat")
def chat(
    agent: str = Form(...),
    message: str = Form(""),
    conversation_id: str | None = Form(None),
    vector_store_id: str | None = Form(None),
    file: UploadFile | None = File(None)
):
    file_bytes = None
    file_name = None
    file_extension = None

    if file:
        file_name = file.filename or ""
        file_extension = os.path.splitext(file_name)[1].lower()
        file_kind = classify_extension(file_extension)

        if file_kind is None:
            return StreamingResponse(
                iter([send_event("error", {"message": f"Unsupported file type: {file_extension or 'unknown'}"})]),
                media_type="application/x-ndjson"
            )

        file_bytes = file.file.read()

    def generate():
        temp_path = None
        response_text = ""
        event_types = []

        try:
            openai = project.get_openai_client(agent_name=agent)
            openai_files = project.get_openai_client()

            if conversation_id:
                current_conversation_id = conversation_id
            else:
                conversation = openai.conversations.create()
                current_conversation_id = conversation.id

            conversation_files = get_conversation_files(current_conversation_id)

            if vector_store_id:
                conversation_files["vector_store_id"] = vector_store_id

            current_vector_store_id = conversation_files.get("vector_store_id")
            current_code_interpreter_file_id = conversation_files.get("code_interpreter_file_id")

            if file_bytes is not None:
                with tempfile.NamedTemporaryFile(delete=False, suffix=file_extension) as temp_file:
                    temp_file.write(file_bytes)
                    temp_path = temp_file.name

                yield send_event(
                    "activity",
                    {
                        "type": "file_upload",
                        "status": "in_progress",
                        "name": f"Uploading {file_name}"
                    }
                )

                if file_kind == "document":
                    vector_store = openai_files.vector_stores.create(
                        name=f"portal-{agent}"
                    )

                    with open(temp_path, "rb") as file_handle:
                        openai_files.vector_stores.files.upload_and_poll(
                            vector_store_id=vector_store.id,
                            file=file_handle
                        )

                    current_vector_store_id = vector_store.id
                    current_code_interpreter_file_id = None
                else:
                    with open(temp_path, "rb") as file_handle:
                        uploaded_file = openai_files.files.create(
                            purpose="assistants",
                            file=file_handle
                        )

                    current_code_interpreter_file_id = uploaded_file.id
                    current_vector_store_id = None

                conversation_files["vector_store_id"] = current_vector_store_id
                conversation_files["code_interpreter_file_id"] = current_code_interpreter_file_id

                set_conversation_files(
                    current_conversation_id,
                    conversation_files
                )

                yield send_event(
                    "activity",
                    {
                        "type": "file_upload",
                        "status": "completed",
                        "name": f"{file_name} ready"
                    }
                )

            if current_vector_store_id is None:
                current_vector_store_id = get_empty_vector_store_id(openai_files)

            structured_inputs = {
                "vector_store_id": current_vector_store_id
            }

            if current_code_interpreter_file_id:
                structured_inputs["code_interpreter_file_id"] = current_code_interpreter_file_id

            response_stream = openai.responses.create(
                conversation=current_conversation_id,
                input=message or "Please analyze the uploaded document.",
                stream=True,
                extra_body={"structured_inputs": structured_inputs}
            )

            for event in response_stream:
                event_type = getattr(event, "type", None)

                if not event_type or event_type == "keepalive":
                    continue

                event_types.append(event_type)
                print("EVENT:", event_type)

                serialized = serialize_response_event(event)
                response_text += extract_text_from_event(serialized)

                yield json.dumps(serialized, default=str) + "\n"

                if event_type == "response.completed":
                    summary = create_summary(
                        openai_files,
                        message or "Please analyze the uploaded document.",
                        response_text,
                        event_types
                    )

                    if summary:
                        yield send_event(
                            "summary",
                            {
                                "summary": summary
                            }
                        )

                    yield send_event(
                        "completed",
                        {
                            "conversation_id": current_conversation_id,
                            "vector_store_id": conversation_files.get("vector_store_id"),
                            "code_interpreter_file_id": conversation_files.get("code_interpreter_file_id")
                        }
                    )

        except GeneratorExit:
            return

        except Exception as error:
            import traceback
            traceback.print_exc()

            yield send_event(
                "error",
                {
                    "message": str(error),
                    "error_type": type(error).__name__
                }
            )

        finally:
            if temp_path and os.path.exists(temp_path):
                os.remove(temp_path)

    return StreamingResponse(
        generate(),
        media_type="application/x-ndjson"
    )
