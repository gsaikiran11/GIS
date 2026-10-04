// ============================================================
// 🎨 DYNAMIC LAYER STYLE EDITOR (v2.5)
// QGIS2WEB + OPENLAYERS  —  SINGLE FILE, DROP-IN
//
// v2.5 CHANGELOG
//  ✔ Mobile Width Constraint & Auto-Centering — Floating centered card layout on mobile
//  ✔ Dynamic Max-Height Engine — Automatically limits panel height to fit the screen
//  ✔ Pinned Header & Footer — "Apply & Save" remains permanently visible
//  ✔ Custom styled vertical scrollbars added to panel body & category list
//  ✔ Style Property Overrides — Bypass stylesheet !important rules
//  ✔ Self-registers with MapToolManager (drag + hide + persist)
//  ✔ NO inline position in CSS — Tool Manager controls all
//  ✔ Panel auto-follows the button wherever you drag it
//  ✔ Compact mobile-first UI (collapsible sections)
//  ✔ Touch-friendly controls (larger tap targets)
//  ✔ Closes on maptool:editmode / maptool:visibility / ESC
//  ✔ Click-outside closes the panel
// ============================================================

(function () {
    "use strict";

    /* ========================================================
       1. CONFIGURATION
       ======================================================== */
    var CONFIG = {
        toolId:   "style-btn",
        toolName: "Style Editor",
        toolIcon: "🎨",

        buttonId: "dynamic-style-open-button",
        panelId:  "dynamic-style-editor-panel",

        btnSize:   40,
        panelWidth: 310,
        panelGap:  8,

        defaults: { top: 236, left: 12 },

        storageKey: "QGIS2WEB_DYNAMIC_LAYER_STYLES_V2"
    };

    if (typeof ol === "undefined") {
        console.error("🎨 Style Editor: OpenLayers (ol) not found.");
        return;
    }

    /* ========================================================
       2. STATE
       ======================================================== */
    var mapRef = null;
    var button = null;
    var panel = null;
    var panelOpen = false;
    var currentLayer = null;

    var el = {};  // All form field references

    /* ========================================================
       3. TOOL MANAGER REGISTRATION
       ======================================================== */
    function registerWithToolManager() {
        var descriptor = {
            id:       CONFIG.toolId,
            name:     CONFIG.toolName,
            icon:     CONFIG.toolIcon,
            selector: "#" + CONFIG.buttonId,
            defaults: CONFIG.defaults,
            visible:  true
        };

        window.MapToolRegistry = window.MapToolRegistry || [];
        var exists = window.MapToolRegistry.some(function (c) {
            return c.id === descriptor.id;
        });
        if (!exists) window.MapToolRegistry.push(descriptor);

        if (window.MapToolManager && window.MapToolManager.register) {
            window.MapToolManager.register(descriptor);
        }
    }

    /* ========================================================
       4. STORAGE
       ======================================================== */
    function getSavedStyles() {
        try {
            var saved = localStorage.getItem(CONFIG.storageKey);
            return saved ? JSON.parse(saved) : {};
        } catch (e) { return {}; }
    }

    function saveAllStyles(styles) {
        try { localStorage.setItem(CONFIG.storageKey, JSON.stringify(styles)); }
        catch (e) {}
    }

    /* ========================================================
       5. MAP + LAYERS
       ======================================================== */
    function getMap() {
        if (mapRef) return mapRef;
        if (typeof map !== "undefined" && map && typeof map.getLayers === "function") {
            mapRef = map; return mapRef;
        }
        if (window.map && typeof window.map.getLayers === "function") {
            mapRef = window.map; return mapRef;
        }
        return null;
    }

    function getLayerName(layer) {
        if (!layer) return "Layer";
        return layer.get("popuplayertitle") || layer.get("title") ||
               layer.get("name") || layer.get("layerName") || "Layer";
    }

    function getLayerKey(layer) {
        var name = getLayerName(layer);
        var source = layer.getSource();
        var url = "";
        if (source && typeof source.getUrl === "function") {
            try { url = source.getUrl() || ""; } catch (e) {}
        }
        return name + "|" + url;
    }

    function getVectorLayers() {
        var m = getMap();
        if (!m) return [];

        var layers = [];
        var seen = [];

        m.getLayers().forEach(function (layer) {
            if (!(layer instanceof ol.layer.Vector || layer instanceof ol.layer.VectorImage)) return;

            var excluded = [
                "featureOverlay", "measureLayer", "geolocateOverlay",
                "stage14MeasureLayer", "stage14SnapLayer"
            ];
            var title = getLayerName(layer);
            if (excluded.indexOf(title) !== -1) return;

            var source = layer.getSource();
            if (!source || typeof source.getFeatures !== "function") return;
            var features = source.getFeatures();
            if (!features || !features.length) return;

            if (!title || title === "Layer") return;

            // Dedupe
            var duplicate = false;
            for (var i = 0; i < seen.length; i++) {
                if (seen[i].layer === layer) { duplicate = true; break; }
                if (seen[i].layer.getSource() === source && getLayerName(seen[i].layer) === title) {
                    duplicate = true; break;
                }
            }
            if (duplicate) return;

            seen.push({ layer: layer });
            layers.push(layer);
        });

        return layers;
    }

    function getLayerFields(layer) {
        var fields = [];
        if (!layer || !layer.getSource()) return fields;

        var features = layer.getSource().getFeatures();
        if (!features.length) return fields;

        features.some(function (feature) {
            var props = feature.getProperties();
            Object.keys(props).forEach(function (key) {
                if (key !== "geometry" && key !== "layerObject" && key !== "idO") {
                    if (fields.indexOf(key) === -1) fields.push(key);
                }
            });
            return fields.length > 0;
        });

        return fields.sort();
    }

    function getUniqueValues(layer, field) {
        var values = [];
        if (!layer || !layer.getSource() || !field) return values;

        var features = layer.getSource().getFeatures();
        var map = {};

        features.forEach(function (f) {
            var v = f.get(field);
            if (v !== undefined && v !== null && String(v).trim() !== "") {
                var t = String(v);
                if (!map[t]) { map[t] = true; values.push(t); }
            }
        });

        return values.sort(function (a, b) {
            return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
        });
    }

    /* ========================================================
       6. COLORS
       ======================================================== */
    function randomColor(index) {
        var colors = [
            "#e6194b", "#3cb44b", "#ffe119", "#4363d8", "#f58231",
            "#911eb4", "#46f0f0", "#f032e6", "#bcf60c", "#fabebe",
            "#008080", "#e6beff", "#9a6324", "#fffac8", "#800000",
            "#aaffc3", "#808000", "#ffd8b1", "#000075", "#808080",
            "#42d4f4", "#bfef45", "#469990", "#dcbeff", "#9A6324"
        ];
        return colors[index % colors.length];
    }

    function hexToRgba(hex, opacity) {
        if (!hex) hex = "#ffffff";
        hex = hex.replace("#", "");
        if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
        var r = parseInt(hex.substring(0, 2), 16);
        var g = parseInt(hex.substring(2, 4), 16);
        var b = parseInt(hex.substring(4, 6), 16);
        return "rgba(" + r + "," + g + "," + b + "," + opacity + ")";
    }

    /* ========================================================
       7. CSS INJECTION (With Custom Scrollbars)
       ======================================================== */
    function injectCSS() {
        if (document.getElementById("dynamic-style-css-v2")) return;

        var css = document.createElement("style");
        css.id = "dynamic-style-css-v2";
        css.textContent = '\
\
/* ============ BUTTON ============ */\
#' + CONFIG.buttonId + ' {\
    position: fixed;\
    top: ' + CONFIG.defaults.top + 'px;\
    left: ' + CONFIG.defaults.left + 'px;\
    right: auto;\
    bottom: auto;\
\
    width: ' + CONFIG.btnSize + 'px;\
    height: ' + CONFIG.btnSize + 'px;\
    min-width: ' + CONFIG.btnSize + 'px;\
    min-height: ' + CONFIG.btnSize + 'px;\
\
    padding: 0;\
    margin: 0;\
\
    border: 1px solid var(--ui-border, #d7dce3);\
    border-radius: var(--ui-radius-sm, 7px);\
    background: var(--ui-bg, #fff);\
    color: var(--ui-text, #1d2430);\
    box-shadow: var(--ui-shadow-sm, 0 1px 4px rgba(16,24,40,.16));\
\
    cursor: pointer;\
    z-index: 17000;\
\
    display: flex;\
    align-items: center;\
    justify-content: center;\
\
    font-size: 18px;\
    line-height: 1;\
\
    box-sizing: border-box;\
    -webkit-tap-highlight-color: transparent;\
\
    transition: background .15s ease, border-color .15s ease;\
}\
\
#' + CONFIG.buttonId + ':hover {\
    background: var(--ui-bg-hover, #eef1f5);\
    border-color: var(--ui-accent, #1f6feb);\
}\
\
#' + CONFIG.buttonId + '.dse-open {\
    background: var(--ui-accent, #1f6feb);\
    border-color: var(--ui-accent, #1f6feb);\
    color: #fff;\
}\
\
body.drag-edit-mode #' + CONFIG.buttonId + ',\
body.drag-edit-mode #' + CONFIG.buttonId + ':hover,\
#' + CONFIG.buttonId + '.is-dragging {\
    transform: none !important;\
}\
\
\
/* ============ PANEL (Flexbox Container) ============ */\
#' + CONFIG.panelId + ' {\
    position: fixed;\
    top: ' + CONFIG.defaults.top + 'px;\
    left: ' + (CONFIG.defaults.left + CONFIG.btnSize + CONFIG.panelGap) + 'px;\
    right: auto;\
    bottom: auto;\
\
    width: ' + CONFIG.panelWidth + 'px;\
    max-width: calc(100vw - 24px);\
    max-height: calc(100vh - 24px);\
\
    overflow: hidden;\
\
    background: var(--ui-bg, #fff);\
    border: 1px solid var(--ui-border, #d7dce3);\
    border-radius: var(--ui-radius, 10px);\
    box-shadow: 0 8px 32px rgba(0,0,0,.25);\
\
    font-family: var(--ui-font, "Segoe UI", Roboto, system-ui, sans-serif);\
    font-size: 12px;\
    color: var(--ui-text, #1d2430);\
\
    z-index: 53000;\
    display: none;\
    flex-direction: column;\
    box-sizing: border-box;\
}\
\
#' + CONFIG.panelId + '.dse-visible {\
    display: flex;\
    animation: dse-fade .16s ease;\
}\
\
@keyframes dse-fade {\
    from { opacity: 0; transform: translateY(6px); }\
    to   { opacity: 1; transform: translateY(0); }\
}\
\
#' + CONFIG.panelId + ' * { box-sizing: border-box; }\
\
\
/* ============ HEADER ============ */\
.dse-head {\
    display: flex;\
    align-items: center;\
    justify-content: space-between;\
    gap: 8px;\
    padding: 10px 12px;\
    background: linear-gradient(135deg, #263238, #37474f);\
    color: #fff;\
    flex-shrink: 0;\
    border-radius: var(--ui-radius, 10px) var(--ui-radius, 10px) 0 0;\
}\
\
.dse-title { font-size: 13px; font-weight: 700; }\
.dse-subtitle { font-size: 10px; opacity: .7; margin-top: 1px; }\
\
.dse-close {\
    width: 26px; height: 26px; flex-shrink: 0;\
    border: none; border-radius: 5px;\
    background: rgba(255,255,255,.15);\
    color: #fff; font-size: 17px; line-height: 1;\
    cursor: pointer;\
    display: flex; align-items: center; justify-content: center;\
}\
\
.dse-close:hover { background: rgba(255,255,255,.3); }\
\
\
/* ============ BODY & CUSTOM SCROLLBAR ============ */\
.dse-body {\
    padding: 10px;\
    overflow-y: auto;\
    -webkit-overflow-scrolling: touch;\
    flex: 1;\
    min-height: 0;\
}\
\
.dse-body::-webkit-scrollbar {\
    width: 6px !important;\
}\
\
.dse-body::-webkit-scrollbar-track {\
    background: rgba(0, 0, 0, 0.02) !important;\
    border-radius: 3px !important;\
}\
\
.dse-body::-webkit-scrollbar-thumb {\
    background: var(--ui-border-strong, #aeb6c2) !important;\
    border-radius: 3px !important;\
}\
\
.dse-body::-webkit-scrollbar-thumb:hover {\
    background: var(--ui-accent, #1f6feb) !important;\
}\
\
.dse-body label {\
    display: block;\
    font-size: 10.5px;\
    font-weight: 700;\
    margin: 0 0 3px;\
    color: var(--ui-text-muted, #5b6472);\
    text-transform: uppercase;\
    letter-spacing: .3px;\
}\
\
.dse-body select,\
.dse-body input[type="number"],\
.dse-body input[type="text"] {\
    width: 100%;\
    height: 30px;\
    padding: 4px 7px;\
    margin-bottom: 7px;\
    border: 1px solid var(--ui-border, #d7dce3);\
    border-radius: var(--ui-radius-sm, 7px);\
    background: var(--ui-bg-subtle, #f5f7fa);\
    color: var(--ui-text, #1d2430);\
    font-family: inherit;\
    font-size: 11px;\
    outline: none;\
}\
\
.dse-body input[type="color"] {\
    width: 100%;\
    height: 30px;\
    padding: 2px;\
    margin-bottom: 7px;\
    border: 1px solid var(--ui-border, #d7dce3);\
    border-radius: var(--ui-radius-sm, 7px);\
    background: var(--ui-bg, #fff);\
    cursor: pointer;\
}\
\
.dse-body select:focus,\
.dse-body input:focus {\
    border-color: var(--ui-accent, #1f6feb);\
    box-shadow: 0 0 0 3px var(--ui-accent-soft, rgba(31,111,235,.12));\
}\
\
\
/* ============ SECTIONS (COLLAPSIBLE) ============ */\
.dse-sec {\
    margin-bottom: 8px;\
    border: 1px solid var(--ui-border-soft, #e5e7eb);\
    border-radius: var(--ui-radius-sm, 7px);\
    background: var(--ui-bg-subtle, #fafafa);\
    overflow: hidden;\
}\
\
.dse-sec-head {\
    display: flex;\
    align-items: center;\
    justify-content: space-between;\
    padding: 7px 10px;\
    font-size: 11.5px;\
    font-weight: 700;\
    color: var(--ui-text, #263238);\
    background: var(--ui-bg-subtle, #f0f4f7);\
    cursor: pointer;\
    user-select: none;\
    transition: background .13s ease;\
    border-bottom: 1px solid transparent;\
}\
\
.dse-sec-head:hover { background: var(--ui-bg-hover, #e3e9ee); }\
\
.dse-sec.open .dse-sec-head { border-bottom-color: var(--ui-border-soft, #e5e7eb); }\
\
.dse-sec-caret {\
    font-size: 10px;\
    transition: transform .2s ease;\
    opacity: .6;\
}\
\
.dse-sec.open .dse-sec-caret { transform: rotate(90deg); }\
\
.dse-sec-body {\
    display: none;\
    padding: 10px;\
}\
\
.dse-sec.open .dse-sec-body { display: block; }\
\
\
/* ============ TWO-COLUMN LAYOUT ============ */\
.dse-grid {\
    display: grid;\
    grid-template-columns: 1fr 1fr;\
    gap: 7px;\
}\
\
.dse-grid > div { min-width: 0; }\
\
\
/* ============ RANGE ============ */\
.dse-range-row {\
    display: flex;\
    align-items: center;\
    gap: 7px;\
    margin-bottom: 7px;\
}\
\
.dse-range-row input[type="range"] {\
    flex: 1;\
    height: 4px;\
}\
\
.dse-range-row span {\
    width: 36px;\
    text-align: right;\
    font-size: 10.5px;\
    font-weight: 700;\
    color: var(--ui-text-muted, #5b6472);\
}\
\
\
/* ============ CHECKBOX ============ */\
.dse-check {\
    display: flex !important;\
    align-items: center;\
    gap: 7px;\
    cursor: pointer;\
    margin: 0 0 8px !important;\
    font-size: 11.5px !important;\
    font-weight: 500 !important;\
    text-transform: none !important;\
    letter-spacing: 0 !important;\
    color: var(--ui-text, #1d2430) !important;\
}\
\
.dse-check input {\
    width: auto !important;\
    height: auto !important;\
    margin: 0 !important;\
    cursor: pointer;\
}\
\
\
/* ============ CATEGORY ROWS & SCROLLBAR ============ */\
.dse-cat-list {\
    max-height: 180px;\
    overflow-y: auto;\
    margin-top: 6px;\
    padding: 4px;\
    background: var(--ui-bg, #fff);\
    border: 1px solid var(--ui-border-soft, #e5e7eb);\
    border-radius: var(--ui-radius-sm, 7px);\
}\
\
.dse-cat-list::-webkit-scrollbar {\
    width: 5px !important;\
}\
\
.dse-cat-list::-webkit-scrollbar-track {\
    background: rgba(0, 0, 0, 0.01) !important;\
}\
\
.dse-cat-list::-webkit-scrollbar-thumb {\
    background: var(--ui-border-strong, #aeb6c2) !important;\
    border-radius: 3px !important;\
}\
\
.dse-cat-row {\
    display: flex;\
    align-items: center;\
    justify-content: space-between;\
    gap: 7px;\
    margin-bottom: 3px;\
    padding: 4px 6px;\
    background: var(--ui-bg-subtle, #f5f7fa);\
    border-radius: 4px;\
}\
\
.dse-cat-row:last-child { margin-bottom: 0; }\
\
.dse-cat-name {\
    flex: 1;\
    overflow: hidden;\
    text-overflow: ellipsis;\
    white-space: nowrap;\
    font-size: 11px;\
    font-weight: 500;\
    color: var(--ui-text, #1d2430);\
}\
\
.dse-cat-color {\
    width: 36px !important;\
    height: 24px !important;\
    flex-shrink: 0;\
    margin: 0 !important;\
    padding: 1px !important;\
    border-radius: 4px !important;\
}\
\
\
/* ============ FOOTER BUTTONS ============ */\
.dse-footer {\
    display: flex;\
    gap: 6px;\
    padding: 10px;\
    border-top: 1px solid var(--ui-border-soft, #e5e7eb);\
    background: var(--ui-bg-subtle, #f5f7fa);\
    flex-shrink: 0;\
}\
\
.dse-btn {\
    flex: 1;\
    height: 34px;\
    border: 1px solid var(--ui-border, #d7dce3);\
    border-radius: var(--ui-radius-sm, 7px);\
    background: var(--ui-bg, #fff);\
    color: var(--ui-text, #374151);\
    font-family: inherit;\
    font-size: 11.5px;\
    font-weight: 700;\
    cursor: pointer;\
    display: flex;\
    align-items: center;\
    justify-content: center;\
    gap: 4px;\
    transition: background .13s ease, border-color .13s ease;\
    -webkit-tap-highlight-color: transparent;\
}\
\
.dse-btn:hover {\
    background: var(--ui-bg-hover, #f3f4f6);\
    border-color: var(--ui-accent, #1f6feb);\
}\
\
.dse-btn.primary {\
    background: var(--ui-success, #2e7d32);\
    border-color: var(--ui-success, #2e7d32);\
    color: #fff;\
}\
\
.dse-btn.primary:hover {\
    background: #1b5e20;\
    border-color: #1b5e20;\
}\
\
.dse-btn.danger {\
    color: var(--ui-danger, #dc2626);\
    border-color: rgba(220,38,38,.3);\
}\
\
.dse-btn.danger:hover {\
    background: rgba(220,38,38,.08);\
    border-color: var(--ui-danger, #dc2626);\
}\
\
\
/* ============ STATUS ============ */\
.dse-status {\
    padding: 0 10px 8px;\
    font-size: 11px;\
    font-weight: 600;\
    text-align: center;\
    min-height: 14px;\
    color: var(--ui-text-muted, #5b6472);\
}\
\
.dse-status.ok { color: var(--ui-success, #2e7d32); }\
.dse-status.err { color: var(--ui-danger, #d32f2f); }\
\
\
/* ============ MOBILE ============ */\
@media (max-width: 600px) {\
\
    #' + CONFIG.panelId + ' {\
        width: auto !important;\
        max-width: none !important;\
    }\
\
    .dse-body select,\
    .dse-body input[type="number"],\
    .dse-body input[type="color"],\
    .dse-body input[type="text"] {\
        height: 34px;\
        font-size: 12px;\
    }\
\
    .dse-btn { height: 38px; font-size: 12px; }\
    .dse-cat-list { max-height: 140px; }\
}\
';

        document.head.appendChild(css);
    }

    /* ========================================================
       8. BUILD BUTTON
       ======================================================== */
    function createButton() {
        var existing = document.getElementById(CONFIG.buttonId);
        if (existing) { button = existing; return; }

        button = document.createElement("button");
        button.id = CONFIG.buttonId;
        button.type = "button";
        button.title = "Layer Style Editor";
        button.textContent = "🎨";

        button.addEventListener("click", function (e) {
            e.preventDefault(); e.stopPropagation();
            if (document.body.classList.contains("drag-edit-mode")) return;
            togglePanel();
        });

        document.body.appendChild(button);
    }

    /* ========================================================
       9. BUILD PANEL
       ======================================================== */
    function createPanel() {
        var existing = document.getElementById(CONFIG.panelId);
        if (existing) { panel = existing; return; }

        panel = document.createElement("div");
        panel.id = CONFIG.panelId;

        panel.innerHTML =
'<div class="dse-head">' +
'  <div><div class="dse-title">🎨 Style Editor</div>' +
'  <div class="dse-subtitle">Fill · Border · Labels</div></div>' +
'  <button type="button" class="dse-close" id="dse-close-btn">×</button>' +
'</div>' +

'<div class="dse-body">' +

/* === LAYER + STYLE TYPE === */
'  <label>Layer</label>' +
'  <select id="dse-layer"></select>' +

'  <label>Style Type</label>' +
'  <select id="dse-type">' +
'    <option value="single">Single Symbol</option>' +
'    <option value="categorized">Categorized</option>' +
'  </select>' +

/* === FILL SECTION === */
'  <div class="dse-sec open" id="dse-sec-fill">' +
'    <div class="dse-sec-head" data-target="fill">' +
'      <span>🎨 Fill</span><span class="dse-sec-caret">▶</span>' +
'    </div>' +
'    <div class="dse-sec-body">' +
'      <label>Color</label>' +
'      <input type="color" id="dse-fill-color" value="#4CAF50">' +
'      <label>Opacity</label>' +
'      <div class="dse-range-row">' +
'        <input type="range" id="dse-fill-opacity" min="0" max="1" step="0.01" value="0.45">' +
'        <span id="dse-fill-opacity-val">45%</span>' +
'      </div>' +
'    </div>' +
'  </div>' +

/* === BORDER SECTION === */
'  <div class="dse-sec open" id="dse-sec-border">' +
'    <div class="dse-sec-head" data-target="border">' +
'      <span>🖊 Border</span><span class="dse-sec-caret">▶</span>' +
'    </div>' +
'    <div class="dse-sec-body">' +
'      <div class="dse-grid">' +
'        <div>' +
'          <label>Color</label>' +
'          <input type="color" id="dse-stroke-color" value="#000000">' +
'        </div>' +
'        <div>' +
'          <label>Width</label>' +
'          <input type="number" id="dse-stroke-width" min="0" max="20" step="0.5" value="1">' +
'        </div>' +
'      </div>' +
'    </div>' +
'  </div>' +

/* === CATEGORIZED SECTION === */
'  <div class="dse-sec" id="dse-sec-category">' +
'    <div class="dse-sec-head" data-target="category">' +
'      <span>🏷 Categories</span><span class="dse-sec-caret">▶</span>' +
'    </div>' +
'    <div class="dse-sec-body">' +
'      <label>Category Field</label>' +
'      <select id="dse-cat-field"></select>' +
'      <div id="dse-cat-list" class="dse-cat-list"></div>' +
'    </div>' +
'  </div>' +

/* === LABELS SECTION === */
'  <div class="dse-sec" id="dse-sec-label">' +
'    <div class="dse-sec-head" data-target="label">' +
'      <span>🔤 Labels</span><span class="dse-sec-caret">▶</span>' +
'    </div>' +
'    <div class="dse-sec-body">' +
'      <label class="dse-check">' +
'        <input type="checkbox" id="dse-label-enabled">' +
'        <span>Show labels on map</span>' +
'      </label>' +
'      <label>Label Field</label>' +
'      <select id="dse-label-field"></select>' +
'      <div class="dse-grid">' +
'        <div>' +
'          <label>Color</label>' +
'          <input type="color" id="dse-label-color" value="#000000">' +
'        </div>' +
'        <div>' +
'          <label>Size</label>' +
'          <input type="number" id="dse-label-size" min="6" max="50" step="1" value="12">' +
'        </div>' +
'      </div>' +
'      <label>Rotation (degrees)</label>' +
'      <input type="number" id="dse-label-rot" min="-180" max="180" step="1" value="0">' +
'    </div>' +
'  </div>' +

'</div>' +

/* === STATUS === */
'<div class="dse-status" id="dse-status"></div>' +

/* === FOOTER === */
'<div class="dse-footer">' +
'  <button type="button" class="dse-btn primary" id="dse-apply">✓ Apply &amp; Save</button>' +
'  <button type="button" class="dse-btn danger" id="dse-reset">↺ Reset</button>' +
'</div>';

        document.body.appendChild(panel);
        cacheElements();
        bindPanelEvents();
    }

    /* ========================================================
       10. CACHE ELEMENT REFERENCES
       ======================================================== */
    function cacheElements() {
        el.layerSelect   = document.getElementById("dse-layer");
        el.styleType     = document.getElementById("dse-type");
        el.fillColor     = document.getElementById("dse-fill-color");
        el.fillOpacity   = document.getElementById("dse-fill-opacity");
        el.fillOpacityVal= document.getElementById("dse-fill-opacity-val");
        el.strokeColor   = document.getElementById("dse-stroke-color");
        el.strokeWidth   = document.getElementById("dse-stroke-width");
        el.catField      = document.getElementById("dse-cat-field");
        el.catList       = document.getElementById("dse-cat-list");
        el.catSection    = document.getElementById("dse-sec-category");
        el.labelEnabled  = document.getElementById("dse-label-enabled");
        el.labelField    = document.getElementById("dse-label-field");
        el.labelColor    = document.getElementById("dse-label-color");
        el.labelSize     = document.getElementById("dse-label-size");
        el.labelRot      = document.getElementById("dse-label-rot");
        el.applyBtn      = document.getElementById("dse-apply");
        el.resetBtn      = document.getElementById("dse-reset");
        el.status        = document.getElementById("dse-status");
    }

    /* ========================================================
       11. SECTION TOGGLE
       ======================================================== */
    function toggleSection(sectionEl) {
        if (!sectionEl) return;
        sectionEl.classList.toggle("open");
    }

    /* ========================================================
       12. PANEL EVENTS
       ======================================================== */
    function bindPanelEvents() {
        document.getElementById("dse-close-btn").onclick = closePanel;

        // Section toggles
        panel.querySelectorAll(".dse-sec-head").forEach(function (head) {
            head.addEventListener("click", function () {
                toggleSection(head.parentElement);
            });
        });

        el.layerSelect.onchange = function () {
            var layers = getVectorLayers();
            currentLayer = layers[parseInt(this.value, 10)];
            loadLayer(currentLayer);
        };

        el.styleType.onchange = function () {
            updateCategoryVisibility();
            if (this.value === "categorized") populateCategoryValues();
        };

        el.catField.onchange = populateCategoryValues;

        el.fillOpacity.oninput = function () {
            el.fillOpacityVal.textContent =
                Math.round(parseFloat(this.value) * 100) + "%";
        };

        el.applyBtn.onclick = applyCurrentStyle;
        el.resetBtn.onclick = resetCurrentStyle;

        panel.addEventListener("click", function (e) { e.stopPropagation(); });
    }

    /* ========================================================
       13. POPULATE
       ======================================================== */
    function populateLayers() {
        if (!el.layerSelect) return;
        el.layerSelect.innerHTML = "";

        var layers = getVectorLayers();
        layers.forEach(function (layer, index) {
            var opt = document.createElement("option");
            opt.value = index;
            opt.textContent = getLayerName(layer);
            el.layerSelect.appendChild(opt);
        });

        if (layers.length) {
            currentLayer = layers[0];
            el.layerSelect.value = "0";
            loadLayer(layers[0]);
        }
    }

    function populateFields(layer) {
        var fields = getLayerFields(layer);

        el.labelField.innerHTML = '<option value="">-- Select --</option>';
        el.catField.innerHTML = '<option value="">-- Select --</option>';

        fields.forEach(function (field) {
            var o1 = document.createElement("option");
            o1.value = field; o1.textContent = field;
            el.labelField.appendChild(o1);

            var o2 = document.createElement("option");
            o2.value = field; o2.textContent = field;
            el.catField.appendChild(o2);
        });
    }

    function populateCategoryValues() {
        if (!currentLayer || !el.catList) return;

        var field = el.catField.value;
        el.catList.innerHTML = "";
        if (!field) return;

        var values = getUniqueValues(currentLayer, field);
        var saved = getSavedStyles();
        var key = getLayerKey(currentLayer);
        var savedColors = (saved[key] && saved[key].categoryColors) || {};

        values.forEach(function (value, index) {
            var row = document.createElement("div");
            row.className = "dse-cat-row";

            var label = document.createElement("span");
            label.className = "dse-cat-name";
            label.textContent = value;
            label.title = value;

            var color = document.createElement("input");
            color.type = "color";
            color.className = "dse-cat-color";
            color.dataset.value = value;
            color.value = savedColors[value] || randomColor(index);

            row.appendChild(label);
            row.appendChild(color);
            el.catList.appendChild(row);
        });
    }

    function updateCategoryVisibility() {
        if (el.styleType.value === "categorized") {
            el.catSection.classList.add("open");
            el.catSection.style.display = "";
            populateCategoryValues();
        } else {
            el.catSection.style.display = "none";
        }
    }

    /* ========================================================
       14. STYLE CONFIG & APPLY
       ======================================================== */
    function getCurrentStyleConfig() {
        var config = {
            styleType: el.styleType.value,
            fillColor: el.fillColor.value,
            fillOpacity: parseFloat(el.fillOpacity.value),
            strokeColor: el.strokeColor.value,
            strokeWidth: parseFloat(el.strokeWidth.value),
            categoryField: el.catField.value,
            categoryColors: {},
            labelEnabled: el.labelEnabled.checked,
            labelField: el.labelField.value,
            labelColor: el.labelColor.value,
            labelSize: parseFloat(el.labelSize.value),
            labelRotation: parseFloat(el.labelRot.value)
        };

        el.catList.querySelectorAll(".dse-cat-color").forEach(function (input) {
            config.categoryColors[input.dataset.value] = input.value;
        });

        return config;
    }

    function createSingleStyle(config) {
        return function (feature) {
            var opts = {
                fill: new ol.style.Fill({ color: hexToRgba(config.fillColor, config.fillOpacity) }),
                stroke: new ol.style.Stroke({ color: config.strokeColor, width: config.strokeWidth })
            };

            if (config.labelEnabled && config.labelField) {
                var v = feature.get(config.labelField);
                if (v !== undefined && v !== null && String(v).trim() !== "") {
                    opts.text = new ol.style.Text({
                        text: String(v),
                        font: config.labelSize + "px Arial",
                        fill: new ol.style.Fill({ color: config.labelColor }),
                        stroke: new ol.style.Stroke({ color: "#fff", width: 3 }),
                        textAlign: "center", textBaseline: "middle",
                        placement: "point", overflow: true,
                        rotation: (config.labelRotation * Math.PI) / 180
                    });
                }
            }

            return new ol.style.Style(opts);
        };
    }

    function createCategorizedStyle(config) {
        return function (feature) {
            var val = feature.get(config.categoryField);
            var txt = (val === undefined || val === null) ? "" : String(val);
            var fillColor = config.categoryColors[txt] || config.fillColor;

            var opts = {
                fill: new ol.style.Fill({ color: hexToRgba(fillColor, config.fillOpacity) }),
                stroke: new ol.style.Stroke({ color: config.strokeColor, width: config.strokeWidth })
            };

            if (config.labelEnabled && config.labelField) {
                var v = feature.get(config.labelField);
                if (v !== undefined && v !== null && String(v).trim() !== "") {
                    opts.text = new ol.style.Text({
                        text: String(v),
                        font: config.labelSize + "px Arial",
                        fill: new ol.style.Fill({ color: config.labelColor }),
                        stroke: new ol.style.Stroke({ color: "#fff", width: 3 }),
                        textAlign: "center", textBaseline: "middle",
                        placement: "point", overflow: true,
                        rotation: (config.labelRotation * Math.PI) / 180
                    });
                }
            }

            return new ol.style.Style(opts);
        };
    }

    function applyStyleConfig(layer, config) {
        if (!layer || !config) return;

        if (typeof layer.setDeclutter === "function") layer.setDeclutter(false);

        layer.setStyle(
            config.styleType === "categorized" ? createCategorizedStyle(config) : createSingleStyle(config)
        );

        var src = layer.getSource();
        if (src && typeof src.changed === "function") src.changed();
        if (typeof layer.changed === "function") layer.changed();
        var m = getMap();
        if (m && typeof m.renderSync === "function") m.renderSync();
    }

    function applyCurrentStyle() {
        if (!currentLayer) { setStatus("No layer selected.", "err"); return; }
        var config = getCurrentStyleConfig();
        applyStyleConfig(currentLayer, config);

        var saved = getSavedStyles();
        saved[getLayerKey(currentLayer)] = config;
        saveAllStyles(saved);
        setStatus("✓ Style applied and saved.", "ok");
    }

    function resetCurrentStyle() {
        if (!currentLayer) return;

        var saved = getSavedStyles();
        delete saved[getLayerKey(currentLayer)];
        saveAllStyles(saved);

        currentLayer.setStyle(null);
        var src = currentLayer.getSource();
        if (src && typeof src.changed === "function") src.changed();
        if (typeof currentLayer.changed === "function") currentLayer.changed();
        var m = getMap();
        if (m && typeof m.renderSync === "function") m.renderSync();

        loadLayer(currentLayer);
        setStatus("↺ Style reset.", "ok");
    }

    /* ========================================================
       15. LOAD LAYER
       ======================================================== */
    function loadLayer(layer) {
        if (!layer) return;
        currentLayer = layer;
        populateFields(layer);

        // Defaults
        el.styleType.value = "single";
        el.fillColor.value = "#4CAF50";
        el.fillOpacity.value = "0.45";
        el.strokeColor.value = "#000000";
        el.strokeWidth.value = "1";
        el.labelEnabled.checked = false;
        el.labelColor.value = "#000000";
        el.labelSize.value = "12";
        el.labelRot.value = "0";
        el.catField.value = "";
        el.labelField.value = "";
        el.fillOpacityVal.textContent = "45%";

        var saved = getSavedStyles();
        var config = saved[getLayerKey(layer)];

        if (config) {
            if (config.styleType) el.styleType.value = config.styleType;
            if (config.fillColor) el.fillColor.value = config.fillColor;
            if (config.fillOpacity !== undefined) {
                el.fillOpacity.value = config.fillOpacity;
                el.fillOpacityVal.textContent = Math.round(config.fillOpacity * 100) + "%";
            }
            if (config.strokeColor) el.strokeColor.value = config.strokeColor;
            if (config.strokeWidth !== undefined) el.strokeWidth.value = config.strokeWidth;
            if (config.categoryField) el.catField.value = config.categoryField;
            if (config.labelEnabled !== undefined) el.labelEnabled.checked = config.labelEnabled;
            if (config.labelField) el.labelField.value = config.labelField;
            if (config.labelColor) el.labelColor.value = config.labelColor;
            if (config.labelSize !== undefined) el.labelSize.value = config.labelSize;
            if (config.labelRotation !== undefined) el.labelRot.value = config.labelRotation;

            updateCategoryVisibility();
            if (config.styleType === "categorized") populateCategoryValues();
            applyStyleConfig(layer, config);
            return;
        }

        updateCategoryVisibility();
    }

    /* ========================================================
       16. STATUS
       ======================================================== */
    function setStatus(msg, type) {
        if (!el.status) return;
        el.status.textContent = msg;
        el.status.className = "dse-status " + (type || "");
        setTimeout(function () {
            el.status.textContent = "";
            el.status.className = "dse-status";
        }, 3000);
    }

    /* ========================================================
       17. PANEL POSITIONING  ★ Bypasses !important locks
       ======================================================== */
    function positionPanel() {
        if (!panel || !button || !panelOpen) return;
        var pad = 8, vw = window.innerWidth, vh = window.innerHeight;
        var b = button.getBoundingClientRect();

        // Mobile → centered floating card (constrained to max 310px wide)
        if (vw <= 600) {
            var targetWidth = Math.min(CONFIG.panelWidth, vw - 16);
            var leftPos = (vw - targetWidth) / 2;

            panel.style.setProperty('width', targetWidth + 'px', 'important');
            panel.style.setProperty('left', Math.round(leftPos) + 'px', 'important');
            panel.style.setProperty('right', 'auto', 'important');
            panel.style.setProperty('top', '8px', 'important');
            panel.style.setProperty('bottom', 'auto', 'important');
            panel.style.setProperty('max-height', (vh - 16) + 'px', 'important');
            return;
        }

        panel.style.setProperty('width', CONFIG.panelWidth + 'px', 'important');
        panel.style.setProperty('right', 'auto', 'important');
        panel.style.setProperty('bottom', 'auto', 'important');

        var pw = panel.offsetWidth || CONFIG.panelWidth;
        var ph = panel.offsetHeight || 500;
        var spaceRight = vw - b.right, spaceLeft = b.left, left;

        if (spaceRight >= pw + CONFIG.panelGap + pad) left = b.right + CONFIG.panelGap;
        else if (spaceLeft >= pw + CONFIG.panelGap + pad) left = b.left - CONFIG.panelGap - pw;
        else left = Math.max(pad, (vw - pw) / 2);

        left = Math.max(pad, Math.min(left, vw - pw - pad));
        var top = Math.max(pad, Math.min(b.top, vh - ph - pad));
        if (ph > vh - pad * 2) top = pad;

        // ★ DYNAMIC REMAINING HEIGHT MATH: Enforces strict panel height within visible screen boundaries
        var maxPh = vh - top - pad;

        panel.style.setProperty('left', Math.round(left) + 'px', 'important');
        panel.style.setProperty('top', Math.round(top) + 'px', 'important');
        panel.style.setProperty('max-height', Math.round(maxPh) + 'px', 'important');
    }

    /* ========================================================
       18. OPEN / CLOSE
       ======================================================== */
    function openPanel() {
        if (!panel) createPanel();
        panelOpen = true;
        panel.classList.add("dse-visible");
        if (button) button.classList.add("dse-open");
        populateLayers();
        requestAnimationFrame(function () { requestAnimationFrame(positionPanel); });
    }

    function closePanel() {
        panelOpen = false;
        if (panel) panel.classList.remove("dse-visible");
        if (button) button.classList.remove("dse-open");
    }

    function togglePanel() { panelOpen ? closePanel() : openPanel(); }

    /* ========================================================
       19. GLOBAL EVENTS
       ======================================================== */
    function bindGlobalEvents() {
        window.addEventListener("resize", positionPanel);
        window.addEventListener("orientationchange", function () { setTimeout(positionPanel, 250); });

        document.addEventListener("maptool:moved", function (e) {
            if (e.detail && e.detail.id === CONFIG.toolId) positionPanel();
        });

        document.addEventListener("maptool:editmode", function (e) {
            if (e.detail && e.detail.active) closePanel();
        });

        document.addEventListener("maptool:visibility", function (e) {
            if (e.detail && e.detail.id === CONFIG.toolId && !e.detail.visible) closePanel();
        });

        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape" && panelOpen) closePanel();
        });

        document.addEventListener("click", function (e) {
            if (!panelOpen) return;
            if (!panel) return;
            if (panel.contains(e.target)) return;
            if (button && button.contains(e.target)) return;
            closePanel();
        });
    }

    /* ========================================================
       20. RESTORE SAVED STYLES
       ======================================================== */
    function restoreAllSavedStyles() {
        var saved = getSavedStyles();
        var layers = getVectorLayers();
        layers.forEach(function (layer) {
            var config = saved[getLayerKey(layer)];
            if (config) applyStyleConfig(layer, config);
        });
    }

    /* ========================================================
       21. PUBLIC API
       ======================================================== */
    window.DynamicStyleEditor = {
        open: openPanel,
        close: closePanel,
        toggle: togglePanel,
        restoreAll: restoreAllSavedStyles
    };

    /* ========================================================
       22. INITIALIZE
       ======================================================== */
    function initialize() {
        injectCSS();
        createButton();
        createPanel();
        closePanel();

        registerWithToolManager();
        bindGlobalEvents();

        setTimeout(restoreAllSavedStyles, 1000);
        setTimeout(restoreAllSavedStyles, 3000);

        console.log("🎨 Dynamic Style Editor v2.5 READY.");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize);
    } else {
        initialize();
    }

})();