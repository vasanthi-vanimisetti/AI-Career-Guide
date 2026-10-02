"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.querySelector(".nav-toggle");
  const navigation = document.querySelector(".main-nav");
  if (toggle && navigation) {
    toggle.addEventListener("click", () => {
      const expanded = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!expanded));
      navigation.classList.toggle("is-open", !expanded);
    });
  }

  if (document.querySelector("#plan-history")) loadHistory();
});

async function loadHistory() {
  const plansTarget = document.querySelector("#plan-history");
  const analysesTarget = document.querySelector("#analysis-history");
  const errorTarget = document.querySelector("#history-error");
  try {
    const response = await fetch("/api/history");
    if (!response.ok) throw new Error("History could not be loaded. Refresh the page to try again.");
    const history = await response.json();
    const plans = [...(history.plans || [])].reverse();
    const analyses = [...(history.analyses || [])].reverse();
    renderHistoryList(plansTarget, plans, "No career plans yet.", (record) => ({
      title: record.role || "Career plan", detail: `${record.name || "Learner"} · ${formatDate(record.created_at)}`,
      outcome: record.offline ? "Offline plan" : "30-day plan"
    }));
    renderHistoryList(analysesTarget, analyses, "No resume reviews yet.", (record) => ({
      title: record.role || "Resume review", detail: `${record.filename || "Resume"} · ${formatDate(record.created_at)}`,
      outcome: `${record.result?.ats_score ?? 0}/100 ATS`
    }));
  } catch (error) {
    if (errorTarget) errorTarget.textContent = error.message || "History could not be loaded.";
  }
}

function renderHistoryList(target, records, emptyMessage, mapRecord) {
  target.replaceChildren();
  if (!records.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = emptyMessage;
    target.append(empty);
    return;
  }
  records.forEach((record) => {
    const details = mapRecord(record);
    const item = document.createElement("article");
    item.className = "history-item";
    const text = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = details.title;
    const subtitle = document.createElement("small");
    subtitle.textContent = details.detail;
    const outcome = document.createElement("span");
    outcome.className = "history-score";
    outcome.textContent = details.outcome;
    text.append(title, subtitle);
    item.append(text, outcome);
    target.append(item);
  });
}

function formatDate(value) {
  if (!value) return "Date not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date not available" : date.toLocaleString();
}