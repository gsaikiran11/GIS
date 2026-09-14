// ============================================================
// 📂 UNIVERSAL GIS IMPORT TOOL
// QGIS2Web + OpenLayers
//
// Supports:
// ✔ KML
// ✔ KMZ
// ✔ Shapefile ZIP
// ✔ .shp + .shx + .dbf + .prj
//
// Features:
// ✔ One import button
// ✔ Automatic file type detection
// ✔ Existing layer manager integration
// ✔ Checkbox visibility
// ✔ Move layer ↑ / ↓ using existing layer manager
// ✔ Remove imported layer
// ✔ Zoom to imported data
// ✔ Automatic layer name from filename
// ✔ KML/KMZ support
// ✔ Shapefile support
// ✔ NO custom attribute popup
// ✔ NO custom click handler
//
// Designed to work with:
// vectorLayers
// map
// MAP_PROJECTION
// addOverlayToSwitcher()
// rebuildLayerManager()
//
// ============================================================



// ============================================================
// ⚙️ CONFIGURATION
// ============================================================

const GIS_IMPORT_CONFIG = {

    buttonTitle: "Import KML, KMZ or Shapefile",

    buttonIcon: "📂",

    // Maximum number of features
    // 0 = unlimited
    maxFeatures: 0

};



// ============================================================
// 🌐 EXTERNAL LIBRARY LOADERS
// ============================================================

// ------------------------------------------------------------
// JSZip
// Used for KMZ
// ------------------------------------------------------------

let jsZipLoadingPromise = null;


function loadJSZip() {

    if (typeof JSZip !== "undefined") {

        return Promise.resolve();

    }


    if (jsZipLoadingPromise) {

        return jsZipLoadingPromise;

    }


    jsZipLoadingPromise = new Promise(

        function (resolve, reject) {

            const script =
                document.createElement("script");


            script.src =
                "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";


            script.onload = function () {

                if (
                    typeof JSZip !== "undefined"
                ) {

                    console.log(
                        "JSZip loaded successfully."
                    );

                    resolve();

                }
                else {

                    reject(
                        new Error(
                            "JSZip loaded but is unavailable."
                        )
                    );

                }

            };


            script.onerror = function () {

                reject(
                    new Error(
                        "Could not load JSZip."
                    )
                );

            };


            document.head.appendChild(script);

        }

    );


    return jsZipLoadingPromise;

}



// ------------------------------------------------------------
// shpjs
// Used for Shapefile ZIP
// ------------------------------------------------------------

let shpJSLoadingPromise = null;


function loadShpJS() {

    if (typeof shp !== "undefined") {

        return Promise.resolve();

    }


    if (shpJSLoadingPromise) {

        return shpJSLoadingPromise;

    }


    shpJSLoadingPromise = new Promise(

        function (resolve, reject) {

            const script =
                document.createElement("script");


            script.src =
                "https://unpkg.com/shpjs@latest/dist/shp.js";


            script.onload = function () {

                if (
                    typeof shp !== "undefined"
                ) {

                    console.log(
                        "shpjs loaded successfully."
                    );

                    resolve();

                }
                else {

                    reject(
                        new Error(
                            "shpjs loaded but the shp function is unavailable."
                        )
                    );

                }

            };


            script.onerror = function () {

                reject(
                    new Error(
                        "Could not load shpjs."
                    )
                );

            };


            document.head.appendChild(script);

        }

    );


    return shpJSLoadingPromise;

}



// ============================================================
// 🧹 CLEAN LAYER NAME
// ============================================================

function cleanImportedLayerName(fileName) {

    if (!fileName) {

        return "Imported Layer";

    }


    return fileName

        .replace(/\.(kml|kmz|zip)$/i, "")

        .replace(/[_-]+/g, " ")

        .trim()

        || "Imported Layer";

}



// ============================================================
// 🎨 KML / KMZ DEFAULT STYLE
// ============================================================

