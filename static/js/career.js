"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("#career-form");
  if (!form) return;
  const result = document.querySelector("#career-result");
  const error = document.querySelector("#career-error");
  const message = document.querySelector("#plan-message");
  const messageText = message.querySelector("span");
  const submit = form.querySelector("button[type='submit']");
  let lastPayload = null;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.textContent = "";
    if (!form.reportValidity()) return;
    lastPayload = {
      name: form.elements.name.value.trim(),
      role: form.elements.role.value.trim(),
      skills: form.elements.skills.value.trim(),
      hours: form.elements.hours.value
    };
    await requestPlan(lastPayload);
  });

  document.querySelector("#retry-plan").addEventListener("click", () => {
    if (lastPayload) requestPlan(lastPayload);
  });
  document.querySelector("#print-plan").addEventListener("click", () => window.print());

  async function requestPlan(payload) {
    setLoading(submit, true, "Building your plan...");
    message.hidden = true;
    try {
      const response = await fetch("/api/career-plan", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Your plan could not be created. Please try again.");
      renderPlan(data.plan, data.id);
      result.hidden = false;
      document.querySelector("#plan-offline").hidden = !data.offline;
      if (data.offline) showNotice(data.message || "Gemini is unavailable. This plan was created with local career data.");
      else message.hidden = true;
      result.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (requestError) {
      result.hidden = false;
      showNotice(requestError.message || "We could not reach the server. Check your connection and retry.", true);
    } finally {
      setLoading(submit, false, "Build my 30-day plan");
    }
  }

  function showNotice(text, isError = false) {
    messageText.textContent = text;
    message.classList.toggle("error-notice", isError);
    message.hidden = false;
  }
});

function renderPlan(plan, id) {
  const list = document.querySelector("#week-list");
  list.replaceChildren();
  const weeks = Array.isArray(plan.weeks) ? plan.weeks : [];
  weeks.forEach((week, weekIndex) => {
    const details = document.createElement("details");
    details.className = "week-section";
    details.open = weekIndex === 0;
    const summary = document.createElement("summary");
    const index = textElement("span", "week-index", String(weekIndex + 1).padStart(2, "0"));
    const titleWrap = document.createElement("span");
    titleWrap.className = "week-title";
    titleWrap.append(textElement("strong", "", week.title || `Week ${weekIndex + 1}`));
    titleWrap.append(textElement("small", "", week.theme || "Learning and practice"));
    summary.append(index, titleWrap, textElement("span", "week-chevron", "⌄"));
    const dayList = document.createElement("div");
    dayList.className = "day-list";
    (Array.isArray(week.days) ? week.days : []).forEach((day) => dayList.append(createDayCard(day, id)));
    details.append(summary, dayList);
    list.append(details);
  });

  const gaps = document.querySelector("#skill-gaps");
  gaps.replaceChildren();
  if (Array.isArray(plan.skill_gaps) && plan.skill_gaps.length) {
    gaps.hidden = false;
    const title = textElement("strong", "", "Skills to build:");
    gaps.append(title, document.createTextNode(plan.skill_gaps.join(" · ")));
  } else gaps.hidden = true;

  const checklist = document.querySelector("#final-checklist");
  checklist.replaceChildren(textElement("h3", "", "Your final checklist"));
  const items = document.createElement("ul");
  (Array.isArray(plan.final_checklist) ? plan.final_checklist : []).forEach((entry) => {
    const item = document.createElement("li");
    item.textContent = entry;
    items.append(item);
  });
  checklist.append(items);
  updateProgress(id);
}

function createDayCard(day, planId) {
  const card = document.createElement("article");
  card.className = "day-card";
  const top = document.createElement("div");
  top.className = "day-card-top";
  top.append(textElement("span", "day-label", `DAY ${day.day}`));
  top.append(textElement("span", "day-hours", `${day.estimated_hours || 1} hour${Number(day.estimated_hours) === 1 ? "" : "s"}`));
  card.append(top, textElement("h4", "", day.topic || "Learning practice"));
  card.append(textElement("p", "", day.practice || "Practice this topic and note what you learned."));

  const links = document.createElement("div");
  links.className = "day-links";
  (Array.isArray(day.resources) ? day.resources.slice(0, 2) : []).forEach((resource) => {
    if (!resource.url || !/^https:\/\//i.test(resource.url)) return;
    const link = document.createElement("a");
    link.href = resource.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = resource.label || "Learning resource";
    links.append(link);
  });
  if (links.childElementCount) card.append(links);

  const checkboxLabel = document.createElement("label");
  checkboxLabel.className = "day-complete";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.dataset.day = String(day.day);
  checkbox.checked = getCompletedDays(planId).includes(String(day.day));
  checkbox.addEventListener("change", () => {
    const completed = new Set(getCompletedDays(planId));
    if (checkbox.checked) completed.add(String(day.day));
    else completed.delete(String(day.day));
    localStorage.setItem(progressKey(planId), JSON.stringify([...completed]));
    updateProgress(planId);
  });
  checkboxLabel.append(checkbox, document.createTextNode("Day complete"));
  card.append(checkboxLabel);
  return card;
}

function updateProgress(planId) {
  const count = getCompletedDays(planId).length;
  const bar = document.querySelector("#plan-progress");
  bar.style.width = `${Math.min(100, count / 30 * 100)}%`;
  bar.setAttribute("aria-valuenow", String(count));
  document.querySelector("#plan-progress-text").textContent = `${count} of 30 days`;
}

function getCompletedDays(planId) {
  try { return JSON.parse(localStorage.getItem(progressKey(planId)) || "[]"); }
  catch { return []; }
}

function progressKey(planId) { return `pathfinder-plan-${planId}`; }

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