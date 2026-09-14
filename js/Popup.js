// ============================================================
// 📋 STAGE 5 — FEATURE INFORMATION POPUP
// OpenLayers 10.x
//
// Features:
// ✔ Dynamic vectorLayers[] support
// ✔ Feature information
// ✔ Zoom
// ✔ Copy
// ✔ Close
// ✔ Mobile friendly
// ✔ Stage 14 Measure Tool protection
// ✔ Parcel Subdivision Tool protection
// ✔ Measurement layers excluded
// ✔ Snap layers excluded
// ✔ Popup completely disabled during Parcel Subdivision
// ============================================================

(function () {

    "use strict";

    console.log(
        "📋 Starting Stage 5 popup..."
    );


    // ========================================================
    // POPUP HTML
    // ========================================================

    const popupElement =
        document.createElement("div");


    popupElement.id =
        "feature-info-popup";


    popupElement.innerHTML = `

        <div class="feature-popup-header">

            <span id="feature-popup-title">
                📋 Feature Information
            </span>

            <button
                type="button"
                id="feature-popup-close">
                ×
            </button>

        </div>


        <div
            id="feature-popup-layer"
            class="feature-popup-layer">
        </div>


        <div
            id="feature-popup-content"
            class="feature-popup-content">
        </div>


        <div class="feature-popup-buttons">

            <button
                type="button"
                id="feature-popup-zoom">
                🔍 Zoom
            </button>


            <button
                type="button"
                id="feature-popup-copy">
                📋 Copy
            </button>

        </div>

    `;


    document.body.appendChild(
        popupElement
    );


    // ========================================================
    // POPUP CSS
    // ========================================================

    const popupCSS =
        document.createElement("style");


    popupCSS.textContent = `

        /* ================================================
           MAIN POPUP
        ================================================ */

        #feature-info-popup {

            position:
                absolute !important;

            display:
                none;

            z-index:
                20000 !important;

            width:
                350px;

            max-width:
                calc(100vw - 30px);

            background:
                #ffffff;

            border:
                1px solid #888;

            border-radius:
                10px;

            box-shadow:
                0 4px 20px
                rgba(0,0,0,0.35);

            font-family:
                Arial, sans-serif;

            font-size:
                13px;

            color:
                #222;

            overflow:
                hidden;

            box-sizing:
                border-box;

        }


        /* ================================================
           🚫 PARCEL SUBDIVISION ACTIVE
        ================================================ */

        body.parcel-subdivision-active
        #feature-info-popup {

            display:
                none !important;

            visibility:
                hidden !important;

            pointer-events:
                none !important;

        }


        /* ================================================
           HEADER
        ================================================ */

        .feature-popup-header {

            display:
                flex;

            align-items:
                center;

            justify-content:
                space-between;

            padding:
                10px 12px;

            background:
                #f3f3f3;

            border-bottom:
                1px solid #ddd;

            font-size:
                16px;

            font-weight:
                bold;

        }


        /* ================================================
           CLOSE BUTTON
        ================================================ */

        #feature-popup-close {

            width:
                30px;

            height:
                30px;

            border:
                none;

            background:
                transparent;

            font-size:
                22px;

            cursor:
                pointer;

            border-radius:
                5px;

        }


        #feature-popup-close:hover {

            background:
                #dddddd;

        }


        /* ================================================
           LAYER NAME
        ================================================ */

        .feature-popup-layer {

            padding:
                8px 12px;

            font-weight:
                bold;

            color:
                #555;

            border-bottom:
                1px solid #eeeeee;

        }


        /* ================================================
           CONTENT
        ================================================ */

        .feature-popup-content {

            max-height:
                350px;

            overflow-y:
                auto;

            padding:
                8px 10px;

        }


        /* ================================================
           ATTRIBUTE ROW
        ================================================ */

        .feature-popup-row {

            display:
                grid;

            grid-template-columns:
                42% 58%;

            border-bottom:
                1px solid #eeeeee;

            padding:
                7px 2px;

            line-height:
                1.3;

        }


        .feature-popup-field {

            font-weight:
                bold;

            color:
                #444;

            padding-right:
                8px;

            word-break:
                break-word;

        }


        .feature-popup-value {

            color:
                #111;

            word-break:
                break-word;

        }


        /* ================================================
           BUTTONS
        ================================================ */

        .feature-popup-buttons {

            display:
                flex;

            gap:
                8px;

            padding:
                10px;

            border-top:
                1px solid #ddd;

            background:
                #fafafa;

        }


        .feature-popup-buttons button {

            flex:
                1;

            padding:
                8px;

            border:
                1px solid #aaa;

            border-radius:
                5px;

            background:
                #f5f5f5;

            cursor:
                pointer;

            font-size:
                13px;

        }


        .feature-popup-buttons button:hover {

            background:
                #dddddd;

        }


        /* ================================================
           MOBILE
        ================================================ */

        @media (max-width: 600px) {

            #feature-info-popup {

                width:
                    calc(100vw - 20px);

                max-width:
                    calc(100vw - 20px);

            }


            .feature-popup-content {

                max-height:
                    300px;

            }

        }

    `;


    document.head.appendChild(
        popupCSS
    );


    // ========================================================
    // OPENLAYERS OVERLAY
    // ========================================================

    const featurePopupOverlay =
        new ol.Overlay({

            element:
                popupElement,

            autoPan:
                true,

            autoPanAnimation: {

                duration:
                    250

            },

            positioning:
                "bottom-center",

            offset:
                [0, -15],

            stopEvent:
                true

        });


    map.addOverlay(
        featurePopupOverlay
    );


    console.log(
        "📋 Popup overlay added to map."
    );


    // ========================================================
    // VARIABLES
    // ========================================================

    let selectedFeature =
        null;


    let selectedLayer =
        null;


    // ========================================================
    // GET LAYER NAME
    // ========================================================

    function getLayerName(
        layer
    ) {

        if (
            !layer
        ) {

            return "Unknown Layer";

        }


        return (

            layer.get("title") ||

            layer.get("name") ||

            layer.get("layerName") ||

            "Unnamed Layer"

        );

    }


    // ========================================================
    // CLEAN FIELD NAME
    // ========================================================

    function cleanFieldName(
        name
    ) {

        return String(name)

            .replace(
                /_/g,
                " "
            )

            .replace(
                /\b\w/g,
                function (letter) {

                    return letter.toUpperCase();

                }
            );

    }


    // ========================================================
    // FORMAT VALUE
    // ========================================================

    function formatValue(
        value
    ) {

        if (
            value === null ||
            value === undefined
        ) {

            return "";

        }


        if (
            typeof value ===
            "object"
        ) {

            try {

                return JSON.stringify(
                    value
                );

            } catch (
                error
            ) {

                return String(
                    value
                );

            }

        }


        return String(
            value
        );

    }


    // ========================================================
    // IGNORE TECHNICAL FIELDS
    // ========================================================

    function isTechnicalField(
        key
    ) {

        const ignoredFields = [

            "geometry",

            "layerObject",

            "idO",

            "bbox",

            "style",

            "styleUrl"

        ];


        return ignoredFields.includes(
            key
        );

    }


    // ========================================================
    // CLOSE POPUP
    // ========================================================

    function closeFeaturePopup() {

        popupElement.style.display =
            "none";


        popupElement.style.visibility =
            "hidden";


        featurePopupOverlay.setPosition(
            undefined
        );


        selectedFeature =
            null;


        selectedLayer =
            null;


        console.log(
            "📋 Popup closed."
        );

    }


    // ========================================================
    // EXPOSE CLOSE FUNCTION
    // ========================================================

    window.closeFeaturePopup =
        closeFeaturePopup;


    // ========================================================
    // SHOW POPUP
    // ========================================================

    function showFeaturePopup(
        feature,
        layer,
        coordinate
    ) {

        // ====================================================
        // 🚫 PARCEL SUBDIVISION PROTECTION
        // ====================================================

        if (
            window.parcelSubdivisionToolActive ===
            true
        ) {

            console.log(
                "📐 Parcel Subdivision active — popup prevented."
            );


            closeFeaturePopup();


            return;

        }


        // ====================================================
        // 🚫 STAGE 14 MEASURE PROTECTION
        // ====================================================

        if (
            window.stage14MeasureActive ===
            true
        ) {

            console.log(
                "📐 Measure active — popup prevented."
            );


            closeFeaturePopup();


            return;

        }


        if (
            !feature
        ) {

            return;

        }


        selectedFeature =
            feature;


        selectedLayer =
            layer;


        // ----------------------------------------------------
        // LAYER NAME
        // ----------------------------------------------------

        const layerElement =
            document.getElementById(
                "feature-popup-layer"
            );


        layerElement.textContent =
            "Layer: " +
            getLayerName(
                layer
            );


        // ----------------------------------------------------
        // CONTENT
        // ----------------------------------------------------

        const contentElement =
            document.getElementById(
                "feature-popup-content"
            );


        contentElement.innerHTML =
            "";


        const properties =
            feature.getProperties();


        const keys =
            Object.keys(
                properties
            );


        let attributeCount =
            0;


        keys.forEach(
            function (key) {

                if (
                    isTechnicalField(
                        key
                    )
                ) {

                    return;

                }


                attributeCount++;


                const row =
                    document.createElement(
                        "div"
                    );


                row.className =
                    "feature-popup-row";


                const fieldElement =
                    document.createElement(
                        "div"
                    );


                fieldElement.className =
                    "feature-popup-field";


                fieldElement.textContent =
                    cleanFieldName(
                        key
                    );


                const valueElement =
                    document.createElement(
                        "div"
                    );


                valueElement.className =
                    "feature-popup-value";


                valueElement.textContent =
                    formatValue(
                        properties[key]
                    );


                row.appendChild(
                    fieldElement
                );


                row.appendChild(
                    valueElement
                );


                contentElement.appendChild(
                    row
                );

            }
        );


        // ----------------------------------------------------
        // NO ATTRIBUTES
        // ----------------------------------------------------

        if (
            attributeCount ===
            0
        ) {

            contentElement.innerHTML = `

                <div style="
                    padding:15px;
                    text-align:center;
                    color:#777;
                ">

                    No attributes available.

                </div>

            `;

        }


        // ----------------------------------------------------
        // SHOW
        // ----------------------------------------------------

        // Double check before displaying.
        if (
            window.parcelSubdivisionToolActive ===
            true
        ) {

            closeFeaturePopup();

            return;

        }


        popupElement.style.visibility =
            "visible";


        popupElement.style.display =
            "block";


        featurePopupOverlay.setPosition(
            coordinate
        );


        console.log(
            "📋 Popup opened:",
            getLayerName(layer),
            properties
        );

    }


    // ========================================================
    // MAP CLICK
    // ========================================================

    map.on(
        "singleclick",
        function (event) {

            // =================================================
            // 🚫 PARCEL SUBDIVISION PROTECTION
            //
            // THIS MUST COME FIRST.
            // =================================================

            if (
                window.parcelSubdivisionToolActive ===
                true
            ) {

                console.log(
                    "📐 Parcel Subdivision active — popup click ignored."
                );


                closeFeaturePopup();


                return;

            }


            // =================================================
            // 🚫 STAGE 14 MEASURE PROTECTION
            // =================================================

            if (
                window.stage14MeasureActive ===
                true
            ) {

                console.log(
                    "📐 Measure active — popup click ignored."
                );


                closeFeaturePopup();


                return;

            }


            console.log(
                "🖱 Map clicked:",
                event.coordinate
            );


            let clickedFeature =
                null;


            let clickedLayer =
                null;


            // =================================================
            // FIND FEATURE
            // =================================================

            map.forEachFeatureAtPixel(

                event.pixel,

                function (
                    feature,
                    layer
                ) {

                    // -----------------------------------------
                    // Only vector layers
                    // -----------------------------------------

                    if (
                        !(
                            layer instanceof
                            ol.layer.Vector
                        )
                    ) {

                        return false;

                    }


                    // -----------------------------------------
                    // NEVER SELECT MEASURE LAYER
                    // -----------------------------------------

                    if (
                        layer ===
                        window.stage14MeasureLayer
                    ) {

                        return false;

                    }


                    // -----------------------------------------
                    // NEVER SELECT SNAP LAYER
                    // -----------------------------------------

                    if (
                        layer ===
                        window.stage14SnapLayer
                    ) {

                        return false;

                    }


                    // -----------------------------------------
                    // NEVER SELECT SUBDIVISION RESULT
                    // -----------------------------------------

                    if (
                        layer ===
                        window.parcelSubdivisionResultLayer
                    ) {

                        return false;

                    }


                    // -----------------------------------------
                    // NEVER SELECT SUBDIVISION DIMENSIONS
                    // -----------------------------------------

                    if (
                        layer ===
                        window.parcelSubdivisionDimensionLayer
                    ) {

                        return false;

                    }


                    clickedFeature =
                        feature;


                    clickedLayer =
                        layer;


                    return true;

                },

                {

                    hitTolerance:
                        8,


                    layerFilter:
                        function (
                            layer
                        ) {

                            // ---------------------------------
                            // Vector only
                            // ---------------------------------

                            if (
                                !(
                                    layer instanceof
                                    ol.layer.Vector
                                )
                            ) {

                                return false;

                            }


                            // ---------------------------------
                            // Visible only
                            // ---------------------------------

                            if (
                                !layer.getVisible()
                            ) {

                                return false;

                            }


                            // ---------------------------------
                            // Exclude measure layer
                            // ---------------------------------

                            if (
                                layer ===
                                window.stage14MeasureLayer
                            ) {

                                return false;

                            }


                            // ---------------------------------
                            // Exclude snap layer
                            // ---------------------------------

                            if (
                                layer ===
                                window.stage14SnapLayer
                            ) {

                                return false;

                            }


                            // ---------------------------------
                            // Exclude subdivision result
                            // ---------------------------------

                            if (
                                layer ===
                                window.parcelSubdivisionResultLayer
                            ) {

                                return false;

                            }


                            // ---------------------------------
                            // Exclude subdivision dimensions
                            // ---------------------------------

                            if (
                                layer ===
                                window.parcelSubdivisionDimensionLayer
                            ) {

                                return false;

                            }


                            return true;

                        }

                }

            );


            // =================================================
            // NO FEATURE
            // =================================================

            if (
                !clickedFeature
            ) {

                console.log(
                    "No vector feature at clicked location."
                );


                closeFeaturePopup();


                return;

            }


            // =================================================
            // SHOW POPUP
            // =================================================

            showFeaturePopup(

                clickedFeature,

                clickedLayer,

                event.coordinate

            );

        }
    );


    // ========================================================
    // CLOSE BUTTON
    // ========================================================

    document
        .getElementById(
            "feature-popup-close"
        )
        .addEventListener(
            "click",
            function (event) {

                event.preventDefault();

                event.stopPropagation();


                closeFeaturePopup();

            }
        );


    // ========================================================
    // ZOOM BUTTON
    // ========================================================

    document
        .getElementById(
            "feature-popup-zoom"
        )
        .addEventListener(
            "click",
            function (event) {

                event.preventDefault();

                event.stopPropagation();


                if (
                    !selectedFeature
                ) {

                    return;

                }


                const geometry =
                    selectedFeature.getGeometry();


                if (
                    !geometry
                ) {

                    return;

                }


                const extent =
                    geometry.getExtent();


                map.getView().fit(

                    extent,

                    {

                        padding:
                            [
                                100,
                                100,
                                100,
                                100
                            ],

                        duration:
                            500,

                        maxZoom:
                            20

                    }

                );

            }
        );


    // ========================================================
    // COPY BUTTON
    // ========================================================

    document
        .getElementById(
            "feature-popup-copy"
        )
        .addEventListener(
            "click",
            function (event) {

                event.preventDefault();

                event.stopPropagation();


                if (
                    !selectedFeature
                ) {

                    return;

                }


                const properties =
                    selectedFeature.getProperties();


                const lines =
                    [];


                Object.keys(
                    properties
                )
                .forEach(
                    function (key) {

                        if (
                            isTechnicalField(
                                key
                            )
                        ) {

                            return;

                        }


                        lines.push(

                            cleanFieldName(
                                key
                            ) +

                            ": " +

                            formatValue(
                                properties[key]
                            )

                        );

                    }
                );


                const text =
                    lines.join(
                        "\n"
                    );


                copyText(
                    text
                );

            }
        );


    // ========================================================
    // COPY TEXT
    // ========================================================

    function copyText(
        text
    ) {

        if (
            navigator.clipboard &&
            navigator.clipboard.writeText
        ) {

            navigator.clipboard
                .writeText(
                    text
                )
                .then(
                    function () {

                        showCopied();

                    }
                )
                .catch(
                    function () {

                        fallbackCopy(
                            text
                        );

                    }
                );

        } else {

            fallbackCopy(
                text
            );

        }

    }


    // ========================================================
    // FALLBACK COPY
    // ========================================================

    function fallbackCopy(
        text
    ) {

        const textarea =
            document.createElement(
                "textarea"
            );


        textarea.value =
            text;


        textarea.style.position =
            "fixed";


        textarea.style.left =
            "-9999px";


        textarea.style.top =
            "0";


        document.body.appendChild(
            textarea
        );


        textarea.select();


        try {

            document.execCommand(
                "copy"
            );


            showCopied();

        } catch (
            error
        ) {

            alert(
                "Unable to copy."
            );

        }


        document.body.removeChild(
            textarea
        );

    }


    // ========================================================
    // COPIED MESSAGE
    // ========================================================

    function showCopied() {

        const button =
            document.getElementById(
                "feature-popup-copy"
            );


        if (
            !button
        ) {

            return;

        }


        const oldText =
            button.textContent;


        button.textContent =
            "✅ Copied";


        setTimeout(
            function () {

                button.textContent =
                    oldText;

            },
            1200
        );

    }


    // ========================================================
    // ESC KEY
    // ========================================================

    document.addEventListener(
        "keydown",
        function (event) {

            if (
                event.key ===
                "Escape"
            ) {

                closeFeaturePopup();

            }

        }
    );


    // ========================================================
    // INITIAL STATE
    // ========================================================

    closeFeaturePopup();


    // ========================================================
    // FINISHED
    // ========================================================

    console.log(
        "📋 Stage 5 Feature Information Popup READY."
    );

})();