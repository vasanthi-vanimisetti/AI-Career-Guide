"""Deterministic resume checks used for stable ATS scores and offline results."""

from __future__ import annotations

import re
from typing import Any

SECTION_PATTERNS = {
    "contact": r"@|\b(?:\+?\d[\d\s().-]{7,}\d)\b|linkedin\.com",
    "summary": r"\b(summary|profile|objective)\b",
    "skills": r"\b(skills|technical skills|core competencies)\b",
    "experience": r"\b(experience|employment|work history)\b",
    "education": r"\b(education|academic|degree)\b",
    "projects": r"\b(projects|portfolio)\b",
}
ACTION_VERBS = {"built", "created", "delivered", "designed", "developed", "improved", "launched", "led", "managed", "optimized", "reduced", "resolved", "streamlined"}


def score_resume(text: str, role: str, required_skills: list[str]) -> dict[str, Any]:
    """Compute rule-based ATS score, role match, and improvement groups."""
    lowered = text.lower()
    words = re.findall(r"\b[\w+#.-]+\b", lowered)
    matched = [skill for skill in required_skills if skill.lower() in lowered]
    missing = [skill for skill in required_skills if skill.lower() not in lowered]
    match_percentage = round(100 * len(matched) / max(1, len(required_skills)))
    sections = {name: bool(re.search(pattern, text, re.IGNORECASE)) for name, pattern in SECTION_PATTERNS.items()}
    keyword_score = round(20 * len(matched) / max(1, len(required_skills)))
    rule_relevance_score = round(10 * match_percentage / 100)
    section_score = round(25 * sum(sections.values()) / len(sections))
    formatting_score = 10 if len(words) >= 120 and len(text) < 14000 else 6 if len(words) >= 70 else 2
    verb_count = sum(1 for word in words if word in ACTION_VERBS)
    action_score = min(10, verb_count * 2)
    number_count = len(re.findall(r"\b\d+(?:\.\d+)?%?\b", text))
    quantified_score = min(15, number_count * 3)
    length_score = 10 if 250 <= len(words) <= 900 else 6 if 150 <= len(words) <= 1200 else 2
    breakdown = {"keywords": keyword_score, "role_relevance": rule_relevance_score,
                 "formatting": formatting_score, "sections": section_score,
                 "action_verbs": action_score, "quantified_achievements": quantified_score, "length": length_score}
    ats_score = min(100, sum(breakdown.values()))
    verdict = "Strong" if match_percentage >= 70 else "Moderate" if match_percentage >= 40 else "Weak"
    reason = f"Your resume includes {len(matched)} of {len(required_skills)} common {role} skills."
    return {
        "role": role, "match_percentage": match_percentage, "verdict": verdict, "match_reason": reason,
        "ats_score": ats_score, "breakdown": breakdown, "sections_present": sections,
        "matched_skills": matched, "missing_skills": missing,
        "suggestions": {
            "skills_to_add": missing[:6],
            "certifications": [{"name": f"{role} fundamentals", "provider": "Coursera or an official provider"}],
            "projects": [f"Build a small, documented project that demonstrates {missing[0]}" if missing else f"Add a measurable portfolio project related to {role}"],
            "wording_fixes": _wording_suggestions(sections, verb_count, number_count, len(words)),
        },
    }


def _wording_suggestions(sections: dict[str, bool], verbs: int, numbers: int, word_count: int) -> list[str]:
    """Return concise suggestions based on measured resume signals."""
    tips: list[str] = []
    absent = [name.title() for name, present in sections.items() if not present]
    if absent:
        tips.append("Add clearly labeled sections for: " + ", ".join(absent) + ".")
    if verbs < 3:
        tips.append("Start experience bullets with action verbs such as Built, Led, or Improved.")
    if numbers < 2:
        tips.append("Add numbers to show the scale or results of your work, such as time saved or users reached.")
    if word_count < 150:
        tips.append("Add relevant detail so the resume gives enough context about your work and projects.")
    elif word_count > 1200:
        tips.append("Shorten the resume by removing repeated or less relevant details.")
    return tips or ["Use short, readable bullets and keep dates and headings consistent."]