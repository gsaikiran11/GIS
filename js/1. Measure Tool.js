// ============================================================
// 📐 STAGE 14 — ADVANCED MEASURE TOOL  (v2.3)
// QGIS2WEB + OPENLAYERS  —  SINGLE FILE, DROP-IN
//
// v2.3 CHANGELOG
//  ✔ Mobile Width Constraint & Auto-Centering — Floating centered card layout on mobile
//  ✔ Dynamic Max-Height Engine — Panel locks within visible screen area
//  ✔ Style Property Overrides — Bypass hardcoded stylesheet !important rules
//  ✔ Overwrite handshake enabled — fully compatible with MapToolManager v3.3
//  ✔ Panel auto-follows the button wherever you drag it
//  ✔ NO inline position writes in CSS — CSS classes only
//  ✔ Closes on maptool:editmode / maptool:visibility / ESC
//  ✔ Click-outside closes the panel
//  ✔ Mobile-friendly (touch targets, responsive widths)
//  ✔ Stage 5 popup suppression preserved
//  ✔ All measurement features preserved
// ============================================================

(function () {
    "use strict";

    /* ========================================================
       1. CONFIGURATION
       ======================================================== */
    var CONFIG = {
        toolId:   "measure",
        toolName: "Measure",
        toolIcon: "📐",

        buttonId: "stage14-measure-button",
        panelId:  "stage14-panel",
        controlId: "stage14-control",

        btnSize:   40,
        panelWidth: 300,
        panelGap:  8,

        defaults: { top: 132, left: 12 },

        dataProjection: "EPSG:32643",
        mapProjection:  "EPSG:3857",

        defaultSnapTolerance: 18
    };

    if (typeof ol === "undefined") {
        console.error("📐 Stage 14: OpenLayers (ol) not found.");
        return;
    }

    /* ========================================================
       2. STATE
       ======================================================== */
    var mapRef = null;
    var button = null;
    var panel = null;
    var panelOpen = false;

    var active = false;
    var finished = false;
    var points = [];
    var currentPointer = null;
    var currentSnapType = null;

    var lengthUnit = "m";
    var areaUnit = "m2";
    var snapEnabled = true;
    var snapTolerance = CONFIG.defaultSnapTolerance;

    var measureSource = new ol.source.Vector();
    var snapSource = new ol.source.Vector();
    var measureLayer = null;
    var snapLayer = null;

    // Popup suppression flag
    window.stage14MeasureActive = false;

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
        if (document.getElementById("stage14-css-v2")) return;

        var css = document.createElement("style");
        css.id = "stage14-css-v2";
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
    z-index: 18000;\
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
        border-color .15s ease;\
}\
\
#' + CONFIG.buttonId + ':hover {\
    background: var(--ui-bg-hover, #eef1f5);\
    border-color: var(--ui-accent, #1f6feb);\
}\
\
#' + CONFIG.buttonId + '.active {\
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
    box-shadow: 0 8px 32px rgba(0,0,0,.25);\
\
    font-family: var(--ui-font, "Segoe UI", Roboto, system-ui, sans-serif);\
    font-size: 12px;\
    color: var(--ui-text, #1d2430);\
\
    z-index: 52000;\
    display: none;\
    flex-direction: column;\
    box-sizing: border-box;\
}\
\
#' + CONFIG.panelId + '.s14-visible {\
    display: flex;\
    animation: s14-fade .16s ease;\
}\
\
@keyframes s14-fade {\
    from { opacity: 0; transform: translateY(6px); }\
    to   { opacity: 1; transform: translateY(0); }\
}\
\
#' + CONFIG.panelId + ' * { box-sizing: border-box; }\
\
\
/* ============ HEADER ============ */\
.s14-head {\
    display: flex;\
    align-items: center;\
    justify-content: space-between;\
    gap: 8px;\
    padding: 10px 12px;\
    background: linear-gradient(135deg, #1565c0, #0d47a1);\
    color: #fff;\
    flex-shrink: 0;\
    border-radius: var(--ui-radius, 10px) var(--ui-radius, 10px) 0 0;\
}\
\
.s14-title { font-size: 13px; font-weight: 700; }\
.s14-subtitle { font-size: 10px; opacity: .7; margin-top: 1px; }\
\
.s14-close {\
    width: 26px; height: 26px; flex-shrink: 0;\
    border: none; border-radius: 5px;\
    background: rgba(255,255,255,.15);\
    color: #fff; font-size: 17px; line-height: 1;\
    cursor: pointer;\
    display: flex; align-items: center; justify-content: center;\
}\
\
.s14-close:hover { background: rgba(255,255,255,.3); }\
\
\
/* ============ BODY & CUSTOM SCROLLBAR ============ */\
.s14-body {\
    padding: 10px 12px;\
    overflow-y: auto;\
    -webkit-overflow-scrolling: touch;\
    flex: 1;\
    min-height: 0;\
}\
\
.s14-body::-webkit-scrollbar {\
    width: 6px !important;\
}\
\
.s14-body::-webkit-scrollbar-track {\
    background: rgba(0, 0, 0, 0.02) !important;\
    border-radius: 3px !important;\
}\
\
.s14-body::-webkit-scrollbar-thumb {\
    background: var(--ui-border-strong, #aeb6c2) !important;\
    border-radius: 3px !important;\
}\
\
.s14-body::-webkit-scrollbar-thumb:hover {\
    background: var(--ui-accent, #1f6feb) !important;\
}\
\
\
/* ============ STATUS ============ */\
.s14-status {\
    padding: 7px 9px;\
    margin: 0 0 10px;\
    border-radius: var(--ui-radius-sm, 7px);\
    background: var(--ui-bg-subtle, #f3f6f9);\
    border: 1px solid var(--ui-border-soft, #e5e7eb);\
    font-size: 11px;\
    line-height: 1.45;\
    color: var(--ui-text, #1d2430);\
    word-break: break-word;\
}\
\
\
/* ============ BUTTON ROW ============ */\
.s14-row {\
    display: flex;\
    gap: 6px;\
    margin-bottom: 8px;\
}\
\
.s14-btn {\
    flex: 1;\
    height: 34px;\
    min-height: 34px;\
    border: 1px solid var(--ui-border, #d7dce3);\
    border-radius: var(--ui-radius-sm, 7px);\
    background: var(--ui-bg, #fff);\
    color: var(--ui-text, #374151);\
    font-family: inherit;\
    font-size: 11.5px;\
    font-weight: 600;\
    cursor: pointer;\
    padding: 0 8px;\
    display: flex;\
    align-items: center;\
    justify-content: center;\
    gap: 4px;\
    transition: background .13s ease, border-color .13s ease;\
    -webkit-tap-highlight-color: transparent;\
}\
\
.s14-btn:hover {\
    background: var(--ui-bg-hover, #f3f4f6);\
    border-color: var(--ui-accent, #1f6feb);\
}\
\
.s14-btn.primary {\
    background: var(--ui-accent, #1565c0);\
    border-color: var(--ui-accent, #1565c0);\
    color: #fff;\
}\
\
.s14-btn.primary:hover {\
    background: var(--ui-accent-dark, #0d47a1);\
}\
\
.s14-btn.danger {\
    color: var(--ui-danger, #dc2626);\
    border-color: rgba(220,38,38,.3);\
}\
\
.s14-btn.danger:hover {\
    background: rgba(220,38,38,.08);\
    border-color: var(--ui-danger, #dc2626);\
}\
\
.s14-btn.active {\
    background: var(--ui-success, #16a34a);\
    border-color: var(--ui-success, #16a34a);\
    color: #fff;\
}\
\
\
/* ============ SETTINGS ============ */\
.s14-sec {\
    font-size: 10px;\
    font-weight: 800;\
    text-transform: uppercase;\
    letter-spacing: .4px;\
    color: var(--ui-text-muted, #6b7280);\
    margin: 10px 0 6px;\
    padding-top: 8px;\
    border-top: 1px solid var(--ui-border-soft, #e5e7eb);\
}\
\
.s14-setting {\
    margin-bottom: 8px;\
}\
\
.s14-setting label {\
    display: block;\
    font-size: 10.5px;\
    font-weight: 700;\
    color: var(--ui-text-muted, #5b6472);\
    margin: 0 0 3px;\
    text-transform: uppercase;\
    letter-spacing: .3px;\
}\
\
.s14-setting select {\
    width: 100%;\
    height: 30px;\
    padding: 4px 7px;\
    border: 1px solid var(--ui-border, #d7dce3);\
    border-radius: var(--ui-radius-sm, 7px);\
    background: var(--ui-bg-subtle, #f5f7fa);\
    color: var(--ui-text, #1d2430);\
    font-family: inherit;\
    font-size: 11px;\
    outline: none;\
}\
\
.s14-setting input[type="range"] {\
    width: 100%;\
    margin: 4px 0 0;\
}\
\
.s14-check {\
    display: flex;\
    align-items: center;\
    gap: 7px;\
    font-size: 11.5px;\
    font-weight: 500;\
    cursor: pointer;\
    color: var(--ui-text, #1d2430);\
}\
\
.s14-check input {\
    width: auto !important;\
    height: auto !important;\
    margin: 0 !important;\
    cursor: pointer;\
}\
\
\
/* ============ HELP ============ */\
.s14-help {\
    padding: 7px 9px;\
    margin-top: 6px;\
    background: var(--ui-bg-subtle, #fafafa);\
    border: 1px solid var(--ui-border-soft, #e5e7eb);\
    border-radius: var(--ui-radius-sm, 7px);\
    font-size: 10.5px;\
    line-height: 1.55;\
    color: var(--ui-text-muted, #555);\
}\
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
    .s14-btn {\
        height: 38px;\
        min-height: 38px;\
        font-size: 12px;\
    }\
\
    .s14-setting select {\
        height: 34px;\
        font-size: 12px;\
    }\
}\
';

        document.head.appendChild(css);
    }

    /* ========================================================
       5. MAP DETECTION
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

    function getMapProjection() {
        if (typeof MAP_PROJECTION !== "undefined" && MAP_PROJECTION) return MAP_PROJECTION;
        var m = getMap();
        if (!m) return CONFIG.mapProjection;
        var p = m.getView().getProjection();
        return p ? p.getCode() : CONFIG.mapProjection;
    }

    /* ========================================================
       6. MATH UTILITIES
       ======================================================== */
    function distance(c1, c2) {
        var p1 = ol.proj.transform(c1, getMapProjection(), CONFIG.dataProjection);
        var p2 = ol.proj.transform(c2, getMapProjection(), CONFIG.dataProjection);
        var dx = p2[0] - p1[0], dy = p2[1] - p1[1];
        return Math.sqrt(dx * dx + dy * dy);
    }

    function polygonArea(coords) {
        if (coords.length < 3) return 0;
        var proj = coords.map(function (c) {
            return ol.proj.transform(c, getMapProjection(), CONFIG.dataProjection);
        });
        var area = 0;
        for (var i = 0; i < proj.length; i++) {
            var j = (i + 1) % proj.length;
            area += proj[i][0] * proj[j][1];
            area -= proj[j][0] * proj[i][1];
        }
        return Math.abs(area / 2);
    }

    function totalLength(pts) {
        var total = 0;
        for (var i = 1; i < pts.length; i++) total += distance(pts[i - 1], pts[i]);
        return total;
    }

    function perimeter(pts) {
        if (pts.length < 3) return 0;
        return totalLength(pts) + distance(pts[pts.length - 1], pts[0]);
    }

    function fmt(v) {
        if (!isFinite(v)) return "0";
        return Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 });
    }

    function convertLength(m) {
        switch (lengthUnit) {
            case "km": return m / 1000;
            case "ft": return m * 3.280839895;
            case "yd": return m * 1.093613298;
            case "mi": return m / 1609.344;
            default: return m;
        }
    }

    function lengthLabel() {
        var map = { km: "km", ft: "ft", yd: "yd", mi: "mi", m: "m" };
        return map[lengthUnit] || "m";
    }

    function convertArea(m2) {
        switch (areaUnit) {
            case "ha": return m2 / 10000;
            case "acre": return m2 / 4046.8564224;
            case "cent": return m2 / 40.468564224;
            case "ft2": return m2 * 10.763910417;
            case "yd2": return m2 * 1.195990046;
            default: return m2;
        }
    }

    function areaLabel() {
        var map = { ha: "ha", acre: "acres", cent: "cents", ft2: "ft²", yd2: "yd²", m2: "m²" };
        return map[areaUnit] || "m²";
    }

    /* ========================================================
       7. STYLES
       ======================================================== */
    function textStyle(text) {
        return new ol.style.Style({
            text: new ol.style.Text({
                text: text, font: "bold 12px Arial",
                fill: new ol.style.Fill({ color: "#000" }),
                stroke: new ol.style.Stroke({ color: "#fff", width: 4 }),
                offsetY: -12, overflow: true
            })
        });
    }

    function segmentStyle(text) {
        return [
            new ol.style.Style({ stroke: new ol.style.Stroke({ color: "#1565c0", width: 3 }) }),
            textStyle(text)
        ];
    }

    function dashedStyle(text) {
        return [
            new ol.style.Style({ stroke: new ol.style.Stroke({ color: "#1565c0", width: 3, lineDash: [10, 8] }) }),
            textStyle(text)
        ];
    }

    function areaStyle(text) {
        return [
            new ol.style.Style({
                fill: new ol.style.Fill({ color: "rgba(30,136,229,0.18)" }),
                stroke: new ol.style.Stroke({ color: "#1565c0", width: 3 })
            }),
            new ol.style.Style({
                text: new ol.style.Text({
                    text: text, font: "bold 13px Arial",
                    fill: new ol.style.Fill({ color: "#000" }),
                    stroke: new ol.style.Stroke({ color: "#fff", width: 5 })
                })
            })
        ];
    }

    function pointStyle() {
        return new ol.style.Style({
            image: new ol.style.Circle({
                radius: 5,
                fill: new ol.style.Fill({ color: "#fff" }),
                stroke: new ol.style.Stroke({ color: "#1565c0", width: 3 })
            })
        });
    }

    function snapVertexStyle() {
        return new ol.style.Style({
            image: new ol.style.Circle({
                radius: 7,
                fill: new ol.style.Fill({ color: "rgba(255,0,0,0.25)" }),
                stroke: new ol.style.Stroke({ color: "#ff0000", width: 3 })
            })
        });
    }

    function snapLineStyle() {
        return new ol.style.Style({
            image: new ol.style.Circle({
                radius: 7,
                fill: new ol.style.Fill({ color: "rgba(0,180,0,0.25)" }),
                stroke: new ol.style.Stroke({ color: "#00a000", width: 3 })
            })
        });
    }

    /* ========================================================
       8. SNAPPING
       ======================================================== */
    function collectVertices(geometry, result) {
        if (!geometry) return;
        var type = geometry.getType();
        var coords = geometry.getCoordinates();
        if (type === "Point") { result.push(coords); return; }
        if (type === "MultiPoint") { coords.forEach(function (c) { result.push(c); }); return; }
        if (type === "LineString") { coords.forEach(function (c) { result.push(c); }); return; }
        if (type === "MultiLineString") { coords.forEach(function (line) { line.forEach(function (c) { result.push(c); }); }); return; }
        if (type === "Polygon") { coords.forEach(function (ring) { ring.forEach(function (c) { result.push(c); }); }); return; }
        if (type === "MultiPolygon") { coords.forEach(function (poly) { poly.forEach(function (ring) { ring.forEach(function (c) { result.push(c); }); }); }); return; }
        if (type === "GeometryCollection") { geometry.getGeometries().forEach(function (g) { collectVertices(g, result); }); }
    }

    function findClosestVertex(pixel) {
        var m = getMap();
        var closest = null, closestDist = Infinity;
        m.getLayers().forEach(function (layer) {
            if (!(layer instanceof ol.layer.Vector)) return;
            if (layer === measureLayer || layer === snapLayer || !layer.getVisible()) return;
            var src = layer.getSource(); if (!src) return;
            src.getFeatures().forEach(function (feature) {
                var verts = []; collectVertices(feature.getGeometry(), verts);
                verts.forEach(function (coord) {
                    var vp = m.getPixelFromCoordinate(coord); if (!vp) return;
                    var d = Math.sqrt(Math.pow(vp[0] - pixel[0], 2) + Math.pow(vp[1] - pixel[1], 2));
                    if (d < closestDist && d <= snapTolerance) { closestDist = d; closest = { coordinate: coord, type: "vertex" }; }
                });
            });
        });
        return closest;
    }

    function findClosestLine(pixel) {
        var m = getMap();
        var coord = m.getCoordinateFromPixel(pixel); if (!coord) return null;
        var closest = null, closestDist = Infinity;
        m.getLayers().forEach(function (layer) {
            if (!(layer instanceof ol.layer.Vector)) return;
            if (layer === measureLayer || layer === snapLayer || !layer.getVisible()) return;
            var src = layer.getSource(); if (!src) return;
            src.getFeatures().forEach(function (feature) {
                var g = feature.getGeometry(); if (!g) return;
                var t = g.getType();
                if (t !== "LineString" && t !== "MultiLineString" && t !== "Polygon" && t !== "MultiPolygon") return;
                var cp = g.getClosestPoint(coord);
                var cpPx = m.getPixelFromCoordinate(cp); if (!cpPx) return;
                var d = Math.sqrt(Math.pow(cpPx[0] - pixel[0], 2) + Math.pow(cpPx[1] - pixel[1], 2));
                if (d < closestDist && d <= snapTolerance) { closestDist = d; closest = { coordinate: cp, type: "line" }; }
            });
        });
        return closest;
    }

    function findSnap(pixel) {
        if (!snapEnabled) return null;
        return findClosestVertex(pixel) || findClosestLine(pixel);
    }

    function updateSnapIndicator(snap) {
        snapSource.clear();
        if (!snap) { currentSnapType = null; return; }
        var f = new ol.Feature({ geometry: new ol.geom.Point(snap.coordinate) });
        f.setStyle(snap.type === "vertex" ? snapVertexStyle() : snapLineStyle());
        snapSource.addFeature(f);
        currentSnapType = snap.type;
    }

    /* ========================================================
       9. DRAWING
       ======================================================== */
    function clearGraphics() { measureSource.clear(); snapSource.clear(); }

    function drawMeasurements() {
        clearGraphics();

        // Segments
        for (var i = 1; i < points.length; i++) {
            var d = distance(points[i - 1], points[i]);
            var text = fmt(convertLength(d)) + " " + lengthLabel();
            var lf = new ol.Feature({ geometry: new ol.geom.LineString([points[i - 1], points[i]]) });
            lf.setStyle(segmentStyle(text));
            measureSource.addFeature(lf);
        }

        // Points
        points.forEach(function (p) {
            var pf = new ol.Feature({ geometry: new ol.geom.Point(p) });
            pf.setStyle(pointStyle());
            measureSource.addFeature(pf);
        });

        // Area (3+ points)
        if (points.length >= 3) {
            var a = polygonArea(points);
            var peri = perimeter(points);
            var aText = "Area: " + fmt(convertArea(a)) + " " + areaLabel() + "\n" +
                "Perimeter: " + fmt(convertLength(peri)) + " " + lengthLabel();
            var ring = points.slice(); ring.push(points[0]);
            var af = new ol.Feature({ geometry: new ol.geom.Polygon([ring]) });
            af.setStyle(areaStyle(aText));
            measureSource.addFeature(af);

            // Closing segment label
            var cd = distance(points[points.length - 1], points[0]);
            var ct = fmt(convertLength(cd)) + " " + lengthLabel();
            var cf = new ol.Feature({ geometry: new ol.geom.LineString([points[points.length - 1], points[0]]) });
            cf.setStyle(segmentStyle(ct));
            measureSource.addFeature(cf);
        }
    }

    function drawPointer() {
        if (!active || !currentPointer || !points.length) return;

        // Remove old temps
        measureSource.getFeatures().forEach(function (f) {
            if (f.get("s14temp")) measureSource.removeFeature(f);
        });

        var last = points[points.length - 1];
        var d = distance(last, currentPointer);
        var text = fmt(convertLength(d)) + " " + lengthLabel();

        var lf = new ol.Feature({ geometry: new ol.geom.LineString([last, currentPointer]) });
        lf.set("s14temp", true);
        lf.setStyle(dashedStyle(text));
        measureSource.addFeature(lf);

        // Dynamic area
        if (points.length >= 2) {
            var dp = points.slice(); dp.push(currentPointer);
            var da = polygonArea(dp);
            var dPeri = perimeter(dp);
            var dText = "Area: " + fmt(convertArea(da)) + " " + areaLabel() + "\n" +
                "Perimeter: " + fmt(convertLength(dPeri)) + " " + lengthLabel();
            var ring = dp.slice(); ring.push(dp[0]);
            var df = new ol.Feature({ geometry: new ol.geom.Polygon([ring]) });
            df.set("s14temp", true);
            df.setStyle(areaStyle(dText));
            measureSource.addFeature(df);
        }
    }

    function redraw() { drawMeasurements(); drawPointer(); }

    /* ========================================================
       10. STATUS
       ======================================================== */
    function updateStatus(custom) {
        var el = document.getElementById("s14-status"); if (!el) return;
        if (custom) { el.textContent = custom; return; }
        if (!active) { el.textContent = "Measure tool ready."; return; }
        if (!points.length) { el.textContent = "Click on the map to start measuring."; return; }
        if (points.length === 1) { el.textContent = "1 point — click next point."; return; }
        var t = totalLength(points);
        var text = points.length + " points | Total: " + fmt(convertLength(t)) + " " + lengthLabel();
        if (points.length >= 3) {
            var a = polygonArea(points);
            text += " | Area: " + fmt(convertArea(a)) + " " + areaLabel();
        }
        el.textContent = text;
    }

    /* ========================================================
       11. START / STOP / UNDO / CLEAR
       ======================================================== */
    function startMeasure() {
        active = true; finished = false; points = []; currentPointer = null;
        window.stage14MeasureActive = true;

        // Close popup
        if (typeof window.closeFeaturePopup === "function") window.closeFeaturePopup();
        else { var p = document.getElementById("feature-info-popup"); if (p) p.style.display = "none"; }

        clearGraphics();
        updateStatus("📐 Measuring — click points on the map.");
        updateButtons();
    }

    function stopMeasure() {
        active = false; finished = true; currentPointer = null;
        snapSource.clear();
        window.stage14MeasureActive = false;
        drawMeasurements();
        updateStatus("Measurement finished.");
        updateButtons();
    }

    function undoPoint() {
        if (!active || !points.length) return;
        points.pop(); currentPointer = null;
        redraw(); updateStatus();
    }

    function clearMeasure() {
        points = []; currentPointer = null;
        clearGraphics(); snapSource.clear();
        updateStatus(active ? "📐 Cleared — click on the map to start." : "Measure tool ready.");
    }

    function updateButtons() {
        var startBtn = document.getElementById("s14-start-btn");
        if (!startBtn) return;
        if (active) {
            startBtn.textContent = "⏹ Stop";
            startBtn.classList.add("active");
            startBtn.classList.remove("primary");
        } else {
            startBtn.textContent = "📐 Measure";
            startBtn.classList.remove("active");
            startBtn.classList.add("primary");
        }
    }

    /* ========================================================
       12. PANEL POSITIONING  ★ Bypasses all !important locks
       ======================================================== */
    function positionPanel() {
        if (!panel || !button || !panelOpen) return;
        var pad = 8, vw = window.innerWidth, vh = window.innerHeight;
        var b = button.getBoundingClientRect();

        // Mobile → centered floating card (constrained to max 300px wide)
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
        var ph = panel.offsetHeight || 450;
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
       13. OPEN / CLOSE
       ======================================================== */
    function openPanel() {
        if (!panel) createPanel();
        panelOpen = true;
        panel.classList.add("s14-visible");
        if (button) button.classList.add("active");
        requestAnimationFrame(function () { requestAnimationFrame(positionPanel); });
    }

    function closePanel() {
        panelOpen = false;
        if (panel) panel.classList.remove("s14-visible");
        if (button && !active) button.classList.remove("active");
    }

    function togglePanel() { panelOpen ? closePanel() : openPanel(); }

    /* ========================================================
       14. BUILD BUTTON
       ======================================================== */
    function createButton() {
        var existing = document.getElementById(CONFIG.buttonId);
        if (existing) { button = existing; return; }

        button = document.createElement("button");
        button.id = CONFIG.buttonId;
        button.type = "button";
        button.title = "Advanced Measure Tool";
        button.textContent = "📐";

        button.addEventListener("click", function (e) {
            e.preventDefault(); e.stopPropagation();
            if (document.body.classList.contains("drag-edit-mode")) return;
            togglePanel();
        });

        document.body.appendChild(button);
    }

    /* ========================================================
       15. BUILD PANEL
       ======================================================== */
    function createPanel() {
        var existing = document.getElementById(CONFIG.panelId);
        if (existing) { panel = existing; return; }

        panel = document.createElement("div");
        panel.id = CONFIG.panelId;

        panel.innerHTML =
'<div class="s14-head">' +
'  <div><div class="s14-title">📐 Advanced Measure</div>' +
'  <div class="s14-subtitle">Length · Area · Snapping</div></div>' +
'  <button type="button" class="s14-close" id="s14-close-btn">×</button>' +
'</div>' +
'<div class="s14-body">' +

'  <div class="s14-status" id="s14-status">Measure tool ready.</div>' +

'  <div class="s14-row">' +
'    <button type="button" class="s14-btn primary" id="s14-start-btn">📐 Measure</button>' +
'    <button type="button" class="s14-btn" id="s14-undo-btn">↩️ Undo</button>' +
'  </div>' +

'  <div class="s14-row">' +
'    <button type="button" class="s14-btn" id="s14-finish-btn">✅ Finish</button>' +
'    <button type="button" class="s14-btn danger" id="s14-clear-btn">🗑 Clear</button>' +
'  </div>' +

'  <div class="s14-sec">⚙️ Units</div>' +

'  <div class="s14-setting">' +
'    <label>Length</label>' +
'    <select id="s14-length-unit">' +
'      <option value="m">Metres (m)</option>' +
'      <option value="km">Kilometres (km)</option>' +
'      <option value="ft">Feet (ft)</option>' +
'      <option value="yd">Yards (yd)</option>' +
'      <option value="mi">Miles (mi)</option>' +
'    </select>' +
'  </div>' +

'  <div class="s14-setting">' +
'    <label>Area</label>' +
'    <select id="s14-area-unit">' +
'      <option value="m2">Square metres (m²)</option>' +
'      <option value="ha">Hectares (ha)</option>' +
'      <option value="acre">Acres</option>' +
'      <option value="cent">Cents</option>' +
'      <option value="ft2">Square feet (ft²)</option>' +
'      <option value="yd2">Square yards (yd²)</option>' +
'    </select>' +
'  </div>' +

'  <div class="s14-sec">🎯 Snapping</div>' +

'  <div class="s14-setting">' +
'    <label class="s14-check">' +
'      <input type="checkbox" id="s14-snap-toggle" checked>' +
'      <span>Enable vertex &amp; line snapping</span>' +
'    </label>' +
'  </div>' +

'  <div class="s14-setting">' +
'    <label>Snap tolerance: <span id="s14-tol-val">' + CONFIG.defaultSnapTolerance + '</span> px</label>' +
'    <input type="range" id="s14-tol-slider" min="5" max="50" value="' + CONFIG.defaultSnapTolerance + '">' +
'  </div>' +

'  <div class="s14-help">' +
'    <b>How to use:</b><br>' +
'    1. Click <b>Measure</b><br>' +
'    2. Click points on the map<br>' +
'    3. Segment lengths appear instantly<br>' +
'    4. From 3 points, area + perimeter appear<br>' +
'    5. Use <b>Undo</b> to remove the last point<br>' +
'    6. Click <b>Finish</b> when done' +
'  </div>' +

'</div>';

        document.body.appendChild(panel);
        bindPanelEvents();
    }

    /* ========================================================
       16. PANEL EVENTS
       ======================================================== */
    function bindPanelEvents() {
        document.getElementById("s14-close-btn").onclick = closePanel;

        document.getElementById("s14-start-btn").onclick = function (e) {
            e.preventDefault(); e.stopPropagation();
            active ? stopMeasure() : startMeasure();
        };

        document.getElementById("s14-undo-btn").onclick = function (e) {
            e.preventDefault(); e.stopPropagation();
            undoPoint();
        };

        document.getElementById("s14-finish-btn").onclick = function (e) {
            e.preventDefault(); e.stopPropagation();
            if (active) stopMeasure();
        };

        document.getElementById("s14-clear-btn").onclick = function (e) {
            e.preventDefault(); e.stopPropagation();
            clearMeasure();
        };

        document.getElementById("s14-length-unit").onchange = function () {
            lengthUnit = this.value; redraw(); updateStatus();
        };

        document.getElementById("s14-area-unit").onchange = function () {
            areaUnit = this.value; redraw(); updateStatus();
        };

        document.getElementById("s14-snap-toggle").onchange = function () {
            snapEnabled = this.checked;
            snapSource.clear();
            if (!snapEnabled) currentSnapType = null;
        };

        document.getElementById("s14-tol-slider").oninput = function () {
            snapTolerance = Number(this.value);
            document.getElementById("s14-tol-val").textContent = this.value;
        };

        panel.addEventListener("click", function (e) { e.stopPropagation(); });
    }

    /* ========================================================
       17. MAP EVENTS
       ======================================================== */
    function bindMapEvents() {
        var m = getMap();

        m.on("pointermove", function (evt) {
            if (!active || evt.dragging) return;
            currentPointer = m.getCoordinateFromPixel(evt.pixel);
            if (snapEnabled) {
                var snap = findSnap(evt.pixel);
                updateSnapIndicator(snap);
                if (snap) currentPointer = snap.coordinate;
            } else { snapSource.clear(); }
            redraw();
        });

        m.on("singleclick", function (evt) {
            if (!active) return;
            window.stage14MeasureActive = true;

            var coord = evt.coordinate;
            if (snapEnabled) {
                var snap = findSnap(evt.pixel);
                if (snap) coord = snap.coordinate;
            }

            points.push(coord);
            currentPointer = null;
            redraw(); updateStatus();

            if (evt.originalEvent) {
                evt.originalEvent.preventDefault();
                evt.originalEvent.stopPropagation();
            }
        });
    }

    /* ========================================================
       18. GLOBAL EVENTS
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
            if (e.key === "Escape") {
                if (active) stopMeasure();
                if (panelOpen) closePanel();
            }
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
       19. LAYERS
       ======================================================== */
    function createLayers() {
        var m = getMap();
        measureLayer = new ol.layer.Vector({ source: measureSource, zIndex: 15000 });
        snapLayer = new ol.layer.Vector({ source: snapSource, zIndex: 16000 });
        measureLayer.set("__s14internal", true);
        snapLayer.set("__s14internal", true);
        m.addLayer(measureLayer);
        m.addLayer(snapLayer);

        // Expose for Stage 5 popup suppression
        window.stage14MeasureLayer = measureLayer;
        window.stage14SnapLayer = snapLayer;
    }

    /* ========================================================
       20. PUBLIC API
       ======================================================== */
    window.Stage14Measure = {
        open: openPanel,
        close: closePanel,
        toggle: togglePanel,
        start: startMeasure,
        stop: stopMeasure,
        clear: clearMeasure,
        isActive: function () { return active; }
    };

    /* ========================================================
       21. INITIALIZE
       ======================================================== */
    function initialize() {
        injectCSS();
        createButton();
        createPanel();
        closePanel();

        registerWithToolManager();
        bindGlobalEvents();

        // Wait for map
        var tries = 0;
        (function waitForMap() {
            if (getMap()) {
                createLayers();
                bindMapEvents();
                console.log("📐 Stage 14 v2.3 — Advanced Measure Tool READY.");
                return;
            }
            if (++tries > 50) { console.error("📐 Stage 14: map not found."); return; }
            setTimeout(waitForMap, 300);
        })();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize);
    } else {
        initialize();
    }

})();