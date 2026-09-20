// ============================================================
// 📤 STAGE 17 — ADVANCED EXPORT TOOL  (v4.1)
// ============================================================
// QGIS2WEB + OPENLAYERS  —  SINGLE FILE, DROP-IN
//
// EXPORT FORMATS
//   GeoJSON · JSON · CSV · WKT · KML · KMZ · ESRI Shapefile ZIP
//
// SELECTION ENGINE
//   • Single click on unselected polygon = SELECT (Add to selection)
//   • Single click on selected polygon   = UNSELECT (Remove)
//   • Clicking another polygon           = ADDS to current selection
//   • Shift + Drag                       = Box select
//   • Works on UNFILLED / transparent polygons (geometry hit-test)
//
// LAYER STYLING
//   • Preserves original fill, stroke, width, colors, & opacity
//   • Writes native KML/KMZ Styles & GeoJSON simplestyle attributes
//   • Automatically applies extracted label styles (colors, sizing, text)
//
// POPUP MANAGEMENT
//   • Automatically disables popups while the tool is OPEN
//   • Fully restores popups when the tool is CLOSED
//
// LABEL POINTS
//   • Invisible point placemark at polygon interior point
//   • Carries label text (Google Earth / QGIS / ArcGIS compatible)
//
// SAFE
//   • Never modifies original layers or geometries
//   • Highlight layer is UNMANAGED → never shown in layer switcher
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
        hitTolerance: 10,          // pixels
        zIndex: 10001,
        jszipCDN: [
            "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js",
            "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"
        ],
        shpwriteCDN: [
            "https://unpkg.com/shp-write@0.3.2/shpwrite.js",
            "https://cdn.jsdelivr.net/npm/shp-write@0.3.2/shpwrite.js"
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
        selection: [],            // array of ol.Feature
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

        if (typeof map !== "undefined" && map instanceof ol.Map) {
            S.map = map;
            return S.map;
        }
        var names = ["map", "olMap", "myMap", "theMap", "mapObj"];
        for (var i = 0; i < names.length; i++) {
            if (window[names[i]] instanceof ol.Map) {
                S.map = window[names[i]];
                return S.map;
            }
        }
        for (var k in window) {
            try {
                if (window[k] instanceof ol.Map) { S.map = window[k]; return S.map; }
            } catch (e) { /* cross-origin guard */ }
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
        if (!layer.__s17id) {
            _layerCounter++;
            layer.__s17id = "s17L" + _layerCounter;
        }
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

            if (typeof layer.getLayers === "function") {
                layer.getLayers().forEach(walk);
                return;
            }
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
        return String(
            layer.get("name") ||
            layer.get("title") ||
            layer.get("layerName") ||
            "Vector Layer"
        );
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
            if (typeof src.hasFeature === "function") {
                try { if (src.hasFeature(feature)) return ls[i]; } catch (e) {}
            }
            if (src.getFeatures().indexOf(feature) !== -1) return ls[i];
        }
        return null;
    }

    /* ========================================================
       5. POPUP SUPPRESSION & RESTORATION
       ======================================================== */
    var POPUP = {
        active: false,
        listeners: [],
        overlays: [],
        interactions: []
    };

    function suppressPopups() {
        var m = getMap();
        if (!m || POPUP.active) return;

        POPUP.active = true;
        POPUP.listeners = [];
        POPUP.overlays = [];
        POPUP.interactions = [];

        // Detach existing map click / hover event listeners
        ["singleclick", "click", "dblclick", "pointermove"].forEach(function (type) {
            var arr = null;
            try {
                if (typeof m.getListeners === "function") arr = m.getListeners(type);
            } catch (e) {}
            if (!arr || !arr.length) return;
            arr.slice().forEach(function (fn) {
                if (!fn || fn.__s17own) return;
                POPUP.listeners.push({ type: type, fn: fn });
                try { m.un(type, fn); } catch (e) {}
            });
        });

        // Hide overlay popups
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

        // Deactivate external select interactions
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

        // Re-attach listeners
        POPUP.listeners.forEach(function (o) {
            try { m.on(o.type, o.fn); } catch (e) {}
        });
        POPUP.listeners = [];

        // Restore overlays
        POPUP.overlays.forEach(function (o) {
            try {
                var el = o.ov.getElement();
                if (el) el.style.display = o.disp || "";
            } catch (e) {}
        });
        POPUP.overlays = [];

        // Restore interactions
        POPUP.interactions.forEach(function (o) {
            try { o.it.setActive(o.active); } catch (e) {}
        });
        POPUP.interactions = [];

        document.body.classList.remove("s17-nopopup");
    }

    function syncPopups() {
        var p = document.getElementById(CONFIG.panelId);
        var open = p && p.style.display === "block";
        if (open || S.selectActive) {
            suppressPopups();
        } else {
            restorePopups();
        }
    }

    /* ========================================================
       6. SELECTION ENGINE (Click = Toggle & Multi-Select)
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

    /**
     * Hit detection: renderer check with Geometry intersection fallback
     * (ensures transparent / unfilled polygons are easily clickable)
     */
    function featuresAtPixel(pixel, restrictLayer) {
        var m = getMap();
        var found = [];
        var seen = [];

        function push(f, l) {
            if (!f || seen.indexOf(f) !== -1) return;
            seen.push(f);
            found.push({ feature: f, layer: l });
        }

        // 1. Renderer hit detection
        m.forEachFeatureAtPixel(
            pixel,
            function (feature, layer) {
                if (!layer || layer === S.highlightLayer) return;
                if (restrictLayer && layer !== restrictLayer) return;
                if (!(feature instanceof ol.Feature)) return;
                push(feature, layer);
            },
            {
                hitTolerance: CONFIG.hitTolerance,
                layerFilter: function (l) {
                    return l !== S.highlightLayer && !l.get("__s17internal");
                }
            }
        );

        if (found.length) return found;

        // 2. Geometry coordinate fallback
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
            } else {
                candidates = src.getFeatures();
            }

            for (var ci = 0; ci < candidates.length; ci++) {
                var f = candidates[ci];
                var g = f.getGeometry();
                if (!g) continue;
                var type = g.getType();

                if (type === "Polygon" || type === "MultiPolygon") {
                    if (g.intersectsCoordinate(coord)) { push(f, layer); }
                } else {
                    var cp = g.getClosestPoint(coord);
                    if (Math.sqrt(Math.pow(cp[0] - coord[0], 2) + Math.pow(cp[1] - coord[1], 2)) <= tol) {
                        push(f, layer);
                    }
                }
            }
            if (found.length) break;
        }

        return found;
    }

    /**
     * Map Click:
     * - Unselected polygon => Add to selection
     * - Same polygon clicked again => Unselect
     * - Click other polygon => Add to current selection
     */
    function onMapClick(evt) {
        if (!S.selectActive) return;

        var hits = featuresAtPixel(evt.pixel, null);

        if (!hits.length) {
            // Clicking blank map keeps current selection
            return;
        }

        var hit = hits[0];
        var wasEmpty = (S.selection.length === 0);

        // Auto-switch current layer on first click
        if (wasEmpty && hit.layer && hit.layer !== S.currentLayer) {
            S.currentLayer = hit.layer;
            var sel = document.getElementById("s17-layer");
            if (sel) sel.value = layerId(hit.layer);
            refreshFields();
        }

        var idx = S.selection.indexOf(hit.feature);

        if (idx === -1) {
            // Add polygon to current selection
            S.selection.push(hit.feature);
        } else {
            // Unselect same polygon
            S.selection.splice(idx, 1);
        }

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
        if (S.dragBox) { m.removeInteraction(S.dragBox); }

        m.getTargetElement().style.cursor = "";
        syncPopups();
        updateSelectionUI();
    }

    function toggleSelection() {
        if (S.selectActive) disableSelection(); else enableSelection();
    }

    function clearSelection() {
        S.selection = [];
        refreshHighlight();
    }

    function externalSelection() {
        var m = getMap();
        var out = [];
        if (!m) return out;

        m.getInteractions().forEach(function (it) {
            if (it instanceof ol.interaction.Select) {
                var c = it.getFeatures();
                if (c && c.getArray) {
                    c.getArray().forEach(function (f) { if (out.indexOf(f) === -1) out.push(f); });
                }
            }
        });

        var globals = ["selectedFeatures", "selectedFeature", "highlightedFeatures"];
        for (var i = 0; i < globals.length; i++) {
            var g = window[globals[i]];
            if (!g) continue;
            if (g instanceof ol.Feature) { if (out.indexOf(g) === -1) out.push(g); continue; }
            if (g && typeof g.getArray === "function") g = g.getArray();
            if (Array.isArray(g)) {
                g.forEach(function (f) { if (f instanceof ol.Feature && out.indexOf(f) === -1) out.push(f); });
            }
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
            if ((f.get("__selected") === true || f.get("selected") === true ||
                 f.get("_selected") === true) && pool.indexOf(f) === -1) pool.push(f);
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
        try { c.transform(from, to); } catch (e) {
            console.warn("Stage 17: transform " + from + "→" + to + " failed", e);
        }
        return c;
    }

    function geodesicArea(geom, from) {
        var t = geom.getType();
        if (t !== "Polygon" && t !== "MultiPolygon") return null;
        try {
            var g = transformGeom(geom, from, "EPSG:4326");
            return ol.sphere.getArea(g, { projection: "EPSG:4326" });
        } catch (e) { return null; }
    }

    function geodesicLength(geom, from) {
        var t = geom.getType();
        if (["Polygon", "MultiPolygon", "LineString", "MultiLineString"].indexOf(t) === -1) return null;
        try {
            var g = transformGeom(geom, from, "EPSG:4326");
            return ol.sphere.getLength(g, { projection: "EPSG:4326" });
        } catch (e) { return null; }
    }

    /**
     * LABEL / CENTROID POINT
     * Uses getInteriorPoint() — guaranteed INSIDE the polygon
     */
    function labelPointOf(geom) {
        if (!geom) return null;
        var t = geom.getType();
        try {
            if (t === "Polygon") {
                return geom.getInteriorPoint().getCoordinates().slice(0, 2);
            }
            if (t === "MultiPolygon") {
                var polys = geom.getPolygons(), best = null, bestA = -1;
                for (var i = 0; i < polys.length; i++) {
                    var a = polys[i].getArea();
                    if (a > bestA) { bestA = a; best = polys[i]; }
                }
                if (best) return best.getInteriorPoint().getCoordinates().slice(0, 2);
            }
            if (t === "Point") return geom.getCoordinates().slice(0, 2);
            if (t === "MultiPoint") return geom.getPoint(0).getCoordinates().slice(0, 2);
            if (t === "LineString") return geom.getCoordinateAt(0.5).slice(0, 2);
            if (t === "MultiLineString") return geom.getLineString(0).getCoordinateAt(0.5).slice(0, 2);
        } catch (e) { /* fallback */ }

        var e2 = geom.getExtent();
        return [(e2[0] + e2[2]) / 2, (e2[1] + e2[3]) / 2];
    }

    function areaBreakdown(m2) {
        if (m2 === null || m2 === undefined || isNaN(m2)) return {};
        var d = CONFIG.areaDecimals;
        return {
            Area_m2: +(m2).toFixed(d),
            Area_ha: +(m2 / 10000).toFixed(d),
            Area_acre: +(m2 / 4046.8564224).toFixed(d),
            Area_cent: +(m2 / 40.468564224).toFixed(d),
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
            if (Array.isArray(c)) {
                return { r: c[0] | 0, g: c[1] | 0, b: c[2] | 0, a: (c.length > 3 ? c[3] : 1) };
            }
            if (typeof c === "string") {
                if (ol.color && typeof ol.color.asArray === "function") {
                    var a = ol.color.asArray(c);
                    return { r: a[0], g: a[1], b: a[2], a: (a.length > 3 ? a[3] : 1) };
                }
                if (!_colorCanvas) {
                    _colorCanvas = document.createElement("canvas");
                    _colorCanvas.width = _colorCanvas.height = 1;
                }
                var ctx = _colorCanvas.getContext("2d");
                ctx.clearRect(0, 0, 1, 1);
                ctx.fillStyle = "#000000";
                ctx.fillStyle = c;
                ctx.fillRect(0, 0, 1, 1);
                var d = ctx.getImageData(0, 0, 1, 1).data;
                return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
            }
        } catch (e) {}
        return null;
    }

    function hx(n) {
        n = Math.max(0, Math.min(255, Math.round(n || 0)));
        return (n < 16 ? "0" : "") + n.toString(16);
    }

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
            if (!s) {
                var fs = feature.getStyle && feature.getStyle();
                if (fs) s = (typeof fs === "function") ? fs(feature, res) : fs;
            }
        } catch (e) {}
        if (!s && layer) {
            try {
                var lsf = layer.getStyleFunction && layer.getStyleFunction();
                if (lsf) s = lsf(feature, res);
                if (!s) {
                    var lst = layer.getStyle && layer.getStyle();
                    if (lst) s = (typeof lst === "function") ? lst(feature, res) : lst;
                }
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
            icon: null, iconScale: 1,
            textColor: null, textScale: 1, text: "",
            opacity: (layer && layer.getOpacity) ? layer.getOpacity() : 1
        };

        for (var i = 0; i < styles.length; i++) {
            var st = styles[i];
            if (!st) continue;
            try {
                var f = st.getFill && st.getFill();
                if (f && !sym.fill) { var c = parseColor(f.getColor()); if (c) sym.fill = c; }

                var s2 = st.getStroke && st.getStroke();
                if (s2 && !sym.stroke) {
                    var c2 = parseColor(s2.getColor());
                    if (c2) { sym.stroke = c2; sym.width = s2.getWidth() || 1; }
                }

                var im = st.getImage && st.getImage();
                if (im && !sym.icon && sym.radius === null) {
                    if (typeof im.getSrc === "function" && im.getSrc()) {
                        sym.icon = im.getSrc();
                        sym.iconScale = im.getScale() || 1;
                    } else if (typeof im.getRadius === "function") {
                        sym.radius = im.getRadius() || 5;
                        var iF = im.getFill && im.getFill();
                        if (iF) { var c3 = parseColor(iF.getColor()); if (c3 && !sym.fill) sym.fill = c3; }
                        var iS = im.getStroke && im.getStroke();
                        if (iS) {
                            var c4 = parseColor(iS.getColor());
                            if (c4 && !sym.stroke) { sym.stroke = c4; sym.width = iS.getWidth() || 1; }
                        }
                    }
                }

                var tx = st.getText && st.getText();
                if (tx) {
                    var tf = tx.getFill && tx.getFill();
                    if (tf) { var c5 = parseColor(tf.getColor()); if (c5) sym.textColor = c5; }
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
    function checked(id) {
        var el = document.getElementById(id);
        return el ? el.checked : false;
    }

    function selectedFields() {
        var cbs = document.querySelectorAll("#s17-fields .s17-field input[type=checkbox]");
        var out = [];
        for (var i = 0; i < cbs.length; i++) {
            if (cbs[i].checked && cbs[i].dataset.field) out.push(cbs[i].dataset.field);
        }
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
            if (!ol.proj.get(v)) {
                throw new Error(v + " is not registered. Load proj4js + ol.proj.proj4.register() first.");
            }
            return v;
        }
        if (!ol.proj.get(S.exportCRS)) {
            throw new Error(S.exportCRS + " is not available. Use EPSG:4326 / EPSG:3857 or register it with proj4.");
        }
        return S.exportCRS;
    }

    function buildRecords(features, tCRS) {
        var fields = selectedFields();
        var src = mapCRS();
        var m = getMap();
        var res = m ? m.getView().getResolution() : 1;

        var wantArea = checked("s17-area");
        var wantPerim = checked("s17-perimeter");
        var wantCentroid = checked("s17-centroid");
        var wantXY = checked("s17-coords");
        var wantLabels = checked("s17-labels");
        var keepStyle = checked("s17-style");

        var records = [];

        for (var i = 0; i < features.length; i++) {
            var f = features[i];
            var geomSrc = f.getGeometry();
            if (!geomSrc) continue;

            var type = geomSrc.getType();
            var geomOut = transformGeom(geomSrc, src, tCRS);
            var props = f.getProperties();
            var rec = {};

            rec.Export_ID = i + 1;

            // ---- Attributes ----
            for (var k = 0; k < fields.length; k++) {
                var key = fields[k], val = props[key];
                if (val === undefined || val === null) val = "";
                else if (val instanceof ol.geom.Geometry) continue;
                else if (val instanceof Date) val = val.toISOString();
                else if (typeof val === "object") {
                    try { val = JSON.stringify(val); } catch (e) { val = String(val); }
                }
                rec[key] = val;
            }

            // ---- Area ----
            if (wantArea && (type === "Polygon" || type === "MultiPolygon")) {
                var ab = areaBreakdown(geodesicArea(geomSrc, src));
                for (var ak in ab) if (ab.hasOwnProperty(ak)) rec[ak] = ab[ak];
            }

            // ---- Perimeter / Length ----
            if (wantPerim) {
                var len = geodesicLength(geomSrc, src);
                if (len !== null) {
                    rec[(type === "Polygon" || type === "MultiPolygon") ? "Perimeter_m" : "Length_m"] = num(len, 3);
                }
            }

            // ---- Centroid / Label Point ----
            var lblMap = labelPointOf(geomSrc);
            var lblTgt = null;
            if (lblMap) {
                var pt = new ol.geom.Point(lblMap);
                lblTgt = transformGeom(pt, src, tCRS).getCoordinates();
            }

            if (wantCentroid && lblTgt) {
                rec.Centroid_X = num(lblTgt[0]);
                rec.Centroid_Y = num(lblTgt[1]);
            }

            // ---- Point X/Y ----
            if (wantXY) {
                if (type === "Point") {
                    var c = geomOut.getCoordinates();
                    rec.X = num(c[0]); rec.Y = num(c[1]);
                    if (c.length > 2) rec.Z = num(c[2], 3);
                } else if (type === "MultiPoint") {
                    var c2 = geomOut.getPoint(0).getCoordinates();
                    rec.X = num(c2[0]); rec.Y = num(c2[1]);
                }
            }

            var sym = null;
            if (keepStyle) {
                var lyr = findFeatureLayer(f) || S.currentLayer;
                sym = extractSymbol(f, lyr, res);
            }

            // ---- Label Text ----
            var labelText = "";
            if (sym && sym.text) {
                labelText = String(sym.text);
            }
            if (!labelText) {
                var pref = ["name", "Name", "NAME", "label", "Label", "id", "ID", "survey_no", "plot_no", "lpm_no", "title"];
                for (var pi = 0; pi < pref.length; pi++) {
                    if (props[pref[pi]] !== undefined && props[pref[pi]] !== null && props[pref[pi]] !== "") {
                        labelText = String(props[pref[pi]]);
                        break;
                    }
                }
            }
            if (!labelText) labelText = "F" + rec.Export_ID;

            if (wantLabels && lblTgt) {
                rec.Label = labelText;
                rec.Label_X = num(lblTgt[0]);
                rec.Label_Y = num(lblTgt[1]);
            }

            records.push({
                srcGeom: geomSrc,
                geometry: geomOut,
                labelMap: lblMap,
                labelTgt: lblTgt,
                labelText: labelText,
                geomType: type,
                style: sym,
                properties: rec
            });
        }
        return records;
    }

    /* ========================================================
       10. FILE DOWNLOAD HELPERS
       ======================================================== */
    function downloadBlob(blob, filename) {
        if (typeof blob === "string") {
            try {
                var bin = atob(blob), arr = new Uint8Array(bin.length);
                for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
                blob = new Blob([arr], { type: "application/zip" });
            } catch (e) {
                blob = new Blob([blob], { type: "application/octet-stream" });
            }
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
                if (i >= urls.length) return reject(new Error("Could not load " + globalName + " (check network connection)."));
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
        if (sym.fill) {
            var fh = partsToHex(sym.fill);
            f.set("fill", fh);
            f.set("fill-opacity", +((sym.fill.a === undefined ? 1 : sym.fill.a) * op).toFixed(3));
            f.set("marker-color", fh);
        }
        if (sym.stroke) {
            f.set("stroke", partsToHex(sym.stroke));
            f.set("stroke-opacity", +((sym.stroke.a === undefined ? 1 : sym.stroke.a) * op).toFixed(3));
            f.set("stroke-width", sym.width || 1);
        }
        if (sym.radius) f.set("marker-radius", sym.radius);
    }

    function recordsToOlFeatures(records, includeLabels, keepStyle) {
        var out = [];
        for (var i = 0; i < records.length; i++) {
            var r = records[i];
            var f = new ol.Feature({ geometry: r.geometry.clone() });
            for (var k in r.properties) if (r.properties.hasOwnProperty(k)) f.set(k, r.properties[k]);
            if (keepStyle) applySimpleStyle(f, r.style);
            out.push(f);
        }
        if (includeLabels) {
            for (var j = 0; j < records.length; j++) {
                var rr = records[j];
                if (!rr.labelTgt) continue;
                var lf = new ol.Feature({ geometry: new ol.geom.Point(rr.labelTgt) });
                lf.set("Export_ID", rr.properties.Export_ID);
                lf.set("Label", rr.labelText);
                lf.set("FeatureType", "LABEL_POINT");
                lf.set("marker-opacity", 0);
                out.push(lf);
            }
        }
        return out;
    }

    function exportGeoJSON(records, tCRS) {
        var fmt = new ol.format.GeoJSON();
        var feats = recordsToOlFeatures(records, checked("s17-labels"), checked("s17-style"));
        var gj = fmt.writeFeaturesObject(feats, {
            featureProjection: tCRS,
            dataProjection: tCRS,
            decimals: CONFIG.coordDecimals
        });
        gj.crs = { type: "name", properties: { name: tCRS } };
        downloadText(JSON.stringify(gj, null, 2), baseName() + ".geojson", "application/geo+json");
    }

    function exportJSON(records, tCRS) {
        var out = {
            type: "Stage17Export",
            crs: tCRS,
            exported: new Date().toISOString(),
            layer: S.currentLayer ? layerName(S.currentLayer) : "",
            count: records.length,
            features: records.map(function (r) {
                return {
                    geometryType: r.geomType,
                    coordinates: r.geometry.getCoordinates(),
                    labelPoint: r.labelTgt,
                    label: r.labelText,
                    style: r.style ? {
                        fill: partsToHex(r.style.fill),
                        fillOpacity: r.style.fill ? r.style.fill.a : null,
                        stroke: partsToHex(r.style.stroke),
                        strokeOpacity: r.style.stroke ? r.style.stroke.a : null,
                        strokeWidth: r.style.width
                    } : null,
                    properties: r.properties
                };
            })
        };
        downloadText(JSON.stringify(out, null, 2), baseName() + ".json", "application/json");
    }

    function csvCell(v) {
        if (v === null || v === undefined) return "";
        var t = String(v);
        if (/[",\r\n;]/.test(t)) t = '"' + t.replace(/"/g, '""') + '"';
        return t;
    }

    function allKeys(records) {
        var set = {}, order = [];
        records.forEach(function (r) {
            Object.keys(r.properties).forEach(function (k) {
                if (!set[k]) { set[k] = 1; order.push(k); }
            });
        });
        return order;
    }

    function exportCSV(records) {
        var keys = allKeys(records);
        var lines = [keys.map(csvCell).join(",")];
        records.forEach(function (r) {
            lines.push(keys.map(function (k) { return csvCell(r.properties[k]); }).join(","));
        });
        downloadText("\uFEFF" + lines.join("\r\n"), baseName() + ".csv", "text/csv");
    }

    function exportWKT(records) {
        var fmt = new ol.format.WKT();
        var keys = allKeys(records);
        var lines = [["WKT"].concat(keys).map(csvCell).join(",")];
        records.forEach(function (r) {
            var row = [csvCell(fmt.writeGeometry(r.geometry))];
            keys.forEach(function (k) { row.push(csvCell(r.properties[k])); });
            lines.push(row.join(","));
        });
        downloadText("\uFEFF" + lines.join("\r\n"), baseName() + "_wkt.csv", "text/csv");
    }

    /* ========================================================
       12. KML / KMZ (Layer Styles + Invisible Label Centroids)
       ======================================================== */
    function xmlEsc(s) {
        return String(s === null || s === undefined ? "" : s)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
    }

    function kmlCoord(c) {
        var x = Number(c[0]).toFixed(CONFIG.coordDecimals);
        var y = Number(c[1]).toFixed(CONFIG.coordDecimals);
        var z = (c.length > 2 && !isNaN(c[2])) ? Number(c[2]).toFixed(2) : "0";
        return x + "," + y + "," + z;
    }

    function kmlCoordList(arr) {
        var o = [];
        for (var i = 0; i < arr.length; i++) o.push(kmlCoord(arr[i]));
        return o.join(" ");
    }

    function kmlRing(ring) {
        return "<LinearRing><coordinates>" + kmlCoordList(ring) + "</coordinates></LinearRing>";
    }

    function kmlPolygonBody(rings) {
        var s = "<Polygon><tessellate>1</tessellate><altitudeMode>clampToGround</altitudeMode>";
        s += "<outerBoundaryIs>" + kmlRing(rings[0]) + "</outerBoundaryIs>";
        for (var i = 1; i < rings.length; i++) {
            s += "<innerBoundaryIs>" + kmlRing(rings[i]) + "</innerBoundaryIs>";
        }
        return s + "</Polygon>";
    }

    function geomToKML(g) {
        var t = g.getType(), parts;
        switch (t) {
            case "Point":
                return "<Point><altitudeMode>clampToGround</altitudeMode><coordinates>" +
                       kmlCoord(g.getCoordinates()) + "</coordinates></Point>";
            case "LineString":
                return "<LineString><tessellate>1</tessellate><altitudeMode>clampToGround</altitudeMode><coordinates>" +
                       kmlCoordList(g.getCoordinates()) + "</coordinates></LineString>";
            case "LinearRing":
                return kmlRing(g.getCoordinates());
            case "Polygon":
                return kmlPolygonBody(g.getCoordinates());
            case "MultiPoint":
                parts = g.getCoordinates().map(function (c) {
                    return "<Point><coordinates>" + kmlCoord(c) + "</coordinates></Point>";
                });
                return "<MultiGeometry>" + parts.join("") + "</MultiGeometry>";
            case "MultiLineString":
                parts = g.getCoordinates().map(function (ls) {
                    return "<LineString><tessellate>1</tessellate><coordinates>" + kmlCoordList(ls) + "</coordinates></LineString>";
                });
                return "<MultiGeometry>" + parts.join("") + "</MultiGeometry>";
            case "MultiPolygon":
                parts = g.getCoordinates().map(function (rings) { return kmlPolygonBody(rings); });
                return "<MultiGeometry>" + parts.join("") + "</MultiGeometry>";
            case "GeometryCollection":
                parts = g.getGeometries().map(geomToKML);
                return "<MultiGeometry>" + parts.join("") + "</MultiGeometry>";
            default:
                return "";
        }
    }

    function kmlExtendedData(props) {
        var s = "<ExtendedData>";
        for (var k in props) {
            if (!props.hasOwnProperty(k)) continue;
            s += '<Data name="' + xmlEsc(k) + '"><value>' + xmlEsc(props[k]) + "</value></Data>";
        }
        return s + "</ExtendedData>";
    }

    function kmlDescription(props) {
        var rows = "";
        for (var k in props) {
            if (!props.hasOwnProperty(k)) continue;
            rows += '<tr><td style="padding:2px 8px;background:#f0f0f0;"><b>' + xmlEsc(k) +
                    '</b></td><td style="padding:2px 8px;">' + xmlEsc(props[k]) + "</td></tr>";
        }
        return "<![CDATA[<table style='border-collapse:collapse;font-family:Arial;font-size:12px;'>" +
               rows + "</table>]]>";
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
            if (sym && sym.fill) {
                x += "<PolyStyle><color>" + partsToKml(sym.fill, op) + "</color><fill>1</fill><outline>1</outline></PolyStyle>";
            } else if (sym) {
                x += "<PolyStyle><fill>0</fill><outline>1</outline></PolyStyle>";
            } else {
                x += "<PolyStyle><color>4d00ffff</color><fill>1</fill><outline>1</outline></PolyStyle>";
            }
        } else if (kind === "L") {
            x += "<LineStyle><color>" + lineColor + "</color><width>" + lineWidth + "</width></LineStyle>";
        } else {
            var href = "http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png";
            var scale = sym && sym.radius ? Math.max(0.4, Math.min(3, sym.radius / 8)) : 1.0;
            var color = (sym && sym.fill) ? partsToKml(sym.fill, op) : "ff00a5ff";
            x += "<IconStyle><color>" + color + "</color><scale>" + scale + "</scale>" +
                 "<Icon><href>" + xmlEsc(href) + "</href></Icon>" +
                 '<hotSpot x="0.5" y="0.5" xunits="fraction" yunits="fraction"/></IconStyle>';
            if (sym && sym.stroke) {
                x += "<LineStyle><color>" + lineColor + "</color><width>" + lineWidth + "</width></LineStyle>";
            }
        }
        x += "<BalloonStyle><text>$[description]</text></BalloonStyle>";
        return x + "</Style>";
    }

    function buildKML(records, opts) {
        opts = opts || {};
        var src = mapCRS();
        var withLabels = !!opts.labels;
        var keepStyle = !!opts.keepStyle;
        var uiColor = opts.labelColor || "#ffff00";
        var uiScale = opts.labelScale || 1.0;
        var docName = opts.name || baseName();

        var styleDefs = [], styleMap = {}, sCount = 0;
        var labelDefs = [], labelMap = {}, lCount = 0;

        function styleIdFor(sym, geomType) {
            var kind = geomType.indexOf("Polygon") !== -1 ? "A"
                     : geomType.indexOf("Line") !== -1 ? "L" : "P";
            var key = symKey(keepStyle ? sym : null, kind);
            if (styleMap[key]) return styleMap[key];
            var id = "s17sty" + (sCount++);
            styleMap[key] = id;
            styleDefs.push(kmlStyleBlock(id, keepStyle ? sym : null, kind));
            return id;
        }

        function labelIdFor(hexColor, scale) {
            var key = hexColor + "|" + scale;
            if (labelMap[key]) return labelMap[key];
            var id = "s17lbl" + (lCount++);
            labelMap[key] = id;
            labelDefs.push(
                '<Style id="' + id + '">' +
                  "<IconStyle>" +
                    "<color>00ffffff</color>" + // Fully transparent icon
                    "<scale>0.3</scale>" +
                    "<Icon><href>http://maps.google.com/mapfiles/kml/shapes/shaded_dot.png</href></Icon>" +
                    '<hotSpot x="0.5" y="0.5" xunits="fraction" yunits="fraction"/>' +
                  "</IconStyle>" +
                  "<LabelStyle><color>" + kmlColor(hexColor, 1) + "</color><scale>" + scale + "</scale></LabelStyle>" +
                  "<BalloonStyle><text>$[description]</text></BalloonStyle>" +
                "</Style>"
            );
            return id;
        }

        var body = [];
        body.push("<Folder><name>" + xmlEsc(docName) + " — Features</name><open>1</open>");

        for (var i = 0; i < records.length; i++) {
            var r = records[i];
            var g4326 = transformGeom(r.srcGeom, src, "EPSG:4326");
            if (!g4326) continue;
            var sid = styleIdFor(r.style, r.geomType);

            body.push("<Placemark>");
            body.push("<name>" + xmlEsc(r.labelText) + "</name>");
            body.push("<description>" + kmlDescription(r.properties) + "</description>");
            body.push("<styleUrl>#" + sid + "</styleUrl>");
            body.push(kmlExtendedData(r.properties));
            body.push(geomToKML(g4326));
            body.push("</Placemark>");
        }
        body.push("</Folder>");

        // Centroid Label points
        if (withLabels) {
            body.push("<Folder><name>Labels (centroid points)</name><open>0</open>");
            for (var j = 0; j < records.length; j++) {
                var rec = records[j];
                if (!rec.labelMap) continue;
                var p4326 = transformGeom(new ol.geom.Point(rec.labelMap), src, "EPSG:4326");
                var c = p4326.getCoordinates();

                var col = uiColor;
                var scale = uiScale;
                if (keepStyle && rec.style) {
                    if (rec.style.textColor) {
                        col = partsToHex(rec.style.textColor) || uiColor;
                    }
                    if (rec.style.textScale) {
                        scale = rec.style.textScale;
                    }
                }
                var lid = labelIdFor(col, scale);

                body.push("<Placemark>");
                body.push("<name>" + xmlEsc(rec.labelText) + "</name>");
                body.push("<description>" + kmlDescription(rec.properties) + "</description>");
                body.push("<styleUrl>#" + lid + "</styleUrl>");
                body.push('<ExtendedData><Data name="FeatureType"><value>LABEL_POINT</value></Data>' +
                          '<Data name="Export_ID"><value>' + xmlEsc(rec.properties.Export_ID) + "</value></Data></ExtendedData>");
                body.push("<Point><altitudeMode>clampToGround</altitudeMode><coordinates>" +
                          kmlCoord(c) + "</coordinates></Point>");
                body.push("</Placemark>");
            }
            body.push("</Folder>");
        }

        var K = [];
        K.push('<?xml version="1.0" encoding="UTF-8"?>');
        K.push('<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">');
        K.push("<Document>");
        K.push("<name>" + xmlEsc(docName) + "</name>");
        K.push("<description>" + xmlEsc("Exported " + new Date().toLocaleString() + " — " + records.length + " feature(s)") + "</description>");
        K = K.concat(styleDefs).concat(labelDefs).concat(body);
        K.push("</Document></kml>");
        return K.join("\n");
    }

    function kmlOptions() {
        return {
            labels: checked("s17-labels"),
            keepStyle: checked("s17-style")
        };
    }

    function exportKML(records) {
        var kml = buildKML(records, kmlOptions());
        downloadText(kml, baseName() + ".kml", "application/vnd.google-earth.kml+xml");
    }

    function exportKMZ(records) {
        return loadScript(CONFIG.jszipCDN, "JSZip").then(function (JSZip) {
            var kml = buildKML(records, kmlOptions());
            var zip = new JSZip();
            zip.file("doc.kml", kml);
            return zip.generateAsync({
                type: "blob",
                mimeType: "application/vnd.google-earth.kmz",
                compression: "DEFLATE",
                compressionOptions: { level: 9 }
            });
        }).then(function (blob) {
            downloadBlob(blob, baseName() + ".kmz");
        });
    }

    /* ========================================================
       13. SHAPEFILE EXPORTER
       ======================================================== */
    function exportSHP(records) {
        return loadScript(CONFIG.shpwriteCDN, "shpwrite").then(function (shpwrite) {
            var src = mapCRS();
            var fmt = new ol.format.GeoJSON();
            var keepStyle = checked("s17-style");
            var feats = [];

            function shortProps(p) {
                var o = {}, used = {};
                for (var k in p) {
                    if (!p.hasOwnProperty(k)) continue;
                    var nm = k.substring(0, 10), n = 1;
                    while (used[nm]) { nm = k.substring(0, 8) + (++n); }
                    used[nm] = 1;
                    o[nm] = p[k];
                }
                return o;
            }

            records.forEach(function (r) {
                var f = new ol.Feature({ geometry: transformGeom(r.srcGeom, src, "EPSG:4326") });
                var sp = shortProps(r.properties);
                for (var k in sp) f.set(k, sp[k]);
                if (keepStyle && r.style) {
                    if (r.style.fill) f.set("FILL", partsToHex(r.style.fill));
                    if (r.style.stroke) {
                        f.set("STROKE", partsToHex(r.style.stroke));
                        f.set("STROKE_W", r.style.width || 1);
                    }
                }
                feats.push(f);
            });

            if (checked("s17-labels")) {
                records.forEach(function (r) {
                    if (!r.labelMap) return;
                    var lf = new ol.Feature({
                        geometry: transformGeom(new ol.geom.Point(r.labelMap), src, "EPSG:4326")
                    });
                    lf.set("EXPORT_ID", r.properties.Export_ID);
                    lf.set("LABEL", r.labelText);
                    lf.set("FTYPE", "LABEL");
                    feats.push(lf);
                });
            }

            var gj = fmt.writeFeaturesObject(feats, {
                featureProjection: "EPSG:4326",
                dataProjection: "EPSG:4326"
            });

            var opts = {
                folder: baseName(),
                types: {
                    point: baseName() + "_points",
                    polygon: baseName() + "_polygons",
                    line: baseName() + "_lines",
                    multipoint: baseName() + "_points",
                    multipolygon: baseName() + "_polygons",
                    multilinestring: baseName() + "_lines"
                }
            };

            if (typeof shpwrite.zip === "function") {
                var content = shpwrite.zip(gj, opts);
                if (content && typeof content.then === "function") {
                    return content.then(function (c) { downloadBlob(c, baseName() + "_shp.zip"); });
                }
                downloadBlob(content, baseName() + "_shp.zip");
            } else if (typeof shpwrite.download === "function") {
                shpwrite.download(gj, opts);
            } else {
                throw new Error("Unrecognised shp-write API.");
            }
        });
    }

    /* ========================================================
       14. FEATURE SELECTION FOR EXPORT
       ======================================================== */
    function featuresForExport() {
        if (!S.currentLayer) return [];
        var src = S.currentLayer.getSource();
        if (!src) return [];
        var all = src.getFeatures();

        if (S.exportMode === "all") return all.slice();

        if (S.exportMode === "extent") {
            var m = getMap();
            var ext = m.getView().calculateExtent(m.getSize());
            return all.filter(function (f) {
                var g = f.getGeometry();
                return g && g.intersectsExtent(ext);
            });
        }

        if (S.exportMode === "selected") return selectedForCurrentLayer();

        return [];
    }

    /* ========================================================
       15. UI — CSS
       ======================================================== */
    function injectCSS() {
        if (document.getElementById("s17-css")) return;
        var P = "#" + CONFIG.panelId;
        var css = "\
" + P + " *{box-sizing:border-box;}\
" + P + " .s17-head{display:flex;align-items:center;justify-content:space-between;padding:13px 14px;background:linear-gradient(135deg,#111827,#374151);color:#fff;border-radius:12px 12px 0 0;}\
" + P + " .s17-t{font-size:15px;font-weight:700;}\
" + P + " .s17-st{font-size:10.5px;opacity:.7;margin-top:2px;}\
" + P + " .s17-x{width:28px;height:28px;border:0;border-radius:6px;background:rgba(255,255,255,.15);color:#fff;font-size:20px;line-height:1;cursor:pointer;}\
" + P + " .s17-x:hover{background:rgba(255,255,255,.3);}\
" + P + " .s17-body{padding:13px;}\
" + P + " label{display:block;font-size:11.5px;font-weight:600;margin:0 0 4px;color:#374151;}\
" + P + " select,input[type=text],input[type=number]{width:100%;height:36px;padding:0 9px;margin:0 0 10px;border:1px solid #d1d5db;border-radius:7px;background:#fff;color:#111;font-size:12.5px;outline:none;}\
" + P + " select:focus,input:focus{border-color:#2563eb;box-shadow:0 0 0 2px rgba(37,99,235,.12);}\
" + P + " .s17-sec{font-size:11px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;color:#6b7280;margin:14px 0 8px;padding-top:10px;border-top:1px solid #e5e7eb;}\
" + P + " .s17-chk{display:flex;align-items:center;gap:8px;margin:6px 0;font-size:12px;font-weight:400;cursor:pointer;color:#111;}\
" + P + " .s17-chk input{width:15px;height:15px;margin:0;cursor:pointer;flex:0 0 auto;}\
" + P + " .s17-row{display:flex;gap:6px;}\
" + P + " .s17-row>*{flex:1;}\
" + P + " .s17-btn{height:32px;border:1px solid #d1d5db;border-radius:6px;background:#fff;color:#374151;font-size:11.5px;font-weight:600;cursor:pointer;padding:0 6px;}\
" + P + " .s17-btn:hover{background:#f3f4f6;}\
" + P + " .s17-btn.on{background:#16a34a;border-color:#16a34a;color:#fff;}\
" + P + " .s17-fields{margin:8px 0 12px;padding:9px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;max-height:150px;overflow-y:auto;}\
" + P + " .s17-field{display:flex;align-items:center;gap:7px;margin:4px 0;font-size:11px;font-weight:400;}\
" + P + " .s17-ftitle{font-size:10.5px;font-weight:800;margin-bottom:6px;color:#6b7280;}\
" + P + " .s17-info{padding:7px 9px;margin:0 0 10px;border-radius:6px;font-size:11px;border:1px solid;line-height:1.45;}\
" + P + " .s17-info.ok{background:#dcfce7;border-color:#22c55e;color:#14532d;}\
" + P + " .s17-info.warn{background:#fef3c7;border-color:#f59e0b;color:#92400e;}\
" + P + " .s17-status{padding:8px 10px;margin:10px 0;background:#f3f4f6;border-radius:7px;color:#4b5563;font-size:11px;word-break:break-word;line-height:1.5;}\
" + P + " .s17-go{width:100%;height:42px;border:0;border-radius:8px;background:#2563eb;color:#fff;font-size:13px;font-weight:800;cursor:pointer;box-shadow:0 2px 6px rgba(37,99,235,.3);}\
" + P + " .s17-go:hover{background:#1d4ed8;}\
" + P + " .s17-go:disabled{opacity:.55;cursor:not-allowed;}\
.s17-dragbox{border:2px dashed #2563eb;background:rgba(37,99,235,.12);}\
body.s17-nopopup .ol-popup,body.s17-nopopup #popup,body.s17-nopopup .ol-popup-content,\
body.s17-nopopup #popup-content,body.s17-nopopup .popup-content,body.s17-nopopup .ol-tooltip{display:none!important;}\
@media(max-width:650px){" + P + "{top:52px!important;right:6px!important;width:calc(100vw - 12px)!important;max-height:calc(100vh - 62px)!important;}}\
";
        var st = document.createElement("style");
        st.id = "s17-css";
        st.textContent = css;
        document.head.appendChild(st);
    }

    /* ========================================================
       16. UI — BUTTON & CONTROLS
       ======================================================== */
    function openPanel() {
        var p = document.getElementById(CONFIG.panelId);
        if (!p) return;
        p.style.display = "block";
        refreshPanel();
        syncPopups();
    }

    function closePanel() {
        var p = document.getElementById(CONFIG.panelId);
        if (!p) return;
        p.style.display = "none";
        disableSelection();
        syncPopups();
    }

    function createButton() {
        if (document.getElementById(CONFIG.buttonId)) return;
        var b = document.createElement("button");
        b.id = CONFIG.buttonId;
        b.type = "button";
        b.title = "Advanced Export";
        b.innerHTML = '<span style="font-size:22px;line-height:1;">📤</span>';
        Object.assign(b.style, {
            position: "fixed", width: "46px", height: "46px", padding: "0",
            border: "1px solid rgba(0,0,0,.25)", borderRadius: "8px",
            background: "#fff", color: "#222", boxShadow: "0 2px 8px rgba(0,0,0,.25)",
            cursor: "pointer", zIndex: String(CONFIG.zIndex),
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all .15s ease"
        });
        b.onmouseenter = function () { b.style.transform = "scale(1.07)"; };
        b.onmouseleave = function () { b.style.transform = "scale(1)"; };
        b.onclick = function () {
            var p = document.getElementById(CONFIG.panelId);
            if (!p) return;
            (p.style.display === "block") ? closePanel() : openPanel();
        };
        document.body.appendChild(b);
        setTimeout(positionButton, 300);
        setTimeout(positionButton, 1200);
    }

    function positionButton() {
        var b = document.getElementById(CONFIG.buttonId);
        if (!b) return;
        var vw = innerWidth, vh = innerHeight, bw = 46, bh = 46, gap = 8;
        var rm = vw <= 650 ? 10 : 16;
        var occ = [];
        var els = document.querySelectorAll("button,.ol-control,[role=button]");
        for (var i = 0; i < els.length; i++) {
            var el = els[i];
            if (!el || el.id === CONFIG.buttonId || (el.closest && el.closest("#" + CONFIG.panelId))) continue;
            var cs = getComputedStyle(el);
            if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") continue;
            var r = el.getBoundingClientRect();
            if (r.width < 5 || r.height < 5) continue;
            if (r.right < vw - 130 && r.left < vw * .7) continue;
            if (r.bottom < 0 || r.top > vh) continue;
            occ.push(r);
        }
        var chosen = 15;
        for (var bo = 15; bo < vh - 65; bo += bh + gap) {
            var top = vh - bo - bh, left = vw - rm - bw, hit = false;
            var t = { l: left - gap, r: left + bw + gap, t: top - gap, b: top + bh + gap };
            for (var j = 0; j < occ.length; j++) {
                var o = occ[j];
                if (t.l < o.right && t.r > o.left && t.t < o.bottom && t.b > o.top) { hit = true; break; }
            }
            if (!hit) { chosen = bo; break; }
        }
        b.style.right = rm + "px";
        b.style.bottom = chosen + "px";
        b.style.left = "auto";
        b.style.top = "auto";
    }

    /* ========================================================
       17. UI — PANEL CREATION
       ======================================================== */
    function createPanel() {
        if (document.getElementById(CONFIG.panelId)) return;

        var p = document.createElement("div");
        p.id = CONFIG.panelId;
        p.innerHTML =
'<div class="s17-head">' +
  '<div><div class="s17-t">📤 Advanced Export</div><div class="s17-st">GIS &amp; survey data export</div></div>' +
  '<button type="button" id="s17-close" class="s17-x">×</button>' +
'</div>' +
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
  '<select id="s17-mode">' +
    '<option value="all">All Features</option>' +
    '<option value="selected">Selected Features</option>' +
    '<option value="extent">Current Map Extent</option>' +
  '</select>' +

  '<label>Export Format</label>' +
  '<select id="s17-format">' +
    '<option value="GeoJSON">GeoJSON (.geojson)</option>' +
    '<option value="KML">KML (.kml)</option>' +
    '<option value="KMZ">KMZ (.kmz — zipped KML)</option>' +
    '<option value="CSV">CSV (.csv)</option>' +
    '<option value="WKT">WKT (.csv)</option>' +
    '<option value="JSON">JSON (.json)</option>' +
    '<option value="SHP">ESRI Shapefile (.zip)</option>' +
  '</select>' +

  '<label>Coordinate System</label>' +
  '<select id="s17-crs">' +
    '<option value="current">Current Map CRS</option>' +
    '<option value="EPSG:4326">EPSG:4326 — WGS 84</option>' +
    '<option value="EPSG:3857">EPSG:3857 — Web Mercator</option>' +
    '<option value="EPSG:32643">EPSG:32643 — UTM 43N</option>' +
    '<option value="EPSG:32644">EPSG:32644 — UTM 44N</option>' +
    '<option value="custom">Custom EPSG…</option>' +
  '</select>' +
  '<input id="s17-custom-crs" type="text" placeholder="e.g. EPSG:32643" style="display:none;">' +

  '<div class="s17-sec">🎨 Symbology</div>' +
  '<label class="s17-chk"><input type="checkbox" id="s17-style" checked>' +
    '<span>Keep layer styling (colours, stroke width, fill)</span></label>' +

  '<div class="s17-sec">🏷 Label Points</div>' +
  '<label class="s17-chk"><input type="checkbox" id="s17-labels" checked>' +
    '<span>Create invisible centroid point for labels</span></label>' +

  '<div class="s17-sec">📐 Include Measurements</div>' +
  '<label class="s17-chk"><input type="checkbox" id="s17-area" checked><span>Area (m² / ha / acre / cent / ft²)</span></label>' +
  '<label class="s17-chk"><input type="checkbox" id="s17-perimeter" checked><span>Perimeter / Length (m)</span></label>' +
  '<label class="s17-chk"><input type="checkbox" id="s17-centroid" checked><span>Centroid X / Y</span></label>' +
  '<label class="s17-chk"><input type="checkbox" id="s17-coords" checked><span>Point X / Y / Z</span></label>' +

  '<div class="s17-sec">🗂 Attributes</div>' +
  '<div id="s17-fields" class="s17-fields"></div>' +

  '<div id="s17-status" class="s17-status">Ready</div>' +
  '<button type="button" id="s17-go" class="s17-go">📤 Export</button>' +
'</div>';

        Object.assign(p.style, {
            position: "fixed", top: "68px", right: "16px", width: "336px",
            maxWidth: "calc(100vw - 24px)", maxHeight: "calc(100vh - 86px)",
            overflowY: "auto", background: "#fff", borderRadius: "12px",
            boxShadow: "0 10px 34px rgba(0,0,0,.28)",
            zIndex: String(CONFIG.zIndex + 1), display: "none",
            fontFamily: "Arial,Helvetica,sans-serif", color: "#111"
        });

        document.body.appendChild(p);

        // Listeners
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
            S.exportFormat = this.value;
            var note = document.getElementById("s17-status");
            if (this.value === "KML" || this.value === "KMZ") {
                note.textContent = "ℹ KML/KMZ always uses EPSG:4326 (required by the format).";
            }
        };

        document.getElementById("s17-crs").onchange = function () {
            S.exportCRS = this.value;
            document.getElementById("s17-custom-crs").style.display =
                this.value === "custom" ? "block" : "none";
        };

        document.getElementById("s17-selmode").onclick = toggleSelection;
        document.getElementById("s17-selclear").onclick = clearSelection;
        document.getElementById("s17-selview").onclick = function () {
            var m = getMap();
            if (!m) return;
            selectByExtent(m.getView().calculateExtent(m.getSize()), false);
            S.exportMode = "selected";
            document.getElementById("s17-mode").value = "selected";
        };

        document.getElementById("s17-go").onclick = runExport;
    }

    /* ========================================================
       18. UI REFRESH
       ======================================================== */
    function updateSelectionUI() {
        var info = document.getElementById("s17-selinfo");
        var btn = document.getElementById("s17-selmode");
        if (!info || !btn) return;

        btn.textContent = S.selectActive ? "✔ Selecting" : "Enable Select";
        btn.className = "s17-btn" + (S.selectActive ? " on" : "");

        var n = selectedForCurrentLayer().length;
        var other = S.selection.length - n;

        if (n > 0) {
            info.className = "s17-info ok";
            info.innerHTML = "✔ <b>" + n + "</b> polygon(s) selected in <b>" +
                (S.currentLayer ? layerName(S.currentLayer) : "-") + "</b>" +
                (other > 0 ? "<br><span style='opacity:.8'>" + other + " in other layer(s)</span>" : "") +
                "<br><span style='opacity:.8'>Click a polygon again to unselect it.</span>";
        } else if (S.selectActive) {
            info.className = "s17-info warn";
            info.innerHTML = "🖱 <b>Click</b> polygon to select &nbsp;·&nbsp; <b>Click again</b> to unselect<br>" +
                             "Clicking another polygon <b>adds</b> it · <b>Shift+Drag</b> = box select<br>" +
                             "<span style='opacity:.8'>Popups are disabled while selecting.</span>";
        } else {
            info.className = "s17-info warn";
            info.innerHTML = "Selection is off — click <b>Enable Select</b> to pick polygons on the map.";
        }
    }

    function refreshPanel() {
        var sel = document.getElementById("s17-layer");
        if (!sel) return;

        var ls = vectorLayers();
        sel.innerHTML = "";

        if (!ls.length) {
            sel.innerHTML = '<option value="">No vector layers found</option>';
            S.currentLayer = null;
            refreshFields();
            updateSelectionUI();
            return;
        }

        ls.forEach(function (l) {
            var o = document.createElement("option");
            o.value = layerId(l);
            o.textContent = layerName(l) + "  (" + l.getSource().getFeatures().length + ")";
            sel.appendChild(o);
        });

        if (!S.currentLayer || ls.indexOf(S.currentLayer) === -1) S.currentLayer = ls[0];
        sel.value = layerId(S.currentLayer);

        refreshFields();
        updateSelectionUI();

        var st = document.getElementById("s17-status");
        if (st) st.textContent = "Ready — " + S.currentLayer.getSource().getFeatures().length + " feature(s) in layer";
    }

    function refreshFields() {
        var box = document.getElementById("s17-fields");
        if (!box) return;
        box.innerHTML = "";

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
                if (k === gname || seen[k]) continue;
                if (k.charAt(0) === "_") continue;
                if (pr[k] instanceof ol.geom.Geometry) continue;
                seen[k] = 1;
                keys.push(k);
            }
        }

        if (!keys.length) {
            box.innerHTML = '<div style="font-size:11px;color:#9ca3af;">No attributes found</div>';
            return;
        }

        var head = document.createElement("div");
        head.className = "s17-ftitle";
        head.textContent = "Attributes (" + keys.length + ")";
        box.appendChild(head);

        var row = document.createElement("div");
        row.className = "s17-row";
        row.style.marginBottom = "6px";

        function mkBtn(txt, state) {
            var b = document.createElement("button");
            b.type = "button"; b.className = "s17-btn"; b.textContent = txt;
            b.style.height = "26px"; b.style.fontSize = "10.5px";
            b.onclick = function () {
                var cbs = box.querySelectorAll("input[type=checkbox]");
                for (var i = 0; i < cbs.length; i++) cbs[i].checked = state;
            };
            return b;
        }
        row.appendChild(mkBtn("Select All", true));
        row.appendChild(mkBtn("Clear All", false));
        box.appendChild(row);

        keys.forEach(function (k) {
            var lab = document.createElement("label");
            lab.className = "s17-field";
            var cb = document.createElement("input");
            cb.type = "checkbox"; cb.checked = true; cb.dataset.field = k;
            var sp = document.createElement("span");
            sp.textContent = k;
            lab.appendChild(cb); lab.appendChild(sp);
            box.appendChild(lab);
        });
    }

    /* ========================================================
       19. RUN EXPORT
       ======================================================== */
    function runExport() {
        var status = document.getElementById("s17-status");
        var go = document.getElementById("s17-go");

        S.exportFormat = document.getElementById("s17-format").value;
        S.exportMode = document.getElementById("s17-mode").value;
        S.exportCRS = document.getElementById("s17-crs").value;

        go.disabled = true;

        function done(msg) { status.textContent = msg; go.disabled = false; }

        try {
            var tCRS = targetCRS();
            if (!tCRS) throw new Error("Please enter a valid EPSG code.");

            var feats = featuresForExport();
            if (!feats.length) {
                if (S.exportMode === "selected")
                    throw new Error("Nothing selected. Click polygons on the map, then export.");
                if (S.exportMode === "extent")
                    throw new Error("No features inside the current map view.");
                throw new Error("No features available in this layer.");
            }

            status.textContent = "⏳ Processing " + feats.length + " feature(s)…";

            var recs = buildRecords(feats, tCRS);
            if (!recs.length) throw new Error("No valid geometries found.");

            var pr = null;
            switch (S.exportFormat) {
                case "GeoJSON": exportGeoJSON(recs, tCRS); break;
                case "JSON":    exportJSON(recs, tCRS);    break;
                case "CSV":     exportCSV(recs);           break;
                case "WKT":     exportWKT(recs);           break;
                case "KML":     exportKML(recs);           break;
                case "KMZ":     status.textContent = "⏳ Loading JSZip…"; pr = exportKMZ(recs); break;
                case "SHP":     status.textContent = "⏳ Loading shp-write…"; pr = exportSHP(recs); break;
                default: throw new Error("Unsupported format: " + S.exportFormat);
            }

            var labelNote = checked("s17-labels") ? " (+ " + recs.length + " label points)" : "";

            if (pr && typeof pr.then === "function") {
                pr.then(function () {
                    done("✅ Exported " + recs.length + " feature(s)" + labelNote + " as " + S.exportFormat);
                }).catch(function (e) {
                    console.error("Stage 17:", e);
                    done("❌ " + (e.message || "Export failed."));
                });
            } else {
                done("✅ Exported " + recs.length + " feature(s)" + labelNote + " as " + S.exportFormat);
            }

        } catch (e) {
            console.error("Stage 17 Export Error:", e);
            done("❌ " + (e.message || "Export failed."));
        }
    }

    /* ========================================================
       20. EVENTS + INITIALIZATION
       ======================================================== */
    addEventListener("resize", function () { setTimeout(positionButton, 120); });
    addEventListener("orientationchange", function () { setTimeout(positionButton, 350); });
    addEventListener("beforeunload", function () { try { restorePopups(); } catch (e) {} });

    setInterval(function () {
        var p = document.getElementById(CONFIG.panelId);
        if (p && p.style.display === "block") updateSelectionUI();
    }, 1500);

    function init(tries) {
        tries = tries || 0;
        if (!getMap()) {
            if (tries > 30) { console.error("Stage 17: map not found."); return; }
            return setTimeout(function () { init(tries + 1); }, 600);
        }
        injectCSS();
        createButton();
        createPanel();
        ensureHighlightLayer();
        setTimeout(function () { refreshPanel(); positionButton(); }, 500);
        setTimeout(function () { refreshPanel(); positionButton(); }, 2000);
        console.log("Stage 17 Advanced Export v4.1 ready.");
    }

    // Public API
    window.Stage17Export = {
        open: openPanel,
        close: closePanel,
        enableSelection: enableSelection,
        disableSelection: disableSelection,
        clearSelection: clearSelection,
        getSelection: function () { return S.selection.slice(); },
        suppressPopups: suppressPopups,
        restorePopups: restorePopups,
        refresh: refreshPanel
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function () { init(0); });
    } else {
        setTimeout(function () { init(0); }, 400);
    }

})();