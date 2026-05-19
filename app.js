const REPO_OWNER = "skywalkerjack";
const REPO_NAME = "KnowledgeNotebook";
const BRANCH = "main";
const NOTE_ROOT = "content";
const TREE_API = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/trees/${BRANCH}?recursive=1`;
const RAW_BASE = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}`;
const CDN_BASE = `https://cdn.jsdelivr.net/gh/${REPO_OWNER}/${REPO_NAME}@${BRANCH}`;
const BLOB_API_BASE = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/blobs`;
const NOTE_CACHE_PREFIX = "knowledge-note:";
const REQUEST_TIMEOUT_MS = 8000;

const noteCache = new Map();

const state = {
  categories: [],
  currentCategory: "",
  currentNotePath: "",
  search: "",
  catalogOpen: false,
};

const els = {
  searchInput: document.querySelector("#searchInput"),
  categoryList: document.querySelector("#categoryList"),
  categoryMeta: document.querySelector("#categoryMeta"),
  categoryTitle: document.querySelector("#categoryTitle"),
  statusMessage: document.querySelector("#statusMessage"),
  noteList: document.querySelector("#noteList"),
  refreshButton: document.querySelector("#refreshButton"),
  catalogToggle: document.querySelector("#catalogToggle"),
  reader: document.querySelector(".reader"),
  readerEmpty: document.querySelector("#readerEmpty"),
  readerLoading: document.querySelector("#readerLoading"),
  readerError: document.querySelector("#readerError"),
  articleMeta: document.querySelector("#articleMeta"),
  articleBody: document.querySelector("#articleBody"),
};

init();

function init() {
  els.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    render();
  });

  els.refreshButton.addEventListener("click", () => {
    loadRepository();
  });

  els.catalogToggle.addEventListener("click", () => {
    setCatalogOpen(!state.catalogOpen);
  });

  window.matchMedia("(min-width: 681px)").addEventListener("change", (event) => {
    if (event.matches) {
      setCatalogOpen(true);
    } else {
      setCatalogOpen(false);
    }
  });

  setCatalogOpen(window.matchMedia("(min-width: 681px)").matches);
  loadRepository();
}

async function loadRepository() {
  setStatus("正在遍历 GitHub 仓库...", false);
  els.refreshButton.disabled = true;

  try {
    const response = await fetch(`${TREE_API}&t=${Date.now()}`, {
      headers: { Accept: "application/vnd.github+json" },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`GitHub API 返回 ${response.status}`);
    }

    const data = await response.json();

    if (data.truncated) {
      setStatus("仓库文件较多，GitHub 返回的目录被截断了；当前只展示已返回的笔记。", false);
    }

    state.categories = buildCategories(data.tree || []);
    if (!state.categories.some((category) => category.name === state.currentCategory)) {
      state.currentCategory = state.categories[0]?.name || "";
    }

    render();

    if (!state.categories.length) {
      setStatus("仓库根目录下还没有找到“分类/笔记.md”格式的内容。", false);
    } else if (!data.truncated) {
      setStatus(`已读取 ${countNotes(state.categories)} 篇笔记。`, false);
    }
  } catch (error) {
    console.error(error);
    setStatus(`读取 GitHub 仓库失败：${error.message}。请稍后刷新，或确认仓库仍为公开状态。`, true);
  } finally {
    els.refreshButton.disabled = false;
  }
}

function buildCategories(tree) {
  const grouped = new Map();

  tree
    .filter((item) => item.type === "blob" && isTopLevelMarkdown(item.path))
    .forEach((item) => {
      const [, categoryName, fileName] = item.path.split("/");
      const note = {
        title: stripMarkdownExtension(fileName),
        fileName,
        path: item.path,
        sha: item.sha,
        size: item.size || 0,
      };

      if (!grouped.has(categoryName)) {
        grouped.set(categoryName, []);
      }

      grouped.get(categoryName).push(note);
    });

  return Array.from(grouped.entries())
    .map(([name, notes]) => ({
      name,
      notes: notes.sort((a, b) => a.title.localeCompare(b.title, "zh-CN")),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}

function isTopLevelMarkdown(path) {
  const parts = path.split("/");
  return parts.length === 3 && parts[0] === NOTE_ROOT && parts[2].toLowerCase().endsWith(".md");
}

function stripMarkdownExtension(fileName) {
  return fileName.replace(/\.md$/i, "");
}

function render() {
  renderCatalogDisclosure();
  renderCategories();
  renderNotes();
}

function setCatalogOpen(isOpen) {
  state.catalogOpen = isOpen;
  document.body.classList.toggle("catalog-open", isOpen);
  document.body.classList.toggle("catalog-collapsed", !isOpen);
  renderCatalogDisclosure();
}

function renderCatalogDisclosure() {
  els.catalogToggle.textContent = state.catalogOpen ? "收起目录" : "展开目录";
  els.catalogToggle.setAttribute("aria-expanded", String(state.catalogOpen));
}

function renderCategories() {
  els.categoryList.innerHTML = "";

  if (!state.categories.length) {
    els.categoryList.innerHTML = `<p class="status-message">暂无分类</p>`;
    return;
  }

  const categories = filterCategories();

  categories.forEach((category) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `category-button${category.name === state.currentCategory ? " active" : ""}`;
    button.innerHTML = `
      <span>${escapeHtml(category.name)}</span>
      <span class="category-count">${category.notes.length}</span>
    `;
    button.addEventListener("click", () => {
      state.currentCategory = category.name;
      state.currentNotePath = "";
      resetReader();
      render();
    });
    els.categoryList.appendChild(button);
  });
}

function renderNotes() {
  const categories = filterCategories();
  const selected =
    categories.find((category) => category.name === state.currentCategory) || categories[0] || null;

  if (selected && selected.name !== state.currentCategory) {
    state.currentCategory = selected.name;
  }

  els.noteList.innerHTML = "";
  els.categoryTitle.textContent = selected?.name || "暂无笔记";
  els.categoryMeta.textContent = selected ? `${selected.notes.length} 篇笔记` : "未找到内容";

  if (!selected) {
    els.noteList.innerHTML = `<p class="status-message">没有匹配的分类或笔记。</p>`;
    return;
  }

  if (!selected.notes.length) {
    els.noteList.innerHTML = `<p class="status-message">这个分类下暂时没有 md 笔记。</p>`;
    return;
  }

  selected.notes.forEach((note) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `note-button${note.path === state.currentNotePath ? " active" : ""}`;
    button.innerHTML = `
      <span class="note-title">${highlight(note.title, state.search)}</span>
    `;
    button.addEventListener("click", () => loadNote(note, selected.name));
    els.noteList.appendChild(button);
  });
}

function filterCategories() {
  if (!state.search) {
    return state.categories;
  }

  return state.categories
    .map((category) => {
      const categoryMatches = category.name.toLowerCase().includes(state.search);
      const notes = categoryMatches
        ? category.notes
        : category.notes.filter((note) => note.title.toLowerCase().includes(state.search));
      return { ...category, notes };
    })
    .filter((category) => category.notes.length > 0);
}

async function loadNote(note, categoryName) {
  state.currentNotePath = note.path;
  state.currentCategory = categoryName;
  render();
  if (window.matchMedia("(max-width: 680px)").matches) {
    setCatalogOpen(false);
  }

  els.readerEmpty.classList.add("hidden");
  els.readerError.classList.add("hidden");
  els.articleMeta.classList.add("hidden");
  els.articleBody.innerHTML = "";
  els.readerLoading.classList.remove("hidden");

  try {
    const markdown = await loadMarkdown(note);
    els.articleMeta.innerHTML = `
      <strong>${escapeHtml(categoryName)}</strong>
      <span> / </span>
      <span>${escapeHtml(note.fileName)}</span>
    `;
    els.articleMeta.classList.remove("hidden");
    els.articleBody.innerHTML = renderMarkdown(markdown);
    if (window.matchMedia("(max-width: 680px)").matches) {
      els.reader.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  } catch (error) {
    console.error(error);
    els.readerError.textContent = `读取笔记失败：${error.message}。`;
    els.readerError.classList.remove("hidden");
  } finally {
    els.readerLoading.classList.add("hidden");
  }
}

async function loadMarkdown(note) {
  const cacheKey = `${NOTE_CACHE_PREFIX}${note.sha}`;
  const memoryValue = noteCache.get(cacheKey);
  if (memoryValue) {
    return memoryValue;
  }

  const storedValue = readCachedNote(cacheKey);
  if (storedValue) {
    noteCache.set(cacheKey, storedValue);
    return storedValue;
  }

  const loaders = [
    () => fetchBlobMarkdown(note.sha),
    () => fetchText(toCdnUrl(note.path), "jsDelivr CDN"),
    () => fetchText(toRawUrl(note.path), "GitHub raw"),
  ];
  const errors = [];

  for (const loader of loaders) {
    try {
      const markdown = await loader();
      noteCache.set(cacheKey, markdown);
      writeCachedNote(cacheKey, markdown);
      return markdown;
    } catch (error) {
      errors.push(error.message);
    }
  }

  throw new Error(errors.join("；"));
}

async function fetchBlobMarkdown(sha) {
  const response = await fetchWithTimeout(`${BLOB_API_BASE}/${sha}`, {
    headers: { Accept: "application/vnd.github+json" },
    cache: "force-cache",
  });

  if (!response.ok) {
    throw new Error(`GitHub Blob API 返回 ${response.status}`);
  }

  const data = await response.json();
  if (!data.content || data.encoding !== "base64") {
    throw new Error("GitHub Blob API 返回内容格式异常");
  }

  return decodeBase64Utf8(data.content);
}

async function fetchText(url, sourceName) {
  const response = await fetchWithTimeout(url, { cache: "force-cache" });
  if (!response.ok) {
    throw new Error(`${sourceName} 返回 ${response.status}`);
  }

  return response.text();
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("请求超时");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function decodeBase64Utf8(value) {
  const normalized = value.replace(/\s/g, "");
  const binary = window.atob(normalized);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

function readCachedNote(cacheKey) {
  try {
    return window.localStorage.getItem(cacheKey);
  } catch (error) {
    return "";
  }
}

function writeCachedNote(cacheKey, markdown) {
  try {
    window.localStorage.setItem(cacheKey, markdown);
  } catch (error) {
    // localStorage can be full or disabled; memory cache still covers this session.
  }
}

function toRawUrl(path) {
  return `${RAW_BASE}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

