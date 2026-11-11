import hashlib
import os
import re
import secrets
import smtplib
import sqlite3
import uuid
from contextlib import closing
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from pathlib import Path

from flask import Flask, abort, has_request_context, jsonify, request, send_from_directory, session
from werkzeug.utils import secure_filename
from werkzeug.security import check_password_hash, generate_password_hash


ROOT = Path(__file__).resolve().parent
UPLOAD_DIR = Path(os.environ.get("MUSE_UPLOAD_DIR", ROOT / "uploads"))
DATABASE = Path(os.environ.get("MUSE_DATABASE", ROOT / "muse.db"))
ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp", "gif", "mp4", "mov", "webm"}
MAX_UPLOAD_SIZE = 50 * 1024 * 1024

app = Flask(__name__, static_folder=None)
app.config.update(
    SECRET_KEY=os.environ.get("MUSE_SECRET_KEY") or secrets.token_hex(32),
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.environ.get("MUSE_COOKIE_SECURE") == "1",
    PERMANENT_SESSION_LIFETIME=timedelta(days=30),
)
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_SIZE

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
VERIFICATION_LIFETIME = timedelta(hours=24)

IDEAS = [
    {"id": 1, "title": "A slower kind of Sunday", "creator": "Sofia Chen", "initial": "S", "category": "interiors", "type": "image", "height": 255, "image": "photo-1616486338812-3dadae4b4ace", "tags": ["slow living", "interiors", "home"], "description": "Soft light, worn-in linen, and nowhere else to be. Saving this feeling for the weekend."},
    {"id": 2, "title": "The little bookstore in Kyoto", "creator": "Nina Park", "initial": "N", "category": "travel", "type": "image", "height": 192, "image": "photo-1524995997946-a1c2e315a42f", "tags": ["travel", "japan", "bookstores"], "description": "A tiny secondhand bookshop tucked away on a quiet Kyoto street."},
    {"id": 3, "title": "Colors that just make sense", "creator": "Alex Morgan", "initial": "A", "category": "design", "type": "gif", "height": 224, "image": "photo-1541701494587-cb58502866ab", "tags": ["colorful spaces", "design", "color"], "description": "A little color study to brighten up your next creative project."},
    {"id": 4, "title": "Sunday market flowers", "creator": "Mia Flores", "initial": "M", "category": "food", "type": "image", "height": 264, "image": "photo-1490750967868-88aa4486c946", "tags": ["flowers", "slow living", "weekend"], "description": "Market flowers that look like they were picked from a storybook."},
    {"id": 5, "title": "A cabin somewhere in the Alps", "creator": "Theo James", "initial": "T", "category": "travel", "type": "video", "height": 222, "image": "photo-1449158743715-0a90ebb6d2d8", "tags": ["travel", "slow living", "cabin"], "description": "A quiet mountain cabin, the kind of place you dream about while answering emails."},
    {"id": 6, "title": "Tiny kitchen, big energy", "creator": "Jules Rivera", "initial": "J", "category": "interiors", "type": "image", "height": 226, "image": "photo-1556911220-bff31c812dba", "tags": ["interiors", "colorful spaces", "home"], "description": "Proof that a small kitchen can still have a lot of personality."},
    {"id": 7, "title": "A film photo kind of day", "creator": "Luca Rossi", "initial": "L", "category": "travel", "type": "image", "height": 190, "image": "photo-1470770841072-f978cf4d019e", "tags": ["film photography", "travel", "nature"], "description": "Golden light and the kind of quiet that makes you stay a little longer."},
    {"id": 8, "title": "The perfect afternoon fit", "creator": "Elle Kim", "initial": "E", "category": "fashion", "type": "image", "height": 250, "image": "photo-1529139574466-a303027c1d8b", "tags": ["style", "fashion", "weekend"], "description": "Easy layers and a little bit of color. Ready for absolutely no plans."},
    {"id": 9, "title": "A little reminder to make things", "creator": "Ari Blake", "initial": "A", "category": "design", "type": "gif", "height": 208, "image": "photo-1452860606245-08befc0ff44b", "tags": ["weekend projects", "design", "creative"], "description": "Make the thing. It doesn't need to be perfect to be worth making."},
    {"id": 10, "title": "Breakfast that feels like a hug", "creator": "Rae Williams", "initial": "R", "category": "food", "type": "image", "height": 213, "image": "photo-1490645935967-10de6ba17061", "tags": ["food", "slow living", "breakfast"], "description": "A little morning inspiration for the next time you can take things slow."},
    {"id": 11, "title": "Somewhere between here and there", "creator": "Sofia Chen", "initial": "S", "category": "travel", "type": "video", "height": 254, "image": "photo-1476514525535-07fb3b4ae5f1", "tags": ["travel", "film photography", "nature"], "description": "Blue water, open skies, and that feeling of being exactly where you should be."},
    {"id": 12, "title": "A room with a point of view", "creator": "Mia Flores", "initial": "M", "category": "interiors", "type": "image", "height": 192, "image": "photo-1616486029423-aaa4789e8c9a", "tags": ["interiors", "design", "colorful spaces"], "description": "Vintage finds and unexpected color, put together with so much care."},
    {"id": 13, "title": "Color in motion", "creator": "Alex Morgan", "initial": "A", "category": "design", "type": "gif", "height": 238, "image": "photo-1507908708918-778587c9e563", "tags": ["colorful spaces", "design", "art"], "description": "A playful mix of shapes and color for a little visual reset."},
    {"id": 14, "title": "Meet me at the coast", "creator": "Nina Park", "initial": "N", "category": "travel", "type": "image", "height": 203, "image": "photo-1518837695005-2083093ee35b", "tags": ["travel", "weekend", "nature"], "description": "A coastline worth taking the long way around for."},
    {"id": 15, "title": "Objects for the everyday", "creator": "Theo James", "initial": "T", "category": "design", "type": "image", "height": 218, "image": "photo-1490312278390-ab64016e0aa9", "tags": ["design", "home", "creative"], "description": "A collection of thoughtful, useful things that make every day a little nicer."},
    {"id": 16, "title": "The long way home", "creator": "Elle Kim", "initial": "E", "category": "fashion", "type": "video", "height": 228, "image": "photo-1483985988355-763728e1935b", "tags": ["style", "fashion", "film photography"], "description": "An outfit, a walk, and the freedom to take the scenic route."},
]


