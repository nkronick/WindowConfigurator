let i18nStrings = {};
const touchedFields = {};
let isPrintLayoutMode = false;
const VIEWPORT_PREVIEW_KEY = "viewportPreviewMode";
const VIEWPORT_PREVIEW_VALUES = new Set(["auto", "mobile", "desktop"]);

function ApplyViewportPreviewMode(mode) {
    const root = document.documentElement;
    const safeMode = VIEWPORT_PREVIEW_VALUES.has(mode) ? mode : "auto";
    root.classList.toggle("preview-mobile", safeMode === "mobile");
    root.classList.toggle("preview-desktop", safeMode === "desktop");
}

function GetViewportPreviewMode() {
    const paramsMode = new URLSearchParams(window.location.search).get("preview");
    if (VIEWPORT_PREVIEW_VALUES.has(paramsMode)) return paramsMode;

    const savedMode = localStorage.getItem(VIEWPORT_PREVIEW_KEY);
    return VIEWPORT_PREVIEW_VALUES.has(savedMode) ? savedMode : "auto";
}

window.setViewportPreviewMode = mode => {
    const safeMode = VIEWPORT_PREVIEW_VALUES.has(mode) ? mode : "auto";
    localStorage.setItem(VIEWPORT_PREVIEW_KEY, safeMode);
    ApplyViewportPreviewMode(safeMode);
};

window.getViewportPreviewMode = () => GetViewportPreviewMode();

function IsMobileLayout() {
    const root = document.documentElement;
    if (root.classList.contains("preview-mobile")) return true;
    if (root.classList.contains("preview-desktop")) return false;
    return window.matchMedia("(max-width: 600px)").matches;
}

document.addEventListener("DOMContentLoaded", () => {
    ApplyViewportPreviewMode(GetViewportPreviewMode());
    
    // Language handling
    const langSelect = document.getElementById("languageSelect");
    if (langSelect) {
        langSelect.addEventListener("change", e => {
            loadLanguage(e.target.value);
        });
    }
    window.addEventListener("beforeprint", () => {
        isPrintLayoutMode = true;
        DrawWindow();
    });
    window.addEventListener("afterprint", () => {
        isPrintLayoutMode = false;
        DrawWindow();
    });

    const templateSelect = document.getElementById("win_template");
    if (templateSelect) {
        templateSelect.addEventListener("change", () => {
            windowModel.template = templateSelect.value;
            ToggleTemplateControls();
            UpdateWindow();
        });
    }

    const unitSelect = document.getElementById("unit");
    if (unitSelect) {
        unitSelect.addEventListener("change", () => {
            const prevUnit = windowModel.unit || unitSelect.value;
            const nextUnit = unitSelect.value;
            if (prevUnit !== nextUnit) {
                ConvertInputValue(document.getElementById("widthMeasure"), prevUnit, nextUnit);
                ConvertInputValue(document.getElementById("heightMeasure"), prevUnit, nextUnit);
                ConvertInputValue(document.getElementById("sectionLeftWidthMeasure"), prevUnit, nextUnit);
                ConvertInputValue(document.getElementById("sectionLeftHeightMeasure"), prevUnit, nextUnit);
                ConvertInputValue(document.getElementById("sectionCenterWidthMeasure"), prevUnit, nextUnit);
                ConvertInputValue(document.getElementById("sectionCenterHeightMeasure"), prevUnit, nextUnit);
                ConvertInputValue(document.getElementById("sectionRightWidthMeasure"), prevUnit, nextUnit);
                ConvertInputValue(document.getElementById("sectionRightHeightMeasure"), prevUnit, nextUnit);
                windowModel.unit = nextUnit;
            }
            UpdateUnitLabels();
            RenderMeasurements();
        });
        windowModel.unit = unitSelect.value;
    }

    BindMeasureInputs();
    BindSectionMeasurementInputs();
    BindSectionSelector();
    BindSectionToggleButtons();

    init();
    ToggleTemplateControls();
    UpdateWindow();
    RenderMeasurements();

});

const rtlLanguages = new Set(["he"]);

async function loadLanguage(lang) {
    try {
        const response = await fetch(`i18n/${lang}.json`);
        if (!response.ok) throw new Error("Language file not found");

        i18nStrings = await response.json();

        document.documentElement.lang = lang;
        document.documentElement.dir = rtlLanguages.has(lang) ? "rtl" : "ltr";

        document.querySelectorAll("[data-i18n]").forEach(el => {
            el.textContent = i18nStrings[el.dataset.i18n] || el.dataset.i18n;
        });
        UpdateUnitLabels();
        RefreshValidationErrors();
        RenderSpecification();
        localStorage.setItem("language", lang);
    } catch(err) {
        console.error("Failed to load language:", err);
    }
}

function translate(key, vars = {}) {
    let text = i18nStrings[key] || key;
    for (const [name, value] of Object.entries(vars)) {
        text = text.replace(`{${name}}`, value);
    }
    return text;
}

function UnitToMm(unit) {
    if (unit === "m") return 1000;
    if (unit === "cm") return 10;
    return 1;
}

function GetSelectedUnitLabel() {
    const unitSelect = document.getElementById("unit");
    if (!unitSelect) return "mm";
    const option = unitSelect.options[unitSelect.selectedIndex];
    return option ? option.value : "mm";
}

function FormatValue(value, unit) {
    if (!Number.isFinite(value)) return "";
    if (unit === "mm") return String(Math.round(value));
    const rounded = Math.round(value * 100) / 100;
    return String(rounded);
}

function FormatMeasurement(valueMm) {
    const unit = GetSelectedUnitLabel();
    const scale = UnitToMm(unit);
    return FormatValue(valueMm / scale, unit);
}

function ConvertValueBetweenUnits(value, fromUnit, toUnit) {
    const fromScale = UnitToMm(fromUnit);
    const toScale = UnitToMm(toUnit);
    return value * fromScale / toScale;
}

function ConvertInputValue(input, fromUnit, toUnit) {
    if (!input) return;
    const raw = input.value;
    if (raw === "") return;
    const value = ParseNumericValue(raw);
    if (!Number.isFinite(value)) return;
    const converted = ConvertValueBetweenUnits(value, fromUnit, toUnit);
    input.value = FormatValue(converted, toUnit);
}

