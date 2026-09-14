from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from azure.ai.projects import AIProjectClient
from azure.identity import DefaultAzureCredential
import json
import os
import tempfile
import threading
import urllib.request
import urllib.error
import urllib.parse
import uuid
import time

app = FastAPI(title="AI Agent API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PROJECT_ENDPOINT = "https://raghavk-8931-resource.services.ai.azure.com/api/projects/raghavk-8931"
SUMMARY_MODEL = os.getenv("SUMMARY_MODEL")
SEARCH_API_VERSION = "2026-04-01"
SEARCH_SCOPE = "https://search.azure.com/.default"

credential = DefaultAzureCredential()
project = AIProjectClient(endpoint=PROJECT_ENDPOINT, credential=credential, allow_preview=True)

DOCUMENT_EXTENSIONS = {".pdf", ".doc", ".docx",".ppt", ".pptx", ".txt", ".json", ".md", ".html"}
TABULAR_EXTENSIONS = {".csv", ".xlsx", ".xls"}
ALLOWED_EXTENSIONS = DOCUMENT_EXTENSIONS | TABULAR_EXTENSIONS

GENERATED_FILES_DIR = os.path.join(tempfile.gettempdir(), "ai-agent-generated-files")
os.makedirs(GENERATED_FILES_DIR, exist_ok=True)

GENERATED_FILES = {}
GENERATED_FILES_LOCK = threading.Lock()
CONVERSATION_FILES = {}
CONVERSATION_FILES_LOCK = threading.Lock()

def classify_extension(extension):
    if extension in DOCUMENT_EXTENSIONS:
        return "document"
    if extension in TABULAR_EXTENSIONS:
        return "tabular"
    return None

def get_conversation_files(conversation_id):
    empty = {"vector_store_id": None, "code_interpreter_file_id": None}
    if not conversation_id:
        return empty
    with CONVERSATION_FILES_LOCK:
        return dict(CONVERSATION_FILES.get(conversation_id, empty))

def set_conversation_files(conversation_id, files):
    with CONVERSATION_FILES_LOCK:
        CONVERSATION_FILES[conversation_id] = files

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
        data = {
            "type": getattr(tool, "type", None),
            "name": getattr(tool, "name", None),
            "description": getattr(tool, "description", None)
        }

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
        for attribute in [
            "delta",
            "item_id",
            "output_index",
            "sequence_number",
            "name",
            "server_label",
            "response",
            "item",
            "output",
            "code",
            "status",
            "arguments",
            "result",
            "annotations"
        ]:
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
        if data.get("type"):
            normalized.append(data)
    return normalized

KNOWLEDGE_TOOL_TYPES = {
    "fabric_iq_preview",
    "work_iq_preview",
    "azure_ai_search"
}

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
    values = " ".join([server_label, server_url, name, allowed_tools_text])

    return (
        "knowledge_base_retrieve" in values
        or "/knowledgebases/" in server_url
        or "knowledgebase" in values
        or "knowledge-base" in values
        or "knowledge_base" in values
    )

def extract_openapi_metadata(tool):
    metadata = {}
    raw_spec = tool.get("openapi") or tool.get("spec")
    spec = raw_spec

    if isinstance(raw_spec, str):
        try:
            spec = json.loads(raw_spec)
        except Exception:
            spec = None

    if isinstance(spec, dict):
        info = spec.get("info") or {}

        if info:
            metadata["title"] = info.get("title")
            metadata["description"] = info.get("description")
            metadata["version"] = info.get("version")

        operations = []

        for path, path_item in (spec.get("paths") or {}).items():
            if not isinstance(path_item, dict):
                continue

            for method, operation in path_item.items():
                if method.lower() not in {
                    "get",
                    "post",
                    "put",
                    "patch",
                    "delete",
                    "options",
                    "head"
                }:
                    continue

                if not isinstance(operation, dict):
                    continue

                operations.append({
                    "method": method.upper(),
                    "path": path,
                    "operation_id": operation.get("operationId"),
                    "summary": operation.get("summary"),
                    "description": operation.get("description")
                })

        if operations:
            metadata["operations"] = operations

    return {
        key: value
        for key, value in metadata.items()
        if value not in (None, "", [])
    }

def extract_kb_name_from_url(server_url):
    if not server_url:
        return None

    try:
        path = urllib.parse.urlparse(server_url).path.strip("/").split("/")
        for index, value in enumerate(path):
            if value.lower() == "knowledgebases" and index + 1 < len(path):
                return urllib.parse.unquote(path[index + 1])
    except Exception:
        pass

    return None

def get_http_error(error):
    body = ""

    try:
        body = error.read().decode("utf-8", errors="replace")
    except Exception:
        pass

    parsed_body = body

    try:
        parsed_body = json.loads(body)
    except Exception:
        pass

    return {
        "status_code": getattr(error, "code", None),
        "reason": str(getattr(error, "reason", "")),
        "body": parsed_body
    }

def search_request(url, method="GET"):
    token = credential.get_token(SEARCH_SCOPE).token

    request = urllib.request.Request(
        url,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json;odata.metadata=minimal",
            "x-ms-client-request-id": str(uuid.uuid4())
        }
    )

    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as error:
        details = get_http_error(error)
        print("SEARCH API ERROR:", json.dumps(details, default=str))
        raise