function getImportedKMLStyle() {

    return new ol.style.Style({

        fill:
            new ol.style.Fill({

                color:
                    "rgba(255,165,0,0.20)"

            }),


        stroke:
            new ol.style.Stroke({

                color:
                    "#ff6600",

                width:
                    2

            }),


        image:
            new ol.style.Circle({

                radius:
                    6,

                fill:
                    new ol.style.Fill({

                        color:
                            "#ff6600"

                    }),

                stroke:
                    new ol.style.Stroke({

                        color:
                            "#ffffff",

                        width:
                            2

                    })

            })

    });

}



// ============================================================
// 🎨 SHAPEFILE DEFAULT STYLE
// ============================================================

function getImportedShapefileStyle() {

    return new ol.style.Style({

        fill:
            new ol.style.Fill({

                color:
                    "rgba(0,153,255,0.20)"

            }),


        stroke:
            new ol.style.Stroke({

                color:
                    "#0066cc",

                width:
                    2

            }),


        image:
            new ol.style.Circle({

                radius:
                    6,

                fill:
                    new ol.style.Fill({

                        color:
                            "#0066cc"

                    }),

                stroke:
                    new ol.style.Stroke({

                        color:
                            "#ffffff",

                        width:
                            2

                    })

            })

    });

}



// ============================================================
// 🧭 ADD IMPORTED LAYER TO APPLICATION
// ============================================================

function registerImportedLayer(

    layer,
    layerName,
    fileName,
    importType

) {


    // --------------------------------------------------------
    // Basic layer information
    // --------------------------------------------------------

    layer.set(
        "title",
        layerName
    );


    layer.set(
        "name",
        layerName
    );


    layer.set(
        "file",
        fileName
    );


    layer.set(
        "imported",
        true
    );


    layer.set(
        "importType",
        importType
    );


    layer.set(
        "dynamicSearchHighlight",
        false
    );


    // --------------------------------------------------------
    // Type-specific flags
    // --------------------------------------------------------

    if (importType === "KML") {

        layer.set(
            "kmlImported",
            true
        );

    }


    if (importType === "KMZ") {

        layer.set(
            "kmlImported",
            true
        );

        layer.set(
            "kmzImported",
            true
        );

    }


    if (importType === "Shapefile") {

        layer.set(
            "shpImported",
            true
        );

    }


    // --------------------------------------------------------
    // Add to global vectorLayers
    // --------------------------------------------------------

    if (

        typeof vectorLayers !== "undefined" &&

        Array.isArray(vectorLayers)

    ) {

        vectorLayers.push(layer);

    }


    // --------------------------------------------------------
    // Add to OpenLayers map
    // --------------------------------------------------------

    if (

        typeof map !== "undefined" &&

        map

    ) {

        map.addLayer(layer);

    }


    // --------------------------------------------------------
    // Add to existing layer manager
    // --------------------------------------------------------

    if (

        typeof addOverlayToSwitcher ===
        "function"

    ) {

        addOverlayToSwitcher(layer);

    }


    // --------------------------------------------------------
    // Rebuild existing layer manager
    // --------------------------------------------------------

    if (

        typeof rebuildLayerManager ===
        "function"

    ) {

        try {

            rebuildLayerManager();

        }
        catch (error) {

            console.warn(
                "Could not rebuild layer manager:",
                error
            );

        }

    }


    return layer;

}



// ============================================================
// 🔍 ZOOM TO IMPORTED LAYER
// ============================================================

function zoomToImportedLayer(layer) {

    if (

        !layer ||

        typeof map === "undefined" ||

        !map

    ) {

        return;

    }


    const source =
        layer.getSource();


    if (!source) {

        return;

    }


    const extent =
        source.getExtent();


    if (

        !extent ||

        extent[0] === Infinity ||

        extent[1] === Infinity ||

        extent[2] === -Infinity ||

        extent[3] === -Infinity

    ) {

        return;

    }


    map.getView().fit(

        extent,

        {

            padding: [
                80,
                80,
                80,
                80
            ],

            duration: 800,

            maxZoom: 19

        }

    );

}



// ============================================================
// 📍 CREATE KML / KMZ LAYER
// ============================================================

