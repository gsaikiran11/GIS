// ============================================================
// OPENLAYERS MAP
// STAGE 2 - LAYER MANAGER
// ============================================================

// ------------------------------------------------------------
// GITHUB SETTINGS
// ------------------------------------------------------------

const GITHUB_OWNER = "gsaikiran11";
const GITHUB_REPO = "webmapsurvey";
const GITHUB_BRANCH = "main";
const GITHUB_LAYER_FOLDER = "layers";

// ------------------------------------------------------------
// PROJECTIONS
// ------------------------------------------------------------

const DATA_PROJECTION = "EPSG:32643";   // UTM Zone 43N
const MAP_PROJECTION = "EPSG:3857";      // OpenLayers map

// ------------------------------------------------------------
// BASE LAYERS
// ------------------------------------------------------------

// OpenStreetMap
const osmLayer = new ol.layer.Tile({
    title: "OpenStreetMap",
    type: "base",
    visible: true,
    source: new ol.source.XYZ({
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        attributions: '&copy; OpenStreetMap contributors'
    })
});

// Google Hybrid
const googleHybridLayer = new ol.layer.Tile({
    title: "Google Hybrid",
    type: "base",
    visible: false,

    source: new ol.source.XYZ({
        url:
            "https://mt1.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}",
        attributions:
            "© Google"
    })
});

// ------------------------------------------------------------
// MAP
// ------------------------------------------------------------

const map = new ol.Map({

    target: "map",

    layers: [
        osmLayer,
        googleHybridLayer
    ],

    view: new ol.View({

        projection: MAP_PROJECTION,

        center: ol.proj.fromLonLat([
            78.0,
            15.8
        ]),

        zoom: 7

    }),

    controls: ol.control.defaults.defaults().extend([

        new ol.control.ScaleLine(),

        new ol.control.FullScreen()

    ])

});

// ------------------------------------------------------------
// VECTOR LAYER ARRAY
// ------------------------------------------------------------

let vectorLayers = [];

// ------------------------------------------------------------
// CREATE LAYER SWITCHER
// ------------------------------------------------------------

// ============================================================
// CREATE COLLAPSIBLE LAYER SWITCHER
// ============================================================

// ============================================================
// 🗂️ COLLAPSIBLE LAYER SWITCHER
// ============================================================

// ============================================================
// 🗂️ OPENLAYERS LAYER SWITCHER / LAYER MANAGER
//
// IMPORTANT ORDERING RULE:
//
// vectorLayers[0] = TOP layer on map
// vectorLayers[1] = second layer
// vectorLayers[2] = third layer
// ...
// vectorLayers[last] = BOTTOM layer on map
//
// Layer Switcher displays the same order.
//
// Example:
//
//   Survey No       ← TOP ON MAP
//   Enjoyment
//   Roads
//   Village Boundary ← BOTTOM ON MAP
//
// ============================================================



// ============================================================
// CREATE LAYER SWITCHER
// ============================================================

