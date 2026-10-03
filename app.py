"""Flask application for the AI Career Guide and Resume Analyzer."""

from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request
from werkzeug.utils import secure_filename

from services.ats_scorer import score_resume
from services.gemini_service import GeminiService, GeminiServiceError
from services.resume_parser import ResumeParseError, extract_resume_text
from services.storage import read_json, save_record

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
UPLOAD_DIR = Path("/tmp/uploads")
ALLOWED_EXTENSIONS = {"pdf", "docx"}
MAX_UPLOAD_BYTES = 5 * 1024 * 1024

load_dotenv(ROOT / ".env")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)
api_key = os.getenv("GEMINI_API_KEY", "").strip()
if not api_key:
    raise RuntimeError("GEMINI_API_KEY is missing. Copy .env.example to .env and add your Google Gemini API key.")

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_BYTES + 1024 * 1024
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
gemini = GeminiService(api_key=api_key, model=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"))


def timestamp() -> str:
    """Return a timezone-aware ISO timestamp."""
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def allowed_file(filename: str) -> bool:
    """Check the extension against supported resume formats."""
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def role_skills(role: str) -> list[str]:
    """Get the curated skill set for a role, with a useful general fallback."""
    resources: dict[str, Any] = read_json("resources.json", {})
    normalized = role.lower()
    for role_name, entry in resources.get("roles", {}).items():
        if role_name in normalized or normalized in role_name:
            return list(entry)
    return list(resources.get("general", {}).get("skills", ["communication", "problem solving", "teamwork"]))


@app.get("/")
def home() -> str:
    return render_template("index.html", title="AI Career Guide & Resume Analyzer")


@app.get("/career-guide")
def career_page() -> str:
    return render_template("career_guide.html", title="Career Guide")


@app.get("/resume-analyzer")
def resume_page() -> str:
    return render_template("resume_analyzer.html", title="Resume Analyzer")


@app.get("/history")
def history_page() -> str:
    return render_template("history.html", title="History")


@app.get("/api/history")
def history_api() -> Any:
    return jsonify({"plans": read_json("plans.json", []), "analyses": read_json("analyses.json", [])})


@app.post("/api/career-plan")
def career_plan() -> Any:
    payload = request.get_json(silent=True) or {}
    name = str(payload.get("name", "")).strip()
    role = str(payload.get("role", "")).strip()
    skills = [item.strip() for item in str(payload.get("skills", "")).split(",") if item.strip()]
    hours = str(payload.get("hours", "1")).strip()
    if not name or not role or hours not in {"1", "2", "3", "4+"}:
        return jsonify({"error": "Please enter your name and target role, and choose daily study time."}), 400
    if len(name) > 100 or len(role) > 120 or len(skills) > 40:
        return jsonify({"error": "Please keep your name, role, and skill list within the indicated limits."}), 400
    skill_data: dict[str, Any] = read_json("resources.json", {})
    try:
        plan = gemini.generate_plan(name, role, skills, hours, skill_data)
        offline, generation_note = False, None
    except GeminiServiceError as error:
        logger.warning("Career plan generated offline after Gemini failure: %s", error.category)
        plan = gemini.fallback_plan(name, role, skills, hours, skill_data)
        offline, generation_note = True, error.user_message
    record = {"id": str(uuid.uuid4()), "created_at": timestamp(), "name": name, "role": role,
              "skills": skills, "hours_per_day": hours, "offline": offline, "plan": plan}
    save_record("plans.json", record)
    save_record("users.json", {"id": str(uuid.uuid4()), "created_at": timestamp(), "name": name})
    return jsonify({"id": record["id"], "offline": offline, "message": generation_note, "plan": plan})


@app.post("/api/analyze-resume")
def analyze_resume() -> Any:
    upload = request.files.get("resume")
    role = str(request.form.get("role", "")).strip()
    if not role:
        return jsonify({"error": "Enter the role you are applying for."}), 400
    if upload is None or not upload.filename:
        return jsonify({"error": "Choose a PDF or DOCX resume to continue."}), 400
    if not allowed_file(upload.filename):
        return jsonify({"error": "Unsupported file type. Upload a PDF or DOCX file."}), 400
    safe_name = secure_filename(upload.filename)
    stored_path = UPLOAD_DIR / f"{uuid.uuid4().hex}_{safe_name}"
    try:
        upload.save(stored_path)
        if stored_path.stat().st_size > MAX_UPLOAD_BYTES:
            return jsonify({"error": "The resume is larger than 5 MB. Choose a smaller file."}), 413
        resume_text = extract_resume_text(stored_path)
        if not resume_text.strip():
            return jsonify({"error": "No readable text was found. Try a text-based PDF or DOCX file."}), 400
        skills = role_skills(role)
        report = score_resume(resume_text, role, skills)
        offline, generation_note = False, None
        try:
            report = gemini.merge_resume_review(report, gemini.review_resume(resume_text, role, skills))
        except GeminiServiceError as error:
            offline, generation_note = True, error.user_message
            logger.warning("Resume analysis used local scoring after Gemini failure: %s", error.category)
        record = {"id": str(uuid.uuid4()), "created_at": timestamp(), "role": role,
                  "filename": safe_name, "offline": offline, "result": report}
        save_record("analyses.json", record)
        return jsonify({"id": record["id"], "offline": offline, "message": generation_note,
                        "result": report, "job_portals": read_json("job_portals.json", [])})
    except ResumeParseError as error:
        return jsonify({"error": str(error)}), 400
    except OSError:
        logger.exception("Unable to process uploaded resume")
        return jsonify({"error": "The resume could not be read. Please try uploading it again."}), 500
    finally:
        stored_path.unlink(missing_ok=True)


@app.get("/api/health")
def health() -> Any:
    try:
        return jsonify({"ok": True, "model": gemini.model, "message": gemini.health_check()})
    except GeminiServiceError as error:
        return jsonify({"ok": False, "model": gemini.model, "error": error.user_message,
                        "category": error.category}), error.http_status


@app.errorhandler(413)
def request_too_large(_: Exception) -> Any:
    return jsonify({"error": "The upload is too large. Resume files must be 5 MB or smaller."}), 413


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.getenv("PORT", "5000")), debug=os.getenv("FLASK_DEBUG") == "1")