function createImportedKMLLayer(

    features,
    layerName,
    fileName,
    importType

) {


    if (

        !features ||

        features.length === 0

    ) {

        alert(
            "No features were found in the KML/KMZ file."
        );

        return null;

    }


    // --------------------------------------------------------
    // Maximum feature check
    // --------------------------------------------------------

    if (

        GIS_IMPORT_CONFIG.maxFeatures > 0 &&

        features.length >
        GIS_IMPORT_CONFIG.maxFeatures

    ) {

        alert(

            "The file contains " +

            features.length +

            " features.\n\n" +

            "Maximum allowed: " +

            GIS_IMPORT_CONFIG.maxFeatures

        );

        return null;

    }


    // --------------------------------------------------------
    // Vector source
    // --------------------------------------------------------

    const source =
        new ol.source.Vector({

            features:
                features

        });


    // --------------------------------------------------------
    // Vector layer
    // --------------------------------------------------------

    const layer =
        new ol.layer.Vector({

            source:
                source,

            visible:
                true,

            style:
                getImportedKMLStyle()

        });


    // --------------------------------------------------------
    // Register layer
    // --------------------------------------------------------

    registerImportedLayer(

        layer,

        layerName,

        fileName,

        importType

    );


    // --------------------------------------------------------
    // Zoom
    // --------------------------------------------------------

    zoomToImportedLayer(layer);


    console.log(

        importType +
        " imported:",

        layerName,

        "Features:",

        features.length

    );


    return layer;

}



// ============================================================
// 📄 READ KML TEXT
// ============================================================

function readKMLText(

    kmlText,
    layerName,
    fileName,
    importType

) {

    try {


        const format =
            new ol.format.KML({

                extractStyles:
                    true,

                showPointNames:
                    false

            });


        const features =
            format.readFeatures(

                kmlText,

                {

                    dataProjection:
                        "EPSG:4326",

                    featureProjection:
                        MAP_PROJECTION

                }

            );


        return createImportedKMLLayer(

            features,

            layerName,

            fileName,

            importType

        );

    }
    catch (error) {


        console.error(

            "KML parsing error:",

            error

        );


        alert(

            "Could not read the KML file.\n\n" +

            error.message

        );


        return null;

    }

}



// ============================================================
// 📄 READ KML FILE
// ============================================================

function readKMLFile(file) {


    const reader =
        new FileReader();


    reader.onload =
        function (event) {


            const kmlText =
                event.target.result;


            const layerName =
                cleanImportedLayerName(

                    file.name

                );


            readKMLText(

                kmlText,

                layerName,

                file.name,

                "KML"

            );

        };


    reader.onerror =
        function () {


            alert(
                "Could not read the KML file."
            );

        };


    reader.readAsText(file);

}



// ============================================================
// 📦 READ KMZ FILE
// ============================================================

async function readKMZFile(file) {

    try {


        // ----------------------------------------------------
        // Load JSZip
        // ----------------------------------------------------

        await loadJSZip();


        // ----------------------------------------------------
        // Read ZIP
        // ----------------------------------------------------

        const zip =
            await JSZip.loadAsync(file);


        // ----------------------------------------------------
        // Find KML
        // ----------------------------------------------------

        let kmlFile = null;


        // First try doc.kml
        if (
            zip.files["doc.kml"]
        ) {

            kmlFile =
                zip.files["doc.kml"];

        }


        // ----------------------------------------------------
        // Search for any KML
        // ----------------------------------------------------

        if (!kmlFile) {


            const names =
                Object.keys(zip.files);


            for (

                let i = 0;

                i < names.length;

                i++

            ) {


                const name =
                    names[i];


                if (

                    name
                        .toLowerCase()
                        .endsWith(".kml")

                ) {

                    kmlFile =
                        zip.files[name];

                    break;

                }

            }

        }


        // ----------------------------------------------------
        // No KML found
        // ----------------------------------------------------

        if (!kmlFile) {


            alert(
                "The KMZ file does not contain a KML file."
            );


            return;

        }


        // ----------------------------------------------------
        // Read KML
        // ----------------------------------------------------

        const kmlText =
            await kmlFile.async("text");


        const layerName =
            cleanImportedLayerName(

                file.name

            );


        // ----------------------------------------------------
        // Parse KML
        // ----------------------------------------------------

        readKMLText(

            kmlText,

            layerName,

            file.name,

            "KMZ"

        );

    }
    catch (error) {


        console.error(

            "KMZ parsing error:",

            error

        );


        alert(

            "Could not read the KMZ file.\n\n" +

            error.message

        );

    }

}



