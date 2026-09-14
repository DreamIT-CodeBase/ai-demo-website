import argparse
import copy
import json

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

FILE_SEARCH_TOOL = {
    "type": "file_search",
    "vector_store_ids": ["{{vector_store_id}}"],
}

CODE_INTERPRETER_TOOL = {
    "type": "code_interpreter",
    "container": {
        "type": "auto",
        "file_ids": ["{{code_interpreter_file_id}}"],
    },
}

STRUCTURED_INPUTS_ADDITIONS = {
    "vector_store_id": {
        "description": "Vector store ID for an uploaded document (pdf, docx, pptx, txt, md, html)",
        "required": False,
        "default_value": "",
        "schema": {"type": "string"},
    },
    "code_interpreter_file_id": {
        "description": "File ID for an uploaded spreadsheet (csv, xlsx, xls)",
        "required": False,
        "default_value": "",
        "schema": {"type": "string"},
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


def build_updated_definition(definition: dict) -> dict:
    """Return a copy of `definition` with the vector_store_id / code_interpreter_file_id
    placeholders wired into whatever File Search / Code Interpreter tools already
    exist, adding a fresh tool only if one isn't present at all."""

    updated = copy.deepcopy(definition)
    tools = updated.get("tools", [])

    file_search_tools = [t for t in tools if t.get("type") == "file_search"]
    if file_search_tools:
        for tool in file_search_tools:
            ids = tool.setdefault("vector_store_ids", [])
            if "{{vector_store_id}}" not in ids:
                ids.append("{{vector_store_id}}")
                print("  added {{vector_store_id}} to existing file_search tool")
            else:
                print("  file_search tool already has the placeholder")
    else:
        tools.append(FILE_SEARCH_TOOL)
        print("  added new file_search tool")

    code_interpreter_tools = [t for t in tools if t.get("type") == "code_interpreter"]
    if code_interpreter_tools:
        for tool in code_interpreter_tools:
            container = tool.setdefault("container", {"type": "auto", "file_ids": []})
            file_ids = container.setdefault("file_ids", [])
            if "{{code_interpreter_file_id}}" not in file_ids:
                file_ids.append("{{code_interpreter_file_id}}")
                print("  added {{code_interpreter_file_id}} to existing code_interpreter tool")
            else:
                print("  code_interpreter tool already has the placeholder")
    else:
        tools.append(CODE_INTERPRETER_TOOL)
        print("  added new code_interpreter tool")

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

        updated_definition = build_updated_definition(definition)

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
