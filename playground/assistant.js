/**
 * assistant.js — the chat panel.
 *
 * The assistant itself lives in the compiler bundle (src/assistant/). This
 * file is only the conversation UI: it collects a question, hands it the
 * program currently in the editor, and renders what comes back.
 *
 * ON THE MODEL BACKEND. A browser page must never hold an API key, so this
 * never talks to a model directly. It asks the page's own server whether it
 * offers an /api/ask route; if it does, questions the compiler cannot answer
 * are forwarded there and the key stays on the server. Opened as a plain file
 * with no server — which is how the published page runs — there is no route,
 * no backend, and the assistant answers entirely offline. It still reads real
 * errors, walks the real syntax tree, and runs real programs, because all of
 * that is the compiler rather than a model.
 */

(function () {
  "use strict";

  var SN = window.Stickynight;

  var el = {
    panel: document.getElementById("assistant"),
    toggle: document.getElementById("assistant-toggle"),
    log: document.getElementById("chat-log"),
    form: document.getElementById("chat-form"),
    input: document.getElementById("chat-text"),
    send: document.getElementById("chat-send"),
    status: document.getElementById("chat-status"),
    code: document.getElementById("code"),
    cheatsheet: document.getElementById("cheatsheet"),
    cheatToggle: document.getElementById("cheat-toggle"),
  };

  if (!SN || !el.panel) return;

  /** Set once the page knows whether a server-side model is reachable. */
  var backend = null;

  var STARTERS = [
    "How do I write a loop?",
    "What is wrong with my program?",
    "What does this do?",
    "How do lists work?",
    "What can you help with?",
  ];

  // ---------------------------------------------------------------- render

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  /**
   * The knowledge entries use `backticks` for code spans, and the compiler's
   * own error reports are already laid out. Everything else is plain text.
   */
  function formatAnswer(text) {
    return escapeHtml(text).replace(/`([^`\n]+)`/g, '<code>$1</code>');
  }

  var SOURCE_LABEL = {
    diagnosis: "read from your error",
    explanation: "read from your syntax tree",
    output: "your program, actually run",
    knowledge: "language reference",
    model: "language model",
    unsure: "not sure",
  };

  /**
   * Keep the newest message in view. Deferred to the next frame because a
   * bubble's final height is not settled until the browser has laid out the
   * code block and the buttons underneath it.
   */
  function scrollToEnd() {
    requestAnimationFrame(function () {
      el.log.scrollTop = el.log.scrollHeight;
    });
  }

  function bubble(role, html, extras) {
    var wrap = document.createElement("div");
    wrap.className = "msg msg-" + role;

    var body = document.createElement("div");
    body.className = "msg-body";
    body.innerHTML = html;
    wrap.appendChild(body);

    if (extras && extras.source) {
      var tag = document.createElement("div");
      tag.className = "msg-source";
      tag.textContent = SOURCE_LABEL[extras.source] || extras.source;
      wrap.appendChild(tag);
    }

    if (extras && extras.code) {
      var pre = document.createElement("pre");
      pre.className = "msg-code";
      pre.textContent = extras.code.replace(/\s+$/, "");
      wrap.appendChild(pre);

      var insert = document.createElement("button");
      insert.className = "msg-insert";
      insert.type = "button";
      insert.textContent = "Put this in the editor";
      insert.addEventListener("click", function () {
        el.code.value = extras.code;
        el.code.dispatchEvent(new Event("input", { bubbles: true }));
        el.code.focus();
        insert.textContent = "Done";
        setTimeout(function () {
          insert.textContent = "Put this in the editor";
        }, 1400);
      });
      wrap.appendChild(insert);
    }

    if (extras && extras.related && extras.related.length) {
      var row = document.createElement("div");
      row.className = "msg-related";
      extras.related.forEach(function (title) {
        var chip = document.createElement("button");
        chip.type = "button";
        chip.className = "chip-suggest";
        chip.textContent = title;
        chip.addEventListener("click", function () {
          submit(title);
        });
        row.appendChild(chip);
      });
      wrap.appendChild(row);
    }

    el.log.appendChild(wrap);
    scrollToEnd();
    return wrap;
  }

  function suggestions(list) {
    var row = document.createElement("div");
    row.className = "msg-related chat-starters";
    list.forEach(function (text) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip-suggest";
      chip.textContent = text;
      chip.addEventListener("click", function () {
        submit(text);
      });
      row.appendChild(chip);
    });
    el.log.appendChild(row);
  }

  // ------------------------------------------------------------------- ask

  var busy = false;

  function submit(question) {
    if (busy || !question.trim()) return;
    busy = true;
    el.send.disabled = true;
    el.input.value = "";

    bubble("user", escapeHtml(question));
    var thinking = bubble("bot", '<span class="muted">thinking…</span>');

    SN.ask({
      question: question,
      program: el.code ? el.code.value : "",
      backend: backend,
    })
      .then(function (answer) {
        thinking.remove();
        bubble("bot", formatAnswer(answer.text), answer);
        scrollToEnd();
      })
      .catch(function (error) {
        thinking.remove();
        bubble(
          "bot",
          '<span class="line-error">Something went wrong inside the assistant: ' +
            escapeHtml(error && error.message ? error.message : String(error)) +
            "</span>"
        );
      })
      .then(function () {
        busy = false;
        el.send.disabled = false;
        el.input.focus();
      });
  }

  el.form.addEventListener("submit", function (event) {
    event.preventDefault();
    submit(el.input.value);
  });

  // ---------------------------------------------------------------- panel

  function open(shouldOpen) {
    el.panel.hidden = !shouldOpen;
    el.toggle.setAttribute("aria-expanded", String(shouldOpen));
    if (shouldOpen) {
      el.cheatsheet.hidden = true;
      el.cheatToggle.setAttribute("aria-expanded", "false");
      el.input.focus();
    }
  }

  el.toggle.addEventListener("click", function () {
    open(el.panel.hidden);
  });

  // Opening the cheat sheet closes the chat, so neither fights for the space.
  el.cheatToggle.addEventListener("click", function () {
    if (!el.cheatsheet.hidden) open(false);
  });

  // ------------------------------------------------- server-side model probe

  /**
   * Ask the page's own server whether it will forward questions to a model.
   * A missing route is the normal case, not an error — the published page has
   * no server at all.
   */
  function probeBackend() {
    if (!window.fetch || location.protocol === "file:") return;

    fetch("api/ask", { method: "GET" })
      .then(function (response) {
        return response.ok ? response.json() : null;
      })
      .then(function (info) {
        if (!info || !info.available) {
          if (info && info.message) el.status.textContent = info.message;
          return;
        }

        backend = {
          name: info.model || "server",
          complete: function (input) {
            return fetch("api/ask", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                question: input.question,
                program: input.program || "",
              }),
            })
              .then(function (response) {
                if (!response.ok) throw new Error("the server returned " + response.status);
                return response.json();
              })
              .then(function (data) {
                if (data.error) throw new Error(data.error);
                return data.text || "";
              });
          },
        };

        el.status.textContent = "Model backend on (" + (info.model || "server") + ")";
        el.status.classList.add("on");
      })
      .catch(function () {
        /* no server-side model; the offline assistant is the whole feature */
      });
  }

  // ------------------------------------------------------------------ boot

  bubble(
    "bot",
    formatAnswer(
      "I am the Stickynight assistant. I can explain any part of the language, " +
        "read whatever is in the editor and tell you what it does, run it, or " +
        "work out why it will not run.\n\nAsk me anything, or start with one of these:"
    )
  );
  suggestions(STARTERS);
  probeBackend();
})();