def get_db():
    connection = sqlite3.connect(DATABASE)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_database():
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    DATABASE.parent.mkdir(parents=True, exist_ok=True)
    with closing(get_db()) as connection:
        connection.execute(
            """CREATE TABLE IF NOT EXISTS uploads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                filename TEXT NOT NULL UNIQUE,
                media_type TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )"""
        )
        connection.execute(
            """CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                email_verified INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )"""
        )
        connection.execute(
            """CREATE TABLE IF NOT EXISTS email_tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                token_hash TEXT NOT NULL UNIQUE,
                expires_at INTEGER NOT NULL
            )"""
        )
        connection.execute(
            """CREATE TABLE IF NOT EXISTS saved_ideas (
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                idea_id TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, idea_id)
            )"""
        )
        connection.commit()


def public_user(user):
    return {"id": user["id"], "email": user["email"]}


def saved_idea_ids(user_id):
    with closing(get_db()) as connection:
        rows = connection.execute(
            "SELECT idea_id FROM saved_ideas WHERE user_id = ? ORDER BY created_at",
            (user_id,),
        ).fetchall()
    return [row["idea_id"] for row in rows]


def current_user():
    user_id = session.get("user_id")
    if user_id is None:
        return None
    with closing(get_db()) as connection:
        user = connection.execute(
            "SELECT id, email FROM users WHERE id = ? AND email_verified = 1",
            (user_id,),
        ).fetchone()
    if user is None:
        session.clear()
    return user


def email_configuration_ready():
    smtp_ready = bool(os.environ.get("MUSE_SMTP_HOST") and os.environ.get("MUSE_SMTP_FROM"))
    return smtp_ready or local_console_email_enabled()


def local_console_email_enabled():
    return (
        os.environ.get("MUSE_EMAIL_MODE") == "console"
        and not os.environ.get("RENDER")
        and has_request_context()
        and request.remote_addr in {"127.0.0.1", "::1"}
    )


