"""WTForms with CSRF for all POST endpoints."""
from flask_wtf import FlaskForm
from wtforms import StringField, PasswordField, SubmitField, HiddenField, SelectField
from wtforms.validators import DataRequired, Length, Optional, EqualTo


class LoginForm(FlaskForm):
    username = StringField("Username (ID or admin)", validators=[DataRequired(), Length(max=191)])
    password = PasswordField("Password", validators=[DataRequired(), Length(max=256)])
    submit = SubmitField("Log in")


class ChangePasswordForm(FlaskForm):
    current_password = PasswordField("Current password", validators=[DataRequired(), Length(max=256)])
    new_password = PasswordField(
        "New password",
        validators=[DataRequired(), Length(min=8, max=128)],
        render_kw={"data-password-meter": "pwMeter"},
    )
    confirm_password = PasswordField(
        "Confirm new password",
        validators=[
            DataRequired(),
            EqualTo("new_password", message="Passwords must match."),
        ],
    )
    submit = SubmitField("Update password")


class ForgotPasswordForm(FlaskForm):
    """User enters their login ID (TCH_xxx / STD_xxx)."""
    user_id = StringField("User ID", validators=[DataRequired(), Length(max=191)])
    submit = SubmitField("Send reset link")


class ResetPasswordForm(FlaskForm):
    token = HiddenField(validators=[DataRequired()])
    new_password = PasswordField(
        "New password",
        validators=[DataRequired(), Length(min=8, max=128)],
        render_kw={"data-password-meter": "nrMeter"},
    )
    confirm_password = PasswordField(
        "Confirm new password",
        validators=[DataRequired(), EqualTo("new_password")],
    )
    submit = SubmitField("Set password")


class AuditFilterForm(FlaskForm):
    date_from = StringField("From (YYYY-MM-DD)", validators=[Optional()])
    date_to = StringField("To (YYYY-MM-DD)", validators=[Optional()])
    username_search = StringField("Username contains", validators=[Optional()])
    action = SelectField(
        "Action",
        choices=[
            ("", "All"),
            ("login_success", "Login success"),
            ("login_failed", "Login failed"),
            ("account_locked", "Account locked"),
            ("password_change", "Password change"),
            ("password_reset_admin", "Password reset (admin)"),
            ("password_reset_self", "Password reset (forgot link)"),
            ("logout", "Logout"),
        ],
        validators=[Optional()],
    )
    submit = SubmitField("Apply filters")