def get_knowledge_base_metadata(server_url, name):
    fallback = {"name": name, "description": None}

    if not server_url or not name:
        return fallback

    parsed = urllib.parse.urlparse(server_url)
    endpoint = f"{parsed.scheme}://{parsed.netloc}"
    encoded_name = urllib.parse.quote(name, safe="")

    get_url = (
        f"{endpoint}/knowledgebases('{encoded_name}')"
        f"?api-version={SEARCH_API_VERSION}"
    )

    try:
        data = search_request(get_url)
        result = {
            "name": data.get("name") or name,
            "description": data.get("description")
        }

        if result["description"]:
            return result

    except Exception as error:
        print(
            f"KB GET ERROR for '{name}':",
            type(error).__name__,
            str(error)
        )

    try:
        list_url = f"{endpoint}/knowledgebases?api-version={SEARCH_API_VERSION}"
        data = search_request(list_url)

        for item in data.get("value", []):
            if not isinstance(item, dict):
                continue

            item_name = item.get("name")

            if item_name and item_name.lower() == name.lower():
                return {
                    "name": item_name,
                    "description": item.get("description")
                }

    except Exception as error:
        print(
            f"KB LIST ERROR for '{name}':",
            type(error).__name__,
            str(error)
        )

    return fallback

def enrich_tool_metadata(tool):
    data = dict(tool)
    tool_type = get_tool_type(data)

    if tool_type == "openapi":
        metadata = extract_openapi_metadata(data)
        data["description"] = data.get("description") or metadata.get("description")
        data["metadata"] = metadata
        return data

    if tool_type == "mcp":
        server_url = data.get("server_url")
        name = data.get("name") or extract_kb_name_from_url(server_url)

        if is_knowledge_base_tool(data):
            kb_name = extract_kb_name_from_url(server_url) or name
            kb_metadata = get_knowledge_base_metadata(server_url, kb_name)

            data["name"] = kb_metadata.get("name") or kb_name
            data["description"] = (
                data.get("description")
                or kb_metadata.get("description")
            )
            data["metadata"] = {"knowledge_base": kb_metadata}
            return data

        data["name"] = name or data.get("server_label") or "mcp"
        data["metadata"] = {}
        return data

    data["name"] = data.get("name") or tool_type
    data["description"] = data.get("description")
    data["metadata"] = data.get("metadata") or {}
    return data

def extract_text_from_event(event_data):
    if event_data.get("type") == "response.output_text.delta":
        return event_data.get("delta") or ""
    return ""

def find_file_citations(value):
    found = []

    if isinstance(value, dict):
        if value.get("type") == "container_file_citation":
            found.append(value)

        for child in value.values():
            found.extend(find_file_citations(child))

    elif isinstance(value, list):
        for child in value:
            found.extend(find_file_citations(child))

    return found

