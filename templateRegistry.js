import { db, collection, onSnapshot, updateDoc, doc, serverTimestamp, setDoc } from "./firebase.js";

const els = {
  dash: document.getElementById("dash"),
  ordersViewBtn: document.getElementById("ordersViewBtn"),
  templatesViewBtn: document.getElementById("templatesViewBtn"),
  ordersShell: document.getElementById("ordersShell"),
  templatesShell: document.getElementById("templatesShell"),
  registerBtn: document.getElementById("registerTemplateBtn"),
  search: document.getElementById("templateRegistrySearch"),
  status: document.getElementById("templateRegistryStatusFilter"),
  list: document.getElementById("templateRegistryList"),
  workspace: document.getElementById("templateRegistryWorkspace")
};

if (els.ordersViewBtn && els.templatesViewBtn && els.templatesShell) {
  const REGISTRY_COLLECTION = "templates";
  const EVENTS = ["Wedding", "Reception", "Engagement", "Nikah", "Walima", "Mehendi", "Haldi", "Save the Date", "Other"];
  const STATUS_OPTIONS = ["All", "Draft", "Published", "Archived"];
  const state = {
    view: "orders",
    templates: [],
    selectedId: null,
    mode: "view",
    editingId: null,
    search: "",
    status: "All",
    error: "",
    unsub: null
  };

  init();

  function init() {
    hydrateStatusFilter();
    bind();
    startRealtime();
    syncView();
  }

  function bind() {
    els.ordersViewBtn.addEventListener("click", () => setView("orders"));
    els.templatesViewBtn.addEventListener("click", () => setView("templates"));
    els.registerBtn.addEventListener("click", () => openCreateForm());
    els.search.addEventListener("input", (e) => {
      state.search = String(e.target.value || "").trim().toLowerCase();
      renderList();
    });
    els.status.addEventListener("change", (e) => {
      state.status = e.target.value || "All";
      renderList();
    });
    els.list.addEventListener("click", onListClick);
    els.workspace.addEventListener("click", onWorkspaceClick);
    els.workspace.addEventListener("submit", onWorkspaceSubmit);
  }

  function hydrateStatusFilter() {
    els.status.innerHTML = STATUS_OPTIONS.map((label) => `<option value="${escapeHtml(label)}">${escapeHtml(label)}</option>`).join("");
    els.status.value = state.status;
  }

  function startRealtime() {
    if (state.unsub) state.unsub();
    state.unsub = onSnapshot(collection(db, REGISTRY_COLLECTION), (snap) => {
      state.error = "";
      state.templates = snap.docs.map(normalizeTemplate).sort(compareTemplates);
      if (!state.selectedId || !state.templates.some((item) => item.templateId === state.selectedId)) {
        state.selectedId = state.templates[0]?.templateId || null;
      }
      syncRuntimeTemplateLibrary();
      renderAll();
    }, (err) => {
      console.error(err);
      state.error = readableError(err);
      renderAll();
    });
  }

  function normalizeTemplate(snap) {
    const raw = snap.data() || {};
    const templateId = raw.templateId || snap.id;
    const folderKey = raw.folderKey || raw.rendererKey || raw.templateKey || `template${templateId}`;
    return {
      templateId,
      templateName: raw.templateName || folderKey,
      category: raw.category || "Invitation",
      status: raw.status || "Draft",
      folderKey,
      files: {
        html: raw.files?.html || "template.body.html",
        css: raw.files?.css || "template.css",
        js: raw.files?.js || "template.js"
      },
      features: {
        musicSupported: !!raw.features?.musicSupported,
        dynamicOpenGraphSupported: !!raw.features?.dynamicOpenGraphSupported
      },
      imageConfig: {
        galleryCount: Number(raw.imageConfig?.galleryCount || 0),
        brideCount: Number(raw.imageConfig?.brideCount || 0),
        groomCount: Number(raw.imageConfig?.groomCount || 0)
      },
      supportedEvents: Array.isArray(raw.supportedEvents) ? raw.supportedEvents : [],
      version: raw.version || "1.0.0",
      notes: raw.notes || "",
      publishedAt: raw.publishedAt || null,
      archivedAt: raw.archivedAt || null,
      createdAt: raw.createdAt || null,
      updatedAt: raw.updatedAt || null,
      docId: snap.id
    };
  }

  function compareTemplates(a, b) {
    const rank = { Published: 0, Draft: 1, Archived: 2 };
    const rankDiff = (rank[a.status] ?? 9) - (rank[b.status] ?? 9);
    if (rankDiff) return rankDiff;
    return b.templateId.localeCompare(a.templateId, undefined, { numeric: true, sensitivity: "base" });
  }

  function syncRuntimeTemplateLibrary() {
    const runtime = window.__INVIATA_TEMPLATE_LIBRARY__ || { defaultTemplateKey: "template1", templates: {} };
    runtime.templates = runtime.templates || {};
    state.templates.forEach((item) => {
      const existing = runtime.templates[item.folderKey] || {};
      const supportedTemplateIds = Array.from(new Set([...(Array.isArray(existing.supportedTemplateIds) ? existing.supportedTemplateIds : []), item.templateId]));
      runtime.templates[item.folderKey] = {
        ...existing,
        key: item.folderKey,
        label: item.templateName,
        supportedTemplateIds,
        references: Array.isArray(existing.references) ? existing.references : [],
        registry: {
          templateId: item.templateId,
          category: item.category,
          status: item.status,
          files: item.files,
          features: item.features,
          imageConfig: item.imageConfig,
          supportedEvents: item.supportedEvents,
          version: item.version,
          notes: item.notes
        }
      };
    });
    window.__INVIATA_TEMPLATE_LIBRARY__ = runtime;
  }

  function setView(view) {
    state.view = view;
    syncView();
  }

  function syncView() {
    const isTemplates = state.view === "templates";
    els.ordersShell.classList.toggle("hidden", isTemplates);
    els.templatesShell.classList.toggle("hidden", !isTemplates);
    els.ordersViewBtn.classList.toggle("active", !isTemplates);
    els.templatesViewBtn.classList.toggle("active", isTemplates);
    if (isTemplates) renderAll();
  }

  function renderAll() {
    renderList();
    renderWorkspace();
  }

  function filteredTemplates() {
    return state.templates.filter((item) => {
      const statusOk = state.status === "All" || item.status === state.status;
      const q = state.search;
      const searchOk = !q || [item.templateId, item.templateName, item.category, item.folderKey].some((value) => String(value || "").toLowerCase().includes(q));
      return statusOk && searchOk;
    });
  }

  function renderList() {
    const items = filteredTemplates();
    if (state.error) {
      els.list.innerHTML = `<section class="registry-list-empty"><div><h2 style="font-size:1.2rem;margin:0 0 8px;">Registry unavailable</h2><p class="registry-lead">${escapeHtml(state.error)}</p></div></section>`;
      return;
    }
    if (!items.length) {
      els.list.innerHTML = `<section class="registry-list-empty"><div><h2 style="font-size:1.2rem;margin:0 0 8px;">No templates</h2><p class="registry-lead">Register your first template to make it the single source of truth for future customer orders.</p></div></section>`;
      return;
    }
    els.list.innerHTML = items.map((item) => {
      const active = item.templateId === state.selectedId;
      return `<article class="template-card ${active ? "active" : ""}" data-template-select="${escapeHtml(item.templateId)}"><div class="template-card-head"><div><div class="template-id">${escapeHtml(item.templateId)}</div><div class="template-name">${escapeHtml(item.templateName)}</div></div><span class="badge ${statusClass(item.status)}">${escapeHtml(item.status)}</span></div><div class="template-meta"><span class="badge">${escapeHtml(item.category)}</span><span class="code-pill">${escapeHtml(item.folderKey)}</span></div></article>`;
    }).join("");
  }

  function renderWorkspace() {
    if (state.mode === "create") {
      els.workspace.innerHTML = renderForm(getEmptyTemplateDraft(), { title: "Register Template", submit: "Register Template", readOnlyId: false });
      return;
    }
    const selected = getSelectedTemplate();
    if (!selected) {
      els.workspace.innerHTML = `<section class="blank"><div><h2>Template Registry</h2><p>Create a template record to manage publish state, file bindings, image requirements, supported events, and generation metadata without touching the customer order workflow.</p></div></section>`;
      return;
    }
    if (state.mode === "edit") {
      els.workspace.innerHTML = renderForm(selected, { title: `Edit ${selected.templateId}`, submit: "Save Template", readOnlyId: true });
      return;
    }
    const templateBase = `templates/${selected.folderKey}`;
    els.workspace.innerHTML = `<section class="registry-panel"><section class="registry-section"><div class="head"><div><h2>${escapeHtml(selected.templateName)}</h2><p class="registry-lead">Permanent Template ID <strong>${escapeHtml(selected.templateId)}</strong> · canonical folder <strong>${escapeHtml(templateBase)}</strong></p></div><div class="registry-actions"><button class="ghost" type="button" data-template-edit="${escapeHtml(selected.templateId)}">Edit Template</button>${selected.status === "Published" ? `<button class="ghost" type="button" data-template-unpublish="${escapeHtml(selected.templateId)}">Unpublish</button>` : `<button class="btn" type="button" data-template-publish="${escapeHtml(selected.templateId)}">Publish</button>`}<button class="ghost" type="button" data-template-archive="${escapeHtml(selected.templateId)}">Archive</button></div></div><div class="registry-status-banner ${statusClass(selected.status)}"><strong>${escapeHtml(selected.status)}</strong> · registration metadata is stored in Firestore and the runtime template map is updated automatically so future orders can resolve this template by ID.</div></section><section class="registry-section"><h3>Core Metadata</h3><div class="registry-grid"><div class="registry-kv"><div class="k">Category</div><div class="v">${escapeHtml(selected.category)}</div></div><div class="registry-kv"><div class="k">Version</div><div class="v">${escapeHtml(selected.version)}</div></div><div class="registry-kv"><div class="k">Music Supported</div><div class="v">${selected.features.musicSupported ? "Yes" : "No"}</div></div><div class="registry-kv"><div class="k">Dynamic Open Graph</div><div class="v">${selected.features.dynamicOpenGraphSupported ? "Yes" : "No"}</div></div></div></section><section class="registry-section"><h3>Template Files</h3><div class="registry-files"><div class="registry-file-row"><div class="registry-kv"><div class="k">HTML</div><div class="v"><span class="code-pill">${escapeHtml(templateBase + "/" + selected.files.html)}</span></div></div><div class="registry-kv"><div class="k">CSS</div><div class="v"><span class="code-pill">${escapeHtml(templateBase + "/" + selected.files.css)}</span></div></div><div class="registry-kv"><div class="k">JS</div><div class="v"><span class="code-pill">${escapeHtml(templateBase + "/" + selected.files.js)}</span></div></div></div><p class="registry-note">These paths remain compatible with your existing <code>templates/&lt;folder&gt;/assets + template.body.html + template.css + template.js</code> architecture. Registration only stores canonical metadata; heavy resources can stay lazily prepared until the first order if your backend does not need them earlier.</p></div></section><section class="registry-section"><h3>Image Configuration</h3><div class="registry-grid"><div class="registry-kv"><div class="k">Gallery Images</div><div class="v">${selected.imageConfig.galleryCount}</div></div><div class="registry-kv"><div class="k">Bride Images</div><div class="v">${selected.imageConfig.brideCount}</div></div><div class="registry-kv"><div class="k">Groom Images</div><div class="v">${selected.imageConfig.groomCount}</div></div></div></section><section class="registry-section"><h3>Supported Events</h3><div class="template-meta">${selected.supportedEvents.length ? selected.supportedEvents.map((event) => `<span class="feature-pill">${escapeHtml(event)}</span>`).join("") : `<span class="registry-subtle">No events selected</span>`}</div></section><section class="registry-section"><h3>Notes</h3><div class="v">${selected.notes ? escapeHtmlMultiline(selected.notes) : `<span class="registry-subtle">No notes added</span>`}</div></section>`;
  }

  function renderForm(template, options) {
    const statusOptions = ["Draft", "Published", "Archived"].map((status) => `<option value="${escapeHtml(status)}" ${template.status === status ? "selected" : ""}>${escapeHtml(status)}</option>`).join("");
    return `<section class="registry-form-shell"><section class="registry-section"><div class="head"><div><h2>${escapeHtml(options.title)}</h2><p class="registry-lead">This module registers template metadata, canonical file bindings, publish state, and future generation requirements without changing the customer order flow.</p></div><div class="registry-actions"><button class="ghost" type="button" data-template-cancel>Cancel</button></div></div></section><form class="registry-form" data-template-form><input type="hidden" name="editingId" value="${escapeHtml(state.editingId || "")}" /><fieldset class="registry-fieldset"><legend>Basic Information</legend><div class="registry-form-grid"><div class="registry-field"><label>Template ID</label><input name="templateId" value="${escapeHtml(template.templateId)}" ${options.readOnlyId ? "readonly" : ""} placeholder="T009" required /></div><div class="registry-field"><label>Template Name</label><input name="templateName" value="${escapeHtml(template.templateName)}" placeholder="Royal Gold Wedding" required /></div><div class="registry-field"><label>Category</label><input name="category" value="${escapeHtml(template.category)}" placeholder="Invitation" required /></div><div class="registry-field"><label>Status</label><select name="status">${statusOptions}</select></div><div class="registry-field"><label>Folder Key</label><input name="folderKey" value="${escapeHtml(template.folderKey)}" placeholder="template2" required /></div><div class="registry-field"><label>Version</label><input name="version" value="${escapeHtml(template.version)}" placeholder="1.0.0" /></div></div></fieldset><fieldset class="registry-fieldset"><legend>Template Files</legend><div class="registry-form-grid"><div class="registry-field"><label>HTML File</label><input name="htmlFile" value="${escapeHtml(template.files.html)}" placeholder="template.body.html" required /></div><div class="registry-field"><label>CSS File</label><input name="cssFile" value="${escapeHtml(template.files.css)}" placeholder="template.css" required /></div><div class="registry-field"><label>JS File</label><input name="jsFile" value="${escapeHtml(template.files.js)}" placeholder="template.js" required /></div></div><p class="registry-note">The registry stores file bindings for the existing folder structure: <strong>templates/&lt;folderKey&gt;/assets</strong> plus the three template files above.</p></fieldset><fieldset class="registry-fieldset"><legend>Features</legend><div class="registry-checkboxes"><label class="registry-check"><input type="checkbox" name="musicSupported" ${template.features.musicSupported ? "checked" : ""} /> Music Supported</label><label class="registry-check"><input type="checkbox" name="dynamicOpenGraphSupported" ${template.features.dynamicOpenGraphSupported ? "checked" : ""} /> Dynamic Open Graph Supported</label></div></fieldset><fieldset class="registry-fieldset"><legend>Image Configuration</legend><div class="registry-form-grid"><div class="registry-field"><label>Gallery Images</label><input name="galleryCount" type="number" min="0" value="${escapeHtml(String(template.imageConfig.galleryCount))}" /></div><div class="registry-field"><label>Bride Images</label><input name="brideCount" type="number" min="0" value="${escapeHtml(String(template.imageConfig.brideCount))}" /></div><div class="registry-field"><label>Groom Images</label><input name="groomCount" type="number" min="0" value="${escapeHtml(String(template.imageConfig.groomCount))}" /></div></div></fieldset><fieldset class="registry-fieldset"><legend>Supported Events</legend><div class="registry-checkboxes">${EVENTS.map((event) => `<label class="registry-check"><input type="checkbox" name="supportedEvents" value="${escapeHtml(event)}" ${template.supportedEvents.includes(event) ? "checked" : ""} /> ${escapeHtml(event)}</label>`).join("")}</div></fieldset><fieldset class="registry-fieldset"><legend>Additional</legend><div class="registry-field"><label>Notes</label><textarea name="notes" placeholder="Implementation notes, backend preparation notes, or future renderer details">${escapeHtml(template.notes)}</textarea></div></fieldset><div class="registry-actions"><button class="btn" type="submit">${escapeHtml(options.submit)}</button><button class="ghost" type="button" data-template-cancel>Cancel</button></div></form></section>`;
  }

  function onListClick(e) {
    const card = e.target.closest("[data-template-select]");
    if (!card) return;
    state.selectedId = card.dataset.templateSelect || null;
    state.mode = "view";
    state.editingId = null;
    renderAll();
  }

  function onWorkspaceClick(e) {
    const publishBtn = e.target.closest("[data-template-publish]");
    if (publishBtn) return quickStatusUpdate(publishBtn.dataset.templatePublish, "Published");
    const unpublishBtn = e.target.closest("[data-template-unpublish]");
    if (unpublishBtn) return quickStatusUpdate(unpublishBtn.dataset.templateUnpublish, "Draft");
    const archiveBtn = e.target.closest("[data-template-archive]");
    if (archiveBtn) return quickStatusUpdate(archiveBtn.dataset.templateArchive, "Archived");
    const editBtn = e.target.closest("[data-template-edit]");
    if (editBtn) {
      state.selectedId = editBtn.dataset.templateEdit || null;
      state.editingId = state.selectedId;
      state.mode = "edit";
      renderWorkspace();
      return;
    }
    if (e.target.closest("[data-template-cancel]")) {
      state.mode = "view";
      state.editingId = null;
      renderWorkspace();
    }
  }

  async function onWorkspaceSubmit(e) {
    const form = e.target.closest("[data-template-form]");
    if (!form) return;
    e.preventDefault();
    const formData = new FormData(form);
    const templateId = normalizeTemplateId(formData.get("templateId"));
    const folderKey = normalizeFolderKey(formData.get("folderKey"));
    if (!templateId) return alert("Template ID is required.");
    if (!folderKey) return alert("Folder Key is required.");
    const isEdit = !!state.editingId;
    if (!isEdit && state.templates.some((item) => item.templateId === templateId)) {
      return alert("This Template ID already exists.");
    }
    if (state.templates.some((item) => item.folderKey === folderKey && item.templateId !== templateId)) {
      return alert("This Folder Key is already registered to another template.");
    }
    const supportedEvents = formData.getAll("supportedEvents").map((value) => String(value || "").trim()).filter(Boolean);
    const payload = {
      templateId,
      templateName: String(formData.get("templateName") || "").trim(),
      category: String(formData.get("category") || "").trim() || "Invitation",
      status: String(formData.get("status") || "Draft").trim() || "Draft",
      folderKey,
      rendererKey: folderKey,
      supportedTemplateIds: [templateId],
      files: {
        html: String(formData.get("htmlFile") || "template.body.html").trim() || "template.body.html",
        css: String(formData.get("cssFile") || "template.css").trim() || "template.css",
        js: String(formData.get("jsFile") || "template.js").trim() || "template.js"
      },
      features: {
        musicSupported: formData.get("musicSupported") === "on",
        dynamicOpenGraphSupported: formData.get("dynamicOpenGraphSupported") === "on"
      },
      imageConfig: {
        galleryCount: toNonNegativeNumber(formData.get("galleryCount")),
        brideCount: toNonNegativeNumber(formData.get("brideCount")),
        groomCount: toNonNegativeNumber(formData.get("groomCount"))
      },
      supportedEvents,
      version: String(formData.get("version") || "1.0.0").trim() || "1.0.0",
      notes: String(formData.get("notes") || "").trim(),
      bindings: {
        templateBasePath: `templates/${folderKey}`,
        htmlPath: `templates/${folderKey}/${String(formData.get("htmlFile") || "template.body.html").trim() || "template.body.html"}`,
        cssPath: `templates/${folderKey}/${String(formData.get("cssFile") || "template.css").trim() || "template.css"}`,
        jsPath: `templates/${folderKey}/${String(formData.get("jsFile") || "template.js").trim() || "template.js"}`,
        autoPreparedForOrders: true,
        resourcesStrategy: "lazy-compatible"
      },
      sourceOfTruth: true,
      updatedAt: serverTimestamp(),
      ...(isEdit ? {} : { createdAt: serverTimestamp() }),
      ...(String(formData.get("status") || "Draft").trim() === "Published" ? { publishedAt: serverTimestamp() } : {}),
      ...(String(formData.get("status") || "Draft").trim() === "Archived" ? { archivedAt: serverTimestamp() } : {})
    };
    try {
      await setDoc(doc(db, REGISTRY_COLLECTION, templateId), payload, { merge: true });
      state.selectedId = templateId;
      state.editingId = null;
      state.mode = "view";
    } catch (err) {
      console.error(err);
      alert(readableError(err));
    }
  }

  async function quickStatusUpdate(templateId, nextStatus) {
    if (!templateId) return;
    try {
      const payload = { status: nextStatus, updatedAt: serverTimestamp() };
      if (nextStatus === "Published") payload.publishedAt = serverTimestamp();
      if (nextStatus === "Archived") payload.archivedAt = serverTimestamp();
      await updateDoc(doc(db, REGISTRY_COLLECTION, templateId), payload);
      state.selectedId = templateId;
      state.mode = "view";
      state.editingId = null;
    } catch (err) {
      console.error(err);
      alert(readableError(err));
    }
  }

  function openCreateForm() {
    state.mode = "create";
    state.editingId = null;
    renderWorkspace();
  }

  function getSelectedTemplate() {
    return state.templates.find((item) => item.templateId === state.selectedId) || null;
  }

  function getEmptyTemplateDraft() {
    const nextId = suggestNextTemplateId();
    return {
      templateId: nextId,
      templateName: "",
      category: "Invitation",
      status: "Draft",
      folderKey: suggestFolderKey(),
      files: { html: "template.body.html", css: "template.css", js: "template.js" },
      features: { musicSupported: false, dynamicOpenGraphSupported: false },
      imageConfig: { galleryCount: 0, brideCount: 0, groomCount: 0 },
      supportedEvents: [],
      version: "1.0.0",
      notes: ""
    };
  }

  function suggestNextTemplateId() {
    const ids = new Set();
    state.templates.forEach((item) => ids.add(item.templateId));
    const runtime = window.__INVIATA_TEMPLATE_LIBRARY__ || {};
    Object.values(runtime.templates || {}).forEach((item) => {
      (item.supportedTemplateIds || []).forEach((id) => ids.add(id));
    });
    let max = 0;
    ids.forEach((id) => {
      const match = String(id || "").match(/T(\d+)/i);
      if (match) max = Math.max(max, Number(match[1]));
    });
    return `T${String(max + 1).padStart(3, "0")}`;
  }

  function suggestFolderKey() {
    const used = new Set(state.templates.map((item) => item.folderKey));
    let index = 1;
    while (used.has(`template${index}`)) index += 1;
    return `template${index}`;
  }

  function normalizeTemplateId(value) {
    const raw = String(value || "").trim().toUpperCase();
    if (!raw) return "";
    if (/^T\d+$/.test(raw)) return `T${raw.slice(1).padStart(3, "0")}`;
    const digits = raw.replace(/\D+/g, "");
    return digits ? `T${digits.padStart(3, "0")}` : raw;
  }

  function normalizeFolderKey(value) {
    return String(value || "").trim().replace(/\s+/g, "-").toLowerCase();
  }

  function toNonNegativeNumber(value) {
    const num = Number(value || 0);
    return Number.isFinite(num) && num > 0 ? Math.floor(num) : 0;
  }

  function statusClass(status) {
    return String(status || "Draft").trim().toLowerCase().replace(/\s+/g, "-");
  }

  function readableError(err) {
    const code = String(err?.code || "");
    if (code.includes("permission-denied")) return "Firestore rules are blocking template registry access.";
    if (code.includes("unavailable")) return "Network connection is unavailable right now.";
    return err?.message || "Something went wrong while updating the template registry.";
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>\"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  }

  function escapeHtmlMultiline(value) {
    return escapeHtml(value).replace(/\n/g, "<br />");
  }
}
