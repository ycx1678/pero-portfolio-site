(() => {
  const root = document.querySelector("[data-portfolio-workbench]");
  const items = (window.PERO_PORTFOLIO_ITEMS || []).filter((item) => item.published !== false);

  if (!root || !items.length) return;

  const rail = root.querySelector("[data-portfolio-rail]");
  const media = root.querySelector("[data-portfolio-media]");
  const canvas = root.querySelector("#live2d-canvas");
  const image = root.querySelector("[data-portfolio-image]");
  const video = root.querySelector("[data-portfolio-video]");
  const videoPoster = root.querySelector("[data-portfolio-video-poster]");
  const loading = root.querySelector("[data-live2d-loading]");
  const fallback = root.querySelector("[data-live2d-fallback]");
  const retry = root.querySelector("[data-live2d-retry]");
  const hint = root.querySelector("[data-live2d-hint]");
  const controls = root.querySelector("[data-live2d-controls]");
  const notes = root.querySelector("[data-portfolio-notes]");
  const credit = root.querySelector("[data-live2d-credit]");
  const title = root.querySelector("[data-portfolio-title]");
  const kind = root.querySelector("[data-portfolio-kind]");
  const counter = root.querySelector("[data-portfolio-counter]");
  const status = root.querySelector("[data-portfolio-status]");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const dependencies = [
    "https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js",
    "https://cdn.jsdelivr.net/npm/pixi.js@6.5.10/dist/browser/pixi.min.js",
    "https://cdn.jsdelivr.net/npm/pixi-live2d-display@0.4.0/dist/cubism4.min.js"
  ];

  let activeIndex = 0;
  let app = null;
  let model = null;
  let modelPromise = null;
  let idleTimer = 0;
  let pointerId = null;
  let resizeFrame = 0;

  const loadScript = (src) => new Promise((resolve, reject) => {
    const found = document.querySelector(`script[src="${src}"]`);
    if (found?.dataset.loaded === "true") {
      resolve();
      return;
    }
    if (found) {
      found.addEventListener("load", resolve, { once: true });
      found.addEventListener("error", reject, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.crossOrigin = "anonymous";
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    }, { once: true });
    script.addEventListener("error", () => reject(new Error(`Dependency failed: ${src}`)), { once: true });
    document.head.append(script);
  });

  const updateActiveButton = () => {
    rail.querySelectorAll(".portfolio-thumb").forEach((button, index) => {
      const selected = index === activeIndex;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
  };

  const renderRail = () => {
    rail.innerHTML = items.map((item, index) => `
      <button class="portfolio-thumb" type="button" role="option" aria-selected="${index === 0}" aria-label="${item.title}" data-portfolio-index="${index}" tabindex="${index === 0 ? 0 : -1}">
        <span class="portfolio-thumb__image">
          <img src="${item.thumbnail}" width="320" height="240" alt="${item.thumbnailAlt}" loading="lazy">
          <span class="portfolio-thumb__type">${item.type === "live2d" ? "LIVE" : item.type === "youtube" ? "FILM" : "STILL"}</span>
        </span>
        <span class="portfolio-thumb__title">${item.title}</span>
      </button>
    `).join("");
  };

  const fitModel = () => {
    if (!app || !model) return;
    const width = app.renderer.screen.width;
    const height = app.renderer.screen.height;
    const bounds = model.getLocalBounds();
    const modelWidth = bounds.width || model.width / Math.abs(model.scale.x || 1);
    const modelHeight = bounds.height || model.height / Math.abs(model.scale.y || 1);
    const scale = Math.min((width * 0.86) / modelWidth, (height * 0.93) / modelHeight);
    model.scale.set(scale);
    model.anchor.set(0.5, 0.5);
    model.position.set(width / 2, height / 2 + height * 0.04);
  };

  const queueModelFit = () => {
    window.cancelAnimationFrame(resizeFrame);
    resizeFrame = window.requestAnimationFrame(() => {
      resizeFrame = window.requestAnimationFrame(fitModel);
    });
  };

  const focusCenter = (instant = false) => {
    if (!model || !app) return;
    model.focus(app.renderer.screen.width / 2, app.renderer.screen.height / 2, instant);
    media.classList.remove("is-dragging");
  };

  const scheduleNeutral = () => {
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => focusCenter(false), 800);
  };

  const focusAtPointer = (event) => {
    if (!model || !app) return;
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (app.renderer.screen.width / rect.width);
    const y = (event.clientY - rect.top) * (app.renderer.screen.height / rect.height);
    model.focus(x, y, reducedMotion.matches);
    window.clearTimeout(idleTimer);
    scheduleNeutral();
  };

  const bindCanvasInteraction = () => {
    canvas.addEventListener("pointerdown", (event) => {
      pointerId = event.pointerId;
      canvas.setPointerCapture(pointerId);
      media.classList.add("is-dragging");
      focusAtPointer(event);
    });
    canvas.addEventListener("pointermove", (event) => {
      if (event.pointerType === "touch" && event.pointerId !== pointerId) return;
      focusAtPointer(event);
    });
    const release = (event) => {
      if (pointerId !== null && canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
      pointerId = null;
      focusCenter(false);
      media.classList.remove("is-dragging");
      if (event?.type === "pointercancel") status.textContent = "조작을 멈추고 모델이 정면으로 돌아갑니다.";
    };
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", release);
    canvas.addEventListener("pointerleave", () => {
      if (pointerId === null) focusCenter(false);
    });
  };

  const loadModel = async (force = false) => {
    if (model && !force) return model;
    if (modelPromise && !force) return modelPromise;

    loading.hidden = false;
    fallback.hidden = true;
    canvas.hidden = false;
    status.textContent = "Live2D 테스트 모델을 불러오는 중입니다.";

    modelPromise = (async () => {
      for (const src of dependencies) await loadScript(src);

      if (!window.PIXI?.live2d?.Live2DModel) throw new Error("Live2D runtime unavailable");
      if (!app) {
        app = new window.PIXI.Application({
          view: canvas,
          resizeTo: media,
          backgroundAlpha: 0,
          antialias: true,
          autoDensity: true,
          resolution: Math.min(window.devicePixelRatio || 1, 2)
        });
        bindCanvasInteraction();
        window.addEventListener("resize", queueModelFit, { passive: true });
        if ("ResizeObserver" in window) new ResizeObserver(queueModelFit).observe(media);
      }

      if (model) {
        app.stage.removeChild(model);
        model.destroy({ children: true, texture: false, baseTexture: false });
      }

      const item = items.find((entry) => entry.type === "live2d");
      model = await window.PIXI.live2d.Live2DModel.from(item.modelUrl, { autoInteract: false });
      app.stage.addChild(model);
      app.renderer.resize(media.clientWidth, media.clientHeight);
      queueModelFit();
      focusCenter(true);
      loading.hidden = true;
      fallback.hidden = true;
      status.textContent = "Live2D 모델을 불러왔습니다. 마우스나 손가락으로 움직임을 확인할 수 있습니다.";
      return model;
    })().catch((error) => {
      console.error("Live2D model load failed", error);
      loading.hidden = true;
      canvas.hidden = true;
      fallback.hidden = false;
      status.textContent = "Live2D 모델을 불러오지 못했습니다. 모델 다시 불러오기 버튼을 이용해 주세요.";
      modelPromise = null;
      throw error;
    });

    return modelPromise;
  };

  const showItem = (index, announce = true) => {
    activeIndex = Math.max(0, Math.min(index, items.length - 1));
    const item = items[activeIndex];
    media.classList.toggle("is-live2d", item.type === "live2d");
    updateActiveButton();
    title.textContent = item.title;
    kind.textContent = item.kind;
    counter.textContent = `${String(activeIndex + 1).padStart(2, "0")} / ${String(items.length).padStart(2, "0")}`;
    image.hidden = true;
    video.hidden = true;
    canvas.hidden = true;
    loading.hidden = true;
    fallback.hidden = true;
    hint.hidden = true;
    controls.hidden = true;
    notes.hidden = true;
    credit.hidden = true;

    if (item.type === "live2d") {
      canvas.hidden = false;
      hint.hidden = false;
      controls.hidden = false;
      notes.hidden = false;
      credit.hidden = false;
      if (model) {
        queueModelFit();
        focusCenter(false);
      } else {
        loadModel().catch(() => {});
      }
    }

    if (item.type === "image") {
      image.src = item.image;
      image.alt = item.imageAlt;
      image.hidden = false;
    }

    if (item.type === "youtube") {
      videoPoster.src = item.thumbnail;
      videoPoster.alt = `${item.title} 영상 썸네일`;
      video.dataset.video = item.videoId;
      video.dataset.title = item.title;
      video.hidden = false;
    } else {
      delete video.dataset.video;
      delete video.dataset.title;
    }

    if (announce) status.textContent = `${item.title} 작품을 선택했습니다.`;
  };

  renderRail();
  rail.addEventListener("click", (event) => {
    const button = event.target.closest("[data-portfolio-index]");
    if (!button) return;
    showItem(Number(button.dataset.portfolioIndex));
  });
  rail.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const backward = event.key === "ArrowLeft" || event.key === "ArrowUp";
    let next = backward ? activeIndex - 1 : activeIndex + 1;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = items.length - 1;
    if (next < 0) next = items.length - 1;
    if (next >= items.length) next = 0;
    showItem(next);
    rail.querySelector(`[data-portfolio-index="${next}"]`)?.focus({ preventScroll: true });
  });

  controls.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-expression]");
    if (!button || !model) return;
    const expression = button.dataset.expression;
    const manager = model.internalModel?.motionManager?.expressionManager;
    let changed = true;
    if (expression === "neutral") manager?.resetExpression();
    else changed = await model.expression(expression);
    controls.querySelectorAll("[data-expression]").forEach((item) => {
      item.setAttribute("aria-pressed", String(item === button));
    });
    status.textContent = changed === false ? `${button.textContent} 표정을 유지하고 있습니다.` : `${button.textContent} 표정으로 바꿨습니다.`;
  });

  retry.addEventListener("click", () => loadModel(true).catch(() => {}));
  showItem(0, false);
})();
