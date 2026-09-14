// ============================================================
// 🎨 DYNAMIC LAYER STYLE EDITOR
// QGIS2Web + OpenLayers
// ============================================================
// FEATURES
// ------------------------------------------------------------
// ✔ Automatic vector layer detection
// ✔ Single Symbol styling
// ✔ Categorized / Unique Value styling
// ✔ Automatic attribute field detection
// ✔ Automatic unique value detection
// ✔ Individual category colors
// ✔ Fill color
// ✔ Fill opacity
// ✔ Border color
// ✔ Border width
// ✔ Feature labels
// ✔ Label field
// ✔ Label color
// ✔ Label size
// ✔ Label rotation
// ✔ LocalStorage persistence
// ✔ Restore styles after page reload
// ✔ Reset layer style
// ✔ Mobile-friendly UI
// ✔ Works with QGIS2Web OpenLayers
// ============================================================


// ============================================================
// 1. GLOBAL VARIABLES
// ============================================================

var dynamicStyleEditor = {
    panel: null,
    layerSelect: null,
    styleTypeSelect: null,

    fillColor: null,
    fillOpacity: null,

    strokeColor: null,
    strokeWidth: null,

    categoryField: null,
    categoryContainer: null,

    labelEnabled: null,
    labelField: null,
    labelColor: null,
    labelSize: null,
    labelRotation: null,

    applyButton: null,
    resetButton: null,

    currentLayer: null
};


// ============================================================
// 2. LOCAL STORAGE KEY
// ============================================================

var DYNAMIC_STYLE_STORAGE_KEY = "QGIS2WEB_DYNAMIC_LAYER_STYLES_V1";


// ============================================================
// 3. STORAGE FUNCTIONS
// ============================================================

function getSavedStyles() {

    try {

        var saved = localStorage.getItem(DYNAMIC_STYLE_STORAGE_KEY);

        if (!saved) {
            return {};
        }

        return JSON.parse(saved);

    } catch (e) {

        console.error(
            "Dynamic Style Editor: Unable to read localStorage",
            e
        );

        return {};
    }
}


function saveAllStyles(styles) {

    try {

        localStorage.setItem(
            DYNAMIC_STYLE_STORAGE_KEY,
            JSON.stringify(styles)
        );

    } catch (e) {

        console.error(
            "Dynamic Style Editor: Unable to save localStorage",
            e
        );
    }
}


// ============================================================
// 4. GET VECTOR LAYERS
// ============================================================
// ============================================================
// 4. GET VECTOR LAYERS
// ============================================================

function getVectorLayers() {

    var layers = [];

    if (!map) {
        return layers;
    }

    /*
     * Keep track of layers already added.
     * This prevents the same layer from appearing
     * multiple times in the dropdown.
     */
    var seenLayers = [];

    map.getLayers().forEach(function(layer) {

        if (
            !(
                layer instanceof ol.layer.Vector ||
                layer instanceof ol.layer.VectorImage
            )
        ) {
            return;
        }


        // ----------------------------------------------------
        // Ignore internal QGIS2Web/helper layers
        // ----------------------------------------------------

        var excluded = [
            "featureOverlay",
            "measureLayer",
            "geolocateOverlay",
            "stage14MeasureLayer",
            "stage14SnapLayer"
        ];


        var title =
            layer.get("title") ||
            layer.get("name") ||
            layer.get("layerName") ||
            layer.get("popuplayertitle") ||
            "";


        if (
            excluded.indexOf(title) !== -1
        ) {
            return;
        }


        // ----------------------------------------------------
        // Must have a source
        // ----------------------------------------------------

        var source =
            layer.getSource();

        if (!source) {
            return;
        }


        // ----------------------------------------------------
        // Must contain features
        // ----------------------------------------------------

        if (
            typeof source.getFeatures !==
            "function"
        ) {
            return;
        }


        var features =
            source.getFeatures();

        if (
            !features ||
            features.length === 0
        ) {
            return;
        }


        // ----------------------------------------------------
        // Get layer name
        // ----------------------------------------------------

        var layerName =
            getLayerName(layer);


        if (
            !layerName ||
            layerName === "Layer"
        ) {
            return;
        }


        // ----------------------------------------------------
        // Prevent duplicate layers
        // ----------------------------------------------------

        var duplicate =
            false;


        for (
            var i = 0;
            i < seenLayers.length;
            i++
        ) {

            var existing =
                seenLayers[i];


            /*
             * First compare the actual layer object.
             */

            if (
                existing.layer === layer
            ) {

                duplicate = true;

                break;
            }


            /*
             * Then compare layer name + source.
             *
             * This catches QGIS2Web duplicate
             * layer references.
             */

            var existingSource =
                existing.layer.getSource();


            var sameSource =
                existingSource === source;


            var sameName =
                getLayerName(
                    existing.layer
                ) === layerName;


            if (
                sameSource &&
                sameName
            ) {

                duplicate = true;

                break;
            }
        }


        if (duplicate) {
            return;
        }


        // ----------------------------------------------------
        // Add layer
        // ----------------------------------------------------

        seenLayers.push({
            layer: layer
        });


        layers.push(layer);

    });


    return layers;
}



