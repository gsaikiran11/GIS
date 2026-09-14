// ============================================================
// 📂 KML / KMZ IMPORT TOOL
// ============================================================
// Separate JavaScript for QGIS2Web + OpenLayers
//
// Features:
// ✔ Import KML
// ✔ Import KMZ
// ✔ Add imported data as OpenLayers vector layer
// ✔ Add imported layer to existing layer manager
// ✔ Zoom to imported data
// ✔ Checkbox visibility
// ✔ Move imported layer ↑ / ↓
// ✔ Remove imported layer
// ✔ Automatic layer name from filename
// ✔ Default styling
// ✔ Supports KML styles when available
// ✔ Works with local KML/KMZ files
//
// IMPORTANT:
// This file is designed to work with your existing
// vectorLayers / addOverlayToSwitcher() / rebuildLayerManager()
// functions.
// ============================================================


// ============================================================
// ⚙️ CONFIGURATION
// ============================================================

const KML_KMZ_IMPORT_CONFIG = {

    buttonText: "Import KML / KMZ",

    buttonTitle: "Import KML or KMZ file",

    // Maximum number of features allowed
    // Change to 0 for unlimited
    maxFeatures: 0

};


// ============================================================
// 📦 LOAD JSZIP
// ============================================================
// KMZ is a ZIP file containing KML.
//
// We load JSZip automatically from CDN only when a KMZ
// file is selected.
// ============================================================

let jsZipLoadingPromise = null;


