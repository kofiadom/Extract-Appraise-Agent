"""
LlamaParse helper — converts a PDF file to markdown using the LlamaCloud API.

Called at upload time by /upload-fs so that FileSearch agents only need to
call FileTools.read_file on the pre-converted .md files.
"""

import logging
from pathlib import Path

logger = logging.getLogger(__name__)


async def parse_pdf_to_markdown(pdf_path: str, api_key: str) -> str:
    """
    Upload a PDF to LlamaParse and return the full markdown content.

    Args:
        pdf_path: Absolute or relative path to the PDF file.
        api_key:  LlamaCloud API key (LLAMAPARSE_API_KEY in .env).

    Returns:
        Markdown string of the full document, or empty string on failure.
    """
    from llama_cloud import AsyncLlamaCloud, file_from_path

    client = AsyncLlamaCloud(api_key=api_key)

    logger.info("LlamaParse: uploading %s", pdf_path)
    file_obj = await client.files.create(file=file_from_path(pdf_path), purpose="parse")

    logger.info("LlamaParse: parsing file_id=%s", file_obj.id)
    result = await client.parsing.parse(
        file_id=file_obj.id,
        tier="fast",
        version="latest",
        expand=["markdown_full"],
    )

    markdown = result.markdown_full or ""
    logger.info("LlamaParse: done — %d chars", len(markdown))
    return markdown
