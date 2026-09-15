// ============================================================
// 📐 PARCEL SUBDIVISION / AREA SPLITTING TOOL
// QGIS2WEB + OPENLAYERS
//
// FULL VERSION
//
// WORKFLOW
// ------------------------------------------------------------
// 1. Click 📐 Parcel Subdivision
// 2. Panel opens → Select Parcel
// 3. Click Select Parcel → panel hides
// 4. Click parcel
// 5. Panel returns → Select Side / From Point / Draw Line
// 6. Select method → panel hides
// 7. Perform map operation
// 8. Panel returns → Target Area + Preview
// 9. Preview → panel hides
// 10. Top controls appear → ✓ Apply / ✕ Back
// 11. ✓ Apply → subdivision completed
// 12. Panel shows → 🗑 Clear / ✅ Finish
// 13. Main 📐 button at ANY TIME → deactivate tool
//
// GEOMETRY ENGINE
// ------------------------------------------------------------
// ✔ UTM EPSG:32643 measurement
// ✔ Exact target area
// ✔ Part 1 follows selected side/direction
// ✔ Actual interior split-line selection
// ✔ UTM shoelace area
// ✔ UTM Euclidean distance
// ✔ Boundary dimensions
// ✔ Split-line length
// ✔ Split-line bearing
// ✔ Polygon + MultiPolygon support
// ✔ Area labels
// ✔ Result / Dimension layers hidden from layer switcher
// ✔ Stage 5 popup blocked while tool is active
// ============================================================

