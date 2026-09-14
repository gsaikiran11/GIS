// ============================================================
// 📍 STAGE 16 — UTM 43N + LAT/LON COORDINATE READOUT
// ============================================================
// Map CRS      : EPSG:3857
// UTM 43N      : EPSG:32643
// Latitude/Lon  : EPSG:4326
// ============================================================

(function () {

    "use strict";

    // --------------------------------------------------------
    // REMOVE EXISTING COORDINATE READOUT IF ANY
    // --------------------------------------------------------

    const oldReadout =
        document.querySelector(".coordinates-readout");

    if (oldReadout) {
        oldReadout.remove();
    }


    // --------------------------------------------------------
    // CREATE COORDINATE READOUT
    // --------------------------------------------------------

    const readout = document.createElement("div");

    readout.className = "coordinates-readout";

    readout.innerHTML = `

        <!-- UTM 43N -->

        <div class="coord">

            <div class="coord-label">
                UTM 43N
            </div>

            <div
                id="stage16-utm"
                class="coord-value utm">
                E: —<br>
                N: —
            </div>

        </div>


        <!-- LAT / LON -->

        <div class="coord">

            <div class="coord-label">
                LAT / LON
            </div>

            <div
                id="stage16-latlon"
                class="coord-value latlon">
                —<br>
                —
            </div>

        </div>

    `;


    // --------------------------------------------------------
    // ADD TO BODY
    // --------------------------------------------------------

    document.body.appendChild(readout);


    // --------------------------------------------------------
    // GET ELEMENTS
    // --------------------------------------------------------

    const utmElement =
        document.getElementById("stage16-utm");

    const latLonElement =
        document.getElementById("stage16-latlon");


    // --------------------------------------------------------
    // UPDATE COORDINATES
    // --------------------------------------------------------

    function updateCoordinates(coordinate) {

        if (
            !coordinate ||
            coordinate.length < 2
        ) {
            return;
        }


        try {

            // =================================================
            // EPSG:3857 → EPSG:32643
            // =================================================

            const utm =
                ol.proj.transform(
                    coordinate,
                    "EPSG:3857",
                    "EPSG:32643"
                );


            // =================================================
            // EPSG:3857 → EPSG:4326
            // =================================================

            const lonLat =
                ol.proj.transform(
                    coordinate,
                    "EPSG:3857",
                    "EPSG:4326"
                );


            // =================================================
            // UTM
            // =================================================

            const easting =
                utm[0];

            const northing =
                utm[1];


            // =================================================
            // LAT / LON
            // =================================================

            const longitude =
                lonLat[0];

            const latitude =
                lonLat[1];


            // =================================================
            // DISPLAY
            // =================================================

            utmElement.innerHTML =
                "E: " +
                easting.toFixed(2) +
                "<br>N: " +
                northing.toFixed(2);


            latLonElement.innerHTML =
                latitude.toFixed(6) +
                "°<br>" +
                longitude.toFixed(6) +
                "°";


            // =================================================
            // SAVE LAST COORDINATE
            // =================================================

            window.stage16LastCoordinate = {

                utm43n: {
                    easting: easting,
                    northing: northing
                },

                latlon: {
                    latitude: latitude,
                    longitude: longitude
                }

            };

        }

        catch (error) {

            console.error(
                "Stage 16 coordinate error:",
                error
            );

        }

    }


    // ========================================================
    // MOUSE
    // ========================================================

    map.on(
        "pointermove",
        function (event) {

            updateCoordinates(
                event.coordinate
            );

        }
    );


    // ========================================================
    // TOUCH
    // ========================================================

    map.on(
        "pointerdown",
        function (event) {

            updateCoordinates(
                event.coordinate
            );

        }
    );


    // ========================================================
    // MOBILE DRAG
    // ========================================================

    map.on(
        "pointerdrag",
        function (event) {

            updateCoordinates(
                event.coordinate
            );

        }
    );


    // ========================================================
    // INITIALIZE USING MAP CENTER
    // ========================================================

    updateCoordinates(
        map.getView().getCenter()
    );


    // ========================================================
    // GLOBAL ACCESS
    // ========================================================

    window.stage16CoordinateElement =
        readout;

    window.stage16UpdateCoordinates =
        updateCoordinates;


    console.log(
        "✅ Stage 16 — Coordinate readout loaded"
    );

})();