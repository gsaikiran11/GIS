// ============================================================
// 🌐 STAGE 16 — EXTERNAL MAP SERVICES (v4.6)
// QGIS2WEB + OPENLAYERS
//
// WMS + WMTS + XYZ + MBTiles + GeoTIFF
//
// v4.6 CHANGELOG
// ------------------------------------------------------------
//  ✔ Restored OpenLayers' native GeoTIFF normalization for consistent imagery
//  ✔ Combine embedded alpha and NoData masks to keep raster backgrounds transparent
//  ✔ Robust sample-based GeoTIFF contrast stretch for rasters without statistics
//  ✔ Remove-all action clears external layers without a blocking browser prompt
//  ✔ Manual GeoTIFF source CRS override with EPSG lookup
//  ✔ Validate raster extents before changing the map view
//  ✔ Local MBTiles and GeoTIFF raster import with IndexedDB persistence
//  ✔ GeoTIFF UTM projection support and band-aware raster rendering
//  ✔ Raster layer restore, opacity control, removal, and extent fitting
//  ✔ Mobile Width Constraint — panel NEVER stretches full width
//  ✔ Auto-Centering Card — floats centered on mobile (max 320px)
//  ✔ Dynamic Max-Height Engine — panel always fits the screen
//  ✔ Custom Vertical Scrollbar — styled like Dynamic Style Editor
//  ✔ Button size harmonized to 40×40 (matches all other tools)
//  ✔ Rounded-square button (was circle)
//  ✔ Style Property Overrides — setProperty(..., 'important')
//  ✔ Fully draggable + hideable by MapToolManager on mobile too
//  ✔ Panel auto-follows the button wherever you drag it
//  ✔ Full persistence: services and locally imported rasters are restored
//  ✔ ESC to close, click-outside to close
//  ✔ Closes automatically when Tool Manager enters edit mode
//
// LAYER ORDER
// ------------------------------------------------------------
//        TOP
//         ├── Vector / Parcel / Labels / Measurements
//         ├── ⭐ STAGE 16 EXTERNAL MAP (WMS / WMTS / XYZ / RASTER)
//         └── Existing QGIS2Web BASE MAP
//        BOTTOM
// ============================================================

