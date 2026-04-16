"""
PageIndex Chat Agent — Agno implementation (self-hosted PageIndex)

Uses the local pageindex/ package (copied from github.com/VectifyAI/PageIndex).
Tree indexing is done by LiteLLM → AWS Bedrock (no OpenAI key required).
Model configured in pageindex/config.yaml — default: bedrock/us.anthropic.claude-sonnet-4-6.

Three tools exposed to the Agno agent (mirrors the original OpenAI Agents SDK example):
  get_document(doc_id)            — metadata (status, page count, name)
  get_document_structure(doc_id)  — full hierarchical tree index
  get_page_content(doc_id, pages) — text for tight page ranges

The agent is registered once with AgentOS at startup (no doc_id at init time).
Callers embed the doc_id in the message:

    DOC_ID: <doc_id>
    Question: <user question>

AgentOS exposes this agent at:
    POST /agents/pageindex-chat-agent/runs
"""

from agno.agent import Agent
from agno.db.sqlite import SqliteDb
from agno.models.aws import AwsBedrock
from agno.tools import Toolkit

CHAT_SYSTEM_PROMPT = """
You are a document QA assistant powered by PageIndex (self-hosted, vectorless RAG).

The user's message always begins with:
    DOC_ID: <doc_id>
    Question: <question>

Extract the doc_id from the first line and use it in every tool call.

RETRIEVAL STRATEGY — always follow this order:
1. Call get_document(doc_id) to confirm the document is ready and learn its page count.
2. Call get_document_structure(doc_id) to explore the hierarchical table-of-contents tree
   and identify the relevant section(s) and their page ranges.
3. Call get_page_content(doc_id, pages) with TIGHT ranges (e.g. "5-7", "12", "3,8").
   Never fetch the entire document at once.
4. Fetch additional ranges if needed.

Before each tool call, write one short sentence explaining why you are calling it.

ANSWERING RULES:
- Answer ONLY from information returned by the tools.
- Be concise and direct.
- Cite page numbers or section titles when referencing content.
- If the answer is not in the document, say so explicitly.
- Use markdown formatting for clarity.
"""


class PageIndexTools(Toolkit):
    """
    Agno Toolkit wrapping the three self-hosted PageIndex retrieval methods.
    Tools accept doc_id as a parameter so one toolkit instance serves any document.
    The PageIndex client is obtained lazily via get_pageindex_client() from app.py.
    """

    def __init__(self, client_getter):
        """
        Args:
            client_getter: Zero-argument callable returning the PageIndexClient.
        """
        super().__init__(name="pageindex_tools")
        self._get_client = client_getter
        self.register(self.get_document)
        self.register(self.get_document_structure)
        self.register(self.get_page_content)

    def get_document(self, doc_id: str) -> str:
        """Get document metadata: status, page count, name, and description."""
        return self._get_client().get_document(doc_id)

    def get_document_structure(self, doc_id: str) -> str:
        """
        Get the document's full hierarchical tree structure (without page text).
        Use this to discover section titles and their page ranges before fetching content.
        """
        return self._get_client().get_document_structure(doc_id)

    def get_page_content(self, doc_id: str, pages: str) -> str:
        """
        Retrieve the text content of specific pages.
        Always use tight ranges: '5-7' for pages 5-7, '3,8' for pages 3 and 8, '12' for page 12.
        For Markdown documents use line numbers from the structure's line_num field.
        """
        return self._get_client().get_page_content(doc_id, pages)


def create_chat_agent(client_getter, model_id: str) -> Agent:
    """
    Create an Agno document chat agent backed by self-hosted PageIndex tools.

    Args:
        client_getter: Zero-argument callable returning the PageIndexClient.
        model_id:      AWS Bedrock model ID used for the Agno chat agent.
    """
    return Agent(
        id="pageindex-chat-agent",
        name="PageIndex Chat Agent",
        role="Answer questions about uploaded documents using vectorless PageIndex retrieval",
        instructions=[CHAT_SYSTEM_PROMPT],
        tools=[PageIndexTools(client_getter)],
        model=AwsBedrock(id=model_id),
        markdown=True,
        db=SqliteDb(db_file="tmp/chat_sessions.db"),
        add_history_to_context=True,
        num_history_runs=6,
    )