def create_verification_token(user_id):
    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    expires_at = int((datetime.now(timezone.utc) + VERIFICATION_LIFETIME).timestamp())
    with closing(get_db()) as connection, connection:
        connection.execute("DELETE FROM email_tokens WHERE user_id = ?", (user_id,))
        connection.execute(
            "INSERT INTO email_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)",
            (user_id, token_hash, expires_at),
        )
    return token


def send_verification_email(email, token):
    public_url = (
        os.environ.get("MUSE_PUBLIC_URL")
        or os.environ.get("RENDER_EXTERNAL_URL")
        or request.url_root
    ).rstrip("/")
    verification_url = f"{public_url}/#verify-{token}"
    if local_console_email_enabled():
        app.logger.info("Local verification link for %s: %s", email, verification_url)
        return verification_url

    message = EmailMessage()
    message["Subject"] = "Verify your Muse email"
    message["From"] = os.environ["MUSE_SMTP_FROM"]
    message["To"] = email
    message.set_content(
        "Welcome to Muse!\n\n"
        "Confirm your email address by opening this link:\n"
        f"{verification_url}\n\n"
        "This link expires in 24 hours. If you did not create a Muse account, "
        "you can ignore this email."
    )
    host = os.environ["MUSE_SMTP_HOST"]
    port = int(os.environ.get("MUSE_SMTP_PORT", "587"))
    username = os.environ.get("MUSE_SMTP_USERNAME")
    password = os.environ.get("MUSE_SMTP_PASSWORD")
    if port == 465:
        with smtplib.SMTP_SSL(host, port, timeout=15) as smtp:
            if username and password:
                smtp.login(username, password)
            smtp.send_message(message)
    else:
        with smtplib.SMTP(host, port, timeout=15) as smtp:
            smtp.starttls()
            if username and password:
                smtp.login(username, password)
            smtp.send_message(message)
    return None


def is_valid_media(data, extension):
    if extension == "png":
        return data.startswith(b"\x89PNG\r\n\x1a\n")
    if extension in {"jpg", "jpeg"}:
        return data.startswith(b"\xff\xd8\xff")
    if extension == "gif":
        return data.startswith((b"GIF87a", b"GIF89a"))
    if extension == "webp":
        return data.startswith(b"RIFF") and data[8:12] == b"WEBP"
    if extension in {"mp4", "mov"}:
        return len(data) >= 12 and data[4:8] == b"ftyp"
    if extension == "webm":
        return data.startswith(b"\x1a\x45\xdf\xa3")
    return False


@app.get("/")
def home():
    return send_from_directory(ROOT, "index.html")


@app.get("/styles.css")
def styles():
    return send_from_directory(ROOT, "styles.css")


@app.get("/app.js")
def javascript():
    return send_from_directory(ROOT, "app.js")


@app.get("/api/ideas")
def list_ideas():
    with closing(get_db()) as connection:
        uploads = connection.execute(
            "SELECT id, title, filename, media_type FROM uploads ORDER BY id DESC"
        ).fetchall()
    user_ideas = [
        {
            "id": f"upload-{row['id']}",
            "title": row["title"],
            "creator": "Jamie Parker",
            "initial": "J",
            "category": "design",
            "type": row["media_type"],
            "height": 225,
            "image": f"/uploads/{row['filename']}" if row["media_type"] == "image" else "photo-1492684223066-81342ee5ff30",
            "mediaUrl": f"/uploads/{row['filename']}",
            "tags": ["your idea", row["media_type"]],
            "description": f"Your {row['media_type']} is ready to share.",
        }
        for row in uploads
    ]
    return jsonify(user_ideas + IDEAS)


@app.get("/api/auth/me")
def auth_me():
    user = current_user()
    return jsonify(
        user=public_user(user) if user else None,
        savedIdeas=saved_idea_ids(user["id"]) if user else [],
    )


