// ============================================================
// 📤 STAGE 17 — ADVANCED EXPORT TOOL  (v5.1)
// ============================================================
// QGIS2WEB + OPENLAYERS  —  SINGLE FILE, DROP-IN
//
// v5.1 CHANGELOG
//  ✔ Label field dropdown — pick which attribute to show as label
//  ✔ "Auto" option guesses intelligently (name, survey_no, etc.)
//  ✔ "Export_ID" option uses the sequential export number
//  ✔ "Custom text" option for a fixed label on all features
//  ✔ Dropdown refreshes when layer or fields change
//  ✔ All v5.0 features preserved (drag, hide, panel follows button)
//
// EXPORT FORMATS
//   GeoJSON · JSON · CSV · WKT · KML · KMZ · DXF · Shapefile ZIP
//
// SELECTION ENGINE
//   • Single click = SELECT / UNSELECT (toggle)
//   • Clicking another polygon = ADDS to current selection
//   • Shift + Drag = Box select
//   • Works on UNFILLED / transparent polygons
// ============================================================

(function () {
    "use strict";

    /* ========================================================
       1. CONFIGURATION
       ======================================================== */
    var CONFIG = {
        toolId:    "stage17",
        toolName:  "Export",
        toolIcon:  "📤",

        buttonId:  "stage17-export-button",
        panelId:   "stage17-export-panel",

        btnSize:   40,
        panelWidth: 340,
        panelGap:  8,

        defaults:  { top: 392, left: 12 },

        areaDecimals:  3,
        coordDecimals: 7,
        hitTolerance:  10,

        // Preferred label fields (checked in order when "Auto" is selected)
        preferredLabelFields: [
            "name", "Name", "NAME",
            "label", "Label", "LABEL",
            "title", "Title", "TITLE",
            "survey_no", "Survey_No", "SURVEY_NO",
            "survey_no_",
            "plot_no", "Plot_No", "PLOT_NO",
            "lpm_no", "LPM_No", "LPM_NO",
            "parcel_no", "Parcel_No", "PARCEL_NO",
            "parcel_num", "PARCEL_NUM",
            "id", "ID", "Id",
            "fid", "FID",
            "gid", "GID"
        ],

        jszipCDN: [
            "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js",
            "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"
        ]
    };

    if (typeof ol === "undefined") {
        console.error("📤 Stage 17: OpenLayers (ol) not found.");
        return;
    }

    /* ========================================================
       2. STATE
       ======================================================== */
    var S = {
        map:          null,
        currentLayer: null,
        selection:    [],
        selectActive: false,
        highlightLayer: null,
        dragBox:      null,
        clickKey:     null,
        exportMode:   "all",
        exportFormat: "GeoJSON",
        exportCRS:    "current",
        panelOpen:    false
    };

    var button = null;
    var panel  = null;

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
       4. CSS INJECTION
       ======================================================== */
    function injectCSS() {
        if (document.getElementById("stage17-css")) return;

        var css = document.createElement("style");
        css.id = "stage17-css";
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
    z-index: 18300;\
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
    transition:\
        background .15s ease,\
        border-color .15s ease,\
        transform .15s ease;\
}\
\
#' + CONFIG.buttonId + ':hover {\
    background: var(--ui-bg-hover, #eef1f5);\
    border-color: var(--ui-accent, #1f6feb);\
}\
\
#' + CONFIG.buttonId + '.stage17-open {\
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
/* ============ PANEL ============ */\
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
    box-shadow: 0 10px 40px rgba(0,0,0,.28);\
\
    font-family: var(--ui-font, "Segoe UI", Roboto, system-ui, sans-serif);\
    font-size: 12px;\
    color: var(--ui-text, #1d2430);\
\
    z-index: 55000;\
    display: none;\
    flex-direction: column;\
    box-sizing: border-box;\
}\
\
#' + CONFIG.panelId + '.stage17-visible {\
    display: flex;\
    animation: stage17-fade .16s ease;\
}\
\
@keyframes stage17-fade {\
    from { opacity: 0; transform: translateY(6px); }\
    to   { opacity: 1; transform: translateY(0); }\
}\
\
#' + CONFIG.panelId + ' * { box-sizing: border-box; }\
\
\
/* ============ HEADER ============ */\
.s17-head {\
    display: flex;\
    align-items: center;\
    justify-content: space-between;\
    gap: 8px;\
    padding: 11px 13px;\
    background: linear-gradient(135deg, #111827, #374151);\
    color: #fff;\
    flex-shrink: 0;\
    border-radius: var(--ui-radius, 10px) var(--ui-radius, 10px) 0 0;\
}\
\
.s17-t { font-size: 14px; font-weight: 700; }\
.s17-st { font-size: 10px; opacity: .7; margin-top: 1px; }\
\
.s17-x {\
    width: 26px; height: 26px; flex-shrink: 0;\
    border: none; border-radius: 5px;\
    background: rgba(255,255,255,.15);\
    color: #fff; font-size: 18px; line-height: 1;\
    cursor: pointer;\
    display: flex; align-items: center; justify-content: center;\
    transition: background .13s ease;\
}\
\
.s17-x:hover { background: rgba(255,255,255,.3); }\
\
\
/* ============ BODY ============ */\
.s17-body {\
    padding: 12px;\
    overflow-y: auto;\
    -webkit-overflow-scrolling: touch;\
    flex: 1;\
    min-height: 0;\
}\
\
.s17-body label {\
    display: block;\
    font-size: 11px;\
    font-weight: 700;\
    margin: 0 0 4px;\
    color: var(--ui-text-muted, #5b6472);\
    text-transform: uppercase;\
    letter-spacing: .3px;\
}\
\
.s17-body select,\
.s17-body input[type="text"],\
.s17-body input[type="number"] {\
    width: 100%;\
    height: 32px;\
    padding: 4px 8px;\
    margin: 0 0 10px;\
    border: 1px solid var(--ui-border, #d7dce3);\
    border-radius: var(--ui-radius-sm, 7px);\
    background: var(--ui-bg-subtle, #f5f7fa);\
    color: var(--ui-text, #1d2430);\
    font-family: inherit;\
    font-size: 12px;\
    outline: none;\
    transition: border-color .13s ease, box-shadow .13s ease;\
}\
\
.s17-body select:focus,\
.s17-body input:focus {\
    border-color: var(--ui-accent, #1f6feb);\
    box-shadow: 0 0 0 3px var(--ui-accent-soft, rgba(31,111,235,.12));\
}\
\
\
/* ============ SECTIONS ============ */\
.s17-sec {\
    font-size: 10.5px;\
    font-weight: 800;\
    letter-spacing: .4px;\
    text-transform: uppercase;\
    color: var(--ui-text-muted, #6b7280);\
    margin: 14px 0 8px;\
    padding-top: 10px;\
    border-top: 1px solid var(--ui-border-soft, #e5e7eb);\
}\
\
.s17-chk {\
    display: flex;\
    align-items: center;\
    gap: 7px;\
    margin: 5px 0;\
    font-size: 11.5px;\
    font-weight: 500;\
    cursor: pointer;\
    color: var(--ui-text, #1d2430);\
}\
\
.s17-chk input { width: auto !important; height: auto !important; margin: 0 !important; cursor: pointer; }\
\
\
/* ============ LABEL FIELD GROUP ============ */\
.s17-label-group {\
    margin: 6px 0 4px;\
    padding: 8px;\
    background: var(--ui-bg-subtle, #f8fafc);\
    border: 1px solid var(--ui-border-soft, #e5e7eb);\
    border-radius: var(--ui-radius-sm, 7px);\
}\
\
.s17-label-group label {\
    margin: 0 0 4px;\
    font-size: 10.5px;\
}\
\
.s17-label-group select {\
    margin: 0 0 6px;\
}\
\
.s17-label-group input[type="text"] {\
    margin: 0;\
}\
\
.s17-label-hint {\
    font-size: 10px;\
    color: var(--ui-text-faint, #8b93a1);\
    margin-top: 4px;\
    line-height: 1.35;\
}\
\
\
/* ============ ROWS & BUTTONS ============ */\
.s17-row { display: flex; gap: 6px; }\
.s17-row > * { flex: 1; }\
\
.s17-btn {\
    height: 30px;\
    border: 1px solid var(--ui-border, #d7dce3);\
    border-radius: var(--ui-radius-sm, 7px);\
    background: var(--ui-bg, #fff);\
    color: var(--ui-text, #374151);\
    font-family: inherit;\
    font-size: 11px;\
    font-weight: 600;\
    cursor: pointer;\
    padding: 0 6px;\
    display: flex;\
    align-items: center;\
    justify-content: center;\
    transition: background .13s ease, border-color .13s ease;\
}\
\
.s17-btn:hover {\
    background: var(--ui-bg-hover, #f3f4f6);\
    border-color: var(--ui-accent, #1f6feb);\
}\
\
.s17-btn.on {\
    background: var(--ui-success, #16a34a);\
    border-color: var(--ui-success, #16a34a);\
    color: #fff;\
}\
\
\
/* ============ FIELDS ============ */\
.s17-fields {\
    margin: 8px 0 12px;\
    padding: 8px;\
    background: var(--ui-bg-subtle, #f8fafc);\
    border: 1px solid var(--ui-border-soft, #e5e7eb);\
    border-radius: var(--ui-radius-sm, 7px);\
    max-height: 150px;\
    overflow-y: auto;\
}\
\
.s17-field {\
    display: flex;\
    align-items: center;\
    gap: 6px;\
    margin: 3px 0;\
    font-size: 11px;\
    font-weight: 400;\
}\
\
.s17-ftitle {\
    font-size: 10px;\
    font-weight: 800;\
    margin-bottom: 5px;\
    color: var(--ui-text-muted, #6b7280);\
    text-transform: uppercase;\
}\
\
\
/* ============ INFO / STATUS ============ */\
.s17-info {\
    padding: 7px 9px;\
    margin: 0 0 10px;\
    border-radius: var(--ui-radius-sm, 7px);\
    font-size: 11px;\
    border: 1px solid;\
    line-height: 1.45;\
}\
\
.s17-info.ok   { background: #dcfce7; border-color: #22c55e; color: #14532d; }\
.s17-info.warn { background: #fef3c7; border-color: #f59e0b; color: #92400e; }\
\
.s17-status {\
    padding: 7px 9px;\
    margin: 10px 0;\
    background: var(--ui-bg-subtle, #f3f4f6);\
    border-radius: var(--ui-radius-sm, 7px);\
    color: var(--ui-text-muted, #4b5563);\
    font-size: 11px;\
    word-break: break-word;\
    line-height: 1.5;\
}\
\
\
/* ============ EXPORT BUTTON ============ */\
.s17-go {\
    width: 100%;\
    height: 38px;\
    border: none;\
    border-radius: var(--ui-radius-sm, 7px);\
    background: var(--ui-accent, #2563eb);\
    color: #fff;\
    font-family: inherit;\
    font-size: 13px;\
    font-weight: 800;\
    cursor: pointer;\
    box-shadow: 0 2px 8px rgba(37,99,235,.3);\
    transition: background .15s ease;\
}\
\
.s17-go:hover { background: var(--ui-accent-dark, #1d4ed8); }\
.s17-go:disabled { opacity: .55; cursor: not-allowed; }\
\
\
/* ============ DRAG BOX ============ */\
.s17-dragbox {\
    border: 2px dashed var(--ui-accent, #2563eb);\
    background: rgba(37,99,235,.12);\
}\
\
\
/* ============ POPUP SUPPRESSION ============ */\
body.s17-nopopup .ol-popup,\
body.s17-nopopup #popup,\
body.s17-nopopup .ol-popup-content,\
body.s17-nopopup #popup-content,\
body.s17-nopopup .popup-content,\
body.s17-nopopup .ol-tooltip {\
    display: none !important;\
}\
\
\
/* ============ MOBILE ============ */\
@media (max-width: 600px) {\
    #' + CONFIG.panelId + ' {\
        width: calc(100vw - 16px);\
        max-width: calc(100vw - 16px);\
        max-height: calc(100vh - 16px);\
    }\
}\
';

        document.head.appendChild(css);
    }

    /* ========================================================
       5. MAP DETECTION
       ======================================================== */
    function getMap() {
        if (S.map) return S.map;
        if (typeof map !== "undefined" && map instanceof ol.Map) { S.map = map; return S.map; }
        var names = ["map", "olMap", "myMap", "theMap", "mapObj"];
        for (var i = 0; i < names.length; i++) {
            if (window[names[i]] instanceof ol.Map) { S.map = window[names[i]]; return S.map; }
        }
        for (var k in window) {
            try { if (window[k] instanceof ol.Map) { S.map = window[k]; return S.map; } } catch (e) {}
        }
        return null;
    }

    function mapCRS() {
        var m = getMap();
        if (!m) return "EPSG:3857";
        var p = m.getView().getProjection();
        return p ? p.getCode() : "EPSG:3857";
    }

    /* ========================================================
       6. LAYER HELPERS
       ======================================================== */
    var _layerCounter = 0;

    function layerId(layer) {
        if (!layer.__s17id) { _layerCounter++; layer.__s17id = "s17L" + _layerCounter; }
        return layer.__s17id;
    }

    function vectorLayers() {
        var m = getMap();
        if (!m) return [];
        var out = [];
        function walk(layer) {
            if (!layer) return;
            if (layer === S.highlightLayer) return;
            if (layer.get && layer.get("__s17internal")) return;
            if (typeof layer.getLayers === "function") { layer.getLayers().forEach(walk); return; }
            if (typeof layer.getSource !== "function") return;
            var src = layer.getSource();
            if (!src || typeof src.getFeatures !== "function") return;
            var f = src.getFeatures();
            if (f && f.length) out.push(layer);
        }
        m.getLayers().forEach(walk);
        return out;
    }

    function layerName(layer) {
        if (!layer) return "Layer";
        return String(layer.get("name") || layer.get("title") || layer.get("layerName") || "Vector Layer");
    }

    function layerById(id) {
        var ls = vectorLayers();
        for (var i = 0; i < ls.length; i++) if (layerId(ls[i]) === id) return ls[i];
        return null;
    }

    function findFeatureLayer(feature) {
        var ls = vectorLayers();
        for (var i = 0; i < ls.length; i++) {
            var src = ls[i].getSource();
            if (!src) continue;
            if (typeof src.hasFeature === "function") { try { if (src.hasFeature(feature)) return ls[i]; } catch (e) {} }
            if (src.getFeatures().indexOf(feature) !== -1) return ls[i];
        }
        return null;
    }

    /* ========================================================
       7. POPUP SUPPRESSION & RESTORATION
       ======================================================== */
    var POPUP = { active: false, listeners: [], overlays: [], interactions: [] };

    function suppressPopups() {
        var m = getMap();
        if (!m || POPUP.active) return;
        POPUP.active = true;
        POPUP.listeners = [];
        POPUP.overlays = [];
        POPUP.interactions = [];
        ["singleclick", "click", "dblclick", "pointermove"].forEach(function (type) {
            var arr = null;
            try { if (typeof m.getListeners === "function") arr = m.getListeners(type); } catch (e) {}
            if (!arr || !arr.length) return;
            arr.slice().forEach(function (fn) {
                if (!fn || fn.__s17own) return;
                POPUP.listeners.push({ type: type, fn: fn });
                try { m.un(type, fn); } catch (e) {}
            });
        });
        try {
            m.getOverlays().forEach(function (ov) {
                var el = ov.getElement ? ov.getElement() : null;
                if (!el) return;
                var sig = ((el.id || "") + " " + (el.className || "")).toLowerCase();
                if (sig.indexOf("popup") !== -1 || sig.indexOf("tooltip") !== -1 || sig.indexOf("closer") !== -1) {
                    POPUP.overlays.push({ ov: ov, pos: ov.getPosition(), disp: el.style.display });
                    try { ov.setPosition(undefined); } catch (e) {}
                    el.style.display = "none";
                }
            });
        } catch (e) {}
        try {
            m.getInteractions().forEach(function (it) {
                if (it === S.dragBox) return;
                if (it instanceof ol.interaction.Select) {
                    POPUP.interactions.push({ it: it, active: it.getActive() });
                    it.setActive(false);
                }
            });
        } catch (e) {}
        document.body.classList.add("s17-nopopup");
    }

    function restorePopups() {
        var m = getMap();
        if (!m || !POPUP.active) return;
        POPUP.active = false;
        POPUP.listeners.forEach(function (o) { try { m.on(o.type, o.fn); } catch (e) {} });
        POPUP.listeners = [];
        POPUP.overlays.forEach(function (o) {
            try { var el = o.ov.getElement(); if (el) el.style.display = o.disp || ""; } catch (e) {}
        });
        POPUP.overlays = [];
        POPUP.interactions.forEach(function (o) { try { o.it.setActive(o.active); } catch (e) {} });
        POPUP.interactions = [];
        document.body.classList.remove("s17-nopopup");
    }

    function syncPopups() {
        if (S.panelOpen || S.selectActive) suppressPopups();
        else restorePopups();
    }

    /* ========================================================
       8. SELECTION ENGINE
       ======================================================== */
    function highlightStyle(feature) {
        var t = feature.getGeometry() ? feature.getGeometry().getType() : "";
        var styles = [
            new ol.style.Style({
                fill: new ol.style.Fill({ color: "rgba(255, 215, 0, 0.40)" }),
                stroke: new ol.style.Stroke({ color: "#ff1100", width: 3.5 }),
                image: new ol.style.Circle({ radius: 8, fill: new ol.style.Fill({ color: "rgba(255, 215, 0, 0.8)" }), stroke: new ol.style.Stroke({ color: "#ff1100", width: 2.5 }) }),
                zIndex: 9999
            })
        ];
        if (t === "LineString" || t === "MultiLineString") {
            styles.unshift(new ol.style.Style({ stroke: new ol.style.Stroke({ color: "rgba(255, 255, 255, 0.9)", width: 8 }), zIndex: 9998 }));
        }
        return styles;
    }

    function ensureHighlightLayer() {
        var m = getMap();
        if (!m) return null;
        if (S.highlightLayer) return S.highlightLayer;
        S.highlightLayer = new ol.layer.Vector({
            source: new ol.source.Vector(), map: m, style: highlightStyle,
            zIndex: 999999, updateWhileAnimating: true, updateWhileInteracting: true
        });
        S.highlightLayer.set("__s17internal", true);
        return S.highlightLayer;
    }

    function refreshHighlight() {
        var hl = ensureHighlightLayer();
        if (!hl) return;
        var src = hl.getSource(); src.clear();
        for (var i = 0; i < S.selection.length; i++) { var g = S.selection[i].getGeometry(); if (!g) continue; src.addFeature(new ol.Feature({ geometry: g.clone() })); }
        updateSelectionUI();
    }

    function featuresAtPixel(pixel, restrictLayer) {
        var m = getMap(), found = [], seen = [];
        function push(f, l) { if (!f || seen.indexOf(f) !== -1) return; seen.push(f); found.push({ feature: f, layer: l }); }
        m.forEachFeatureAtPixel(pixel, function (feature, layer) {
            if (!layer || layer === S.highlightLayer) return;
            if (restrictLayer && layer !== restrictLayer) return;
            if (!(feature instanceof ol.Feature)) return;
            push(feature, layer);
        }, { hitTolerance: CONFIG.hitTolerance, layerFilter: function (l) { return l !== S.highlightLayer && !l.get("__s17internal"); } });
        if (found.length) return found;
        var coord = m.getCoordinateFromPixel(pixel), res = m.getView().getResolution(), tol = CONFIG.hitTolerance * res;
        var layers = restrictLayer ? [restrictLayer] : vectorLayers();
        for (var li = 0; li < layers.length; li++) {
            var layer = layers[li];
            if (layer.getVisible && !layer.getVisible()) continue;
            var src = layer.getSource(); if (!src) continue;
            var bbox = [coord[0] - tol, coord[1] - tol, coord[0] + tol, coord[1] + tol];
            var candidates = [];
            if (typeof src.forEachFeatureIntersectingExtent === "function") src.forEachFeatureIntersectingExtent(bbox, function (f) { candidates.push(f); });
            else candidates = src.getFeatures();
            for (var ci = 0; ci < candidates.length; ci++) {
                var f = candidates[ci], g = f.getGeometry(); if (!g) continue;
                var type = g.getType();
                if (type === "Polygon" || type === "MultiPolygon") { if (g.intersectsCoordinate(coord)) push(f, layer); }
                else { var cp = g.getClosestPoint(coord); if (Math.sqrt(Math.pow(cp[0] - coord[0], 2) + Math.pow(cp[1] - coord[1], 2)) <= tol) push(f, layer); }
            }
            if (found.length) break;
        }
        return found;
    }

    function onMapClick(evt) {
        if (!S.selectActive) return;
        var hits = featuresAtPixel(evt.pixel, null); if (!hits.length) return;
        var hit = hits[0], wasEmpty = (S.selection.length === 0);
        if (wasEmpty && hit.layer && hit.layer !== S.currentLayer) {
            S.currentLayer = hit.layer;
            var sel = document.getElementById("s17-layer"); if (sel) sel.value = layerId(hit.layer);
            refreshFields();
        }
        var idx = S.selection.indexOf(hit.feature);
        if (idx === -1) S.selection.push(hit.feature); else S.selection.splice(idx, 1);
        if (S.selection.length) { S.exportMode = "selected"; var mSel = document.getElementById("s17-mode"); if (mSel) mSel.value = "selected"; }
        refreshHighlight();
        if (evt.stopPropagation) evt.stopPropagation();
        if (evt.preventDefault) evt.preventDefault();
    }
    onMapClick.__s17own = true;

    function selectByExtent(extent, additive) {
        var layers = S.currentLayer ? [S.currentLayer] : vectorLayers();
        if (!additive) S.selection = [];
        for (var i = 0; i < layers.length; i++) {
            var src = layers[i].getSource(); if (!src) continue;
            src.forEachFeatureIntersectingExtent(extent, function (f) {
                var g = f.getGeometry(); if (!g) return;
                if (typeof g.intersectsExtent === "function" && !g.intersectsExtent(extent)) return;
                if (S.selection.indexOf(f) === -1) S.selection.push(f);
            });
        }
        refreshHighlight();
    }

    function enableSelection() {
        var m = getMap(); if (!m || S.selectActive) return;
        S.selectActive = true; ensureHighlightLayer(); syncPopups();
        S.clickKey = m.on("singleclick", onMapClick);
        if (!S.dragBox) {
            S.dragBox = new ol.interaction.DragBox({ condition: ol.events.condition.shiftKeyOnly, className: "s17-dragbox" });
            S.dragBox.on("boxend", function () { selectByExtent(S.dragBox.getGeometry().getExtent(), true); S.exportMode = "selected"; var el = document.getElementById("s17-mode"); if (el) el.value = "selected"; });
        }
        m.addInteraction(S.dragBox);
        m.getTargetElement().style.cursor = "crosshair";
        updateSelectionUI();
    }

    function disableSelection() {
        var m = getMap(); if (!m || !S.selectActive) return;
        S.selectActive = false;
        if (S.clickKey) { ol.Observable.unByKey(S.clickKey); S.clickKey = null; }
        if (S.dragBox) m.removeInteraction(S.dragBox);
        m.getTargetElement().style.cursor = "";
        syncPopups(); updateSelectionUI();
    }

    function toggleSelection() { S.selectActive ? disableSelection() : enableSelection(); }
    function clearSelection() { S.selection = []; refreshHighlight(); }

    function externalSelection() {
        var m = getMap(), out = []; if (!m) return out;
        m.getInteractions().forEach(function (it) { if (it instanceof ol.interaction.Select) { var c = it.getFeatures(); if (c && c.getArray) c.getArray().forEach(function (f) { if (out.indexOf(f) === -1) out.push(f); }); } });
        var globals = ["selectedFeatures", "selectedFeature", "highlightedFeatures"];
        for (var i = 0; i < globals.length; i++) { var g = window[globals[i]]; if (!g) continue; if (g instanceof ol.Feature) { if (out.indexOf(g) === -1) out.push(g); continue; } if (g && typeof g.getArray === "function") g = g.getArray(); if (Array.isArray(g)) g.forEach(function (f) { if (f instanceof ol.Feature && out.indexOf(f) === -1) out.push(f); }); }
        return out;
    }

    function selectedForCurrentLayer() {
        if (!S.currentLayer) return [];
        var src = S.currentLayer.getSource(); if (!src) return [];
        var all = src.getFeatures();
        var pool = S.selection.slice();
        externalSelection().forEach(function (f) { if (pool.indexOf(f) === -1) pool.push(f); });
        all.forEach(function (f) { if ((f.get("__selected") === true || f.get("selected") === true || f.get("_selected") === true) && pool.indexOf(f) === -1) pool.push(f); });
        return pool.filter(function (f) { return all.indexOf(f) !== -1; });
    }

    /* ========================================================
       9. GEOMETRY / MEASUREMENT HELPERS
       ======================================================== */
    function transformGeom(geom, from, to) { if (!geom) return null; var c = geom.clone(); if (from === to) return c; try { c.transform(from, to); } catch (e) { console.warn("Stage 17: transform " + from + "→" + to + " failed", e); } return c; }
    function geodesicArea(geom, from) { var t = geom.getType(); if (t !== "Polygon" && t !== "MultiPolygon") return null; try { return ol.sphere.getArea(transformGeom(geom, from, "EPSG:4326"), { projection: "EPSG:4326" }); } catch (e) { return null; } }
    function geodesicLength(geom, from) { var t = geom.getType(); if (["Polygon", "MultiPolygon", "LineString", "MultiLineString"].indexOf(t) === -1) return null; try { return ol.sphere.getLength(transformGeom(geom, from, "EPSG:4326"), { projection: "EPSG:4326" }); } catch (e) { return null; } }
    function labelPointOf(geom) { if (!geom) return null; var t = geom.getType(); try { if (t === "Polygon") return geom.getInteriorPoint().getCoordinates().slice(0, 2); if (t === "MultiPolygon") { var polys = geom.getPolygons(), best = null, bestA = -1; for (var i = 0; i < polys.length; i++) { var a = polys[i].getArea(); if (a > bestA) { bestA = a; best = polys[i]; } } if (best) return best.getInteriorPoint().getCoordinates().slice(0, 2); } if (t === "Point") return geom.getCoordinates().slice(0, 2); if (t === "MultiPoint") return geom.getPoint(0).getCoordinates().slice(0, 2); if (t === "LineString") return geom.getCoordinateAt(0.5).slice(0, 2); if (t === "MultiLineString") return geom.getLineString(0).getCoordinateAt(0.5).slice(0, 2); } catch (e) {} var e2 = geom.getExtent(); return [(e2[0] + e2[2]) / 2, (e2[1] + e2[3]) / 2]; }
    function areaBreakdown(m2) { if (m2 === null || m2 === undefined || isNaN(m2)) return {}; var d = CONFIG.areaDecimals; return { Area_m2: +(m2).toFixed(d), Area_ha: +(m2 / 10000).toFixed(d), Area_acre: +(m2 / 4046.8564224).toFixed(d), Area_cent: +(m2 / 40.468564224).toFixed(d), Area_sqft: +(m2 * 10.763910417).toFixed(d) }; }
    function num(v, d) { if (v === null || v === undefined || v === "" || isNaN(v)) return ""; return +Number(v).toFixed(d === undefined ? CONFIG.coordDecimals : d); }

    /* ========================================================
       10. STYLE EXTRACTION
       ======================================================== */
    var _colorCanvas = null;
    function parseColor(c) { if (c === null || c === undefined) return null; try { if (Array.isArray(c)) return { r: c[0] | 0, g: c[1] | 0, b: c[2] | 0, a: (c.length > 3 ? c[3] : 1) }; if (typeof c === "string") { if (ol.color && typeof ol.color.asArray === "function") { var a = ol.color.asArray(c); return { r: a[0], g: a[1], b: a[2], a: (a.length > 3 ? a[3] : 1) }; } if (!_colorCanvas) { _colorCanvas = document.createElement("canvas"); _colorCanvas.width = _colorCanvas.height = 1; } var ctx = _colorCanvas.getContext("2d"); ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = "#000000"; ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1); var d = ctx.getImageData(0, 0, 1, 1).data; return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 }; } } catch (e) {} return null; }
    function hx(n) { n = Math.max(0, Math.min(255, Math.round(n || 0))); return (n < 16 ? "0" : "") + n.toString(16); }
    function partsToHex(p) { return p ? "#" + hx(p.r) + hx(p.g) + hx(p.b) : null; }
    function partsToKml(p, mul) { if (!p) return "ff000000"; var a = Math.round(Math.max(0, Math.min(1, (p.a === undefined ? 1 : p.a) * (mul === undefined ? 1 : mul))) * 255); return (hx(a) + hx(p.b) + hx(p.g) + hx(p.r)).toLowerCase(); }
    function resolveStyles(feature, layer, res) { var s = null; try { var fsf = feature.getStyleFunction && feature.getStyleFunction(); if (fsf) s = fsf(feature, res); if (!s) { var fs = feature.getStyle && feature.getStyle(); if (fs) s = (typeof fs === "function") ? fs(feature, res) : fs; } } catch (e) {} if (!s && layer) { try { var lsf = layer.getStyleFunction && layer.getStyleFunction(); if (lsf) s = lsf(feature, res); if (!s) { var lst = layer.getStyle && layer.getStyle(); if (lst) s = (typeof lst === "function") ? lst(feature, res) : lst; } } catch (e) {} } if (!s) return null; return Array.isArray(s) ? s : [s]; }
    function extractSymbol(feature, layer, res) { var styles = resolveStyles(feature, layer, res); if (!styles || !styles.length) return null; var sym = { fill: null, stroke: null, width: null, radius: null, icon: null, iconScale: 1, textColor: null, textScale: 1, text: "", opacity: (layer && layer.getOpacity) ? layer.getOpacity() : 1 }; for (var i = 0; i < styles.length; i++) { var st = styles[i]; if (!st) continue; try { var f = st.getFill && st.getFill(); if (f && !sym.fill) { var c = parseColor(f.getColor()); if (c) sym.fill = c; } var s2 = st.getStroke && st.getStroke(); if (s2 && !sym.stroke) { var c2 = parseColor(s2.getColor()); if (c2) { sym.stroke = c2; sym.width = s2.getWidth() || 1; } } var im = st.getImage && st.getImage(); if (im && !sym.icon && sym.radius === null) { if (typeof im.getSrc === "function" && im.getSrc()) { sym.icon = im.getSrc(); sym.iconScale = im.getScale() || 1; } else if (typeof im.getRadius === "function") { sym.radius = im.getRadius() || 5; var iF = im.getFill && im.getFill(); if (iF) { var c3 = parseColor(iF.getColor()); if (c3 && !sym.fill) sym.fill = c3; } var iS = im.getStroke && im.getStroke(); if (iS) { var c4 = parseColor(iS.getColor()); if (c4 && !sym.stroke) { sym.stroke = c4; sym.width = iS.getWidth() || 1; } } } } var tx = st.getText && st.getText(); if (tx) { var tf = tx.getFill && tx.getFill(); if (tf) { var c5 = parseColor(tf.getColor()); if (c5) sym.textColor = c5; } sym.textScale = (typeof tx.getScale === "function") ? (tx.getScale() || 1) : 1; sym.text = (typeof tx.getText === "function") ? (tx.getText() || "") : ""; } } catch (e) {} } if (!sym.fill && !sym.stroke && !sym.icon && sym.radius === null) return null; return sym; }
    function symKey(sym, kind) { if (!sym) return kind + "|default"; return [kind, partsToHex(sym.fill), sym.fill ? sym.fill.a : "", partsToHex(sym.stroke), sym.stroke ? sym.stroke.a : "", sym.width, sym.radius, sym.icon, sym.iconScale, sym.opacity].join("|"); }

    /* ========================================================
       11. LABEL TEXT RESOLVER
       ======================================================== */
    function getLabelFieldChoice() {
        var el = document.getElementById("s17-label-field");
        return el ? el.value : "__AUTO__";
    }

    function getCustomLabelText() {
        var el = document.getElementById("s17-label-custom");
        return el ? el.value.trim() : "";
    }

    function resolveLabelText(feature, exportId, sym, props) {
        var choice = getLabelFieldChoice();

        // Style text override (from the OL style itself)
        if (choice === "__STYLE__" && sym && sym.text) {
            return String(sym.text);
        }

        // Custom fixed text
        if (choice === "__CUSTOM__") {
            var custom = getCustomLabelText();
            return custom || ("F" + exportId);
        }

        // Export_ID
        if (choice === "__EXPORT_ID__") {
            return "F" + exportId;
        }

        // Specific field
        if (choice !== "__AUTO__" && choice !== "__STYLE__") {
            var val = props[choice];
            if (val !== undefined && val !== null && val !== "") return String(val);
            return "F" + exportId;
        }

        // Auto: try style text first, then preferred fields, then Export_ID
        if (sym && sym.text) return String(sym.text);

        for (var i = 0; i < CONFIG.preferredLabelFields.length; i++) {
            var key = CONFIG.preferredLabelFields[i];
            if (props[key] !== undefined && props[key] !== null && props[key] !== "") {
                return String(props[key]);
            }
        }

        return "F" + exportId;
    }

    /* ========================================================
       12. RECORD BUILDER
       ======================================================== */
    function checked(id) { var el = document.getElementById(id); return el ? el.checked : false; }

    function selectedFields() {
        var cbs = document.querySelectorAll("#s17-fields .s17-field input[type=checkbox]");
        var out = [];
        for (var i = 0; i < cbs.length; i++) { if (cbs[i].checked && cbs[i].dataset.field) out.push(cbs[i].dataset.field); }
        return out;
    }

    function targetCRS() {
        if (S.exportCRS === "current") return mapCRS();
        if (S.exportCRS === "custom") {
            var el = document.getElementById("s17-custom-crs");
            var v = el ? el.value.trim() : "";
            if (!v) return null;
            if (v.toUpperCase().indexOf("EPSG:") !== 0) v = "EPSG:" + v;
            v = v.toUpperCase();
            if (!ol.proj.get(v)) throw new Error(v + " is not registered.");
            return v;
        }
        if (!ol.proj.get(S.exportCRS)) throw new Error(S.exportCRS + " is not available.");
        return S.exportCRS;
    }

    function buildRecords(features, tCRS) {
        var fields = selectedFields();
        var src = mapCRS();
        var m = getMap();
        var res = m ? m.getView().getResolution() : 1;
        var wantArea = checked("s17-area"), wantPerim = checked("s17-perimeter");
        var wantCentroid = checked("s17-centroid"), wantXY = checked("s17-coords");
        var wantLabels = checked("s17-labels"), keepStyle = checked("s17-style");
        var records = [];

        for (var i = 0; i < features.length; i++) {
            var f = features[i], geomSrc = f.getGeometry();
            if (!geomSrc) continue;
            var type = geomSrc.getType(), geomOut = transformGeom(geomSrc, src, tCRS);
            var props = f.getProperties(), rec = {};
            rec.Export_ID = i + 1;

            for (var k = 0; k < fields.length; k++) {
                var key = fields[k], val = props[key];
                if (val === undefined || val === null) val = "";
                else if (val instanceof ol.geom.Geometry) continue;
                else if (val instanceof Date) val = val.toISOString();
                else if (typeof val === "object") { try { val = JSON.stringify(val); } catch (e) { val = String(val); } }
                rec[key] = val;
            }

            if (wantArea && (type === "Polygon" || type === "MultiPolygon")) {
                var ab = areaBreakdown(geodesicArea(geomSrc, src));
                for (var ak in ab) if (ab.hasOwnProperty(ak)) rec[ak] = ab[ak];
            }

            if (wantPerim) {
                var len = geodesicLength(geomSrc, src);
                if (len !== null) rec[(type === "Polygon" || type === "MultiPolygon") ? "Perimeter_m" : "Length_m"] = num(len, 3);
            }

            var lblMap = labelPointOf(geomSrc), lblTgt = null;
            if (lblMap) lblTgt = transformGeom(new ol.geom.Point(lblMap), src, tCRS).getCoordinates();

            if (wantCentroid && lblTgt) { rec.Centroid_X = num(lblTgt[0]); rec.Centroid_Y = num(lblTgt[1]); }

            if (wantXY) {
                if (type === "Point") { var c = geomOut.getCoordinates(); rec.X = num(c[0]); rec.Y = num(c[1]); if (c.length > 2) rec.Z = num(c[2], 3); }
                else if (type === "MultiPoint") { var c2 = geomOut.getPoint(0).getCoordinates(); rec.X = num(c2[0]); rec.Y = num(c2[1]); }
            }

            var sym = null;
            if (keepStyle) { var lyr = findFeatureLayer(f) || S.currentLayer; sym = extractSymbol(f, lyr, res); }

            // ★ Use the label field dropdown
            var labelText = resolveLabelText(f, rec.Export_ID, sym, props);

            if (wantLabels && lblTgt) { rec.Label = labelText; rec.Label_X = num(lblTgt[0]); rec.Label_Y = num(lblTgt[1]); }

            records.push({
                srcGeom: geomSrc, geometry: geomOut, labelMap: lblMap, labelTgt: lblTgt,
                labelText: labelText, geomType: type, style: sym, properties: rec
            });
        }
        return records;
    }

    /* ========================================================
       13. DOWNLOAD HELPERS
       ======================================================== */
    function downloadBlob(blob, filename) { if (typeof blob === "string") { try { var bin = atob(blob), arr = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); blob = new Blob([arr], { type: "application/zip" }); } catch (e) { blob = new Blob([blob], { type: "application/octet-stream" }); } } var url = URL.createObjectURL(blob); var a = document.createElement("a"); a.href = url; a.download = filename; a.style.display = "none"; document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(function () { URL.revokeObjectURL(url); }, 3000); }
    function downloadText(text, filename, mime) { downloadBlob(new Blob([text], { type: mime + ";charset=utf-8" }), filename); }
    function loadScript(urls, globalName) { return new Promise(function (resolve, reject) { if (window[globalName]) return resolve(window[globalName]); var i = 0; (function next() { if (i >= urls.length) return reject(new Error("Could not load " + globalName)); var s = document.createElement("script"); s.src = urls[i++]; s.async = true; s.onload = function () { window[globalName] ? resolve(window[globalName]) : next(); }; s.onerror = next; document.head.appendChild(s); })(); }); }
    function baseName() { var n = S.currentLayer ? layerName(S.currentLayer) : "export"; return n.replace(/[^a-zA-Z0-9_\-]/g, "_").substring(0, 45) || "export"; }

    /* ========================================================
       14. ALL EXPORTERS (GeoJSON / JSON / CSV / WKT / KML / KMZ / DXF / SHP)
       --------------------------------------------------------
       IDENTICAL to v5.0 — all exporter code unchanged.
       ======================================================== */
    function applySimpleStyle(f, sym) { if (!sym) return; var op = sym.opacity === undefined ? 1 : sym.opacity; if (sym.fill) { f.set("fill", partsToHex(sym.fill)); f.set("fill-opacity", +((sym.fill.a === undefined ? 1 : sym.fill.a) * op).toFixed(3)); f.set("marker-color", partsToHex(sym.fill)); } if (sym.stroke) { f.set("stroke", partsToHex(sym.stroke)); f.set("stroke-opacity", +((sym.stroke.a === undefined ? 1 : sym.stroke.a) * op).toFixed(3)); f.set("stroke-width", sym.width || 1); } if (sym.radius) f.set("marker-radius", sym.radius); }
    function recordsToOlFeatures(records, includeLabels, keepStyle) { var out = []; for (var i = 0; i < records.length; i++) { var r = records[i], f = new ol.Feature({ geometry: r.geometry.clone() }); for (var k in r.properties) if (r.properties.hasOwnProperty(k)) f.set(k, r.properties[k]); if (keepStyle) applySimpleStyle(f, r.style); out.push(f); } if (includeLabels) { for (var j = 0; j < records.length; j++) { var rr = records[j]; if (!rr.labelTgt) continue; var lf = new ol.Feature({ geometry: new ol.geom.Point(rr.labelTgt) }); lf.set("Export_ID", rr.properties.Export_ID); lf.set("Label", rr.labelText); lf.set("FeatureType", "LABEL_POINT"); lf.set("marker-opacity", 0); out.push(lf); } } return out; }
    function exportGeoJSON(records, tCRS) { var fmt = new ol.format.GeoJSON(); var feats = recordsToOlFeatures(records, checked("s17-labels"), checked("s17-style")); var gj = fmt.writeFeaturesObject(feats, { featureProjection: tCRS, dataProjection: tCRS, decimals: CONFIG.coordDecimals }); gj.crs = { type: "name", properties: { name: tCRS } }; downloadText(JSON.stringify(gj, null, 2), baseName() + ".geojson", "application/geo+json"); }
    function exportJSON(records, tCRS) { var out = { type: "Stage17Export", crs: tCRS, exported: new Date().toISOString(), layer: S.currentLayer ? layerName(S.currentLayer) : "", count: records.length, features: records.map(function (r) { return { geometryType: r.geomType, coordinates: r.geometry.getCoordinates(), labelPoint: r.labelTgt, label: r.labelText, style: r.style ? { fill: partsToHex(r.style.fill), fillOpacity: r.style.fill ? r.style.fill.a : null, stroke: partsToHex(r.style.stroke), strokeOpacity: r.style.stroke ? r.style.stroke.a : null, strokeWidth: r.style.width } : null, properties: r.properties }; }) }; downloadText(JSON.stringify(out, null, 2), baseName() + ".json", "application/json"); }
    function csvCell(v) { if (v === null || v === undefined) return ""; var t = String(v); if (/[",\r\n;]/.test(t)) t = '"' + t.replace(/"/g, '""') + '"'; return t; }
    function allKeys(records) { var set = {}, order = []; records.forEach(function (r) { Object.keys(r.properties).forEach(function (k) { if (!set[k]) { set[k] = 1; order.push(k); } }); }); return order; }
    function exportCSV(records) { var keys = allKeys(records), lines = [keys.map(csvCell).join(",")]; records.forEach(function (r) { lines.push(keys.map(function (k) { return csvCell(r.properties[k]); }).join(",")); }); downloadText("\uFEFF" + lines.join("\r\n"), baseName() + ".csv", "text/csv"); }
    function exportWKT(records) { var fmt = new ol.format.WKT(), keys = allKeys(records); var lines = [["WKT"].concat(keys).map(csvCell).join(",")]; records.forEach(function (r) { var row = [csvCell(fmt.writeGeometry(r.geometry))]; keys.forEach(function (k) { row.push(csvCell(r.properties[k])); }); lines.push(row.join(",")); }); downloadText("\uFEFF" + lines.join("\r\n"), baseName() + "_wkt.csv", "text/csv"); }

    // KML/KMZ
    function xmlEsc(s) { return String(s === null || s === undefined ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;"); }
    function kmlCoord(c) { return Number(c[0]).toFixed(CONFIG.coordDecimals) + "," + Number(c[1]).toFixed(CONFIG.coordDecimals) + "," + ((c.length > 2 && !isNaN(c[2])) ? Number(c[2]).toFixed(2) : "0"); }
    function kmlCoordList(arr) { var o = []; for (var i = 0; i < arr.length; i++) o.push(kmlCoord(arr[i])); return o.join(" "); }
    function kmlRing(ring) { return "<LinearRing><coordinates>" + kmlCoordList(ring) + "</coordinates></LinearRing>"; }
    function kmlPolygonBody(rings) { var s = "<Polygon><tessellate>1</tessellate><altitudeMode>clampToGround</altitudeMode>"; s += "<outerBoundaryIs>" + kmlRing(rings[0]) + "</outerBoundaryIs>"; for (var i = 1; i < rings.length; i++) s += "<innerBoundaryIs>" + kmlRing(rings[i]) + "</innerBoundaryIs>"; return s + "</Polygon>"; }
    function geomToKML(g) { var t = g.getType(), parts; switch (t) { case "Point": return "<Point><altitudeMode>clampToGround</altitudeMode><coordinates>" + kmlCoord(g.getCoordinates()) + "</coordinates></Point>"; case "LineString": return "<LineString><tessellate>1</tessellate><altitudeMode>clampToGround</altitudeMode><coordinates>" + kmlCoordList(g.getCoordinates()) + "</coordinates></LineString>"; case "LinearRing": return kmlRing(g.getCoordinates()); case "Polygon": return kmlPolygonBody(g.getCoordinates()); case "MultiPoint": parts = g.getCoordinates().map(function (c) { return "<Point><coordinates>" + kmlCoord(c) + "</coordinates></Point>"; }); return "<MultiGeometry>" + parts.join("") + "</MultiGeometry>"; case "MultiLineString": parts = g.getCoordinates().map(function (ls) { return "<LineString><tessellate>1</tessellate><coordinates>" + kmlCoordList(ls) + "</coordinates></LineString>"; }); return "<MultiGeometry>" + parts.join("") + "</MultiGeometry>"; case "MultiPolygon": parts = g.getCoordinates().map(function (rings) { return kmlPolygonBody(rings); }); return "<MultiGeometry>" + parts.join("") + "</MultiGeometry>"; case "GeometryCollection": return "<MultiGeometry>" + g.getGeometries().map(geomToKML).join("") + "</MultiGeometry>"; default: return ""; } }
    function kmlExtendedData(props) { var s = "<ExtendedData>"; for (var k in props) { if (!props.hasOwnProperty(k)) continue; s += '<Data name="' + xmlEsc(k) + '"><value>' + xmlEsc(props[k]) + "</value></Data>"; } return s + "</ExtendedData>"; }
    function kmlDescription(props) { var rows = ""; for (var k in props) { if (!props.hasOwnProperty(k)) continue; rows += '<tr><td style="padding:2px 8px;background:#f0f0f0;"><b>' + xmlEsc(k) + '</b></td><td style="padding:2px 8px;">' + xmlEsc(props[k]) + "</td></tr>"; } return "<![CDATA[<table style='border-collapse:collapse;font-family:Arial;font-size:12px;'>" + rows + "</table>]]>"; }
    function kmlColor(hex, alpha) { hex = (hex || "#ffff00").replace("#", ""); if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]; var r = hex.substr(0, 2), g = hex.substr(2, 2), b = hex.substr(4, 2); var a = hx(Math.round(Math.max(0, Math.min(1, alpha === undefined ? 1 : alpha)) * 255)); return (a + b + g + r).toLowerCase(); }
    function kmlStyleBlock(id, sym, kind) { var x = '<Style id="' + id + '">'; var op = (sym && sym.opacity !== undefined) ? sym.opacity : 1; var lineColor = (sym && sym.stroke) ? partsToKml(sym.stroke, op) : "ff0000ff"; var lineWidth = (sym && sym.width) ? Math.max(1, sym.width) : 2; if (kind === "A") { x += "<LineStyle><color>" + lineColor + "</color><width>" + lineWidth + "</width></LineStyle>"; if (sym && sym.fill) x += "<PolyStyle><color>" + partsToKml(sym.fill, op) + "</color><fill>1</fill><outline>1</outline></PolyStyle>"; else if (sym) x += "<PolyStyle><fill>0</fill><outline>1</outline></PolyStyle>"; else x += "<PolyStyle><color>4d00ffff</color><fill>1</fill><outline>1</outline></PolyStyle>"; } else if (kind === "L") { x += "<LineStyle><color>" + lineColor + "</color><width>" + lineWidth + "</width></LineStyle>"; } else { var href = "http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png"; var scale = sym && sym.radius ? Math.max(0.4, Math.min(3, sym.radius / 8)) : 1.0; var color = (sym && sym.fill) ? partsToKml(sym.fill, op) : "ff00a5ff"; x += "<IconStyle><color>" + color + "</color><scale>" + scale + "</scale><Icon><href>" + xmlEsc(href) + "</href></Icon>" + '<hotSpot x="0.5" y="0.5" xunits="fraction" yunits="fraction"/></IconStyle>'; if (sym && sym.stroke) x += "<LineStyle><color>" + lineColor + "</color><width>" + lineWidth + "</width></LineStyle>"; } x += "<BalloonStyle><text>$[description]</text></BalloonStyle>"; return x + "</Style>"; }
    function buildKML(records, opts) { opts = opts || {}; var src = mapCRS(), withLabels = !!opts.labels, keepStyle = !!opts.keepStyle; var uiColor = "#ffff00", uiScale = 1.0, docName = opts.name || baseName(); var styleDefs = [], styleMap = {}, sCount = 0; var labelDefs = [], labelMap2 = {}, lCount = 0; function styleIdFor(sym, geomType) { var kind = geomType.indexOf("Polygon") !== -1 ? "A" : geomType.indexOf("Line") !== -1 ? "L" : "P"; var key = symKey(keepStyle ? sym : null, kind); if (styleMap[key]) return styleMap[key]; var id = "s17sty" + (sCount++); styleMap[key] = id; styleDefs.push(kmlStyleBlock(id, keepStyle ? sym : null, kind)); return id; } function labelIdFor(hexColor, scale) { var key = hexColor + "|" + scale; if (labelMap2[key]) return labelMap2[key]; var id = "s17lbl" + (lCount++); labelMap2[key] = id; labelDefs.push('<Style id="' + id + '"><IconStyle><color>00ffffff</color><scale>0.3</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/shaded_dot.png</href></Icon><hotSpot x="0.5" y="0.5" xunits="fraction" yunits="fraction"/></IconStyle><LabelStyle><color>' + kmlColor(hexColor, 1) + '</color><scale>' + scale + '</scale></LabelStyle><BalloonStyle><text>$[description]</text></BalloonStyle></Style>'); return id; } var body = []; body.push("<Folder><name>" + xmlEsc(docName) + " — Features</name><open>1</open>"); for (var i = 0; i < records.length; i++) { var r = records[i], g4326 = transformGeom(r.srcGeom, src, "EPSG:4326"); if (!g4326) continue; var sid = styleIdFor(r.style, r.geomType); body.push("<Placemark><name>" + xmlEsc(r.labelText) + "</name><description>" + kmlDescription(r.properties) + "</description><styleUrl>#" + sid + "</styleUrl>" + kmlExtendedData(r.properties) + geomToKML(g4326) + "</Placemark>"); } body.push("</Folder>"); if (withLabels) { body.push("<Folder><name>Labels (centroid points)</name><open>0</open>"); for (var j = 0; j < records.length; j++) { var rec = records[j]; if (!rec.labelMap) continue; var p4326 = transformGeom(new ol.geom.Point(rec.labelMap), src, "EPSG:4326"), c = p4326.getCoordinates(); var col = uiColor, scale = uiScale; if (keepStyle && rec.style) { if (rec.style.textColor) col = partsToHex(rec.style.textColor) || uiColor; if (rec.style.textScale) scale = rec.style.textScale; } var lid = labelIdFor(col, scale); body.push("<Placemark><name>" + xmlEsc(rec.labelText) + "</name><description>" + kmlDescription(rec.properties) + "</description><styleUrl>#" + lid + '</styleUrl><ExtendedData><Data name="FeatureType"><value>LABEL_POINT</value></Data><Data name="Export_ID"><value>' + xmlEsc(rec.properties.Export_ID) + "</value></Data></ExtendedData><Point><altitudeMode>clampToGround</altitudeMode><coordinates>" + kmlCoord(c) + "</coordinates></Point></Placemark>"); } body.push("</Folder>"); } var K = ['<?xml version="1.0" encoding="UTF-8"?>', '<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">', "<Document>", "<name>" + xmlEsc(docName) + "</name>", "<description>" + xmlEsc("Exported " + new Date().toLocaleString() + " — " + records.length + " feature(s)") + "</description>"]; K = K.concat(styleDefs).concat(labelDefs).concat(body); K.push("</Document></kml>"); return K.join("\n"); }
    function kmlOptions() { return { labels: checked("s17-labels"), keepStyle: checked("s17-style") }; }
    function exportKML(records) { downloadText(buildKML(records, kmlOptions()), baseName() + ".kml", "application/vnd.google-earth.kml+xml"); }
    function exportKMZ(records) { return loadScript(CONFIG.jszipCDN, "JSZip").then(function (JSZip) { var kml = buildKML(records, kmlOptions()), zip = new JSZip(); zip.file("doc.kml", kml); return zip.generateAsync({ type: "blob", mimeType: "application/vnd.google-earth.kmz", compression: "DEFLATE", compressionOptions: { level: 9 } }); }).then(function (blob) { downloadBlob(blob, baseName() + ".kmz"); }); }

    // DXF
    var ACI_TABLE=[[0,0,0],[255,0,0],[255,255,0],[0,255,0],[0,255,255],[0,0,255],[255,0,255],[255,255,255],[128,128,128],[192,192,192],[255,0,0],[255,127,127],[165,0,0],[165,82,82],[127,0,0],[127,63,63],[76,0,0],[76,38,38],[38,0,0],[38,19,19],[255,63,0],[255,159,127],[165,41,0],[165,103,82],[127,31,0],[127,79,63],[76,19,0],[76,47,38],[38,9,0],[38,23,19],[255,127,0],[255,191,127],[165,82,0],[165,124,82],[127,63,0],[127,95,63],[76,38,0],[76,57,38],[38,19,0],[38,28,19],[255,191,0],[255,223,127],[165,124,0],[165,145,82],[127,95,0],[127,111,63],[76,57,0],[76,66,38],[38,28,0],[38,33,19],[255,255,0],[255,255,127],[165,165,0],[165,165,82],[127,127,0],[127,127,63],[76,76,0],[76,76,38],[38,38,0],[38,38,19],[191,255,0],[223,255,127],[124,165,0],[145,165,82],[95,127,0],[111,127,63],[57,76,0],[66,76,38],[28,38,0],[33,38,19],[127,255,0],[191,255,127],[82,165,0],[124,165,82],[63,127,0],[95,127,63],[38,76,0],[57,76,38],[19,38,0],[28,38,19],[63,255,0],[159,255,127],[41,165,0],[103,165,82],[31,127,0],[79,127,63],[19,76,0],[47,76,38],[9,38,0],[23,38,19],[0,255,0],[127,255,127],[0,165,0],[82,165,82],[0,127,0],[63,127,63],[0,76,0],[38,76,38],[0,38,0],[19,38,19],[0,255,63],[127,255,159],[0,165,41],[82,165,103],[0,127,31],[63,127,79],[0,76,19],[38,76,47],[0,38,9],[19,38,23],[0,255,127],[127,255,191],[0,165,82],[82,165,124],[0,127,63],[63,127,95],[0,76,38],[38,76,57],[0,38,19],[19,38,28],[0,255,191],[127,255,223],[0,165,124],[82,165,145],[0,127,95],[63,127,111],[0,76,57],[38,76,66],[0,38,28],[19,38,33],[0,255,255],[127,255,255],[0,165,165],[82,165,165],[0,127,127],[63,127,127],[0,76,76],[38,76,76],[0,38,38],[19,38,38],[0,191,255],[127,223,255],[0,124,165],[82,145,165],[0,95,127],[63,111,127],[0,57,76],[38,66,76],[0,28,38],[19,33,38],[0,127,255],[127,191,255],[0,82,165],[82,124,165],[0,63,127],[63,95,127],[0,38,76],[38,57,76],[0,19,38],[19,28,38],[0,63,255],[127,159,255],[0,41,165],[82,103,165],[0,31,127],[63,79,127],[0,19,76],[38,47,76],[0,9,38],[19,23,38],[0,0,255],[127,127,255],[0,0,165],[82,82,165],[0,0,127],[63,63,127],[0,0,76],[38,38,76],[0,0,38],[19,19,38],[63,0,255],[159,127,255],[41,0,165],[103,82,165],[31,0,127],[79,63,127],[19,0,76],[47,38,76],[9,0,38],[23,19,38],[127,0,255],[191,127,255],[82,0,165],[124,82,165],[63,0,127],[95,63,127],[38,0,76],[57,38,76],[19,0,38],[28,19,38],[191,0,255],[223,127,255],[124,0,165],[145,82,165],[95,0,127],[111,63,127],[57,0,76],[66,38,76],[28,0,38],[33,19,38],[255,0,255],[255,127,255],[165,0,165],[165,82,165],[127,0,127],[127,63,127],[76,0,76],[76,38,76],[38,0,38],[38,19,38],[255,0,191],[255,127,223],[165,0,124],[165,82,145],[127,0,95],[127,63,111],[76,0,57],[76,38,66],[38,0,28],[38,19,33],[255,0,127],[255,127,191],[165,0,82],[165,82,124],[127,0,63],[127,63,95],[76,0,38],[76,38,57],[38,0,19],[38,19,28],[255,0,63],[255,127,159],[165,0,41],[165,82,103],[127,0,31],[127,63,79],[76,0,19],[76,38,47],[38,0,9],[38,19,23],[84,84,84],[118,118,118],[152,152,152],[186,186,186],[220,220,220],[255,255,255]];
    function nearestACI(p) { if (!p) return 7; var best = 7, bestD = Infinity; for (var i = 1; i < ACI_TABLE.length; i++) { var t = ACI_TABLE[i]; var d = Math.pow(t[0] - p.r, 2) + Math.pow(t[1] - p.g, 2) + Math.pow(t[2] - p.b, 2); if (d < bestD) { bestD = d; best = i; } if (d === 0) break; } return best; }
    function dxfHeader() { return ["0","SECTION","2","HEADER","9","$ACADVER","1","AC1009","9","$INSUNITS","70","6","0","ENDSEC"].join("\n"); }
    function dxfTables(layerNames) { var t = ["0","SECTION","2","TABLES"]; t.push("0","TABLE","2","LTYPE","70","1"); t.push("0","LTYPE","2","CONTINUOUS","70","64","3","Solid line","72","65","73","0","40","0.0"); t.push("0","ENDTAB"); t.push("0","TABLE","2","LAYER","70",String(layerNames.length)); for (var i = 0; i < layerNames.length; i++) { t.push("0","LAYER","2",layerNames[i],"70","64","62","7","6","CONTINUOUS"); } t.push("0","ENDTAB"); t.push("0","TABLE","2","APPID","70","1"); t.push("0","APPID","2","STAGE17","70","64"); t.push("0","ENDTAB"); t.push("0","ENDSEC"); return t.join("\n"); }
    function dxfPolyline(coords, closed, lyr, col, props) { var l = ["0","POLYLINE","8",lyr,"62",String(col),"66","1","70",closed?"1":"0","10","0.0","20","0.0","30","0.0"]; if (props) l.push(dxfXdata(props)); for (var i = 0; i < coords.length; i++) { l.push("0","VERTEX","8",lyr,"62",String(col),"10",coords[i][0].toFixed(CONFIG.coordDecimals),"20",coords[i][1].toFixed(CONFIG.coordDecimals),"30","0.0"); } l.push("0","SEQEND","8",lyr); return l.join("\n"); }
    function dxfPointEntity(x, y, z, lyr, col, props) { var zv = (z !== undefined && z !== null && !isNaN(z)) ? z : 0.0; var l = ["0","POINT","8",lyr,"62",String(col),"10",x.toFixed(CONFIG.coordDecimals),"20",y.toFixed(CONFIG.coordDecimals),"30",zv.toFixed(3)]; if (props) l.push(dxfXdata(props)); return l.join("\n"); }
    function dxfCircle(x, y, radius, lyr, col, props) { var l = ["0","CIRCLE","8",lyr,"62",String(col),"10",x.toFixed(CONFIG.coordDecimals),"20",y.toFixed(CONFIG.coordDecimals),"30","0.0","40",radius.toFixed(3)]; if (props) l.push(dxfXdata(props)); return l.join("\n"); }
    function dxfText(x, y, text, height, lyr, col) { var escaped = String(text).replace(/\\/g, "\\\\"); return ["0","TEXT","8",lyr,"62",String(col),"10",x.toFixed(CONFIG.coordDecimals),"20",y.toFixed(CONFIG.coordDecimals),"30","0.0","40",height.toFixed(3),"1",escaped,"72","4","11",x.toFixed(CONFIG.coordDecimals),"21",y.toFixed(CONFIG.coordDecimals),"31","0.0"].join("\n"); }
    function dxfXdata(props) { var l = []; l.push("1001","STAGE17"); for (var k in props) { if (!props.hasOwnProperty(k)) continue; l.push("1000",String(k) + "=" + String(props[k] === undefined ? "" : props[k])); } return l.join("\n"); }
    function exportDXF(records, tCRS) { var keepStyle = checked("s17-style"); var wantLabels = checked("s17-labels"); var lyrF = baseName().substring(0, 31) || "Features"; var lyrL = "Labels"; var names = [lyrF]; if (wantLabels) names.push(lyrL); var entities = []; for (var i = 0; i < records.length; i++) { var r = records[i]; var geom = r.geometry; var type = r.geomType; var sym = r.style; var sc = (keepStyle && sym && sym.stroke) ? nearestACI(sym.stroke) : 7; var fc = (keepStyle && sym && sym.fill) ? nearestACI(sym.fill) : 3; var tc = (keepStyle && sym && sym.textColor) ? nearestACI(sym.textColor) : 7; function addP(coords, closed) { entities.push(dxfPolyline(coords, closed, lyrF, sc, r.properties)); } function addPoly(rings) { for (var ri = 0; ri < rings.length; ri++) addP(rings[ri], true); } if (type === "Point") { var c = geom.getCoordinates(); if (sym && sym.radius) entities.push(dxfCircle(c[0], c[1], sym.radius, lyrF, fc, r.properties)); else entities.push(dxfPointEntity(c[0], c[1], c[2], lyrF, sc, r.properties)); } else if (type === "MultiPoint") { var pts = geom.getCoordinates(); for (var pi = 0; pi < pts.length; pi++) { if (sym && sym.radius) entities.push(dxfCircle(pts[pi][0], pts[pi][1], sym.radius, lyrF, fc, r.properties)); else entities.push(dxfPointEntity(pts[pi][0], pts[pi][1], pts[pi][2], lyrF, sc, r.properties)); } } else if (type === "LineString") { addP(geom.getCoordinates(), false); } else if (type === "MultiLineString") { var lss = geom.getCoordinates(); for (var li = 0; li < lss.length; li++) addP(lss[li], false); } else if (type === "Polygon") { addPoly(geom.getCoordinates()); } else if (type === "MultiPolygon") { var polys = geom.getCoordinates(); for (var mpi = 0; mpi < polys.length; mpi++) addPoly(polys[mpi]); } if (wantLabels && r.labelTgt) { var ht = 2.0; if (keepStyle && sym && sym.textScale) ht = Math.max(0.5, sym.textScale * 2); entities.push(dxfText(r.labelTgt[0], r.labelTgt[1], r.labelText, ht, lyrL, tc)); } } var dxf = [dxfHeader(), dxfTables(names), "0", "SECTION", "2", "ENTITIES", entities.join("\n"), "0", "ENDSEC", "0", "EOF"].join("\n"); downloadText(dxf, baseName() + ".dxf", "application/dxf"); }

    // SHP
    var PRJ_WGS84 = 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';
    function stringToUtf8Bytes(str) { if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(str); var utf8 = []; for (var i = 0; i < str.length; i++) { var charcode = str.charCodeAt(i); if (charcode < 0x80) utf8.push(charcode); else if (charcode < 0x800) { utf8.push(0xc0 | (charcode >> 6), 0x80 | (charcode & 0x3f)); } else if (charcode < 0xd800 || charcode >= 0xe000) { utf8.push(0xe0 | (charcode >> 12), 0x80 | ((charcode >> 6) & 0x3f), 0x80 | (charcode & 0x3f)); } else { i++; charcode = 0x10000 + (((charcode & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff)); utf8.push(0xf0 | (charcode >> 18), 0x80 | ((charcode >> 12) & 0x3f), 0x80 | ((charcode >> 6) & 0x3f), 0x80 | (charcode & 0x3f)); } } return new Uint8Array(utf8); }
    function sanitizeDbfFields(records) { var seen = {}, fields = []; records.forEach(function (r) { Object.keys(r.properties).forEach(function (k) { if (seen[k]) return; seen[k] = true; var clean = k.replace(/[^a-zA-Z0-9_]/g, "_").substring(0, 10) || "FIELD"; var fn = clean, counter = 1; while (fields.some(function (f) { return f.name === fn; })) { var suffix = String(counter++); fn = clean.substring(0, 10 - suffix.length) + suffix; } var isNum = true, maxBL = 1, maxDec = 0; for (var i = 0; i < records.length; i++) { var val = records[i].properties[k]; if (val !== undefined && val !== null && val !== "") { var bytes = stringToUtf8Bytes(String(val)); if (bytes.length > maxBL) maxBL = bytes.length; if (isNaN(Number(val)) || typeof val === "boolean") isNum = false; else { var parts = String(val).split("."); if (parts.length > 1 && parts[1].length > maxDec) maxDec = parts[1].length; } } } if (isNum && maxBL <= 18) fields.push({ key: k, name: fn, type: 'N', length: Math.min(18, Math.max(10, maxBL + 2)), decimals: Math.min(6, maxDec) }); else fields.push({ key: k, name: fn, type: 'C', length: Math.min(254, Math.max(1, maxBL)), decimals: 0 }); }); }); return fields; }
    function createDbfBuffer(records, fields) { var recordLen = 1; fields.forEach(function (f) { recordLen += f.length; }); var headerLen = 32 + (32 * fields.length) + 1; var totalSize = headerLen + (records.length * recordLen) + 1; var buf = new ArrayBuffer(totalSize); var view = new DataView(buf); var now = new Date(); view.setUint8(0, 0x03); view.setUint8(1, (now.getFullYear() - 1900) & 0xFF); view.setUint8(2, (now.getMonth() + 1) & 0xFF); view.setUint8(3, now.getDate() & 0xFF); view.setUint32(4, records.length, true); view.setUint16(8, headerLen, true); view.setUint16(10, recordLen, true); var fO = 32; fields.forEach(function (f) { for (var i = 0; i < 11; i++) view.setUint8(fO + i, i < f.name.length ? (f.name.charCodeAt(i) & 0x7F) : 0); view.setUint8(fO + 11, f.type.charCodeAt(0)); view.setUint8(fO + 16, f.length); view.setUint8(fO + 17, f.decimals); fO += 32; }); view.setUint8(fO, 0x0D); var rO = headerLen; records.forEach(function (r) { view.setUint8(rO, 0x20); var cO = rO + 1; fields.forEach(function (f) { var val = r.properties[f.key]; var bytes; if (val !== undefined && val !== null) { if (f.type === 'N') { var n = Number(val); var str = isNaN(n) ? "" : n.toFixed(f.decimals); while (str.length < f.length) str = " " + str; bytes = stringToUtf8Bytes(str); } else bytes = stringToUtf8Bytes(String(val)); } else bytes = new Uint8Array(0); if (f.type === 'N') { var pad = f.length - bytes.length; for (var i = 0; i < f.length; i++) view.setUint8(cO + i, i < pad ? 0x20 : bytes[i - pad]); } else { for (var j = 0; j < f.length; j++) view.setUint8(cO + j, j < bytes.length ? bytes[j] : 0x20); } cO += f.length; }); rO += recordLen; }); view.setUint8(rO, 0x1A); return buf; }
    function geomToRings(geom) { var t = geom.getType(), rings = []; if (t === "Polygon") rings = geom.getCoordinates(); else if (t === "MultiPolygon") { var ps = geom.getCoordinates(); for (var p = 0; p < ps.length; p++) for (var r = 0; r < ps[p].length; r++) rings.push(ps[p][r]); } else if (t === "LineString") rings = [geom.getCoordinates()]; else if (t === "MultiLineString") rings = geom.getCoordinates(); return rings; }
    function buildPointShapefile(records, srcCRS) { var n = records.length; var shxS = 100 + n * 8, shpS = 100 + n * 28; var shpB = new ArrayBuffer(shpS), shpV = new DataView(shpB), shxB = new ArrayBuffer(shxS), shxV = new DataView(shxB); var mnX = Infinity, mnY = Infinity, mxX = -Infinity, mxY = -Infinity; var coords = []; for (var i = 0; i < n; i++) { var g = records[i].geometry || records[i].srcGeom; var pt = (g.getType() === "Point") ? g.getCoordinates() : records[i].labelTgt || [0,0]; coords.push(pt); if (pt[0] < mnX) mnX = pt[0]; if (pt[0] > mxX) mxX = pt[0]; if (pt[1] < mnY) mnY = pt[1]; if (pt[1] > mxY) mxY = pt[1]; } if (!n) mnX = mnY = mxX = mxY = 0; function wH(v, bytes) { v.setInt32(0, 9994, false); v.setInt32(24, bytes / 2, false); v.setInt32(28, 1000, true); v.setInt32(32, 1, true); v.setFloat64(36, mnX, true); v.setFloat64(44, mnY, true); v.setFloat64(52, mxX, true); v.setFloat64(60, mxY, true); } wH(shpV, shpS); wH(shxV, shxS); var sO = 100, xO = 100; for (var j = 0; j < n; j++) { var c = coords[j]; shxV.setInt32(xO, sO / 2, false); shxV.setInt32(xO + 4, 10, false); xO += 8; shpV.setInt32(sO, j + 1, false); shpV.setInt32(sO + 4, 10, false); sO += 8; shpV.setInt32(sO, 1, true); shpV.setFloat64(sO + 4, c[0], true); shpV.setFloat64(sO + 12, c[1], true); sO += 20; } return { shp: shpB, shx: shxB }; }
    function buildPolyShapefile(records, srcCRS, isPoly) { var sT = isPoly ? 5 : 3; var n = records.length; var shxS = 100 + n * 8; var parsed = [], tSB = 100; var gMnX = Infinity, gMnY = Infinity, gMxX = -Infinity, gMxY = -Infinity; for (var i = 0; i < n; i++) { var g = transformGeom(records[i].srcGeom, srcCRS, "EPSG:4326"); var raw = geomToRings(g); var parts = [], tP = 0; var rMnX = Infinity, rMnY = Infinity, rMxX = -Infinity, rMxY = -Infinity; for (var pi = 0; pi < raw.length; pi++) { var ring = raw[pi].slice(); if (isPoly && ring.length > 0) { var f = ring[0], l = ring[ring.length - 1]; if (f[0] !== l[0] || f[1] !== l[1]) ring.push([f[0], f[1]]); } if (!ring.length) continue; for (var k = 0; k < ring.length; k++) { var x = ring[k][0], y = ring[k][1]; if (x < rMnX) rMnX = x; if (x > rMxX) rMxX = x; if (y < rMnY) rMnY = y; if (y > rMxY) rMxY = y; } tP += ring.length; parts.push(ring); } if (rMnX < gMnX) gMnX = rMnX; if (rMxX > gMxX) gMxX = rMxX; if (rMnY < gMnY) gMnY = rMnY; if (rMxY > gMxY) gMxY = rMxY; var cB = 44 + (4 * parts.length) + (16 * tP); tSB += (8 + cB); parsed.push({ parts: parts, totalPts: tP, minX: rMnX, minY: rMnY, maxX: rMxX, maxY: rMxY, contentBytes: cB }); } if (!n) gMnX = gMnY = gMxX = gMxY = 0; var shpB = new ArrayBuffer(tSB), shpV = new DataView(shpB), shxB = new ArrayBuffer(shxS), shxV = new DataView(shxB); function wH(v, bytes) { v.setInt32(0, 9994, false); v.setInt32(24, bytes / 2, false); v.setInt32(28, 1000, true); v.setInt32(32, sT, true); v.setFloat64(36, gMnX, true); v.setFloat64(44, gMnY, true); v.setFloat64(52, gMxX, true); v.setFloat64(60, gMxY, true); } wH(shpV, tSB); wH(shxV, shxS); var sO = 100, xO = 100; for (var j = 0; j < n; j++) { var item = parsed[j]; var wO = sO / 2, wC = item.contentBytes / 2; shxV.setInt32(xO, wO, false); shxV.setInt32(xO + 4, wC, false); xO += 8; shpV.setInt32(sO, j + 1, false); shpV.setInt32(sO + 4, wC, false); sO += 8; shpV.setInt32(sO, sT, true); shpV.setFloat64(sO + 4, item.minX, true); shpV.setFloat64(sO + 12, item.minY, true); shpV.setFloat64(sO + 20, item.maxX, true); shpV.setFloat64(sO + 28, item.maxY, true); shpV.setInt32(sO + 36, item.parts.length, true); shpV.setInt32(sO + 40, item.totalPts, true); var pIO = sO + 44, ptO = pIO + (4 * item.parts.length), rI = 0; for (var pI = 0; pI < item.parts.length; pI++) { shpV.setInt32(pIO + (4 * pI), rI, true); var pR = item.parts[pI]; for (var ptI = 0; ptI < pR.length; ptI++) { shpV.setFloat64(ptO, pR[ptI][0], true); shpV.setFloat64(ptO + 8, pR[ptI][1], true); ptO += 16; rI++; } } sO += item.contentBytes; } return { shp: shpB, shx: shxB }; }
    function exportSHP(records) { return loadScript(CONFIG.jszipCDN, "JSZip").then(function (JSZip) { var src = mapCRS(); var zip = new JSZip(); var bN = baseName(); var polys = [], lines = [], points = []; records.forEach(function (r) { var t = r.geomType; if (t === "Polygon" || t === "MultiPolygon") polys.push(r); else if (t === "LineString" || t === "MultiLineString") lines.push(r); else points.push(r); }); function add(name, recs, isPoly, isPt) { if (!recs.length) return; var shpData = isPt ? buildPointShapefile(recs, src) : buildPolyShapefile(recs, src, isPoly); var fields = sanitizeDbfFields(recs); var dbfData = createDbfBuffer(recs, fields); zip.file(name + ".shp", shpData.shp); zip.file(name + ".shx", shpData.shx); zip.file(name + ".dbf", dbfData); zip.file(name + ".prj", PRJ_WGS84); zip.file(name + ".cpg", "UTF-8"); } if (polys.length) add(bN + "_polygons", polys, true, false); if (lines.length) add(bN + "_lines", lines, false, false); if (points.length) add(bN + "_points", points, false, true); if (checked("s17-labels")) { var lr = []; records.forEach(function (r) { if (!r.labelMap) return; lr.push({ geometry: new ol.geom.Point(transformGeom(new ol.geom.Point(r.labelMap), src, "EPSG:4326").getCoordinates()), srcGeom: new ol.geom.Point(r.labelMap), properties: { EXPORT_ID: r.properties.Export_ID, LABEL: r.labelText, FTYPE: "LABEL" } }); }); if (lr.length) add(bN + "_labels", lr, false, true); } return zip.generateAsync({ type: "blob", mimeType: "application/zip", compression: "DEFLATE", compressionOptions: { level: 9 } }); }).then(function (blob) { downloadBlob(blob, baseName() + "_shp.zip"); }); }

    /* ========================================================
       15. FEATURE SELECTION FOR EXPORT
       ======================================================== */
    function featuresForExport() {
        if (!S.currentLayer) return [];
        var src = S.currentLayer.getSource(); if (!src) return [];
        var all = src.getFeatures();
        if (S.exportMode === "all") return all.slice();
        if (S.exportMode === "extent") { var m = getMap(), ext = m.getView().calculateExtent(m.getSize()); return all.filter(function (f) { var g = f.getGeometry(); return g && g.intersectsExtent(ext); }); }
        if (S.exportMode === "selected") return selectedForCurrentLayer();
        return [];
    }

    /* ========================================================
       16. PANEL POSITIONING
       ======================================================== */
    function positionPanel() {
        if (!panel || !button || !S.panelOpen) return;
        var pad = 8, vw = window.innerWidth, vh = window.innerHeight;
        var b = button.getBoundingClientRect();
        if (vw <= 600) {
            panel.style.width = (vw - 16) + "px"; panel.style.left = "8px"; panel.style.right = "auto";
            panel.style.top = "8px"; panel.style.bottom = "auto"; panel.style.maxHeight = (vh - 16) + "px"; return;
        }
        panel.style.width = CONFIG.panelWidth + "px"; panel.style.right = "auto"; panel.style.bottom = "auto";
        panel.style.maxHeight = (vh - pad * 2) + "px";
        var pw = panel.offsetWidth || CONFIG.panelWidth, ph = panel.offsetHeight || 500;
        var spaceRight = vw - b.right, spaceLeft = b.left, left;
        if (spaceRight >= pw + CONFIG.panelGap + pad) left = b.right + CONFIG.panelGap;
        else if (spaceLeft >= pw + CONFIG.panelGap + pad) left = b.left - CONFIG.panelGap - pw;
        else left = Math.max(pad, (vw - pw) / 2);
        left = Math.max(pad, Math.min(left, vw - pw - pad));
        var top = b.top;
        top = Math.max(pad, Math.min(top, vh - ph - pad));
        if (ph > vh - pad * 2) top = pad;
        panel.style.left = Math.round(left) + "px"; panel.style.top = Math.round(top) + "px";
    }

    /* ========================================================
       17. OPEN / CLOSE
       ======================================================== */
    function openPanel() {
        if (!panel) createPanel();
        S.panelOpen = true;
        panel.classList.add("stage17-visible");
        if (button) button.classList.add("stage17-open");
        refreshPanel(); syncPopups();
        requestAnimationFrame(function () { requestAnimationFrame(positionPanel); });
    }
    function closePanel() {
        S.panelOpen = false;
        if (panel) panel.classList.remove("stage17-visible");
        if (button) button.classList.remove("stage17-open");
        disableSelection(); syncPopups();
    }
    function togglePanel() { S.panelOpen ? closePanel() : openPanel(); }

    /* ========================================================
       18. BUILD BUTTON
       ======================================================== */
    function createButton() {
        var existing = document.getElementById(CONFIG.buttonId);
        if (existing) { button = existing; return; }
        button = document.createElement("button");
        button.id = CONFIG.buttonId; button.type = "button";
        button.title = "Advanced Export (GeoJSON, KML, DXF, SHP…)";
        button.textContent = "📤";
        button.addEventListener("click", function (e) {
            e.preventDefault(); e.stopPropagation();
            if (document.body.classList.contains("drag-edit-mode")) return;
            togglePanel();
        });
        document.body.appendChild(button);
    }

    /* ========================================================
       19. BUILD PANEL  ★ LABEL FIELD DROPDOWN ADDED
       ======================================================== */
    function createPanel() {
        var existing = document.getElementById(CONFIG.panelId);
        if (existing) { panel = existing; return; }

        panel = document.createElement("div");
        panel.id = CONFIG.panelId;

        panel.innerHTML =
'<div class="s17-head"><div><div class="s17-t">📤 Advanced Export</div><div class="s17-st">GIS &amp; survey data export</div></div><button type="button" id="s17-close" class="s17-x">×</button></div>' +
'<div class="s17-body">' +

'<label>Layer</label><select id="s17-layer"></select>' +

'<div class="s17-sec">🖱 Map Selection</div>' +
'<div class="s17-row" style="margin-bottom:8px;">' +
'<button type="button" id="s17-selmode" class="s17-btn">Enable Select</button>' +
'<button type="button" id="s17-selclear" class="s17-btn">Clear</button>' +
'<button type="button" id="s17-selview" class="s17-btn">All in View</button>' +
'</div>' +
'<div id="s17-selinfo" class="s17-info warn">Selection off</div>' +

'<label style="margin-top:8px;">Features to export</label>' +
'<select id="s17-mode"><option value="all">All Features</option><option value="selected">Selected Features</option><option value="extent">Current Map Extent</option></select>' +

'<label>Export Format</label>' +
'<select id="s17-format">' +
'<option value="GeoJSON">GeoJSON (.geojson)</option>' +
'<option value="KML">KML (.kml)</option>' +
'<option value="KMZ">KMZ (.kmz)</option>' +
'<option value="DXF">DXF — AutoCAD (.dxf)</option>' +
'<option value="CSV">CSV (.csv)</option>' +
'<option value="WKT">WKT (.csv)</option>' +
'<option value="JSON">JSON (.json)</option>' +
'<option value="SHP">ESRI Shapefile (.zip)</option>' +
'</select>' +

'<label>Coordinate System</label>' +
'<select id="s17-crs"><option value="current">Current Map CRS</option><option value="EPSG:4326">EPSG:4326 — WGS 84</option><option value="EPSG:3857">EPSG:3857 — Web Mercator</option><option value="EPSG:32643">EPSG:32643 — UTM 43N</option><option value="EPSG:32644">EPSG:32644 — UTM 44N</option><option value="custom">Custom EPSG…</option></select>' +
'<input id="s17-custom-crs" type="text" placeholder="e.g. EPSG:32643" style="display:none;">' +

'<div class="s17-sec">🎨 Symbology</div>' +
'<label class="s17-chk"><input type="checkbox" id="s17-style" checked><span>Keep layer styling (colours, stroke width, fill)</span></label>' +

/* ★ LABEL POINTS SECTION — NOW WITH DROPDOWN */
'<div class="s17-sec">🏷 Label Points</div>' +
'<label class="s17-chk"><input type="checkbox" id="s17-labels" checked><span>Create centroid label points</span></label>' +
'<div class="s17-label-group" id="s17-label-group">' +
'  <label>Label text source</label>' +
'  <select id="s17-label-field">' +
'    <option value="__AUTO__">🔮 Auto-detect (best guess)</option>' +
'    <option value="__STYLE__">🎨 From layer style text</option>' +
'    <option value="__EXPORT_ID__">🔢 Export ID (F1, F2, F3…)</option>' +
'    <option value="__CUSTOM__">✏️ Custom fixed text</option>' +
'  </select>' +
'  <input type="text" id="s17-label-custom" placeholder="Enter custom label text…" style="display:none;">' +
'  <div class="s17-label-hint" id="s17-label-hint">' +
'    Auto mode tries: name, label, survey_no, plot_no, id, then falls back to Export_ID.' +
'  </div>' +
'</div>' +

'<div class="s17-sec">📐 Include Measurements</div>' +
'<label class="s17-chk"><input type="checkbox" id="s17-area" checked><span>Area (m² / ha / acre / cent / ft²)</span></label>' +
'<label class="s17-chk"><input type="checkbox" id="s17-perimeter" checked><span>Perimeter / Length (m)</span></label>' +
'<label class="s17-chk"><input type="checkbox" id="s17-centroid" checked><span>Centroid X / Y</span></label>' +
'<label class="s17-chk"><input type="checkbox" id="s17-coords" checked><span>Point X / Y / Z</span></label>' +

'<div class="s17-sec">🗂 Attributes</div><div id="s17-fields" class="s17-fields"></div>' +

'<div id="s17-status" class="s17-status">Ready</div>' +
'<button type="button" id="s17-go" class="s17-go">📤 Export</button>' +

'</div>';

        document.body.appendChild(panel);
        bindPanelEvents();
    }

    /* ========================================================
       20. PANEL EVENTS
       ======================================================== */
    function bindPanelEvents() {
        document.getElementById("s17-close").onclick = closePanel;

        document.getElementById("s17-layer").onchange = function () {
            S.currentLayer = layerById(this.value);
            refreshFields();
            updateSelectionUI();
        };

        document.getElementById("s17-mode").onchange = function () {
            S.exportMode = this.value;
            if (this.value === "selected" && !S.selectActive) enableSelection();
            updateSelectionUI();
        };

        document.getElementById("s17-format").onchange = function () {
            var note = document.getElementById("s17-status");
            S.exportFormat = this.value;
            if (this.value === "KML" || this.value === "KMZ") note.textContent = "ℹ KML/KMZ always uses EPSG:4326.";
            else if (this.value === "DXF") note.textContent = "ℹ DXF exports in your selected CRS with ACI colours.";
            else if (this.value === "SHP") note.textContent = "ℹ Shapefile ZIP contains UTF-8 compatible .shp, .shx, .dbf, .prj & .cpg files.";
        };

        document.getElementById("s17-crs").onchange = function () {
            S.exportCRS = this.value;
            document.getElementById("s17-custom-crs").style.display = this.value === "custom" ? "block" : "none";
        };

        document.getElementById("s17-selmode").onclick = toggleSelection;
        document.getElementById("s17-selclear").onclick = clearSelection;
        document.getElementById("s17-selview").onclick = function () {
            var m = getMap(); if (!m) return;
            selectByExtent(m.getView().calculateExtent(m.getSize()), false);
            S.exportMode = "selected";
            document.getElementById("s17-mode").value = "selected";
        };

        document.getElementById("s17-go").onclick = runExport;

        // ★ Label checkbox toggles the group visibility
        document.getElementById("s17-labels").onchange = function () {
            var grp = document.getElementById("s17-label-group");
            if (grp) grp.style.display = this.checked ? "block" : "none";
        };

        // ★ Label field dropdown change handler
        document.getElementById("s17-label-field").onchange = function () {
            var customInput = document.getElementById("s17-label-custom");
            var hint = document.getElementById("s17-label-hint");
            var v = this.value;

            customInput.style.display = (v === "__CUSTOM__") ? "block" : "none";

            if (v === "__AUTO__") {
                hint.textContent = "Auto mode tries: name, label, survey_no, plot_no, id, then falls back to Export_ID.";
            } else if (v === "__STYLE__") {
                hint.textContent = "Uses the text from the layer's OL style (if the style has a getText).";
            } else if (v === "__EXPORT_ID__") {
                hint.textContent = "Labels will be F1, F2, F3… based on the export order.";
            } else if (v === "__CUSTOM__") {
                hint.textContent = "All features will use the same custom text you enter above.";
            } else {
                hint.textContent = "Each feature's label = its \"" + v + "\" attribute value.";
            }
        };

        panel.addEventListener("click", function (e) { e.stopPropagation(); });
    }

    /* ========================================================
       21. GLOBAL EVENTS
       ======================================================== */
    function bindGlobalEvents() {
        window.addEventListener("resize", positionPanel);
        window.addEventListener("orientationchange", function () { setTimeout(positionPanel, 250); });
        document.addEventListener("maptool:moved", function (e) { if (e.detail && e.detail.id === CONFIG.toolId) positionPanel(); });
        document.addEventListener("maptool:editmode", function (e) { if (e.detail && e.detail.active) closePanel(); });
        document.addEventListener("maptool:visibility", function (e) { if (e.detail && e.detail.id === CONFIG.toolId && !e.detail.visible) closePanel(); });
        document.addEventListener("keydown", function (e) { if (e.key === "Escape" && S.panelOpen) closePanel(); });
        document.addEventListener("click", function (e) { if (!S.panelOpen) return; if (!panel) return; if (panel.contains(e.target)) return; if (button && button.contains(e.target)) return; closePanel(); });
        window.addEventListener("beforeunload", function () { try { restorePopups(); } catch (e) {} });
    }

    /* ========================================================
       22. UI REFRESH  ★ LABEL FIELD DROPDOWN REFRESH ADDED
       ======================================================== */
    function updateSelectionUI() {
        var info = document.getElementById("s17-selinfo"), btn = document.getElementById("s17-selmode");
        if (!info || !btn) return;
        btn.textContent = S.selectActive ? "✔ Selecting" : "Enable Select";
        btn.className = "s17-btn" + (S.selectActive ? " on" : "");
        var n = selectedForCurrentLayer().length, other = S.selection.length - n;
        if (n > 0) { info.className = "s17-info ok"; info.innerHTML = "✔ <b>" + n + "</b> feature(s) selected in <b>" + (S.currentLayer ? layerName(S.currentLayer) : "-") + "</b>" + (other > 0 ? "<br><span style='opacity:.8'>" + other + " in other layer(s)</span>" : "") + "<br><span style='opacity:.8'>Click a feature again to unselect it.</span>"; }
        else if (S.selectActive) { info.className = "s17-info warn"; info.innerHTML = "🖱 <b>Click</b> to select · <b>Click again</b> to unselect<br>Clicking another feature <b>adds</b> it · <b>Shift+Drag</b> = box select<br><span style='opacity:.8'>Popups are disabled while selecting.</span>"; }
        else { info.className = "s17-info warn"; info.innerHTML = "Selection is off — click <b>Enable Select</b> to pick features on the map."; }
    }

    function refreshLabelFieldDropdown() {
        var sel = document.getElementById("s17-label-field");
        if (!sel) return;

        // Remember current choice
        var prev = sel.value;

        // Clear everything after the 4 built-in options
        while (sel.options.length > 4) sel.remove(4);

        // Get current layer fields
        if (!S.currentLayer) return;
        var src = S.currentLayer.getSource();
        if (!src) return;
        var feats = src.getFeatures();
        if (!feats.length) return;

        var gname = feats[0].getGeometryName();
        var keys = [], seen = {};
        for (var i = 0; i < Math.min(feats.length, 500); i++) {
            var pr = feats[i].getProperties();
            for (var k in pr) {
                if (!pr.hasOwnProperty(k)) continue;
                if (k === gname || seen[k] || k.charAt(0) === "_") continue;
                if (pr[k] instanceof ol.geom.Geometry) continue;
                seen[k] = 1;
                keys.push(k);
            }
        }

        // Sort: preferred fields first
        var preferred = CONFIG.preferredLabelFields.map(function (s) { return s.toLowerCase(); });
        keys.sort(function (a, b) {
            var ai = preferred.indexOf(a.toLowerCase());
            var bi = preferred.indexOf(b.toLowerCase());
            if (ai !== -1 && bi === -1) return -1;
            if (ai === -1 && bi !== -1) return 1;
            if (ai !== -1 && bi !== -1) return ai - bi;
            return a.localeCompare(b, undefined, { sensitivity: "base" });
        });

        // Add a separator
        var sep = document.createElement("option");
        sep.disabled = true;
        sep.textContent = "── Attribute fields ──";
        sel.appendChild(sep);

        // Add each field as an option
        keys.forEach(function (k) {
            var opt = document.createElement("option");
            opt.value = k;
            opt.textContent = k;

            // Show sample value
            for (var j = 0; j < Math.min(feats.length, 3); j++) {
                var v = feats[j].get(k);
                if (v !== undefined && v !== null && v !== "") {
                    var sample = String(v);
                    if (sample.length > 20) sample = sample.substring(0, 20) + "…";
                    opt.textContent = k + "  (e.g. " + sample + ")";
                    break;
                }
            }

            sel.appendChild(opt);
        });

        // Restore previous selection if it still exists
        var found = false;
        for (var oi = 0; oi < sel.options.length; oi++) {
            if (sel.options[oi].value === prev) { sel.value = prev; found = true; break; }
        }
        if (!found) sel.value = "__AUTO__";

        // Trigger change to update hint
        sel.dispatchEvent(new Event("change"));
    }

    function refreshPanel() {
        var sel = document.getElementById("s17-layer"); if (!sel) return;
        var ls = vectorLayers(); sel.innerHTML = "";
        if (!ls.length) { sel.innerHTML = '<option value="">No vector layers found</option>'; S.currentLayer = null; refreshFields(); updateSelectionUI(); return; }
        ls.forEach(function (l) { var o = document.createElement("option"); o.value = layerId(l); o.textContent = layerName(l) + "  (" + l.getSource().getFeatures().length + ")"; sel.appendChild(o); });
        if (!S.currentLayer || ls.indexOf(S.currentLayer) === -1) S.currentLayer = ls[0];
        sel.value = layerId(S.currentLayer);
        refreshFields();
        updateSelectionUI();
        var st = document.getElementById("s17-status");
        if (st) st.textContent = "Ready — " + S.currentLayer.getSource().getFeatures().length + " feature(s) in layer";
    }

    function refreshFields() {
        var box = document.getElementById("s17-fields"); if (!box) return;
        box.innerHTML = "";
        if (!S.currentLayer) return;
        var src = S.currentLayer.getSource(); if (!src) return;
        var feats = src.getFeatures(); if (!feats.length) return;
        var gname = feats[0].getGeometryName(), keys = [], seen = {};
        for (var i = 0; i < Math.min(feats.length, 500); i++) { var pr = feats[i].getProperties(); for (var k in pr) { if (!pr.hasOwnProperty(k)) continue; if (k === gname || seen[k]) continue; if (k.charAt(0) === "_") continue; if (pr[k] instanceof ol.geom.Geometry) continue; seen[k] = 1; keys.push(k); } }
        if (!keys.length) { box.innerHTML = '<div style="font-size:11px;color:#9ca3af;">No attributes found</div>'; return; }
        var head = document.createElement("div"); head.className = "s17-ftitle"; head.textContent = "Attributes (" + keys.length + ")"; box.appendChild(head);
        var row = document.createElement("div"); row.className = "s17-row"; row.style.marginBottom = "6px";
        function mkBtn(txt, state) { var b = document.createElement("button"); b.type = "button"; b.className = "s17-btn"; b.textContent = txt; b.style.height = "26px"; b.style.fontSize = "10.5px"; b.onclick = function () { var cbs = box.querySelectorAll("input[type=checkbox]"); for (var i = 0; i < cbs.length; i++) cbs[i].checked = state; }; return b; }
        row.appendChild(mkBtn("Select All", true)); row.appendChild(mkBtn("Clear All", false)); box.appendChild(row);
        keys.forEach(function (k) { var lab = document.createElement("label"); lab.className = "s17-field"; var cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = true; cb.dataset.field = k; var sp = document.createElement("span"); sp.textContent = k; lab.appendChild(cb); lab.appendChild(sp); box.appendChild(lab); });

        // ★ Also refresh the label field dropdown
        refreshLabelFieldDropdown();
    }

    /* ========================================================
       23. RUN EXPORT
       ======================================================== */
    function runExport() {
        var status = document.getElementById("s17-status"), go = document.getElementById("s17-go");
        S.exportFormat = document.getElementById("s17-format").value;
        S.exportMode = document.getElementById("s17-mode").value;
        S.exportCRS = document.getElementById("s17-crs").value;
        go.disabled = true;
        function done(msg) { status.textContent = msg; go.disabled = false; }
        try {
            var tCRS = targetCRS(); if (!tCRS) throw new Error("Please enter a valid EPSG code.");
            var feats = featuresForExport();
            if (!feats.length) {
                if (S.exportMode === "selected") throw new Error("Nothing selected. Click features on the map, then export.");
                if (S.exportMode === "extent") throw new Error("No features inside the current map view.");
                throw new Error("No features available in this layer.");
            }
            status.textContent = "⏳ Processing " + feats.length + " feature(s)…";
            var recs = buildRecords(feats, tCRS); if (!recs.length) throw new Error("No valid geometries found.");
            var pr = null;
            switch (S.exportFormat) {
                case "GeoJSON": exportGeoJSON(recs, tCRS); break;
                case "JSON": exportJSON(recs, tCRS); break;
                case "CSV": exportCSV(recs); break;
                case "WKT": exportWKT(recs); break;
                case "KML": exportKML(recs); break;
                case "KMZ": status.textContent = "⏳ Building KMZ…"; pr = exportKMZ(recs); break;
                case "DXF": exportDXF(recs, tCRS); break;
                case "SHP": status.textContent = "⏳ Building Shapefile ZIP…"; pr = exportSHP(recs); break;
                default: throw new Error("Unsupported format: " + S.exportFormat);
            }
            var labelNote = checked("s17-labels") ? " (+ labels)" : "";
            if (pr && typeof pr.then === "function") { pr.then(function () { done("✅ Exported " + recs.length + " feature(s)" + labelNote + " as " + S.exportFormat); }).catch(function (e) { console.error("Stage 17:", e); done("❌ " + (e.message || "Export failed.")); }); }
            else { done("✅ Exported " + recs.length + " feature(s)" + labelNote + " as " + S.exportFormat); }
        } catch (e) { console.error("Stage 17 Export Error:", e); done("❌ " + (e.message || "Export failed.")); }
    }

    /* ========================================================
       24. PUBLIC API
       ======================================================== */
    window.Stage17Export = {
        open: openPanel, close: closePanel, toggle: togglePanel,
        enableSelection: enableSelection, disableSelection: disableSelection,
        clearSelection: clearSelection,
        getSelection: function () { return S.selection.slice(); },
        suppressPopups: suppressPopups, restorePopups: restorePopups,
        refresh: refreshPanel, repositionPanel: positionPanel
    };

    /* ========================================================
       25. INITIALIZE
       ======================================================== */
    function initialize() {
        injectCSS(); createButton(); createPanel(); closePanel();
        registerWithToolManager(); bindGlobalEvents();
        var tries = 0;
        (function waitForMap() {
            if (getMap()) {
                ensureHighlightLayer(); refreshPanel();
                setInterval(function () { if (S.panelOpen) updateSelectionUI(); }, 1500);
                console.log("📤 Stage 17 v5.1 — Advanced Export READY.");
                return;
            }
            if (++tries > 50) { console.error("📤 Stage 17: map not found after 30s."); return; }
            setTimeout(waitForMap, 600);
        })();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize);
    else initialize();

})();