function createLayerSwitcher() {

    // --------------------------------------------------------
    // REMOVE EXISTING SWITCHER IF ALREADY EXISTS
    // --------------------------------------------------------

    const oldPanel =
        document.querySelector(
            ".layer-switcher"
        );

    if (oldPanel) {

        oldPanel.remove();

    }


    // --------------------------------------------------------
    // CREATE PANEL
    // --------------------------------------------------------

    const panel =
        document.createElement(
            "div"
        );

    panel.className =
        "layer-switcher";


    // --------------------------------------------------------
    // PANEL HTML
    // --------------------------------------------------------

    panel.innerHTML = `

        <!-- ==================================================
             LAYERS BUTTON
             ================================================== -->

        <div
            class="layer-switcher-header"
            title="Layers">

            <span class="layer-switcher-title">
                Layers
            </span>

        </div>


        <!-- ==================================================
             LAYER SWITCHER CONTENT
             ================================================== -->

        <div id="layer-switcher-content">

            <!-- BASE MAPS -->

            <div class="layer-section-title">
                Base Maps
            </div>

            <div id="base-layers"></div>


            <!-- DIVIDER -->

            <div class="layer-divider"></div>


            <!-- VECTOR LAYERS -->

            <div class="layer-section-title">
                Layers
            </div>

            <div id="vector-layers"></div>

        </div>

    `;


    // --------------------------------------------------------
    // ADD SWITCHER TO PAGE
    // --------------------------------------------------------

    document.body.appendChild(
        panel
    );


    // --------------------------------------------------------
    // CREATE BASE MAP CONTROLS
    // --------------------------------------------------------

    createBaseLayerControls();


    // --------------------------------------------------------
    // GET ELEMENTS
    // --------------------------------------------------------

    const header =
        panel.querySelector(
            ".layer-switcher-header"
        );

    const content =
        panel.querySelector(
            "#layer-switcher-content"
        );


    // --------------------------------------------------------
    // START COLLAPSED
    // --------------------------------------------------------

    panel.classList.remove(
        "open"
    );


    // --------------------------------------------------------
    // CLICK LAYERS HEADER
    // --------------------------------------------------------

    header.addEventListener(
        "click",
        function (event) {

            event.preventDefault();

            event.stopPropagation();

            panel.classList.toggle(
                "open"
            );

        }
    );


    // --------------------------------------------------------
    // CLICK INSIDE PANEL
    //
    // DO NOT CLOSE PANEL
    // --------------------------------------------------------

    content.addEventListener(
        "click",
        function (event) {

            event.stopPropagation();

        }
    );

}



// ============================================================
// BASE LAYER CONTROLS
// ============================================================

function createBaseLayerControls() {

    const container =
        document.getElementById(
            "base-layers"
        );

    if (!container) {

        return;

    }


    // --------------------------------------------------------
    // CLEAR
    // --------------------------------------------------------

    container.innerHTML = "";


    // ========================================================
    // OPEN STREET MAP
    // ========================================================

    const osmItem =
        document.createElement(
            "label"
        );

    osmItem.className =
        "layer-item";


    const osmRadio =
        document.createElement(
            "input"
        );

    osmRadio.type =
        "radio";

    osmRadio.name =
        "base-layer";


    osmRadio.checked =
        osmLayer.getVisible();


    osmRadio.onchange =
        function () {

            if (osmRadio.checked) {

                osmLayer.setVisible(
                    true
                );

                googleHybridLayer.setVisible(
                    false
                );

            }

        };


    const osmText =
        document.createElement(
            "span"
        );

    osmText.textContent =
        "OpenStreetMap";


    osmItem.appendChild(
        osmRadio
    );

    osmItem.appendChild(
        osmText
    );


    container.appendChild(
        osmItem
    );



    // ========================================================
    // GOOGLE HYBRID
    // ========================================================

    const googleItem =
        document.createElement(
            "label"
        );

    googleItem.className =
        "layer-item";


    const googleRadio =
        document.createElement(
            "input"
        );

    googleRadio.type =
        "radio";

    googleRadio.name =
        "base-layer";


    googleRadio.checked =
        googleHybridLayer.getVisible();


    googleRadio.onchange =
        function () {

            if (googleRadio.checked) {

                osmLayer.setVisible(
                    false
                );

                googleHybridLayer.setVisible(
                    true
                );

            }

        };


    const googleText =
        document.createElement(
            "span"
        );

    googleText.textContent =
        "Google Hybrid";


    googleItem.appendChild(
        googleRadio
    );

    googleItem.appendChild(
        googleText
    );


    container.appendChild(
        googleItem
    );

}



// ============================================================
// CREATE LAYER BUTTON
// ============================================================

function createLayerButton(
    text,
    title
) {

    const button =
        document.createElement(
            "button"
        );

    button.type =
        "button";

    button.className =
        "layer-button";

    button.textContent =
        text;

    button.title =
        title;

    return button;

}