function UpdateUnitLabels() {
    const unit = GetSelectedUnitLabel();
    const widthLabel = `${translate("width")} (${unit})`;
    const heightLabel = `${translate("height")} (${unit})`;
    const widthLabelMobile = `${translate("width")}<br>(${unit})`;
    const heightLabelMobile = `${translate("height")}<br>(${unit})`;
    const isMobile = IsMobileLayout();
    document.querySelectorAll("[data-i18n=\"width\"]").forEach(el => {
        if (isMobile && !el.classList.contains("measure-list-label")) {
            el.innerHTML = widthLabelMobile;
        } else {
            el.textContent = widthLabel;
        }
    });
    document.querySelectorAll("[data-i18n=\"height\"]").forEach(el => {
        if (isMobile && !el.classList.contains("measure-list-label")) {
            el.innerHTML = heightLabelMobile;
        } else {
            el.textContent = heightLabel;
        }
    });
    document.querySelectorAll("[data-i18n=\"add\"]").forEach(el => {
        el.textContent = "+";
        el.setAttribute("title", translate("add"));
        el.setAttribute("aria-label", translate("add"));
    });
    UpdateSectionToggleButtons();
    UpdateSectionSelector();
    RenderSpecification();
    RefreshValidationErrors();
}

function ParseNumericValue(raw) {
    if (typeof raw !== "string") {
        return Number(raw);
    }
    const cleaned = raw
        .trim()
        .replace(/[\s\u00A0\u202F]/g, "")
        .replace(",", ".");
    if (cleaned === "") return Number.NaN;
    return Number(cleaned);
}

function init() {
    const langSelect = document.getElementById("languageSelect");
    if (langSelect) {
        const savedLang = localStorage.getItem("language") || "en";
        langSelect.value = savedLang;
        loadLanguage(savedLang);
    }
}

/*if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(err => console.error("SW registration failed:", err));
}*/

const cadTheme = {
    background:     "#0e1420",
    frameMain:      "#d9e3f0",
    frameSecondary: "#93a8c3",
    mullion:        "#c9d6e8",
    glassStroke:    "#8eb6d9",
    glassFill:      "url(#cadGlassHatch)",
    selected:       "#ffb347",
    dimension:      "#67e8f9",
    opening:        "#f6d365"
};
//const validationRules = {
//    window: {minWidth: 700, maxWidth: 7600, minHeight: 700, maxHeight: 3200}
//};

const validationIssues  = {};

// Window
let windowModel = {
    width:   0,
    height:  0,
    template: "flat",
    measurements: {
        widths: [],
        heights: []
    },
    measurementDrafts: {
        width: Number.NaN,
        height: Number.NaN
    },
    sectionMeasurements: [
        {widths: [], heights: []},
        {widths: [], heights: []},
        {widths: [], heights: []}
    ],
    sectionDrafts: [
        {width: Number.NaN, height: Number.NaN},
        {width: Number.NaN, height: Number.NaN},
        {width: Number.NaN, height: Number.NaN}
    ],
    sectionEnabled: [true, true, true],
    sectionOrder: [],
    sectionCompleteIndices: [],
    sections: [],
    lastHeight: 0,
};

function EnsureSectionMeasurements() {
    if (!Array.isArray(windowModel.sectionMeasurements)) {
        windowModel.sectionMeasurements = [];
    }
    while (windowModel.sectionMeasurements.length < 3) {
        windowModel.sectionMeasurements.push({widths: [], heights: []});
    }
    windowModel.sectionMeasurements = windowModel.sectionMeasurements.slice(0, 3).map(section => ({
        widths: Array.isArray(section.widths) ? section.widths : [],
        heights: Array.isArray(section.heights) ? section.heights : []
    }));
    if (!Array.isArray(windowModel.sectionDrafts)) {
        windowModel.sectionDrafts = [];
    }
    while (windowModel.sectionDrafts.length < 3) {
        windowModel.sectionDrafts.push({width: Number.NaN, height: Number.NaN});
    }
    windowModel.sectionDrafts = windowModel.sectionDrafts.slice(0, 3).map(section => ({
        width: Number.isFinite(section.width) ? section.width : Number.NaN,
        height: Number.isFinite(section.height) ? section.height : Number.NaN
    }));
    if (!Array.isArray(windowModel.sectionEnabled)) {
        windowModel.sectionEnabled = [true, true, true];
    }
    while (windowModel.sectionEnabled.length < 3) {
        windowModel.sectionEnabled.push(true);
    }
    windowModel.sectionEnabled = windowModel.sectionEnabled.slice(0, 3).map(value => Boolean(value));
    windowModel.sectionEnabled[1] = true;
}

function EnsureMeasurementDrafts() {
    if (!windowModel.measurementDrafts || typeof windowModel.measurementDrafts !== "object") {
        windowModel.measurementDrafts = {width: Number.NaN, height: Number.NaN};
    } else {
        windowModel.measurementDrafts = {
            width: Number.isFinite(windowModel.measurementDrafts.width) ? windowModel.measurementDrafts.width : Number.NaN,
            height: Number.isFinite(windowModel.measurementDrafts.height) ? windowModel.measurementDrafts.height : Number.NaN
        };
    }
}

function MarkSectionEdited(sectionIndex) {
    if (!Array.isArray(windowModel.sectionOrder)) {
        windowModel.sectionOrder = [];
    }
    if (!windowModel.sectionOrder.includes(sectionIndex)) {
        windowModel.sectionOrder.push(sectionIndex);
    }
}

function EnsureSections() {
    const template = windowModel.template || "flat";
    const W = Number.isFinite(windowModel.width) ? windowModel.width : 1200;
    const H = Number.isFinite(windowModel.height) ? windowModel.height : 1200;
    const count = template === "flat" ? 1 : 3;

    if (windowModel.sections.length !== count) {
        windowModel.sections = Array.from({length: count}, () => ({width: W / count || 0, height: H}));
    }

    if (template === "flat" && windowModel.lastHeight !== H && Number.isFinite(H)) {
        windowModel.sections = windowModel.sections.map(section => ({
            ...section,
            height: H
        }));
        windowModel.lastHeight = H;
    }

    NormalizeSectionWidths();
}

