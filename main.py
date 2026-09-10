from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from azure.ai.projects import AIProjectClient
from azure.identity import DefaultAzureCredential
import json
import os
import tempfile

app = FastAPI(title="AI Agent API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PROJECT_ENDPOINT = "https://raghavk-8931-resource.services.ai.azure.com/api/projects/raghavk-8931"

project = AIProjectClient(
    endpoint=PROJECT_ENDPOINT,
    credential=DefaultAzureCredential(),
    allow_preview=True
)

ALLOWED_EXTENSIONS = {
    ".pdf", ".doc", ".docx", ".pptx", ".txt", ".json", ".md", ".html"
}

KNOWLEDGE_TOOL_TYPES = {
    "fabric_iq_preview",
    "work_iq_preview",
    "file_search",
    "web_search",
    "azure_ai_search",
    "bing_grounding",
    "bing_custom_search"
}

def send_event(event_type, data):
    return json.dumps({"event": event_type, **data}) + "\n"

def serialize_tool(tool):
    if hasattr(tool, "as_dict"):
        data = tool.as_dict()
    elif isinstance(tool, dict):
        data = tool
    else:
        data = {}

    if not data:
        data = {
            "type": getattr(tool, "type", None),
            "name": getattr(tool, "name", None)
        }

    return data

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

@app.get("/agents/{agent_name}/metadata")
def get_agent_metadata(agent_name: str):
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
            tool
            for tool in tools
            if get_tool_type(tool) in KNOWLEDGE_TOOL_TYPES
        ]

        action_tools = [
            tool
            for tool in tools
            if get_tool_type(tool) not in KNOWLEDGE_TOOL_TYPES
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
                "openapi": sum(
                    1 for tool in tools
                    if get_tool_type(tool) == "openapi"
                ),
                "mcp": sum(
                    1 for tool in tools
                    if get_tool_type(tool) == "mcp"
                ),
                "fabric_iq": sum(
                    1 for tool in tools
                    if get_tool_type(tool) == "fabric_iq_preview"
                ),
                "work_iq": sum(
                    1 for tool in tools
                    if get_tool_type(tool) == "work_iq_preview"
                ),
                "file_search": sum(
                    1 for tool in tools
                    if get_tool_type(tool) == "file_search"
                ),
                "web_search": sum(
                    1 for tool in tools
                    if get_tool_type(tool) == "web_search"
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
async def chat(
    agent: str = Form(...),
    message: str = Form(""),
    conversation_id: str | None = Form(None),
    vector_store_id: str | None = Form(None),
    file: UploadFile | None = File(None)
):
    async def generate():
        temp_path = None

        try:
            openai = project.get_openai_client(agent_name=agent)

            if conversation_id:
                current_conversation_id = conversation_id
            else:
                conversation = openai.conversations.create()
                current_conversation_id = conversation.id

            current_vector_store_id = vector_store_id

            if file:
                extension = os.path.splitext(file.filename or "")[1].lower()

                if extension not in ALLOWED_EXTENSIONS:
                    yield send_event("error", {
                        "message": f"Unsupported file type: {extension or 'unknown'}"
                    })
                    return

                file_bytes = await file.read()

                with tempfile.NamedTemporaryFile(
                    delete=False,
                    suffix=extension
                ) as temp_file:
                    temp_file.write(file_bytes)
                    temp_path = temp_file.name

                yield send_event("activity", {
                    "type": "file_upload",
                    "status": "in_progress",
                    "name": f"Uploading {file.filename}"
                })

                vector_store = openai.vector_stores.create(
                    name=f"portal-{agent}"
                )

                with open(temp_path, "rb") as file_handle:
                    openai.vector_stores.files.upload_and_poll(
                        vector_store_id=vector_store.id,
                        file=file_handle
                    )

                current_vector_store_id = vector_store.id

                yield send_event("activity", {
                    "type": "file_upload",
                    "status": "completed",
                    "name": f"{file.filename} ready"
                })

            extra_body = None

            if current_vector_store_id:
                extra_body = {
                    "structured_inputs": {
                        "vector_store_id": current_vector_store_id
                    }
                }

            response_stream = openai.responses.create(
                conversation=current_conversation_id,
                input=message or "Please analyze the uploaded document.",
                stream=True,
                extra_body=extra_body
            )

            for event in response_stream:
                event_type = getattr(event, "type", None)

                if event_type in {
                    "response.output_item.added",
                    "response.output_item.done"
                }:
                    item = getattr(event, "item", None)
                    print("ITEM TYPE:", getattr(item, "type", None))
                    print("ITEM:", item)

                if not event_type or event_type == "keepalive":
                    continue

                print("EVENT:", event_type)

                if event_type == "response.reasoning_summary_text.delta":
                    delta = getattr(event, "delta", None)

                    if delta:
                        yield send_event("reasoning", {
                            "delta": delta
                        })

                    continue

                if event_type == "response.output_item.added":
                    item = getattr(event, "item", None)

                    if item:
                        item_type = getattr(item, "type", None)

                        if item_type == "openapi_call":
                            yield send_event("activity", {
                                "type": "openapi_call",
                                "status": "in_progress",
                                "name": getattr(item, "name", None)
                            })

                        elif item_type == "openapi_call_output":
                            yield send_event("activity", {
                                "type": "openapi_call_output",
                                "status": "in_progress"
                            })

                    continue

                if event_type == "response.output_item.done":
                    item = getattr(event, "item", None)

                    if item:
                        item_type = getattr(item, "type", None)

                        if item_type == "openapi_call":
                            yield send_event("activity", {
                                "type": "openapi_call",
                                "status": "completed",
                                "name": getattr(item, "name", None)
                            })

                        elif item_type == "openapi_call_output":
                            yield send_event("activity", {
                                "type": "openapi_call_output",
                                "status": "completed"
                            })

                    continue

                if event_type == "response.output_text.delta":
                    delta = getattr(event, "delta", None)

                    if delta:
                        yield send_event("text", {
                            "delta": delta
                        })

                    continue

                if event_type in {
                    "response.mcp_call.in_progress",
                    "response.mcp_call.completed",
                    "response.mcp_call.failed",
                    "response.mcp_list_tools.in_progress",
                    "response.mcp_list_tools.completed",
                    "response.mcp_list_tools.failed",
                    "response.file_search_call.in_progress",
                    "response.file_search_call.completed",
                    "response.file_search_call.failed"
                }:
                    activity_data = {
                        "type": event_type,
                        "status": (
                            "completed"
                            if event_type.endswith(".completed")
                            else "failed"
                            if event_type.endswith(".failed")
                            else "in_progress"
                        )
                    }

                    for attribute in [
                        "item_id",
                        "output_index",
                        "server_label",
                        "name"
                    ]:
                        value = getattr(event, attribute, None)

                        if value is not None:
                            activity_data[attribute] = value

                    yield send_event("activity", activity_data)
                    continue

                if event_type == "response.completed":
                    yield send_event("completed", {
                        "conversation_id": current_conversation_id,
                        "vector_store_id": current_vector_store_id
                    })

                    continue

        except GeneratorExit:
            return

        except Exception as error:
            yield send_event("error", {
                "message": str(error),
                "error_type": type(error).__name__
            })

        finally:
            if temp_path and os.path.exists(temp_path):
                os.remove(temp_path)

    return StreamingResponse(
        generate(),
        media_type="application/x-ndjson"
    )