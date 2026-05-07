"""Shared Flask extensions (init in application factory)."""
from flask_bcrypt import Bcrypt
from flask_mail import Mail
from flask_wtf.csrf import CSRFProtect
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

bcrypt = Bcrypt()
mail = Mail()
csrf = CSRFProtect()
limiter = Limiter(key_func=get_remote_address)
