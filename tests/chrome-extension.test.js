const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const contentScript = fs.readFileSync(
  path.join(__dirname, "../chrome-extension/content.js"),
  "utf8"
);

const defaultSettings = {
  enabled: true,
  automaticDetection: true,
  restoreOriginalAppearance: true,
  whiteBackgroundThreshold: 60,
  nearWhiteMinimum: 235,
  nearBlackMaximum: 40
};

class FakeStyle {
  constructor() {
    this.values = new Map();
    this.priorities = new Map();
  }

  getPropertyValue(property) {
    return this.values.get(property) || "";
  }

  getPropertyPriority(property) {
    return this.priorities.get(property) || "";
  }

  setProperty(property, value, priority = "") {
    this.values.set(property, value);
    this.priorities.set(property, priority);
  }

  removeProperty(property) {
    this.values.delete(property);
    this.priorities.delete(property);
  }
}

class FakeHTMLElement {
  constructor(tagName, computed = {}) {
    this.tagName = tagName.toUpperCase();
    this.computed = {
      backgroundColor: "rgba(0, 0, 0, 0)",
      backgroundImage: "none",
      color: "rgb(20, 20, 20)",
      ...computed
    };
    this.style = new FakeStyle();
    this.parentElement = null;
    this.children = [];
    this.textContent = "";
  }

  append(child) {
    child.parentElement = this;
    this.children.push(child);
  }

  matches(selector) {
    return selector.split(", ").includes(this.tagName.toLowerCase());
  }

  closest(selector) {
    for (let current = this; current; current = current.parentElement) {
      if (current.matches(selector)) return current;
    }
    return null;
  }
}

function runContentScript({ settings = defaultSettings, hitTest, htmlBackground, bodyBackground, extraElements = [] } = {}) {
  const html = new FakeHTMLElement("html", htmlBackground ? { backgroundColor: htmlBackground } : {});
  const body = new FakeHTMLElement("body", bodyBackground ? { backgroundColor: bodyBackground } : {});
  const content = new FakeHTMLElement("div");
  html.append(body);
  body.append(content);
  for (const element of extraElements) body.append(element);
  const elements = [html, body, content, ...extraElements];
  const reported = [];
  let listener;

  const document = {
    title: "Test page",
    visibilityState: "visible",
    documentElement: html,
    body,
    querySelectorAll: () => elements,
    elementFromPoint: hitTest || (() => content)
  };
  const chrome = {
    runtime: {
      onMessage: { addListener: callback => { listener = callback; } },
      sendMessage(message, callback) {
        if (message.type === "get-status") {
          callback?.({ settings });
        } else if (message.type === "page-status") {
          reported.push(message);
        }
        return Promise.resolve();
      }
    }
  };
  const context = {
    chrome,
    document,
    HTMLElement: FakeHTMLElement,
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    getComputedStyle(element) {
      return {
        ...element.computed,
        backgroundColor: element.style.getPropertyValue("background-color") || element.computed.backgroundColor,
        color: element.style.getPropertyValue("color") || element.computed.color
      };
    },
    innerWidth: 240,
    innerHeight: 160,
    window: { addEventListener() {} },
    setTimeout: () => 1,
    clearTimeout() {},
    console: { info() {}, warn() {} }
  };

  vm.runInNewContext(contentScript, context);
  return { html, body, content, document, elements, listener, reported };
}

test("transparent HTML and BODY backgrounds resolve to the white canvas and darken BODY", () => {
  const result = runContentScript();
  const diagnostics = result.reported.at(-1).diagnostics;

  assert.equal(diagnostics.brightBackgroundPercent, 100);
  assert.equal(diagnostics.analyzedSamples, 384);
  assert.equal(diagnostics.applied, true);
  assert.equal(diagnostics.reason, "applied");
  assert.match(result.body.style.getPropertyValue("background-color"), /^rgb\(4[0-9] 4[0-9] 4[0-9]\)$/);
});

test("an explicit white HTML background is analyzed and transformed on HTML", () => {
  const result = runContentScript({ htmlBackground: "rgb(255, 255, 255)" });

  assert.equal(result.reported.at(-1).diagnostics.brightBackgroundPercent, 100);
  assert.equal(result.reported.at(-1).diagnostics.applied, true);
  assert.match(result.html.style.getPropertyValue("background-color"), /^rgb\(4[0-9] 4[0-9] 4[0-9]\)$/);
  assert.equal(result.body.style.getPropertyValue("background-color"), "");
});