(function () {

    "use strict";

    // =========================================================
    // CONFIGURATION
    // =========================================================

    const CONFIG = {

        buttonId:
            "parcel-subdivision-button",

        resultLayerName:
            "Subdivision Result",

        dimensionLayerName:
            "Subdivision Dimensions",

        mapProjection:
            "EPSG:3857",

        dataProjection:
            "EPSG:32643",

        defaultUnit:
            "m2",

        lineWidth:
            2,

        splitLineWidth:
            3,

        tolerance:
            0.001,

        binaryIterations:
            70,

        resultZIndex:
            9990,

        dimensionZIndex:
            99999,

        dimensionFont:
            "bold 12px Arial",

        dimensionColor:
            "#000000",

        dimensionHalo:
            "#ffffff",

        dimensionHaloWidth:
            4,

        dimensionOffset:
            5,

        areaFont:
            "bold 13px Arial",

        areaColor:
            "#000000",

        areaHalo:
            "#ffffff",

        areaHaloWidth:
            4

    };


    // =========================================================
    // STATE
    // =========================================================

    let selectedFeature = null;
    let selectedLayer = null;
    let selectedSide = null;
    let controlPoint = null;
    let directionPoint = null;
    let drawnLine = null;
    let splitMode = null;
    let targetAreaM2 = 0;

    let selectedAreaUnit =
        localStorage.getItem(
            "parcelSubdivisionAreaUnit"
        ) ||
        CONFIG.defaultUnit;

    let previewPart1 = null;
    let previewPart2 = null;
    let previewSplitLine = null;

    let resultLayer = null;
    let dimensionLayer = null;
    let interaction = null;

    let selecting = false;
    let drawing = false;
    let pointSelecting = false;
    let directionSelecting = false;

    let subdivisionToolActive = false;

    window.parcelSubdivisionToolActive = false;

    // Used so pending parcel selection can be cancelled safely.
    let parcelSelectionKey = null;


    // =========================================================
    // MEASUREMENT PROJECTION
    // =========================================================

    const MAP_PROJECTION =
        CONFIG.mapProjection;

    const DATA_PROJECTION =
        CONFIG.dataProjection;


    // =========================================================
    // RESULT SOURCE
    // =========================================================

    const resultSource =
        new ol.source.Vector();

    resultLayer =
        new ol.layer.Vector({

            source:
                resultSource,

            zIndex:
                CONFIG.resultZIndex,

            properties: {

                title:
                    CONFIG.resultLayerName,

                subdivisionLayer:
                    true

            }

        });

    map.addLayer(
        resultLayer
    );


    // =========================================================
    // DIMENSION SOURCE
    // =========================================================

    const dimensionSource =
        new ol.source.Vector();

    dimensionLayer =
        new ol.layer.Vector({

            source:
                dimensionSource,

            zIndex:
                CONFIG.dimensionZIndex,

            properties: {

                title:
                    CONFIG.dimensionLayerName,

                subdivisionDimensionLayer:
                    true

            }

        });

    map.addLayer(
        dimensionLayer
    );


    // =========================================================
    // EXPOSE INTERNAL LAYERS
    // =========================================================

    window.parcelSubdivisionResultLayer =
        resultLayer;

    window.parcelSubdivisionDimensionLayer =
        dimensionLayer;


    // =========================================================
    // NUMBER FORMAT
    // =========================================================

    function formatNumber(
        value,
        decimals
    ) {

        if (!isFinite(value)) {
            return "0";
        }

        return Number(value).toLocaleString(
            undefined,
            {
                minimumFractionDigits: 0,
                maximumFractionDigits:
                    decimals === undefined
                        ? 2
                        : decimals
            }
        );

    }


    // =========================================================
    // MAP → UTM
    // =========================================================

    function mapToData(coordinate) {

        return ol.proj.transform(
            coordinate,
            MAP_PROJECTION,
            DATA_PROJECTION
        );

    }


    // =========================================================
    // UTM → MAP
    // =========================================================

    function dataToMap(coordinate) {

        return ol.proj.transform(
            coordinate,
            DATA_PROJECTION,
            MAP_PROJECTION
        );

    }


    // =========================================================
    // TRANSFORM RING TO DATA CRS
    // =========================================================

    function transformRingToData(ring) {

        return ring.map(
            function (coordinate) {
                return mapToData(coordinate);
            }
        );

    }


    // =========================================================
    // TRANSFORM RING TO MAP CRS
    // =========================================================

    function transformRingToMap(ring) {

        return ring.map(
            function (coordinate) {
                return dataToMap(coordinate);
            }
        );

    }


    // =========================================================
    // TRANSFORM POLYGON TO DATA CRS
    // =========================================================

    function polygonToDataCoordinates(coordinates) {

        return coordinates.map(
            function (ring) {
                return transformRingToData(ring);
            }
        );

    }


    // =========================================================
    // TRANSFORM POLYGON TO MAP CRS
    // =========================================================

    function polygonToMapCoordinates(coordinates) {

        return coordinates.map(
            function (ring) {
                return transformRingToMap(ring);
            }
        );

    }


    // =========================================================
    // DISTANCE
    // =========================================================

    function distance(
        coordinate1,
        coordinate2
    ) {

        if (!coordinate1 || !coordinate2) {
            return 0;
        }

        const p1 =
            mapToData(coordinate1);

        const p2 =
            mapToData(coordinate2);

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
    // DATA CRS DISTANCE
    // =========================================================

    function dataDistance(a, b) {

        if (!a || !b) {
            return 0;
        }

        const dx =
            b[0] - a[0];

        const dy =
            b[1] - a[1];

        return Math.sqrt(
            dx * dx +
            dy * dy
        );

    }


    // =========================================================
    // RING AREA
    // =========================================================

    function ringAreaData(coordinates) {

        if (
            !coordinates ||
            coordinates.length < 3
        ) {
            return 0;
        }

        let area = 0;

        for (
            let i = 0;
            i < coordinates.length;
            i++
        ) {

            const j =
                (i + 1) %
                coordinates.length;

            area +=
                coordinates[i][0] *
                coordinates[j][1];

            area -=
                coordinates[j][0] *
                coordinates[i][1];

        }

        return Math.abs(area / 2);

    }


    // =========================================================
    // POLYGON AREA
    // =========================================================

    function polygonAreaData(coordinates) {

        if (
            !coordinates ||
            !coordinates.length
        ) {
            return 0;
        }

        let area =
            ringAreaData(
                coordinates[0]
            );

        for (
            let i = 1;
            i < coordinates.length;
            i++
        ) {

            area -=
                ringAreaData(
                    coordinates[i]
                );

        }

        return Math.max(0, area);

    }


    // =========================================================
    // GEOMETRY AREA
    // =========================================================

    function getGeometryArea(geometry) {

        if (!geometry) {
            return 0;
        }

        const type =
            geometry.getType();

        const coordinates =
            geometry.getCoordinates();

        if (type === "Polygon") {

            return polygonAreaData(
                polygonToDataCoordinates(
                    coordinates
                )
            );

        }

        if (type === "MultiPolygon") {

            let total = 0;

            coordinates.forEach(
                function (polygon) {

                    total +=
                        polygonAreaData(
                            polygonToDataCoordinates(
                                polygon
                            )
                        );

                }
            );

            return total;

        }

        return 0;

    }


    // =========================================================
    // UNIT CONVERSION
    // =========================================================

    function convertArea(
        squareMetres,
        unit
    ) {

        switch (unit) {

            case "acre":
                return squareMetres /
                    4046.8564224;

            case "cent":
                return squareMetres /
                    40.468564224;

            case "gunta":
                return squareMetres /
                    101.17141056;

            case "ha":
                return squareMetres /
                    10000;

            case "ft2":
                return squareMetres *
                    10.763910417;

            case "m2":
            default:
                return squareMetres;

        }

    }


    // =========================================================
    // AREA LABEL
    // =========================================================

    function areaLabel(unit) {

        switch (unit) {

            case "acre":
                return "acres";

            case "cent":
                return "cents";

            case "gunta":
                return "guntas";

            case "ha":
                return "ha";

            case "ft2":
                return "ft²";

            case "m2":
            default:
                return "m²";

        }

    }


    // =========================================================
    // BEARING
    // =========================================================

    function calculateBearing(a, b) {

        const p1 =
            mapToData(a);

        const p2 =
            mapToData(b);

        const dx =
            p2[0] - p1[0];

        const dy =
            p2[1] - p1[1];

        let angle =
            Math.atan2(dx, dy) *
            180 /
            Math.PI;

        if (angle < 0) {
            angle += 360;
        }

        return angle;

    }


    // =========================================================
    // MIDPOINT
    // =========================================================

    function midpoint(a, b) {

        return [
            (a[0] + b[0]) / 2,
            (a[1] + b[1]) / 2
        ];

    }


    // =========================================================
    // CLOSEST POINT ON SEGMENT
    // =========================================================

    function closestPointOnSegment(
        p,
        a,
        b
    ) {

        const dx =
            b[0] - a[0];

        const dy =
            b[1] - a[1];

        const lengthSquared =
            dx * dx +
            dy * dy;

        if (lengthSquared === 0) {
            return [
                a[0],
                a[1]
            ];
        }

        let t =
            (
                (p[0] - a[0]) * dx +
                (p[1] - a[1]) * dy
            ) /
            lengthSquared;

        t =
            Math.max(
                0,
                Math.min(1, t)
            );

        return [
            a[0] + t * dx,
            a[1] + t * dy
        ];

    }


    // =========================================================
    // FIND NEAREST BOUNDARY SEGMENT
    // =========================================================

    function findNearestBoundarySegment(
        geometry,
        coordinate
    ) {

        const dataPoint =
            mapToData(coordinate);

        let nearest = null;

        let nearestDistance =
            Infinity;

        function processRing(ring) {

            const dataRing =
                transformRingToData(ring);

            for (
                let i = 0;
                i < dataRing.length - 1;
                i++
            ) {

                const a =
                    dataRing[i];

                const b =
                    dataRing[i + 1];

                const cp =
                    closestPointOnSegment(
                        dataPoint,
                        a,
                        b
                    );

                const d =
                    dataDistance(
                        dataPoint,
                        cp
                    );

                if (d < nearestDistance) {

                    nearestDistance = d;

                    nearest = {

                        index: i,

                        a:
                            dataToMap(a),

                        b:
                            dataToMap(b),

                        midpoint:
                            dataToMap(
                                midpoint(a, b)
                            ),

                        distance: d

                    };

                }

            }

        }

        const type =
            geometry.getType();

        const coordinates =
            geometry.getCoordinates();

        if (type === "Polygon") {

            coordinates.forEach(
                processRing
            );

        }

        if (type === "MultiPolygon") {

            coordinates.forEach(
                function (polygon) {

                    polygon.forEach(
                        processRing
                    );

                }
            );

        }

        return nearest;

    }


    // =========================================================
    // OUTER RINGS
    // =========================================================

    function getOuterRings(geometry) {

        const result = [];

        if (!geometry) {
            return result;
        }

        const type =
            geometry.getType();

        const coordinates =
            geometry.getCoordinates();

        if (type === "Polygon") {

            if (coordinates.length) {
                result.push(
                    coordinates[0]
                );
            }

        }

        if (type === "MultiPolygon") {

            coordinates.forEach(
                function (polygon) {

                    if (polygon.length) {
                        result.push(
                            polygon[0]
                        );
                    }

                }
            );

        }

        return result;

    }


    // =========================================================
    // GET INTERIOR POINT
    // =========================================================

    function getInteriorPoint(geometry) {

        try {

            return geometry
                .getInteriorPoint()
                .getCoordinates();

        } catch (error) {

            const extent =
                geometry.getExtent();

            return [
                (extent[0] + extent[2]) / 2,
                (extent[1] + extent[3]) / 2
            ];

        }

    }


    // =========================================================
    // POINT IN RING
    // =========================================================

    function pointInRing(point, ring) {

        let inside = false;

        for (
            let i = 0,
            j = ring.length - 1;
            i < ring.length;
            j = i++
        ) {

            const xi =
                ring[i][0];

            const yi =
                ring[i][1];

            const xj =
                ring[j][0];

            const yj =
                ring[j][1];

            const intersect =
                (
                    yi > point[1]
                ) !==
                (
                    yj > point[1]
                ) &&
                point[0] <
                (
                    (xj - xi) *
                    (point[1] - yi) /
                    (yj - yi)
                ) +
                xi;

            if (intersect) {
                inside = !inside;
            }

        }

        return inside;

    }


    // =========================================================
    // POINT IN POLYGON DATA
    // =========================================================

    function pointInsidePolygonData(
        point,
        polygon
    ) {

        if (
            !polygon ||
            !polygon.length
        ) {
            return false;
        }

        if (
            !pointInRing(
                point,
                polygon[0]
            )
        ) {
            return false;
        }

        for (
            let i = 1;
            i < polygon.length;
            i++
        ) {

            if (
                pointInRing(
                    point,
                    polygon[i]
                )
            ) {
                return false;
            }

        }

        return true;

    }


    // =========================================================
    // POINT INSIDE GEOMETRY
    // =========================================================

    function pointInsideGeometryData(
        point,
        geometry
    ) {

        const type =
            geometry.getType();

        const coordinates =
            geometry.getCoordinates();

        if (type === "Polygon") {

            return pointInsidePolygonData(
                point,
                polygonToDataCoordinates(
                    coordinates
                )
            );

        }

        if (type === "MultiPolygon") {

            for (
                let i = 0;
                i < coordinates.length;
                i++
            ) {

                const polygon =
                    polygonToDataCoordinates(
                        coordinates[i]
                    );

                if (
                    pointInsidePolygonData(
                        point,
                        polygon
                    )
                ) {
                    return true;
                }

            }

        }

        return false;

    }


    // =========================================================
    // NORMALIZE VECTOR
    // =========================================================

    function normalize(vector) {

        const length =
            Math.sqrt(
                vector[0] * vector[0] +
                vector[1] * vector[1]
            );

        if (length === 0) {
            return [1, 0];
        }

        return [
            vector[0] / length,
            vector[1] / length
        ];

    }


    // =========================================================
    // DOT PRODUCT
    // =========================================================

    function dot(a, b) {

        return (
            a[0] * b[0] +
            a[1] * b[1]
        );

    }


    // =========================================================
    // INTERSECTION OF SPLIT LINE WITH SEGMENT
    // =========================================================

    function lineSegmentIntersection(
        a,
        b,
        normal,
        c
    ) {

        const da =
            dot(normal, a) - c;

        const db =
            dot(normal, b) - c;

        const tolerance =
            0.000001;

        if (
            Math.abs(da) <= tolerance &&
            Math.abs(db) <= tolerance
        ) {

            return [
                a.slice(),
                b.slice()
            ];

        }

        if (Math.abs(da) <= tolerance) {
            return [a.slice()];
        }

        if (Math.abs(db) <= tolerance) {
            return [b.slice()];
        }

        if (da * db > 0) {
            return [];
        }

        const t =
            da / (da - db);

        if (
            t < -tolerance ||
            t > 1 + tolerance
        ) {
            return [];
        }

        return [[
            a[0] +
            t * (b[0] - a[0]),

            a[1] +
            t * (b[1] - a[1])
        ]];

    }


    // =========================================================
    // UNIQUE POINTS
    // =========================================================

    function uniquePoints(points) {

        const result = [];

        points.forEach(
            function (point) {

                let exists = false;

                for (
                    let i = 0;
                    i < result.length;
                    i++
                ) {

                    if (
                        dataDistance(
                            point,
                            result[i]
                        ) <=
                        CONFIG.tolerance
                    ) {

                        exists = true;
                        break;

                    }

                }

                if (!exists) {
                    result.push(point);
                }

            }
        );

        return result;

    }


    // =========================================================
    // FIND ALL SPLIT-LINE INTERSECTIONS
    // =========================================================

    function getSplitIntersections(
        geometry,
        normal,
        c
    ) {

        const intersections = [];

        const rings =
            getOuterRings(geometry);

        rings.forEach(
            function (ring) {

                const dataRing =
                    transformRingToData(ring);

                for (
                    let i = 0;
                    i < dataRing.length - 1;
                    i++
                ) {

                    const points =
                        lineSegmentIntersection(
                            dataRing[i],
                            dataRing[i + 1],
                            normal,
                            c
                        );

                    points.forEach(
                        function (point) {
                            intersections.push(point);
                        }
                    );

                }

            }
        );

        return uniquePoints(
            intersections
        );

    }


    // =========================================================
    // SORT INTERSECTIONS
    // =========================================================

    function sortIntersections(
        points,
        direction
    ) {

        return points.slice().sort(
            function (a, b) {

                return (
                    dot(a, direction) -
                    dot(b, direction)
                );

            }
        );

    }


    // =========================================================
    // FIND ACTUAL INTERIOR SPLIT SEGMENT
    // =========================================================

    function calculateSplitLine(
        geometry,
        normal,
        c,
        direction,
        preferredPoint
    ) {

        const intersections =
            getSplitIntersections(
                geometry,
                normal,
                c
            );

        if (intersections.length < 2) {
            return null;
        }

        const sorted =
            sortIntersections(
                intersections,
                direction
            );

        const candidates = [];

        for (
            let i = 0;
            i < sorted.length - 1;
            i++
        ) {

            const p1 =
                sorted[i];

            const p2 =
                sorted[i + 1];

            const segmentLength =
                dataDistance(
                    p1,
                    p2
                );

            if (segmentLength < 0.0001) {
                continue;
            }

            const mid =
                midpoint(p1, p2);

            if (
                pointInsideGeometryData(
                    mid,
                    geometry
                )
            ) {

                candidates.push({

                    a: p1,
                    b: p2,
                    midpoint: mid,
                    length: segmentLength

                });

            }

        }

        if (!candidates.length) {
            return null;
        }

        if (candidates.length === 1) {

            return {

                a:
                    dataToMap(
                        candidates[0].a
                    ),

                b:
                    dataToMap(
                        candidates[0].b
                    )

            };

        }

        if (preferredPoint) {

            const preferredData =
                mapToData(
                    preferredPoint
                );

            let best =
                candidates[0];

            let bestDistance =
                Infinity;

            candidates.forEach(
                function (candidate) {

                    const d =
                        dataDistance(
                            candidate.midpoint,
                            preferredData
                        );

                    if (d < bestDistance) {

                        bestDistance = d;
                        best = candidate;

                    }

                }
            );

            return {

                a:
                    dataToMap(best.a),

                b:
                    dataToMap(best.b)

            };

        }

        let longest =
            candidates[0];

        candidates.forEach(
            function (candidate) {

                if (
                    candidate.length >
                    longest.length
                ) {
                    longest = candidate;
                }

            }
        );

        return {

            a:
                dataToMap(longest.a),

            b:
                dataToMap(longest.b)

        };

    }


    // =========================================================
    // CLIP RING
    // =========================================================

    function clipRing(
        ring,
        normal,
        c
    ) {

        if (
            !ring ||
            ring.length < 3
        ) {
            return [];
        }

        const output = [];

        function inside(point) {

            return (
                dot(normal, point) <=
                c + 0.000001
            );

        }

        function intersection(a, b) {

            const da =
                dot(normal, a) - c;

            const db =
                dot(normal, b) - c;

            const denominator =
                da - db;

            if (
                Math.abs(denominator) <
                0.0000001
            ) {
                return a.slice();
            }

            const t =
                da / denominator;

            return [
                a[0] +
                t * (b[0] - a[0]),

                a[1] +
                t * (b[1] - a[1])
            ];

        }

        let previous =
            ring[ring.length - 1];

        let previousInside =
            inside(previous);

        for (
            let i = 0;
            i < ring.length;
            i++
        ) {

            const current =
                ring[i];

            const currentInside =
                inside(current);

            if (currentInside) {

                if (!previousInside) {

                    output.push(
                        intersection(
                            previous,
                            current
                        )
                    );

                }

                output.push(
                    current.slice()
                );

            } else if (previousInside) {

                output.push(
                    intersection(
                        previous,
                        current
                    )
                );

            }

            previous = current;
            previousInside = currentInside;

        }

        if (output.length > 1) {

            const first = output[0];
            const last =
                output[output.length - 1];

            if (
                dataDistance(
                    first,
                    last
                ) < 0.000001
            ) {
                output.pop();
            }

        }

        if (output.length < 3) {
            return [];
        }

        output.push(
            output[0].slice()
        );

        return output;

    }


    // =========================================================
    // CLIP POLYGON
    // =========================================================

    function clipPolygonData(
        polygon,
        normal,
        c
    ) {

        if (
            !polygon ||
            !polygon.length
        ) {
            return null;
        }

        const outer =
            clipRing(
                polygon[0],
                normal,
                c
            );

        if (outer.length < 4) {
            return null;
        }

        return [outer];

    }


    // =========================================================
    // CLIP GEOMETRY
    // =========================================================

    function clipGeometryData(
        geometry,
        normal,
        c
    ) {

        const type =
            geometry.getType();

        const coordinates =
            geometry.getCoordinates();

        if (type === "Polygon") {

            const dataCoordinates =
                polygonToDataCoordinates(
                    coordinates
                );

            const clipped =
                clipPolygonData(
                    dataCoordinates,
                    normal,
                    c
                );

            if (!clipped) {
                return null;
            }

            return new ol.geom.Polygon(
                clipped
            );

        }

        if (type === "MultiPolygon") {

            const polygons = [];

            coordinates.forEach(
                function (polygon) {

                    const dataPolygon =
                        polygonToDataCoordinates(
                            polygon
                        );

                    const clipped =
                        clipPolygonData(
                            dataPolygon,
                            normal,
                            c
                        );

                    if (clipped) {
                        polygons.push(clipped);
                    }

                }
            );

            if (!polygons.length) {
                return null;
            }

            return new ol.geom.MultiPolygon(
                polygons
            );

        }

        return null;

    }


    // =========================================================
    // DATA GEOMETRY → MAP
    // =========================================================

    function dataGeometryToMap(geometry) {

        if (!geometry) {
            return null;
        }

        const type =
            geometry.getType();

        if (type === "Polygon") {

            return new ol.geom.Polygon(
                geometry
                    .getCoordinates()
                    .map(transformRingToMap)
            );

        }

        if (type === "MultiPolygon") {

            return new ol.geom.MultiPolygon(
                geometry
                    .getCoordinates()
                    .map(
                        function (polygon) {
                            return polygon.map(
                                transformRingToMap
                            );
                        }
                    )
            );

        }

        return null;

    }


    // =========================================================
    // GET LINE FROM SELECTED SIDE
    // =========================================================

    function getLineFromSelectedSide() {

        if (!selectedSide) {
            return null;
        }

        const a =
            selectedSide.a;

        const b =
            selectedSide.b;

        const aData =
            mapToData(a);

        const bData =
            mapToData(b);

        const direction =
            normalize([
                bData[0] - aData[0],
                bData[1] - aData[1]
            ]);

        return {

            point:
                selectedSide.midpoint,

            direction:
                direction,

            preferredPoint:
                selectedSide.midpoint

        };

    }


    // =========================================================
    // GET LINE FROM TWO POINTS
    // =========================================================

    // =========================================================
// GET LINE FROM TWO POINTS
// FROM POINT MODE
//
// First point  = FIXED PIVOT
// Second point = INITIAL DIRECTION
//
// The first point never moves.
// The split line will rotate clockwise around it.
// =========================================================

function getLineFromTwoPoints() {

    if (
        !controlPoint ||
        !directionPoint
    ) {
        return null;
    }

    const fixedPoint =
        mapToData(controlPoint);

    const directionData =
        mapToData(directionPoint);

    const direction =
        normalize([
            directionData[0] - fixedPoint[0],
            directionData[1] - fixedPoint[1]
        ]);

    if (
        !direction ||
        !isFinite(direction[0]) ||
        !isFinite(direction[1])
    ) {
        return null;
    }

    return {

        // Original first point
        point:
            controlPoint,

        // Initial direction from
        // first point → second point
        direction:
            direction,

        // Keep first point as preferred point
        preferredPoint:
            controlPoint,

        // Tell the main split engine that
        // this is the rotating From Point mode
        rotating:
            true,

        // Fixed pivot in UTM / data CRS
        fixedPoint:
            fixedPoint

    };

}

    // =========================================================
    // GET LINE FROM DRAWN LINE
    // =========================================================

    function getLineFromDrawnLine() {

        if (
            !drawnLine ||
            drawnLine.length < 2
        ) {
            return null;
        }

        const p1 =
            drawnLine[0];

        const p2 =
            drawnLine[1];

        const d1 =
            mapToData(p1);

        const d2 =
            mapToData(p2);

        const direction =
            normalize([
                d2[0] - d1[0],
                d2[1] - d1[1]
            ]);

        return {

            point:
                p1,

            direction:
                direction,

            preferredPoint:
                midpoint(p1, p2)

        };

    }





// =========================================================
// FIND ROTATING SPLIT FOR TARGET AREA
// FROM POINT MODE
//
// First point  = FIXED PIVOT
// Second point = INITIAL DIRECTION
//
// The split line always passes through the fixed point.
//
// The line rotates CLOCKWISE around the fixed point.
//
// Part 1 is the clockwise/right-hand side of the
// directed split line.
//
// The first target-area crossing is detected using
// angular sampling and then refined using binary search.
// =========================================================

function findRotatingSplitForTargetArea(
    geometry,
    lineInfo,
    targetArea
) {

    if (
        !geometry ||
        !lineInfo ||
        !lineInfo.fixedPoint
    ) {
        return null;
    }

    const fixedPoint =
        lineInfo.fixedPoint;

    const initialDirection =
        normalize(
            lineInfo.direction
        );

    if (
        !initialDirection ||
        !isFinite(initialDirection[0]) ||
        !isFinite(initialDirection[1])
    ) {
        return null;
    }


    // =====================================================
    // ROTATE CLOCKWISE
    // =====================================================

    function rotateClockwise(
        vector,
        angle
    ) {

        const cos =
            Math.cos(angle);

        const sin =
            Math.sin(angle);

        return normalize([
            vector[0] * cos +
            vector[1] * sin,

            -vector[0] * sin +
            vector[1] * cos
        ]);

    }


    // =====================================================
    // CALCULATE SPLIT FOR ONE ANGLE
    // =====================================================

    function calculateAtAngle(
        angle
    ) {

        const direction =
            rotateClockwise(
                initialDirection,
                angle
            );

        if (
            !direction ||
            !isFinite(direction[0]) ||
            !isFinite(direction[1])
        ) {
            return null;
        }


        // -------------------------------------------------
        // RIGHT-HAND / CLOCKWISE NORMAL
        // -------------------------------------------------

        const normal = [
            direction[1],
            -direction[0]
        ];


        // -------------------------------------------------
        // IMPORTANT:
        //
        // The split line MUST pass through the fixed point.
        //
        // Therefore:
        //
        //      dot(normal, X) = dot(normal, fixedPoint)
        //
        // -------------------------------------------------

        const c =
            dot(
                normal,
                fixedPoint
            );


        // =================================================
        // PART 1
        // =================================================

        const part1DataGeometry =
            clipGeometryData(
                geometry,
                normal,
                c
            );

        if (!part1DataGeometry) {
            return null;
        }

        const part1Geometry =
            dataGeometryToMap(
                part1DataGeometry
            );

        if (!part1Geometry) {
            return null;
        }


        const part1Area =
            getGeometryArea(
                part1Geometry
            );


        // =================================================
        // PART 2
        // =================================================

        const oppositeNormal = [
            -normal[0],
            -normal[1]
        ];

        const oppositeC =
            -c;


        const part2DataGeometry =
            clipGeometryData(
                geometry,
                oppositeNormal,
                oppositeC
            );

        if (!part2DataGeometry) {
            return null;
        }

        const part2Geometry =
            dataGeometryToMap(
                part2DataGeometry
            );

        if (!part2Geometry) {
            return null;
        }


        // =================================================
        // ACTUAL INTERIOR SPLIT LINE
        //
        // Reuse the existing function.
        // =================================================

        const splitLine =
            calculateSplitLine(
                geometry,
                normal,
                c,
                direction,
                lineInfo.preferredPoint
            );

        if (!splitLine) {
            return null;
        }


        return {

            angle:
                angle,

            area:
                part1Area,

            direction:
                direction,

            normal:
                normal,

            c:
                c,

            part1:
                part1Geometry,

            part2:
                part2Geometry,

            splitLine:
                splitLine

        };

    }


    // =====================================================
    // STARTING POSITION
    // =====================================================

    const startingResult =
        calculateAtAngle(0);

    if (!startingResult) {
        return null;
    }


    // =====================================================
    // ALREADY AT TARGET
    // =====================================================

    if (
        Math.abs(
            startingResult.area -
            targetArea
        ) <=
        CONFIG.tolerance
    ) {

        return {

            part1:
                startingResult.part1,

            part2:
                startingResult.part2,

            splitLine:
                startingResult.splitLine

        };

    }


    // =====================================================
    // CLOCKWISE SEARCH
    //
    // Search every 1 degree.
    //
    // This only finds the bracket.
    // The actual answer is refined later.
    // =====================================================

    const angleStep =
        Math.PI / 180;

    const totalSteps =
        360;


    let previous =
        startingResult;

    let previousAngle =
        0;


    let lowerAngle =
        null;

    let upperAngle =
        null;

    let lowerResult =
        null;

    let upperResult =
        null;


    for (
        let step = 1;
        step <= totalSteps;
        step++
    ) {

        // Negative angle =
        // clockwise rotation
        const angle =
            -step * angleStep;


        const current =
            calculateAtAngle(
                angle
            );

        if (!current) {
            continue;
        }


        const previousDifference =
            previous.area -
            targetArea;

        const currentDifference =
            current.area -
            targetArea;


        // -------------------------------------------------
        // Exact enough
        // -------------------------------------------------

        if (
            Math.abs(
                currentDifference
            ) <=
            CONFIG.tolerance
        ) {

            return {

                part1:
                    current.part1,

                part2:
                    current.part2,

                splitLine:
                    current.splitLine

            };

        }


        // -------------------------------------------------
        // TARGET CROSSING FOUND
        // -------------------------------------------------

        const crossed =
            (
                previousDifference < 0 &&
                currentDifference > 0
            ) ||
            (
                previousDifference > 0 &&
                currentDifference < 0
            );


        if (crossed) {

            lowerAngle =
                previousAngle;

            upperAngle =
                angle;

            lowerResult =
                previous;

            upperResult =
                current;

            break;

        }


        previous =
            current;

        previousAngle =
            angle;

    }


    // =====================================================
    // NO TARGET CROSSING
    // =====================================================

    if (
        !lowerResult ||
        !upperResult
    ) {

        return null;

    }


    // =====================================================
    // BEST CURRENT RESULT
    // =====================================================

    let bestResult =
        Math.abs(
            lowerResult.area -
            targetArea
        ) <
        Math.abs(
            upperResult.area -
            targetArea
        )
            ? lowerResult
            : upperResult;


    // =====================================================
    // ANGULAR BINARY REFINEMENT
    // =====================================================

    for (
        let iteration = 0;
        iteration <
        CONFIG.binaryIterations;
        iteration++
    ) {

        const middleAngle =
            (
                lowerAngle +
                upperAngle
            ) / 2;


        const middleResult =
            calculateAtAngle(
                middleAngle
            );

        if (!middleResult) {
            break;
        }


        const middleDifference =
            middleResult.area -
            targetArea;


        // -------------------------------------------------
        // Keep the closest result
        // -------------------------------------------------

        if (
            Math.abs(
                middleDifference
            ) <
            Math.abs(
                bestResult.area -
                targetArea
            )
        ) {

            bestResult =
                middleResult;

        }


        // -------------------------------------------------
        // Target reached
        // -------------------------------------------------

        if (
            Math.abs(
                middleDifference
            ) <=
            CONFIG.tolerance
        ) {

            bestResult =
                middleResult;

            break;

        }


        // -------------------------------------------------
        // Continue binary search
        // -------------------------------------------------

        const lowerDifference =
            lowerResult.area -
            targetArea;


        if (
            (
                lowerDifference < 0 &&
                middleDifference < 0
            ) ||
            (
                lowerDifference > 0 &&
                middleDifference > 0
            )
        ) {

            lowerAngle =
                middleAngle;

            lowerResult =
                middleResult;

        } else {

            upperAngle =
                middleAngle;

            upperResult =
                middleResult;

        }

    }


    // =====================================================
    // FINAL RESULT
    // =====================================================

    if (!bestResult) {
        return null;
    }


    return {

        part1:
            bestResult.part1,

        part2:
            bestResult.part2,

        splitLine:
            bestResult.splitLine

    };

}


    // =========================================================
    // FIND SPLIT FOR TARGET AREA
    // =========================================================
function findSplitForTargetArea(
    geometry,
    lineInfo,
    targetArea
) {

    if (
        !geometry ||
        !lineInfo
    ) {
        return null;
    }


    // =====================================================
    // FROM POINT MODE
    //
    // Fixed first point + clockwise rotation.
    //
    // Select Side and Draw Line continue with the
    // original calculation below.
    // =====================================================

    if (
        lineInfo.rotating === true
    ) {

        return findRotatingSplitForTargetArea(
            geometry,
            lineInfo,
            targetArea
        );

    }


    // =====================================================
    // ORIGINAL SELECT SIDE / DRAW LINE CODE
    // =====================================================

    const direction =
        normalize(
            lineInfo.direction
        );

        let normal = [
            -direction[1],
            direction[0]
        ];

        const preferredData =
            lineInfo.preferredPoint
                ? mapToData(
                    lineInfo.preferredPoint
                )
                : mapToData(
                    getInteriorPoint(
                        geometry
                    )
                );

        const preferredValue =
            dot(
                normal,
                preferredData
            );

        const rings =
            getOuterRings(
                geometry
            );

        let minProjection =
            Infinity;

        let maxProjection =
            -Infinity;

        rings.forEach(
            function (ring) {

                const dataRing =
                    transformRingToData(
                        ring
                    );

                dataRing.forEach(
                    function (point) {

                        const value =
                            dot(
                                normal,
                                point
                            );

                        minProjection =
                            Math.min(
                                minProjection,
                                value
                            );

                        maxProjection =
                            Math.max(
                                maxProjection,
                                value
                            );

                    }
                );

            }
        );

        let part1Normal =
            normal;

        let low =
            minProjection;

        let high =
            maxProjection;

        const distanceToMin =
            Math.abs(
                preferredValue -
                minProjection
            );

        const distanceToMax =
            Math.abs(
                maxProjection -
                preferredValue
            );

        if (
            distanceToMax <
            distanceToMin
        ) {

            part1Normal = [
                -normal[0],
                -normal[1]
            ];

            const oldMin =
                minProjection;

            minProjection =
                -maxProjection;

            maxProjection =
                -oldMin;

            low =
                minProjection;

            high =
                maxProjection;

        }

        let bestGeometry = null;
        let bestArea = 0;
        let bestC = null;

        for (
            let iteration = 0;
            iteration <
            CONFIG.binaryIterations;
            iteration++
        ) {

            const c =
                (low + high) / 2;

            const clipped =
                clipGeometryData(
                    geometry,
                    part1Normal,
                    c
                );

            if (!clipped) {

                low = c;
                continue;

            }

            const area =
                getGeometryArea(
                    dataGeometryToMap(
                        clipped
                    )
                );

            bestGeometry =
                clipped;

            bestArea =
                area;

            bestC =
                c;

            if (area < targetArea) {
                low = c;
            } else {
                high = c;
            }

        }

        if (!bestGeometry) {
            return null;
        }

        const part1DataGeometry =
            bestGeometry;

        const oppositeNormal = [
            -part1Normal[0],
            -part1Normal[1]
        ];

        const oppositeC =
            -bestC;

        const part2DataGeometry =
            clipGeometryData(
                geometry,
                oppositeNormal,
                oppositeC
            );

        if (!part2DataGeometry) {
            return null;
        }

        const part1Geometry =
            dataGeometryToMap(
                part1DataGeometry
            );

        const part2Geometry =
            dataGeometryToMap(
                part2DataGeometry
            );

        const splitLine =
            calculateSplitLine(
                geometry,
                part1Normal,
                bestC,
                direction,
                lineInfo.preferredPoint
            );

        if (!splitLine) {
            return null;
        }

        return {

            part1:
                part1Geometry,

            part2:
                part2Geometry,

            splitLine:
                splitLine

        };

    }


    // =========================================================
    // CLEAR RESULT
    // =========================================================

    function clearResults() {

        resultSource.clear();

        dimensionSource.clear();

        previewPart1 = null;
        previewPart2 = null;
        previewSplitLine = null;

    }


    // =========================================================
    // PARCEL SELECTION STYLE
    // =========================================================

    function highlightSelectedParcel(
        feature
    ) {

        if (
            !Object.prototype.hasOwnProperty.call(
                feature.getProperties(),
                "parcelSubdivisionOriginalStyle"
            )
        ) {

            feature.set(
                "parcelSubdivisionOriginalStyle",
                feature.getStyle()
            );

        }

        feature.setStyle(

            new ol.style.Style({

                fill:
                    new ol.style.Fill({

                        color:
                            "rgba(255,193,7,0.20)"

                    }),

                stroke:
                    new ol.style.Stroke({

                        color:
                            "#ff9800",

                        width:
                            4

                    })

            })

        );

    }


    // =========================================================
    // RESTORE SELECTED PARCEL
    // =========================================================

    function restoreSelectedParcel() {

        if (!selectedFeature) {
            return;
        }

        const originalStyle =
            selectedFeature.get(
                "parcelSubdivisionOriginalStyle"
            );

        selectedFeature.setStyle(
            originalStyle || null
        );

        selectedFeature.unset(
            "parcelSubdivisionOriginalStyle"
        );

    }


    // =========================================================
    // CANCEL PENDING PARCEL SELECTION
    // =========================================================

    function cancelParcelSelection() {

        if (parcelSelectionKey) {

            try {

                ol.Observable.unByKey(
                    parcelSelectionKey
                );

            } catch (error) {}

            parcelSelectionKey = null;

        }

        selecting = false;

    }


    // =========================================================
    // START PARCEL SELECTION
    // =========================================================

    function startParcelSelection() {

        closeDialog();

        cancelParcelSelection();

        selecting = true;

        showMessage(
            "📍 Click the parcel you want to subdivide."
        );

        parcelSelectionKey =
            map.once(
                "singleclick",
                selectParcel
            );

    }


    // =========================================================
    // SELECT PARCEL
    // =========================================================

    function selectParcel(event) {

        parcelSelectionKey = null;

        if (!selecting) {
            return;
        }

        const pixel =
            map.getEventPixel(
                event.originalEvent
            );

        let found = null;

        map.forEachFeatureAtPixel(
            pixel,
            function (
                feature,
                layer
            ) {

                if (found) {
                    return;
                }

                if (
                    layer === resultLayer ||
                    layer === dimensionLayer
                ) {
                    return;
                }

                if (
                    feature.get(
                        "subdivisionLayer"
                    ) ||
                    feature.get(
                        "subdivisionDimensionLayer"
                    )
                ) {
                    return;
                }

                const geometry =
                    feature.getGeometry();

                if (!geometry) {
                    return;
                }

                const type =
                    geometry.getType();

                if (
                    type !== "Polygon" &&
                    type !== "MultiPolygon"
                ) {
                    return;
                }

                found = {
                    feature: feature,
                    layer: layer
                };

            }
        );

        if (!found) {

            showMessage(
                "⚠️ Please click inside a polygon parcel."
            );

            // Allow another click.
            parcelSelectionKey =
                map.once(
                    "singleclick",
                    selectParcel
                );

            return;

        }

        restoreSelectedParcel();

        selectedFeature =
            found.feature;

        selectedLayer =
            found.layer;

        highlightSelectedParcel(
            selectedFeature
        );

        selecting = false;

        if (
            typeof window.closeFeaturePopup ===
            "function"
        ) {

            window.closeFeaturePopup();

        }

        showMethodDialog();

    }


    // =========================================================
    // FIND MAP VECTOR LAYERS
    // =========================================================

    function getSelectableLayers() {

        const layers = [];

        map.getLayers()
            .forEach(
                function (layer) {

                    if (
                        layer instanceof
                        ol.layer.Vector
                    ) {

                        if (
                            layer === resultLayer ||
                            layer === dimensionLayer
                        ) {
                            return;
                        }

                        if (layer.getVisible()) {
                            layers.push(layer);
                        }

                    }

                }
            );

        return layers;

    }


    // =========================================================
    // SELECT SIDE
    // =========================================================

    function startSelectSide() {

        splitMode = "side";

        closeDialog();

        showMessage(
            "📐 Click near the parcel boundary side to use."
        );

        map.once(
            "singleclick",
            function (event) {

                if (
                    !subdivisionToolActive ||
                    !selectedFeature
                ) {
                    return;
                }

                const coordinate =
                    event.coordinate;

                selectedSide =
                    findNearestBoundarySegment(
                        selectedFeature.getGeometry(),
                        coordinate
                    );

                if (!selectedSide) {

                    showMessage(
                        "⚠️ Could not identify the boundary side."
                    );

                    showMethodDialog();

                    return;

                }

                drawSelectedSide();

                showTargetAreaDialog();

            }
        );

    }


    // =========================================================
    // DRAW SELECTED SIDE
    // =========================================================

    function drawSelectedSide() {

        dimensionSource.clear();

        if (!selectedSide) {
            return;
        }

        const feature =
            new ol.Feature({

                geometry:
                    new ol.geom.LineString([
                        selectedSide.a,
                        selectedSide.b
                    ])

            });

        feature.setStyle(

            new ol.style.Style({

                stroke:
                    new ol.style.Stroke({

                        color:
                            "#ff0000",

                        width:
                            5

                    })

            })

        );

        dimensionSource.addFeature(
            feature
        );

    }



// =========================================================
// SNAP TO NEAREST PARCEL VERTEX
//
// Used by FROM POINT mode.
//
// If the clicked position is close enough to a parcel
// vertex, return the EXACT vertex coordinate.
//
// Otherwise return the original clicked coordinate.
// =========================================================

function snapToParcelVertex(
    coordinate,
    geometry
) {

    if (
        !coordinate ||
        !geometry
    ) {
        return coordinate;
    }


    // -----------------------------------------------------
    // SNAP TOLERANCE
    //
    // 12 screen pixels.
    //
    // This makes snapping independent of zoom level.
    // -----------------------------------------------------

    const SNAP_PIXEL_TOLERANCE = 12;

    const resolution =
        map.getView().getResolution();

    if (
        !resolution ||
        !isFinite(resolution)
    ) {
        return coordinate;
    }

    const tolerance =
        resolution *
        SNAP_PIXEL_TOLERANCE;

    const toleranceSquared =
        tolerance *
        tolerance;


    let nearestVertex = null;

    let nearestDistanceSquared =
        Infinity;


    // -----------------------------------------------------
    // CHECK ONE VERTEX
    // -----------------------------------------------------

    function checkVertex(
        vertex
    ) {

        if (
            !vertex ||
            vertex.length < 2
        ) {
            return;
        }

        const dx =
            vertex[0] -
            coordinate[0];

        const dy =
            vertex[1] -
            coordinate[1];

        const distanceSquared =
            dx * dx +
            dy * dy;


        if (
            distanceSquared <
            nearestDistanceSquared
        ) {

            nearestDistanceSquared =
                distanceSquared;

            nearestVertex = [
                vertex[0],
                vertex[1]
            ];

        }

    }


    // -----------------------------------------------------
    // RECURSIVELY PROCESS GEOMETRY COORDINATES
    // -----------------------------------------------------

    function processCoordinates(
        coordinates
    ) {

        if (
            !coordinates
        ) {
            return;
        }


        // Coordinate pair
        if (
            typeof coordinates[0] === "number" &&
            typeof coordinates[1] === "number"
        ) {

            checkVertex(
                coordinates
            );

            return;
        }


        // Nested coordinates
        if (
            Array.isArray(coordinates)
        ) {

            coordinates.forEach(
                function (item) {

                    processCoordinates(
                        item
                    );

                }
            );

        }

    }


    processCoordinates(
        geometry.getCoordinates()
    );


    // -----------------------------------------------------
    // RETURN SNAP ONLY IF WITHIN TOLERANCE
    // -----------------------------------------------------

    if (
        nearestVertex &&
        nearestDistanceSquared <=
        toleranceSquared
    ) {

        return nearestVertex;

    }


    // No nearby vertex
    return coordinate;

}







    // =========================================================
    // START FROM POINT
    // =========================================================

    // =========================================================
// START FROM POINT
//
// FROM POINT WORKFLOW
//
// 1. Click first point
//    → snaps to nearest parcel vertex when close.
//
// 2. Click second point
//    → also snaps to nearest parcel vertex when close.
//
// 3. First point remains the FIXED pivot.
//
// 4. Second point defines the INITIAL direction.
//
// 5. The split line subsequently rotates CLOCKWISE
//    around the fixed first point.
// =========================================================

function startFromPoint() {

    splitMode =
        "point";

    closeDialog();

    pointSelecting =
        true;


    showMessage(
        "📍 Click a parcel vertex or point. The nearest vertex will snap automatically."
    );


    map.once(
        "singleclick",
        function (event) {

            if (
                !subdivisionToolActive ||
                !pointSelecting
            ) {
                return;
            }


            // -------------------------------------------------
            // GET ORIGINAL CLICK
            // -------------------------------------------------

            const clickedCoordinate =
                event.coordinate;


            // -------------------------------------------------
            // SNAP FIRST POINT
            // -------------------------------------------------

            controlPoint =
                snapToParcelVertex(
                    clickedCoordinate,
                    selectedFeature.getGeometry()
                );


            pointSelecting =
                false;


            // -------------------------------------------------
            // SHOW THE ACTUAL SNAPPED POINT
            // -------------------------------------------------

            drawControlPoint();


            // -------------------------------------------------
            // SELECT SECOND POINT
            // -------------------------------------------------

            directionSelecting =
                true;


            showMessage(
                "➡️ Click the second point to define the split direction. Vertex snapping is active."
            );


            map.once(
                "singleclick",
                function (event2) {

                    if (
                        !subdivisionToolActive ||
                        !directionSelecting
                    ) {
                        return;
                    }


                    // -----------------------------------------
                    // GET ORIGINAL SECOND CLICK
                    // -----------------------------------------

                    const clickedDirection =
                        event2.coordinate;


                    // -----------------------------------------
                    // SNAP SECOND POINT
                    // -----------------------------------------

                    directionPoint =
                        snapToParcelVertex(
                            clickedDirection,
                            selectedFeature.getGeometry()
                        );


                    // -----------------------------------------
                    // PREVENT ZERO-LENGTH DIRECTION
                    // -----------------------------------------

                    const fixedData =
                        mapToData(
                            controlPoint
                        );

                    const directionData =
                        mapToData(
                            directionPoint
                        );


                    const dx =
                        directionData[0] -
                        fixedData[0];

                    const dy =
                        directionData[1] -
                        fixedData[1];


                    const length =
                        Math.sqrt(
                            dx * dx +
                            dy * dy
                        );


                    if (
                        length <
                        0.001
                    ) {

                        directionSelecting =
                            true;


                        showMessage(
                            "⚠️ The second point cannot be the same as the fixed point. Please click another point."
                        );


                        return;

                    }


                    directionSelecting =
                        false;


                    // -----------------------------------------
                    // DRAW INITIAL DIRECTION
                    // -----------------------------------------

                    drawDirectionLine();


                    // -----------------------------------------
                    // CONTINUE TO TARGET AREA
                    // -----------------------------------------

                    showTargetAreaDialog();

                }
            );

        }
    );

}

    // =========================================================
    // DRAW CONTROL POINT
    // =========================================================

    function drawControlPoint() {

        dimensionSource.clear();

        if (!controlPoint) {
            return;
        }

        const feature =
            new ol.Feature({

                geometry:
                    new ol.geom.Point(
                        controlPoint
                    )

            });

        feature.setStyle(

            new ol.style.Style({

                image:
                    new ol.style.Circle({

                        radius:
                            7,

                        fill:
                            new ol.style.Fill({

                                color:
                                    "#ffffff"

                            }),

                        stroke:
                            new ol.style.Stroke({

                                color:
                                    "#ff0000",

                                width:
                                    3

                            })

                    })

            })

        );

        dimensionSource.addFeature(
            feature
        );

    }


    // =========================================================
    // DRAW DIRECTION LINE
    // =========================================================

    function drawDirectionLine() {

        dimensionSource.clear();

        if (
            !controlPoint ||
            !directionPoint
        ) {
            return;
        }

        const line =
            new ol.Feature({

                geometry:
                    new ol.geom.LineString([
                        controlPoint,
                        directionPoint
                    ])

            });

        line.setStyle(

            new ol.style.Style({

                stroke:
                    new ol.style.Stroke({

                        color:
                            "#ff0000",

                        width:
                            3,

                        lineDash:
                            [10, 8]

                    })

            })

        );

        dimensionSource.addFeature(
            line
        );

    }


    // =========================================================
    // START DRAW LINE
    // =========================================================

    function startDrawLine() {

        splitMode = "draw";

        closeDialog();

        drawing = true;

        showMessage(
            "✏️ Draw the direction line across the parcel."
        );

        interaction =
            new ol.interaction.Draw({

                source:
                    new ol.source.Vector(),

                type:
                    "LineString",

                maxPoints:
                    2

            });

        map.addInteraction(
            interaction
        );

        interaction.on(
            "drawend",
            function (event) {

                if (!subdivisionToolActive) {
                    return;
                }

                drawnLine =
                    event.feature
                        .getGeometry()
                        .getCoordinates();

                map.removeInteraction(
                    interaction
                );

                interaction = null;

                drawing = false;

                showTargetAreaDialog();

            }
        );

    }


    // =========================================================
    // TARGET AREA DIALOG
    // =========================================================

    function showTargetAreaDialog() {

        if (
            !subdivisionToolActive ||
            !selectedFeature
        ) {
            return;
        }

        const originalArea =
            getGeometryArea(
                selectedFeature.getGeometry()
            );

        const html = `

            <div
                id="parcel-subdivision-dialog"
                class="parcel-subdivision-dialog">

                <div class="ps-title">
                    📐 Parcel Subdivision
                </div>

                <div class="ps-info">

                    <b>Original Area:</b><br>

                    ${formatNumber(
                        convertArea(
                            originalArea,
                            selectedAreaUnit
                        )
                    )}
                    ${areaLabel(
                        selectedAreaUnit
                    )}

                </div>

                <div class="ps-setting">

                    <label>
                        Area Unit
                    </label>

                    <select
                        id="ps-area-unit">

                        <option value="m2">
                            Square metres (m²)
                        </option>

                        <option value="cent">
                            Cents
                        </option>

                        <option value="gunta">
                            Guntas
                        </option>

                        <option value="acre">
                            Acres
                        </option>

                        <option value="ha">
                            Hectares
                        </option>

                        <option value="ft2">
                            Square feet (ft²)
                        </option>

                    </select>

                </div>

                <div class="ps-setting">

                    <label>
                        Part 1 Target Area
                    </label>

                    <input
                        id="ps-target-area"
                        type="number"
                        step="any"
                        min="0">

                </div>

                <div class="ps-info">

                    <b>Measurement CRS:</b><br>

                    EPSG:32643 — WGS 84 / UTM zone 43N

                    <br><br>

                    <b>Calculation:</b><br>

                    UTM planar measurement

                </div>

                <div class="ps-buttons">

                    <button
                        id="ps-preview"
                        class="ps-primary">
                        👁 Preview
                    </button>

                    <button
                        id="ps-cancel">
                        ✖ Cancel
                    </button>

                </div>

            </div>

        `;

        showDialog(html);

        const unitSelect =
            document.getElementById(
                "ps-area-unit"
            );

        const targetInput =
            document.getElementById(
                "ps-target-area"
            );

        unitSelect.value =
            selectedAreaUnit;

        targetInput.max =
            convertArea(
                originalArea,
                selectedAreaUnit
            );

        unitSelect.addEventListener(
            "change",
            function () {

                selectedAreaUnit =
                    this.value;

                localStorage.setItem(
                    "parcelSubdivisionAreaUnit",
                    selectedAreaUnit
                );

                targetInput.max =
                    convertArea(
                        originalArea,
                        selectedAreaUnit
                    );

            }
        );

        document.getElementById(
            "ps-preview"
        ).addEventListener(
            "click",
            function () {

                const value =
                    Number(
                        targetInput.value
                    );

                if (
                    !isFinite(value) ||
                    value <= 0
                ) {

                    alert(
                        "Please enter a valid target area."
                    );

                    return;

                }

                targetAreaM2 =
                    value *
                    getAreaUnitFactor(
                        selectedAreaUnit
                    );

                if (
                    targetAreaM2 >=
                    originalArea
                ) {

                    alert(
                        "Target area must be smaller than the original parcel area."
                    );

                    return;

                }

                closeDialog();

                generateSubdivision();

            }
        );

        document.getElementById(
            "ps-cancel"
        ).addEventListener(
            "click",
            function () {

                resetTool();

            }
        );

    }


    // =========================================================
    // AREA UNIT FACTOR
    // =========================================================

    function getAreaUnitFactor(unit) {

        switch (unit) {

            case "acre":
                return 4046.8564224;

            case "cent":
                return 40.468564224;

            case "gunta":
                return 101.17141056;

            case "ha":
                return 10000;

            case "ft2":
                return 0.09290304;

            case "m2":
            default:
                return 1;

        }

    }


    // =========================================================
    // GENERATE SUBDIVISION
    // =========================================================

    function generateSubdivision() {

        clearResults();

        let lineInfo = null;

        if (splitMode === "side") {

            lineInfo =
                getLineFromSelectedSide();

        } else if (splitMode === "point") {

            lineInfo =
                getLineFromTwoPoints();

        } else if (splitMode === "draw") {

            lineInfo =
                getLineFromDrawnLine();

        }

        if (!lineInfo) {

            alert(
                "Unable to determine the split direction."
            );

            showTargetAreaDialog();

            return;

        }

        const result =
            findSplitForTargetArea(
                selectedFeature.getGeometry(),
                lineInfo,
                targetAreaM2
            );

        if (!result) {

            alert(
                "Unable to create the requested subdivision."
            );

            showTargetAreaDialog();

            return;

        }

        previewPart1 =
            result.part1;

        previewPart2 =
            result.part2;

        previewSplitLine =
            result.splitLine;

        showPreview();

    }


    // =========================================================
    // SHOW PREVIEW
    // =========================================================

    function showPreview() {

        resultSource.clear();
        dimensionSource.clear();

        const part1Feature =
            new ol.Feature({

                geometry:
                    previewPart1

            });

        part1Feature.set(
            "subdivisionPart",
            "Part 1"
        );

        part1Feature.set(
            "subdivisionPreview",
            true
        );

        part1Feature.setStyle(

            new ol.style.Style({

                fill:
                    new ol.style.Fill({

                        color:
                            "rgba(0,150,136,0.30)"

                    }),

                stroke:
                    new ol.style.Stroke({

                        color:
                            "#00897b",

                        width:
                            3

                    }),

                text:
                    new ol.style.Text({

                        text:
                            "",

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
                                    4

                            })

                    })

            })

        );

        resultSource.addFeature(
            part1Feature
        );


        const part2Feature =
            new ol.Feature({

                geometry:
                    previewPart2

            });

        part2Feature.set(
            "subdivisionPart",
            "Part 2"
        );

        part2Feature.set(
            "subdivisionPreview",
            true
        );

        part2Feature.setStyle(

            new ol.style.Style({

                fill:
                    new ol.style.Fill({

                        color:
                            "rgba(33,150,243,0.25)"

                    }),

                stroke:
                    new ol.style.Stroke({

                        color:
                            "#1976d2",

                        width:
                            3

                    }),

                text:
                    new ol.style.Text({

                        text:
                            "",

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
                                    4

                            })

                    })

            })

        );

        resultSource.addFeature(
            part2Feature
        );


        const splitFeature =
            new ol.Feature({

                geometry:
                    new ol.geom.LineString([

                        previewSplitLine.a,
                        previewSplitLine.b

                    ])

            });

        splitFeature.set(
            "subdivisionSplitLine",
            true
        );

        splitFeature.set(
            "subdivisionPreview",
            true
        );

        splitFeature.setStyle(

            new ol.style.Style({

                stroke:
                    new ol.style.Stroke({

                        color:
                            "#ff0000",

                        width:
                            CONFIG.splitLineWidth

                    })

            })

        );

        resultSource.addFeature(
            splitFeature
        );


        drawSubdivisionDimensions();

        // IMPORTANT:
        // Do NOT open the old result dialog here.
        // Instead show compact top-of-map controls.
        showPreviewControls();

    }


    // =========================================================
    // PREVIEW TOP CONTROLS
    // =========================================================

    function removePreviewControls() {

        const element =
            document.getElementById(
                "parcel-subdivision-preview-controls"
            );

        if (element) {
            element.remove();
        }

    }


    function showPreviewControls() {

        removePreviewControls();

        const controls =
            document.createElement(
                "div"
            );

        controls.id =
            "parcel-subdivision-preview-controls";

        controls.innerHTML = `

            <button
                id="ps-preview-apply"
                title="Apply Split">
                ✓
            </button>

            <button
                id="ps-preview-back"
                title="Back to Target Area">
                ✕
            </button>

        `;

        document.body.appendChild(
            controls
        );

        document.getElementById(
            "ps-preview-apply"
        ).addEventListener(
            "click",
            function (event) {

                event.preventDefault();
                event.stopPropagation();

                applySplit();

            }
        );

        document.getElementById(
            "ps-preview-back"
        ).addEventListener(
            "click",
            function (event) {

                event.preventDefault();
                event.stopPropagation();

                backFromPreview();

            }
        );

    }


    // =========================================================
    // BACK FROM PREVIEW
    // =========================================================

    function backFromPreview() {

        removePreviewControls();

        resultSource.clear();
        dimensionSource.clear();

        previewPart1 = null;
        previewPart2 = null;
        previewSplitLine = null;

        showTargetAreaDialog();

    }


    // =========================================================
    // DIMENSION TEXT STYLE
    // =========================================================

    function dimensionTextStyle(
        text,
        rotation
    ) {

        return new ol.style.Style({

            text:
                new ol.style.Text({

                    text:
                        text,

                    font:
                        CONFIG.dimensionFont,

                    rotation:
                        rotation,

                    textAlign:
                        "center",

                    placement:
                        "line",

                    fill:
                        new ol.style.Fill({

                            color:
                                CONFIG.dimensionColor

                        }),

                    stroke:
                        new ol.style.Stroke({

                            color:
                                CONFIG.dimensionHalo,

                            width:
                                CONFIG.dimensionHaloWidth

                        }),

                    offsetY:
                        -CONFIG.dimensionOffset,

                    overflow:
                        true

                })

        });

    }


    // =========================================================
    // SAFE TEXT ROTATION
    // =========================================================

    function dimensionRotation(a, b) {

        const dx =
            b[0] - a[0];

        const dy =
            b[1] - a[1];

        let angle =
            Math.atan2(
                dy,
                dx
            );

        if (
            angle > Math.PI / 2 ||
            angle < -Math.PI / 2
        ) {

            angle += Math.PI;

        }

        return -angle;

    }


    // =========================================================
    // DRAW DIMENSIONS
    // =========================================================

    function drawDimensionLine(
        a,
        b,
        text,
        isSplit
    ) {

        const feature =
            new ol.Feature({

                geometry:
                    new ol.geom.LineString([
                        a,
                        b
                    ])

            });

        feature.setStyle(

            new ol.style.Style({

                stroke:
                    new ol.style.Stroke({

                        color:
                            isSplit
                                ? "#ff0000"
                                : "#333333",

                        width:
                            isSplit
                                ? 3
                                : 1.5,

                        lineDash:
                            isSplit
                                ? [8, 5]
                                : undefined

                    })

            })

        );

        dimensionSource.addFeature(
            feature
        );

        const labelFeature =
            new ol.Feature({

                geometry:
                    new ol.geom.Point(
                        midpoint(a, b)
                    )

            });

        labelFeature.setStyle(

            dimensionTextStyle(

                text,

                dimensionRotation(
                    a,
                    b
                )

            )

        );

        dimensionSource.addFeature(
            labelFeature
        );

    }


    // =========================================================
    // DRAW GEOMETRY BOUNDARY DIMENSIONS
    // =========================================================

    function drawGeometryDimensions(
        geometry
    ) {

        const type =
            geometry.getType();

        const coordinates =
            geometry.getCoordinates();

        function processPolygon(polygon) {

            if (
                !polygon ||
                !polygon.length
            ) {
                return;
            }

            const ring =
                polygon[0];

            for (
                let i = 0;
                i < ring.length - 1;
                i++
            ) {

                const a =
                    ring[i];

                const b =
                    ring[i + 1];

                const length =
                    distance(a, b);

                if (length < 0.01) {
                    continue;
                }

                drawDimensionLine(

                    a,

                    b,

                    formatNumber(length) +
                    " m",

                    false

                );

            }

        }

        if (type === "Polygon") {

            processPolygon(
                coordinates
            );

        }

        if (type === "MultiPolygon") {

            coordinates.forEach(
                processPolygon
            );

        }

    }


    // =========================================================
    // AREA LABEL STYLE
    // =========================================================

    function subdivisionAreaTextStyle(
        text
    ) {

        return new ol.style.Style({

            text:
                new ol.style.Text({

                    text:
                        text,

                    font:
                        CONFIG.areaFont,

                    textAlign:
                        "center",

                    textBaseline:
                        "middle",

                    fill:
                        new ol.style.Fill({

                            color:
                                CONFIG.areaColor

                        }),

                    stroke:
                        new ol.style.Stroke({

                            color:
                                CONFIG.areaHalo,

                            width:
                                CONFIG.areaHaloWidth

                        }),

                    overflow:
                        true

                })

        });

    }


    // =========================================================
    // DRAW AREA LABEL
    // =========================================================

    function drawSubdivisionAreaLabel(
        geometry,
        partName
    ) {

        if (!geometry) {
            return;
        }

        const areaM2 =
            getGeometryArea(
                geometry
            );

        if (
            !isFinite(areaM2) ||
            areaM2 <= 0
        ) {
            return;
        }

        const convertedArea =
            convertArea(
                areaM2,
                selectedAreaUnit
            );

        const text =
            partName +
            "\n" +
            formatNumber(
                convertedArea,
                2
            ) +
            " " +
            areaLabel(
                selectedAreaUnit
            );

        let interiorPoint = null;

        try {

            interiorPoint =
                getInteriorPoint(
                    geometry
                );

        } catch (error) {

            console.warn(
                "Unable to calculate subdivision area label point.",
                error
            );

            return;

        }

        if (
            !interiorPoint ||
            interiorPoint.length < 2
        ) {
            return;
        }

        const labelFeature =
            new ol.Feature({

                geometry:
                    new ol.geom.Point(
                        interiorPoint
                    )

            });

        labelFeature.set(
            "Subdivision_Area_Label",
            true
        );

        labelFeature.set(
            "Subdivision_Part",
            partName
        );

        labelFeature.set(
            "Subdivision_Area_m2",
            areaM2
        );

        labelFeature.set(
            "Subdivision_Area_Unit",
            selectedAreaUnit
        );

        labelFeature.setStyle(

            subdivisionAreaTextStyle(
                text
            )

        );

        dimensionSource.addFeature(
            labelFeature
        );

    }


    // =========================================================
    // DRAW AREA LABELS
    // =========================================================

    function drawSubdivisionAreaLabels(
        part1Geometry,
        part2Geometry
    ) {

        drawSubdivisionAreaLabel(
            part1Geometry,
            "PART 1"
        );

        drawSubdivisionAreaLabel(
            part2Geometry,
            "PART 2"
        );

    }


    // =========================================================
    // DRAW SUBDIVISION DIMENSIONS
    // =========================================================

    function drawSubdivisionDimensions() {

        dimensionSource.clear();

        if (previewPart1) {

            drawGeometryDimensions(
                previewPart1
            );

        }

        if (previewPart2) {

            drawGeometryDimensions(
                previewPart2
            );

        }

        if (
            previewPart1 &&
            previewPart2
        ) {

            drawSubdivisionAreaLabels(
                previewPart1,
                previewPart2
            );

        }

        if (previewSplitLine) {

            const splitLength =
                distance(
                    previewSplitLine.a,
                    previewSplitLine.b
                );

            const bearing =
                calculateBearing(
                    previewSplitLine.a,
                    previewSplitLine.b
                );

            drawDimensionLine(

                previewSplitLine.a,

                previewSplitLine.b,

                formatNumber(
                    splitLength
                ) + " m",

                true

            );

            const bearingFeature =
                new ol.Feature({

                    geometry:
                        new ol.geom.Point(

                            midpoint(
                                previewSplitLine.a,
                                previewSplitLine.b
                            )

                        )

                });

            

            dimensionSource.addFeature(
                bearingFeature
            );

        }

    }


    // =========================================================
    // RESULT DIALOG
    //
    // Kept for compatibility with the original code.
    // Preview now uses top controls instead.
    // =========================================================

    function showResultDialog() {

        showPreviewControls();

    }


    // =========================================================
    // APPLY SPLIT
    // =========================================================

    function applySplit() {

        if (
            !selectedFeature ||
            !previewPart1 ||
            !previewPart2
        ) {
            return;
        }

        removePreviewControls();

        resultSource.clear();


        // -----------------------------------------------------
        // PART 1
        // -----------------------------------------------------

        const part1Feature =
            new ol.Feature({

                geometry:
                    previewPart1

            });

        copyProperties(
            selectedFeature,
            part1Feature
        );

        part1Feature.set(
            "Subdivision_Part",
            "Part 1"
        );

        part1Feature.set(
            "Subdivision_Area_m2",
            getGeometryArea(
                previewPart1
            )
        );


        // -----------------------------------------------------
        // PART 2
        // -----------------------------------------------------

        const part2Feature =
            new ol.Feature({

                geometry:
                    previewPart2

            });

        copyProperties(
            selectedFeature,
            part2Feature
        );

        part2Feature.set(
            "Subdivision_Part",
            "Part 2"
        );

        part2Feature.set(
            "Subdivision_Area_m2",
            getGeometryArea(
                previewPart2
            )
        );


        // -----------------------------------------------------
        // STYLES
        // -----------------------------------------------------

        part1Feature.setStyle(

            new ol.style.Style({

                fill:
                    new ol.style.Fill({

                        color:
                            "rgba(0,150,136,0.30)"

                    }),

                stroke:
                    new ol.style.Stroke({

                        color:
                            "#00897b",

                        width:
                            3

                    })

            })

        );

        part2Feature.setStyle(

            new ol.style.Style({

                fill:
                    new ol.style.Fill({

                        color:
                            "rgba(33,150,243,0.25)"

                    }),

                stroke:
                    new ol.style.Stroke({

                        color:
                            "#1976d2",

                        width:
                            3

                    })

            })

        );

        resultSource.addFeature(
            part1Feature
        );

        resultSource.addFeature(
            part2Feature
        );


        // -----------------------------------------------------
        // SPLIT LINE
        // -----------------------------------------------------

        if (previewSplitLine) {

            const splitFeature =
                new ol.Feature({

                    geometry:
                        new ol.geom.LineString([

                            previewSplitLine.a,
                            previewSplitLine.b

                        ])

                });

            splitFeature.set(
                "Subdivision_SplitLine",
                true
            );

            splitFeature.setStyle(

                new ol.style.Style({

                    stroke:
                        new ol.style.Stroke({

                            color:
                                "#ff0000",

                            width:
                                3

                        })

                })

            );

            resultSource.addFeature(
                splitFeature
            );

        }


        // -----------------------------------------------------
        // DIMENSIONS + AREA LABELS
        //
        // drawSubdivisionDimensions() uses preview variables,
        // so keep them until the drawing is completed.
        // -----------------------------------------------------

        drawSubdivisionDimensions();


        // -----------------------------------------------------
        // KEEP ORIGINAL PARCEL HIDDEN IF POSSIBLE
        // -----------------------------------------------------

        try {

            selectedFeature.set(
                "Subdivision_Original",
                true
            );

        } catch (error) {

            console.warn(error);

        }


        // -----------------------------------------------------
        // REMOVE TEMPORARY ORANGE SELECTION
        // -----------------------------------------------------

        restoreSelectedParcel();


        // -----------------------------------------------------
        // CLEAR PREVIEW REFERENCES ONLY
        // -----------------------------------------------------

        previewPart1 = null;
        previewPart2 = null;
        previewSplitLine = null;

        selecting = false;
        drawing = false;
        pointSelecting = false;
        directionSelecting = false;


        // -----------------------------------------------------
        // SHOW POST-APPLY PANEL
        // -----------------------------------------------------

        showAppliedSubdivisionPanel();

    }


    // =========================================================
    // APPLIED SUBDIVISION PANEL
    // =========================================================

    function showAppliedSubdivisionPanel() {

        const html = `

            <div
                id="parcel-subdivision-applied"
                class="parcel-subdivision-dialog">

                <div class="ps-title">
                    ✅ Subdivision Applied
                </div>

                <div class="ps-info">

                    The parcel subdivision has been
                    applied successfully.

                    <br><br>

                    The split polygons, area labels,
                    dimensions and split line remain
                    visible on the map.

                </div>

                <div class="ps-buttons">

                    <button
                        id="ps-clear-applied">
                        🗑 Clear
                    </button>

                    <button
                        id="ps-finish-applied"
                        class="ps-primary">
                        ✅ Finish
                    </button>

                </div>

            </div>

        `;

        showDialog(html);

        document.getElementById(
            "ps-clear-applied"
        ).addEventListener(
            "click",
            function (event) {

                event.preventDefault();
                event.stopPropagation();

                clearSubdivisionTool();

            }
        );

        document.getElementById(
            "ps-finish-applied"
        ).addEventListener(
            "click",
            function (event) {

                event.preventDefault();
                event.stopPropagation();

                finishSubdivisionTool();

            }
        );

    }


    // =========================================================
    // COPY PROPERTIES
    // =========================================================

    function copyProperties(
        sourceFeature,
        targetFeature
    ) {

        const properties =
            sourceFeature.getProperties();

        Object.keys(
            properties
        ).forEach(
            function (key) {

                if (
                    key ===
                    sourceFeature.getGeometryName()
                ) {
                    return;
                }

                targetFeature.set(
                    key,
                    properties[key]
                );

            }
        );

    }


    // =========================================================
    // MESSAGE
    // =========================================================

    function showMessage(message) {

        let element =
            document.getElementById(
                "parcel-subdivision-message"
            );

        if (!element) {

            element =
                document.createElement(
                    "div"
                );

            element.id =
                "parcel-subdivision-message";

            document.body.appendChild(
                element
            );

        }

        element.textContent =
            message;

        element.style.display =
            "block";

        clearTimeout(
            element._hideTimer
        );

        element._hideTimer =
            setTimeout(
                function () {

                    element.style.display =
                        "none";

                },
                3500
            );

    }


    // =========================================================
    // DIALOG
    // =========================================================

    function showDialog(html) {

        closeDialog();

        removePreviewControls();

        const overlay =
            document.createElement(
                "div"
            );

        overlay.id =
            "parcel-subdivision-overlay";

        overlay.innerHTML =
            html;

        document.body.appendChild(
            overlay
        );

        const dialog =
            overlay.firstElementChild;

        if (dialog) {

            dialog.style.position =
                "absolute";

            dialog.style.right =
                "20px";

            dialog.style.top =
                "120px";

        }

    }


    // =========================================================
    // CLOSE DIALOG
    // =========================================================

    function closeDialog() {

        const overlay =
            document.getElementById(
                "parcel-subdivision-overlay"
            );

        if (overlay) {
            overlay.remove();
        }

    }


    // =========================================================
    // INITIAL SELECT PARCEL PANEL
    // =========================================================

    function showInitialSubdivisionPanel() {

        const html = `

            <div
                id="parcel-subdivision-initial"
                class="parcel-subdivision-dialog">

                <div class="ps-title">
                    📐 Parcel Subdivision
                </div>

                <div class="ps-info">

                    First select the parcel that
                    you want to subdivide.

                </div>

                <div class="ps-buttons">

                    <button
                        id="ps-select-parcel"
                        class="ps-primary">

                        📍 Select Parcel

                    </button>

                </div>

            </div>

        `;

        showDialog(html);

        document.getElementById(
            "ps-select-parcel"
        ).addEventListener(
            "click",
            function (event) {

                event.preventDefault();
                event.stopPropagation();

                startParcelSelection();

            }
        );

    }


    // =========================================================
    // METHOD DIALOG
    // =========================================================

    function showMethodDialog() {

        if (
            !subdivisionToolActive ||
            !selectedFeature
        ) {
            return;
        }

        const html = `

            <div
                id="parcel-subdivision-method"
                class="parcel-subdivision-dialog">

                <div class="ps-title">
                    📐 Parcel Subdivision
                </div>

                <div class="ps-info">

                    <b>Parcel selected.</b>

                    <br><br>

                    Select how you want to define
                    the subdivision line.

                </div>

                <button
                    id="ps-select-side"
                    class="ps-method">

                    📏 Select Side

                    <small>
                        Start from a parcel boundary side
                    </small>

                </button>

                <button
                    id="ps-from-point"
                    class="ps-method">

                    📍 From Point

                    <small>
                        Select a point and direction
                    </small>

                </button>

                <button
                    id="ps-draw-line"
                    class="ps-method">

                    ✏️ Draw Line

                    <small>
                        Draw the desired split direction
                    </small>

                </button>

                <button
                    id="ps-method-cancel">

                    ✖ Cancel

                </button>

            </div>

        `;

        showDialog(html);

        document.getElementById(
            "ps-select-side"
        ).addEventListener(
            "click",
            function () {
                startSelectSide();
            }
        );

        document.getElementById(
            "ps-from-point"
        ).addEventListener(
            "click",
            function () {
                startFromPoint();
            }
        );

        document.getElementById(
            "ps-draw-line"
        ).addEventListener(
            "click",
            function () {
                startDrawLine();
            }
        );

        document.getElementById(
            "ps-method-cancel"
        ).addEventListener(
            "click",
            function () {
                resetTool();
            }
        );

    }


    // =========================================================
    // ACTIVATE SUBDIVISION SESSION
    // =========================================================

    function activateSubdivisionTool() {

        subdivisionToolActive = true;

        window.parcelSubdivisionToolActive = true;

        document.body.classList.add(
            "parcel-subdivision-active"
        );

        if (
            typeof window.closeFeaturePopup ===
            "function"
        ) {

            try {
                window.closeFeaturePopup();
            } catch (error) {}

        }

    }


    // =========================================================
    // DEACTIVATE SUBDIVISION SESSION
    // =========================================================

    function deactivateSubdivisionTool() {

        subdivisionToolActive = false;

        window.parcelSubdivisionToolActive = false;

        document.body.classList.remove(
            "parcel-subdivision-active"
        );

        cancelParcelSelection();

        removePreviewControls();

        if (
            typeof window.closeFeaturePopup ===
            "function"
        ) {

            try {
                window.closeFeaturePopup();
            } catch (error) {}

        }

    }


    // =========================================================
    // FINISH SUBDIVISION
    // =========================================================

    function finishSubdivisionTool() {

        console.log(
            "📐 Parcel Subdivision Finished"
        );

        cancelParcelSelection();

        if (interaction) {

            try {
                map.removeInteraction(
                    interaction
                );
            } catch (error) {}

            interaction = null;

        }

        // -----------------------------------------------------
        // If a preview is currently active, it is unfinished.
        // Remove the unfinished preview.
        //
        // If preview variables are already null, that means
        // Apply Split has already completed and resultSource
        // must remain untouched.
        // -----------------------------------------------------

        if (
            previewPart1 ||
            previewPart2 ||
            previewSplitLine
        ) {

            resultSource.clear();
            dimensionSource.clear();

            previewPart1 = null;
            previewPart2 = null;
            previewSplitLine = null;

        }

        removePreviewControls();

        restoreSelectedParcel();

        selecting = false;
        drawing = false;
        pointSelecting = false;
        directionSelecting = false;

        selectedFeature = null;
        selectedLayer = null;
        selectedSide = null;
        controlPoint = null;
        directionPoint = null;
        drawnLine = null;
        splitMode = null;
        targetAreaM2 = 0;

        closeDialog();

        // -----------------------------------------------------
        // IMPORTANT:
        // Completed subdivision result remains visible.
        // -----------------------------------------------------

        deactivateSubdivisionTool();

        showMessage(
            "✅ Parcel Subdivision Finished."
        );

    }


    // =========================================================
    // CLEAR SUBDIVISION
    // =========================================================

    function clearSubdivisionTool() {

        console.log(
            "🗑 Clearing Parcel Subdivision"
        );

        cancelParcelSelection();

        if (interaction) {

            try {
                map.removeInteraction(
                    interaction
                );
            } catch (error) {}

            interaction = null;

        }

        removePreviewControls();

        restoreSelectedParcel();

        clearResults();

        selectedFeature = null;
        selectedLayer = null;
        selectedSide = null;
        controlPoint = null;
        directionPoint = null;
        drawnLine = null;
        splitMode = null;
        targetAreaM2 = 0;

        previewPart1 = null;
        previewPart2 = null;
        previewSplitLine = null;

        selecting = false;
        drawing = false;
        pointSelecting = false;
        directionSelecting = false;

        closeDialog();

        // -----------------------------------------------------
        // KEEP TOOL ACTIVE.
        //
        // Return to the initial Select Parcel panel.
        // -----------------------------------------------------

        if (subdivisionToolActive) {

            showInitialSubdivisionPanel();

            showMessage(
                "🗑 Cleared. Click Select Parcel to choose another parcel."
            );

        }

    }


    // =========================================================
    // RESET TOOL
    // =========================================================
    //
    // Full reset used by Cancel / ESC.
    // This exits the session AND clears results.
    //
    // Main button uses finishSubdivisionTool() instead,
    // so clicking the main button preserves completed results.
    // =========================================================

    function resetTool() {

        cancelParcelSelection();

        removePreviewControls();

        deactivateSubdivisionTool();


        // -----------------------------------------------------
        // Remove drawing interaction.
        // -----------------------------------------------------

        if (interaction) {

            try {

                map.removeInteraction(
                    interaction
                );

            } catch (error) {}

            interaction = null;

        }


        // -----------------------------------------------------
        // Reset interaction states.
        // -----------------------------------------------------

        selecting = false;
        drawing = false;
        pointSelecting = false;
        directionSelecting = false;


        // -----------------------------------------------------
        // Restore original parcel.
        // -----------------------------------------------------

        restoreSelectedParcel();


        // -----------------------------------------------------
        // Clear selected parcel state.
        // -----------------------------------------------------

        selectedFeature = null;
        selectedLayer = null;
        selectedSide = null;
        controlPoint = null;
        directionPoint = null;
        drawnLine = null;
        splitMode = null;
        targetAreaM2 = 0;


        // -----------------------------------------------------
        // Clear result layers.
        // -----------------------------------------------------

        clearResults();

        resultSource.clear();
        dimensionSource.clear();


        // -----------------------------------------------------
        // Close Stage 5 popup.
        // -----------------------------------------------------

        if (
            typeof window.closeFeaturePopup ===
            "function"
        ) {

            try {
                window.closeFeaturePopup();
            } catch (error) {}

        }


        // -----------------------------------------------------
        // Close dialog.
        // -----------------------------------------------------

        closeDialog();

    }


    // =========================================================
    // MAIN BUTTON
    // =========================================================

    const button =
        document.createElement(
            "button"
        );

    button.id =
        CONFIG.buttonId;

    button.type =
        "button";

    button.innerHTML = `
<svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true">

    <!-- Parcel boundary -->
    <path
        d="M4 5
           L9 3
           L20 6
           L19 18
           L13 21
           L4 17
           Z"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linejoin="round"/>

    <!-- Subdivision line -->
    <path
        d="M7 4
           L12 11
           L18.5 19"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"/>

    <!-- Survey corner points -->
    <circle cx="4" cy="5" r="1.2" fill="currentColor"/>
    <circle cx="9" cy="3" r="1.2" fill="currentColor"/>
    <circle cx="20" cy="6" r="1.2" fill="currentColor"/>
    <circle cx="19" cy="18" r="1.2" fill="currentColor"/>
    <circle cx="13" cy="21" r="1.2" fill="currentColor"/>
    <circle cx="4" cy="17" r="1.2" fill="currentColor"/>

</svg>
`;

    button.title =
        "Parcel Subdivision / Area Splitting";

    document.body.appendChild(
        button
    );


    // =========================================================
    // MAIN BUTTON = ON / OFF TOGGLE
    // =========================================================

    button.addEventListener(
        "click",
        function (event) {

            event.preventDefault();
            event.stopPropagation();

            // -------------------------------------------------
            // IF TOOL IS ALREADY ACTIVE:
            //
            // Clicking the main button again immediately
            // deactivates the subdivision tool.
            //
            // Completed applied subdivision remains visible.
            // -------------------------------------------------

            if (
                subdivisionToolActive ||
                window.parcelSubdivisionToolActive
            ) {

                finishSubdivisionTool();

                return;

            }


            // -------------------------------------------------
            // START NEW SESSION
            //
            // Clear any old unfinished state without showing
            // a message.
            // -------------------------------------------------

            resetTool();

            activateSubdivisionTool();

            // -------------------------------------------------
            // IMPORTANT:
            //
            // DO NOT start parcel selection here.
            //
            // First show the panel with Select Parcel.
            // -------------------------------------------------

            showInitialSubdivisionPanel();

        }
    );


    // =========================================================
    // CSS
    // =========================================================

    const css =
        document.createElement(
            "style"
        );

    css.textContent = `

        /* =====================================================
           MAIN BUTTON
        ===================================================== */

        #${CONFIG.buttonId} {

            position:
                fixed;

            right:
                15px;

            bottom:
                145px;

            width:
                44px;

            height:
                44px;

            z-index:
                20000;

            border:
                1px solid #999;

            border-radius:
                7px;

            background:
                #ffffff;

            font-size:
                21px;

            cursor:
                pointer;

            box-shadow:
                0 2px 7px
                rgba(0,0,0,0.30);

        }


        #${CONFIG.buttonId}:hover {

            background:
                #eeeeee;

        }


        /* =====================================================
           DIALOG OVERLAY
        ===================================================== */

        #parcel-subdivision-overlay {

            position:
                fixed;

            inset:
                0;

            z-index:
                19999;

            pointer-events:
                none;

        }


        /* =====================================================
           DIALOG
        ===================================================== */

        .parcel-subdivision-dialog {

            width:
                300px;

            max-width:
                calc(100vw - 30px);

            background:
                #ffffff;

            border:
                1px solid #999;

            border-radius:
                10px;

            padding:
                14px;

            box-sizing:
                border-box;

            box-shadow:
                0 5px 25px
                rgba(0,0,0,0.35);

            font-family:
                Arial,
                sans-serif;

            font-size:
                13px;

            pointer-events:
                auto;

        }


        /* =====================================================
           TITLE
        ===================================================== */

        .ps-title {

            font-size:
                17px;

            font-weight:
                bold;

            padding-bottom:
                9px;

            margin-bottom:
                10px;

            border-bottom:
                1px solid #ddd;

        }


        /* =====================================================
           INFO
        ===================================================== */

        .ps-info {

            padding:
                8px;

            margin-bottom:
                9px;

            background:
                #f4f6f8;

            border:
                1px solid #ddd;

            border-radius:
                6px;

            line-height:
                1.5;

        }


        /* =====================================================
           SETTINGS
        ===================================================== */

        .ps-setting {

            margin-bottom:
                10px;

        }


        .ps-setting label {

            display:
                block;

            font-weight:
                bold;

            margin-bottom:
                4px;

        }


        .ps-setting select,
        .ps-setting input {

            width:
                100%;

            box-sizing:
                border-box;

            padding:
                8px;

            border:
                1px solid #aaa;

            border-radius:
                5px;

            background:
                #ffffff;

        }


        /* =====================================================
           METHOD BUTTON
        ===================================================== */

        .ps-method {

            width:
                100%;

            padding:
                10px;

            margin-bottom:
                8px;

            border:
                1px solid #aaa;

            border-radius:
                6px;

            background:
                #f7f7f7;

            text-align:
                left;

            cursor:
                pointer;

            font-weight:
                bold;

        }


        .ps-method:hover {

            background:
                #eeeeee;

        }


        .ps-method small {

            display:
                block;

            margin-top:
                3px;

            color:
                #666;

            font-weight:
                normal;

        }


        /* =====================================================
           BUTTONS
        ===================================================== */

        .ps-buttons {

            display:
                flex;

            gap:
                7px;

            margin-top:
                10px;

        }


        .ps-buttons button,
        #ps-method-cancel {

            flex:
                1;

            padding:
                9px 6px;

            border:
                1px solid #999;

            border-radius:
                5px;

            background:
                #f7f7f7;

            cursor:
                pointer;

        }


        .ps-buttons button:hover,
        #ps-method-cancel:hover {

            background:
                #e8e8e8;

        }


        /* =====================================================
           PRIMARY BUTTON
        ===================================================== */

        .ps-primary {

            background:
                #1976d2 !important;

            color:
                #ffffff;

            border-color:
                #1976d2 !important;

        }


        /* =====================================================
           RESULT ROW
        ===================================================== */

        .ps-result-row {

            display:
                flex;

            justify-content:
                space-between;

            gap:
                10px;

            padding:
                5px 0;

            border-bottom:
                1px solid #eee;

        }


        /* =====================================================
           PREVIEW TOP CONTROLS
           These are visible ONLY during preview.
        ===================================================== */

        #parcel-subdivision-preview-controls {

            position:
                fixed;

            top:
                15px;

            left:
                50%;

            transform:
                translateX(-50%);

            z-index:
                40000;

            display:
                flex;

            gap:
                8px;

            padding:
                6px;

            background:
                rgba(255,255,255,0.96);

            border:
                1px solid #999;

            border-radius:
                9px;

            box-shadow:
                0 3px 12px
                rgba(0,0,0,0.30);

        }


        #parcel-subdivision-preview-controls button {

            width:
                48px;

            height:
                42px;

            border:
                1px solid #999;

            border-radius:
                7px;

            background:
                #ffffff;

            font-size:
                24px;

            font-weight:
                bold;

            cursor:
                pointer;

            line-height:
                1;

        }


        #parcel-subdivision-preview-controls
        #ps-preview-apply {

            color:
                #087f23;

        }


        #parcel-subdivision-preview-controls
        #ps-preview-back {

            color:
                #c62828;

        }


        #parcel-subdivision-preview-controls
        button:hover {

            background:
                #eeeeee;

        }


        /* =====================================================
           MESSAGE
        ===================================================== */

        #parcel-subdivision-message {

            position:
                fixed;

            left:
                50%;

            bottom:
                30px;

            transform:
                translateX(-50%);

            z-index:
                41000;

            background:
                rgba(0,0,0,0.82);

            color:
                #ffffff;

            padding:
                10px 16px;

            border-radius:
                7px;

            font-family:
                Arial,
                sans-serif;

            font-size:
                13px;

            display:
                none;

            max-width:
                calc(100vw - 30px);

            text-align:
                center;

        }


        /* =====================================================
           MOBILE
        ===================================================== */

        @media (
            max-width: 600px
        ) {

            #${CONFIG.buttonId} {

                right:
                    10px;

                bottom:
                    120px;

                width:
                    46px;

                height:
                    46px;

            }


            .parcel-subdivision-dialog {

                width:
                    calc(100vw - 20px);

                max-width:
                    350px;

            }


            #parcel-subdivision-preview-controls {

                top:
                    10px;

            }


            #parcel-subdivision-preview-controls button {

                width:
                    46px;

                height:
                    42px;

                font-size:
                    23px;

            }

        }

    `;

    document.head.appendChild(
        css
    );


    // =========================================================
    // ESC KEY
    // =========================================================

    document.addEventListener(
        "keydown",
        function (event) {

            if (
                event.key ===
                "Escape"
            ) {

                resetTool();

            }

        }
    );


    // =========================================================
    // PROJECTION CHECK
    // =========================================================

    try {

        const projection =
            map.getView()
                .getProjection();

        console.log(
            "📐 Parcel Subdivision MAP CRS:",
            projection.getCode()
        );

        console.log(
            "📐 Parcel Subdivision DATA CRS:",
            DATA_PROJECTION
        );

        console.log(
            "📐 Measurement method:",
            "EPSG:3857 → EPSG:32643 → UTM Euclidean"
        );

    } catch (error) {

        console.warn(
            "Projection information unavailable.",
            error
        );

    }


    // =========================================================
    // READY
    // =========================================================

    console.log(
        "📐 Parcel Subdivision / Area Splitting Tool READY."
    );


})();