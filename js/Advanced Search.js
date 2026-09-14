/* ============================================================
   STAGE 6
   ADVANCED ATTRIBUTE SEARCH
   WITH MAXIMUM 10 TYPING SUGGESTIONS
   ============================================================ */

(function () {

    "use strict";

    console.log("Stage 6 Search initialized");


    /* ============================================================
       HIGHLIGHT LAYER
       ============================================================ */

    var stage6HighlightSource = new ol.source.Vector();

    var stage6HighlightLayer = new ol.layer.Vector({

        source: stage6HighlightSource,

        zIndex: 9999,

        style: new ol.style.Style({

            fill: new ol.style.Fill({
                color: "rgba(255, 255, 0, 0.30)"
            }),

            stroke: new ol.style.Stroke({
                color: "#ff0000",
                width: 4
            })

        })

    });

    map.addLayer(stage6HighlightLayer);


    /* ============================================================
       SEARCH BUTTON
       ============================================================ */

    var searchButton =
        document.createElement("button");

    searchButton.id =
        "stage6-search-button";

    searchButton.innerHTML =
        "🔍 ";

    searchButton.title =
        "Search layer attributes";

    searchButton.style.position =
        "fixed";

    searchButton.style.top =
        "10px";

    searchButton.style.left =
        "10px";

    searchButton.style.zIndex =
        "10000";

    document.body.appendChild(
        searchButton
    );


    /* ============================================================
       SEARCH PANEL
       ============================================================ */

    var searchPanel =
        document.createElement("div");

    searchPanel.id =
        "stage6-search-panel";

    searchPanel.style.position =
        "fixed";

    searchPanel.style.top =
        "55px";

    searchPanel.style.left =
        "10px";

    searchPanel.style.zIndex =
        "10001";

    searchPanel.style.width =
        "310px";

    searchPanel.style.maxWidth =
        "calc(100vw - 30px)";

    searchPanel.style.background =
        "#ffffff";

    searchPanel.style.border =
        "1px solid #ccc";

    searchPanel.style.borderRadius =
        "8px";

    searchPanel.style.padding =
        "12px";

    searchPanel.style.boxShadow =
        "0 3px 15px rgba(0,0,0,0.30)";

    searchPanel.style.display =
        "none";

    searchPanel.style.fontFamily =
        "Arial, sans-serif";

    document.body.appendChild(
        searchPanel
    );


    /* ============================================================
       PANEL HEADER
       ============================================================ */

    var header =
        document.createElement("div");

    header.style.display =
        "flex";

    header.style.alignItems =
        "center";

    header.style.justifyContent =
        "space-between";

    header.style.marginBottom =
        "10px";


    var headerTitle =
        document.createElement("strong");

    headerTitle.innerHTML =
        "🔍 Attribute Search";


    var closeButton =
        document.createElement("button");

    closeButton.innerHTML =
        "×";

    closeButton.title =
        "Close";

    closeButton.style.width =
        "30px";

    closeButton.style.height =
        "30px";

    closeButton.style.padding =
        "0";

    closeButton.style.fontSize =
        "20px";

    closeButton.style.cursor =
        "pointer";

    closeButton.style.border =
        "1px solid #ccc";

    closeButton.style.borderRadius =
        "5px";

    closeButton.style.background =
        "#f5f5f5";


    header.appendChild(
        headerTitle
    );

    header.appendChild(
        closeButton
    );

    searchPanel.appendChild(
        header
    );


    /* ============================================================
       LABEL FUNCTION
       ============================================================ */

    function createLabel(text) {

        var label =
            document.createElement("label");

        label.innerHTML =
            text;

        label.style.display =
            "block";

        label.style.fontSize =
            "13px";

        label.style.fontWeight =
            "bold";

        label.style.marginBottom =
            "4px";

        label.style.marginTop =
            "8px";

        return label;
    }


    /* ============================================================
       LAYER SELECT
       ============================================================ */

    searchPanel.appendChild(
        createLabel("Layer")
    );


    var layerSelect =
        document.createElement("select");

    layerSelect.id =
        "stage6-layer-select";

    layerSelect.style.width =
        "100%";

    layerSelect.style.height =
        "36px";

    layerSelect.style.padding =
        "5px";

    layerSelect.style.border =
        "1px solid #bbb";

    layerSelect.style.borderRadius =
        "5px";

    searchPanel.appendChild(
        layerSelect
    );


    /* ============================================================
       FIELD SELECT
       ============================================================ */

    searchPanel.appendChild(
        createLabel("Field / Attribute")
    );


    var fieldSelect =
        document.createElement("select");

    fieldSelect.id =
        "stage6-field-select";

    fieldSelect.style.width =
        "100%";

    fieldSelect.style.height =
        "36px";

    fieldSelect.style.padding =
        "5px";

    fieldSelect.style.border =
        "1px solid #bbb";

    fieldSelect.style.borderRadius =
        "5px";

    searchPanel.appendChild(
        fieldSelect
    );


    /* ============================================================
       VALUE LABEL
       ============================================================ */

    searchPanel.appendChild(
        createLabel("Search Value")
    );


    /* ============================================================
       VALUE WRAPPER
       ============================================================ */

    var valueWrapper =
        document.createElement("div");

    valueWrapper.style.position =
        "relative";

    valueWrapper.style.width =
        "100%";


    /* ============================================================
       VALUE INPUT
       ============================================================ */

    var valueInput =
        document.createElement("input");

    valueInput.id =
        "stage6-value-input";

    valueInput.type =
        "text";

    valueInput.placeholder =
        "Type a value...";

    valueInput.autocomplete =
        "off";

    valueInput.style.width =
        "100%";

    valueInput.style.height =
        "38px";

    valueInput.style.padding =
        "7px 9px";

    valueInput.style.border =
        "1px solid #bbb";

    valueInput.style.borderRadius =
        "5px";

    valueInput.style.fontSize =
        "14px";

    valueWrapper.appendChild(
        valueInput
    );


    /* ============================================================
       SUGGESTION BOX
       ============================================================ */

    var suggestionBox =
        document.createElement("div");

    suggestionBox.id =
        "stage6-value-suggestions";

    suggestionBox.style.position =
        "absolute";

    suggestionBox.style.left =
        "0";

    suggestionBox.style.right =
        "0";

    suggestionBox.style.top =
        "40px";

    suggestionBox.style.background =
        "#ffffff";

    suggestionBox.style.border =
        "1px solid #ccc";

    suggestionBox.style.borderRadius =
        "0 0 6px 6px";

    suggestionBox.style.maxHeight =
        "220px";

    suggestionBox.style.overflowY =
        "auto";

    suggestionBox.style.zIndex =
        "10010";

    suggestionBox.style.display =
        "none";

    suggestionBox.style.boxShadow =
        "0 3px 8px rgba(0,0,0,0.20)";


    valueWrapper.appendChild(
        suggestionBox
    );

    searchPanel.appendChild(
        valueWrapper
    );


    /* ============================================================
       BUTTON ROW
       ============================================================ */

    var buttonRow =
        document.createElement("div");

    buttonRow.style.display =
        "flex";

    buttonRow.style.gap =
        "6px";

    buttonRow.style.marginTop =
        "12px";


    /* ============================================================
       FIND BUTTON
       ============================================================ */

    var findButton =
        document.createElement("button");

    findButton.innerHTML =
        "🔎 Find";

    findButton.style.flex =
        "1";

    findButton.style.height =
        "36px";

    findButton.style.cursor =
        "pointer";

    findButton.style.border =
        "1px solid #bbb";

    findButton.style.borderRadius =
        "5px";

    findButton.style.background =
        "#f5f5f5";


    /* ============================================================
       CLEAR BUTTON
       ============================================================ */

    var clearButton =
        document.createElement("button");

    clearButton.innerHTML =
        "Clear";

    clearButton.style.flex =
        "1";

    clearButton.style.height =
        "36px";

    clearButton.style.cursor =
        "pointer";

    clearButton.style.border =
        "1px solid #bbb";

    clearButton.style.borderRadius =
        "5px";

    clearButton.style.background =
        "#f5f5f5";


    buttonRow.appendChild(
        findButton
    );

    buttonRow.appendChild(
        clearButton
    );

    searchPanel.appendChild(
        buttonRow
    );


    /* ============================================================
       STATUS
       ============================================================ */

    var status =
        document.createElement("div");

    status.id =
        "stage6-search-status";

    status.style.marginTop =
        "10px";

    status.style.fontSize =
        "12px";

    status.style.color =
        "#555";

    status.style.lineHeight =
        "18px";

    searchPanel.appendChild(
        status
    );


    /* ============================================================
       OPEN / CLOSE SEARCH
       ============================================================ */

    searchButton.addEventListener(
        "click",
        function () {

            if (
                searchPanel.style.display ===
                "none"
            ) {

                searchPanel.style.display =
                    "block";

                refreshLayerList();

            } else {

                searchPanel.style.display =
                    "none";

                hideSuggestions();
            }

        }
    );


    closeButton.addEventListener(
        "click",
        function () {

            searchPanel.style.display =
                "none";

            hideSuggestions();

        }
    );


    /* ============================================================
       GET LAYER NAME
       ============================================================ */

  function getLayerName(layer) {

    if (!layer) {
        return null;
    }

    var name =
        layer.get("popuplayertitle") ||
        layer.get("title") ||
        layer.get("name") ||
        layer.get("layerName") ||
        layer.get("file");

    /*
     * If there is no actual layer name,
     * don't return "Unnamed Layer".
     */
    if (
        name === undefined ||
        name === null ||
        String(name).trim() === ""
    ) {
        return null;
    }

    name = String(name).trim();

    /*
     * Ignore generic/internal layer names.
     */
    var ignoredNames = [
        "layer",
        "layer 1",
        "layer 2",
        "layer 3",
        "layer 4",
        "layer 5",
        "unnamed layer",
        "vector layer",
        "vector"
    ];

    if (
        ignoredNames.indexOf(
            name.toLowerCase()
        ) !== -1
    ) {
        return null;
    }

    return name;
}

    /* ============================================================
       GET SEARCHABLE VECTOR LAYERS
       ============================================================ */

   function getSearchableLayers() {

    var layers = [];

    map.getLayers().forEach(function (layer) {

        /*
         * Don't search the Stage 6 highlight layer.
         */
        if (
            layer === stage6HighlightLayer
        ) {
            return;
        }

        /*
         * Only OpenLayers Vector layers.
         */
        if (
            !(layer instanceof ol.layer.Vector)
        ) {
            return;
        }

        var source =
            layer.getSource();

        /*
         * Source must contain features.
         */
        if (
            !source ||
            typeof source.getFeatures !== "function"
        ) {
            return;
        }

        /*
         * Get actual layer name.
         */
        var layerName =
            getLayerName(layer);

        /*
         * If the layer doesn't have a
         * meaningful name, ignore it.
         */
        if (!layerName) {
            return;
        }

        /*
         * Ignore known internal/helper layers.
         */
        var excludedNames = [
            "featureOverlay",
            "measureLayer",
            "geolocateOverlay",
            "stage14MeasureLayer",
            "stage14SnapLayer",
            "highlight",
            "selection",
            "select",
            "measure",
            "geolocate"
        ];

        var lowerName =
            layerName.toLowerCase();

        var isExcluded =
            excludedNames.some(function (excluded) {

                return (
                    lowerName.indexOf(
                        excluded.toLowerCase()
                    ) !== -1
                );

            });

        if (isExcluded) {
            return;
        }

        /*
         * Ignore empty vector layers.
         */
        var features =
            source.getFeatures();

        if (
            !features ||
            features.length === 0
        ) {
            return;
        }

        /*
         * This is a genuine searchable layer.
         */
        layers.push(layer);

    });

    return layers;
}


    /* ============================================================
       REFRESH LAYER LIST
       ============================================================ */

    function refreshLayerList() {

        var layers =
            getSearchableLayers();


        var oldLayerName =
            layerSelect.options[
                layerSelect.selectedIndex
            ]
                ? layerSelect.options[
                    layerSelect.selectedIndex
                ].textContent
                : "";


        layerSelect.innerHTML =
            "";


        if (
            layers.length === 0
        ) {

            var emptyOption =
                document.createElement(
                    "option"
                );

            emptyOption.textContent =
                "No vector layers found";

            layerSelect.appendChild(
                emptyOption
            );

            fieldSelect.innerHTML =
                "";

            hideSuggestions();

            return;
        }


        layers.forEach(
            function (layer, index) {

                var option =
                    document.createElement(
                        "option"
                    );

                option.value =
                    index;

                option.textContent =
                    getLayerName(layer);

                layerSelect.appendChild(
                    option
                );

            }
        );


        /*
           Restore previous layer
           if possible.
        */

        var restored =
            false;


        for (
            var i = 0;
            i < layers.length;
            i++
        ) {

            if (
                getLayerName(
                    layers[i]
                ) === oldLayerName
            ) {

                layerSelect.value =
                    i;

                restored =
                    true;

                break;
            }
        }


        if (!restored) {

            layerSelect.selectedIndex =
                0;
        }


        updateFieldList();
    }


    /* ============================================================
       GET SELECTED LAYER
       ============================================================ */

    function getSelectedLayer() {

        var layers =
            getSearchableLayers();


        var index =
            parseInt(
                layerSelect.value,
                10
            );


        if (
            isNaN(index) ||
            !layers[index]
        ) {

            return null;
        }


        return layers[index];
    }


    /* ============================================================
       GET FIELDS
       ============================================================ */

    function getLayerFields(layer) {

        if (!layer) {
            return [];
        }


        var source =
            layer.getSource();


        if (!source) {
            return [];
        }


        var features =
            source.getFeatures();


        var fieldSet =
            new Set();


        features.forEach(
            function (feature) {

                var properties =
                    feature.getProperties();


                Object.keys(
                    properties
                ).forEach(
                    function (field) {

                        if (
                            field ===
                            "geometry"
                        ) {

                            return;
                        }


                        if (
                            field ===
                            "layerObject"
                        ) {

                            return;
                        }


                        if (
                            field ===
                            "idO"
                        ) {

                            return;
                        }


                        fieldSet.add(
                            field
                        );

                    }
                );

            }
        );


        var fields =
            Array.from(fieldSet);


        /*
           Preferred survey fields first.
        */

        var preferredFields = [

            "parcel_num",

            "parcel_no",

            "parcelno",

            "lpm_no",

            "lpmno",

            "lp_no",

            "survey_no",

            "survey_no_",

            "survey",

            "name"

        ];


        fields.sort(
            function (a, b) {

                var ai =
                    preferredFields.indexOf(
                        a.toLowerCase()
                    );


                var bi =
                    preferredFields.indexOf(
                        b.toLowerCase()
                    );


                if (
                    ai !== -1 &&
                    bi === -1
                ) {

                    return -1;
                }


                if (
                    ai === -1 &&
                    bi !== -1
                ) {

                    return 1;
                }


                if (
                    ai !== -1 &&
                    bi !== -1
                ) {

                    return ai - bi;
                }


                return a.localeCompare(
                    b,
                    undefined,
                    {
                        sensitivity:
                            "base"
                    }
                );

            }
        );


        return fields;
    }


    /* ============================================================
       UPDATE FIELD LIST
       ============================================================ */

    function updateFieldList() {

        hideSuggestions();


        var layer =
            getSelectedLayer();


        fieldSelect.innerHTML =
            "";


        valueInput.value =
            "";


        status.innerHTML =
            "";


        if (!layer) {
            return;
        }


        var fields =
            getLayerFields(layer);


        fields.forEach(
            function (field) {

                var option =
                    document.createElement(
                        "option"
                    );

                option.value =
                    field;

                option.textContent =
                    field;

                fieldSelect.appendChild(
                    option
                );

            }
        );

    }


    /* ============================================================
       GET UNIQUE FIELD VALUES
       ============================================================ */

    function getFieldValues(
        layer,
        field
    ) {

        if (
            !layer ||
            !field
        ) {

            return [];
        }


        var source =
            layer.getSource();


        if (!source) {
            return [];
        }


        var features =
            source.getFeatures();


        var values = [];

        var seen =
            new Set();


        features.forEach(
            function (feature) {

                var value =
                    feature.get(field);


                if (
                    value === null ||
                    value === undefined
                ) {

                    return;
                }


                var text =
                    String(value).trim();


                if (!text) {
                    return;
                }


                /*
                   Remove duplicate values
                   without changing the
                   original displayed value.
                */

                var key =
                    text.toLowerCase();


                if (
                    seen.has(key)
                ) {

                    return;
                }


                seen.add(key);

                values.push(text);

            }
        );


        return values;
    }


    /* ============================================================
       NATURAL SORT
       ============================================================ */

    function naturalSort(a, b) {

        var aText =
            String(a).trim();

        var bText =
            String(b).trim();


        var aNumber =
            Number(aText);

        var bNumber =
            Number(bText);


        var aIsNumber =
            aText !== "" &&
            isFinite(aNumber);


        var bIsNumber =
            bText !== "" &&
            isFinite(bNumber);


        /*
           Numeric values:
           1, 2, 3, 10, 20
        */

        if (
            aIsNumber &&
            bIsNumber
        ) {

            return aNumber -
                bNumber;
        }


        /*
           Numbers before text
           when mixed.
        */

        if (
            aIsNumber &&
            !bIsNumber
        ) {

            return -1;
        }


        if (
            !aIsNumber &&
            bIsNumber
        ) {

            return 1;
        }


        /*
           Alphabetical sorting.
        */

        return aText.localeCompare(
            bText,
            undefined,
            {
                numeric: true,
                sensitivity: "base"
            }
        );
    }


    /* ============================================================
       HIDE SUGGESTIONS
       ============================================================ */

    function hideSuggestions() {

        suggestionBox.style.display =
            "none";

        suggestionBox.innerHTML =
            "";
    }


    /* ============================================================
       SHOW SUGGESTIONS
       ============================================================ */

    function showSuggestions(
        values
    ) {

        suggestionBox.innerHTML =
            "";


        if (
            !values ||
            values.length === 0
        ) {

            hideSuggestions();

            return;
        }


        /*
           IMPORTANT:
           Maximum 10 suggestions.
        */

        var displayValues =
            values.slice(0, 10);


        displayValues.forEach(
            function (value) {

                var item =
                    document.createElement(
                        "div"
                    );


                item.textContent =
                    value;


                item.style.padding =
                    "8px 10px";


                item.style.cursor =
                    "pointer";


                item.style.fontSize =
                    "13px";


                item.style.borderBottom =
                    "1px solid #eee";


                item.style.whiteSpace =
                    "nowrap";


                item.style.overflow =
                    "hidden";


                item.style.textOverflow =
                    "ellipsis";


                item.addEventListener(
                    "mouseenter",
                    function () {

                        item.style.background =
                            "#f0f0f0";

                    }
                );


                item.addEventListener(
                    "mouseleave",
                    function () {

                        item.style.background =
                            "#ffffff";

                    }
                );


                /*
                   Select suggestion.
                */

                item.addEventListener(
                    "mousedown",
                    function (event) {

                        event.preventDefault();


                        valueInput.value =
                            value;


                        hideSuggestions();

                    }
                );


                suggestionBox.appendChild(
                    item
                );

            }
        );


        suggestionBox.style.display =
            "block";
    }


    /* ============================================================
       UPDATE SUGGESTIONS
       ============================================================ */

    function updateSuggestions() {

        var layer =
            getSelectedLayer();


        var field =
            fieldSelect.value;


        if (
            !layer ||
            !field
        ) {

            hideSuggestions();

            return;
        }


        /*
           IMPORTANT:
           Don't show suggestions until
           the user actually types.
        */

        var typed =
            valueInput.value
                .trim()
                .toLowerCase();


        if (!typed) {

            hideSuggestions();

            return;
        }


        var allValues =
            getFieldValues(
                layer,
                field
            );


        /*
           Sort all values first.
        */

        allValues.sort(
            naturalSort
        );


        /*
           Find values containing
           the typed text.
        */

        var filtered =
            allValues.filter(
                function (value) {

                    return String(value)
                        .toLowerCase()
                        .indexOf(typed) !== -1;

                }
            );


        /*
           Maximum 10 suggestions.
        */

        filtered =
            filtered.slice(0, 10);


        if (
            filtered.length === 0
        ) {

            hideSuggestions();

            return;
        }


        showSuggestions(
            filtered
        );
    }


    /* ============================================================
       LAYER CHANGE
       ============================================================ */

    layerSelect.addEventListener(
        "change",
        function () {

            stage6HighlightSource.clear();

            status.innerHTML = "";

            updateFieldList();

        }
    );


    /* ============================================================
       FIELD CHANGE
       ============================================================ */

    fieldSelect.addEventListener(
        "change",
        function () {

            valueInput.value =
                "";

            stage6HighlightSource.clear();

            status.innerHTML =
                "";

            hideSuggestions();

        }
    );


    /* ============================================================
       TYPING
       ============================================================ */

    valueInput.addEventListener(
        "input",
        function () {

            updateSuggestions();

        }
    );


    /* ============================================================
       FOCUS
       ============================================================ */

    valueInput.addEventListener(
        "focus",
        function () {

            /*
               Only show if there is already
               text in the box.
            */

            if (
                valueInput.value.trim()
            ) {

                updateSuggestions();
            }

        }
    );


    /* ============================================================
       BLUR
       ============================================================ */

    valueInput.addEventListener(
        "blur",
        function () {

            setTimeout(
                function () {

                    hideSuggestions();

                },
                200
            );

        }
    );


    /* ============================================================
       PERFORM SEARCH
       ============================================================ */

    function performSearch() {

        hideSuggestions();


        var layer =
            getSelectedLayer();


        var field =
            fieldSelect.value;


        var searchValue =
            valueInput.value.trim();


        stage6HighlightSource.clear();


        if (!layer) {

            status.innerHTML =
                "⚠ No vector layer selected.";

            return;
        }


        if (!field) {

            status.innerHTML =
                "⚠ Please select a field.";

            return;
        }


        if (!searchValue) {

            status.innerHTML =
                "⚠ Please enter a search value.";

            return;
        }


        var source =
            layer.getSource();


        var features =
            source.getFeatures();


        var searchLower =
            searchValue.toLowerCase();


        var exactMatches = [];

        var partialMatches = [];


        features.forEach(
            function (feature) {

                var value =
                    feature.get(field);


                if (
                    value === null ||
                    value === undefined
                ) {

                    return;
                }


                var text =
                    String(value).trim();


                var lower =
                    text.toLowerCase();


                /*
                   Exact match.
                */

                if (
                    lower ===
                    searchLower
                ) {

                    exactMatches.push(
                        feature
                    );

                    return;
                }


                /*
                   Partial match.
                */

                if (
                    lower.indexOf(
                        searchLower
                    ) !== -1
                ) {

                    partialMatches.push(
                        feature
                    );
                }

            }
        );


        /*
           Exact results have priority.
        */

        var matches =
            exactMatches.length > 0
                ? exactMatches
                : partialMatches;


        if (
            matches.length === 0
        ) {

            status.innerHTML =
                "❌ No matching features found.";

            return;
        }


        /* ========================================================
           HIGHLIGHT
           ======================================================== */

        var extent =
            ol.extent.createEmpty();


        matches.forEach(
            function (feature) {

                var clone =
                    feature.clone();


                stage6HighlightSource
                    .addFeature(
                        clone
                    );


                var geometry =
                    clone.getGeometry();


                if (geometry) {

                    ol.extent.extend(
                        extent,
                        geometry.getExtent()
                    );
                }

            }
        );


        /* ========================================================
           ZOOM
           ======================================================== */

        if (
            !ol.extent.isEmpty(
                extent
            )
        ) {

            var view =
                map.getView();


            if (
                matches.length === 1
            ) {

                view.fit(
                    extent,
                    {
                        padding: [
                            120,
                            120,
                            120,
                            120
                        ],

                        maxZoom: 19,

                        duration: 700
                    }
                );

            } else {

                view.fit(
                    extent,
                    {
                        padding: [
                            120,
                            120,
                            120,
                            120
                        ],

                        maxZoom: 17,

                        duration: 700
                    }
                );
            }

        }


        /* ========================================================
           STATUS
           ======================================================== */

        if (
            exactMatches.length > 0
        ) {

            status.innerHTML =
                "✅ " +
                exactMatches.length +
                " exact match" +
                (
                    exactMatches.length !== 1
                        ? "es"
                        : ""
                ) +
                " found.";

        } else {

            status.innerHTML =
                "🔎 " +
                partialMatches.length +
                " partial match" +
                (
                    partialMatches.length !== 1
                        ? "es"
                        : ""
                ) +
                " found.";
        }

    }


    /* ============================================================
       FIND BUTTON
       ============================================================ */

    findButton.addEventListener(
        "click",
        function () {

            performSearch();

        }
    );


    /* ============================================================
       CLEAR
       ============================================================ */

    clearButton.addEventListener(
        "click",
        function () {

            valueInput.value =
                "";

            stage6HighlightSource.clear();

            status.innerHTML =
                "";

            hideSuggestions();

        }
    );


    /* ============================================================
       ENTER KEY
       ============================================================ */

    valueInput.addEventListener(
        "keydown",
        function (event) {

            if (
                event.key === "Enter"
            ) {

                event.preventDefault();

                performSearch();

            }


            if (
                event.key === "Escape"
            ) {

                hideSuggestions();

            }

        }
    );


    /* ============================================================
       CLICK OUTSIDE
       ============================================================ */

    document.addEventListener(
        "mousedown",
        function (event) {

            if (
                !valueWrapper.contains(
                    event.target
                )
            ) {

                hideSuggestions();

            }

        }
    );


    /* ============================================================
       AUTOMATIC LAYER REFRESH
       ============================================================ */

    var previousLayerCount =
        -1;


    setInterval(
        function () {

            if (
                searchPanel.style.display ===
                "none"
            ) {

                return;
            }


            var layers =
                getSearchableLayers();


            if (
                layers.length !==
                previousLayerCount
            ) {

                previousLayerCount =
                    layers.length;

                refreshLayerList();

            }

        },
        1000
    );


    /* ============================================================
       INITIAL SETUP
       ============================================================ */

    setTimeout(
        function () {

            refreshLayerList();

        },
        500
    );


    console.log(
        "Stage 6 Search ready."
    );

})();