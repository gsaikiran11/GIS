

// ============================================================

// STAGE 6 — ADVANCED ATTRIBUTE SEARCH PRO

// QGIS2WEB + OPENLAYERS

// LIGHT THEME • RESPONSIVE UI • SVG ICONS

// ============================================================

//

// FEATURES

// ------------------------------------------------------------

// 1. Dynamic vector-layer discovery

// 2. Dynamic attribute-field discovery

// 3. Multiple search conditions (AND logic)

// 4. Exact match / Contains search

// 5. Up to 10 autocomplete suggestions per condition

// 6. Modern parcel-result cards

// 7. Highlight matching parcels without changing source styles

// 8. Zoom to one parcel or all matching parcels

// 9. Clear results and search conditions

// 10. Desktop and mobile responsive layout

//

// INSTALLATION

// ------------------------------------------------------------

// Replace your previous Stage 6 script with this complete script.

// Requires OpenLayers global `ol` and your existing global `map`.

// ============================================================



(function () {

    "use strict";



    // --------------------------------------------------------

    // CONFIGURATION

    // --------------------------------------------------------



    const CONFIG = {

        buttonId: "stage6-search-button",

        panelId: "stage6-search-panel",

        styleId: "stage6-search-styles",

        highlightLayerName: "Stage6_Search_Highlight",



        buttonTop: 288,

        panelTop: 342,

        panelLeft: 12,

        panelWidth: 390,



        maxSuggestions: 10,
        maxDetails: 4,

        highlightColor: "#f59e0b",

        highlightStroke: "#ea580c",

        accent: "#1f6feb",



        preferredFields: [

            "Parcel_num",

            "Parcel_No",

            "Parcel No",

            "ParcelNo",

            "Katha No",

            "Katha_No",

            "Sy.No",

            "Sy.No.",

            "Survey No",

            "Survey_No",

            "LPM No",

            "LPM_No",

            "LP No",

            "LP_No",

            "Name",

            "name",

            "Owner",

            "Owner_Name",

            "Farmer_Name"

        ],



        preferredTitleFields: [

            "Parcel_num",

            "Parcel_No",

            "Parcel No",

            "ParcelNo",

            "Katha No",

            "Katha_No",

            "Sy.No",

            "Sy.No.",

            "Survey No",

            "Survey_No",

            "LPM No",

            "LPM_No",

            "LP No",

            "LP_No",

            "Name",

            "name"

        ],



        preferredOwnerFields: [

            "Owner_Name",

            "Owner Name",

            "Owner",

            "Farmer_Name",

            "Farmer Name",

            "Pattadar",

            "Pattadar_Name",

            "Name",

            "name"

        ],



        excludedLayerTerms: [

            "highlight",

            "search result",

            "search_result",

            "measurement",

            "measure layer",

            "drawing layer",

            "sketch layer",

            "temporary layer",

            "temp layer"

        ],



        excludedFieldNames: [

            "geometry"

        ]

    };



    // Prevent duplicate initialization.

    if (window.__STAGE6_SEARCH_PRO_INITIALIZED__) {

        if (typeof window.refreshStage6Search === "function") {

            window.refreshStage6Search();

        }

        return;

    }



    window.__STAGE6_SEARCH_PRO_INITIALIZED__ = true;



    // --------------------------------------------------------

    // MAP ACCESS

    // --------------------------------------------------------



    function getMap() {

        if (window.map && typeof window.map.getLayers === "function") {

            return window.map;

        }



        if (window.olMap &&

            typeof window.olMap.getLayers === "function") {

            return window.olMap;

        }



        try {

            if (typeof map !== "undefined" &&

                map &&

                typeof map.getLayers === "function") {

                return map;

            }

        } catch (error) {

            // The map may not be exposed globally.

        }



        return null;

    }



    // --------------------------------------------------------

    // SVG ICONS

    // --------------------------------------------------------



    const ICONS = {

        search:

            '<circle cx="11" cy="11" r="7"/>' +

            '<path d="m16 16 4 4"/>',



        close:

            '<path d="m18 6-12 12M6 6l12 12"/>',



        plus:

            '<path d="M12 5v14M5 12h14"/>',



        minus:

            '<path d="M5 12h14"/>',



        layers:

            '<path d="m12 3 9 5-9 5-9-5 9-5Z"/>' +

            '<path d="m3 12 9 5 9-5"/>' +

            '<path d="m3 16 9 5 9-5"/>',



        filter:

            '<path d="M4 6h16M7 12h10M10 18h4"/>',



        target:

            '<circle cx="12" cy="12" r="8"/>' +

            '<circle cx="12" cy="12" r="3"/>' +

            '<path d="M12 2v2M12 20v2M2 12h2M20 12h2"/>',



        zoom:

            '<circle cx="10.5" cy="10.5" r="6.5"/>' +

            '<path d="m15.5 15.5 5 5M10.5 7v7M7 10.5h7"/>',



        zoomAll:

            '<path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/>' +

            '<path d="M9 9h6v6H9z"/>',



        trash:

            '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>' +

            '<path d="M10 10v6M14 10v6"/>',



        check:

            '<path d="m5 12 4 4L19 6"/>',



        chevron:

            '<path d="m9 18 6-6-6-6"/>',



        pin:

            '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/>' +

            '<circle cx="12" cy="10" r="2.5"/>',



        refresh:

            '<path d="M20 7v5h-5M4 17v-5h5"/>' +

            '<path d="M5.6 9A7 7 0 0 1 17 5l3 2M4 17l3 2a7 7 0 0 0 11.4-4"/>',



        info:

            '<circle cx="12" cy="12" r="9"/>' +

            '<path d="M12 11v5M12 8h.01"/>'

    };



    function icon(name, size) {

        return (

            '<svg xmlns="http://www.w3.org/2000/svg"' +

            ' width="' + (size || 18) + '"' +

            ' height="' + (size || 18) + '"' +

            ' viewBox="0 0 24 24" fill="none"' +

            ' stroke="currentColor" stroke-width="1.8"' +

            ' stroke-linecap="round" stroke-linejoin="round"' +

            ' aria-hidden="true">' +

            (ICONS[name] || ICONS.info) +

            '</svg>'

        );

    }



    // --------------------------------------------------------

    // INJECT LIGHT-THEME CSS

    // --------------------------------------------------------





function installStyles() {

    if (document.getElementById(CONFIG.styleId)) return;



    const style = document.createElement("style");

    style.id = CONFIG.styleId;



    style.textContent = `

        #${CONFIG.buttonId},

        #${CONFIG.panelId},

        #${CONFIG.panelId} * {

            box-sizing: border-box;

        }



        /* MAIN SEARCH BUTTON */

        #${CONFIG.buttonId} {

            position: fixed;

            top: ${CONFIG.buttonTop}px;

            left: 12px;

            z-index: 2147483646 !important;

            display: flex;

            align-items: center;

            justify-content: center;

            gap: 8px;

            height: 42px;

            padding: 0 13px;

            border: 1px solid #dbe5f0;

            border-radius: 10px;

            background: #fff;

            color: #2463eb;

            box-shadow: 0 2px 8px #172b4d18;

            font: 600 12px system-ui, sans-serif;

            cursor: pointer;

            transition: .15s ease;

        }



        #${CONFIG.buttonId} svg {

            width: 19px;

            height: 19px;

        }



        #${CONFIG.buttonId}:hover {

            background: #edf4ff;

            border-color: #a9c7ff;

            box-shadow: 0 3px 10px #2463eb22;

        }



        /* SEARCH PANEL */

        #${CONFIG.panelId} {

            position: fixed;

            top: ${CONFIG.panelTop}px;

            left: 12px;

            z-index: 2147483647 !important;

            display: none;

            flex-direction: column;

            width: min(360px, calc(100vw - 24px));

            max-height: calc(100dvh - ${CONFIG.panelTop + 15}px);

            overflow: hidden;

            border: 1px solid #e0e6ef;

            border-radius: 13px;

            background: #fff;

            color: #25364d;

            box-shadow: 0 8px 28px #172b4d20;

            font: 12px/1.45 system-ui, sans-serif;

        }



        #${CONFIG.panelId}.s6-open {

            display: flex;

        }



        #${CONFIG.panelId} button,

        #${CONFIG.panelId} input,

        #${CONFIG.panelId} select {

            box-sizing: border-box;

            font: inherit;

        }



        /* SIMPLE HEADER */

        #${CONFIG.panelId} .s6-header {

            display: flex;

            align-items: center;

            gap: 10px;

            padding: 12px;

            border-bottom: 1px solid #edf0f5;

        }



        #${CONFIG.panelId} .s6-header-icon {

            display: flex;

            align-items: center;

            justify-content: center;

            width: 34px;

            height: 34px;

            flex-shrink: 0;

            border-radius: 9px;

            background: #edf4ff;

            color: #2463eb;

        }



        #${CONFIG.panelId} .s6-heading {

            flex: 1;

            min-width: 0;

        }



        #${CONFIG.panelId} .s6-title {

            margin: 0;

            color: #172b4d;

            font-size: 14px;

            font-weight: 700;

        }



        #${CONFIG.panelId} .s6-subtitle {

            margin-top: 2px;

            color: #8190a4;

            font-size: 10px;

        }



        /* ICON BUTTONS */

        #${CONFIG.panelId} .s6-icon-button {

            display: inline-flex;

            align-items: center;

            justify-content: center;

            flex-shrink: 0;

            width: 34px;

            height: 34px;

            padding: 0;

            border: 1px solid transparent;

            border-radius: 9px;

            background: transparent;

            color: #64748b;

            cursor: pointer;

            transition: .15s ease;

        }



        #${CONFIG.panelId} .s6-icon-button svg {

            width: 18px;

            height: 18px;

        }



        #${CONFIG.panelId} .s6-icon-button:hover {

            border-color: #dce6f2;

            background: #f1f6fc;

            color: #2463eb;

        }



        /* SCROLLABLE CONTENT */

        #${CONFIG.panelId} .s6-body {

            padding: 12px;

            overflow-y: auto;

            overscroll-behavior: contain;

        }



        #${CONFIG.panelId} .s6-section {

            margin-bottom: 14px;

        }



        #${CONFIG.panelId} .s6-section-heading {

            display: flex;

            align-items: center;

            justify-content: space-between;

            gap: 8px;

            margin: 0 0 8px;

            color: #52647c;

            font-size: 11px;

            font-weight: 700;

        }



        #${CONFIG.panelId} .s6-section-heading > span,

        #${CONFIG.panelId} .s6-results-header > .s6-section-heading {

            display: flex;

            align-items: center;

            gap: 6px;

        }



        #${CONFIG.panelId} .s6-section-heading svg {

            width: 15px;

            height: 15px;

            color: #7186a2;

        }



        #${CONFIG.panelId} .s6-label {

            display: block;

            margin-bottom: 5px;

            color: #78879a;

            font-size: 10px;

            font-weight: 600;

        }



        /* INPUTS */

        #${CONFIG.panelId} .s6-layer-wrap {

            padding: 0;

            border: 0;

            background: transparent;

        }



        #${CONFIG.panelId} .s6-select,

        #${CONFIG.panelId} .s6-input {

            display: block;

            width: 100%;

            min-width: 0;

            height: 37px;

            padding: 0 10px;

            border: 1px solid #dce3ed;

            border-radius: 8px;

            outline: none;

            background: #fff;

            color: #263950;

            font-size: 12px;

            transition: border-color .15s, box-shadow .15s;

        }



        #${CONFIG.panelId} .s6-select:focus,

        #${CONFIG.panelId} .s6-input:focus {

            border-color: #6a9df8;

            box-shadow: 0 0 0 3px #2463eb12;

        }



        #${CONFIG.panelId} .s6-input::placeholder {

            color: #a3afbd;

        }



        /* CONDITIONS */

        #${CONFIG.panelId} .s6-condition-list {

            display: flex;

            flex-direction: column;

            gap: 8px;

        }



        #${CONFIG.panelId} .s6-condition {

            padding: 10px;

            border: 1px solid #e5eaf1;

            border-radius: 10px;

            background: #fafbfd;

        }



        #${CONFIG.panelId} .s6-condition-top {

            display: flex;

            align-items: center;

            justify-content: space-between;

            margin-bottom: 8px;

        }



        #${CONFIG.panelId} .s6-condition-number {

            display: flex;

            align-items: center;

            gap: 7px;

            color: #63758b;

            font-size: 10px;

            font-weight: 700;

        }



        #${CONFIG.panelId} .s6-number-dot {

            display: inline-flex;

            align-items: center;

            justify-content: center;

            width: 21px;

            height: 21px;

            border-radius: 6px;

            background: #eaf2ff;

            color: #2463eb;

            font-size: 10px;

        }



        #${CONFIG.panelId} .s6-condition-fields {

            display: grid;

            grid-template-columns: minmax(0, 1fr) 105px;

            gap: 8px;

            margin-bottom: 8px;

        }



        #${CONFIG.panelId} .s6-value-row {

            display: flex;

            align-items: center;

            gap: 7px;

        }



        #${CONFIG.panelId} .s6-suggestions {

            margin-top: 5px;

            overflow: hidden;

            border: 1px solid #dce5f0;

            border-radius: 8px;

            background: #fff;

        }



        #${CONFIG.panelId} .s6-and-note {

            display: flex;

            align-items: center;

            justify-content: center;

            gap: 7px;

            margin-top: 8px;

            color: #8997a8;

            font-size: 10px;

        }



        #${CONFIG.panelId} .s6-and-pill {

            padding: 2px 6px;

            border-radius: 4px;

            background: #edf4ff;

            color: #2463eb;

            font-size: 9px;

            font-weight: 800;

        }



        /* ALL ACTION BUTTONS */

        #${CONFIG.panelId} .s6-btn {

            display: inline-flex;

            align-items: center;

            justify-content: center;

            gap: 7px;

            min-height: 35px;

            padding: 0 11px;

            border: 1px solid #dce4ef;

            border-radius: 8px;

            background: #fff;

            color: #53657d;

            font-size: 11px;

            font-weight: 650;

            cursor: pointer;

            transition: .15s ease;

        }



        #${CONFIG.panelId} .s6-btn svg {

            width: 15px;

            height: 15px;

            flex-shrink: 0;

        }



        #${CONFIG.panelId} .s6-btn:hover {

            border-color: #b8cbea;

            background: #f5f8fd;

            color: #2463eb;

        }



        #${CONFIG.panelId} .s6-btn-primary {

            border-color: #2463eb;

            background: #2463eb;

            color: #fff;

            box-shadow: 0 2px 5px #2463eb20;

        }



        #${CONFIG.panelId} .s6-btn-primary:hover {

            border-color: #1756cf;

            background: #1756cf;

            color: #fff;

        }



        #${CONFIG.panelId} .s6-btn-soft {

            border-color: #dce8fb;

            background: #f1f6ff;

            color: #2463eb;

        }



        #${CONFIG.panelId} .s6-btn-soft:hover {

            background: #e5efff;

        }



        #${CONFIG.panelId} .s6-btn-small {

            min-height: 30px;

            padding: 0 8px;

            font-size: 10px;

        }



        #${CONFIG.panelId} .s6-action-row {

            display: flex;

            gap: 7px;

        }



        #${CONFIG.panelId} .s6-action-row > .s6-btn {

            flex: 1;

        }



        /* STATUS */

        #${CONFIG.panelId} .s6-status {

            display: flex;

            align-items: flex-start;

            gap: 7px;

            padding: 9px 10px;

            border: 1px solid #e1e8f1;

            border-radius: 8px;

            background: #f7f9fc;

            color: #65768c;

            font-size: 10px;

            overflow-wrap: anywhere;

        }



        #${CONFIG.panelId} .s6-status svg {

            flex-shrink: 0;

            width: 15px;

            height: 15px;

            color: #6b8bb8;

        }



        #${CONFIG.panelId} .s6-status-success {

            border-color: #ccebd9;

            background: #f1fbf5;

            color: #276749;

        }



        #${CONFIG.panelId} .s6-status-warning {

            border-color: #f0dfba;

            background: #fffaf0;

            color: #8a5b17;

        }



        /* RESULTS */

        #${CONFIG.panelId} .s6-results-header {

            display: flex;

            align-items: center;

            justify-content: space-between;

            gap: 8px;

            margin-bottom: 8px;

        }



        #${CONFIG.panelId} .s6-result-count {

            display: inline-flex;

            align-items: center;

            justify-content: center;

            min-width: 25px;

            height: 24px;

            padding: 0 7px;

            border-radius: 7px;

            background: #eaf2ff;

            color: #2463eb;

            font-size: 11px;

            font-weight: 800;

        }



        #${CONFIG.panelId} .s6-results {

            display: flex;

            flex-direction: column;

            gap: 7px;

        }



        #${CONFIG.panelId} .s6-result-card {

            display: block;

            width: 100%;

            padding: 10px;

            border: 1px solid #e3e9f1;

            border-radius: 9px;

            background: #fff;

            color: #263950;

            text-align: left;

            cursor: pointer;

            transition: .15s ease;

        }



        #${CONFIG.panelId} .s6-result-card:hover {

            border-color: #a9c7ff;

            background: #f8fbff;

            box-shadow: 0 2px 8px #2463eb10;

        }



        #${CONFIG.panelId} .s6-result-title-row {

            display: flex;

            align-items: flex-start;

            gap: 8px;

        }



        #${CONFIG.panelId} .s6-result-pin {

            display: flex;

            flex-shrink: 0;

            align-items: center;

            justify-content: center;

            width: 29px;

            height: 29px;

            border-radius: 8px;

            background: #fff4e8;

            color: #d97706;

        }



        #${CONFIG.panelId} .s6-result-pin svg {

            width: 16px;

            height: 16px;

        }



        #${CONFIG.panelId} .s6-result-main {

            flex: 1;

            min-width: 0;

        }



        #${CONFIG.panelId} .s6-result-title {

            margin: 1px 0 3px;

            color: #253a56;

            font-size: 11px;

            font-weight: 750;

            overflow-wrap: anywhere;

        }



        #${CONFIG.panelId} .s6-result-owner {

            color: #78899d;

            font-size: 10px;

            overflow-wrap: anywhere;

        }



        #${CONFIG.panelId} .s6-result-layer {

            margin-top: 7px;

            color: #98a4b3;

            font-size: 9px;

        }



        #${CONFIG.panelId} .s6-result-details {

            display: grid;

            grid-template-columns: repeat(2, minmax(0, 1fr));

            gap: 5px;

            margin-top: 8px;

            padding-top: 8px;

            border-top: 1px solid #edf0f5;

        }



        #${CONFIG.panelId} .s6-detail {

            min-width: 0;

            padding: 5px 6px;

            border-radius: 6px;

            background: #f7f9fc;

        }



        #${CONFIG.panelId} .s6-detail-label {

            margin-bottom: 2px;

            color: #91a0b1;

            font-size: 9px;

        }



        #${CONFIG.panelId} .s6-detail-value {

            color: #52647a;

            font-size: 10px;

            font-weight: 600;

            overflow-wrap: anywhere;

        }



        #${CONFIG.panelId} .s6-empty {

            padding: 20px 10px;

            border: 1px dashed #dce4ef;

            border-radius: 9px;

            background: #fafbfd;

            color: #8391a4;

            text-align: center;

        }



        #${CONFIG.panelId} .s6-empty-icon {

            display: flex;

            justify-content: center;

            margin-bottom: 7px;

            color: #9aacc1;

        }



        #${CONFIG.panelId} .s6-empty-icon svg {

            width: 25px;

            height: 25px;

        }



        #${CONFIG.panelId} .s6-empty-title {

            margin-bottom: 3px;

            color: #53657c;

            font-size: 11px;

            font-weight: 700;

        }



        #${CONFIG.panelId} .s6-empty-text {

            font-size: 10px;

        }



        /* FOOTER */

        #${CONFIG.panelId} .s6-footer {

            display: flex;

            align-items: center;

            justify-content: space-between;

            gap: 8px;

            padding: 8px 12px;

            border-top: 1px solid #edf0f5;

            background: #fafbfd;

            color: #9aa6b5;

            font-size: 9px;

        }



        #${CONFIG.panelId} .s6-footer strong {

            color: #687990;

            font-weight: 650;

        }



        /* KEYBOARD ACCESS */

        #${CONFIG.panelId} button:focus-visible,

        #${CONFIG.buttonId}:focus-visible,

        #${CONFIG.panelId} input:focus-visible,

        #${CONFIG.panelId} select:focus-visible {

            outline: 2px solid #8bb5ff;

            outline-offset: 2px;

        }



        @media (max-width: 650px) {

            #${CONFIG.buttonId} {

                left: 10px;

            }



            #${CONFIG.panelId} {

                left: 10px;

                width: min(350px, calc(100vw - 20px));

                max-height: calc(100dvh - 352px);

            }



            #${CONFIG.panelId} .s6-select,

            #${CONFIG.panelId} .s6-input {

                height: 39px;

            }



            #${CONFIG.panelId} .s6-btn {

                min-height: 38px;

            }

        }



        @media (max-width: 360px) {

            #${CONFIG.panelId} .s6-condition-fields {

                grid-template-columns: minmax(0, 1fr) 92px;

                gap: 6px;

            }



            #${CONFIG.panelId} .s6-result-details {

                grid-template-columns: 1fr;

            }

        }



        @media (prefers-reduced-motion: reduce) {

            #${CONFIG.panelId} *,

            #${CONFIG.buttonId} {

                transition: none !important;

                animation: none !important;

            }

        }

    `;



    document.head.appendChild(style);

}





    // --------------------------------------------------------

    // LAYER DISCOVERY

    // --------------------------------------------------------



    function getAllLayers() {

        const currentMap = getMap();

        const output = [];



        if (!currentMap) return output;



        function walk(collection) {

            if (!collection || typeof collection.forEach !== "function") {

                return;

            }



            collection.forEach(function (layer) {

                if (!layer || typeof layer.getSource !== "function") {

                    return;

                }



                const source = layer.getSource();



                if (layer.getLayers &&

                    typeof layer.getLayers === "function") {

                    walk(layer.getLayers());

                    return;

                }



                if (source && typeof source.getFeatures === "function") {

                    output.push(layer);

                }

            });

        }



        walk(currentMap.getLayers());



        return output;

    }



    function getLayerName(layer) {

        if (!layer || typeof layer.get !== "function") {

            return "Unnamed layer";

        }



        const candidates = [

            layer.get("popuplayertitle"),

            layer.get("title"),

            layer.get("name"),

            layer.get("layerName"),

            layer.get("layer_name"),

            layer.get("file")

        ];



        for (let i = 0; i < candidates.length; i++) {

            if (candidates[i] !== undefined &&

                candidates[i] !== null &&

                String(candidates[i]).trim() !== "") {

                return String(candidates[i]).trim();

            }

        }



        return "";

    }



    function isInternalLayer(layer) {

        if (!layer) return true;



        if (layer.get &&

            (layer.get("dynamicSearchHighlight") === true ||

             layer.get("stage6SearchHighlight") === true ||

             layer.get("isSearchResultLayer") === true)) {

            return true;

        }



        const name = getLayerName(layer).toLowerCase();



        return CONFIG.excludedLayerTerms.some(function (term) {

            return name.includes(term);

        });

    }



    function getLayerFeatures(layer) {

        try {

            const source = layer.getSource();



            if (!source || typeof source.getFeatures !== "function") {

                return [];

            }



            return source.getFeatures();

        } catch (error) {

            return [];

        }

    }



    function getSearchableLayers() {

        return getAllLayers().filter(function (layer) {

            if (isInternalLayer(layer)) return false;



            const name = getLayerName(layer);

            if (!name) return false;



            const features = getLayerFeatures(layer);



            return features.some(function (feature) {

                return feature &&

                    typeof feature.getProperties === "function" &&

                    Object.keys(feature.getProperties()).some(function (key) {

                        return key !== "geometry";

                    });

            });

        });

    }



    function getFeatureFields(layer) {

        const fields = new Set();



        getLayerFeatures(layer).forEach(function (feature) {

            if (!feature || typeof feature.getProperties !== "function") {

                return;

            }



            Object.keys(feature.getProperties()).forEach(function (key) {

                if (CONFIG.excludedFieldNames.includes(key.toLowerCase())) {

                    return;

                }



                if (key.startsWith("_")) return;



                fields.add(key);

            });

        });



        const values = Array.from(fields);



        return values.sort(function (a, b) {

            const ai = CONFIG.preferredFields.indexOf(a);

            const bi = CONFIG.preferredFields.indexOf(b);



            if (ai !== -1 && bi !== -1) return ai - bi;

            if (ai !== -1) return -1;

            if (bi !== -1) return 1;



            return a.localeCompare(b);

        });

    }



    // --------------------------------------------------------

    // UI CREATION

    // --------------------------------------------------------



    installStyles();



    const searchButton = document.createElement("button");

    searchButton.id = CONFIG.buttonId;

    searchButton.type = "button";

    searchButton.title = "Advanced attribute search";

    searchButton.setAttribute("aria-label", "Open advanced attribute search");

    searchButton.setAttribute("aria-expanded", "false");

    searchButton.innerHTML = `

    <svg

        width="21"

        height="21"

        viewBox="0 0 24 24"

        fill="none"

        stroke="currentColor"

        stroke-width="2"

        stroke-linecap="round"

        stroke-linejoin="round"

        aria-hidden="true"

    >

        <circle cx="11" cy="11" r="7"></circle>

        <path d="m20 20-4-4"></path>

    </svg>

`;



    const panel = document.createElement("section");

    panel.id = CONFIG.panelId;

    panel.setAttribute("aria-label", "Advanced attribute search");



    panel.innerHTML = `

        <div class="s6-header">

            <div class="s6-header-icon">${icon("search", 21)}</div>

            <div class="s6-heading">

                <h2 class="s6-title">Advanced Search</h2>

                <div class="s6-subtitle">Find parcels by their attributes</div>

            </div>

            <button type="button" class="s6-icon-button"

                data-action="refresh" title="Refresh layers"

                aria-label="Refresh layers">${icon("refresh", 18)}</button>

            <button type="button" class="s6-icon-button"

                data-action="close" title="Close search"

                aria-label="Close search">${icon("close", 19)}</button>

        </div>



        <div class="s6-body">

            <div class="s6-section">

                <div class="s6-section-heading">

                    <span>${icon("layers", 15)} &nbsp;Search layer</span>

                </div>

                <div class="s6-layer-wrap">

                    <label class="s6-label" for="s6-layer-select">

                        Select parcel or attribute layer

                    </label>

                    <select id="s6-layer-select" class="s6-select">

                        <option value="">Loading layers...</option>

                    </select>

                </div>

            </div>



            <div class="s6-section">

                <div class="s6-section-heading">

                    <span>${icon("filter", 15)} &nbsp;Search conditions</span>

                    <button type="button" class="s6-btn s6-btn-soft s6-btn-small"

                        data-action="add-condition">

                        ${icon("plus", 14)} Add condition

                    </button>

                </div>



                <div id="s6-condition-list" class="s6-condition-list"></div>



                <div class="s6-and-note">

                    <span class="s6-and-pill">AND</span>

                    All entered conditions must match

                </div>

            </div>



            <div class="s6-section">

                <div class="s6-action-row">

                    <button type="button" class="s6-btn"

                        data-action="search">

                        ${icon("search", 16)} Search parcels

                    </button>

                    <button type="button" class="s6-btn"

                        data-action="clear">

                        ${icon("trash", 15)} Clear

                    </button>

                </div>

            </div>



            <div id="s6-status" class="s6-status" role="status" aria-live="polite">

                ${icon("info", 16)}

                <span>Select a layer and enter a value to begin.</span>

            </div>



            <div class="s6-section" style="margin-top:16px">

                <div class="s6-results-header">

                    <div class="s6-section-heading" style="margin:0">

                        ${icon("target", 15)} &nbsp;Search results

                    </div>

                    <span id="s6-result-count" class="s6-result-count">0</span>

                </div>



                <div class="s6-action-row" style="margin-bottom:10px">

                    <button type="button" class="s6-btn s6-btn-soft s6-btn-small"

                        data-action="zoom-all">

                        ${icon("zoomAll", 14)} Zoom to all

                    </button>

                    <button type="button" class="s6-btn s6-btn-small"

                        data-action="clear-highlight">

                        ${icon("close", 14)} Clear highlight

                    </button>

                </div>



                <div id="s6-results" class="s6-results">

                    <div class="s6-empty">

                        <div class="s6-empty-icon">${icon("search", 26)}</div>

                        <div class="s6-empty-title">Ready to search</div>

                        <div class="s6-empty-text">

                            Enter a parcel number, survey number, owner name,

                            or another attribute.

                        </div>

                    </div>

                </div>

            </div>

        </div>



        <div class="s6-footer">

            <span>GIS Survey Tools</span>

            <strong>Advanced Attribute Search</strong>

        </div>

    `;



    document.body.appendChild(searchButton);

    document.body.appendChild(panel);

    // Force this tool above ordinary map controls and custom survey panels.
    // Inline !important protects it from later stylesheet rules.
    searchButton.style.setProperty("z-index", "2147483646", "important");
    panel.style.setProperty("z-index", "2147483647", "important");
    searchButton.style.setProperty("position", "fixed", "important");
    panel.style.setProperty("position", "fixed", "important");



    const layerSelect = panel.querySelector("#s6-layer-select");

    const conditionList = panel.querySelector("#s6-condition-list");

    const statusBox = panel.querySelector("#s6-status");

    const resultCount = panel.querySelector("#s6-result-count");

    const resultsBox = panel.querySelector("#s6-results");



    let conditionCounter = 0;

    let currentResults = [];

    let highlightLayer = null;

    let mapClickListener = null;



    // --------------------------------------------------------

    // SAFE DOM HELPERS

    // --------------------------------------------------------



    function escapeHTML(value) {

        return String(value == null ? "" : value)

            .replace(/&/g, "&amp;")

            .replace(/</g, "&lt;")

            .replace(/>/g, "&gt;")

            .replace(/"/g, "&quot;")

            .replace(/'/g, "&#39;");

    }



    function normalise(value) {

        return String(value == null ? "" : value)

            .trim()

            .toLocaleLowerCase();

    }



    function valueToString(value) {

        if (value === null || value === undefined) return "";



        if (typeof value === "object") {

            if (value instanceof Date) return value.toISOString();

            return "";

        }



        return String(value);

    }



    function setStatus(message, type) {

        statusBox.className = "s6-status";



        if (type === "success") {

            statusBox.classList.add("s6-status-success");

        } else if (type === "warning") {

            statusBox.classList.add("s6-status-warning");

        }



        statusBox.innerHTML =

            icon(type === "success" ? "check" : "info", 16) +

            "<span>" + escapeHTML(message) + "</span>";

    }



    function showEmpty(title, message) {

        resultsBox.innerHTML = `

            <div class="s6-empty">

                <div class="s6-empty-icon">${icon("search", 26)}</div>

                <div class="s6-empty-title">${escapeHTML(title)}</div>

                <div class="s6-empty-text">${escapeHTML(message)}</div>

            </div>

        `;

    }



    // --------------------------------------------------------

    // LAYER SELECTOR

    // --------------------------------------------------------



    function getSelectedLayer() {

        const id = layerSelect.value;



        return getSearchableLayers().find(function (layer) {

            return String(getLayerUid(layer)) === id;

        }) || null;

    }



    const layerIds = new WeakMap();

    let nextLayerId = 1;



    function getLayerUid(layer) {

        if (!layerIds.has(layer)) {

            layerIds.set(layer, nextLayerId++);

        }



        return layerIds.get(layer);

    }



    function refreshLayers() {

        const previousId = layerSelect.value;

        const layers = getSearchableLayers();



        layerSelect.innerHTML = "";



        if (!layers.length) {

            layerSelect.innerHTML =

                '<option value="">No searchable vector layers found</option>';



            conditionList.innerHTML = "";

            setStatus(

                "No named vector layers with searchable attributes were found.",

                "warning"

            );

            return;

        }



        layers.forEach(function (layer) {

            const option = document.createElement("option");

            option.value = String(getLayerUid(layer));

            option.textContent = getLayerName(layer);

            layerSelect.appendChild(option);

        });



        if (layers.some(function (layer) {

            return String(getLayerUid(layer)) === previousId;

        })) {

            layerSelect.value = previousId;

        }



        if (!layerSelect.value && layers.length) {

            layerSelect.value = String(getLayerUid(layers[0]));

        }



        if (!conditionList.children.length) {

            addCondition();

        } else {

            updateAllConditionFields();

        }



        setStatus(

            layers.length + " searchable layer(s) available.",

            "success"

        );

    }



    // --------------------------------------------------------

    // CONDITION BUILDER

    // --------------------------------------------------------



    function createOption(value, label, selected) {

        return (

            '<option value="' + escapeHTML(value) + '"' +

            (selected ? " selected" : "") + ">" +

            escapeHTML(label) + "</option>"

        );

    }



    function addCondition() {

        const layer = getSelectedLayer();



        if (!layer) {

            setStatus("Select a searchable layer first.", "warning");

            return;

        }



        if (conditionList.children.length >= 8) {

            setStatus("You can add up to 8 search conditions.", "warning");

            return;

        }



        conditionCounter++;



        const row = document.createElement("div");

        row.className = "s6-condition";

        row.dataset.conditionId = String(conditionCounter);



        row.innerHTML = `

            <div class="s6-condition-top">

                <span class="s6-condition-number">

                    <span class="s6-number-dot">${conditionList.children.length + 1}</span>

                    Condition

                </span>

                <button type="button" class="s6-icon-button"

                    data-action="remove-condition"

                    title="Remove condition"

                    aria-label="Remove condition">

                    ${icon("minus", 17)}

                </button>

            </div>



            <div class="s6-condition-fields">

                <div>

                    <label class="s6-label">Attribute field</label>

                    <select class="s6-select s6-field-select"></select>

                </div>

                <div>

                    <label class="s6-label">Match type</label>

                    <select class="s6-select s6-operator-select">

                        ${createOption("exact", "Exact match", true)}

                        ${createOption("contains", "Contains", false)}

                        ${createOption("starts", "Starts with", false)}

                        ${createOption("ends", "Ends with", false)}

                    </select>

                </div>

            </div>



            <label class="s6-label">Search value</label>

            <input type="text" class="s6-input s6-value-input"

                placeholder="Type a value to search..."

                autocomplete="off" spellcheck="false" />



            <div class="s6-suggestions" hidden></div>

        `;



        conditionList.appendChild(row);



        updateConditionFields(row);

        renumberConditions();



        const valueInput = row.querySelector(".s6-value-input");



        valueInput.addEventListener("input", function () {

            updateSuggestions(row);

        });



        valueInput.addEventListener("keydown", function (event) {

            if (event.key === "Enter") {

                event.preventDefault();

                runSearch();

            }



            if (event.key === "Escape") {

                hideSuggestions(row);

            }

        });



        valueInput.addEventListener("blur", function () {

            // Allow a suggestion click to register before hiding.

            window.setTimeout(function () {

                hideSuggestions(row);

            }, 150);

        });



        row.querySelector(".s6-field-select").addEventListener(

            "change",

            function () {

                updateSuggestions(row);

            }

        );



        row.querySelector(".s6-operator-select").addEventListener(

            "change",

            function () {

                updateSuggestions(row);

            }

        );



        return row;

    }



    function renumberConditions() {

        Array.from(conditionList.children).forEach(function (row, index) {

            const dot = row.querySelector(".s6-number-dot");

            if (dot) dot.textContent = String(index + 1);

        });

    }



    function updateConditionFields(row) {

        const layer = getSelectedLayer();

        const fieldSelect = row.querySelector(".s6-field-select");



        if (!layer) {

            fieldSelect.innerHTML = '<option value="">No fields</option>';

            return;

        }



        const previousField = fieldSelect.value;

        const fields = getFeatureFields(layer);



        fieldSelect.innerHTML = "";



        if (!fields.length) {

            fieldSelect.innerHTML = '<option value="">No fields</option>';

            return;

        }



        fields.forEach(function (field) {

            fieldSelect.appendChild(

                new Option(field, field)

            );

        });



        if (fields.includes(previousField)) {

            fieldSelect.value = previousField;

        } else {

            const preferred = fields.find(function (field) {

                return CONFIG.preferredFields.includes(field);

            });



            fieldSelect.value = preferred || fields[0];

        }

    }



    function updateAllConditionFields() {

        Array.from(conditionList.children).forEach(function (row) {

            updateConditionFields(row);

            hideSuggestions(row);

        });

    }



    function hideSuggestions(row) {

        const box = row.querySelector(".s6-suggestions");



        if (box) {

            box.hidden = true;

            box.innerHTML = "";

        }

    }



    // --------------------------------------------------------

    // AUTOCOMPLETE — MAXIMUM 10 SUGGESTIONS

    // --------------------------------------------------------



    function getConditionValues(row) {

        const layer = getSelectedLayer();

        const field = row.querySelector(".s6-field-select").value;



        if (!layer || !field) return [];



        const unique = new Map();



        getLayerFeatures(layer).forEach(function (feature) {

            const value = valueToString(feature.get(field)).trim();



            if (!value) return;



            const key = normalise(value);



            if (!unique.has(key)) {

                unique.set(key, value);

            }

        });



        return Array.from(unique.values()).sort(function (a, b) {

            return a.localeCompare(b, undefined, {

                numeric: true,

                sensitivity: "base"

            });

        });

    }



    function updateSuggestions(row) {

        const input = row.querySelector(".s6-value-input");

        const box = row.querySelector(".s6-suggestions");

        const query = normalise(input.value);



        box.innerHTML = "";



        if (!query) {

            box.hidden = true;

            return;

        }



        const values = getConditionValues(row)

            .filter(function (value) {

                return normalise(value).includes(query);

            })

            .slice(0, CONFIG.maxSuggestions);



        if (!values.length) {

            box.hidden = true;

            return;

        }



        box.style.cssText =

            "margin-top:6px;border:1px solid #dce5f0;" +

            "border-radius:9px;background:#fff;overflow:hidden;" +

            "box-shadow:0 5px 16px rgba(25,45,75,.08);";



        values.forEach(function (value) {

            const item = document.createElement("button");

            item.type = "button";

            item.className = "s6-suggestion-item";

            item.style.cssText =

                "display:block;width:100%;padding:9px 10px;" +

                "border:0;border-bottom:1px solid #edf1f6;" +

                "background:#fff;color:#304761;text-align:left;" +

                "font-size:12px;cursor:pointer;overflow-wrap:anywhere;";



            item.textContent = value;



            item.addEventListener("mouseenter", function () {

                item.style.background = "#f0f6ff";

            });



            item.addEventListener("mouseleave", function () {

                item.style.background = "#fff";

            });



            item.addEventListener("mousedown", function (event) {

                event.preventDefault();

                input.value = value;

                hideSuggestions(row);

                input.focus();

            });



            box.appendChild(item);

        });



        box.hidden = false;

    }



    // --------------------------------------------------------

    // SEARCH CONDITIONS

    // --------------------------------------------------------



    function readConditions() {

        return Array.from(conditionList.children)

            .map(function (row) {

                return {

                    field: row.querySelector(".s6-field-select").value,

                    operator: row.querySelector(".s6-operator-select").value,

                    value: row.querySelector(".s6-value-input").value.trim()

                };

            })

            .filter(function (condition) {

                return condition.field && condition.value !== "";

            });

    }



    function matchesCondition(feature, condition) {

        const actual = normalise(feature.get(condition.field));

        const expected = normalise(condition.value);



        if (!expected) return true;



        switch (condition.operator) {

            case "contains":

                return actual.includes(expected);



            case "starts":

                return actual.startsWith(expected);



            case "ends":

                return actual.endsWith(expected);



            case "exact":

            default:

                return actual === expected;

        }

    }



    function runSearch() {

        const layer = getSelectedLayer();

        const conditions = readConditions();



        Array.from(conditionList.children).forEach(hideSuggestions);



        if (!layer) {

            setStatus("Please select a searchable layer.", "warning");

            return;

        }



        if (!conditions.length) {

            setStatus("Enter at least one search value.", "warning");

            return;

        }



        clearHighlights();



        const features = getLayerFeatures(layer);



        currentResults = features.filter(function (feature) {

            return conditions.every(function (condition) {

                return matchesCondition(feature, condition);

            });

        });
        renderResults(currentResults, layer);



        if (!currentResults.length) {

            setStatus(

                "No parcels matched all entered conditions. Try Contains or check the value.",

                "warning"

            );

            return;

        }



        const modeText = conditions.map(function (condition) {

            return condition.field + " (" + condition.operator + ")";

        }).join(" + ");



        setStatus(

            currentResults.length +

            " matching feature(s) found using " + modeText + ".",

            "success"

        );



        drawHighlights(currentResults);

        // Automatically zoom to all matching parcels.
        requestAnimationFrame(function () {
            zoomToAll();
        });

    }



    // --------------------------------------------------------

    // RESULT CARDS

    // --------------------------------------------------------



    function findProperty(feature, fieldCandidates) {

        const properties = feature.getProperties();



        for (let i = 0; i < fieldCandidates.length; i++) {

            const key = fieldCandidates[i];



            if (properties[key] !== undefined &&

                properties[key] !== null &&

                String(properties[key]).trim() !== "") {

                return {

                    key: key,

                    value: valueToString(properties[key])

                };

            }

        }



        return null;

    }



    function getTitleForFeature(feature) {

        const preferred = findProperty(

            feature,

            CONFIG.preferredTitleFields

        );



        if (preferred) return preferred.value;



        const properties = feature.getProperties();



        for (const key of Object.keys(properties)) {

            if (key === "geometry") continue;



            const value = valueToString(properties[key]).trim();



            if (value) return value;

        }



        return "Untitled feature";

    }



    function getOwnerForFeature(feature) {

        const owner = findProperty(

            feature,

            CONFIG.preferredOwnerFields

        );



        return owner ? owner.value : "";

    }



    function getDetailFields(feature) {

        const properties = feature.getProperties();

        const output = [];



        const preferred = [

            "Sy.No",

            "Sy.No.",

            "Survey No",

            "Survey_No",

            "Katha No",

            "LPM No",

            "LP No",

            "Extent",

            "LPM Extent",

            "Name",

            "Owner",

            "Village",

            "Mandal"

        ];



        preferred.forEach(function (field) {

            if (output.length >= CONFIG.maxDetails) return;



            if (properties[field] === undefined ||

                properties[field] === null ||

                String(properties[field]).trim() === "") {

                return;

            }



            if (output.some(function (item) {

                return item.key === field;

            })) return;



            output.push({

                key: field,

                value: valueToString(properties[field])

            });

        });



        if (output.length < CONFIG.maxDetails) {

            Object.keys(properties).forEach(function (field) {

                if (output.length >= CONFIG.maxDetails) return;

                if (field === "geometry") return;



                if (output.some(function (item) {

                    return item.key === field;

                })) return;



                const value = valueToString(properties[field]).trim();



                if (!value) return;



                output.push({

                    key: field,

                    value: value

                });

            });

        }



        return output.slice(0, CONFIG.maxDetails);

    }



    function renderResults(features, layer) {

        resultCount.textContent = String(features.length);

        resultsBox.innerHTML = "";



        if (!features.length) {

            showEmpty(

                "No matching parcels",

                "Try a different value or change Exact match to Contains."

            );

            return;

        }



        features.forEach(function (feature, index) {

            const card = document.createElement("button");

            card.type = "button";

            card.className = "s6-result-card";

            card.setAttribute(

                "aria-label",

                "Zoom to " + getTitleForFeature(feature)

            );



            const title = getTitleForFeature(feature);

            const owner = getOwnerForFeature(feature);

            const details = getDetailFields(feature);



            const detailHTML = details.map(function (item) {

                return `

                    <div class="s6-detail">

                        <div class="s6-detail-label">${escapeHTML(item.key)}</div>

                        <div class="s6-detail-value">${escapeHTML(item.value)}</div>

                    </div>

                `;

            }).join("");



            card.innerHTML = `

                <div class="s6-result-title-row">

                    <div class="s6-result-pin">${icon("pin", 16)}</div>

                    <div class="s6-result-main">

                        <div class="s6-result-title">

                            ${escapeHTML(title)}

                        </div>

                        ${owner

                            ? '<div class="s6-result-owner">' +

                              escapeHTML(owner) + '</div>'

                            : '<div class="s6-result-owner">Parcel record</div>'}

                    </div>

                    <span style="color:#8293a8">${icon("chevron", 17)}</span>

                </div>

                ${detailHTML

                    ? '<div class="s6-result-details">' + detailHTML + '</div>'

                    : ''}

                <div class="s6-result-layer">

                    ${escapeHTML(getLayerName(layer))} · Result ${index + 1}

                </div>

            `;



            card.addEventListener("click", function () {

                zoomToFeature(feature);

                highlightOneFeature(feature);

            });



            resultsBox.appendChild(card);

        });
    }



    // --------------------------------------------------------

    // HIGHLIGHT OVERLAY

    // Does not change styles on source features.

    // --------------------------------------------------------



    function createHighlightLayer() {

        const currentMap = getMap();



        if (!currentMap || !window.ol) return null;



        const source = new ol.source.Vector();



        const layer = new ol.layer.Vector({

            source: source,

            zIndex: 99999,

            style: new ol.style.Style({

                fill: new ol.style.Fill({

                    color: "rgba(245, 158, 11, 0.24)"

                }),

                stroke: new ol.style.Stroke({

                    color: CONFIG.highlightStroke,

                    width: 3

                }),

                image: new ol.style.Circle({

                    radius: 7,

                    fill: new ol.style.Fill({

                        color: CONFIG.highlightColor

                    }),

                    stroke: new ol.style.Stroke({

                        color: "#ffffff",

                        width: 2

                    })

                })

            })

        });



        layer.set("title", CONFIG.highlightLayerName);

        layer.set("name", CONFIG.highlightLayerName);

        layer.set("dynamicSearchHighlight", true);

        layer.set("stage6SearchHighlight", true);

        layer.set("isSearchResultLayer", true);



        currentMap.addLayer(layer);



        return layer;

    }



    function getHighlightLayer() {

        if (highlightLayer) return highlightLayer;



        const currentMap = getMap();



        if (!currentMap || !window.ol) return null;



        highlightLayer = createHighlightLayer();



        return highlightLayer;

    }



    function clearHighlights() {

        if (highlightLayer) {

            const source = highlightLayer.getSource();



            if (source) source.clear();

        }

    }



    function addFeatureHighlight(feature) {

        const layer = getHighlightLayer();



        if (!layer || !feature || !feature.getGeometry()) return;



        const geometry = feature.getGeometry().clone();



        const highlightFeature = new ol.Feature({

            geometry: geometry

        });



        layer.getSource().addFeature(highlightFeature);

    }



    function drawHighlights(features) {

        clearHighlights();



        features.forEach(function (feature) {

            addFeatureHighlight(feature);

        });

    }



    function highlightOneFeature(feature) {

        clearHighlights();

        addFeatureHighlight(feature);

    }



    // --------------------------------------------------------

    // ZOOM

    // --------------------------------------------------------



    function zoomToFeature(feature) {

        const currentMap = getMap();



        if (!currentMap || !feature || !feature.getGeometry()) {

            setStatus("Could not zoom to this feature.", "warning");

            return;

        }



        const geometry = feature.getGeometry();

        const extent = geometry.getExtent();



        if (!extent || !extent.every(Number.isFinite)) {

            setStatus("This feature has no valid geometry.", "warning");

            return;

        }



        const view = currentMap.getView();

        const size = currentMap.getSize();



        const geometryType = geometry.getType();



        if (geometryType === "Point" || geometryType === "MultiPoint") {

            view.animate({

                center: geometry.getClosestPoint(view.getCenter() || extent.slice(0, 2)),

                zoom: Math.max(view.getZoom() || 0, 19),

                duration: 350

            });

        } else {

            view.fit(extent, {

                size: size,

                padding: [65, 55, 65, 55],

                maxZoom: 21,

                duration: 350

            });

        }

    }



    function zoomToAll() {

        const currentMap = getMap();



        if (!currentMap) return;



        const layer = getHighlightLayer();

        const source = layer && layer.getSource();



        if (!source || source.getFeatures().length === 0) {

            setStatus("There are no highlighted results to zoom to.", "warning");

            return;

        }



        const extent = source.getExtent();



        if (!extent || !extent.every(Number.isFinite)) {

            setStatus("The result extent is invalid.", "warning");

            return;

        }



        currentMap.getView().fit(extent, {

            size: currentMap.getSize(),

            padding: [70, 60, 70, 60],

            maxZoom: 20,

            duration: 400

        });

    }



    // --------------------------------------------------------

    // CLEAR / RESET

    // --------------------------------------------------------



    function clearResults() {

        currentResults = [];

        clearHighlights();



        resultCount.textContent = "0";



        showEmpty(

            "Ready to search",

            "Enter a parcel number, survey number, owner name, or another attribute."

        );



        setStatus("Results and highlights cleared.", "");

    }



    function clearSearchInputs() {

        Array.from(conditionList.children).forEach(function (row) {

            const input = row.querySelector(".s6-value-input");



            if (input) input.value = "";



            hideSuggestions(row);

        });



        clearResults();

    }



    // --------------------------------------------------------

    // EVENT DELEGATION

    // --------------------------------------------------------



    searchButton.addEventListener("click", function () {

        const opening = !panel.classList.contains("s6-open");



        panel.classList.toggle("s6-open", opening);

        searchButton.setAttribute("aria-expanded", String(opening));



        if (opening) {

            refreshLayers();



            const firstInput = panel.querySelector(".s6-value-input");



            if (firstInput) {

                firstInput.focus({ preventScroll: true });

            }

        }

    });



    layerSelect.addEventListener("change", function () {

        updateAllConditionFields();

        clearResults();

        setStatus("Layer changed. Enter your search values.", "");

    });



    panel.addEventListener("click", function (event) {

        const button = event.target.closest("button[data-action]");



        if (!button) return;



        const action = button.dataset.action;



        if (action === "close") {

            panel.classList.remove("s6-open");

            searchButton.setAttribute("aria-expanded", "false");

        }



        if (action === "refresh") {

            refreshLayers();

        }



        if (action === "add-condition") {

            addCondition();

        }



        if (action === "remove-condition") {

            const row = button.closest(".s6-condition");



            if (row) {

                row.remove();

                renumberConditions();

                clearResults();

            }



            if (!conditionList.children.length) {

                addCondition();

            }

        }



        if (action === "search") {

            runSearch();

        }



        if (action === "clear") {

            clearSearchInputs();

        }



        if (action === "clear-highlight") {

            clearHighlights();

            setStatus("Map highlights cleared.", "");

        }



        if (action === "zoom-all") {

            zoomToAll();

        }

    });



    document.addEventListener("keydown", function (event) {

        if (event.key === "Escape" &&

            panel.classList.contains("s6-open")) {

            panel.classList.remove("s6-open");

            searchButton.setAttribute("aria-expanded", "false");

        }

    });



    // --------------------------------------------------------

    // MAP-CLICK COMPATIBILITY

    // Clicking the map does not disable or intercept the tool.

    // --------------------------------------------------------



    function bindMap() {

        const currentMap = getMap();



        if (!currentMap) return false;



        if (!highlightLayer) {

            highlightLayer = createHighlightLayer();

        }



        return true;

    }



    // --------------------------------------------------------

    // PUBLIC REFRESH FUNCTION

    // --------------------------------------------------------



    window.refreshStage6Search = function () {

        refreshLayers();

        bindMap();

    };



    // --------------------------------------------------------

    // INITIALIZE

    // --------------------------------------------------------



    function initialize() {

        refreshLayers();

        bindMap();



        if (!getMap()) {

            setStatus(

                "Waiting for the OpenLayers map. Use Refresh after the map loads.",

                "warning"

            );

        }

    }



    if (document.readyState === "loading") {

        document.addEventListener("DOMContentLoaded", initialize, {

            once: true

        });

    } else {

        initialize();

    }



})();