@app.post("/api/auth/signup")
def sign_up():
    data = request.get_json(silent=True) or {}
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))
    if not EMAIL_PATTERN.fullmatch(email) or len(email) > 254:
        return jsonify(error="Enter a valid email address."), 400
    if len(password) < 10 or len(password) > 1024:
        return jsonify(error="Choose a password between 10 and 1,024 characters."), 400
    if not email_configuration_ready():
        return jsonify(error="Email verification is not configured yet. Please try again later."), 503

    try:
        with closing(get_db()) as connection, connection:
            cursor = connection.execute(
                "INSERT INTO users (email, password_hash) VALUES (?, ?)",
                (email, generate_password_hash(password, method="pbkdf2:sha256:600000")),
            )
            user_id = cursor.lastrowid
    except sqlite3.IntegrityError:
        return jsonify(error="An account already uses this email. Try signing in instead."), 409

    token = create_verification_token(user_id)
    try:
        verification_url = send_verification_email(email, token)
    except (OSError, smtplib.SMTPException, ValueError):
        app.logger.exception("Could not send account verification email")
        return jsonify(
            error="Your account was created, but the verification email could not be sent. Check your email settings or try resending later.",
            email=email,
        ), 502
    response = {"message": "Check your email for a verification link.", "email": email}
    if verification_url:
        response["message"] = "Open the local verification link to finish creating your account."
        response["verificationUrl"] = verification_url
    return jsonify(response), 201


@app.post("/api/auth/login")
def sign_in():
    data = request.get_json(silent=True) or {}
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))
    with closing(get_db()) as connection:
        user = connection.execute(
            "SELECT id, email, password_hash, email_verified FROM users WHERE email = ?",
            (email,),
        ).fetchone()
    if user is None or not check_password_hash(user["password_hash"], password):
        return jsonify(error="Email or password is incorrect."), 401
    if not user["email_verified"]:
        return jsonify(error="Verify your email before signing in.", email=email), 403
    session.clear()
    session.permanent = True
    session["user_id"] = user["id"]
    return jsonify(user=public_user(user), savedIdeas=saved_idea_ids(user["id"]))


@app.post("/api/auth/resend")
def resend_verification():
    data = request.get_json(silent=True) or {}
    email = str(data.get("email", "")).strip().lower()
    with closing(get_db()) as connection:
        user = connection.execute(
            "SELECT id, email_verified FROM users WHERE email = ?",
            (email,),
        ).fetchone()
    if user is None or user["email_verified"]:
        return jsonify(message="If that address has an unverified account, a new link is on its way.")
    if not email_configuration_ready():
        return jsonify(error="Email verification is not configured yet. Please try again later."), 503
    token = create_verification_token(user["id"])
    try:
        send_verification_email(email, token)
    except (OSError, smtplib.SMTPException, ValueError):
        app.logger.exception("Could not resend account verification email")
        return jsonify(error="The verification email could not be sent. Please try again later."), 502
    return jsonify(message="A new verification link is on its way.")


@app.post("/api/auth/verify")
def verify_email():
    data = request.get_json(silent=True) or {}
    token = str(data.get("token", ""))
    if len(token) > 200:
        return jsonify(error="This verification link is invalid or has expired."), 400
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    with closing(get_db()) as connection, connection:
        verification = connection.execute(
            "SELECT user_id FROM email_tokens WHERE token_hash = ? AND expires_at >= ?",
            (token_hash, int(datetime.now(timezone.utc).timestamp())),
        ).fetchone()
        if verification is None:
            return jsonify(error="This verification link is invalid or has expired. Request a new one."), 400
        connection.execute(
            "UPDATE users SET email_verified = 1 WHERE id = ?",
            (verification["user_id"],),
        )
        connection.execute("DELETE FROM email_tokens WHERE user_id = ?", (verification["user_id"],))
        user = connection.execute(
            "SELECT id, email FROM users WHERE id = ?",
            (verification["user_id"],),
        ).fetchone()
    session.clear()
    session.permanent = True
    session["user_id"] = user["id"]
    return jsonify(user=public_user(user), savedIdeas=saved_idea_ids(user["id"]))


@app.post("/api/auth/logout")
def sign_out():
    session.clear()
    return jsonify(message="You are signed out.")