// ============================================================
// 5. GET LAYER NAME
// ============================================================

function getLayerName(layer) {

    if (!layer) {
        return "Layer";
    }

    return (
        layer.get("popuplayertitle") ||
        layer.get("title") ||
        layer.get("name") ||
        layer.get("layerName") ||
        "Layer"
    );
}


// ============================================================
// 6. CREATE STABLE LAYER KEY
// ============================================================

function getLayerKey(layer) {

    var name = getLayerName(layer);

    var source = layer.getSource();

    var url = "";

    if (
        source &&
        typeof source.getUrl === "function"
    ) {

        try {
            url = source.getUrl() || "";
        } catch (e) {
            url = "";
        }
    }

    return name + "|" + url;
}


// ============================================================
// 7. GET FEATURE FIELDS
// ============================================================

function getLayerFields(layer) {

    var fields = [];

    if (!layer || !layer.getSource()) {
        return fields;
    }

    var features =
        layer.getSource().getFeatures();

    if (!features || features.length === 0) {
        return fields;
    }

    features.some(function(feature) {

        var properties =
            feature.getProperties();

        Object.keys(properties).forEach(function(key) {

            if (
                key !== "geometry" &&
                key !== "layerObject" &&
                key !== "idO"
            ) {

                if (fields.indexOf(key) === -1) {
                    fields.push(key);
                }
            }

        });

        return fields.length > 0;
    });

    return fields.sort();
}


// ============================================================
// 8. GET UNIQUE VALUES
// ============================================================

function getUniqueValues(layer, field) {

    var values = [];

    if (
        !layer ||
        !layer.getSource() ||
        !field
    ) {
        return values;
    }

    var features =
        layer.getSource().getFeatures();

    var valueMap = {};

    features.forEach(function(feature) {

        var value = feature.get(field);

        if (
            value !== undefined &&
            value !== null &&
            String(value).trim() !== ""
        ) {

            var text = String(value);

            if (!valueMap[text]) {

                valueMap[text] = true;
                values.push(text);
            }
        }

    });

    return values.sort(function(a, b) {

        return a.localeCompare(b, undefined, {
            numeric: true,
            sensitivity: "base"
        });

    });
}


// ============================================================
// 9. RANDOM COLOR
// ============================================================

function randomColor(index) {

    var colors = [

        "#e6194b",
        "#3cb44b",
        "#ffe119",
        "#4363d8",
        "#f58231",
        "#911eb4",
        "#46f0f0",
        "#f032e6",
        "#bcf60c",
        "#fabebe",
        "#008080",
        "#e6beff",
        "#9a6324",
        "#fffac8",
        "#800000",
        "#aaffc3",
        "#808000",
        "#ffd8b1",
        "#000075",
        "#808080",
        "#42d4f4",
        "#bfef45",
        "#469990",
        "#dcbeff",
        "#9A6324",
        "#800000"

    ];

    return colors[index % colors.length];
}


// ============================================================
// 10. HEX → RGBA
// ============================================================

function hexToRgba(hex, opacity) {

    if (!hex) {
        hex = "#ffffff";
    }

    hex = hex.replace("#", "");

    if (hex.length === 3) {

        hex =
            hex[0] + hex[0] +
            hex[1] + hex[1] +
            hex[2] + hex[2];
    }

    var r =
        parseInt(hex.substring(0, 2), 16);

    var g =
        parseInt(hex.substring(2, 4), 16);

    var b =
        parseInt(hex.substring(4, 6), 16);

    return "rgba(" +
        r + "," +
        g + "," +
        b + "," +
        opacity +
        ")";
}


// ============================================================
// 11. CREATE PANEL
// ============================================================