def extract_generated_file_citations(event, serialized):
    citations = find_file_citations(serialized)

    if citations:
        return citations

    try:
        if hasattr(event, "model_dump"):
            return find_file_citations(
                event.model_dump(mode="json", exclude_none=True)
            )

        if hasattr(event, "as_dict"):
            return find_file_citations(event.as_dict())

    except Exception:
        pass

    return []

def get_generated_file_bytes(openai_client, file_id, container_id):
    last_error = None

    for attempt in range(5):
        try:
            if attempt:
                time.sleep(min(2 ** attempt, 5))

            content = openai_client.containers.files.content.retrieve(
                file_id=file_id,
                container_id=container_id
            )

            if hasattr(content, "read"):
                return content.read()

            if isinstance(content, bytes):
                return content

            if hasattr(content, "content"):
                return content.content

            if hasattr(content, "read_bytes"):
                return content.read_bytes()

            raise RuntimeError("Unable to read generated file content.")

        except Exception as error:
            last_error = error
            print(
                f"GENERATED FILE RETRIEVE RETRY {attempt + 1}/5:",
                type(error).__name__,
                str(error)
            )

    raise last_error or RuntimeError("Generated file retrieval failed.")

def save_generated_file(openai_client, citation):
    file_id = citation.get("file_id")
    container_id = citation.get("container_id")
    filename = citation.get("filename") or "generated_file"

    if not file_id or not container_id:
        return None

    safe_filename = os.path.basename(filename)
    download_id = str(uuid.uuid4())
    file_path = os.path.join(
        GENERATED_FILES_DIR,
        f"{download_id}_{safe_filename}"
    )

    file_bytes = get_generated_file_bytes(
        openai_client,
        file_id,
        container_id
    )

    with open(file_path, "wb") as output_file:
        output_file.write(file_bytes)

    with GENERATED_FILES_LOCK:
        GENERATED_FILES[download_id] = {
            "path": file_path,
            "filename": safe_filename,
            "file_id": file_id,
            "container_id": container_id
        }

    return {
        "download_id": download_id,
        "filename": safe_filename,
        "download_url": f"/files/{download_id}"
    }

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

def get_agent_definition(agent_name):
    versions = list(
        project.agents.list_versions(
            agent_name=agent_name,
            limit=1,
            order="desc"
        )
    )

    if not versions:
        return None

    latest = versions[0]
    version = getattr(latest, "version", None)

    if version is None and isinstance(latest, dict):
        version = latest.get("version")

    if version is None:
        return None

    agent_version = project.agents.get_version(
        agent_name=agent_name,
        agent_version=version
    )

    definition = getattr(agent_version, "definition", None)

    if definition is None and isinstance(agent_version, dict):
        definition = agent_version.get("definition")

    if hasattr(definition, "as_dict"):
        definition = definition.as_dict()
    elif hasattr(definition, "model_dump"):
        definition = definition.model_dump(exclude_none=True)

    return definition or {}

def get_runtime_tool_capabilities(agent_name):
    definition = get_agent_definition(agent_name)
    tools = normalize_tools(
        definition.get("tools", [])
        if isinstance(definition, dict)
        else []
    )

    return {
        "file_search": any(
            get_tool_type(tool) == "file_search"
            for tool in tools
        ),
        "code_interpreter": any(
            get_tool_type(tool) == "code_interpreter"
            for tool in tools
        )
    }

def upload_runtime_file(openai_client, file_bytes, file_name, file_kind, needs_file_search, needs_code_interpreter):
    extension = os.path.splitext(file_name)[1].lower()

    with tempfile.NamedTemporaryFile(
        delete=False,
        suffix=extension
    ) as temp_file:
        temp_file.write(file_bytes)
        temp_path = temp_file.name

    try:
        uploaded_file_id = None
        vector_store_id = None

        if needs_code_interpreter:
            with open(temp_path, "rb") as file_handle:
                uploaded_file = openai_client.files.create(
                    purpose="assistants",
                    file=file_handle
                )

            uploaded_file_id = uploaded_file.id

        if needs_file_search:
            vector_store = openai_client.vector_stores.create(
                name=f"portal-runtime-{uuid.uuid4().hex[:8]}"
            )

            with open(temp_path, "rb") as file_handle:
                openai_client.vector_stores.files.upload_and_poll(
                    vector_store_id=vector_store.id,
                    file=file_handle
                )

            vector_store_id = vector_store.id

        return uploaded_file_id, vector_store_id

    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

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
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list agents: {str(error)}"
        )