@app.post("/api/saved")
def save_ideas():
    user = current_user()
    if user is None:
        return jsonify(error="Sign in to sync your saved ideas."), 401
    data = request.get_json(silent=True) or {}
    idea_ids = data.get("ideaIds")
    if not isinstance(idea_ids, list) or len(idea_ids) > 500:
        return jsonify(error="Choose up to 500 ideas to save."), 400
    normalized_ids = set()
    for idea_id in idea_ids:
        if isinstance(idea_id, (str, int)) and not isinstance(idea_id, bool):
            value = str(idea_id)
            if 0 < len(value) <= 64:
                normalized_ids.add(value)
    with closing(get_db()) as connection, connection:
        connection.executemany(
            "INSERT OR IGNORE INTO saved_ideas (user_id, idea_id) VALUES (?, ?)",
            [(user["id"], idea_id) for idea_id in normalized_ids],
        )
    return jsonify(savedIdeas=saved_idea_ids(user["id"]))


@app.delete("/api/saved/<path:idea_id>")
def unsave_idea(idea_id):
    user = current_user()
    if user is None:
        return jsonify(error="Sign in to sync your saved ideas."), 401
    if len(idea_id) > 64:
        return jsonify(error="That saved idea could not be found."), 400
    with closing(get_db()) as connection, connection:
        connection.execute(
            "DELETE FROM saved_ideas WHERE user_id = ? AND idea_id = ?",
            (user["id"], idea_id),
        )
    return jsonify(savedIdeas=saved_idea_ids(user["id"]))


@app.post("/api/uploads")
def upload_ideas():
    files = request.files.getlist("files")
    if not files or all(not file.filename for file in files):
        return jsonify(error="Choose at least one image or video to upload."), 400

    pending_uploads = []
    for file in files:
        if not file.filename:
            continue
        safe_name = secure_filename(file.filename)
        if not safe_name or "." not in safe_name:
            return jsonify(error="One of the files has an invalid filename."), 400
        extension = safe_name.rsplit(".", 1)[1].lower()
        if extension not in ALLOWED_EXTENSIONS:
            return jsonify(error=f"Unsupported file type: {safe_name}"), 400
        data = file.read(MAX_UPLOAD_SIZE + 1)
        if len(data) > MAX_UPLOAD_SIZE:
            return jsonify(error=f"{safe_name} is larger than the 50 MB limit."), 413
        if not is_valid_media(data, extension):
            return jsonify(error=f"{safe_name} does not appear to be a valid media file."), 400
        media_type = (
            "video" if extension in {"mp4", "mov", "webm"}
            else "gif" if extension == "gif"
            else "image"
        )
        stored_name = f"{uuid.uuid4().hex}.{extension}"
        pending_uploads.append((safe_name, stored_name, media_type, data))

    created = []
    written_files = []
    try:
        with closing(get_db()) as connection, connection:
            for title, stored_name, media_type, data in pending_uploads:
                stored_path = UPLOAD_DIR / stored_name
                stored_path.write_bytes(data)
                written_files.append(stored_path)
                cursor = connection.execute(
                    "INSERT INTO uploads (title, filename, media_type) VALUES (?, ?, ?)",
                    (Path(title).stem.replace("-", " ").replace("_", " "), stored_name, media_type),
                )
                upload_id = cursor.lastrowid
                created.append(
                    {
                        "id": f"upload-{upload_id}",
                        "title": Path(title).stem.replace("-", " ").replace("_", " "),
                        "creator": "Jamie Parker",
                        "initial": "J",
                        "category": "design",
                        "type": media_type,
                        "height": 225,
                        "image": f"/uploads/{stored_name}" if media_type == "image" else "photo-1492684223066-81342ee5ff30",
                        "mediaUrl": f"/uploads/{stored_name}",
                        "tags": ["your idea", media_type],
                        "description": f"Your {media_type} is ready to share.",
                    }
                )
    except (OSError, sqlite3.Error):
        for stored_path in written_files:
            stored_path.unlink(missing_ok=True)
        app.logger.exception("Could not save uploaded media")
        return jsonify(error="The upload could not be saved. Please try again."), 500
    return jsonify(ideas=created), 201


@app.get("/uploads/<path:filename>")
def uploaded_file(filename):
    if Path(filename).name != filename:
        abort(404)
    return send_from_directory(UPLOAD_DIR, filename, as_attachment=False)


@app.errorhandler(413)
def request_too_large(_error):
    return jsonify(error="Uploads are limited to 50 MB per request."), 413


initialize_database()


if __name__ == "__main__":
    app.run(
        debug=os.environ.get("FLASK_DEBUG") == "1",
        port=int(os.environ.get("MUSE_PORT", "5000")),
    )