// ============================================================
// ADD VECTOR LAYER TO LAYER MANAGER
// ============================================================
//
// IMPORTANT:
//
// The order in vectorLayers is the same order shown here.
//
// vectorLayers[0]
//     ↓
// TOP OF SWITCHER
//     ↓
// TOP OF MAP
//
// ============================================================

function addOverlayToSwitcher(
    layer
) {

    const container =
        document.getElementById(
            "vector-layers"
        );

    if (!container) {

        return;

    }


    // --------------------------------------------------------
    // CREATE ROW
    // --------------------------------------------------------

    const row =
        document.createElement(
            "div"
        );

    row.className =
        "layer-manager-row";


    // --------------------------------------------------------
    // SAVE ROW REFERENCE
    // --------------------------------------------------------

    layer.set(
        "managerRow",
        row
    );


    // --------------------------------------------------------
    // NAME SECTION
    // --------------------------------------------------------

    const nameSection =
        document.createElement(
            "div"
        );

    nameSection.className =
        "layer-name-section";


    // --------------------------------------------------------
    // CHECKBOX
    // --------------------------------------------------------

    const checkbox =
        document.createElement(
            "input"
        );

    checkbox.type =
        "checkbox";

    checkbox.checked =
        layer.getVisible();


    checkbox.onchange =
        function () {

            layer.setVisible(
                checkbox.checked
            );

        };


    // --------------------------------------------------------
    // LAYER NAME
    // --------------------------------------------------------

    const name =
        document.createElement(
            "span"
        );

    name.className =
        "layer-name";


    const layerTitle =
        layer.get("title") ||
        layer.get("name") ||
        "Unnamed Layer";


    name.textContent =
        layerTitle;

    name.title =
        layerTitle;


    // --------------------------------------------------------
    // ADD NAME ELEMENTS
    // --------------------------------------------------------

    nameSection.appendChild(
        checkbox
    );

    nameSection.appendChild(
        name
    );



    // ========================================================
    // BUTTON SECTION
    // ========================================================

    const buttons =
        document.createElement(
            "div"
        );

    buttons.className =
        "layer-buttons";



    // ========================================================
    // ZOOM BUTTON
    // ========================================================

    const zoomButton =
        createLayerButton(
            "🔍",
            "Zoom to layer"
        );


    zoomButton.onclick =
        function (event) {

            event.preventDefault();

            event.stopPropagation();

            zoomToLayer(
                layer
            );

        };



    // ========================================================
    // MOVE UP BUTTON
    // ========================================================

    const upButton =
        createLayerButton(
            "↑",
            "Move layer up"
        );


    upButton.onclick =
        function (event) {

            event.preventDefault();

            event.stopPropagation();

            moveLayerUp(
                layer
            );

        };



    // ========================================================
    // MOVE DOWN BUTTON
    // ========================================================

    const downButton =
        createLayerButton(
            "↓",
            "Move layer down"
        );


    downButton.onclick =
        function (event) {

            event.preventDefault();

            event.stopPropagation();

            moveLayerDown(
                layer
            );

        };



    // --------------------------------------------------------
    // ADD BUTTONS
    // --------------------------------------------------------

    buttons.appendChild(
        zoomButton
    );

    buttons.appendChild(
        upButton
    );

    buttons.appendChild(
        downButton
    );



    // --------------------------------------------------------
    // ADD BUTTONS TO ROW
    // --------------------------------------------------------

    row.appendChild(
        nameSection
    );

    row.appendChild(
        buttons
    );



    // --------------------------------------------------------
    // ADD ROW
    // --------------------------------------------------------

    container.appendChild(
        row
    );

}



// ============================================================
// ZOOM TO LAYER
// ============================================================