function createDynamicStylePanel() {

    if (
        document.getElementById(
            "dynamic-style-editor-panel"
        )
    ) {
        return;
    }


    // --------------------------------------------------------
    // PANEL
    // --------------------------------------------------------

    var panel =
        document.createElement("div");

    panel.id =
        "dynamic-style-editor-panel";

    panel.innerHTML = `

        <div id="dynamic-style-header">

            <span>
                🎨 Layer Style Editor
            </span>

            <button
                id="dynamic-style-close"
                type="button">
                ×
            </button>

        </div>


        <div id="dynamic-style-content">

            <label>
                Layer
            </label>

            <select
                id="dynamic-style-layer">
            </select>


            <label>
                Style Type
            </label>

            <select
                id="dynamic-style-type">

                <option value="single">
                    Single Symbol
                </option>

                <option value="categorized">
                    Categorized / Unique Value
                </option>

            </select>


            <div class="style-section">

                <div class="style-section-title">
                    🎨 Fill
                </div>


                <label>
                    Fill Color
                </label>

                <input
                    type="color"
                    id="dynamic-fill-color"
                    value="#4CAF50"
                >


                <label>
                    Fill Opacity
                </label>

                <div class="range-row">

                    <input
                        type="range"
                        id="dynamic-fill-opacity"
                        min="0"
                        max="1"
                        step="0.01"
                        value="0.45"
                    >

                    <span
                        id="dynamic-fill-opacity-value">
                        45%
                    </span>

                </div>

            </div>


            <div class="style-section">

                <div class="style-section-title">
                    🖊 Border
                </div>


                <label>
                    Border Color
                </label>

                <input
                    type="color"
                    id="dynamic-stroke-color"
                    value="#000000"
                >


                <label>
                    Border Width
                </label>

                <input
                    type="number"
                    id="dynamic-stroke-width"
                    min="0"
                    max="20"
                    step="0.5"
                    value="1"
                >

            </div>


            <div
                id="dynamic-category-section"
                class="style-section">

                <div class="style-section-title">
                    🏷 Categorized Styling
                </div>


                <label>
                    Category Field
                </label>

                <select
                    id="dynamic-category-field">
                </select>


                <div
                    id="dynamic-category-container">
                </div>

            </div>


            <div class="style-section">

                <div class="style-section-title">
                    🔤 Labels
                </div>


                <label class="checkbox-row">

                    <input
                        type="checkbox"
                        id="dynamic-label-enabled"
                    >

                    <span>
                        Show Labels
                    </span>

                </label>


                <label>
                    Label Field
                </label>

                <select
                    id="dynamic-label-field">
                </select>


                <label>
                    Label Color
                </label>

                <input
                    type="color"
                    id="dynamic-label-color"
                    value="#000000"
                >


                <label>
                    Label Size
                </label>

                <input
                    type="number"
                    id="dynamic-label-size"
                    min="6"
                    max="50"
                    step="1"
                    value="12"
                >


                <label>
                    Label Rotation
                </label>

                <input
                    type="number"
                    id="dynamic-label-rotation"
                    min="-180"
                    max="180"
                    step="1"
                    value="0"
                >

            </div>


            <div class="dynamic-style-buttons">

                <button
                    id="dynamic-style-apply"
                    type="button">
                    ✓ Apply & Save
                </button>


                <button
                    id="dynamic-style-reset"
                    type="button">
                    ↺ Reset
                </button>

            </div>


            <div
                id="dynamic-style-status">
            </div>

        </div>
    `;


    document.body.appendChild(panel);

    dynamicStyleEditor.panel = panel;


    // --------------------------------------------------------
    // GET ELEMENTS
    // --------------------------------------------------------

    dynamicStyleEditor.layerSelect =
        document.getElementById(
            "dynamic-style-layer"
        );

    dynamicStyleEditor.styleTypeSelect =
        document.getElementById(
            "dynamic-style-type"
        );

    dynamicStyleEditor.fillColor =
        document.getElementById(
            "dynamic-fill-color"
        );

    dynamicStyleEditor.fillOpacity =
        document.getElementById(
            "dynamic-fill-opacity"
        );

    dynamicStyleEditor.strokeColor =
        document.getElementById(
            "dynamic-stroke-color"
        );

    dynamicStyleEditor.strokeWidth =
        document.getElementById(
            "dynamic-stroke-width"
        );

    dynamicStyleEditor.categoryField =
        document.getElementById(
            "dynamic-category-field"
        );

    dynamicStyleEditor.categoryContainer =
        document.getElementById(
            "dynamic-category-container"
        );

    dynamicStyleEditor.labelEnabled =
        document.getElementById(
            "dynamic-label-enabled"
        );

    dynamicStyleEditor.labelField =
        document.getElementById(
            "dynamic-label-field"
        );

    dynamicStyleEditor.labelColor =
        document.getElementById(
            "dynamic-label-color"
        );

    dynamicStyleEditor.labelSize =
        document.getElementById(
            "dynamic-label-size"
        );

    dynamicStyleEditor.labelRotation =
        document.getElementById(
            "dynamic-label-rotation"
        );

    dynamicStyleEditor.applyButton =
        document.getElementById(
            "dynamic-style-apply"
        );

    dynamicStyleEditor.resetButton =
        document.getElementById(
            "dynamic-style-reset"
        );


    // --------------------------------------------------------
    // EVENTS
    // --------------------------------------------------------

    dynamicStyleEditor.layerSelect
        .addEventListener(
            "change",
            function() {

                var index =
                    parseInt(
                        this.value,
                        10
                    );

                var layers =
                    getVectorLayers();

                dynamicStyleEditor.currentLayer =
                    layers[index];

                loadLayer(
                    dynamicStyleEditor.currentLayer
                );
            }
        );


    dynamicStyleEditor.styleTypeSelect
        .addEventListener(
            "change",
            function() {

                updateCategoryVisibility();

                if (
                    this.value ===
                    "categorized"
                ) {

                    populateCategoryValues();
                }
            }
        );


    dynamicStyleEditor.categoryField
        .addEventListener(
            "change",
            function() {

                populateCategoryValues();
            }
        );


    dynamicStyleEditor.fillOpacity
        .addEventListener(
            "input",
            function() {

                document.getElementById(
                    "dynamic-fill-opacity-value"
                ).textContent =
                    Math.round(
                        parseFloat(
                            this.value
                        ) * 100
                    ) + "%";
            }
        );


    dynamicStyleEditor.applyButton
        .addEventListener(
            "click",
            function() {

                applyCurrentStyle();
            }
        );


    dynamicStyleEditor.resetButton
        .addEventListener(
            "click",
            function() {

                resetCurrentStyle();
            }
        );


    document.getElementById(
        "dynamic-style-close"
    ).addEventListener(
        "click",
        function() {

            closeDynamicStyleEditor();
        }
    );


    // Initial population

    populateLayers();

    updateCategoryVisibility();
}


