// ============================================================
// 📤 STAGE 17 — ADVANCED EXPORT TOOL  (v4.4 - NATIVE SHP WITH UTF-8 & FIXED DXF)
// ============================================================
// QGIS2WEB + OPENLAYERS  —  SINGLE FILE, DROP-IN
//
// EXPORT FORMATS
//   GeoJSON · JSON · CSV · WKT · KML · KMZ · DXF · Shapefile ZIP
//
// SELECTION ENGINE
//   • Single click = SELECT / UNSELECT (toggle)
//   • Clicking another polygon = ADDS to current selection
//   • Shift + Drag = Box select
//   • Works on UNFILLED / transparent polygons
//
// LAYER STYLING
//   • Preserves original fill, stroke, width, colors, & opacity
//   • Written to KML/KMZ Styles, GeoJSON simplestyle, DXF ACI colours
//
// POPUP MANAGEMENT
//   • Automatically disables popups while the tool is OPEN
//   • Fully restores popups when the tool is CLOSED
//
// LABEL POINTS
//   • Invisible centroid point (KML/KMZ/GeoJSON/SHP)
//   • TEXT entity at interior point (DXF)
//
// SAFE
//   • Never modifies original layers or geometries
//   • Highlight layer is UNMANAGED → never in layer switcher
// ============================================================