function NormalizeSectionWidths() {
    const W = windowModel.width;
    if (!Number.isFinite(W) || W <= 0 || windowModel.sections.length === 0) return;

    const total = windowModel.sections.reduce((sum, section) => sum + (Number(section.width) || 0), 0);
    if (total <= 0) {
        const width = W / windowModel.sections.length;
        windowModel.sections.forEach(section => {
            section.width = width;
        });
        return;
    }
    const scale = W / total;
    windowModel.sections.forEach(section => {
        section.width = section.width * scale;
    });
}

function SetFieldError(inputId, errorKey, vars = {}, options = {}) {
    SetFieldIssue(inputId, errorKey, vars, "hard", options.whyKey || "why.hardLimit");
}

function SetFieldWarning(inputId, warningKey, vars = {}, options = {}) {
    SetFieldIssue(inputId, warningKey, vars, "soft", options.whyKey || "why.nearLimit");
}

function SetFieldIssue(inputId, messageKey, vars = {}, level = "hard", whyKey = null) {
    const input = document.getElementById(inputId);
    const errorEl = document.getElementById(inputId + "Error");
    const isHard = level === "hard";

    if (input) {
        input.classList.remove("invalid", "warning");
        input.classList.add(isHard ? "invalid" : "warning");
    }

    if (errorEl) {
        errorEl.textContent = translate(messageKey, vars);
        errorEl.classList.toggle("warning", !isHard);
        const whyText = whyKey ? translate(whyKey, vars) : "";
        errorEl.title = whyText;
        if (whyText) {
            errorEl.setAttribute("aria-label", whyText);
        } else {
            errorEl.removeAttribute("aria-label");
        }
    }

    validationIssues[inputId] = {messageKey, vars, level, whyKey};
}

function ClearFieldError(inputId) {
    const input = document.getElementById(inputId);
    const errorEl = document.getElementById(inputId + "Error");
    if (input) input.classList.remove("invalid", "warning");
    if (errorEl) {
        errorEl.textContent = "";
        errorEl.classList.remove("warning");
        errorEl.title = "";
        errorEl.removeAttribute("aria-label");
    }
    delete validationIssues[inputId];
}

function RefreshValidationErrors() {
    Object.entries(validationIssues).forEach(([inputId, payload]) => {
        const errorEl = document.getElementById(inputId + "Error");
        if (!errorEl) return;
        errorEl.textContent = translate(payload.messageKey, payload.vars);
        errorEl.classList.toggle("warning", payload.level === "soft");
        const whyText = payload.whyKey ? translate(payload.whyKey, payload.vars) : "";
        errorEl.title = whyText;
        if (whyText) {
            errorEl.setAttribute("aria-label", whyText);
        } else {
            errorEl.removeAttribute("aria-label");
        }
    });
}

function ClearValidationErrors(ids = null) {
    const targets = ids || Object.keys(validationIssues);
    targets.forEach(ClearFieldError);
}

function IsNearUpperLimit(value, limit, threshold = 0.9) {
    return Number.isFinite(value) && Number.isFinite(limit) && value <= limit && value >= limit * threshold;
}

function SetWarningIfEmpty(inputId, warningKey, vars = {}, options = {}) {
    if (validationIssues[inputId]) return;
    SetFieldWarning(inputId, warningKey, vars, options);
}

// Show the drawing
function UpdateWindow() {
    GetDimensions();
    const template = windowModel.template || "flat";
    if (template === "flat") {
        EnsureSections();
        if (!Number.isFinite(windowModel.width) || !Number.isFinite(windowModel.height)) {
            DrawWindow();
            RenderMeasurements();
            RenderSpecification();
            return;
        }
    }
    //const isValid = ValidateDimensions();
    if (template === "flat" /*&& !isValid*/) {
        DrawWindow();
        RenderMeasurements();
        RenderSpecification();
        return;
    }
    DrawWindow();
    RenderMeasurements();
    RenderSpecification();
}

function GetDimensions() {
    const templateSelect = document.getElementById("win_template");
    if (templateSelect) {
        windowModel.template = templateSelect.value;
    }
    const template = windowModel.template || "flat";
    if (template === "flat") {
        EnsureMeasurementDrafts();
        const width  = GetMinMeasurement("widths");
        const height = GetMinMeasurement("heights");
        const widthValue  = Number.isFinite(width) ? width : windowModel.measurementDrafts.width;
        const heightValue = Number.isFinite(height) ? height : windowModel.measurementDrafts.height;
        if (!Number.isFinite(widthValue) || !Number.isFinite(heightValue)) {
            windowModel.width  = Number.NaN;
            windowModel.height = Number.NaN;
        } else {
            windowModel.width  = widthValue;
            windowModel.height = heightValue;
        }
        return;
    }

    EnsureSectionMeasurements();
    const sectionSizes = windowModel.sectionMeasurements.map((section, index) => {
        if (!windowModel.sectionEnabled[index]) {
            return {index, width: Number.NaN, height: Number.NaN, drawable: false};
        }
        const draft  = windowModel.sectionDrafts[index] || {width: Number.NaN, height: Number.NaN};
        const width  = GetMinValue(section.widths);
        const height = GetMinValue(section.heights);
        const widthValue  = Number.isFinite(width) ? width : draft.width;
        const heightValue = Number.isFinite(height) ? height : draft.height;
        const hasWidth  = Number.isFinite(widthValue);
        const hasHeight = Number.isFinite(heightValue);
        if (!hasWidth || !hasHeight) {
            return {index, width: Number.NaN, height: Number.NaN, drawable: false};
        }
        return {
            index,
            width: widthValue,
            height: heightValue,
            drawable: true
        };
    });

    const completeSections = sectionSizes.filter(section => section.drawable);
    windowModel.sectionCompleteIndices = completeSections.map(section => section.index);

    let orderedIndices = Array.isArray(windowModel.sectionOrder) ? windowModel.sectionOrder.slice() : [];
    orderedIndices = orderedIndices.filter(index => windowModel.sectionCompleteIndices.includes(index));
    if (orderedIndices.length === 0 && windowModel.sectionCompleteIndices.length > 0) {
        orderedIndices = windowModel.sectionCompleteIndices.slice();
    }

    windowModel.sections = orderedIndices.map(index => {
        const section = sectionSizes[index];
        return {
            index,
            width: section.width,
            height: section.height
        };
    });

    if (windowModel.sections.length === 0) {
        windowModel.width = Number.NaN;
        windowModel.height = Number.NaN;
        return;
    }

    windowModel.width = windowModel.sections.reduce((sum, section) => sum + section.width, 0);
    windowModel.height = Math.max(...windowModel.sections.map(section => section.height));
}

