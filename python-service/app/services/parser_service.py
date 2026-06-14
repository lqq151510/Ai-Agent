from markitdown import MarkItDown

md = MarkItDown()

def convert_with_markitdown(file_path: str) -> str:
    """Run the heavy, blocking conversion process."""
    result = md.convert(file_path)
    return result.text_content
