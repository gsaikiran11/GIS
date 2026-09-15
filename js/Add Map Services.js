
// ============================================================
// 🌐 STAGE 16 — EXTERNAL BASE MAP SERVICES
// QGIS2WEB + OPENLAYERS
//
// WMS + WMTS + XYZ
//
// IMPORTANT LAYER ORDER
// ------------------------------------------------------------
//
//        TOP
//         │
//         ├── Vector layers
//         ├── Parcel layers
//         ├── Labels
//         ├── Measurements / overlays
//         │
//         ├── ⭐ STAGE 16 EXTERNAL MAP
//         │      WMS / WMTS / XYZ
//         │
//         └── Existing QGIS2Web BASE MAP
//                 │
//                BOTTOM
//
// Stage 16 external maps are NOT added to the
// existing QGIS2Web Layer Switcher.
//
// Existing QGIS2Web base maps remain controlled
// by the existing Layer Switcher.
//
// ============================================================


(function () {

    "use strict";


    // =========================================================
    // CONFIGURATION
    // =========================================================

    const CONFIG = {

        buttonId:
            "stage16-map-services-button",

        panelId:
            "stage16-map-services-panel",

        storageKey:
            "stage16ExternalMapServices",

        mobileBreakpoint:
            650,

        buttonWidth:
            46,

        buttonHeight:
            46,

        buttonGap:
            8,

        defaultOpacity:
            1,

        tileSize:
            256,

        // -----------------------------------------------------
        // The actual z-index is calculated dynamically.
        //
        // DO NOT use a fixed z-index here.
        //
        // Stage 16 will automatically find:
        //
        //      base layers
        //      vector / overlay layers
        //
        // and place itself between them.
        // -----------------------------------------------------

        baseMapGap:
            1,

        vectorGap:
            1

    };


    // =========================================================
    // STATE
    // =========================================================

    const externalLayers = [];

    let activeExternalBaseMap = null;

    let panel = null;

    let mainButton = null;


    // =========================================================
    // SAFETY CHECK
    // =========================================================

    if (
        typeof map === "undefined" ||
        typeof ol === "undefined"
    ) {

        console.error(
            "🌐 Stage 16: OpenLayers map/ol not found."
        );

        return;
    }


    // =========================================================
    // MAIN BUTTON
    // =========================================================

    function createMainButton() {

        if (
            document.getElementById(
                CONFIG.buttonId
            )
        ) {

            mainButton =
                document.getElementById(
                    CONFIG.buttonId
                );

            return;
        }


        const button =
            document.createElement(
                "button"
            );


        mainButton =
            button;


        button.id =
            CONFIG.buttonId;


        button.type =
            "button";


        button.title =
            "External Base Maps";


        // -----------------------------------------------------
        // PROFESSIONAL MAP ICON
        // -----------------------------------------------------

        button.innerHTML = `

            <svg
                width="23"
                height="23"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg">

                <path
                    d="M3 6.5
                       L8.5 4
                       L15.5 6.5
                       L21 4
                       V17.5
                       L15.5 20
                       L8.5 17.5
                       L3 20
                       V6.5Z"
                    stroke="currentColor"
                    stroke-width="1.7"
                    stroke-linejoin="round"/>

                <path
                    d="M8.5 4V17.5"
                    stroke="currentColor"
                    stroke-width="1.5"/>

                <path
                    d="M15.5 6.5V20"
                    stroke="currentColor"
                    stroke-width="1.5"/>

                <circle
                    cx="17"
                    cy="8"
                    r="2.2"
                    stroke="currentColor"
                    stroke-width="1.5"/>

                <path
                    d="M17 10.2V13"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"/>

            </svg>

        `;


        Object.assign(
            button.style,
            {

                position:
                    "fixed",

                width:
                    CONFIG.buttonWidth +
                    "px",

                height:
                    CONFIG.buttonHeight +
                    "px",

                padding:
                    "0",

                margin:
                    "0",

                border:
                    "1px solid rgba(0,0,0,0.25)",

                borderRadius:
                    "8px",

                background:
                    "#ffffff",

                color:
                    "#222222",

                boxShadow:
                    "0 2px 8px rgba(0,0,0,0.25)",

                cursor:
                    "pointer",

                zIndex:
                    "30000",

                display:
                    "flex",

                alignItems:
                    "center",

                justifyContent:
                    "center",

                transition:
                    "all 0.15s ease"

            }
        );


        // -----------------------------------------------------
        // HOVER
        // -----------------------------------------------------

        button.addEventListener(
            "mouseenter",
            function () {

                button.style.transform =
                    "scale(1.06)";

                button.style.boxShadow =
                    "0 3px 10px rgba(0,0,0,0.30)";
            }
        );


        button.addEventListener(
            "mouseleave",
            function () {

                button.style.transform =
                    "scale(1)";

                button.style.boxShadow =
                    "0 2px 8px rgba(0,0,0,0.25)";
            }
        );


        // -----------------------------------------------------
        // CLICK
        // -----------------------------------------------------

        button.addEventListener(
            "click",
            function (event) {

                event.preventDefault();

                event.stopPropagation();


                if (!panel) {

                    createPanel();
                }


                panel.style.display =
                    panel.style.display ===
                    "none"
                        ? "block"
                        : "none";


                refreshLayerManager();

            }
        );


        document.body.appendChild(
            button
        );


        setTimeout(
            positionStage16Button,
            300
        );

        setTimeout(
            positionStage16Button,
            1000
        );
    }


    // =========================================================
    // SMART BUTTON POSITIONING
    // =========================================================

    function positionStage16Button() {

        const button =
            document.getElementById(
                CONFIG.buttonId
            );


        if (!button) {
            return;
        }


        const vw =
            window.innerWidth;

        const vh =
            window.innerHeight;


        const rightMargin =
            vw <= CONFIG.mobileBreakpoint
                ? 10
                : 16;


        const occupied = [];


        const elements =
            document.querySelectorAll(
                "button, .ol-control, [role='button']"
            );


        elements.forEach(
            function (element) {

                if (!element) {
                    return;
                }


                if (
                    element.id ===
                    CONFIG.buttonId
                ) {
                    return;
                }


                if (
                    element.closest(
                        "#" +
                        CONFIG.panelId
                    )
                ) {
                    return;
                }


                const style =
                    window.getComputedStyle(
                        element
                    );


                if (
                    style.display ===
                    "none" ||

                    style.visibility ===
                    "hidden" ||

                    style.opacity ===
                    "0"
                ) {
                    return;
                }


                const rect =
                    element.getBoundingClientRect();


                if (
                    rect.width < 5 ||
                    rect.height < 5
                ) {
                    return;
                }


                const nearRight =
                    rect.right >=
                        vw - 120 ||

                    rect.left >=
                        vw * 0.72;


                if (!nearRight) {
                    return;
                }


                if (
                    rect.bottom < 0 ||
                    rect.top > vh
                ) {
                    return;
                }


                occupied.push(
                    rect
                );

            }
        );


        let selectedBottom =
            15;


        const step =
            CONFIG.buttonHeight +
            CONFIG.buttonGap;


        const attempts =
            Math.ceil(
                vh / step
            );


        for (
            let i = 0;
            i < attempts;
            i++
        ) {

            const candidateBottom =
                15 +
                i * step;


            const candidateTop =
                vh -
                candidateBottom -
                CONFIG.buttonHeight;


            const candidateLeft =
                vw -
                rightMargin -
                CONFIG.buttonWidth;


            const testRect = {

                left:
                    candidateLeft -
                    CONFIG.buttonGap,

                right:
                    candidateLeft +
                    CONFIG.buttonWidth +
                    CONFIG.buttonGap,

                top:
                    candidateTop -
                    CONFIG.buttonGap,

                bottom:
                    candidateTop +
                    CONFIG.buttonHeight +
                    CONFIG.buttonGap

            };


            let collision =
                false;


            for (
                let j = 0;
                j < occupied.length;
                j++
            ) {

                const r =
                    occupied[j];


                if (
                    testRect.left <
                        r.right &&

                    testRect.right >
                        r.left &&

                    testRect.top <
                        r.bottom &&

                    testRect.bottom >
                        r.top
                ) {

                    collision =
                        true;

                    break;
                }
            }


            if (!collision) {

                selectedBottom =
                    candidateBottom;

                break;
            }
        }


        button.style.right =
            rightMargin +
            "px";


        button.style.bottom =
            selectedBottom +
            "px";


        button.style.left =
            "auto";


        button.style.top =
            "auto";
    }


    // =========================================================
    // CREATE PANEL
    // =========================================================

    function createPanel() {

        if (
            document.getElementById(
                CONFIG.panelId
            )
        ) {

            panel =
                document.getElementById(
                    CONFIG.panelId
                );

            return;
        }


        panel =
            document.createElement(
                "div"
            );


        panel.id =
            CONFIG.panelId;


        panel.innerHTML = `

            <div class="stage16-header">

                <div>

                    <div class="stage16-title">
                        🌐 External Base Maps
                    </div>

                    <div class="stage16-subtitle">
                        WMS · WMTS · XYZ
                    </div>

                </div>


                <button
                    id="stage16-close"
                    title="Close">

                    ×

                </button>

            </div>


            <div class="stage16-tabs">

                <button
                    class="stage16-tab active"
                    data-tab="wms">

                    WMS

                </button>


                <button
                    class="stage16-tab"
                    data-tab="wmts">

                    WMTS

                </button>


                <button
                    class="stage16-tab"
                    data-tab="xyz">

                    XYZ

                </button>


                <button
                    class="stage16-tab"
                    data-tab="layers">

                    BASE MAPS

                </button>

            </div>


            <!-- =================================================
                 WMS
            ================================================== -->

            <div
                id="stage16-tab-wms"
                class="stage16-tab-content">

                <label>
                    WMS GetCapabilities URL
                </label>


                <input
                    id="stage16-wms-url"
                    type="text"
                    placeholder="https://example.com/wms?SERVICE=WMS&REQUEST=GetCapabilities"
                />


                <button
                    id="stage16-wms-connect"
                    class="stage16-primary">

                    Connect

                </button>


                <div
                    id="stage16-wms-status"
                    class="stage16-status">
                </div>


                <label>
                    WMS Layer
                </label>


                <select
                    id="stage16-wms-layer">

                    <option value="">
                        Connect to WMS first
                    </option>

                </select>


                <button
                    id="stage16-wms-add"
                    class="stage16-primary">

                    Add as Base Map

                </button>

            </div>


            <!-- =================================================
                 WMTS
            ================================================== -->

            <div
                id="stage16-tab-wmts"
                class="stage16-tab-content"
                style="display:none;">

                <label>
                    WMTS GetCapabilities URL
                </label>


                <input
                    id="stage16-wmts-url"
                    type="text"
                    placeholder="https://example.com/wmts?SERVICE=WMTS&REQUEST=GetCapabilities"
                />


                <button
                    id="stage16-wmts-connect"
                    class="stage16-primary">

                    Connect

                </button>


                <div
                    id="stage16-wmts-status"
                    class="stage16-status">
                </div>


                <label>
                    WMTS Layer
                </label>


                <select
                    id="stage16-wmts-layer">

                    <option value="">
                        Connect to WMTS first
                    </option>

                </select>


                <button
                    id="stage16-wmts-add"
                    class="stage16-primary">

                    Add as Base Map

                </button>

            </div>


            <!-- =================================================
                 XYZ
            ================================================== -->

            <div
                id="stage16-tab-xyz"
                class="stage16-tab-content"
                style="display:none;">

                <label>
                    XYZ Tile URL
                </label>


                <input
                    id="stage16-xyz-url"
                    type="text"
                    placeholder="https://tile.server/{z}/{x}/{y}.png"
                />


                <label>
                    Base Map Name
                </label>


                <input
                    id="stage16-xyz-name"
                    type="text"
                    placeholder="My XYZ Base Map"
                />


                <button
                    id="stage16-xyz-add"
                    class="stage16-primary">

                    Add as Base Map

                </button>

            </div>


            <!-- =================================================
                 BASE MAP MANAGER
            ================================================== -->

            <div
                id="stage16-tab-layers"
                class="stage16-tab-content"
                style="display:none;">

                <div
                    id="stage16-layer-list"
                    class="stage16-layer-list">
                </div>

            </div>


            <div class="stage16-footer">

                External maps are placed above the
                selected QGIS2Web base map and below
                vector / parcel layers.

            </div>

        `;


        document.body.appendChild(
            panel
        );


        bindPanelEvents();

        refreshLayerManager();

    }


    // =========================================================
    // PANEL EVENTS
    // =========================================================

    function bindPanelEvents() {


        document.getElementById(
            "stage16-close"
        ).addEventListener(
            "click",
            function () {

                panel.style.display =
                    "none";
            }
        );


        // -----------------------------------------------------
        // TABS
        // -----------------------------------------------------

        document.querySelectorAll(
            ".stage16-tab"
        ).forEach(
            function (tab) {

                tab.addEventListener(
                    "click",
                    function () {

                        const name =
                            tab.dataset.tab;


                        document
                            .querySelectorAll(
                                ".stage16-tab"
                            )
                            .forEach(
                                function (item) {

                                    item.classList.remove(
                                        "active"
                                    );

                                }
                            );


                        document
                            .querySelectorAll(
                                ".stage16-tab-content"
                            )
                            .forEach(
                                function (item) {

                                    item.style.display =
                                        "none";

                                }
                            );


                        tab.classList.add(
                            "active"
                        );


                        document.getElementById(
                            "stage16-tab-" +
                            name
                        ).style.display =
                            "block";


                        if (
                            name ===
                            "layers"
                        ) {

                            refreshLayerManager();

                        }

                    }
                );

            }
        );


        // -----------------------------------------------------
        // WMS
        // -----------------------------------------------------

        document.getElementById(
            "stage16-wms-connect"
        ).addEventListener(
            "click",
            connectWMS
        );


        document.getElementById(
            "stage16-wms-add"
        ).addEventListener(
            "click",
            addWMSLayer
        );


        // -----------------------------------------------------
        // WMTS
        // -----------------------------------------------------

        document.getElementById(
            "stage16-wmts-connect"
        ).addEventListener(
            "click",
            connectWMTS
        );


        document.getElementById(
            "stage16-wmts-add"
        ).addEventListener(
            "click",
            addWMTSLayer
        );


        // -----------------------------------------------------
        // XYZ
        // -----------------------------------------------------

        document.getElementById(
            "stage16-xyz-add"
        ).addEventListener(
            "click",
            addXYZLayer
        );

    }


    // =========================================================
    // NORMALIZE CAPABILITIES URL
    // =========================================================

    function normalizeCapabilitiesURL(
        url,
        service
    ) {

        url =
            String(
                url || ""
            ).trim();


        if (!url) {
            return "";
        }


        if (
            /request=getcapabilities/i.test(
                url
            )
        ) {

            return url;
        }


        const separator =
            url.indexOf("?") >= 0
                ? "&"
                : "?";


        return (
            url +
            separator +
            "SERVICE=" +
            service +
            "&REQUEST=GetCapabilities"
        );

    }


    // =========================================================
    // CONNECT WMS
    // =========================================================

    async function connectWMS() {

        const input =
            document.getElementById(
                "stage16-wms-url"
            );


        const status =
            document.getElementById(
                "stage16-wms-status"
            );


        const select =
            document.getElementById(
                "stage16-wms-layer"
            );


        const url =
            normalizeCapabilitiesURL(
                input.value,
                "WMS"
            );


        if (!url) {

            status.textContent =
                "Please enter a WMS URL.";

            return;
        }


        status.textContent =
            "Connecting...";


        try {

            const response =
                await fetch(
                    url
                );


            if (!response.ok) {

                throw new Error(
                    "HTTP " +
                    response.status
                );

            }


            const text =
                await response.text();


            const layers =
                parseWMSCapabilities(
                    text
                );


            if (!layers.length) {

                throw new Error(
                    "No WMS layers found."
                );

            }


            select.innerHTML =
                "";


            layers.forEach(
                function (layer) {

                    const option =
                        document.createElement(
                            "option"
                        );


                    option.value =
                        layer.name;


                    option.textContent =
                        layer.title ||
                        layer.name;


                    option.dataset.abstract =
                        layer.abstract ||
                        "";


                    select.appendChild(
                        option
                    );

                }
            );


            select.dataset.serviceUrl =
                url;


            status.textContent =
                "✓ " +
                layers.length +
                " WMS layers found.";

        }
        catch (error) {

            console.error(
                "Stage 16 WMS error:",
                error
            );


            status.textContent =
                "Unable to load capabilities. Check URL/CORS.";

        }

    }


    // =========================================================
    // PARSE WMS CAPABILITIES
    // =========================================================

    function parseWMSCapabilities(
        xmlText
    ) {

        const parser =
            new DOMParser();


        const xml =
            parser.parseFromString(
                xmlText,
                "text/xml"
            );


        const output = [];


        const layerNodes =
            Array.from(
                xml.getElementsByTagName(
                    "Layer"
                )
            );


        layerNodes.forEach(
            function (layerNode) {

                const nameNode =
                    layerNode.getElementsByTagName(
                        "Name"
                    )[0];


                if (!nameNode) {
                    return;
                }


                const titleNode =
                    layerNode.getElementsByTagName(
                        "Title"
                    )[0];


                const abstractNode =
                    layerNode.getElementsByTagName(
                        "Abstract"
                    )[0];


                output.push({

                    name:
                        nameNode.textContent.trim(),

                    title:
                        titleNode
                            ? titleNode.textContent.trim()
                            : "",

                    abstract:
                        abstractNode
                            ? abstractNode.textContent.trim()
                            : ""

                });

            }
        );


        return output;
    }


    // =========================================================
    // ADD WMS
    // =========================================================

    function addWMSLayer() {

        const select =
            document.getElementById(
                "stage16-wms-layer"
            );


        const layerName =
            select.value;


        const serviceURL =
            select.dataset.serviceUrl;


        if (
            !layerName ||
            !serviceURL
        ) {

            alert(
                "Please connect to WMS and select a layer."
            );

            return;
        }


        // -----------------------------------------------------
        // Remove GetCapabilities request
        // -----------------------------------------------------

        const baseURL =
            serviceURL
                .replace(
                    /([?&])SERVICE=WMS/ig,
                    "$1"
                )
                .replace(
                    /([?&])REQUEST=GetCapabilities/ig,
                    "$1"
                )
                .replace(
                    /[?&]$/,
                    ""
                );


        const source =
            new ol.source.TileWMS({

                url:
                    baseURL,

                params: {

                    "LAYERS":
                        layerName,

                    "STYLES":
                        "",

                    "FORMAT":
                        "image/png",

                    "TRANSPARENT":
                        true,

                    "VERSION":
                        "1.1.1",

                    "TILED":
                        true

                },

                crossOrigin:
                    "anonymous"

            });


        const layer =
            new ol.layer.Tile({

                source:
                    source,

                visible:
                    true,

                opacity:
                    CONFIG.defaultOpacity,

                properties: {

                    stage16External:
                        true,

                    stage16ExternalType:
                        "WMS",

                    stage16ExternalBaseMap:
                        true

                }

            });


        addExternalBaseMap(
            layer,
            {

                type:
                    "WMS",

                name:
                    layerName,

                title:
                    layerName,

                url:
                    baseURL,

                layer:
                    layerName

            }
        );

    }


    // =========================================================
    // CONNECT WMTS
    // =========================================================

    async function connectWMTS() {

        const input =
            document.getElementById(
                "stage16-wmts-url"
            );


        const status =
            document.getElementById(
                "stage16-wmts-status"
            );


        const select =
            document.getElementById(
                "stage16-wmts-layer"
            );


        const url =
            input.value.trim();


        if (!url) {

            status.textContent =
                "Please enter a WMTS URL.";

            return;
        }


        status.textContent =
            "Connecting...";


        try {

            const response =
                await fetch(
                    url
                );


            if (!response.ok) {

                throw new Error(
                    "HTTP " +
                    response.status
                );

            }


            const text =
                await response.text();


            const parser =
                new ol.format.WMTSCapabilities();


            const capabilities =
                parser.read(
                    text
                );


            const contents =
                capabilities.Contents;


            if (
                !contents ||
                !contents.Layer
            ) {

                throw new Error(
                    "No WMTS layers found."
                );

            }


            select.innerHTML =
                "";


            contents.Layer.forEach(
                function (layer) {

                    const identifier =
                        layer.Identifier;


                    const option =
                        document.createElement(
                            "option"
                        );


                    option.value =
                        identifier;


                    option.textContent =
                        layer.Title ||
                        identifier;


                    select.appendChild(
                        option
                    );

                }
            );


            select.dataset.serviceUrl =
                url;


            status.textContent =
                "✓ " +
                contents.Layer.length +
                " WMTS layers found.";

        }
        catch (error) {

            console.error(
                "Stage 16 WMTS error:",
                error
            );


            status.textContent =
                "Unable to load WMTS capabilities.";

        }

    }


    // =========================================================
    // ADD WMTS
    // =========================================================

    async function addWMTSLayer() {

        const select =
            document.getElementById(
                "stage16-wmts-layer"
            );


        const layerName =
            select.value;


        const url =
            select.dataset.serviceUrl;


        if (
            !layerName ||
            !url
        ) {

            alert(
                "Please connect to WMTS and select a layer."
            );

            return;
        }


        try {

            const response =
                await fetch(
                    url
                );


            const text =
                await response.text();


            const parser =
                new ol.format.WMTSCapabilities();


            const capabilities =
                parser.read(
                    text
                );


            const options =
                ol.source.WMTS
                    .optionsFromCapabilities(
                        capabilities,
                        {
                            layer:
                                layerName
                        }
                    );


            if (!options) {

                throw new Error(
                    "Unable to create WMTS source."
                );

            }


            const source =
                new ol.source.WMTS(
                    options
                );


            const layer =
                new ol.layer.Tile({

                    source:
                        source,

                    visible:
                        true,

                    opacity:
                        CONFIG.defaultOpacity,

                    properties: {

                        stage16External:
                            true,

                        stage16ExternalType:
                            "WMTS",

                        stage16ExternalBaseMap:
                            true

                    }

                });


            addExternalBaseMap(
                layer,
                {

                    type:
                        "WMTS",

                    name:
                        layerName,

                    title:
                        layerName,

                    url:
                        url,

                    layer:
                        layerName

                }
            );

        }
        catch (error) {

            console.error(
                "Stage 16 WMTS error:",
                error
            );


            alert(
                "Unable to add WMTS layer."
            );

        }

    }


    // =========================================================
    // ADD XYZ
    // =========================================================

    function addXYZLayer() {

        const urlInput =
            document.getElementById(
                "stage16-xyz-url"
            );


        const nameInput =
            document.getElementById(
                "stage16-xyz-name"
            );


        const url =
            urlInput.value.trim();


        if (!url) {

            alert(
                "Please enter XYZ tile URL."
            );

            return;
        }


        const name =
            nameInput.value.trim() ||
            "XYZ Base Map";


        const source =
            new ol.source.XYZ({

                url:
                    url,

                crossOrigin:
                    "anonymous",

                tileSize:
                    CONFIG.tileSize

            });


        const layer =
            new ol.layer.Tile({

                source:
                    source,

                visible:
                    true,

                opacity:
                    CONFIG.defaultOpacity,

                properties: {

                    stage16External:
                        true,

                    stage16ExternalType:
                        "XYZ",

                    stage16ExternalBaseMap:
                        true

                }

            });


        addExternalBaseMap(
            layer,
            {

                type:
                    "XYZ",

                name:
                    name,

                title:
                    name,

                url:
                    url

            }
        );

    }


    // =========================================================
    // ADD EXTERNAL BASE MAP
    // =========================================================

    function addExternalBaseMap(
        layer,
        metadata
    ) {

        // -----------------------------------------------------
        // Prevent duplicate
        // -----------------------------------------------------

        const duplicate =
            externalLayers.some(
                function (item) {

                    return (

                        item.metadata.type ===
                        metadata.type &&

                        item.metadata.url ===
                        metadata.url &&

                        item.metadata.layer ===
                        metadata.layer

                    );

                }
            );


        if (duplicate) {

            alert(
                "This external base map is already added."
            );

            return;
        }


        // -----------------------------------------------------
        // Add to map
        // -----------------------------------------------------

        map.addLayer(
            layer
        );


        const item = {

            id:
                "stage16-" +
                Date.now() +
                "-" +
                Math.random()
                    .toString(36)
                    .substring(2, 8),

            layer:
                layer,

            metadata:
                metadata

        };


        layer.set(
            "stage16Id",
            item.id
        );


        externalLayers.push(
            item
        );


        // -----------------------------------------------------
        // IMPORTANT
        //
        // Position the external layer BETWEEN:
        //
        // Existing QGIS2Web BASE layers
        // and
        // Existing vector / overlay layers.
        // -----------------------------------------------------

        positionExternalLayer(
            layer
        );


        // -----------------------------------------------------
        // Activate it
        // -----------------------------------------------------

        activateExternalBaseMap(
            item
        );


        saveExternalLayers();

        refreshLayerManager();


        console.log(
            "🌐 Stage 16 external base map added:",
            metadata
        );

    }


    // =========================================================
    // IDENTIFY QGIS2WEB BASE LAYERS
    // =========================================================
    //
    // QGIS2Web/OpenLayers normally marks base layers with:
    //
    //     layer.set('type', 'base')
    //
    // We deliberately use that property.
    //
    // This means the Stage 16 layer will work with the
    // existing Layer Switcher rather than creating a second
    // base-map system.
    //
    // =========================================================

    function isQGIS2WebBaseLayer(
        layer
    ) {

        if (!layer) {
            return false;
        }


        if (
            layer.get(
                "stage16External"
            )
        ) {

            return false;
        }


        const type =
            layer.get(
                "type"
            );


        if (
            type ===
            "base"
        ) {

            return true;
        }


        // -----------------------------------------------------
        // Some projects use isBaseLayer.
        // -----------------------------------------------------

        if (
            layer.get(
                "isBaseLayer"
            ) === true
        ) {

            return true;
        }


        // -----------------------------------------------------
        // Some custom QGIS2Web configurations may use
        // baseLayer.
        // -----------------------------------------------------

        if (
            layer.get(
                "baseLayer"
            ) === true
        ) {

            return true;
        }


        return false;
    }


    // =========================================================
    // IDENTIFY VECTOR / OVERLAY LAYERS
    // =========================================================

    function isVectorOrOverlayLayer(
        layer
    ) {

        if (!layer) {
            return false;
        }


        if (
            layer.get(
                "stage16External"
            )
        ) {

            return false;
        }


        if (
            isQGIS2WebBaseLayer(
                layer
            )
        ) {

            return false;
        }


        if (
            layer instanceof
            ol.layer.Vector
        ) {

            return true;
        }


        if (
            layer instanceof
            ol.layer.VectorTile
        ) {

            return true;
        }


        // -----------------------------------------------------
        // Any layer not explicitly marked as base is considered
        // an overlay/background-independent layer.
        // -----------------------------------------------------

        return true;
    }


    // =========================================================
    // GET EXISTING BASE LAYERS
    // =========================================================

    function getExistingBaseLayers() {

        return map.getLayers()
            .getArray()
            .filter(
                function (layer) {

                    return isQGIS2WebBaseLayer(
                        layer
                    );

                }
            );

    }


    // =========================================================
    // GET EXISTING VECTOR / OVERLAY LAYERS
    // =========================================================

    function getExistingOverlayLayers() {

        return map.getLayers()
            .getArray()
            .filter(
                function (layer) {

                    return isVectorOrOverlayLayer(
                        layer
                    );

                }
            );

    }


    // =========================================================
    // CALCULATE EXTERNAL MAP Z-INDEX
    // =========================================================
    //
    // This is the important part.
    //
    // We find the LOWEST z-index of the non-base layers.
    //
    // External map is placed immediately below that.
    //
    // Therefore:
    //
    // BASE
    //   ↓
    // EXTERNAL WMS/WMTS/XYZ
    //   ↓
    // VECTOR / OVERLAY
    //
    // =========================================================

    function calculateExternalZIndex() {

        const layers =
            map.getLayers()
                .getArray();


        const baseLayers =
            getExistingBaseLayers();


        const overlayLayers =
            getExistingOverlayLayers();


        // -----------------------------------------------------
        // Find highest base-map z-index
        // -----------------------------------------------------

        let highestBaseZ =
            -Infinity;


        baseLayers.forEach(
            function (layer) {

                let z =
                    layer.getZIndex();


                if (
                    z === undefined ||
                    z === null
                ) {

                    z = 0;
                }


                highestBaseZ =
                    Math.max(
                        highestBaseZ,
                        z
                    );

            }
        );


        // -----------------------------------------------------
        // Find LOWEST overlay/vector z-index
        // -----------------------------------------------------

        let lowestOverlayZ =
            Infinity;


        overlayLayers.forEach(
            function (layer) {

                let z =
                    layer.getZIndex();


                if (
                    z === undefined ||
                    z === null
                ) {

                    z = 0;
                }


                lowestOverlayZ =
                    Math.min(
                        lowestOverlayZ,
                        z
                    );

            }
        );


        // -----------------------------------------------------
        // CASE 1
        //
        // We have vector/overlay layers with z-index.
        // Put external map immediately below them.
        // -----------------------------------------------------

        if (
            lowestOverlayZ !== Infinity
        ) {

            return (
                lowestOverlayZ -
                CONFIG.vectorGap
            );

        }


        // -----------------------------------------------------
        // CASE 2
        //
        // No overlay z-index found.
        //
        // Put it immediately above base map.
        // -----------------------------------------------------

        if (
            highestBaseZ !== -Infinity
        ) {

            return (
                highestBaseZ +
                CONFIG.baseMapGap
            );

        }


        // -----------------------------------------------------
        // FALLBACK
        // -----------------------------------------------------

        return 1;

    }


    // =========================================================
    // POSITION EXTERNAL LAYER
    // =========================================================

    function positionExternalLayer(
        layer
    ) {

        if (!layer) {
            return;
        }


        const zIndex =
            calculateExternalZIndex();


        layer.setZIndex(
            zIndex
        );


        console.log(
            "🌐 Stage 16 z-index:",
            zIndex
        );

    }


    // =========================================================
    // REPOSITION ALL EXTERNAL MAPS
    // =========================================================

    function repositionAllExternalLayers() {

        externalLayers.forEach(
            function (item) {

                positionExternalLayer(
                    item.layer
                );

            }
        );

    }


    // =========================================================
    // ACTIVATE EXTERNAL BASE MAP
    // =========================================================

    function activateExternalBaseMap(
        item
    ) {

        if (!item) {
            return;
        }


        activeExternalBaseMap =
            item;


        // -----------------------------------------------------
        // Only one Stage 16 base map visible.
        // -----------------------------------------------------

        externalLayers.forEach(
            function (other) {

                other.layer.setVisible(
                    other.id === item.id
                );

            }
        );


        // -----------------------------------------------------
        // Recalculate position against the EXISTING
        // QGIS2Web layers.
        // -----------------------------------------------------

        positionExternalLayer(
            item.layer
        );


        // -----------------------------------------------------
        // IMPORTANT:
        //
        // We DO NOT hide or remove the QGIS2Web base map.
        //
        // It remains under the Stage 16 map and continues
        // to be controlled by the original Layer Switcher.
        //
        // Transparent WMS layers can therefore still show
        // the QGIS2Web base underneath.
        // -----------------------------------------------------


        refreshLayerManager();

        saveExternalLayers();


        console.log(
            "🌐 Stage 16 active base map:",
            item.metadata.title
        );

    }


    // =========================================================
    // REMOVE EXTERNAL BASE MAP
    // =========================================================

    function removeExternalLayer(
        item
    ) {

        if (!item) {
            return;
        }


        const wasActive =
            activeExternalBaseMap &&
            activeExternalBaseMap.id ===
                item.id;


        try {

            map.removeLayer(
                item.layer
            );

        }
        catch (error) {

            console.warn(
                "Stage 16 remove error:",
                error
            );

        }


        const index =
            externalLayers.indexOf(
                item
            );


        if (index >= 0) {

            externalLayers.splice(
                index,
                1
            );

        }


        if (wasActive) {

            activeExternalBaseMap =
                null;


            if (
                externalLayers.length
            ) {

                activateExternalBaseMap(
                    externalLayers[
                        externalLayers.length - 1
                    ]
                );

            }

        }


        repositionAllExternalLayers();

        saveExternalLayers();

        refreshLayerManager();

    }


    // =========================================================
    // DEACTIVATE EXTERNAL BASE MAP
    // =========================================================

    function deactivateExternalBaseMap() {

        if (
            !activeExternalBaseMap
        ) {

            return;
        }


        activeExternalBaseMap
            .layer
            .setVisible(
                false
            );


        activeExternalBaseMap =
            null;


        saveExternalLayers();

        refreshLayerManager();

    }


    // =========================================================
    // LAYER MANAGER
    // =========================================================

    function refreshLayerManager() {

        const container =
            document.getElementById(
                "stage16-layer-list"
            );


        if (!container) {
            return;
        }


        container.innerHTML =
            "";


        if (
            !externalLayers.length
        ) {

            container.innerHTML = `

                <div class="stage16-empty">

                    No external base maps added.

                </div>

            `;

            return;
        }


        externalLayers.forEach(
            function (item) {

                const row =
                    document.createElement(
                        "div"
                    );


                row.className =
                    "stage16-layer-row";


                const active =
                    activeExternalBaseMap &&
                    activeExternalBaseMap.id ===
                        item.id;


                const type =
                    item.metadata.type;


                const name =
                    item.metadata.title ||
                    item.metadata.name ||
                    type;


                row.innerHTML = `

                    <div class="stage16-layer-top">

                        <label
                            class="stage16-layer-name">

                            <input
                                type="radio"
                                name="stage16-active-base-map"
                                ${
                                    active
                                        ? "checked"
                                        : ""
                                }
                            >

                            <span>
                                ${escapeHTML(name)}
                            </span>

                        </label>


                        <span
                            class="stage16-type">

                            ${escapeHTML(type)}

                        </span>

                    </div>


                    <div class="stage16-layer-controls">

                        <button
                            class="stage16-small"
                            data-action="visibility"
                            title="Show / Hide">

                            ${
                                item.layer.getVisible()
                                    ? "👁"
                                    : "◌"
                            }

                        </button>


                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value="${item.layer.getOpacity()}"
                            class="stage16-opacity"
                            title="Opacity"
                        >


                        <span
                            class="stage16-opacity-value">

                            ${
                                Math.round(
                                    item.layer.getOpacity() *
                                    100
                                )
                            }%

                        </span>


                        <button
                            class="stage16-small stage16-delete"
                            data-action="remove"
                            title="Remove">

                            🗑

                        </button>

                    </div>

                `;


                // -------------------------------------------------
                // ACTIVATE
                // -------------------------------------------------

                const radio =
                    row.querySelector(
                        "input[type='radio']"
                    );


                radio.addEventListener(
                    "change",
                    function () {

                        if (
                            radio.checked
                        ) {

                            activateExternalBaseMap(
                                item
                            );

                        }

                    }
                );


                // -------------------------------------------------
                // VISIBILITY
                // -------------------------------------------------

                const visibilityButton =
                    row.querySelector(
                        "[data-action='visibility']"
                    );


                visibilityButton.addEventListener(
                    "click",
                    function () {

                        if (
                            item.layer.getVisible()
                        ) {

                            if (
                                activeExternalBaseMap &&
                                activeExternalBaseMap.id ===
                                    item.id
                            ) {

                                deactivateExternalBaseMap();

                            } else {

                                item.layer.setVisible(
                                    false
                                );

                            }

                        } else {

                            activateExternalBaseMap(
                                item
                            );

                        }

                    }
                );


                // -------------------------------------------------
                // OPACITY
                // -------------------------------------------------

                const opacity =
                    row.querySelector(
                        ".stage16-opacity"
                    );


                const opacityValue =
                    row.querySelector(
                        ".stage16-opacity-value"
                    );


                opacity.addEventListener(
                    "input",
                    function () {

                        const value =
                            Number(
                                opacity.value
                            );


                        item.layer.setOpacity(
                            value
                        );


                        opacityValue.textContent =
                            Math.round(
                                value * 100
                            ) +
                            "%";


                        saveExternalLayers();

                    }
                );


                // -------------------------------------------------
                // REMOVE
                // -------------------------------------------------

                const removeButton =
                    row.querySelector(
                        "[data-action='remove']"
                    );


                removeButton.addEventListener(
                    "click",
                    function () {

                        removeExternalLayer(
                            item
                        );

                    }
                );


                container.appendChild(
                    row
                );

            }
        );

    }


    // =========================================================
    // ESCAPE HTML
    // =========================================================

    function escapeHTML(
        value
    ) {

        return String(
            value || ""
        )
            .replace(
                /&/g,
                "&amp;"
            )
            .replace(
                /</g,
                "&lt;"
            )
            .replace(
                />/g,
                "&gt;"
            )
            .replace(
                /"/g,
                "&quot;"
            )
            .replace(
                /'/g,
                "&#039;"
            );

    }


    // =========================================================
    // SAVE
    // =========================================================

    function saveExternalLayers() {

        try {

            const data =
                externalLayers.map(
                    function (item) {

                        return {

                            id:
                                item.id,

                            metadata:
                                item.metadata,

                            opacity:
                                item.layer.getOpacity(),

                            visible:
                                item.layer.getVisible(),

                            active:
                                activeExternalBaseMap &&
                                activeExternalBaseMap.id ===
                                    item.id

                        };

                    }
                );


            localStorage.setItem(
                CONFIG.storageKey,
                JSON.stringify(
                    data
                )
            );

        }
        catch (error) {

            console.warn(
                "Stage 16 localStorage save failed.",
                error
            );

        }

    }


    // =========================================================
    // RESTORE SAVED XYZ BASE MAPS
    // =========================================================
    //
    // XYZ can safely be restored from its URL.
    //
    // WMS/WMTS capabilities are not automatically recreated
    // here because the server capabilities may have changed.
    //
    // =========================================================

    function restoreExternalLayers() {

        let saved = [];


        try {

            saved =
                JSON.parse(
                    localStorage.getItem(
                        CONFIG.storageKey
                    ) ||
                    "[]"
                );

        }
        catch (error) {

            saved = [];

        }


        if (
            !Array.isArray(saved)
        ) {

            return;
        }


        saved.forEach(
            function (item) {

                if (
                    !item ||
                    !item.metadata
                ) {

                    return;

                }


                if (
                    item.metadata.type !==
                    "XYZ"
                ) {

                    return;

                }


                const source =
                    new ol.source.XYZ({

                        url:
                            item.metadata.url,

                        crossOrigin:
                            "anonymous",

                        tileSize:
                            CONFIG.tileSize

                    });


                const layer =
                    new ol.layer.Tile({

                        source:
                            source,

                        visible:
                            false,

                        opacity:
                            typeof item.opacity ===
                            "number"

                                ? item.opacity

                                : CONFIG.defaultOpacity,

                        properties: {

                            stage16External:
                                true,

                            stage16ExternalType:
                                "XYZ",

                            stage16ExternalBaseMap:
                                true

                        }

                    });


                map.addLayer(
                    layer
                );


                const restored = {

                    id:
                        item.id ||
                        (
                            "stage16-" +
                            Date.now() +
                            "-" +
                            Math.random()
                                .toString(36)
                                .substring(2, 8)
                        ),

                    layer:
                        layer,

                    metadata:
                        item.metadata

                };


                layer.set(
                    "stage16Id",
                    restored.id
                );


                externalLayers.push(
                    restored
                );


                positionExternalLayer(
                    layer
                );

            }
        );


        // -----------------------------------------------------
        // Restore active XYZ map
        // -----------------------------------------------------

        const activeSaved =
            saved.find(
                function (item) {

                    return item.active;

                }
            );


        if (activeSaved) {

            const restored =
                externalLayers.find(
                    function (item) {

                        return (
                            item.id ===
                            activeSaved.id
                        );

                    }
                );


            if (restored) {

                activateExternalBaseMap(
                    restored
                );

            }

        }


        refreshLayerManager();

    }


    // =========================================================
    // CSS
    // =========================================================

    function injectCSS() {

        if (
            document.getElementById(
                "stage16-css"
            )
        ) {

            return;
        }


        const css =
            document.createElement(
                "style"
            );


        css.id =
            "stage16-css";


        css.textContent = `

            /* =================================================
               MAIN BUTTON
            ================================================= */

            #${CONFIG.buttonId} {

                box-sizing:
                    border-box;

                line-height:
                    1;

                outline:
                    none;

            }


            #${CONFIG.buttonId}:focus {

                outline:
                    none;

            }


            /* =================================================
               PANEL
            ================================================= */

            #${CONFIG.panelId} {

                position:
                    fixed;

                top:
                    15px;

                right:
                    15px;

                width:
                    390px;

                max-width:
                    calc(100vw - 30px);

                max-height:
                    calc(100vh - 30px);

                overflow:
                    hidden;

                background:
                    #ffffff;

                border:
                    1px solid #c8c8c8;

                border-radius:
                    10px;

                box-shadow:
                    0 5px 25px
                    rgba(0,0,0,0.30);

                z-index:
                    35000;

                font-family:
                    Arial,
                    sans-serif;

                color:
                    #222222;

                font-size:
                    13px;

            }


            /* =================================================
               HEADER
            ================================================= */

            .stage16-header {

                display:
                    flex;

                align-items:
                    center;

                justify-content:
                    space-between;

                padding:
                    12px 13px;

                background:
                    #f5f6f7;

                border-bottom:
                    1px solid #dddddd;

            }


            .stage16-title {

                font-size:
                    15px;

                font-weight:
                    bold;

            }


            .stage16-subtitle {

                margin-top:
                    2px;

                font-size:
                    11px;

                color:
                    #777777;

            }


            #stage16-close {

                width:
                    32px;

                height:
                    32px;

                border:
                    none;

                background:
                    transparent;

                font-size:
                    24px;

                cursor:
                    pointer;

                color:
                    #555555;

            }


            #stage16-close:hover {

                background:
                    #e9e9e9;

                border-radius:
                    6px;

            }


            /* =================================================
               TABS
            ================================================= */

            .stage16-tabs {

                display:
                    flex;

                overflow-x:
                    auto;

                border-bottom:
                    1px solid #dddddd;

                background:
                    #ffffff;

            }


            .stage16-tab {

                flex:
                    1;

                min-width:
                    75px;

                padding:
                    10px 7px;

                border:
                    none;

                border-bottom:
                    3px solid transparent;

                background:
                    transparent;

                cursor:
                    pointer;

                font-size:
                    11px;

                font-weight:
                    bold;

                color:
                    #666666;

            }


            .stage16-tab:hover {

                background:
                    #f5f5f5;

            }


            .stage16-tab.active {

                color:
                    #1976d2;

                border-bottom-color:
                    #1976d2;

            }


            /* =================================================
               CONTENT
            ================================================= */

            .stage16-tab-content {

                padding:
                    13px;

                max-height:
                    calc(100vh - 170px);

                overflow-y:
                    auto;

            }


            .stage16-tab-content label {

                display:
                    block;

                margin:
                    5px 0 6px;

                font-size:
                    12px;

                font-weight:
                    bold;

                color:
                    #444444;

            }


            .stage16-tab-content input[type="text"],
            .stage16-tab-content select {

                box-sizing:
                    border-box;

                width:
                    100%;

                height:
                    38px;

                padding:
                    7px 9px;

                margin-bottom:
                    10px;

                border:
                    1px solid #c8c8c8;

                border-radius:
                    6px;

                background:
                    #ffffff;

                font-size:
                    12px;

            }


            .stage16-tab-content input[type="text"]:focus,
            .stage16-tab-content select:focus {

                outline:
                    none;

                border-color:
                    #1976d2;

                box-shadow:
                    0 0 0 2px
                    rgba(25,118,210,0.12);

            }


            /* =================================================
               PRIMARY BUTTON
            ================================================= */

            .stage16-primary {

                width:
                    100%;

                min-height:
                    38px;

                margin:
                    3px 0 10px;

                padding:
                    7px 12px;

                border:
                    1px solid #1976d2;

                border-radius:
                    6px;

                background:
                    #1976d2;

                color:
                    #ffffff;

                font-weight:
                    bold;

                cursor:
                    pointer;

            }


            .stage16-primary:hover {

                background:
                    #1565c0;

            }


            /* =================================================
               STATUS
            ================================================= */

            .stage16-status {

                min-height:
                    18px;

                margin:
                    0 0 8px;

                font-size:
                    11px;

                color:
                    #666666;

            }


            /* =================================================
               LAYER LIST
            ================================================= */

            .stage16-layer-list {

                display:
                    flex;

                flex-direction:
                    column;

                gap:
                    8px;

            }


            .stage16-layer-row {

                padding:
                    9px;

                border:
                    1px solid #dddddd;

                border-radius:
                    7px;

                background:
                    #fafafa;

            }


            .stage16-layer-top {

                display:
                    flex;

                align-items:
                    center;

                justify-content:
                    space-between;

                gap:
                    7px;

            }


            .stage16-layer-name {

                display:
                    flex !important;

                align-items:
                    center;

                gap:
                    6px;

                min-width:
                    0;

                flex:
                    1;

                margin:
                    0 !important;

            }


            .stage16-layer-name span {

                overflow:
                    hidden;

                text-overflow:
                    ellipsis;

                white-space:
                    nowrap;

            }


            .stage16-type {

                flex:
                    0 0 auto;

                padding:
                    3px 5px;

                border-radius:
                    4px;

                background:
                    #e5e5e5;

                font-size:
                    9px;

                font-weight:
                    bold;

                color:
                    #555555;

            }


            .stage16-layer-controls {

                display:
                    flex;

                align-items:
                    center;

                gap:
                    6px;

                margin-top:
                    8px;

            }


            .stage16-small {

                width:
                    32px;

                height:
                    30px;

                padding:
                    0;

                border:
                    1px solid #cccccc;

                border-radius:
                    5px;

                background:
                    #ffffff;

                cursor:
                    pointer;

            }


            .stage16-small:hover {

                background:
                    #eeeeee;

            }


            .stage16-delete:hover {

                color:
                    #c62828;

            }


            .stage16-opacity {

                flex:
                    1;

                min-width:
                    50px;

            }


            .stage16-opacity-value {

                width:
                    34px;

                text-align:
                    right;

                font-size:
                    10px;

                color:
                    #666666;

            }


            .stage16-empty {

                padding:
                    25px 10px;

                text-align:
                    center;

                color:
                    #888888;

                font-size:
                    12px;

            }


            /* =================================================
               FOOTER
            ================================================= */

            .stage16-footer {

                padding:
                    8px 12px;

                border-top:
                    1px solid #dddddd;

                background:
                    #fafafa;

                color:
                    #777777;

                font-size:
                    10px;

                text-align:
                    center;

            }


            /* =================================================
               MOBILE
            ================================================= */

            @media (
                max-width: ${CONFIG.mobileBreakpoint}px
            ) {

                #${CONFIG.panelId} {

                    top:
                        8px;

                    right:
                        8px;

                    width:
                        calc(100vw - 16px);

                    max-width:
                        none;

                    max-height:
                        calc(100vh - 16px);

                    border-radius:
                        9px;

                }


                .stage16-tab-content {

                    max-height:
                        calc(100vh - 150px);

                }


                .stage16-tab {

                    min-width:
                        70px;

                    font-size:
                        10px;

                }

            }

        `;


        document.head.appendChild(
            css
        );

    }


    // =========================================================
    // OBSERVE MAP LAYER CHANGES
    // =========================================================
    //
    // This is important because the QGIS2Web Layer Switcher
    // can change the active base map after Stage 16 has already
    // been loaded.
    //
    // Whenever the layer collection changes, Stage 16
    // recalculates its position.
    //
    // =========================================================

    function observeMapLayers() {

        try {

            map.getLayers().on(
                "add",
                function () {

                    setTimeout(
                        repositionAllExternalLayers,
                        50
                    );

                }
            );


            map.getLayers().on(
                "remove",
                function () {

                    setTimeout(
                        repositionAllExternalLayers,
                        50
                    );

                }
            );

        }
        catch (error) {

            console.warn(
                "Stage 16 layer observer unavailable.",
                error
            );

        }

    }


    // =========================================================
    // RESIZE
    // =========================================================

    window.addEventListener(
        "resize",
        function () {

            setTimeout(
                positionStage16Button,
                100
            );

        }
    );


    // =========================================================
    // ORIENTATION
    // =========================================================

    window.addEventListener(
        "orientationchange",
        function () {

            setTimeout(
                positionStage16Button,
                300
            );

        }
    );


    // =========================================================
    // INITIALIZE
    // =========================================================

    function initialize() {

        injectCSS();

        createMainButton();

        createPanel();


        // -----------------------------------------------------
        // Hide panel initially
        // -----------------------------------------------------

        panel.style.display =
            "none";


        // -----------------------------------------------------
        // Watch QGIS2Web layers
        // -----------------------------------------------------

        observeMapLayers();


        // -----------------------------------------------------
        // Restore saved XYZ maps
        // -----------------------------------------------------

        restoreExternalLayers();


        // -----------------------------------------------------
        // Position button
        // -----------------------------------------------------

        setTimeout(
            positionStage16Button,
            500
        );


        setTimeout(
            positionStage16Button,
            1500
        );


        console.log(
            "🌐 Stage 16 — External Base Map Services READY."
        );


        console.log(
            "🌐 Existing QGIS2Web base layers:",
            getExistingBaseLayers().length
        );


        console.log(
            "🌐 Existing vector/overlay layers:",
            getExistingOverlayLayers().length
        );

    }


    // =========================================================
    // START
    // =========================================================

    if (
        document.readyState ===
        "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            initialize
        );

    }
    else {

        initialize();

    }


})();
