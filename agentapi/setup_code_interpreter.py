import argparse
import copy
import json
import os

import requests
from azure.ai.projects import AIProjectClient
from azure.identity import DefaultAzureCredential

PROJECT_ENDPOINT = "https://raghavk-8931-resource.services.ai.azure.com/api/projects/raghavk-8931"
API_VERSION = "v1"

# Confirm the exact, case-sensitive Foundry agent name for each entry below
# before running. "RetailInfo" returned "No versions found" when tested -
# find its real name first (see the note at the bottom of this file).
AGENT_NAMES = [
    "Tender-agent",
    "productcomparison",
    "email-teams-extractor",
    "retailinfo"
]

# ---------------------------------------------------------------------------
# Keep-alive vector store
#
# Azure requires File Search's `vector_store_ids` array to have at least 1
# item, always - even on a plain message with no file attached. Our
# structured-input placeholder resolves to an empty string when no file was
# uploaded, and Azure automatically strips empty strings from that array.
# With only the placeholder in the array, stripping it leaves a 0-length
# array, which Azure then rejects with an "empty_array" error.
#
# The fix: keep one permanent, harmless, always-present vector store ID in
# the array alongside the placeholder, so stripping the placeholder still
# leaves an array of length 1. This script creates that one empty vector
# store once and reuses the same ID on every run (cached in
# .keepalive_vector_store_id next to this script).
# ---------------------------------------------------------------------------

KEEPALIVE_CACHE_FILE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), ".keepalive_vector_store_id"
)
KEEPALIVE_STORE_NAME = "structured-input-keepalive"


def ensure_keepalive_vector_store(project: AIProjectClient) -> str:
    """Return the ID of a permanent, empty vector store, creating it once
    if it doesn't exist yet, and caching the ID locally so re-runs reuse
    the same one instead of creating a new one every time."""

    if os.path.exists(KEEPALIVE_CACHE_FILE):
        with open(KEEPALIVE_CACHE_FILE, "r") as cache_file:
            cached_id = cache_file.read().strip()
            if cached_id:
                return cached_id

    openai_files = project.get_openai_client()
    vector_store = openai_files.vector_stores.create(name=KEEPALIVE_STORE_NAME)

    with open(KEEPALIVE_CACHE_FILE, "w") as cache_file:
        cache_file.write(vector_store.id)

    print(f"  Created keep-alive vector store: {vector_store.id}")
    return vector_store.id


FILE_SEARCH_TOOL_TEMPLATE = {
    "type": "file_search",
    "vector_store_ids": ["{{vector_store_id}}"],  # keep-alive id is prepended at runtime
}

# How many spreadsheet files a conversation can hold onto at once. Must
# match CODE_INTERPRETER_SLOT_COUNT in main.py.
CODE_INTERPRETER_SLOT_COUNT = 3
CODE_INTERPRETER_SLOT_NAMES = [
    f"code_interpreter_file_id_{i + 1}" for i in range(CODE_INTERPRETER_SLOT_COUNT)
]

CODE_INTERPRETER_TOOL = {
    "type": "code_interpreter",
    "container": {
        "type": "auto",
        "file_ids": [f"{{{{{name}}}}}" for name in CODE_INTERPRETER_SLOT_NAMES],
    },
}

STRUCTURED_INPUTS_ADDITIONS = {
    "vector_store_id": {
        "description": "Vector store ID for uploaded documents (pdf, docx, pptx, txt, md, html)",
        "required": False,
        "default_value": "",
        "schema": {"type": "string"},
    },
    **{
        name: {
            "description": f"File ID for uploaded spreadsheet slot {i + 1} (csv, xlsx, xls)",
            "required": False,
            "default_value": "",
            "schema": {"type": "string"},
        }
        for i, name in enumerate(CODE_INTERPRETER_SLOT_NAMES)
    },
}


def get_current_definition(project: AIProjectClient, agent_name: str) -> dict | None:
    """Same read pattern as get_agent_metadata() in main.py: fetch the
    latest version, then its full definition, as a plain dict."""

    versions = list(
        project.agents.list_versions(agent_name=agent_name, limit=1, order="desc")
    )

    if not versions:
        return None

    latest = versions[0]
    version = getattr(latest, "version", None)
    if version is None and isinstance(latest, dict):
        version = latest.get("version")

    agent_version = project.agents.get_version(
        agent_name=agent_name, agent_version=version
    )

    definition = getattr(agent_version, "definition", None)
    if definition is None and isinstance(agent_version, dict):
        definition = agent_version.get("definition")

    if hasattr(definition, "as_dict"):
        return definition.as_dict()

    return definition


