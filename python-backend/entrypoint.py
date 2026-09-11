"""PyInstaller entry point for the packaged Knowledge Desk backend.

Kept intentionally tiny: PyInstaller analyses this module to discover the
application graph, and ``knowledge_desk.main:main`` performs the real startup
(migrations, engine construction, uvicorn).
"""

from __future__ import annotations

import multiprocessing

from knowledge_desk.main import main

if __name__ == "__main__":
    # Required so a frozen build cannot re-execute the interpreter recursively.
    multiprocessing.freeze_support()
    main()