// ============================================================
// 12. POPULATE LAYERS
// ============================================================

function populateLayers() {

    var select =
        dynamicStyleEditor.layerSelect;

    if (!select) {
        return;
    }

    select.innerHTML = "";

    var layers =
        getVectorLayers();

    layers.forEach(
        function(layer, index) {

            var option =
                document.createElement("option");

            option.value = index;

            option.textContent =
                getLayerName(layer);

            select.appendChild(option);
        }
    );


    if (layers.length > 0) {

        dynamicStyleEditor.currentLayer =
            layers[0];

        select.value = "0";

        loadLayer(layers[0]);
    }
}


// ============================================================
// 13. POPULATE FIELDS
// ============================================================

function populateFields(layer) {

    var fields =
        getLayerFields(layer);


    // --------------------------------------------------------
    // LABEL FIELD
    // --------------------------------------------------------

    var labelSelect =
        dynamicStyleEditor.labelField;

    labelSelect.innerHTML = "";

    var blankLabel =
        document.createElement("option");

    blankLabel.value = "";

    blankLabel.textContent =
        "-- Select Label Field --";

    labelSelect.appendChild(
        blankLabel
    );


    fields.forEach(
        function(field) {

            var option =
                document.createElement("option");

            option.value = field;

            option.textContent = field;

            labelSelect.appendChild(
                option
            );
        }
    );


    // --------------------------------------------------------
    // CATEGORY FIELD
    // --------------------------------------------------------

    var categorySelect =
        dynamicStyleEditor.categoryField;

    categorySelect.innerHTML = "";

    var blankCategory =
        document.createElement("option");

    blankCategory.value = "";

    blankCategory.textContent =
        "-- Select Category Field --";

    categorySelect.appendChild(
        blankCategory
    );


    fields.forEach(
        function(field) {

            var option =
                document.createElement("option");

            option.value = field;

            option.textContent = field;

            categorySelect.appendChild(
                option
            );
        }
    );
}


// ============================================================
// 14. POPULATE CATEGORY VALUES
// ============================================================

function populateCategoryValues() {

    var layer =
        dynamicStyleEditor.currentLayer;

    if (!layer) {
        return;
    }

    var field =
        dynamicStyleEditor.categoryField.value;

    var container =
        dynamicStyleEditor.categoryContainer;

    container.innerHTML = "";


    if (!field) {

        return;
    }


    var values =
        getUniqueValues(
            layer,
            field
        );


    var saved =
        getSavedStyles();

    var layerKey =
        getLayerKey(layer);

    var savedStyle =
        saved[layerKey] || {};

    var savedColors =
        savedStyle.categoryColors || {};


    values.forEach(
        function(value, index) {

            var row =
                document.createElement("div");

            row.className =
                "category-row";


            var label =
                document.createElement("span");

            label.className =
                "category-name";

            label.textContent =
                value;


            var color =
                document.createElement("input");

            color.type =
                "color";

            color.className =
                "category-color";

            color.dataset.value =
                value;


            if (
                savedColors[value]
            ) {

                color.value =
                    savedColors[value];

            } else {

                color.value =
                    randomColor(index);
            }


            row.appendChild(label);

            row.appendChild(color);

            container.appendChild(row);
        }
    );
}


// ============================================================
// 15. CATEGORY VISIBILITY
// ============================================================

function updateCategoryVisibility() {

    var section =
        document.getElementById(
            "dynamic-category-section"
        );

    if (
        dynamicStyleEditor.styleTypeSelect.value ===
        "categorized"
    ) {

        section.style.display =
            "block";

        populateCategoryValues();

    } else {

        section.style.display =
            "none";
    }
}


// ============================================================
// 16. GET CURRENT STYLE CONFIG
// ============================================================

function getCurrentStyleConfig() {

    var config = {

        styleType:
            dynamicStyleEditor.styleTypeSelect.value,

        fillColor:
            dynamicStyleEditor.fillColor.value,

        fillOpacity:
            parseFloat(
                dynamicStyleEditor.fillOpacity.value
            ),

        strokeColor:
            dynamicStyleEditor.strokeColor.value,

        strokeWidth:
            parseFloat(
                dynamicStyleEditor.strokeWidth.value
            ),

        categoryField:
            dynamicStyleEditor.categoryField.value,

        categoryColors: {},

        labelEnabled:
            dynamicStyleEditor.labelEnabled.checked,

        labelField:
            dynamicStyleEditor.labelField.value,

        labelColor:
            dynamicStyleEditor.labelColor.value,

        labelSize:
            parseFloat(
                dynamicStyleEditor.labelSize.value
            ),

        labelRotation:
            parseFloat(
                dynamicStyleEditor.labelRotation.value
            )
    };


    // --------------------------------------------------------
    // CATEGORY COLORS
    // --------------------------------------------------------

    var categoryInputs =
        dynamicStyleEditor.categoryContainer
            .querySelectorAll(
                ".category-color"
            );


    categoryInputs.forEach(
        function(input) {

            config.categoryColors[
                input.dataset.value
            ] = input.value;

        }
    );


    return config;
}