function loadJSZip() {

    // Already available
    if (typeof JSZip !== "undefined") {

        return Promise.resolve();

    }


    // Already loading
    if (jsZipLoadingPromise) {

        return jsZipLoadingPromise;

    }


    jsZipLoadingPromise = new Promise(
        function (resolve, reject) {

            const script =
                document.createElement("script");

            script.src =
                "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";

            script.onload =
                function () {

                    if (
                        typeof JSZip !==
                        "undefined"
                    ) {

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


            script.onerror =
                function () {

                    reject(
                        new Error(
                            "Could not load JSZip."
                        )
                    );

                };


            document.head.appendChild(
                script
            );

        }
    );


    return jsZipLoadingPromise;

}


// ============================================================
// 🧹 CLEAN FILE NAME
// ============================================================

function cleanImportedLayerName(
    fileName
) {

    if (!fileName) {

        return "Imported Layer";

    }


    return fileName
        .replace(
            /\.(kml|kmz)$/i,
            ""
        )
        .replace(
            /[_-]+/g,
            " "
        )
        .trim() ||

        "Imported Layer";

}


// ============================================================
// 🎨 DEFAULT STYLE
// ============================================================

function getImportedKMLStyle() {

    return new ol.style.Style({

        fill:
            new ol.style.Fill({

                color:
                    "rgba(255, 165, 0, 0.20)"

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
// 📍 CREATE VECTOR LAYER
// ============================================================

function createImportedKMLLayer(
    features,
    layerName,
    fileName
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
    // MAX FEATURE CHECK
    // --------------------------------------------------------

    if (
        KML_KMZ_IMPORT_CONFIG.maxFeatures > 0 &&

        features.length >
        KML_KMZ_IMPORT_CONFIG.maxFeatures
    ) {

        alert(
            "The file contains " +
            features.length +
            " features.\n\n" +
            "Maximum allowed: " +
            KML_KMZ_IMPORT_CONFIG.maxFeatures
        );

        return null;

    }


    // --------------------------------------------------------
    // VECTOR SOURCE
    // --------------------------------------------------------

    const source =
        new ol.source.Vector({

            features:
                features

        });


    // --------------------------------------------------------
    // VECTOR LAYER
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
    // LAYER INFORMATION
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
        "kmlImported",
        true
    );


    layer.set(
        "dynamicSearchHighlight",
        false
    );


    // --------------------------------------------------------
    // ADD TO GLOBAL VECTOR LAYERS ARRAY
    // --------------------------------------------------------

    if (
        typeof vectorLayers !==
        "undefined" &&

        Array.isArray(vectorLayers)
    ) {

        vectorLayers.push(
            layer
        );

    }


    // --------------------------------------------------------
    // ADD TO MAP
    // --------------------------------------------------------

    if (
        typeof map !==
        "undefined" &&
        map
    ) {

        map.addLayer(
            layer
        );

    }


    // --------------------------------------------------------
    // ADD TO EXISTING LAYER MANAGER
    // --------------------------------------------------------

    if (
        typeof addOverlayToSwitcher ===
        "function"
    ) {

        addOverlayToSwitcher(
            layer
        );

    }


    // --------------------------------------------------------
    // ZOOM TO IMPORTED DATA
    // --------------------------------------------------------

    zoomToImportedLayer(
        layer
    );


    console.log(
        "KML/KMZ imported:",
        layerName,
        "Features:",
        features.length
    );


    return layer;

}


// ============================================================
// 🔍 ZOOM TO IMPORTED LAYER
// ============================================================

function zoomToImportedLayer(
    layer
) {

    if (
        !layer ||
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

            duration:
                800,

            maxZoom:
                19

        }
    );

}


// ============================================================
// 📄 READ KML
// ============================================================

function readKMLText(
    kmlText,
    layerName,
    fileName
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


        // ----------------------------------------------------
        // CREATE LAYER
        // ----------------------------------------------------

        return createImportedKMLLayer(
            features,
            layerName,
            fileName
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

function readKMLFile(
    file
) {

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
                file.name
            );

        };


    reader.onerror =
        function () {

            alert(
                "Could not read the KML file."
            );

        };


    reader.readAsText(
        file
    );

}


// ============================================================
// 📦 READ KMZ FILE
// ============================================================

async function readKMZFile(
    file
) {

    try {

        // ----------------------------------------------------
        // LOAD JSZIP
        // ----------------------------------------------------

        await loadJSZip();


        // ----------------------------------------------------
        // READ ZIP
        // ----------------------------------------------------

        const zip =
            await JSZip.loadAsync(
                file
            );


        // ----------------------------------------------------
        // FIND KML FILE
        // ----------------------------------------------------

        let kmlFile =
            null;


        // First try doc.kml
        if (
            zip.files[
                "doc.kml"
            ]
        ) {

            kmlFile =
                zip.files[
                    "doc.kml"
                ];

        }


        // ----------------------------------------------------
        // IF DOC.KML NOT FOUND
        // SEARCH FOR ANY KML
        // ----------------------------------------------------

        if (!kmlFile) {

            const names =
                Object.keys(
                    zip.files
                );


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
                        .endsWith(
                            ".kml"
                        )
                ) {

                    kmlFile =
                        zip.files[
                            name
                        ];

                    break;

                }

            }

        }


        // ----------------------------------------------------
        // NO KML FOUND
        // ----------------------------------------------------

        if (!kmlFile) {

            alert(
                "The KMZ file does not contain a KML file."
            );

            return;

        }


        // ----------------------------------------------------
        // READ KML TEXT
        // ----------------------------------------------------

        const kmlText =
            await kmlFile.async(
                "text"
            );


        const layerName =
            cleanImportedLayerName(
                file.name
            );


        // ----------------------------------------------------
        // PARSE KML
        // ----------------------------------------------------

        readKMLText(
            kmlText,
            layerName,
            file.name
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
// 📂 IMPORT FILE
// ============================================================

function importKMLKMZFile(
    file
) {

    if (!file) {

        return;

    }


    const fileName =
        file.name.toLowerCase();


    // --------------------------------------------------------
    // KML
    // --------------------------------------------------------

    if (
        fileName.endsWith(
            ".kml"
        )
    ) {

        readKMLFile(
            file
        );

        return;

    }


    // --------------------------------------------------------
    // KMZ
    // --------------------------------------------------------

    if (
        fileName.endsWith(
            ".kmz"
        )
    ) {

        readKMZFile(
            file
        );

        return;

    }


    alert(
        "Please select a KML or KMZ file."
    );

}


// ============================================================
// 📂 CREATE FILE INPUT
// ============================================================

function createKMLKMZFileInput() {

    const input =
        document.createElement(
            "input"
        );


    input.type =
        "file";


    input.accept =
        ".kml,.kmz,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz";


    input.style.display =
        "none";


    input.addEventListener(
        "change",
        function () {

            if (
                input.files &&
                input.files.length > 0
            ) {

                importKMLKMZFile(
                    input.files[0]
                );

            }


            // Allow selecting the same file again
            input.value = "";

        }
    );


    document.body.appendChild(
        input
    );


    return input;

}


// ============================================================
// 🔘 CREATE IMPORT BUTTON
// ============================================================

function createKMLKMZImportButton() {

    // --------------------------------------------------------
    // FILE INPUT
    // --------------------------------------------------------

    const fileInput =
        createKMLKMZFileInput();


    // --------------------------------------------------------
    // BUTTON
    // --------------------------------------------------------

    const button =
        document.createElement(
            "button"
        );


    button.type =
        "button";


    button.className =
        "kml-kmz-import-button";


    button.title =
        KML_KMZ_IMPORT_CONFIG.buttonTitle;


    button.innerHTML =
        "📂";


    // --------------------------------------------------------
    // CLICK
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
    // ADD TO MAP
    // --------------------------------------------------------

    document.body.appendChild(
        button
    );


    return button;

}


// ============================================================
// 🎨 CSS
// ============================================================

function addKMLKMZImportCSS() {

    if (
        document.getElementById(
            "kml-kmz-import-css"
        )
    ) {

        return;

    }


    const style =
        document.createElement(
            "style"
        );


    style.id =
        "kml-kmz-import-css";


    style.textContent = `

        /* ====================================================
           KML / KMZ IMPORT BUTTON
           ==================================================== */

        .kml-kmz-import-button {

            position: fixed;

            right: 15px;

            top: 150px;

            width: 42px;

            height: 42px;

            border: none;

            border-radius: 8px;

            background: rgba(255,255,255,0.95);

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


        .kml-kmz-import-button:hover {

            transform:
                scale(1.05);

            background:
                #ffffff;

        }


        .kml-kmz-import-button:active {

            transform:
                scale(0.95);

        }


        /* ====================================================
           MOBILE
           ==================================================== */

        @media (max-width: 600px) {

            .kml-kmz-import-button {

                right: 12px;

                top: 145px;

                width: 40px;

                height: 40px;

                font-size: 19px;

            }

        }

    `;


    document.head.appendChild(
        style
    );

}


// ============================================================
// 🗑️ OPTIONAL REMOVE SUPPORT
// ============================================================
// This function can be called by your layer manager if you
// later want a delete button for imported KML/KMZ layers.
// ============================================================

function removeImportedKMLLayer(
    layer
) {

    if (!layer) {

        return;

    }


    // Only remove layers imported by this tool
    if (
        layer.get(
            "kmlImported"
        ) !== true
    ) {

        return;

    }


    // --------------------------------------------------------
    // REMOVE FROM MAP
    // --------------------------------------------------------

    if (
        typeof map !==
        "undefined" &&
        map
    ) {

        map.removeLayer(
            layer
        );

    }


    // --------------------------------------------------------
    // REMOVE FROM VECTOR ARRAY
    // --------------------------------------------------------

    if (
        typeof vectorLayers !==
        "undefined" &&

        Array.isArray(vectorLayers)
    ) {

        const index =
            vectorLayers.indexOf(
                layer
            );


        if (index !== -1) {

            vectorLayers.splice(
                index,
                1
            );

        }

    }


    // --------------------------------------------------------
    // REBUILD MANAGER
    // --------------------------------------------------------

    if (
        typeof rebuildLayerManager ===
        "function"
    ) {

        rebuildLayerManager();

    }

}


// ============================================================
// 🚀 INITIALIZE
// ============================================================

(function initializeKMLKMZImport() {

    function start() {

        addKMLKMZImportCSS();

        createKMLKMZImportButton();

        console.log(
            "📂 KML/KMZ Import Tool loaded."
        );

    }


    // --------------------------------------------------------
    // WAIT FOR DOM
    // --------------------------------------------------------

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