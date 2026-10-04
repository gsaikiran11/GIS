// ============================================================
// 📂 UNIVERSAL GIS IMPORT TOOL  (v2.0)
// QGIS2WEB + OPENLAYERS  —  SINGLE FILE, DROP-IN
//
// v2.0 CHANGELOG
//  ✔ Self-registers with MapToolManager (drag + hide + persist)
//  ✔ NO inline position writes — CSS classes only
//  ✔ Panel auto-follows the button wherever you drag it
//  ✔ Closes on maptool:editmode / maptool:visibility / ESC
//  ✔ Click-outside closes the panel
//  ✔ Added: GeoJSON import
//  ✔ Added: DXF import (polylines, points, circles, 3dface)
//  ✔ Added: CSV point import (lat/lon or x/y columns)
//  ✔ Drag-and-drop support on the panel
//  ✔ Recent import history
//  ✔ All original formats preserved (KML, KMZ, Shapefile ZIP)
//
// SUPPORTED FORMATS
//   ✔ KML (.kml)
//   ✔ KMZ (.kmz)
//   ✔ Shapefile ZIP (.zip)
//   ✔ GeoJSON (.geojson, .json)
//   ✔ DXF (.dxf)
//   ✔ CSV Points (.csv)
//
// FEATURES
//   ✔ Automatic file type detection
//   ✔ Existing layer manager integration
//   ✔ Checkbox visibility + move ↑/↓ + remove
//   ✔ Zoom to imported data
//   ✔ Automatic layer name from filename
// ============================================================

