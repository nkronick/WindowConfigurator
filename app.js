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

document.addEventListener("DOMContentLoaded", () => {
    ApplyViewportPreviewMode(GetViewportPreviewMode());
    
    // Language handling
    const langSelect = document.getElementById("languageSelect");
    if (langSelect) {
        langSelect.addEventListener("change", e => {
            loadLanguage(e.target.value);
        });
    }
    InitProfileSystemControls();
    window.addEventListener("beforeprint", () => {
        isPrintLayoutMode = true;
        DrawWindow();
    });
    window.addEventListener("afterprint", () => {
        isPrintLayoutMode = false;
        DrawWindow();
    });

    // Window witdh
    const focusWidth = document.getElementById('width');
    if (focusWidth) {
        focusWidth.focus();
        focusWidth.addEventListener('input', () => {
            UpdateWindow();
        });
        focusWidth.addEventListener("blur", () => {
            MarkFieldTouched("width");
            HandleDimensionBlurValidation();
        });
    }
    
    // Window height
    const focusHeight = document.getElementById('height');
    if (focusHeight) {
        focusHeight.addEventListener('input', () => {
            UpdateWindow();
        });
        focusHeight.addEventListener("blur", () => {
            MarkFieldTouched("height");
            HandleDimensionBlurValidation();
        });
    }

    // Number of Window bays
    const focusCntBays = document.getElementById('cnt_bays');
    if (focusCntBays) {
        focusCntBays.addEventListener('input', () => {
            UpdateWindow();
        });
        focusCntBays.addEventListener("blur", () => {
            MarkFieldTouched("cnt_bays");
            HandleDimensionBlurValidation();
        });
    }

    // Window Design
    const focusIBays = document.getElementById("identical_bays");
    if (focusIBays) {
        focusIBays.addEventListener("change", (e) => {
            const locked = focusIBays.checked;
            document.getElementById("identicalBayWidth").classList.toggle("hidden", locked);
            document.getElementById("identicalBayHeight").classList.toggle("hidden", locked);
            document.getElementById("bayWidthError").classList.toggle("hidden", locked);
            document.getElementById("bayHeightError").classList.toggle("hidden", locked);
            UpdateWindow();
        });
    }

    // Bay width
    const bayWidthInput = document.getElementById("bayWidth");
    if (bayWidthInput) {
        bayWidthInput.addEventListener("input", (e) => {
            if (windowModel.selectedBay === null) return;

            const index = windowModel.selectedBay;
            const newWidth = Number(e.target.value);
            if (newWidth <= 0) return;

            const cnt = windowModel.bays.length;

            // Total available width inside outer frame
            const totalMullions  = GetTotalMullionWidth();
            const totalAvailable = windowModel.width - profile.outerFrame.left - profile.outerFrame.right - totalMullions + GetTotalOverlapAllowance();

            // calculate width used by other bays
            const totalUsed = windowModel.bays.reduce((sum, bay, i) => {
                return i === index ? sum : sum + bay.width;
            }, 0);
            if (totalUsed <= 0) return;

            const remainingWidth = totalAvailable - newWidth;
            if (remainingWidth <= 0) return;

            // scale other bays proportionally
            windowModel.bays.forEach((bay, i) => {
                if (i === index) {
                    bay.width = newWidth;
                } else {
                    bay.width = (bay.width / totalUsed) * remainingWidth;
                }
            });

            RecalcBays();
            DrawWindow();
            ValidateBayConstraints();
        });
        bayWidthInput.addEventListener("blur", () => {
            MarkFieldTouched("bayWidth");
            ValidateBayConstraints();
        });
    }

    // Bay height
    const bayHeightInput = document.getElementById("bayHeight");
    if (bayHeightInput) {
        bayHeightInput.addEventListener("input", e => {
            if (windowModel.selectedBay === null) return;
            const selectedBay  = windowModel.bays[windowModel.selectedBay];
            const selectedProfile = selectedBay ? GetBayStructureProfile(selectedBay.opening) : GetBayStructureProfile("fixed");
            const maxBayHeight = windowModel.height - profile.outerFrame.top - profile.outerFrame.bottom + 2 * selectedProfile.sashOverlap;
            const newHeight    = Number(e.target.value);
            if (Number.isNaN(newHeight) || newHeight <= 0) return;

            windowModel.bays[windowModel.selectedBay].height = Math.min(newHeight, maxBayHeight);
            //e.target.value = Math.round(windowModel.bays[windowModel.selectedBay].height);
            e.target.value = windowModel.bays[windowModel.selectedBay].height;
            RecalcBays();
            DrawWindow();
            ValidateBayConstraints();
        });
        bayHeightInput.addEventListener("blur", () => {
            MarkFieldTouched("bayHeight");
            ValidateBayConstraints();
        });
    }

    // Bay opening type
    const openingType = document.getElementById("openingType");
    if (openingType) {
        openingType.addEventListener("change", e => {
            if (windowModel.selectedBay === null) return;
            const bay = windowModel.bays[windowModel.selectedBay];
            bay.opening = e.target.value;
            const directions = openingDirectionOptions[bay.opening] || [];
            if (!directions.includes(bay.openingDirection)) {
                bay.openingDirection = directions[0] || "";
            }
            UpdateOpeningDirectionControl();
            document.getElementById("openingDirection").value = bay.openingDirection || "";
            RecalcBays();
            DrawWindow();
            ValidateBayConstraints();
        });
    }

    const openingDirection = document.getElementById("openingDirection");
    if (openingDirection) {
        openingDirection.addEventListener("change", e => {
            if (windowModel.selectedBay === null) return;
            windowModel.bays[windowModel.selectedBay].openingDirection = e.target.value;
            DrawWindow();
            ValidateBayConstraints();
        });
    }

    init();
    UpdateWindow();

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
        RefreshValidationErrors();
        RenderSpecification();
        if (windowModel.selectedBay !== null) {
            showBayControls();
        }

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

const openingDirectionOptions = {
    fixed:     [],
    casement:  ["left_to_right", "right_to_left"],
    tilt_turn: ["left_to_right", "right_to_left"],
    hopper:    ["bottom_to_top", "top_to_bottom"],
    transom:   ["top_to_bottom", "bottom_to_top"],
    sliding:   ["left_to_right", "right_to_left"]
};

const profileSystemCatalog = {
    klil: {
        label: "KLIL",
        series: {
            basic_7000: {
                label: "Basic 7000 (Sliding)",
                profile: {
                    outerFrame: {left: 78, right: 78, top: 78, bottom: 78},
                    bayFrame:   {left: 52, right: 52, top: 52, bottom: 52},
                    verticalMullion:   56,
                    horizontalMullion: 56,
                    sashOverlap:       12,
                    glassInset:        12
                },
                openingStructureProfiles: {
                    fixed:     {verticalMullion: 52, horizontalMullion: 52, sashOverlap: 10, glassInset: 10},
                    casement:  {verticalMullion: 56, horizontalMullion: 54, sashOverlap: 14, glassInset: 12},
                    tilt_turn: {verticalMullion: 58, horizontalMullion: 56, sashOverlap: 15, glassInset: 12},
                    hopper:    {verticalMullion: 52, horizontalMullion: 54, sashOverlap: 13, glassInset: 11},
                    transom:   {verticalMullion: 52, horizontalMullion: 54, sashOverlap: 12, glassInset: 10},
                    sliding:   {verticalMullion: 48, horizontalMullion: 50, sashOverlap: 10, glassInset: 14}
                },
                validationRules: {
                    window:  {minWidth: 700, maxWidth: 7600, minHeight: 700, maxHeight: 3200, minCntBays: 1, maxCntBays: 8},
                    mullion: {min: 35, max: 140},
                    opening: {
                        fixed:     {minWidth: 350, maxWidth: 2400, minHeight: 350, maxHeight: 2800},
                        casement:  {minWidth: 450, maxWidth: 1100, minHeight: 700, maxHeight: 2400},
                        tilt_turn: {minWidth: 550, maxWidth: 1200, minHeight: 800, maxHeight: 2500},
                        hopper:    {minWidth: 500, maxWidth: 2000, minHeight: 350, maxHeight: 1300},
                        transom:   {minWidth: 500, maxWidth: 2200, minHeight: 300, maxHeight: 1200},
                        sliding:   {minWidth: 900, maxWidth: 3200, minHeight: 700, maxHeight: 2800}
                    },
                    glassSafety: {
                        fixed:    {maxEdge: 2400, maxAreaM2: 4.8},
                        operable: {maxEdge: 1700, maxAreaM2: 2.8}
                    }
                }
            },
            bauhaus_2600: {
                label: "Bauhaus 2600 (Lift & Slide)",
                profile: {
                    outerFrame: {left: 92, right: 92, top: 92, bottom: 92},
                    bayFrame:   {left: 58, right: 58, top: 58, bottom: 58},
                    verticalMullion:   64,
                    horizontalMullion: 64,
                    sashOverlap:       14,
                    glassInset:        14
                },
                openingStructureProfiles: {
                    fixed:     {verticalMullion: 56, horizontalMullion: 56, sashOverlap: 12, glassInset: 12},
                    casement:  {verticalMullion: 60, horizontalMullion: 58, sashOverlap: 15, glassInset: 14},
                    tilt_turn: {verticalMullion: 62, horizontalMullion: 60, sashOverlap: 16, glassInset: 14},
                    hopper:    {verticalMullion: 56, horizontalMullion: 58, sashOverlap: 14, glassInset: 13},
                    transom:   {verticalMullion: 56, horizontalMullion: 58, sashOverlap: 13, glassInset: 12},
                    sliding:   {verticalMullion: 52, horizontalMullion: 54, sashOverlap: 12, glassInset: 16}
                },
                validationRules: {
                    window:  {minWidth: 900, maxWidth: 9000, minHeight: 700, maxHeight: 3600, minCntBays: 1, maxCntBays: 8},
                    mullion: {min: 40, max: 180},
                    opening: {
                        fixed:     {minWidth: 400,  maxWidth: 2800, minHeight: 400, maxHeight: 3000},
                        casement:  {minWidth: 500,  maxWidth: 1200, minHeight: 700, maxHeight: 2500},
                        tilt_turn: {minWidth: 600,  maxWidth: 1300, minHeight: 800, maxHeight: 2600},
                        hopper:    {minWidth: 550,  maxWidth: 2200, minHeight: 350, maxHeight: 1400},
                        transom:   {minWidth: 550,  maxWidth: 2400, minHeight: 300, maxHeight: 1200},
                        sliding:   {minWidth: 1200, maxWidth: 3800, minHeight: 700, maxHeight: 3000}
                    },
                    glassSafety: {
                        fixed:    {maxEdge: 2800, maxAreaM2: 6.0},
                        operable: {maxEdge: 1900, maxAreaM2: 3.2}
                    }
                }
            }
        }
    },
    extal: {
        label: "EXTAL",
        series: {
            extal_4300: {
                label: "4300 (Sliding)",
                profile: {
                    outerFrame: {left: 76, right: 76, top: 76, bottom: 76},
                    bayFrame:   {left: 50, right: 50, top: 50, bottom: 50},
                    verticalMullion:   54,
                    horizontalMullion: 54,
                    sashOverlap:       12,
                    glassInset:        12
                },
                openingStructureProfiles: {
                    fixed:     {verticalMullion: 52, horizontalMullion: 52, sashOverlap: 10, glassInset: 10},
                    casement:  {verticalMullion: 54, horizontalMullion: 52, sashOverlap: 14, glassInset: 12},
                    tilt_turn: {verticalMullion: 56, horizontalMullion: 54, sashOverlap: 15, glassInset: 12},
                    hopper:    {verticalMullion: 50, horizontalMullion: 52, sashOverlap: 13, glassInset: 11},
                    transom:   {verticalMullion: 50, horizontalMullion: 52, sashOverlap: 12, glassInset: 10},
                    sliding:   {verticalMullion: 48, horizontalMullion: 50, sashOverlap: 10, glassInset: 14}
                },
                validationRules: {
                    window:  {minWidth: 700, maxWidth: 7800, minHeight: 700, maxHeight: 3300, minCntBays: 1, maxCntBays: 8},
                    mullion: {min: 35, max: 150},
                    opening: {
                        fixed:     {minWidth: 350, maxWidth: 2500, minHeight: 350, maxHeight: 2800},
                        casement:  {minWidth: 450, maxWidth: 1100, minHeight: 700, maxHeight: 2400},
                        tilt_turn: {minWidth: 550, maxWidth: 1200, minHeight: 800, maxHeight: 2500},
                        hopper:    {minWidth: 500, maxWidth: 2000, minHeight: 350, maxHeight: 1400},
                        transom:   {minWidth: 500, maxWidth: 2200, minHeight: 300, maxHeight: 1200},
                        sliding:   {minWidth: 900, maxWidth: 3400, minHeight: 700, maxHeight: 2900}
                    },
                    glassSafety: {
                        fixed:    {maxEdge: 2500, maxAreaM2: 5.2},
                        operable: {maxEdge: 1800, maxAreaM2: 3.0}
                    }
                }
            }
        }
    },
    rehau: {
        label: "REHAU (uPVC)",
        series: {
            synego_80: {
                label: "SYNEGO 80",
                profile: {
                    outerFrame: {left: 80, right: 80, top: 80, bottom: 80},
                    bayFrame:   {left: 52, right: 52, top: 52, bottom: 52},
                    verticalMullion:   54,
                    horizontalMullion: 54,
                    sashOverlap:       16,
                    glassInset:        14
                },
                openingStructureProfiles: {
                    fixed:     {verticalMullion: 52, horizontalMullion: 52, sashOverlap: 12, glassInset: 12},
                    casement:  {verticalMullion: 56, horizontalMullion: 54, sashOverlap: 16, glassInset: 14},
                    tilt_turn: {verticalMullion: 58, horizontalMullion: 56, sashOverlap: 17, glassInset: 14},
                    hopper:    {verticalMullion: 50, horizontalMullion: 52, sashOverlap: 15, glassInset: 13},
                    transom:   {verticalMullion: 50, horizontalMullion: 52, sashOverlap: 13, glassInset: 12},
                    sliding:   {verticalMullion: 46, horizontalMullion: 50, sashOverlap: 10, glassInset: 15}
                },
                validationRules: {
                    window:  {minWidth: 700, maxWidth: 7400, minHeight: 700, maxHeight: 3400, minCntBays: 1, maxCntBays: 8},
                    mullion: {min: 35, max: 130},
                    opening: {
                        fixed:     {minWidth: 300, maxWidth: 2400, minHeight: 300, maxHeight: 2800},
                        casement:  {minWidth: 450, maxWidth: 1100, minHeight: 700, maxHeight: 2500},
                        tilt_turn: {minWidth: 500, maxWidth: 1200, minHeight: 800, maxHeight: 2600},
                        hopper:    {minWidth: 450, maxWidth: 1900, minHeight: 350, maxHeight: 1400},
                        transom:   {minWidth: 450, maxWidth: 2100, minHeight: 300, maxHeight: 1200},
                        sliding:   {minWidth: 700, maxWidth: 2800, minHeight: 700, maxHeight: 2700}
                    },
                    glassSafety: {
                        fixed:    {maxEdge: 2400, maxAreaM2: 4.5},
                        operable: {maxEdge: 1700, maxAreaM2: 2.8}
                    }
                }
            }
        }
    }
};

const defaultManufacturerId = Object.keys(profileSystemCatalog)[0];
const defaultSeriesId = Object.keys(profileSystemCatalog[defaultManufacturerId].series)[0];
let activeProfileSelection = {
    manufacturerId: defaultManufacturerId,
    seriesId: defaultSeriesId
};

function GetSeriesConfig(manufacturerId, seriesId) {
    return profileSystemCatalog[manufacturerId]?.series?.[seriesId] || null;
}

function GetActiveSeriesConfig() {
    const active = GetSeriesConfig(activeProfileSelection.manufacturerId, activeProfileSelection.seriesId);
    return active || profileSystemCatalog[defaultManufacturerId].series[defaultSeriesId];
}

const profile = new Proxy({}, {
    get(_, prop) {
        return GetActiveSeriesConfig().profile[prop];
    }
});

const openingStructureProfiles = new Proxy({}, {
    get(_, prop) {
        return GetActiveSeriesConfig().openingStructureProfiles[prop];
    }
});

const validationRules = new Proxy({}, {
    get(_, prop) {
        return GetActiveSeriesConfig().validationRules[prop];
    }
});

function GetManufacturerIds() {
    return Object.keys(profileSystemCatalog);
}

function GetSeriesIds(manufacturerId) {
    return Object.keys(profileSystemCatalog[manufacturerId]?.series || {});
}

function InitProfileSystemControls() {
    const manufacturerSelect = document.getElementById("manufacturerSelect");
    const profileSeriesSelect = document.getElementById("profileSeriesSelect");
    if (!manufacturerSelect || !profileSeriesSelect) return;

    const manufacturerIds = GetManufacturerIds();
    if (!manufacturerIds.length) return;

    manufacturerSelect.innerHTML = "";
    manufacturerIds.forEach(id => {
        const option = document.createElement("option");
        option.value = id;
        option.textContent = profileSystemCatalog[id].label;
        manufacturerSelect.appendChild(option);
    });

    const savedManufacturer  = localStorage.getItem("profileManufacturer");
    const activeManufacturer = manufacturerIds.includes(savedManufacturer) ? savedManufacturer : manufacturerIds[0];
    manufacturerSelect.value = activeManufacturer;

    PopulateSeriesOptions(activeManufacturer);
    const seriesIds    = GetSeriesIds(activeManufacturer);
    const savedSeries  = localStorage.getItem("profileSeries");
    const activeSeries = seriesIds.includes(savedSeries) ? savedSeries : seriesIds[0];
    profileSeriesSelect.value = activeSeries;
    ApplyProfileSystem(activeManufacturer, activeSeries);

    manufacturerSelect.addEventListener("change", e => {
        const manufacturerId = e.target.value;
        PopulateSeriesOptions(manufacturerId);
        const nextSeries = GetSeriesIds(manufacturerId)[0];
        profileSeriesSelect.value = nextSeries;
        ApplyProfileSystem(manufacturerId, nextSeries);
    });

    profileSeriesSelect.addEventListener("change", e => {
        ApplyProfileSystem(manufacturerSelect.value, e.target.value);
    });
}

function PopulateSeriesOptions(manufacturerId) {
    const profileSeriesSelect = document.getElementById("profileSeriesSelect");
    if (!profileSeriesSelect) return;
    profileSeriesSelect.innerHTML = "";
    GetSeriesIds(manufacturerId).forEach(seriesId => {
        const option = document.createElement("option");
        option.value = seriesId;
        option.textContent = profileSystemCatalog[manufacturerId].series[seriesId].label;
        profileSeriesSelect.appendChild(option);
    });
}

function ApplyProfileSystem(manufacturerId, seriesId) {
    const series = GetSeriesConfig(manufacturerId, seriesId);
    if (!series) return;

    activeProfileSelection = {manufacturerId, seriesId};

    localStorage.setItem("profileManufacturer", manufacturerId);
    localStorage.setItem("profileSeries", seriesId);

    UpdateWindow();
    if (windowModel.selectedBay !== null) {
        showBayControls();
    }
}

const validationIssues  = {};
const globalErrorFields = ["width", "height", "cnt_bays"];
const bayErrorFields    = ["bayWidth", "bayHeight"];

// Window
let windowModel = {
    width:   0,
    height:  0,
    cntBays: 1,
    identicalBays: true,
    bays: [],
    selectedBay: null,
};

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

function GetOpeningLimits(opening) {
    return validationRules.opening[opening] || validationRules.opening.fixed;
}

function GetGlassSafetyLimit(opening) {
    return opening === "fixed" ? validationRules.glassSafety.fixed : validationRules.glassSafety.operable;
}

function GetBayStructureProfile(opening) {
    const baseProfile = openingStructureProfiles.fixed || {};
    const override = openingStructureProfiles[opening] || baseProfile;
    return {
        verticalMullion:   override.verticalMullion ?? baseProfile.verticalMullion ?? 0,
        horizontalMullion: override.horizontalMullion ?? baseProfile.horizontalMullion ?? 0,
        sashOverlap:       override.sashOverlap ?? baseProfile.sashOverlap ?? 0,
        glassInset:        override.glassInset ?? baseProfile.glassInset ?? 0
    };
}

function GetInterBayMullionWidth(index) {
    const left  = windowModel.bays[index];
    const right = windowModel.bays[index + 1];
    if (!left || !right) return GetBayStructureProfile("fixed").verticalMullion;
    const lp = GetBayStructureProfile(left.opening);
    const rp = GetBayStructureProfile(right.opening);
    //return Math.round((lp.verticalMullion + rp.verticalMullion) / 2);
    return (lp.verticalMullion + rp.verticalMullion) / 2;
}

function GetTotalMullionWidth() {
    if (windowModel.bays.length <= 1) return 0;
    let sum = 0;
    for (let i = 0; i < windowModel.bays.length - 1; i++) {
        sum += GetInterBayMullionWidth(i);
    }
    return sum;
}

function GetTotalOverlapAllowance() {
    return windowModel.bays.reduce((sum, bay) => {
        return sum + 2 * GetBayStructureProfile(bay.opening).sashOverlap;
    }, 0);
}

// Show the drawing
function UpdateWindow() {
    GetDimensions();
    if (!ValidateDimensions()) return;
    SyncronizeBays();
    DrawWindow();
    ValidateBayConstraints();
}

function GetDimensions() {
    windowModel.width   = ParseNumberInput("width");
    windowModel.height  = ParseNumberInput("height");
    windowModel.cntBays = ParseNumberInput("cnt_bays");
    windowModel.identicalBays = document.getElementById("identical_bays").checked;
}

function ParseNumberInput(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return Number.NaN;
    const raw = input.value.trim();
    if (raw === "") return Number.NaN;
    return Number(raw);
}

function MarkFieldTouched(inputId) {
    touchedFields[inputId] = true;
}

function HandleDimensionBlurValidation() {
    GetDimensions();
    const hasValidDimensions = ValidateDimensions();
    if (hasValidDimensions && windowModel.selectedBay !== null) {
        ValidateBayConstraints();
    }
}

function ShouldShowFieldError(inputId) {
    return Boolean(touchedFields[inputId]);
}

function ValidateDimensions() {
    const rules = validationRules.window;
    ClearValidationErrors(globalErrorFields);

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

    if (Number.isNaN(windowModel.cntBays) || windowModel.cntBays < rules.minCntBays) {
        if (ShouldShowFieldError("cnt_bays")) {
            SetFieldError("cnt_bays", "error.minCntBays", {min: rules.minCntBays}, {whyKey: "why.hardLimit"});
        }
        valid = false;
    } else if (windowModel.cntBays > rules.maxCntBays) {
        if (ShouldShowFieldError("cnt_bays")) {
            SetFieldError("cnt_bays", "error.maxCntBays", {max: rules.maxCntBays}, {whyKey: "why.hardLimit"});
        }
        valid = false;
    } else if (ShouldShowFieldError("cnt_bays") && windowModel.cntBays >= rules.maxCntBays - 1) {
        SetFieldWarning("cnt_bays", "warning.nearMaxCntBays", {max: rules.maxCntBays}, {whyKey: "why.nearLimit"});
    }

    return valid;
}

function ValidateBayConstraints() {
    ClearValidationErrors(bayErrorFields);
    if (!windowModel.bays.length) return true;

    if (windowModel.selectedBay === null) return true;
    const selected = windowModel.selectedBay;
    const bay = windowModel.bays[selected];
    if (!bay) return true;

    const limits = GetOpeningLimits(bay.opening);
    const profileByOpening = GetBayStructureProfile(bay.opening);
    const bayWidthTouched  = ShouldShowFieldError("bayWidth");
    const bayHeightTouched = ShouldShowFieldError("bayHeight");

    if (bay.width < limits.minWidth) {
        if (bayWidthTouched) {
            SetFieldError("bayWidth", "error.minBayWidth", {min: limits.minWidth, type: translate(bay.opening)}, {whyKey: "why.hardLimit"});
        }
        return false;
    }
    if (bay.width > limits.maxWidth) {
        if (bayWidthTouched) {
            SetFieldError("bayWidth", "error.maxBayWidth", {max: limits.maxWidth, type: translate(bay.opening)}, {whyKey: "why.hardLimit"});
        }
        return false;
    }

    if (bay.height < limits.minHeight) {
        if (bayHeightTouched) {
            SetFieldError("bayHeight", "error.minBayHeight", {min: limits.minHeight, type: translate(bay.opening)}, {whyKey: "why.hardLimit"});
        }
        return false;
    }
    if (bay.height > limits.maxHeight) {
        if (bayHeightTouched) {
            SetFieldError("bayHeight", "error.maxBayHeight", {max: limits.maxHeight, type: translate(bay.opening)}, {whyKey: "why.hardLimit"});
        }
        return false;
    }

    if (profileByOpening.verticalMullion < validationRules.mullion.min ||
        profileByOpening.verticalMullion > validationRules.mullion.max ||
        profileByOpening.horizontalMullion < validationRules.mullion.min ||
        profileByOpening.horizontalMullion > validationRules.mullion.max) {
        if (bayWidthTouched) {
            SetFieldError("bayWidth", "error.mullionRange", {min: validationRules.mullion.min, max: validationRules.mullion.max}, {whyKey: "why.hardLimit"});
        }
        return false;
    }

    const glassW = Math.max(0, bay.glass.width);
    const glassH = Math.max(0, bay.glass.height);
    const glassAreaM2 = (glassW * glassH) / 1000000;
    const glassSafety = GetGlassSafetyLimit(bay.opening);

    if (Math.max(glassW, glassH) > glassSafety.maxEdge) {
        const targetField = glassW >= glassH ? "bayWidth" : "bayHeight";
        if (ShouldShowFieldError(targetField)) {
            SetFieldError(targetField, "error.glassMaxEdge", {max: glassSafety.maxEdge}, {whyKey: "why.hardLimit"});
        }
        return false;
    }

    if (glassAreaM2 > glassSafety.maxAreaM2) {
        if (bayWidthTouched) {
            SetFieldError("bayWidth", "error.glassMaxArea", {max: glassSafety.maxAreaM2.toFixed(2)}, {whyKey: "why.hardLimit"});
        }
        return false;
    }

    if (bayWidthTouched && IsNearUpperLimit(bay.width, limits.maxWidth)) {
        SetWarningIfEmpty("bayWidth", "warning.nearMaxBayWidth", {max: limits.maxWidth}, {whyKey: "why.nearLimit"});
    }
    if (bayHeightTouched && IsNearUpperLimit(bay.height, limits.maxHeight)) {
        SetWarningIfEmpty("bayHeight", "warning.nearMaxBayHeight", {max: limits.maxHeight}, {whyKey: "why.nearLimit"});
    }
    if (bayWidthTouched || bayHeightTouched) {
        const maxGlassEdge = Math.max(glassW, glassH);
        const targetField = glassW >= glassH ? "bayWidth" : "bayHeight";
        if (ShouldShowFieldError(targetField) && IsNearUpperLimit(maxGlassEdge, glassSafety.maxEdge)) {
            SetWarningIfEmpty(targetField, "warning.nearGlassEdge", {max: glassSafety.maxEdge}, {whyKey: "why.nearLimit"});
        }
        if (glassAreaM2 <= glassSafety.maxAreaM2 && glassAreaM2 >= glassSafety.maxAreaM2 * 0.9) {
            const areaField = bayWidthTouched ? "bayWidth" : "bayHeight";
            SetWarningIfEmpty(areaField, "warning.nearGlassArea", {max: glassSafety.maxAreaM2.toFixed(2)}, {whyKey: "why.nearLimit"});
        }
    }

    return true;
}

function SyncronizeBays() {

    const cnt      = windowModel.cntBays;
    const width    = windowModel.width  - profile.outerFrame.left - profile.outerFrame.right;
    const height   = windowModel.height - profile.outerFrame.top  - profile.outerFrame.bottom;
    const oldBays  = windowModel.bays;
    const tempBays = [];
    
    //console.log(`[SyncronizeBays] profile.outerFrame: left=${profile.outerFrame.left}, right=${profile.outerFrame.right}, top=${profile.outerFrame.top}, bottom=${profile.outerFrame.bottom}`);
    
    for (let i = 0; i < cnt; i++) {
        const prev = oldBays[i];
        tempBays.push({
            opening: prev?.opening || "fixed",
            openingDirection: prev?.openingDirection || ""
        });
    }
    windowModel.bays = tempBays;

    const totalMullions = GetTotalMullionWidth();
    const totalOverlap  = GetTotalOverlapAllowance();
    const bayWidth  = (width - totalMullions + totalOverlap) / cnt;

    const firstOpeningProfile = GetBayStructureProfile(tempBays[0]?.opening || "fixed");
    let currentX = profile.outerFrame.left - firstOpeningProfile.sashOverlap;

    windowModel.bays = [];

    for (let i = 0; i < windowModel.cntBays; i++) {

        const bay = {};
        const openingProfile = GetBayStructureProfile(tempBays[i].opening);

        // Bay Outer Frame
        bay.x = currentX;
        bay.y = profile.outerFrame.top - openingProfile.sashOverlap;
        bay.width  = bayWidth;
        bay.height = height + 2 * openingProfile.sashOverlap;
        bay.opening = tempBays[i].opening;
        bay.openingDirection = tempBays[i].openingDirection;

        // Bay Inner Frame
        bay.frame = {x: bay.x + profile.bayFrame.left, y: bay.y + profile.bayFrame.top,
            width:  bay.width  - profile.bayFrame.left - profile.bayFrame.right,
            height: bay.height - profile.bayFrame.top  - profile.bayFrame.bottom
        };

        // Sash (overlaps outward)
        const overlap = openingProfile.sashOverlap;
        bay.sash = {x: bay.x + overlap, y: bay.y + overlap,
            width: bay.width - 2 * overlap, height: bay.height - 2 * overlap
        };

        // Glass (inside sash)
        const inset = openingProfile.glassInset;
        bay.glassInset = {
            x: bay.frame.x - inset, y: bay.frame.y - inset,
            width:  bay.width  - profile.bayFrame.left - profile.bayFrame.right  + 2 * inset,
            height: bay.height - profile.bayFrame.top  - profile.bayFrame.bottom + 2 * inset
        };

        // Clear Glass
        bay.glass = {
            x: bay.frame.x, y: bay.frame.y,
            width:  bay.width  - profile.bayFrame.left - profile.bayFrame.right,
            height: bay.height - profile.bayFrame.top  - profile.bayFrame.bottom
        };

        windowModel.bays.push(bay);
        //console.log(`[SyncronizeBays] bay ${i + 1}: x=${bay.x}, y=${bay.y}, width=${bay.width}, height=${bay.height}`);

        if (i < windowModel.cntBays - 1) {
            const nextProfile = GetBayStructureProfile(tempBays[i + 1].opening);
            //const interMullion = Math.round((openingProfile.verticalMullion + nextProfile.verticalMullion) / 2);
            const interMullion = (openingProfile.verticalMullion + nextProfile.verticalMullion) / 2;
            currentX += bayWidth + interMullion - (overlap + nextProfile.sashOverlap);
        }
    }

    RecalcBays();
}

function DrawWindow() {
    const NS = "http://www.w3.org/2000/svg";
    const dimOffset     = 150;
    const labelOffset   = 50;
    const dimStroke     = 3;
    const arrowHeadSize = 12;
    const addASHeight   = 50;

    const uniqueHeights = [...new Set(windowModel.bays.map(bay => bay.height))].sort((a, b) => a - b);
    const rightRequiredPad = (uniqueHeights.length + 2) * (dimOffset + labelOffset);
    const topRequiredPad = dimOffset + 2 * labelOffset + (isPrintLayoutMode ? 80 : 0);

    let padLeft;
    let padRight;
    let padTop;
    let padBottom;
    if (isPrintLayoutMode) {
        padLeft = 80;
        padRight = rightRequiredPad;
        padTop = topRequiredPad;
        padBottom = 80;
    } else {
        const horizontalPad = Math.max(40, rightRequiredPad);
        const verticalPad = topRequiredPad;
        padLeft = horizontalPad;
        padRight = horizontalPad;
        padTop = verticalPad;
        padBottom = verticalPad;
    }

    const drawingDiv = document.getElementById("drawing");
    document.getElementById("drawing").classList.add("active");
    drawingDiv.style.display = "block";

    const svg = document.getElementById("windowSvg");
    svg.setAttribute(
        "viewBox",
        `${-padLeft} ${-padTop} ${windowModel.width + padLeft + padRight} ${windowModel.height + padTop + padBottom}`
    );
    svg.style.width  = "100%";
    svg.style.height = "100%";
    svg.style.background = cadTheme.background;

    // Clear all old drawing elements
    const oldDrawing = svg.querySelector("#drawingGroup");
    if (oldDrawing) oldDrawing.remove();

    EnsureCadDefs(svg, NS);
    const drawingGroup = CreateNewElement(NS, svg, "g", {id: "drawingGroup"});
    CreateNewElement(NS, drawingGroup, "rect", {class: "cadGridBackground",
        x: -padLeft,
        y: -padTop,
        width: windowModel.width + padLeft + padRight,
        height: windowModel.height + padTop + padBottom,
        fill: "url(#cadGridMajor)"
    });

    // Outer Full Window Frame
    CreateNewElement(NS, drawingGroup, "rect", {class: "windowFrame",
        x: 0, y: 0, width: windowModel.width, height: windowModel.height,
        fill: "none", stroke: cadTheme.frameMain, "stroke-width": "12"
    });
    // Inner Full Window Frame
    CreateNewElement(NS, drawingGroup, "rect", {class: "windowFrame",
        x: profile.outerFrame.left, y: profile.outerFrame.top,
        width: (windowModel.width - profile.outerFrame.left - profile.outerFrame.right),
        height: (windowModel.height - profile.outerFrame.top - profile.outerFrame.bottom),
        fill: "none", stroke: cadTheme.frameSecondary, "stroke-width": "4"
    });
    // Mullions
    windowModel.bays.forEach((bay, index) => {
        if (index === 0) return;
        const interIndex = index - 1;
        const mullionWidth = GetInterBayMullionWidth(interIndex);
        const rightProfile = GetBayStructureProfile(bay.opening);
        const mullionX = bay.x + rightProfile.sashOverlap - mullionWidth;
        const openingY = profile.outerFrame.top;
        const openingHeight = windowModel.height - profile.outerFrame.top - profile.outerFrame.bottom;
        CreateNewElement(NS, drawingGroup, "rect", {class: "mullion",
            x: mullionX, y: openingY,
            width: mullionWidth, height: openingHeight,
            fill: "none", stroke: cadTheme.mullion, "stroke-width": "4"});
    });
    // Bay Outer Frame
    windowModel.bays.forEach((bay, index) => {
        CreateNewElement(NS, drawingGroup, "rect", {class: "bay",
            x: bay.x, y: bay.y,
            width: bay.width, height: bay.height,
            fill: "none", stroke: cadTheme.frameMain, "stroke-width": 10});
    });
    // Bay Inner Frame (optional secondary line):
    // windowModel.bays.forEach(bay => {
    //     CreateNewElement(NS, drawingGroup, "rect", {class: "bay",
    //         x: bay.frame.x, y: bay.frame.y,
    //         width: bay.frame.width, height: bay.frame.height,
    //         fill: "none", stroke: cadTheme.frameMain, "stroke-width": 10});
    // });
    // Bay Sash
    windowModel.bays.forEach(bay => {
        CreateNewElement(NS, drawingGroup, "rect", {class: "baySash",
            x: bay.sash.x, y: bay.sash.y,
            width: bay.sash.width, height: bay.sash.height,
            fill: "none", stroke: cadTheme.frameSecondary, "stroke-width": 2});
    });
    // Glass inset
    windowModel.bays.forEach(bay => {
        CreateNewElement(NS, drawingGroup, "rect", {class: "glassInset",
            x: bay.glassInset.x, y: bay.glassInset.y,
            width: bay.glassInset.width, height: bay.glassInset.height,
            fill: "none", stroke: cadTheme.glassStroke, "stroke-width": 3});
    });
    // Glass
    windowModel.bays.forEach((bay, index) => {
        CreateNewElement(NS, drawingGroup, "rect", {class: "glass",
           x: bay.glass.x, y: bay.glass.y,
            width: bay.glass.width, height: bay.glass.height,
            fill: cadTheme.glassFill,
            stroke: windowModel.selectedBay === index ? cadTheme.selected : cadTheme.frameMain,
            "stroke-width": windowModel.selectedBay === index ? 12 : 10,
            cursor: "pointer"}).addEventListener("click", () => SelectBay(index))

        DrawOpeningSymbol(NS, drawingGroup, bay);
    });
        
    // Arrow marker setup
    const marker = document.getElementById("arrow");
    marker.setAttribute("markerWidth",  arrowHeadSize);
    marker.setAttribute("markerHeight", arrowHeadSize);
    marker.setAttribute("refX", arrowHeadSize);
    marker.setAttribute("refY", arrowHeadSize / 2);
    marker.querySelector("path").setAttribute("d", `M0,0 L${arrowHeadSize},${arrowHeadSize / 2} L0,${arrowHeadSize} Z`);
    marker.querySelector("path").setAttribute("fill", cadTheme.dimension);

    // Full-width Arrows
    // Horizontal Arrow (Window Width)
    CreateArrow(NS, drawingGroup, "H", 0, -(dimOffset + labelOffset), windowModel.width, -(dimOffset + labelOffset), windowModel.width / 2, -(dimOffset + 2 * labelOffset), windowModel.width);
    // Arrow Stoppers
    CreateNewElement(NS, drawingGroup, "line", {x1: 0, y1: 0, x2: 0, y2: -(dimOffset + labelOffset + addASHeight), stroke: cadTheme.dimension, "stroke-width": dimStroke});
    CreateNewElement(NS, drawingGroup, "line", {x1: windowModel.width, y1: 0, x2: windowModel.width, y2: -(dimOffset + labelOffset + addASHeight), stroke: cadTheme.dimension, "stroke-width": dimStroke});
    // Vertical arrow (Window Height)
    const fullHeightLabelX = windowModel.width + (uniqueHeights.length + 1) * (dimOffset / 2 + labelOffset) + labelOffset / 6;
    const fullHeightArrowX = fullHeightLabelX - labelOffset;
    const fullHeightStopperEndX = fullHeightArrowX + addASHeight;
    CreateArrow(NS, drawingGroup, "V", fullHeightArrowX, 0, fullHeightArrowX, windowModel.height, fullHeightLabelX, windowModel.height / 2, windowModel.height);
    // Arrow Stoppers
    CreateNewElement(NS, drawingGroup, "line", {x1: windowModel.width, y1: 0, x2: fullHeightStopperEndX, y2: 0, stroke: cadTheme.dimension, "stroke-width": dimStroke});
    CreateNewElement(NS, drawingGroup, "line", {x1: windowModel.width, y1: windowModel.height, x2: fullHeightStopperEndX, y2: windowModel.height, stroke: cadTheme.dimension, "stroke-width": dimStroke});
    // Width Window Panels Arrows below full-width Arrow
    windowModel.bays.forEach((bay) => {
        const x1 = bay.x;
        const x2 = bay.x + bay.width;
        CreateArrow(NS, drawingGroup, "H", x1, -dimOffset / 2, x2, -dimOffset / 2, (x1 + x2) / 2, -(dimOffset / 2 + labelOffset), Math.round(bay.width));
        CreateNewElement(NS, drawingGroup, "line", {x1: x1, y1: bay.y, x2: x1, y2: -(dimOffset / 2 + addASHeight), stroke: cadTheme.dimension, "stroke-width": dimStroke});
        CreateNewElement(NS, drawingGroup, "line", {x1: x2, y1: bay.y, x2: x2, y2: -(dimOffset / 2 + addASHeight), stroke: cadTheme.dimension, "stroke-width": dimStroke});
    });
    // Height Window Panels Arrow before the full-height Arrow
    uniqueHeights.forEach((h, index) => {
        let k = 0;
        const arrowX = windowModel.width + (index + 1) * (dimOffset / 2 + labelOffset) + labelOffset / 6;
        const stopperEndX = arrowX - labelOffset + addASHeight;
        windowModel.bays.forEach((bay) => {
            if (bay.height === h) {
                k++;
                const x1 = bay.x + bay.width;
                const x2 = stopperEndX;
                const y1 = bay.y;
                const y2 = bay.y + bay.height;
                if (k === 1) {
                    const x = arrowX;
                    const y = bay.y + bay.height / 2;
                    CreateArrow(NS, drawingGroup, "V", x - labelOffset, y1, x - labelOffset, y2, x, y, Math.round(bay.height));
                }
                CreateNewElement(NS, drawingGroup, "line", {x1: x1, y1: y1, x2: x2, y2: y1, stroke: cadTheme.dimension, "stroke-width": dimStroke});
                CreateNewElement(NS, drawingGroup, "line", {x1: x1, y1: y2, x2: x2, y2: y2, stroke: cadTheme.dimension, "stroke-width": dimStroke});
            }
        });
    });

    RenderSpecification();
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
    const strokeWidth = 4;
    const fontSize = 70;
    const fill = cadTheme.dimension;

    CreateNewElement(NS, parent, "line", { x1: x1, y1: y1, x2: x2, y2: y2,
        stroke: stroke, "stroke-width": strokeWidth, "marker-start": "url(#arrow)", "marker-end": "url(#arrow)"
    });
    
    let labelAttrs = { x: x, y: y,
        "font-size": fontSize, fill: fill, "text-anchor": "middle", "dominant-baseline": "middle"
    };

    if (direction === "V") { labelAttrs["transform"] = `rotate(-90 ${x} ${y})`; }
    labelAttrs["cursor"] = "pointer";
    CreateNewElement(NS, parent, "text", labelAttrs, `${Math.round(label)} mm`);
}

function SelectBay(index) {
    windowModel.selectedBay = index;
    showBayControls();
    RecalcBays();
    DrawWindow();
    ValidateBayConstraints();
}

function showBayControls() {
    const bay = windowModel.bays[windowModel.selectedBay];
    if (!bay) return;
    document.getElementById("bayControls").hidden = (windowModel.selectedBay === null);
    document.getElementById("bayWidth").value     = Math.round(bay.width);
    document.getElementById("bayHeight").value    = Math.round(bay.height);
    document.getElementById("openingType").value  = bay.opening;
    UpdateOpeningDirectionControl();
    document.getElementById("openingDirection").value = bay.openingDirection || "";
    const locked = document.getElementById("identical_bays").checked;
    document.getElementById("identicalBayWidth").classList.toggle("hidden",  locked);
    document.getElementById("identicalBayHeight").classList.toggle("hidden", locked);
    document.getElementById("bayWidthError").classList.toggle("hidden", locked);
    document.getElementById("bayHeightError").classList.toggle("hidden", locked);
    ValidateBayConstraints();
    //console.log("width x1: ", x1);
}

function RecalcBays() {
    if (windowModel.bays.length === 0) return;
    let currentX = profile.outerFrame.left - GetBayStructureProfile(windowModel.bays[0].opening).sashOverlap;

    windowModel.bays.forEach((bay, i) => {
        const bayProfile      = GetBayStructureProfile(bay.opening);
        bay.verticalMullion   = bayProfile.verticalMullion;
        bay.horizontalMullion = bayProfile.horizontalMullion;
        bay.sashOverlap       = bayProfile.sashOverlap;
        bay.glassInsetValue   = bayProfile.glassInset;

        // Bay Outer Frame
        bay.x = currentX;
        bay.y = profile.outerFrame.top - bayProfile.sashOverlap;
        if (i === windowModel.bays.length - 1) {
            const targetRight = windowModel.width - profile.outerFrame.right + bayProfile.sashOverlap;
            bay.width = Math.max(0, targetRight - bay.x);
        }
        // Bay Inner Frame
        bay.frame = {x: bay.x + profile.bayFrame.left, y: bay.y + profile.bayFrame.top,
            width:  bay.width  - profile.bayFrame.left - profile.bayFrame.right,
            height: bay.height - profile.bayFrame.top  - profile.bayFrame.bottom
        };

        // Sash (overlaps outward)
        const overlap = bayProfile.sashOverlap;
        bay.sash = {x: bay.x + overlap, y: bay.y + overlap,
            width: bay.width - 2 * overlap, height: bay.height - 2 * overlap
        };

        // Glass (inside sash)
        const inset = bayProfile.glassInset;
        bay.glassInset = {
            x: bay.frame.x - inset, y: bay.frame.y - inset,
            width:  bay.width  - profile.bayFrame.left - profile.bayFrame.right  + 2 * inset,
            height: bay.height - profile.bayFrame.top  - profile.bayFrame.bottom + 2 * inset
        };

        // Clear Glass
        bay.glass = {
            x: bay.frame.x, y: bay.frame.y,
            width:  bay.width  - profile.bayFrame.left - profile.bayFrame.right,
            height: bay.height - profile.bayFrame.top  - profile.bayFrame.bottom
        };

        if (i < windowModel.bays.length - 1) {
            const nextBay = windowModel.bays[i + 1];
            const nextOverlap = GetBayStructureProfile(nextBay.opening).sashOverlap;
            const interMullion = GetInterBayMullionWidth(i);
            currentX += bay.width + interMullion - (overlap + nextOverlap);
        }
    });

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

function DrawOpeningSymbol(NS, parent, bay) {
    const cx     = bay.glass.x + bay.glass.width / 2;
    const cy     = bay.glass.y + bay.glass.height / 2;
    const margin = Math.max(18, Math.min(bay.glass.width, bay.glass.height) * 0.12);
    const left   = bay.glass.x + margin;
    const right  = bay.glass.x + bay.glass.width - margin;
    const top    = bay.glass.y + margin;
    const bottom = bay.glass.y + bay.glass.height - margin;

    const lineAttrs = {stroke: cadTheme.opening, "stroke-width": 4, fill: "none", "stroke-linecap": "round"};
    const direction = bay.openingDirection || "";
    const pathD = {
        fixed: `M${cx},${top} L${cx},${bottom} M${right},${cy} L${left},${cy}`,
        casement: direction === "left_to_right"
            ? `M${right},${top} L${left},${cy}  L${right},${bottom} L${right},${top}`
            : `M${left},${top}  L${right},${cy} L${left},${bottom}  L${left},${top}`,
        hopper: direction === "top_to_bottom"
            ? `M${cx},${top}    L${left},${bottom} L${right},${bottom} L${cx},${top}`
            : `M${cx},${bottom} L${left},${top}    L${right},${top}    L${cx},${bottom}`,
        transom: direction === "bottom_to_top"
            ? `M${left},${bottom} L${right},${bottom} L${cx},${top}`
            : `M${left},${top}    L${right},${top}    L${cx},${bottom}`,
        tilt_turn: direction === "left_to_right"
            ? `M${right},${top} L${left},${cy}  L${right},${bottom} L${right},${top} M${right},${bottom} L${cx},${top} L${left},${bottom}  L${right},${bottom}`
            : `M${left},${top}  L${right},${cy} L${left},${bottom}  L${left},${top}  M${left},${bottom}  L${cx},${top} L${right},${bottom} L${left},${bottom}`,
        sliding: direction === "right_to_left"
            ? `M${left},${cy} L${right},${cy} M${left + margin},${cy - margin / 2}  L${left},${cy}  L${left + margin},${cy + margin / 2}`
            : `M${left},${cy} L${right},${cy} M${right - margin},${cy - margin / 2} L${right},${cy} L${right - margin},${cy + margin / 2}`
    };

    const d = pathD[bay.opening] || pathD.fixed;
    CreateNewElement(NS, parent, "path", {...lineAttrs, d: d});
}

function UpdateOpeningDirectionControl() {
    const row = document.getElementById("openingDirectionRow");
    const select = document.getElementById("openingDirection");
    if (!row || !select || windowModel.selectedBay === null) return;

    const bay = windowModel.bays[windowModel.selectedBay];
    const directions = openingDirectionOptions[bay.opening] || [];
    row.classList.toggle("hidden", directions.length === 0);

    select.innerHTML = "";
    directions.forEach(value => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = translate(value);
        select.appendChild(option);
    });

    if (directions.length === 0) {
        bay.openingDirection = "";
        return;
    }

    if (!directions.includes(bay.openingDirection)) {
        bay.openingDirection = directions[0];
    }
}

function RenderSpecification() {
    const tbody = document.getElementById("specTableBody");
    if (!tbody) return;
    tbody.innerHTML = "";

    const hasVerticalMullion = windowModel.bays.length > 1 &&
        windowModel.bays.some(bay => GetBayStructureProfile(bay.opening).verticalMullion > 0);
    // Current model has no horizontal split members; keep this conditional for future extension.
    const hasHorizontalMullion = windowModel.bays.some(bay => bay.hasHorizontalMullion === true);

    windowModel.bays.forEach((bay, index) => {
        const profileByOpening = GetBayStructureProfile(bay.opening);
        const row = document.createElement("tr");

        const directionText = bay.openingDirection ? translate(bay.openingDirection) : "—";
        const windowFrameSpec = `${profile.outerFrame.left}/${profile.outerFrame.right}/${profile.outerFrame.top}/${profile.outerFrame.bottom}`;
        const bayFrameSpec = `${profile.bayFrame.left}/${profile.bayFrame.right}/${profile.bayFrame.top}/${profile.bayFrame.bottom}`;
        const columns = [
            {key: "bay",               value: String(index + 1),                          className: "spec-col-tight"},
            {key: "opening",           value: translate(bay.opening),                     className: "spec-col-tight"},
            {key: "direction",         value: directionText,                              className: "spec-col-tight"},
            {key: "width",             value: String(Math.round(bay.width)),              className: "spec-col-tight"},
            {key: "height",            value: String(Math.round(bay.height)),             className: "spec-col-tight"},
            {key: "windowFrame",       value: windowFrameSpec},
            {key: "bayFrame",          value: bayFrameSpec},
            {key: "verticalMullion",   value: String(profileByOpening.verticalMullion),   className: "spec-col-vertical-mullion"},
            {key: "horizontalMullion", value: String(profileByOpening.horizontalMullion), className: "spec-col-horizontal-mullion"},
            {key: "sashOverlap",       value: String(profileByOpening.sashOverlap)},
            {key: "glassInset",        value: String(profileByOpening.glassInset)}
        ];

        columns.forEach(({value, className}) => {
            const cell = document.createElement("td");
            cell.textContent = value;
            if (className) cell.classList.add(className);
            row.appendChild(cell);
        });

        tbody.appendChild(row);
    });

    document.querySelectorAll(".spec-col-vertical-mullion").forEach(el => {
        el.classList.toggle("hidden", !hasVerticalMullion);
    });
    document.querySelectorAll(".spec-col-horizontal-mullion").forEach(el => {
        el.classList.toggle("hidden", !hasHorizontalMullion);
    });
}