@app.get("/files/{download_id}")
def download_generated_file(download_id):
    with GENERATED_FILES_LOCK:
        file_info = GENERATED_FILES.get(download_id)

    if not file_info:
        raise HTTPException(
            status_code=404,
            detail="Generated file not found or expired."
        )

    file_path = file_info["path"]

    if not os.path.exists(file_path):
        with GENERATED_FILES_LOCK:
            GENERATED_FILES.pop(download_id, None)

        raise HTTPException(
            status_code=404,
            detail="Generated file is no longer available."
        )

    return FileResponse(
        path=file_path,
        filename=file_info["filename"],
        content_disposition_type="attachment"
    )

@app.get("/agents/{agent_name}/metadata")
def get_agent_metadata(agent_name):
    try:
        versions = list(
            project.agents.list_versions(
                agent_name=agent_name,
                limit=100,
                order="desc"
            )
        )

        if not versions:
            raise HTTPException(
                status_code=404,
                detail=f"No versions found for agent '{agent_name}'"
            )

        latest = versions[0]
        version = getattr(latest, "version", None)

        if version is None and isinstance(latest, dict):
            version = latest.get("version")

        if version is None:
            raise HTTPException(
                status_code=500,
                detail=f"Could not determine version for agent '{agent_name}'"
            )

        agent_version = project.agents.get_version(
            agent_name=agent_name,
            agent_version=version
        )

        definition = getattr(agent_version, "definition", None)

        if definition is None and isinstance(agent_version, dict):
            definition = agent_version.get("definition")

        if definition is None:
            raise HTTPException(
                status_code=404,
                detail=f"No definition found for agent '{agent_name}' version '{version}'"
            )

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
        enriched_tools = [enrich_tool_metadata(tool) for tool in tools]

        knowledge_sources = [
            tool for tool in enriched_tools
            if is_knowledge_base_tool(tool)
        ]

        action_tools = [
            tool for tool in enriched_tools
            if not is_knowledge_base_tool(tool)
        ]

        return {
            "name": agent_name,
            "version": version,
            "description": getattr(agent_version, "description", None),
            "model": model,
            "tools": enriched_tools,
            "knowledge_sources": knowledge_sources,
            "action_tools": action_tools,
            "tool_counts": {
                "total": len(enriched_tools),
                "knowledge_sources": len(knowledge_sources),
                "action_tools": len(action_tools),
                "openapi": sum(
                    1 for tool in enriched_tools
                    if get_tool_type(tool) == "openapi"
                ),
                "mcp": sum(
                    1 for tool in enriched_tools
                    if get_tool_type(tool) == "mcp"
                ),
                "fabric_iq": sum(
                    1 for tool in enriched_tools
                    if get_tool_type(tool) == "fabric_iq_preview"
                ),
                "work_iq": sum(
                    1 for tool in enriched_tools
                    if get_tool_type(tool) == "work_iq_preview"
                ),
                "file_search": sum(
                    1 for tool in enriched_tools
                    if get_tool_type(tool) == "file_search"
                ),
                "web_search": sum(
                    1 for tool in enriched_tools
                    if get_tool_type(tool) == "web_search"
                ),
                "code_interpreter": sum(
                    1 for tool in enriched_tools
                    if get_tool_type(tool) == "code_interpreter"
                )
            },
            "definition": definition_data
        }

    except HTTPException:
        raise

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve agent metadata: {str(error)}"
        )

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
    file_kind = None

    if file:
        file_name = file.filename or ""
        file_extension = os.path.splitext(file_name)[1].lower()
        file_kind = classify_extension(file_extension)

        if file_kind is None:
            return StreamingResponse(
                iter([
                    send_event(
                        "error",
                        {
                            "message": f"Unsupported file type: {file_extension or 'unknown'}"
                        }
                    )
                ]),
                media_type="application/x-ndjson"
            )

        file_bytes = file.file.read()

    def generate():
        response_text = ""
        event_types = []
        generated_files = []

        try:
            openai = project.get_openai_client()

            if conversation_id:
                current_conversation_id = conversation_id
            else:
                conversation = openai.conversations.create()
                current_conversation_id = conversation.id

            conversation_files = get_conversation_files(
                current_conversation_id
            )

            if vector_store_id:
                conversation_files["vector_store_id"] = vector_store_id

            capabilities = get_runtime_tool_capabilities(agent)

            current_vector_store_id = conversation_files.get("vector_store_id")
            current_code_interpreter_file_id = conversation_files.get(
                "code_interpreter_file_id"
            )

            if file_bytes is not None:
                yield send_event(
                    "activity",
                    {
                        "type": "file_upload",
                        "status": "in_progress",
                        "name": f"Uploading {file_name}"
                    }
                )

                uploaded_file_id, runtime_vector_store_id = upload_runtime_file(
                    openai,
                    file_bytes,
                    file_name,
                    file_kind,
                    capabilities["file_search"],
                    capabilities["code_interpreter"]
                )

                if runtime_vector_store_id:
                    current_vector_store_id = runtime_vector_store_id

                if uploaded_file_id:
                    current_code_interpreter_file_id = uploaded_file_id

                conversation_files["vector_store_id"] = current_vector_store_id
                conversation_files["code_interpreter_file_id"] = (
                    current_code_interpreter_file_id
                )

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

            structured_inputs = {}

            if (
                capabilities["file_search"]
                and current_vector_store_id
            ):
                structured_inputs["vector_store_id"] = current_vector_store_id

            if (
                capabilities["code_interpreter"]
                and current_code_interpreter_file_id
            ):
                structured_inputs["code_interpreter_file_id"] = (
                    current_code_interpreter_file_id
                )

            extra_body = {
                "agent_reference": {
                    "type": "agent_reference",
                    "name": agent
                }
            }

            if structured_inputs:
                extra_body["structured_inputs"] = structured_inputs

            response_stream = openai.responses.create(
                conversation=current_conversation_id,
                input=message or "Please analyze the uploaded file.",
                stream=True,
                extra_body=extra_body
            )

            for event in response_stream:
                event_type = getattr(event, "type", None)

                if not event_type or event_type == "keepalive":
                    continue

                event_types.append(event_type)
                print("EVENT:", event_type)

                serialized = serialize_response_event(event)

                response_text += extract_text_from_event(serialized)

                citations = extract_generated_file_citations(
                    event,
                    serialized
                )

                for citation in citations:
                    file_id = citation.get("file_id")
                    container_id = citation.get("container_id")
                    filename = citation.get("filename")

                    if not file_id or not container_id:
                        continue

                    if any(
                        item.get("file_id") == file_id
                        for item in generated_files
                    ):
                        continue

                    try:
                        generated_file = save_generated_file(
                            openai,
                            citation
                        )

                        if generated_file:
                            generated_file["file_id"] = file_id
                            generated_file["container_id"] = container_id
                            generated_files.append(generated_file)

                            yield send_event(
                                "generated_file",
                                generated_file
                            )

                    except Exception as error:
                        print(
                            "GENERATED FILE ERROR:",
                            type(error).__name__,
                            str(error)
                        )

                        yield send_event(
                            "generated_file_error",
                            {
                                "filename": filename,
                                "message": str(error)
                            }
                        )

                yield json.dumps(
                    serialized,
                    default=str
                ) + "\n"

                if event_type == "response.completed":
                    summary = create_summary(
                        openai,
                        message or "Please analyze the uploaded file.",
                        response_text,
                        event_types
                    )

                    if summary:
                        yield send_event(
                            "summary",
                            {"summary": summary}
                        )

                    yield send_event(
                        "completed",
                        {
                            "conversation_id": current_conversation_id,
                            "vector_store_id": conversation_files.get(
                                "vector_store_id"
                            ),
                            "code_interpreter_file_id": conversation_files.get(
                                "code_interpreter_file_id"
                            ),
                            "generated_files": generated_files
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

    return StreamingResponse(
        generate(),
        media_type="application/x-ndjson"
    )