(function () {
    "use strict";

    /* ========================================================
       1. CONFIGURATION
       ======================================================== */
    var CONFIG = {
        toolId:    "import",
        toolName:  "Import",
        toolIcon:  "📂",

        buttonId:  "gis-import-button",
        panelId:   "gis-import-panel",

        btnSize:   40,
        panelWidth: 340,
        panelGap:  8,

        defaults: { top: 444, left: 12 },

        maxFeatures: 0,   // 0 = unlimited

        acceptedExtensions: ".kml,.kmz,.zip,.geojson,.json,.dxf,.csv",

        acceptedMime: [
            "application/vnd.google-earth.kml+xml",
            "application/vnd.google-earth.kmz",
            "application/zip",
            "application/x-zip-compressed",
            "application/geo+json",
            "application/json",
            "application/dxf",
            "text/csv",
            "text/plain"
        ].join(","),

        jszipCDN: [
            "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js",
            "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"
        ],

        shpjsCDN: [
            "https://unpkg.com/shpjs@latest/dist/shp.js"
        ],

        // CSV column name patterns (case-insensitive)
        csvLatNames: ["lat", "latitude", "y", "lat_y", "point_y", "ycoord", "y_coord"],
        csvLonNames: ["lon", "lng", "long", "longitude", "x", "lat_x", "point_x", "xcoord", "x_coord"],

        // Default styles per format
        styles: {
            kml: { fill: "rgba(255,165,0,0.20)", stroke: "#ff6600", width: 2, pointColor: "#ff6600" },
            shapefile: { fill: "rgba(0,153,255,0.20)", stroke: "#0066cc", width: 2, pointColor: "#0066cc" },
            geojson: { fill: "rgba(76,175,80,0.20)", stroke: "#2e7d32", width: 2, pointColor: "#2e7d32" },
            dxf: { fill: "rgba(156,39,176,0.20)", stroke: "#7b1fa2", width: 2, pointColor: "#7b1fa2" },
            csv: { fill: "rgba(233,30,99,0.20)", stroke: "#c2185b", width: 2, pointColor: "#c2185b" }
        }
    };

    if (typeof ol === "undefined") {
        console.error("📂 Import Tool: OpenLayers (ol) not found.");
        return;
    }

    /* ========================================================
       2. STATE
       ======================================================== */
    var button = null;
    var panel = null;
    var panelOpen = false;
    var fileInput = null;
    var importHistory = [];
    var mapRef = null;

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
        if (document.getElementById("gis-import-css-v2")) return;

        var css = document.createElement("style");
        css.id = "gis-import-css-v2";
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
    z-index: 18400;\
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
#' + CONFIG.buttonId + '.gis-import-open {\
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
    z-index: 55100;\
    display: none;\
    flex-direction: column;\
    box-sizing: border-box;\
}\
\
#' + CONFIG.panelId + '.gis-import-visible {\
    display: flex;\
    animation: gis-import-fade .16s ease;\
}\
\
@keyframes gis-import-fade {\
    from { opacity: 0; transform: translateY(6px); }\
    to   { opacity: 1; transform: translateY(0); }\
}\
\
#' + CONFIG.panelId + ' * { box-sizing: border-box; }\
\
\
/* ============ HEADER ============ */\
.gis-imp-head {\
    display: flex;\
    align-items: center;\
    justify-content: space-between;\
    gap: 8px;\
    padding: 11px 13px;\
    background: linear-gradient(135deg, #1565c0, #0d47a1);\
    color: #fff;\
    flex-shrink: 0;\
    border-radius: var(--ui-radius, 10px) var(--ui-radius, 10px) 0 0;\
}\
\
.gis-imp-t { font-size: 14px; font-weight: 700; }\
.gis-imp-st { font-size: 10px; opacity: .7; margin-top: 1px; }\
\
.gis-imp-x {\
    width: 26px; height: 26px; flex-shrink: 0;\
    border: none; border-radius: 5px;\
    background: rgba(255,255,255,.15);\
    color: #fff; font-size: 18px; line-height: 1;\
    cursor: pointer;\
    display: flex; align-items: center; justify-content: center;\
    transition: background .13s ease;\
}\
\
.gis-imp-x:hover { background: rgba(255,255,255,.3); }\
\
\
/* ============ BODY ============ */\
.gis-imp-body {\
    padding: 12px;\
    overflow-y: auto;\
    -webkit-overflow-scrolling: touch;\
    flex: 1;\
    min-height: 0;\
}\
\
\
/* ============ DROP ZONE ============ */\
.gis-imp-dropzone {\
    padding: 22px 16px;\
    border: 2px dashed var(--ui-border-strong, #aeb6c2);\
    border-radius: var(--ui-radius-sm, 7px);\
    background: var(--ui-bg-subtle, #f5f7fa);\
    text-align: center;\
    cursor: pointer;\
    transition: border-color .2s ease, background .2s ease;\
    margin-bottom: 12px;\
}\
\
.gis-imp-dropzone:hover,\
.gis-imp-dropzone.dragover {\
    border-color: var(--ui-accent, #1f6feb);\
    background: var(--ui-accent-soft, rgba(31,111,235,.08));\
}\
\
.gis-imp-dropzone-icon {\
    font-size: 28px;\
    margin-bottom: 6px;\
}\
\
.gis-imp-dropzone-text {\
    font-size: 12px;\
    font-weight: 600;\
    color: var(--ui-text, #1d2430);\
    margin-bottom: 4px;\
}\
\
.gis-imp-dropzone-hint {\
    font-size: 10px;\
    color: var(--ui-text-faint, #8b93a1);\
    line-height: 1.4;\
}\
\
\
/* ============ FORMAT BADGES ============ */\
.gis-imp-formats {\
    display: flex;\
    flex-wrap: wrap;\
    gap: 4px;\
    margin-bottom: 12px;\
    justify-content: center;\
}\
\
.gis-imp-badge {\
    padding: 3px 7px;\
    border-radius: 4px;\
    font-size: 9.5px;\
    font-weight: 700;\
    letter-spacing: .3px;\
    color: #fff;\
    user-select: none;\
}\
\
.gis-imp-badge.kml     { background: #e65100; }\
.gis-imp-badge.kmz     { background: #bf360c; }\
.gis-imp-badge.shp     { background: #1565c0; }\
.gis-imp-badge.geojson { background: #2e7d32; }\
.gis-imp-badge.dxf     { background: #7b1fa2; }\
.gis-imp-badge.csv     { background: #c2185b; }\
\
\
/* ============ CSV CONFIG ============ */\
.gis-imp-csv-config {\
    padding: 10px;\
    margin-bottom: 10px;\
    border: 1px solid var(--ui-border-soft, #e9edf2);\
    border-radius: var(--ui-radius-sm, 7px);\
    background: var(--ui-bg-subtle, #f8fafc);\
    display: none;\
}\
\
.gis-imp-csv-config.show { display: block; }\
\
.gis-imp-csv-config label {\
    display: block;\
    font-size: 10.5px;\
    font-weight: 700;\
    color: var(--ui-text-muted, #5b6472);\
    margin: 0 0 3px;\
    text-transform: uppercase;\
    letter-spacing: .3px;\
}\
\
.gis-imp-csv-config select {\
    width: 100%;\
    height: 30px;\
    padding: 4px 7px;\
    margin-bottom: 8px;\
    border: 1px solid var(--ui-border, #d7dce3);\
    border-radius: var(--ui-radius-sm, 7px);\
    background: var(--ui-bg, #fff);\
    color: var(--ui-text, #1d2430);\
    font-family: inherit;\
    font-size: 11px;\
    outline: none;\
}\
\
\
/* ============ HISTORY ============ */\
.gis-imp-history-title {\
    font-size: 10.5px;\
    font-weight: 800;\
    text-transform: uppercase;\
    letter-spacing: .4px;\
    color: var(--ui-text-muted, #6b7280);\
    margin: 10px 0 6px;\
    padding-top: 8px;\
    border-top: 1px solid var(--ui-border-soft, #e5e7eb);\
}\
\
.gis-imp-history-item {\
    display: flex;\
    align-items: center;\
    justify-content: space-between;\
    gap: 6px;\
    padding: 6px 8px;\
    margin-bottom: 4px;\
    border: 1px solid var(--ui-border-soft, #e9edf2);\
    border-radius: var(--ui-radius-sm, 7px);\
    background: var(--ui-bg-subtle, #f5f7fa);\
    font-size: 11px;\
}\
\
.gis-imp-history-name {\
    flex: 1;\
    font-weight: 600;\
    overflow: hidden;\
    text-overflow: ellipsis;\
    white-space: nowrap;\
    color: var(--ui-text, #1d2430);\
}\
\
.gis-imp-history-type {\
    flex: 0 0 auto;\
    padding: 1px 5px;\
    border-radius: 3px;\
    font-size: 9px;\
    font-weight: 700;\
    color: #fff;\
}\
\
.gis-imp-history-count {\
    flex: 0 0 auto;\
    font-size: 10px;\
    color: var(--ui-text-faint, #8b93a1);\
}\
\
.gis-imp-history-zoom {\
    width: 24px; height: 24px;\
    flex: 0 0 auto;\
    border: 1px solid var(--ui-border, #d7dce3);\
    border-radius: 4px;\
    background: var(--ui-bg, #fff);\
    cursor: pointer;\
    display: flex; align-items: center; justify-content: center;\
    font-size: 12px;\
    transition: background .13s ease;\
}\
\
.gis-imp-history-zoom:hover {\
    background: var(--ui-bg-hover, #eef1f5);\
    border-color: var(--ui-accent, #1f6feb);\
}\
\
\
/* ============ STATUS ============ */\
.gis-imp-status {\
    padding: 7px 9px;\
    margin: 8px 0 0;\
    border-radius: var(--ui-radius-sm, 7px);\
    font-size: 11px;\
    line-height: 1.4;\
    display: none;\
}\
\
.gis-imp-status.show { display: block; }\
.gis-imp-status.ok   { background: rgba(22,163,74,.10); color: var(--ui-success, #16a34a); }\
.gis-imp-status.err  { background: rgba(220,38,38,.10);  color: var(--ui-danger,  #dc2626); }\
.gis-imp-status.info { background: var(--ui-bg-subtle, #f3f4f6); color: var(--ui-text-muted, #5b6472); }\
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
        if (mapRef) return mapRef;
        if (typeof map !== "undefined" && map && typeof map.getLayers === "function") { mapRef = map; return mapRef; }
        if (window.map && typeof window.map.getLayers === "function") { mapRef = window.map; return mapRef; }
        return null;
    }

    function getMapProjection() {
        var m = getMap();
        if (!m) return "EPSG:3857";
        if (typeof MAP_PROJECTION !== "undefined" && MAP_PROJECTION) return MAP_PROJECTION;
        var p = m.getView().getProjection();
        return p ? p.getCode() : "EPSG:3857";
    }

    /* ========================================================
       6. UTILITY HELPERS
       ======================================================== */
    function cleanLayerName(fileName) {
        if (!fileName) return "Imported Layer";
        return fileName
            .replace(/\.(kml|kmz|zip|geojson|json|dxf|csv)$/i, "")
            .replace(/[_-]+/g, " ")
            .trim() || "Imported Layer";
    }

    function makeStyle(cfg) {
        return new ol.style.Style({
            fill: new ol.style.Fill({ color: cfg.fill }),
            stroke: new ol.style.Stroke({ color: cfg.stroke, width: cfg.width }),
            image: new ol.style.Circle({
                radius: 6,
                fill: new ol.style.Fill({ color: cfg.pointColor }),
                stroke: new ol.style.Stroke({ color: "#ffffff", width: 2 })
            })
        });
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

    /* ========================================================
       7. LAYER REGISTRATION
       ======================================================== */
    function registerLayer(layer, layerName, fileName, importType) {
        layer.set("title", layerName);
        layer.set("name", layerName);
        layer.set("file", fileName);
        layer.set("imported", true);
        layer.set("importType", importType);
        layer.set("popuplayertitle", layerName);

        if (typeof vectorLayers !== "undefined" && Array.isArray(vectorLayers)) {
            vectorLayers.push(layer);
        }

        var m = getMap();
        if (m) m.addLayer(layer);

        if (typeof addOverlayToSwitcher === "function") {
            addOverlayToSwitcher(layer);
        }

        if (typeof rebuildLayerManager === "function") {
            try { rebuildLayerManager(); } catch (e) {
                console.warn("Could not rebuild layer manager:", e);
            }
        }

        return layer;
    }

    function zoomToLayer(layer) {
        var m = getMap();
        if (!m || !layer) return;
        var src = layer.getSource();
        if (!src) return;
        var ext = src.getExtent();
        if (!ext || ext[0] === Infinity) return;
        m.getView().fit(ext, { padding: [80, 80, 80, 80], duration: 800, maxZoom: 19 });
    }

    function addToHistory(layerName, importType, featureCount, layer) {
        importHistory.unshift({
            name: layerName,
            type: importType,
            count: featureCount,
            layer: layer,
            time: new Date()
        });
        if (importHistory.length > 20) importHistory.pop();
        refreshHistory();
    }

    /* ========================================================
       8. KML IMPORT
       ======================================================== */
    function importKMLText(kmlText, layerName, fileName, importType) {
        try {
            var fmt = new ol.format.KML({ extractStyles: true, showPointNames: false });
            var features = fmt.readFeatures(kmlText, {
                dataProjection: "EPSG:4326",
                featureProjection: getMapProjection()
            });

            if (!features || !features.length) {
                setStatus("No features found in " + importType + " file.", "err");
                return null;
            }

            if (CONFIG.maxFeatures > 0 && features.length > CONFIG.maxFeatures) {
                setStatus("File has " + features.length + " features (max " + CONFIG.maxFeatures + ").", "err");
                return null;
            }

            var layer = new ol.layer.Vector({
                source: new ol.source.Vector({ features: features }),
                visible: true,
                style: makeStyle(CONFIG.styles.kml)
            });

            registerLayer(layer, layerName, fileName, importType);
            zoomToLayer(layer);
            addToHistory(layerName, importType, features.length, layer);
            setStatus("✅ Imported " + features.length + " feature(s) from " + fileName, "ok");
            return layer;
        } catch (e) {
            console.error("KML import error:", e);
            setStatus("❌ " + e.message, "err");
            return null;
        }
    }

    function importKMLFile(file) {
        var reader = new FileReader();
        reader.onload = function (e) {
            importKMLText(e.target.result, cleanLayerName(file.name), file.name, "KML");
        };
        reader.onerror = function () { setStatus("Could not read the KML file.", "err"); };
        reader.readAsText(file);
    }

    /* ========================================================
       9. KMZ IMPORT
       ======================================================== */
    function importKMZFile(file) {
        setStatus("⏳ Loading KMZ…", "info");

        loadScript(CONFIG.jszipCDN, "JSZip").then(function () {
            return JSZip.loadAsync(file);
        }).then(function (zip) {
            var kmlFile = zip.files["doc.kml"];
            if (!kmlFile) {
                var names = Object.keys(zip.files);
                for (var i = 0; i < names.length; i++) {
                    if (names[i].toLowerCase().endsWith(".kml")) {
                        kmlFile = zip.files[names[i]];
                        break;
                    }
                }
            }
            if (!kmlFile) throw new Error("No KML file found inside KMZ.");
            return kmlFile.async("text");
        }).then(function (kmlText) {
            importKMLText(kmlText, cleanLayerName(file.name), file.name, "KMZ");
        }).catch(function (e) {
            console.error("KMZ import error:", e);
            setStatus("❌ " + e.message, "err");
        });
    }

    /* ========================================================
       10. GEOJSON IMPORT
       ======================================================== */
    function importGeoJSONFile(file) {
        var reader = new FileReader();
        reader.onload = function (e) {
            try {
                var text = e.target.result;
                var fmt = new ol.format.GeoJSON();
                var features = fmt.readFeatures(text, {
                    dataProjection: "EPSG:4326",
                    featureProjection: getMapProjection()
                });

                if (!features || !features.length) {
                    // Try without specifying projection
                    features = fmt.readFeatures(text, {
                        featureProjection: getMapProjection()
                    });
                }

                if (!features || !features.length) {
                    setStatus("No features found in GeoJSON file.", "err");
                    return;
                }

                if (CONFIG.maxFeatures > 0 && features.length > CONFIG.maxFeatures) {
                    setStatus("File has " + features.length + " features (max " + CONFIG.maxFeatures + ").", "err");
                    return;
                }

                var layerName = cleanLayerName(file.name);
                var layer = new ol.layer.Vector({
                    source: new ol.source.Vector({ features: features }),
                    visible: true,
                    style: makeStyle(CONFIG.styles.geojson)
                });

                registerLayer(layer, layerName, file.name, "GeoJSON");
                zoomToLayer(layer);
                addToHistory(layerName, "GeoJSON", features.length, layer);
                setStatus("✅ Imported " + features.length + " feature(s) from " + file.name, "ok");
            } catch (err) {
                console.error("GeoJSON import error:", err);
                setStatus("❌ " + err.message, "err");
            }
        };
        reader.onerror = function () { setStatus("Could not read the GeoJSON file.", "err"); };
        reader.readAsText(file);
    }

    /* ========================================================
       11. SHAPEFILE ZIP IMPORT
       ======================================================== */
    function importShapefileZIP(file) {
        setStatus("⏳ Loading Shapefile…", "info");

        loadScript(CONFIG.shpjsCDN, "shp").then(function () {
            return file.arrayBuffer();
        }).then(function (buf) {
            return shp(buf);
        }).then(function (geojson) {
            var layers = Array.isArray(geojson) ? geojson : [geojson];
            if (!layers.length) throw new Error("No data found in Shapefile.");

            var totalFeatures = 0;
            var fmt = new ol.format.GeoJSON();

            for (var i = 0; i < layers.length; i++) {
                var gj = layers[i];
                if (!gj || !gj.features) continue;

                var features = fmt.readFeatures(gj, {
                    dataProjection: "EPSG:4326",
                    featureProjection: getMapProjection()
                });

                if (!features.length) continue;

                var layerName = cleanLayerName(file.name);
                if (layers.length > 1) layerName += " " + (i + 1);

                var layer = new ol.layer.Vector({
                    source: new ol.source.Vector({ features: features }),
                    visible: true,
                    style: makeStyle(CONFIG.styles.shapefile)
                });

                registerLayer(layer, layerName, file.name, "Shapefile");
                zoomToLayer(layer);
                addToHistory(layerName, "SHP", features.length, layer);
                totalFeatures += features.length;
            }

            setStatus("✅ Imported " + totalFeatures + " feature(s) from " + file.name, "ok");
        }).catch(function (e) {
            console.error("Shapefile import error:", e);
            setStatus("❌ " + e.message, "err");
        });
    }

    /* ========================================================
       12. DXF IMPORT
       ======================================================== */
    function importDXFFile(file) {
        var reader = new FileReader();
        reader.onload = function (e) {
            try {
                var text = e.target.result;
                var features = parseDXF(text);

                if (!features.length) {
                    setStatus("No geometry found in DXF file.", "err");
                    return;
                }

                var layerName = cleanLayerName(file.name);
                var layer = new ol.layer.Vector({
                    source: new ol.source.Vector({ features: features }),
                    visible: true,
                    style: makeStyle(CONFIG.styles.dxf)
                });

                registerLayer(layer, layerName, file.name, "DXF");
                zoomToLayer(layer);
                addToHistory(layerName, "DXF", features.length, layer);
                setStatus("✅ Imported " + features.length + " entity(s) from " + file.name, "ok");
            } catch (err) {
                console.error("DXF import error:", err);
                setStatus("❌ " + err.message, "err");
            }
        };
        reader.onerror = function () { setStatus("Could not read the DXF file.", "err"); };
        reader.readAsText(file);
    }

    function parseDXF(text) {
        var lines = text.split(/\r?\n/);
        var features = [];
        var inEntities = false;
        var i = 0;

        // Find ENTITIES section
        while (i < lines.length) {
            if (lines[i].trim() === "SECTION" && i + 2 < lines.length && lines[i + 2].trim() === "ENTITIES") {
                inEntities = true;
                i += 3;
                break;
            }
            i++;
        }

        if (!inEntities) return features;

        while (i < lines.length) {
            var code = lines[i] ? lines[i].trim() : "";
            var val = (i + 1 < lines.length) ? lines[i + 1].trim() : "";

            if (code === "0" && val === "ENDSEC") break;

            if (code === "0") {
                var entityType = val.toUpperCase();

                if (entityType === "POINT") {
                    var pt = readDXFEntity(lines, i, "POINT");
                    if (pt.x !== undefined && pt.y !== undefined) {
                        var f = new ol.Feature({
                            geometry: new ol.geom.Point([pt.x, pt.y])
                        });
                        copyDXFProps(f, pt);
                        features.push(f);
                    }
                    i = pt.endIndex;
                    continue;
                }

                if (entityType === "LINE") {
                    var ln = readDXFEntity(lines, i, "LINE");
                    if (ln.x !== undefined && ln.x2 !== undefined) {
                        var lf = new ol.Feature({
                            geometry: new ol.geom.LineString([[ln.x, ln.y], [ln.x2, ln.y2]])
                        });
                        copyDXFProps(lf, ln);
                        features.push(lf);
                    }
                    i = ln.endIndex;
                    continue;
                }

                if (entityType === "CIRCLE") {
                    var cr = readDXFEntity(lines, i, "CIRCLE");
                    if (cr.x !== undefined && cr.radius) {
                        var cf = new ol.Feature({
                            geometry: ol.geom.Polygon.circular([cr.x, cr.y], cr.radius, 64)
                        });
                        copyDXFProps(cf, cr);
                        features.push(cf);
                    }
                    i = cr.endIndex;
                    continue;
                }

                if (entityType === "LWPOLYLINE" || entityType === "POLYLINE") {
                    var pl = readDXFPolyline(lines, i, entityType);
                    if (pl.coords.length >= 2) {
                        var geom;
                        if (pl.closed && pl.coords.length >= 3) {
                            var ring = pl.coords.slice();
                            var first = ring[0], last = ring[ring.length - 1];
                            if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);
                            geom = new ol.geom.Polygon([ring]);
                        } else {
                            geom = new ol.geom.LineString(pl.coords);
                        }
                        var pf = new ol.Feature({ geometry: geom });
                        if (pl.layer) pf.set("DXF_Layer", pl.layer);
                        features.push(pf);
                    }
                    i = pl.endIndex;
                    continue;
                }

                if (entityType === "3DFACE") {
                    var face = readDXF3DFace(lines, i);
                    if (face.coords.length >= 3) {
                        var ring3d = face.coords.slice();
                        var f3 = ring3d[0], l3 = ring3d[ring3d.length - 1];
                        if (f3[0] !== l3[0] || f3[1] !== l3[1]) ring3d.push([f3[0], f3[1]]);
                        var ff = new ol.Feature({ geometry: new ol.geom.Polygon([ring3d]) });
                        if (face.layer) ff.set("DXF_Layer", face.layer);
                        features.push(ff);
                    }
                    i = face.endIndex;
                    continue;
                }
            }

            i += 2;
        }

        return features;
    }

    function readDXFEntity(lines, startIdx, type) {
        var result = { endIndex: startIdx + 2 };
        var i = startIdx + 2;

        while (i < lines.length) {
            var code = parseInt(lines[i] ? lines[i].trim() : "", 10);
            var val = (i + 1 < lines.length) ? lines[i + 1].trim() : "";

            if (code === 0) { result.endIndex = i; break; }

            if (code === 8) result.layer = val;
            if (code === 10) result.x = parseFloat(val);
            if (code === 20) result.y = parseFloat(val);
            if (code === 30) result.z = parseFloat(val);
            if (code === 11) result.x2 = parseFloat(val);
            if (code === 21) result.y2 = parseFloat(val);
            if (code === 40) result.radius = parseFloat(val);
            if (code === 62) result.color = parseInt(val, 10);

            i += 2;
            result.endIndex = i;
        }

        return result;
    }

    function readDXFPolyline(lines, startIdx, type) {
        var result = { coords: [], closed: false, layer: "", endIndex: startIdx + 2 };
        var i = startIdx + 2;
        var vertices = [];
        var currentX = null, currentY = null;

        while (i < lines.length) {
            var code = parseInt(lines[i] ? lines[i].trim() : "", 10);
            var val = (i + 1 < lines.length) ? lines[i + 1].trim() : "";

            if (isNaN(code)) { i += 2; continue; }

            if (code === 0) {
                if (type === "LWPOLYLINE") {
                    // For LWPOLYLINE, each 10/20 pair is a vertex in the same entity
                    if (currentX !== null && currentY !== null) {
                        vertices.push([currentX, currentY]);
                        currentX = null;
                        currentY = null;
                    }
                    result.coords = vertices;
                    result.endIndex = i;
                    break;
                }

                if (val.toUpperCase() === "VERTEX") {
                    // Old-style POLYLINE vertex
                    i += 2;
                    continue;
                }

                if (val.toUpperCase() === "SEQEND") {
                    result.endIndex = i + 2;
                    break;
                }

                // Some other entity → end
                if (currentX !== null && currentY !== null) {
                    vertices.push([currentX, currentY]);
                }
                result.coords = vertices;
                result.endIndex = i;
                break;
            }

            if (code === 8) result.layer = val;
            if (code === 70) {
                var flags = parseInt(val, 10);
                if (flags & 1) result.closed = true;
            }

            if (code === 10) {
                if (currentX !== null && currentY !== null) {
                    vertices.push([currentX, currentY]);
                }
                currentX = parseFloat(val);
                currentY = null;
            }
            if (code === 20) {
                currentY = parseFloat(val);
            }

            i += 2;
            result.endIndex = i;
        }

        if (currentX !== null && currentY !== null) {
            vertices.push([currentX, currentY]);
        }
        if (!result.coords.length) result.coords = vertices;

        return result;
    }

    function readDXF3DFace(lines, startIdx) {
        var result = { coords: [], layer: "", endIndex: startIdx + 2 };
        var pts = [{}, {}, {}, {}];
        var i = startIdx + 2;

        while (i < lines.length) {
            var code = parseInt(lines[i] ? lines[i].trim() : "", 10);
            var val = (i + 1 < lines.length) ? lines[i + 1].trim() : "";

            if (code === 0) { result.endIndex = i; break; }

            if (code === 8) result.layer = val;
            if (code === 10) pts[0].x = parseFloat(val);
            if (code === 20) pts[0].y = parseFloat(val);
            if (code === 11) pts[1].x = parseFloat(val);
            if (code === 21) pts[1].y = parseFloat(val);
            if (code === 12) pts[2].x = parseFloat(val);
            if (code === 22) pts[2].y = parseFloat(val);
            if (code === 13) pts[3].x = parseFloat(val);
            if (code === 23) pts[3].y = parseFloat(val);

            i += 2;
            result.endIndex = i;
        }

        for (var j = 0; j < 4; j++) {
            if (pts[j].x !== undefined && pts[j].y !== undefined) {
                result.coords.push([pts[j].x, pts[j].y]);
            }
        }

        return result;
    }

    function copyDXFProps(feature, entity) {
        if (entity.layer) feature.set("DXF_Layer", entity.layer);
        if (entity.color !== undefined) feature.set("DXF_Color", entity.color);
    }

    /* ========================================================
       13. CSV POINT IMPORT
       ======================================================== */
    var pendingCSVData = null;

    function importCSVFile(file) {
        var reader = new FileReader();
        reader.onload = function (e) {
            try {
                var text = e.target.result;
                var parsed = parseCSV(text);

                if (!parsed.headers.length) {
                    setStatus("CSV file appears empty or has no headers.", "err");
                    return;
                }

                // Try to auto-detect lat/lon columns
                var latCol = findColumn(parsed.headers, CONFIG.csvLatNames);
                var lonCol = findColumn(parsed.headers, CONFIG.csvLonNames);

                if (latCol !== null && lonCol !== null) {
                    // Auto-detected → import directly
                    doCSVImport(parsed, latCol, lonCol, file);
                } else {
                    // Show column picker
                    pendingCSVData = { parsed: parsed, file: file };
                    showCSVConfig(parsed.headers, latCol, lonCol);
                }
            } catch (err) {
                console.error("CSV import error:", err);
                setStatus("❌ " + err.message, "err");
            }
        };
        reader.onerror = function () { setStatus("Could not read the CSV file.", "err"); };
        reader.readAsText(file);
    }

    function parseCSV(text) {
        var lines = text.split(/\r?\n/).filter(function (l) { return l.trim(); });
        if (!lines.length) return { headers: [], rows: [] };

        // Detect separator
        var sep = ",";
        if (lines[0].indexOf("\t") !== -1) sep = "\t";
        else if (lines[0].indexOf(";") !== -1 && lines[0].indexOf(",") === -1) sep = ";";

        var headers = splitCSVLine(lines[0], sep);
        var rows = [];

        for (var i = 1; i < lines.length; i++) {
            var cells = splitCSVLine(lines[i], sep);
            if (cells.length) rows.push(cells);
        }

        return { headers: headers, rows: rows, separator: sep };
    }

    function splitCSVLine(line, sep) {
        var result = [];
        var current = "";
        var inQuotes = false;

        for (var i = 0; i < line.length; i++) {
            var ch = line[i];
            if (ch === '"') {
                if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (ch === sep && !inQuotes) {
                result.push(current.trim());
                current = "";
            } else {
                current += ch;
            }
        }
        result.push(current.trim());
        return result;
    }

    function findColumn(headers, patterns) {
        for (var i = 0; i < headers.length; i++) {
            var h = headers[i].toLowerCase().trim();
            for (var j = 0; j < patterns.length; j++) {
                if (h === patterns[j].toLowerCase()) return i;
            }
        }
        return null;
    }

    function showCSVConfig(headers, autoLat, autoLon) {
        var container = document.getElementById("gis-imp-csv-config");
        if (!container) return;

        var latSel = document.getElementById("gis-imp-csv-lat");
        var lonSel = document.getElementById("gis-imp-csv-lon");

        latSel.innerHTML = "";
        lonSel.innerHTML = "";

        headers.forEach(function (h, idx) {
            var optLat = document.createElement("option");
            optLat.value = idx;
            optLat.textContent = h;
            if (autoLat === idx) optLat.selected = true;
            latSel.appendChild(optLat);

            var optLon = document.createElement("option");
            optLon.value = idx;
            optLon.textContent = h;
            if (autoLon === idx) optLon.selected = true;
            lonSel.appendChild(optLon);
        });

        container.classList.add("show");
        setStatus("Select the Latitude and Longitude columns, then click 'Import CSV'.", "info");
    }

    function doCSVImport(parsed, latIdx, lonIdx, file) {
        var features = [];
        var proj = getMapProjection();
        var headers = parsed.headers;

        for (var i = 0; i < parsed.rows.length; i++) {
            var row = parsed.rows[i];
            var lat = parseFloat(row[latIdx]);
            var lon = parseFloat(row[lonIdx]);

            if (isNaN(lat) || isNaN(lon)) continue;

            var coord = ol.proj.fromLonLat([lon, lat], proj);
            var f = new ol.Feature({ geometry: new ol.geom.Point(coord) });

            // Add all CSV columns as properties
            for (var j = 0; j < headers.length; j++) {
                if (j !== latIdx && j !== lonIdx && j < row.length) {
                    f.set(headers[j], row[j]);
                }
            }
            f.set("Latitude", lat);
            f.set("Longitude", lon);

            features.push(f);
        }

        if (!features.length) {
            setStatus("No valid coordinate rows found in CSV.", "err");
            return;
        }

        var layerName = cleanLayerName(file.name);
        var layer = new ol.layer.Vector({
            source: new ol.source.Vector({ features: features }),
            visible: true,
            style: makeStyle(CONFIG.styles.csv)
        });

        registerLayer(layer, layerName, file.name, "CSV");
        zoomToLayer(layer);
        addToHistory(layerName, "CSV", features.length, layer);
        setStatus("✅ Imported " + features.length + " point(s) from " + file.name, "ok");

        // Hide CSV config
        var container = document.getElementById("gis-imp-csv-config");
        if (container) container.classList.remove("show");
        pendingCSVData = null;
    }

    /* ========================================================
       14. FILE ROUTER
       ======================================================== */
    function importFile(file) {
        if (!file) return;

        var name = file.name.toLowerCase();

        // Hide CSV config when importing non-CSV
        var csvCfg = document.getElementById("gis-imp-csv-config");
        if (csvCfg) csvCfg.classList.remove("show");
        pendingCSVData = null;

        if (name.endsWith(".kml")) return importKMLFile(file);
        if (name.endsWith(".kmz")) return importKMZFile(file);
        if (name.endsWith(".zip")) return importShapefileZIP(file);
        if (name.endsWith(".geojson") || name.endsWith(".json")) return importGeoJSONFile(file);
        if (name.endsWith(".dxf")) return importDXFFile(file);
        if (name.endsWith(".csv")) return importCSVFile(file);

        setStatus("Unsupported file type. Use KML, KMZ, SHP ZIP, GeoJSON, DXF or CSV.", "err");
    }

    /* ========================================================
       15. PANEL POSITIONING
       ======================================================== */
    function positionPanel() {
        if (!panel || !button || !panelOpen) return;
        var pad = 8, vw = window.innerWidth, vh = window.innerHeight;
        var b = button.getBoundingClientRect();

        if (vw <= 600) {
            panel.style.width = (vw - 16) + "px";
            panel.style.left = "8px"; panel.style.right = "auto";
            panel.style.top = "8px"; panel.style.bottom = "auto";
            panel.style.maxHeight = (vh - 16) + "px";
            return;
        }

        panel.style.width = CONFIG.panelWidth + "px";
        panel.style.right = "auto"; panel.style.bottom = "auto";
        panel.style.maxHeight = (vh - pad * 2) + "px";

        var pw = panel.offsetWidth || CONFIG.panelWidth;
        var ph = panel.offsetHeight || 400;

        var spaceRight = vw - b.right, spaceLeft = b.left, left;
        if (spaceRight >= pw + CONFIG.panelGap + pad) left = b.right + CONFIG.panelGap;
        else if (spaceLeft >= pw + CONFIG.panelGap + pad) left = b.left - CONFIG.panelGap - pw;
        else left = Math.max(pad, (vw - pw) / 2);

        left = Math.max(pad, Math.min(left, vw - pw - pad));
        var top = Math.max(pad, Math.min(b.top, vh - ph - pad));
        if (ph > vh - pad * 2) top = pad;

        panel.style.left = Math.round(left) + "px";
        panel.style.top = Math.round(top) + "px";
    }

    /* ========================================================
       16. OPEN / CLOSE
       ======================================================== */
    function openPanel() {
        if (!panel) createPanel();
        panelOpen = true;
        panel.classList.add("gis-import-visible");
        if (button) button.classList.add("gis-import-open");
        refreshHistory();
        requestAnimationFrame(function () { requestAnimationFrame(positionPanel); });
    }

    function closePanel() {
        panelOpen = false;
        if (panel) panel.classList.remove("gis-import-visible");
        if (button) button.classList.remove("gis-import-open");
    }

    function togglePanel() { panelOpen ? closePanel() : openPanel(); }

    /* ========================================================
       17. STATUS
       ======================================================== */
    function setStatus(msg, type) {
        var el = document.getElementById("gis-imp-status");
        if (!el) return;
        el.textContent = msg;
        el.className = "gis-imp-status show" + (type ? " " + type : "");
    }

    /* ========================================================
       18. BUILD BUTTON
       ======================================================== */
    function createButton() {
        var existing = document.getElementById(CONFIG.buttonId);
        if (existing) { button = existing; return; }

        button = document.createElement("button");
        button.id = CONFIG.buttonId;
        button.type = "button";
        button.title = "Import GIS Files (KML, KMZ, SHP, GeoJSON, DXF, CSV)";
        button.textContent = CONFIG.toolIcon;

        button.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (document.body.classList.contains("drag-edit-mode")) return;
            togglePanel();
        });

        document.body.appendChild(button);
    }

    /* ========================================================
       19. BUILD FILE INPUT
       ======================================================== */
    function createFileInput() {
        if (fileInput) return fileInput;

        fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = CONFIG.acceptedExtensions + "," + CONFIG.acceptedMime;
        fileInput.style.display = "none";
        document.body.appendChild(fileInput);

        fileInput.addEventListener("change", function (e) {
            var files = e.target.files;
            if (!files || !files.length) return;
            importFile(files[0]);
            e.target.value = "";
        });

        return fileInput;
    }

    /* ========================================================
       20. BUILD PANEL
       ======================================================== */
    function createPanel() {
        var existing = document.getElementById(CONFIG.panelId);
        if (existing) { panel = existing; return; }

        panel = document.createElement("div");
        panel.id = CONFIG.panelId;

        panel.innerHTML =
'<div class="gis-imp-head">' +
'  <div><div class="gis-imp-t">📂 Import GIS Data</div>' +
'  <div class="gis-imp-st">KML · KMZ · SHP · GeoJSON · DXF · CSV</div></div>' +
'  <button type="button" class="gis-imp-x" id="gis-imp-close">×</button>' +
'</div>' +
'<div class="gis-imp-body">' +

/* Drop zone */
'  <div class="gis-imp-dropzone" id="gis-imp-dropzone">' +
'    <div class="gis-imp-dropzone-icon">📁</div>' +
'    <div class="gis-imp-dropzone-text">Click to browse or drag &amp; drop a file</div>' +
'    <div class="gis-imp-dropzone-hint">Supported: KML, KMZ, Shapefile ZIP, GeoJSON, DXF, CSV</div>' +
'  </div>' +

/* Format badges */
'  <div class="gis-imp-formats">' +
'    <span class="gis-imp-badge kml">KML</span>' +
'    <span class="gis-imp-badge kmz">KMZ</span>' +
'    <span class="gis-imp-badge shp">SHP ZIP</span>' +
'    <span class="gis-imp-badge geojson">GeoJSON</span>' +
'    <span class="gis-imp-badge dxf">DXF</span>' +
'    <span class="gis-imp-badge csv">CSV</span>' +
'  </div>' +

/* CSV column config (hidden by default) */
'  <div class="gis-imp-csv-config" id="gis-imp-csv-config">' +
'    <label>Latitude column</label>' +
'    <select id="gis-imp-csv-lat"></select>' +
'    <label>Longitude column</label>' +
'    <select id="gis-imp-csv-lon"></select>' +
'    <button type="button" class="gis-imp-csv-go" id="gis-imp-csv-go" ' +
'      style="width:100%;height:30px;border:1px solid var(--ui-accent,#1f6feb);' +
'      border-radius:7px;background:var(--ui-accent,#1f6feb);color:#fff;' +
'      font-weight:700;font-size:11px;cursor:pointer;margin-top:4px;">' +
'      Import CSV Points' +
'    </button>' +
'  </div>' +

/* Import history */
'  <div class="gis-imp-history-title" id="gis-imp-history-title" style="display:none;">Recent Imports</div>' +
'  <div id="gis-imp-history"></div>' +

/* Status */
'  <div class="gis-imp-status" id="gis-imp-status"></div>' +

'</div>';

        document.body.appendChild(panel);
        bindPanelEvents();
    }

    /* ========================================================
       21. PANEL EVENTS
       ======================================================== */
    function bindPanelEvents() {
        var input = createFileInput();

        document.getElementById("gis-imp-close").onclick = closePanel;

        // Drop zone click → file browser
        var dz = document.getElementById("gis-imp-dropzone");
        dz.addEventListener("click", function () { input.click(); });

        // Drag and drop
        dz.addEventListener("dragenter", function (e) {
            e.preventDefault(); e.stopPropagation();
            dz.classList.add("dragover");
        });
        dz.addEventListener("dragover", function (e) {
            e.preventDefault(); e.stopPropagation();
            dz.classList.add("dragover");
        });
        dz.addEventListener("dragleave", function (e) {
            e.preventDefault(); e.stopPropagation();
            dz.classList.remove("dragover");
        });
        dz.addEventListener("drop", function (e) {
            e.preventDefault(); e.stopPropagation();
            dz.classList.remove("dragover");
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
                importFile(e.dataTransfer.files[0]);
            }
        });

        // CSV import button
        document.getElementById("gis-imp-csv-go").addEventListener("click", function () {
            if (!pendingCSVData) return;
            var latIdx = parseInt(document.getElementById("gis-imp-csv-lat").value, 10);
            var lonIdx = parseInt(document.getElementById("gis-imp-csv-lon").value, 10);
            if (isNaN(latIdx) || isNaN(lonIdx)) {
                setStatus("Please select both Latitude and Longitude columns.", "err");
                return;
            }
            if (latIdx === lonIdx) {
                setStatus("Latitude and Longitude must be different columns.", "err");
                return;
            }
            doCSVImport(pendingCSVData.parsed, latIdx, lonIdx, pendingCSVData.file);
        });

        // Stop clicks inside the panel from closing it
        panel.addEventListener("click", function (e) { e.stopPropagation(); });
    }

    /* ========================================================
       22. HISTORY UI
       ======================================================== */
    function refreshHistory() {
        var container = document.getElementById("gis-imp-history");
        var title = document.getElementById("gis-imp-history-title");
        if (!container) return;

        container.innerHTML = "";

        if (!importHistory.length) {
            if (title) title.style.display = "none";
            return;
        }

        if (title) title.style.display = "block";

        var badgeColors = {
            KML: "#e65100", KMZ: "#bf360c", Shapefile: "#1565c0", SHP: "#1565c0",
            GeoJSON: "#2e7d32", DXF: "#7b1fa2", CSV: "#c2185b"
        };

        importHistory.forEach(function (entry) {
            var item = document.createElement("div");
            item.className = "gis-imp-history-item";

            var badge = badgeColors[entry.type] || "#666";

            item.innerHTML =
                '<span class="gis-imp-history-name" title="' + escapeHTML(entry.name) + '">' +
                    escapeHTML(entry.name) +
                '</span>' +
                '<span class="gis-imp-history-type" style="background:' + badge + ';">' +
                    escapeHTML(entry.type) +
                '</span>' +
                '<span class="gis-imp-history-count">' + entry.count + '</span>' +
                '<button type="button" class="gis-imp-history-zoom" title="Zoom to layer">🔍</button>';

            item.querySelector(".gis-imp-history-zoom").addEventListener("click", function (e) {
                e.stopPropagation();
                if (entry.layer) zoomToLayer(entry.layer);
            });

            container.appendChild(item);
        });
    }

    function escapeHTML(s) {
        return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    /* ========================================================
       23. GLOBAL EVENTS
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
       24. PUBLIC API
       ======================================================== */
    window.GISImport = {
        open: openPanel,
        close: closePanel,
        toggle: togglePanel,
        importFile: importFile,
        removeLayer: function (layer) {
            if (!layer || layer.get("imported") !== true) return;
            var m = getMap();
            if (m) m.removeLayer(layer);
            if (typeof vectorLayers !== "undefined" && Array.isArray(vectorLayers)) {
                var idx = vectorLayers.indexOf(layer);
                if (idx !== -1) vectorLayers.splice(idx, 1);
            }
            if (typeof rebuildLayerManager === "function") {
                try { rebuildLayerManager(); } catch (e) {}
            }
        },
        removeAll: function () {
            var m = getMap();
            if (!m) return;
            var toRemove = [];
            m.getLayers().forEach(function (l) {
                if (l && l.get("imported") === true) toRemove.push(l);
            });
            toRemove.forEach(function (l) { GISImport.removeLayer(l); });
        },
        getHistory: function () { return importHistory.slice(); }
    };

    /* ========================================================
       25. INITIALIZE
       ======================================================== */
    function initialize() {
        injectCSS();
        createButton();
        createPanel();
        closePanel();
        createFileInput();

        registerWithToolManager();
        bindGlobalEvents();

        console.log("📂 Universal GIS Import Tool v2.0 READY.");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize);
    } else {
        initialize();
    }

})();