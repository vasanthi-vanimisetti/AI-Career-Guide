"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("#resume-form");
  if (!form) return;
  const fileInput = document.querySelector("#resume-file");
  const dropZone = document.querySelector("#drop-zone");
  const fileLabel = document.querySelector("#file-label");
  const result = document.querySelector("#resume-result");
  const message = document.querySelector("#resume-message");
  const messageText = message.querySelector("span");
  const error = document.querySelector("#resume-error");
  const submit = form.querySelector("button[type='submit']");
  let lastFile = null;

  fileInput.addEventListener("change", () => {
    lastFile = fileInput.files[0] || null;
    fileLabel.textContent = lastFile ? lastFile.name : "Choose a file or drop it here";
    error.textContent = "";
  });
  ["dragenter", "dragover"].forEach((eventName) => dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add("is-dragging");
  }));
  ["dragleave", "drop"].forEach((eventName) => dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove("is-dragging");
  }));
  dropZone.addEventListener("drop", (event) => {
    const file = event.dataTransfer.files[0];
    if (!file) return;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    fileInput.files = transfer.files;
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
  });
  dropZone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      fileInput.click();
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.textContent = "";
    if (!form.reportValidity()) return;
    lastFile = fileInput.files[0] || lastFile;
    if (!lastFile) { error.textContent = "Choose a PDF or DOCX resume."; return; }
    const extension = lastFile.name.split(".").pop().toLowerCase();
    if (!["pdf", "docx"].includes(extension)) { error.textContent = "Unsupported file type. Upload a PDF or DOCX file."; return; }
    if (lastFile.size > 5 * 1024 * 1024) { error.textContent = "The resume is larger than 5 MB. Choose a smaller file."; return; }
    await requestAnalysis();
  });

  document.querySelector("#retry-resume").addEventListener("click", requestAnalysis);

  async function requestAnalysis() {
    setLoading(submit, true, "Analyzing your resume...");
    message.hidden = true;
    try {
      const data = new FormData();
      data.append("role", document.querySelector("#resume-role").value.trim());
      data.append("resume", lastFile);
      const response = await fetch("/api/analyze-resume", { method: "POST", body: data });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Your resume could not be analyzed. Please retry.");
      renderResumeReport(payload.result, payload.job_portals || [], document.querySelector("#resume-role").value.trim());
      result.hidden = false;
      document.querySelector("#resume-offline").hidden = !payload.offline;
      if (payload.offline) showNotice(payload.message || "Gemini is unavailable. This review was completed with local checks.");
      result.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (requestError) {
      result.hidden = false;
      showNotice(requestError.message || "We could not reach the server. Check your connection and retry.", true);
    } finally {
      setLoading(submit, false, "Analyze my resume");
    }
  }

  function showNotice(text, isError = false) {
    messageText.textContent = text;
    message.classList.toggle("error-notice", isError);
    message.hidden = false;
  }
});

function renderResumeReport(report, portals, role) {
  const target = document.querySelector("#resume-report");
  target.replaceChildren();
  target.append(buildScoreSummary(report));
  target.append(buildBreakdown(report.breakdown || {}, report.sections_present || {}));
  target.append(buildSkills(report.matched_skills || [], report.missing_skills || []));
  target.append(buildSuggestions(report.suggestions || {}));
  target.append(buildPortals(portals, role));
  target.append(buildResources());
}

function buildScoreSummary(report) {
  const wrapper = document.createElement("div");
  wrapper.className = "report-top";
  const scorePanel = document.createElement("section");
  scorePanel.className = "score-panel";
  scorePanel.setAttribute("aria-label", `ATS score ${report.ats_score} out of 100`);
  const gauge = document.createElement("div");
  gauge.className = "score-gauge";
  gauge.style.setProperty("--score", String(report.ats_score || 0));
  const inside = document.createElement("div");
  inside.className = "score-gauge-inner";
  inside.append(textElement("strong", "", String(report.ats_score ?? 0)), textElement("span", "", "/100"));
  gauge.append(inside);
  scorePanel.append(gauge, textElement("span", "", "ATS score"));

  const matchPanel = document.createElement("section");
  matchPanel.className = "match-panel";
  const row = document.createElement("div");
  row.className = "match-row";
  row.append(textElement("h3", "", "Role match"));
  const verdict = textElement("span", `match-badge ${(report.verdict || "weak").toLowerCase()}`, report.verdict || "Weak");
  row.append(verdict);
  matchPanel.append(row, textElement("p", "match-number", `${report.match_percentage ?? 0}%`),
    textElement("p", "", report.match_reason || "Your resume has been compared with common skills for this role."));
  wrapper.append(scorePanel, matchPanel);
  return wrapper;
}