// ============================================================
// 17. APPLY STYLE TO LAYER
// ============================================================

function applyStyleConfig(
    layer,
    config
) {

    if (!layer) {
        return;
    }


    if (!config) {
        return;
    }


    // --------------------------------------------------------
    // FORCE DECLUTTER OFF
    // --------------------------------------------------------
    // This helps labels display on QGIS2Web layers.
    // --------------------------------------------------------

    if (
        typeof layer.setDeclutter ===
        "function"
    ) {

        layer.setDeclutter(false);
    }


    if (
        config.styleType ===
        "categorized"
    ) {

        layer.setStyle(
            createCategorizedStyle(
                config
            )
        );

    } else {

        layer.setStyle(
            createSingleStyle(
                config
            )
        );
    }


    // Force redraw

    if (
        layer.getSource() &&
        typeof layer.getSource()
            .changed === "function"
    ) {

        layer.getSource().changed();
    }


    if (
        typeof layer.changed ===
        "function"
    ) {

        layer.changed();
    }


    if (
        typeof map.renderSync ===
        "function"
    ) {

        map.renderSync();
    }
}


// ============================================================
// 18. CREATE SINGLE SYMBOL STYLE
// ============================================================

function createSingleStyle(config) {

    return function(
        feature,
        resolution
    ) {


        // ----------------------------------------------------
        // FILL
        // ----------------------------------------------------

        var fill =
            new ol.style.Fill({

                color: hexToRgba(
                    config.fillColor,
                    config.fillOpacity
                )
            });


        // ----------------------------------------------------
        // STROKE
        // ----------------------------------------------------

        var stroke =
            new ol.style.Stroke({

                color:
                    config.strokeColor,

                width:
                    config.strokeWidth
            });


        // ----------------------------------------------------
        // STYLE OPTIONS
        // ----------------------------------------------------

        var styleOptions = {

            fill: fill,

            stroke: stroke
        };


        // ====================================================
        // 🔤 LABEL
        // ====================================================

        if (
            config.labelEnabled &&
            config.labelField
        ) {

            var labelValue =
                feature.get(
                    config.labelField
                );


            // ------------------------------------------------
            // ONLY CREATE LABEL IF VALUE EXISTS
            // ------------------------------------------------

            if (
                labelValue !== undefined &&
                labelValue !== null &&
                String(labelValue).trim() !== ""
            ) {


                var text =
                    new ol.style.Text({

                        // IMPORTANT:
                        // Use actual text value here.
                        // DO NOT use a function.
                        text:
                            String(labelValue),

                        font:
                            config.labelSize +
                            "px Arial",

                        fill:
                            new ol.style.Fill({

                                color:
                                    config.labelColor
                            }),

                        stroke:
                            new ol.style.Stroke({

                                color:
                                    "#ffffff",

                                width:
                                    3
                            }),

                        textAlign:
                            "center",

                        textBaseline:
                            "middle",

                        placement:
                            "point",

                        overflow:
                            true,

                        rotation:
                            (
                                config.labelRotation *
                                Math.PI
                            ) / 180
                    });


                styleOptions.text =
                    text;
            }
        }


        // ----------------------------------------------------
        // RETURN STYLE
        // ----------------------------------------------------

        return new ol.style.Style(
            styleOptions
        );
    };
}


// ============================================================
// 19. CREATE CATEGORIZED STYLE
// ============================================================

