import os
import sys


# Permite ejecutar tanto:
# - python -m server.server
# - python server/server.py
if __package__ is None or __package__ == "":
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if project_root not in sys.path:
        sys.path.insert(0, project_root)
    from server.gui import main
else:
    from .gui import main


if __name__ == "__main__":
    main()

