// =============================================================================
//  templateLoader.js
//
//  Universal, production-ready loader for templates/* folders.
//
//  Fixes the original symptom (404 on template.css / template.js / assets) by
//  never letting the browser resolve the fetched template's relative URLs
//  against index.html. Every relative URL is rewritten against the template
//  folder's absolute base URL, and template.js is loaded as a real executing
//  ES module (not as an innerHTML-ignored script string).
//
//  Scalability:
//    - No template name or template path is hardcoded.
//    - Pass any folder name (template1, template2, ..., template100, ...) and
//      the loader handles it. Switching among them is supported via dispose().
//
//  What it injects and how:
//    1) CSS: appended to document.head as a real <link rel="stylesheet">,
//       with its href resolved against the template folder.
//    2) JS: loaded via dynamic import() of the template folder's template.js
//       so it actually executes (innerHTML-injected scripts do NOT execute in
//       browsers). If the template exports a default `init(root, base)` that
//       gets called too. Real <script type="module"> is used as fallback.
//    3) HTML body: appended to the given container, with every relative URL
//       (src, href, srcset, poster, action, style url(), ...) rewritten
//       against the template folder's absolute URL. So images, audio, video,
//       fonts and assets/* all load with zero hardcoded paths.
//
//  Lifecycle:
//    - loadInto(name, container)  -> injects everything, returns the base URL
//    - dispose(container)         -> removes every injected node & clears
//    - isLoaded(name)             -> true if `name` has been loaded already
// =============================================================================

const ABS_URL = /^(?:[a-z][a-z0-9+.-]*:)?\/\//i;

function isAbs(u) {
  if (!u) return true;
  const s = String(u).trim();
  if (!s) return true;
  if (s.startsWith("//")) return true;
  if (ABS_URL.test(s)) return true;
  if (s.startsWith("data:") || s.startsWith("blob:") || s.startsWith("javascript:")) return true;
  return false;
}

function abs(href, base) {
  try { return new URL(href, base).href; }
  catch { return href; }
}

function rewriteSrcset(value, base) {
  if (!value) return value;
  return String(value)
    .split(",")
    .map((part) => {
      const trimmed = part.trim();
      if (!trimmed) return part;
      const [url, ...rest] = trimmed.split(/\s+/);
      const out = isAbs(url) ? url : abs(url, base);
      return rest.length ? `${out} ${rest.join(" ")}` : out;
    })
    .join(", ");
}

function rewriteCssUrls(cssText, base) {
  if (!cssText) return cssText;
  return cssText.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (_m, q, url) =>
    `url(${q}${isAbs(url) ? url : abs(url, base)}${q})`
  );
}

const URL_ATTRS = ["src", "href", "poster", "data-src", "data-href", "action", "formaction"];
const META_URL_KEYS = new Set([
  "og:url",
  "og:image",
  "og:image:url",
  "og:image:secure_url",
  "twitter:url",
  "twitter:image",
  "twitter:image:src",
  "msapplication-tileimage"
]);

function metaContentShouldBeUrl(meta) {
  if (!meta) return false;
  const key = (
    meta.getAttribute("property") ||
    meta.getAttribute("name") ||
    meta.getAttribute("itemprop") ||
    ""
  ).trim().toLowerCase();
  return META_URL_KEYS.has(key);
}