function createCategorizedStyle(config) {

    return function(
        feature,
        resolution
    ) {


        // ----------------------------------------------------
        // GET CATEGORY VALUE
        // ----------------------------------------------------

        var categoryValue =
            feature.get(
                config.categoryField
            );


        var categoryText =
            categoryValue === undefined ||
            categoryValue === null
                ? ""
                : String(categoryValue);


        // ----------------------------------------------------
        // GET CATEGORY COLOR
        // ----------------------------------------------------

        var fillColor =
            config.categoryColors[
                categoryText
            ];


        // Fallback

        if (!fillColor) {

            fillColor =
                config.fillColor;
        }


        // ----------------------------------------------------
        // FILL
        // ----------------------------------------------------

        var fill =
            new ol.style.Fill({

                color:
                    hexToRgba(
                        fillColor,
                        config.fillOpacity
                    )
            });


        // ----------------------------------------------------
        // STROKE
        // ----------------------------------------------------

        var stroke =
            new ol.style.Stroke({

                color:
                    config.strokeColor,

                width:
                    config.strokeWidth
            });


        // ----------------------------------------------------
        // STYLE OPTIONS
        // ----------------------------------------------------

        var styleOptions = {

            fill: fill,

            stroke: stroke
        };


        // ====================================================
        // 🔤 LABEL
        // ====================================================

        if (
            config.labelEnabled &&
            config.labelField
        ) {

            var labelValue =
                feature.get(
                    config.labelField
                );


            if (
                labelValue !== undefined &&
                labelValue !== null &&
                String(labelValue).trim() !== ""
            ) {


                var text =
                    new ol.style.Text({

                        // IMPORTANT
                        // Actual feature value
                        text:
                            String(labelValue),

                        font:
                            config.labelSize +
                            "px Arial",

                        fill:
                            new ol.style.Fill({

                                color:
                                    config.labelColor
                            }),

                        stroke:
                            new ol.style.Stroke({

                                color:
                                    "#ffffff",

                                width:
                                    3
                            }),

                        textAlign:
                            "center",

                        textBaseline:
                            "middle",

                        placement:
                            "point",

                        overflow:
                            true,

                        rotation:
                            (
                                config.labelRotation *
                                Math.PI
                            ) / 180
                    });


                styleOptions.text =
                    text;
            }
        }


        // ----------------------------------------------------
        // RETURN STYLE
        // ----------------------------------------------------

        return new ol.style.Style(
            styleOptions
        );
    };
}


// ============================================================
// 20. APPLY CURRENT STYLE
// ============================================================

function applyCurrentStyle() {

    var layer =
        dynamicStyleEditor.currentLayer;

    if (!layer) {

        showStyleStatus(
            "No vector layer selected.",
            true
        );

        return;
    }


    var config =
        getCurrentStyleConfig();


    // --------------------------------------------------------
    // APPLY
    // --------------------------------------------------------

    applyStyleConfig(
        layer,
        config
    );


    // --------------------------------------------------------
    // SAVE
    // --------------------------------------------------------

    var saved =
        getSavedStyles();

    var key =
        getLayerKey(layer);

    saved[key] =
        config;

    saveAllStyles(
        saved
    );


    showStyleStatus(
        "✓ Style applied and saved.",
        false
    );
}


// ============================================================
// 21. LOAD LAYER
// ============================================================

function loadLayer(layer) {

    if (!layer) {
        return;
    }


    dynamicStyleEditor.currentLayer =
        layer;


    // --------------------------------------------------------
    // FIELDS
    // --------------------------------------------------------

    populateFields(layer);


    // --------------------------------------------------------
    // DEFAULT VALUES
    // --------------------------------------------------------

    dynamicStyleEditor.styleTypeSelect.value =
        "single";

    dynamicStyleEditor.fillColor.value =
        "#4CAF50";

    dynamicStyleEditor.fillOpacity.value =
        "0.45";

    dynamicStyleEditor.strokeColor.value =
        "#000000";

    dynamicStyleEditor.strokeWidth.value =
        "1";

    dynamicStyleEditor.labelEnabled.checked =
        false;

    dynamicStyleEditor.labelColor.value =
        "#000000";

    dynamicStyleEditor.labelSize.value =
        "12";

    dynamicStyleEditor.labelRotation.value =
        "0";

    dynamicStyleEditor.categoryField.value =
        "";

    dynamicStyleEditor.labelField.value =
        "";


    document.getElementById(
        "dynamic-fill-opacity-value"
    ).textContent = "45%";


    // --------------------------------------------------------
    // LOAD SAVED STYLE
    // --------------------------------------------------------

    var saved =
        getSavedStyles();

    var key =
        getLayerKey(layer);

    var config =
        saved[key];


    if (config) {

        if (config.styleType) {

            dynamicStyleEditor
                .styleTypeSelect
                .value =
                config.styleType;
        }


        if (config.fillColor) {

            dynamicStyleEditor
                .fillColor
                .value =
                config.fillColor;
        }


        if (
            config.fillOpacity !== undefined
        ) {

            dynamicStyleEditor
                .fillOpacity
                .value =
                config.fillOpacity;

            document.getElementById(
                "dynamic-fill-opacity-value"
            ).textContent =
                Math.round(
                    config.fillOpacity *
                    100
                ) + "%";
        }


        if (config.strokeColor) {

            dynamicStyleEditor
                .strokeColor
                .value =
                config.strokeColor;
        }


        if (
            config.strokeWidth !== undefined
        ) {

            dynamicStyleEditor
                .strokeWidth
                .value =
                config.strokeWidth;
        }


        if (config.categoryField) {

            dynamicStyleEditor
                .categoryField
                .value =
                config.categoryField;
        }


        if (
            config.labelEnabled !== undefined
        ) {

            dynamicStyleEditor
                .labelEnabled
                .checked =
                config.labelEnabled;
        }


        if (config.labelField) {

            dynamicStyleEditor
                .labelField
                .value =
                config.labelField;
        }


        if (config.labelColor) {

            dynamicStyleEditor
                .labelColor
                .value =
                config.labelColor;
        }


        if (
            config.labelSize !== undefined
        ) {

            dynamicStyleEditor
                .labelSize
                .value =
                config.labelSize;
        }


        if (
            config.labelRotation !== undefined
        ) {

            dynamicStyleEditor
                .labelRotation
                .value =
                config.labelRotation;
        }


        updateCategoryVisibility();


        if (
            config.styleType ===
            "categorized"
        ) {

            populateCategoryValues();
        }


        // Apply saved style immediately

        applyStyleConfig(
            layer,
            config
        );


        return;
    }


    // --------------------------------------------------------
    // NO SAVED STYLE
    // --------------------------------------------------------

    updateCategoryVisibility();
}


