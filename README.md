# AI Career Guide & Resume Analyzer

A small Flask app that creates a paced 30-day career learning plan, checks PDF/DOCX resumes, and stores submission history in local JSON files. Gemini adds tailored suggestions; deterministic local logic keeps both features useful when a request fails. A valid API key is required to start the app, as requested. After startup, quota, network, timeout, safety, and response errors use the offline tools.

## Requirements

- Python 3.10 or newer
- A Google Gemini API key
- Internet access for Gemini and Google Fonts; core offline analysis works without Gemini connectivity

## Setup and run

Copy `.env.example` to `.env`, then replace `your_gemini_api_key_here` with your key. Keep `.env` private.

**Windows PowerShell**

```powershell
cd ai-career-guide
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item .env.example .env
# Edit .env and add GEMINI_API_KEY
python app.py
```

If PowerShell blocks activation, run `.venv\Scripts\python.exe -m pip install -r requirements.txt` and `.venv\Scripts\python.exe app.py` instead.

**macOS / Linux**

```bash
cd ai-career-guide
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
cp .env.example .env
# Edit .env and add GEMINI_API_KEY
python app.py
```

Open <http://127.0.0.1:5000>. Set `GEMINI_MODEL` in `.env` to another enabled model if needed; the default is `gemini-2.5-flash`.

## Useful routes

- `/` Home
- `/career-guide` Career learning plan
- `/resume-analyzer` Resume review
- `/history` Saved plans and analyses
- `/api/health` Tiny live Gemini API check; returns the model and a specific error category on failure

## Privacy and data

Resume files are limited to PDF/DOCX and 5 MB, extracted locally, and deleted in a `finally` cleanup after analysis. Only the uploaded filename, role, timestamp, scores, and analysis output are kept in `data/analyses.json`; extracted resume text is not saved. Plan data and basic user names are stored in `data/plans.json` and `data/users.json`. JSON updates use a process-local lock and atomic file replacement. This is intended for a local, single-user development app, not a public multi-worker deployment.

## Testing checklist

1. Career Guide: enter `Maya`, `Data analyst`, `Excel, communication`, and `2 hours`. Confirm the output has 4 week sections, days 1–30, role skill gaps, resource links, the week-four mini project, and a final checklist. Complete a day, reload, and confirm its check remains selected.
2. Career Guide offline behavior: temporarily use a deliberately invalid key (after the app is running) or disconnect from Gemini. Submit a plan; confirm it appears with the **Generated offline** badge and a Retry button. Restore connectivity/key before using Retry.
3. Resume Analyzer: upload a readable, text-based PDF or DOCX with sections for Summary, Skills, Experience, Education, and Projects. Use `Software developer` or `Frontend developer` as the role. Confirm role fit, ATS score and breakdown, matched/missing skills, grouped suggestions, job portal links, and ATS resources/tips.
4. Validation/privacy: try a `.txt` file, a file over 5 MB, and a blank role. Confirm a clear validation message; after a valid analysis, confirm the file is no longer present in `uploads/`.
5. History: visit `/history`; confirm both submissions display with timestamp, role, and outcome.
6. API check: visit <http://127.0.0.1:5000/api/health>. A working key returns `ok: true`; a failed request reports a category and friendly message, while the terminal logs the underlying reason.

## Gemini troubleshooting

| Terminal category / symptom | What to check | App behavior |
| --- | --- | --- |
| `invalid_key` / HTTP 401 | Confirm `.env` contains a valid `GEMINI_API_KEY`, with no surrounding quotes or spaces; restart Flask after edits. | Career and resume features use local output after request retries. |
| `quota` / HTTP 429 | Check project quota and billing/rate limits in Google AI Studio; wait before retrying. | Returns a local plan/ATS report and shows the API's specific friendly message. |
| `safety` / HTTP 422 | Simplify the request and remove unrelated sensitive content from the resume. | Uses offline output for feature requests; health check reports the block. |
| `timeout` / HTTP 504 | Check network quality and retry; confirm the model name is available to your key. | Three attempts plus a stricter JSON retry, then offline output. |
| `network` / `api_error` | Check internet, DNS, proxy/firewall, Google API availability, and the configured model. | Offline output remains available. |
| `empty_response` / `malformed_json` | Retry; check terminal logs and model availability if it continues. | Strict JSON mode and fence stripping are applied before local fallback. |
| Startup says `GEMINI_API_KEY is missing` | Copy `.env.example` to `.env` in the project root and set the key. | Startup stops with an explicit setup error, rather than hiding a configuration mistake. |

The app retries up to three times with exponential backoff, then once using a stricter JSON-only prompt. Keep API keys private and do not commit `.env`.