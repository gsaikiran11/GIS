// ============================================================
// 📐 STAGE 14 — ADVANCED MEASURE TOOL
// OpenLayers 10.x
//
// Features:
// ✔ Length measurement
// ✔ Area measurement from 3+ points
// ✔ Individual segment lengths
// ✔ Dynamic length
// ✔ Dynamic area
// ✔ Dynamic perimeter
// ✔ Vertex snapping
// ✔ Line snapping
// ✔ Adjustable snap tolerance
// ✔ Length unit selection
// ✔ Area unit selection
// ✔ Undo
// ✔ Clear
// ✔ Finish
// ✔ Mobile friendly
// ✔ Stage 5 popup suppression
// ✔ Completely standalone
//
// Coordinate systems:
// DATA  = EPSG:32643
// MAP   = EPSG:3857
// ============================================================

(function () {

    "use strict";

    console.log(
        "📐 Starting Stage 14 Advanced Measure Tool..."
    );


    // =========================================================
    // CONFIGURATION
    // =========================================================

    const STAGE14_DATA_PROJECTION =
        "EPSG:32643";

    const STAGE14_MAP_PROJECTION =
        "EPSG:3857";


    // =========================================================
    // GLOBAL STATE
    // =========================================================

    let stage14Active =
        false;

    let stage14Finished =
        false;

    let stage14Points =
        [];

    let stage14CurrentPointer =
        null;

    let stage14LengthUnit =
        "m";

    let stage14AreaUnit =
        "m2";

    let stage14SnapEnabled =
        true;

    let stage14SnapTolerance =
        18;

    let stage14CurrentSnapType =
        null;


    // =========================================================
    // POPUP CONTROL FLAG
    // =========================================================

    window.stage14MeasureActive =
        false;


    // =========================================================
    // MEASURE SOURCE
    // =========================================================

    const stage14MeasureSource =
        new ol.source.Vector();


    // =========================================================
    // MEASURE LAYER
    // =========================================================

    const stage14MeasureLayer =
        new ol.layer.Vector({

            source:
                stage14MeasureSource,

            zIndex:
                15000

        });


    // =========================================================
    // SNAP SOURCE
    // =========================================================

    const stage14SnapSource =
        new ol.source.Vector();


    // =========================================================
    // SNAP LAYER
    // =========================================================

    const stage14SnapLayer =
        new ol.layer.Vector({

            source:
                stage14SnapSource,

            zIndex:
                16000

        });


    // =========================================================
    // EXPOSE LAYERS
    // FOR STAGE 5 POPUP TO IGNORE
    // =========================================================

    window.stage14MeasureLayer =
        stage14MeasureLayer;

    window.stage14SnapLayer =
        stage14SnapLayer;


    // =========================================================
    // ADD LAYERS TO MAP
    // =========================================================

    map.addLayer(
        stage14MeasureLayer
    );

    map.addLayer(
        stage14SnapLayer
    );


    // =========================================================
    // UTILITY
    // =========================================================

    function stage14Round(
        value,
        decimals
    ) {

        const factor =
            Math.pow(
                10,
                decimals
            );

        return Math.round(
            value * factor
        ) / factor;

    }


    // =========================================================
    // FORMAT NUMBER
    // =========================================================

    function stage14FormatNumber(
        value
    ) {

        if (
            !isFinite(value)
        ) {

            return "0";

        }

        return Number(
            value
        ).toLocaleString(
            undefined,
            {
                maximumFractionDigits:
                    2
            }
        );

    }


    // =========================================================
    // DISTANCE
    //
    // Convert from Web Mercator to UTM
    // Then calculate Euclidean distance
    // =========================================================

    function stage14Distance(
        coordinate1,
        coordinate2
    ) {

        const p1 =
            ol.proj.transform(
                coordinate1,
                STAGE14_MAP_PROJECTION,
                STAGE14_DATA_PROJECTION
            );

        const p2 =
            ol.proj.transform(
                coordinate2,
                STAGE14_MAP_PROJECTION,
                STAGE14_DATA_PROJECTION
            );


        const dx =
            p2[0] - p1[0];

        const dy =
            p2[1] - p1[1];


        return Math.sqrt(
            dx * dx +
            dy * dy
        );

    }


    // =========================================================
    // POLYGON AREA
    //
    // Calculates area in square metres
    // using UTM coordinates
    // =========================================================

    function stage14PolygonArea(
        coordinates
    ) {

        if (
            coordinates.length < 3
        ) {

            return 0;

        }


        const projected =
            coordinates.map(
                function (coordinate) {

                    return ol.proj.transform(
                        coordinate,
                        STAGE14_MAP_PROJECTION,
                        STAGE14_DATA_PROJECTION
                    );

                }
            );


        let area =
            0;


        for (
            let i = 0;
            i < projected.length;
            i++
        ) {

            const j =
                (
                    i + 1
                ) %
                projected.length;


            area +=
                projected[i][0] *
                projected[j][1];


            area -=
                projected[j][0] *
                projected[i][1];

        }


        return Math.abs(
            area / 2
        );

    }


    // =========================================================
    // LENGTH UNIT CONVERSION
    // =========================================================

    function stage14ConvertLength(
        metres
    ) {

        switch (
            stage14LengthUnit
        ) {

            case "km":

                return metres /
                    1000;


            case "ft":

                return metres *
                    3.280839895;


            case "yd":

                return metres *
                    1.093613298;


            case "mi":

                return metres /
                    1609.344;


            case "m":

            default:

                return metres;

        }

    }


    // =========================================================
    // LENGTH UNIT LABEL
    // =========================================================

    function stage14LengthLabel() {

        switch (
            stage14LengthUnit
        ) {

            case "km":
                return "km";

            case "ft":
                return "ft";

            case "yd":
                return "yd";

            case "mi":
                return "mi";

            case "m":
            default:
                return "m";

        }

    }


    // =========================================================
    // AREA UNIT CONVERSION
    // =========================================================

    function stage14ConvertArea(
        squareMetres
    ) {

        switch (
            stage14AreaUnit
        ) {

            case "ha":

                return squareMetres /
                    10000;


            case "acre":

                return squareMetres /
                    4046.8564224;


            case "ft2":

                return squareMetres *
                    10.763910417;


            case "yd2":

                return squareMetres *
                    1.195990046;


            case "m2":

            default:

                return squareMetres;

        }

    }


    // =========================================================
    // AREA UNIT LABEL
    // =========================================================

    function stage14AreaLabel() {

        switch (
            stage14AreaUnit
        ) {

            case "ha":
                return "ha";

            case "acre":
                return "acres";

            case "ft2":
                return "ft²";

            case "yd2":
                return "yd²";

            case "m2":
            default:
                return "m²";

        }

    }


    // =========================================================
    // CREATE TEXT STYLE
    // =========================================================

    function stage14TextStyle(
        text
    ) {

        return new ol.style.Style({

            text:
                new ol.style.Text({

                    text:
                        text,

                    font:
                        "bold 12px Arial",

                    fill:
                        new ol.style.Fill({
                            color:
                                "#000000"
                        }),

                    stroke:
                        new ol.style.Stroke({

                            color:
                                "#ffffff",

                            width:
                                4

                        }),

                    offsetY:
                        -12,

                    overflow:
                        true

                })

        });

    }


    // =========================================================
    // SEGMENT STYLE
    // =========================================================

    function stage14SegmentStyle(
        text
    ) {

        return [

            new ol.style.Style({

                stroke:
                    new ol.style.Stroke({

                        color:
                            "#1565c0",

                        width:
                            3

                    })

            }),

            stage14TextStyle(
                text
            )

        ];

    }


    // =========================================================
    // CURRENT POINTER SEGMENT STYLE
    // =========================================================

    function stage14CurrentLineStyle(
        text
    ) {

        return [

            new ol.style.Style({

                stroke:
                    new ol.style.Stroke({

                        color:
                            "#1565c0",

                        width:
                            3,

                        lineDash:
                            [10, 8]

                    })

            }),

            stage14TextStyle(
                text
            )

        ];

    }


    // =========================================================
    // AREA STYLE
    // =========================================================

    function stage14AreaStyle(
        text
    ) {

        return [

            new ol.style.Style({

                fill:
                    new ol.style.Fill({

                        color:
                            "rgba(30,136,229,0.18)"

                    }),

                stroke:
                    new ol.style.Stroke({

                        color:
                            "#1565c0",

                        width:
                            3

                    })

            }),

            new ol.style.Style({

                text:
                    new ol.style.Text({

                        text:
                            text,

                        font:
                            "bold 13px Arial",

                        fill:
                            new ol.style.Fill({

                                color:
                                    "#000000"

                            }),

                        stroke:
                            new ol.style.Stroke({

                                color:
                                    "#ffffff",

                                width:
                                    5

                            })

                    })

            })

        ];

    }


    // =========================================================
    // POINT STYLE
    // =========================================================

    function stage14PointStyle() {

        return new ol.style.Style({

            image:
                new ol.style.Circle({

                    radius:
                        5,

                    fill:
                        new ol.style.Fill({

                            color:
                                "#ffffff"

                        }),

                    stroke:
                        new ol.style.Stroke({

                            color:
                                "#1565c0",

                            width:
                                3

                        })

                })

        });

    }


    // =========================================================
    // SNAP VERTEX STYLE
    // =========================================================

    function stage14SnapVertexStyle() {

        return new ol.style.Style({

            image:
                new ol.style.Circle({

                    radius:
                        7,

                    fill:
                        new ol.style.Fill({

                            color:
                                "rgba(255,0,0,0.25)"

                        }),

                    stroke:
                        new ol.style.Stroke({

                            color:
                                "#ff0000",

                            width:
                                3

                        })

                })

        });

    }


    // =========================================================
    // SNAP LINE STYLE
    // =========================================================

    function stage14SnapLineStyle() {

        return new ol.style.Style({

            image:
                new ol.style.Circle({

                    radius:
                        7,

                    fill:
                        new ol.style.Fill({

                            color:
                                "rgba(0,180,0,0.25)"

                        }),

                    stroke:
                        new ol.style.Stroke({

                            color:
                                "#00a000",

                            width:
                                3

                        })

                })

        });

    }


    // =========================================================
    // COLLECT ALL VERTICES
    // =========================================================

    function stage14CollectVertices(
        geometry,
        result
    ) {

        if (
            !geometry
        ) {

            return;

        }


        const type =
            geometry.getType();


        const coordinates =
            geometry.getCoordinates();


        if (
            type === "Point"
        ) {

            result.push(
                coordinates
            );

            return;

        }


        if (
            type === "MultiPoint"
        ) {

            coordinates.forEach(
                function (coordinate) {

                    result.push(
                        coordinate
                    );

                }
            );

            return;

        }


        if (
            type === "LineString"
        ) {

            coordinates.forEach(
                function (coordinate) {

                    result.push(
                        coordinate
                    );

                }
            );

            return;

        }


        if (
            type === "MultiLineString"
        ) {

            coordinates.forEach(
                function (line) {

                    line.forEach(
                        function (coordinate) {

                            result.push(
                                coordinate
                            );

                        }
                    );

                }
            );

            return;

        }


        if (
            type === "Polygon"
        ) {

            coordinates.forEach(
                function (ring) {

                    ring.forEach(
                        function (coordinate) {

                            result.push(
                                coordinate
                            );

                        }
                    );

                }
            );

            return;

        }


        if (
            type === "MultiPolygon"
        ) {

            coordinates.forEach(
                function (polygon) {

                    polygon.forEach(
                        function (ring) {

                            ring.forEach(
                                function (coordinate) {

                                    result.push(
                                        coordinate
                                    );

                                }
                            );

                        }
                    );

                }
            );

            return;

        }


        if (
            type === "GeometryCollection"
        ) {

            geometry
                .getGeometries()
                .forEach(
                    function (childGeometry) {

                        stage14CollectVertices(
                            childGeometry,
                            result
                        );

                    }
                );

        }

    }


    // =========================================================
    // FIND CLOSEST VERTEX
    // =========================================================

    function stage14FindClosestVertex(
        pixel
    ) {

        let closest =
            null;

        let closestDistance =
            Infinity;


        map.getLayers()
            .forEach(
                function (layer) {

                    if (
                        !(layer instanceof
                            ol.layer.Vector)
                    ) {

                        return;

                    }


                    if (
                        layer ===
                        stage14MeasureLayer
                    ) {

                        return;

                    }


                    if (
                        layer ===
                        stage14SnapLayer
                    ) {

                        return;

                    }


                    if (
                        !layer.getVisible()
                    ) {

                        return;

                    }


                    const source =
                        layer.getSource();


                    if (
                        !source
                    ) {

                        return;

                    }


                    source
                        .getFeatures()
                        .forEach(
                            function (feature) {

                                const geometry =
                                    feature.getGeometry();


                                const vertices =
                                    [];


                                stage14CollectVertices(
                                    geometry,
                                    vertices
                                );


                                vertices.forEach(
                                    function (
                                        coordinate
                                    ) {

                                        const vertexPixel =
                                            map.getPixelFromCoordinate(
                                                coordinate
                                            );


                                        if (
                                            !vertexPixel
                                        ) {

                                            return;

                                        }


                                        const dx =
                                            vertexPixel[0] -
                                            pixel[0];


                                        const dy =
                                            vertexPixel[1] -
                                            pixel[1];


                                        const distance =
                                            Math.sqrt(
                                                dx * dx +
                                                dy * dy
                                            );


                                        if (
                                            distance <
                                            closestDistance &&
                                            distance <=
                                            stage14SnapTolerance
                                        ) {

                                            closestDistance =
                                                distance;

                                            closest = {

                                                coordinate:
                                                    coordinate,

                                                type:
                                                    "vertex"

                                            };

                                        }

                                    }
                                );

                            }
                        );

                }
            );


        return closest;

    }


    // =========================================================
    // FIND CLOSEST POINT ON LINE
    // =========================================================

    function stage14FindClosestLine(
        pixel
    ) {

        const coordinate =
            map.getCoordinateFromPixel(
                pixel
            );


        if (
            !coordinate
        ) {

            return null;

        }


        let closest =
            null;

        let closestDistance =
            Infinity;


        map.getLayers()
            .forEach(
                function (layer) {

                    if (
                        !(layer instanceof
                            ol.layer.Vector)
                    ) {

                        return;

                    }


                    if (
                        layer ===
                        stage14MeasureLayer
                    ) {

                        return;

                    }


                    if (
                        layer ===
                        stage14SnapLayer
                    ) {

                        return;

                    }


                    if (
                        !layer.getVisible()
                    ) {

                        return;

                    }


                    const source =
                        layer.getSource();


                    if (
                        !source
                    ) {

                        return;

                    }


                    source
                        .getFeatures()
                        .forEach(
                            function (feature) {

                                const geometry =
                                    feature.getGeometry();


                                if (
                                    !geometry
                                ) {

                                    return;

                                }


                                const type =
                                    geometry.getType();


                                if (
                                    type !==
                                    "LineString" &&
                                    type !==
                                    "MultiLineString" &&
                                    type !==
                                    "Polygon" &&
                                    type !==
                                    "MultiPolygon"
                                ) {

                                    return;

                                }


                                const closestPoint =
                                    geometry.getClosestPoint(
                                        coordinate
                                    );


                                const closestPixel =
                                    map.getPixelFromCoordinate(
                                        closestPoint
                                    );


                                if (
                                    !closestPixel
                                ) {

                                    return;

                                }


                                const dx =
                                    closestPixel[0] -
                                    pixel[0];


                                const dy =
                                    closestPixel[1] -
                                    pixel[1];


                                const distance =
                                    Math.sqrt(
                                        dx * dx +
                                        dy * dy
                                    );


                                if (
                                    distance <
                                    closestDistance &&
                                    distance <=
                                    stage14SnapTolerance
                                ) {

                                    closestDistance =
                                        distance;

                                    closest = {

                                        coordinate:
                                            closestPoint,

                                        type:
                                            "line"

                                    };

                                }

                            }
                        );

                }
            );


        return closest;

    }


    // =========================================================
    // FIND SNAP
    // =========================================================

    function stage14FindSnap(
        pixel
    ) {

        if (
            !stage14SnapEnabled
        ) {

            return null;

        }


        // Vertex has priority
        const vertex =
            stage14FindClosestVertex(
                pixel
            );


        if (
            vertex
        ) {

            return vertex;

        }


        // Then line
        return stage14FindClosestLine(
            pixel
        );

    }


    // =========================================================
    // UPDATE SNAP INDICATOR
    // =========================================================

    function stage14UpdateSnapIndicator(
        snap
    ) {

        stage14SnapSource.clear();


        if (
            !snap
        ) {

            stage14CurrentSnapType =
                null;

            return;

        }


        const feature =
            new ol.Feature({

                geometry:
                    new ol.geom.Point(
                        snap.coordinate
                    )

            });


        if (
            snap.type ===
            "vertex"
        ) {

            feature.setStyle(
                stage14SnapVertexStyle()
            );

        } else {

            feature.setStyle(
                stage14SnapLineStyle()
            );

        }


        stage14SnapSource.addFeature(
            feature
        );


        stage14CurrentSnapType =
            snap.type;

    }


    // =========================================================
    // MIDPOINT
    // =========================================================

    function stage14Midpoint(
        p1,
        p2
    ) {

        return [

            (
                p1[0] +
                p2[0]
            ) / 2,

            (
                p1[1] +
                p2[1]
            ) / 2

        ];

    }


    // =========================================================
    // GET TOTAL LENGTH
    // =========================================================

    function stage14GetTotalLength(
        points
    ) {

        let total =
            0;


        for (
            let i = 1;
            i < points.length;
            i++
        ) {

            total +=
                stage14Distance(
                    points[i - 1],
                    points[i]
                );

        }


        return total;

    }


    // =========================================================
    // GET PERIMETER
    // =========================================================

    function stage14GetPerimeter(
        points
    ) {

        if (
            points.length < 3
        ) {

            return 0;

        }


        let perimeter =
            stage14GetTotalLength(
                points
            );


        perimeter +=
            stage14Distance(
                points[
                    points.length - 1
                ],
                points[0]
            );


        return perimeter;

    }


    // =========================================================
    // CLEAR MEASURE GRAPHICS
    // =========================================================

    function stage14ClearGraphics() {

        stage14MeasureSource.clear();

        stage14SnapSource.clear();

    }


    // =========================================================
    // DRAW MEASUREMENTS
    // =========================================================

    function stage14DrawMeasurements() {

        stage14ClearGraphics();


        // =====================================================
        // DRAW FIXED SEGMENTS
        // =====================================================

        for (
            let i = 1;
            i < stage14Points.length;
            i++
        ) {

            const p1 =
                stage14Points[
                    i - 1
                ];

            const p2 =
                stage14Points[i];


            const metres =
                stage14Distance(
                    p1,
                    p2
                );


            const converted =
                stage14ConvertLength(
                    metres
                );


            const text =
                stage14FormatNumber(
                    converted
                ) +
                " " +
                stage14LengthLabel();


            const lineFeature =
                new ol.Feature({

                    geometry:
                        new ol.geom.LineString([
                            p1,
                            p2
                        ])

                });


            lineFeature.setStyle(
                stage14SegmentStyle(
                    text
                )
            );


            stage14MeasureSource.addFeature(
                lineFeature
            );

        }


        // =====================================================
        // DRAW POINTS
        // =====================================================

        stage14Points.forEach(
            function (point) {

                const feature =
                    new ol.Feature({

                        geometry:
                            new ol.geom.Point(
                                point
                            )

                    });


                feature.setStyle(
                    stage14PointStyle()
                );


                stage14MeasureSource.addFeature(
                    feature
                );

            }
        );


        // =====================================================
        // AREA
        // =====================================================

        if (
            stage14Points.length >= 3
        ) {

            const area =
                stage14PolygonArea(
                    stage14Points
                );


            const perimeter =
                stage14GetPerimeter(
                    stage14Points
                );


            const areaValue =
                stage14ConvertArea(
                    area
                );


            const perimeterValue =
                stage14ConvertLength(
                    perimeter
                );


            const areaText =
                "Area: " +
                stage14FormatNumber(
                    areaValue
                ) +
                " " +
                stage14AreaLabel() +
                "\n" +
                "Perimeter: " +
                stage14FormatNumber(
                    perimeterValue
                ) +
                " " +
                stage14LengthLabel();


            const polygonCoordinates =
                stage14Points.slice();


            polygonCoordinates.push(
                stage14Points[0]
            );


            const polygonFeature =
                new ol.Feature({

                    geometry:
                        new ol.geom.Polygon([
                            polygonCoordinates
                        ])

                });


            polygonFeature.setStyle(
                stage14AreaStyle(
                    areaText
                )
            );


            stage14MeasureSource.addFeature(
                polygonFeature
            );


            // =================================================
            // DRAW CLOSING LINE LABEL
            // =================================================

            const closingDistance =
                stage14Distance(
                    stage14Points[
                        stage14Points.length - 1
                    ],
                    stage14Points[0]
                );


            const closingText =
                stage14FormatNumber(
                    stage14ConvertLength(
                        closingDistance
                    )
                ) +
                " " +
                stage14LengthLabel();


            const closingLine =
                new ol.Feature({

                    geometry:
                        new ol.geom.LineString([

                            stage14Points[
                                stage14Points.length - 1
                            ],

                            stage14Points[0]

                        ])

                });


            closingLine.setStyle(
                stage14SegmentStyle(
                    closingText
                )
            );


            stage14MeasureSource.addFeature(
                closingLine
            );

        }

    }


    // =========================================================
    // DRAW CURRENT POINTER
    // =========================================================

    function stage14DrawCurrentPointer() {

        if (
            !stage14Active
        ) {

            return;

        }


        if (
            !stage14CurrentPointer
        ) {

            return;

        }


        if (
            stage14Points.length === 0
        ) {

            return;

        }


        // -----------------------------------------------------
        // Remove old temporary pointer graphics
        // -----------------------------------------------------

        const features =
            stage14MeasureSource
                .getFeatures();


        features.forEach(
            function (feature) {

                if (
                    feature.get(
                        "stage14Temporary"
                    )
                ) {

                    stage14MeasureSource
                        .removeFeature(
                            feature
                        );

                }

            }
        );


        const lastPoint =
            stage14Points[
                stage14Points.length - 1
            ];


        const currentPoint =
            stage14CurrentPointer;


        // -----------------------------------------------------
        // Current segment length
        // -----------------------------------------------------

        const currentDistance =
            stage14Distance(
                lastPoint,
                currentPoint
            );


        const currentText =
            stage14FormatNumber(
                stage14ConvertLength(
                    currentDistance
                )
            ) +
            " " +
            stage14LengthLabel();


        const currentLine =
            new ol.Feature({

                geometry:
                    new ol.geom.LineString([

                        lastPoint,
                        currentPoint

                    ])

            });


        currentLine.set(
            "stage14Temporary",
            true
        );


        currentLine.setStyle(
            stage14CurrentLineStyle(
                currentText
            )
        );


        stage14MeasureSource.addFeature(
            currentLine
        );


        // =====================================================
        // DYNAMIC AREA
        // =====================================================

        if (
            stage14Points.length >= 2
        ) {

            const dynamicPoints =
                stage14Points.slice();


            dynamicPoints.push(
                currentPoint
            );


            const dynamicArea =
                stage14PolygonArea(
                    dynamicPoints
                );


            const dynamicPerimeter =
                stage14GetPerimeter(
                    dynamicPoints
                );


            const dynamicAreaValue =
                stage14ConvertArea(
                    dynamicArea
                );


            const dynamicPerimeterValue =
                stage14ConvertLength(
                    dynamicPerimeter
                );


            const dynamicText =
                "Area: " +
                stage14FormatNumber(
                    dynamicAreaValue
                ) +
                " " +
                stage14AreaLabel() +
                "\n" +
                "Perimeter: " +
                stage14FormatNumber(
                    dynamicPerimeterValue
                ) +
                " " +
                stage14LengthLabel();


            // -------------------------------------------------
            // Dynamic polygon
            // -------------------------------------------------

            const dynamicPolygon =
                dynamicPoints.slice();


            dynamicPolygon.push(
                dynamicPoints[0]
            );


            const dynamicFeature =
                new ol.Feature({

                    geometry:
                        new ol.geom.Polygon([
                            dynamicPolygon
                        ])

                });


            dynamicFeature.set(
                "stage14Temporary",
                true
            );


            dynamicFeature.setStyle(
                stage14AreaStyle(
                    dynamicText
                )
            );


            stage14MeasureSource.addFeature(
                dynamicFeature
            );

        }

    }


    // =========================================================
    // REDRAW EVERYTHING
    // =========================================================

    function stage14Redraw() {

        stage14DrawMeasurements();

        stage14DrawCurrentPointer();

    }


    // =========================================================
    // UPDATE STATUS
    // =========================================================

    function stage14UpdateStatus(
        customText
    ) {

        const status =
            document.getElementById(
                "stage14-status"
            );


        if (
            !status
        ) {

            return;

        }


        if (
            customText
        ) {

            status.textContent =
                customText;

            return;

        }


        if (
            !stage14Active
        ) {

            status.textContent =
                "Measure tool ready.";

            return;

        }


        if (
            stage14Points.length === 0
        ) {

            status.textContent =
                "Click on the map to start.";

            return;

        }


        if (
            stage14Points.length === 1
        ) {

            status.textContent =
                "1 point — select next point.";

            return;

        }


        const total =
            stage14GetTotalLength(
                stage14Points
            );


        let text =
            stage14Points.length +
            " points | Total: " +
            stage14FormatNumber(
                stage14ConvertLength(
                    total
                )
            ) +
            " " +
            stage14LengthLabel();


        if (
            stage14Points.length >= 3
        ) {

            const area =
                stage14PolygonArea(
                    stage14Points
                );


            text +=
                " | Area: " +
                stage14FormatNumber(
                    stage14ConvertArea(
                        area
                    )
                ) +
                " " +
                stage14AreaLabel();

        }


        status.textContent =
            text;

    }


    // =========================================================
    // START MEASUREMENT
    // =========================================================

    function stage14Start() {

        stage14Active =
            true;

        stage14Finished =
            false;

        stage14Points =
            [];

        stage14CurrentPointer =
            null;


        // =====================================================
        // BLOCK STAGE 5 POPUP
        // =====================================================

        window.stage14MeasureActive =
            true;


        // =====================================================
        // CLOSE EXISTING STAGE 5 POPUP
        // =====================================================

        if (
            typeof window.closeFeaturePopup ===
            "function"
        ) {

            window.closeFeaturePopup();

        } else {

            const popup =
                document.getElementById(
                    "feature-info-popup"
                );


            if (
                popup
            ) {

                popup.style.display =
                    "none";

            }

        }


        stage14ClearGraphics();

        stage14UpdateStatus(
            "📐 Measuring — click points on the map."
        );


        stage14MeasureButton.textContent =
            "⏹ Stop";


        stage14MeasureButton.classList.add(
            "active"
        );


        console.log(
            "📐 Stage 14 measurement STARTED."
        );

    }


    // =========================================================
    // STOP MEASUREMENT
    // =========================================================

    function stage14Stop() {

        stage14Active =
            false;


        stage14Finished =
            true;


        stage14CurrentPointer =
            null;


        stage14SnapSource.clear();


        // =====================================================
        // ALLOW STAGE 5 POPUP AGAIN
        // =====================================================

        window.stage14MeasureActive =
            false;


        stage14DrawMeasurements();


        stage14UpdateStatus(
            "Measurement finished."
        );


        stage14MeasureButton.textContent =
            "📐";


        stage14MeasureButton.classList.remove(
            "active"
        );


        console.log(
            "📐 Stage 14 measurement STOPPED."
        );

    }


    // =========================================================
    // ADD POINT
    // =========================================================

    function stage14AddPoint(
        coordinate
    ) {

        if (
            !stage14Active
        ) {

            return;

        }


        stage14Points.push(
            coordinate
        );


        stage14CurrentPointer =
            null;


        stage14Redraw();

        stage14UpdateStatus();


        console.log(
            "📐 Measurement point:",
            coordinate
        );

    }


    // =========================================================
    // UNDO
    // =========================================================

    function stage14Undo() {

        if (
            !stage14Active
        ) {

            return;

        }


        if (
            stage14Points.length === 0
        ) {

            return;

        }


        stage14Points.pop();


        stage14CurrentPointer =
            null;


        stage14Redraw();

        stage14UpdateStatus();


        console.log(
            "↩️ Measurement point removed."
        );

    }


    // =========================================================
    // CLEAR
    // =========================================================

    function stage14Clear() {

        stage14Points =
            [];

        stage14CurrentPointer =
            null;


        stage14ClearGraphics();

        stage14SnapSource.clear();


        if (
            stage14Active
        ) {

            stage14UpdateStatus(
                "📐 Cleared — click on the map to start."
            );

        } else {

            stage14UpdateStatus(
                "Measure tool ready."
            );

        }


        console.log(
            "🗑 Stage 14 measurement cleared."
        );

    }


    // =========================================================
    // MAP POINTER MOVE
    // =========================================================

    map.on(
        "pointermove",
        function (event) {

            if (
                !stage14Active
            ) {

                return;

            }


            if (
                event.dragging
            ) {

                return;

            }


            stage14CurrentPointer =
                map.getCoordinateFromPixel(
                    event.pixel
                );


            // -------------------------------------------------
            // SNAP
            // -------------------------------------------------

            if (
                stage14SnapEnabled
            ) {

                const snap =
                    stage14FindSnap(
                        event.pixel
                    );


                stage14UpdateSnapIndicator(
                    snap
                );


                if (
                    snap
                ) {

                    stage14CurrentPointer =
                        snap.coordinate;

                }

            } else {

                stage14SnapSource.clear();

            }


            stage14Redraw();

        }
    );


    // =========================================================
    // MAP CLICK
    // =========================================================

    map.on(
        "singleclick",
        function (event) {

            if (
                !stage14Active
            ) {

                return;

            }


            // =================================================
            // 🚫 STAGE 5 POPUP BLOCK
            // =================================================

            window.stage14MeasureActive =
                true;


            // =================================================
            // GET SNAP
            // =================================================

            let coordinate =
                event.coordinate;


            if (
                stage14SnapEnabled
            ) {

                const snap =
                    stage14FindSnap(
                        event.pixel
                    );


                if (
                    snap
                ) {

                    coordinate =
                        snap.coordinate;

                }

            }


            // =================================================
            // ADD POINT
            // =================================================

            stage14AddPoint(
                coordinate
            );


            // =================================================
            // STOP EVENT PROPAGATION
            // =================================================

            if (
                event.originalEvent
            ) {

                event.originalEvent.preventDefault();

                event.originalEvent.stopPropagation();

            }

        }
    );


    // =========================================================
    // BUTTON
    // =========================================================

    const stage14MeasureButton =
        document.createElement(
            "button"
        );


    stage14MeasureButton.id =
        "stage14-measure-button";


    stage14MeasureButton.type =
        "button";


    stage14MeasureButton.textContent =
        "📐 ";


    stage14MeasureButton.title =
        "Advanced Measure Tool";


    // =========================================================
    // CONTROL
    // =========================================================

    const stage14Control =
        document.createElement(
            "div"
        );


    stage14Control.id =
        "stage14-control";


    stage14Control.className =
        "ol-unselectable ol-control";


    stage14Control.appendChild(
        stage14MeasureButton
    );


    map.getTargetElement()
        .appendChild(
            stage14Control
        );


    // =========================================================
    // PANEL
    // =========================================================

    const stage14Panel =
        document.createElement(
            "div"
        );


    stage14Panel.id =
        "stage14-panel";


    stage14Panel.innerHTML = `

        <div id="stage14-title">
            📐 Advanced Measure
        </div>

        <div id="stage14-status">
            Measure tool ready.
        </div>

        <div class="stage14-row">

            <button
                type="button"
                id="stage14-start">
                📐 Measure
            </button>

            <button
                type="button"
                id="stage14-undo">
                ↩️ Undo
            </button>

        </div>

        <div class="stage14-row">

            <button
                type="button"
                id="stage14-finish">
                ✅ Finish
            </button>

            <button
                type="button"
                id="stage14-clear">
                🗑 Clear
            </button>

        </div>

        <div class="stage14-setting">

            <label>
                Length Unit
            </label>

            <select
                id="stage14-length-unit">

                <option value="m">
                    Metres (m)
                </option>

                <option value="km">
                    Kilometres (km)
                </option>

                <option value="ft">
                    Feet (ft)
                </option>

                <option value="yd">
                    Yards (yd)
                </option>

                <option value="mi">
                    Miles (mi)
                </option>

            </select>

        </div>


        <div class="stage14-setting">

            <label>
                Area Unit
            </label>

            <select
                id="stage14-area-unit">

                <option value="m2">
                    Square metres (m²)
                </option>

                <option value="ha">
                    Hectares (ha)
                </option>

                <option value="acre">
                    Acres
                </option>

                <option value="ft2">
                    Square feet (ft²)
                </option>

                <option value="yd2">
                    Square yards (yd²)
                </option>

            </select>

        </div>


        <div class="stage14-setting">

            <label class="stage14-checkbox">

                <input
                    type="checkbox"
                    id="stage14-snap"
                    checked>

                <span>
                    Enable Snapping
                </span>

            </label>

        </div>


        <div class="stage14-setting">

            <label>
                Snap Tolerance:
                <span id="stage14-tolerance-value">
                    18
                </span>
                px
            </label>

            <input
                type="range"
                id="stage14-tolerance"
                min="5"
                max="50"
                value="18">

        </div>

        <div id="stage14-help">

            <b>How to use</b>

            <br>

            1. Click <b>Measure</b>

            <br>

            2. Click points on the map

            <br>

            3. Each segment shows its length

            <br>

            4. From 3 points, area appears

            <br>

            5. Use <b>Undo</b> if needed

            <br>

            6. Click <b>Finish</b> when complete

        </div>

    `;


    document.body.appendChild(
        stage14Panel
    );


    // =========================================================
    // CSS
    // =========================================================

    const stage14CSS =
        document.createElement(
            "style"
        );


    stage14CSS.textContent = `

        /* ================================================
           STAGE 14 CONTROL BUTTON
        ================================================ */

        #stage14-control {

            position:
                absolute;

            top:
                150px;

            right:
                10px;

            z-index:
                18000;

        }


        #stage14-measure-button {

            width:
                44px;

            height:
                44px;

            border:
                1px solid #aaa;

            border-radius:
                6px;

            background:
                #ffffff;

            font-size:
                20px;

            cursor:
                pointer;

            box-shadow:
                0 2px 6px
                rgba(0,0,0,0.3);

        }


        #stage14-measure-button:hover {

            background:
                #eeeeee;

        }


        #stage14-measure-button.active {

            background:
                #1565c0;

            color:
                #ffffff;

        }


        /* ================================================
           PANEL
        ================================================ */

        #stage14-panel {

            position:
                absolute;

            top:
                205px;

            right:
                10px;

            width:
                280px;

            max-width:
                calc(100vw - 30px);

            background:
                #ffffff;

            border:
                1px solid #999;

            border-radius:
                10px;

            box-shadow:
                0 4px 18px
                rgba(0,0,0,0.3);

            padding:
                12px;

            z-index:
                18000;

            font-family:
                Arial, sans-serif;

            font-size:
                13px;

            display:
                none;

            box-sizing:
                border-box;

        }


        /* ================================================
           TITLE
        ================================================ */

        #stage14-title {

            font-size:
                17px;

            font-weight:
                bold;

            margin-bottom:
                8px;

            border-bottom:
                1px solid #ddd;

            padding-bottom:
                8px;

        }


        /* ================================================
           STATUS
        ================================================ */

        #stage14-status {

            background:
                #f3f6f9;

            border:
                1px solid #ddd;

            border-radius:
                6px;

            padding:
                8px;

            margin-bottom:
                10px;

            line-height:
                1.4;

        }


        /* ================================================
           ROW
        ================================================ */

        .stage14-row {

            display:
                flex;

            gap:
                7px;

            margin-bottom:
                8px;

        }


        .stage14-row button {

            flex:
                1;

            padding:
                8px 5px;

            border:
                1px solid #aaa;

            border-radius:
                5px;

            background:
                #f7f7f7;

            cursor:
                pointer;

            font-size:
                12px;

        }


        .stage14-row button:hover {

            background:
                #e5e5e5;

        }


        /* ================================================
           SETTINGS
        ================================================ */

        .stage14-setting {

            margin-top:
                9px;

        }


        .stage14-setting label {

            display:
                block;

            font-weight:
                bold;

            margin-bottom:
                4px;

        }


        .stage14-setting select {

            width:
                100%;

            padding:
                7px;

            border:
                1px solid #aaa;

            border-radius:
                5px;

            background:
                #ffffff;

            box-sizing:
                border-box;

        }


        .stage14-setting input[type="range"] {

            width:
                100%;

        }


        .stage14-checkbox {

            display:
                flex !important;

            align-items:
                center;

            gap:
                7px;

            font-weight:
                normal !important;

        }


        .stage14-checkbox input {

            width:
                18px;

            height:
                18px;

        }


        /* ================================================
           HELP
        ================================================ */

        #stage14-help {

            margin-top:
                10px;

            padding:
                8px;

            background:
                #fafafa;

            border:
                1px solid #ddd;

            border-radius:
                6px;

            line-height:
                1.5;

            color:
                #555;

        }


        /* ================================================
           MOBILE
        ================================================ */

        @media (max-width: 600px) {

            #stage14-control {

                top:
                    120px;

                right:
                    8px;

            }


            #stage14-measure-button {

                width:
                    46px;

                height:
                    46px;

                font-size:
                    21px;

            }


            #stage14-panel {

                top:
                    175px;

                right:
                    8px;

                width:
                    calc(100vw - 16px);

                max-width:
                    340px;

            }

        }

    `;


    document.head.appendChild(
        stage14CSS
    );


    // =========================================================
    // BUTTON REFERENCES
    // =========================================================

    const stage14StartButton =
        document.getElementById(
            "stage14-start"
        );


    const stage14UndoButton =
        document.getElementById(
            "stage14-undo"
        );


    const stage14FinishButton =
        document.getElementById(
            "stage14-finish"
        );


    const stage14ClearButton =
        document.getElementById(
            "stage14-clear"
        );


    const stage14LengthUnitSelect =
        document.getElementById(
            "stage14-length-unit"
        );


    const stage14AreaUnitSelect =
        document.getElementById(
            "stage14-area-unit"
        );


    const stage14SnapCheckbox =
        document.getElementById(
            "stage14-snap"
        );


    const stage14ToleranceSlider =
        document.getElementById(
            "stage14-tolerance"
        );


    const stage14ToleranceValue =
        document.getElementById(
            "stage14-tolerance-value"
        );


    // =========================================================
    // MAIN BUTTON
    // =========================================================

    stage14MeasureButton.addEventListener(
        "click",
        function (event) {

            event.preventDefault();

            event.stopPropagation();


            if (
                stage14Panel.style.display ===
                "block"
            ) {

                stage14Panel.style.display =
                    "none";

            } else {

                stage14Panel.style.display =
                    "block";

            }

        }
    );


    // =========================================================
    // START BUTTON
    // =========================================================

    stage14StartButton.addEventListener(
        "click",
        function (event) {

            event.preventDefault();

            event.stopPropagation();


            if (
                stage14Active
            ) {

                stage14Stop();

            } else {

                stage14Start();

            }

        }
    );


    // =========================================================
    // UNDO BUTTON
    // =========================================================

    stage14UndoButton.addEventListener(
        "click",
        function (event) {

            event.preventDefault();

            event.stopPropagation();

            stage14Undo();

        }
    );


    // =========================================================
    // FINISH BUTTON
    // =========================================================

    stage14FinishButton.addEventListener(
        "click",
        function (event) {

            event.preventDefault();

            event.stopPropagation();


            if (
                stage14Active
            ) {

                stage14Stop();

            }

        }
    );


    // =========================================================
    // CLEAR BUTTON
    // =========================================================

    stage14ClearButton.addEventListener(
        "click",
        function (event) {

            event.preventDefault();

            event.stopPropagation();

            stage14Clear();

        }
    );


    // =========================================================
    // LENGTH UNIT CHANGE
    // =========================================================

    stage14LengthUnitSelect.addEventListener(
        "change",
        function () {

            stage14LengthUnit =
                this.value;


            stage14Redraw();

            stage14UpdateStatus();

        }
    );


    // =========================================================
    // AREA UNIT CHANGE
    // =========================================================

    stage14AreaUnitSelect.addEventListener(
        "change",
        function () {

            stage14AreaUnit =
                this.value;


            stage14Redraw();

            stage14UpdateStatus();

        }
    );


    // =========================================================
    // SNAP ENABLE / DISABLE
    // =========================================================

    stage14SnapCheckbox.addEventListener(
        "change",
        function () {

            stage14SnapEnabled =
                this.checked;


            stage14SnapSource.clear();


            if (
                !stage14SnapEnabled
            ) {

                stage14CurrentSnapType =
                    null;

            }

        }
    );


    // =========================================================
    // SNAP TOLERANCE
    // =========================================================

    stage14ToleranceSlider.addEventListener(
        "input",
        function () {

            stage14SnapTolerance =
                Number(
                    this.value
                );


            stage14ToleranceValue.textContent =
                this.value;

        }
    );


    // =========================================================
    // ESC KEY
    // =========================================================

    document.addEventListener(
        "keydown",
        function (event) {

            if (
                event.key !==
                "Escape"
            ) {

                return;

            }


            if (
                stage14Active
            ) {

                stage14Stop();

            }


            stage14Panel.style.display =
                "none";

        }
    );


    // =========================================================
    // INITIAL STATE
    // =========================================================

    stage14Panel.style.display =
        "none";


    stage14UpdateStatus();


    // =========================================================
    // FINISHED
    // =========================================================

    console.log(
        "📐 Stage 14 Advanced Measure Tool READY."
    );

})();