function rewriteNode(node, base) {
  if (!node || node.nodeType !== 1 || !node.attributes) return;
  for (const attr of URL_ATTRS) {
    if (!node.hasAttribute(attr)) continue;
    const v = node.getAttribute(attr);
    if (!v) continue;
    node.setAttribute(attr, isAbs(v) ? v : abs(v, base));
  }
  if (node.hasAttribute("srcset")) {
    node.setAttribute("srcset", rewriteSrcset(node.getAttribute("srcset"), base));
  }
  const style = node.getAttribute("style");
  if (style && /url\(/i.test(style)) {
    node.setAttribute("style", rewriteCssUrls(style, base));
  }
}

function walkAndRewrite(root, base) {
  rewriteNode(root, base);
  const all = typeof root.querySelectorAll === "function"
    ? root.querySelectorAll("*") : [];
  for (const el of all) rewriteNode(el, base);
}

async function fetchText(url) {
  const res = await fetch(url, {
    cache: "no-store",
    credentials: "same-origin"
  });
  if (!res.ok) throw new Error(`TemplateLoader: failed to fetch ${url}: ${res.status} ${res.statusText}`);
  return await res.text();
}

export class TemplateLoader {
  constructor(opts = {}) {
    this.document = opts.document || (typeof document !== "undefined" ? document : null);
    this._injectedHead = [];
    this._injectedScripts = [];
    this._base = null;
    this._name = null;
    this._loadedNames = new Set();
  }

  _requireDocument() {
    if (!this.document) throw new Error("TemplateLoader: no document available in this environment");
  }

  baseUrl()       { return this._base; }
  templateName()  { return this._name; }
  isLoaded(name)  { return this._loadedNames.has(name); }

  /**
   * Absolute URL for any file inside a template folder.
   * Only the folder name varies; the file path is the only other argument.
   */
  urlFor(templateName, file = "template.body.html") {
    this._requireDocument();
    return new URL(`./templates/${encodeURIComponent(templateName)}/${file}`, this.document.baseURI).href;
  }

  /**
   * Fetch the raw template.body.html (or any file) as text - used by code
   * that needs the string for placeholder replacement (no DOM is injected).
   */
  async fetchText(templateName, file = "template.body.html") {
    return await fetchText(this.urlFor(templateName, file));
  }

  /**
   * Fully load a template into `container`:
   *   1) Fetch template.body.html and parse it with DOMParser.
   *   2) Move <head> children (CSS link, meta, preconnect, ...) into
   *      document.head with their hrefs rewritten against the template
   *      folder's base URL.
   *   3) Move <body> children into the container, with every relative URL
   *      rewritten against the template folder's base URL. <script> tags
   *      in the fetched body are intentionally NOT injected (innerHTML-
   *      injected scripts don't execute, and the relative src would 404).
   *   4) Load template.js as a real ES module via dynamic import() so it
   *      actually executes; if it exports a default `init(root, base)`
   *      function, that gets called with the container and the base URL.
   *      Falls back to a real <script type="module"> element if dynamic
   *      import is unavailable.
   */
  async loadInto(templateName, container) {
    this._requireDocument();
    if (!container) throw new Error("TemplateLoader.loadInto: container is required");

    // Reset any prior load so switching templates is safe (no leaks, no
    // duplicate event listeners).
    await this.dispose(container);

    const base = new URL(
      `./templates/${encodeURIComponent(templateName)}/`,
      this.document.baseURI
    ).href;
    this._base = base;
    this._name = templateName;

    // 1) HTML body
    const html    = await fetchText(base + "template.body.html");
    const parsed  = new DOMParser().parseFromString(html, "text/html");

    // 2) <head> children (links, metas, preconnects...) -- CSS as a real stylesheet
    for (const node of [...parsed.head.children]) {
      if (node.tagName === "SCRIPT") continue;
      const clone = node.cloneNode(true);
      if (clone.tagName === "LINK") {
        const href = clone.getAttribute("href");
        if (href) clone.setAttribute("href", isAbs(href) ? href : abs(href, base));
      } else if (clone.tagName === "STYLE") {
        clone.textContent = rewriteCssUrls(clone.textContent, base);
      } else if (clone.tagName === "META") {
        const content = clone.getAttribute("content");
        if (content && metaContentShouldBeUrl(clone) && !isAbs(content)) {
          clone.setAttribute("content", abs(content, base));
        }
      }
      this.document.head.appendChild(clone);
      this._injectedHead.push(clone);
    }

    // 3) <body> children -- scripts dropped here (replaced by step 4)
    const frag = this.document.createDocumentFragment();
    for (const node of [...parsed.body.children]) {
      if (node.tagName === "SCRIPT") continue;
      const clone = node.cloneNode(true);
      walkAndRewrite(clone, base);
      frag.appendChild(clone);
    }
    container.appendChild(frag);

    // 4) Load template.js as an executing ES module.
    await this._loadScript(base + "template.js", container, base);

    // 5) Defensive second pass for any nodes the template JS injected.
    walkAndRewrite(container, base);

    this._loadedNames.add(templateName);
    return base;
  }

  /** Load template.js. Tries dynamic import() first; falls back to a real
   *  <script type="module"> element. If the template exports a default
   *  init(root, base) function, that gets called with the container. */
  async _loadScript(src, root, base) {
    try {
      const mod = await import(/* @vite-ignore */ src);
      if (mod && typeof mod.init === "function") {
        try { await mod.init(root, base); } catch (e) { console.error("[TemplateLoader] init() threw:", e); }
      }
      return;
    } catch (e) {
      console.warn("[TemplateLoader] dynamic import failed, falling back to <script>:", e);
    }

    await new Promise((resolve, reject) => {
      const s = this.document.createElement("script");
      s.type = "module";
      s.src = src;
      s.dataset.templateLoader = "1";
      s.onload  = () => resolve();
      s.onerror = () => reject(new Error(`TemplateLoader: failed to load script ${src}`));
      this.document.head.appendChild(s);
      this._injectedScripts.push(s);
    });
  }

  /** Remove every node the loader injected; safe to call repeatedly. */
  async dispose(container) {
    this._requireDocument();
    for (const n of this._injectedHead)     { try { n.parentNode && n.parentNode.removeChild(n); } catch {} }
    for (const n of this._injectedScripts)  { try { n.parentNode && n.parentNode.removeChild(n); } catch {} }
    this._injectedHead = [];
    this._injectedScripts = [];
    this._base = null;
    this._name = null;
    if (container) container.innerHTML = "";
  }
}

/** Default singleton for callers that don't need explicit lifecycle control. */
let _singleton = null;
export function getTemplateLoader(opts = {}) {
  if (!_singleton) _singleton = new TemplateLoader(opts);
  return _singleton;
}