(function () {
    "use strict";

    // =========================================================
    // CONFIGURATION
    // =========================================================
    var CONFIG = {
        toolId: "stage16",
        toolName: "External Maps",
        toolIcon: "🌐",

        buttonId: "stage16-map-services-button",
        panelId: "stage16-map-services-panel",

        storageKey: "stage16ExternalMapServices_v4",
        proxyKey: "stage16CorsProxy_v4",

        defaultOpacity: 1,
        tileSize: 256,

        baseMapGap: 1,
        vectorGap: 1,

        btnSize: 40,
        panelWidth: 320,
        panelGap: 8,

        // Default on-screen position (Tool Manager may override)
        defaults: { top: 136, right: 12 },

        fetchTimeout: 20000
    };

    // =========================================================
    // STATE
    // =========================================================
    var externalLayers = [];

    var mapRef = null;
    var button = null;
    var panel = null;
    var panelOpen = false;
    var activeExternalBaseMap = null;
    var corsProxy = "";

    var wmsCapabilities = null;
    var wmtsCapabilities = null;

    // =========================================================
    // SAFETY
    // =========================================================
    if (typeof ol === "undefined") {
        console.error("🌐 Stage 16: OpenLayers (ol) not found.");
        return;
    }

    // =========================================================
    // LOCAL RASTER FILES
    // =========================================================
    var rasterDatabasePromise = null;
    var sqlJsPromise = null;

    function openRasterDatabase() {
        if (!window.indexedDB) {
            return Promise.reject(new Error("This browser does not support IndexedDB."));
        }

        if (rasterDatabasePromise) {
            return rasterDatabasePromise;
        }

        rasterDatabasePromise = new Promise(function (resolve, reject) {
            var request = window.indexedDB.open("stage16RasterFiles", 1);

            request.onupgradeneeded = function () {
                var database = request.result;
                if (!database.objectStoreNames.contains("files")) {
                    database.createObjectStore("files");
                }
            };

            request.onsuccess = function () {
                resolve(request.result);
            };

            request.onerror = function () {
                reject(request.error || new Error("Could not open raster-file storage."));
            };
        });

        return rasterDatabasePromise;
    }

    function storeRasterFile(id, file) {
        return openRasterDatabase().then(function (database) {
            return new Promise(function (resolve, reject) {
                var transaction = database.transaction(["files"], "readwrite");
                transaction.objectStore("files").put(file, id);
                transaction.oncomplete = resolve;
                transaction.onerror = function () {
                    reject(transaction.error || new Error("Could not save the raster file."));
                };
                transaction.onabort = function () {
                    reject(transaction.error || new Error("Raster-file storage was aborted."));
                };
            });
        });
    }

    function loadRasterFile(id) {
        return openRasterDatabase().then(function (database) {
            return new Promise(function (resolve, reject) {
                var request = database.transaction(["files"], "readonly")
                    .objectStore("files").get(id);
                request.onsuccess = function () {
                    if (!request.result) {
                        reject(new Error("The stored raster file is missing. Import it again."));
                        return;
                    }
                    resolve(request.result);
                };
                request.onerror = function () {
                    reject(request.error || new Error("Could not read the stored raster file."));
                };
            });
        });
    }

    function deleteRasterFile(id) {
        return openRasterDatabase().then(function (database) {
            return new Promise(function (resolve, reject) {
                var transaction = database.transaction(["files"], "readwrite");
                transaction.objectStore("files").delete(id);
                transaction.oncomplete = resolve;
                transaction.onerror = function () {
                    reject(transaction.error || new Error("Could not delete the stored raster file."));
                };
            });
        });
    }

    function loadSqlJs() {
        if (window.initSqlJs) {
            return Promise.resolve(window.initSqlJs);
        }

        if (sqlJsPromise) {
            return sqlJsPromise;
        }

        sqlJsPromise = new Promise(function (resolve, reject) {
            var script = document.createElement("script");
            script.src = "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.13.0/sql-wasm.js";
            script.onload = function () {
                if (!window.initSqlJs) {
                    reject(new Error("The MBTiles database reader did not initialize."));
                    return;
                }
                resolve(window.initSqlJs);
            };
            script.onerror = function () {
                reject(new Error("Could not load the MBTiles database reader. Check your internet connection."));
            };
            document.head.appendChild(script);
        }).then(function (initSqlJs) {
            return initSqlJs({
                locateFile: function (file) {
                    return "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.13.0/" + file;
                }
            });
        });

        return sqlJsPromise;
    }

    function getMbtilesMetadata(database) {
        var metadata = {};
        var tables = database.exec(
            "SELECT name FROM sqlite_master WHERE type = 'table'"
        );
        var tableNames = tables.length ? tables[0].values.map(function (row) {
            return row[0];
        }) : [];

        if (tableNames.indexOf("metadata") >= 0) {
            var rows = database.exec("SELECT name, value FROM metadata");
            if (rows.length) {
                rows[0].values.forEach(function (row) {
                    metadata[String(row[0]).toLowerCase()] = String(row[1]);
                });
            }
        }

        if (tableNames.indexOf("tiles") < 0 &&
            !(tableNames.indexOf("map") >= 0 && tableNames.indexOf("images") >= 0)) {
            throw new Error("This MBTiles file has no recognized raster tile tables.");
        }

        return { metadata: metadata, tables: tableNames };
    }

    function createMbtilesLayer(blob) {
        return loadSqlJs().then(function (initSqlJs) {
            return blob.arrayBuffer().then(function (buffer) {
                var database = new initSqlJs.Database(new Uint8Array(buffer));
                var info;

                try {
                    info = getMbtilesMetadata(database);
                } catch (error) {
                    database.close();
                    throw error;
                }

                var metadata = info.metadata;
                var format = String(metadata.format || "png").toLowerCase();
                var mimeTypes = {
                    png: "image/png",
                    jpg: "image/jpeg",
                    jpeg: "image/jpeg",
                    webp: "image/webp"
                };

                if (!mimeTypes[format]) {
                    database.close();
                    if (format === "pbf" || format === "mvt") {
                        throw new Error("Vector-tile MBTiles are not supported; use raster MBTiles.");
                    }
                    throw new Error("Unsupported MBTiles raster format: " + format);
                }

                var directQuery = null;
                var normalizedQuery = null;
                try {
                    if (info.tables.indexOf("tiles") >= 0) {
                        directQuery = database.prepare(
                            "SELECT tile_data FROM tiles WHERE zoom_level = ? " +
                            "AND tile_column = ? AND tile_row = ? LIMIT 1"
                        );
                    } else {
                        normalizedQuery = database.prepare(
                            "SELECT images.tile_data FROM map " +
                            "JOIN images ON map.tile_id = images.tile_id " +
                            "WHERE map.zoom_level = ? AND map.tile_column = ? " +
                            "AND map.tile_row = ? LIMIT 1"
                        );
                    }
                } catch (error) {
                    database.close();
                    throw new Error("Could not read the MBTiles tile tables: " + error.message);
                }

                var objectUrls = {};
                var urlCache = {};
                var scheme = String(metadata.scheme || "tms").toLowerCase();
                var maxZoom = Number(metadata.maxzoom);
                var minZoom = Number(metadata.minzoom);
                var sourceOptions = {
                    projection: "EPSG:3857",
                    wrapX: false,
                    tileUrlFunction: function (tileCoord) {
                        if (!tileCoord) {
                            return undefined;
                        }

                        var z = tileCoord[0];
                        var x = tileCoord[1];
                        var y = -tileCoord[2] - 1;
                        var tileCount = Math.pow(2, z);

                        if (x < 0 || y < 0 || x >= tileCount || y >= tileCount) {
                            return undefined;
                        }

                        var row = scheme === "xyz" ? y : tileCount - 1 - y;
                        var key = z + "/" + x + "/" + row;
                        if (urlCache[key]) {
                            var cachedUrl = urlCache[key];
                            delete urlCache[key];
                            urlCache[key] = cachedUrl;
                            return urlCache[key];
                        }

                        var statement = directQuery || normalizedQuery;
                        statement.bind([z, x, row]);
                        var found = statement.step();
                        var tile = found ? statement.getAsObject().tile_data : null;
                        statement.reset();

                        if (!tile) {
                            return undefined;
                        }

                        var tileBytes = tile instanceof Uint8Array ? tile : new Uint8Array(tile);
                        var url = URL.createObjectURL(new Blob([tileBytes], {
                            type: mimeTypes[format]
                        }));
                        urlCache[key] = url;
                        objectUrls[key] = url;

                        var cachedKeys = Object.keys(urlCache);
                        if (cachedKeys.length > 512) {
                            var oldestKey = cachedKeys[0];
                            URL.revokeObjectURL(urlCache[oldestKey]);
                            delete urlCache[oldestKey];
                            delete objectUrls[oldestKey];
                        }

                        return url;
                    }
                };

                if (Number.isFinite(maxZoom)) {
                    sourceOptions.maxZoom = maxZoom;
                }
                if (Number.isFinite(minZoom)) {
                    sourceOptions.minZoom = minZoom;
                }

                var source = new ol.source.XYZ(sourceOptions);
                var layer = new ol.layer.Tile({
                    source: source,
                    visible: true,
                    opacity: CONFIG.defaultOpacity,
                    properties: {
                        stage16External: true,
                        stage16ExternalType: "MBTiles",
                        stage16ExternalBaseMap: true,
                        title: metadata.name || "MBTiles"
                    }
                });

                var extent = null;
                if (metadata.bounds) {
                    var bounds = metadata.bounds.split(",").map(Number);
                    if (bounds.length === 4 && bounds.every(Number.isFinite)) {
                        extent = ol.proj.transformExtent(
                            bounds, "EPSG:4326", "EPSG:3857"
                        );
                    }
                }

                return {
                    layer: layer,
                    extent: extent,
                    projection: "EPSG:3857",
                    cleanup: function () {
                        Object.keys(objectUrls).forEach(function (key) {
                            URL.revokeObjectURL(objectUrls[key]);
                        });
                        if (directQuery) {
                            directQuery.free();
                        }
                        if (normalizedQuery) {
                            normalizedQuery.free();
                        }
                        database.close();
                    }
                };
            });
        });
    }

    function createGeoTiffLayer(blob, title, crsOverride) {
        if (!ol.source.GeoTIFF || !ol.layer.WebGLTile) {
            return Promise.reject(new Error("GeoTIFF is not available in this OpenLayers build."));
        }

        if (!window.GeoTIFF || typeof window.GeoTIFF.fromBlob !== "function") {
            return Promise.reject(new Error("The GeoTIFF decoder is not loaded. Reload the page and try again."));
        }

        var proj4lib = window.proj4;
        if (!proj4lib || !ol.proj.proj4 || !ol.proj.proj4.register) {
            return Promise.reject(new Error("Projection support is not loaded. Reload the page and try again."));
        }

        for (var zone = 1; zone <= 60; zone += 1) {
            proj4lib.defs("EPSG:" + (32600 + zone),
                "+proj=utm +zone=" + zone + " +datum=WGS84 +units=m +no_defs +type=crs");
            proj4lib.defs("EPSG:" + (32700 + zone),
                "+proj=utm +zone=" + zone + " +south +datum=WGS84 +units=m +no_defs +type=crs");
        }
        ol.proj.proj4.register(proj4lib);

        return resolveRasterProjection(crsOverride).then(function (projectionOverride) {
            return window.GeoTIFF.fromBlob(blob).then(function (tiff) {
                return tiff.getImage().then(function (image) {
                    var bandCount = image.getSamplesPerPixel();
                    if (!bandCount) {
                        throw new Error("The GeoTIFF contains no raster bands.");
                    }

                    var noDataValue = image.getGDALNoData();
                    var hasNoData = noDataValue !== null && noDataValue !== undefined;
                    if (typeof noDataValue === "string") {
                        hasNoData = noDataValue.trim() !== "";
                        if (hasNoData) {
                            noDataValue = Number(noDataValue);
                        }
                    }
                    var extraSamples = image.getFileDirectory().ExtraSamples || [];
                    var hasAlpha = extraSamples.some(function (sampleType) {
                        return Number(sampleType) === 1 || Number(sampleType) === 2;
                    });
                    var alphaExpressions = [];
                    if (hasAlpha) {
                        alphaExpressions.push(["band", bandCount]);
                    }
                    if (hasNoData) {
                        alphaExpressions.push(["band", bandCount + 1]);
                    }
                    var alphaExpression = alphaExpressions.length ?
                        alphaExpressions.reduce(function (combined, expression) {
                            return combined ?
                                ["*", combined, expression] : expression;
                        }, null) : 1;
                    var greenBand = bandCount >= 3 ? 2 : 1;
                    var blueBand = bandCount >= 3 ? 3 : 1;
                    var color = ["array",
                        ["band", 1],
                        ["band", greenBand],
                        ["band", blueBand],
                        alphaExpression
                    ];
                    var geoTiffOptions = {
                        sources: [{ blob: blob }],
                        convertToRGB: "auto",
                        normalize: true
                    };
                    if (projectionOverride) {
                        geoTiffOptions.projection = projectionOverride;
                    }

                    var source = new ol.source.GeoTIFF(geoTiffOptions);
                    var layer = new ol.layer.WebGLTile({
                        source: source,
                        style: { color: color },
                        visible: true,
                        opacity: CONFIG.defaultOpacity,
                        properties: {
                            stage16External: true,
                            stage16ExternalType: "GeoTIFF",
                            stage16ExternalBaseMap: true,
                            title: title
                        }
                    });

                    return source.getView().then(function (viewOptions) {
                                var rasterProjection = viewOptions.projection;
                                var rasterExtent = viewOptions.extent;
                                var mapProjection = mapRef.getView().getProjection();
                                var rasterCode = rasterProjection && rasterProjection.getCode ?
                                    rasterProjection.getCode() : String(rasterProjection || "");
                                var mapCode = mapProjection.getCode();

                                if (!rasterProjection || !rasterExtent ||
                                    !rasterExtent.every(Number.isFinite) ||
                                    rasterExtent[0] >= rasterExtent[2] ||
                                    rasterExtent[1] >= rasterExtent[3]) {
                                    throw new Error(
                                        "Could not read a valid extent and CRS from this GeoTIFF. " +
                                        "Choose its source CRS manually and import it again."
                                    );
                                }

                                if (rasterCode !== mapCode) {
                                    var center = ol.extent.getCenter(rasterExtent);
                                    var transformedCenter = ol.proj.transform(
                                        center, rasterProjection, mapProjection
                                    );
                                    var transformedProbe = ol.proj.transform(
                                        [center[0] + 1, center[1] + 1],
                                        rasterProjection,
                                        mapProjection
                                    );

                                    if (!transformedCenter.every(Number.isFinite) ||
                                        !transformedProbe.every(Number.isFinite) ||
                                        (transformedCenter[0] === center[0] &&
                                         transformedCenter[1] === center[1] &&
                                         transformedProbe[0] === center[0] + 1 &&
                                         transformedProbe[1] === center[1] + 1)) {
                                        throw new Error(
                                            "The GeoTIFF uses " + rasterCode +
                                            ", which cannot be transformed to " + mapCode +
                                            ". This file may use a custom projection."
                                        );
                                    }
                                }

                                source.on("tileloaderror", function (event) {
                                    console.error("🌐 Stage 16 GeoTIFF tile error:", event);
                                    var status = document.getElementById("stage16-raster-status");
                                    if (status) {
                                        setStatus(status,
                                            "The raster was added, but one or more tiles failed to render. Check the browser console.",
                                            "err");
                                    }
                                });

                                return {
                                    layer: layer,
                                    extent: rasterExtent,
                                    projection: rasterProjection,
                                    cleanup: null
                                };
                    });
                });
            });
        });
    }

    function resolveRasterProjection(crs) {
        crs = String(crs || "").trim();
        if (!crs) {
            return Promise.resolve(null);
        }

        var code = crs.toUpperCase();
        if (/^\d+$/.test(code)) {
            code = "EPSG:" + code;
        }
        if (!/^EPSG:\d+$/.test(code)) {
            return Promise.reject(new Error("Enter a CRS as an EPSG code, for example EPSG:32643."));
        }

        var existing = ol.proj.get(code);
        if (existing) {
            return Promise.resolve(existing);
        }

        var epsg = code.slice(5);
        return fetch("https://epsg.io/" + encodeURIComponent(epsg) + ".proj4")
            .then(function (response) {
                if (!response.ok) {
                    throw new Error("CRS lookup failed for " + code + ".");
                }
                return response.text();
            })
            .then(function (definition) {
                definition = definition.trim();
                if (definition.charAt(0) !== "+") {
                    throw new Error("No Proj4 definition was found for " + code + ".");
                }
                window.proj4.defs(code, definition);
                ol.proj.proj4.register(window.proj4);
                var projection = ol.proj.get(code);
                if (!projection) {
                    throw new Error("OpenLayers could not register " + code + ".");
                }
                return projection;
            });
    }

    function fitRasterLayer(result) {
        if (!result.extent || !result.projection) {
            return;
        }
        var view = mapRef.getView();
        var extent;
        try {
            extent = ol.proj.transformExtent(
                result.extent,
                result.projection,
                view.getProjection()
            );
        } catch (error) {
            console.warn("🌐 Stage 16: could not fit raster extent —", error.message);
            return;
        }

        if (!extent || !extent.every(Number.isFinite) ||
            extent[0] >= extent[2] || extent[1] >= extent[3]) {
            console.warn("🌐 Stage 16: raster extent is invalid; map view was not changed.");
            return;
        }

        var projectionExtent = view.getProjection().getExtent();
        if (projectionExtent &&
            (extent[0] < projectionExtent[0] - 1000000 ||
             extent[1] < projectionExtent[1] - 1000000 ||
             extent[2] > projectionExtent[2] + 1000000 ||
             extent[3] > projectionExtent[3] + 1000000)) {
            console.warn("🌐 Stage 16: raster extent is outside the map projection; map view was not changed.");
            return;
        }

        try {
            view.fit(extent, {
                padding: [30, 30, 30, 30],
                maxZoom: 16,
                duration: 250
            });
        } catch (error) {
            console.warn("🌐 Stage 16: could not zoom to raster —", error.message);
        }
    }

    function importRasterFiles() {
        var input = document.getElementById("stage16-raster-files");
        var status = document.getElementById("stage16-raster-status");
        var files = Array.from(input.files || []);
        var crsSelect = document.getElementById("stage16-raster-crs");
        var selectedCrs = crsSelect.value === "custom" ?
            document.getElementById("stage16-raster-custom-crs").value.trim() :
            crsSelect.value;

        if (!files.length) {
            setStatus(status, "Choose one or more MBTiles or GeoTIFF files first.", "err");
            return;
        }

        if (crsSelect.value === "custom" && !selectedCrs) {
            setStatus(status, "Enter the EPSG code to use for this GeoTIFF.", "err");
            return;
        }

        var buttonEl = document.getElementById("stage16-raster-add");
        buttonEl.disabled = true;
        setStatus(status, "Importing raster files…");

        files.reduce(function (chain, file) {
            return chain.then(function (imported) {
                var extensionMatch = file.name.match(/\.([^.]+)$/);
                var extension = extensionMatch ? extensionMatch[1].toLowerCase() : "";
                var type = extension === "mbtiles" ? "MBTiles" :
                    (extension === "tif" || extension === "tiff" ? "GeoTIFF" : "");

                if (!type) {
                    throw new Error("Unsupported raster file: " + file.name);
                }

                var fileId = [
                    type,
                    file.name,
                    file.size,
                    file.lastModified,
                    type === "GeoTIFF" ? selectedCrs : ""
                ].join(":");
                var title = file.name.replace(/\.(mbtiles|tif|tiff)$/i, "");

                var layerPromise = type === "MBTiles" ?
                    createMbtilesLayer(file) :
                    createGeoTiffLayer(file, title, selectedCrs);

                return layerPromise.then(function (result) {
                    return storeRasterFile(fileId, file).then(function () {
                        var added;
                        try {
                            added = addExternalBaseMap(result.layer, {
                                type: type,
                                name: title,
                                title: title,
                                fileId: fileId,
                                crs: type === "GeoTIFF" ? selectedCrs : ""
                            }, result.cleanup);
                        } catch (error) {
                            if (result.cleanup) {
                                result.cleanup();
                            }
                            throw error;
                        }

                        if (!added) {
                            if (result.cleanup) {
                                result.cleanup();
                            }
                            throw new Error("This raster file has already been imported.");
                        }

                        fitRasterLayer(result);
                        return imported + 1;
                    }, function (error) {
                        if (result.cleanup) {
                            result.cleanup();
                        }
                        throw error;
                    });
                });
            });
        }, Promise.resolve(0)).then(function (count) {
            setStatus(status, "✓ Imported " + count + " raster file(s).", "ok");
            input.value = "";
        }).catch(function (error) {
            console.error("🌐 Stage 16 raster import:", error);
            setStatus(status, "✕ " + error.message, "err");
        }).then(function () {
            buttonEl.disabled = false;
        });
    }

    // =========================================================
    // WAIT FOR MAP (avoids race conditions)
    // =========================================================
    function waitForMap(callback) {
        var tries = 0;

        function poll() {
            var candidate = null;

            if (typeof map !== "undefined" && map) {
                candidate = map;
            } else if (window.map) {
                candidate = window.map;
            }

            if (candidate && typeof candidate.getLayers === "function") {
                mapRef = candidate;
                callback();
                return;
            }

            tries = tries + 1;

            if (tries > 100) {
                console.error("🌐 Stage 16: `map` was never found.");
                return;
            }

            setTimeout(poll, 100);
        }

        poll();
    }

    // =========================================================
    // TOOL MANAGER REGISTRATION
    // ---------------------------------------------------------
    // Works whether the Tool Manager loads BEFORE or AFTER this.
    // =========================================================
    function registerWithToolManager() {
        var descriptor = {
            id: CONFIG.toolId,
            name: CONFIG.toolName,
            icon: CONFIG.toolIcon,
            selector: "#" + CONFIG.buttonId,
            defaults: CONFIG.defaults,
            visible: true
        };

        window.MapToolRegistry = window.MapToolRegistry || [];

        var already = window.MapToolRegistry.some(function (item) {
            return item.id === descriptor.id;
        });

        if (!already) {
            window.MapToolRegistry.push(descriptor);
        }

        if (window.MapToolManager && window.MapToolManager.register) {
            window.MapToolManager.register(descriptor);
        }
    }

    // =========================================================
    // CSS INJECTION
    // ---------------------------------------------------------
    // NOTE: No `!important` on top/right/display for the button,
    //       so the Tool Manager can freely move and hide it.
    // =========================================================
    function injectCSS() {
        if (document.getElementById("stage16-css")) {
            return;
        }

        var css = document.createElement("style");
        css.id = "stage16-css";

        css.textContent = `

/* ===================== TRIGGER BUTTON ===================== */
#${CONFIG.buttonId} {
    position: fixed;
    top: ${CONFIG.defaults.top}px;
    right: ${CONFIG.defaults.right}px;
    left: auto;
    bottom: auto;

    width: ${CONFIG.btnSize}px;
    height: ${CONFIG.btnSize}px;
    min-width: ${CONFIG.btnSize}px;
    min-height: ${CONFIG.btnSize}px;

    padding: 0;
    margin: 0;

    border: 1px solid var(--ui-border, #d7dce3);
    border-radius: var(--ui-radius-sm, 7px);

    background: var(--ui-bg, #ffffff);
    color: var(--ui-text, #1d2430);

    box-shadow: var(--ui-shadow-sm, 0 1px 4px rgba(16,24,40,0.16));

    cursor: pointer;
    z-index: 16995;

    display: flex;
    align-items: center;
    justify-content: center;

    box-sizing: border-box;
    -webkit-tap-highlight-color: transparent;

    transition:
        background .15s ease,
        border-color .15s ease;
}

#${CONFIG.buttonId}:hover {
    background: var(--ui-bg-hover, #eef1f5);
    border-color: var(--ui-accent, #1f6feb);
}

#${CONFIG.buttonId}.stage16-open {
    background: var(--ui-accent, #1f6feb);
    border-color: var(--ui-accent, #1f6feb);
    color: #ffffff;
}

/* Never animate/scale while being dragged in edit mode */
body.drag-edit-mode #${CONFIG.buttonId},
body.drag-edit-mode #${CONFIG.buttonId}:hover,
#${CONFIG.buttonId}.is-dragging {
    transform: none !important;
}


/* ===================== PANEL ===================== */
#${CONFIG.panelId} {
    position: fixed;
    top: ${CONFIG.defaults.top}px;
    right: ${CONFIG.defaults.right + CONFIG.btnSize + CONFIG.panelGap}px;
    left: auto;
    bottom: auto;

    width: ${CONFIG.panelWidth}px;
    max-width: calc(100vw - 24px);
    max-height: calc(100vh - 24px);

    overflow: hidden;

    background: var(--ui-bg, #ffffff);
    border: 1px solid var(--ui-border, #d7dce3);
    border-radius: var(--ui-radius, 10px);
    box-shadow: 0 8px 32px rgba(0,0,0,.25);

    z-index: 50000;

    font-family: var(--ui-font, "Segoe UI", Roboto, system-ui, sans-serif);
    font-size: 12px;
    color: var(--ui-text, #1d2430);

    box-sizing: border-box;
    display: none;
    flex-direction: column;
}

#${CONFIG.panelId}.stage16-visible {
    display: flex;
    animation: stage16-fade .16s ease;
}

@keyframes stage16-fade {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
}

#${CONFIG.panelId} * {
    box-sizing: border-box;
}


/* ===================== HEADER ===================== */
.stage16-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 10px 12px;
    background: var(--ui-bg-subtle, #f5f7fa);
    border-bottom: 1px solid var(--ui-border-soft, #e9edf2);
    flex-shrink: 0;
}

.stage16-title {
    font-size: 13px;
    font-weight: 700;
    color: var(--ui-text, #1d2430);
}

.stage16-subtitle {
    margin-top: 1px;
    font-size: 10px;
    color: var(--ui-text-muted, #5b6472);
}

#stage16-close {
    width: 26px;
    height: 26px;
    flex-shrink: 0;
    border: none;
    background: transparent;
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
    color: var(--ui-text-muted, #5b6472);
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
}

#stage16-close:hover {
    background: var(--ui-bg-hover, #eef1f5);
    color: var(--ui-text, #1d2430);
}


/* ===================== TABS ===================== */
.stage16-tabs {
    display: flex;
    border-bottom: 1px solid var(--ui-border-soft, #e9edf2);
    background: var(--ui-bg, #ffffff);
    flex-shrink: 0;
}

.stage16-tab {
    flex: 1;
    padding: 8px 4px;
    border: none;
    border-bottom: 2px solid transparent;
    background: transparent;
    cursor: pointer;
    font-family: inherit;
    font-size: 11px;
    font-weight: 600;
    color: var(--ui-text-muted, #5b6472);
    text-align: center;
    transition: color .15s ease, border-color .15s ease, background .15s ease;
}

.stage16-tab:hover {
    background: var(--ui-bg-hover, #eef1f5);
    color: var(--ui-text, #1d2430);
}

.stage16-tab.active {
    color: var(--ui-accent, #1f6feb);
    border-bottom-color: var(--ui-accent, #1f6feb);
}

.stage16-badge {
    display: inline-block;
    min-width: 15px;
    margin-left: 3px;
    padding: 0 4px;
    border-radius: 8px;
    background: var(--ui-accent, #1f6feb);
    color: #fff;
    font-size: 9px;
    line-height: 15px;
}


/* ============ TAB CONTENT & CUSTOM SCROLLBAR ============ */
.stage16-tab-content {
    padding: 11px;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    flex: 1;
    min-height: 0;
}

.stage16-tab-content::-webkit-scrollbar {
    width: 6px !important;
}

.stage16-tab-content::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.02) !important;
    border-radius: 3px !important;
}

.stage16-tab-content::-webkit-scrollbar-thumb {
    background: var(--ui-border-strong, #aeb6c2) !important;
    border-radius: 3px !important;
}

.stage16-tab-content::-webkit-scrollbar-thumb:hover {
    background: var(--ui-accent, #1f6feb) !important;
}

.stage16-tab-content label {
    display: block;
    margin: 4px 0 3px;
    font-size: 10.5px;
    font-weight: 700;
    color: var(--ui-text-muted, #5b6472);
    text-transform: uppercase;
    letter-spacing: .3px;
}

.stage16-tab-content input[type="text"],
.stage16-tab-content input[type="file"],
.stage16-tab-content select {
    width: 100%;
    height: 30px;
    padding: 4px 7px;
    margin-bottom: 7px;
    border: 1px solid var(--ui-border, #d7dce3);
    border-radius: var(--ui-radius-sm, 7px);
    background: var(--ui-bg-subtle, #f5f7fa);
    color: var(--ui-text, #1d2430);
    font-family: inherit;
    font-size: 11px;
    outline: none;
}

.stage16-tab-content input[type="text"]:focus,
.stage16-tab-content select:focus {
    border-color: var(--ui-accent, #1f6feb);
    box-shadow: 0 0 0 3px var(--ui-accent-soft, rgba(31,111,235,0.12));
}

.stage16-primary {
    width: 100%;
    height: 32px;
    margin: 4px 0 7px;
    padding: 0 10px;
    border: 1px solid var(--ui-accent, #1f6feb);
    border-radius: var(--ui-radius-sm, 7px);
    background: var(--ui-accent, #1f6feb);
    color: #ffffff;
    font-family: inherit;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    transition: background .15s ease;
}

.stage16-primary:hover {
    background: var(--ui-accent-dark, #1657b0);
}

.stage16-primary:disabled {
    opacity: .55;
    cursor: not-allowed;
}

.stage16-secondary {
    width: 100%;
    height: 30px;
    margin: 0 0 6px;
    border: 1px solid var(--ui-border, #d7dce3);
    border-radius: var(--ui-radius-sm, 7px);
    background: var(--ui-bg, #fff);
    color: var(--ui-text, #1d2430);
    font-family: inherit;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
}

.stage16-secondary:hover {
    background: var(--ui-bg-hover, #eef1f5);
    border-color: var(--ui-accent, #1f6feb);
}

.stage16-status {
    min-height: 15px;
    margin: 0 0 8px;
    font-size: 10.5px;
    line-height: 1.35;
    color: var(--ui-text-muted, #5b6472);
    word-break: break-word;
}

.stage16-status.ok {
    color: var(--ui-success, #16a34a);
}

.stage16-status.err {
    color: var(--ui-danger, #dc2626);
}

.stage16-hint {
    margin: -2px 0 9px;
    font-size: 9.5px;
    line-height: 1.4;
    color: var(--ui-text-faint, #8b93a1);
}

.stage16-divider {
    height: 1px;
    margin: 9px 0;
    background: var(--ui-border-soft, #e9edf2);
}

.stage16-check {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0 0 6px;
    font-size: 10.5px;
    font-weight: 600;
    color: var(--ui-text-muted, #5b6472);
    cursor: pointer;
    text-transform: none;
    letter-spacing: 0;
}

.stage16-check input {
    width: auto !important;
    height: auto !important;
    margin: 0 !important;
}


/* ===================== LAYER LIST ===================== */
.stage16-layer-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.stage16-layer-row {
    padding: 8px;
    border: 1px solid var(--ui-border-soft, #e9edf2);
    border-radius: var(--ui-radius-sm, 7px);
    background: var(--ui-bg-subtle, #f5f7fa);
    transition: border-color .15s ease, background .15s ease;
}

.stage16-layer-row.active {
    border-color: var(--ui-accent, #1f6feb);
    background: var(--ui-accent-soft, rgba(31,111,235,0.08));
}

.stage16-layer-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
}

.stage16-layer-name {
    display: flex !important;
    align-items: center;
    gap: 6px;
    min-width: 0;
    flex: 1;
    margin: 0 !important;
    cursor: pointer;
    text-transform: none !important;
    letter-spacing: 0 !important;
}

.stage16-layer-name input {
    width: auto !important;
    height: auto !important;
    margin: 0 !important;
}

.stage16-layer-name span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--ui-text, #1d2430);
}

.stage16-type {
    flex: 0 0 auto;
    padding: 2px 5px;
    border-radius: 4px;
    background: var(--ui-border-soft, #e9edf2);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: .4px;
    color: var(--ui-text-muted, #5b6472);
}

.stage16-layer-controls {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 7px;
}

.stage16-small {
    width: 26px;
    height: 26px;
    flex: 0 0 auto;
    padding: 0;
    border: 1px solid var(--ui-border, #d7dce3);
    border-radius: 5px;
    background: var(--ui-bg, #ffffff);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    line-height: 1;
}

.stage16-small:hover {
    background: var(--ui-bg-hover, #eef1f5);
}

.stage16-delete:hover {
    color: var(--ui-danger, #dc2626);
    border-color: var(--ui-danger, #dc2626);
}

.stage16-opacity {
    flex: 1;
    height: 4px;
    min-width: 40px;
}

.stage16-opacity-value {
    width: 32px;
    flex: 0 0 auto;
    text-align: right;
    font-size: 9.5px;
    color: var(--ui-text-muted, #5b6472);
}

.stage16-empty {
    padding: 22px 10px;
    text-align: center;
    color: var(--ui-text-faint, #8b93a1);
    font-size: 11px;
    line-height: 1.5;
}


/* ===================== FOOTER ===================== */
.stage16-footer {
    padding: 8px 12px;
    border-top: 1px solid var(--ui-border-soft, #e9edf2);
    background: var(--ui-bg-subtle, #f5f7fa);
    color: var(--ui-text-muted, #5b6472);
    font-size: 9.5px;
    line-height: 1.4;
    text-align: center;
    flex-shrink: 0;
}


/* ===================== MOBILE ===================== */
@media (max-width: 600px) {

    #${CONFIG.buttonId} {
        width: 40px;
        height: 40px;
        min-width: 40px;
        min-height: 40px;
    }

    #${CONFIG.panelId} {
        width: auto !important;
        max-width: none !important;
    }

    .stage16-tab {
        font-size: 10px;
        padding: 9px 2px;
    }

    .stage16-tab-content input[type="text"],
    .stage16-tab-content select {
        height: 34px;
        font-size: 12px;
    }

    .stage16-primary {
        height: 36px;
        font-size: 12px;
    }

    .stage16-secondary {
        height: 34px;
        font-size: 11.5px;
    }
}
        `;

        document.head.appendChild(css);
    }

    // =========================================================
    // BUTTON
    // =========================================================
    function createButton() {
        var existing = document.getElementById(CONFIG.buttonId);

        if (existing) {
            button = existing;
            return;
        }

        button = document.createElement("button");
        button.id = CONFIG.buttonId;
        button.type = "button";
        button.title = "External Maps (WMS / WMTS / XYZ / MBTiles / GeoTIFF)";

        button.innerHTML = `
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none"
                 xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M3 6.5 L8.5 4 L15.5 6.5 L21 4 V17.5 L15.5 20 L8.5 17.5 L3 20 V6.5Z"
                      stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
                <path d="M8.5 4V17.5" stroke="currentColor" stroke-width="1.5"/>
                <path d="M15.5 6.5V20" stroke="currentColor" stroke-width="1.5"/>
                <circle cx="17" cy="8" r="2.2" stroke="currentColor" stroke-width="1.5"/>
                <path d="M17 10.2V13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
        `;

        button.addEventListener("click", function (event) {
            event.preventDefault();
            event.stopPropagation();

            // Ignore clicks while the Tool Manager is in edit mode
            if (document.body.classList.contains("drag-edit-mode")) {
                return;
            }

            togglePanel();
        });

        document.body.appendChild(button);
    }

    // =========================================================
    // PANEL
    // =========================================================
    function createPanel() {
        var existing = document.getElementById(CONFIG.panelId);

        if (existing) {
            panel = existing;
            return;
        }

        panel = document.createElement("div");
        panel.id = CONFIG.panelId;

        panel.innerHTML = `
            <div class="stage16-header">
                <div>
                    <div class="stage16-title">🌐 External Base Maps</div>
                    <div class="stage16-subtitle">WMS · WMTS · XYZ</div>
                </div>
                <button id="stage16-close" type="button" title="Close">×</button>
            </div>

            <div class="stage16-tabs">
                <button class="stage16-tab active" data-tab="wms"  type="button">WMS</button>
                <button class="stage16-tab"        data-tab="wmts" type="button">WMTS</button>
                <button class="stage16-tab"        data-tab="xyz"  type="button">XYZ</button>
                <button class="stage16-tab"        data-tab="raster" type="button">RASTER</button>
                <button class="stage16-tab"        data-tab="layers" type="button">
                    MAPS<span class="stage16-badge" id="stage16-count">0</span>
                </button>
            </div>

            <!-- ============ WMS ============ -->
            <div id="stage16-tab-wms" class="stage16-tab-content">
                <label>WMS GetCapabilities URL</label>
                <input id="stage16-wms-url" type="text"
                       placeholder="https://example.com/wms"/>
                <button id="stage16-wms-connect" class="stage16-primary" type="button">
                    Connect
                </button>
                <div id="stage16-wms-status" class="stage16-status"></div>

                <label>WMS Layer</label>
                <select id="stage16-wms-layer">
                    <option value="">Connect to WMS first</option>
                </select>

                <label>Display Name (optional)</label>
                <input id="stage16-wms-name" type="text" placeholder="Leave blank to use layer title"/>

                <button id="stage16-wms-add" class="stage16-primary" type="button">
                    Add as Base Map
                </button>

                <div class="stage16-divider"></div>

                <label class="stage16-check">
                    <input type="checkbox" id="stage16-proxy-toggle"/>
                    Use CORS proxy
                </label>
                <input id="stage16-proxy-url" type="text"
                       placeholder="https://corsproxy.io/?"/>
                <div class="stage16-hint">
                    Only needed when the remote server blocks cross-origin requests.
                    The proxy prefix is applied to GetCapabilities requests.
                </div>
            </div>

            <!-- ============ WMTS ============ -->
            <div id="stage16-tab-wmts" class="stage16-tab-content" style="display:none;">
                <label>WMTS GetCapabilities URL</label>
                <input id="stage16-wmts-url" type="text"
                       placeholder="https://example.com/wmts"/>
                <button id="stage16-wmts-connect" class="stage16-primary" type="button">
                    Connect
                </button>
                <div id="stage16-wmts-status" class="stage16-status"></div>

                <label>WMTS Layer</label>
                <select id="stage16-wmts-layer">
                    <option value="">Connect to WMTS first</option>
                </select>

                <label>Matrix Set (optional)</label>
                <select id="stage16-wmts-matrix">
                    <option value="">Auto</option>
                </select>

                <label>Display Name (optional)</label>
                <input id="stage16-wmts-name" type="text" placeholder="Leave blank to use layer title"/>

                <button id="stage16-wmts-add" class="stage16-primary" type="button">
                    Add as Base Map
                </button>
            </div>

            <!-- ============ XYZ ============ -->
            <div id="stage16-tab-xyz" class="stage16-tab-content" style="display:none;">
                <label>XYZ Tile URL Template</label>
                <input id="stage16-xyz-url" type="text"
                       placeholder="https://tile.server/{z}/{x}/{y}.png"/>

                <label>Base Map Name</label>
                <input id="stage16-xyz-name" type="text" placeholder="My XYZ Base Map"/>

                <button id="stage16-xyz-add" class="stage16-primary" type="button">
                    Add as Base Map
                </button>
                <div id="stage16-xyz-status" class="stage16-status"></div>

                <div class="stage16-divider"></div>

                <div class="stage16-hint">
                    <strong>Quick presets</strong>
                </div>

                <button class="stage16-secondary stage16-preset" type="button"
                        data-name="Google Satellite"
                        data-url="https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}">
                    Google Satellite
                </button>

                <button class="stage16-secondary stage16-preset" type="button"
                        data-name="Google Hybrid"
                        data-url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}">
                    Google Hybrid
                </button>

                <button class="stage16-secondary stage16-preset" type="button"
                        data-name="Esri World Imagery"
                        data-url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}">
                    Esri World Imagery
                </button>

                <button class="stage16-secondary stage16-preset" type="button"
                        data-name="OpenStreetMap"
                        data-url="https://tile.openstreetmap.org/{z}/{x}/{y}.png">
                    OpenStreetMap
                </button>

                <button class="stage16-secondary stage16-preset" type="button"
                        data-name="Esri Topographic"
                        data-url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}">
                    Esri Topographic
                </button>
            </div>

            <!-- ============ RASTER FILES ============ -->
            <div id="stage16-tab-raster" class="stage16-tab-content" style="display:none;">
                <label for="stage16-raster-files">MBTiles / GeoTIFF files</label>
                <input id="stage16-raster-files" type="file"
                       accept=".mbtiles,.tif,.tiff" multiple/>
                <label for="stage16-raster-crs">GeoTIFF source CRS</label>
                <select id="stage16-raster-crs">
                    <option value="">Auto-detect from GeoTIFF</option>
                    <option value="EPSG:4326">EPSG:4326 — WGS 84</option>
                    <option value="EPSG:3857">EPSG:3857 — Web Mercator</option>
                    <option value="EPSG:32643">EPSG:32643 — UTM 43N</option>
                    <option value="EPSG:32644">EPSG:32644 — UTM 44N</option>
                    <option value="EPSG:32743">EPSG:32743 — UTM 43S</option>
                    <option value="EPSG:32744">EPSG:32744 — UTM 44S</option>
                    <option value="custom">Other EPSG code…</option>
                </select>
                <input id="stage16-raster-custom-crs" type="text"
                       placeholder="EPSG code, e.g. 32643" style="display:none;"/>
                <div class="stage16-hint">
                    Choose the CRS used by the GeoTIFF coordinates. Use Auto-detect unless
                    its embedded CRS is missing or incorrect. Custom EPSG definitions are
                    looked up online. The raster is reprojected to the map CRS automatically.
                </div>
                <div class="stage16-hint">
                    Add raster MBTiles (.mbtiles) or georeferenced GeoTIFF (.tif, .tiff).
                    Files are stored in this browser for restoration.
                </div>
                <button id="stage16-raster-add" class="stage16-primary" type="button">
                    Import Raster Files
                </button>
                <div id="stage16-raster-status" class="stage16-status"></div>
                <div class="stage16-hint">
                    Vector-tile MBTiles and non-georeferenced TIFF files are not supported.
                    An invalid CRS will not change the map extent.
                </div>
            </div>

            <!-- ============ MANAGER ============ -->
            <div id="stage16-tab-layers" class="stage16-tab-content" style="display:none;">
                <div id="stage16-layer-list" class="stage16-layer-list"></div>
                <div class="stage16-divider"></div>
                <button id="stage16-clear-all" class="stage16-secondary" type="button">
                    🗑 Remove All External Base Maps
                </button>
            </div>

            <div class="stage16-footer">
                External maps sit above the QGIS2Web base map and below all vector / parcel layers.
                Imported raster files are saved in this browser.
            </div>
        `;

        document.body.appendChild(panel);
        bindPanelEvents();
        refreshLayerManager();
    }

    function removeAllExternalLayers() {
        var removed = externalLayers.slice();
        externalLayers = [];
        activeExternalBaseMap = null;

        removed.forEach(function (item) {
            mapRef.removeLayer(item.layer);
            if (item.cleanup) {
                item.cleanup();
            }
            if (item.metadata.fileId) {
                deleteRasterFile(item.metadata.fileId).catch(function (error) {
                    console.warn("🌐 Stage 16: could not delete stored raster —", error.message);
                });
            }
        });

        saveExternalLayers();
        refreshLayerManager();
    }

    // =========================================================
    // PANEL POSITIONING  ★ Bypasses all !important locks
    // =========================================================
    function positionPanel() {
        if (!panel || !button) {
            return;
        }

        if (!panel.classList.contains("stage16-visible")) {
            return;
        }

        var pad = 8;
        var vw = window.innerWidth;
        var vh = window.innerHeight;

        var b = button.getBoundingClientRect();

        // ---------------------------------------------------------
        // MOBILE → centered floating card (NEVER full width)
        // ---------------------------------------------------------
        if (vw <= 600) {
            var targetWidth = Math.min(CONFIG.panelWidth, vw - 16);
            var leftPos = Math.round((vw - targetWidth) / 2);

            panel.style.setProperty("width", targetWidth + "px", "important");
            panel.style.setProperty("left", leftPos + "px", "important");
            panel.style.setProperty("right", "auto", "important");
            panel.style.setProperty("top", "8px", "important");
            panel.style.setProperty("bottom", "auto", "important");
            panel.style.setProperty("max-height", (vh - 16) + "px", "important");

            return;
        }

        // ---------------------------------------------------------
        // DESKTOP → follows the button
        // ---------------------------------------------------------
        panel.style.setProperty("width", CONFIG.panelWidth + "px", "important");
        panel.style.setProperty("right", "auto", "important");
        panel.style.setProperty("bottom", "auto", "important");

        var pw = panel.offsetWidth || CONFIG.panelWidth;
        var ph = panel.offsetHeight || 420;

        var spaceRight = vw - b.right;
        var spaceLeft = b.left;

        var left;

        if (spaceLeft >= pw + CONFIG.panelGap + pad) {
            // open to the LEFT
            left = b.left - CONFIG.panelGap - pw;
        } else if (spaceRight >= pw + CONFIG.panelGap + pad) {
            // open to the RIGHT
            left = b.right + CONFIG.panelGap;
        } else {
            // center fallback
            left = Math.max(pad, (vw - pw) / 2);
        }

        left = Math.max(pad, Math.min(left, vw - pw - pad));

        var top = b.top;
        top = Math.max(pad, Math.min(top, vh - ph - pad));

        if (ph > vh - pad * 2) {
            top = pad;
        }

        // ★ DYNAMIC REMAINING HEIGHT: locks panel inside the screen
        var maxPh = vh - top - pad;

        panel.style.setProperty("left", Math.round(left) + "px", "important");
        panel.style.setProperty("top", Math.round(top) + "px", "important");
        panel.style.setProperty("max-height", Math.round(maxPh) + "px", "important");
    }

    // =========================================================
    // OPEN / CLOSE
    // =========================================================
    function openPanel() {
        if (!panel) {
            createPanel();
        }

        panelOpen = true;
        panel.classList.add("stage16-visible");

        if (button) {
            button.classList.add("stage16-open");
        }

        refreshLayerManager();

        // Two frames so layout settles before measuring
        requestAnimationFrame(function () {
            requestAnimationFrame(positionPanel);
        });
    }

    function closePanel() {
        panelOpen = false;

        if (panel) {
            panel.classList.remove("stage16-visible");
        }

        if (button) {
            button.classList.remove("stage16-open");
        }
    }

    function togglePanel() {
        if (panelOpen) {
            closePanel();
        } else {
            openPanel();
        }
    }

    // =========================================================
    // PANEL EVENTS
    // =========================================================
    function bindPanelEvents() {
        document.getElementById("stage16-close")
            .addEventListener("click", closePanel);

        // --- Tabs ---
        panel.querySelectorAll(".stage16-tab").forEach(function (tab) {
            tab.addEventListener("click", function () {
                var name = tab.dataset.tab;

                panel.querySelectorAll(".stage16-tab").forEach(function (t) {
                    t.classList.remove("active");
                });

                panel.querySelectorAll(".stage16-tab-content").forEach(function (c) {
                    c.style.display = "none";
                });

                tab.classList.add("active");
                document.getElementById("stage16-tab-" + name).style.display = "block";

                if (name === "layers") {
                    refreshLayerManager();
                }

                positionPanel();
            });
        });

        // --- Service actions ---
        document.getElementById("stage16-wms-connect")
            .addEventListener("click", connectWMS);

        document.getElementById("stage16-wms-add")
            .addEventListener("click", addWMSLayer);

        document.getElementById("stage16-wmts-connect")
            .addEventListener("click", connectWMTS);

        document.getElementById("stage16-wmts-add")
            .addEventListener("click", addWMTSLayer);

        document.getElementById("stage16-xyz-add")
            .addEventListener("click", function () {
                addXYZLayer(
                    document.getElementById("stage16-xyz-url").value.trim(),
                    document.getElementById("stage16-xyz-name").value.trim()
                );
            });

        document.getElementById("stage16-raster-add")
            .addEventListener("click", importRasterFiles);

        document.getElementById("stage16-raster-files")
            .addEventListener("change", function () {
                var status = document.getElementById("stage16-raster-status");
                if (this.files.length) {
                    setStatus(status, this.files.length + " file(s) selected.");
                } else {
                    setStatus(status, "");
                }
            });

        document.getElementById("stage16-raster-crs")
            .addEventListener("change", function () {
                var customInput = document.getElementById("stage16-raster-custom-crs");
                customInput.style.display = this.value === "custom" ? "block" : "none";
                positionPanel();
            });

        // --- XYZ presets ---
        panel.querySelectorAll(".stage16-preset").forEach(function (btn) {
            btn.addEventListener("click", function () {
                document.getElementById("stage16-xyz-url").value = btn.dataset.url;
                document.getElementById("stage16-xyz-name").value = btn.dataset.name;
                addXYZLayer(btn.dataset.url, btn.dataset.name);
            });
        });

        // --- Remove all ---
        document.getElementById("stage16-clear-all")
            .addEventListener("click", function () {
                removeAllExternalLayers();
            });

        // --- CORS proxy ---
        var proxyToggle = document.getElementById("stage16-proxy-toggle");
        var proxyInput = document.getElementById("stage16-proxy-url");

        try {
            corsProxy = localStorage.getItem(CONFIG.proxyKey) || "";
        } catch (e) {
            corsProxy = "";
        }

        if (corsProxy) {
            proxyToggle.checked = true;
            proxyInput.value = corsProxy;
        }

        function saveProxy() {
            if (proxyToggle.checked) {
                corsProxy = proxyInput.value.trim();
            } else {
                corsProxy = "";
            }

            try {
                localStorage.setItem(CONFIG.proxyKey, corsProxy);
            } catch (e) {
                // storage unavailable
            }
        }

        proxyToggle.addEventListener("change", saveProxy);
        proxyInput.addEventListener("change", saveProxy);

        // --- WMTS layer change → repopulate matrix sets ---
        document.getElementById("stage16-wmts-layer")
            .addEventListener("change", populateMatrixSets);

        // --- Stop clicks inside the panel from closing it ---
        panel.addEventListener("click", function (e) {
            e.stopPropagation();
        });
    }

    // =========================================================
    // GLOBAL EVENTS
    // =========================================================
    function bindGlobalEvents() {

        // Reposition panel when window changes
        window.addEventListener("resize", positionPanel);

        window.addEventListener("orientationchange", function () {
            setTimeout(positionPanel, 250);
        });

        // Reposition when the Tool Manager moves our button
        document.addEventListener("maptool:moved", function (e) {
            if (e.detail && e.detail.id === CONFIG.toolId) {
                positionPanel();
            }
        });

        // Close when entering edit mode
        document.addEventListener("maptool:editmode", function (e) {
            if (e.detail && e.detail.active) {
                closePanel();
            }
        });

        // Close when our tool gets hidden
        document.addEventListener("maptool:visibility", function (e) {
            if (e.detail && e.detail.id === CONFIG.toolId && !e.detail.visible) {
                closePanel();
            }
        });

        // ESC closes
        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape" && panelOpen) {
                closePanel();
            }
        });

        // Click outside closes
        document.addEventListener("click", function (e) {
            if (!panelOpen) {
                return;
            }

            if (!panel) {
                return;
            }

            if (panel.contains(e.target)) {
                return;
            }

            if (button && button.contains(e.target)) {
                return;
            }

            closePanel();
        });
    }

    // =========================================================
    // FETCH HELPERS
    // =========================================================
    function proxied(url) {
        if (!corsProxy) {
            return url;
        }

        if (corsProxy.indexOf("{url}") >= 0) {
            return corsProxy.replace("{url}", encodeURIComponent(url));
        }

        return corsProxy + encodeURIComponent(url);
    }

    function fetchText(url) {
        var controller = new AbortController();

        var timer = setTimeout(function () {
            controller.abort();
        }, CONFIG.fetchTimeout);

        return fetch(proxied(url), { signal: controller.signal })
            .then(function (response) {
                clearTimeout(timer);

                if (!response.ok) {
                    throw new Error("HTTP " + response.status);
                }

                return response.text();
            })
            .catch(function (error) {
                clearTimeout(timer);

                if (error.name === "AbortError") {
                    throw new Error("Request timed out.");
                }

                throw error;
            });
    }

    function normalizeCapabilitiesURL(url, service) {
        url = String(url || "").trim();

        if (!url) {
            return "";
        }

        if (/request=getcapabilities/i.test(url)) {
            return url;
        }

        var sep = "?";
        if (url.indexOf("?") >= 0) {
            sep = "&";
        }

        return url + sep + "SERVICE=" + service + "&REQUEST=GetCapabilities";
    }

    function setStatus(el, message, state) {
        el.textContent = message;

        if (state) {
            el.className = "stage16-status " + state;
        } else {
            el.className = "stage16-status";
        }
    }

    // =========================================================
    // WMS — CONNECT
    // =========================================================
    function connectWMS() {
        var input = document.getElementById("stage16-wms-url");
        var status = document.getElementById("stage16-wms-status");
        var select = document.getElementById("stage16-wms-layer");
        var url = normalizeCapabilitiesURL(input.value, "WMS");

        if (!url) {
            setStatus(status, "Please enter a WMS URL.", "err");
            return;
        }

        setStatus(status, "Connecting…");

        fetchText(url)
            .then(function (text) {
                var parsed = parseWMSCapabilities(text);

                if (!parsed.layers.length) {
                    throw new Error("No usable WMS layers found.");
                }

                wmsCapabilities = parsed;

                select.innerHTML = "";

                parsed.layers.forEach(function (layer) {
                    var option = document.createElement("option");
                    option.value = layer.name;
                    option.textContent = layer.title || layer.name;
                    select.appendChild(option);
                });

                select.dataset.serviceUrl = parsed.getMapUrl || stripCapabilities(url);
                select.dataset.version = parsed.version;

                setStatus(
                    status,
                    "✓ " + parsed.layers.length + " layers found (WMS " + parsed.version + ")",
                    "ok"
                );
            })
            .catch(function (error) {
                console.error("🌐 Stage 16 WMS:", error);
                setStatus(
                    status,
                    "✕ " + error.message + " — check the URL or enable the CORS proxy.",
                    "err"
                );
            });
    }

    function stripCapabilities(url) {
        return url
            .replace(/([?&])SERVICE=WMS/ig, "$1")
            .replace(/([?&])REQUEST=GetCapabilities/ig, "$1")
            .replace(/([?&])VERSION=[^&]*/ig, "$1")
            .replace(/[?&]+$/, "")
            .replace(/\?&/, "?");
    }

    function parseWMSCapabilities(xmlText) {
        var xml = new DOMParser().parseFromString(xmlText, "text/xml");

        if (xml.getElementsByTagName("parsererror").length) {
            throw new Error("Invalid XML returned by the server.");
        }

        var root = xml.documentElement;
        var version = root.getAttribute("version") || "1.1.1";

        if (root.nodeName === "WMS_Capabilities" && !root.getAttribute("version")) {
            version = "1.3.0";
        }

        // GetMap endpoint
        var getMapUrl = "";
        var nodes = xml.getElementsByTagName("OnlineResource");
        var getMapNode = xml.getElementsByTagName("GetMap")[0];

        if (getMapNode) {
            var res = getMapNode.getElementsByTagName("OnlineResource")[0];

            if (res) {
                getMapUrl =
                    res.getAttributeNS("http://www.w3.org/1999/xlink", "href") ||
                    res.getAttribute("xlink:href") ||
                    res.getAttribute("href") ||
                    "";
            }
        }

        if (!getMapUrl && nodes.length) {
            getMapUrl =
                nodes[0].getAttributeNS("http://www.w3.org/1999/xlink", "href") ||
                nodes[0].getAttribute("xlink:href") ||
                "";
        }

        getMapUrl = String(getMapUrl).replace(/\?$/, "");

        // Layers (skip group layers that have no <Name>)
        var layers = [];
        var seen = {};

        Array.from(xml.getElementsByTagName("Layer")).forEach(function (node) {
            var nameNode = Array.from(node.childNodes).find(function (c) {
                return c.nodeName === "Name";
            });

            if (!nameNode) {
                return;
            }

            var name = String(nameNode.textContent).trim();

            if (!name || seen[name]) {
                return;
            }

            seen[name] = true;

            var titleNode = Array.from(node.childNodes).find(function (c) {
                return c.nodeName === "Title";
            });

            var title = name;
            if (titleNode) {
                title = String(titleNode.textContent).trim();
            }

            layers.push({
                name: name,
                title: title
            });
        });

        return {
            version: version,
            getMapUrl: getMapUrl,
            layers: layers
        };
    }

    // =========================================================
    // WMS — ADD
    // =========================================================
    function addWMSLayer() {
        var select = document.getElementById("stage16-wms-layer");
        var status = document.getElementById("stage16-wms-status");
        var nameInput = document.getElementById("stage16-wms-name");

        var layerName = select.value;
        var serviceURL = select.dataset.serviceUrl;
        var version = select.dataset.version || "1.1.1";

        if (!layerName || !serviceURL) {
            setStatus(status, "Connect to a WMS service and select a layer first.", "err");
            return;
        }

        var title = nameInput.value.trim();

        if (!title) {
            if (select.options[select.selectedIndex]) {
                title = select.options[select.selectedIndex].textContent;
            } else {
                title = layerName;
            }
        }

        var source = new ol.source.TileWMS({
            url: serviceURL,
            params: {
                LAYERS: layerName,
                STYLES: "",
                FORMAT: "image/png",
                TRANSPARENT: true,
                VERSION: version,
                TILED: true
            },
            crossOrigin: "anonymous",
            transition: 0
        });

        var layer = new ol.layer.Tile({
            source: source,
            visible: true,
            opacity: CONFIG.defaultOpacity,
            properties: {
                stage16External: true,
                stage16ExternalType: "WMS",
                stage16ExternalBaseMap: true,
                title: title
            }
        });

        var added = addExternalBaseMap(layer, {
            type: "WMS",
            name: layerName,
            title: title,
            url: serviceURL,
            layer: layerName,
            version: version
        });

        if (added) {
            setStatus(status, "✓ Added “" + title + "”.", "ok");
        }
    }

    // =========================================================
    // WMTS — CONNECT
    // =========================================================
    function connectWMTS() {
        var input = document.getElementById("stage16-wmts-url");
        var status = document.getElementById("stage16-wmts-status");
        var select = document.getElementById("stage16-wmts-layer");
        var url = normalizeCapabilitiesURL(input.value, "WMTS");

        if (!url) {
            setStatus(status, "Please enter a WMTS URL.", "err");
            return;
        }

        setStatus(status, "Connecting…");

        fetchText(url)
            .then(function (text) {
                var parser = new ol.format.WMTSCapabilities();
                var caps = parser.read(text);

                if (!caps || !caps.Contents || !caps.Contents.Layer ||
                    !caps.Contents.Layer.length) {
                    throw new Error("No WMTS layers found.");
                }

                wmtsCapabilities = caps;

                select.innerHTML = "";

                caps.Contents.Layer.forEach(function (layer) {
                    var option = document.createElement("option");
                    option.value = layer.Identifier;
                    option.textContent = layer.Title || layer.Identifier;
                    select.appendChild(option);
                });

                select.dataset.serviceUrl = url;
                populateMatrixSets();

                setStatus(
                    status,
                    "✓ " + caps.Contents.Layer.length + " WMTS layers found.",
                    "ok"
                );
            })
            .catch(function (error) {
                console.error("🌐 Stage 16 WMTS:", error);
                setStatus(status, "✕ " + error.message, "err");
            });
    }

    function populateMatrixSets() {
        var layerSelect = document.getElementById("stage16-wmts-layer");
        var matrixSelect = document.getElementById("stage16-wmts-matrix");

        matrixSelect.innerHTML = '<option value="">Auto</option>';

        if (!wmtsCapabilities) {
            return;
        }

        var identifier = layerSelect.value;

        var layer = wmtsCapabilities.Contents.Layer.find(function (l) {
            return l.Identifier === identifier;
        });

        if (!layer || !layer.TileMatrixSetLink) {
            return;
        }

        layer.TileMatrixSetLink.forEach(function (link) {
            var option = document.createElement("option");
            option.value = link.TileMatrixSet;
            option.textContent = link.TileMatrixSet;
            matrixSelect.appendChild(option);
        });
    }

    // =========================================================
    // WMTS — ADD
    // =========================================================
    function addWMTSLayer() {
        var select = document.getElementById("stage16-wmts-layer");
        var matrixSelect = document.getElementById("stage16-wmts-matrix");
        var status = document.getElementById("stage16-wmts-status");
        var nameInput = document.getElementById("stage16-wmts-name");

        var layerName = select.value;
        var url = select.dataset.serviceUrl;
        var matrixSet = matrixSelect.value;

        if (!layerName || !url || !wmtsCapabilities) {
            setStatus(status, "Connect to a WMTS service and select a layer first.", "err");
            return;
        }

        var title = nameInput.value.trim();

        if (!title) {
            if (select.options[select.selectedIndex]) {
                title = select.options[select.selectedIndex].textContent;
            } else {
                title = layerName;
            }
        }

        try {
            var opts = { layer: layerName };

            if (matrixSet) {
                opts.matrixSet = matrixSet;
            }

            var options = ol.source.WMTS.optionsFromCapabilities(
                wmtsCapabilities,
                opts
            );

            if (!options) {
                throw new Error("Unable to build a WMTS source.");
            }

            options.crossOrigin = "anonymous";

            var layer = new ol.layer.Tile({
                source: new ol.source.WMTS(options),
                visible: true,
                opacity: CONFIG.defaultOpacity,
                properties: {
                    stage16External: true,
                    stage16ExternalType: "WMTS",
                    stage16ExternalBaseMap: true,
                    title: title
                }
            });

            var matrixValue = "";
            if (matrixSet) {
                matrixValue = matrixSet;
            }

            var added = addExternalBaseMap(layer, {
                type: "WMTS",
                name: layerName,
                title: title,
                url: url,
                layer: layerName,
                matrixSet: matrixValue
            });

            if (added) {
                setStatus(status, "✓ Added “" + title + "”.", "ok");
            }

        } catch (error) {
            console.error("🌐 Stage 16 WMTS:", error);
            setStatus(status, "✕ " + error.message, "err");
        }
    }

    // =========================================================
    // XYZ — ADD
    // =========================================================
    function addXYZLayer(url, name) {
        var status = document.getElementById("stage16-xyz-status");

        url = String(url || "").trim();

        if (!url) {
            if (status) {
                setStatus(status, "Please enter an XYZ tile URL.", "err");
            }
            return;
        }

        if (url.indexOf("{x}") < 0 || url.indexOf("{y}") < 0 || url.indexOf("{z}") < 0) {
            if (status) {
                setStatus(status, "URL must contain {x}, {y} and {z} placeholders.", "err");
            }
            return;
        }

        var title = String(name || "").trim();

        if (!title) {
            title = "XYZ Base Map";
        }

        var layer = new ol.layer.Tile({
            source: new ol.source.XYZ({
                url: url,
                crossOrigin: "anonymous",
                tileSize: CONFIG.tileSize,
                transition: 0
            }),
            visible: true,
            opacity: CONFIG.defaultOpacity,
            properties: {
                stage16External: true,
                stage16ExternalType: "XYZ",
                stage16ExternalBaseMap: true,
                title: title
            }
        });

        var added = addExternalBaseMap(layer, {
            type: "XYZ",
            name: title,
            title: title,
            url: url
        });

        if (added && status) {
            setStatus(status, "✓ Added “" + title + "”.", "ok");
        }
    }

    // =========================================================
    // REGISTRATION & Z-INDEX
    // =========================================================
    function addExternalBaseMap(layer, metadata, cleanup) {
        var duplicate = externalLayers.some(function (item) {
            var sameType = item.metadata.type === metadata.type;
            if (metadata.fileId || item.metadata.fileId) {
                return sameType && item.metadata.fileId === metadata.fileId;
            }
            var sameUrl = item.metadata.url === metadata.url;
            var itemLayer = item.metadata.layer || "";
            var metaLayer = metadata.layer || "";
            var sameLayer = itemLayer === metaLayer;

            return sameType && sameUrl && sameLayer;
        });

        if (duplicate) {
            alert("This external base map has already been added.");
            return false;
        }

        mapRef.addLayer(layer);

        var item = {
            id: "stage16-" + Date.now() + "-" +
                Math.random().toString(36).substring(2, 8),
            layer: layer,
            metadata: metadata,
            cleanup: cleanup || null
        };

        layer.set("stage16Id", item.id);
        externalLayers.push(item);

        positionExternalLayer(layer);
        activateExternalBaseMap(item);
        saveExternalLayers();
        refreshLayerManager();

        return true;
    }

    function isQGIS2WebBaseLayer(layer) {
        if (!layer || layer.get("stage16External")) {
            return false;
        }

        var type = layer.get("type");

        if (type === "base") {
            return true;
        }

        if (layer.get("isBaseLayer") === true) {
            return true;
        }

        if (layer.get("baseLayer") === true) {
            return true;
        }

        return false;
    }

    function isOverlayLayer(layer) {
        if (!layer) {
            return false;
        }

        if (layer.get("stage16External")) {
            return false;
        }

        if (isQGIS2WebBaseLayer(layer)) {
            return false;
        }

        return true;
    }

    function calculateExternalZIndex() {
        var all = mapRef.getLayers().getArray();

        var highestBase = -Infinity;
        var lowestOverlay = Infinity;

        all.forEach(function (layer) {
            var z = layer.getZIndex() || 0;

            if (isQGIS2WebBaseLayer(layer)) {
                highestBase = Math.max(highestBase, z);
            } else if (isOverlayLayer(layer)) {
                lowestOverlay = Math.min(lowestOverlay, z);
            }
        });

        if (lowestOverlay !== Infinity) {
            return lowestOverlay - CONFIG.vectorGap;
        }

        if (highestBase !== -Infinity) {
            return highestBase + CONFIG.baseMapGap;
        }

        return 1;
    }

    function positionExternalLayer(layer) {
        if (!layer) {
            return;
        }

        layer.setZIndex(calculateExternalZIndex());
    }

    function repositionAllExternalLayers() {
        externalLayers.forEach(function (item) {
            positionExternalLayer(item.layer);
        });
    }

    function activateExternalBaseMap(item) {
        if (!item) {
            return;
        }

        activeExternalBaseMap = item;

        externalLayers.forEach(function (other) {
            other.layer.setVisible(other.id === item.id);
        });

        positionExternalLayer(item.layer);
        saveExternalLayers();
        refreshLayerManager();
    }

    function deactivateExternalBaseMap() {
        if (!activeExternalBaseMap) {
            return;
        }

        activeExternalBaseMap.layer.setVisible(false);
        activeExternalBaseMap = null;
        saveExternalLayers();
        refreshLayerManager();
    }

    function removeExternalLayer(item) {
        if (!item) {
            return;
        }

        var wasActive = false;

        if (activeExternalBaseMap && activeExternalBaseMap.id === item.id) {
            wasActive = true;
        }

        try {
            mapRef.removeLayer(item.layer);
        } catch (e) {
            // ignore
        }

        if (item.cleanup) {
            item.cleanup();
        }

        if (item.metadata.fileId) {
            deleteRasterFile(item.metadata.fileId).catch(function (error) {
                console.warn("🌐 Stage 16: could not delete stored raster —", error.message);
            });
        }

        var index = externalLayers.indexOf(item);

        if (index >= 0) {
            externalLayers.splice(index, 1);
        }

        if (wasActive) {
            activeExternalBaseMap = null;

            if (externalLayers.length) {
                activateExternalBaseMap(externalLayers[externalLayers.length - 1]);
            }
        }

        repositionAllExternalLayers();
        saveExternalLayers();
        refreshLayerManager();
    }

    // =========================================================
    // LAYER MANAGER UI
    // =========================================================
    function refreshLayerManager() {
        var container = document.getElementById("stage16-layer-list");
        var counter = document.getElementById("stage16-count");

        if (counter) {
            counter.textContent = String(externalLayers.length);
        }

        if (!container) {
            return;
        }

        container.innerHTML = "";

        if (!externalLayers.length) {
            container.innerHTML =
                '<div class="stage16-empty">' +
                'No external base maps yet.<br>' +
                'Add one from the WMS, WMTS, XYZ or Raster tab.' +
                '</div>';
            return;
        }

        externalLayers.forEach(function (item) {
            var active = false;

            if (activeExternalBaseMap && activeExternalBaseMap.id === item.id) {
                active = true;
            }

            var type = item.metadata.type;
            var name = item.metadata.title || item.metadata.name || type;

            var row = document.createElement("div");
            row.className = "stage16-layer-row";

            if (active) {
                row.className = row.className + " active";
            }

            var checkedAttr = "";
            if (active) {
                checkedAttr = "checked";
            }

            var eyeIcon = "◌";
            if (item.layer.getVisible()) {
                eyeIcon = "👁";
            }

            row.innerHTML = `
                <div class="stage16-layer-top">
                    <label class="stage16-layer-name">
                        <input type="radio" name="stage16-active-base-map" ${checkedAttr}>
                        <span title="${escapeHTML(name)}">${escapeHTML(name)}</span>
                    </label>
                    <span class="stage16-type">${escapeHTML(type)}</span>
                </div>
                <div class="stage16-layer-controls">
                    <button class="stage16-small" data-action="visibility"
                            type="button" title="Show / Hide">
                        ${eyeIcon}
                    </button>
                    <input type="range" min="0" max="1" step="0.05"
                           value="${item.layer.getOpacity()}"
                           class="stage16-opacity" title="Opacity">
                    <span class="stage16-opacity-value">${Math.round(item.layer.getOpacity() * 100)}%</span>
                    <button class="stage16-small stage16-delete" data-action="remove"
                            type="button" title="Remove">🗑</button>
                </div>
            `;

            row.querySelector("input[type='radio']")
                .addEventListener("change", function () {
                    if (this.checked) {
                        activateExternalBaseMap(item);
                    }
                });

            row.querySelector("[data-action='visibility']")
                .addEventListener("click", function () {
                    if (item.layer.getVisible()) {
                        if (activeExternalBaseMap &&
                            activeExternalBaseMap.id === item.id) {
                            deactivateExternalBaseMap();
                        } else {
                            item.layer.setVisible(false);
                            saveExternalLayers();
                            refreshLayerManager();
                        }
                    } else {
                        activateExternalBaseMap(item);
                    }
                });

            var slider = row.querySelector(".stage16-opacity");
            var value = row.querySelector(".stage16-opacity-value");

            slider.addEventListener("input", function () {
                var v = Number(slider.value);
                item.layer.setOpacity(v);
                value.textContent = Math.round(v * 100) + "%";
            });

            slider.addEventListener("change", saveExternalLayers);

            row.querySelector("[data-action='remove']")
                .addEventListener("click", function () {
                    removeExternalLayer(item);
                });

            container.appendChild(row);
        });
    }

    function escapeHTML(value) {
        if (value === null || value === undefined) {
            value = "";
        }

        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // =========================================================
    // PERSISTENCE
    // =========================================================
    function saveExternalLayers() {
        try {
            var data = externalLayers.map(function (item) {
                var isActive = false;

                if (activeExternalBaseMap && activeExternalBaseMap.id === item.id) {
                    isActive = true;
                }

                return {
                    id: item.id,
                    metadata: item.metadata,
                    opacity: item.layer.getOpacity(),
                    visible: item.layer.getVisible(),
                    active: isActive
                };
            });

            localStorage.setItem(CONFIG.storageKey, JSON.stringify(data));
        } catch (e) {
            // storage unavailable
        }
    }

    function restoreExternalLayers() {
        var saved = [];

        try {
            saved = JSON.parse(localStorage.getItem(CONFIG.storageKey) || "[]");
        } catch (e) {
            saved = [];
        }

        if (!Array.isArray(saved) || !saved.length) {
            refreshLayerManager();
            return;
        }

        var tasks = saved.map(function (entry) {
            return restoreOne(entry).catch(function (error) {
                console.warn("🌐 Stage 16: could not restore a layer —", error.message);
                return null;
            });
        });

        Promise.all(tasks).then(function () {
            var activeEntry = saved.find(function (e) {
                return e && e.active;
            });

            if (activeEntry) {
                var match = externalLayers.find(function (item) {
                    return item.id === activeEntry.id;
                });

                if (match) {
                    activateExternalBaseMap(match);
                }
            }

            refreshLayerManager();
        });
    }

    function restoreOne(entry) {
        return new Promise(function (resolve, reject) {
            if (!entry || !entry.metadata) {
                reject(new Error("bad entry"));
                return;
            }

            var meta = entry.metadata;
            var opacity = CONFIG.defaultOpacity;

            if (typeof entry.opacity === "number") {
                opacity = entry.opacity;
            }

            function finish(source, layerConstructor, cleanup, preparedLayer) {
                var layer = preparedLayer || new (layerConstructor || ol.layer.Tile)({
                    source: source,
                    visible: false,
                    opacity: opacity,
                    properties: {
                        stage16External: true,
                        stage16ExternalType: meta.type,
                        stage16ExternalBaseMap: true,
                        title: meta.title || meta.name
                    }
                });

                layer.setVisible(false);
                layer.setOpacity(opacity);

                mapRef.addLayer(layer);

                var itemId = entry.id;
                if (!itemId) {
                    itemId = "stage16-" + Date.now();
                }

                var item = {
                    id: itemId,
                    layer: layer,
                    metadata: meta,
                    cleanup: cleanup || null
                };

                layer.set("stage16Id", item.id);
                externalLayers.push(item);
                positionExternalLayer(layer);

                resolve(item);
            }

            // ---- XYZ ----
            if (meta.type === "XYZ") {
                finish(new ol.source.XYZ({
                    url: meta.url,
                    crossOrigin: "anonymous",
                    tileSize: CONFIG.tileSize,
                    transition: 0
                }));
                return;
            }

            // ---- WMS ----
            if (meta.type === "WMS") {
                finish(new ol.source.TileWMS({
                    url: meta.url,
                    params: {
                        LAYERS: meta.layer,
                        STYLES: "",
                        FORMAT: "image/png",
                        TRANSPARENT: true,
                        VERSION: meta.version || "1.1.1",
                        TILED: true
                    },
                    crossOrigin: "anonymous",
                    transition: 0
                }));
                return;
            }

            // ---- WMTS (needs capabilities again) ----
            if (meta.type === "WMTS") {
                fetchText(meta.url)
                    .then(function (text) {
                        var caps = new ol.format.WMTSCapabilities().read(text);
                        var opts = { layer: meta.layer };

                        if (meta.matrixSet) {
                            opts.matrixSet = meta.matrixSet;
                        }

                        var options = ol.source.WMTS.optionsFromCapabilities(caps, opts);

                        if (!options) {
                            throw new Error("WMTS options failed");
                        }

                        options.crossOrigin = "anonymous";
                        finish(new ol.source.WMTS(options));
                    })
                    .catch(reject);
                return;
            }

            if (meta.type === "MBTiles" || meta.type === "GeoTIFF") {
                loadRasterFile(meta.fileId)
                    .then(function (blob) {
                        if (meta.type === "MBTiles") {
                            return createMbtilesLayer(blob);
                        }
                        return createGeoTiffLayer(blob, meta.title || meta.name, meta.crs);
                    })
                    .then(function (result) {
                        finish(result.layer.getSource(), null, result.cleanup, result.layer);
                    })
                    .catch(reject);
                return;
            }

            reject(new Error("Unknown type: " + meta.type));
        });
    }

    // =========================================================
    // MAP OBSERVER
    // =========================================================
    function observeMapLayers() {
        try {
            mapRef.getLayers().on("add", function () {
                setTimeout(repositionAllExternalLayers, 50);
            });

            mapRef.getLayers().on("remove", function () {
                setTimeout(repositionAllExternalLayers, 50);
            });
        } catch (e) {
            // noop
        }
    }

    // =========================================================
    // PUBLIC API
    // =========================================================
    window.Stage16 = {
        open: openPanel,
        close: closePanel,
        toggle: togglePanel,
        addXYZ: addXYZLayer,
        getLayers: function () {
            return externalLayers.slice();
        },
        removeAll: function () {
            removeAllExternalLayers();
        },
        repositionPanel: positionPanel
    };

    // =========================================================
    // INITIALIZE
    // =========================================================
    function initialize() {
        injectCSS();
        createButton();
        createPanel();
        closePanel();

        registerWithToolManager();
        bindGlobalEvents();

        waitForMap(function () {
            observeMapLayers();
            restoreExternalLayers();
            console.log("🌐 Stage 16 v4.6 — External Map Services READY.");
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize);
    } else {
        initialize();
    }

})();
