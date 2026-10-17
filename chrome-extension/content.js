(() => {
  const mediaSelector = "img, video, audio, canvas, svg, picture, iframe, object, embed";
  const originals = new WeakMap();
  const ownedMutations = new WeakSet();
  let active = false;
  let settings = null;
  let observer = null;
  let debounce = null;

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

  function parseRgb(value) {
    const match = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    return match ? match.slice(1).map(Number) : null;
  }

  function isNearWhite(color) {
    const rgb = parseRgb(color);
    return rgb !== null && rgb.every(channel => channel >= settings.nearWhiteMinimum);
  }

  function isNearBlack(color) {
    const rgb = parseRgb(color);
    return rgb !== null && rgb.every(channel => channel <= settings.nearBlackMaximum);
  }

  function samplePageBrightness() {
    const columns = 24;
    const rows = 16;
    let eligible = 0;
    let white = 0;
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const x = Math.min(innerWidth - 1, Math.floor((column + 0.5) * innerWidth / columns));
        const y = Math.min(innerHeight - 1, Math.floor((row + 0.5) * innerHeight / rows));
        const hit = document.elementFromPoint(x, y);
        if (!hit || isMedia(hit)) continue;

        let element = hit;
        let color = "rgba(0, 0, 0, 0)";
        while (element) {
          const computed = getComputedStyle(element);
          const saved = originalStyle(element);
          const background = saved?.computed.backgroundColor ?? computed.backgroundColor;
          if (computed.backgroundImage !== "none") break;
          if (!background.startsWith("rgba(0, 0, 0, 0)")) {
            color = background;
            break;
          }
          element = element.parentElement;
        }

        const rgb = parseRgb(color);
        if (!rgb) continue;
        eligible++;
        if (rgb.every(channel => channel >= settings.nearWhiteMinimum)) white++;
      }
    }
    return eligible ? white * 100 / eligible : 0;
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

  function transformElement(element) {
    if (!(element instanceof HTMLElement) || isMedia(element)) return;
    const computed = getComputedStyle(element);
    if (computed.backgroundImage !== "none") return;

    saveOriginal(element, computed);
    const background = originalComputed(element, "backgroundColor", computed);
    const textColor = originalComputed(element, "color", computed);
    if (isNearWhite(background)) {
      const rgb = parseRgb(background);
      const level = Math.max(24, Math.min(52, Math.round(52 - (Math.max(...rgb) - settings.nearWhiteMinimum) * 0.5)));
      writeColor(element, "background-color", `rgb(${level} ${level} ${level})`);
    }

    if ((element.textContent?.trim().length ?? 0) > 0 && isNearBlack(textColor)) {
      const rgb = parseRgb(textColor);
      const level = Math.max(208, Math.min(232, Math.round(232 - Math.max(...rgb) * 0.55)));
      writeColor(element, "color", `rgb(${level} ${level} ${level})`);
    }
  }

  function restore() {
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
      originals.delete?.(element);
    }
    active = false;
    observer = null;
    publishStatus(false);
  }

  function apply() {
    clearTimeout(debounce);
    if (!settings || !settings.enabled || !settings.automaticDetection || document.visibilityState === "hidden") {
      if (active) restore();
      return;
    }

    const whitePercent = samplePageBrightness();
    if (whitePercent <= settings.whiteBackgroundThreshold) {
      if (active && settings.restoreOriginalAppearance) restore();
      else publishStatus(active);
      return;
    }

    active = true;
    for (const element of document.querySelectorAll("*")) transformElement(element);
    publishStatus(true);
    if (!observer) {
      observer = new MutationObserver(records => {
        const external = records.some(record => !ownedMutations.has(record.target));
        for (const record of records) ownedMutations.delete(record.target);
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

  function publishStatus(dark) {
    chrome.runtime.sendMessage({ type: "page-status", title: document.title, dark }).catch(() => {});
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "configure") {
      settings = normalizeOptions(message.settings);
      apply();
    } else if (message.type === "restore") {
      restore();
    } else if (message.type === "get-page-status") {
      sendResponse({ dark: active });
      return true;
    }
  });

  chrome.runtime.sendMessage({ type: "get-status" }, response => {
    if (chrome.runtime.lastError || !response?.settings) return;
    settings = normalizeOptions(response.settings);
    apply();
  });

  window.addEventListener("resize", () => {
    if (active) debounce = setTimeout(apply, 250);
  }, { passive: true });
})();