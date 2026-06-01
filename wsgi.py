"""
PythonAnywhere WSGI entry point.

Web tab → WSGI configuration file:
  import sys
  sys.path.insert(0, '/home/khakha/MNEA_pythonanywhere')
  from wsgi import application
"""
import os
import sys

_ROOT = os.path.dirname(os.path.abspath(__file__))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

try:
    from dotenv import load_dotenv

    load_dotenv(os.path.join(_ROOT, ".env"))
except ImportError:
    pass

from app import app as application  # noqa: E402
