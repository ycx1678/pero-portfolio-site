(() => {
  const STORAGE_KEY = "pero-portfolio-admin-v1";
  const MAX_ZIP_BYTES = 200 * 1024 * 1024;
  const clone = (value) => JSON.parse(JSON.stringify(value));

  const storageAdapter = {
    async load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (error) {
        console.warn("Local portfolio state could not be read", error);
        return null;
      }
    },
    async save(value) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    }
  };

  // Replace this adapter with an authenticated storage API without changing the UI layer.
  window.PERO_ADMIN_STORAGE_ADAPTER = storageAdapter;

  const form = document.querySelector("#portfolio-form");
  const typeInput = document.querySelector("#work-type");
  const categoryInput = document.querySelector("#work-category");
  const titleInput = document.querySelector("#work-title");
  const thumbnailInput = document.querySelector("#work-thumbnail");
  const videoInput = document.querySelector("#work-video");
  const imageInput = document.querySelector("#work-image");
  const publishedInput = document.querySelector("#work-published");
  const zipInput = document.querySelector("#work-zip");
  const zipDrop = document.querySelector("[data-zip-drop]");
  const zipReport = document.querySelector("[data-zip-report]");
  const formError = document.querySelector("[data-form-error]");
  const list = document.querySelector("[data-admin-list]");
  const itemCount = document.querySelector("[data-item-count]");
  const saveState = document.querySelector("[data-save-state]");
  const undo = document.querySelector("[data-undo]");
  const undoMessage = document.querySelector("[data-undo-message]");
  const undoAction = document.querySelector("[data-undo-action]");
  const typeFields = [...document.querySelectorAll("[data-field]")];
  const settingsApi = window.PERO_SITE_SETTINGS;
  const portfolioApi = window.PERO_PORTFOLIO_API;
  const settingsForm = document.querySelector("#site-settings-form");
  const textSettingInputs = [...document.querySelectorAll("[data-text-setting]")];
  const colorSettingInputs = [...document.querySelectorAll("[data-color-setting]")];
  const colorPickers = [...document.querySelectorAll("[data-color-picker]")];
  const settingsState = document.querySelector("[data-settings-state]");
  const settingsError = document.querySelector("[data-settings-error]");
  const contrastReport = document.querySelector("[data-contrast-report]");
  const resetSettingsButton = document.querySelector("[data-reset-settings]");
  const loginShell = document.querySelector("[data-admin-login-shell]");
  const adminApp = document.querySelector("[data-admin-app]");
  const loginForm = document.querySelector("[data-admin-login]");
  const passwordInput = document.querySelector("[data-admin-password]");
  const signOutButton = document.querySelector("[data-admin-sign-out]");
  const loginState = document.querySelector("[data-admin-login-state]");
  const passwordChangeForm = document.querySelector("[data-admin-password-change]");
  const newPasswordInput = document.querySelector("[data-admin-new-password]");
  const passwordChangeState = document.querySelector("[data-admin-password-change-state]");
  const ADMIN_SESSION_KEY = "pero-portfolio-admin-session-v1";
  const LEGACY_PASSWORD_KEY = "pero-portfolio-admin-password-v1";

  let items = [];
  let pendingZip = null;
  let draggedId = null;
  let undoCallback = null;
  let undoTimer = 0;
  let saveTimer = 0;
  let defaultColors = null;

  const getAdminSession = () => sessionStorage.getItem(ADMIN_SESSION_KEY) || "";
  const clearAdminSession = () => {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    sessionStorage.removeItem(LEGACY_PASSWORD_KEY);
  };

  const showLogin = (message = "관리자 비밀번호를 입력해 주세요.") => {
    adminApp.hidden = true;
    loginShell.hidden = false;
    loginState.textContent = message;
    passwordInput.value = "";
    passwordChangeState.textContent = "로그인한 상태에서 새 비밀번호를 설정할 수 있습니다.";
  };

  const showAdmin = () => {
    loginShell.hidden = true;
    adminApp.hidden = false;
  };

  const currentCloudState = () => ({
    schemaVersion: 1,
    items,
    siteSettings: settingsApi.load()
  });

  const formatBytes = (bytes) => new Intl.NumberFormat("ko-KR", {
    style: "unit",
    unit: bytes >= 1024 * 1024 ? "megabyte" : "kilobyte",
    maximumFractionDigits: 1
  }).format(bytes >= 1024 * 1024 ? bytes / (1024 * 1024) : bytes / 1024);

  const setSaveMessage = (message) => {
    saveState.textContent = message;
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saveState.textContent = "브라우저에 자동 저장됩니다.";
    }, 1800);
  };

  const persist = async (message = "변경 내용을 저장했습니다.") => {
    try {
      await storageAdapter.save({ schemaVersion: 1, items });
      const sessionToken = getAdminSession();
      if (!portfolioApi?.configured || !sessionToken) {
        setSaveMessage(`${message} 로그인 상태가 아니라 이 브라우저에만 저장했습니다.`);
        return false;
      }

      await portfolioApi.save(currentCloudState(), sessionToken);
      setSaveMessage(`${message} 공개 포트폴리오에 반영했습니다.`);
      return true;
    } catch (error) {
      console.error("Portfolio state save failed", error);
      if (/authentication/i.test(error.message)) {
        clearAdminSession();
        showLogin("로그인 시간이 만료되었습니다. 다시 로그인해 주세요.");
      }
      saveState.textContent = "변경 내용을 저장하지 못했습니다. 현재 브라우저의 임시 저장값은 유지됩니다.";
      return false;
    }
  };

  const showUndo = (message, callback) => {
    window.clearTimeout(undoTimer);
    undoMessage.textContent = message;
    undoCallback = callback;
    undo.hidden = false;
    undoTimer = window.setTimeout(() => {
      undo.hidden = true;
      undoCallback = null;
    }, 7000);
  };

  undoAction.addEventListener("click", async () => {
    if (!undoCallback) return;
    const callback = undoCallback;
    undoCallback = null;
    undo.hidden = true;
    window.clearTimeout(undoTimer);
    await callback();
  });

  const colorToHex = (color) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
    return `#${[red, green, blue].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
  };

  const readThemeColors = () => {
    const styles = getComputedStyle(document.documentElement);
    return {
      paper: colorToHex(styles.getPropertyValue("--color-paper").trim()),
      paper2: colorToHex(styles.getPropertyValue("--color-paper-2").trim()),
      ink: colorToHex(styles.getPropertyValue("--color-ink").trim()),
      accent: colorToHex(styles.getPropertyValue("--color-accent").trim()),
      cyan: colorToHex(styles.getPropertyValue("--color-cyan").trim())
    };
  };

  const completeColors = (colors) => settingsApi.COLOR_KEYS.every((key) => /^#[0-9a-f]{6}$/i.test(colors?.[key] || ""));

  const readColorSettings = () => Object.fromEntries(colorSettingInputs.map((input) => [
    input.dataset.colorSetting,
    input.value.trim().toLowerCase()
  ]));

  const readTextSettings = () => Object.fromEntries(textSettingInputs.map((input) => [
    input.dataset.textSetting,
    input.value.trim()
  ]));

  const populateSettingsForm = (settings) => {
    textSettingInputs.forEach((input) => {
      input.value = settings.text[input.dataset.textSetting] ?? "";
      input.removeAttribute("aria-invalid");
    });

    const colors = completeColors(settings.colors) ? settings.colors : defaultColors;
    colorSettingInputs.forEach((input) => {
      input.value = colors[input.dataset.colorSetting].toUpperCase();
      input.removeAttribute("aria-invalid");
    });
    colorPickers.forEach((picker) => {
      picker.value = colors[picker.dataset.colorPicker];
      picker.removeAttribute("aria-invalid");
    });
  };

  const evaluateContrast = (colors) => {
    if (!completeColors(colors)) {
      contrastReport.dataset.state = "error";
      contrastReport.textContent = "색상은 # 뒤에 여섯 자리 값을 입력해 주세요.";
      return { valid: false, ratios: null };
    }

    const ratios = {
      paper: settingsApi.contrast(colors.ink, colors.paper),
      paper2: settingsApi.contrast(colors.ink, colors.paper2),
      cyan: settingsApi.contrast(colors.ink, colors.cyan),
      accent: Math.max(
        settingsApi.contrast(colors.ink, colors.accent),
        settingsApi.contrast(colors.paper, colors.accent)
      )
    };
    const valid = Object.values(ratios).every((ratio) => ratio >= 4.5);
    contrastReport.dataset.state = valid ? "valid" : "error";
    contrastReport.textContent = `${valid ? "대비 통과" : "대비 부족"} · 본문 ${ratios.paper.toFixed(1)}:1 · 보조 배경 ${ratios.paper2.toFixed(1)}:1 · 포인트 ${ratios.cyan.toFixed(1)}:1 · 강조 버튼 ${ratios.accent.toFixed(1)}:1`;
    return { valid, ratios };
  };

  const previewColors = () => {
    const colors = readColorSettings();
    const result = evaluateContrast(colors);
    if (completeColors(colors)) settingsApi.applyColors(colors);
    return result;
  };

  colorPickers.forEach((picker) => {
    picker.addEventListener("input", () => {
      const input = colorSettingInputs.find((field) => field.dataset.colorSetting === picker.dataset.colorPicker);
      input.value = picker.value.toUpperCase();
      input.removeAttribute("aria-invalid");
      settingsError.textContent = "";
      previewColors();
    });
  });

  colorSettingInputs.forEach((input) => {
    input.addEventListener("input", () => {
      const value = input.value.trim();
      const valid = /^#[0-9a-f]{6}$/i.test(value);
      if (valid) {
        const picker = colorPickers.find((field) => field.dataset.colorPicker === input.dataset.colorSetting);
        picker.value = value.toLowerCase();
        input.removeAttribute("aria-invalid");
        settingsError.textContent = "";
        previewColors();
      }
    });
    input.addEventListener("blur", () => {
      const valid = /^#[0-9a-f]{6}$/i.test(input.value.trim());
      input.setAttribute("aria-invalid", String(!valid));
      if (!valid) settingsError.textContent = "색상 값이 올바르지 않습니다. # 뒤에 여섯 자리 값을 입력해 주세요.";
    });
  });

  settingsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    settingsError.textContent = "";

    const emptyText = textSettingInputs.find((input) => !input.value.trim());
    textSettingInputs.forEach((input) => input.setAttribute("aria-invalid", String(!input.value.trim())));
    if (emptyText) {
      settingsError.textContent = "비어 있는 문구가 있습니다. 공개 페이지에 표시할 내용을 입력해 주세요.";
      emptyText.focus();
      return;
    }

    const colors = readColorSettings();
    colorSettingInputs.forEach((input) => {
      input.setAttribute("aria-invalid", String(!/^#[0-9a-f]{6}$/i.test(input.value.trim())));
    });
    const contrastResult = evaluateContrast(colors);
    if (!contrastResult.valid) {
      settingsError.textContent = "본문이 읽히도록 배경·글자·포인트 색상의 대비를 4.5:1 이상으로 맞춰 주세요.";
      colorSettingInputs.find((input) => input.getAttribute("aria-invalid") === "true")?.focus();
      return;
    }

    try {
      settingsApi.save({ schemaVersion: 1, text: readTextSettings(), colors });
      const published = await persist("문구와 색상을 저장했습니다.");
      settingsState.textContent = published ? "문구와 색상을 공개 포트폴리오에 반영했습니다." : "문구와 색상을 이 브라우저에 저장했습니다.";
    } catch (error) {
      console.error("Site settings save failed", error);
      settingsError.textContent = "페이지 설정을 저장하지 못했습니다. 로그인 상태를 확인해 주세요.";
    }
  });

  resetSettingsButton.addEventListener("click", async () => {
    const previous = settingsApi.load();
    const defaults = settingsApi.reset();
    populateSettingsForm({ ...defaults, colors: defaultColors });
    evaluateContrast(defaultColors);
    const published = await persist("기본 문구와 색상으로 되돌렸습니다.");
    settingsState.textContent = published ? "기본 문구와 색상을 공개 포트폴리오에 반영했습니다." : "기본 문구와 색상을 이 브라우저에 저장했습니다.";
    settingsError.textContent = "";
    showUndo("페이지 설정을 기본값으로 되돌렸습니다.", async () => {
      const restored = settingsApi.save(previous);
      populateSettingsForm(restored);
      evaluateContrast(completeColors(restored.colors) ? restored.colors : defaultColors);
      const restoredPublished = await persist("이전 페이지 설정을 복원했습니다.");
      settingsState.textContent = restoredPublished ? "이전 페이지 설정을 공개 포트폴리오에 반영했습니다." : "이전 페이지 설정을 이 브라우저에 저장했습니다.";
    });
  });

  const createButton = (label, action, disabled = false) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.action = action;
    button.textContent = label;
    button.disabled = disabled;
    return button;
  };

  const typeLabels = {
    live2d: "Live2D 모델",
    youtube: "영상",
    image: "이미지"
  };

  const kindLabels = {
    "INTERACTIVE LIVE2D": "움직이는 캐릭터",
    "RIGGING FILM": "작업 영상",
    "PARTS SEPARATION": "파츠 분리",
    "CHARACTER DESIGN": "캐릭터 디자인",
    "CHARACTER SHEET": "캐릭터 설정표"
  };

  const renderList = () => {
    list.replaceChildren();
    items.forEach((item, index) => {
      const row = document.createElement("li");
      row.className = "admin-item";
      row.dataset.itemId = item.id;

      const thumb = document.createElement("img");
      thumb.className = "admin-item__thumb";
      thumb.src = item.thumbnail || "assets/26523-cover.jpg";
      thumb.alt = "";
      thumb.width = 84;
      thumb.height = 84;
      thumb.loading = "lazy";

      const body = document.createElement("div");
      body.className = "admin-item__body";
      const top = document.createElement("div");
      top.className = "admin-item__top";
      const name = document.createElement("div");
      name.className = "admin-item__name";
      const strong = document.createElement("strong");
      strong.textContent = item.title;
      const meta = document.createElement("span");
      meta.textContent = `${typeLabels[item.type] || "작품"} · ${kindLabels[item.kind] || item.kind || "짧은 설명 없음"}`;
      name.append(strong, meta);
      const number = document.createElement("span");
      number.className = "admin-item__index";
      number.textContent = String(index + 1).padStart(2, "0");
      const position = document.createElement("span");
      position.className = "admin-item__position";
      const dragHandle = document.createElement("span");
      dragHandle.className = "admin-item__drag";
      dragHandle.draggable = true;
      dragHandle.title = `${item.title} 드래그해 순서 변경`;
      dragHandle.setAttribute("aria-hidden", "true");
      dragHandle.textContent = "↕";
      position.append(number, dragHandle);
      top.append(name, position);

      const bottom = document.createElement("div");
      bottom.className = "admin-item__bottom";
      const publish = document.createElement("label");
      publish.className = "admin-item__publish";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = item.published !== false;
      checkbox.dataset.action = "publish";
      const publishText = document.createElement("span");
      publishText.textContent = checkbox.checked ? "공개" : "비공개";
      publish.append(checkbox, publishText);

      const actions = document.createElement("div");
      actions.className = "admin-item__buttons";
      const up = createButton("↑", "up", index === 0);
      up.setAttribute("aria-label", `${item.title} 위로 이동`);
      const down = createButton("↓", "down", index === items.length - 1);
      down.setAttribute("aria-label", `${item.title} 아래로 이동`);
      const remove = createButton("×", "remove");
      remove.setAttribute("aria-label", `${item.title} 목록에서 빼기`);
      actions.append(up, down, remove);
      bottom.append(publish, actions);
      body.append(top, bottom);
      row.append(thumb, body);
      list.append(row);
    });
    itemCount.textContent = `${items.length}개`;
  };

  const normalizeArchivePath = (value) => value.replaceAll("\\", "/").replace(/^\.\//, "");

  const resolveReference = (basePath, reference) => {
    const segments = normalizeArchivePath(`${basePath}${reference}`).split("/");
    const output = [];
    for (const segment of segments) {
      if (!segment || segment === ".") continue;
      if (segment === "..") {
        if (!output.length) throw new Error("모델 참조 경로가 ZIP 바깥을 가리킵니다.");
        output.pop();
      } else {
        output.push(segment);
      }
    }
    return output.join("/");
  };

  const collectReferences = (modelJson) => {
    const refs = modelJson.FileReferences || {};
    const required = [];
    const optional = [];
    if (refs.Moc) required.push(refs.Moc);
    if (Array.isArray(refs.Textures)) required.push(...refs.Textures);
    [refs.Physics, refs.Pose, refs.DisplayInfo, refs.UserData].filter(Boolean).forEach((path) => optional.push(path));
    (refs.Expressions || []).forEach((entry) => entry.File && optional.push(entry.File));
    Object.values(refs.Motions || {}).flat().forEach((entry) => {
      if (entry.File) optional.push(entry.File);
      if (entry.Sound) optional.push(entry.Sound);
    });
    return { required, optional };
  };

  const validateModelZip = async (file) => {
    if (!window.JSZip) throw new Error("파일 확인 도구를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.");
    if (!file?.name.toLowerCase().endsWith(".zip")) throw new Error("압축(.zip) 파일을 선택해 주세요.");
    if (file.size > MAX_ZIP_BYTES) throw new Error("파일 크기가 200 MB를 넘습니다. 이미지 크기를 줄인 뒤 다시 시도해 주세요.");

    const archive = await window.JSZip.loadAsync(file);
    const entries = Object.values(archive.files).filter((entry) => !entry.dir);
    if (!entries.length) throw new Error("ZIP 안에 파일이 없습니다.");

    for (const entry of entries) {
      const original = entry.unsafeOriginalName || entry.name;
      const parts = original.replaceAll("\\", "/").split("/");
      if (original.startsWith("/") || /^[a-z]:/i.test(original) || parts.includes("..")) {
        throw new Error(`안전하지 않은 파일 경로가 있습니다: ${original}`);
      }
    }

    const fileNames = new Set(entries.map((entry) => normalizeArchivePath(entry.name)));
    const modelEntries = entries.filter((entry) => entry.name.toLowerCase().endsWith(".model3.json"));
    if (modelEntries.length !== 1) {
      throw new Error(`모델 설정 파일은 1개여야 합니다. 현재 ${modelEntries.length}개가 들어 있습니다.`);
    }

    const modelEntry = modelEntries[0];
    let modelJson;
    try {
      modelJson = JSON.parse(await modelEntry.async("string"));
    } catch {
      throw new Error("모델 설정 파일을 읽을 수 없습니다. 파일을 다시 확인해 주세요.");
    }

    const references = modelJson.FileReferences || {};
    if (!references.Moc?.toLowerCase().endsWith(".moc3")) throw new Error("필요한 모델 파일(.moc3)을 찾을 수 없습니다.");
    if (!Array.isArray(references.Textures) || !references.Textures.length) throw new Error("모델에 필요한 이미지 파일을 찾을 수 없습니다.");

    const modelPath = normalizeArchivePath(modelEntry.name);
    const slash = modelPath.lastIndexOf("/");
    const basePath = slash >= 0 ? modelPath.slice(0, slash + 1) : "";
    const { required, optional } = collectReferences(modelJson);
    const allReferences = [...required, ...optional];
    const resolved = allReferences.map((path) => resolveReference(basePath, path));
    const missing = resolved.filter((path) => !fileNames.has(path));
    if (missing.length) {
      const preview = missing.slice(0, 4).join(", ");
      throw new Error(`모델이 필요로 하는 파일이 압축 파일 안에 없습니다: ${preview}${missing.length > 4 ? " 외" : ""}`);
    }

    const expressions = (references.Expressions || []).map((entry) => entry.Name).filter(Boolean);
    const motionCount = Object.values(references.Motions || {}).flat().length;
    return {
      fileName: file.name,
      size: file.size,
      modelPath,
      modelName: modelPath.split("/").pop().replace(/\.model3\.json$/i, ""),
      textureCount: references.Textures.length,
      expressionCount: expressions.length,
      expressions,
      motionCount,
      fileCount: entries.length
    };
  };

  const renderZipReport = (state, message, details = []) => {
    zipReport.dataset.state = state;
    zipReport.replaceChildren();
    const text = document.createElement("p");
    text.textContent = message;
    zipReport.append(text);
    if (details.length) {
      const detailList = document.createElement("ul");
      details.forEach((detail) => {
        const item = document.createElement("li");
        item.textContent = detail;
        detailList.append(item);
      });
      zipReport.append(detailList);
    }
  };

  const inspectZip = async (file) => {
    pendingZip = null;
    renderZipReport("loading", `${file.name}을 확인하고 있습니다…`);
    try {
      pendingZip = await validateModelZip(file);
      renderZipReport("valid", "공개에 필요한 파일을 확인했습니다.", [
        `모델 이름: ${pendingZip.modelName}`,
        `이미지 ${pendingZip.textureCount}개 · 움직임 ${pendingZip.motionCount}개 · 표정 ${pendingZip.expressionCount}개`,
        `파일 ${pendingZip.fileCount}개 · ${formatBytes(pendingZip.size)}`
      ]);
    } catch (error) {
      renderZipReport("error", error.message);
    }
  };

  zipInput.addEventListener("change", () => {
    const [file] = zipInput.files;
    if (file) inspectZip(file);
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    zipDrop.addEventListener(eventName, (event) => {
      event.preventDefault();
      zipDrop.classList.add("is-over");
    });
  });
  ["dragleave", "drop"].forEach((eventName) => {
    zipDrop.addEventListener(eventName, (event) => {
      event.preventDefault();
      zipDrop.classList.remove("is-over");
    });
  });
  zipDrop.addEventListener("drop", (event) => {
    const [file] = event.dataTransfer.files;
    if (file) inspectZip(file);
  });

  const categoryDefaults = {
    live2d: "움직이는 캐릭터",
    youtube: "작업 영상",
    image: "일러스트"
  };

  const updateTypeFields = () => {
    const type = typeInput.value;
    typeFields.forEach((field) => {
      const fieldName = field.dataset.field;
      field.hidden = !["thumbnail", type].includes(fieldName);
    });
    videoInput.required = type === "youtube";
    imageInput.required = type === "image";
    categoryInput.value = categoryDefaults[type];
    formError.textContent = "";
  };

  typeInput.addEventListener("change", updateTypeFields);

  const slugify = (value) => value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-|-$/g, "") || "work";

  const getYouTubeVideoId = (value) => {
    const input = value.trim();
    try {
      const url = new URL(input);
      const host = url.hostname.replace(/^www\./i, "").toLowerCase();
      if (host === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] || "";
      if (host.endsWith("youtube.com")) {
        if (url.pathname === "/watch") return url.searchParams.get("v") || "";
        const [section, videoId] = url.pathname.split("/").filter(Boolean);
        if (["shorts", "embed", "live"].includes(section)) return videoId || "";
      }
    } catch {
      // Existing saved video IDs remain supported for people who already have one.
    }
    return /^[a-zA-Z0-9_-]{6,}$/.test(input) ? input : "";
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    formError.textContent = "";

    const type = typeInput.value;
    const fields = [typeInput, categoryInput, titleInput, thumbnailInput];
    if (type === "youtube") fields.push(videoInput);
    if (type === "image") fields.push(imageInput);
    const invalid = fields.find((field) => !field.value.trim());
    fields.forEach((field) => field.setAttribute("aria-invalid", String(!field.value.trim())));
    if (invalid) {
      formError.textContent = "필수 정보가 비어 있습니다. 표시된 항목을 입력해 주세요.";
      invalid.focus();
      return;
    }
    const videoId = type === "youtube" ? getYouTubeVideoId(videoInput.value) : "";
    if (type === "youtube" && !videoId) {
      videoInput.setAttribute("aria-invalid", "true");
      formError.textContent = "YouTube 영상 링크를 확인해 주세요.";
      videoInput.focus();
      return;
    }
    if (type === "live2d" && !pendingZip) {
      formError.textContent = "확인을 마친 Live2D 모델 파일을 먼저 선택해 주세요.";
      zipDrop.focus();
      return;
    }

    const title = titleInput.value.trim();
    const slug = slugify(title);
    const item = {
      id: `${slug}-${Date.now().toString(36)}`,
      type,
      kind: categoryInput.value.trim(),
      title,
      thumbnail: thumbnailInput.value.trim(),
      thumbnailAlt: `${title} 선택`,
      published: publishedInput.checked
    };

    if (type === "youtube") item.videoId = videoId;
    if (type === "image") {
      item.image = imageInput.value.trim();
      item.imageAlt = `${title} 작업 이미지`;
    }
    if (type === "live2d") {
      item.modelUrl = `uploads/${slug}/${pendingZip.modelPath}`;
      item.expressions = pendingZip.expressions;
      item.sourceZip = pendingZip.fileName;
    }

    items.push(item);
    renderList();
    await persist("새 작품을 목록에 저장했습니다.");
    form.reset();
    typeInput.value = "live2d";
    publishedInput.checked = true;
    pendingZip = null;
    renderZipReport("idle", "파일을 선택하면 공개에 필요한 파일이 있는지 확인합니다.");
    updateTypeFields();
    titleInput.focus({ preventScroll: true });
  });

  list.addEventListener("change", async (event) => {
    if (event.target.dataset.action !== "publish") return;
    const row = event.target.closest("[data-item-id]");
    const item = items.find((entry) => entry.id === row.dataset.itemId);
    if (!item) return;
    item.published = event.target.checked;
    event.target.nextElementSibling.textContent = item.published ? "공개" : "비공개";
    await persist(`${item.title}: ${item.published ? "공개" : "비공개"} 상태로 저장했습니다.`);
  });

  list.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const row = button.closest("[data-item-id]");
    const index = items.findIndex((entry) => entry.id === row.dataset.itemId);
    if (index < 0) return;

    if (button.dataset.action === "up" && index > 0) {
      [items[index - 1], items[index]] = [items[index], items[index - 1]];
    }
    if (button.dataset.action === "down" && index < items.length - 1) {
      [items[index], items[index + 1]] = [items[index + 1], items[index]];
    }
    if (button.dataset.action === "remove") {
      const [removed] = items.splice(index, 1);
      showUndo(`${removed.title}을 목록에서 뺐습니다.`, async () => {
        items.splice(index, 0, removed);
        renderList();
        await persist("이전 작품 목록으로 되돌렸습니다.");
      });
    }
    renderList();
    await persist();
  });

  list.addEventListener("dragstart", (event) => {
    const handle = event.target.closest(".admin-item__drag");
    if (!handle) {
      event.preventDefault();
      return;
    }
    const row = event.target.closest("[data-item-id]");
    if (!row) return;
    draggedId = row.dataset.itemId;
    row.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", draggedId);
  });
  list.addEventListener("dragover", (event) => {
    const row = event.target.closest("[data-item-id]");
    if (!row || row.dataset.itemId === draggedId) return;
    event.preventDefault();
    list.querySelectorAll(".is-drop-target").forEach((item) => item.classList.remove("is-drop-target"));
    row.classList.add("is-drop-target");
  });
  list.addEventListener("drop", async (event) => {
    const row = event.target.closest("[data-item-id]");
    if (!row || !draggedId || row.dataset.itemId === draggedId) return;
    event.preventDefault();
    const from = items.findIndex((entry) => entry.id === draggedId);
    const to = items.findIndex((entry) => entry.id === row.dataset.itemId);
    const [moved] = items.splice(from, 1);
    items.splice(to, 0, moved);
    draggedId = null;
    renderList();
    await persist("작품 순서를 저장했습니다.");
  });
  list.addEventListener("dragend", () => {
    draggedId = null;
    list.querySelectorAll(".is-dragging, .is-drop-target").forEach((item) => {
      item.classList.remove("is-dragging", "is-drop-target");
    });
  });

  document.querySelector("[data-export-json]").addEventListener("click", () => {
    const payload = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      siteSettings: settingsApi.load(),
      items
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "pero-portfolio-backup.json";
    link.click();
    URL.revokeObjectURL(url);
    setSaveMessage("작품 목록 백업 파일을 받았습니다.");
  });

  document.querySelector("[data-reset-sample]").addEventListener("click", async () => {
    const previous = clone(items);
    items = clone(window.PERO_PORTFOLIO_ITEMS || []);
    renderList();
    await persist("샘플 작품 목록으로 바꿨습니다.");
    showUndo("샘플 작품 목록으로 바꿨습니다.", async () => {
      items = previous;
      renderList();
      await persist("이전 작품 목록으로 되돌렸습니다.");
    });
  });

  const loadPublishedState = async () => {
    if (!portfolioApi?.configured) throw new Error("The portfolio API is not configured.");
    const publishedState = await portfolioApi.read();
    if (!publishedState) {
      setSaveMessage("아직 공개된 데이터가 없습니다. 첫 저장 시 공개 포트폴리오가 생성됩니다.");
      return;
    }

    if (Array.isArray(publishedState.items)) items = clone(publishedState.items);
    if (publishedState.siteSettings) settingsApi.save(publishedState.siteSettings);
    setSaveMessage("최신 공개 포트폴리오를 불러왔습니다.");
  };

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = passwordInput.value;
    if (!password) {
      passwordInput.setAttribute("aria-invalid", "true");
      loginState.textContent = "비밀번호를 입력해 주세요.";
      passwordInput.focus();
      return;
    }

    passwordInput.setAttribute("aria-invalid", "false");
    loginState.textContent = "로그인하는 중입니다…";
    try {
      const session = await portfolioApi.login(password);
      sessionStorage.setItem(ADMIN_SESSION_KEY, session.token);
      passwordInput.value = "";
      showAdmin();
      await initialize();
    } catch (error) {
      console.error("Administrator login failed", error);
      clearAdminSession();
      loginState.textContent = "비밀번호가 맞지 않거나 로그인할 수 없습니다.";
      passwordInput.focus();
    }
  });

  passwordChangeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const sessionToken = getAdminSession();
    const newPassword = newPasswordInput.value;
    if (!sessionToken) {
      clearAdminSession();
      showLogin("로그인 시간이 만료되었습니다. 다시 로그인해 주세요.");
      return;
    }
    if (newPassword.length < 8 || newPassword.length > 128) {
      newPasswordInput.setAttribute("aria-invalid", "true");
      passwordChangeState.textContent = "새 비밀번호는 8~128자로 입력해 주세요.";
      newPasswordInput.focus();
      return;
    }

    newPasswordInput.setAttribute("aria-invalid", "false");
    passwordChangeState.textContent = "새 비밀번호를 저장하는 중입니다…";
    try {
      const session = await portfolioApi.changePassword(sessionToken, newPassword);
      sessionStorage.setItem(ADMIN_SESSION_KEY, session.token);
      newPasswordInput.value = "";
      passwordChangeState.textContent = "새 비밀번호로 변경했습니다. 이 브라우저의 로그인은 유지됩니다.";
    } catch (error) {
      console.error("Administrator password change failed", error);
      if (/authentication/i.test(error.message)) {
        clearAdminSession();
        showLogin("로그인 시간이 만료되었습니다. 다시 로그인해 주세요.");
      }
      passwordChangeState.textContent = "비밀번호를 바꾸지 못했습니다. 잠시 후 다시 시도해 주세요.";
    }
  });

  signOutButton.addEventListener("click", async () => {
    const sessionToken = getAdminSession();
    try {
      if (sessionToken && portfolioApi?.configured) await portfolioApi.signOut(sessionToken);
    } catch (error) {
      console.warn("Administrator logout request failed", error);
    }
    clearAdminSession();
    showLogin("로그아웃했습니다.");
  });

  const initialize = async () => {
    const savedSettings = settingsApi.load();
    settingsApi.clearColors();
    defaultColors = readThemeColors();
    settingsApi.applyColors(savedSettings.colors);

    const saved = await storageAdapter.load();
    items = Array.isArray(saved?.items) ? saved.items : clone(window.PERO_PORTFOLIO_ITEMS || []);
    try {
      await loadPublishedState();
    } catch (error) {
      console.error("Published portfolio state could not be loaded", error);
      setSaveMessage("공개 포트폴리오를 불러오지 못했습니다. 잠시 후 다시 로그인해 주세요.");
    }

    const activeSettings = settingsApi.load();
    populateSettingsForm(activeSettings);
    evaluateContrast(completeColors(activeSettings.colors) ? activeSettings.colors : defaultColors);
    renderList();
    updateTypeFields();
  };

  const restoreSession = async () => {
    sessionStorage.removeItem(LEGACY_PASSWORD_KEY);
    const sessionToken = getAdminSession();
    if (!sessionToken) {
      showLogin();
      return;
    }
    if (!portfolioApi?.configured) {
      clearAdminSession();
      showLogin("로그인 서비스를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }

    loginState.textContent = "로그인 상태를 확인하는 중입니다…";
    try {
      await portfolioApi.session(sessionToken);
      showAdmin();
      await initialize();
    } catch (error) {
      console.warn("Administrator session could not be restored", error);
      clearAdminSession();
      showLogin("로그인 시간이 만료되었습니다. 다시 로그인해 주세요.");
    }
  };

  restoreSession();
})();
