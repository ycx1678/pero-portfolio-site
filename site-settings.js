(() => {
  const STORAGE_KEY = "pero-site-settings-v1";
  const COLOR_KEYS = ["paper", "paper2", "ink", "accent", "cyan"];
  const TOKEN_NAMES = [
    "--color-paper",
    "--color-paper-2",
    "--color-paper-3",
    "--color-ink",
    "--color-ink-2",
    "--color-muted",
    "--color-rule",
    "--color-rule-strong",
    "--color-accent",
    "--color-accent-ink",
    "--color-accent-soft",
    "--color-cyan",
    "--color-cyan-soft",
    "--color-focus",
    "--color-overlay",
    "--color-shadow"
  ];

  const DEFAULT_TEXT = Object.freeze({
    heroAvailability: "현재 접수 중 · 답변율 94%",
    heroTitle: "Live2D 일러스트부터 리깅까지.",
    heroLede: "캐릭터 디자인, 파츠 분할, Live2D 리깅을 한 번에 진행합니다. 개인 방송용 모델과 기업 프로젝트 모두 상담 가능합니다.",
    heroPrimaryCta: "포트폴리오 보기 ↓",
    heroSecondaryCta: "아트머그에서 문의 ↗",
    workLabel: "Live2D · 영상 · 일러스트",
    workTitle: "움직임을 직접 확인해 보세요",
    workLede: "첫 번째 작품은 마우스와 손가락으로 조작할 수 있는 테스트 모델입니다. 다른 썸네일에서는 영상과 일러스트 작업을 이어서 볼 수 있습니다.",
    inquiryTitle: "아트머그 문의 전에 준비해 주세요.",
    inquiryLede: "희망 작업과 사용 목적, 일정, 참고 자료를 입력하면 문의 문구가 자동으로 만들어집니다. 복사한 내용을 아트머그 문의창에 붙여 넣어 주세요.",
    stickyText: "현재 접수 중 · 기본 작업 기간 7–14일",
    stickyCta: "아트머그에서 문의하기 ↗"
  });

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const isHex = (value) => /^#[0-9a-f]{6}$/i.test(value || "");

  const normalize = (value) => {
    const text = { ...DEFAULT_TEXT };
    Object.keys(DEFAULT_TEXT).forEach((key) => {
      if (typeof value?.text?.[key] === "string") text[key] = value.text[key];
    });

    const colors = {};
    COLOR_KEYS.forEach((key) => {
      const candidate = value?.colors?.[key];
      if (isHex(candidate)) colors[key] = candidate.toLowerCase();
    });

    return { schemaVersion: 1, text, colors };
  };

  const load = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return normalize(raw ? JSON.parse(raw) : null);
    } catch (error) {
      console.warn("Site settings could not be read", error);
      return normalize(null);
    }
  };

  const hexToRgb = (hex) => {
    const value = Number.parseInt(hex.slice(1), 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  };

  const relativeLuminance = (hex) => {
    const [red, green, blue] = hexToRgb(hex).map((value) => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };

  const contrast = (first, second) => {
    const light = Math.max(relativeLuminance(first), relativeLuminance(second));
    const dark = Math.min(relativeLuminance(first), relativeLuminance(second));
    return (light + 0.05) / (dark + 0.05);
  };

  const chooseReadable = (background, candidates) => candidates
    .map((color) => ({ color, ratio: contrast(background, color) }))
    .sort((first, second) => second.ratio - first.ratio)[0].color;

  const clearColors = () => {
    TOKEN_NAMES.forEach((name) => document.documentElement.style.removeProperty(name));
  };

  const applyColors = (colors) => {
    if (!COLOR_KEYS.every((key) => isHex(colors?.[key]))) {
      clearColors();
      return;
    }

    const root = document.documentElement.style;
    const accentInk = chooseReadable(colors.accent, [colors.ink, colors.paper]);
    const focusCandidates = [colors.accent, colors.cyan, colors.ink];
    const focus = focusCandidates
      .map((color) => ({
        color,
        score: Math.min(contrast(color, colors.paper), contrast(color, colors.paper2))
      }))
      .sort((first, second) => second.score - first.score)[0].color;

    root.setProperty("--color-paper", colors.paper);
    root.setProperty("--color-paper-2", colors.paper2);
    root.setProperty("--color-paper-3", `color-mix(in oklch, ${colors.paper2} 94%, ${colors.ink})`);
    root.setProperty("--color-ink", colors.ink);
    root.setProperty("--color-ink-2", `color-mix(in oklch, ${colors.ink} 84%, ${colors.paper})`);
    root.setProperty("--color-muted", `color-mix(in oklch, ${colors.ink} 70%, ${colors.paper})`);
    root.setProperty("--color-rule", `color-mix(in oklch, ${colors.ink} 25%, ${colors.paper})`);
    root.setProperty("--color-rule-strong", `color-mix(in oklch, ${colors.ink} 55%, ${colors.paper})`);
    root.setProperty("--color-accent", colors.accent);
    root.setProperty("--color-accent-ink", accentInk);
    root.setProperty("--color-accent-soft", `color-mix(in oklch, ${colors.accent} 18%, ${colors.paper})`);
    root.setProperty("--color-cyan", colors.cyan);
    root.setProperty("--color-cyan-soft", `color-mix(in oklch, ${colors.cyan} 18%, ${colors.paper})`);
    root.setProperty("--color-focus", focus);
    root.setProperty("--color-overlay", `color-mix(in oklch, ${colors.ink} 76%, transparent)`);
    root.setProperty("--color-shadow", `color-mix(in oklch, ${colors.ink} 12%, transparent)`);
  };

  const applyText = (text) => {
    document.querySelectorAll("[data-site-text]").forEach((element) => {
      const key = element.dataset.siteText;
      if (typeof text?.[key] === "string") element.textContent = text[key];
    });
  };

  const apply = (settings = load()) => {
    const normalized = normalize(settings);
    applyColors(normalized.colors);
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => applyText(normalized.text), { once: true });
    } else {
      applyText(normalized.text);
    }
    return normalized;
  };

  const save = (settings) => {
    const normalized = normalize(settings);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    apply(normalized);
    window.dispatchEvent(new CustomEvent("pero:site-settings", { detail: clone(normalized) }));
    return normalized;
  };

  const reset = () => {
    localStorage.removeItem(STORAGE_KEY);
    const defaults = normalize(null);
    apply(defaults);
    window.dispatchEvent(new CustomEvent("pero:site-settings", { detail: clone(defaults) }));
    return defaults;
  };

  window.PERO_SITE_SETTINGS = Object.freeze({
    STORAGE_KEY,
    COLOR_KEYS: [...COLOR_KEYS],
    DEFAULT_TEXT: clone(DEFAULT_TEXT),
    load,
    save,
    reset,
    apply,
    applyColors,
    clearColors,
    contrast
  });

  const initial = load();
  applyColors(initial.colors);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => applyText(initial.text), { once: true });
  } else {
    applyText(initial.text);
  }

  const remoteState = window.PERO_PORTFOLIO_REMOTE_STATE;
  remoteState?.then((state) => {
    if (!state?.siteSettings) return;
    const isAdminPage = /\/admin(?:\.html)?$/.test(window.location.pathname);
    if (isAdminPage && localStorage.getItem(STORAGE_KEY)) return;
    const remoteSettings = normalize(state.siteSettings);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(remoteSettings));
    } catch (error) {
      console.warn("Cloud site settings could not be cached", error);
    }
    apply(remoteSettings);
  }).catch(() => {});

  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) apply(load());
  });
})();
