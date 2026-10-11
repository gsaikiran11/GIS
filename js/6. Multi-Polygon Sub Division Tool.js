// ============================================================
// 📐 MULTI-POLYGON STRAIGHT DIVISION TOOL v6.1
// ============================================================
// QGIS2WEB + OPENLAYERS 10.x + JSTS
//
// v6.1 CHANGES:
// ✔ FIXED multi-polygon node dragging (anchor is now pinned for
//   the whole gesture; previously the pivot was re-clipped every
//   frame so the line drifted / flipped / froze)
// ✔ SNAPPING ENGINE for node dragging (single + multi):
//   vertices / edges / midpoints / saved parcels, live indicator,
//   PIXEL TOLERANCE SLIDER with metre readout, hold ALT to bypass
// ✔ EDIT saved splits: title, parcel IDs, 500-char descriptions
//   (labels + search index regenerate automatically)
// ✔ Node diagnostics panel when editing can't initialise
//
// v6.0: 2-node line editing, save dialog, searchable manager
// v5.5: full EPSG:32643 math pipeline, recursive sub-division
// ============================================================

(function () {

    "use strict";

    console.log("📐 Starting Multi-Polygon Division Tool v6.1...");

    // ========================================================
    // PROJECTION
    // ========================================================

    const DATA_PROJECTION = "EPSG:32643";
    const MAP_PROJECTION  = "EPSG:3857";

    (function registerUTM43N() {
        try {
            if (typeof proj4 !== "undefined") {
                if (!proj4.defs(DATA_PROJECTION)) {
                    proj4.defs(DATA_PROJECTION,
                        "+proj=utm +zone=43 +datum=WGS84 +units=m +no_defs");
                }
                if (typeof ol.proj.proj4 !== "undefined" && ol.proj.proj4.register) {
                    ol.proj.proj4.register(proj4);
                }
            }
        } catch (e) { console.warn("📐 proj4 registration skipped:", e.message); }
    })();

    // ========================================================
    // CONFIG
    // ========================================================

    const CONFIG = {
        buttonId: "msd-toggle-btn",
        panelId: "msd-panel",
        topBarId: "msd-topbar",
        jstsUrl: "https://unpkg.com/jsts@2.11.3/dist/jsts.min.js",

        storeKey:     "msd_saved_splits_v6",
        storeKeyOld:  "msd_saved_splits_v5",
        snapPrefsKey: "msd_snap_prefs_v1",

        bisectionIterations: 80,
        areaToleranceM2: 0.001,
        minSegmentLengthM: 0.05,
        minPartAreaM2: 0.01,

        descMaxChars: 500,
        idMaxChars: 60,

        sideDecimals: 2,
        areaDecimals: 3,

        part1Stroke: "#1565c0",
        part1Fill: "rgba(21,101,192,0.22)",
        part2Stroke: "#e65100",
        part2Fill: "rgba(230,81,0,0.22)",
        cutStroke: "#b71c1c",
        refStroke: "#00e676",
        selStroke: "#d50000",
        selFill: "rgba(213,0,0,0.12)",

        nodeFill: "#d50000",
        nodeFillHover: "#fbbf24",
        nodeFillDrag: "#16a34a",
        nodeFillAnchor: "#334155",
        nodeRadius: 8,
        nodeRadiusHover: 11,
        nodeHitTolerance: 16,

        snapColorVertex: "#f59e0b",
        snapColorMid:    "#8b5cf6",
        snapColorEdge:   "#06b6d4",

        chordScanSamples: 900,
        chordBisectIters: 55,
        lineScanSamples: 520,
        lineBisectIters: 48
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
        lockParallel: true,

        selectedFeatures: [],
        selectedEntries: [],
        polyRingsU: [],

        refAngleDeg: null,
        tempPointsU: [],
        selectedSide: null,

        targetPart1M2: null,
        solveTargetM2: null,
        totalAreaM2: null,
        chosenUnit: "acres",
        isReversed: false,

        solutions: [],
        activeSolIdx: 0,

        resultLayer: null,
        labelLayer: null,
        savedResultLayer: null,
        savedLabelLayer: null,
        selLayer: null,
        refLayer: null,
        nodeLayer: null,
        snapLayer: null,
        hasAppliedResult: false,

        clickHandler: null,
        pointerHandler: null,
        popupBlockerActive: false,
        popupBlockerHandler: null,
        popupPreviousFlags: null,
        popupPreviousDisplay: null,

        jstsReady: false,
        wipeConfirmActive: false,
        searchQuery: "",
        expandedSplitId: null,

        // ---- node editing ----
        nodeEditEnabled: false,
        nodeMode: null,              // 'chord' | 'line'
        nodeFailReason: "",
        ringData: null,
        posA: null, posB: null, posA0: null, posB0: null,
        lineNodes: null, lineNodes0: null,
        lineAngle: null, lineAngle0: null,
        chordTargetArea: null,

        draggingIdx: -1,
        hoverIdx: -1,
        dragAnchorU: null,
        rafPending: false,
        pendingCoordU: null,
        nodeDownFn: null, nodeMoveFn: null, nodeUpFn: null,
        keyDownFn: null, keyUpFn: null,
        altDown: false,

        // ---- snapping ----
        snap: {
            enabled: true,
            tolPx: 14,
            vertices: true,
            edges: true,
            midpoints: false,
            includeSaved: true
        },
        snapIndex: null,
        lastSnap: null,

        currentSplit: null,
        partMeta: { 1: { name: "PART 1", desc: "" }, 2: { name: "PART 2", desc: "" } },
        splitTitle: "",

        lastP1Total: 0,
        lastP2Total: 0,
        appliedAngleDeg: null
    };

    window.msdDivisionActive = false;

    // ========================================================
    // JSTS
    // ========================================================

    let _parser = null;

    function loadJSTS() {
        return new Promise(function (resolve, reject) {
            if (window.jsts && window.jsts.io && window.jsts.io.OL3Parser) {
                STATE.jstsReady = true; return resolve();
            }
            var existing = document.querySelector('script[data-msd-jsts="1"]');
            if (existing) {
                existing.addEventListener("load", function () { STATE.jstsReady = true; resolve(); });
                existing.addEventListener("error", reject);
                return;
            }
            var s = document.createElement("script");
            s.src = CONFIG.jstsUrl; s.async = true; s.dataset.msdJsts = "1";
            s.onload = function () { STATE.jstsReady = true; resolve(); };
            s.onerror = function () { reject(new Error("JSTS load failed")); };
            document.head.appendChild(s);
        });
    }

    function parser() {
        if (!_parser) {
            _parser = new jsts.io.OL3Parser();
            _parser.inject(ol.geom.Point, ol.geom.LineString, ol.geom.LinearRing,
                ol.geom.Polygon, ol.geom.MultiPoint, ol.geom.MultiLineString,
                ol.geom.MultiPolygon);
        }
        return _parser;
    }
    function toJ(g) { return parser().read(g); }
    function toOl(g) { return parser().write(g); }

    // ========================================================
    // PROJECTION BRIDGE
    // ========================================================

    function coordToUTM(c) {
        if (!STATE.needsTransform) return [c[0], c[1]];
        return ol.proj.transform(c, STATE.mapProjCode, DATA_PROJECTION);
    }
    function coordToMap(c) {
        if (!STATE.needsTransform) return [c[0], c[1]];
        return ol.proj.transform(c, DATA_PROJECTION, STATE.mapProjCode);
    }
    function geomToUTM(g) {
        if (!STATE.needsTransform) return g.clone();
        return g.clone().transform(STATE.mapProjCode, DATA_PROJECTION);
    }
    function geomToMap(g) {
        if (!STATE.needsTransform) return g.clone();
        return g.clone().transform(DATA_PROJECTION, STATE.mapProjCode);
    }

    // ========================================================
    // MEASUREMENT (UTM)
    // ========================================================

    function utmDist(a, b) { return Math.hypot(b[0] - a[0], b[1] - a[1]); }

    function utmRingArea(ring) {
        if (!ring || ring.length < 3) return 0;
        var area = 0;
        for (var i = 0; i < ring.length; i++) {
            var j = (i + 1) % ring.length;
            area += ring[i][0] * ring[j][1] - ring[j][0] * ring[i][1];
        }
        return Math.abs(area / 2);
    }
    function utmPolygonArea(poly) {
        var rings = poly.getCoordinates();
        if (!rings || !rings.length) return 0;
        var a = utmRingArea(rings[0]);
        for (var i = 1; i < rings.length; i++) a -= utmRingArea(rings[i]);
        return Math.max(0, a);
    }
    function utmArea(g) {
        if (!g) return 0;
        var t = g.getType();
        if (t === "Polygon") return utmPolygonArea(g);
        if (t === "MultiPolygon") {
            var s = 0; g.getPolygons().forEach(function (p) { s += utmPolygonArea(p); }); return s;
        }
        if (t === "GeometryCollection") {
            var q = 0; g.getGeometries().forEach(function (x) { q += utmArea(x); }); return q;
        }
        return 0;
    }

    // ========================================================
    // MAP
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
    }
    function metersPerPixelUTM() {
        try {
            var v = STATE.map.getView();
            var res = v.getResolution(), c = v.getCenter();
            var a = coordToUTM(c), b = coordToUTM([c[0] + res, c[1]]);
            var d = utmDist(a, b);
            return (isFinite(d) && d > 0) ? d : res;
        } catch (e) { return 1; }
    }

    // ========================================================
    // POPUP BLOCKER
    // ========================================================

    function blockPopups() {
        if (!STATE.map || STATE.popupBlockerActive) return;

        // Save the previous state: other survey tools may own these flags.
        STATE.popupPreviousFlags = {
            msdDivisionActive: window.msdDivisionActive,
            stage14MeasureActive: window.stage14MeasureActive
        };

        var popupEl = document.getElementById("feature-info-popup");
        STATE.popupPreviousDisplay = popupEl ? popupEl.style.display : null;

        window.msdDivisionActive = true;
        // Do not change stage14MeasureActive: it belongs to the measure tool.

        if (typeof window.closeFeaturePopup === "function") {
            try { window.closeFeaturePopup(); } catch (e) {}
        }
        if (popupEl) popupEl.style.display = "none";
        STATE.map.getOverlays().forEach(function (ov) { ov.setPosition(undefined); });

        STATE.popupBlockerHandler = function () {
            if (!STATE.active) return;
            STATE.map.getOverlays().forEach(function (ov) { ov.setPosition(undefined); });
            var p = document.getElementById("feature-info-popup");
            if (p) p.style.display = "none";
        };
        STATE.map.on("singleclick", STATE.popupBlockerHandler);
        STATE.popupBlockerActive = true;
    }

    function unblockPopups() {
        // Always remove our blocker and restore popup visibility, even if the
        // active flag was changed by another tool or close is called twice.
        if (STATE.map && STATE.popupBlockerHandler) {
            STATE.map.un("singleclick", STATE.popupBlockerHandler);
        }
        STATE.popupBlockerHandler = null;

        if (STATE.popupPreviousFlags) {
            window.msdDivisionActive = STATE.popupPreviousFlags.msdDivisionActive;
            window.stage14MeasureActive = STATE.popupPreviousFlags.stage14MeasureActive;
        } else {
            window.msdDivisionActive = false;
        }

        var popupEl = document.getElementById("feature-info-popup");
        if (popupEl) {
            // Clear the inline "display:none" applied by this tool so the
            // normal QGIS2Web popup code can display it again on the next click.
            popupEl.style.display = STATE.popupPreviousDisplay || "";
        }

        STATE.popupPreviousFlags = null;
        STATE.popupPreviousDisplay = null;
        STATE.popupBlockerActive = false;
    }

    // ========================================================
    // HELPERS
    // ========================================================

    function deg2rad(d) { return d * Math.PI / 180; }
    function rad2deg(r) { return r * 180 / Math.PI; }
    function normDeg(d) { var v = d % 180; if (v < 0) v += 180; return v; }
    function norm360(d) { var v = d % 360; if (v < 0) v += 360; return v; }
    function fmtNum(v, d) { return Number(v).toFixed(d); }
    function fmtArea(m2, unit) {
        var u = AREA_UNITS[unit] || AREA_UNITS.sqm;
        return (m2 / u.factor).toFixed(CONFIG.areaDecimals) + " " + u.name;
    }
    function waitFrame() { return new Promise(function (r) { requestAnimationFrame(r); }); }
    function esc(s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;")
            .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }
    function detachHandlers() {
        if (STATE.map && STATE.clickHandler) { STATE.map.un("click", STATE.clickHandler); STATE.clickHandler = null; }
        if (STATE.map && STATE.pointerHandler) { STATE.map.un("pointermove", STATE.pointerHandler); STATE.pointerHandler = null; }
    }

    // ========================================================
    // SNAP PREFS
    // ========================================================

    function loadSnapPrefs() {
        try {
            var raw = localStorage.getItem(CONFIG.snapPrefsKey);
            if (!raw) return;
            var p = JSON.parse(raw);
            if (p && typeof p === "object") {
                Object.keys(STATE.snap).forEach(function (k) {
                    if (p[k] !== undefined) STATE.snap[k] = p[k];
                });
            }
        } catch (e) {}
    }
    function saveSnapPrefs() {
        try { localStorage.setItem(CONFIG.snapPrefsKey, JSON.stringify(STATE.snap)); } catch (e) {}
    }

    // ========================================================
    // STORE
    // ========================================================

    function migrateStore() {
        try {
            if (localStorage.getItem(CONFIG.storeKey)) return;
            var oldRaw = localStorage.getItem(CONFIG.storeKeyOld);
            if (!oldRaw) return;
            var old = JSON.parse(oldRaw);
            if (!Array.isArray(old)) return;
            var migrated = old.map(function (r) {
                return {
                    id: r.id, ts: Date.now(), date: r.date || "",
                    title: "Imported split", targetText: r.targetText || "",
                    targetM2: null, unit: "sqm", angleDeg: null, reversed: false,
                    sourceIds: r.sourceIds || [], parts: [],
                    results: r.results, labels: r.labels
                };
            });
            localStorage.setItem(CONFIG.storeKey, JSON.stringify(migrated));
        } catch (e) {}
    }

    function getSavedSplits() {
        try {
            var raw = localStorage.getItem(CONFIG.storeKey);
            if (!raw) return [];
            var p = JSON.parse(raw);
            return Array.isArray(p) ? p : [];
        } catch (e) { return []; }
    }
    function putSavedSplits(list) {
        localStorage.setItem(CONFIG.storeKey, JSON.stringify(list));
    }
    function getSplitById(id) {
        var l = getSavedSplits();
        for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
        return null;
    }
    function consumedParcelIds(list) {
        var set = Object.create(null);
        list.forEach(function (r) {
            (r.sourceIds || []).forEach(function (id) { set[id] = true; });
        });
        return set;
    }

    function saveCurrentSplit() {
        try {
            var format = new ol.format.GeoJSON();
            var splitId = "split_" + Date.now() + "_" + Math.floor(Math.random() * 9999);

            var resultFeats = STATE.resultLayer.getSource().getFeatures();
            var labelFeats  = STATE.labelLayer.getSource().getFeatures();

            var parts = [];
            resultFeats.forEach(function (f) {
                f.set("__split_id", splitId);
                var pk = f.get("__pk");
                if (!pk) return;
                var pid = splitId + ":" + pk;
                f.set("__parcel_id", pid);
                parts.push({
                    pk: pk, parcelId: pid, part: f.get("msdPart"),
                    name: f.get("msdName") || "", desc: f.get("msdDesc") || "",
                    areaM2: f.get("msdAreaM2") || 0
                });
            });
            labelFeats.forEach(function (f) {
                f.set("__split_id", splitId);
                var pk = f.get("__pk");
                if (pk) f.set("__parcel_id", splitId + ":" + pk);
            });

            var sourceIds = [];
            STATE.selectedEntries.forEach(function (e) { if (e.parcelId) sourceIds.push(e.parcelId); });

            var now = new Date();
            var list = getSavedSplits();
            list.push({
                id: splitId, ts: now.getTime(),
                date: now.toLocaleDateString() + " " +
                      now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                title: STATE.splitTitle || "Split",
                targetText: fmtArea(STATE.targetPart1M2, STATE.chosenUnit),
                targetM2: STATE.targetPart1M2, unit: STATE.chosenUnit,
                angleDeg: STATE.appliedAngleDeg, reversed: STATE.isReversed,
                sourceIds: sourceIds, parts: parts,
                results: format.writeFeaturesObject(resultFeats),
                labels: format.writeFeaturesObject(labelFeats)
            });
            putSavedSplits(list);
            loadSavedSplitsIntoLayers();
            return splitId;
        } catch (e) {
            console.error("Failed to save split:", e);
            alert("Error saving split locally: " + e.message);
            return null;
        }
    }

    /** Rewrite names/descriptions inside a stored record (results + labels). */
    function applySplitEdits(id, title, partEdits) {
        var list = getSavedSplits();
        var rec = null;
        for (var i = 0; i < list.length; i++) if (list[i].id === id) { rec = list[i]; break; }
        if (!rec) return false;

        rec.title = title;
        var byPk = Object.create(null);
        (rec.parts || []).forEach(function (p) {
            if (partEdits[p.pk]) {
                p.name = partEdits[p.pk].name;
                p.desc = partEdits[p.pk].desc;
            }
            byPk[p.pk] = p;
        });

        var unit = rec.unit || "sqm";

        if (rec.results && rec.results.features) {
            rec.results.features.forEach(function (f) {
                var pk = f.properties && f.properties.__pk;
                if (pk && byPk[pk]) {
                    f.properties.msdName = byPk[pk].name;
                    f.properties.msdDesc = byPk[pk].desc;
                }
            });
        }
        if (rec.labels && rec.labels.features) {
            rec.labels.features.forEach(function (f) {
                var pr = f.properties || {};
                var pk = pr.__pk;
                if (pk && byPk[pk] && pr.msdCentroid) {
                    pr.msdText = byPk[pk].name + "\n" +
                                 fmtArea(byPk[pk].areaM2 || 0, unit);
                }
            });
        }
        putSavedSplits(list);
        loadSavedSplitsIntoLayers();
        return true;
    }

    function deleteSplit(id) {
        try {
            putSavedSplits(getSavedSplits().filter(function (s) { return s.id !== id; }));
            loadSavedSplitsIntoLayers();
        } catch (e) { console.error(e); }
    }
    function wipeSavedSplits() {
        localStorage.removeItem(CONFIG.storeKey);
        if (STATE.savedResultLayer) STATE.savedResultLayer.getSource().clear();
        if (STATE.savedLabelLayer) STATE.savedLabelLayer.getSource().clear();
    }

    function loadSavedSplitsIntoLayers() {
        if (!STATE.savedResultLayer || !STATE.savedLabelLayer) return;
        STATE.savedResultLayer.getSource().clear();
        STATE.savedLabelLayer.getSource().clear();
        var list = getSavedSplits();
        var consumed = consumedParcelIds(list);
        var format = new ol.format.GeoJSON();
        list.forEach(function (item) {
            if (item.results) {
                format.readFeatures(item.results).forEach(function (f) {
                    f.set("__split_id", item.id);
                    var pid = f.get("__parcel_id");
                    if (pid && consumed[pid]) return;
                    STATE.savedResultLayer.getSource().addFeature(f);
                });
            }
            if (item.labels) {
                format.readFeatures(item.labels).forEach(function (f) {
                    f.set("__split_id", item.id);
                    var pid = f.get("__parcel_id");
                    if (pid && consumed[pid]) return;
                    STATE.savedLabelLayer.getSource().addFeature(f);
                });
            }
        });
    }

    function liveParcelCount() {
        if (!STATE.savedResultLayer) return 0;
        var n = 0;
        STATE.savedResultLayer.getSource().getFeatures().forEach(function (f) {
            if (f.get("msdPart")) n++;
        });
        return n;
    }
    function splitSearchBlob(rec) {
        var s = [rec.title, rec.targetText, rec.date, rec.unit].join(" ");
        (rec.parts || []).forEach(function (p) { s += " " + p.name + " " + p.desc; });
        return s.toLowerCase();
    }
    function highlightSavedSplitOnMap(id) {
        if (!STATE.savedResultLayer) return;
        STATE.savedResultLayer.getSource().getFeatures().forEach(function (f) {
            if (f.get("__split_id") === id) f.set("__is_highlighted", true);
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
            if (f.get("__split_id") === id) ol.extent.extend(ext, f.getGeometry().getExtent());
        });
        if (!ol.extent.isEmpty(ext)) {
            STATE.map.getView().fit(ext, { duration: 600, padding: [60, 60, 60, 60] });
        }
    }

    // ========================================================
    // UI
    // ========================================================

    function injectUI() {
        if (document.getElementById(CONFIG.buttonId)) return;
        var css = document.createElement("style");
        css.textContent = `
            #${CONFIG.buttonId}{position:fixed;bottom:30px;right:20px;width:50px;height:50px;
                background:#fff;color:#1e293b;border:2px solid #94a3b8;border-radius:50%;
                font-size:22px;display:flex;align-items:center;justify-content:center;
                cursor:pointer;z-index:18500;box-shadow:0 3px 12px rgba(0,0,0,.25);transition:all .15s;}
            #${CONFIG.buttonId}:hover{background:#f1f5f9;}
            #${CONFIG.buttonId}.on{background:#dc2626;color:#fff;border-color:#b91c1c;}

            #${CONFIG.panelId}{position:fixed;top:16px;right:16px;width:352px;
                max-height:calc(100vh - 32px);background:#fff;border-radius:10px;
                box-shadow:0 8px 30px rgba(0,0,0,.28);border:1px solid #cbd5e1;
                font-family:system-ui,-apple-system,Arial,sans-serif;font-size:13px;
                z-index:18600;display:flex;flex-direction:column;overflow:hidden;box-sizing:border-box;}
            #${CONFIG.panelId}.hide{display:none;}

            .mh{background:#0f172a;color:#f8fafc;padding:10px 14px;display:flex;
                justify-content:space-between;align-items:center;font-weight:700;
                font-size:13px;flex-shrink:0;}
            .mh-btns{display:flex;align-items:center;gap:4px;}
            .mh .x,.mh .mn{cursor:pointer;font-size:16px;opacity:.7;width:26px;height:26px;
                display:flex;align-items:center;justify-content:center;border-radius:4px;
                transition:all .12s;background:transparent;border:none;color:#f8fafc;}
            .mh .x:hover,.mh .mn:hover{opacity:1;background:rgba(255,255,255,.15);}

            .mb{padding:12px 14px;overflow-y:auto;transition:max-height .2s,padding .2s;}
            .mb.collapsed{max-height:0!important;padding-top:0!important;
                padding-bottom:0!important;overflow:hidden!important;}

            .ms{background:#f1f5f9;border-radius:6px;padding:8px 10px;margin-bottom:10px;
                font-size:12px;color:#334155;line-height:1.55;}
            .ms.warn{background:#fff7ed;color:#9a3412;}
            .ms.tip{background:#fef3c7;color:#92400e;}
            .ms.ok{background:#ecfdf5;color:#065f46;}
            .ms.pur{background:#f5f3ff;color:#5b21b6;}

            .mf{border:1px solid #e2e8f0;border-radius:6px;padding:8px 10px;margin-bottom:10px;}
            .mf legend{font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;
                letter-spacing:.5px;padding:0 4px;}
            .mf label{display:block;margin:3px 0;cursor:pointer;font-size:12px;}

            .mi{width:100%;box-sizing:border-box;padding:7px 8px;border:1px solid #cbd5e1;
                border-radius:5px;font-size:13px;font-family:inherit;}
            .mi:focus{outline:2px solid #93c5fd;border-color:#3b82f6;}
            .mig{display:flex;gap:6px;margin-top:4px;}
            .mig .mi:first-child{flex:2;} .mig .mi:last-child{flex:1;}
            textarea.mi{resize:vertical;min-height:58px;line-height:1.45;}
            .ctr{text-align:right;font-size:10px;color:#94a3b8;margin-top:2px;}
            .ctr.warn{color:#dc2626;font-weight:700;}
            .fl{font-size:11px;font-weight:700;color:#475569;display:block;margin:8px 0 2px;
                text-transform:uppercase;letter-spacing:.3px;}

            .bt{width:100%;padding:9px;border:none;border-radius:5px;font-weight:600;
                cursor:pointer;font-size:13px;margin-top:6px;transition:background .15s;}
            .bp{background:#2563eb;color:#fff;} .bp:hover{background:#1d4ed8;}
            .bg{background:#16a34a;color:#fff;} .bg:hover{background:#15803d;}
            .bs{background:#e2e8f0;color:#334155;} .bs:hover{background:#cbd5e1;}
            .bw{background:#ea580c;color:#fff;} .bw:hover{background:#c2410c;}
            .bd{background:#dc2626;color:#fff;} .bd:hover{background:#b91c1c;}
            .bc{background:#0891b2;color:#fff;} .bc:hover{background:#0e7490;}
            .bv{background:#7c3aed;color:#fff;} .bv:hover{background:#6d28d9;}
            .bt:disabled{background:#e2e8f0;color:#94a3b8;cursor:default;}

            .sl{list-style:none;padding:0;margin:6px 0 0;max-height:150px;overflow-y:auto;}
            .sc{padding:7px 9px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:5px;
                margin-bottom:4px;cursor:pointer;font-size:12px;}
            .sc:hover{background:#f1f5f9;} .sc.act{background:#eff6ff;border-color:#3b82f6;}
            .hint{font-size:11px;color:#0284c7;margin-top:4px;}

            .pcard{border:1px solid #e2e8f0;border-left-width:4px;border-radius:6px;
                padding:8px 10px;margin-bottom:10px;background:#fff;}
            .pcard.p1{border-left-color:${CONFIG.part1Stroke};}
            .pcard.p2{border-left-color:${CONFIG.part2Stroke};}
            .pcard h4{margin:0 0 6px;font-size:12px;}

            /* snap controls */
            .snapbox{border:1px solid #e2e8f0;border-radius:6px;padding:8px 10px;
                margin-bottom:10px;background:#fbfdff;}
            .snaphead{display:flex;justify-content:space-between;align-items:center;
                font-size:11px;font-weight:700;color:#0f172a;margin-bottom:6px;}
            .snaprow{display:flex;align-items:center;gap:8px;margin:6px 0;}
            .snaprow input[type=range]{flex:1;accent-color:#0891b2;}
            .snapval{font-size:11px;font-weight:700;color:#0e7490;min-width:76px;text-align:right;}
            .snapgrid{display:grid;grid-template-columns:1fr 1fr;gap:2px 8px;margin-top:4px;}
            .snapgrid label{font-size:11px;display:flex;align-items:center;gap:4px;cursor:pointer;}
            .snapnote{font-size:10px;color:#64748b;margin-top:4px;}

            .sd-box{border:1px solid #e2e8f0;border-radius:8px;padding:10px;background:#fafafa;
                margin-bottom:12px;}
            .sd-header{display:flex;justify-content:space-between;align-items:center;
                font-weight:700;font-size:12px;margin-bottom:8px;color:#0f172a;}
            .sd-search{position:relative;margin-bottom:8px;}
            .sd-search input{width:100%;box-sizing:border-box;padding:6px 26px 6px 28px;
                border:1px solid #cbd5e1;border-radius:14px;font-size:11px;}
            .sd-search input:focus{outline:2px solid #a5b4fc;border-color:#6366f1;}
            .sd-search .ic{position:absolute;left:9px;top:50%;transform:translateY(-50%);
                font-size:11px;color:#94a3b8;pointer-events:none;}
            .sd-search .cx{position:absolute;right:6px;top:50%;transform:translateY(-50%);
                border:none;background:none;cursor:pointer;color:#94a3b8;font-size:13px;
                line-height:1;padding:2px 4px;border-radius:3px;}
            .sd-search .cx:hover{background:#e2e8f0;color:#334155;}
            .sd-list{max-height:200px;overflow-y:auto;margin:0;padding:0;list-style:none;}
            .sd-item{background:#fff;border:1px solid #e2e8f0;border-radius:5px;padding:6px 8px;
                margin-bottom:4px;font-size:11px;transition:border-color .15s,background .15s;}
            .sd-item:hover{border-color:#06b6d4;background:#f0fdfa;}
            .sd-row{display:flex;justify-content:space-between;align-items:center;}
            .sd-info{display:flex;flex-direction:column;cursor:pointer;flex-grow:1;min-width:0;}
            .sd-title{font-weight:700;color:#0f172a;white-space:nowrap;overflow:hidden;
                text-overflow:ellipsis;}
            .sd-sub{font-size:9.5px;color:#64748b;white-space:nowrap;overflow:hidden;
                text-overflow:ellipsis;}
            .sd-badge{display:inline-block;background:#ede9fe;color:#5b21b6;border-radius:3px;
                padding:0 4px;font-size:9px;margin-left:4px;}
            .sd-actions{display:flex;gap:1px;align-items:center;flex-shrink:0;}
            .sd-action-btn{background:none;border:none;cursor:pointer;font-size:12px;
                padding:3px 4px;border-radius:3px;display:flex;align-items:center;}
            .sd-action-btn:hover{background:#f1f5f9;}
            .sd-action-btn.del:hover{background:#fee2e2;color:#ef4444;}
            .sd-action-btn.edit:hover{background:#ede9fe;color:#6d28d9;}
            .sd-det{margin-top:6px;border-top:1px dashed #e2e8f0;padding-top:6px;}
            .sd-part{background:#f8fafc;border-radius:4px;padding:4px 6px;margin-bottom:3px;}
            .sd-desc{color:#475569;font-size:10px;white-space:pre-wrap;word-break:break-word;
                margin-top:2px;}
            .sd-none{text-align:center;color:#94a3b8;font-size:11px;padding:10px 0;}
            mark{background:#fde68a;padding:0 1px;border-radius:2px;}

            #${CONFIG.topBarId}{position:fixed;top:12px;left:50%;transform:translateX(-50%);
                background:#0f172a;color:#fff;padding:8px 16px;border-radius:20px;font-size:13px;
                font-weight:600;display:none;align-items:center;gap:10px;
                box-shadow:0 4px 16px rgba(0,0,0,.3);z-index:18700;
                font-family:system-ui,Arial,sans-serif;white-space:nowrap;}
            #${CONFIG.topBarId} button{background:#16a34a;color:#fff;border:none;border-radius:50%;
                width:28px;height:28px;cursor:pointer;font-weight:bold;font-size:14px;}
            #${CONFIG.topBarId} .cbtn{background:#dc2626;}

            @media (max-width:600px){
                #${CONFIG.panelId}{width:calc(100vw - 20px);right:10px;top:10px;}
                #${CONFIG.buttonId}{bottom:20px;right:14px;}
            }
        `;
        document.head.appendChild(css);

        var btn = document.createElement("button");
        btn.id = CONFIG.buttonId; btn.type = "button"; btn.innerHTML = "➗";
        btn.title = "Multi-Polygon Division Tool";
        btn.onclick = toggleTool;
        document.body.appendChild(btn);

        var panel = document.createElement("div");
        panel.id = CONFIG.panelId; panel.className = "hide";
        document.body.appendChild(panel);

        var tb = document.createElement("div");
        tb.id = CONFIG.topBarId;
        document.body.appendChild(tb);
    }

    function showPanel(html) {
        var p = document.getElementById(CONFIG.panelId);
        p.innerHTML = html;
        p.classList.remove("hide");
        var bodyEl = p.querySelector(".mb");
        if (bodyEl && STATE.panelCollapsed) bodyEl.classList.add("collapsed");
        var mnBtn = p.querySelector(".mn");
        if (mnBtn) mnBtn.onclick = function (e) {
            e.preventDefault(); e.stopPropagation(); togglePanelBody();
        };
    }
    function togglePanelBody() {
        STATE.panelCollapsed = !STATE.panelCollapsed;
        var p = document.getElementById(CONFIG.panelId);
        var bodyEl = p.querySelector(".mb"), mnBtn = p.querySelector(".mn");
        if (!bodyEl) return;
        if (STATE.panelCollapsed) {
            bodyEl.classList.add("collapsed");
            if (mnBtn) { mnBtn.innerHTML = "▢"; mnBtn.title = "Show Panel"; }
        } else {
            bodyEl.classList.remove("collapsed");
            if (mnBtn) { mnBtn.innerHTML = "▽"; mnBtn.title = "Hide Panel"; }
        }
    }
    function hdr(title) {
        var icon = STATE.panelCollapsed ? "▢" : "▽";
        var t = STATE.panelCollapsed ? "Show Panel" : "Hide Panel";
        return '<div class="mh"><span>' + title + '</span><span class="mh-btns">' +
               '<button type="button" class="mn" title="' + t + '">' + icon + '</button>' +
               '<span class="x" id="mcl" title="Close Tool">&times;</span></span></div>';
    }
    function showTopBar(text, onDone, onCancel) {
        var tb = document.getElementById(CONFIG.topBarId);
        tb.innerHTML = "<span>" + text + "</span>";
        if (onDone) {
            var b = document.createElement("button");
            b.type = "button"; b.innerText = "✓"; b.onclick = onDone; tb.appendChild(b);
        }
        if (onCancel) {
            var c = document.createElement("button");
            c.type = "button"; c.innerText = "✕"; c.className = "cbtn";
            c.onclick = onCancel; tb.appendChild(c);
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
    // LIFECYCLE
    // ========================================================

    function toggleTool() { if (STATE.active) closePanel(); else openTool(); }

    async function openTool() {
        STATE.map = getMap();
        if (!STATE.map) { alert("OpenLayers map not found."); return; }
        detectProjection();
        try { await loadJSTS(); } catch (e) { alert("JSTS library could not be loaded."); return; }
        if (STATE.hasAppliedResult) { removeResultLayers(); STATE.hasAppliedResult = false; }

        STATE.active = true;
        STATE.panelCollapsed = false;
        document.getElementById(CONFIG.buttonId).classList.add("on");
        blockPopups();
        resetWorkingState();
        buildTempLayers();
        ensureResultLayers();
        ensureSavedLayers();
        attachAltWatcher();
        stageSelectPolygons();
    }

    function closePanel() {
        detachHandlers(); stopNodeEditing(); removeNodeLayer(); removeSnapLayer();
        detachAltWatcher(); hideTopBar();
        document.getElementById(CONFIG.panelId).classList.add("hide");
        STATE.active = false;
        removeTempLayers();
        unblockPopups();
        document.getElementById(CONFIG.buttonId).classList.remove("on");
    }

    function resetWorkingState() {
        STATE.stage = "idle";
        STATE.selectedFeatures = []; STATE.selectedEntries = []; STATE.polyRingsU = [];
        STATE.refAngleDeg = null; STATE.tempPointsU = [];
        STATE.solutions = []; STATE.activeSolIdx = 0;
        STATE.isReversed = false; STATE.selectedSide = null;
        STATE.wipeConfirmActive = false;
        STATE.nodeEditEnabled = false; STATE.nodeMode = null; STATE.ringData = null;
        STATE.nodeFailReason = "";
        STATE.currentSplit = null; STATE.snapIndex = null; STATE.lastSnap = null;
        STATE.partMeta = { 1: { name: "PART 1", desc: "" }, 2: { name: "PART 2", desc: "" } };
        STATE.splitTitle = ""; STATE.expandedSplitId = null;
    }

    function attachAltWatcher() {
        detachAltWatcher();
        STATE.keyDownFn = function (e) { if (e.key === "Alt") STATE.altDown = true; };
        STATE.keyUpFn = function (e) { if (e.key === "Alt") STATE.altDown = false; };
        window.addEventListener("keydown", STATE.keyDownFn);
        window.addEventListener("keyup", STATE.keyUpFn);
    }
    function detachAltWatcher() {
        if (STATE.keyDownFn) { window.removeEventListener("keydown", STATE.keyDownFn); STATE.keyDownFn = null; }
        if (STATE.keyUpFn) { window.removeEventListener("keyup", STATE.keyUpFn); STATE.keyUpFn = null; }
        STATE.altDown = false;
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
                stroke: new ol.style.Stroke({ color: CONFIG.refStroke, width: 4, lineDash: [8, 5] }),
                image: new ol.style.Circle({
                    radius: 5, fill: new ol.style.Fill({ color: CONFIG.refStroke }),
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

    function partStyle(feat, hl) {
        if (feat.get("msdCut")) {
            return new ol.style.Style({
                stroke: new ol.style.Stroke({
                    color: hl ? "#00ffff" : CONFIG.cutStroke, width: hl ? 5 : 3
                })
            });
        }
        var p = feat.get("msdPart");
        return new ol.style.Style({
            fill: new ol.style.Fill({
                color: hl ? "rgba(6,182,212,0.40)" : (p === 1 ? CONFIG.part1Fill : CONFIG.part2Fill)
            }),
            stroke: new ol.style.Stroke({
                color: hl ? "#00ffff" : (p === 1 ? CONFIG.part1Stroke : CONFIG.part2Stroke),
                width: hl ? 4 : 2
            })
        });
    }
    function labelStyleFn(feat) {
        if (feat.get("msdCentroid")) {
            var p = feat.get("msdPart");
            return new ol.style.Style({
                text: new ol.style.Text({
                    text: feat.get("msdText"), font: "bold 13px Arial, sans-serif",
                    fill: new ol.style.Fill({ color: p === 1 ? "#0d47a1" : "#bf360c" }),
                    stroke: new ol.style.Stroke({ color: "#fff", width: 5 }),
                    textAlign: "center", textBaseline: "middle", overflow: true
                })
            });
        }
        return new ol.style.Style({
            text: new ol.style.Text({
                text: feat.get("msdText"), font: "bold 11px Arial, sans-serif",
                fill: new ol.style.Fill({ color: "#111" }),
                stroke: new ol.style.Stroke({ color: "#fff", width: 4 }),
                rotation: feat.get("msdRot") || 0, textAlign: "center", overflow: true
            })
        });
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
            style: function (f) { return partStyle(f, false); }
        });
        STATE.labelLayer = new ol.layer.Vector({
            source: new ol.source.Vector(), zIndex: 21000,
            properties: { __msd: true, __msd_result: true },
            style: labelStyleFn
        });
        STATE.map.addLayer(STATE.resultLayer);
        STATE.map.addLayer(STATE.labelLayer);
    }

    function ensureSavedLayers() {
        var eRes = null, eLbl = null;
        STATE.map.getLayers().forEach(function (l) {
            if (l && l.get) {
                if (l.get("__msd_saved_res")) eRes = l;
                if (l.get("__msd_saved_lbl")) eLbl = l;
            }
        });
        if (eRes && eLbl) {
            STATE.savedResultLayer = eRes; STATE.savedLabelLayer = eLbl;
            loadSavedSplitsIntoLayers(); return;
        }
        STATE.savedResultLayer = new ol.layer.Vector({
            source: new ol.source.Vector(), zIndex: 18800,
            properties: { __msd: true, __msd_saved_res: true },
            style: function (f) { return partStyle(f, !!f.get("__is_highlighted")); }
        });
        STATE.savedLabelLayer = new ol.layer.Vector({
            source: new ol.source.Vector(), zIndex: 20800,
            properties: { __msd: true, __msd_saved_lbl: true },
            style: labelStyleFn
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
        removeNodeLayer(); removeSnapLayer();
    }

    function ensureNodeLayer() {
        if (STATE.nodeLayer) { STATE.nodeLayer.getSource().clear(); return; }
        STATE.nodeLayer = new ol.layer.Vector({
            source: new ol.source.Vector(), zIndex: 22000,
            properties: { __msd: true, __msd_result: true },
            style: function (feat) {
                var st = feat.get("__st");
                var r = (st === "hover" || st === "drag") ? CONFIG.nodeRadiusHover : CONFIG.nodeRadius;
                var c = st === "drag" ? CONFIG.nodeFillDrag
                      : st === "anchor" ? CONFIG.nodeFillAnchor
                      : st === "hover" ? CONFIG.nodeFillHover : CONFIG.nodeFill;
                return [
                    new ol.style.Style({
                        image: new ol.style.Circle({
                            radius: r + 3,
                            fill: new ol.style.Fill({ color: "rgba(255,255,255,0.92)" })
                        })
                    }),
                    new ol.style.Style({
                        image: new ol.style.Circle({
                            radius: r, fill: new ol.style.Fill({ color: c }),
                            stroke: new ol.style.Stroke({ color: "#fff", width: 2 })
                        }),
                        text: new ol.style.Text({
                            text: String(feat.get("__idx") + 1),
                            font: "bold 10px Arial",
                            fill: new ol.style.Fill({ color: "#fff" })
                        })
                    })
                ];
            }
        });
        STATE.map.addLayer(STATE.nodeLayer);
    }
    function removeNodeLayer() {
        if (STATE.nodeLayer && STATE.map) {
            try { STATE.map.removeLayer(STATE.nodeLayer); } catch (e) {}
        }
        STATE.nodeLayer = null;
    }

    function ensureSnapLayer() {
        if (STATE.snapLayer) return;
        STATE.snapLayer = new ol.layer.Vector({
            source: new ol.source.Vector(), zIndex: 22500,
            properties: { __msd: true, __msd_result: true },
            style: function (f) {
                var type = f.get("__snapType");
                var col = type === "vertex" ? CONFIG.snapColorVertex
                        : type === "midpoint" ? CONFIG.snapColorMid : CONFIG.snapColorEdge;
                var pts = type === "vertex" ? 4 : (type === "midpoint" ? 3 : 4);
                return new ol.style.Style({
                    image: new ol.style.RegularShape({
                        points: pts,
                        radius: type === "edge" ? 9 : 10,
                        radius2: type === "edge" ? 0 : undefined,
                        angle: type === "edge" ? Math.PI / 4 : 0,
                        fill: new ol.style.Fill({ color: "rgba(255,255,255,0.65)" }),
                        stroke: new ol.style.Stroke({ color: col, width: 2.5 })
                    }),
                    text: new ol.style.Text({
                        text: type.toUpperCase(), font: "bold 9px Arial",
                        offsetY: -18,
                        fill: new ol.style.Fill({ color: col }),
                        stroke: new ol.style.Stroke({ color: "#fff", width: 3 })
                    })
                });
            }
        });
        STATE.map.addLayer(STATE.snapLayer);
    }
    function removeSnapLayer() {
        if (STATE.snapLayer && STATE.map) {
            try { STATE.map.removeLayer(STATE.snapLayer); } catch (e) {}
        }
        STATE.snapLayer = null;
    }
    function showSnapIndicator(ptU, type) {
        if (!STATE.snapLayer) return;
        var src = STATE.snapLayer.getSource(); src.clear();
        var f = new ol.Feature(new ol.geom.Point(coordToMap(ptU)));
        f.set("__snapType", type);
        src.addFeature(f);
    }
    function clearSnapIndicator() {
        if (STATE.snapLayer) STATE.snapLayer.getSource().clear();
    }

    // ========================================================
    // SNAP ENGINE
    // ========================================================

    function pushRingToIndex(ring, idx) {
        var m = ring.length;
        for (var i = 0; i < m; i++) {
            var a = ring[i], b = ring[(i + 1) % m];
            idx.verts.push([a[0], a[1]]);
            idx.segs.push([a[0], a[1], b[0], b[1]]);
            idx.mids.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
        }
    }

    function buildSnapIndex() {
        var idx = { verts: [], segs: [], mids: [] };

        if (!STATE.polyRingsU.length) buildPolyRings();
        STATE.polyRingsU.forEach(function (pr) {
            pushRingToIndex(pr.outer, idx);
            pr.holes.forEach(function (h) { pushRingToIndex(h, idx); });
        });

        if (STATE.snap.includeSaved && STATE.savedResultLayer) {
            var selected = Object.create(null);
            STATE.selectedEntries.forEach(function (e) {
                if (e.parcelId) selected[e.parcelId] = true;
            });
            STATE.savedResultLayer.getSource().getFeatures().forEach(function (f) {
                if (!f.get("msdPart")) return;
                var pid = f.get("__parcel_id");
                if (pid && selected[pid]) return;
                var gU = geomToUTM(f.getGeometry());
                var polys = gU.getType() === "MultiPolygon" ? gU.getPolygons() : [gU];
                polys.forEach(function (p) {
                    p.getCoordinates().forEach(function (r) {
                        var c = r.slice();
                        if (c.length > 1) {
                            var a = c[0], z = c[c.length - 1];
                            if (Math.abs(a[0] - z[0]) < 1e-9 && Math.abs(a[1] - z[1]) < 1e-9) c.pop();
                        }
                        if (c.length >= 3) pushRingToIndex(c, idx);
                    });
                });
            });
        }
        STATE.snapIndex = idx;
        return idx;
    }

    /** Returns {pt:[x,y], type:'vertex'|'midpoint'|'edge'} or null. */
    function findSnap(cursorU) {
        if (!STATE.snap.enabled || STATE.altDown) return null;
        var idx = STATE.snapIndex || buildSnapIndex();
        var tol = STATE.snap.tolPx * metersPerPixelUTM();
        if (!(tol > 0)) return null;
        var tol2 = tol * tol;

        if (STATE.snap.vertices) {
            var bv = null, bd = tol2;
            for (var i = 0; i < idx.verts.length; i++) {
                var v = idx.verts[i];
                var dx = v[0] - cursorU[0], dy = v[1] - cursorU[1];
                var d2 = dx * dx + dy * dy;
                if (d2 < bd) { bd = d2; bv = v; }
            }
            if (bv) return { pt: [bv[0], bv[1]], type: "vertex" };
        }
        if (STATE.snap.midpoints) {
            var bm = null, bdm = tol2;
            for (var k = 0; k < idx.mids.length; k++) {
                var mp = idx.mids[k];
                var mx = mp[0] - cursorU[0], my = mp[1] - cursorU[1];
                var md2 = mx * mx + my * my;
                if (md2 < bdm) { bdm = md2; bm = mp; }
            }
            if (bm) return { pt: [bm[0], bm[1]], type: "midpoint" };
        }
        if (STATE.snap.edges) {
            var be = null, bde = tol2;
            for (var j = 0; j < idx.segs.length; j++) {
                var s = idx.segs[j];
                var ax = s[0], ay = s[1], bx = s[2], by = s[3];
                var ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey;
                if (l2 === 0) continue;
                var t = ((cursorU[0] - ax) * ex + (cursorU[1] - ay) * ey) / l2;
                t = t < 0 ? 0 : (t > 1 ? 1 : t);
                var px = ax + t * ex, py = ay + t * ey;
                var ddx = px - cursorU[0], ddy = py - cursorU[1];
                var dd2 = ddx * ddx + ddy * ddy;
                if (dd2 < bde) { bde = dd2; be = [px, py]; }
            }
            if (be) return { pt: be, type: "edge" };
        }
        return null;
    }

    function snapCursor(cursorU) {
        var s = findSnap(cursorU);
        STATE.lastSnap = s;
        if (s) { ensureSnapLayer(); showSnapIndicator(s.pt, s.type); return s.pt; }
        clearSnapIndicator();
        return cursorU;
    }

    function snapControlsHtml() {
        var s = STATE.snap;
        var mpp = metersPerPixelUTM();
        return '<div class="snapbox">' +
            '<div class="snaphead"><span>🧲 Snapping</span>' +
                '<label style="font-weight:600;font-size:10.5px;">' +
                '<input type="checkbox" id="snEn"' + (s.enabled ? " checked" : "") + '> Enabled</label>' +
            '</div>' +
            '<div class="snaprow">' +
                '<span style="font-size:11px;color:#475569;">Tol.</span>' +
                '<input type="range" id="snTol" min="2" max="50" step="1" value="' + s.tolPx + '">' +
                '<span class="snapval" id="snTolV">' + s.tolPx + ' px ≈ ' +
                    (s.tolPx * mpp).toFixed(2) + ' m</span>' +
            '</div>' +
            '<div class="snapgrid">' +
                '<label><input type="checkbox" id="snV"' + (s.vertices ? " checked" : "") + '> Vertices</label>' +
                '<label><input type="checkbox" id="snE"' + (s.edges ? " checked" : "") + '> Edges</label>' +
                '<label><input type="checkbox" id="snM"' + (s.midpoints ? " checked" : "") + '> Midpoints</label>' +
                '<label><input type="checkbox" id="snS"' + (s.includeSaved ? " checked" : "") + '> Saved parcels</label>' +
            '</div>' +
            '<div class="snapnote">Hold <b>ALT</b> while dragging to bypass snapping.</div>' +
        '</div>';
    }

    function wireSnapControls() {
        var en = document.getElementById("snEn");
        if (!en) return;
        var tol = document.getElementById("snTol");
        var tolV = document.getElementById("snTolV");

        function refreshVal() {
            tolV.textContent = STATE.snap.tolPx + " px ≈ " +
                (STATE.snap.tolPx * metersPerPixelUTM()).toFixed(2) + " m";
        }
        en.onchange = function () { STATE.snap.enabled = this.checked; saveSnapPrefs(); };
        tol.oninput = function () {
            STATE.snap.tolPx = parseInt(this.value, 10) || 1;
            refreshVal(); saveSnapPrefs();
        };
        document.getElementById("snV").onchange = function () { STATE.snap.vertices = this.checked; saveSnapPrefs(); };
        document.getElementById("snE").onchange = function () { STATE.snap.edges = this.checked; saveSnapPrefs(); };
        document.getElementById("snM").onchange = function () { STATE.snap.midpoints = this.checked; saveSnapPrefs(); };
        document.getElementById("snS").onchange = function () {
            STATE.snap.includeSaved = this.checked; STATE.snapIndex = null; saveSnapPrefs();
        };
        refreshVal();
    }

    // ========================================================
    // STAGE 1 — SELECT
    // ========================================================

    function stageSelectPolygons() {
        STATE.stage = "select";
        detachHandlers(); stopNodeEditing(); removeNodeLayer(); clearSnapIndicator();
        if (STATE.resultLayer) STATE.resultLayer.getSource().clear();
        if (STATE.labelLayer) STATE.labelLayer.getSource().clear();
        if (STATE.refLayer) STATE.refLayer.getSource().clear();
        STATE.isReversed = false;

        var n = STATE.selectedFeatures.length;
        var areaInfo = n ? '<br>Area: <b>' + fmtArea(sumSelectedArea(), STATE.chosenUnit) + '</b>' : '';
        var named = STATE.selectedEntries.filter(function (e) { return !!e.parcelId; });
        var lineage = named.length
            ? '<br><span style="color:#6d28d9;font-size:11px;">↳ ' + named.length +
              ' saved parcel(s): ' + named.map(function (e) { return esc(e.name || "parcel"); }).join(", ") +
              ' — replaced on save</span>' : "";

        var modeInfo = n === 1
            ? '<div class="ms ok">🔒 <b>Single polygon</b> — exact parallel cut; nodes slide along the boundary.</div>'
            : (n > 1
                ? '<div class="ms">🔗 <b>Multi-polygon</b> — one straight line crosses all; ' +
                  '<b>2 nodes</b> at the line ends after Apply.</div>' : '');

        var recursive = liveParcelCount() > 0
            ? '<div class="ms pur">♻️ Saved parcels are selectable — pick one to subdivide further.</div>' : '';

        showPanel(
            hdr('📐 Parcel Division Tool') +
            '<div class="mb">' +
                '<div class="ms">Click polygons to select them.<br>' +
                'Works on source parcels <b>and</b> previously saved parts.</div>' +
                '<div class="ms"><b>Polygons Selected: ' + n + '</b>' + areaInfo + lineage + '</div>' +
                modeInfo + recursive +
                '<div id="sd-wrap"></div>' +
                '<button class="bt bp" id="pb">Pick Polygons on Map</button>' +
                '<button class="bt bg" id="nx" ' + (n >= 1 ? '' : 'disabled') + '>Next: Set Direction →</button>' +
                '<button class="bt bs" id="cl">Clear Selection</button>' +
                '<button class="bt bd" id="cn">Close Tool</button>' +
            '</div>'
        );

        document.getElementById("mcl").onclick = closePanel;
        document.getElementById("cn").onclick = closePanel;
        document.getElementById("cl").onclick = function () {
            STATE.selectedFeatures = []; STATE.selectedEntries = []; STATE.snapIndex = null;
            if (STATE.selLayer) STATE.selLayer.getSource().clear();
            stageSelectPolygons();
        };
        document.getElementById("nx").onclick = function () {
            if (!STATE.selectedFeatures.length) { alert("Select at least 1 polygon."); return; }
            STATE.totalAreaM2 = sumSelectedArea();
            buildPolyRings(); STATE.snapIndex = null;
            seedDefaultNames();
            stageDirection();
        };
        document.getElementById("pb").onclick = startPicking;

        buildManagerShell();
    }

    function buildManagerShell() {
        var wrap = document.getElementById("sd-wrap");
        if (!wrap) return;
        var all = getSavedSplits();
        if (!all.length) { wrap.innerHTML = ""; return; }

        var wipeTxt = STATE.wipeConfirmActive ? "Click again to confirm WIPE ⚠️" : "Wipe All Splits";
        var wipeCls = STATE.wipeConfirmActive ? "bt bd" : "bt bs";

        wrap.innerHTML =
            '<div class="sd-box">' +
                '<div class="sd-header"><span>📁 Saved Splits (' + all.length +
                    ') · Live parcels: ' + liveParcelCount() + '</span></div>' +
                '<div class="sd-search">' +
                    '<span class="ic">🔍</span>' +
                    '<input type="text" id="sd-q" placeholder="Search ID, description, date..." ' +
                        'value="' + esc(STATE.searchQuery) + '">' +
                    '<button class="cx" id="sd-qx" title="Clear">✕</button>' +
                '</div>' +
                '<ul class="sd-list" id="sd-list"></ul>' +
                '<button class="' + wipeCls + '" id="wipe-local-btn" ' +
                    'style="padding:6px;font-size:11px;">' + wipeTxt + '</button>' +
            '</div>';

        var q = document.getElementById("sd-q");
        q.oninput = function () { STATE.searchQuery = this.value; renderSavedList(); };
        document.getElementById("sd-qx").onclick = function () {
            STATE.searchQuery = ""; q.value = ""; q.focus(); renderSavedList();
        };
        document.getElementById("wipe-local-btn").onclick = function () {
            if (!STATE.wipeConfirmActive) {
                STATE.wipeConfirmActive = true; buildManagerShell();
                setTimeout(function () {
                    if (STATE.wipeConfirmActive && STATE.stage === "select") {
                        STATE.wipeConfirmActive = false; buildManagerShell();
                    }
                }, 4000);
            } else {
                STATE.wipeConfirmActive = false; wipeSavedSplits();
                STATE.selectedFeatures = []; STATE.selectedEntries = [];
                if (STATE.selLayer) STATE.selLayer.getSource().clear();
                stageSelectPolygons();
            }
        };
        renderSavedList();
    }

    function hlMatch(text, q) {
        if (!q) return esc(text);
        var t = esc(text), lq = q.toLowerCase(), lt = t.toLowerCase();
        var i = lt.indexOf(lq);
        if (i < 0) return t;
        return t.slice(0, i) + "<mark>" + t.slice(i, i + q.length) + "</mark>" + t.slice(i + q.length);
    }

    function renderSavedList() {
        var ul = document.getElementById("sd-list");
        if (!ul) return;
        var q = STATE.searchQuery.trim().toLowerCase();
        var all = getSavedSplits();
        var list = q ? all.filter(function (r) { return splitSearchBlob(r).indexOf(q) >= 0; }) : all;
        list = list.slice().sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });

        if (!list.length) {
            ul.innerHTML = '<div class="sd-none">No splits match “' + esc(STATE.searchQuery) + '”</div>';
            return;
        }

        var html = "";
        list.forEach(function (rec) {
            var badge = (rec.sourceIds && rec.sourceIds.length)
                ? '<span class="sd-badge">sub-division</span>' : '';
            var pNames = (rec.parts || []).map(function (p) { return p.name; })
                            .filter(Boolean).join("  |  ");
            var titleTxt = rec.title && rec.title !== "Split" ? rec.title : (pNames || "Split");
            var open = STATE.expandedSplitId === rec.id;

            var det = "";
            if (open) {
                det = '<div class="sd-det">';
                if (rec.title) det += '<div style="font-size:10px;color:#475569;margin-bottom:4px;">' +
                                      '<b>Title:</b> ' + hlMatch(rec.title, q) + '</div>';
                (rec.parts || []).forEach(function (p) {
                    det += '<div class="sd-part"><b>' + hlMatch(p.name || "—", q) + '</b> ' +
                           '<span style="color:#64748b;">· ' +
                           fmtArea(p.areaM2 || 0, rec.unit || "sqm") + '</span>' +
                           (p.desc ? '<div class="sd-desc">' + hlMatch(p.desc, q) + '</div>' : '') +
                           '</div>';
                });
                if (!(rec.parts || []).length) {
                    det += '<div class="sd-desc">No parcel metadata (legacy record) — use ✏️ to add.</div>';
                }
                det += '</div>';
            }

            html +=
                '<li class="sd-item" data-id="' + rec.id + '">' +
                    '<div class="sd-row">' +
                        '<div class="sd-info">' +
                            '<span class="sd-title">' + hlMatch(titleTxt, q) + badge + '</span>' +
                            '<span class="sd-sub">' + esc(rec.targetText || "") + ' · ' +
                                hlMatch(rec.date || "", q) + '</span>' +
                        '</div>' +
                        '<div class="sd-actions">' +
                            '<button class="sd-action-btn info" title="Details">' + (open ? "▾" : "▸") + '</button>' +
                            '<button class="sd-action-btn edit" title="Edit IDs & description">✏️</button>' +
                            '<button class="sd-action-btn zoom" title="Zoom">🔍</button>' +
                            '<button class="sd-action-btn del" title="Delete">🗑️</button>' +
                        '</div>' +
                    '</div>' + det +
                '</li>';
        });
        ul.innerHTML = html;

        ul.querySelectorAll(".sd-item").forEach(function (item) {
            var id = item.getAttribute("data-id");
            item.onmouseenter = function () { highlightSavedSplitOnMap(id); };
            item.onmouseleave = function () { clearSavedSplitHighlight(); };
            item.querySelector(".sd-info").onclick = function () { zoomToSavedSplit(id); };
            item.querySelector(".zoom").onclick = function (e) { e.stopPropagation(); zoomToSavedSplit(id); };
            item.querySelector(".info").onclick = function (e) {
                e.stopPropagation();
                STATE.expandedSplitId = (STATE.expandedSplitId === id) ? null : id;
                renderSavedList();
            };
            item.querySelector(".edit").onclick = function (e) {
                e.stopPropagation(); clearSavedSplitHighlight(); stageEditSplit(id);
            };
            item.querySelector(".del").onclick = function (e) {
                e.stopPropagation(); clearSavedSplitHighlight(); deleteSplit(id);
                STATE.selectedFeatures = []; STATE.selectedEntries = [];
                if (STATE.selLayer) STATE.selLayer.getSource().clear();
                stageSelectPolygons();
            };
        });
    }

    // ========================================================
    // EDIT SAVED SPLIT
    // ========================================================

    function stageEditSplit(id) {
        var rec = getSplitById(id);
        if (!rec) { stageSelectPolygons(); return; }
        STATE.stage = "edit";
        zoomToSavedSplit(id);
        highlightSavedSplitOnMap(id);

        var dm = CONFIG.descMaxChars;
        var unit = rec.unit || "sqm";
        var cards = "";

        if (!(rec.parts || []).length) {
            cards = '<div class="ms warn">This legacy record has no per-parcel metadata, ' +
                    'so only the title can be edited.</div>';
        } else {
            rec.parts.forEach(function (p, i) {
                var cls = p.part === 1 ? "p1" : "p2";
                var col = p.part === 1 ? CONFIG.part1Stroke : CONFIG.part2Stroke;
                cards +=
                    '<div class="pcard ' + cls + '">' +
                        '<h4 style="color:' + col + '">' + (i + 1) + '. ' +
                            fmtArea(p.areaM2 || 0, unit) + '</h4>' +
                        '<label class="fl">Parcel ID / Number *</label>' +
                        '<input type="text" class="mi ed-id" data-pk="' + esc(p.pk) + '" ' +
                            'maxlength="' + CONFIG.idMaxChars + '" value="' + esc(p.name) + '">' +
                        '<label class="fl">Description</label>' +
                        '<textarea class="mi ed-ds" data-pk="' + esc(p.pk) + '" ' +
                            'maxlength="' + dm + '">' + esc(p.desc) + '</textarea>' +
                        '<div class="ctr" data-for="' + esc(p.pk) + '">0 / ' + dm + '</div>' +
                    '</div>';
            });
        }

        showPanel(
            hdr('✏️ Edit Saved Split') +
            '<div class="mb">' +
                '<div class="ms">Saved <b>' + esc(rec.date || "") + '</b><br>' +
                    'Target: <b>' + esc(rec.targetText || "—") + '</b>' +
                    (rec.angleDeg != null ? ' · Bearing <b>' + Number(rec.angleDeg).toFixed(3) + '°</b>' : '') +
                '</div>' +
                '<label class="fl">Split Title</label>' +
                '<input type="text" id="ed-title" class="mi" maxlength="80" value="' +
                    esc(rec.title || "") + '">' +
                '<div style="height:8px;"></div>' +
                cards +
                '<button class="bt bg" id="ed-save">💾 Save Changes</button>' +
                '<button class="bt bs" id="ed-back">← Back to List</button>' +
                '<button class="bt bd" id="ed-del">🗑️ Delete This Split</button>' +
            '</div>'
        );

        document.getElementById("mcl").onclick = closePanel;
        document.getElementById("ed-back").onclick = function () {
            clearSavedSplitHighlight(); stageSelectPolygons();
        };

        document.querySelectorAll(".ed-ds").forEach(function (ta) {
            var pk = ta.getAttribute("data-pk");
            var c = document.querySelector('.ctr[data-for="' + pk + '"]');
            var upd = function () {
                var n = ta.value.length;
                c.textContent = n + " / " + dm;
                c.className = "ctr" + (n >= dm ? " warn" : "");
            };
            ta.oninput = upd; upd();
        });

        document.getElementById("ed-save").onclick = function () {
            var title = document.getElementById("ed-title").value.trim();
            var edits = {}, ids = [], ok = true;
            document.querySelectorAll(".ed-id").forEach(function (inp) {
                var pk = inp.getAttribute("data-pk");
                var v = inp.value.trim();
                if (!v) ok = false;
                ids.push(v);
                edits[pk] = { name: v, desc: "" };
            });
            document.querySelectorAll(".ed-ds").forEach(function (ta) {
                var pk = ta.getAttribute("data-pk");
                if (edits[pk]) edits[pk].desc = ta.value.slice(0, dm);
            });
            if (!ok) { alert("Parcel IDs cannot be empty."); return; }
            var dup = ids.some(function (v, i) { return ids.indexOf(v) !== i; });
            if (dup) { alert("Parcel IDs within a split must be unique."); return; }

            applySplitEdits(id, title || (ids.join(" / ")), edits);
            clearSavedSplitHighlight();
            STATE.expandedSplitId = id;
            stageSelectPolygons();
        };

        document.getElementById("ed-del").onclick = function () {
            var b = this;
            if (b.dataset.armed === "1") {
                clearSavedSplitHighlight(); deleteSplit(id); stageSelectPolygons();
            } else {
                b.dataset.armed = "1";
                b.innerText = "⚠️ Click again to delete permanently";
                setTimeout(function () {
                    if (b && b.dataset) { b.dataset.armed = ""; b.innerText = "🗑️ Delete This Split"; }
                }, 4000);
            }
        };
    }

    // ========================================================
    // SELECTION HELPERS
    // ========================================================

    function sumSelectedArea() {
        var t = 0;
        STATE.selectedEntries.forEach(function (e) { t += utmArea(e.geomU); });
        return t;
    }
    function seedDefaultNames() {
        var named = STATE.selectedEntries.filter(function (e) { return e.name; });
        if (STATE.selectedEntries.length === 1 && named.length === 1) {
            var base = named[0].name;
            STATE.partMeta = { 1: { name: base + "-A", desc: "" }, 2: { name: base + "-B", desc: "" } };
        } else {
            STATE.partMeta = { 1: { name: "PART 1", desc: "" }, 2: { name: "PART 2", desc: "" } };
        }
        STATE.splitTitle = "";
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
                if (l === STATE.savedResultLayer) { if (!f.get("msdPart")) return; }
                else if (l && l.get && l.get("__msd")) return;
                hit = { feature: f, layer: l };
            }, { hitTolerance: 6 });
            if (!hit) return;

            var idx = STATE.selectedFeatures.indexOf(hit.feature);
            if (idx >= 0) {
                STATE.selectedFeatures.splice(idx, 1);
                STATE.selectedEntries.splice(idx, 1);
            } else {
                var gMap = hit.feature.getGeometry().clone();
                STATE.selectedFeatures.push(hit.feature);
                STATE.selectedEntries.push({
                    feature: hit.feature, layer: hit.layer,
                    geometry: gMap, geomU: geomToUTM(gMap),
                    parcelId: (hit.layer === STATE.savedResultLayer)
                        ? (hit.feature.get("__parcel_id") || null) : null,
                    name: hit.feature.get("msdName") || null
                });
            }
            STATE.polyRingsU = []; STATE.snapIndex = null;
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
    // FAST ANALYTIC HALF-PLANE AREA
    // ========================================================

    function buildPolyRings() {
        STATE.polyRingsU = [];
        STATE.selectedEntries.forEach(function (e) {
            var polys = e.geomU.getType() === "MultiPolygon" ? e.geomU.getPolygons() : [e.geomU];
            polys.forEach(function (p) {
                var rings = p.getCoordinates();
                if (!rings || !rings.length) return;
                var out = [];
                rings.forEach(function (r) {
                    var c = r.slice();
                    if (c.length > 1) {
                        var f = c[0], l = c[c.length - 1];
                        if (Math.abs(f[0] - l[0]) < 1e-9 && Math.abs(f[1] - l[1]) < 1e-9) c.pop();
                    }
                    if (c.length >= 3) out.push(c);
                });
                if (out.length) STATE.polyRingsU.push({ outer: out[0], holes: out.slice(1) });
            });
        });
    }

    var _cbx = new Float64Array(4096);
    var _cby = new Float64Array(4096);

    function clipRingArea(ring, px, py, nx, ny) {
        var m = ring.length, cnt = 0;
        if (m * 2 + 8 > _cbx.length) {
            _cbx = new Float64Array(m * 2 + 64);
            _cby = new Float64Array(m * 2 + 64);
        }
        for (var i = 0; i < m; i++) {
            var a = ring[i], b = ring[(i + 1) % m];
            var sa = (a[0] - px) * nx + (a[1] - py) * ny;
            var sb = (b[0] - px) * nx + (b[1] - py) * ny;
            var ain = sa <= 0, bin = sb <= 0;
            if (ain) { _cbx[cnt] = a[0]; _cby[cnt] = a[1]; cnt++; }
            if (ain !== bin) {
                var t = sa / (sa - sb);
                _cbx[cnt] = a[0] + (b[0] - a[0]) * t;
                _cby[cnt] = a[1] + (b[1] - a[1]) * t;
                cnt++;
            }
        }
        if (cnt < 3) return 0;
        var s = 0;
        for (var k = 0; k < cnt; k++) {
            var j = (k + 1) % cnt;
            s += _cbx[k] * _cby[j] - _cbx[j] * _cby[k];
        }
        return Math.abs(s * 0.5);
    }

    function fastPart1Area(pivot, angleDeg) {
        var th = deg2rad(angleDeg);
        var nx = -Math.sin(th), ny = Math.cos(th);
        var px = pivot[0], py = pivot[1], total = 0;
        for (var i = 0; i < STATE.polyRingsU.length; i++) {
            var pr = STATE.polyRingsU[i];
            total += clipRingArea(pr.outer, px, py, nx, ny);
            for (var h = 0; h < pr.holes.length; h++) {
                total -= clipRingArea(pr.holes[h], px, py, nx, ny);
            }
        }
        return total > 0 ? total : 0;
    }

    function combinedExtentU() {
        var ext = ol.extent.createEmpty();
        STATE.selectedEntries.forEach(function (e) { ol.extent.extend(ext, e.geomU.getExtent()); });
        return ext;
    }
    function selectionRadius() {
        var ext = combinedExtentU();
        return Math.hypot(ext[2] - ext[0], ext[3] - ext[1]) * 5 + 1000;
    }
    function halfPlanePolyU(pivot, angleDeg, R) {
        var th = deg2rad(angleDeg);
        var dx = Math.cos(th), dy = Math.sin(th);
        var nx = -dy, ny = dx;
        var a1 = [pivot[0] + dx * R, pivot[1] + dy * R];
        var a2 = [pivot[0] - dx * R, pivot[1] - dy * R];
        var a3 = [a2[0] - nx * R, a2[1] - ny * R];
        var a4 = [a1[0] - nx * R, a1[1] - ny * R];
        return new ol.geom.Polygon([[a1, a2, a3, a4, a1.slice()]]);
    }

    function evalSplitPivotU(pivot, angleDeg) {
        var halfJ = toJ(halfPlanePolyU(pivot, angleDeg, selectionRadius()));
        var p1area = 0, crossCount = 0, p1geoms = [], p2geoms = [], cuts = [];
        STATE.selectedEntries.forEach(function (entry) {
            var jg = toJ(entry.geomU);
            if (!jg.isValid()) jg = jg.buffer(0);
            try {
                var i1 = jg.intersection(halfJ);
                var i2 = jg.difference(halfJ);
                var g1 = null, g2 = null, av1 = 0, av2 = 0;
                if (!i1.isEmpty()) { g1 = toOl(i1); av1 = utmArea(g1); }
                if (!i2.isEmpty()) { g2 = toOl(i2); av2 = utmArea(g2); }
                if (g1 && av1 > CONFIG.minPartAreaM2) { p1area += av1; p1geoms.push({ g: g1, a: av1 }); }
                if (g2 && av2 > CONFIG.minPartAreaM2) { p2geoms.push({ g: g2, a: av2 }); }
                if (av1 > CONFIG.minPartAreaM2 && av2 > CONFIG.minPartAreaM2) crossCount++;
                if (!i1.isEmpty() && !i2.isEmpty()) {
                    try {
                        var ci = i1.getBoundary().intersection(i2.getBoundary());
                        if (!ci.isEmpty()) cuts.push(toOl(ci));
                    } catch (e2) {}
                }
            } catch (e) {}
        });
        return { p1area: p1area, crossCount: crossCount,
                 p1geoms: p1geoms, p2geoms: p2geoms, cuts: cuts };
    }

    /** Extreme crossings of the infinite line with every ring. */
    function clipLineEnds(pivot, angleDeg) {
        var th = deg2rad(angleDeg);
        var dx = Math.cos(th), dy = Math.sin(th);
        var tmin = Infinity, tmax = -Infinity, eps = 1e-9;
        function consider(p) {
            var t = (p[0] - pivot[0]) * dx + (p[1] - pivot[1]) * dy;
            if (t < tmin) tmin = t;
            if (t > tmax) tmax = t;
        }
        for (var i = 0; i < STATE.polyRingsU.length; i++) {
            var pr = STATE.polyRingsU[i];
            var rings = [pr.outer].concat(pr.holes);
            for (var r = 0; r < rings.length; r++) {
                var ring = rings[r], m = ring.length;
                for (var k = 0; k < m; k++) {
                    var a = ring[k], b = ring[(k + 1) % m];
                    var sa = dx * (a[1] - pivot[1]) - dy * (a[0] - pivot[0]);
                    var sb = dx * (b[1] - pivot[1]) - dy * (b[0] - pivot[0]);
                    if (Math.abs(sa) < eps) { consider(a); continue; }
                    if ((sa < 0) !== (sb < 0)) {
                        var u = sa / (sa - sb);
                        consider([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
                    }
                }
            }
        }
        if (!isFinite(tmin) || !isFinite(tmax) || (tmax - tmin) < 0.2) return null;
        return {
            ends: [
                [pivot[0] + dx * tmin, pivot[1] + dy * tmin],
                [pivot[0] + dx * tmax, pivot[1] + dy * tmax]
            ],
            tmin: tmin, tmax: tmax, dir: [dx, dy]
        };
    }

    /** Rotate about pivot; find bearing nearest thUser giving area == target. */
    function solveLineAngle(pivot, thUser, target) {
        var N = CONFIG.lineScanSamples;
        var start = thUser - 180, span = 360;
        var f = function (t) { return fastPart1Area(pivot, t) - target; };
        var prevT = null, prevV = null, brackets = [];
        for (var i = 0; i <= N; i++) {
            var t = start + (i / N) * span;
            var v = f(t);
            if (prevV !== null && ((prevV < 0 && v >= 0) || (prevV > 0 && v <= 0))) {
                brackets.push([prevT, t, prevV]);
            }
            prevT = t; prevV = v;
        }
        if (!brackets.length) return null;
        var chosen = brackets[0], bd = Infinity;
        brackets.forEach(function (br) {
            var mid = (br[0] + br[1]) / 2;
            var d = Math.abs(((mid - thUser + 540) % 360) - 180);
            if (d < bd) { bd = d; chosen = br; }
        });
        var lo = chosen[0], hi = chosen[1], flo = chosen[2];
        for (var k = 0; k < CONFIG.lineBisectIters; k++) {
            var mid2 = (lo + hi) / 2, fm = f(mid2);
            if (Math.abs(fm) < CONFIG.areaToleranceM2) { lo = hi = mid2; break; }
            if ((flo < 0 && fm < 0) || (flo > 0 && fm > 0)) { lo = mid2; flo = fm; }
            else hi = mid2;
        }
        return norm360((lo + hi) / 2);
    }

    // ========================================================
    // STAGE 2 — DIRECTION
    // ========================================================

    function stageDirection() {
        STATE.stage = "direction";
        detachHandlers(); stopNodeEditing(); removeNodeLayer();
        STATE.refAngleDeg = null; STATE.tempPointsU = []; STATE.selectedSide = null;
        if (STATE.refLayer) STATE.refLayer.getSource().clear();

        var isSingle = STATE.selectedFeatures.length === 1;
        var lockBlock = isSingle
            ? '<div class="ms ok">🔒 <b>Parallel lock: ON (forced)</b></div>'
            : '<fieldset class="mf"><legend>Parallel Lock</legend>' +
              '<label><input type="checkbox" id="lp"' + (STATE.lockParallel ? " checked" : "") +
              '> <b>Force exact parallel</b> (0.00° deviation)</label>' +
              '<div class="hint">You can fine-tune manually with nodes after Apply.</div></fieldset>';

        showPanel(
            hdr('Set Division Direction') +
            '<div class="mb">' +
                '<div class="ms">Polygons: <b>' + STATE.selectedFeatures.length + '</b><br>' +
                'Total: <b>' + fmtArea(STATE.totalAreaM2, STATE.chosenUnit) + '</b></div>' +
                '<fieldset class="mf"><legend>Direction Method</legend>' +
                    '<label><input type="radio" name="dm" value="side"' +
                        (STATE.directionMode === "side" ? " checked" : "") + '> Based on Side</label>' +
                    '<label><input type="radio" name="dm" value="line"' +
                        (STATE.directionMode === "line" ? " checked" : "") + '> Draw Line</label>' +
                    '<label><input type="radio" name="dm" value="point"' +
                        (STATE.directionMode === "point" ? " checked" : "") + '> From Point</label>' +
                    '<div class="hint" id="dh">' + dirHint() + '</div>' +
                '</fieldset>' + lockBlock +
                '<button class="bt bp" id="cd">Capture Direction on Map</button>' +
                '<button class="bt bs" id="bk2">← Back to Selection</button>' +
                '<button class="bt bd" id="cn2">Close Tool</button>' +
            '</div>'
        );

        document.getElementById("mcl").onclick = closePanel;
        document.getElementById("cn2").onclick = closePanel;
        document.getElementById("bk2").onclick = stageSelectPolygons;
        var lp = document.getElementById("lp");
        if (lp) lp.onchange = function () { STATE.lockParallel = this.checked; };
        document.querySelectorAll('input[name="dm"]').forEach(function (r) {
            r.onchange = function (e) {
                STATE.directionMode = e.target.value;
                STATE.refAngleDeg = null; STATE.tempPointsU = [];
                if (STATE.refLayer) STATE.refLayer.getSource().clear();
                document.getElementById("dh").innerText = dirHint();
            };
        });
        document.getElementById("cd").onclick = captureDirection;
    }

    function dirHint() {
        if (STATE.directionMode === "side") return "Click a boundary side — cut will be parallel to it.";
        if (STATE.directionMode === "line") return "Click 2 points on the map.";
        return "Click a pivot point, then a direction point.";
    }

    function captureDirection() {
        document.getElementById(CONFIG.panelId).classList.add("hide");
        if (STATE.refLayer) STATE.refLayer.getSource().clear();
        STATE.tempPointsU = []; STATE.refAngleDeg = null; STATE.selectedSide = null;

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
                var ns = findNearestSegmentU(coordToUTM(evt.coordinate));
                if (ns) drawRefLineU(ns.p1, ns.p2);
            };
            STATE.map.on("pointermove", STATE.pointerHandler);
            STATE.clickHandler = function (evt) {
                var ns = findNearestSegmentU(coordToUTM(evt.coordinate));
                if (!ns) return;
                STATE.selectedSide = ns;
                STATE.refAngleDeg = normDeg(rad2deg(
                    Math.atan2(ns.p2[1] - ns.p1[1], ns.p2[0] - ns.p1[0])));
                drawRefLineU(ns.p1, ns.p2);
                setTopText("Side bearing: " + STATE.refAngleDeg.toFixed(4) + "° — press ✓");
            };
            STATE.map.on("click", STATE.clickHandler);

        } else if (STATE.directionMode === "line") {
            showTopBar("Click Point 1", confirmNext, cancelBack);
            STATE.clickHandler = function (evt) {
                var u = coordToUTM(evt.coordinate);
                STATE.tempPointsU.push(u);
                if (STATE.tempPointsU.length === 1) { drawRefPointU(u); setTopText("Click Point 2"); }
                else if (STATE.tempPointsU.length === 2) {
                    var a = STATE.tempPointsU[0], b = STATE.tempPointsU[1];
                    STATE.refAngleDeg = normDeg(rad2deg(Math.atan2(b[1] - a[1], b[0] - a[0])));
                    drawRefLineU(a, b);
                    setTopText("Line: " + STATE.refAngleDeg.toFixed(4) + "° — press ✓");
                } else {
                    STATE.tempPointsU = [u]; STATE.refAngleDeg = null;
                    drawRefPointU(u); setTopText("Click Point 2");
                }
            };
            STATE.map.on("click", STATE.clickHandler);

        } else {
            showTopBar("Click Pivot Point", confirmNext, cancelBack);
            STATE.clickHandler = function (evt) {
                var u = coordToUTM(evt.coordinate);
                STATE.tempPointsU.push(u);
                if (STATE.tempPointsU.length === 1) { drawRefPointU(u); setTopText("Click direction point"); }
                else if (STATE.tempPointsU.length === 2) {
                    var a = STATE.tempPointsU[0], b = STATE.tempPointsU[1];
                    STATE.refAngleDeg = normDeg(rad2deg(Math.atan2(b[1] - a[1], b[0] - a[0])));
                    drawRefLineU(a, b);
                    setTopText("Dir: " + STATE.refAngleDeg.toFixed(4) + "° — press ✓");
                } else {
                    STATE.tempPointsU = [u]; STATE.refAngleDeg = null;
                    drawRefPointU(u); setTopText("Click direction point");
                }
            };
            STATE.map.on("click", STATE.clickHandler);
        }
    }

    function drawRefLineU(u1, u2) {
        if (!STATE.refLayer) return;
        var src = STATE.refLayer.getSource(); src.clear();
        src.addFeature(new ol.Feature(new ol.geom.LineString([coordToMap(u1), coordToMap(u2)])));
    }
    function drawRefPointU(u) {
        if (!STATE.refLayer) return;
        var src = STATE.refLayer.getSource(); src.clear();
        src.addFeature(new ol.Feature(new ol.geom.Point(coordToMap(u))));
    }

    // ========================================================
    // STAGE 3 — AREA
    // ========================================================

    function stageAreaInput() {
        STATE.stage = "area"; detachHandlers(); STATE.isReversed = false;
        stopNodeEditing(); removeNodeLayer();

        showPanel(
            hdr('Enter Part 1 Area') +
            '<div class="mb">' +
                '<div class="ms">Direction (UTM bearing): <b>' + STATE.refAngleDeg.toFixed(4) + '°</b><br>' +
                'Total: <b>' + fmtArea(STATE.totalAreaM2, STATE.chosenUnit) + '</b></div>' +
                '<label class="fl">Part 1 Area</label>' +
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
        showPanel(hdr('Calculating...') +
            '<div class="mb" style="text-align:center;padding:30px;">' +
            '<div style="color:#334155;">Solving in EPSG:32643...</div></div>');
        document.getElementById("mcl").onclick = closePanel;
        await waitFrame();
        performSearch(false);
    }

    function performSearch(reversed) {
        STATE.isReversed = reversed;
        STATE.solveTargetM2 = reversed ? (STATE.totalAreaM2 - STATE.targetPart1M2) : STATE.targetPart1M2;
        if (!STATE.polyRingsU.length) buildPolyRings();
        STATE.solutions = findSolutions(STATE.refAngleDeg, STATE.solveTargetM2);

        if (!STATE.solutions.length) {
            var isSingle = STATE.selectedEntries.length === 1;
            var unlock = (!isSingle && STATE.lockParallel)
                ? '<button class="bt bw" id="ulk">Unlock Parallel & Retry</button>' : '';
            showPanel(hdr('No Solution Found') +
                '<div class="mb"><div class="ms warn">No straight line at this bearing produced ' +
                'the requested area.</div>' + unlock +
                '<button class="bt bp" id="rt">Try Different Area</button>' +
                '<button class="bt bs" id="bkr">← Back to Direction</button>' +
                '<button class="bt bd" id="cnx">Close</button></div>');
            document.getElementById("mcl").onclick = closePanel;
            document.getElementById("cnx").onclick = closePanel;
            document.getElementById("rt").onclick = stageAreaInput;
            document.getElementById("bkr").onclick = stageDirection;
            var u = document.getElementById("ulk");
            if (u) u.onclick = function () { STATE.lockParallel = false; performSearch(STATE.isReversed); };
            return;
        }
        stageSolutions();
    }

    // ========================================================
    // SOLVER
    // ========================================================

    function findSolutions(baseAngle, targetM2) {
        var isSingle = (STATE.selectedEntries.length === 1);
        var forceParallel = isSingle || STATE.lockParallel;
        var offsets = forceParallel ? [0]
            : [0, 0.05, -0.05, 0.1, -0.1, 0.25, -0.25, 0.5, -0.5,
               1, -1, 2, -2, 5, -5, 10, -10, 20, -20, 30, -30, 45, -45, 60, -60, 90];

        var results = [], total = STATE.selectedEntries.length;
        for (var i = 0; i < offsets.length; i++) {
            var angle = normDeg(baseAngle + offsets[i]);
            var r = solveAngle(angle, targetM2);
            if (r && r.ok) {
                results.push({
                    angleDeg: angle, deltaDeg: Math.abs(offsets[i]),
                    pivot: r.pivot, split: r.split,
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
        var ext = combinedExtentU();
        var center = [(ext[0] + ext[2]) / 2, (ext[1] + ext[3]) / 2];
        var R = Math.hypot(ext[2] - ext[0], ext[3] - ext[1]) * 2 + 100;
        var th = deg2rad(angleDeg);
        var nx = -Math.sin(th), ny = Math.cos(th);
        var lo = -R, hi = R, best = 0;
        for (var i = 0; i < CONFIG.bisectionIterations; i++) {
            var mid = (lo + hi) / 2;
            var pv = [center[0] + nx * mid, center[1] + ny * mid];
            var a = fastPart1Area(pv, angleDeg);
            if (a < targetM2) lo = mid; else hi = mid;
            best = mid;
            if (Math.abs(a - targetM2) < CONFIG.areaToleranceM2) break;
        }
        var pivot = [center[0] + nx * best, center[1] + ny * best];
        var split = evalSplitPivotU(pivot, angleDeg);
        return {
            ok: !!(split && split.p1geoms.length && split.p2geoms.length),
            pivot: pivot, split: split,
            crossCount: split ? split.crossCount : 0
        };
    }

    // ========================================================
    // STAGE 4 — SOLUTIONS
    // ========================================================

    function stageSolutions() {
        STATE.stage = "solutions"; STATE.activeSolIdx = 0;
        detachHandlers(); stopNodeEditing(); removeNodeLayer();

        var target = STATE.targetPart1M2, remain = STATE.totalAreaM2 - STATE.targetPart1M2;
        var forced = STATE.selectedEntries.length === 1 || STATE.lockParallel;

        var listHtml = '';
        STATE.solutions.forEach(function (s, i) {
            var dt = s.deltaDeg === 0 ? "Exactly parallel" : "±" + s.deltaDeg.toFixed(2) + "°";
            listHtml += '<li class="sc' + (i === 0 ? ' act' : '') + '" data-i="' + i + '">' +
                '<b>#' + (i + 1) + ': ' + s.angleDeg.toFixed(4) + '°</b> (' + dt + ')<br>' +
                '<span style="font-size:11px;color:#64748b;">' +
                (s.crossAll ? "✓ crosses all" : "partial") +
                ' · err ' + s.errorM2.toFixed(3) + ' m²</span></li>';
        });

        showPanel(
            hdr('Division Solutions') +
            '<div class="mb">' +
                '<div class="ms">Reference: <b>' + STATE.refAngleDeg.toFixed(4) + '°</b>' +
                    (STATE.isReversed ? ' <span style="color:#ea580c">(Reversed)</span>' : '') + '<br>' +
                    'Part 1: <b>' + fmtArea(target, STATE.chosenUnit) + '</b><br>' +
                    'Part 2: <b>' + fmtArea(remain, STATE.chosenUnit) + '</b></div>' +
                (forced ? '<div class="ms ok">🔒 Parallel lock active — 0.00° deviation.</div>' : '') +
                '<fieldset class="mf"><legend>Select a Solution</legend>' +
                    '<ul class="sl">' + listHtml + '</ul></fieldset>' +
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
                renderSplitGeoms(STATE.solutions[idx].split, false);
            };
        });
        renderSplitGeoms(STATE.solutions[0].split, false);
    }

    // ========================================================
    // CHORD ENGINE
    // ========================================================

    function crossUV(p, q) { return p[0] * q[1] - q[0] * p[1]; }

    function buildRingData(geomU) {
        var poly = null;
        if (geomU.getType() === "Polygon") poly = geomU;
        else if (geomU.getType() === "MultiPolygon") {
            var ps = geomU.getPolygons();
            if (ps.length !== 1) return null;
            poly = ps[0];
        } else return null;

        var rings = poly.getCoordinates();
        if (!rings || !rings.length) return null;
        var outer = rings[0].slice();
        if (outer.length > 1) {
            var f = outer[0], l = outer[outer.length - 1];
            if (Math.abs(f[0] - l[0]) < 1e-9 && Math.abs(f[1] - l[1]) < 1e-9) outer.pop();
        }
        if (outer.length < 3) return null;

        var m = outer.length, C = new Array(m), PS = new Array(m + 1);
        PS[0] = 0;
        for (var k = 0; k < m; k++) {
            C[k] = crossUV(outer[k], outer[(k + 1) % m]);
            PS[k + 1] = PS[k] + C[k];
        }
        var holes = [];
        for (var h = 1; h < rings.length; h++) {
            holes.push({ coords: rings[h], area: utmRingArea(rings[h]), rep: rings[h][0] });
        }
        return { ring: outer, m: m, C: C, PS: PS, holes: holes, totalArea: utmPolygonArea(poly) };
    }

    function sumC(rd, lo, hi) {
        if (hi <= lo) return 0;
        var m = rd.m, PS = rd.PS, shift = Math.floor(lo / m) * m;
        var a = lo - shift, b = hi - shift;
        if (b <= m) return PS[b] - PS[a];
        return (PS[m] - PS[a]) + (PS[b - m] - PS[0]);
    }
    function interpU(rd, pos) {
        var m = rd.m, base = Math.floor(pos), t = pos - base;
        var i = ((base % m) + m) % m;
        var a = rd.ring[i], b = rd.ring[(i + 1) % m];
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    function locateOnRing(rd, ptU) {
        var bestPos = 0, minD = Infinity, m = rd.m;
        for (var i = 0; i < m; i++) {
            var a = rd.ring[i], b = rd.ring[(i + 1) % m];
            var dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
            var t = (l2 === 0) ? 0 : ((ptU[0] - a[0]) * dx + (ptU[1] - a[1]) * dy) / l2;
            t = Math.max(0, Math.min(1, t));
            var d = Math.hypot(ptU[0] - (a[0] + t * dx), ptU[1] - (a[1] + t * dy));
            if (d < minD) { minD = d; bestPos = i + t; }
        }
        if (bestPos >= m) bestPos = m - 1e-9;
        if (bestPos < 0) bestPos = 0;
        return bestPos;
    }
    function arcExteriorArea(rd, posA, posB) {
        var m = rd.m, end = posB;
        if (end <= posA + 1e-12) end += m;
        var A = interpU(rd, posA), B = interpU(rd, posB);
        var lo = Math.floor(posA) + 1, hi = Math.ceil(end - 1e-12) - 1, s;
        if (lo <= hi) {
            s = crossUV(A, rd.ring[lo % m]) + sumC(rd, lo, hi) +
                crossUV(rd.ring[hi % m], B) + crossUV(B, A);
        } else s = crossUV(A, B) + crossUV(B, A);
        return Math.abs(s) / 2;
    }
    function arcPointsU(rd, posA, posB) {
        var m = rd.m, pts = [interpU(rd, posA)], end = posB;
        if (end <= posA + 1e-12) end += m;
        var k = Math.floor(posA) + 1, guard = 0;
        while (k < end - 1e-12 && guard++ < m + 3) { pts.push(rd.ring[k % m].slice()); k++; }
        pts.push(interpU(rd, posB));
        return pts;
    }
    function pointInRing(pt, ring) {
        var inside = false, n = ring.length;
        for (var i = 0, j = n - 1; i < n; j = i++) {
            var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
            if (((yi > pt[1]) !== (yj > pt[1])) &&
                (pt[0] < (xj - xi) * (pt[1] - yi) / ((yj - yi) || 1e-20) + xi)) inside = !inside;
        }
        return inside;
    }
    function chordPart1Area(rd, posA, posB) {
        var a = arcExteriorArea(rd, posA, posB);
        if (rd.holes.length) {
            var r1 = arcPointsU(rd, posA, posB); r1.push(r1[0].slice());
            rd.holes.forEach(function (h) { if (pointInRing(h.rep, r1)) a -= h.area; });
        }
        return Math.max(0, a);
    }
    function buildChordSplit(rd, posA, posB) {
        var r1 = arcPointsU(rd, posA, posB); r1.push(r1[0].slice());
        var r2 = arcPointsU(rd, posB, posA); r2.push(r2[0].slice());
        if (r1.length < 4 || r2.length < 4) return null;
        var h1 = [], h2 = [];
        rd.holes.forEach(function (h) {
            if (pointInRing(h.rep, r1)) h1.push(h.coords); else h2.push(h.coords);
        });
        var g1, g2;
        try { g1 = new ol.geom.Polygon([r1].concat(h1)); } catch (e) { return null; }
        try { g2 = new ol.geom.Polygon([r2].concat(h2)); } catch (e) { return null; }
        var a1 = utmPolygonArea(g1), a2 = utmPolygonArea(g2);
        if (a1 < CONFIG.minPartAreaM2 || a2 < CONFIG.minPartAreaM2) return null;
        return {
            p1area: a1, p1geoms: [{ g: g1, a: a1 }], p2geoms: [{ g: g2, a: a2 }],
            cuts: [new ol.geom.LineString([interpU(rd, posA), interpU(rd, posB)])], crossCount: 1
        };
    }
    function solveChordPartner(rd, fixedPos, fixedIsStart, target) {
        var m = rd.m, N = Math.min(2200, Math.max(CONFIG.chordScanSamples, m * 8));
        var f = function (p) {
            return (fixedIsStart ? chordPart1Area(rd, fixedPos, p)
                                 : chordPart1Area(rd, p, fixedPos)) - target;
        };
        var bestP = null, bestErr = Infinity, prevP = null, prevV = null, brackets = [];
        for (var i = 0; i <= N; i++) {
            var p = (i / N) * m; if (p >= m) p = m - 1e-7;
            var v = f(p), e = Math.abs(v);
            if (e < bestErr) { bestErr = e; bestP = p; }
            if (prevV !== null && ((prevV < 0 && v >= 0) || (prevV > 0 && v <= 0))) {
                brackets.push([prevP, p, prevV]);
            }
            prevP = p; prevV = v;
        }
        if (brackets.length) {
            var chosen = brackets[0], bd = Infinity;
            brackets.forEach(function (br) {
                var d = Math.abs((br[0] + br[1]) / 2 - bestP);
                if (d < bd) { bd = d; chosen = br; }
            });
            var lo = chosen[0], hi = chosen[1], flo = chosen[2];
            for (var k = 0; k < CONFIG.chordBisectIters; k++) {
                var mid = (lo + hi) / 2, fm = f(mid);
                if (Math.abs(fm) < CONFIG.areaToleranceM2) { lo = hi = mid; break; }
                if ((flo < 0 && fm < 0) || (flo > 0 && fm > 0)) { lo = mid; flo = fm; }
                else hi = mid;
            }
            bestP = (lo + hi) / 2;
        }
        if (bestP === null) return null;
        if (bestP >= m) bestP = m - 1e-7;
        if (bestP < 0) bestP = 0;
        return bestP;
    }
    function chordIsInside(rd, posA, posB) {
        try {
            var jp = toJ(STATE.selectedEntries[0].geomU);
            if (!jp.isValid()) jp = jp.buffer(0);
            return jp.covers(toJ(new ol.geom.LineString([interpU(rd, posA), interpU(rd, posB)])));
        } catch (e) { return true; }
    }

    // ========================================================
    // STAGE 5 — APPLY
    // ========================================================

    function applyFinalSplit() {
        var sol = STATE.solutions[STATE.activeSolIdx];
        STATE.stage = "applied";
        STATE.appliedAngleDeg = sol.angleDeg;
        if (STATE.selLayer) STATE.selLayer.getSource().clear();
        if (STATE.refLayer) STATE.refLayer.getSource().clear();

        if (!STATE.polyRingsU.length) buildPolyRings();
        STATE.snapIndex = null;

        var usedSplit = sol.split;
        STATE.nodeEditEnabled = false; STATE.nodeMode = null;
        STATE.ringData = null; STATE.nodeFailReason = "";
        var target = STATE.solveTargetM2;

        // --- chord mode: single simple polygon, cut meets boundary exactly twice ---
        if (STATE.selectedEntries.length === 1) {
            var rd = buildRingData(STATE.selectedEntries[0].geomU);
            if (!rd) {
                STATE.nodeFailReason = "multi-part geometry";
            } else {
                var ends = extractCutEndpointsU(sol.split);
                if (!ends) {
                    STATE.nodeFailReason = "cut endpoints not resolvable";
                } else {
                    var pA = locateOnRing(rd, ends[0]), pB = locateOnRing(rd, ends[1]);
                    var aFwd = chordPart1Area(rd, pA, pB), aRev = rd.totalArea - aFwd;
                    if (Math.abs(aRev - target) < Math.abs(aFwd - target)) {
                        var t = pA; pA = pB; pB = t; aFwd = aRev;
                    }
                    if (Math.abs(aFwd - target) < Math.max(0.05, rd.totalArea * 0.004)) {
                        var pBr = solveChordPartner(rd, pA, true, target);
                        if (pBr !== null) pB = pBr;
                        var cs = buildChordSplit(rd, pA, pB);
                        if (cs) {
                            usedSplit = cs; STATE.ringData = rd;
                            STATE.posA = pA; STATE.posB = pB;
                            STATE.posA0 = pA; STATE.posB0 = pB;
                            STATE.chordTargetArea = target;
                            STATE.nodeEditEnabled = true; STATE.nodeMode = "chord";
                        }
                    } else {
                        STATE.nodeFailReason = "concave shape (cut crosses boundary >2×)";
                    }
                }
            }
        }

        // --- line mode: everything else (incl. multi-polygon) ---
        if (!STATE.nodeEditEnabled) {
            var clip = clipLineEnds(sol.pivot, sol.angleDeg);
            if (clip) {
                STATE.lineNodes = [clip.ends[0].slice(), clip.ends[1].slice()];
                STATE.lineNodes0 = [clip.ends[0].slice(), clip.ends[1].slice()];
                STATE.lineAngle = sol.angleDeg; STATE.lineAngle0 = sol.angleDeg;
                STATE.chordTargetArea = target;
                STATE.nodeEditEnabled = true; STATE.nodeMode = "line";
                STATE.nodeFailReason = "";
            } else if (!STATE.nodeFailReason) {
                STATE.nodeFailReason = "line does not intersect the parcels";
            }
        }

        renderSplitGeoms(usedSplit, true);
        STATE.hasAppliedResult = true;

        if (STATE.nodeEditEnabled) {
            ensureNodeLayer(); ensureSnapLayer(); buildSnapIndex();
            refreshNodes(); startNodeEditing();
        }
        showAppliedPanel();
    }

    function extractCutEndpointsU(sp) {
        var coords = [];
        (sp.cuts || []).forEach(function (g) {
            if (!g) return;
            var t = g.getType();
            if (t === "LineString") { var c = g.getCoordinates(); coords.push(c[0], c[c.length - 1]); }
            else if (t === "MultiLineString") {
                g.getLineStrings().forEach(function (ls) {
                    var cc = ls.getCoordinates(); coords.push(cc[0], cc[cc.length - 1]);
                });
            } else if (t === "Point") coords.push(g.getCoordinates());
            else if (t === "MultiPoint") g.getCoordinates().forEach(function (c2) { coords.push(c2); });
            else if (t === "GeometryCollection") {
                g.getGeometries().forEach(function (gg) {
                    var tt = gg.getType();
                    if (tt === "LineString") { var c3 = gg.getCoordinates(); coords.push(c3[0], c3[c3.length - 1]); }
                    else if (tt === "Point") coords.push(gg.getCoordinates());
                });
            }
        });
        if (coords.length < 2) return null;
        var maxD = -1, pair = [coords[0], coords[1]];
        for (var i = 0; i < coords.length; i++) {
            for (var j = i + 1; j < coords.length; j++) {
                var d = utmDist(coords[i], coords[j]);
                if (d > maxD) { maxD = d; pair = [coords[i], coords[j]]; }
            }
        }
        return pair;
    }

    function partDisplayName(partNo, idx, count) {
        var base = (STATE.partMeta[partNo] && STATE.partMeta[partNo].name) || ("PART " + partNo);
        return count > 1 ? base + " (" + (idx + 1) + ")" : base;
    }

    function renderSplitGeoms(sp, withLabels) {
        STATE.currentSplit = sp;
        STATE.resultLayer.getSource().clear();
        STATE.labelLayer.getSource().clear();

        var p1L = STATE.isReversed ? 2 : 1, p2L = STATE.isReversed ? 1 : 2;
        var p1total = 0, p2total = 0, pkIdx = 0;
        var counts = {}; counts[p1L] = sp.p1geoms.length; counts[p2L] = sp.p2geoms.length;
        var seen = { 1: 0, 2: 0 };

        function addPart(itemU, lbl) {
            var gU = itemU.g, area = utmArea(gU), gM = geomToMap(gU);
            var pk = "p" + (pkIdx++);
            var nm = partDisplayName(lbl, seen[lbl], counts[lbl]);
            seen[lbl]++;
            var f = new ol.Feature(gM);
            f.set("msdPart", lbl); f.set("__pk", pk);
            f.set("msdAreaM2", area); f.set("msdName", nm);
            f.set("msdDesc", (STATE.partMeta[lbl] && STATE.partMeta[lbl].desc) || "");
            STATE.resultLayer.getSource().addFeature(f);
            if (withLabels) {
                addSideLabelsU(gU, lbl, pk);
                addCentroidLabel(gM, nm, area, lbl, pk);
            }
            return area;
        }

        sp.p1geoms.forEach(function (it) {
            var a = addPart(it, p1L); if (p1L === 1) p1total += a; else p2total += a;
        });
        sp.p2geoms.forEach(function (it) {
            var a = addPart(it, p2L); if (p2L === 1) p1total += a; else p2total += a;
        });
        sp.cuts.forEach(function (gU) {
            var f = new ol.Feature(geomToMap(gU));
            f.set("msdCut", true);
            STATE.resultLayer.getSource().addFeature(f);
        });

        STATE.lastP1Total = p1total;
        STATE.lastP2Total = p2total;
    }

    function showAppliedPanel() {
        STATE.stage = "applied";
        var isSingle = STATE.selectedEntries.length === 1;
        var forced = isSingle || STATE.lockParallel;

        var nodeBlock;
        if (STATE.nodeEditEnabled && STATE.nodeMode === "chord") {
            nodeBlock = '<div class="ms tip">🎯 <b>Node editing — boundary mode</b><br>' +
                'Drag <b>①/②</b> along the parcel edge; the opposite node re-solves live so ' +
                '<b>PART ' + (STATE.isReversed ? 2 : 1) + '</b> stays at <b>' +
                fmtArea(STATE.targetPart1M2, STATE.chosenUnit) + '</b>.</div>';
        } else if (STATE.nodeEditEnabled && STATE.nodeMode === "line") {
            nodeBlock = '<div class="ms tip">🎯 <b>Node editing — line mode (multi-parcel)</b><br>' +
                'Drag <b>①</b> or <b>②</b>. The line pivots about the <b>pinned</b> opposite node ' +
                '(shown dark) and the bearing re-solves live so <b>PART ' +
                (STATE.isReversed ? 2 : 1) + '</b> stays at <b>' +
                fmtArea(STATE.targetPart1M2, STATE.chosenUnit) + '</b> across all parcels.' +
                '<div id="brg" style="margin-top:4px;font-size:11px;"></div></div>';
        } else {
            nodeBlock = '<div class="ms warn">⚠️ Node editing unavailable' +
                (STATE.nodeFailReason ? ' — ' + esc(STATE.nodeFailReason) : '') + '.</div>';
        }

        var snapBlock = STATE.nodeEditEnabled ? snapControlsHtml() : "";
        var resetBtn = STATE.nodeEditEnabled
            ? '<button class="bt bs" id="rsn">↺ Reset Nodes</button>' : "";

        showPanel(
            hdr('✓ Division Applied') +
            '<div class="mb">' +
                '<div class="ms">Orientation: <b>' + STATE.appliedAngleDeg.toFixed(4) + '°</b>' +
                    (STATE.isReversed ? ' <span style="color:#ea580c">(Reversed)</span>' : '') +
                    (forced ? ' <span style="color:#059669">(Parallel)</span>' : '') +
                    '<br><br><div id="msd-live-stats">' + liveStatsHtml() + '</div></div>' +
                nodeBlock + snapBlock + resetBtn +
                '<div class="ms">Geometry & areas computed in <b>EPSG:32643</b>.</div>' +
                '<button class="bt bc" id="sv5">💾 Save Split (name the parcels)</button>' +
                '<button class="bt bw" id="rv5">⇄ Reverse (' +
                    fmtArea(STATE.targetPart1M2, STATE.chosenUnit) + ' Opposite Side)</button>' +
                '<button class="bt bs" id="bk5">← Back to Solutions</button>' +
                '<button class="bt bp" id="nw5">New Division (Clear)</button>' +
                '<button class="bt bg" id="cl5">Close (Keep Results)</button>' +
            '</div>'
        );

        document.getElementById("mcl").onclick = closePanel;
        document.getElementById("cl5").onclick = closePanel;
        document.getElementById("bk5").onclick = function () {
            stopNodeEditing(); removeNodeLayer(); clearSnapIndicator(); stageSolutions();
        };
        document.getElementById("nw5").onclick = function () {
            stopNodeEditing(); removeNodeLayer(); removeResultLayers();
            STATE.hasAppliedResult = false; closePanel(); openTool();
        };
        document.getElementById("sv5").onclick = stageSaveDialog;
        document.getElementById("rv5").onclick = function () {
            stopNodeEditing(); removeNodeLayer(); clearSnapIndicator();
            showPanel(hdr('Recalculating...') +
                '<div class="mb" style="text-align:center;padding:30px;">' +
                '<div style="color:#334155;">Recalculating from opposite side...</div></div>');
            document.getElementById("mcl").onclick = closePanel;
            setTimeout(function () { performSearch(!STATE.isReversed); }, 60);
        };
        var rsn = document.getElementById("rsn");
        if (rsn) rsn.onclick = resetNodes;
        wireSnapControls();
        updateBearingReadout();
    }

    function liveStatsHtml() {
        var extra = '';
        if (STATE.nodeEditEnabled) {
            var cur = STATE.isReversed ? STATE.lastP2Total : STATE.lastP1Total;
            var diff = cur - STATE.targetPart1M2;
            extra = '<br><span style="font-size:10px;color:' +
                    (Math.abs(diff) < 0.01 ? '#059669' : '#b45309') + ';">Δ target: ' +
                    (diff >= 0 ? "+" : "") + diff.toFixed(3) + ' m²</span>';
        }
        var n1 = STATE.partMeta[1].name || "PART 1", n2 = STATE.partMeta[2].name || "PART 2";
        return '<b style="color:' + CONFIG.part1Stroke + '">' + esc(n1) + ':</b> ' +
               fmtArea(STATE.lastP1Total, STATE.chosenUnit) + '<br>' +
               '<b style="color:' + CONFIG.part2Stroke + '">' + esc(n2) + ':</b> ' +
               fmtArea(STATE.lastP2Total, STATE.chosenUnit) + '<br>' +
               '<span style="color:#64748b;font-size:11px;">Total: ' +
               fmtArea(STATE.lastP1Total + STATE.lastP2Total, STATE.chosenUnit) + '</span>' + extra;
    }
    function updateLiveStats() {
        var el = document.getElementById("msd-live-stats");
        if (el) el.innerHTML = liveStatsHtml();
    }
    function updateBearingReadout() {
        var el = document.getElementById("brg");
        if (!el || STATE.nodeMode !== "line" || !STATE.lineNodes) return;
        var cur = normDeg(STATE.lineAngle);
        var d = cur - STATE.refAngleDeg;
        while (d > 90) d -= 180; while (d < -90) d += 180;
        var len = utmDist(STATE.lineNodes[0], STATE.lineNodes[1]);
        el.innerHTML = 'Bearing <b>' + cur.toFixed(3) + '°</b> · Δref <b>' +
            (d >= 0 ? "+" : "") + d.toFixed(3) + '°</b> · span <b>' + len.toFixed(2) + ' m</b>';
    }

    function resetNodes() {
        if (!STATE.nodeEditEnabled) return;
        if (STATE.nodeMode === "chord") {
            STATE.posA = STATE.posA0; STATE.posB = STATE.posB0;
            var cs = buildChordSplit(STATE.ringData, STATE.posA, STATE.posB);
            if (cs) renderSplitGeoms(cs, true);
        } else {
            STATE.lineAngle = STATE.lineAngle0;
            STATE.lineNodes = [STATE.lineNodes0[0].slice(), STATE.lineNodes0[1].slice()];
            var sp = evalSplitPivotU(STATE.lineNodes[0], STATE.lineAngle);
            if (sp) renderSplitGeoms(sp, true);
        }
        clearSnapIndicator();
        refreshNodes(); updateLiveStats(); updateBearingReadout();
    }

    // ========================================================
    // NODE INTERACTION
    // ========================================================

    function currentNodesU() {
        if (STATE.nodeMode === "chord" && STATE.ringData) {
            return [interpU(STATE.ringData, STATE.posA), interpU(STATE.ringData, STATE.posB)];
        }
        if (STATE.nodeMode === "line" && STATE.lineNodes) return STATE.lineNodes;
        return null;
    }

    function refreshNodes() {
        if (!STATE.nodeLayer) return;
        var pts = currentNodesU();
        if (!pts) return;
        var src = STATE.nodeLayer.getSource(); src.clear();
        pts.forEach(function (p, i) {
            var st = "idle";
            if (STATE.draggingIdx === i) st = "drag";
            else if (STATE.draggingIdx >= 0 && STATE.nodeMode === "line") st = "anchor";
            else if (STATE.hoverIdx === i) st = "hover";
            var f = new ol.Feature(new ol.geom.Point(coordToMap(p)));
            f.set("__idx", i); f.set("__st", st);
            src.addFeature(f);
        });
    }

    function hitNode(pixel) {
        if (!STATE.nodeLayer) return -1;
        var found = -1;
        STATE.map.forEachFeatureAtPixel(pixel, function (f) {
            if (found >= 0) return;
            var v = f.get("__idx");
            if (v === 0 || v === 1) found = v;
        }, {
            hitTolerance: CONFIG.nodeHitTolerance,
            layerFilter: function (l) { return l === STATE.nodeLayer; }
        });
        return found;
    }

    function setDragPan(active) {
        if (!STATE.map) return;
        STATE.map.getInteractions().forEach(function (i) {
            if (i instanceof ol.interaction.DragPan) i.setActive(active);
        });
    }

    function startNodeEditing() {
        stopNodeEditing();
        if (!STATE.nodeEditEnabled) return;
        var vp = STATE.map.getViewport();

        STATE.nodeDownFn = function (e) {
            if (e.button !== undefined && e.button !== 0) return;
            var idx = hitNode(STATE.map.getEventPixel(e));
            if (idx < 0) return;
            STATE.draggingIdx = idx; STATE.hoverIdx = idx;

            // Keep the opposite point for reference; line mode now solves
            // from the dragged point and recalculates both clipped endpoints.
            var pts = currentNodesU();
            STATE.dragAnchorU = pts ? pts[1 - idx].slice() : null;

            setDragPan(false); vp.style.cursor = "grabbing";
            refreshNodes(); e.preventDefault(); e.stopPropagation();
        };

        STATE.nodeMoveFn = function (e) {
            if (STATE.draggingIdx >= 0) {
                STATE.pendingCoordU = coordToUTM(STATE.map.getEventCoordinate(e));
                if (!STATE.rafPending) {
                    STATE.rafPending = true; requestAnimationFrame(processDragFrame);
                }
                e.preventDefault(); return;
            }
            var idx = hitNode(STATE.map.getEventPixel(e));
            if (idx !== STATE.hoverIdx) {
                STATE.hoverIdx = idx; refreshNodes();
                vp.style.cursor = idx >= 0 ? "grab" : "";
            }
        };

        STATE.nodeUpFn = function () {
            if (STATE.draggingIdx < 0) return;
            STATE.draggingIdx = -1; STATE.dragAnchorU = null;
            setDragPan(true); vp.style.cursor = "";
            clearSnapIndicator();

            // re-seat line nodes onto the true clipped extremes
            if (STATE.nodeMode === "line" && STATE.lineNodes) {
                var clip = clipLineEnds(STATE.lineNodes[0], STATE.lineAngle);
                if (clip) STATE.lineNodes = [clip.ends[0], clip.ends[1]];
            }
            if (STATE.currentSplit) renderSplitGeoms(STATE.currentSplit, true);
            refreshNodes(); updateLiveStats(); updateBearingReadout();
        };

        vp.addEventListener("pointerdown", STATE.nodeDownFn, true);
        window.addEventListener("pointermove", STATE.nodeMoveFn, true);
        window.addEventListener("pointerup", STATE.nodeUpFn, true);
        window.addEventListener("pointercancel", STATE.nodeUpFn, true);
    }

    function stopNodeEditing() {
        if (!STATE.map) return;
        var vp = STATE.map.getViewport();
        if (STATE.nodeDownFn) { vp.removeEventListener("pointerdown", STATE.nodeDownFn, true); STATE.nodeDownFn = null; }
        if (STATE.nodeMoveFn) { window.removeEventListener("pointermove", STATE.nodeMoveFn, true); STATE.nodeMoveFn = null; }
        if (STATE.nodeUpFn) {
            window.removeEventListener("pointerup", STATE.nodeUpFn, true);
            window.removeEventListener("pointercancel", STATE.nodeUpFn, true);
            STATE.nodeUpFn = null;
        }
        STATE.draggingIdx = -1; STATE.hoverIdx = -1; STATE.dragAnchorU = null;
        STATE.rafPending = false; STATE.pendingCoordU = null;
        setDragPan(true);
        if (vp) vp.style.cursor = "";
    }

    function processDragFrame() {
        STATE.rafPending = false;
        if (STATE.draggingIdx < 0 || !STATE.pendingCoordU) return;
        var cursorU = snapCursor(STATE.pendingCoordU);
        var split = (STATE.nodeMode === "chord")
            ? applyChordDrag(STATE.draggingIdx, cursorU)
            : applyLineDrag(STATE.draggingIdx, cursorU);
        if (!split) return;
        renderSplitGeoms(split, false);
        refreshNodes(); updateLiveStats(); updateBearingReadout();
    }

    function applyChordDrag(idx, cursorU) {
        var rd = STATE.ringData;
        if (!rd) return null;
        var newPos = locateOnRing(rd, cursorU), target = STATE.chordTargetArea, nA, nB;
        if (idx === 0) {
            nA = newPos;
            var sB = solveChordPartner(rd, nA, true, target);
            if (sB === null) return null;
            nB = sB;
        } else {
            nB = newPos;
            var sA = solveChordPartner(rd, nB, false, target);
            if (sA === null) return null;
            nA = sA;
        }
        if (utmDist(interpU(rd, nA), interpU(rd, nB)) < 0.2) return null;
        if (!chordIsInside(rd, nA, nB)) return null;
        var cs = buildChordSplit(rd, nA, nB);
        if (!cs) return null;
        STATE.posA = nA; STATE.posB = nB;
        return cs;
    }

    /**
     * LINE MODE — multi-polygon live area solver.
     * The dragged point becomes the live pivot. The line bearing is solved
     * around that point for the requested Part-1 area, then BOTH clipped
     * endpoints are recalculated from all selected polygon boundaries.
     * This mirrors the single-polygon chord tool's moving-partner behavior.
     */
    function applyLineDrag(idx, cursorU) {
        if (!cursorU || !isFinite(cursorU[0]) || !isFinite(cursorU[1])) return null;
        var target = Number(STATE.chordTargetArea);
        if (!(target > 0) || !isFinite(target)) return null;

        // Keep the current bearing as the preferred direction; the solver
        // rotates it only as much as needed to preserve the requested area.
        var thUser = isFinite(STATE.lineAngle) ? STATE.lineAngle : 0;
        var th = solveLineAngle(cursorU, thUser, target);
        if (th === null) {
            // This pivot may not admit the requested area (common when a
            // disconnected parcel lies wholly on one side). Do not corrupt
            // the last valid split or let the nodes jump unpredictably.
            return null;
        }

        var split = evalSplitPivotU(cursorU, th);
        if (!split || !split.p1geoms.length || !split.p2geoms.length) return null;

        // Use the exact clipped extremes across EVERY selected polygon.
        // The nearest extreme remains the handle being dragged; the opposite
        // extreme is automatically re-solved on every animation frame.
        var clip = clipLineEnds(cursorU, th);
        if (!clip || !clip.ends || clip.ends.length !== 2) return null;
        var d0 = utmDist(cursorU, clip.ends[0]);
        var d1 = utmDist(cursorU, clip.ends[1]);
        var draggedEnd = d0 <= d1 ? clip.ends[0] : clip.ends[1];
        var oppositeEnd = d0 <= d1 ? clip.ends[1] : clip.ends[0];
        if (utmDist(draggedEnd, oppositeEnd) < 0.2) return null;

        STATE.lineAngle = th;
        STATE.lineNodes = idx === 0
            ? [draggedEnd.slice(), oppositeEnd.slice()]
            : [oppositeEnd.slice(), draggedEnd.slice()];
        return split;
    }

    // ========================================================
    // STAGE 6 — SAVE DIALOG
    // ========================================================

    function stageSaveDialog() {
        STATE.stage = "save";
        var dm = CONFIG.descMaxChars;

        showPanel(
            hdr('🏷️ Name the New Parcels') +
            '<div class="mb">' +
                '<div class="ms">Give each new parcel an <b>ID / number</b> and an optional ' +
                'description (max ' + dm + ' characters). Labels appear on the map and are ' +
                'searchable / editable later.</div>' +
                '<label class="fl">Split Title (optional)</label>' +
                '<input type="text" id="stt" class="mi" maxlength="80" ' +
                    'placeholder="e.g. Survey 112 partition – phase 1" value="' + esc(STATE.splitTitle) + '">' +

                '<div class="pcard p1" style="margin-top:12px;">' +
                    '<h4 style="color:' + CONFIG.part1Stroke + '">① PART 1 — ' +
                        fmtArea(STATE.lastP1Total, STATE.chosenUnit) + '</h4>' +
                    '<label class="fl">Parcel ID / Number *</label>' +
                    '<input type="text" id="id1" class="mi" maxlength="' + CONFIG.idMaxChars + '" ' +
                        'placeholder="e.g. 112/1A" value="' + esc(STATE.partMeta[1].name) + '">' +
                    '<label class="fl">Description</label>' +
                    '<textarea id="ds1" class="mi" maxlength="' + dm + '" ' +
                        'placeholder="Owner, notes, remarks...">' + esc(STATE.partMeta[1].desc) + '</textarea>' +
                    '<div class="ctr" id="c1">0 / ' + dm + '</div>' +
                '</div>' +

                '<div class="pcard p2">' +
                    '<h4 style="color:' + CONFIG.part2Stroke + '">② PART 2 — ' +
                        fmtArea(STATE.lastP2Total, STATE.chosenUnit) + '</h4>' +
                    '<label class="fl">Parcel ID / Number *</label>' +
                    '<input type="text" id="id2" class="mi" maxlength="' + CONFIG.idMaxChars + '" ' +
                        'placeholder="e.g. 112/1B" value="' + esc(STATE.partMeta[2].name) + '">' +
                    '<label class="fl">Description</label>' +
                    '<textarea id="ds2" class="mi" maxlength="' + dm + '" ' +
                        'placeholder="Owner, notes, remarks...">' + esc(STATE.partMeta[2].desc) + '</textarea>' +
                    '<div class="ctr" id="c2">0 / ' + dm + '</div>' +
                '</div>' +

                '<button class="bt bg" id="dosave">💾 Apply Names & Save</button>' +
                '<button class="bt bs" id="cancelsave">← Back (keep editing)</button>' +
            '</div>'
        );

        document.getElementById("mcl").onclick = closePanel;
        document.getElementById("cancelsave").onclick = function () {
            if (STATE.nodeEditEnabled) { ensureNodeLayer(); refreshNodes(); startNodeEditing(); }
            showAppliedPanel();
        };

        function wire(taId, ctrId) {
            var ta = document.getElementById(taId), c = document.getElementById(ctrId);
            var upd = function () {
                var n = ta.value.length;
                c.textContent = n + " / " + dm;
                c.className = "ctr" + (n >= dm ? " warn" : "");
            };
            ta.oninput = upd; upd();
        }
        wire("ds1", "c1"); wire("ds2", "c2");

        ["id1", "id2"].forEach(function (id, k) {
            document.getElementById(id).oninput = function () {
                STATE.partMeta[k + 1].name = this.value || ("PART " + (k + 1));
                if (STATE.currentSplit) renderSplitGeoms(STATE.currentSplit, true);
            };
        });

        document.getElementById("dosave").onclick = function () {
            var i1 = document.getElementById("id1").value.trim();
            var i2 = document.getElementById("id2").value.trim();
            if (!i1 || !i2) { alert("Both parcel IDs are required."); return; }
            if (i1 === i2) { alert("The two parcel IDs must be different."); return; }

            STATE.splitTitle = document.getElementById("stt").value.trim() || (i1 + " / " + i2);
            STATE.partMeta[1] = { name: i1, desc: document.getElementById("ds1").value.slice(0, dm) };
            STATE.partMeta[2] = { name: i2, desc: document.getElementById("ds2").value.slice(0, dm) };

            if (STATE.currentSplit) renderSplitGeoms(STATE.currentSplit, true);
            var id = saveCurrentSplit();
            if (id) stageSavedConfirm(id);
        };
    }

    function stageSavedConfirm(id) {
        STATE.stage = "saved";
        stopNodeEditing(); removeNodeLayer(); clearSnapIndicator();
        var n1 = STATE.partMeta[1].name, n2 = STATE.partMeta[2].name;

        showPanel(
            hdr('✅ Saved') +
            '<div class="mb">' +
                '<div class="ms ok"><b>Split stored locally.</b><br>' +
                    '• <b>' + esc(n1) + '</b> — ' + fmtArea(STATE.lastP1Total, STATE.chosenUnit) + '<br>' +
                    '• <b>' + esc(n2) + '</b> — ' + fmtArea(STATE.lastP2Total, STATE.chosenUnit) + '</div>' +
                '<div class="ms pur">These parcels are now <b>selectable</b>. Pick either one to ' +
                'subdivide further — the parent is replaced automatically.</div>' +
                '<button class="bt bv" id="cont">♻️ Continue Subdividing →</button>' +
                '<button class="bt bc" id="edt">✏️ Edit This Split</button>' +
                '<button class="bt bs" id="zm">🔍 Zoom to Saved Split</button>' +
                '<button class="bt bg" id="done">Close (Keep Results)</button>' +
            '</div>'
        );
        document.getElementById("mcl").onclick = closePanel;
        document.getElementById("done").onclick = closePanel;
        document.getElementById("zm").onclick = function () { zoomToSavedSplit(id); };
        document.getElementById("edt").onclick = function () { stageEditSplit(id); };
        document.getElementById("cont").onclick = function () {
            STATE.resultLayer.getSource().clear();
            STATE.labelLayer.getSource().clear();
            STATE.selectedFeatures = []; STATE.selectedEntries = [];
            STATE.polyRingsU = []; STATE.snapIndex = null;
            if (STATE.selLayer) STATE.selLayer.getSource().clear();
            STATE.hasAppliedResult = false; STATE.currentSplit = null;
            STATE.nodeEditEnabled = false; STATE.nodeMode = null;
            stageSelectPolygons();
        };
    }

    // ========================================================
    // LABELS
    // ========================================================

    function addSideLabelsU(geomU, part, pk) {
        var polys = geomU.getType() === "MultiPolygon" ? geomU.getPolygons() : [geomU];
        polys.forEach(function (poly) {
            var rings = poly.getCoordinates();
            if (!rings || !rings.length) return;
            var ring = rings[0];
            for (var i = 0; i < ring.length - 1; i++) {
                var u1 = ring[i], u2 = ring[i + 1];
                var len = utmDist(u1, u2);
                if (len < CONFIG.minSegmentLengthM) continue;
                var m1 = coordToMap(u1), m2 = coordToMap(u2);
                var mid = [(m1[0] + m2[0]) / 2, (m1[1] + m2[1]) / 2];
                var rot = Math.atan2(m2[1] - m1[1], m2[0] - m1[0]);
                if (rot > Math.PI / 2) rot -= Math.PI;
                if (rot < -Math.PI / 2) rot += Math.PI;
                var f = new ol.Feature({
                    geometry: new ol.geom.Point(mid),
                    msdText: fmtNum(len, CONFIG.sideDecimals) + " m",
                    msdRot: -rot, msdPart: part
                });
                f.set("__pk", pk);
                STATE.labelLayer.getSource().addFeature(f);
            }
        });
    }

    function addCentroidLabel(geomMap, title, areaM2, part, pk) {
        var pt = null;
        try {
            if (geomMap.getType() === "Polygon") pt = geomMap.getInteriorPoint().getCoordinates();
            else if (geomMap.getType() === "MultiPolygon") {
                var pts = geomMap.getInteriorPoints().getCoordinates();
                if (pts && pts.length) pt = pts[0];
            }
        } catch (e) { return; }
        if (!pt) return;
        var f = new ol.Feature({
            geometry: new ol.geom.Point([pt[0], pt[1]]),
            msdText: title + "\n" + fmtArea(areaM2, STATE.chosenUnit),
            msdCentroid: true, msdPart: part
        });
        f.set("__pk", pk);
        STATE.labelLayer.getSource().addFeature(f);
    }

    // ========================================================
    // GEOMETRY HELPERS
    // ========================================================

    function findNearestSegmentU(coordU) {
        var best = null, minD = Infinity;
        STATE.selectedEntries.forEach(function (entry) {
            var polys = entry.geomU.getType() === "MultiPolygon"
                ? entry.geomU.getPolygons() : [entry.geomU];
            polys.forEach(function (poly) {
                poly.getCoordinates().forEach(function (ring) {
                    for (var i = 0; i < ring.length - 1; i++) {
                        var d = ptSegDist(coordU, ring[i], ring[i + 1]);
                        if (d < minD) { minD = d; best = { p1: ring[i].slice(), p2: ring[i + 1].slice() }; }
                    }
                });
            });
        });
        return best;
    }
    function ptSegDist(p, a, b) {
        var dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
        if (l2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
        var t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
    }

    // ========================================================
    // ESC
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
        STATE.map = m;
        detectProjection();
        migrateStore();
        loadSnapPrefs();
        injectUI();
        console.log("📐 Multi-Polygon Division Tool v6.1 READY.");
    }

    init();

})();