function toCdnUrl(path) {
  return `${CDN_BASE}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

function resetReader() {
  els.readerEmpty.classList.remove("hidden");
  els.readerLoading.classList.add("hidden");
  els.readerError.classList.add("hidden");
  els.articleMeta.classList.add("hidden");
  els.articleBody.innerHTML = "";
}

function setStatus(message, isError) {
  els.statusMessage.textContent = message;
  els.statusMessage.classList.toggle("error", isError);
}

function countNotes(categories) {
  return categories.reduce((total, category) => total + category.notes.length, 0);
}

function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const html = [];
  let paragraph = [];
  let list = null;
  let blockquote = [];
  let table = [];
  let inCode = false;
  let codeLines = [];
  let codeLang = "";

  const flushParagraph = () => {
    if (paragraph.length) {
      html.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  };

  const flushList = () => {
    if (list) {
      html.push(`<${list.type}>${list.items.map((item) => `<li>${renderInline(item)}</li>`).join("")}</${list.type}>`);
      list = null;
    }
  };

  const flushBlockquote = () => {
    if (blockquote.length) {
      html.push(`<blockquote>${blockquote.map((line) => `<p>${renderInline(line)}</p>`).join("")}</blockquote>`);
      blockquote = [];
    }
  };

  const flushTable = () => {
    if (table.length) {
      html.push(renderTable(table));
      table = [];
    }
  };

  const flushAll = () => {
    flushParagraph();
    flushList();
    flushBlockquote();
    flushTable();
  };

  lines.forEach((line) => {
    const codeMatch = line.match(/^```(.*)$/);
    if (codeMatch) {
      if (inCode) {
        html.push(
          `<pre><code class="language-${escapeAttribute(codeLang)}">${escapeHtml(codeLines.join("\n"))}</code></pre>`,
        );
        inCode = false;
        codeLines = [];
        codeLang = "";
      } else {
        flushAll();
        inCode = true;
        codeLang = codeMatch[1].trim();
      }
      return;
    }

    if (inCode) {
      codeLines.push(line);
      return;
    }

    if (!line.trim()) {
      flushAll();
      return;
    }

    if (looksLikeTableLine(line)) {
      flushParagraph();
      flushList();
      flushBlockquote();
      table.push(line);
      return;
    }

    flushTable();

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushAll();
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      return;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      flushList();
      blockquote.push(quote[1]);
      return;
    }

    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      flushBlockquote();
      const type = unordered ? "ul" : "ol";
      if (!list || list.type !== type) {
        flushList();
        list = { type, items: [] };
      }
      list.items.push((unordered || ordered)[1]);
      return;
    }

    flushList();
    flushBlockquote();
    paragraph.push(line.trim());
  });

  if (inCode) {
    html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  }

  flushAll();
  return html.join("\n");
}

