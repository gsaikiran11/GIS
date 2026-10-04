// ============================================================
// 📐 MULTI-POLYGON STRAIGHT DIVISION TOOL v5.3
// ============================================================
// QGIS2WEB + OPENLAYERS 10.x + JSTS
//
// v5.3 CHANGES:
// ✔ Usable "Local Splits Manager" with listing and metadata
// ✔ Highlight saved splits on map during hover
// ✔ Single-split selective deletion (Trash button)
// ✔ Elegant inline double-click/two-step confirm for "Wipe All"
// ============================================================

(function () {

    "use strict";

    console.log("📐 Starting Multi-Polygon Division Tool v5.3...");

    // ========================================================
    // PROJECTION
    // ========================================================

    const DATA_PROJECTION = "EPSG:32643";
    const MAP_PROJECTION  = "EPSG:3857";

    (function registerUTM43N() {
        try {
            if (typeof proj4 !== "undefined") {
                if (!proj4.defs(DATA_PROJECTION)) {
                    proj4.defs(
                        DATA_PROJECTION,
                        "+proj=utm +zone=43 +datum=WGS84 +units=m +no_defs"
                    );
                }
                if (typeof ol.proj.proj4 !== "undefined" &&
                    ol.proj.proj4.register) {
                    ol.proj.proj4.register(proj4);
                }
            }
        } catch (e) {
            console.warn("📐 proj4 registration skipped:", e.message);
        }
    })();

    // ========================================================
    // CONFIG
    // ========================================================

    const CONFIG = {
        buttonId: "msd-toggle-btn",
        panelId: "msd-panel",
        topBarId: "msd-topbar",
        jstsUrl: "https://unpkg.com/jsts@2.11.3/dist/jsts.min.js",

        bisectionIterations: 60,
        areaToleranceM2: 0.001,
        minSegmentLengthM: 0.05,
        minPartAreaM2: 0.01,

        sideDecimals: 2,
        areaDecimals: 3,

        part1Stroke: "#1565c0",
        part1Fill: "rgba(21,101,192,0.22)",
        part2Stroke: "#e65100",
        part2Fill: "rgba(230,81,0,0.22)",
        cutStroke: "#b71c1c",
        refStroke: "#00e676",
        selStroke: "#d50000",
        selFill: "rgba(213,0,0,0.12)"
    };

    const AREA_UNITS = {
        sqm:      { name: "m²",       factor: 1.0 },
        acres:    { name: "Acres",    factor: 4046.8564224 },
        cents:    { name: "Cents",    factor: 40.468564224 },
        guntas:   { name: "Guntas",   factor: 101.17141056 },
        hectares: { name: "Hectares", factor: 10000.0 },
        sqft:     { name: "sq.ft.",   factor: 0.09290304 }
    };

    // ========================================================
    // STATE
    // ========================================================

    const STATE = {
        map: null,
        mapProjCode: MAP_PROJECTION,
        needsTransform: true,

        active: false,
        stage: "idle",
        directionMode: "side",
        panelCollapsed: false,

        selectedFeatures: [],
        selectedEntries: [],

        refAngleDeg: null,
        pivotPoint: null,
        tempPoints: [],
        selectedSide: null,

        targetPart1M2: null,
        totalAreaM2: null,
        chosenUnit: "acres",
        isReversed: false,

        solutions: [],
        activeSolIdx: 0,

        resultLayer: null,
        labelLayer: null,
        hasAppliedResult: false,

        // Persistent Overlay Layers for Locally Saved Splits
        savedResultLayer: null,
        savedLabelLayer: null,

        selLayer: null,
        refLayer: null,

        clickHandler: null,
        pointerHandler: null,

        popupBlockerActive: false,
        popupBlockerHandler: null,

        jstsReady: false,
        wipeConfirmActive: false
    };

    window.msdDivisionActive = false;

    // ========================================================
    // JSTS
    // ========================================================

    let _parser = null;

    function loadJSTS() {
        return new Promise(function (resolve, reject) {
            if (window.jsts && window.jsts.io && window.jsts.io.OL3Parser) {
                STATE.jstsReady = true;
                return resolve();
            }
            var existing = document.querySelector('script[data-msd-jsts="1"]');
            if (existing) {
                existing.addEventListener("load", function () {
                    STATE.jstsReady = true; resolve();
                });
                existing.addEventListener("error", reject);
                return;
            }
            var s = document.createElement("script");
            s.src = CONFIG.jstsUrl;
            s.async = true;
            s.dataset.msdJsts = "1";
            s.onload = function () { STATE.jstsReady = true; resolve(); };
            s.onerror = function () { reject(new Error("JSTS load failed")); };
            document.head.appendChild(s);
        });
    }

    function parser() {
        if (!_parser) {
            _parser = new jsts.io.OL3Parser();
            _parser.inject(
                ol.geom.Point, ol.geom.LineString, ol.geom.LinearRing,
                ol.geom.Polygon, ol.geom.MultiPoint, ol.geom.MultiLineString,
                ol.geom.MultiPolygon
            );
        }
        return _parser;
    }

    function toJ(g) { return parser().read(g); }
    function toOl(g) { return parser().write(g); }

    // ========================================================
    // MEASUREMENT — STAGE 14 LOGIC
    // ========================================================

    function toUTM(coordinate) {
        if (!STATE.needsTransform) return coordinate;
        return ol.proj.transform(coordinate, STATE.mapProjCode, DATA_PROJECTION);
    }

    function msdDistance(c1, c2) {
        var p1 = toUTM(c1);
        var p2 = toUTM(c2);
        var dx = p2[0] - p1[0];
        var dy = p2[1] - p1[1];
        return Math.sqrt(dx * dx + dy * dy);
    }

    function msdRingArea(ring) {
        if (!ring || ring.length < 3) return 0;
        var projected = ring.map(function (c) { return toUTM(c); });
        var area = 0;
        for (var i = 0; i < projected.length; i++) {
            var j = (i + 1) % projected.length;
            area += projected[i][0] * projected[j][1];
            area -= projected[j][0] * projected[i][1];
        }
        return Math.abs(area / 2);
    }

    function msdPolygonArea(olPolygon) {
        var rings = olPolygon.getCoordinates();
        if (!rings || !rings.length) return 0;
        var area = msdRingArea(rings[0]);
        for (var i = 1; i < rings.length; i++) {
            area -= msdRingArea(rings[i]);
        }
        return Math.max(0, area);
    }

    function msdGeometryArea(geometry) {
        if (!geometry) return 0;
        var type = geometry.getType();
        if (type === "Polygon") return msdPolygonArea(geometry);
        if (type === "MultiPolygon") {
            var total = 0;
            geometry.getPolygons().forEach(function (p) { total += msdPolygonArea(p); });
            return total;
        }
        if (type === "GeometryCollection") {
            var t = 0;
            geometry.getGeometries().forEach(function (g) { t += msdGeometryArea(g); });
            return t;
        }
        return 0;
    }

    // ========================================================
    // MAP + PROJECTION
    // ========================================================

    function getMap() {
        if (window.map instanceof ol.Map) return window.map;
        if (typeof map !== "undefined" && map instanceof ol.Map) return map;
        return null;
    }

    function detectProjection() {
        var code = STATE.map.getView().getProjection().getCode();
        STATE.mapProjCode = code;
        STATE.needsTransform = (code !== DATA_PROJECTION);
        console.log("📐 Map:", code, "| Data:", DATA_PROJECTION, "| Transform:", STATE.needsTransform);
    }

    // ========================================================
    // POPUP BLOCKER
    // ========================================================

    function blockPopups() {
        if (!STATE.map || STATE.popupBlockerActive) return;
        window.msdDivisionActive = true;
        window.stage14MeasureActive = true;

        if (typeof window.closeFeaturePopup === "function") {
            try { window.closeFeaturePopup(); } catch (e) {}
        }
        var popupEl = document.getElementById("feature-info-popup");
        if (popupEl) popupEl.style.display = "none";

        STATE.map.getOverlays().forEach(function (ov) { ov.setPosition(undefined); });

        STATE.popupBlockerHandler = function () {
            STATE.map.getOverlays().forEach(function (ov) { ov.setPosition(undefined); });
            var p = document.getElementById("feature-info-popup");
            if (p) p.style.display = "none";
        };
        STATE.map.on("singleclick", STATE.popupBlockerHandler);
        STATE.popupBlockerActive = true;
    }

    function unblockPopups() {
        if (!STATE.map || !STATE.popupBlockerActive) return;
        if (STATE.popupBlockerHandler) {
            STATE.map.un("singleclick", STATE.popupBlockerHandler);
            STATE.popupBlockerHandler = null;
        }
        window.msdDivisionActive = false;
        window.stage14MeasureActive = false;
        STATE.popupBlockerActive = false;
    }

    // ========================================================
    // HELPERS
    // ========================================================

    function deg2rad(d) { return d * Math.PI / 180; }
    function rad2deg(r) { return r * 180 / Math.PI; }
    function normDeg(d) { var v = d % 180; if (v < 0) v += 180; return v; }
    function fmtNum(v, d) { return Number(v).toFixed(d); }
    function fmtArea(m2, unit) {
        var u = AREA_UNITS[unit] || AREA_UNITS.sqm;
        return (m2 / u.factor).toFixed(CONFIG.areaDecimals) + " " + u.name;
    }
    function waitFrame() { return new Promise(function (r) { requestAnimationFrame(r); }); }

    function detachHandlers() {
        if (STATE.map && STATE.clickHandler) {
            STATE.map.un("click", STATE.clickHandler); STATE.clickHandler = null;
        }
        if (STATE.map && STATE.pointerHandler) {
            STATE.map.un("pointermove", STATE.pointerHandler); STATE.pointerHandler = null;
        }
    }

    // ========================================================
    // LOCAL STORAGE MANAGEMENT (USABLE SPLITS DB)
    // ========================================================

    function getSavedSplits() {
        try {
            var raw = localStorage.getItem("msd_saved_splits_v5");
            if (!raw) return [];
            var parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            return [];
        }
    }

    function saveCurrentSplit() {
        try {
            var format = new ol.format.GeoJSON();
            var resultFeats = STATE.resultLayer.getSource().getFeatures();
            var labelFeats = STATE.labelLayer.getSource().getFeatures();

            var splitId = "split_" + Date.now();

            // Inject the split ID into features to support dynamic highlight
            resultFeats.forEach(function (f) { f.set("__split_id", splitId); });
            labelFeats.forEach(function (f) { f.set("__split_id", splitId); });

            var resultsGeo = format.writeFeaturesObject(resultFeats);
            var labelsGeo = format.writeFeaturesObject(labelFeats);

            var list = getSavedSplits();
            var newSplit = {
                id: splitId,
                date: new Date().toLocaleDateString() + " " + new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
                targetText: fmtArea(STATE.targetPart1M2, STATE.chosenUnit),
                results: resultsGeo,
                labels: labelsGeo
            };

            list.push(newSplit);
            localStorage.setItem("msd_saved_splits_v5", JSON.stringify(list));

            loadSavedSplitsIntoLayers();
        } catch (e) {
            console.error("Failed to save split locally:", e);
            alert("Error saving split locally: " + e.message);
        }
    }

    function deleteSplit(id) {
        try {
            var list = getSavedSplits();
            var filtered = list.filter(function (s) { return s.id !== id; });
            localStorage.setItem("msd_saved_splits_v5", JSON.stringify(filtered));
            loadSavedSplitsIntoLayers();
        } catch (e) {
            console.error("Failed to delete split", e);
        }
    }

    function wipeSavedSplits() {
        localStorage.removeItem("msd_saved_splits_v5");
        if (STATE.savedResultLayer) STATE.savedResultLayer.getSource().clear();
        if (STATE.savedLabelLayer) STATE.savedLabelLayer.getSource().clear();
    }

    function loadSavedSplitsIntoLayers() {
        if (!STATE.savedResultLayer || !STATE.savedLabelLayer) return;
        STATE.savedResultLayer.getSource().clear();
        STATE.savedLabelLayer.getSource().clear();

        var list = getSavedSplits();
        var format = new ol.format.GeoJSON();
        list.forEach(function (item) {
            if (item.results) {
                var feats = format.readFeatures(item.results);
                feats.forEach(function (f) { f.set("__split_id", item.id); });
                STATE.savedResultLayer.getSource().addFeatures(feats);
            }
            if (item.labels) {
                var feats = format.readFeatures(item.labels);
                feats.forEach(function (f) { f.set("__split_id", item.id); });
                STATE.savedLabelLayer.getSource().addFeatures(feats);
            }
        });
    }

    // Highlight and Zoom interactions
    function highlightSavedSplitOnMap(id) {
        if (!STATE.savedResultLayer) return;
        STATE.savedResultLayer.getSource().getFeatures().forEach(function (f) {
            if (f.get("__split_id") === id) {
                f.set("__is_highlighted", true);
            }
        });
        STATE.savedResultLayer.changed();
    }

    function clearSavedSplitHighlight() {
        if (!STATE.savedResultLayer) return;
        STATE.savedResultLayer.getSource().getFeatures().forEach(function (f) {
            f.unset("__is_highlighted");
        });
        STATE.savedResultLayer.changed();
    }

    function zoomToSavedSplit(id) {
        if (!STATE.savedResultLayer) return;
        var ext = ol.extent.createEmpty();
        STATE.savedResultLayer.getSource().getFeatures().forEach(function (f) {
            if (f.get("__split_id") === id) {
                ol.extent.extend(ext, f.getGeometry().getExtent());
            }
        });
        if (!ol.extent.isEmpty(ext)) {
            STATE.map.getView().fit(ext, { duration: 600, padding: [60, 60, 60, 60] });
        }
    }

    // ========================================================
    // UI INJECTION
    // ========================================================

    function injectUI() {
        if (document.getElementById(CONFIG.buttonId)) return;

        var css = document.createElement("style");
        css.textContent = `
            #${CONFIG.buttonId} {
                position: fixed; bottom: 30px; right: 20px;
                width: 50px; height: 50px; background: #fff;
                color: #1e293b; border: 2px solid #94a3b8;
                border-radius: 50%; font-size: 22px;
                display: flex; align-items: center; justify-content: center;
                cursor: pointer; z-index: 18500;
                box-shadow: 0 3px 12px rgba(0,0,0,0.25);
                transition: all .15s;
            }
            #${CONFIG.buttonId}:hover { background: #f1f5f9; }
            #${CONFIG.buttonId}.on { background: #dc2626; color: #fff; border-color: #b91c1c; }

            #${CONFIG.panelId} {
                position: fixed; top: 16px; right: 16px;
                width: 335px; max-height: calc(100vh - 32px);
                background: #fff; border-radius: 10px;
                box-shadow: 0 8px 30px rgba(0,0,0,0.28);
                border: 1px solid #cbd5e1;
                font-family: system-ui, -apple-system, Arial, sans-serif;
                font-size: 13px; z-index: 18600;
                display: flex; flex-direction: column; overflow: hidden;
                box-sizing: border-box;
            }
            #${CONFIG.panelId}.hide { display: none; }

            .mh {
                background: #0f172a; color: #f8fafc;
                padding: 10px 14px; display: flex;
                justify-content: space-between; align-items: center;
                font-weight: 700; font-size: 13px;
                flex-shrink: 0;
            }
            .mh-left { display: flex; align-items: center; gap: 6px; }
            .mh-btns { display: flex; align-items: center; gap: 4px; }
            .mh .x, .mh .mn {
                cursor: pointer; font-size: 16px; opacity: .7;
                width: 26px; height: 26px;
                display: flex; align-items: center; justify-content: center;
                border-radius: 4px; transition: all .12s;
                background: transparent; border: none; color: #f8fafc;
            }
            .mh .x:hover, .mh .mn:hover { opacity: 1; background: rgba(255,255,255,0.15); }

            .mb {
                padding: 12px 14px; overflow-y: auto;
                transition: max-height 0.2s ease, padding 0.2s ease;
            }
            .mb.collapsed {
                max-height: 0 !important;
                padding-top: 0 !important;
                padding-bottom: 0 !important;
                overflow: hidden !important;
            }

            .ms {
                background: #f1f5f9; border-radius: 6px;
                padding: 8px 10px; margin-bottom: 10px;
                font-size: 12px; color: #334155; line-height: 1.55;
            }
            .ms.warn { background: #fff7ed; color: #9a3412; }

            .mf {
                border: 1px solid #e2e8f0; border-radius: 6px;
                padding: 8px 10px; margin-bottom: 10px;
            }
            .mf legend {
                font-size: 10px; font-weight: 700; color: #64748b;
                text-transform: uppercase; letter-spacing: .5px; padding: 0 4px;
            }
            .mf label { display: block; margin: 3px 0; cursor: pointer; font-size: 12px; }

            .mi {
                width: 100%; box-sizing: border-box;
                padding: 7px 8px; border: 1px solid #cbd5e1;
                border-radius: 5px; font-size: 13px;
            }
            .mig { display: flex; gap: 6px; margin-top: 4px; }
            .mig .mi:first-child { flex: 2; }
            .mig .mi:last-child { flex: 1; }

            .bt {
                width: 100%; padding: 9px; border: none;
                border-radius: 5px; font-weight: 600; cursor: pointer;
                font-size: 13px; margin-top: 6px; transition: background .15s;
            }
            .bp { background: #2563eb; color: #fff; }
            .bp:hover { background: #1d4ed8; }
            .bg { background: #16a34a; color: #fff; }
            .bg:hover { background: #15803d; }
            .bs { background: #e2e8f0; color: #334155; }
            .bs:hover { background: #cbd5e1; }
            .bw { background: #ea580c; color: #fff; }
            .bw:hover { background: #c2410c; }
            .bd { background: #dc2626; color: #fff; }
            .bd:hover { background: #b91c1c; }
            .bt:disabled { background: #e2e8f0; color: #94a3b8; cursor: default; }

            .sl {
                list-style: none; padding: 0; margin: 6px 0 0;
                max-height: 150px; overflow-y: auto;
            }
            .sc {
                padding: 7px 9px; background: #f8fafc;
                border: 1px solid #e2e8f0; border-radius: 5px;
                margin-bottom: 4px; cursor: pointer; font-size: 12px;
            }
            .sc:hover { background: #f1f5f9; }
            .sc.act { background: #eff6ff; border-color: #3b82f6; }
            .hint { font-size: 11px; color: #0284c7; margin-top: 4px; }

            /* List Database Styling */
            .sd-box {
                border: 1px solid #e2e8f0; border-radius: 8px;
                padding: 10px; background: #fafafa; margin-bottom: 12px;
            }
            .sd-header {
                display: flex; justify-content: space-between; align-items: center;
                font-weight: 700; font-size: 12px; margin-bottom: 8px; color: #0f172a;
            }
            .sd-list {
                max-height: 140px; overflow-y: auto; margin: 0; padding: 0;
                list-style: none;
            }
            .sd-item {
                display: flex; justify-content: space-between; align-items: center;
                background: #fff; border: 1px solid #e2e8f0;
                border-radius: 5px; padding: 6px 8px; margin-bottom: 4px;
                font-size: 11px; transition: border-color .15s, background .15s;
            }
            .sd-item:hover {
                border-color: #06b6d4; background: #f0fdfa;
            }
            .sd-info {
                display: flex; flex-direction: column; cursor: pointer; flex-grow: 1;
            }
            .sd-title { font-weight: 700; color: #0f172a; }
            .sd-date { font-size: 9px; color: #64748b; }
            .sd-actions { display: flex; gap: 4px; align-items: center; }
            .sd-action-btn {
                background: none; border: none; cursor: pointer; font-size: 13px;
                padding: 3px 5px; border-radius: 3px; display: flex; align-items: center;
            }
            .sd-action-btn:hover { background: #f1f5f9; }
            .sd-action-btn.del:hover { background: #fee2e2; color: #ef4444; }

            #${CONFIG.topBarId} {
                position: fixed; top: 12px; left: 50%;
                transform: translateX(-50%);
                background: #0f172a; color: #fff;
                padding: 8px 16px; border-radius: 20px;
                font-size: 13px; font-weight: 600;
                display: none; align-items: center; gap: 10px;
                box-shadow: 0 4px 16px rgba(0,0,0,.3);
                z-index: 18700; font-family: system-ui, Arial, sans-serif;
                white-space: nowrap;
            }
            #${CONFIG.topBarId} button {
                background: #16a34a; color: #fff; border: none;
                border-radius: 50%; width: 28px; height: 28px;
                cursor: pointer; font-weight: bold; font-size: 14px;
            }
            #${CONFIG.topBarId} .cbtn { background: #dc2626; }

            @media (max-width: 600px) {
                #${CONFIG.panelId} { width: calc(100vw - 20px); right: 10px; top: 10px; }
                #${CONFIG.buttonId} { bottom: 20px; right: 14px; }
            }
        `;
        document.head.appendChild(css);

        var btn = document.createElement("button");
        btn.id = CONFIG.buttonId;
        btn.type = "button";
        btn.innerHTML = "➗";
        btn.title = "Multi-Polygon Division Tool";
        btn.onclick = toggleTool;
        document.body.appendChild(btn);

        var panel = document.createElement("div");
        panel.id = CONFIG.panelId;
        panel.className = "hide";
        document.body.appendChild(panel);

        var tb = document.createElement("div");
        tb.id = CONFIG.topBarId;
        document.body.appendChild(tb);
    }

    // ========================================================
    // PANEL — SHOW WITH HIDE/UNHIDE BUTTON
    // ========================================================

    function showPanel(html) {
        var p = document.getElementById(CONFIG.panelId);
        p.innerHTML = html;
        p.classList.remove("hide");

        // Apply collapsed state if it was collapsed before
        var bodyEl = p.querySelector(".mb");
        if (bodyEl && STATE.panelCollapsed) {
            bodyEl.classList.add("collapsed");
        }

        // Attach hide/unhide toggle handler
        var mnBtn = p.querySelector(".mn");
        if (mnBtn) {
            mnBtn.onclick = function (e) {
                e.preventDefault();
                e.stopPropagation();
                togglePanelBody();
            };
        }
    }

    function togglePanelBody() {
        STATE.panelCollapsed = !STATE.panelCollapsed;

        var p = document.getElementById(CONFIG.panelId);
        var bodyEl = p.querySelector(".mb");
        var mnBtn = p.querySelector(".mn");

        if (!bodyEl) return;

        if (STATE.panelCollapsed) {
            bodyEl.classList.add("collapsed");
            if (mnBtn) mnBtn.innerHTML = "▢";
            if (mnBtn) mnBtn.title = "Show Panel";
        } else {
            bodyEl.classList.remove("collapsed");
            if (mnBtn) mnBtn.innerHTML = "▽";
            if (mnBtn) mnBtn.title = "Hide Panel";
        }
    }

    /**
     * Helper: builds the standard header HTML with Hide + Close buttons.
     */
    function hdr(title) {
        var colIcon = STATE.panelCollapsed ? "▢" : "▽";
        var colTitle = STATE.panelCollapsed ? "Show Panel" : "Hide Panel";

        return '<div class="mh">' +
                   '<span>' + title + '</span>' +
                   '<span class="mh-btns">' +
                       '<button type="button" class="mn" title="' + colTitle + '">' +
                           colIcon +
                       '</button>' +
                       '<span class="x" id="mcl" title="Close Tool">&times;</span>' +
                   '</span>' +
               '</div>';
    }

    // ========================================================
    // TOP BAR
    // ========================================================

    function showTopBar(text, onDone, onCancel) {
        var tb = document.getElementById(CONFIG.topBarId);
        tb.innerHTML = "<span>" + text + "</span>";
        if (onDone) {
            var b = document.createElement("button");
            b.type = "button"; b.innerText = "✓"; b.title = "Confirm";
            b.onclick = onDone; tb.appendChild(b);
        }
        if (onCancel) {
            var c = document.createElement("button");
            c.type = "button"; c.innerText = "✕"; c.className = "cbtn";
            c.title = "Cancel"; c.onclick = onCancel; tb.appendChild(c);
        }
        tb.style.display = "flex";
    }

    function hideTopBar() {
        var tb = document.getElementById(CONFIG.topBarId);
        tb.style.display = "none"; tb.innerHTML = "";
    }

    function setTopText(t) {
        var sp = document.querySelector("#" + CONFIG.topBarId + " span");
        if (sp) sp.innerText = t;
    }

    // ========================================================
    // TOOL LIFECYCLE
    // ========================================================

    function toggleTool() {
        if (STATE.active) closePanel(); else openTool();
    }

    async function openTool() {
        STATE.map = getMap();
        if (!STATE.map) { alert("OpenLayers map not found."); return; }
        detectProjection();
        try { await loadJSTS(); }
        catch (e) { alert("JSTS library could not be loaded."); return; }

        if (STATE.hasAppliedResult) {
            removeResultLayers();
            STATE.hasAppliedResult = false;
        }

        STATE.active = true;
        STATE.panelCollapsed = false;
        document.getElementById(CONFIG.buttonId).classList.add("on");
        blockPopups();
        resetWorkingState();
        buildTempLayers();
        ensureResultLayers();
        ensureSavedLayers(); // Ensure local overlay database is built
        stageSelectPolygons();
    }

    function closePanel() {
        detachHandlers();
        hideTopBar();
        document.getElementById(CONFIG.panelId).classList.add("hide");
        removeTempLayers();
        unblockPopups();
        STATE.active = false;
        document.getElementById(CONFIG.buttonId).classList.remove("on");
    }

    function resetWorkingState() {
        STATE.stage = "idle";
        STATE.selectedFeatures = [];
        STATE.selectedEntries = [];
        STATE.refAngleDeg = null;
        STATE.pivotPoint = null;
        STATE.tempPoints = [];
        STATE.solutions = [];
        STATE.activeSolIdx = 0;
        STATE.isReversed = false;
        STATE.selectedSide = null;
        STATE.wipeConfirmActive = false;
    }

    // ========================================================
    // LAYERS
    // ========================================================

    function buildTempLayers() {
        removeTempLayers();
        STATE.selLayer = new ol.layer.Vector({
            source: new ol.source.Vector(), zIndex: 20000,
            properties: { __msd: true },
            style: new ol.style.Style({
                stroke: new ol.style.Stroke({ color: CONFIG.selStroke, width: 3 }),
                fill: new ol.style.Fill({ color: CONFIG.selFill })
            })
        });
        STATE.refLayer = new ol.layer.Vector({
            source: new ol.source.Vector(), zIndex: 20001,
            properties: { __msd: true },
            style: new ol.style.Style({
                stroke: new ol.style.Stroke({ color: CONFIG.refStroke, width: 3, lineDash: [6, 4] }),
                image: new ol.style.Circle({
                    radius: 5,
                    fill: new ol.style.Fill({ color: CONFIG.refStroke }),
                    stroke: new ol.style.Stroke({ color: "#000", width: 1 })
                })
            })
        });
        STATE.map.addLayer(STATE.selLayer);
        STATE.map.addLayer(STATE.refLayer);
    }

    function removeTempLayers() {
        [STATE.selLayer, STATE.refLayer].forEach(function (l) {
            if (l && STATE.map) try { STATE.map.removeLayer(l); } catch (e) {}
        });
        STATE.selLayer = null; STATE.refLayer = null;
    }

    function ensureResultLayers() {
        if (STATE.resultLayer && STATE.labelLayer) {
            STATE.resultLayer.getSource().clear();
            STATE.labelLayer.getSource().clear();
            return;
        }
        STATE.resultLayer = new ol.layer.Vector({
            source: new ol.source.Vector(), zIndex: 19000,
            properties: { __msd: true, __msd_result: true },
            style: function (feat) {
                if (feat.get("msdCut")) {
                    return new ol.style.Style({
                        stroke: new ol.style.Stroke({ color: CONFIG.cutStroke, width: 3 })
                    });
                }
                var p = feat.get("msdPart");
                return new ol.style.Style({
                    fill: new ol.style.Fill({ color: p === 1 ? CONFIG.part1Fill : CONFIG.part2Fill }),
                    stroke: new ol.style.Stroke({
                        color: p === 1 ? CONFIG.part1Stroke : CONFIG.part2Stroke, width: 2
                    })
                });
            }
        });
        STATE.labelLayer = new ol.layer.Vector({
            source: new ol.source.Vector(), zIndex: 21000,
            properties: { __msd: true, __msd_result: true },
            style: function (feat) {
                if (feat.get("msdCentroid")) {
                    var p = feat.get("msdPart");
                    return new ol.style.Style({
                        text: new ol.style.Text({
                            text: feat.get("msdText"),
                            font: "bold 13px Arial, sans-serif",
                            fill: new ol.style.Fill({ color: p === 1 ? "#0d47a1" : "#bf360c" }),
                            stroke: new ol.style.Stroke({ color: "#fff", width: 5 }),
                            textAlign: "center", textBaseline: "middle", overflow: true
                        })
                    });
                }
                return new ol.style.Style({
                    text: new ol.style.Text({
                        text: feat.get("msdText"),
                        font: "bold 11px Arial, sans-serif",
                        fill: new ol.style.Fill({ color: "#111" }),
                        stroke: new ol.style.Stroke({ color: "#fff", width: 4 }),
                        rotation: feat.get("msdRot") || 0,
                        textAlign: "center", overflow: true
                    })
                });
            }
        });
        STATE.map.addLayer(STATE.resultLayer);
        STATE.map.addLayer(STATE.labelLayer);
    }

    /**
     * Prevents duplicate instances of layers if script is re-run.
     */
    function ensureSavedLayers() {
        var existingRes = null;
        var existingLbl = null;
        STATE.map.getLayers().forEach(function (l) {
            if (l && l.get) {
                if (l.get("__msd_saved_res")) existingRes = l;
                if (l.get("__msd_saved_lbl")) existingLbl = l;
            }
        });

        if (existingRes && existingLbl) {
            STATE.savedResultLayer = existingRes;
            STATE.savedLabelLayer = existingLbl;
            loadSavedSplitsIntoLayers();
            return;
        }

        STATE.savedResultLayer = new ol.layer.Vector({
            source: new ol.source.Vector(), zIndex: 18800,
            properties: { __msd: true, __msd_saved_res: true },
            style: function (feat) {
                var isHighlight = feat.get("__is_highlighted");
                if (feat.get("msdCut")) {
                    return new ol.style.Style({
                        stroke: new ol.style.Stroke({ 
                            color: isHighlight ? "#00ffff" : CONFIG.cutStroke, 
                            width: isHighlight ? 5 : 3 
                        })
                    });
                }
                var p = feat.get("msdPart");
                return new ol.style.Style({
                    fill: new ol.style.Fill({ 
                        color: isHighlight ? "rgba(6,182,212,0.4)" : (p === 1 ? CONFIG.part1Fill : CONFIG.part2Fill) 
                    }),
                    stroke: new ol.style.Stroke({
                        color: isHighlight ? "#00ffff" : (p === 1 ? CONFIG.part1Stroke : CONFIG.part2Stroke), 
                        width: isHighlight ? 4 : 2
                    })
                });
            }
        });

        STATE.savedLabelLayer = new ol.layer.Vector({
            source: new ol.source.Vector(), zIndex: 20800,
            properties: { __msd: true, __msd_saved_lbl: true },
            style: function (feat) {
                if (feat.get("msdCentroid")) {
                    var p = feat.get("msdPart");
                    return new ol.style.Style({
                        text: new ol.style.Text({
                            text: feat.get("msdText"),
                            font: "bold 13px Arial, sans-serif",
                            fill: new ol.style.Fill({ color: p === 1 ? "#0d47a1" : "#bf360c" }),
                            stroke: new ol.style.Stroke({ color: "#fff", width: 5 }),
                            textAlign: "center", textBaseline: "middle", overflow: true
                        })
                    });
                }
                return new ol.style.Style({
                    text: new ol.style.Text({
                        text: feat.get("msdText"),
                        font: "bold 11px Arial, sans-serif",
                        fill: new ol.style.Fill({ color: "#111" }),
                        stroke: new ol.style.Stroke({ color: "#fff", width: 4 }),
                        rotation: feat.get("msdRot") || 0,
                        textAlign: "center", overflow: true
                    })
                });
            }
        });

        STATE.map.addLayer(STATE.savedResultLayer);
        STATE.map.addLayer(STATE.savedLabelLayer);
        loadSavedSplitsIntoLayers();
    }

    function removeResultLayers() {
        [STATE.resultLayer, STATE.labelLayer].forEach(function (l) {
            if (l && STATE.map) try { STATE.map.removeLayer(l); } catch (e) {}
        });
        STATE.resultLayer = null; STATE.labelLayer = null;
        STATE.hasAppliedResult = false;
    }

    // ========================================================
    // STAGE 1 — SELECT POLYGONS + MANAGE LOCAL SPLITS
    // ========================================================

    function stageSelectPolygons() {
        STATE.stage = "select";
        detachHandlers();
        if (STATE.resultLayer) STATE.resultLayer.getSource().clear();
        if (STATE.labelLayer) STATE.labelLayer.getSource().clear();
        if (STATE.refLayer) STATE.refLayer.getSource().clear();
        STATE.isReversed = false;

        var n = STATE.selectedFeatures.length;
        var areaInfo = n ? '<br>Area: <b>' + fmtArea(sumSelectedArea(), STATE.chosenUnit) + '</b>' : '';
        
        // Assemble interactive Saved Splits Database UI
        var savedList = getSavedSplits();
        var databaseHtml = '';
        if (savedList.length > 0) {
            var itemsHtml = '';
            savedList.forEach(function (split) {
                itemsHtml += `
                    <li class="sd-item" data-id="${split.id}">
                        <div class="sd-info">
                            <span class="sd-title">Split Area: ${split.targetText}</span>
                            <span class="sd-date">Saved on: ${split.date}</span>
                        </div>
                        <div class="sd-actions">
                            <button class="sd-action-btn zoom" title="Zoom to Split">🔍</button>
                            <button class="sd-action-btn del" title="Delete Split">🗑️</button>
                        </div>
                    </li>
                `;
            });

            var wipeBtnText = STATE.wipeConfirmActive ? "Click again to confirm WIPE ⚠️" : "Wipe All Splits";
            var wipeBtnClass = STATE.wipeConfirmActive ? "bt bd" : "bt bs";

            databaseHtml = `
                <div class="sd-box">
                    <div class="sd-header">
                        <span>📁 Saved Overlay Database (${savedList.length})</span>
                    </div>
                    <ul class="sd-list">${itemsHtml}</ul>
                    <button class="${wipeBtnClass}" id="wipe-local-btn" style="padding: 6px; font-size: 11px;">${wipeBtnText}</button>
                </div>
            `;
        }

        showPanel(
            hdr('📐 Parcel Division Tool') +
            '<div class="mb">' +
                '<div class="ms">' +
                    'Click polygons to select them.<br>' +
                    'Works with <b>1 polygon</b> or <b>many polygons</b>.' +
                '</div>' +
                '<div class="ms">' +
                    '<b>Polygons Selected: ' + n + '</b>' + areaInfo +
                '</div>' +
                databaseHtml +
                '<button class="bt bp" id="pb">Pick Polygons on Map</button>' +
                '<button class="bt bg" id="nx" ' + (n >= 1 ? '' : 'disabled') + '>' +
                    'Next: Set Direction →' +
                '</button>' +
                '<button class="bt bs" id="cl">Clear Selection</button>' +
                '<button class="bt bd" id="cn">Close Tool</button>' +
            '</div>'
        );

        document.getElementById("mcl").onclick = closePanel;
        document.getElementById("cn").onclick = closePanel;
        document.getElementById("cl").onclick = function () {
            STATE.selectedFeatures = []; STATE.selectedEntries = [];
            if (STATE.selLayer) STATE.selLayer.getSource().clear();
            stageSelectPolygons();
        };

        // Attach Interactive Splits Event Handlers
        if (savedList.length > 0) {
            var items = document.querySelectorAll(".sd-item");
            items.forEach(function (item) {
                var id = item.getAttribute("data-id");
                var infoEl = item.querySelector(".sd-info");
                var zoomEl = item.querySelector(".sd-action-btn.zoom");
                var delEl = item.querySelector(".sd-action-btn.del");

                // Hover interactions
                item.onmouseenter = function () { highlightSavedSplitOnMap(id); };
                item.onmouseleave = function () { clearSavedSplitHighlight(); };

                // Zoom to entry
                infoEl.onclick = function () { zoomToSavedSplit(id); };
                zoomEl.onclick = function (e) {
                    e.stopPropagation();
                    zoomToSavedSplit(id);
                };

                // Individual Delete action
                delEl.onclick = function (e) {
                    e.stopPropagation();
                    clearSavedSplitHighlight();
                    deleteSplit(id);
                    stageSelectPolygons();
                };
            });

            // "Wipe All" Elegant Double Confirmation Handler
            var wipeBtn = document.getElementById("wipe-local-btn");
            wipeBtn.onclick = function () {
                if (!STATE.wipeConfirmActive) {
                    STATE.wipeConfirmActive = true;
                    stageSelectPolygons();
                    // Auto-reset confirmation timer
                    setTimeout(function() {
                        if (STATE.wipeConfirmActive) {
                            STATE.wipeConfirmActive = false;
                            stageSelectPolygons();
                        }
                    }, 4000);
                } else {
                    STATE.wipeConfirmActive = false;
                    wipeSavedSplits();
                    stageSelectPolygons();
                }
            };
        }

        document.getElementById("nx").onclick = function () {
            if (STATE.selectedFeatures.length < 1) { alert("Select at least 1 polygon."); return; }
            STATE.totalAreaM2 = sumSelectedArea();
            stageDirection();
        };
        document.getElementById("pb").onclick = startPicking;
    }

    function sumSelectedArea() {
        var total = 0;
        STATE.selectedEntries.forEach(function (e) { total += msdGeometryArea(e.geometry); });
        return total;
    }

    function startPicking() {
        document.getElementById(CONFIG.panelId).classList.add("hide");
        var back = function () {
            detachHandlers(); hideTopBar();
            document.getElementById(CONFIG.panelId).classList.remove("hide");
            stageSelectPolygons();
        };
        showTopBar("Selected: " + STATE.selectedFeatures.length, back, back);

        STATE.clickHandler = function (evt) {
            var hit = null;
            STATE.map.forEachFeatureAtPixel(evt.pixel, function (f, l) {
                if (hit) return;
                var g = f.getGeometry(); if (!g) return;
                var t = g.getType();
                if (t !== "Polygon" && t !== "MultiPolygon") return;
                if (l && l.get && l.get("__msd")) return;
                hit = { feature: f, layer: l };
            }, { hitTolerance: 6 });
            if (!hit) return;
            var idx = STATE.selectedFeatures.indexOf(hit.feature);
            if (idx >= 0) {
                STATE.selectedFeatures.splice(idx, 1);
                STATE.selectedEntries.splice(idx, 1);
            } else {
                STATE.selectedFeatures.push(hit.feature);
                STATE.selectedEntries.push({
                    feature: hit.feature, layer: hit.layer,
                    geometry: hit.feature.getGeometry().clone()
                });
            }
            syncSelection();
            setTopText("Selected: " + STATE.selectedFeatures.length);
        };
        STATE.map.on("click", STATE.clickHandler);
    }

    function syncSelection() {
        var src = STATE.selLayer.getSource(); src.clear();
        STATE.selectedEntries.forEach(function (e) {
            src.addFeature(new ol.Feature(e.geometry.clone()));
        });
    }

    // ========================================================
    // STAGE 2 — DIRECTION
    // ========================================================

    function stageDirection() {
        STATE.stage = "direction";
        detachHandlers();
        STATE.refAngleDeg = null; STATE.tempPoints = []; STATE.selectedSide = null;
        if (STATE.refLayer) STATE.refLayer.getSource().clear();

        showPanel(
            hdr('Set Division Direction') +
            '<div class="mb">' +
                '<div class="ms">' +
                    'Polygons: <b>' + STATE.selectedFeatures.length + '</b><br>' +
                    'Total: <b>' + fmtArea(STATE.totalAreaM2, STATE.chosenUnit) + '</b>' +
                '</div>' +
                '<fieldset class="mf">' +
                    '<legend>Direction Method</legend>' +
                    '<label><input type="radio" name="dm" value="side"' +
                        (STATE.directionMode === "side" ? " checked" : "") + '> Based on Side</label>' +
                    '<label><input type="radio" name="dm" value="line"' +
                        (STATE.directionMode === "line" ? " checked" : "") + '> Draw Line</label>' +
                    '<label><input type="radio" name="dm" value="point"' +
                        (STATE.directionMode === "point" ? " checked" : "") + '> From Point</label>' +
                    '<div class="hint" id="dh">' + dirHint() + '</div>' +
                '</fieldset>' +
                '<button class="bt bp" id="cd">Capture Direction on Map</button>' +
                '<button class="bt bs" id="bk2">← Back to Selection</button>' +
                '<button class="bt bd" id="cn2">Close Tool</button>' +
            '</div>'
        );

        document.getElementById("mcl").onclick = closePanel;
        document.getElementById("cn2").onclick = closePanel;
        document.getElementById("bk2").onclick = stageSelectPolygons;
        document.querySelectorAll('input[name="dm"]').forEach(function (r) {
            r.onchange = function (e) {
                STATE.directionMode = e.target.value;
                STATE.refAngleDeg = null; STATE.tempPoints = [];
                if (STATE.refLayer) STATE.refLayer.getSource().clear();
                document.getElementById("dh").innerText = dirHint();
            };
        });
        document.getElementById("cd").onclick = captureDirection;
    }

    function dirHint() {
        if (STATE.directionMode === "side") return "Click an existing parcel boundary side.";
        if (STATE.directionMode === "line") return "Click 2 points on the map.";
        return "Click a pivot point, then a direction point.";
    }

    function captureDirection() {
        document.getElementById(CONFIG.panelId).classList.add("hide");
        if (STATE.refLayer) STATE.refLayer.getSource().clear();
        STATE.tempPoints = []; STATE.refAngleDeg = null; STATE.selectedSide = null;

        var cancelBack = function () {
            detachHandlers(); hideTopBar();
            document.getElementById(CONFIG.panelId).classList.remove("hide");
            stageDirection();
        };
        var confirmNext = function () {
            if (STATE.refAngleDeg === null) { alert("Define the direction first."); return; }
            detachHandlers(); hideTopBar();
            document.getElementById(CONFIG.panelId).classList.remove("hide");
            stageAreaInput();
        };

        if (STATE.directionMode === "side") {
            showTopBar("Click a parcel side", confirmNext, cancelBack);
            STATE.pointerHandler = function (evt) {
                if (evt.dragging) return;
                var ns = findNearestSegment(evt.coordinate);
                if (ns) { STATE.selectedSide = ns; drawRefLine(ns.p1, ns.p2); }
            };
            STATE.map.on("pointermove", STATE.pointerHandler);
            STATE.clickHandler = function (evt) {
                var ns = findNearestSegment(evt.coordinate);
                if (!ns) return;
                STATE.selectedSide = ns;
                var u1 = toUTM(ns.p1), u2 = toUTM(ns.p2);
                STATE.refAngleDeg = normDeg(rad2deg(Math.atan2(u2[1] - u1[1], u2[0] - u1[0])));
                drawRefLine(ns.p1, ns.p2);
                setTopText("Side: " + STATE.refAngleDeg.toFixed(2) + "° — press ✓");
            };
            STATE.map.on("click", STATE.clickHandler);
        } else if (STATE.directionMode === "line") {
            showTopBar("Click Point 1", confirmNext, cancelBack);
            STATE.clickHandler = function (evt) {
                STATE.tempPoints.push(evt.coordinate.slice());
                if (STATE.tempPoints.length === 1) {
                    drawRefPoint(STATE.tempPoints[0]); setTopText("Click Point 2");
                } else if (STATE.tempPoints.length === 2) {
                    var a = STATE.tempPoints[0], b = STATE.tempPoints[1];
                    var ua = toUTM(a), ub = toUTM(b);
                    STATE.refAngleDeg = normDeg(rad2deg(Math.atan2(ub[1]-ua[1], ub[0]-ua[0])));
                    drawRefLine(a, b);
                    setTopText("Line: " + STATE.refAngleDeg.toFixed(2) + "° — press ✓");
                } else {
                    STATE.tempPoints = [evt.coordinate.slice()];
                    drawRefPoint(STATE.tempPoints[0]); STATE.refAngleDeg = null;
                    setTopText("Click Point 2");
                }
            };
            STATE.map.on("click", STATE.clickHandler);
        } else {
            showTopBar("Click Pivot Point", confirmNext, cancelBack);
            STATE.clickHandler = function (evt) {
                STATE.tempPoints.push(evt.coordinate.slice());
                if (STATE.tempPoints.length === 1) {
                    STATE.pivotPoint = evt.coordinate.slice();
                    drawRefPoint(STATE.pivotPoint); setTopText("Click direction point");
                } else if (STATE.tempPoints.length === 2) {
                    var a2 = STATE.tempPoints[0], b2 = STATE.tempPoints[1];
                    var ua2 = toUTM(a2), ub2 = toUTM(b2);
                    STATE.refAngleDeg = normDeg(rad2deg(Math.atan2(ub2[1]-ua2[1], ub2[0]-ua2[0])));
                    drawRefLine(a2, b2);
                    setTopText("Dir: " + STATE.refAngleDeg.toFixed(2) + "° — press ✓");
                } else {
                    STATE.tempPoints = [evt.coordinate.slice()];
                    STATE.pivotPoint = STATE.tempPoints[0];
                    drawRefPoint(STATE.pivotPoint); STATE.refAngleDeg = null;
                    setTopText("Click direction point");
                }
            };
            STATE.map.on("click", STATE.clickHandler);
        }
    }

    function drawRefLine(p1, p2) {
        if (!STATE.refLayer) return;
        var src = STATE.refLayer.getSource(); src.clear();
        src.addFeature(new ol.Feature(new ol.geom.LineString([p1, p2])));
    }
    function drawRefPoint(p) {
        if (!STATE.refLayer) return;
        var src = STATE.refLayer.getSource(); src.clear();
        src.addFeature(new ol.Feature(new ol.geom.Point(p)));
    }

    // ========================================================
    // STAGE 3 — AREA INPUT
    // ========================================================

    function stageAreaInput() {
        STATE.stage = "area"; detachHandlers(); STATE.isReversed = false;

        showPanel(
            hdr('Enter Part 1 Area') +
            '<div class="mb">' +
                '<div class="ms">' +
                    'Direction: <b>' + STATE.refAngleDeg.toFixed(2) + '°</b><br>' +
                    'Total: <b>' + fmtArea(STATE.totalAreaM2, STATE.chosenUnit) + '</b>' +
                '</div>' +
                '<label style="font-weight:600;font-size:12px;display:block;">Part 1 Area</label>' +
                '<div class="mig">' +
                    '<input type="number" id="av" class="mi" step="any" placeholder="e.g. 1.500">' +
                    '<select id="au" class="mi">' +
                        '<option value="sqm"' + (STATE.chosenUnit === "sqm" ? " selected" : "") + '>m²</option>' +
                        '<option value="acres"' + (STATE.chosenUnit === "acres" ? " selected" : "") + '>Acres</option>' +
                        '<option value="cents"' + (STATE.chosenUnit === "cents" ? " selected" : "") + '>Cents</option>' +
                        '<option value="guntas"' + (STATE.chosenUnit === "guntas" ? " selected" : "") + '>Guntas</option>' +
                        '<option value="hectares"' + (STATE.chosenUnit === "hectares" ? " selected" : "") + '>Hectares</option>' +
                        '<option value="sqft"' + (STATE.chosenUnit === "sqft" ? " selected" : "") + '>sq.ft.</option>' +
                    '</select>' +
                '</div>' +
                '<button class="bt bp" id="cc">Calculate Division</button>' +
                '<button class="bt bs" id="bk3">← Back to Direction</button>' +
                '<button class="bt bd" id="cn3">Close Tool</button>' +
            '</div>'
        );

        document.getElementById("mcl").onclick = closePanel;
        document.getElementById("cn3").onclick = closePanel;
        document.getElementById("bk3").onclick = stageDirection;
        document.getElementById("cc").onclick = runCalculation;
        document.getElementById("au").onchange = function () {
            STATE.chosenUnit = this.value; stageAreaInput();
        };
    }

    async function runCalculation() {
        var val = parseFloat(document.getElementById("av").value);
        var unit = document.getElementById("au").value;
        if (isNaN(val) || val <= 0) { alert("Enter a valid area."); return; }
        STATE.chosenUnit = unit;
        STATE.targetPart1M2 = val * AREA_UNITS[unit].factor;
        if (STATE.targetPart1M2 >= STATE.totalAreaM2) {
            alert("Part 1 must be less than total (" + fmtArea(STATE.totalAreaM2, unit) + ")."); return;
        }
        showPanel(
            hdr('Calculating...') +
            '<div class="mb" style="text-align:center;padding:30px;">' +
                '<div style="color:#334155;">Running UTM 43N bisection solver...</div>' +
            '</div>'
        );
        document.getElementById("mcl").onclick = closePanel;
        await waitFrame();
        performSearch(false);
    }

    function performSearch(reversed) {
        STATE.isReversed = reversed;
        var solveTarget = reversed ? (STATE.totalAreaM2 - STATE.targetPart1M2) : STATE.targetPart1M2;
        STATE.solutions = findSolutions(STATE.refAngleDeg, solveTarget);
        if (!STATE.solutions.length) {
            showPanel(
                hdr('No Solution Found') +
                '<div class="mb">' +
                    '<div class="ms warn">No straight line could produce the requested area.</div>' +
                    '<button class="bt bp" id="rt">Try Different Area</button>' +
                    '<button class="bt bs" id="bkr">← Back</button>' +
                    '<button class="bt bd" id="cnx">Close</button>' +
                '</div>'
            );
            document.getElementById("mcl").onclick = closePanel;
            document.getElementById("cnx").onclick = closePanel;
            document.getElementById("rt").onclick = stageAreaInput;
            document.getElementById("bkr").onclick = stageDirection;
            return;
        }
        stageSolutions();
    }

    // ========================================================
    // SOLVER
    // ========================================================

    function findSolutions(baseAngle, targetM2) {
        var offsets = [0, 0.05, -0.05, 0.1, -0.1, 0.25, -0.25, 0.5, -0.5,
            1, -1, 2, -2, 5, -5, 10, -10, 20, -20, 30, -30, 45, -45, 60, -60, 90];
        var results = [];
        var total = STATE.selectedEntries.length;
        for (var i = 0; i < offsets.length; i++) {
            var angle = normDeg(baseAngle + offsets[i]);
            var r = solveAngle(angle, targetM2);
            if (r && r.ok) {
                results.push({
                    angleDeg: angle, deltaDeg: Math.abs(offsets[i]),
                    offset: r.offset, split: r.split,
                    errorM2: Math.abs(r.split.p1area - targetM2),
                    crossAll: r.crossCount === total
                });
                if (i === 0 && r.crossCount === total &&
                    Math.abs(r.split.p1area - targetM2) < CONFIG.areaToleranceM2 * 10) break;
                if (results.length >= 6) break;
            }
        }
        results.sort(function (a, b) {
            if (a.crossAll !== b.crossAll) return a.crossAll ? -1 : 1;
            if (Math.abs(a.errorM2 - b.errorM2) > 0.01) return a.errorM2 - b.errorM2;
            return a.deltaDeg - b.deltaDeg;
        });
        return results;
    }

    function solveAngle(angleDeg, targetM2) {
        var ext = combinedExtent();
        var center = [(ext[0]+ext[2])/2, (ext[1]+ext[3])/2];
        var R = Math.hypot(ext[2]-ext[0], ext[3]-ext[1]) * 5;
        var lo = -R, hi = R, best = 0, bestSplit = null;
        for (var i = 0; i < CONFIG.bisectionIterations; i++) {
            var mid = (lo+hi)/2;
            var sp = evalSplit(angleDeg, mid, center, R);
            if (sp.p1area < targetM2) lo = mid; else hi = mid;
            best = mid; bestSplit = sp;
            if (Math.abs(sp.p1area - targetM2) < CONFIG.areaToleranceM2) break;
        }
        return {
            ok: !!(bestSplit && bestSplit.p1geoms.length),
            offset: best, split: bestSplit,
            crossCount: bestSplit ? bestSplit.crossCount : 0
        };
    }

    function evalSplit(angleDeg, offset, center, R) {
        var theta = deg2rad(angleDeg);
        var dx = Math.cos(theta), dy = Math.sin(theta);
        var nx = -dy, ny = dx;
        var lp = [center[0]+nx*offset, center[1]+ny*offset];
        var a1 = [lp[0]+dx*R, lp[1]+dy*R], a2 = [lp[0]-dx*R, lp[1]-dy*R];
        var a3 = [a2[0]-nx*R, a2[1]-ny*R], a4 = [a1[0]-nx*R, a1[1]-ny*R];
        var halfPoly = new ol.geom.Polygon([[a1, a2, a3, a4, a1.slice()]]);
        var halfJ = toJ(halfPoly);
        var p1area = 0, crossCount = 0, p1geoms = [], p2geoms = [], cuts = [];

        STATE.selectedEntries.forEach(function (entry) {
            var jg = toJ(entry.geometry);
            if (!jg.isValid()) jg = jg.buffer(0);
            try {
                var i1 = jg.intersection(halfJ), i2 = jg.difference(halfJ);
                var g1 = null, g2 = null, a1v = 0, a2v = 0;
                if (!i1.isEmpty()) { g1 = toOl(i1); a1v = msdGeometryArea(g1); }
                if (!i2.isEmpty()) { g2 = toOl(i2); a2v = msdGeometryArea(g2); }
                if (g1 && a1v > CONFIG.minPartAreaM2) { p1area += a1v; p1geoms.push({g:g1,a:a1v}); }
                if (g2 && a2v > CONFIG.minPartAreaM2) { p2geoms.push({g:g2,a:a2v}); }
                if (a1v > CONFIG.minPartAreaM2 && a2v > CONFIG.minPartAreaM2) crossCount++;
                if (!i1.isEmpty() && !i2.isEmpty()) {
                    try {
                        var ci = i1.getBoundary().intersection(i2.getBoundary());
                        if (!ci.isEmpty()) cuts.push(toOl(ci));
                    } catch(e2) {}
                }
            } catch(e) {}
        });
        return { p1area: p1area, crossCount: crossCount, p1geoms: p1geoms, p2geoms: p2geoms, cuts: cuts };
    }

    function combinedExtent() {
        var ext = ol.extent.createEmpty();
        STATE.selectedEntries.forEach(function (e) { ol.extent.extend(ext, e.geometry.getExtent()); });
        return ext;
    }

    // ========================================================
    // STAGE 4 — SOLUTIONS
    // ========================================================

    function stageSolutions() {
        STATE.stage = "solutions"; STATE.activeSolIdx = 0;
        var target = STATE.targetPart1M2;
        var remain = STATE.totalAreaM2 - STATE.targetPart1M2;

        var listHtml = '';
        STATE.solutions.forEach(function (s, i) {
            var dt = s.deltaDeg === 0 ? "Exact Reference" : "±" + s.deltaDeg.toFixed(2) + "°";
            var ct = s.crossAll ? "✓ All" : "Partial";
            listHtml += '<li class="sc' + (i===0?' act':'') + '" data-i="' + i + '">' +
                '<b>#' + (i+1) + ': ' + s.angleDeg.toFixed(2) + '°</b> (' + dt + ')<br>' +
                '<span style="font-size:11px;color:#64748b;">' + ct + '</span></li>';
        });

        showPanel(
            hdr('Division Solutions') +
            '<div class="mb">' +
                '<div class="ms">' +
                    'Reference: <b>' + STATE.refAngleDeg.toFixed(2) + '°</b>' +
                    (STATE.isReversed ? ' <span style="color:#ea580c">(Reversed)</span>' : '') + '<br>' +
                    'Part 1: <b>' + fmtArea(target, STATE.chosenUnit) + '</b><br>' +
                    'Part 2: <b>' + fmtArea(remain, STATE.chosenUnit) + '</b>' +
                '</div>' +
                '<fieldset class="mf"><legend>Select a Solution</legend>' +
                    '<ul class="sl">' + listHtml + '</ul>' +
                '</fieldset>' +
                '<button class="bt bg" id="ap">Apply the Split</button>' +
                '<button class="bt bw" id="rv">⇄ Reverse Areas (Opposite Side)</button>' +
                '<button class="bt bs" id="bk4">← Back to Area Input</button>' +
                '<button class="bt bd" id="cn4">Close Tool</button>' +
            '</div>'
        );

        document.getElementById("mcl").onclick = closePanel;
        document.getElementById("cn4").onclick = closePanel;
        document.getElementById("bk4").onclick = stageAreaInput;
        document.getElementById("ap").onclick = applyFinalSplit;
        document.getElementById("rv").onclick = function () {
            showPanel(hdr('Recalculating...') +
                '<div class="mb" style="text-align:center;padding:30px;">' +
                '<div style="color:#334155;">Recalculating from opposite side...</div></div>');
            document.getElementById("mcl").onclick = closePanel;
            setTimeout(function () { performSearch(!STATE.isReversed); }, 60);
        };

        document.querySelectorAll(".sc").forEach(function (el) {
            el.onclick = function () {
                var idx = parseInt(el.dataset.i, 10);
                STATE.activeSolIdx = idx;
                document.querySelectorAll(".sc").forEach(function (x) { x.classList.remove("act"); });
                el.classList.add("act");
                previewSol(idx);
            };
        });
        previewSol(0);
    }

    function previewSol(idx) {
        var sol = STATE.solutions[idx], sp = sol.split;
        STATE.resultLayer.getSource().clear(); STATE.labelLayer.getSource().clear();
        var p1L = STATE.isReversed ? 2 : 1, p2L = STATE.isReversed ? 1 : 2;
        sp.p1geoms.forEach(function (item) {
            var f = new ol.Feature(item.g); f.set("msdPart", p1L);
            STATE.resultLayer.getSource().addFeature(f);
        });
        sp.p2geoms.forEach(function (item) {
            var f = new ol.Feature(item.g); f.set("msdPart", p2L);
            STATE.resultLayer.getSource().addFeature(f);
        });
        sp.cuts.forEach(function (g) {
            var f = new ol.Feature(g); f.set("msdCut", true);
            STATE.resultLayer.getSource().addFeature(f);
        });
    }

    // ========================================================
    // STAGE 5 — APPLY
    // ========================================================

    function applyFinalSplit() {
        var sol = STATE.solutions[STATE.activeSolIdx];
        STATE.stage = "applied";
        if (STATE.selLayer) STATE.selLayer.getSource().clear();
        if (STATE.refLayer) STATE.refLayer.getSource().clear();
        renderResult(sol.split, sol.angleDeg);
    }

    function renderResult(sp, angleDeg) {
        STATE.resultLayer.getSource().clear(); STATE.labelLayer.getSource().clear();
        var p1L = STATE.isReversed ? 2 : 1, p2L = STATE.isReversed ? 1 : 2;
        var p1total = 0, p2total = 0;

        sp.p1geoms.forEach(function (item) {
            var area = msdGeometryArea(item.g);
            if (p1L === 1) p1total += area; else p2total += area;
            var f = new ol.Feature(item.g); f.set("msdPart", p1L);
            STATE.resultLayer.getSource().addFeature(f);
            addSideLabels(item.g, p1L);
            addCentroidLabel(item.g, "PART " + p1L, area, p1L);
        });
        sp.p2geoms.forEach(function (item) {
            var area = msdGeometryArea(item.g);
            if (p2L === 1) p1total += area; else p2total += area;
            var f = new ol.Feature(item.g); f.set("msdPart", p2L);
            STATE.resultLayer.getSource().addFeature(f);
            addSideLabels(item.g, p2L);
            addCentroidLabel(item.g, "PART " + p2L, area, p2L);
        });
        sp.cuts.forEach(function (g) {
            var f = new ol.Feature(g); f.set("msdCut", true);
            STATE.resultLayer.getSource().addFeature(f);
        });

        STATE.hasAppliedResult = true;

        showPanel(
            hdr('✓ Division Applied') +
            '<div class="mb">' +
                '<div class="ms">' +
                    'Orientation: <b>' + angleDeg.toFixed(2) + '°</b>' +
                    (STATE.isReversed ? ' <span style="color:#ea580c">(Reversed)</span>' : '') + '<br><br>' +
                    '<b style="color:' + CONFIG.part1Stroke + '">PART 1:</b> ' +
                    fmtArea(p1total, STATE.chosenUnit) + '<br>' +
                    '<b style="color:' + CONFIG.part2Stroke + '">PART 2:</b> ' +
                    fmtArea(p2total, STATE.chosenUnit) + '<br>' +
                    '<span style="color:#64748b;font-size:11px;">Total: ' +
                    fmtArea(p1total + p2total, STATE.chosenUnit) + '</span>' +
                '</div>' +
                '<div class="ms">' +
                    'Measurements in <b>EPSG:32643</b>.<br>' +
                    'Saved overlays remain persistent in local storage.' +
                '</div>' +
                '<button class="bt bg" id="sv5" style="background:#0891b2;">💾 Save Split Locally</button>' +
                '<button class="bt bw" id="rv5">⇄ Reverse (' +
                    fmtArea(STATE.targetPart1M2, STATE.chosenUnit) + ' Opposite Side)</button>' +
                '<button class="bt bs" id="bk5">← Back to Solutions</button>' +
                '<button class="bt bp" id="nw5">New Division (Clear)</button>' +
                '<button class="bt bg" id="cl5">Close (Keep Results)</button>' +
            '</div>'
        );

        document.getElementById("mcl").onclick = closePanel;
        document.getElementById("cl5").onclick = closePanel;
        document.getElementById("bk5").onclick = stageSolutions;
        document.getElementById("nw5").onclick = function () {
            removeResultLayers(); STATE.hasAppliedResult = false;
            closePanel(); openTool();
        };
        
        var svBtn = document.getElementById("sv5");
        if (svBtn) {
            svBtn.onclick = function() {
                saveCurrentSplit();
                svBtn.innerText = "Saved Locally ✓";
                svBtn.disabled = true;
                svBtn.style.background = "#059669";
            };
        }

        document.getElementById("rv5").onclick = function () {
            showPanel(hdr('Recalculating...') +
                '<div class="mb" style="text-align:center;padding:30px;">' +
                '<div style="color:#334155;">Recalculating from opposite side...</div></div>');
            document.getElementById("mcl").onclick = closePanel;
            setTimeout(function () { performSearch(!STATE.isReversed); }, 60);
        };
    }

    // ========================================================
    // LABELS
    // ========================================================

    function addSideLabels(geometry, part) {
        var polys = geometry.getType() === "MultiPolygon" ? geometry.getPolygons() : [geometry];
        polys.forEach(function (poly) {
            var rings = poly.getCoordinates();
            if (!rings || !rings.length) return;
            var ring = rings[0];
            for (var i = 0; i < ring.length - 1; i++) {
                var p1 = ring[i], p2 = ring[i+1];
                var len = msdDistance(p1, p2);
                if (len < CONFIG.minSegmentLengthM) continue;
                var mid = [(p1[0]+p2[0])/2, (p1[1]+p2[1])/2];
                var rot = Math.atan2(p2[1]-p1[1], p2[0]-p1[0]);
                if (rot > Math.PI/2) rot -= Math.PI;
                if (rot < -Math.PI/2) rot += Math.PI;
                var f = new ol.Feature({
                    geometry: new ol.geom.Point(mid),
                    msdText: fmtNum(len, CONFIG.sideDecimals) + " m",
                    msdRot: -rot, msdPart: part
                });
                STATE.labelLayer.getSource().addFeature(f);
            }
        });
    }

    function addCentroidLabel(geometry, title, areaM2, part) {
        var pt = null;
        try {
            if (geometry.getType() === "Polygon") pt = geometry.getInteriorPoint().getCoordinates();
            else if (geometry.getType() === "MultiPolygon") {
                var pts = geometry.getInteriorPoints().getCoordinates();
                if (pts && pts.length) pt = pts[0];
            }
        } catch (e) { return; }
        if (!pt) return;
        var f = new ol.Feature({
            geometry: new ol.geom.Point([pt[0], pt[1]]),
            msdText: title + "\n" + fmtArea(areaM2, STATE.chosenUnit),
            msdCentroid: true, msdPart: part
        });
        STATE.labelLayer.getSource().addFeature(f);
    }

    // ========================================================
    // GEOMETRY HELPERS
    // ========================================================

    function findNearestSegment(coord) {
        var best = null, minD = Infinity;
        STATE.selectedEntries.forEach(function (entry) {
            var polys = entry.geometry.getType() === "MultiPolygon"
                ? entry.geometry.getPolygons() : [entry.geometry];
            polys.forEach(function (poly) {
                var rings = poly.getCoordinates();
                rings.forEach(function (ring) {
                    for (var i = 0; i < ring.length - 1; i++) {
                        var p1 = ring[i], p2 = ring[i+1];
                        var d = ptSegDist(coord, p1, p2);
                        if (d < minD) { minD = d; best = { p1: p1.slice(), p2: p2.slice() }; }
                    }
                });
            });
        });
        return best;
    }

    function ptSegDist(p, a, b) {
        var dx = b[0]-a[0], dy = b[1]-a[1], l2 = dx*dx+dy*dy;
        if (l2 === 0) return Math.hypot(p[0]-a[0], p[1]-a[1]);
        var t = ((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l2;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(p[0]-(a[0]+t*dx), p[1]-(a[1]+t*dy));
    }

    // ========================================================
    // ESC KEY
    // ========================================================

    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && STATE.active) closePanel();
    });

    // ========================================================
    // INIT
    // ========================================================

    function init() {
        var m = getMap();
        if (!m) { setTimeout(init, 400); return; }
        STATE.map = m; detectProjection(); injectUI();
        console.log("📐 Multi-Polygon Division Tool v5.3 READY.");
    }

    init();

})();