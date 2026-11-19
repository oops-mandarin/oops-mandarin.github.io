(function () {
  const E = window.MandarinEngine;
  const statusEl = document.getElementById("status");
  const input = document.getElementById("input");
  const sandhiToggle = document.getElementById("sandhiToggle");
  const pinyinOut = document.getElementById("pinyinOut");
  const zhuyinOut = document.getElementById("zhuyinOut");
  const englishOut = document.getElementById("englishOut");
  const comboOut = document.getElementById("comboOut");
  const breakdownBody = document.getElementById("breakdownBody");

  let dict = null;
  let tokens = [];

  function setStatus(msg, isErr) {
    statusEl.textContent = msg || "";
    statusEl.className = "status" + (isErr ? " err" : "");
  }

  fetch("data/cedict.json")
    .then((r) => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then((d) => {
      dict = d;
      setStatus("字典載入完成（" + Object.keys(dict).length + " 筆），可以開始分析了！");
      analyze();
    })
    .catch((err) => {
      setStatus("字典載入失敗：" + err.message + "（請確認 data/cedict.json 有上傳）", true);
    });

  function shortGloss(e) {
    // first clause only, with parenthetical asides stripped (CEDICT glosses
    // often contain their own "(...)" notes, which would otherwise collide
    // with the "(...)" we wrap pinyin/zhuyin in for compact display)
    let first = e.split(";")[0].trim();
    first = first.replace(/\([^()]*\)/g, "").replace(/\s{2,}/g, " ").trim();
    if (!first) first = e.split(";")[0].trim(); // fallback if that emptied it
    return first.length > 36 ? first.slice(0, 34) + "…" : first;
  }

  function buildTokens(text) {
    if (!dict) return [];
    return E.segment(text, dict);
  }

  function render() {
    const sandhiOn = sandhiToggle.checked;
    const sandhi = sandhiOn ? E.applySandhi(tokens) : {};

    const pinyinParts = [];
    const zhuyinParts = [];
    const englishParts = [];
    const comboParts = [];
    breakdownBody.innerHTML = "";

    tokens.forEach((tok, ti) => {
      if (!tok.entries) {
        // punctuation / latin / digits / unknown single char pass through
        const lit = escapeHtml(tok.hanzi);
        pinyinParts.push(lit);
        zhuyinParts.push(lit);
        englishParts.push(lit);
        comboParts.push(lit);
        return;
      }
      const entry = tok.entries[tok.chosen];
      const sylls = E.effectivePinyin(entry).split(" ");
      const citationPinyin = sylls.map(E.toToneMarkPinyin).join(" ");
      const citationZhuyin = sylls.map(E.toZhuyin).join("");

      const spokenSylls = sylls.map((s, si) => {
        const adj = sandhi[`${ti}-${si}`];
        return adj ? adj.raw : s;
      });
      const anyChanged = sylls.some((s, si) => {
        const adj = sandhi[`${ti}-${si}`];
        return adj && adj.changed;
      });
      const spokenPinyin = spokenSylls.map(E.toToneMarkPinyin).join(" ");
      const spokenZhuyin = spokenSylls.map(E.toZhuyin).join("");
      const glossShort = shortGloss(entry.e);
      const hzEsc = escapeHtml(tok.hanzi);
      const cls = anyChanged ? "ann sandhi" : "ann";

      pinyinParts.push(`${hzEsc}<span class="${cls}">(${escapeHtml(spokenPinyin)})</span>`);
      zhuyinParts.push(`${hzEsc}<span class="${cls}">(${escapeHtml(spokenZhuyin)})</span>`);
      englishParts.push(`${hzEsc}<span class="ann">(${escapeHtml(glossShort)})</span>`);
      comboParts.push(
        `${hzEsc}<span class="${cls}">(${escapeHtml(spokenZhuyin)})(${escapeHtml(spokenPinyin)})</span>-${escapeHtml(glossShort)}`
      );

      // breakdown row (citation form, dictionary tone)
      const tr = document.createElement("tr");
      const tdHz = document.createElement("td");
      tdHz.className = "hz";
      tdHz.textContent = tok.hanzi;
      const tdZy = document.createElement("td");
      const tdPy = document.createElement("td");
      const tdEn = document.createElement("td");

      if (tok.entries.length > 1) {
        const sel = document.createElement("select");
        tok.entries.forEach((e, idx) => {
          const opt = document.createElement("option");
          const p = E.effectivePinyin(e).split(" ").map(E.toToneMarkPinyin).join(" ");
          opt.value = idx;
          opt.textContent = `${p} - ${shortGloss(e.e)}`;
          if (idx === tok.chosen) opt.selected = true;
          sel.appendChild(opt);
        });
        sel.addEventListener("change", () => {
          tok.chosen = parseInt(sel.value, 10);
          render();
        });
        tdZy.textContent = citationZhuyin;
        tdPy.appendChild(sel);
        tdEn.textContent = entry.e;
      } else {
        tdZy.textContent = citationZhuyin;
        tdPy.textContent = citationPinyin;
        tdEn.textContent = entry.e;
      }
      tr.append(tdHz, tdZy, tdPy, tdEn);
      breakdownBody.appendChild(tr);
    });

    pinyinOut.innerHTML = pinyinParts.join("");
    zhuyinOut.innerHTML = zhuyinParts.join("");
    englishOut.innerHTML = englishParts.join("");
    comboOut.innerHTML = comboParts.join("");
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function analyze() {
    if (!dict) { setStatus("字典還在載入中，請稍等…"); return; }
    const text = input.value.trim();
    if (!text) { setStatus("請先輸入中文"); return; }
    tokens = buildTokens(text);
    render();
    setStatus("完成！共 " + tokens.length + " 個字/詞/符號。");
  }

  document.getElementById("analyzeBtn").addEventListener("click", analyze);
  sandhiToggle.addEventListener("change", render);

  let debounceTimer = null;
  input.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(analyze, 500);
  });

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(() => legacyCopy(text));
    }
    return Promise.resolve(legacyCopy(text));
  }

  function legacyCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try { document.execCommand("copy"); } catch (e) { /* ignore */ }
    document.body.removeChild(ta);
  }

  document.querySelectorAll(".copybtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = document.getElementById(btn.dataset.copy);
      const text = target.innerText;
      copyText(text).then(() => {
        btn.textContent = "已複製！";
        btn.classList.add("copied");
        setTimeout(() => { btn.textContent = "複製"; btn.classList.remove("copied"); }, 1500);
      });
    });
  });

  document.getElementById("copyListBtn").addEventListener("click", () => {
    const sandhiOn = sandhiToggle.checked;
    const sandhi = sandhiOn ? E.applySandhi(tokens) : {};
    const lines = [];
    tokens.forEach((tok, ti) => {
      if (!tok.entries) return;
      const entry = tok.entries[tok.chosen];
      const sylls = E.effectivePinyin(entry).split(" ");
      const spokenSylls = sylls.map((s, si) => {
        const adj = sandhi[`${ti}-${si}`];
        return adj ? adj.raw : s;
      });
      const py = spokenSylls.map(E.toToneMarkPinyin).join(" ");
      const zy = spokenSylls.map(E.toZhuyin).join("");
      lines.push(`${tok.hanzi}(${zy})(${py})-${shortGloss(entry.e)}`);
    });
    copyText(lines.join("\n")).then(() => {
      const btn = document.getElementById("copyListBtn");
      const orig = btn.textContent;
      btn.textContent = "已複製！";
      setTimeout(() => { btn.textContent = orig; }, 1500);
    });
  });
})();