function looksLikeTableLine(line) {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.includes("|");
}

function renderTable(rows) {
  if (rows.length < 2 || !/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(rows[1].trim())) {
    return rows.map((row) => `<p>${renderInline(row)}</p>`).join("");
  }

  const cells = rows.map(splitTableRow);
  const head = cells[0].map((cell) => `<th>${renderInline(cell)}</th>`).join("");
  const body = cells
    .slice(2)
    .map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join("")}</tr>`)
    .join("");

  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function splitTableRow(row) {
  return row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function renderInline(text) {
  let output = escapeHtml(text);

  const codeParts = output.split(/(`[^`]+`)/g).map((part) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return `<code>${part.slice(1, -1)}</code>`;
    }

    return part
      .replace(/\[([^\]]+)]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/__([^_]+)__/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/_([^_]+)_/g, "<em>$1</em>");
  });

  return codeParts.join("");
}

function highlight(text, query) {
  const escaped = escapeHtml(text);
  if (!query) {
    return escaped;
  }

  const index = text.toLowerCase().indexOf(query);
  if (index === -1) {
    return escaped;
  }

  const before = escapeHtml(text.slice(0, index));
  const match = escapeHtml(text.slice(index, index + query.length));
  const after = escapeHtml(text.slice(index + query.length));
  return `${before}<mark>${match}</mark>${after}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/\s+/g, "-");
}
