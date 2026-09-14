// ============================================================
// 🧭 STAGE 15 — FUNCTIONAL NORTH SYMBOL
// OpenLayers
// ============================================================

(function () {

    // --------------------------------------------------------
    // Create North Symbol element
    // --------------------------------------------------------

    const northElement = document.createElement("div");

    northElement.className = "stage15-north-symbol";

    northElement.title = "Reset map to North";

    northElement.innerHTML = `
        <div class="stage15-north-arrow">

            <div class="stage15-north-letter">
                N
            </div>

            <div class="stage15-arrow-head"></div>

            <div class="stage15-arrow-line"></div>

        </div>
    `;


    // --------------------------------------------------------
    // Make it behave like a button
    // --------------------------------------------------------

    northElement.setAttribute(
        "role",
        "button"
    );

    northElement.setAttribute(
        "aria-label",
        "Reset map orientation to North"
    );

    northElement.setAttribute(
        "tabindex",
        "0"
    );


    // --------------------------------------------------------
    // Create OpenLayers control
    // --------------------------------------------------------

    const northControl = new ol.control.Control({
        element: northElement
    });


    // --------------------------------------------------------
    // Add to map
    // --------------------------------------------------------

    map.addControl(northControl);


    // --------------------------------------------------------
    // Reset map rotation
    // --------------------------------------------------------

    function resetNorth() {

        if (!map || !map.getView()) {
            return;
        }

        map.getView().animate({
            rotation: 0,
            duration: 300
        });

    }


    // --------------------------------------------------------
    // Click
    // --------------------------------------------------------

    northElement.addEventListener(
        "click",
        function (event) {

            event.preventDefault();
            event.stopPropagation();

            resetNorth();

        }
    );


    // --------------------------------------------------------
    // Keyboard
    // --------------------------------------------------------

    northElement.addEventListener(
        "keydown",
        function (event) {

            if (
                event.key === "Enter" ||
                event.key === " "
            ) {

                event.preventDefault();

                resetNorth();

            }

        }
    );


    // --------------------------------------------------------
    // Pressed effect
    // --------------------------------------------------------

    northElement.addEventListener(
        "mousedown",
        function () {

            northElement.classList.add(
                "stage15-north-active"
            );

        }
    );


    northElement.addEventListener(
        "mouseup",
        function () {

            northElement.classList.remove(
                "stage15-north-active"
            );

        }
    );


    northElement.addEventListener(
        "mouseleave",
        function () {

            northElement.classList.remove(
                "stage15-north-active"
            );

        }
    );


    // --------------------------------------------------------
    // Touch effect
    // --------------------------------------------------------

    northElement.addEventListener(
        "touchstart",
        function () {

            northElement.classList.add(
                "stage15-north-active"
            );

        },
        {
            passive: true
        }
    );


    northElement.addEventListener(
        "touchend",
        function () {

            northElement.classList.remove(
                "stage15-north-active"
            );

        },
        {
            passive: true
        }
    );


    // ========================================================
    // 🧭 UPDATE NORTH SYMBOL
    // ========================================================

    function updateNorthSymbol() {

        if (!map || !map.getView()) {
            return;
        }

        const rotation =
            map.getView().getRotation() || 0;


        // ====================================================
        // IMPORTANT:
        // Use POSITIVE rotation.
        //
        // This makes the North symbol rotate in the
        // SAME direction as the map.
        // ====================================================

        northElement.style.transform =
            "rotate(" + rotation + "rad)";

    }


    // --------------------------------------------------------
    // Listen for map rotation
    // --------------------------------------------------------

    map.getView().on(
        "change:rotation",
        updateNorthSymbol
    );


    // --------------------------------------------------------
    // Initial update
    // --------------------------------------------------------

    updateNorthSymbol();


    // --------------------------------------------------------
    // Global access
    // --------------------------------------------------------

    window.stage15NorthControl =
        northControl;

    window.stage15NorthElement =
        northElement;

    window.stage15ResetNorth =
        resetNorth;


    // --------------------------------------------------------
    // Console
    // --------------------------------------------------------

    console.log(
        "🧭 Stage 15 Functional North Symbol loaded."
    );

})();