// ============================================================
// 🗺️ CREATE SHAPEFILE LAYER
// ============================================================
//
// IMPORTANT:
// NO attribute popup
// NO singleclick handler
// NO feature click handler
//
// ============================================================

function createImportedShapefileLayer(

    features,
    layerName,
    fileName

) {


    if (

        !features ||

        features.length === 0

    ) {

        alert(
            "No features were found in the Shapefile."
        );

        return null;

    }


    // --------------------------------------------------------
    // Maximum feature check
    // --------------------------------------------------------

    if (

        GIS_IMPORT_CONFIG.maxFeatures > 0 &&

        features.length >
        GIS_IMPORT_CONFIG.maxFeatures

    ) {

        alert(

            "The Shapefile contains " +

            features.length +

            " features.\n\n" +

            "Maximum allowed: " +

            GIS_IMPORT_CONFIG.maxFeatures

        );

        return null;

    }


    // --------------------------------------------------------
    // Vector source
    // --------------------------------------------------------

    const source =
        new ol.source.Vector({

            features:
                features

        });


    // --------------------------------------------------------
    // Vector layer
    // --------------------------------------------------------

    const layer =
        new ol.layer.Vector({

            source:
                source,

            visible:
                true,

            style:
                getImportedShapefileStyle()

        });


    // --------------------------------------------------------
    // Register layer
    // --------------------------------------------------------

    registerImportedLayer(

        layer,

        layerName,

        fileName,

        "Shapefile"

    );


    // --------------------------------------------------------
    // Zoom
    // --------------------------------------------------------

    zoomToImportedLayer(layer);


    console.log(

        "Shapefile imported:",

        layerName,

        "Features:",

        features.length

    );


    return layer;

}



// ============================================================
// 📦 READ SHAPEFILE ZIP
// ============================================================

async function readShapefileZIP(file) {

    try {


        // ----------------------------------------------------
        // Load shpjs
        // ----------------------------------------------------

        await loadShpJS();


        // ----------------------------------------------------
        // Read ZIP
        // ----------------------------------------------------

        const arrayBuffer =
            await file.arrayBuffer();


        console.log(

            "Reading Shapefile ZIP:",

            file.name

        );


        // ----------------------------------------------------
        // Parse ZIP
        // ----------------------------------------------------

        const geojson =
            await shp(arrayBuffer);


        // ----------------------------------------------------
        // shpjs may return:
//        //
//        // FeatureCollection
//        // OR
//        // Array of FeatureCollections
//        // ----------------------------------------------------

        let geojsonLayers;


        if (Array.isArray(geojson)) {

            geojsonLayers =
                geojson;

        }
        else {

            geojsonLayers = [
                geojson
            ];

        }


        // ----------------------------------------------------
        // Check result
        // ----------------------------------------------------

        if (

            !geojsonLayers ||

            geojsonLayers.length === 0

        ) {

            alert(
                "No Shapefile data was found."
            );

            return;

        }


        // ----------------------------------------------------
        // Process each layer
        // ----------------------------------------------------

        for (

            let i = 0;

            i < geojsonLayers.length;

            i++

        ) {


            const geojsonData =
                geojsonLayers[i];


            if (

                !geojsonData ||

                !geojsonData.features

            ) {

                console.warn(
                    "Invalid GeoJSON returned by shpjs."
                );

                continue;

            }


            // ------------------------------------------------
            // OpenLayers GeoJSON format
            // ------------------------------------------------

            const format =
                new ol.format.GeoJSON();


            // ------------------------------------------------
            // Convert GeoJSON to OpenLayers features
            // ------------------------------------------------

            const features =
                format.readFeatures(

                    geojsonData,

                    {

                        dataProjection:
                            "EPSG:4326",

                        featureProjection:
                            MAP_PROJECTION

                    }

                );


            if (

                !features ||

                features.length === 0

            ) {

                console.warn(
                    "No features found in Shapefile layer."
                );

                continue;

            }


            // ------------------------------------------------
            // Layer name
            // ------------------------------------------------

            let layerName =
                cleanImportedLayerName(

                    file.name

                );


            // ------------------------------------------------
            // Multiple Shapefiles in same ZIP
            // ------------------------------------------------

            if (
                geojsonLayers.length > 1
            ) {

                layerName =
                    layerName +
                    " " +
                    (i + 1);

            }


            // ------------------------------------------------
            // Create layer
            // ------------------------------------------------

            createImportedShapefileLayer(

                features,

                layerName,

                file.name

            );

        }


        console.log(

            "Shapefile import completed:",

            file.name

        );

    }
    catch (error) {


        console.error(

            "Shapefile import error:",

            error

        );


        alert(

            "Could not read the Shapefile ZIP.\n\n" +

            error.message

        );

    }

}