// ============================================================
// 22. RESET CURRENT STYLE
// ============================================================

function resetCurrentStyle() {

    var layer =
        dynamicStyleEditor.currentLayer;

    if (!layer) {
        return;
    }


    // --------------------------------------------------------
    // REMOVE SAVED STYLE
    // --------------------------------------------------------

    var saved =
        getSavedStyles();

    var key =
        getLayerKey(layer);

    delete saved[key];

    saveAllStyles(
        saved
    );


    // --------------------------------------------------------
    // RESTORE ORIGINAL QGIS2WEB STYLE
    // --------------------------------------------------------

    layer.setStyle(null);


    if (
        layer.getSource() &&
        typeof layer.getSource()
            .changed === "function"
    ) {

        layer.getSource().changed();
    }


    if (
        typeof layer.changed ===
        "function"
    ) {

        layer.changed();
    }


    if (
        typeof map.renderSync ===
        "function"
    ) {

        map.renderSync();
    }


    // --------------------------------------------------------
    // RELOAD CONTROLS
    // --------------------------------------------------------

    loadLayer(layer);


    showStyleStatus(
        "↺ Style reset.",
        false
    );
}


// ============================================================
// 23. STATUS MESSAGE
// ============================================================

function showStyleStatus(
    message,
    error
) {

    var status =
        document.getElementById(
            "dynamic-style-status"
        );

    if (!status) {
        return;
    }

    status.textContent =
        message;

    status.style.color =
        error
            ? "#d32f2f"
            : "#2e7d32";


    setTimeout(
        function() {

            status.textContent = "";

        },
        3000
    );
}


// ============================================================
// 24. OPEN EDITOR
// ============================================================

function openDynamicStyleEditor() {

    if (
        !document.getElementById(
            "dynamic-style-editor-panel"
        )
    ) {

        createDynamicStylePanel();
    }


    populateLayers();


    dynamicStyleEditor.panel.style.display =
        "block";
}


// ============================================================
// 25. CLOSE EDITOR
// ============================================================

function closeDynamicStyleEditor() {

    if (
        dynamicStyleEditor.panel
    ) {

        dynamicStyleEditor.panel.style.display =
            "none";
    }
}


// ============================================================
// 26. RESTORE ALL SAVED STYLES
// ============================================================

function restoreAllSavedStyles() {

    var saved =
        getSavedStyles();

    var layers =
        getVectorLayers();


    layers.forEach(
        function(layer) {

            var key =
                getLayerKey(layer);

            var config =
                saved[key];


            if (config) {

                applyStyleConfig(
                    layer,
                    config
                );
            }

        }
    );
}


// ============================================================
// 27. CREATE TOOL BUTTON
// ============================================================

function createDynamicStyleButton() {

    if (
        document.getElementById(
            "dynamic-style-open-button"
        )
    ) {
        return;
    }


    var button =
        document.createElement("button");

    button.id =
        "dynamic-style-open-button";

    button.type =
        "button";

    button.innerHTML =
        "🎨";


    button.title =
        "Layer Style Editor";


    button.addEventListener(
        "click",
        function() {

            openDynamicStyleEditor();

        }
    );


    document.body.appendChild(
        button
    );
}


// ============================================================
// 28. MOBILE / DESKTOP CSS
// ============================================================