test("Pascal-case settings from the Windows host are applied without fallback values", () => {
  const settings = {
    Enabled: true,
    AutomaticDetection: true,
    RestoreOriginalAppearance: true,
    WhiteBackgroundThreshold: 75,
    NearWhiteMinimum: 245,
    NearBlackMaximum: 30
  };
  const result = runContentScript({ settings });
  const diagnostics = result.reported.at(-1).diagnostics;

  assert.equal(diagnostics.threshold, 75);
  assert.equal(diagnostics.brightBackgroundPercent, 100);
  assert.equal(diagnostics.applied, true);
});

test("an existing dark BODY background is not modified", () => {
  const result = runContentScript({ bodyBackground: "rgb(36, 38, 42)" });
  const diagnostics = result.reported.at(-1).diagnostics;
  assert.equal(diagnostics.brightBackgroundPercent, 0);
  assert.equal(diagnostics.applied, false);
  assert.equal(diagnostics.reason, "below-threshold");
  assert.equal(result.body.style.getPropertyValue("background-color"), "");
});

test("transparent children inherit the parent's actual dark background for analysis", () => {
  const result = runContentScript({ bodyBackground: "rgb(30, 30, 30)" });

  assert.equal(result.reported.at(-1).diagnostics.brightBackgroundPercent, 0);
  assert.equal(result.reported.at(-1).diagnostics.applied, false);
});

test("the configured brightness threshold remains a strict greater-than comparison", () => {
  const settings = { ...defaultSettings, whiteBackgroundThreshold: 50 };
  const white = new FakeHTMLElement("div", { backgroundColor: "rgb(255, 255, 255)" });
  const dark = new FakeHTMLElement("div", { backgroundColor: "rgb(30, 30, 30)" });
  const result = runContentScript({ settings, hitTest: x => x < 120 ? white : dark });
  result.white = white;
  result.dark = dark;
  result.body.append(result.white);
  result.body.append(result.dark);
  result.elements.push(result.white, result.dark);
  result.reported.length = 0;
  result.listener({ type: "configure", settings }, {}, () => {});

  assert.equal(result.reported.at(-1).diagnostics.brightBackgroundPercent, 50);
  assert.equal(result.reported.at(-1).diagnostics.applied, false);
  assert.equal(result.reported.at(-1).diagnostics.reason, "below-threshold");
  assert.equal(result.white.style.getPropertyValue("background-color"), "");
});

test("media-only viewports are excluded and report that brightness could not be measured", () => {
  const result = runContentScript();
  const image = new FakeHTMLElement("img");
  result.body.append(image);
  result.elements.push(image);
  result.document.elementFromPoint = () => image;
  result.reported.length = 0;
  result.listener({ type: "configure", settings: defaultSettings }, {}, () => {});

  const diagnostics = result.reported.at(-1).diagnostics;
  assert.equal(diagnostics.brightBackgroundPercent, null);
  assert.equal(diagnostics.analyzedSamples, 0);
  assert.equal(diagnostics.applied, false);
  assert.equal(diagnostics.reason, "no-analyzable-background");
});

test("media elements keep their original styles when the surrounding page is transformed", () => {
  const image = new FakeHTMLElement("img", { backgroundColor: "rgb(255, 255, 255)" });
  const result = runContentScript({ extraElements: [image] });

  assert.equal(result.reported.at(-1).diagnostics.applied, true);
  assert.equal(image.style.getPropertyValue("background-color"), "");
  assert.equal(image.style.getPropertyValue("color"), "");
});

test("restoring the page removes extension styles and reports the restored state", () => {
  const result = runContentScript();
  assert.notEqual(result.body.style.getPropertyValue("background-color"), "");
  let restored;
  result.listener({ type: "restore" }, {}, response => { restored = response; });

  assert.equal(result.body.style.getPropertyValue("background-color"), "");
  assert.equal(restored.applied, false);
  assert.equal(restored.reason, "restored");
});