function ShouldShowFieldError(inputId) {
    return Boolean(touchedFields[inputId]);
}

function BindMeasureInputs() {
    const widthInput  = document.getElementById("widthMeasure");
    const heightInput = document.getElementById("heightMeasure");
    const addWidth    = document.getElementById("addWidth");
    const addHeight   = document.getElementById("addHeight");
    const widthList   = document.getElementById("widthList");
    const heightList  = document.getElementById("heightList");

    if (addWidth) {
        addWidth.textContent = "+";
        addWidth.setAttribute("title", translate("add"));
        addWidth.setAttribute("aria-label", translate("add"));
        addWidth.addEventListener("click", () => {
            AddMeasurement("widths", widthInput);
        });
    }
    if (addHeight) {
        addHeight.textContent = "+";
        addHeight.setAttribute("title", translate("add"));
        addHeight.setAttribute("aria-label", translate("add"));
        addHeight.addEventListener("click", () => {
            AddMeasurement("heights", heightInput);
        });
    }
    if (widthInput) {
        widthInput.addEventListener("input", () => {
            const value = ParseNumericValue(widthInput.value);
            EnsureMeasurementDrafts();
            if (!Number.isFinite(value) || value <= 0) return;
            const unit = GetSelectedUnitLabel();
            windowModel.measurementDrafts.width = value * UnitToMm(unit);
            UpdateWindow();
            RenderMeasurements();
        });
        widthInput.addEventListener("keydown", e => {
            if (e.key === "Enter") {
                e.preventDefault();
                AddMeasurement("widths", widthInput);
            }
        });
    }
    if (heightInput) {
        heightInput.addEventListener("input", () => {
            const value = ParseNumericValue(heightInput.value);
            EnsureMeasurementDrafts();
            if (!Number.isFinite(value) || value <= 0) return;
            const unit = GetSelectedUnitLabel();
            windowModel.measurementDrafts.height = value * UnitToMm(unit);
            UpdateWindow();
            RenderMeasurements();
        });
        heightInput.addEventListener("keydown", e => {
            if (e.key === "Enter") {
                e.preventDefault();
                AddMeasurement("heights", heightInput);
            }
        });
    }
    if (widthList) {
        widthList.addEventListener("click", e => {
            const btn = e.target.closest("button[data-index]");
            if (!btn) return;
            const index = Number(btn.dataset.index);
            if (!Number.isFinite(index)) return;
            RemoveMeasurement("widths", index);
        });
    }
    if (heightList) {
        heightList.addEventListener("click", e => {
            const btn = e.target.closest("button[data-index]");
            if (!btn) return;
            const index = Number(btn.dataset.index);
            if (!Number.isFinite(index)) return;
            RemoveMeasurement("heights", index);
        });
    }
}

function BindSectionMeasurementInputs() {
    const container = document.getElementById("sectionControls");
    if (!container) return;

    const getInputFor = (section, kind) =>
        container.querySelector(`input[data-section="${section}"][data-kind="${kind}"]`);

    const applyFirstValue = (sectionIndex, kind, input) => {
        if (!input) return;
        const value = ParseNumericValue(input.value);
        EnsureSectionMeasurements();
        if (!Number.isFinite(value) || value <= 0) return;
        const draft = windowModel.sectionDrafts[sectionIndex];
        const unit = GetSelectedUnitLabel();
        const valueMm = value * UnitToMm(unit);
        if (kind === "widths") {
            draft.width = valueMm;
        } else {
            draft.height = valueMm;
        }
        MarkSectionEdited(sectionIndex);
        UpdateWindow();
        RenderMeasurements();
    };

    container.querySelectorAll("button[data-section][data-kind]").forEach(btn => {
        btn.textContent = "+";
        btn.setAttribute("title", translate("add"));
        btn.setAttribute("aria-label", translate("add"));
    });

    container.addEventListener("click", e => {
        const btn = e.target.closest("button[data-section][data-kind]");
        if (!btn) return;
        const sectionIndex = Number(btn.dataset.section);
        const kind = btn.dataset.kind;
        const input = getInputFor(sectionIndex, kind);
        AddSectionMeasurement(sectionIndex, kind, input);
    });

    container.addEventListener("keydown", e => {
        if (e.key !== "Enter") return;
        const input = e.target.closest("input[data-section][data-kind]");
        if (!input) return;
        e.preventDefault();
        const sectionIndex = Number(input.dataset.section);
        const kind = input.dataset.kind;
        AddSectionMeasurement(sectionIndex, kind, input);
    });

    container.addEventListener("input", e => {
        const input = e.target.closest("input[data-section][data-kind]");
        if (!input) return;
        const sectionIndex = Number(input.dataset.section);
        const kind = input.dataset.kind;
        applyFirstValue(sectionIndex, kind, input);
    });
}

function AddSectionMeasurement(sectionIndex, kind, input) {
    if (!input) return;
    const value = ParseNumericValue(input.value);
    if (!Number.isFinite(value) || value <= 0) return;
    EnsureSectionMeasurements();
    const unit = GetSelectedUnitLabel();
    const valueMm = value * UnitToMm(unit);
    windowModel.sectionMeasurements[sectionIndex][kind].push(valueMm);
    MarkSectionEdited(sectionIndex);
    input.value = "";
    if (kind === "widths") {
        windowModel.sectionDrafts[sectionIndex].width = Number.NaN;
    } else {
        windowModel.sectionDrafts[sectionIndex].height = Number.NaN;
    }
    UpdateWindow();
    RenderMeasurements();
}

