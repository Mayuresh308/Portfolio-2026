// "Ask about Mayuresh" chat widget. Markup: layouts/_partials/hooks/body-end/chat-widget.html.
// Talks to the chat backend (POST { messages, conversationId, messageIndex }), which streams the
// answer as text/plain, and sends 👍/👎 to its /api/feedback endpoint.
(function () {
  "use strict";

  var root = document.getElementById("mchat");
  if (!root) return;

  // Must stay within the backend's validation limits (portfolio-backend: src/config.ts LIMITS).
  var MAX_MESSAGES = 12;
  var MAX_MESSAGE_CHARS = 600;
  var MAX_TOTAL_CHARS = 4000;
  var MAX_BODY_BYTES = 9 * 1024; // backend allows 10 KB; keep headroom
  var COUNTER_FROM = 500;
  var FIRST_CHUNK_TIMEOUT_MS = 45000;
  var STORAGE_KEY = "mchat:v1";
  var STORED_MESSAGES = 40;
  var MAX_MESSAGE_INDEX = 199; // backend: LIMITS.maxMessageIndex
  var CONVERSATION_ID_RE = /^[A-Za-z0-9_-]{8,64}$/; // backend: CONVERSATION_ID_RE

  var endpoint = root.getAttribute("data-endpoint");
  var feedbackEndpoint = endpoint.replace(/\/api\/chat\/?$/, "/api/feedback");
  var email = root.getAttribute("data-email") || "";
  var errorText =
    "Couldn't reach the assistant right now." + (email ? " You can email " + email + "." : "");

  var fab = document.getElementById("mchat-fab");
  var panel = document.getElementById("mchat-panel");
  var closeBtn = document.getElementById("mchat-close");
  var clearBtn = document.getElementById("mchat-clear");
  var scroller = document.getElementById("mchat-scroll");
  var empty = document.getElementById("mchat-empty");
  var log = document.getElementById("mchat-log");
  var form = document.getElementById("mchat-form");
  var input = document.getElementById("mchat-input");
  var sendBtn = document.getElementById("mchat-send");
  var counter = document.getElementById("mchat-count");
  var chips = Array.prototype.slice.call(root.querySelectorAll(".mchat-chip"));
  var mobile = window.matchMedia("(max-width: 639.98px)");

  // Each message: { role, content, index } where index is its position in the full conversation
  // (stable even after storage trims old messages); assistant messages also get done/rating.
  var state = loadState();
  var messages = state.messages;
  var conversationId = state.conversationId || newConversationId();
  var busy = false;

  // ── Storage (sessionStorage can throw in private mode or when blocked) ──────

  function newConversationId() {
    try {
      if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    } catch (e) {
      /* randomUUID needs a secure context; fall through */
    }
    var bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.prototype.map
      .call(bytes, function (b) {
        return ("0" + b.toString(16)).slice(-2);
      })
      .join("");
  }

  function loadState() {
    try {
      var data = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null");
      if (!data || !Array.isArray(data.messages)) return { messages: [] };
      var list = data.messages.filter(function (m) {
        return m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string";
      });
      // Older saved chats had no indexes: number them and treat their answers as complete.
      list.forEach(function (m, i) {
        if (typeof m.index !== "number") {
          m.index = i;
          if (m.role === "assistant") m.done = true;
        }
      });
      var id = typeof data.conversationId === "string" && CONVERSATION_ID_RE.test(data.conversationId) ? data.conversationId : null;
      return { messages: list, conversationId: id };
    } catch (e) {
      return { messages: [] };
    }
  }

  function saveMessages() {
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ conversationId: conversationId, messages: messages.slice(-STORED_MESSAGES) })
      );
    } catch (e) {
      /* storage unavailable: the chat still works for this page */
    }
  }

  function nextIndex() {
    return messages.length ? messages[messages.length - 1].index + 1 : 0;
  }

  // ── Safe markdown subset: **bold**, *italic*, lists, line breaks, http/https/mailto links ──
  // Everything is built with DOM nodes and text nodes; no HTML string is ever parsed.

  var INLINE = new RegExp(
    [
      "\\[([^\\]\\n]+)\\]\\(([^)\\s]+)\\)", // 1,2: [label](url)
      "\\*\\*([^*\\n]+?)\\*\\*", // 3: **bold**
      "__([^_\\n]+?)__", // 4: __bold__
      "\\*([^*\\s](?:[^*\\n]*?[^*\\s])?)\\*", // 5: *italic*
      "(https?:\\/\\/[^\\s<>()\\[\\]]*[^\\s<>()\\[\\].,;:!?'\"*_])", // 6: bare URL
      "((?:mailto:)?[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,})", // 7: email
    ].join("|"),
    "g"
  );

  function safeHref(raw) {
    try {
      var url = new URL(raw);
      return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:" ? url.href : null;
    } catch (e) {
      return null;
    }
  }

  function makeLink(href, label) {
    var a = document.createElement("a");
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = label;
    return a;
  }

  function renderInline(text, parent) {
    var last = 0;
    var m;
    INLINE.lastIndex = 0;
    var matches = [];
    while ((m = INLINE.exec(text))) matches.push(m);

    matches.forEach(function (match) {
      if (match.index > last) parent.appendChild(document.createTextNode(text.slice(last, match.index)));
      last = match.index + match[0].length;

      if (match[1] !== undefined) {
        var href = safeHref(match[2]);
        parent.appendChild(href ? makeLink(href, match[1]) : document.createTextNode(match[0]));
      } else if (match[3] !== undefined || match[4] !== undefined) {
        var strong = document.createElement("strong");
        renderInline(match[3] !== undefined ? match[3] : match[4], strong);
        parent.appendChild(strong);
      } else if (match[5] !== undefined) {
        var em = document.createElement("em");
        renderInline(match[5], em);
        parent.appendChild(em);
      } else if (match[6] !== undefined) {
        var url = safeHref(match[6]);
        parent.appendChild(url ? makeLink(url, match[6]) : document.createTextNode(match[6]));
      } else if (match[7] !== undefined) {
        var address = match[7].replace(/^mailto:/i, "");
        var mail = safeHref("mailto:" + address);
        parent.appendChild(mail ? makeLink(mail, address) : document.createTextNode(match[7]));
      }
    });

    if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
  }

  function renderMarkdown(text, container) {
    container.textContent = "";
    var lines = text.replace(/\r\n?/g, "\n").split("\n");
    var para = null;
    var list = null;
    var listType = null;

    lines.forEach(function (line) {
      var bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
      var numbered = bullet ? null : /^\s*(\d{1,3})[.)]\s+(.*)$/.exec(line);

      if (bullet || numbered) {
        var type = bullet ? "ul" : "ol";
        if (!list || listType !== type) {
          list = document.createElement(type);
          listType = type;
          if (numbered && numbered[1] !== "1") list.start = Number(numbered[1]);
          container.appendChild(list);
        }
        para = null;
        var li = document.createElement("li");
        renderInline(bullet ? bullet[1] : numbered[2], li);
        list.appendChild(li);
        return;
      }

      if (!line.trim()) {
        para = null;
        list = null;
        return;
      }

      // Indented continuation of a list item.
      if (list && /^\s{2,}\S/.test(line) && list.lastChild) {
        list.lastChild.appendChild(document.createElement("br"));
        renderInline(line.trim(), list.lastChild);
        return;
      }

      list = null;
      var heading = /^#{1,6}\s+(.*)$/.exec(line);
      if (!para) {
        para = document.createElement("p");
        container.appendChild(para);
      } else {
        para.appendChild(document.createElement("br"));
      }
      if (heading) {
        var strong = document.createElement("strong");
        renderInline(heading[1], strong);
        para.appendChild(strong);
      } else {
        renderInline(line, para);
      }
    });
  }

  // ── Rendering ───────────────────────────────────────────────────────────

  function addBubble(kind, text) {
    var bubble = document.createElement("div");
    bubble.className = "mchat-msg mchat-msg-" + kind;
    var who = document.createElement("span");
    who.className = "mchat-sr";
    who.textContent = kind === "user" ? "You: " : "Assistant: ";
    var body = document.createElement("div");
    bubble.appendChild(who);
    bubble.appendChild(body);
    if (kind === "user") body.textContent = text;
    else if (text) renderMarkdown(text, body);
    log.appendChild(bubble);
    updateChrome();
    return { el: bubble, body: body };
  }

  // 👍/👎 under a completed answer. Fails silently; the rating is remembered with the conversation.
  function addFeedback(bubbleEl, msg) {
    if (typeof msg.index !== "number" || msg.index > MAX_MESSAGE_INDEX) return;
    var bar = document.createElement("div");
    bar.className = "mchat-fb";
    var thanks = document.createElement("span");
    thanks.className = "mchat-fb-thanks";
    thanks.textContent = "Thanks";
    thanks.tabIndex = -1;
    thanks.hidden = !msg.rating;

    var buttons = [
      ["up", "👍", "Helpful"],
      ["down", "👎", "Not helpful"],
    ].map(function (spec) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mchat-fb-btn";
      btn.setAttribute("aria-label", spec[2]);
      btn.title = spec[2];
      var icon = document.createElement("span");
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = spec[1];
      btn.appendChild(icon);
      if (msg.rating) {
        btn.disabled = true;
        btn.setAttribute("aria-pressed", msg.rating === spec[0] ? "true" : "false");
      }
      btn.addEventListener("click", function () {
        if (msg.rating) return;
        msg.rating = spec[0];
        saveMessages();
        buttons.forEach(function (b) {
          b.disabled = true;
          b.setAttribute("aria-pressed", b === btn ? "true" : "false");
        });
        thanks.hidden = false;
        thanks.focus({ preventScroll: true });
        sendFeedback(msg.index, spec[0]);
      });
      bar.appendChild(btn);
      return btn;
    });

    bar.appendChild(thanks);
    log.insertBefore(bar, bubbleEl.nextSibling);
  }

  function sendFeedback(messageIndex, rating) {
    try {
      fetch(feedbackEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: conversationId, messageIndex: messageIndex, rating: rating }),
        keepalive: true,
      }).catch(function () {});
    } catch (e) {
      /* fail silently */
    }
  }

  function showTyping(body) {
    var dots = document.createElement("span");
    dots.className = "mchat-typing";
    dots.setAttribute("role", "img");
    dots.setAttribute("aria-label", "Assistant is typing");
    for (var i = 0; i < 3; i++) dots.appendChild(document.createElement("span"));
    body.appendChild(dots);
  }

  function updateChrome() {
    var hasContent = log.childElementCount > 0;
    empty.hidden = hasContent;
    clearBtn.hidden = !hasContent;
  }

  function nearBottom() {
    return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80;
  }

  function scrollToBottom() {
    scroller.scrollTop = scroller.scrollHeight;
  }

  function setBusy(value) {
    busy = value;
    sendBtn.disabled = value;
    clearBtn.disabled = value;
    chips.forEach(function (c) {
      c.disabled = value;
    });
    log.setAttribute("aria-busy", value ? "true" : "false");
  }

  function updateCounter() {
    var len = input.value.length;
    counter.hidden = len < COUNTER_FROM;
    counter.textContent = len + " / " + MAX_MESSAGE_CHARS;
    counter.classList.toggle("is-max", len >= MAX_MESSAGE_CHARS);
  }

  function autosize() {
    input.style.height = "auto";
    input.style.height = input.scrollHeight + 2 + "px";
  }

  // ── Request payload within the backend's limits ─────────────────────────

  function clip(text) {
    if (text.length <= MAX_MESSAGE_CHARS) return text;
    var cut = MAX_MESSAGE_CHARS - 1;
    var code = text.charCodeAt(cut - 1);
    if (code >= 0xd800 && code <= 0xdbff) cut--; // don't split a surrogate pair
    return text.slice(0, cut) + "…";
  }

  function buildPayload(replyIndex) {
    var history = messages.slice(-MAX_MESSAGES).map(function (m) {
      return { role: m.role, content: clip(m.content) };
    });
    var total = function () {
      return history.reduce(function (n, m) {
        return n + m.content.length;
      }, 0);
    };
    var bytes = function () {
      return new TextEncoder().encode(JSON.stringify({ messages: history })).length;
    };
    while (history.length > 1 && (total() > MAX_TOTAL_CHARS || bytes() > MAX_BODY_BYTES)) history.shift();
    while (history.length > 1 && history[0].role === "assistant") history.shift();
    var payload = { messages: history, conversationId: conversationId };
    // Position of the reply in the full conversation (before trimming), so feedback can be matched to it.
    if (replyIndex <= MAX_MESSAGE_INDEX) payload.messageIndex = replyIndex;
    return JSON.stringify(payload);
  }

  // ── Sending ─────────────────────────────────────────────────────────────

  function fail(message, userBubble, userText) {
    // Drop the unanswered question from history so a retry doesn't send it twice.
    messages.pop();
    saveMessages();
    if (userBubble) userBubble.el.remove();
    if (!input.value) {
      input.value = userText;
      autosize();
      updateCounter();
    }
    var bubble = addBubble("error", "");
    renderMarkdown(message, bubble.body);
    scrollToBottom();
  }

  async function send(raw) {
    var text = raw.trim().slice(0, MAX_MESSAGE_CHARS);
    if (!text || busy) return;

    var userIndex = nextIndex();
    var replyIndex = userIndex + 1;
    messages.push({ role: "user", content: text, index: userIndex });
    saveMessages();
    var userBubble = addBubble("user", text);
    input.value = "";
    autosize();
    updateCounter();

    var reply = addBubble("assistant", "");
    showTyping(reply.body);
    scrollToBottom();
    setBusy(true);

    var controller = new AbortController();
    var timer = setTimeout(function () {
      controller.abort();
    }, FIRST_CHUNK_TIMEOUT_MS);
    var answer = "";
    var completed = false;

    try {
      var res;
      try {
        res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: buildPayload(replyIndex),
          signal: controller.signal,
        });
      } catch (e) {
        res = null;
      }

      if (!res || !res.ok || !res.body) {
        clearTimeout(timer);
        var message = errorText;
        if (res && res.status === 429) {
          try {
            var data = await res.json();
            if (data && typeof data.error === "string" && data.error.trim()) message = data.error.slice(0, 300);
          } catch (e) {
            /* keep the generic message */
          }
        }
        reply.el.remove();
        fail(message, userBubble, text);
        return;
      }

      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      try {
        for (;;) {
          var chunk = await reader.read();
          if (chunk.done) break;
          var piece = decoder.decode(chunk.value, { stream: true });
          if (!piece) continue;
          if (!answer) {
            clearTimeout(timer);
            messages.push({ role: "assistant", content: "", index: replyIndex });
          }
          var stick = nearBottom();
          answer += piece;
          messages[messages.length - 1].content = answer;
          renderMarkdown(answer, reply.body);
          saveMessages();
          if (stick) scrollToBottom();
        }
        answer += decoder.decode();
        completed = true;
      } catch (e) {
        // Connection dropped mid-answer: keep what arrived (no feedback buttons; the backend didn't log it).
      }

      if (!answer.trim()) {
        if (messages.length && messages[messages.length - 1].role === "assistant") messages.pop();
        reply.el.remove();
        fail(errorText, userBubble, text);
        return;
      }
      var replyMsg = messages[messages.length - 1];
      replyMsg.content = answer;
      renderMarkdown(answer, reply.body);
      if (completed) {
        replyMsg.done = true;
        var stickEnd = nearBottom();
        addFeedback(reply.el, replyMsg);
        if (stickEnd) scrollToBottom(); // keep the new 👍/👎 row in view
      }
      saveMessages();
    } finally {
      clearTimeout(timer);
      setBusy(false);
    }
  }

  // ── Open / close / keyboard ─────────────────────────────────────────────

  function isOpen() {
    return !panel.hidden;
  }

  function syncScrollLock() {
    document.documentElement.classList.toggle("mchat-lock", isOpen() && mobile.matches);
  }

  function open() {
    panel.hidden = false;
    root.classList.add("is-open");
    fab.setAttribute("aria-expanded", "true");
    syncScrollLock();
    scrollToBottom();
    input.focus({ preventScroll: true });
  }

  function close() {
    panel.hidden = true;
    root.classList.remove("is-open");
    fab.setAttribute("aria-expanded", "false");
    syncScrollLock();
    fab.focus();
  }

  function focusables() {
    return Array.prototype.filter.call(
      panel.querySelectorAll("button, textarea, a[href]"),
      function (el) {
        return !el.disabled && !el.hidden && el.offsetParent !== null;
      }
    );
  }

  fab.addEventListener("click", function () {
    if (isOpen()) close();
    else open();
  });
  closeBtn.addEventListener("click", close);

  panel.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !e.isComposing) {
      e.preventDefault();
      close();
      return;
    }
    // Full-screen on small screens: keep Tab inside the panel.
    if (e.key === "Tab" && mobile.matches) {
      var items = focusables();
      if (!items.length) return;
      var first = items[0];
      var lastItem = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && document.activeElement === lastItem) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  if (mobile.addEventListener) mobile.addEventListener("change", syncScrollLock);

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    send(input.value);
  });

  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send(input.value);
    }
  });

  input.addEventListener("input", function () {
    autosize();
    updateCounter();
  });

  chips.forEach(function (chip) {
    chip.addEventListener("click", function () {
      send(chip.textContent || "");
    });
  });

  clearBtn.addEventListener("click", function () {
    if (busy) return;
    messages = [];
    conversationId = newConversationId(); // a cleared chat is a new conversation
    saveMessages();
    log.textContent = "";
    updateChrome();
    input.focus();
  });

  // ── Init ────────────────────────────────────────────────────────────────

  messages.forEach(function (m) {
    var bubble = addBubble(m.role, m.content);
    if (m.role === "assistant" && m.done) addFeedback(bubble.el, m);
  });
  updateChrome();
  updateCounter();
  root.hidden = false;
})();