(function () {
    "use strict";

    /* ========================================================
       1. CONFIGURATION
       ======================================================== */
    var CONFIG = {
        buttonId: "stage17-export-button",
        panelId: "stage17-export-panel",
        areaDecimals: 3,
        coordDecimals: 7,
        hitTolerance: 10,
        zIndex: 10001,
        jszipCDN: [
            "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js",
            "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"
        ]
    };

    if (typeof ol === "undefined") {
        console.error("Stage 17: OpenLayers (ol) not found.");
        return;
    }

    /* ========================================================
       2. STATE
       ======================================================== */
    var S = {
        map: null,
        currentLayer: null,
        selection: [],
        selectActive: false,
        highlightLayer: null,
        dragBox: null,
        clickKey: null,
        exportMode: "all",
        exportFormat: "GeoJSON",
        exportCRS: "current"
    };

    /* ========================================================
       3. MAP DETECTION
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
       4. LAYER HELPERS
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
       5. POPUP SUPPRESSION & RESTORATION
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
        var p = document.getElementById(CONFIG.panelId);
        var open = p && p.style.display === "block";
        if (open || S.selectActive) suppressPopups(); else restorePopups();
    }

    /* ========================================================
       6. SELECTION ENGINE
       ======================================================== */
    function highlightStyle(feature) {
        var t = feature.getGeometry() ? feature.getGeometry().getType() : "";
        var styles = [
            new ol.style.Style({
                fill: new ol.style.Fill({ color: "rgba(255, 215, 0, 0.40)" }),
                stroke: new ol.style.Stroke({ color: "#ff1100", width: 3.5 }),
                image: new ol.style.Circle({
                    radius: 8,
                    fill: new ol.style.Fill({ color: "rgba(255, 215, 0, 0.8)" }),
                    stroke: new ol.style.Stroke({ color: "#ff1100", width: 2.5 })
                }),
                zIndex: 9999
            })
        ];
        if (t === "LineString" || t === "MultiLineString") {
            styles.unshift(new ol.style.Style({
                stroke: new ol.style.Stroke({ color: "rgba(255, 255, 255, 0.9)", width: 8 }),
                zIndex: 9998
            }));
        }
        return styles;
    }

    function ensureHighlightLayer() {
        var m = getMap();
        if (!m) return null;
        if (S.highlightLayer) return S.highlightLayer;
        S.highlightLayer = new ol.layer.Vector({
            source: new ol.source.Vector(),
            map: m,
            style: highlightStyle,
            zIndex: 999999,
            updateWhileAnimating: true,
            updateWhileInteracting: true
        });
        S.highlightLayer.set("__s17internal", true);
        return S.highlightLayer;
    }

    function refreshHighlight() {
        var hl = ensureHighlightLayer();
        if (!hl) return;
        var src = hl.getSource();
        src.clear();
        for (var i = 0; i < S.selection.length; i++) {
            var g = S.selection[i].getGeometry();
            if (!g) continue;
            src.addFeature(new ol.Feature({ geometry: g.clone() }));
        }
        updateSelectionUI();
    }

    function featuresAtPixel(pixel, restrictLayer) {
        var m = getMap();
        var found = [], seen = [];

        function push(f, l) {
            if (!f || seen.indexOf(f) !== -1) return;
            seen.push(f);
            found.push({ feature: f, layer: l });
        }

        m.forEachFeatureAtPixel(pixel, function (feature, layer) {
            if (!layer || layer === S.highlightLayer) return;
            if (restrictLayer && layer !== restrictLayer) return;
            if (!(feature instanceof ol.Feature)) return;
            push(feature, layer);
        }, {
            hitTolerance: CONFIG.hitTolerance,
            layerFilter: function (l) { return l !== S.highlightLayer && !l.get("__s17internal"); }
        });

        if (found.length) return found;

        var coord = m.getCoordinateFromPixel(pixel);
        var res = m.getView().getResolution();
        var tol = CONFIG.hitTolerance * res;
        var layers = restrictLayer ? [restrictLayer] : vectorLayers();

        for (var li = 0; li < layers.length; li++) {
            var layer = layers[li];
            if (layer.getVisible && !layer.getVisible()) continue;
            var src = layer.getSource();
            if (!src) continue;
            var bbox = [coord[0] - tol, coord[1] - tol, coord[0] + tol, coord[1] + tol];
            var candidates = [];
            if (typeof src.forEachFeatureIntersectingExtent === "function") {
                src.forEachFeatureIntersectingExtent(bbox, function (f) { candidates.push(f); });
            } else { candidates = src.getFeatures(); }

            for (var ci = 0; ci < candidates.length; ci++) {
                var f = candidates[ci], g = f.getGeometry();
                if (!g) continue;
                var type = g.getType();
                if (type === "Polygon" || type === "MultiPolygon") {
                    if (g.intersectsCoordinate(coord)) push(f, layer);
                } else {
                    var cp = g.getClosestPoint(coord);
                    if (Math.sqrt(Math.pow(cp[0] - coord[0], 2) + Math.pow(cp[1] - coord[1], 2)) <= tol) push(f, layer);
                }
            }
            if (found.length) break;
        }
        return found;
    }

    function onMapClick(evt) {
        if (!S.selectActive) return;
        var hits = featuresAtPixel(evt.pixel, null);
        if (!hits.length) return;

        var hit = hits[0];
        var wasEmpty = (S.selection.length === 0);

        if (wasEmpty && hit.layer && hit.layer !== S.currentLayer) {
            S.currentLayer = hit.layer;
            var sel = document.getElementById("s17-layer");
            if (sel) sel.value = layerId(hit.layer);
            refreshFields();
        }

        var idx = S.selection.indexOf(hit.feature);
        if (idx === -1) S.selection.push(hit.feature);
        else S.selection.splice(idx, 1);

        if (S.selection.length) {
            S.exportMode = "selected";
            var mSel = document.getElementById("s17-mode");
            if (mSel) mSel.value = "selected";
        }
        refreshHighlight();
        if (evt.stopPropagation) evt.stopPropagation();
        if (evt.preventDefault) evt.preventDefault();
    }
    onMapClick.__s17own = true;

    function selectByExtent(extent, additive) {
        var layers = S.currentLayer ? [S.currentLayer] : vectorLayers();
        if (!additive) S.selection = [];
        for (var i = 0; i < layers.length; i++) {
            var src = layers[i].getSource();
            if (!src) continue;
            src.forEachFeatureIntersectingExtent(extent, function (f) {
                var g = f.getGeometry();
                if (!g) return;
                if (typeof g.intersectsExtent === "function" && !g.intersectsExtent(extent)) return;
                if (S.selection.indexOf(f) === -1) S.selection.push(f);
            });
        }
        refreshHighlight();
    }

    function enableSelection() {
        var m = getMap();
        if (!m || S.selectActive) return;
        S.selectActive = true;
        ensureHighlightLayer();
        syncPopups();
        S.clickKey = m.on("singleclick", onMapClick);

        if (!S.dragBox) {
            S.dragBox = new ol.interaction.DragBox({
                condition: ol.events.condition.shiftKeyOnly,
                className: "s17-dragbox"
            });
            S.dragBox.on("boxend", function () {
                selectByExtent(S.dragBox.getGeometry().getExtent(), true);
                S.exportMode = "selected";
                var el = document.getElementById("s17-mode");
                if (el) el.value = "selected";
            });
        }
        m.addInteraction(S.dragBox);
        m.getTargetElement().style.cursor = "crosshair";
        updateSelectionUI();
    }

    function disableSelection() {
        var m = getMap();
        if (!m || !S.selectActive) return;
        S.selectActive = false;
        if (S.clickKey) { ol.Observable.unByKey(S.clickKey); S.clickKey = null; }
        if (S.dragBox) m.removeInteraction(S.dragBox);
        m.getTargetElement().style.cursor = "";
        syncPopups();
        updateSelectionUI();
    }

    function toggleSelection() { S.selectActive ? disableSelection() : enableSelection(); }
    function clearSelection() { S.selection = []; refreshHighlight(); }

    function externalSelection() {
        var m = getMap(), out = [];
        if (!m) return out;
        m.getInteractions().forEach(function (it) {
            if (it instanceof ol.interaction.Select) {
                var c = it.getFeatures();
                if (c && c.getArray) c.getArray().forEach(function (f) { if (out.indexOf(f) === -1) out.push(f); });
            }
        });
        var globals = ["selectedFeatures", "selectedFeature", "highlightedFeatures"];
        for (var i = 0; i < globals.length; i++) {
            var g = window[globals[i]];
            if (!g) continue;
            if (g instanceof ol.Feature) { if (out.indexOf(g) === -1) out.push(g); continue; }
            if (g && typeof g.getArray === "function") g = g.getArray();
            if (Array.isArray(g)) g.forEach(function (f) { if (f instanceof ol.Feature && out.indexOf(f) === -1) out.push(f); });
        }
        return out;
    }

    function selectedForCurrentLayer() {
        if (!S.currentLayer) return [];
        var src = S.currentLayer.getSource();
        if (!src) return [];
        var all = src.getFeatures();
        var pool = S.selection.slice();
        externalSelection().forEach(function (f) { if (pool.indexOf(f) === -1) pool.push(f); });
        all.forEach(function (f) {
            if ((f.get("__selected") === true || f.get("selected") === true || f.get("_selected") === true) && pool.indexOf(f) === -1) pool.push(f);
        });
        return pool.filter(function (f) { return all.indexOf(f) !== -1; });
    }

    /* ========================================================
       7. GEOMETRY / MEASUREMENT HELPERS
       ======================================================== */
    function transformGeom(geom, from, to) {
        if (!geom) return null;
        var c = geom.clone();
        if (from === to) return c;
        try { c.transform(from, to); } catch (e) { console.warn("Stage 17: transform " + from + "→" + to + " failed", e); }
        return c;
    }

    function geodesicArea(geom, from) {
        var t = geom.getType();
        if (t !== "Polygon" && t !== "MultiPolygon") return null;
        try { return ol.sphere.getArea(transformGeom(geom, from, "EPSG:4326"), { projection: "EPSG:4326" }); } catch (e) { return null; }
    }

    function geodesicLength(geom, from) {
        var t = geom.getType();
        if (["Polygon", "MultiPolygon", "LineString", "MultiLineString"].indexOf(t) === -1) return null;
        try { return ol.sphere.getLength(transformGeom(geom, from, "EPSG:4326"), { projection: "EPSG:4326" }); } catch (e) { return null; }
    }

    function labelPointOf(geom) {
        if (!geom) return null;
        var t = geom.getType();
        try {
            if (t === "Polygon") return geom.getInteriorPoint().getCoordinates().slice(0, 2);
            if (t === "MultiPolygon") {
                var polys = geom.getPolygons(), best = null, bestA = -1;
                for (var i = 0; i < polys.length; i++) { var a = polys[i].getArea(); if (a > bestA) { bestA = a; best = polys[i]; } }
                if (best) return best.getInteriorPoint().getCoordinates().slice(0, 2);
            }
            if (t === "Point") return geom.getCoordinates().slice(0, 2);
            if (t === "MultiPoint") return geom.getPoint(0).getCoordinates().slice(0, 2);
            if (t === "LineString") return geom.getCoordinateAt(0.5).slice(0, 2);
            if (t === "MultiLineString") return geom.getLineString(0).getCoordinateAt(0.5).slice(0, 2);
        } catch (e) {}
        var e2 = geom.getExtent();
        return [(e2[0] + e2[2]) / 2, (e2[1] + e2[3]) / 2];
    }

    function areaBreakdown(m2) {
        if (m2 === null || m2 === undefined || isNaN(m2)) return {};
        var d = CONFIG.areaDecimals;
        return {
            Area_m2: +(m2).toFixed(d), Area_ha: +(m2 / 10000).toFixed(d),
            Area_acre: +(m2 / 4046.8564224).toFixed(d), Area_cent: +(m2 / 40.468564224).toFixed(d),
            Area_sqft: +(m2 * 10.763910417).toFixed(d)
        };
    }

    function num(v, d) {
        if (v === null || v === undefined || v === "" || isNaN(v)) return "";
        return +Number(v).toFixed(d === undefined ? CONFIG.coordDecimals : d);
    }

    /* ========================================================
       8. LAYER STYLE EXTRACTION ENGINE
       ======================================================== */
    var _colorCanvas = null;

    function parseColor(c) {
        if (c === null || c === undefined) return null;
        try {
            if (Array.isArray(c)) return { r: c[0] | 0, g: c[1] | 0, b: c[2] | 0, a: (c.length > 3 ? c[3] : 1) };
            if (typeof c === "string") {
                if (ol.color && typeof ol.color.asArray === "function") {
                    var a = ol.color.asArray(c);
                    return { r: a[0], g: a[1], b: a[2], a: (a.length > 3 ? a[3] : 1) };
                }
                if (!_colorCanvas) { _colorCanvas = document.createElement("canvas"); _colorCanvas.width = _colorCanvas.height = 1; }
                var ctx = _colorCanvas.getContext("2d");
                ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = "#000000"; ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1);
                var d = ctx.getImageData(0, 0, 1, 1).data;
                return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
            }
        } catch (e) {}
        return null;
    }

    function hx(n) { n = Math.max(0, Math.min(255, Math.round(n || 0))); return (n < 16 ? "0" : "") + n.toString(16); }
    function partsToHex(p) { return p ? "#" + hx(p.r) + hx(p.g) + hx(p.b) : null; }

    function partsToKml(p, mul) {
        if (!p) return "ff000000";
        var a = Math.round(Math.max(0, Math.min(1, (p.a === undefined ? 1 : p.a) * (mul === undefined ? 1 : mul))) * 255);
        return (hx(a) + hx(p.b) + hx(p.g) + hx(p.r)).toLowerCase();
    }

    function resolveStyles(feature, layer, res) {
        var s = null;
        try {
            var fsf = feature.getStyleFunction && feature.getStyleFunction();
            if (fsf) s = fsf(feature, res);
            if (!s) { var fs = feature.getStyle && feature.getStyle(); if (fs) s = (typeof fs === "function") ? fs(feature, res) : fs; }
        } catch (e) {}
        if (!s && layer) {
            try {
                var lsf = layer.getStyleFunction && layer.getStyleFunction();
                if (lsf) s = lsf(feature, res);
                if (!s) { var lst = layer.getStyle && layer.getStyle(); if (lst) s = (typeof lst === "function") ? lst(feature, res) : lst; }
            } catch (e) {}
        }
        if (!s) return null;
        return Array.isArray(s) ? s : [s];
    }

    function extractSymbol(feature, layer, res) {
        var styles = resolveStyles(feature, layer, res);
        if (!styles || !styles.length) return null;
        var sym = {
            fill: null, stroke: null, width: null, radius: null,
            icon: null, iconScale: 1, textColor: null, textScale: 1, text: "",
            opacity: (layer && layer.getOpacity) ? layer.getOpacity() : 1
        };
        for (var i = 0; i < styles.length; i++) {
            var st = styles[i]; if (!st) continue;
            try {
                var f = st.getFill && st.getFill();
                if (f && !sym.fill) { var c = parseColor(f.getColor()); if (c) sym.fill = c; }
                var s2 = st.getStroke && st.getStroke();
                if (s2 && !sym.stroke) { var c2 = parseColor(s2.getColor()); if (c2) { sym.stroke = c2; sym.width = s2.getWidth() || 1; } }
                var im = st.getImage && st.getImage();
                if (im && !sym.icon && sym.radius === null) {
                    if (typeof im.getSrc === "function" && im.getSrc()) { sym.icon = im.getSrc(); sym.iconScale = im.getScale() || 1; }
                    else if (typeof im.getRadius === "function") {
                        sym.radius = im.getRadius() || 5;
                        var iF = im.getFill && im.getFill(); if (iF) { var c3 = parseColor(iF.getColor()); if (c3 && !sym.fill) sym.fill = c3; }
                        var iS = im.getStroke && im.getStroke(); if (iS) { var c4 = parseColor(iS.getColor()); if (c4 && !sym.stroke) { sym.stroke = c4; sym.width = iS.getWidth() || 1; } }
                    }
                }
                var tx = st.getText && st.getText();
                if (tx) {
                    var tf = tx.getFill && tx.getFill(); if (tf) { var c5 = parseColor(tf.getColor()); if (c5) sym.textColor = c5; }
                    sym.textScale = (typeof tx.getScale === "function") ? (tx.getScale() || 1) : 1;
                    sym.text = (typeof tx.getText === "function") ? (tx.getText() || "") : "";
                }
            } catch (e) {}
        }
        if (!sym.fill && !sym.stroke && !sym.icon && sym.radius === null) return null;
        return sym;
    }

    function symKey(sym, kind) {
        if (!sym) return kind + "|default";
        return [kind, partsToHex(sym.fill), sym.fill ? sym.fill.a : "",
                partsToHex(sym.stroke), sym.stroke ? sym.stroke.a : "",
                sym.width, sym.radius, sym.icon, sym.iconScale, sym.opacity].join("|");
    }

    /* ========================================================
       9. RECORD BUILDER
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

            var labelText = "";
            if (sym && sym.text) labelText = String(sym.text);
            if (!labelText) {
                var pref = ["name", "Name", "NAME", "label", "Label", "id", "ID", "survey_no", "plot_no", "lpm_no", "title"];
                for (var pi = 0; pi < pref.length; pi++) {
                    if (props[pref[pi]] !== undefined && props[pref[pi]] !== null && props[pref[pi]] !== "") { labelText = String(props[pref[pi]]); break; }
                }
            }
            if (!labelText) labelText = "F" + rec.Export_ID;

            if (wantLabels && lblTgt) { rec.Label = labelText; rec.Label_X = num(lblTgt[0]); rec.Label_Y = num(lblTgt[1]); }

            records.push({
                srcGeom: geomSrc, geometry: geomOut, labelMap: lblMap, labelTgt: lblTgt,
                labelText: labelText, geomType: type, style: sym, properties: rec
            });
        }
        return records;
    }

    /* ========================================================
       10. FILE DOWNLOAD HELPERS
       ======================================================== */
    function downloadBlob(blob, filename) {
        if (typeof blob === "string") {
            try { var bin = atob(blob), arr = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); blob = new Blob([arr], { type: "application/zip" }); }
            catch (e) { blob = new Blob([blob], { type: "application/octet-stream" }); }
        }
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url; a.download = filename; a.style.display = "none";
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
    }

    function downloadText(text, filename, mime) {
        downloadBlob(new Blob([text], { type: mime + ";charset=utf-8" }), filename);
    }

    function loadScript(urls, globalName) {
        return new Promise(function (resolve, reject) {
            if (window[globalName]) return resolve(window[globalName]);
            var i = 0;
            (function next() {
                if (i >= urls.length) return reject(new Error("Could not load " + globalName));
                var s = document.createElement("script");
                s.src = urls[i++]; s.async = true;
                s.onload = function () { window[globalName] ? resolve(window[globalName]) : next(); };
                s.onerror = next;
                document.head.appendChild(s);
            })();
        });
    }

    function baseName() {
        var n = S.currentLayer ? layerName(S.currentLayer) : "export";
        return n.replace(/[^a-zA-Z0-9_\-]/g, "_").substring(0, 45) || "export";
    }

    /* ========================================================
       11. EXPORTERS — GeoJSON / JSON / CSV / WKT
       ======================================================== */
    function applySimpleStyle(f, sym) {
        if (!sym) return;
        var op = sym.opacity === undefined ? 1 : sym.opacity;
        if (sym.fill) { f.set("fill", partsToHex(sym.fill)); f.set("fill-opacity", +((sym.fill.a === undefined ? 1 : sym.fill.a) * op).toFixed(3)); f.set("marker-color", partsToHex(sym.fill)); }
        if (sym.stroke) { f.set("stroke", partsToHex(sym.stroke)); f.set("stroke-opacity", +((sym.stroke.a === undefined ? 1 : sym.stroke.a) * op).toFixed(3)); f.set("stroke-width", sym.width || 1); }
        if (sym.radius) f.set("marker-radius", sym.radius);
    }

    function recordsToOlFeatures(records, includeLabels, keepStyle) {
        var out = [];
        for (var i = 0; i < records.length; i++) {
            var r = records[i], f = new ol.Feature({ geometry: r.geometry.clone() });
            for (var k in r.properties) if (r.properties.hasOwnProperty(k)) f.set(k, r.properties[k]);
            if (keepStyle) applySimpleStyle(f, r.style);
            out.push(f);
        }
        if (includeLabels) {
            for (var j = 0; j < records.length; j++) {
                var rr = records[j]; if (!rr.labelTgt) continue;
                var lf = new ol.Feature({ geometry: new ol.geom.Point(rr.labelTgt) });
                lf.set("Export_ID", rr.properties.Export_ID); lf.set("Label", rr.labelText);
                lf.set("FeatureType", "LABEL_POINT"); lf.set("marker-opacity", 0);
                out.push(lf);
            }
        }
        return out;
    }

    function exportGeoJSON(records, tCRS) {
        var fmt = new ol.format.GeoJSON();
        var feats = recordsToOlFeatures(records, checked("s17-labels"), checked("s17-style"));
        var gj = fmt.writeFeaturesObject(feats, { featureProjection: tCRS, dataProjection: tCRS, decimals: CONFIG.coordDecimals });
        gj.crs = { type: "name", properties: { name: tCRS } };
        downloadText(JSON.stringify(gj, null, 2), baseName() + ".geojson", "application/geo+json");
    }

    function exportJSON(records, tCRS) {
        var out = {
            type: "Stage17Export", crs: tCRS, exported: new Date().toISOString(),
            layer: S.currentLayer ? layerName(S.currentLayer) : "", count: records.length,
            features: records.map(function (r) {
                return { geometryType: r.geomType, coordinates: r.geometry.getCoordinates(), labelPoint: r.labelTgt, label: r.labelText,
                    style: r.style ? { fill: partsToHex(r.style.fill), fillOpacity: r.style.fill ? r.style.fill.a : null, stroke: partsToHex(r.style.stroke), strokeOpacity: r.style.stroke ? r.style.stroke.a : null, strokeWidth: r.style.width } : null,
                    properties: r.properties };
            })
        };
        downloadText(JSON.stringify(out, null, 2), baseName() + ".json", "application/json");
    }

    function csvCell(v) { if (v === null || v === undefined) return ""; var t = String(v); if (/[",\r\n;]/.test(t)) t = '"' + t.replace(/"/g, '""') + '"'; return t; }

    function allKeys(records) { var set = {}, order = []; records.forEach(function (r) { Object.keys(r.properties).forEach(function (k) { if (!set[k]) { set[k] = 1; order.push(k); } }); }); return order; }

    function exportCSV(records) {
        var keys = allKeys(records), lines = [keys.map(csvCell).join(",")];
        records.forEach(function (r) { lines.push(keys.map(function (k) { return csvCell(r.properties[k]); }).join(",")); });
        downloadText("\uFEFF" + lines.join("\r\n"), baseName() + ".csv", "text/csv");
    }

    function exportWKT(records) {
        var fmt = new ol.format.WKT(), keys = allKeys(records);
        var lines = [["WKT"].concat(keys).map(csvCell).join(",")];
        records.forEach(function (r) { var row = [csvCell(fmt.writeGeometry(r.geometry))]; keys.forEach(function (k) { row.push(csvCell(r.properties[k])); }); lines.push(row.join(",")); });
        downloadText("\uFEFF" + lines.join("\r\n"), baseName() + "_wkt.csv", "text/csv");
    }

    /* ========================================================
       12. KML / KMZ
       ======================================================== */
    function xmlEsc(s) { return String(s === null || s === undefined ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;"); }
    function kmlCoord(c) { return Number(c[0]).toFixed(CONFIG.coordDecimals) + "," + Number(c[1]).toFixed(CONFIG.coordDecimals) + "," + ((c.length > 2 && !isNaN(c[2])) ? Number(c[2]).toFixed(2) : "0"); }
    function kmlCoordList(arr) { var o = []; for (var i = 0; i < arr.length; i++) o.push(kmlCoord(arr[i])); return o.join(" "); }
    function kmlRing(ring) { return "<LinearRing><coordinates>" + kmlCoordList(ring) + "</coordinates></LinearRing>"; }

    function kmlPolygonBody(rings) {
        var s = "<Polygon><tessellate>1</tessellate><altitudeMode>clampToGround</altitudeMode>";
        s += "<outerBoundaryIs>" + kmlRing(rings[0]) + "</outerBoundaryIs>";
        for (var i = 1; i < rings.length; i++) s += "<innerBoundaryIs>" + kmlRing(rings[i]) + "</innerBoundaryIs>";
        return s + "</Polygon>";
    }

    function geomToKML(g) {
        var t = g.getType(), parts;
        switch (t) {
            case "Point": return "<Point><altitudeMode>clampToGround</altitudeMode><coordinates>" + kmlCoord(g.getCoordinates()) + "</coordinates></Point>";
            case "LineString": return "<LineString><tessellate>1</tessellate><altitudeMode>clampToGround</altitudeMode><coordinates>" + kmlCoordList(g.getCoordinates()) + "</coordinates></LineString>";
            case "LinearRing": return kmlRing(g.getCoordinates());
            case "Polygon": return kmlPolygonBody(g.getCoordinates());
            case "MultiPoint": parts = g.getCoordinates().map(function (c) { return "<Point><coordinates>" + kmlCoord(c) + "</coordinates></Point>"; }); return "<MultiGeometry>" + parts.join("") + "</MultiGeometry>";
            case "MultiLineString": parts = g.getCoordinates().map(function (ls) { return "<LineString><tessellate>1</tessellate><coordinates>" + kmlCoordList(ls) + "</coordinates></LineString>"; }); return "<MultiGeometry>" + parts.join("") + "</MultiGeometry>";
            case "MultiPolygon": parts = g.getCoordinates().map(function (rings) { return kmlPolygonBody(rings); }); return "<MultiGeometry>" + parts.join("") + "</MultiGeometry>";
            case "GeometryCollection": return "<MultiGeometry>" + g.getGeometries().map(geomToKML).join("") + "</MultiGeometry>";
            default: return "";
        }
    }

    function kmlExtendedData(props) { var s = "<ExtendedData>"; for (var k in props) { if (!props.hasOwnProperty(k)) continue; s += '<Data name="' + xmlEsc(k) + '"><value>' + xmlEsc(props[k]) + "</value></Data>"; } return s + "</ExtendedData>"; }

    function kmlDescription(props) {
        var rows = "";
        for (var k in props) { if (!props.hasOwnProperty(k)) continue; rows += '<tr><td style="padding:2px 8px;background:#f0f0f0;"><b>' + xmlEsc(k) + '</b></td><td style="padding:2px 8px;">' + xmlEsc(props[k]) + "</td></tr>"; }
        return "<![CDATA[<table style='border-collapse:collapse;font-family:Arial;font-size:12px;'>" + rows + "</table>]]>";
    }

    function kmlColor(hex, alpha) {
        hex = (hex || "#ffff00").replace("#", "");
        if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
        var r = hex.substr(0, 2), g = hex.substr(2, 2), b = hex.substr(4, 2);
        var a = hx(Math.round(Math.max(0, Math.min(1, alpha === undefined ? 1 : alpha)) * 255));
        return (a + b + g + r).toLowerCase();
    }

    function kmlStyleBlock(id, sym, kind) {
        var x = '<Style id="' + id + '">';
        var op = (sym && sym.opacity !== undefined) ? sym.opacity : 1;
        var lineColor = (sym && sym.stroke) ? partsToKml(sym.stroke, op) : "ff0000ff";
        var lineWidth = (sym && sym.width) ? Math.max(1, sym.width) : 2;
        if (kind === "A") {
            x += "<LineStyle><color>" + lineColor + "</color><width>" + lineWidth + "</width></LineStyle>";
            if (sym && sym.fill) x += "<PolyStyle><color>" + partsToKml(sym.fill, op) + "</color><fill>1</fill><outline>1</outline></PolyStyle>";
            else if (sym) x += "<PolyStyle><fill>0</fill><outline>1</outline></PolyStyle>";
            else x += "<PolyStyle><color>4d00ffff</color><fill>1</fill><outline>1</outline></PolyStyle>";
        } else if (kind === "L") { x += "<LineStyle><color>" + lineColor + "</color><width>" + lineWidth + "</width></LineStyle>"; }
        else {
            var href = "http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png";
            var scale = sym && sym.radius ? Math.max(0.4, Math.min(3, sym.radius / 8)) : 1.0;
            var color = (sym && sym.fill) ? partsToKml(sym.fill, op) : "ff00a5ff";
            x += "<IconStyle><color>" + color + "</color><scale>" + scale + "</scale><Icon><href>" + xmlEsc(href) + "</href></Icon>" + '<hotSpot x="0.5" y="0.5" xunits="fraction" yunits="fraction"/></IconStyle>';
            if (sym && sym.stroke) x += "<LineStyle><color>" + lineColor + "</color><width>" + lineWidth + "</width></LineStyle>";
        }
        x += "<BalloonStyle><text>$[description]</text></BalloonStyle>";
        return x + "</Style>";
    }

    function buildKML(records, opts) {
        opts = opts || {};
        var src = mapCRS(), withLabels = !!opts.labels, keepStyle = !!opts.keepStyle;
        var uiColor = "#ffff00", uiScale = 1.0, docName = opts.name || baseName();
        var styleDefs = [], styleMap = {}, sCount = 0;
        var labelDefs = [], labelMap2 = {}, lCount = 0;

        function styleIdFor(sym, geomType) {
            var kind = geomType.indexOf("Polygon") !== -1 ? "A" : geomType.indexOf("Line") !== -1 ? "L" : "P";
            var key = symKey(keepStyle ? sym : null, kind);
            if (styleMap[key]) return styleMap[key];
            var id = "s17sty" + (sCount++); styleMap[key] = id;
            styleDefs.push(kmlStyleBlock(id, keepStyle ? sym : null, kind));
            return id;
        }

        function labelIdFor(hexColor, scale) {
            var key = hexColor + "|" + scale;
            if (labelMap2[key]) return labelMap2[key];
            var id = "s17lbl" + (lCount++); labelMap2[key] = id;
            labelDefs.push('<Style id="' + id + '"><IconStyle><color>00ffffff</color><scale>0.3</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/shaded_dot.png</href></Icon><hotSpot x="0.5" y="0.5" xunits="fraction" yunits="fraction"/></IconStyle><LabelStyle><color>' + kmlColor(hexColor, 1) + '</color><scale>' + scale + '</scale></LabelStyle><BalloonStyle><text>$[description]</text></BalloonStyle></Style>');
            return id;
        }

        var body = [];
        body.push("<Folder><name>" + xmlEsc(docName) + " — Features</name><open>1</open>");
        for (var i = 0; i < records.length; i++) {
            var r = records[i], g4326 = transformGeom(r.srcGeom, src, "EPSG:4326");
            if (!g4326) continue;
            var sid = styleIdFor(r.style, r.geomType);
            body.push("<Placemark><name>" + xmlEsc(r.labelText) + "</name><description>" + kmlDescription(r.properties) + "</description><styleUrl>#" + sid + "</styleUrl>" + kmlExtendedData(r.properties) + geomToKML(g4326) + "</Placemark>");
        }
        body.push("</Folder>");

        if (withLabels) {
            body.push("<Folder><name>Labels (centroid points)</name><open>0</open>");
            for (var j = 0; j < records.length; j++) {
                var rec = records[j]; if (!rec.labelMap) continue;
                var p4326 = transformGeom(new ol.geom.Point(rec.labelMap), src, "EPSG:4326"), c = p4326.getCoordinates();
                var col = uiColor, scale = uiScale;
                if (keepStyle && rec.style) { if (rec.style.textColor) col = partsToHex(rec.style.textColor) || uiColor; if (rec.style.textScale) scale = rec.style.textScale; }
                var lid = labelIdFor(col, scale);
                body.push("<Placemark><name>" + xmlEsc(rec.labelText) + "</name><description>" + kmlDescription(rec.properties) + "</description><styleUrl>#" + lid + '</styleUrl><ExtendedData><Data name="FeatureType"><value>LABEL_POINT</value></Data><Data name="Export_ID"><value>' + xmlEsc(rec.properties.Export_ID) + "</value></Data></ExtendedData><Point><altitudeMode>clampToGround</altitudeMode><coordinates>" + kmlCoord(c) + "</coordinates></Point></Placemark>");
            }
            body.push("</Folder>");
        }

        var K = ['<?xml version="1.0" encoding="UTF-8"?>', '<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">', "<Document>", "<name>" + xmlEsc(docName) + "</name>", "<description>" + xmlEsc("Exported " + new Date().toLocaleString() + " — " + records.length + " feature(s)") + "</description>"];
        K = K.concat(styleDefs).concat(labelDefs).concat(body);
        K.push("</Document></kml>");
        return K.join("\n");
    }

    function kmlOptions() { return { labels: checked("s17-labels"), keepStyle: checked("s17-style") }; }
    function exportKML(records) { downloadText(buildKML(records, kmlOptions()), baseName() + ".kml", "application/vnd.google-earth.kml+xml"); }

    function exportKMZ(records) {
        return loadScript(CONFIG.jszipCDN, "JSZip").then(function (JSZip) {
            var kml = buildKML(records, kmlOptions()), zip = new JSZip(); zip.file("doc.kml", kml);
            return zip.generateAsync({ type: "blob", mimeType: "application/vnd.google-earth.kmz", compression: "DEFLATE", compressionOptions: { level: 9 } });
        }).then(function (blob) { downloadBlob(blob, baseName() + ".kmz"); });
    }

    /* ========================================================
       13. DXF EXPORTER (AC1009 / R12 - MAXIMUM COMPATIBILITY)
       ======================================================== */
    var ACI_TABLE = [
        [0,0,0],[255,0,0],[255,255,0],[0,255,0],[0,255,255],[0,0,255],[255,0,255],[255,255,255],
        [128,128,128],[192,192,192],[255,0,0],[255,127,127],[165,0,0],[165,82,82],[127,0,0],[127,63,63],
        [76,0,0],[76,38,38],[38,0,0],[38,19,19],[255,63,0],[255,159,127],[165,41,0],[165,103,82],
        [127,31,0],[127,79,63],[76,19,0],[76,47,38],[38,9,0],[38,23,19],[255,127,0],[255,191,127],
        [165,82,0],[165,124,82],[127,63,0],[127,95,63],[76,38,0],[76,57,38],[38,19,0],[38,28,19],
        [255,191,0],[255,223,127],[165,124,0],[165,145,82],[127,95,0],[127,111,63],[76,57,0],[76,66,38],
        [38,28,0],[38,33,19],[255,255,0],[255,255,127],[165,165,0],[165,165,82],[127,127,0],[127,127,63],
        [76,76,0],[76,76,38],[38,38,0],[38,38,19],[191,255,0],[223,255,127],[124,165,0],[145,165,82],
        [95,127,0],[111,127,63],[57,76,0],[66,76,38],[28,38,0],[33,38,19],[127,255,0],[191,255,127],
        [82,165,0],[124,165,82],[63,127,0],[95,127,63],[38,76,0],[57,76,38],[19,38,0],[28,38,19],
        [63,255,0],[159,255,127],[41,165,0],[103,165,82],[31,127,0],[79,127,63],[19,76,0],[47,76,38],
        [9,38,0],[23,38,19],[0,255,0],[127,255,127],[0,165,0],[82,165,82],[0,127,0],[63,127,63],
        [0,76,0],[38,76,38],[0,38,0],[19,38,19],[0,255,63],[127,255,159],[0,165,41],[82,165,103],
        [0,127,31],[63,127,79],[0,76,19],[38,76,47],[0,38,9],[19,38,23],[0,255,127],[127,255,191],
        [0,165,82],[82,165,124],[0,127,63],[63,127,95],[0,76,38],[38,76,57],[0,38,19],[19,38,28],
        [0,255,191],[127,255,223],[0,165,124],[82,165,145],[0,127,95],[63,127,111],[0,76,57],[38,76,66],
        [0,38,28],[19,38,33],[0,255,255],[127,255,255],[0,165,165],[82,165,165],[0,127,127],[63,127,127],
        [0,76,76],[38,76,76],[0,38,38],[19,38,38],[0,191,255],[127,223,255],[0,124,165],[82,145,165],
        [0,95,127],[63,111,127],[0,57,76],[38,66,76],[0,28,38],[19,33,38],[0,127,255],[127,191,255],
        [0,82,165],[82,124,165],[0,63,127],[63,95,127],[0,38,76],[38,57,76],[0,19,38],[19,28,38],
        [0,63,255],[127,159,255],[0,41,165],[82,103,165],[0,31,127],[63,79,127],[0,19,76],[38,47,76],
        [0,9,38],[19,23,38],[0,0,255],[127,127,255],[0,0,165],[82,82,165],[0,0,127],[63,63,127],
        [0,0,76],[38,38,76],[0,0,38],[19,19,38],[63,0,255],[159,127,255],[41,0,165],[103,82,165],
        [31,0,127],[79,63,127],[19,0,76],[47,38,76],[9,0,38],[23,19,38],[127,0,255],[191,127,255],
        [82,0,165],[124,82,165],[63,0,127],[95,63,127],[38,0,76],[57,38,76],[19,0,38],[28,19,38],
        [191,0,255],[223,127,255],[124,0,165],[145,82,165],[95,0,127],[111,63,127],[57,0,76],[66,38,76],
        [28,0,38],[33,19,38],[255,0,255],[255,127,255],[165,0,165],[165,82,165],[127,0,127],[127,63,127],
        [76,0,76],[76,38,76],[38,0,38],[38,19,38],[255,0,191],[255,127,223],[165,0,124],[165,82,145],
        [127,0,95],[127,63,111],[76,0,57],[76,38,66],[38,0,28],[38,19,33],[255,0,127],[255,127,191],
        [165,0,82],[165,82,124],[127,0,63],[127,63,95],[76,0,38],[76,38,57],[38,0,19],[38,19,28],
        [255,0,63],[255,127,159],[165,0,41],[165,82,103],[127,0,31],[127,63,79],[76,0,19],[76,38,47],
        [38,0,9],[38,19,23],[84,84,84],[118,118,118],[152,152,152],[186,186,186],[220,220,220],[255,255,255]
    ];

    function nearestACI(p) {
        if (!p) return 7;
        var best = 7, bestD = Infinity;
        for (var i = 1; i < ACI_TABLE.length; i++) {
            var t = ACI_TABLE[i];
            var d = Math.pow(t[0] - p.r, 2) + Math.pow(t[1] - p.g, 2) + Math.pow(t[2] - p.b, 2);
            if (d < bestD) { bestD = d; best = i; }
            if (d === 0) break;
        }
        return best;
    }

    function dxfHeader() {
        return [
            "0", "SECTION",
            "2", "HEADER",
            "9", "$ACADVER", "1", "AC1009", // Pure Release 12 - universally parsed
            "9", "$INSUNITS", "70", "6",    // Meters
            "0", "ENDSEC"
        ].join("\n");
    }

    function dxfTables(layerNames) {
        var t = ["0", "SECTION", "2", "TABLES"];

        // LTYPE table (No handles required in R12 DXF)
        t.push("0", "TABLE", "2", "LTYPE", "70", "1");
        t.push("0", "LTYPE", "2", "CONTINUOUS", "70", "64", "3", "Solid line", "72", "65", "73", "0", "40", "0.0");
        t.push("0", "ENDTAB");
        
        // LAYER table (Strictly compliant; eliminates plot style mapping conflicts)
        t.push("0", "TABLE", "2", "LAYER", "70", String(layerNames.length));
        for (var i = 0; i < layerNames.length; i++) {
            t.push(
                "0", "LAYER",
                "2", layerNames[i],
                "70", "64",
                "62", "7",
                "6", "CONTINUOUS"
            );
        }
        t.push("0", "ENDTAB");

        // APPID table (Registers application name for attaching XDATA metadata)
        t.push("0", "TABLE", "2", "APPID", "70", "1");
        t.push("0", "APPID", "2", "STAGE17", "70", "64");
        t.push("0", "ENDTAB");

        t.push("0", "ENDSEC");
        return t.join("\n");
    }

    function dxfPolyline(coords, closed, layerNm, colorIdx, props) {
        var lines = [
            "0", "POLYLINE",
            "8", layerNm,
            "62", String(colorIdx),
            "66", "1",
            "70", closed ? "1" : "0",
            "10", "0.0", "20", "0.0", "30", "0.0"
        ];

        if (props) lines.push(dxfXdata(props));

        for (var i = 0; i < coords.length; i++) {
            lines.push(
                "0", "VERTEX",
                "8", layerNm,
                "62", String(colorIdx),
                "10", coords[i][0].toFixed(CONFIG.coordDecimals),
                "20", coords[i][1].toFixed(CONFIG.coordDecimals),
                "30", "0.0"
            );
        }

        lines.push("0", "SEQEND", "8", layerNm);
        return lines.join("\n");
    }

    function dxfPointEntity(x, y, z, layerNm, colorIdx, props) {
        var zv = (z !== undefined && z !== null && !isNaN(z)) ? z : 0.0;
        var lines = [
            "0", "POINT",
            "8", layerNm,
            "62", String(colorIdx),
            "10", x.toFixed(CONFIG.coordDecimals),
            "20", y.toFixed(CONFIG.coordDecimals),
            "30", zv.toFixed(3)
        ];
        if (props) lines.push(dxfXdata(props));
        return lines.join("\n");
    }

    function dxfCircle(x, y, radius, layerNm, colorIdx, props) {
        var lines = [
            "0", "CIRCLE",
            "8", layerNm,
            "62", String(colorIdx),
            "10", x.toFixed(CONFIG.coordDecimals),
            "20", y.toFixed(CONFIG.coordDecimals),
            "30", "0.0",
            "40", radius.toFixed(3)
        ];
        if (props) lines.push(dxfXdata(props));
        return lines.join("\n");
    }

    function dxfText(x, y, text, height, layerNm, colorIdx) {
        var escaped = String(text).replace(/\\/g, "\\\\");
        return [
            "0", "TEXT",
            "8", layerNm,
            "62", String(colorIdx),
            "10", x.toFixed(CONFIG.coordDecimals),
            "20", y.toFixed(CONFIG.coordDecimals),
            "30", "0.0",
            "40", height.toFixed(3),
            "1", escaped,
            "72", "4",
            "11", x.toFixed(CONFIG.coordDecimals),
            "21", y.toFixed(CONFIG.coordDecimals),
            "31", "0.0"
        ].join("\n");
    }

    function dxfXdata(props) {
        var lines = [];
        lines.push("1001", "STAGE17");
        for (var k in props) {
            if (!props.hasOwnProperty(k)) continue;
            lines.push("1000", String(k) + "=" + String(props[k] === undefined ? "" : props[k]));
        }
        return lines.join("\n");
    }

    function exportDXF(records, tCRS) {
        var keepStyle = checked("s17-style");
        var wantLabels = checked("s17-labels");

        var lyrFeatures = baseName().substring(0, 31) || "Features";
        var lyrLabels = "Labels";
        var layerNames = [lyrFeatures];
        if (wantLabels) layerNames.push(lyrLabels);

        var entities = [];

        for (var i = 0; i < records.length; i++) {
            var r = records[i];
            var geom = r.geometry;
            var type = r.geomType;
            var sym = r.style;

            var strokeColor = (keepStyle && sym && sym.stroke) ? nearestACI(sym.stroke) : 7;
            var fillColor = (keepStyle && sym && sym.fill) ? nearestACI(sym.fill) : 3;
            var textColor = (keepStyle && sym && sym.textColor) ? nearestACI(sym.textColor) : 7;

            function addPolyCoords(coords, closed) {
                entities.push(dxfPolyline(coords, closed, lyrFeatures, strokeColor, r.properties));
            }

            function addPolygon(rings) {
                for (var ri = 0; ri < rings.length; ri++) {
                    addPolyCoords(rings[ri], true);
                }
            }

            if (type === "Point") {
                var c = geom.getCoordinates();
                if (sym && sym.radius) {
                    entities.push(dxfCircle(c[0], c[1], sym.radius, lyrFeatures, fillColor, r.properties));
                } else {
                    entities.push(dxfPointEntity(c[0], c[1], c[2], lyrFeatures, strokeColor, r.properties));
                }
            } else if (type === "MultiPoint") {
                var pts = geom.getCoordinates();
                for (var pi = 0; pi < pts.length; pi++) {
                    if (sym && sym.radius) {
                        entities.push(dxfCircle(pts[pi][0], pts[pi][1], sym.radius, lyrFeatures, fillColor, r.properties));
                    } else {
                        entities.push(dxfPointEntity(pts[pi][0], pts[pi][1], pts[pi][2], lyrFeatures, strokeColor, r.properties));
                    }
                }
            } else if (type === "LineString") {
                addPolyCoords(geom.getCoordinates(), false);
            } else if (type === "MultiLineString") {
                var lss = geom.getCoordinates();
                for (var li = 0; li < lss.length; li++) {
                    addPolyCoords(lss[li], false);
                }
            } else if (type === "Polygon") {
                addPolygon(geom.getCoordinates());
            } else if (type === "MultiPolygon") {
                var polys = geom.getCoordinates();
                for (var mpi = 0; mpi < polys.length; mpi++) {
                    addPolygon(polys[mpi]);
                }
            }

            if (wantLabels && r.labelTgt) {
                var ht = 2.0;
                if (keepStyle && sym && sym.textScale) ht = Math.max(0.5, sym.textScale * 2);
                entities.push(dxfText(r.labelTgt[0], r.labelTgt[1], r.labelText, ht, lyrLabels, textColor));
            }
        }

        var dxf = [
            dxfHeader(),
            dxfTables(layerNames),
            "0", "SECTION",
            "2", "ENTITIES",
            entities.join("\n"),
            "0", "ENDSEC",
            "0", "EOF"
        ].join("\n");

        downloadText(dxf, baseName() + ".dxf", "application/dxf");
    }

    /* ========================================================
       14. NATIVE SHAPEFILE EXPORTER (UTF-8 MULTILANGUAGE ENGINE)
       ======================================================== */
    var PRJ_WGS84 = 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';

    // Strict UTF-8 multi-byte encoder fallback for non-Latin scripts (Telugu, Hindi, Arabic, etc.)
    function stringToUtf8Bytes(str) {
        if (typeof TextEncoder !== "undefined") {
            return new TextEncoder().encode(str);
        }
        var utf8 = [];
        for (var i = 0; i < str.length; i++) {
            var charcode = str.charCodeAt(i);
            if (charcode < 0x80) utf8.push(charcode);
            else if (charcode < 0x800) {
                utf8.push(0xc0 | (charcode >> 6), 0x80 | (charcode & 0x3f));
            }
            else if (charcode < 0xd800 || charcode >= 0xe000) {
                utf8.push(0xe0 | (charcode >> 12), 0x80 | ((charcode >> 6) & 0x3f), 0x80 | (charcode & 0x3f));
            }
            else {
                i++;
                charcode = 0x10000 + (((charcode & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
                utf8.push(0xf0 | (charcode >> 18), 0x80 | ((charcode >> 12) & 0x3f), 0x80 | ((charcode >> 6) & 0x3f), 0x80 | (charcode & 0x3f));
            }
        }
        return new Uint8Array(utf8);
    }

    function sanitizeDbfFields(records) {
        var seen = {}, fields = [];
        records.forEach(function (r) {
            Object.keys(r.properties).forEach(function (k) {
                if (seen[k]) return;
                seen[k] = true;
                var clean = k.replace(/[^a-zA-Z0-9_]/g, "_").substring(0, 10) || "FIELD";
                var finalName = clean, counter = 1;
                while (fields.some(function (f) { return f.name === finalName; })) {
                    var suffix = String(counter++);
                    finalName = clean.substring(0, 10 - suffix.length) + suffix;
                }

                var isNum = true, maxByteLen = 1, maxDec = 0;
                for (var i = 0; i < records.length; i++) {
                    var val = records[i].properties[k];
                    if (val !== undefined && val !== null && val !== "") {
                        var bytes = stringToUtf8Bytes(String(val));
                        if (bytes.length > maxByteLen) maxByteLen = bytes.length;
                        if (isNaN(Number(val)) || typeof val === "boolean") {
                            isNum = false;
                        } else {
                            var parts = String(val).split(".");
                            if (parts.length > 1 && parts[1].length > maxDec) maxDec = parts[1].length;
                        }
                    }
                }

                if (isNum && maxByteLen <= 18) {
                    fields.push({ key: k, name: finalName, type: 'N', length: Math.min(18, Math.max(10, maxByteLen + 2)), decimals: Math.min(6, maxDec) });
                } else {
                    // Store byte length securely capped at the dBase standard of 254 bytes
                    fields.push({ key: k, name: finalName, type: 'C', length: Math.min(254, Math.max(1, maxByteLen)), decimals: 0 });
                }
            });
        });
        return fields;
    }

    function createDbfBuffer(records, fields) {
        var recordLen = 1;
        fields.forEach(function (f) { recordLen += f.length; });
        var headerLen = 32 + (32 * fields.length) + 1;
        var totalSize = headerLen + (records.length * recordLen) + 1;

        var buf = new ArrayBuffer(totalSize);
        var view = new DataView(buf);
        var now = new Date();

        view.setUint8(0, 0x03);
        view.setUint8(1, (now.getFullYear() - 1900) & 0xFF);
        view.setUint8(2, (now.getMonth() + 1) & 0xFF);
        view.setUint8(3, now.getDate() & 0xFF);
        view.setUint32(4, records.length, true);
        view.setUint16(8, headerLen, true);
        view.setUint16(10, recordLen, true);

        var fOffset = 32;
        fields.forEach(function (f) {
            for (var i = 0; i < 11; i++) {
                view.setUint8(fOffset + i, i < f.name.length ? (f.name.charCodeAt(i) & 0x7F) : 0);
            }
            view.setUint8(fOffset + 11, f.type.charCodeAt(0));
            view.setUint8(fOffset + 16, f.length);
            view.setUint8(fOffset + 17, f.decimals);
            fOffset += 32;
        });
        view.setUint8(fOffset, 0x0D);

        var rOffset = headerLen;
        records.forEach(function (r) {
            view.setUint8(rOffset, 0x20); // standard spacing
            var colOffset = rOffset + 1;
            fields.forEach(function (f) {
                var val = r.properties[f.key];
                var bytes;
                if (val !== undefined && val !== null) {
                    if (f.type === 'N') {
                        var n = Number(val);
                        var str = isNaN(n) ? "" : n.toFixed(f.decimals);
                        while (str.length < f.length) str = " " + str;
                        bytes = stringToUtf8Bytes(str);
                    } else {
                        bytes = stringToUtf8Bytes(String(val));
                    }
                } else {
                    bytes = new Uint8Array(0);
                }

                // Write binary values and space-pad cleanly without encoding stripping
                if (f.type === 'N') {
                    var padCount = f.length - bytes.length;
                    for (var i = 0; i < f.length; i++) {
                        if (i < padCount) {
                            view.setUint8(colOffset + i, 0x20);
                        } else {
                            view.setUint8(colOffset + i, bytes[i - padCount]);
                        }
                    }
                } else {
                    for (var j = 0; j < f.length; j++) {
                        if (j < bytes.length) {
                            view.setUint8(colOffset + j, bytes[j]);
                        } else {
                            view.setUint8(colOffset + j, 0x20);
                        }
                    }
                }
                colOffset += f.length;
            });
            rOffset += recordLen;
        });
        view.setUint8(rOffset, 0x1A);
        return buf;
    }

    function geomToRings(geom) {
        var t = geom.getType(), rings = [];
        if (t === "Polygon") {
            rings = geom.getCoordinates();
        } else if (t === "MultiPolygon") {
            var polys = geom.getCoordinates();
            for (var p = 0; p < polys.length; p++) {
                for (var r = 0; r < polys[p].length; r++) rings.push(polys[p][r]);
            }
        } else if (t === "LineString") {
            rings = [geom.getCoordinates()];
        } else if (t === "MultiLineString") {
            rings = geom.getCoordinates();
        }
        return rings;
    }

    function buildPointShapefile(records, srcCRS) {
        var numRecords = records.length;
        var shxSize = 100 + numRecords * 8;
        var shpSize = 100 + numRecords * 28;

        var shpBuf = new ArrayBuffer(shpSize);
        var shpView = new DataView(shpBuf);
        var shxBuf = new ArrayBuffer(shxSize);
        var shxView = new DataView(shxBuf);

        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        var coords = [];
        for (var i = 0; i < numRecords; i++) {
            var g = records[i].geometry || records[i].srcGeom;
            var pt = (g.getType() === "Point") ? g.getCoordinates() : records[i].labelTgt || [0,0];
            coords.push(pt);
            if (pt[0] < minX) minX = pt[0];
            if (pt[0] > maxX) maxX = pt[0];
            if (pt[1] < minY) minY = pt[1];
            if (pt[1] > maxY) maxY = pt[1];
        }
        if (numRecords === 0) { minX = minY = maxX = maxY = 0; }

        function writeHdr(v, bytes) {
            v.setInt32(0, 9994, false);
            v.setInt32(24, bytes / 2, false);
            v.setInt32(28, 1000, true);
            v.setInt32(32, 1, true); // Point
            v.setFloat64(36, minX, true);
            v.setFloat64(44, minY, true);
            v.setFloat64(52, maxX, true);
            v.setFloat64(60, maxY, true);
        }

        writeHdr(shpView, shpSize);
        writeHdr(shxView, shxSize);

        var shpOff = 100, shxOff = 100;
        for (var j = 0; j < numRecords; j++) {
            var c = coords[j];
            shxView.setInt32(shxOff, shpOff / 2, false);
            shxView.setInt32(shxOff + 4, 10, false);
            shxOff += 8;

            shpView.setInt32(shpOff, j + 1, false);
            shpView.setInt32(shpOff + 4, 10, false);
            shpOff += 8;

            shpView.setInt32(shpOff, 1, true);
            shpView.setFloat64(shpOff + 4, c[0], true);
            shpView.setFloat64(shpOff + 12, c[1], true);
            shpOff += 20;
        }

        return { shp: shpBuf, shx: shxBuf };
    }

    function buildPolyShapefile(records, srcCRS, isPolygon) {
        var shapeType = isPolygon ? 5 : 3;
        var numRecords = records.length;
        var shxSize = 100 + numRecords * 8;

        var parsed = [], totalShpBytes = 100;
        var gMinX = Infinity, gMinY = Infinity, gMaxX = -Infinity, gMaxY = -Infinity;

        for (var i = 0; i < numRecords; i++) {
            var g = transformGeom(records[i].srcGeom, srcCRS, "EPSG:4326");
            var rawRings = geomToRings(g);
            var parts = [], totalPts = 0;
            var rMinX = Infinity, rMinY = Infinity, rMaxX = -Infinity, rMaxY = -Infinity;

            for (var pi = 0; pi < rawRings.length; pi++) {
                var ring = rawRings[pi].slice();
                if (isPolygon && ring.length > 0) {
                    var f = ring[0], l = ring[ring.length - 1];
                    if (f[0] !== l[0] || f[1] !== l[1]) ring.push([f[0], f[1]]);
                }
                if (ring.length === 0) continue;
                for (var k = 0; k < ring.length; k++) {
                    var x = ring[k][0], y = ring[k][1];
                    if (x < rMinX) rMinX = x;
                    if (x > rMaxX) rMaxX = x;
                    if (y < rMinY) rMinY = y;
                    if (y > rMaxY) rMaxY = y;
                }
                totalPts += ring.length;
                parts.push(ring);
            }

            if (rMinX < gMinX) gMinX = rMinX;
            if (rMaxX > gMaxX) gMaxX = rMaxX;
            if (rMinY < gMinY) gMinY = rMinY;
            if (rMaxY > gMaxY) gMaxY = rMaxY;

            var contentBytes = 44 + (4 * parts.length) + (16 * totalPts);
            totalShpBytes += (8 + contentBytes);

            parsed.push({ parts: parts, totalPts: totalPts, minX: rMinX, minY: rMinY, maxX: rMaxX, maxY: rMaxY, contentBytes: contentBytes });
        }

        if (numRecords === 0) { gMinX = gMinY = gMaxX = gMaxY = 0; }

        var shpBuf = new ArrayBuffer(totalShpBytes);
        var shpView = new DataView(shpBuf);
        var shxBuf = new ArrayBuffer(shxSize);
        var shxView = new DataView(shxBuf);

        function writeHdr(v, bytes) {
            v.setInt32(0, 9994, false);
            v.setInt32(24, bytes / 2, false);
            v.setInt32(28, 1000, true);
            v.setInt32(32, shapeType, true);
            v.setFloat64(36, gMinX, true);
            v.setFloat64(44, gMinY, true);
            v.setFloat64(52, gMaxX, true);
            v.setFloat64(60, gMaxY, true);
        }

        writeHdr(shpView, totalShpBytes);
        writeHdr(shxView, shxSize);

        var shpOff = 100, shxOff = 100;
        for (var j = 0; j < numRecords; j++) {
            var item = parsed[j];
            var wordOffset = shpOff / 2;
            var wordsContent = item.contentBytes / 2;

            shxView.setInt32(shxOff, wordOffset, false);
            shxView.setInt32(shxOff + 4, wordsContent, false);
            shxOff += 8;

            shpView.setInt32(shpOff, j + 1, false);
            shpView.setInt32(shpOff + 4, wordsContent, false);
            shpOff += 8;

            shpView.setInt32(shpOff, shapeType, true);
            shpView.setFloat64(shpOff + 4, item.minX, true);
            shpView.setFloat64(shpOff + 12, item.minY, true);
            shpView.setFloat64(shpOff + 20, item.maxX, true);
            shpView.setFloat64(shpOff + 28, item.maxY, true);
            shpView.setInt32(shpOff + 36, item.parts.length, true);
            shpView.setInt32(shpOff + 40, item.totalPts, true);

            var partIndexOff = shpOff + 44;
            var pointOff = partIndexOff + (4 * item.parts.length);
            var runningIdx = 0;

            for (var pI = 0; pI < item.parts.length; pI++) {
                shpView.setInt32(partIndexOff + (4 * pI), runningIdx, true);
                var pRing = item.parts[pI];
                for (var ptI = 0; ptI < pRing.length; ptI++) {
                    shpView.setFloat64(pointOff, pRing[ptI][0], true);
                    shpView.setFloat64(pointOff + 8, pRing[ptI][1], true);
                    pointOff += 16;
                    runningIdx++;
                }
            }
            shpOff += item.contentBytes;
        }

        return { shp: shpBuf, shx: shxBuf };
    }

    function exportSHP(records) {
        return loadScript(CONFIG.jszipCDN, "JSZip").then(function (JSZip) {
            var src = mapCRS();
            var zip = new JSZip();
            var bName = baseName();

            var polys = [], lines = [], points = [];
            records.forEach(function (r) {
                var t = r.geomType;
                if (t === "Polygon" || t === "MultiPolygon") polys.push(r);
                else if (t === "LineString" || t === "MultiLineString") lines.push(r);
                else points.push(r);
            });

            function addShpLayer(name, recs, isPoly, isPt) {
                if (!recs.length) return;
                var shpData = isPt ? buildPointShapefile(recs, src) : buildPolyShapefile(recs, src, isPoly);
                var fields = sanitizeDbfFields(recs);
                var dbfData = createDbfBuffer(recs, fields);
                zip.file(name + ".shp", shpData.shp);
                zip.file(name + ".shx", shpData.shx);
                zip.file(name + ".dbf", dbfData);
                zip.file(name + ".prj", PRJ_WGS84);
                zip.file(name + ".cpg", "UTF-8"); // Force modern GIS software to decode DBF as UTF-8
            }

            if (polys.length) addShpLayer(bName + "_polygons", polys, true, false);
            if (lines.length) addShpLayer(bName + "_lines", lines, false, false);
            if (points.length) addShpLayer(bName + "_points", points, false, true);

            if (checked("s17-labels")) {
                var labelRecs = [];
                records.forEach(function (r) {
                    if (!r.labelMap) return;
                    labelRecs.push({
                        geometry: new ol.geom.Point(transformGeom(new ol.geom.Point(r.labelMap), src, "EPSG:4326").getCoordinates()),
                        srcGeom: new ol.geom.Point(r.labelMap),
                        properties: { EXPORT_ID: r.properties.Export_ID, LABEL: r.labelText, FTYPE: "LABEL" }
                    });
                });
                if (labelRecs.length) addShpLayer(bName + "_labels", labelRecs, false, true);
            }

            return zip.generateAsync({ type: "blob", mimeType: "application/zip", compression: "DEFLATE", compressionOptions: { level: 9 } });
        }).then(function (blob) {
            downloadBlob(blob, baseName() + "_shp.zip");
        });
    }

    /* ========================================================
       15. FEATURE SELECTION FOR EXPORT
       ======================================================== */
    function featuresForExport() {
        if (!S.currentLayer) return [];
        var src = S.currentLayer.getSource();
        if (!src) return [];
        var all = src.getFeatures();
        if (S.exportMode === "all") return all.slice();
        if (S.exportMode === "extent") { var m = getMap(), ext = m.getView().calculateExtent(m.getSize()); return all.filter(function (f) { var g = f.getGeometry(); return g && g.intersectsExtent(ext); }); }
        if (S.exportMode === "selected") return selectedForCurrentLayer();
        return [];
    }

    /* ========================================================
       16. UI — CSS
       ======================================================== */
    function injectCSS() {
        if (document.getElementById("s17-css")) return;
        var P = "#" + CONFIG.panelId;
        var css = P + " *{box-sizing:border-box;}" +
P + " .s17-head{display:flex;align-items:center;justify-content:space-between;padding:13px 14px;background:linear-gradient(135deg,#111827,#374151);color:#fff;border-radius:12px 12px 0 0;}" +
P + " .s17-t{font-size:15px;font-weight:700;}" +
P + " .s17-st{font-size:10.5px;opacity:.7;margin-top:2px;}" +
P + " .s17-x{width:28px;height:28px;border:0;border-radius:6px;background:rgba(255,255,255,.15);color:#fff;font-size:20px;line-height:1;cursor:pointer;}" +
P + " .s17-x:hover{background:rgba(255,255,255,.3);}" +
P + " .s17-body{padding:13px;}" +
P + " label{display:block;font-size:11.5px;font-weight:600;margin:0 0 4px;color:#374151;}" +
P + " select,input[type=text],input[type=number]{width:100%;height:36px;padding:0 9px;margin:0 0 10px;border:1px solid #d1d5db;border-radius:7px;background:#fff;color:#111;font-size:12.5px;outline:none;}" +
P + " select:focus,input:focus{border-color:#2563eb;box-shadow:0 0 0 2px rgba(37,99,235,.12);}" +
P + " .s17-sec{font-size:11px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;color:#6b7280;margin:14px 0 8px;padding-top:10px;border-top:1px solid #e5e7eb;}" +
P + " .s17-chk{display:flex;align-items:center;gap:8px;margin:6px 0;font-size:12px;font-weight:400;cursor:pointer;color:#111;}" +
P + " .s17-chk input{width:15px;height:15px;margin:0;cursor:pointer;flex:0 0 auto;}" +
P + " .s17-row{display:flex;gap:6px;}" +
P + " .s17-row>*{flex:1;}" +
P + " .s17-btn{height:32px;border:1px solid #d1d5db;border-radius:6px;background:#fff;color:#374151;font-size:11.5px;font-weight:600;cursor:pointer;padding:0 6px;}" +
P + " .s17-btn:hover{background:#f3f4f6;}" +
P + " .s17-btn.on{background:#16a34a;border-color:#16a34a;color:#fff;}" +
P + " .s17-fields{margin:8px 0 12px;padding:9px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;max-height:150px;overflow-y:auto;}" +
P + " .s17-field{display:flex;align-items:center;gap:7px;margin:4px 0;font-size:11px;font-weight:400;}" +
P + " .s17-ftitle{font-size:10.5px;font-weight:800;margin-bottom:6px;color:#6b7280;}" +
P + " .s17-info{padding:7px 9px;margin:0 0 10px;border-radius:6px;font-size:11px;border:1px solid;line-height:1.45;}" +
P + " .s17-info.ok{background:#dcfce7;border-color:#22c55e;color:#14532d;}" +
P + " .s17-info.warn{background:#fef3c7;border-color:#f59e0b;color:#92400e;}" +
P + " .s17-status{padding:8px 10px;margin:10px 0;background:#f3f4f6;border-radius:7px;color:#4b5563;font-size:11px;word-break:break-word;line-height:1.5;}" +
P + " .s17-go{width:100%;height:42px;border:0;border-radius:8px;background:#2563eb;color:#fff;font-size:13px;font-weight:800;cursor:pointer;box-shadow:0 2px 6px rgba(37,99,235,.3);}" +
P + " .s17-go:hover{background:#1d4ed8;}" +
P + " .s17-go:disabled{opacity:.55;cursor:not-allowed;}" +
".s17-dragbox{border:2px dashed #2563eb;background:rgba(37,99,235,.12);}" +
"body.s17-nopopup .ol-popup,body.s17-nopopup #popup,body.s17-nopopup .ol-popup-content,body.s17-nopopup #popup-content,body.s17-nopopup .popup-content,body.s17-nopopup .ol-tooltip{display:none!important;}" +
"@media(max-width:650px){" + P + "{top:52px!important;right:6px!important;width:calc(100vw - 12px)!important;max-height:calc(100vh - 62px)!important;}}";
        var st = document.createElement("style"); st.id = "s17-css"; st.textContent = css; document.head.appendChild(st);
    }

    /* ========================================================
       17. UI — BUTTON & PANEL
       ======================================================== */
    function openPanel() { var p = document.getElementById(CONFIG.panelId); if (!p) return; p.style.display = "block"; refreshPanel(); syncPopups(); }
    function closePanel() { var p = document.getElementById(CONFIG.panelId); if (!p) return; p.style.display = "none"; disableSelection(); syncPopups(); }

    function createButton() {
        if (document.getElementById(CONFIG.buttonId)) return;
        var b = document.createElement("button"); b.id = CONFIG.buttonId; b.type = "button"; b.title = "Advanced Export";
        b.innerHTML = '<span style="font-size:22px;line-height:1;">📤</span>';
        Object.assign(b.style, { position: "fixed", width: "46px", height: "46px", padding: "0", border: "1px solid rgba(0,0,0,.25)", borderRadius: "8px", background: "#fff", color: "#222", boxShadow: "0 2px 8px rgba(0,0,0,.25)", cursor: "pointer", zIndex: String(CONFIG.zIndex), display: "flex", alignItems: "center", justifyContent: "center", transition: "all .15s ease" });
        b.onmouseenter = function () { b.style.transform = "scale(1.07)"; };
        b.onmouseleave = function () { b.style.transform = "scale(1)"; };
        b.onclick = function () { var p = document.getElementById(CONFIG.panelId); if (!p) return; (p.style.display === "block") ? closePanel() : openPanel(); };
        document.body.appendChild(b);
        setTimeout(positionButton, 300); setTimeout(positionButton, 1200);
    }

    function positionButton() {
        var b = document.getElementById(CONFIG.buttonId); if (!b) return;
        var vw = innerWidth, vh = innerHeight, bw = 46, bh = 46, gap = 8, rm = vw <= 650 ? 10 : 16;
        var occ = [];
        var els = document.querySelectorAll("button,.ol-control,[role=button]");
        for (var i = 0; i < els.length; i++) { var el = els[i]; if (!el || el.id === CONFIG.buttonId || (el.closest && el.closest("#" + CONFIG.panelId))) continue; var cs = getComputedStyle(el); if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") continue; var r = el.getBoundingClientRect(); if (r.width < 5 || r.height < 5) continue; if (r.right < vw - 130 && r.left < vw * .7) continue; if (r.bottom < 0 || r.top > vh) continue; occ.push(r); }
        var chosen = 15;
        for (var bo = 15; bo < vh - 65; bo += bh + gap) { var top = vh - bo - bh, left = vw - rm - bw, hit = false; var t = { l: left - gap, r: left + bw + gap, t: top - gap, b: top + bh + gap }; for (var j = 0; j < occ.length; j++) { var o = occ[j]; if (t.l < o.right && t.r > o.left && t.t < o.bottom && t.b > o.top) { hit = true; break; } } if (!hit) { chosen = bo; break; } }
        b.style.right = rm + "px"; b.style.bottom = chosen + "px"; b.style.left = "auto"; b.style.top = "auto";
    }

    function createPanel() {
        if (document.getElementById(CONFIG.panelId)) return;
        var p = document.createElement("div"); p.id = CONFIG.panelId;
        p.innerHTML =
'<div class="s17-head"><div><div class="s17-t">📤 Advanced Export</div><div class="s17-st">GIS &amp; survey data export</div></div><button type="button" id="s17-close" class="s17-x">×</button></div>' +
'<div class="s17-body">' +
'<label>Layer</label><select id="s17-layer"></select>' +
'<div class="s17-sec">🖱 Map Selection</div>' +
'<div class="s17-row" style="margin-bottom:8px;"><button type="button" id="s17-selmode" class="s17-btn">Enable Select</button><button type="button" id="s17-selclear" class="s17-btn">Clear</button><button type="button" id="s17-selview" class="s17-btn">All in View</button></div>' +
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
'<div class="s17-sec">🏷 Label Points</div>' +
'<label class="s17-chk"><input type="checkbox" id="s17-labels" checked><span>Create invisible centroid point for labels</span></label>' +
'<div class="s17-sec">📐 Include Measurements</div>' +
'<label class="s17-chk"><input type="checkbox" id="s17-area" checked><span>Area (m² / ha / acre / cent / ft²)</span></label>' +
'<label class="s17-chk"><input type="checkbox" id="s17-perimeter" checked><span>Perimeter / Length (m)</span></label>' +
'<label class="s17-chk"><input type="checkbox" id="s17-centroid" checked><span>Centroid X / Y</span></label>' +
'<label class="s17-chk"><input type="checkbox" id="s17-coords" checked><span>Point X / Y / Z</span></label>' +
'<div class="s17-sec">🗂 Attributes</div><div id="s17-fields" class="s17-fields"></div>' +
'<div id="s17-status" class="s17-status">Ready</div>' +
'<button type="button" id="s17-go" class="s17-go">📤 Export</button></div>';

        Object.assign(p.style, { position: "fixed", top: "68px", right: "16px", width: "336px", maxWidth: "calc(100vw - 24px)", maxHeight: "calc(100vh - 86px)", overflowY: "auto", background: "#fff", borderRadius: "12px", boxShadow: "0 10px 34px rgba(0,0,0,.28)", zIndex: String(CONFIG.zIndex + 1), display: "none", fontFamily: "Arial,Helvetica,sans-serif", color: "#111" });
        document.body.appendChild(p);

        document.getElementById("s17-close").onclick = closePanel;
        document.getElementById("s17-layer").onchange = function () { S.currentLayer = layerById(this.value); refreshFields(); updateSelectionUI(); };
        document.getElementById("s17-mode").onchange = function () { S.exportMode = this.value; if (this.value === "selected" && !S.selectActive) enableSelection(); updateSelectionUI(); };
        document.getElementById("s17-format").onchange = function () {
            var note = document.getElementById("s17-status");
            S.exportFormat = this.value;
            if (this.value === "KML" || this.value === "KMZ") note.textContent = "ℹ KML/KMZ always uses EPSG:4326.";
            else if (this.value === "DXF") note.textContent = "ℹ DXF exports in your selected CRS with ACI colours.";
            else if (this.value === "SHP") note.textContent = "ℹ Shapefile ZIP contains UTF-8 compatible .shp, .shx, .dbf, .prj & .cpg files.";
        };
        document.getElementById("s17-crs").onchange = function () { S.exportCRS = this.value; document.getElementById("s17-custom-crs").style.display = this.value === "custom" ? "block" : "none"; };
        document.getElementById("s17-selmode").onclick = toggleSelection;
        document.getElementById("s17-selclear").onclick = clearSelection;
        document.getElementById("s17-selview").onclick = function () { var m = getMap(); if (!m) return; selectByExtent(m.getView().calculateExtent(m.getSize()), false); S.exportMode = "selected"; document.getElementById("s17-mode").value = "selected"; };
        document.getElementById("s17-go").onclick = runExport;
    }

    /* ========================================================
       18. UI REFRESH
       ======================================================== */
    function updateSelectionUI() {
        var info = document.getElementById("s17-selinfo"), btn = document.getElementById("s17-selmode");
        if (!info || !btn) return;
        btn.textContent = S.selectActive ? "✔ Selecting" : "Enable Select";
        btn.className = "s17-btn" + (S.selectActive ? " on" : "");
        var n = selectedForCurrentLayer().length, other = S.selection.length - n;
        if (n > 0) { info.className = "s17-info ok"; info.innerHTML = "✔ <b>" + n + "</b> polygon(s) selected in <b>" + (S.currentLayer ? layerName(S.currentLayer) : "-") + "</b>" + (other > 0 ? "<br><span style='opacity:.8'>" + other + " in other layer(s)</span>" : "") + "<br><span style='opacity:.8'>Click a polygon again to unselect it.</span>"; }
        else if (S.selectActive) { info.className = "s17-info warn"; info.innerHTML = "🖱 <b>Click</b> polygon to select · <b>Click again</b> to unselect<br>Clicking another polygon <b>adds</b> it · <b>Shift+Drag</b> = box select<br><span style='opacity:.8'>Popups are disabled while selecting.</span>"; }
        else { info.className = "s17-info warn"; info.innerHTML = "Selection is off — click <b>Enable Select</b> to pick polygons on the map."; }
    }

    function refreshPanel() {
        var sel = document.getElementById("s17-layer"); if (!sel) return;
        var ls = vectorLayers(); sel.innerHTML = "";
        if (!ls.length) { sel.innerHTML = '<option value="">No vector layers found</option>'; S.currentLayer = null; refreshFields(); updateSelectionUI(); return; }
        ls.forEach(function (l) { var o = document.createElement("option"); o.value = layerId(l); o.textContent = layerName(l) + "  (" + l.getSource().getFeatures().length + ")"; sel.appendChild(o); });
        if (!S.currentLayer || ls.indexOf(S.currentLayer) === -1) S.currentLayer = ls[0];
        sel.value = layerId(S.currentLayer); refreshFields(); updateSelectionUI();
        var st = document.getElementById("s17-status"); if (st) st.textContent = "Ready — " + S.currentLayer.getSource().getFeatures().length + " feature(s) in layer";
    }

    function refreshFields() {
        var box = document.getElementById("s17-fields"); if (!box) return; box.innerHTML = "";
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
    }

    /* ========================================================
       19. RUN EXPORT
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
                if (S.exportMode === "selected") throw new Error("Nothing selected. Click polygons on the map, then export.");
                if (S.exportMode === "extent") throw new Error("No features inside the current map view.");
                throw new Error("No features available in this layer.");
            }
            status.textContent = "⏳ Processing " + feats.length + " feature(s)…";
            var recs = buildRecords(feats, tCRS); if (!recs.length) throw new Error("No valid geometries found.");
            var pr = null;
            switch (S.exportFormat) {
                case "GeoJSON": exportGeoJSON(recs, tCRS); break;
                case "JSON":    exportJSON(recs, tCRS);    break;
                case "CSV":     exportCSV(recs);           break;
                case "WKT":     exportWKT(recs);           break;
                case "KML":     exportKML(recs);           break;
                case "KMZ":     status.textContent = "⏳ Building KMZ…"; pr = exportKMZ(recs); break;
                case "DXF":     exportDXF(recs, tCRS);     break;
                case "SHP":     status.textContent = "⏳ Building Shapefile ZIP…"; pr = exportSHP(recs); break;
                default: throw new Error("Unsupported format: " + S.exportFormat);
            }
            var labelNote = checked("s17-labels") ? " (+ labels)" : "";
            if (pr && typeof pr.then === "function") {
                pr.then(function () { done("✅ Exported " + recs.length + " feature(s)" + labelNote + " as " + S.exportFormat); })
                  .catch(function (e) { console.error("Stage 17:", e); done("❌ " + (e.message || "Export failed.")); });
            } else { done("✅ Exported " + recs.length + " feature(s)" + labelNote + " as " + S.exportFormat); }
        } catch (e) { console.error("Stage 17 Export Error:", e); done("❌ " + (e.message || "Export failed.")); }
    }

    /* ========================================================
       20. EVENTS + INITIALIZATION
       ======================================================== */
    addEventListener("resize", function () { setTimeout(positionButton, 120); });
    addEventListener("orientationchange", function () { setTimeout(positionButton, 350); });
    addEventListener("beforeunload", function () { try { restorePopups(); } catch (e) {} });
    setInterval(function () { var p = document.getElementById(CONFIG.panelId); if (p && p.style.display === "block") updateSelectionUI(); }, 1500);

    function init(tries) {
        tries = tries || 0;
        if (!getMap()) { if (tries > 30) { console.error("Stage 17: map not found."); return; } return setTimeout(function () { init(tries + 1); }, 600); }
        injectCSS(); createButton(); createPanel(); ensureHighlightLayer();
        setTimeout(function () { refreshPanel(); positionButton(); }, 500);
        setTimeout(function () { refreshPanel(); positionButton(); }, 2000);
        console.log("Stage 17 Advanced Export v4.4 ready.");
    }

    window.Stage17Export = {
        open: openPanel, close: closePanel, enableSelection: enableSelection, disableSelection: disableSelection,
        clearSelection: clearSelection, getSelection: function () { return S.selection.slice(); },
        suppressPopups: suppressPopups, restorePopups: restorePopups, refresh: refreshPanel
    };

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { init(0); });
    else setTimeout(function () { init(0); }, 400);

})();