/**
 * playground.js — the browser front end.
 *
 * All the real work is done by the same compiler the command line uses:
 * playground/bundle.js is the compiled src/ packed into one file, and this
 * script only deals with the editor, the tabs and rendering what comes back.
 *
 * The four tabs are the four stages of the pipeline, so a program can be
 * followed from source to tokens to tree to WebAssembly without leaving the
 * page. That is the whole point of having a playground at all.
 */

(function () {
  "use strict";

  var SN = window.Stickynight;
  var SAMPLES = window.StickynightSamples || [];

  // Programs written in the page can loop forever; a budget turns that into a
  // message instead of a frozen tab.
  var STEP_BUDGET = 2000000;

  var el = {
    code: document.getElementById("code"),
    highlight: document.getElementById("highlight"),
    gutter: document.getElementById("gutter"),
    editor: document.getElementById("editor"),
    output: document.getElementById("output"),
    samples: document.getElementById("samples"),
    run: document.getElementById("run"),
    theme: document.getElementById("theme"),
    cheatToggle: document.getElementById("cheat-toggle"),
    cheatsheet: document.getElementById("cheatsheet"),
    status: document.getElementById("status"),
    counts: document.getElementById("counts"),
    tabs: Array.prototype.slice.call(document.querySelectorAll(".tab")),
  };

  var currentTab = "output";
  var errorLine = 0;

  // ---------------------------------------------------------------- helpers

  function escapeHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  /**
   * Syntax highlighting.
   *
   * The keyword and built-in lists come from the language itself
   * (KEYWORD_LIST, BUILTIN_NAMES), so the colours can never drift away from
   * what the lexer actually accepts. Matching is done with one pass of a
   * regular expression rather than by running the lexer, because the lexer
   * quite rightly refuses half-typed programs and this has to colour every
   * keystroke.
   */
  var KEYWORDS = {};
  var BUILTINS = {};
  (SN.KEYWORD_LIST || []).forEach(function (word) { KEYWORDS[word] = true; });
  (SN.BUILTIN_NAMES || []).forEach(function (word) { BUILTINS[word] = true; });

  var TOKEN_PATTERN =
    /(#[^\n]*)|("(?:[^"\\\n]|\\.)*"?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)/g;

  function highlight(source) {
    var out = "";
    var last = 0;
    TOKEN_PATTERN.lastIndex = 0;

    var match;
    while ((match = TOKEN_PATTERN.exec(source)) !== null) {
      out += escapeHtml(source.slice(last, match.index));
      last = match.index + match[0].length;

      if (match[1] !== undefined) {
        out += '<span class="tok-comment">' + escapeHtml(match[1]) + "</span>";
      } else if (match[2] !== undefined) {
        out += '<span class="tok-string">' + escapeHtml(match[2]) + "</span>";
      } else if (match[3] !== undefined) {
        out += '<span class="tok-number">' + match[3] + "</span>";
      } else {
        var word = match[4];
        if (KEYWORDS[word]) {
          out += '<span class="tok-keyword">' + word + "</span>";
        } else if (BUILTINS[word]) {
          out += '<span class="tok-builtin">' + word + "</span>";
        } else {
          out += word;
        }
      }
    }

    out += escapeHtml(source.slice(last));
    // A trailing newline needs something after it or the <pre> collapses and
    // the overlay stops lining up with the textarea.
    return out + "\n";
  }

  function refreshGutter(lineCount) {
    var rows = [];
    for (var i = 1; i <= lineCount; i++) {
      rows.push(i === errorLine ? '<span class="bad">' + i + "</span>" : String(i));
    }
    // A trailing blank line keeps the gutter as tall as the code when the
    // program ends with a newline, so the last number never sits alone.
    el.gutter.innerHTML = rows.join("\n") + "\n";
  }

  /**
   * The textarea is the only scroller. The highlighted layer under it and the
   * gutter beside it are moved to match, which is what keeps the colours
   * sitting exactly on top of the characters.
   */
  function syncScroll() {
    el.highlight.parentNode.scrollTop = el.code.scrollTop;
    el.highlight.parentNode.scrollLeft = el.code.scrollLeft;
    el.gutter.scrollTop = el.code.scrollTop;
  }

  function syncEditor() {
    var source = el.code.value;
    el.highlight.innerHTML = highlight(source);
    refreshGutter(source.split("\n").length);
    syncScroll();
  }

  // ------------------------------------------------------------- rendering

  function show(html, className) {
    el.output.className = "output" + (className ? " " + className : "");
    el.output.innerHTML = html;
  }

  function setStatus(text, kind) {
    el.status.textContent = text;
    el.status.className = kind ? "status-" + kind : "";
  }

  /** Render an error the same way the command line does. */
  function renderError(error, source) {
    errorLine = error.line || 0;
    show('<span class="line-error">' + escapeHtml(error.format(source, "playground.sn", false)) + "</span>");
    setStatus(error.stage + " error on line " + error.line, "error");
    syncEditor();
  }

  function isStickynightError(error) {
    return error && typeof error.format === "function" && typeof error.line === "number";
  }

  // ------------------------------------------------------------------- run

  function run() {
    var source = el.code.value;
    errorLine = 0;

    try {
      switch (currentTab) {
        case "tokens":
          show(escapeHtml(SN.tokenReport(source)));
          setStatus("Lexer finished.", "ok");
          break;

        case "ast":
          show(escapeHtml(SN.astReport(source)));
          setStatus("Parser finished.", "ok");
          break;

        case "wasm":
          show(escapeHtml(SN.watReport(source)));
          setStatus("Code generator finished.", "ok");
          break;

        default: {
          var started = performance.now();
          var result = SN.runSource(source, { maxSteps: STEP_BUDGET });
          var took = Math.round(performance.now() - started);

          if (result.error) {
            var printed = result.output.length
              ? escapeHtml(result.output.join("\n")) + "\n\n"
              : "";
            errorLine = result.error.line || 0;
            show(
              printed +
                '<span class="line-error">' +
                escapeHtml(result.error.format(source, "playground.sn", false)) +
                "</span>"
            );
            setStatus(result.error.stage + " error on line " + result.error.line, "error");
          } else if (result.output.length === 0) {
            show('<span class="muted">The program ran, but it never said anything.\n\nUse say to print something, for example:  say "hello"</span>');
            setStatus("Ran in " + took + " ms.", "ok");
          } else {
            show(escapeHtml(result.output.join("\n")));
            setStatus(
              "Ran in " + took + " ms — " + result.output.length +
                (result.output.length === 1 ? " line." : " lines."),
              "ok"
            );
          }
        }
      }
    } catch (error) {
      if (isStickynightError(error)) {
        renderError(error, source);
      } else {
        show('<span class="line-error">Something went wrong inside the playground:\n' + escapeHtml(String(error && error.stack ? error.stack : error)) + "</span>");
        setStatus("Internal error", "error");
      }
    }

    updateCounts(source);
    syncEditor();
  }

  /** Small line/token readout in the status bar. */
  function updateCounts(source) {
    var lines = source.split("\n").length;
    var tokens = "—";
    try {
      tokens = String(SN.tokenizeSource(source).length);
    } catch (ignored) {
      tokens = "—";
    }
    el.counts.textContent = lines + (lines === 1 ? " line" : " lines") + " · " + tokens + " tokens";
  }

  // ------------------------------------------------------------------ tabs

  function selectTab(name) {
    currentTab = name;
    el.tabs.forEach(function (tab) {
      tab.setAttribute("aria-selected", String(tab.dataset.tab === name));
    });
    run();
  }

  el.tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      selectTab(tab.dataset.tab);
    });
  });

  // ---------------------------------------------------------------- editor

  /** Insert text at the caret, keeping undo history working. */
  function insertAtCaret(text) {
    var area = el.code;
    var start = area.selectionStart;
    var end = area.selectionEnd;
    area.setRangeText(text, start, end, "end");
    area.dispatchEvent(new Event("input", { bubbles: true }));
  }

  el.code.addEventListener("input", function () {
    errorLine = 0;
    syncEditor();
    updateCounts(el.code.value);
  });

  el.code.addEventListener("scroll", syncScroll);

  el.code.addEventListener("keydown", function (event) {
    // Ctrl/Cmd + Enter runs.
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      run();
      return;
    }

    // Tab indents by four spaces rather than leaving the editor.
    if (event.key === "Tab") {
      event.preventDefault();
      var area = el.code;
      var lineStart = area.value.lastIndexOf("\n", area.selectionStart - 1) + 1;

      if (event.shiftKey) {
        var line = area.value.slice(lineStart, area.selectionStart);
        var remove = Math.min(4, line.length - line.replace(/^ {1,4}/, "").length);
        if (remove > 0) {
          area.setRangeText("", lineStart, lineStart + remove, "end");
          area.dispatchEvent(new Event("input", { bubbles: true }));
        }
      } else {
        insertAtCaret("    ");
      }
      return;
    }

    // Enter keeps the current indentation, and adds a level after a ':'.
    // In a language with no braces this is the difference between the editor
    // helping and the editor being in the way.
    if (event.key === "Enter") {
      var value = el.code.value;
      var caret = el.code.selectionStart;
      var start = value.lastIndexOf("\n", caret - 1) + 1;
      var currentLine = value.slice(start, caret);
      var indentMatch = currentLine.match(/^ */);
      var indent = indentMatch ? indentMatch[0] : "";

      if (/:\s*$/.test(currentLine)) indent += "    ";
      if (indent.length === 0) return; // let the browser do the normal thing

      event.preventDefault();
      insertAtCaret("\n" + indent);
    }
  });

  // --------------------------------------------------------------- samples

  SAMPLES.forEach(function (sample, index) {
    var option = document.createElement("option");
    option.value = String(index);
    option.textContent = sample.title;
    el.samples.appendChild(option);
  });

  el.samples.addEventListener("change", function () {
    var sample = SAMPLES[Number(el.samples.value)];
    if (!sample) return;
    el.code.value = sample.source;
    el.code.scrollTop = 0;
    el.code.setSelectionRange(0, 0);
    errorLine = 0;
    syncEditor();
    run();
    el.code.focus();
  });

  // ----------------------------------------------------------------- chrome

  el.run.addEventListener("click", run);

  el.cheatToggle.addEventListener("click", function () {
    var hidden = el.cheatsheet.hidden;
    el.cheatsheet.hidden = !hidden;
    el.cheatToggle.setAttribute("aria-expanded", String(hidden));
  });

  /**
   * Which theme is actually showing right now.
   *
   * The page may start with nothing stamped on it — the viewer is on
   * "system" — and then only prefers-color-scheme decides. Reading the
   * effective theme rather than the attribute is what stops the first click
   * appearing to do nothing.
   */
  function effectiveTheme() {
    var stamped = document.documentElement.getAttribute("data-theme");
    if (stamped === "light" || stamped === "dark") return stamped;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  }

  function labelTheme() {
    // The button says where a click will take you, not where you are.
    el.theme.textContent = effectiveTheme() === "light" ? "Dark" : "Light";
  }

  el.theme.addEventListener("click", function () {
    var next = effectiveTheme() === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    labelTheme();
  });

  // Follow the system while the viewer has not chosen for themselves.
  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", labelTheme);
  }

  document.addEventListener("keydown", function (event) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      run();
    }
  });

  // ------------------------------------------------------------------ boot

  if (SAMPLES.length > 0) {
    el.code.value = SAMPLES[0].source;
    el.samples.value = "0";
  }

  labelTheme();
  syncEditor();
  run();
  el.code.focus();
})();