function zoomToLayer(
    layer
) {

    if (!layer) {

        return;

    }


    const source =
        layer.getSource();


    if (!source) {

        return;

    }


    const extent =
        source.getExtent();


    if (!extent) {

        return;

    }


    // --------------------------------------------------------
    // EMPTY LAYER CHECK
    // --------------------------------------------------------

    if (

        extent[0] === Infinity ||

        extent[1] === Infinity ||

        extent[2] === -Infinity ||

        extent[3] === -Infinity

    ) {

        alert(
            "Layer does not contain any features."
        );

        return;

    }


    // --------------------------------------------------------
    // ZOOM
    // --------------------------------------------------------

    map.getView().fit(
        extent,
        {

            padding: [
                80,
                80,
                80,
                80
            ],

            duration: 700,

            maxZoom: 19

        }
    );

}



// ============================================================
// MOVE LAYER UP
// ============================================================
//
// UP = TOWARDS TOP OF MAP
//
// Example:
//
// Before:
//
// Layer A     [0]
// Layer B     [1]
// Layer C     [2]
//
// Move Layer C UP:
//
// Layer A     [0]
// Layer C     [1]
// Layer B     [2]
//
// ============================================================

function moveLayerUp(
    layer
) {

    const index =
        vectorLayers.indexOf(
            layer
        );


    // --------------------------------------------------------
    // ALREADY TOP
    // --------------------------------------------------------

    if (index <= 0) {

        return;

    }


    // --------------------------------------------------------
    // SWAP WITH PREVIOUS
    // --------------------------------------------------------

    const temp =
        vectorLayers[
            index - 1
        ];


    vectorLayers[
        index - 1
    ] =
        vectorLayers[
            index
        ];


    vectorLayers[
        index
    ] =
        temp;


    // --------------------------------------------------------
    // REBUILD
    // --------------------------------------------------------

    rebuildMapOrder();

    rebuildLayerManager();

}



// ============================================================
// MOVE LAYER DOWN
// ============================================================
//
// DOWN = TOWARDS BOTTOM OF MAP
//
// ============================================================

function moveLayerDown(
    layer
) {

    const index =
        vectorLayers.indexOf(
            layer
        );


    // --------------------------------------------------------
    // INVALID / ALREADY BOTTOM
    // --------------------------------------------------------

    if (

        index === -1 ||

        index >=
        vectorLayers.length - 1

    ) {

        return;

    }


    // --------------------------------------------------------
    // SWAP WITH NEXT
    // --------------------------------------------------------

    const temp =
        vectorLayers[
            index + 1
        ];


    vectorLayers[
        index + 1
    ] =
        vectorLayers[
            index
        ];


    vectorLayers[
        index
    ] =
        temp;


    // --------------------------------------------------------
    // REBUILD
    // --------------------------------------------------------

    rebuildMapOrder();

    rebuildLayerManager();

}



// ============================================================
// REBUILD MAP LAYER ORDER
// ============================================================
//
// IMPORTANT OPENLAYERS RULE:
//
// The layer added LAST is rendered ABOVE
// the layer added BEFORE it.
//
// Therefore:
//
// vectorLayers:
//
// [0] TOP
// [1]
// [2]
// [3] BOTTOM
//
// MUST BE ADDED TO THE MAP AS:
//
// [3]
// [2]
// [1]
// [0]
//
// ============================================================

function rebuildMapOrder() {

    if (
        typeof map === "undefined" ||
        !map
    ) {

        return;

    }


    // --------------------------------------------------------
    // REMOVE CURRENT VECTOR LAYERS
    // --------------------------------------------------------

    vectorLayers.forEach(
        function (layer) {

            map.removeLayer(
                layer
            );

        }
    );


    // --------------------------------------------------------
    // ADD IN REVERSE ORDER
    // --------------------------------------------------------

    for (
        let i =
            vectorLayers.length - 1;

        i >= 0;

        i--
    ) {

        map.addLayer(
            vectorLayers[i]
        );

    }

}



// ============================================================
// REBUILD LAYER MANAGER
// ============================================================
//
// vectorLayers[0] is displayed FIRST.
// Therefore it appears at the TOP.
//
// ============================================================