function RemoveSectionMeasurement(sectionIndex, kind, index) {
    EnsureSectionMeasurements();
    windowModel.sectionMeasurements[sectionIndex][kind].splice(index, 1);
    UpdateWindow();
    RenderMeasurements();
}

function AddMeasurement(kind, input) {
    if (!input) return;
    const value = ParseNumericValue(input.value);
    if (!Number.isFinite(value) || value <= 0) return;
    const unit = GetSelectedUnitLabel();
    const valueMm = value * UnitToMm(unit);
    windowModel.measurements[kind].push(valueMm);
    input.value = "";
    EnsureMeasurementDrafts();
    if (kind === "widths") {
        windowModel.measurementDrafts.width = Number.NaN;
    } else {
        windowModel.measurementDrafts.height = Number.NaN;
    }
    const listId = kind === "widths" ? "widthList" : "heightList";
    RenderMeasurementList(kind, listId);
    const flatGrid = document.querySelector("#measureControls .measure-grid");
    if (flatGrid) {
        const hasAny = windowModel.measurements.widths.length > 0 || windowModel.measurements.heights.length > 0;
        flatGrid.classList.toggle("has-values", hasAny);
    }
    UpdateWindow();
    RenderMeasurements();
}

function RemoveMeasurement(kind, index) {
    windowModel.measurements[kind].splice(index, 1);
    const listId = kind === "widths" ? "widthList" : "heightList";
    RenderMeasurementList(kind, listId);
    const flatGrid = document.querySelector("#measureControls .measure-grid");
    if (flatGrid) {
        const hasAny = windowModel.measurements.widths.length > 0 || windowModel.measurements.heights.length > 0;
        flatGrid.classList.toggle("has-values", hasAny);
    }
    UpdateWindow();
    RenderMeasurements();
}

function GetMinMeasurement(kind) {
    const values = windowModel.measurements[kind];
    if (!values.length) return Number.NaN;
    return Math.min(...values);
}

function GetMinValue(values) {
    if (!Array.isArray(values) || !values.length) return Number.NaN;
    return Math.min(...values);
}

function GetMeasurementReference(values) {
    const finiteValues = Array.isArray(values) ? values.filter(Number.isFinite).slice().sort((a, b) => a - b) : [];
    if (!finiteValues.length) return Number.NaN;
    const middle = Math.floor(finiteValues.length / 2);
    if (finiteValues.length % 2 === 1) return finiteValues[middle];
    return (finiteValues[middle - 1] + finiteValues[middle]) / 2;
}

function IsMeasurementOutOfRange(value, values, tolerance = 15) {
    if (!Number.isFinite(value)) return false;
    const finiteValues = Array.isArray(values) ? values.filter(Number.isFinite) : [];
    if (finiteValues.length < 2) return false;
    const reference = GetMeasurementReference(finiteValues);
    if (!Number.isFinite(reference)) return false;
    return Math.abs(value - reference) > tolerance;
}

function RenderMeasurements() {
    RenderMeasurementList("widths", "widthList");
    RenderMeasurementList("heights", "heightList");
    const flatGrid = document.querySelector("#measureControls .measure-grid");
    if (flatGrid) {
        const hasAny = windowModel.measurements.widths.length > 0 || windowModel.measurements.heights.length > 0;
        flatGrid.classList.toggle("has-values", hasAny);
    }

    EnsureSectionMeasurements();
    RenderSectionMeasurementList(0, "widths",  "sectionLeftWidthList");
    RenderSectionMeasurementList(0, "heights", "sectionLeftHeightList");
    RenderSectionMeasurementList(1, "widths",  "sectionCenterWidthList");
    RenderSectionMeasurementList(1, "heights", "sectionCenterHeightList");
    RenderSectionMeasurementList(2, "widths",  "sectionRightWidthList");
    RenderSectionMeasurementList(2, "heights", "sectionRightHeightList");

    document.querySelectorAll(".section-measure-grid-inner").forEach((grid, index) => {
        const section = windowModel.sectionMeasurements[index];
        const hasAny = section.widths.length > 0 || section.heights.length > 0;
        grid.classList.toggle("has-values", hasAny);
    });
}

function RenderMeasurementList(kind, listId) {
    const list = document.getElementById(listId);
    if (!list) return;
    list.innerHTML = "";
    const values = windowModel.measurements[kind];
    const min = values.length ? Math.min(...values) : null;
    values.forEach((value, index) => {
        const li = document.createElement("li");
        li.classList.add("measure-item");
        if (value === min) li.classList.add("min");
        if (IsMeasurementOutOfRange(value, values)) {
            li.classList.add("out-of-range");
        }
        li.textContent = FormatMeasurement(value);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.dataset.index = String(index);
        btn.textContent = "×";
        li.appendChild(btn);
        list.appendChild(li);
    });
}

function RenderSectionMeasurementList(sectionIndex, kind, listId) {
    const list = document.getElementById(listId);
    if (!list) return;
    list.innerHTML = "";
    EnsureSectionMeasurements();
    const values = windowModel.sectionMeasurements[sectionIndex][kind];
    const min = values.length ? Math.min(...values) : null;
    values.forEach((value, index) => {
        const li = document.createElement("li");
        li.classList.add("measure-item");
        if (value === min) li.classList.add("min");
        if (IsMeasurementOutOfRange(value, values)) {
            li.classList.add("out-of-range");
        }
        li.textContent = FormatMeasurement(value);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = "×";
        btn.addEventListener("click", () => RemoveSectionMeasurement(sectionIndex, kind, index));
        li.appendChild(btn);
        list.appendChild(li);
    });
}

function ToggleTemplateControls() {
    const template = windowModel.template || "flat";
    document.documentElement.classList.toggle("template-bay", template === "bay" || template === "bow");
    document.querySelectorAll(".sections-only").forEach(el => {
        el.classList.toggle("hidden", template === "flat");
    });
    document.querySelectorAll(".flat-only").forEach(el => {
        el.classList.toggle("hidden", template !== "flat");
    });
    const measureControls = document.getElementById("measureControls");
    if (measureControls) {
        measureControls.classList.remove("flat-only");
        measureControls.classList.toggle("bay-only", template !== "flat");
    }
    UpdateSectionSelector();
}

