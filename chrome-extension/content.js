(() => {
  const mediaSelector = "img, video, audio, canvas, svg, picture, iframe, object, embed";
  const originals = new WeakMap();
  const ownedMutations = new WeakSet();
  let active = false;
  let settings = null;
  let observer = null;
  let debounce = null;
  let lastDiagnostics = null;

  function isMedia(element) {
    return element.matches(mediaSelector) || Boolean(element.closest(mediaSelector));
  }

  function originalStyle(element) {
    return originals.get(element);
  }

  function originalComputed(element, property, computed) {
    const saved = originalStyle(element);
    return saved?.computed[property] ?? computed[property];
  }

  function parseColor(value) {
    const match = value.match(/^rgba?\((.+)\)$/i);
    if (!match) return null;

    const parts = match[1].split("/");
    const channels = parts[0].includes(",") ? parts[0].split(",") : parts[0].trim().split(/\s+/);
    let alphaText = parts[1]?.trim();
    if (!alphaText && channels.length === 4) alphaText = channels.pop().trim();
    if (channels.length !== 3) return null;

    const parseChannel = channel => {
      const text = channel.trim();
      const number = Number.parseFloat(text);
      if (!Number.isFinite(number)) return null;
      return Math.max(0, Math.min(255, text.endsWith("%") ? number * 2.55 : number));
    };
    const rgb = channels.map(parseChannel);
    if (rgb.some(channel => channel === null)) return null;

    let alpha = 1;
    if (alphaText) {
      const parsed = Number.parseFloat(alphaText);
      if (!Number.isFinite(parsed)) return null;
      alpha = Math.max(0, Math.min(1, alphaText.endsWith("%") ? parsed / 100 : parsed));
    }
    return { rgb, alpha };
  }

  function isNearWhite(rgb) {
    return rgb.every(channel => channel >= settings.nearWhiteMinimum);
  }

  function isNearBlack(rgb) {
    return rgb.every(channel => channel <= settings.nearBlackMaximum);
  }

  function resolveBackground(element) {
    let rgb = [0, 0, 0];
    let alpha = 0;
    for (let current = element; current; current = current.parentElement) {
      const computed = getComputedStyle(current);
      if (computed.backgroundImage !== "none") return null;

      const color = parseColor(computed.backgroundColor);
      if (!color) return null;
      if (color.alpha > 0) {
        rgb = color.rgb.map((channel, index) => channel * color.alpha + rgb[index] * (1 - color.alpha));
        alpha = color.alpha + alpha * (1 - color.alpha);
        if (alpha >= 1) break;
      }
    }
    return rgb.map(channel => channel * alpha + 255 * (1 - alpha));
  }

  function samplePageBrightness() {
    const columns = 24;
    const rows = 16;
    const total = columns * rows;
    let eligible = 0;
    let white = 0;
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const x = Math.min(innerWidth - 1, Math.floor((column + 0.5) * innerWidth / columns));
        const y = Math.min(innerHeight - 1, Math.floor((row + 0.5) * innerHeight / rows));
        const hit = document.elementFromPoint(x, y);
        if (!hit || isMedia(hit)) continue;

        const rgb = resolveBackground(hit);
        if (!rgb) continue;
        eligible++;
        if (isNearWhite(rgb)) white++;
      }
    }
    return { percent: eligible ? white * 100 / eligible : null, eligible, total };
  }

  function saveOriginal(element, computed) {
    let saved = originalStyle(element);
    if (!saved) {
      saved = {
        inline: {
          backgroundColor: [element.style.getPropertyValue("background-color"), element.style.getPropertyPriority("background-color")],
          color: [element.style.getPropertyValue("color"), element.style.getPropertyPriority("color")]
        },
        computed: {
          backgroundColor: computed.backgroundColor,
          color: computed.color
        }
      };
      originals.set(element, saved);
    }
    return saved;
  }

  function writeColor(element, property, value) {
    ownedMutations.add(element);
    element.style.setProperty(property, value, "important");
  }

  function darkBackground(rgb) {
    const level = Math.max(24, Math.min(52, Math.round(52 - (Math.max(...rgb) - settings.nearWhiteMinimum) * 0.5)));
    return `rgb(${level} ${level} ${level})`;
  }

  function transformElement(element) {
    if (!(element instanceof HTMLElement) || isMedia(element)) return 0;
    const computed = getComputedStyle(element);
    if (computed.backgroundImage !== "none") return 0;

    saveOriginal(element, computed);
    const background = parseColor(originalComputed(element, "backgroundColor", computed));
    const textColor = parseColor(originalComputed(element, "color", computed));
    let transformed = 0;
    if (background?.alpha === 1 && isNearWhite(background.rgb)) {
      writeColor(element, "background-color", darkBackground(background.rgb));
      transformed++;
    }

    if ((element.textContent?.trim().length ?? 0) > 0 && textColor?.alpha === 1 && isNearBlack(textColor.rgb)) {
      const level = Math.max(208, Math.min(232, Math.round(232 - Math.max(...textColor.rgb) * 0.55)));
      writeColor(element, "color", `rgb(${level} ${level} ${level})`);
      transformed++;
    }
    return transformed;
  }

  function makeDiagnostics(brightness, applied, reason) {
    const messages = {
      "settings-unavailable": "Windows 앱 설정을 아직 받지 못했습니다.",
      disabled: "OmniDark가 비활성화되어 있습니다.",
      "automatic-detection-disabled": "자동 감지가 꺼져 있습니다.",
      "page-hidden": "페이지가 표시되지 않아 분석을 보류했습니다.",
      "no-analyzable-background": "미디어·배경 이미지 등을 제외한 분석 가능한 배경 표본이 없습니다.",
      "below-threshold": "감지된 밝은 배경 비율이 설정 임계값 이하입니다.",
      "no-transformable-colors": "임계값은 넘었지만 변환 가능한 배경색이나 텍스트 색을 찾지 못했습니다.",
      applied: "밝은 배경을 감지해 다크 색상을 적용했습니다.",
      restored: "원래 페이지 색상으로 복원했습니다."
    };
    return {
      injected: true,
      settingsReceived: Boolean(settings),
      brightBackgroundPercent: brightness?.percent ?? null,
      analyzedSamples: brightness?.eligible ?? 0,
      totalSamples: brightness?.total ?? 24 * 16,
      threshold: settings?.whiteBackgroundThreshold ?? null,
      applied,
      reason,
      reasonMessage: messages[reason]
    };
  }

  function publishStatus(dark, reason, brightness = null) {
    active = dark;
    lastDiagnostics = makeDiagnostics(brightness, dark, reason);
    console.info("[OmniDark] 페이지 진단", lastDiagnostics);
    chrome.runtime.sendMessage({
      type: "page-status",
      title: document.title,
      dark,
      diagnostics: lastDiagnostics
    }).catch(error => console.warn("[OmniDark] 페이지 상태 보고 실패:", error));
  }

  function restore(reason = "restored", brightness = null) {
    observer?.disconnect();
    for (const element of document.querySelectorAll("*")) {
      const saved = originalStyle(element);
      if (!saved) continue;
      for (const property of ["backgroundColor", "color"]) {
        const cssName = property === "backgroundColor" ? "background-color" : "color";
        const [value, priority] = saved.inline[property];
        if (value) element.style.setProperty(cssName, value, priority);
        else element.style.removeProperty(cssName);
      }
      originals.delete(element);
    }
    active = false;
    observer = null;
    publishStatus(false, reason, brightness);
  }

  function apply() {
    clearTimeout(debounce);
    if (!settings) {
      publishStatus(false, "settings-unavailable");
      return;
    }
    if (!settings.enabled) {
      if (active) restore("disabled");
      else publishStatus(false, "disabled");
      return;
    }
    if (!settings.automaticDetection) {
      if (active && settings.restoreOriginalAppearance) restore("automatic-detection-disabled");
      else publishStatus(active, "automatic-detection-disabled");
      return;
    }
    if (document.visibilityState === "hidden") {
      publishStatus(active, "page-hidden");
      return;
    }

    const brightness = samplePageBrightness();
    if (brightness.percent === null) {
      if (active && settings.restoreOriginalAppearance) restore("no-analyzable-background", brightness);
      else publishStatus(active, "no-analyzable-background", brightness);
      return;
    }
    if (brightness.percent <= settings.whiteBackgroundThreshold) {
      if (active && settings.restoreOriginalAppearance) restore("below-threshold", brightness);
      else publishStatus(active, "below-threshold", brightness);
      return;
    }

    let transformed = 0;
    for (const element of document.querySelectorAll("*")) transformed += transformElement(element);

    const root = document.documentElement;
    const body = document.body;
    if (root && body) {
      const rootStyle = getComputedStyle(root);
      const bodyStyle = getComputedStyle(body);
      const rootBackground = parseColor(originalComputed(root, "backgroundColor", rootStyle));
      const bodyBackground = parseColor(originalComputed(body, "backgroundColor", bodyStyle));
      if (rootStyle.backgroundImage === "none" && bodyStyle.backgroundImage === "none" &&
          rootBackground?.alpha === 0 && bodyBackground?.alpha === 0) {
        saveOriginal(body, bodyStyle);
        writeColor(body, "background-color", darkBackground([255, 255, 255]));
        transformed++;
      }
    }

    if (transformed === 0) {
      if (active && settings.restoreOriginalAppearance) restore("no-transformable-colors", brightness);
      else publishStatus(active, "no-transformable-colors", brightness);
      return;
    }

    active = true;
    publishStatus(true, "applied", brightness);
    if (!observer) {
      observer = new MutationObserver(records => {
        const targets = new Set();
        let external = false;
        for (const record of records) {
          targets.add(record.target);
          if (!ownedMutations.has(record.target)) external = true;
        }
        for (const target of targets) ownedMutations.delete(target);
        if (external) debounce = setTimeout(apply, 300);
      });
      observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["class", "style"] });
    }
  }

  function normalizeOptions(value) {
    const get = (camel, pascal, fallback) => value?.[camel] ?? value?.[pascal] ?? fallback;
    return {
      enabled: get("enabled", "Enabled", true),
      automaticDetection: get("automaticDetection", "AutomaticDetection", true),
      restoreOriginalAppearance: get("restoreOriginalAppearance", "RestoreOriginalAppearance", true),
      whiteBackgroundThreshold: get("whiteBackgroundThreshold", "WhiteBackgroundThreshold", 60),
      nearWhiteMinimum: get("nearWhiteMinimum", "NearWhiteMinimum", 235),
      nearBlackMaximum: get("nearBlackMaximum", "NearBlackMaximum", 40)
    };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "configure") {
      settings = normalizeOptions(message.settings);
      console.info("[OmniDark] Windows 앱 설정 수신", settings);
      apply();
    } else if (message.type === "restore") {
      restore();
      sendResponse(lastDiagnostics);
      return true;
    } else if (message.type === "get-page-status") {
      sendResponse(lastDiagnostics ?? makeDiagnostics(null, active, settings ? "below-threshold" : "settings-unavailable"));
      return true;
    }
  });

  chrome.runtime.sendMessage({ type: "get-status" }, response => {
    if (chrome.runtime.lastError) {
      console.warn("[OmniDark] 초기 설정 요청 실패:", chrome.runtime.lastError.message);
      publishStatus(false, "settings-unavailable");
      return;
    }
    if (!response?.settings) {
      publishStatus(false, "settings-unavailable");
      return;
    }
    settings = normalizeOptions(response.settings);
    console.info("[OmniDark] Windows 앱 설정 수신", settings);
    apply();
  });

  window.addEventListener("resize", () => {
    if (active) debounce = setTimeout(apply, 250);
  }, { passive: true });
})();