function buildBreakdown(breakdown, sectionsPresent) {
  const panel = reportPanel("ATS score breakdown");
  const list = document.createElement("div");
  list.className = "breakdown-list";
  const labels = { keywords: "Role keywords", role_relevance: "Role relevance", formatting: "Formatting", sections: "Sections present",
    action_verbs: "Action verbs", quantified_achievements: "Measured results", length: "Resume length" };
  Object.entries(labels).forEach(([key, label]) => {
    const value = Number(breakdown[key]) || 0;
    const item = document.createElement("div");
    item.className = "breakdown-item";
    item.append(textElement("span", "", label));
    const track = document.createElement("div");
    track.className = "breakdown-track";
    const fill = document.createElement("span");
    const maximum = key === "keywords" ? 20 : key === "role_relevance" ? 10 : key === "sections" ? 25 : key === "quantified_achievements" ? 15 : key === "formatting" ? 10 : key === "length" ? 10 : 10;
    fill.style.width = `${Math.min(100, value / maximum * 100)}%`;
    track.append(fill);
    item.append(track, textElement("strong", "", String(value)));
    list.append(item);
  });
  panel.append(list);
  const sections = document.createElement("div");
  sections.className = "section-status-list";
  sections.append(textElement("strong", "", "Sections present"));
  Object.entries(sectionsPresent).forEach(([name, present]) => {
    const item = textElement("span", `section-status${present ? " is-present" : " is-missing"}`,
      `${present ? "✓" : "–"} ${name[0].toUpperCase()}${name.slice(1)}`);
    sections.append(item);
  });
  panel.append(sections);
  return panel;
}

function buildSkills(matched, missing) {
  const panel = reportPanel("Skills for this role");
  const grid = document.createElement("div");
  grid.className = "skills-grid";
  grid.append(skillGroup("Matched skills", matched, false), skillGroup("Skills to build", missing, true));
  panel.append(grid);
  return panel;
}

function skillGroup(title, skills, missing) {
  const group = document.createElement("div");
  group.className = "skill-group";
  group.append(textElement("h4", "", title));
  const chips = document.createElement("div");
  chips.className = "chip-list";
  if (!skills.length) chips.append(textElement("span", "", "No skills identified"));
  skills.forEach((skill) => chips.append(textElement("span", `skill-chip${missing ? " missing" : ""}`, skill)));
  group.append(chips);
  return group;
}

function buildSuggestions(suggestions) {
  const panel = reportPanel("Practical ways to improve");
  const grid = document.createElement("div");
  grid.className = "suggestion-grid";
  addSuggestionCard(grid, "Skills to add", suggestions.skills_to_add || []);
  addSuggestionCard(grid, "Certifications to explore", (suggestions.certifications || []).map((entry) =>
    typeof entry === "string" ? entry : `${entry.name || "Certification"} · ${entry.provider || "Provider not listed"}`));
  addSuggestionCard(grid, "Projects to add", suggestions.projects || []);
  addSuggestionCard(grid, "Wording and format", suggestions.wording_fixes || []);
  panel.append(grid);
  return panel;
}

function addSuggestionCard(grid, title, items) {
  const card = document.createElement("article");
  card.className = "suggestion-card";
  const icons = { "Skills to add": "◇", "Certifications to explore": "▤", "Projects to add": "↗", "Wording and format": "¶" };
  card.append(textElement("h4", "", `${icons[title] || "·"}  ${title}`));
  const list = document.createElement("ul");
  (items.length ? items : ["No specific changes suggested."]).forEach((value) => {
    const item = document.createElement("li");
    item.textContent = typeof value === "string" ? value : JSON.stringify(value);
    list.append(item);
  });
  card.append(list);
  grid.append(card);
}

function buildPortals(portals, role) {
  const panel = reportPanel("Job portals for your role");
  const list = document.createElement("div");
  list.className = "portal-list";
  const safeRole = encodeURIComponent(role.trim().toLowerCase().replaceAll(" ", "-"));
  portals.forEach((portal) => {
    if (!portal.url || !/^https:\/\//i.test(portal.url)) return;
    const link = document.createElement("a");
    link.className = "portal-link";
    link.href = portal.url.replaceAll("{role}", safeRole);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.append(textElement("strong", "", portal.name || "Job portal"), textElement("span", "", portal.best_for || "Explore current openings."));
    list.append(link);
  });
  panel.append(list);
  return panel;
}

function buildResources() {
  const panel = reportPanel("ATS-friendly tools and tips");
  const links = document.createElement("div");
  links.className = "resource-inline";
  const resources = [
    ["Jobscan resume scanner", "https://www.jobscan.co/"],
    ["Resume Worded", "https://resumeworded.com/"],
    ["Zety resume builder", "https://zety.com/"],
    ["Canva resume templates", "https://www.canva.com/resumes/templates/"]
  ];
  resources.forEach(([label, url]) => {
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = label;
    links.append(link);
  });
  const tips = document.createElement("div");
  tips.className = "tips-box";
  tips.append(textElement("strong", "", "Quick ATS-friendly tips"), document.createTextNode("Use clear section headings, a simple one-column layout, standard fonts, and keywords that honestly match the job description. Avoid tables, text boxes, and important details in headers or footers."));
  panel.append(links, tips);
  return panel;
}

function reportPanel(title) {
  const panel = document.createElement("section");
  panel.className = "report-panel";
  panel.append(textElement("h3", "", title));
  return panel;
}

function textElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = String(text ?? "");
  return element;
}

function setLoading(button, loading, label) {
  button.disabled = loading;
  button.replaceChildren();
  if (loading) {
    const spinner = document.createElement("span");
    spinner.className = "spinner";
    spinner.setAttribute("aria-hidden", "true");
    button.append(spinner, document.createTextNode(label));
  } else {
    button.append(document.createElement("span"), document.createElement("span"));
    button.firstElementChild.textContent = label;
    button.lastElementChild.textContent = "→";
    button.lastElementChild.setAttribute("aria-hidden", "true");
  }
}