function BindSectionToggleButtons() {
    document.querySelectorAll(".section-toggle-btn[data-section-toggle]").forEach(button => {
        button.addEventListener("click", () => {
            const index = Number(button.dataset.sectionToggle);
            if (!Number.isFinite(index)) return;
            if (index === 1) return;
            windowModel.sectionEnabled[index] = !windowModel.sectionEnabled[index];
            UpdateSectionToggleButtons();
            UpdateSectionSelector();
            UpdateWindow();
        });
    });
    UpdateSectionToggleButtons();
}

function UpdateSectionToggleButtons() {
    const enabled = windowModel.sectionEnabled || [true, true, true];
    enabled[1] = true;
    document.querySelectorAll(".section-toggle-btn[data-section-toggle]").forEach(button => {
        const index = Number(button.dataset.sectionToggle);
        const isEnabled = enabled[index];
        const labelKey = index === 0
            ? (isEnabled ? "remove_left_sec" : "restore_left_sec")
            : (isEnabled ? "remove_right_sec" : "restore_right_sec");
        const label = translate(labelKey);
        button.textContent = isEnabled ? "×" : "+";
        button.setAttribute("title", label);
        button.setAttribute("aria-label", label);
    });
}

function BindSectionSelector() {
    const select = document.getElementById("sectionSelect");
    if (!select) return;
    const saved = localStorage.getItem("sectionSelect");
    if (saved === "0" || saved === "1" || saved === "2") {
        select.value = saved;
    }
    select.addEventListener("change", () => {
        localStorage.setItem("sectionSelect", select.value);
        UpdateSectionSelector();
    });
    window.addEventListener("resize", () => {
        UpdateSectionSelector();
    });
}

function UpdateSectionSelector() {
    const select = document.getElementById("sectionSelect");
    if (!select) return;
    const isMobile = IsMobileLayout();
    const sections = document.querySelectorAll(".section-measure[data-section-index]");
    const enabled = windowModel.sectionEnabled || [true, true, true];
    enabled[1] = true;
    const options = select.querySelectorAll("option");
    options.forEach(option => {
        const index = Number(option.value);
        option.disabled = !enabled[index];
    });
    if (enabled.every(val => !val)) {
        windowModel.sectionEnabled = [true, true, true];
    }
    if (!enabled[Number(select.value)]) {
        const firstEnabled = enabled.findIndex(val => val);
        if (firstEnabled >= 0) {
            select.value = String(firstEnabled);
        }
    }
    if (!isMobile) {
        sections.forEach(section => section.removeAttribute("data-mobile-hidden"));
        sections.forEach(section => {
            const index = Number(section.getAttribute("data-section-index"));
            const disabled = !enabled[index];
            if (disabled) {
                section.setAttribute("data-section-disabled", "true");
            } else {
                section.removeAttribute("data-section-disabled");
            }
        });
        return;
    }
    const selected = select.value;
    sections.forEach(section => {
        const index = section.getAttribute("data-section-index");
        const disabled = !enabled[Number(index)];
        const hide = index !== selected || disabled;
        if (hide) {
            section.setAttribute("data-mobile-hidden", "true");
        } else {
            section.removeAttribute("data-mobile-hidden");
        }
        if (disabled) {
            section.setAttribute("data-section-disabled", "true");
        } else {
            section.removeAttribute("data-section-disabled");
        }
    });
}

