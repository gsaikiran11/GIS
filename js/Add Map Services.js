// ============================================================
// 🌐 STAGE 16 — MAP SERVICES
// QGIS2WEB + OPENLAYERS
//
// SUPPORTS
// ------------------------------------------------------------
// ✔ WMS
// ✔ WMTS
// ✔ XYZ TILES
// ✔ WMS GetCapabilities
// ✔ WMTS GetCapabilities
// ✔ Layer selection
// ✔ Opacity control
// ✔ Visibility control
// ✔ Remove external layers
// ✔ External layer manager
// ✔ Save services in localStorage
// ✔ Restore saved services
// ✔ Mobile friendly
// ✔ Self-contained module
//
// IMPORTANT
// ------------------------------------------------------------
// This module uses the existing global OpenLayers "map" object.
//
// It does NOT modify your existing QGIS2Web layers.
// External layers are maintained separately.
//
// ============================================================

(function () {

    "use strict";

    // ========================================================
    // SAFETY CHECK
    // ========================================================

    if (
        typeof map === "undefined" ||
        !map ||
        typeof ol === "undefined"
    ) {

        console.error(
            "🌐 Stage 16: OpenLayers map was not found."
        );

        return;

    }


    // ========================================================
    // CONFIGURATION
    // ========================================================

    const CONFIG = {

        buttonId:
            "stage16-map-services-button",

        panelId:
            "stage16-map-services-panel",

        externalLayerZIndex:
            5000,

        storageKey:
            "stage16ExternalMapServices",

        defaultOpacity:
            1,

        snapWidth:
            256,

        snapHeight:
            256

    };


    // ========================================================
    // STATE
    // ========================================================

    let externalLayers = [];

    let serviceCounter = 0;


    // ========================================================
    // LOAD SAVED SERVICE INFORMATION
    // ========================================================

    let savedServices = [];

    try {

        const saved =
            localStorage.getItem(
                CONFIG.storageKey
            );

        if (saved) {

            savedServices =
                JSON.parse(saved);

        }

        if (!Array.isArray(savedServices)) {

            savedServices = [];

        }

    } catch (error) {

        console.warn(
            "Stage 16: Could not read saved services.",
            error
        );

        savedServices = [];

    }


    // ========================================================
    // CREATE MAIN BUTTON
    // ========================================================

    // =========================================================
// CREATE MAIN BUTTON — AUTO POSITION
// =========================================================

function createMainButton() {

    const button = document.createElement("button");

    button.id = CONFIG.buttonId;
    button.type = "button";
    button.title = "External Map Services";

    button.innerHTML = `
        <span style="
            display:flex;
            align-items:center;
            justify-content:center;
            width:100%;
            height:100%;
            font-size:22px;
        ">🌐</span>
    `;

    Object.assign(button.style, {

        position: "fixed",

        width: "46px",
        height: "46px",

        padding: "0",
        margin: "0",

        border: "1px solid rgba(0,0,0,0.25)",
        borderRadius: "8px",

        background: "#ffffff",
        color: "#222",

        boxShadow: "0 2px 8px rgba(0,0,0,0.25)",

        cursor: "pointer",

        zIndex: "10000",

        display: "flex",
        alignItems: "center",
        justifyContent: "center",

        transition: "all 0.15s ease"
    });


    // -----------------------------------------------------
    // HOVER
    // -----------------------------------------------------

    button.addEventListener("mouseenter", function () {

        button.style.transform = "scale(1.06)";
        button.style.boxShadow =
            "0 3px 10px rgba(0,0,0,0.30)";
    });


    button.addEventListener("mouseleave", function () {

        button.style.transform = "scale(1)";
        button.style.boxShadow =
            "0 2px 8px rgba(0,0,0,0.25)";
    });


    // -----------------------------------------------------
    // CLICK
    // -----------------------------------------------------

    button.addEventListener("click", function () {

        const panel =
            document.getElementById(CONFIG.panelId);

        if (!panel) return;

        const isVisible =
            panel.style.display !== "none";

        panel.style.display =
            isVisible ? "none" : "block";
    });


    document.body.appendChild(button);


    // -----------------------------------------------------
    // POSITION AFTER MAP/UI HAS LOADED
    // -----------------------------------------------------

    setTimeout(positionStage16Button, 300);
    setTimeout(positionStage16Button, 1000);
}

// =========================================================
// STAGE 16 — SMART BUTTON POSITIONING
// =========================================================
// Automatically finds a free position on the right side
// without overlapping existing map/tool buttons.
// =========================================================

function positionStage16Button() {

    const button =
        document.getElementById(CONFIG.buttonId);

    if (!button) return;


    const vw = window.innerWidth;
    const vh = window.innerHeight;


    // -----------------------------------------------------
    // BUTTON SIZE
    // -----------------------------------------------------

    const buttonWidth = 46;
    const buttonHeight = 46;

    const rightMargin =
        vw <= 650 ? 10 : 16;

    const gap = 8;


    // -----------------------------------------------------
    // FIND EXISTING RIGHT-SIDE CONTROLS
    // -----------------------------------------------------

    const occupied = [];


    const elements =
        document.querySelectorAll(
            "button, .ol-control, [role='button']"
        );


    elements.forEach(function (el) {

        if (!el) return;

        // Ignore Stage 16 itself
        if (
            el.id === CONFIG.buttonId ||
            el.id === CONFIG.panelId ||
            el.closest("#" + CONFIG.panelId)
        ) {
            return;
        }


        const style =
            window.getComputedStyle(el);

        if (
            style.display === "none" ||
            style.visibility === "hidden" ||
            style.opacity === "0"
        ) {
            return;
        }


        const rect =
            el.getBoundingClientRect();


        if (
            rect.width < 5 ||
            rect.height < 5
        ) {
            return;
        }


        // -------------------------------------------------
        // ONLY CONSIDER CONTROLS CLOSE TO RIGHT SIDE
        // -------------------------------------------------

        const nearRightSide =
            rect.right >= vw - 120 ||
            rect.left >= vw * 0.72;


        if (!nearRightSide) {
            return;
        }


        // Ignore elements outside viewport
        if (
            rect.bottom < 0 ||
            rect.top > vh
        ) {
            return;
        }


        occupied.push({

            left: rect.left,
            right: rect.right,

            top: rect.top,
            bottom: rect.bottom
        });

    });


    // -----------------------------------------------------
    // POSSIBLE POSITIONS
    // -----------------------------------------------------

    // Start from bottom and move upward.
    //
    // This means Stage 16 will normally remain near
    // the other tools, but automatically move upward
    // when the space is occupied.

    const candidateBottoms = [];


    let bottom = 15;


    while (bottom < vh - 60) {

        candidateBottoms.push(bottom);

        bottom += buttonHeight + gap;
    }


    // -----------------------------------------------------
    // CHECK EACH POSITION
    // -----------------------------------------------------

    let selectedBottom = 15;


    for (
        let i = 0;
        i < candidateBottoms.length;
        i++
    ) {

        const candidateBottom =
            candidateBottoms[i];


        const candidateTop =
            vh -
            candidateBottom -
            buttonHeight;


        const candidateLeft =
            vw -
            rightMargin -
            buttonWidth;


        const candidateRight =
            candidateLeft +
            buttonWidth;


        const candidateRect = {

            left:
                candidateLeft - gap,

            right:
                candidateRight + gap,

            top:
                candidateTop - gap,

            bottom:
                candidateTop +
                buttonHeight +
                gap
        };


        let overlaps = false;


        for (
            let j = 0;
            j < occupied.length;
            j++
        ) {

            const r = occupied[j];


            const horizontalOverlap =
                candidateRect.left < r.right &&
                candidateRect.right > r.left;


            const verticalOverlap =
                candidateRect.top < r.bottom &&
                candidateRect.bottom > r.top;


            if (
                horizontalOverlap &&
                verticalOverlap
            ) {

                overlaps = true;

                break;
            }
        }


        if (!overlaps) {

            selectedBottom =
                candidateBottom;

            break;
        }
    }


    // -----------------------------------------------------
    // APPLY POSITION
    // -----------------------------------------------------

    button.style.right =
        rightMargin + "px";

    button.style.bottom =
        selectedBottom + "px";

    button.style.left =
        "auto";

    button.style.top =
        "auto";
}

    // ========================================================
    // CREATE PANEL
    // ========================================================

    function createPanel() {

        removePanel();

        const panel =
            document.createElement(
                "div"
            );

        panel.id =
            CONFIG.panelId;

        panel.innerHTML = `

            <div class="stage16-header">

                <div class="stage16-title">
                    🌐 Map Services
                </div>

                <button
                    type="button"
                    id="stage16-close"
                    class="stage16-close"
                    title="Close">
                    ×
                </button>

            </div>


            <div class="stage16-tabs">

                <button
                    type="button"
                    class="stage16-tab active"
                    data-type="WMS">
                    WMS
                </button>

                <button
                    type="button"
                    class="stage16-tab"
                    data-type="WMTS">
                    WMTS
                </button>

                <button
                    type="button"
                    class="stage16-tab"
                    data-type="XYZ">
                    XYZ
                </button>

            </div>


            <div class="stage16-content">

                <div class="stage16-info"
                     id="stage16-info">

                    Add an external map service
                    to your map.

                </div>


                <div class="stage16-setting">

                    <label>
                        Service URL
                    </label>

                    <input
                        id="stage16-url"
                        type="text"
                        autocomplete="off"
                        placeholder="Enter WMS GetCapabilities URL">

                </div>


                <div
                    id="stage16-layer-container"
                    class="stage16-setting">

                    <label>
                        Available Layers
                    </label>

                    <select
                        id="stage16-layer-select">

                        <option value="">
                            Connect to service first
                        </option>

                    </select>

                </div>


                <div
                    id="stage16-xyz-container"
                    class="stage16-setting"
                    style="display:none;">

                    <div class="stage16-help">

                        XYZ URL example:

                        <br>

                        <code>
                            https://tile.openstreetmap.org/{z}/{x}/{y}.png
                        </code>

                    </div>

                </div>


                <div class="stage16-setting">

                    <label>
                        Layer Name
                    </label>

                    <input
                        id="stage16-layer-name"
                        type="text"
                        placeholder="Optional custom name">

                </div>


                <div class="stage16-setting">

                    <label>
                        Opacity
                    </label>

                    <div class="stage16-opacity-row">

                        <input
                            id="stage16-opacity"
                            type="range"
                            min="0"
                            max="100"
                            value="100">

                        <span
                            id="stage16-opacity-value">
                            100%
                        </span>

                    </div>

                </div>


                <div class="stage16-buttons">

                    <button
                        type="button"
                        id="stage16-connect"
                        class="stage16-primary">

                        🔍 Connect

                    </button>

                    <button
                        type="button"
                        id="stage16-add"
                        class="stage16-success">

                        ＋ Add to Map

                    </button>

                </div>


                <div
                    id="stage16-status"
                    class="stage16-status">
                </div>


                <div class="stage16-section-title">

                    Added Map Services

                </div>


                <div
                    id="stage16-layer-list"
                    class="stage16-layer-list">

                    <div class="stage16-empty">

                        No external layers added.

                    </div>

                </div>

            </div>

        `;

        document.body.appendChild(
            panel
        );


        // ====================================================
        // EVENTS
        // ====================================================

        document.getElementById(
            "stage16-close"
        ).addEventListener(
            "click",
            function () {

                hidePanel();

            }
        );


        const tabs =
            panel.querySelectorAll(
                ".stage16-tab"
            );

        tabs.forEach(
            function (tab) {

                tab.addEventListener(
                    "click",
                    function () {

                        switchServiceType(
                            tab.dataset.type
                        );

                    }
                );

            }
        );


        document.getElementById(
            "stage16-connect"
        ).addEventListener(
            "click",
            function () {

                connectToService();

            }
        );


        document.getElementById(
            "stage16-add"
        ).addEventListener(
            "click",
            function () {

                addServiceToMap();

            }
        );


        document.getElementById(
            "stage16-opacity"
        ).addEventListener(
            "input",
            function () {

                const value =
                    Number(
                        this.value
                    );

                document.getElementById(
                    "stage16-opacity-value"
                ).textContent =
                    value + "%";

            }
        );


        document.getElementById(
            "stage16-layer-select"
        ).addEventListener(
            "change",
            function () {

                const selected =
                    this.options[
                        this.selectedIndex
                    ];

                if (
                    selected &&
                    selected.dataset.title
                ) {

                    document.getElementById(
                        "stage16-layer-name"
                    ).value =
                        selected.dataset.title;

                }

            }
        );


        updateLayerList();

    }


    // ========================================================
    // REMOVE PANEL
    // ========================================================

    function removePanel() {

        const old =
            document.getElementById(
                CONFIG.panelId
            );

        if (old) {

            old.remove();

        }

    }


    // ========================================================
    // SHOW PANEL
    // ========================================================

    function showPanel() {

        let panel =
            document.getElementById(
                CONFIG.panelId
            );

        if (!panel) {

            createPanel();

            panel =
                document.getElementById(
                    CONFIG.panelId
                );

        }

        panel.style.display =
            "block";

    }


    // ========================================================
    // HIDE PANEL
    // ========================================================

    function hidePanel() {

        const panel =
            document.getElementById(
                CONFIG.panelId
            );

        if (panel) {

            panel.style.display =
                "none";

        }

    }


    // ========================================================
    // TOGGLE PANEL
    // ========================================================

    function togglePanel() {

        const panel =
            document.getElementById(
                CONFIG.panelId
            );

        if (
            panel &&
            panel.style.display !== "none"
        ) {

            hidePanel();

        } else {

            showPanel();

        }

    }


    // ========================================================
    // CURRENT SERVICE TYPE
    // ========================================================

    let currentServiceType =
        "WMS";


    // ========================================================
    // SWITCH SERVICE TYPE
    // ========================================================

    function switchServiceType(
        type
    ) {

        currentServiceType =
            type;

        const tabs =
            document.querySelectorAll(
                ".stage16-tab"
            );

        tabs.forEach(
            function (tab) {

                tab.classList.toggle(
                    "active",
                    tab.dataset.type === type
                );

            }
        );


        const urlInput =
            document.getElementById(
                "stage16-url"
            );

        const layerContainer =
            document.getElementById(
                "stage16-layer-container"
            );

        const xyzContainer =
            document.getElementById(
                "stage16-xyz-container"
            );

        const layerSelect =
            document.getElementById(
                "stage16-layer-select"
            );


        if (type === "XYZ") {

            urlInput.placeholder =
                "https://server/{z}/{x}/{y}.png";

            layerContainer.style.display =
                "none";

            xyzContainer.style.display =
                "block";

            layerSelect.innerHTML = `

                <option value="XYZ">

                    XYZ Tile Layer

                </option>

            `;

            setStatus(
                "Enter an XYZ tile URL and add it to the map.",
                "info"
            );

        }


        else if (type === "WMS") {

            urlInput.placeholder =
                "Enter WMS GetCapabilities URL";

            layerContainer.style.display =
                "block";

            xyzContainer.style.display =
                "none";

            layerSelect.innerHTML = `

                <option value="">

                    Connect to WMS first

                </option>

            `;

            setStatus(
                "",
                ""
            );

        }


        else if (type === "WMTS") {

            urlInput.placeholder =
                "Enter WMTS GetCapabilities URL";

            layerContainer.style.display =
                "block";

            xyzContainer.style.display =
                "none";

            layerSelect.innerHTML = `

                <option value="">

                    Connect to WMTS first

                </option>

            `;

            setStatus(
                "",
                ""
            );

        }

    }


    // ========================================================
    // NORMALIZE URL
    // ========================================================

    function normalizeCapabilitiesUrl(
        url,
        serviceType
    ) {

        url =
            String(url || "")
                .trim();

        if (!url) {

            return "";

        }

        if (
            serviceType === "XYZ"
        ) {

            return url;

        }


        if (
            /GetCapabilities/i.test(
                url
            )
        ) {

            return url;

        }


        const separator =
            url.indexOf("?") >= 0
                ? "&"
                : "?";


        if (
            serviceType === "WMS"
        ) {

            return (
                url +
                separator +
                "SERVICE=WMS&REQUEST=GetCapabilities"
            );

        }


        if (
            serviceType === "WMTS"
        ) {

            return (
                url +
                separator +
                "SERVICE=WMTS&REQUEST=GetCapabilities"
            );

        }


        return url;

    }


    // ========================================================
    // CONNECT TO SERVICE
    // ========================================================

    async function connectToService() {

        const urlInput =
            document.getElementById(
                "stage16-url"
            );

        if (!urlInput) {

            return;

        }

        const originalUrl =
            urlInput.value.trim();

        if (!originalUrl) {

            setStatus(
                "Please enter a service URL.",
                "error"
            );

            return;

        }


        if (
            currentServiceType === "XYZ"
        ) {

            validateXYZUrl(
                originalUrl
            );

            return;

        }


        setStatus(
            "Connecting to " +
            currentServiceType +
            " service...",
            "loading"
        );


        const capabilitiesUrl =
            normalizeCapabilitiesUrl(
                originalUrl,
                currentServiceType
            );


        try {

            const response =
                await fetch(
                    capabilitiesUrl
                );

            if (!response.ok) {

                throw new Error(
                    "HTTP " +
                    response.status
                );

            }

            const text =
                await response.text();


            if (!text) {

                throw new Error(
                    "Empty capabilities response."
                );

            }


            if (
                currentServiceType === "WMS"
            ) {

                parseWMSCapabilities(
                    text,
                    originalUrl
                );

            }

            else if (
                currentServiceType === "WMTS"
            ) {

                parseWMTSCapabilities(
                    text,
                    originalUrl
                );

            }

        } catch (error) {

            console.error(
                "Stage 16 service connection error:",
                error
            );

            setStatus(
                "Unable to load service capabilities. " +
                "The server may not allow browser CORS requests.",
                "error"
            );

        }

    }


    // ========================================================
    // VALIDATE XYZ URL
    // ========================================================

    function validateXYZUrl(
        url
    ) {

        if (
            !url.includes("{z}") ||
            !url.includes("{x}") ||
            !url.includes("{y}")
        ) {

            setStatus(
                "XYZ URL should normally contain {z}, {x} and {y}.",
                "error"
            );

            return;

        }


        document.getElementById(
            "stage16-layer-name"
        ).value =
            document.getElementById(
                "stage16-layer-name"
            ).value ||
            "XYZ Tiles";


        setStatus(
            "Valid XYZ tile URL detected.",
            "success"
        );

    }


    // ========================================================
    // XML PARSER
    // ========================================================

    function parseXML(
        text
    ) {

        const parser =
            new DOMParser();

        const xml =
            parser.parseFromString(
                text,
                "text/xml"
            );


        const parserError =
            xml.querySelector(
                "parsererror"
            );

        if (parserError) {

            throw new Error(
                "Invalid XML capabilities document."
            );

        }

        return xml;

    }


    // ========================================================
    // GET XML LOCAL NAME
    // ========================================================

    function localName(
        element
    ) {

        return (
            element.localName ||
            element.nodeName.split(":").pop()
        );

    }


    // ========================================================
    // GET CHILDREN BY LOCAL NAME
    // ========================================================

    function childrenByName(
        parent,
        name
    ) {

        if (!parent) {

            return [];

        }

        return Array.from(
            parent.children || []
        ).filter(
            function (child) {

                return (
                    localName(child).toLowerCase() ===
                    name.toLowerCase()
                );

            }
        );

    }


    // ========================================================
    // GET FIRST CHILD
    // ========================================================

    function firstChildByName(
        parent,
        name
    ) {

        const children =
            childrenByName(
                parent,
                name
            );

        return children.length
            ? children[0]
            : null;

    }


    // ========================================================
    // TEXT OF CHILD
    // ========================================================

    function childText(
        parent,
        name
    ) {

        const child =
            firstChildByName(
                parent,
                name
            );

        return child
            ? child.textContent.trim()
            : "";

    }


    // ========================================================
    // WMS CAPABILITIES
    // ========================================================

    function parseWMSCapabilities(
        text,
        originalUrl
    ) {

        let xml;

        try {

            xml =
                parseXML(
                    text
                );

        } catch (error) {

            setStatus(
                error.message,
                "error"
            );

            return;

        }


        const layers =
            [];


        // ----------------------------------------------------
        // Find all Layer elements
        // ----------------------------------------------------

        const allElements =
            Array.from(
                xml.getElementsByTagName("*")
            );


        allElements.forEach(
            function (element) {

                if (
                    localName(element).toLowerCase() !==
                    "layer"
                ) {

                    return;

                }


                const name =
                    childText(
                        element,
                        "Name"
                    );


                const title =
                    childText(
                        element,
                        "Title"
                    );


                if (!name) {

                    return;

                }


                layers.push({

                    name:
                        name,

                    title:
                        title ||
                        name,

                    abstract:
                        childText(
                            element,
                            "Abstract"
                        ),

                    serviceType:
                        "WMS",

                    url:
                        originalUrl

                });

            }
        );


        // Remove duplicates

        const uniqueLayers =
            [];


        const seen =
            new Set();


        layers.forEach(
            function (layer) {

                if (
                    !seen.has(
                        layer.name
                    )
                ) {

                    seen.add(
                        layer.name
                    );

                    uniqueLayers.push(
                        layer
                    );

                }

            }
        );


        if (!uniqueLayers.length) {

            setStatus(
                "WMS capabilities loaded, but no named layers were found.",
                "error"
            );

            return;

        }


        populateLayerSelect(
            uniqueLayers
        );


        setStatus(
            uniqueLayers.length +
            " WMS layer(s) found.",
            "success"
        );


        // Store capabilities information

        window.stage16WMSCapabilities =
            uniqueLayers;

    }


    // ========================================================
    // WMTS CAPABILITIES
    // ========================================================

    function parseWMTSCapabilities(
        text,
        originalUrl
    ) {

        let xml;

        try {

            xml =
                parseXML(
                    text
                );

        } catch (error) {

            setStatus(
                error.message,
                "error"
            );

            return;

        }


        const layers =
            [];


        const allElements =
            Array.from(
                xml.getElementsByTagName("*")
            );


        allElements.forEach(
            function (element) {

                if (
                    localName(element).toLowerCase() !==
                    "layer"
                ) {

                    return;

                }


                const identifierElement =
                    firstChildByName(
                        element,
                        "Identifier"
                    );


                if (!identifierElement) {

                    return;

                }


                const identifier =
                    identifierElement
                        .textContent
                        .trim();


                const title =
                    childText(
                        element,
                        "Title"
                    );


                const formatElements =
                    childrenByName(
                        element,
                        "Format"
                    );


                const formats =
                    formatElements.map(
                        function (format) {

                            return format
                                .textContent
                                .trim();

                        }
                    );


                const matrixLinks =
                    childrenByName(
                        element,
                        "TileMatrixSetLink"
                    );


                let matrixSet =
                    "";


                if (
                    matrixLinks.length
                ) {

                    matrixSet =
                        childText(
                            matrixLinks[0],
                            "TileMatrixSet"
                        );

                }


                layers.push({

                    name:
                        identifier,

                    title:
                        title ||
                        identifier,

                    formats:
                        formats,

                    matrixSet:
                        matrixSet,

                    serviceType:
                        "WMTS",

                    url:
                        originalUrl

                });

            }
        );


        const uniqueLayers =
            [];


        const seen =
            new Set();


        layers.forEach(
            function (layer) {

                if (
                    !seen.has(
                        layer.name
                    )
                ) {

                    seen.add(
                        layer.name
                    );

                    uniqueLayers.push(
                        layer
                    );

                }

            }
        );


        if (!uniqueLayers.length) {

            setStatus(
                "WMTS capabilities loaded, but no layers were found.",
                "error"
            );

            return;

        }


        populateLayerSelect(
            uniqueLayers
        );


        // Save complete capabilities XML
        // for the actual WMTS OpenLayers parser.

        window.stage16WMTSCapabilitiesXML =
            text;

        window.stage16WMTSCapabilities =
            uniqueLayers;

        window.stage16WMTSOriginalURL =
            originalUrl;


        setStatus(
            uniqueLayers.length +
            " WMTS layer(s) found.",
            "success"
        );

    }


    // ========================================================
    // POPULATE LAYER SELECT
    // ========================================================

    function populateLayerSelect(
        layers
    ) {

        const select =
            document.getElementById(
                "stage16-layer-select"
            );


        if (!select) {

            return;

        }


        select.innerHTML = "";


        layers.forEach(
            function (layer, index) {

                const option =
                    document.createElement(
                        "option"
                    );

                option.value =
                    layer.name;

                option.textContent =
                    layer.title +
                    " [" +
                    layer.name +
                    "]";


                option.dataset.title =
                    layer.title;


                option.dataset.serviceType =
                    layer.serviceType;


                option.dataset.index =
                    index;


                select.appendChild(
                    option
                );

            }
        );


        if (
            layers.length
        ) {

            select.selectedIndex =
                0;


            const selected =
                layers[0];


            document.getElementById(
                "stage16-layer-name"
            ).value =
                selected.title ||
                selected.name;

        }

    }


    // ========================================================
    // ADD SERVICE TO MAP
    // ========================================================

    async function addServiceToMap() {

        const url =
            document.getElementById(
                "stage16-url"
            ).value.trim();


        if (!url) {

            setStatus(
                "Please enter a service URL.",
                "error"
            );

            return;

        }


        const layerNameInput =
            document.getElementById(
                "stage16-layer-name"
            );


        const opacity =
            Number(
                document.getElementById(
                    "stage16-opacity"
                ).value
            ) / 100;


        let layerName =
            layerNameInput.value.trim();


        try {

            if (
                currentServiceType === "XYZ"
            ) {

                addXYZLayer(
                    url,
                    layerName,
                    opacity
                );

                return;

            }


            if (
                currentServiceType === "WMS"
            ) {

                addWMSLayer(
                    url,
                    layerName,
                    opacity
                );

                return;

            }


            if (
                currentServiceType === "WMTS"
            ) {

                await addWMTSLayer(
                    url,
                    layerName,
                    opacity
                );

                return;

            }

        } catch (error) {

            console.error(
                "Stage 16 add layer error:",
                error
            );

            setStatus(
                "Could not add layer: " +
                error.message,
                "error"
            );

        }

    }


    // ========================================================
    // CREATE EXTERNAL LAYER ID
    // ========================================================

    function createLayerId() {

        serviceCounter++;

        return (
            "stage16-external-" +
            Date.now() +
            "-" +
            serviceCounter
        );

    }


    // ========================================================
    // ADD XYZ
    // ========================================================

    function addXYZLayer(
        url,
        layerName,
        opacity
    ) {

        if (
            !url.includes("{z}") ||
            !url.includes("{x}") ||
            !url.includes("{y}")
        ) {

            setStatus(
                "Invalid XYZ URL. It should contain {z}, {x}, and {y}.",
                "error"
            );

            return;

        }


        if (!layerName) {

            layerName =
                "XYZ Tiles";

        }


        const source =
            new ol.source.XYZ({

                url:
                    url,

                crossOrigin:
                    "anonymous",

                tileSize:
                    [
                        CONFIG.snapWidth,
                        CONFIG.snapHeight
                    ],

                maxZoom:
                    22

            });


        const layer =
            new ol.layer.Tile({

                source:
                    source,

                opacity:
                    opacity,

                visible:
                    true

            });


        const id =
            createLayerId();


        layer.set(
            "stage16External",
            true
        );

        layer.set(
            "stage16Id",
            id
        );

        layer.set(
            "stage16Type",
            "XYZ"
        );

        layer.set(
            "stage16Name",
            layerName
        );

        layer.setZIndex(
            CONFIG.externalLayerZIndex
        );


        map.addLayer(
            layer
        );


        const record = {

            id:
                id,

            type:
                "XYZ",

            name:
                layerName,

            url:
                url,

            opacity:
                opacity,

            layer:
                layer

        };


        externalLayers.push(
            record
        );


        saveServices();

        updateLayerList();


        setStatus(
            "XYZ layer added successfully.",
            "success"
        );

    }


    // ========================================================
    // ADD WMS
    // ========================================================

    function addWMSLayer(
        url,
        layerName,
        opacity
    ) {

        const select =
            document.getElementById(
                "stage16-layer-select"
            );


        if (
            !select ||
            !select.value
        ) {

            setStatus(
                "Please connect to the WMS and select a layer.",
                "error"
            );

            return;

        }


        const layerNameFromSelect =
            select.value;


        const selectedOption =
            select.options[
                select.selectedIndex
            ];


        const displayName =
            layerName ||
            (
                selectedOption
                    ? selectedOption.dataset.title
                    : layerNameFromSelect
            );


        const serviceUrl =
            removeCapabilitiesParameters(
                url
            );


        const source =
            new ol.source.TileWMS({

                url:
                    serviceUrl,

                params: {

                    "LAYERS":
                        layerNameFromSelect,

                    "TILED":
                        true,

                    "VERSION":
                        "1.3.0"

                },

                serverType:
                    "geoserver",

                crossOrigin:
                    "anonymous",

                transition:
                    0

            });


        const layer =
            new ol.layer.Tile({

                source:
                    source,

                opacity:
                    opacity,

                visible:
                    true

            });


        const id =
            createLayerId();


        layer.set(
            "stage16External",
            true
        );

        layer.set(
            "stage16Id",
            id
        );

        layer.set(
            "stage16Type",
            "WMS"
        );

        layer.set(
            "stage16Name",
            displayName
        );

        layer.set(
            "stage16LayerName",
            layerNameFromSelect
        );

        layer.setZIndex(
            CONFIG.externalLayerZIndex
        );


        map.addLayer(
            layer
        );


        const record = {

            id:
                id,

            type:
                "WMS",

            name:
                displayName,

            layerName:
                layerNameFromSelect,

            url:
                serviceUrl,

            opacity:
                opacity,

            layer:
                layer

        };


        externalLayers.push(
            record
        );


        saveServices();

        updateLayerList();


        setStatus(
            "WMS layer added successfully.",
            "success"
        );

    }


    // ========================================================
    // ADD WMTS
    // ========================================================

    async function addWMTSLayer(
        url,
        layerName,
        opacity
    ) {

        const select =
            document.getElementById(
                "stage16-layer-select"
            );


        if (
            !select ||
            !select.value
        ) {

            setStatus(
                "Please connect to the WMTS and select a layer.",
                "error"
            );

            return;

        }


        const selectedIdentifier =
            select.value;


        const selectedOption =
            select.options[
                select.selectedIndex
            ];


        const displayName =
            layerName ||
            (
                selectedOption
                    ? selectedOption.dataset.title
                    : selectedIdentifier
            );


        const capabilitiesText =
            window.stage16WMTSCapabilitiesXML;


        if (!capabilitiesText) {

            setStatus(
                "WMTS capabilities are not loaded.",
                "error"
            );

            return;

        }


        // ----------------------------------------------------
        // Parse using OpenLayers WMTS parser
        // ----------------------------------------------------

        if (
            !ol.format ||
            !ol.format.WMTSCapabilities
        ) {

            setStatus(
                "Your OpenLayers build does not contain the WMTS capabilities parser.",
                "error"
            );

            return;

        }


        const parser =
            new ol.format.WMTSCapabilities();


        const capabilities =
            parser.read(
                capabilitiesText
            );


        // ----------------------------------------------------
        // Build WMTS options
        // ----------------------------------------------------

        let options;


        try {

            options =
                ol.source.WMTS.optionsFromCapabilities(
                    capabilities,
                    {

                        layer:
                            selectedIdentifier

                    }
                );

        } catch (error) {

            console.error(
                "WMTS options error:",
                error
            );

            setStatus(
                "Could not determine WMTS tile matrix settings.",
                "error"
            );

            return;

        }


        if (!options) {

            setStatus(
                "WMTS layer configuration could not be determined.",
                "error"
            );

            return;

        }


        // ----------------------------------------------------
        // Create WMTS source
        // ----------------------------------------------------

        options.crossOrigin =
            "anonymous";


        const source =
            new ol.source.WMTS(
                options
            );


        const layer =
            new ol.layer.Tile({

                source:
                    source,

                opacity:
                    opacity,

                visible:
                    true

            });


        const id =
            createLayerId();


        layer.set(
            "stage16External",
            true
        );

        layer.set(
            "stage16Id",
            id
        );

        layer.set(
            "stage16Type",
            "WMTS"
        );

        layer.set(
            "stage16Name",
            displayName
        );

        layer.set(
            "stage16LayerName",
            selectedIdentifier
        );

        layer.setZIndex(
            CONFIG.externalLayerZIndex
        );


        map.addLayer(
            layer
        );


        const record = {

            id:
                id,

            type:
                "WMTS",

            name:
                displayName,

            layerName:
                selectedIdentifier,

            url:
                removeCapabilitiesParameters(
                    url
                ),

            opacity:
                opacity,

            layer:
                layer

        };


        externalLayers.push(
            record
        );


        saveServices();

        updateLayerList();


        setStatus(
            "WMTS layer added successfully.",
            "success"
        );

    }


    // ========================================================
    // REMOVE GETCAPABILITIES PARAMETERS
    // ========================================================

    function removeCapabilitiesParameters(
        url
    ) {

        try {

            const parsed =
                new URL(
                    url,
                    window.location.href
                );


            const keys =
                Array.from(
                    parsed.searchParams.keys()
                );


            keys.forEach(
                function (key) {

                    const lower =
                        key.toLowerCase();

                    if (
                        lower === "service" ||
                        lower === "request" ||
                        lower === "version"
                    ) {

                        parsed.searchParams.delete(
                            key
                        );

                    }

                }
            );


            return parsed.toString();

        } catch (error) {

            return url
                .replace(
                    /[?&]SERVICE=[^&]*/ig,
                    ""
                )
                .replace(
                    /[?&]REQUEST=[^&]*/ig,
                    ""
                )
                .replace(
                    /[?&]VERSION=[^&]*/ig,
                    ""
                );

        }

    }


    // ========================================================
    // UPDATE EXTERNAL LAYER LIST
    // ========================================================

    function updateLayerList() {

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

                    No external layers added.

                </div>

            `;

            return;

        }


        externalLayers.forEach(
            function (record) {

                const item =
                    document.createElement(
                        "div"
                    );


                item.className =
                    "stage16-layer-item";


                const typeIcon =
                    record.type === "WMS"
                        ? "🛰️"
                        : record.type === "WMTS"
                            ? "🧩"
                            : "🗺️";


                item.innerHTML = `

                    <div class="stage16-layer-top">

                        <div
                            class="stage16-layer-name"
                            title="${escapeHTML(record.name)}">

                            ${typeIcon}
                            ${escapeHTML(record.name)}

                        </div>

                        <div
                            class="stage16-layer-type">

                            ${record.type}

                        </div>

                    </div>


                    <div class="stage16-layer-controls">

                        <button
                            type="button"
                            class="stage16-layer-action"
                            data-action="visibility"
                            title="Show / Hide">

                            ${record.layer.getVisible()
                                ? "👁"
                                : "🚫"}

                        </button>


                        <input
                            class="stage16-layer-opacity"
                            type="range"
                            min="0"
                            max="100"
                            value="${Math.round(
                                record.layer.getOpacity() * 100
                            )}"
                            title="Opacity">


                        <span
                            class="stage16-layer-opacity-value">

                            ${Math.round(
                                record.layer.getOpacity() * 100
                            )}%

                        </span>


                        <button
                            type="button"
                            class="stage16-layer-action stage16-delete"
                            data-action="remove"
                            title="Remove layer">

                            🗑

                        </button>

                    </div>

                `;


                // ------------------------------------------------
                // Visibility
                // ------------------------------------------------

                const visibilityButton =
                    item.querySelector(
                        '[data-action="visibility"]'
                    );


                visibilityButton.addEventListener(
                    "click",
                    function () {

                        const visible =
                            !record.layer.getVisible();


                        record.layer.setVisible(
                            visible
                        );


                        visibilityButton.textContent =
                            visible
                                ? "👁"
                                : "🚫";

                    }
                );


                // ------------------------------------------------
                // Opacity
                // ------------------------------------------------

                const opacitySlider =
                    item.querySelector(
                        ".stage16-layer-opacity"
                    );


                const opacityValue =
                    item.querySelector(
                        ".stage16-layer-opacity-value"
                    );


                opacitySlider.addEventListener(
                    "input",
                    function () {

                        const value =
                            Number(
                                this.value
                            );


                        const opacity =
                            value / 100;


                        record.layer.setOpacity(
                            opacity
                        );


                        opacityValue.textContent =
                            value + "%";


                        saveServices();

                    }
                );


                // ------------------------------------------------
                // Remove
                // ------------------------------------------------

                const removeButton =
                    item.querySelector(
                        '[data-action="remove"]'
                    );


                removeButton.addEventListener(
                    "click",
                    function () {

                        removeExternalLayer(
                            record.id
                        );

                    }
                );


                container.appendChild(
                    item
                );

            }
        );

    }


    // ========================================================
    // REMOVE EXTERNAL LAYER
    // ========================================================

    function removeExternalLayer(
        id
    ) {

        const index =
            externalLayers.findIndex(
                function (record) {

                    return record.id === id;

                }
            );


        if (
            index === -1
        ) {

            return;

        }


        const record =
            externalLayers[index];


        try {

            map.removeLayer(
                record.layer
            );

        } catch (error) {

            console.warn(
                "Could not remove external layer.",
                error
            );

        }


        externalLayers.splice(
            index,
            1
        );


        saveServices();

        updateLayerList();


        setStatus(
            "External layer removed.",
            "info"
        );

    }


    // ========================================================
    // SAVE SERVICES
    // ========================================================

    function saveServices() {

        try {

            const data =
                externalLayers.map(
                    function (record) {

                        return {

                            id:
                                record.id,

                            type:
                                record.type,

                            name:
                                record.name,

                            layerName:
                                record.layerName ||
                                "",

                            url:
                                record.url,

                            opacity:
                                record.layer
                                    .getOpacity(),

                            visible:
                                record.layer
                                    .getVisible()

                        };

                    }
                );


            localStorage.setItem(
                CONFIG.storageKey,
                JSON.stringify(data)
            );

        } catch (error) {

            console.warn(
                "Stage 16: Could not save services.",
                error
            );

        }

    }


    // ========================================================
    // RESTORE SAVED SERVICES
    //
    // IMPORTANT:
    // Saved services are restored only when they can
    // be reconstructed safely.
    // ========================================================

    async function restoreSavedServices() {

        if (
            !Array.isArray(
                savedServices
            )
        ) {

            return;

        }


        for (
            const service
            of savedServices
        ) {

            try {

                if (
                    service.type === "XYZ"
                ) {

                    restoreXYZ(
                        service
                    );

                }

                else if (
                    service.type === "WMS"
                ) {

                    restoreWMS(
                        service
                    );

                }

                else if (
                    service.type === "WMTS"
                ) {

                    await restoreWMTS(
                        service
                    );

                }

            } catch (error) {

                console.warn(
                    "Stage 16: Could not restore service:",
                    service,
                    error
                );

            }

        }


        updateLayerList();

    }


    // ========================================================
    // RESTORE XYZ
    // ========================================================

    function restoreXYZ(
        service
    ) {

        if (
            !service.url
        ) {

            return;

        }


        const source =
            new ol.source.XYZ({

                url:
                    service.url,

                crossOrigin:
                    "anonymous",

                maxZoom:
                    22

            });


        const layer =
            new ol.layer.Tile({

                source:
                    source,

                opacity:
                    service.opacity ??
                    1,

                visible:
                    service.visible !== false

            });


        const id =
            service.id ||
            createLayerId();


        layer.set(
            "stage16External",
            true
        );

        layer.set(
            "stage16Id",
            id
        );

        layer.set(
            "stage16Type",
            "XYZ"
        );

        layer.set(
            "stage16Name",
            service.name ||
            "XYZ Tiles"
        );


        layer.setZIndex(
            CONFIG.externalLayerZIndex
        );


        map.addLayer(
            layer
        );


        externalLayers.push({

            id:
                id,

            type:
                "XYZ",

            name:
                service.name ||
                "XYZ Tiles",

            url:
                service.url,

            opacity:
                service.opacity ??
                1,

            layer:
                layer

        });

    }


    // ========================================================
    // RESTORE WMS
    // ========================================================

    function restoreWMS(
        service
    ) {

        if (
            !service.url ||
            !service.layerName
        ) {

            return;

        }


        const source =
            new ol.source.TileWMS({

                url:
                    service.url,

                params: {

                    "LAYERS":
                        service.layerName,

                    "TILED":
                        true,

                    "VERSION":
                        "1.3.0"

                },

                serverType:
                    "geoserver",

                crossOrigin:
                    "anonymous",

                transition:
                    0

            });


        const layer =
            new ol.layer.Tile({

                source:
                    source,

                opacity:
                    service.opacity ??
                    1,

                visible:
                    service.visible !== false

            });


        const id =
            service.id ||
            createLayerId();


        layer.set(
            "stage16External",
            true
        );

        layer.set(
            "stage16Id",
            id
        );

        layer.set(
            "stage16Type",
            "WMS"
        );

        layer.set(
            "stage16Name",
            service.name ||
            service.layerName
        );

        layer.set(
            "stage16LayerName",
            service.layerName
        );


        layer.setZIndex(
            CONFIG.externalLayerZIndex
        );


        map.addLayer(
            layer
        );


        externalLayers.push({

            id:
                id,

            type:
                "WMS",

            name:
                service.name ||
                service.layerName,

            layerName:
                service.layerName,

            url:
                service.url,

            opacity:
                service.opacity ??
                1,

            layer:
                layer

        });

    }


    // ========================================================
    // RESTORE WMTS
    // ========================================================

    async function restoreWMTS(
        service
    ) {

        if (
            !service.url ||
            !service.layerName
        ) {

            return;

        }


        if (
            !ol.format ||
            !ol.format.WMTSCapabilities
        ) {

            return;

        }


        const capabilitiesUrl =
            normalizeCapabilitiesUrl(
                service.url,
                "WMTS"
            );


        const response =
            await fetch(
                capabilitiesUrl
            );


        if (!response.ok) {

            return;

        }


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
                            service.layerName

                    }
                );


        if (!options) {

            return;

        }


        options.crossOrigin =
            "anonymous";


        const source =
            new ol.source.WMTS(
                options
            );


        const layer =
            new ol.layer.Tile({

                source:
                    source,

                opacity:
                    service.opacity ??
                    1,

                visible:
                    service.visible !== false

            });


        const id =
            service.id ||
            createLayerId();


        layer.set(
            "stage16External",
            true
        );

        layer.set(
            "stage16Id",
            id
        );

        layer.set(
            "stage16Type",
            "WMTS"
        );

        layer.set(
            "stage16Name",
            service.name ||
            service.layerName
        );

        layer.set(
            "stage16LayerName",
            service.layerName
        );


        layer.setZIndex(
            CONFIG.externalLayerZIndex
        );


        map.addLayer(
            layer
        );


        externalLayers.push({

            id:
                id,

            type:
                "WMTS",

            name:
                service.name ||
                service.layerName,

            layerName:
                service.layerName,

            url:
                service.url,

            opacity:
                service.opacity ??
                1,

            layer:
                layer

        });

    }


    // ========================================================
    // STATUS MESSAGE
    // ========================================================

    function setStatus(
        message,
        type
    ) {

        const status =
            document.getElementById(
                "stage16-status"
            );


        if (!status) {

            return;

        }


        status.textContent =
            message || "";


        status.className =
            "stage16-status";


        if (type) {

            status.classList.add(
                "stage16-status-" +
                type
            );

        }

    }


    // ========================================================
    // ESCAPE HTML
    // ========================================================

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


    // ========================================================
    // CSS
    // ========================================================

    function injectCSS() {

        const style =
            document.createElement(
                "style"
            );


        style.id =
            "stage16-map-services-css";


        style.textContent = `

            /* ==================================================
               MAIN BUTTON
            ================================================== */

            #stage16-map-services-button {

                position: fixed;

                right: 16px;

                bottom: 165px;

                width: 46px;

                height: 46px;

                border: 1px solid #777;

                border-radius: 8px;

                background: #ffffff;

                box-shadow:
                    0 2px 8px
                    rgba(0,0,0,0.30);

                cursor: pointer;

                z-index: 30000;

                font-size: 23px;

                display: flex;

                align-items: center;

                justify-content: center;

                padding: 0;

                transition:
                    transform 0.15s ease,
                    background 0.15s ease;

            }


            #stage16-map-services-button:hover {

                background: #f2f2f2;

                transform:
                    translateY(-1px);

            }


            /* ==================================================
               PANEL
            ================================================== */

            #stage16-map-services-panel {

                position: fixed;

                top: 90px;

                right: 20px;

                width: 370px;

                max-width:
                    calc(100vw - 30px);

                max-height:
                    calc(100vh - 120px);

                overflow-y: auto;

                background: #ffffff;

                border:
                    1px solid #999;

                border-radius: 12px;

                box-shadow:
                    0 8px 30px
                    rgba(0,0,0,0.35);

                z-index: 30001;

                font-family:
                    Arial,
                    sans-serif;

                font-size: 13px;

                box-sizing: border-box;

            }


            /* ==================================================
               HEADER
            ================================================== */

            .stage16-header {

                display: flex;

                align-items: center;

                justify-content:
                    space-between;

                padding:
                    12px 14px;

                border-bottom:
                    1px solid #ddd;

                background:
                    #f7f7f7;

                border-radius:
                    12px 12px 0 0;

            }


            .stage16-title {

                font-size: 17px;

                font-weight: bold;

            }


            .stage16-close {

                width: 30px;

                height: 30px;

                border: none;

                background: transparent;

                cursor: pointer;

                font-size: 24px;

                line-height: 1;

                color: #555;

            }


            .stage16-close:hover {

                color: #000000;

            }


            /* ==================================================
               TABS
            ================================================== */

            .stage16-tabs {

                display: flex;

                padding:
                    10px 10px 0 10px;

                gap: 5px;

                border-bottom:
                    1px solid #ddd;

            }


            .stage16-tab {

                flex: 1;

                border:
                    1px solid #ccc;

                border-bottom:
                    none;

                border-radius:
                    6px 6px 0 0;

                padding:
                    9px 5px;

                background:
                    #eeeeee;

                cursor: pointer;

                font-weight:
                    bold;

            }


            .stage16-tab.active {

                background:
                    #ffffff;

                color:
                    #1565c0;

                border-color:
                    #1565c0;

            }


            /* ==================================================
               CONTENT
            ================================================== */

            .stage16-content {

                padding:
                    13px;

            }


            .stage16-info {

                background:
                    #f3f6f9;

                border:
                    1px solid #d8dde2;

                border-radius:
                    6px;

                padding:
                    8px 9px;

                margin-bottom:
                    11px;

                line-height:
                    1.45;

            }


            /* ==================================================
               SETTINGS
            ================================================== */

            .stage16-setting {

                margin-bottom:
                    11px;

            }


            .stage16-setting label {

                display:
                    block;

                margin-bottom:
                    5px;

                font-weight:
                    bold;

            }


            .stage16-setting input[type="text"],
            .stage16-setting select {

                width:
                    100%;

                box-sizing:
                    border-box;

                padding:
                    9px;

                border:
                    1px solid #aaa;

                border-radius:
                    6px;

                background:
                    #ffffff;

                font-size:
                    13px;

            }


            .stage16-setting input[type="text"]:focus,
            .stage16-setting select:focus {

                outline:
                    none;

                border-color:
                    #1976d2;

                box-shadow:
                    0 0 0 2px
                    rgba(25,118,210,0.12);

            }


            /* ==================================================
               HELP
            ================================================== */

            .stage16-help {

                padding:
                    8px;

                background:
                    #fafafa;

                border:
                    1px solid #ddd;

                border-radius:
                    6px;

                color:
                    #555;

                line-height:
                    1.5;

            }


            .stage16-help code {

                display:
                    block;

                margin-top:
                    5px;

                padding:
                    5px;

                background:
                    #eeeeee;

                border-radius:
                    4px;

                word-break:
                    break-all;

                font-size:
                    11px;

            }


            /* ==================================================
               OPACITY
            ================================================== */

            .stage16-opacity-row {

                display:
                    flex;

                align-items:
                    center;

                gap:
                    9px;

            }


            .stage16-opacity-row input {

                flex:
                    1;

            }


            #stage16-opacity-value {

                width:
                    42px;

                text-align:
                    right;

                font-weight:
                    bold;

            }


            /* ==================================================
               BUTTONS
            ================================================== */

            .stage16-buttons {

                display:
                    flex;

                gap:
                    7px;

                margin-top:
                    13px;

                margin-bottom:
                    10px;

            }


            .stage16-buttons button {

                flex:
                    1;

                padding:
                    10px 7px;

                border:
                    1px solid #999;

                border-radius:
                    6px;

                cursor:
                    pointer;

                font-weight:
                    bold;

                background:
                    #f5f5f5;

            }


            .stage16-buttons button:hover {

                background:
                    #eaeaea;

            }


            .stage16-primary {

                color:
                    #1565c0;

            }


            .stage16-success {

                color:
                    #087f23;

            }


            /* ==================================================
               STATUS
            ================================================== */

            .stage16-status {

                min-height:
                    18px;

                margin:
                    6px 0 12px 0;

                padding:
                    7px 8px;

                border-radius:
                    5px;

                line-height:
                    1.35;

            }


            .stage16-status-info {

                background:
                    #eef5ff;

                color:
                    #14539a;

            }


            .stage16-status-success {

                background:
                    #edf8ef;

                color:
                    #176b2c;

            }


            .stage16-status-error {

                background:
                    #fff0f0;

                color:
                    #a32020;

            }


            .stage16-status-loading {

                background:
                    #fff8e8;

                color:
                    #815d00;

            }


            /* ==================================================
               SECTION TITLE
            ================================================== */

            .stage16-section-title {

                font-weight:
                    bold;

                font-size:
                    14px;

                padding-top:
                    9px;

                margin-bottom:
                    8px;

                border-top:
                    1px solid #ddd;

            }


            /* ==================================================
               LAYER LIST
            ================================================== */

            .stage16-layer-list {

                display:
                    flex;

                flex-direction:
                    column;

                gap:
                    7px;

            }


            .stage16-empty {

                padding:
                    12px;

                text-align:
                    center;

                color:
                    #777;

                background:
                    #f8f8f8;

                border:
                    1px dashed #ccc;

                border-radius:
                    6px;

            }


            .stage16-layer-item {

                border:
                    1px solid #d0d0d0;

                border-radius:
                    7px;

                padding:
                    8px;

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

                margin-bottom:
                    7px;

            }


            .stage16-layer-name {

                font-weight:
                    bold;

                overflow:
                    hidden;

                text-overflow:
                    ellipsis;

                white-space:
                    nowrap;

            }


            .stage16-layer-type {

                font-size:
                    10px;

                padding:
                    3px 5px;

                border-radius:
                    4px;

                background:
                    #e5e5e5;

                color:
                    #555;

                flex-shrink:
                    0;

            }


            .stage16-layer-controls {

                display:
                    flex;

                align-items:
                    center;

                gap:
                    6px;

            }


            .stage16-layer-opacity {

                flex:
                    1;

                min-width:
                    50px;

            }


            .stage16-layer-opacity-value {

                width:
                    35px;

                text-align:
                    right;

                font-size:
                    11px;

            }


            .stage16-layer-action {

                width:
                    31px;

                height:
                    29px;

                border:
                    1px solid #bbb;

                border-radius:
                    5px;

                background:
                    #ffffff;

                cursor:
                    pointer;

                padding:
                    0;

            }


            .stage16-layer-action:hover {

                background:
                    #eeeeee;

            }


            .stage16-delete {

                color:
                    #c62828;

            }


            /* ==================================================
               MOBILE
            ================================================== */

            @media (
                max-width: 600px
            ) {

                #stage16-map-services-button {

                    right:
                        10px;

                    bottom:
                        170px;

                    width:
                        46px;

                    height:
                        46px;

                }


                #stage16-map-services-panel {

                    top:
                        70px;

                    right:
                        10px;

                    width:
                        calc(100vw - 20px);

                    max-height:
                        calc(100vh - 90px);

                }


                .stage16-content {

                    padding:
                        11px;

                }


                .stage16-buttons button {

                    min-height:
                        42px;

                }

            }

        `;


        document.head.appendChild(
            style
        );

    }


    // ========================================================
    // INITIALIZE
    // ========================================================

    function initialize() {

        injectCSS();

        createMainButton();

        createPanel();

        hidePanel();

        // Restore previously added services.
        //
        // Delay slightly so that the QGIS2Web map
        // has completed its initialization.

        setTimeout(
            function () {

                restoreSavedServices();

            },
            1000
        );

        console.log(
            "🌐 Stage 16 — Map Services READY."
        );

    }


    // ========================================================
    // PUBLIC API
    // ========================================================

    window.Stage16MapServices = {

        show:
            showPanel,

        hide:
            hidePanel,

        toggle:
            togglePanel,

        addXYZ:
            addXYZLayer,

        addWMS:
            addWMSLayer,

        addWMTS:
            addWMTSLayer,

        remove:
            removeExternalLayer,

        getLayers:
            function () {

                return externalLayers;

            }

    };


    // ========================================================
    // START
    // ========================================================

    initialize();


})();