// ============================================================
// 📂 IMPORT FILE
// ============================================================
//
// Automatically detects:
// KML
// KMZ
// ZIP Shapefile
//
// ============================================================

function importGISFile(file) {


    if (!file) {

        return;

    }


    const fileName =
        file.name.toLowerCase();


    // --------------------------------------------------------
    // KML
    // --------------------------------------------------------

    if (
        fileName.endsWith(".kml")
    ) {

        readKMLFile(file);

        return;

    }


    // --------------------------------------------------------
    // KMZ
    // --------------------------------------------------------

    if (
        fileName.endsWith(".kmz")
    ) {

        readKMZFile(file);

        return;

    }


    // --------------------------------------------------------
    // Shapefile ZIP
    // --------------------------------------------------------

    if (
        fileName.endsWith(".zip")
    ) {

        readShapefileZIP(file);

        return;

    }


    // --------------------------------------------------------
    // Unsupported file
    // --------------------------------------------------------

    alert(

        "Unsupported file type.\n\n" +

        "Please select:\n" +

        "• KML\n" +

        "• KMZ\n" +

        "• Shapefile ZIP"

    );

}



// ============================================================
// 📁 CREATE FILE INPUT
// ============================================================

let gisImportFileInput = null;


function createGISImportFileInput() {


    if (gisImportFileInput) {

        return gisImportFileInput;

    }


    gisImportFileInput =
        document.createElement("input");


    gisImportFileInput.type =
        "file";


    gisImportFileInput.accept =
        ".kml,.kmz,.zip," +
        "application/vnd.google-earth.kml+xml," +
        "application/vnd.google-earth.kmz," +
        "application/zip," +
        "application/x-zip-compressed";


    gisImportFileInput.style.display =
        "none";


    document.body.appendChild(
        gisImportFileInput
    );


    gisImportFileInput.addEventListener(

        "change",

        async function (event) {


            const files =
                event.target.files;


            if (
                !files ||
                files.length === 0
            ) {

                return;

            }


            const file =
                files[0];


            await importGISFile(file);


            // ------------------------------------------------
            // Reset input
            // Allows same file to be selected again
            // ------------------------------------------------

            event.target.value = "";

        }

    );


    return gisImportFileInput;

}



// ============================================================
// 🔘 CREATE IMPORT BUTTON
// ============================================================

function createGISImportButton() {


    // --------------------------------------------------------
    // Prevent duplicate button
    // --------------------------------------------------------

    if (
        document.getElementById(
            "gis-import-button"
        )
    ) {

        return;

    }


    // --------------------------------------------------------
    // File input
    // --------------------------------------------------------

    const fileInput =
        createGISImportFileInput();


    // --------------------------------------------------------
    // Button
    // --------------------------------------------------------

    const button =
        document.createElement("button");


    button.id =
        "gis-import-button";


    button.type =
        "button";


    button.className =
        "gis-import-button";


    button.title =
        GIS_IMPORT_CONFIG.buttonTitle;


    button.innerHTML =
        GIS_IMPORT_CONFIG.buttonIcon;


    // --------------------------------------------------------
    // Click
    // --------------------------------------------------------

    button.addEventListener(

        "click",

        function (event) {

            event.preventDefault();

            event.stopPropagation();

            fileInput.click();

        }

    );


    // --------------------------------------------------------
    // Add to page
    // --------------------------------------------------------

    document.body.appendChild(button);

}