function rebuildLayerManager() {

    const container =
        document.getElementById(
            "vector-layers"
        );


    if (!container) {

        return;

    }


    // --------------------------------------------------------
    // CLEAR
    // --------------------------------------------------------

    container.innerHTML = "";


    // --------------------------------------------------------
    // REBUILD IN ARRAY ORDER
    // --------------------------------------------------------

    vectorLayers.forEach(
        function (layer) {

            addOverlayToSwitcher(
                layer
            );

        }
    );

}



// ============================================================
// LOAD GEOJSON
// ============================================================

async function loadGeoJSON(
    fileUrl,
    layerName
) {

    try {

        console.log(
            "Loading:",
            fileUrl
        );


        // ----------------------------------------------------
        // FETCH
        // ----------------------------------------------------

        const response =
            await fetch(
                fileUrl
            );


        if (!response.ok) {

            throw new Error(
                "HTTP " +
                response.status
            );

        }


        // ----------------------------------------------------
        // READ GEOJSON
        // ----------------------------------------------------

        const geojson =
            await response.json();


        // ----------------------------------------------------
        // READ FEATURES
        // ----------------------------------------------------

        const format =
            new ol.format.GeoJSON({

                dataProjection:
                    DATA_PROJECTION,

                featureProjection:
                    MAP_PROJECTION

            });


        const features =
            format.readFeatures(
                geojson
            );


        console.log(
            "Loaded:",
            layerName,
            "Features:",
            features.length
        );


        // ----------------------------------------------------
        // VECTOR SOURCE
        // ----------------------------------------------------

        const source =
            new ol.source.Vector({

                features:
                    features

            });


        // ----------------------------------------------------
        // VECTOR LAYER
        // ----------------------------------------------------

        const layer =
            new ol.layer.Vector({

                source:
                    source,

                visible:
                    false

            });


        // ----------------------------------------------------
        // LAYER PROPERTIES
        // ----------------------------------------------------

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
            fileUrl
        );

        layer.set(
            "imported",
            false
        );


        // ----------------------------------------------------
        // ADD TO ARRAY
        // ----------------------------------------------------
        //
        // New normal GeoJSON layer is placed at the BOTTOM.
        //
        // This preserves the existing layer order.
        //
        // ----------------------------------------------------

        vectorLayers.push(
            layer
        );


        // ----------------------------------------------------
        // REBUILD MAP ORDER
        // ----------------------------------------------------

        rebuildMapOrder();


        // ----------------------------------------------------
        // ADD TO SWITCHER
        // ----------------------------------------------------

        rebuildLayerManager();


        console.log(
            "Layer added:",
            layerName
        );


        return layer;

    }

    catch (error) {

        console.error(
            "Error loading layer:",
            fileUrl,
            error
        );

    }

}



// ============================================================
// GET LOCAL SERVER GEOJSON FILES
// ============================================================

async function getLocalGeoJSONFiles() {

    try {

        console.log(
            "Checking local layers folder..."
        );


        const response =
            await fetch(
                "layers/"
            );


        if (!response.ok) {

            throw new Error(
                "Cannot access layers folder"
            );

        }


        const html =
            await response.text();


        // ----------------------------------------------------
        // PARSE DIRECTORY HTML
        // ----------------------------------------------------

        const parser =
            new DOMParser();


        const doc =
            parser.parseFromString(
                html,
                "text/html"
            );


        const links =
            Array.from(
                doc.querySelectorAll(
                    "a"
                )
            );


        // ----------------------------------------------------
        // FIND GEOJSON FILES
        // ----------------------------------------------------

        const files =
            links

                .map(
                    function (link) {

                        return link.getAttribute(
                            "href"
                        );

                    }
                )

                .filter(
                    function (href) {

                        return (
                            href &&
                            href
                                .toLowerCase()
                                .endsWith(
                                    ".geojson"
                                )
                        );

                    }
                );


        // ----------------------------------------------------
        // REMOVE DUPLICATES
        // ----------------------------------------------------

        return [
            ...new Set(
                files
            )
        ];

    }

    catch (error) {

        console.error(
            "Local folder detection failed:",
            error
        );


        return [];

    }

}