function addDynamicStyleEditorCSS() {

    if (
        document.getElementById(
            "dynamic-style-editor-css"
        )
    ) {
        return;
    }


    var style =
        document.createElement("style");

    style.id =
        "dynamic-style-editor-css";


    style.textContent = `

/* ==========================================================
   STYLE EDITOR PANEL
   ========================================================== */

#dynamic-style-editor-panel {

    position: fixed;

    top: 70px;

    right: 15px;

    width: 330px;

    max-width: calc(100vw - 30px);

    max-height: calc(100vh - 90px);

    background: rgba(255,255,255,0.98);

    border-radius: 12px;

    box-shadow:
        0 4px 20px rgba(0,0,0,0.30);

    z-index: 999999;

    overflow: hidden;

    display: none;

    font-family:
        Arial,
        sans-serif;
}


/* ==========================================================
   HEADER
   ========================================================== */

#dynamic-style-header {

    display: flex;

    align-items: center;

    justify-content: space-between;

    background: #263238;

    color: white;

    padding: 12px 14px;

    font-size: 15px;

    font-weight: bold;
}


#dynamic-style-close {

    border: none;

    background: transparent;

    color: white;

    font-size: 25px;

    line-height: 20px;

    cursor: pointer;

    padding: 0;

    width: 30px;

    height: 30px;
}


/* ==========================================================
   CONTENT
   ========================================================== */

#dynamic-style-content {

    padding: 12px;

    overflow-y: auto;

    max-height:
        calc(100vh - 145px);
}


#dynamic-style-content label {

    display: block;

    font-size: 13px;

    font-weight: bold;

    margin-top: 10px;

    margin-bottom: 5px;

    color: #37474f;
}


#dynamic-style-content select,

#dynamic-style-content input[type="number"] {

    width: 100%;

    box-sizing: border-box;

    padding: 8px;

    border: 1px solid #b0bec5;

    border-radius: 6px;

    background: white;

    font-size: 13px;
}


#dynamic-style-content input[type="color"] {

    width: 100%;

    height: 38px;

    padding: 2px;

    border: 1px solid #b0bec5;

    border-radius: 6px;

    background: white;

    cursor: pointer;
}


/* ==========================================================
   RANGE
   ========================================================== */

.range-row {

    display: flex;

    align-items: center;

    gap: 8px;
}


.range-row input {

    flex: 1;
}


.range-row span {

    width: 45px;

    text-align: right;

    font-size: 12px;

    font-weight: bold;
}


/* ==========================================================
   SECTIONS
   ========================================================== */

.style-section {

    margin-top: 12px;

    padding: 10px;

    border: 1px solid #d0d7da;

    border-radius: 8px;

    background: #fafafa;
}


.style-section-title {

    font-weight: bold;

    color: #263238;

    margin-bottom: 8px;

    font-size: 14px;
}


/* ==========================================================
   CHECKBOX
   ========================================================== */

.checkbox-row {

    display: flex !important;

    align-items: center;

    gap: 8px;

    cursor: pointer;
}


.checkbox-row input {

    width: 18px;

    height: 18px;

    margin: 0;
}


/* ==========================================================
   CATEGORY ROW
   ========================================================== */

.category-row {

    display: flex;

    align-items: center;

    justify-content: space-between;

    gap: 8px;

    margin-top: 6px;

    padding: 5px;

    background: white;

    border-radius: 5px;

    border: 1px solid #e0e0e0;
}


.category-name {

    flex: 1;

    overflow: hidden;

    text-overflow: ellipsis;

    white-space: nowrap;

    font-size: 12px;
}


.category-color {

    width: 45px !important;

    height: 30px !important;

    flex-shrink: 0;
}


/* ==========================================================
   BUTTONS
   ========================================================== */

.dynamic-style-buttons {

    display: flex;

    gap: 8px;

    margin-top: 15px;
}


.dynamic-style-buttons button {

    flex: 1;

    border: none;

    border-radius: 7px;

    padding: 10px 8px;

    font-weight: bold;

    cursor: pointer;

    font-size: 13px;
}


#dynamic-style-apply {

    background: #2e7d32;

    color: white;
}


#dynamic-style-reset {

    background: #eceff1;

    color: #263238;
}


/* ==========================================================
   STATUS
   ========================================================== */

#dynamic-style-status {

    text-align: center;

    font-size: 12px;

    font-weight: bold;

    min-height: 18px;

    margin-top: 8px;
}




/* ==========================================================
   MOBILE
   ========================================================== */

@media (max-width: 600px) {

    #dynamic-style-editor-panel {

        top: 50px;

        left: 8px;

        right: 8px;

        width: auto;

        max-width: none;

        max-height:
            calc(100vh - 65px);

        border-radius: 10px;
    }


    #dynamic-style-content {

        max-height:
            calc(100vh - 120px);

        padding: 10px;
    }


  


    #dynamic-style-content select,

    #dynamic-style-content input[type="number"] {

        padding: 9px;

        font-size: 14px;
    }


    .style-section {

        padding: 9px;
    }

}


/* ==========================================================
   VERY SMALL PHONES
   ========================================================== */

@media (max-width: 380px) {

    #dynamic-style-editor-panel {

        left: 5px;

        right: 5px;
    }


    #dynamic-style-header {

        padding: 10px;
    }


    #dynamic-style-content {

        padding: 8px;
    }

}

`;


    document.head.appendChild(
        style
    );
}


// ============================================================
// 29. INITIALIZE
// ============================================================

function initializeDynamicStyleEditor() {

    addDynamicStyleEditorCSS();

    createDynamicStylePanel();

    createDynamicStyleButton();


    // --------------------------------------------------------
    // Restore saved styles after map/layers are ready
    // --------------------------------------------------------

    setTimeout(
        function() {

            restoreAllSavedStyles();

        },
        1000
    );


    // Additional delayed restore for QGIS2Web
    // because some QGIS2Web layers can initialize later.

    setTimeout(
        function() {

            restoreAllSavedStyles();

        },
        3000
    );
}


// ============================================================
// 30. START AFTER PAGE LOAD
// ============================================================

if (
    document.readyState ===
    "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        function() {

            setTimeout(
                initializeDynamicStyleEditor,
                500
            );

        }
    );

} else {

    setTimeout(
        initializeDynamicStyleEditor,
        500
    );
}