def build_updated_definition(definition: dict, keepalive_vector_store_id: str) -> dict:
    """Return a copy of `definition` with the vector_store_id / code_interpreter_file_id
    placeholders wired into whatever File Search / Code Interpreter tools already
    exist, adding a fresh tool only if one isn't present at all.

    Every file_search tool's vector_store_ids keeps the {{vector_store_id}}
    placeholder plus at least one permanent, always-present ID, so the
    array never drops below length 1 when no file is attached:
      - If the tool already has its own permanent vector store (e.g. an
        agent's existing knowledge base), that ID is kept as-is and the
        keep-alive is NOT added (Azure caps File Search at 2 vector
        stores total, so adding a redundant keep-alive on top of an
        existing real one would push a file-attached request over that
        cap).
      - If the tool has no permanent ID of its own (only the placeholder,
        or nothing), the shared keep-alive ID is used instead."""

    updated = copy.deepcopy(definition)
    tools = updated.get("tools", [])

    file_search_tools = [t for t in tools if t.get("type") == "file_search"]
    if file_search_tools:
        for tool in file_search_tools:
            ids = tool.get("vector_store_ids") or []

            # IDs that are neither our placeholder nor our own keep-alive -
            # i.e. a real, pre-existing vector store this agent already had.
            own_permanent_ids = [
                i for i in ids
                if i != "{{vector_store_id}}" and i != keepalive_vector_store_id
            ]

            if own_permanent_ids:
                if len(own_permanent_ids) > 1:
                    print(
                        f"  WARNING: this tool already has {len(own_permanent_ids)} "
                        "permanent vector stores, which is already at/over Azure's "
                        "2-store cap. Leaving as-is - dynamic file upload may not "
                        "work for this agent without manually freeing a slot."
                    )
                    tool["vector_store_ids"] = own_permanent_ids
                    continue

                new_ids = own_permanent_ids + ["{{vector_store_id}}"]
                print(
                    f"  kept existing permanent vector store {own_permanent_ids[0]}, "
                    "added {{vector_store_id}} placeholder (no keep-alive needed)"
                )
            else:
                new_ids = [keepalive_vector_store_id, "{{vector_store_id}}"]
                print("  no permanent vector store found - using shared keep-alive id")

            tool["vector_store_ids"] = new_ids
    else:
        new_tool = copy.deepcopy(FILE_SEARCH_TOOL_TEMPLATE)
        new_tool["vector_store_ids"] = [
            keepalive_vector_store_id,
            "{{vector_store_id}}",
        ]
        tools.append(new_tool)
        print("  added new file_search tool")

    code_interpreter_tools = [t for t in tools if t.get("type") == "code_interpreter"]
    if code_interpreter_tools:
        for tool in code_interpreter_tools:
            container = tool.setdefault("container", {"type": "auto", "file_ids": []})
            file_ids = container.setdefault("file_ids", [])

            # Drop the old single-slot placeholder from an earlier version
            # of this script, in favor of the numbered slots below.
            if "{{code_interpreter_file_id}}" in file_ids:
                file_ids.remove("{{code_interpreter_file_id}}")

            added_any = False
            for slot_name in CODE_INTERPRETER_SLOT_NAMES:
                placeholder = f"{{{{{slot_name}}}}}"
                if placeholder not in file_ids:
                    file_ids.append(placeholder)
                    added_any = True

            if added_any:
                print(f"  ensured {CODE_INTERPRETER_SLOT_COUNT} code_interpreter slots are present")
            else:
                print("  code_interpreter tool already has all slots")
    else:
        tools.append(copy.deepcopy(CODE_INTERPRETER_TOOL))
        print(f"  added new code_interpreter tool with {CODE_INTERPRETER_SLOT_COUNT} slots")

    updated["tools"] = tools

    structured_inputs = updated.get("structured_inputs") or {}
    structured_inputs.update(STRUCTURED_INPUTS_ADDITIONS)
    updated["structured_inputs"] = structured_inputs

    return updated


def publish_new_version(token: str, agent_name: str, definition: dict) -> dict:
    """Publish the updated definition as a new agent version via the
    documented REST endpoint (POST /agents/{agent_name}/versions). Using
    raw REST here, matching Microsoft's own documented request body
    exactly, rather than guessing at SDK model classes for tool types
    (MCP, OpenAPI) this script didn't create."""

    response = requests.post(
        f"{PROJECT_ENDPOINT}/agents/{agent_name}/versions",
        params={"api-version": API_VERSION},
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        json={"definition": definition},
        timeout=60,
    )
    if not response.ok:
        print("  Azure said:", response.text)
    response.raise_for_status()
    return response.json()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--agent", help="Update a single agent by its exact name")
    parser.add_argument("--all", action="store_true", help="Update every agent in AGENT_NAMES")
    parser.add_argument("--dry-run", action="store_true", help="Print the change, don't publish it")
    args = parser.parse_args()

    if args.agent:
        agent_names = [args.agent]
    elif args.all:
        agent_names = AGENT_NAMES
    else:
        parser.error("Pass --agent <name> or --all")

    credential = DefaultAzureCredential()
    project = AIProjectClient(
        endpoint=PROJECT_ENDPOINT,
        credential=credential,
        allow_preview=True,
    )

    keepalive_vector_store_id = ensure_keepalive_vector_store(project)

    for agent_name in agent_names:
        print(f"\n=== {agent_name} ===")

        definition = get_current_definition(project, agent_name)

        if definition is None:
            print(
                "  No versions found for this name - it's probably wrong. "
                "Call GET /agents on your own backend to see the exact "
                "case-sensitive name, then try again."
            )
            continue

        updated_definition = build_updated_definition(definition, keepalive_vector_store_id)

        if args.dry_run:
            print("  Dry run - tools after this change would be:")
            print(json.dumps(
                [tool.get("type") for tool in updated_definition.get("tools", [])],
                indent=2,
            ))
            print("  structured_inputs keys after this change:")
            print(json.dumps(
                list(updated_definition.get("structured_inputs", {}).keys()),
                indent=2,
            ))
            continue

        token = credential.get_token("https://ai.azure.com/.default").token
        result = publish_new_version(token, agent_name, updated_definition)
        print(f"  Published new version: {result.get('version', '?')}")


if __name__ == "__main__":
    main()