// ============================================================
// GET GITHUB GEOJSON FILES
// ============================================================

async function getGitHubGeoJSONFiles() {

    try {

        const apiUrl =
            "https://api.github.com/repos/" +

            GITHUB_OWNER +

            "/" +

            GITHUB_REPO +

            "/contents/" +

            GITHUB_LAYER_FOLDER +

            "?ref=" +

            GITHUB_BRANCH;


        // ----------------------------------------------------
        // FETCH GITHUB API
        // ----------------------------------------------------

        const response =
            await fetch(
                apiUrl
            );


        if (!response.ok) {

            throw new Error(
                "GitHub API error: " +
                response.status
            );

        }


        const files =
            await response.json();


        // ----------------------------------------------------
        // FILTER GEOJSON
        // ----------------------------------------------------

        return files

            .filter(
                function (file) {

                    return (

                        file.type ===
                        "file"

                        &&

                        file.name
                            .toLowerCase()
                            .endsWith(
                                ".geojson"
                            )

                    );

                }
            )

            .map(
                function (file) {

                    return {

                        name:
                            file.name,

                        url:
                            file.download_url

                    };

                }
            );

    }

    catch (error) {

        console.error(
            "GitHub layer detection failed:",
            error
        );


        return [];

    }

}



// ============================================================
// LOAD ALL LOCAL LAYERS
// ============================================================

async function loadLocalLayers() {

    console.log(
        "Detecting GeoJSON files in layers folder..."
    );


    const files =
        await getLocalGeoJSONFiles();


    console.log(
        "Detected local files:",
        files
    );


    for (
        const file of files
    ) {

        const fileName =
            file
                .split("/")
                .pop();


        const layerName =
            fileName
                .replace(
                    /\.geojson$/i,
                    ""
                );


        await loadGeoJSON(
            "layers/" +
            fileName,

            layerName
        );

    }

}



// ============================================================
// LOAD ALL GITHUB LAYERS
// ============================================================

async function loadGitHubLayers() {

    console.log(
        "Detecting GitHub GeoJSON files..."
    );


    const files =
        await getGitHubGeoJSONFiles();


    console.log(
        "Detected GitHub files:",
        files
    );


    for (
        const file of files
    ) {

        const layerName =
            file.name
                .replace(
                    /\.geojson$/i,
                    ""
                );


        await loadGeoJSON(
            file.url,
            layerName
        );

    }

}



// ============================================================
// AUTOMATIC LAYER DETECTION
// ============================================================

async function autoLoadLayers() {

    const hostname =
        window.location.hostname;


    console.log(
        "Current hostname:",
        hostname
    );


    // --------------------------------------------------------
    // GITHUB PAGES
    // --------------------------------------------------------

    if (
        hostname.endsWith(
            "github.io"
        )
    ) {

        console.log(
            "GitHub Pages detected"
        );


        await loadGitHubLayers();

    }


    // --------------------------------------------------------
    // LOCAL SERVER
    // --------------------------------------------------------

    else {

        console.log(
            "Local web server detected"
        );


        await loadLocalLayers();

    }



    // ========================================================
    // ZOOM TO FIRST / TOP LAYER
    // ========================================================

    if (
        vectorLayers.length > 0
    ) {

        const firstLayer =
            vectorLayers[0];


        const source =
            firstLayer.getSource();


        if (source) {

            const extent =
                source.getExtent();


            if (

                extent &&

                extent[0] !== Infinity

            ) {

                map.getView().fit(
                    extent,
                    {

                        padding: [
                            50,
                            50,
                            50,
                            50
                        ],

                        duration: 800,

                        maxZoom: 18

                    }
                );

            }

        }

    }

}



// ============================================================
// 🚀 START APPLICATION
// ============================================================

createLayerSwitcher();

autoLoadLayers();


console.log(
    "OpenLayers application started."
);