function RenderSpecification() {
    const tbody = document.getElementById("specTableBody");
    if (!tbody) return;
    tbody.innerHTML = "";

    const widthLabel = `${translate("spec_width")} (mm)`;
    const heightLabel = `${translate("spec_height")} (mm)`;
    const ths = document.querySelectorAll("#specTable thead th");
    if (ths.length >= 3) {
        ths[1].textContent = widthLabel;
        ths[2].textContent = heightLabel;
    }

    const rows = [];
    if (windowModel.template === "flat") {
        if (Number.isFinite(windowModel.width) || Number.isFinite(windowModel.height)) {
            rows.push({
                label: translate("spec_overall"),
                width: Number.isFinite(windowModel.width) ? String(Math.round(windowModel.width)) : "—",
                height: Number.isFinite(windowModel.height) ? String(Math.round(windowModel.height)) : "—"
            });
        }
    } else {
        const labels = [
            translate("left_sec"),
            translate("central_sec"),
            translate("right_sec")
        ];
        const enabled = windowModel.sectionEnabled || [true, true, true];
        enabled[1] = true;
        const sections = new Map((windowModel.sections || []).map(section => [section.index, section]));
        labels.forEach((label, index) => {
            if (!enabled[index]) return;
            const section = sections.get(index);
            rows.push({
                label,
                width: Number.isFinite(section?.width) ? String(Math.round(section.width)) : "—",
                height: Number.isFinite(section?.height) ? String(Math.round(section.height)) : "—"
            });
        });
        if (Number.isFinite(windowModel.width) || Number.isFinite(windowModel.height)) {
            rows.push({
                label: translate("spec_overall"),
                width: Number.isFinite(windowModel.width) ? String(Math.round(windowModel.width)) : "—",
                height: Number.isFinite(windowModel.height) ? String(Math.round(windowModel.height)) : "—"
            });
        }
    }

    rows.forEach(({label, width, height}) => {
        const tr = document.createElement("tr");
        [label, width, height].forEach(text => {
            const td = document.createElement("td");
            td.textContent = text;
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
}

/*function ValidateDimensions() {
    const rules = validationRules.window;
    ClearValidationErrors(["width", "height"]);

    let valid = true;

    if (Number.isNaN(windowModel.width) || windowModel.width < rules.minWidth) {
        if (ShouldShowFieldError("width")) {
            SetFieldError("width", "error.minWidth", {min: rules.minWidth}, {whyKey: "why.hardLimit"});
        }
        valid = false;
    } else if (windowModel.width > rules.maxWidth) {
        if (ShouldShowFieldError("width")) {
            SetFieldError("width", "error.maxWidth", {max: rules.maxWidth}, {whyKey: "why.hardLimit"});
        }
        valid = false;
    } else if (ShouldShowFieldError("width") && IsNearUpperLimit(windowModel.width, rules.maxWidth)) {
        SetFieldWarning("width", "warning.nearMaxWidth", {max: rules.maxWidth}, {whyKey: "why.nearLimit"});
    }

    if (Number.isNaN(windowModel.height) || windowModel.height < rules.minHeight) {
        if (ShouldShowFieldError("height")) {
            SetFieldError("height", "error.minHeight", {min: rules.minHeight}, {whyKey: "why.hardLimit"});
        }
        valid = false;
    } else if (windowModel.height > rules.maxHeight) {
        if (ShouldShowFieldError("height")) {
            SetFieldError("height", "error.maxHeight", {max: rules.maxHeight}, {whyKey: "why.hardLimit"});
        }
        valid = false;
    } else if (ShouldShowFieldError("height") && IsNearUpperLimit(windowModel.height, rules.maxHeight)) {
        SetFieldWarning("height", "warning.nearMaxHeight", {max: rules.maxHeight}, {whyKey: "why.nearLimit"});
    }

    return valid;
}*/

function DrawWindow() {
    const NS = "http://www.w3.org/2000/svg";
    const dimOffset = 110;
    const labelOffset = 35;
    const dimStroke = 3.5;
    const arrowHeadSize = 10;

    const W = windowModel.width;
    const H = windowModel.height;
    const template = windowModel.template || "flat";
    if (template === "flat") {
        if (!Number.isFinite(windowModel.width) || !Number.isFinite(windowModel.height)) {
            drawingDiv.classList.remove("active");
            drawingDiv.style.display = "none";
            return;
        }
        EnsureSections();
    }

    const drawingDiv = document.getElementById("drawing");
    if (template !== "flat" && (!Array.isArray(windowModel.sections) || windowModel.sections.length === 0)) {
        drawingDiv.classList.remove("active");
        drawingDiv.style.display = "none";
        return;
    }

    drawingDiv.classList.add("active");
    drawingDiv.style.display = "block";

    const svg = document.getElementById("windowSvg");
    const oldDrawing = svg.querySelector("#drawingGroup");
    if (oldDrawing) oldDrawing.remove();

    EnsureCadDefs(svg, NS);
    const drawingGroup = CreateNewElement(NS, svg, "g", {id: "drawingGroup"});

    const sectionsData = template === "flat"
        ? [{width: W, height: H}]
        : windowModel.sections.map(section => ({width: section.width, height: section.height}));

    const sections = [];
    let cursorX = 0;
    sectionsData.forEach((section, index) => {
        const width  = Number.isFinite(section.width) && section.width > 0 ? section.width : 0;
        const height = Number.isFinite(section.height) && section.height > 0 ? section.height : Number.NaN;
        const x0 = cursorX;
        const x1 = cursorX + width;
        cursorX = x1;
        sections.push({
            label: ["A", "B", "C"][index] || "A",
            x0,
            x1,
            width,
            height,
            type: template === "flat" ? "rect" : (index === 1 ? "rect" : "para")
        });
    });

    const drawnSections = sections.filter(section => section.width > 0 && Number.isFinite(section.height));
    if (!drawnSections.length) {
        return;
    }

    const maxHeight = Math.max(...drawnSections.map(section => section.height));
    const maxRight  = Math.max(...drawnSections.map(section => section.x1));
    //const skewY = template === "bay" ? Math.min(40, maxHeight * 0.2) : template === "bow" ? Math.min(20, maxHeight * 0.15) : 0;
    const skewY = template === "bay" ? 800 : template === "bow" ? 360 : 0;

    const rightArrowX = maxRight + dimOffset;
    const minX = 0 - labelOffset;
    const maxX = rightArrowX + labelOffset * 2;
    const minY = -dimOffset - labelOffset * 2;
    const maxY = maxHeight + skewY + dimOffset;
    const printPad = isPrintLayoutMode ? 100 : 0;

    svg.setAttribute(
        "viewBox",
        `${minX - 2 * printPad} ${minY - 2 * printPad} ${maxX - minX + printPad * 3} ${maxY - minY + printPad * 3}`
    );
    svg.style.width  = "100%";
    svg.style.height = "100%";
    svg.style.background = cadTheme.background;

    // Background for Drawing
    CreateNewElement(NS, drawingGroup, "rect", {
        class: "cadGridBackground",
        x: minX - printPad,
        y: minY - printPad,
        width:  maxX - minX + printPad * 2,
        height: maxY - minY + printPad * 2,
        fill: "url(#cadGridMajor)"
    });

    // All Window Sections
    sections.forEach((section, index) => {
        if (section.width <= 0 || !Number.isFinite(section.height)) return;
        // Central Section
        if (section.type === "rect") {
            CreateNewElement(NS, drawingGroup, "rect", {
                class: "windowFrame",
                x: section.x0,
                y: 0,
                width: section.width,
                height: section.height,
                fill: "none",
                stroke: cadTheme.frameMain,
                "stroke-width": 6
            });
            return;
        }

        const isLeft = index === 0;
        const yLeftTop = isLeft ? skewY : 0;
        const yRightTop = isLeft ? 0 : skewY;
        const yLeftBottom = yLeftTop + section.height;
        const yRightBottom = yRightTop + section.height;
        const points = [
            `${section.x0},${yLeftTop}`,
            `${section.x1},${yRightTop}`,
            `${section.x1},${yRightBottom}`,
            `${section.x0},${yLeftBottom}`
        ].join(" ");
        // Left and Right Sections
        CreateNewElement(NS, drawingGroup, "polygon", {
            class: "windowFrame",
            points,
            fill: "none",
            stroke: cadTheme.frameMain,
            "stroke-width": 6
        });
    });

    const marker = document.getElementById("arrow");
    marker.setAttribute("markerWidth", arrowHeadSize);
    marker.setAttribute("markerHeight", arrowHeadSize);
    marker.setAttribute("refX", arrowHeadSize);
    marker.setAttribute("refY", arrowHeadSize / 2);
    marker.querySelector("path").setAttribute("d", `M0,0 L${arrowHeadSize},${arrowHeadSize / 2} L0,${arrowHeadSize} Z`);
    marker.querySelector("path").setAttribute("fill", cadTheme.dimension);

    // Horizontal Arrows
    sections.forEach((section, index) => {
        if (section.width <= 0 || !Number.isFinite(section.height)) return;
        const x1 = section.x0;
        const x2 = section.x1;
        const isLeft = index === 0;
        const isRight = index === 2;
        const y1 = isLeft ? skewY : 0;
        const y2 = isLeft ? 0 : (isRight ? skewY : 0);
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        const nx = 0;
        const ny = 1;
        const ox = nx * dimOffset;
        const oy = ny * dimOffset;
        const arrowY1 = y1 - oy;
        const arrowY2 = y2 - oy;
        const stopperPad = dimStroke * 8;
        CreateArrow(
            NS,
            drawingGroup,
            "H",
            x1 + ox, arrowY1,
            x2 + ox, arrowY2,
            midX + ox, midY - oy - labelOffset,
            Math.round(x2 - x1)
        );
        CreateNewElement(NS, drawingGroup, "line", {x1: x1, y1: y1, x2: x1, y2: arrowY1 - stopperPad, stroke: cadTheme.dimension, "stroke-width": dimStroke});
        CreateNewElement(NS, drawingGroup, "line", {x1: x2, y1: y2, x2: x2, y2: arrowY2 - stopperPad, stroke: cadTheme.dimension, "stroke-width": dimStroke});
    });

    // Vertical Arrows
    sections.forEach((section, index) => {
        if (section.width <= 0 || !Number.isFinite(section.height)) return;
        const isLeft = index === 0;
        const isCenter = index === 1;
        const isRight = index === 2;
        const arrowX = isLeft
            ? section.x0 - dimOffset
            : isCenter
                ? (section.x0 + section.x1) / 2
                : section.x1 + dimOffset;
        const yTop = isLeft ? skewY : (isRight ? skewY : 0);
        const yBottom = yTop + section.height;
        CreateArrow(
            NS,
            drawingGroup,
            "V",
            arrowX, yTop,
            arrowX, yBottom,
            arrowX + (isLeft ? -labelOffset : labelOffset),
            (yTop + yBottom) / 2,
            Math.round(section.height)
        );
        const frameX = isLeft ? section.x0 : (isRight ? section.x1 : section.x0);
        const stopperPad = dimStroke * 8;
        const padDir = arrowX >= frameX ? 1 : -1;
        CreateNewElement(NS, drawingGroup, "line", {x1: frameX, y1: yTop, x2: arrowX + padDir * stopperPad, y2: yTop, stroke: cadTheme.dimension, "stroke-width": dimStroke});
        CreateNewElement(NS, drawingGroup, "line", {x1: frameX, y1: yBottom, x2: arrowX + padDir * stopperPad, y2: yBottom, stroke: cadTheme.dimension, "stroke-width": dimStroke});
    }); 
}

function PrintWindow() {
    isPrintLayoutMode = true;
    DrawWindow();
    setTimeout(() => {
        window.print();
        setTimeout(() => {
            isPrintLayoutMode = false;
            DrawWindow();
        }, 0);
    }, 0);
}

function CreateNewElement(NS, parent, name, attributes = {}, textContent = null) {
    const el = document.createElementNS(NS, name);
    for (const [attr, value] of Object.entries(attributes)) { el.setAttribute(attr, value); }
    if (textContent !== null) { el.textContent = textContent; }
    parent.appendChild(el);
    return el;
}

function CreateArrow(NS, parent, direction, x1, y1, x2, y2, x, y, label) {
    const stroke = cadTheme.dimension;
    const strokeWidth = 3.5;
    const fontSize = 80;
    const fill = cadTheme.dimension;

    CreateNewElement(NS, parent, "line", { x1: x1, y1: y1, x2: x2, y2: y2,
        stroke: stroke, "stroke-width": strokeWidth, "marker-start": "url(#arrow)", "marker-end": "url(#arrow)"
    });

    let labelAttrs = {x: x, y: y, "font-size": fontSize, fill: fill, "text-anchor": "middle", "dominant-baseline": "middle"};

    if (direction === "V") { labelAttrs["transform"] = `rotate(-90 ${x} ${y})`; }
    if (direction === "H" && Math.abs(y2 - y1) > 0.01) {
        const angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);
        labelAttrs["transform"] = `rotate(${angle} ${x} ${y})`;
    }
    labelAttrs["cursor"] = "pointer";
    CreateNewElement(NS, parent, "text", labelAttrs, `${Math.round(label)} mm`);
}


function EnsureCadDefs(svg, NS) {
    const defs = svg.querySelector("defs");
    if (!defs) return;

    if (!svg.querySelector("#cadGridFine")) {
        const fineGrid = CreateNewElement(NS, defs, "pattern", {id: "cadGridFine", patternUnits: "userSpaceOnUse", width: 20, height: 20});
        CreateNewElement(NS, fineGrid, "path", {d: "M20 0 L0 0 0 20", fill: "none", stroke: "#17253a", "stroke-width": 1});
    }

    if (!svg.querySelector("#cadGridMajor")) {
        const majorGrid = CreateNewElement(NS, defs, "pattern", {id: "cadGridMajor", patternUnits: "userSpaceOnUse", width: 100, height: 100});
        CreateNewElement(NS, majorGrid, "rect", {x: 0, y: 0, width: 100, height: 100, fill: "url(#cadGridFine)"});
        CreateNewElement(NS, majorGrid, "path", {d: "M100 0 L0 0 0 100", fill: "none", stroke: "#223754", "stroke-width": 1.6});
    }

    if (!svg.querySelector("#cadGlassHatch")) {
        const glassPattern = CreateNewElement(NS, defs, "pattern", {id: "cadGlassHatch", patternUnits: "userSpaceOnUse", width: 14, height: 14, patternTransform: "rotate(45)"});
        CreateNewElement(NS, glassPattern, "rect", {x: 0, y: 0, width: 14, height: 14, fill: "#102335"});
        CreateNewElement(NS, glassPattern, "line", {x1: 0, y1: 0, x2: 0, y2: 14, stroke: "#355f85", "stroke-width": 2});
    }
}
