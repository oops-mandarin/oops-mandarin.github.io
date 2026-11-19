// Core engine: segmentation, heteronym default picking, tone sandhi,
// pinyin/zhuyin rendering. Shared between Node tests and the browser page.
(function (root) {
  const INITIALS = ["zh", "ch", "sh", "b", "p", "m", "f", "d", "t", "n", "l",
    "g", "k", "h", "j", "q", "x", "r", "z", "c", "s", "y", "w"];

  const INITIAL_ZHUYIN = {
    b: "ㄅ", p: "ㄆ", m: "ㄇ", f: "ㄈ", d: "ㄉ", t: "ㄊ", n: "ㄋ", l: "ㄌ",
    g: "ㄍ", k: "ㄎ", h: "ㄏ", j: "ㄐ", q: "ㄑ", x: "ㄒ",
    zh: "ㄓ", ch: "ㄔ", sh: "ㄕ", r: "ㄖ", z: "ㄗ", c: "ㄘ", s: "ㄙ",
  };

  const FINAL_ZHUYIN = {
    "": "", a: "ㄚ", o: "ㄛ", e: "ㄜ", ê: "ㄝ",
    ai: "ㄞ", ei: "ㄟ", ao: "ㄠ", ou: "ㄡ",
    an: "ㄢ", en: "ㄣ", ang: "ㄤ", eng: "ㄥ", ong: "ㄨㄥ", er: "ㄦ",
    i: "ㄧ", ia: "ㄧㄚ", ie: "ㄧㄝ", iao: "ㄧㄠ", iu: "ㄧㄡ",
    ian: "ㄧㄢ", in: "ㄧㄣ", iang: "ㄧㄤ", ing: "ㄧㄥ", iong: "ㄩㄥ",
    u: "ㄨ", ua: "ㄨㄚ", uo: "ㄨㄛ", uai: "ㄨㄞ", ui: "ㄨㄟ",
    uan: "ㄨㄢ", un: "ㄨㄣ", uang: "ㄨㄤ", ueng: "ㄨㄥ",
    v: "ㄩ", ve: "ㄩㄝ", van: "ㄩㄢ", vn: "ㄩㄣ",
  };

  const STANDALONE_FINAL = {
    yi: "i", ya: "ia", ye: "ie", yao: "iao", you: "iu",
    yan: "ian", yin: "in", yang: "iang", ying: "ing", yong: "iong",
    wu: "u", wa: "ua", wo: "uo", wai: "uai", wei: "ui",
    wan: "uan", wen: "un", wang: "uang", weng: "ueng",
    yu: "v", yue: "ve", yuan: "van", yun: "vn",
  };

  const TONE_MARKS = {
    a: "āáǎàa", o: "ōóǒòo", e: "ēéěèe",
    i: "īíǐìi", u: "ūúǔùu", "ü": "ǖǘǚǜü",
  };
  const ZHUYIN_TONE = { 1: "", 2: "ˊ", 3: "ˇ", 4: "ˋ", 5: "˙" };

  function splitInitial(syll) {
    for (const ini of INITIALS) {
      if (syll.startsWith(ini)) return [ini, syll.slice(ini.length)];
    }
    return ["", syll];
  }

  function toUnderlyingFinal(initial, final) {
    if (initial === "y" || initial === "w") {
      const key = initial + final;
      if (key in STANDALONE_FINAL) return ["", STANDALONE_FINAL[key]];
      return ["", final];
    }
    if ((initial === "j" || initial === "q" || initial === "x") && final.startsWith("v")) {
      return [initial, final];
    }
    if ((initial === "j" || initial === "q" || initial === "x") && final.startsWith("u")) {
      return [initial, "v" + final.slice(1)];
    }
    if (["zh", "ch", "sh", "r", "z", "c", "s"].includes(initial) && final === "i") {
      return [initial, ""];
    }
    return [initial, final];
  }

  function parseTone(raw) {
    const m = /^([a-zA-Z:]+)([0-5])$/.exec((raw || "").trim());
    if (!m) return null;
    return { body: m[1].toLowerCase(), tone: parseInt(m[2], 10) || 5 };
  }

  function toZhuyin(raw) {
    const p = parseTone(raw);
    if (!p) return raw;
    const body = p.body.replace(/u:/g, "v");
    let [initial, final] = splitInitial(body);
    [initial, final] = toUnderlyingFinal(initial, final);
    const iniZ = INITIAL_ZHUYIN[initial] || "";
    const finZ = FINAL_ZHUYIN[final];
    if (finZ === undefined) return "?" + raw;
    if (p.tone === 5) return "˙" + iniZ + finZ;
    return iniZ + finZ + ZHUYIN_TONE[p.tone];
  }

  function placeToneMark(spelled, tone) {
    if (tone === 5 || !spelled) return spelled;
    const priority = ["a", "o", "e"];
    for (const v of priority) {
      const idx = spelled.indexOf(v);
      if (idx !== -1) return spelled.slice(0, idx) + TONE_MARKS[v][tone - 1] + spelled.slice(idx + 1);
    }
    for (let i = spelled.length - 1; i >= 0; i--) {
      const ch = spelled[i];
      if (ch === "i" || ch === "u" || ch === "ü") {
        return spelled.slice(0, i) + TONE_MARKS[ch][tone - 1] + spelled.slice(i + 1);
      }
    }
    return spelled;
  }

  function toToneMarkPinyin(raw) {
    const p = parseTone(raw);
    if (!p) return raw;
    const spelled = p.body.replace(/u:/g, "ü");
    return placeToneMark(spelled, p.tone);
  }

  function toneOf(raw) {
    const p = parseTone(raw);
    return p ? p.tone : null;
  }
  function setTone(raw, newTone) {
    const p = parseTone(raw);
    if (!p) return raw;
    return p.body + String(newTone);
  }

  // ---------- segmentation ----------
  const MAX_WORD_LEN = 4;
  const CJK_RE = /[\u4e00-\u9fff]/;

  function isSurnameish(entry) {
    return /^[A-Z]/.test(entry.p); // CEDICT capitalizes proper-noun/surname headwords
  }

  function pickPrimary(entries) {
    const common = entries.filter((e) => !isSurnameish(e));
    const pool = common.length ? common : entries;
    return pool[0];
  }

  // effective (possibly Taiwan-overridden) numbered pinyin for an entry
  function effectivePinyin(entry) {
    return entry.tw || entry.p;
  }

  function segment(text, dict) {
    const tokens = [];
    let i = 0;
    while (i < text.length) {
      let matched = null;
      if (CJK_RE.test(text[i])) {
        for (let len = MAX_WORD_LEN; len >= 1; len--) {
          if (i + len > text.length) continue;
          const cand = text.slice(i, i + len);
          if (dict[cand]) { matched = cand; break; }
        }
      }
      if (matched) {
        const entries = dict[matched];
        const primary = pickPrimary(entries);
        tokens.push({ hanzi: matched, entries, chosen: entries.indexOf(primary) });
        i += matched.length;
      } else {
        tokens.push({ hanzi: text[i], entries: null, chosen: 0 });
        i += 1;
      }
    }
    return tokens;
  }

  // Build the flat per-syllable stream (with references back to token index)
  // used for sandhi, and apply sandhi rules. Resets at any non-CJK token
  // (punctuation/space/newline) to respect prosodic breaks.
  function buildSyllableStream(tokens) {
    const stream = []; // {tokenIndex, syllIndex, raw}
    tokens.forEach((tok, ti) => {
      if (!tok.entries) { stream.push(null); return; } // boundary marker
      const entry = tok.entries[tok.chosen];
      const sylls = effectivePinyin(entry).split(" ");
      sylls.forEach((s, si) => stream.push({ tokenIndex: ti, syllIndex: si, raw: s }));
    });
    return stream;
  }

  function applySandhi(tokens) {
    const stream = buildSyllableStream(tokens);
    // group into runs separated by null boundaries
    const runs = [];
    let cur = [];
    for (const item of stream) {
      if (item === null) { if (cur.length) runs.push(cur); cur = []; }
      else cur.push(item);
    }
    if (cur.length) runs.push(cur);

    const result = {}; // "ti-si" -> { tone, sandhi: bool }
    for (const run of runs) {
      const origTones = run.map((it) => toneOf(it.raw));
      const newTones = origTones.slice();
      // 3-3 sandhi (non-cascading, based on original tones)
      for (let k = 0; k < run.length - 1; k++) {
        if (origTones[k] === 3 && origTones[k + 1] === 3) newTones[k] = 2;
      }
      // 不 + 4th tone -> bú (checked at the character's own position, so it
      // also fires inside multi-char words like 不錯/不是/是不是)
      for (let k = 0; k < run.length - 1; k++) {
        const tok = tokens[run[k].tokenIndex];
        const ch = tok.hanzi[run[k].syllIndex];
        if (ch === "不" && origTones[k] === 4 && origTones[k + 1] === 4) newTones[k] = 2;
      }
      // isolated 一 sandhi (only when "一" stands as its own single-char token,
      // i.e. it wasn't absorbed into a longer dictionary word)
      for (let k = 0; k < run.length - 1; k++) {
        const tok = tokens[run[k].tokenIndex];
        if (tok.hanzi === "一" && tok.entries && origTones[k] === 1) {
          newTones[k] = origTones[k + 1] === 4 ? 2 : (origTones[k + 1] <= 3 ? 4 : origTones[k]);
        }
      }
      run.forEach((it, k) => {
        result[`${it.tokenIndex}-${it.syllIndex}`] = {
          raw: setTone(it.raw, newTones[k]),
          changed: newTones[k] !== origTones[k],
        };
      });
    }
    return result;
  }

  const api = {
    toZhuyin, toToneMarkPinyin, parseTone, toneOf, setTone,
    segment, pickPrimary, effectivePinyin, applySandhi, isSurnameish,
  };
  if (typeof module !== "undefined") module.exports = api;
  else root.MandarinEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