// ============================================================
// 🎨 CSS
// ============================================================

function addGISImportCSS() {


    // --------------------------------------------------------
    // Prevent duplicate CSS
    // --------------------------------------------------------

    if (
        document.getElementById(
            "gis-import-css"
        )
    ) {

        return;

    }


    const style =
        document.createElement("style");


    style.id =
        "gis-import-css";


    style.textContent = `

        /* ====================================================
           📂 UNIVERSAL GIS IMPORT BUTTON
           ==================================================== */

        .gis-import-button {

            position: fixed;

            right: 15px;

            top: 150px;

            width: 42px;

            height: 42px;

            border: none;

            border-radius: 8px;

            background:
                rgba(255,255,255,0.95);

            box-shadow:
                0 2px 8px rgba(0,0,0,0.30);

            cursor: pointer;

            font-size: 20px;

            z-index: 10000;

            display: flex;

            align-items: center;

            justify-content: center;

            transition:
                transform 0.15s ease,
                background 0.15s ease;

        }


        .gis-import-button:hover {

            transform:
                scale(1.05);

            background:
                #ffffff;

        }


        .gis-import-button:active {

            transform:
                scale(0.95);

        }


        /* ====================================================
           📱 MOBILE
           ==================================================== */

        @media (max-width: 600px) {

            .gis-import-button {

                right: 12px;

                top: 145px;

                width: 40px;

                height: 40px;

                font-size: 19px;

            }

        }

    `;


    document.head.appendChild(style);

}



// ============================================================
// 🗑️ REMOVE IMPORTED LAYER
// ============================================================
//
// Works for:
// KML
// KMZ
// Shapefile
//
// ============================================================

function removeImportedGISLayer(layer) {


    if (!layer) {

        return;

    }


    // --------------------------------------------------------
    // Make sure it is an imported layer
    // --------------------------------------------------------

    if (

        layer.get("imported") !== true

    ) {

        return;

    }


    // --------------------------------------------------------
    // Remove from map
    // --------------------------------------------------------

    if (

        typeof map !== "undefined" &&

        map

    ) {

        map.removeLayer(layer);

    }


    // --------------------------------------------------------
    // Remove from vectorLayers
    // --------------------------------------------------------

    if (

        typeof vectorLayers !== "undefined" &&

        Array.isArray(vectorLayers)

    ) {


        const index =
            vectorLayers.indexOf(layer);


        if (index !== -1) {

            vectorLayers.splice(

                index,

                1

            );

        }

    }


    // --------------------------------------------------------
    // Rebuild layer manager
    // --------------------------------------------------------

    if (

        typeof rebuildLayerManager ===
        "function"

    ) {

        try {

            rebuildLayerManager();

        }
        catch (error) {

            console.warn(

                "Could not rebuild layer manager:",

                error

            );

        }

    }


    console.log(

        "Removed imported layer:",

        layer.get("title")

    );

}



// ============================================================
// 🗑️ REMOVE ALL IMPORTED LAYERS
// ============================================================

function removeAllImportedGISLayers() {


    if (

        typeof map === "undefined" ||

        !map

    ) {

        return;

    }


    const layersToRemove = [];


    map.getLayers().forEach(

        function (layer) {


            if (

                layer &&

                typeof layer.get ===
                "function" &&

                layer.get("imported") === true

            ) {

                layersToRemove.push(layer);

            }

        }

    );


    layersToRemove.forEach(

        function (layer) {

            removeImportedGISLayer(layer);

        }

    );


    console.log(

        "Removed imported layers:",

        layersToRemove.length

    );

}



// ============================================================
// 🚀 INITIALIZE
// ============================================================

(function initializeGISImportTool() {


    function start() {


        addGISImportCSS();


        createGISImportButton();


        console.log(
            "📂 KML / KMZ / Shapefile Import Tool loaded."
        );


    }


    if (

        document.readyState ===
        "loading"

    ) {


        document.addEventListener(

            "DOMContentLoaded",

            start

        );


    }
    else {


        start();


    }


})();
