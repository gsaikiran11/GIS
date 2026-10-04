// ============================================================
// 🌐 STAGE 16 — EXTERNAL BASE MAP SERVICES (v4.2)
// QGIS2WEB + OPENLAYERS
//
// WMS + WMTS + XYZ
//
// v4.2 CHANGELOG
// ------------------------------------------------------------
//  ✔ Mobile Width Constraint — panel NEVER stretches full width
//  ✔ Auto-Centering Card — floats centered on mobile (max 320px)
//  ✔ Dynamic Max-Height Engine — panel always fits the screen
//  ✔ Custom Vertical Scrollbar — styled like Dynamic Style Editor
//  ✔ Button size harmonized to 40×40 (matches all other tools)
//  ✔ Rounded-square button (was circle)
//  ✔ Style Property Overrides — setProperty(..., 'important')
//  ✔ Fully draggable + hideable by MapToolManager on mobile too
//  ✔ Panel auto-follows the button wherever you drag it
//  ✔ Full persistence: WMS + WMTS + XYZ are all restored
//  ✔ ESC to close, click-outside to close
//  ✔ Closes automatically when Tool Manager enters edit mode
//
// LAYER ORDER
// ------------------------------------------------------------
//        TOP
//         ├── Vector / Parcel / Labels / Measurements
//         ├── ⭐ STAGE 16 EXTERNAL MAP (WMS / WMTS / XYZ)
//         └── Existing QGIS2Web BASE MAP
//        BOTTOM
// ============================================================

(function () {
    "use strict";

    // =========================================================
    // CONFIGURATION
    // =========================================================
    var CONFIG = {
        toolId: "stage16",
        toolName: "External Maps",
        toolIcon: "🌐",

        buttonId: "stage16-map-services-button",
        panelId: "stage16-map-services-panel",

        storageKey: "stage16ExternalMapServices_v4",
        proxyKey: "stage16CorsProxy_v4",

        defaultOpacity: 1,
        tileSize: 256,

        baseMapGap: 1,
        vectorGap: 1,

        btnSize: 40,
        panelWidth: 320,
        panelGap: 8,

        // Default on-screen position (Tool Manager may override)
        defaults: { top: 136, right: 12 },

        fetchTimeout: 20000
    };

    // =========================================================
    // STATE
    // =========================================================
    var externalLayers = [];

    var mapRef = null;
    var button = null;
    var panel = null;
    var panelOpen = false;
    var activeExternalBaseMap = null;
    var corsProxy = "";

    var wmsCapabilities = null;
    var wmtsCapabilities = null;

    // =========================================================
    // SAFETY
    // =========================================================
    if (typeof ol === "undefined") {
        console.error("🌐 Stage 16: OpenLayers (ol) not found.");
        return;
    }

    // =========================================================
    // WAIT FOR MAP (avoids race conditions)
    // =========================================================
    function waitForMap(callback) {
        var tries = 0;

        function poll() {
            var candidate = null;

            if (typeof map !== "undefined" && map) {
                candidate = map;
            } else if (window.map) {
                candidate = window.map;
            }

            if (candidate && typeof candidate.getLayers === "function") {
                mapRef = candidate;
                callback();
                return;
            }

            tries = tries + 1;

            if (tries > 100) {
                console.error("🌐 Stage 16: `map` was never found.");
                return;
            }

            setTimeout(poll, 100);
        }

        poll();
    }

    // =========================================================
    // TOOL MANAGER REGISTRATION
    // ---------------------------------------------------------
    // Works whether the Tool Manager loads BEFORE or AFTER this.
    // =========================================================
    function registerWithToolManager() {
        var descriptor = {
            id: CONFIG.toolId,
            name: CONFIG.toolName,
            icon: CONFIG.toolIcon,
            selector: "#" + CONFIG.buttonId,
            defaults: CONFIG.defaults,
            visible: true
        };

        window.MapToolRegistry = window.MapToolRegistry || [];

        var already = window.MapToolRegistry.some(function (item) {
            return item.id === descriptor.id;
        });

        if (!already) {
            window.MapToolRegistry.push(descriptor);
        }

        if (window.MapToolManager && window.MapToolManager.register) {
            window.MapToolManager.register(descriptor);
        }
    }

    // =========================================================
    // CSS INJECTION
    // ---------------------------------------------------------
    // NOTE: No `!important` on top/right/display for the button,
    //       so the Tool Manager can freely move and hide it.
    // =========================================================
    function injectCSS() {
        if (document.getElementById("stage16-css")) {
            return;
        }

        var css = document.createElement("style");
        css.id = "stage16-css";

        css.textContent = `

/* ===================== TRIGGER BUTTON ===================== */
#${CONFIG.buttonId} {
    position: fixed;
    top: ${CONFIG.defaults.top}px;
    right: ${CONFIG.defaults.right}px;
    left: auto;
    bottom: auto;

    width: ${CONFIG.btnSize}px;
    height: ${CONFIG.btnSize}px;
    min-width: ${CONFIG.btnSize}px;
    min-height: ${CONFIG.btnSize}px;

    padding: 0;
    margin: 0;

    border: 1px solid var(--ui-border, #d7dce3);
    border-radius: var(--ui-radius-sm, 7px);

    background: var(--ui-bg, #ffffff);
    color: var(--ui-text, #1d2430);

    box-shadow: var(--ui-shadow-sm, 0 1px 4px rgba(16,24,40,0.16));

    cursor: pointer;
    z-index: 16995;

    display: flex;
    align-items: center;
    justify-content: center;

    box-sizing: border-box;
    -webkit-tap-highlight-color: transparent;

    transition:
        background .15s ease,
        border-color .15s ease;
}

#${CONFIG.buttonId}:hover {
    background: var(--ui-bg-hover, #eef1f5);
    border-color: var(--ui-accent, #1f6feb);
}

#${CONFIG.buttonId}.stage16-open {
    background: var(--ui-accent, #1f6feb);
    border-color: var(--ui-accent, #1f6feb);
    color: #ffffff;
}

/* Never animate/scale while being dragged in edit mode */
body.drag-edit-mode #${CONFIG.buttonId},
body.drag-edit-mode #${CONFIG.buttonId}:hover,
#${CONFIG.buttonId}.is-dragging {
    transform: none !important;
}


/* ===================== PANEL ===================== */
#${CONFIG.panelId} {
    position: fixed;
    top: ${CONFIG.defaults.top}px;
    right: ${CONFIG.defaults.right + CONFIG.btnSize + CONFIG.panelGap}px;
    left: auto;
    bottom: auto;

    width: ${CONFIG.panelWidth}px;
    max-width: calc(100vw - 24px);
    max-height: calc(100vh - 24px);

    overflow: hidden;

    background: var(--ui-bg, #ffffff);
    border: 1px solid var(--ui-border, #d7dce3);
    border-radius: var(--ui-radius, 10px);
    box-shadow: 0 8px 32px rgba(0,0,0,.25);

    z-index: 50000;

    font-family: var(--ui-font, "Segoe UI", Roboto, system-ui, sans-serif);
    font-size: 12px;
    color: var(--ui-text, #1d2430);

    box-sizing: border-box;
    display: none;
    flex-direction: column;
}

#${CONFIG.panelId}.stage16-visible {
    display: flex;
    animation: stage16-fade .16s ease;
}

@keyframes stage16-fade {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
}

#${CONFIG.panelId} * {
    box-sizing: border-box;
}


/* ===================== HEADER ===================== */
.stage16-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 10px 12px;
    background: var(--ui-bg-subtle, #f5f7fa);
    border-bottom: 1px solid var(--ui-border-soft, #e9edf2);
    flex-shrink: 0;
}

.stage16-title {
    font-size: 13px;
    font-weight: 700;
    color: var(--ui-text, #1d2430);
}

.stage16-subtitle {
    margin-top: 1px;
    font-size: 10px;
    color: var(--ui-text-muted, #5b6472);
}

#stage16-close {
    width: 26px;
    height: 26px;
    flex-shrink: 0;
    border: none;
    background: transparent;
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
    color: var(--ui-text-muted, #5b6472);
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
}

#stage16-close:hover {
    background: var(--ui-bg-hover, #eef1f5);
    color: var(--ui-text, #1d2430);
}


/* ===================== TABS ===================== */
.stage16-tabs {
    display: flex;
    border-bottom: 1px solid var(--ui-border-soft, #e9edf2);
    background: var(--ui-bg, #ffffff);
    flex-shrink: 0;
}

.stage16-tab {
    flex: 1;
    padding: 8px 4px;
    border: none;
    border-bottom: 2px solid transparent;
    background: transparent;
    cursor: pointer;
    font-family: inherit;
    font-size: 11px;
    font-weight: 600;
    color: var(--ui-text-muted, #5b6472);
    text-align: center;
    transition: color .15s ease, border-color .15s ease, background .15s ease;
}

.stage16-tab:hover {
    background: var(--ui-bg-hover, #eef1f5);
    color: var(--ui-text, #1d2430);
}

.stage16-tab.active {
    color: var(--ui-accent, #1f6feb);
    border-bottom-color: var(--ui-accent, #1f6feb);
}

.stage16-badge {
    display: inline-block;
    min-width: 15px;
    margin-left: 3px;
    padding: 0 4px;
    border-radius: 8px;
    background: var(--ui-accent, #1f6feb);
    color: #fff;
    font-size: 9px;
    line-height: 15px;
}


/* ============ TAB CONTENT & CUSTOM SCROLLBAR ============ */
.stage16-tab-content {
    padding: 11px;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    flex: 1;
    min-height: 0;
}

.stage16-tab-content::-webkit-scrollbar {
    width: 6px !important;
}

.stage16-tab-content::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.02) !important;
    border-radius: 3px !important;
}

.stage16-tab-content::-webkit-scrollbar-thumb {
    background: var(--ui-border-strong, #aeb6c2) !important;
    border-radius: 3px !important;
}

.stage16-tab-content::-webkit-scrollbar-thumb:hover {
    background: var(--ui-accent, #1f6feb) !important;
}

.stage16-tab-content label {
    display: block;
    margin: 4px 0 3px;
    font-size: 10.5px;
    font-weight: 700;
    color: var(--ui-text-muted, #5b6472);
    text-transform: uppercase;
    letter-spacing: .3px;
}

.stage16-tab-content input[type="text"],
.stage16-tab-content select {
    width: 100%;
    height: 30px;
    padding: 4px 7px;
    margin-bottom: 7px;
    border: 1px solid var(--ui-border, #d7dce3);
    border-radius: var(--ui-radius-sm, 7px);
    background: var(--ui-bg-subtle, #f5f7fa);
    color: var(--ui-text, #1d2430);
    font-family: inherit;
    font-size: 11px;
    outline: none;
}

.stage16-tab-content input[type="text"]:focus,
.stage16-tab-content select:focus {
    border-color: var(--ui-accent, #1f6feb);
    box-shadow: 0 0 0 3px var(--ui-accent-soft, rgba(31,111,235,0.12));
}

.stage16-primary {
    width: 100%;
    height: 32px;
    margin: 4px 0 7px;
    padding: 0 10px;
    border: 1px solid var(--ui-accent, #1f6feb);
    border-radius: var(--ui-radius-sm, 7px);
    background: var(--ui-accent, #1f6feb);
    color: #ffffff;
    font-family: inherit;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    transition: background .15s ease;
}

.stage16-primary:hover {
    background: var(--ui-accent-dark, #1657b0);
}

.stage16-primary:disabled {
    opacity: .55;
    cursor: not-allowed;
}

.stage16-secondary {
    width: 100%;
    height: 30px;
    margin: 0 0 6px;
    border: 1px solid var(--ui-border, #d7dce3);
    border-radius: var(--ui-radius-sm, 7px);
    background: var(--ui-bg, #fff);
    color: var(--ui-text, #1d2430);
    font-family: inherit;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
}

.stage16-secondary:hover {
    background: var(--ui-bg-hover, #eef1f5);
    border-color: var(--ui-accent, #1f6feb);
}

.stage16-status {
    min-height: 15px;
    margin: 0 0 8px;
    font-size: 10.5px;
    line-height: 1.35;
    color: var(--ui-text-muted, #5b6472);
    word-break: break-word;
}

.stage16-status.ok {
    color: var(--ui-success, #16a34a);
}

.stage16-status.err {
    color: var(--ui-danger, #dc2626);
}

.stage16-hint {
    margin: -2px 0 9px;
    font-size: 9.5px;
    line-height: 1.4;
    color: var(--ui-text-faint, #8b93a1);
}

.stage16-divider {
    height: 1px;
    margin: 9px 0;
    background: var(--ui-border-soft, #e9edf2);
}

.stage16-check {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0 0 6px;
    font-size: 10.5px;
    font-weight: 600;
    color: var(--ui-text-muted, #5b6472);
    cursor: pointer;
    text-transform: none;
    letter-spacing: 0;
}

.stage16-check input {
    width: auto !important;
    height: auto !important;
    margin: 0 !important;
}


/* ===================== LAYER LIST ===================== */
.stage16-layer-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.stage16-layer-row {
    padding: 8px;
    border: 1px solid var(--ui-border-soft, #e9edf2);
    border-radius: var(--ui-radius-sm, 7px);
    background: var(--ui-bg-subtle, #f5f7fa);
    transition: border-color .15s ease, background .15s ease;
}

.stage16-layer-row.active {
    border-color: var(--ui-accent, #1f6feb);
    background: var(--ui-accent-soft, rgba(31,111,235,0.08));
}

.stage16-layer-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
}

.stage16-layer-name {
    display: flex !important;
    align-items: center;
    gap: 6px;
    min-width: 0;
    flex: 1;
    margin: 0 !important;
    cursor: pointer;
    text-transform: none !important;
    letter-spacing: 0 !important;
}

.stage16-layer-name input {
    width: auto !important;
    height: auto !important;
    margin: 0 !important;
}

.stage16-layer-name span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--ui-text, #1d2430);
}

.stage16-type {
    flex: 0 0 auto;
    padding: 2px 5px;
    border-radius: 4px;
    background: var(--ui-border-soft, #e9edf2);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: .4px;
    color: var(--ui-text-muted, #5b6472);
}

.stage16-layer-controls {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 7px;
}

.stage16-small {
    width: 26px;
    height: 26px;
    flex: 0 0 auto;
    padding: 0;
    border: 1px solid var(--ui-border, #d7dce3);
    border-radius: 5px;
    background: var(--ui-bg, #ffffff);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    line-height: 1;
}

.stage16-small:hover {
    background: var(--ui-bg-hover, #eef1f5);
}

.stage16-delete:hover {
    color: var(--ui-danger, #dc2626);
    border-color: var(--ui-danger, #dc2626);
}

.stage16-opacity {
    flex: 1;
    height: 4px;
    min-width: 40px;
}

.stage16-opacity-value {
    width: 32px;
    flex: 0 0 auto;
    text-align: right;
    font-size: 9.5px;
    color: var(--ui-text-muted, #5b6472);
}

.stage16-empty {
    padding: 22px 10px;
    text-align: center;
    color: var(--ui-text-faint, #8b93a1);
    font-size: 11px;
    line-height: 1.5;
}


/* ===================== FOOTER ===================== */
.stage16-footer {
    padding: 8px 12px;
    border-top: 1px solid var(--ui-border-soft, #e9edf2);
    background: var(--ui-bg-subtle, #f5f7fa);
    color: var(--ui-text-muted, #5b6472);
    font-size: 9.5px;
    line-height: 1.4;
    text-align: center;
    flex-shrink: 0;
}


/* ===================== MOBILE ===================== */
@media (max-width: 600px) {

    #${CONFIG.buttonId} {
        width: 40px;
        height: 40px;
        min-width: 40px;
        min-height: 40px;
    }

    #${CONFIG.panelId} {
        width: auto !important;
        max-width: none !important;
    }

    .stage16-tab {
        font-size: 10px;
        padding: 9px 2px;
    }

    .stage16-tab-content input[type="text"],
    .stage16-tab-content select {
        height: 34px;
        font-size: 12px;
    }

    .stage16-primary {
        height: 36px;
        font-size: 12px;
    }

    .stage16-secondary {
        height: 34px;
        font-size: 11.5px;
    }
}
        `;

        document.head.appendChild(css);
    }

    // =========================================================
    // BUTTON
    // =========================================================
    function createButton() {
        var existing = document.getElementById(CONFIG.buttonId);

        if (existing) {
            button = existing;
            return;
        }

        button = document.createElement("button");
        button.id = CONFIG.buttonId;
        button.type = "button";
        button.title = "External Base Maps (WMS / WMTS / XYZ)";

        button.innerHTML = `
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none"
                 xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M3 6.5 L8.5 4 L15.5 6.5 L21 4 V17.5 L15.5 20 L8.5 17.5 L3 20 V6.5Z"
                      stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
                <path d="M8.5 4V17.5" stroke="currentColor" stroke-width="1.5"/>
                <path d="M15.5 6.5V20" stroke="currentColor" stroke-width="1.5"/>
                <circle cx="17" cy="8" r="2.2" stroke="currentColor" stroke-width="1.5"/>
                <path d="M17 10.2V13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
        `;

        button.addEventListener("click", function (event) {
            event.preventDefault();
            event.stopPropagation();

            // Ignore clicks while the Tool Manager is in edit mode
            if (document.body.classList.contains("drag-edit-mode")) {
                return;
            }

            togglePanel();
        });

        document.body.appendChild(button);
    }

    // =========================================================
    // PANEL
    // =========================================================
    function createPanel() {
        var existing = document.getElementById(CONFIG.panelId);

        if (existing) {
            panel = existing;
            return;
        }

        panel = document.createElement("div");
        panel.id = CONFIG.panelId;

        panel.innerHTML = `
            <div class="stage16-header">
                <div>
                    <div class="stage16-title">🌐 External Base Maps</div>
                    <div class="stage16-subtitle">WMS · WMTS · XYZ</div>
                </div>
                <button id="stage16-close" type="button" title="Close">×</button>
            </div>

            <div class="stage16-tabs">
                <button class="stage16-tab active" data-tab="wms"  type="button">WMS</button>
                <button class="stage16-tab"        data-tab="wmts" type="button">WMTS</button>
                <button class="stage16-tab"        data-tab="xyz"  type="button">XYZ</button>
                <button class="stage16-tab"        data-tab="layers" type="button">
                    MAPS<span class="stage16-badge" id="stage16-count">0</span>
                </button>
            </div>

            <!-- ============ WMS ============ -->
            <div id="stage16-tab-wms" class="stage16-tab-content">
                <label>WMS GetCapabilities URL</label>
                <input id="stage16-wms-url" type="text"
                       placeholder="https://example.com/wms"/>
                <button id="stage16-wms-connect" class="stage16-primary" type="button">
                    Connect
                </button>
                <div id="stage16-wms-status" class="stage16-status"></div>

                <label>WMS Layer</label>
                <select id="stage16-wms-layer">
                    <option value="">Connect to WMS first</option>
                </select>

                <label>Display Name (optional)</label>
                <input id="stage16-wms-name" type="text" placeholder="Leave blank to use layer title"/>

                <button id="stage16-wms-add" class="stage16-primary" type="button">
                    Add as Base Map
                </button>

                <div class="stage16-divider"></div>

                <label class="stage16-check">
                    <input type="checkbox" id="stage16-proxy-toggle"/>
                    Use CORS proxy
                </label>
                <input id="stage16-proxy-url" type="text"
                       placeholder="https://corsproxy.io/?"/>
                <div class="stage16-hint">
                    Only needed when the remote server blocks cross-origin requests.
                    The proxy prefix is applied to GetCapabilities requests.
                </div>
            </div>

            <!-- ============ WMTS ============ -->
            <div id="stage16-tab-wmts" class="stage16-tab-content" style="display:none;">
                <label>WMTS GetCapabilities URL</label>
                <input id="stage16-wmts-url" type="text"
                       placeholder="https://example.com/wmts"/>
                <button id="stage16-wmts-connect" class="stage16-primary" type="button">
                    Connect
                </button>
                <div id="stage16-wmts-status" class="stage16-status"></div>

                <label>WMTS Layer</label>
                <select id="stage16-wmts-layer">
                    <option value="">Connect to WMTS first</option>
                </select>

                <label>Matrix Set (optional)</label>
                <select id="stage16-wmts-matrix">
                    <option value="">Auto</option>
                </select>

                <label>Display Name (optional)</label>
                <input id="stage16-wmts-name" type="text" placeholder="Leave blank to use layer title"/>

                <button id="stage16-wmts-add" class="stage16-primary" type="button">
                    Add as Base Map
                </button>
            </div>

            <!-- ============ XYZ ============ -->
            <div id="stage16-tab-xyz" class="stage16-tab-content" style="display:none;">
                <label>XYZ Tile URL Template</label>
                <input id="stage16-xyz-url" type="text"
                       placeholder="https://tile.server/{z}/{x}/{y}.png"/>

                <label>Base Map Name</label>
                <input id="stage16-xyz-name" type="text" placeholder="My XYZ Base Map"/>

                <button id="stage16-xyz-add" class="stage16-primary" type="button">
                    Add as Base Map
                </button>
                <div id="stage16-xyz-status" class="stage16-status"></div>

                <div class="stage16-divider"></div>

                <div class="stage16-hint">
                    <strong>Quick presets</strong>
                </div>

                <button class="stage16-secondary stage16-preset" type="button"
                        data-name="Google Satellite"
                        data-url="https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}">
                    Google Satellite
                </button>

                <button class="stage16-secondary stage16-preset" type="button"
                        data-name="Google Hybrid"
                        data-url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}">
                    Google Hybrid
                </button>

                <button class="stage16-secondary stage16-preset" type="button"
                        data-name="Esri World Imagery"
                        data-url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}">
                    Esri World Imagery
                </button>

                <button class="stage16-secondary stage16-preset" type="button"
                        data-name="OpenStreetMap"
                        data-url="https://tile.openstreetmap.org/{z}/{x}/{y}.png">
                    OpenStreetMap
                </button>

                <button class="stage16-secondary stage16-preset" type="button"
                        data-name="Esri Topographic"
                        data-url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}">
                    Esri Topographic
                </button>
            </div>

            <!-- ============ MANAGER ============ -->
            <div id="stage16-tab-layers" class="stage16-tab-content" style="display:none;">
                <div id="stage16-layer-list" class="stage16-layer-list"></div>
                <div class="stage16-divider"></div>
                <button id="stage16-clear-all" class="stage16-secondary" type="button">
                    🗑 Remove All External Base Maps
                </button>
            </div>

            <div class="stage16-footer">
                External maps sit above the QGIS2Web base map and below all vector / parcel layers.
            </div>
        `;

        document.body.appendChild(panel);
        bindPanelEvents();
        refreshLayerManager();
    }

    // =========================================================
    // PANEL POSITIONING  ★ Bypasses all !important locks
    // =========================================================
    function positionPanel() {
        if (!panel || !button) {
            return;
        }

        if (!panel.classList.contains("stage16-visible")) {
            return;
        }

        var pad = 8;
        var vw = window.innerWidth;
        var vh = window.innerHeight;

        var b = button.getBoundingClientRect();

        // ---------------------------------------------------------
        // MOBILE → centered floating card (NEVER full width)
        // ---------------------------------------------------------
        if (vw <= 600) {
            var targetWidth = Math.min(CONFIG.panelWidth, vw - 16);
            var leftPos = Math.round((vw - targetWidth) / 2);

            panel.style.setProperty("width", targetWidth + "px", "important");
            panel.style.setProperty("left", leftPos + "px", "important");
            panel.style.setProperty("right", "auto", "important");
            panel.style.setProperty("top", "8px", "important");
            panel.style.setProperty("bottom", "auto", "important");
            panel.style.setProperty("max-height", (vh - 16) + "px", "important");

            return;
        }

        // ---------------------------------------------------------
        // DESKTOP → follows the button
        // ---------------------------------------------------------
        panel.style.setProperty("width", CONFIG.panelWidth + "px", "important");
        panel.style.setProperty("right", "auto", "important");
        panel.style.setProperty("bottom", "auto", "important");

        var pw = panel.offsetWidth || CONFIG.panelWidth;
        var ph = panel.offsetHeight || 420;

        var spaceRight = vw - b.right;
        var spaceLeft = b.left;

        var left;

        if (spaceLeft >= pw + CONFIG.panelGap + pad) {
            // open to the LEFT
            left = b.left - CONFIG.panelGap - pw;
        } else if (spaceRight >= pw + CONFIG.panelGap + pad) {
            // open to the RIGHT
            left = b.right + CONFIG.panelGap;
        } else {
            // center fallback
            left = Math.max(pad, (vw - pw) / 2);
        }

        left = Math.max(pad, Math.min(left, vw - pw - pad));

        var top = b.top;
        top = Math.max(pad, Math.min(top, vh - ph - pad));

        if (ph > vh - pad * 2) {
            top = pad;
        }

        // ★ DYNAMIC REMAINING HEIGHT: locks panel inside the screen
        var maxPh = vh - top - pad;

        panel.style.setProperty("left", Math.round(left) + "px", "important");
        panel.style.setProperty("top", Math.round(top) + "px", "important");
        panel.style.setProperty("max-height", Math.round(maxPh) + "px", "important");
    }

    // =========================================================
    // OPEN / CLOSE
    // =========================================================
    function openPanel() {
        if (!panel) {
            createPanel();
        }

        panelOpen = true;
        panel.classList.add("stage16-visible");

        if (button) {
            button.classList.add("stage16-open");
        }

        refreshLayerManager();

        // Two frames so layout settles before measuring
        requestAnimationFrame(function () {
            requestAnimationFrame(positionPanel);
        });
    }

    function closePanel() {
        panelOpen = false;

        if (panel) {
            panel.classList.remove("stage16-visible");
        }

        if (button) {
            button.classList.remove("stage16-open");
        }
    }

    function togglePanel() {
        if (panelOpen) {
            closePanel();
        } else {
            openPanel();
        }
    }

    // =========================================================
    // PANEL EVENTS
    // =========================================================
    function bindPanelEvents() {
        document.getElementById("stage16-close")
            .addEventListener("click", closePanel);

        // --- Tabs ---
        panel.querySelectorAll(".stage16-tab").forEach(function (tab) {
            tab.addEventListener("click", function () {
                var name = tab.dataset.tab;

                panel.querySelectorAll(".stage16-tab").forEach(function (t) {
                    t.classList.remove("active");
                });

                panel.querySelectorAll(".stage16-tab-content").forEach(function (c) {
                    c.style.display = "none";
                });

                tab.classList.add("active");
                document.getElementById("stage16-tab-" + name).style.display = "block";

                if (name === "layers") {
                    refreshLayerManager();
                }

                positionPanel();
            });
        });

        // --- Service actions ---
        document.getElementById("stage16-wms-connect")
            .addEventListener("click", connectWMS);

        document.getElementById("stage16-wms-add")
            .addEventListener("click", addWMSLayer);

        document.getElementById("stage16-wmts-connect")
            .addEventListener("click", connectWMTS);

        document.getElementById("stage16-wmts-add")
            .addEventListener("click", addWMTSLayer);

        document.getElementById("stage16-xyz-add")
            .addEventListener("click", function () {
                addXYZLayer(
                    document.getElementById("stage16-xyz-url").value.trim(),
                    document.getElementById("stage16-xyz-name").value.trim()
                );
            });

        // --- XYZ presets ---
        panel.querySelectorAll(".stage16-preset").forEach(function (btn) {
            btn.addEventListener("click", function () {
                document.getElementById("stage16-xyz-url").value = btn.dataset.url;
                document.getElementById("stage16-xyz-name").value = btn.dataset.name;
                addXYZLayer(btn.dataset.url, btn.dataset.name);
            });
        });

        // --- Remove all ---
        document.getElementById("stage16-clear-all")
            .addEventListener("click", function () {
                if (!externalLayers.length) {
                    return;
                }

                if (!confirm("Remove ALL external base maps?")) {
                    return;
                }

                externalLayers.slice().forEach(removeExternalLayer);
            });

        // --- CORS proxy ---
        var proxyToggle = document.getElementById("stage16-proxy-toggle");
        var proxyInput = document.getElementById("stage16-proxy-url");

        try {
            corsProxy = localStorage.getItem(CONFIG.proxyKey) || "";
        } catch (e) {
            corsProxy = "";
        }

        if (corsProxy) {
            proxyToggle.checked = true;
            proxyInput.value = corsProxy;
        }

        function saveProxy() {
            if (proxyToggle.checked) {
                corsProxy = proxyInput.value.trim();
            } else {
                corsProxy = "";
            }

            try {
                localStorage.setItem(CONFIG.proxyKey, corsProxy);
            } catch (e) {
                // storage unavailable
            }
        }

        proxyToggle.addEventListener("change", saveProxy);
        proxyInput.addEventListener("change", saveProxy);

        // --- WMTS layer change → repopulate matrix sets ---
        document.getElementById("stage16-wmts-layer")
            .addEventListener("change", populateMatrixSets);

        // --- Stop clicks inside the panel from closing it ---
        panel.addEventListener("click", function (e) {
            e.stopPropagation();
        });
    }

    // =========================================================
    // GLOBAL EVENTS
    // =========================================================
    function bindGlobalEvents() {

        // Reposition panel when window changes
        window.addEventListener("resize", positionPanel);

        window.addEventListener("orientationchange", function () {
            setTimeout(positionPanel, 250);
        });

        // Reposition when the Tool Manager moves our button
        document.addEventListener("maptool:moved", function (e) {
            if (e.detail && e.detail.id === CONFIG.toolId) {
                positionPanel();
            }
        });

        // Close when entering edit mode
        document.addEventListener("maptool:editmode", function (e) {
            if (e.detail && e.detail.active) {
                closePanel();
            }
        });

        // Close when our tool gets hidden
        document.addEventListener("maptool:visibility", function (e) {
            if (e.detail && e.detail.id === CONFIG.toolId && !e.detail.visible) {
                closePanel();
            }
        });

        // ESC closes
        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape" && panelOpen) {
                closePanel();
            }
        });

        // Click outside closes
        document.addEventListener("click", function (e) {
            if (!panelOpen) {
                return;
            }

            if (!panel) {
                return;
            }

            if (panel.contains(e.target)) {
                return;
            }

            if (button && button.contains(e.target)) {
                return;
            }

            closePanel();
        });
    }

    // =========================================================
    // FETCH HELPERS
    // =========================================================
    function proxied(url) {
        if (!corsProxy) {
            return url;
        }

        if (corsProxy.indexOf("{url}") >= 0) {
            return corsProxy.replace("{url}", encodeURIComponent(url));
        }

        return corsProxy + encodeURIComponent(url);
    }

    function fetchText(url) {
        var controller = new AbortController();

        var timer = setTimeout(function () {
            controller.abort();
        }, CONFIG.fetchTimeout);

        return fetch(proxied(url), { signal: controller.signal })
            .then(function (response) {
                clearTimeout(timer);

                if (!response.ok) {
                    throw new Error("HTTP " + response.status);
                }

                return response.text();
            })
            .catch(function (error) {
                clearTimeout(timer);

                if (error.name === "AbortError") {
                    throw new Error("Request timed out.");
                }

                throw error;
            });
    }

    function normalizeCapabilitiesURL(url, service) {
        url = String(url || "").trim();

        if (!url) {
            return "";
        }

        if (/request=getcapabilities/i.test(url)) {
            return url;
        }

        var sep = "?";
        if (url.indexOf("?") >= 0) {
            sep = "&";
        }

        return url + sep + "SERVICE=" + service + "&REQUEST=GetCapabilities";
    }

    function setStatus(el, message, state) {
        el.textContent = message;

        if (state) {
            el.className = "stage16-status " + state;
        } else {
            el.className = "stage16-status";
        }
    }

    // =========================================================
    // WMS — CONNECT
    // =========================================================
    function connectWMS() {
        var input = document.getElementById("stage16-wms-url");
        var status = document.getElementById("stage16-wms-status");
        var select = document.getElementById("stage16-wms-layer");
        var url = normalizeCapabilitiesURL(input.value, "WMS");

        if (!url) {
            setStatus(status, "Please enter a WMS URL.", "err");
            return;
        }

        setStatus(status, "Connecting…");

        fetchText(url)
            .then(function (text) {
                var parsed = parseWMSCapabilities(text);

                if (!parsed.layers.length) {
                    throw new Error("No usable WMS layers found.");
                }

                wmsCapabilities = parsed;

                select.innerHTML = "";

                parsed.layers.forEach(function (layer) {
                    var option = document.createElement("option");
                    option.value = layer.name;
                    option.textContent = layer.title || layer.name;
                    select.appendChild(option);
                });

                select.dataset.serviceUrl = parsed.getMapUrl || stripCapabilities(url);
                select.dataset.version = parsed.version;

                setStatus(
                    status,
                    "✓ " + parsed.layers.length + " layers found (WMS " + parsed.version + ")",
                    "ok"
                );
            })
            .catch(function (error) {
                console.error("🌐 Stage 16 WMS:", error);
                setStatus(
                    status,
                    "✕ " + error.message + " — check the URL or enable the CORS proxy.",
                    "err"
                );
            });
    }

    function stripCapabilities(url) {
        return url
            .replace(/([?&])SERVICE=WMS/ig, "$1")
            .replace(/([?&])REQUEST=GetCapabilities/ig, "$1")
            .replace(/([?&])VERSION=[^&]*/ig, "$1")
            .replace(/[?&]+$/, "")
            .replace(/\?&/, "?");
    }

    function parseWMSCapabilities(xmlText) {
        var xml = new DOMParser().parseFromString(xmlText, "text/xml");

        if (xml.getElementsByTagName("parsererror").length) {
            throw new Error("Invalid XML returned by the server.");
        }

        var root = xml.documentElement;
        var version = root.getAttribute("version") || "1.1.1";

        if (root.nodeName === "WMS_Capabilities" && !root.getAttribute("version")) {
            version = "1.3.0";
        }

        // GetMap endpoint
        var getMapUrl = "";
        var nodes = xml.getElementsByTagName("OnlineResource");
        var getMapNode = xml.getElementsByTagName("GetMap")[0];

        if (getMapNode) {
            var res = getMapNode.getElementsByTagName("OnlineResource")[0];

            if (res) {
                getMapUrl =
                    res.getAttributeNS("http://www.w3.org/1999/xlink", "href") ||
                    res.getAttribute("xlink:href") ||
                    res.getAttribute("href") ||
                    "";
            }
        }

        if (!getMapUrl && nodes.length) {
            getMapUrl =
                nodes[0].getAttributeNS("http://www.w3.org/1999/xlink", "href") ||
                nodes[0].getAttribute("xlink:href") ||
                "";
        }

        getMapUrl = String(getMapUrl).replace(/\?$/, "");

        // Layers (skip group layers that have no <Name>)
        var layers = [];
        var seen = {};

        Array.from(xml.getElementsByTagName("Layer")).forEach(function (node) {
            var nameNode = Array.from(node.childNodes).find(function (c) {
                return c.nodeName === "Name";
            });

            if (!nameNode) {
                return;
            }

            var name = String(nameNode.textContent).trim();

            if (!name || seen[name]) {
                return;
            }

            seen[name] = true;

            var titleNode = Array.from(node.childNodes).find(function (c) {
                return c.nodeName === "Title";
            });

            var title = name;
            if (titleNode) {
                title = String(titleNode.textContent).trim();
            }

            layers.push({
                name: name,
                title: title
            });
        });

        return {
            version: version,
            getMapUrl: getMapUrl,
            layers: layers
        };
    }

    // =========================================================
    // WMS — ADD
    // =========================================================
    function addWMSLayer() {
        var select = document.getElementById("stage16-wms-layer");
        var status = document.getElementById("stage16-wms-status");
        var nameInput = document.getElementById("stage16-wms-name");

        var layerName = select.value;
        var serviceURL = select.dataset.serviceUrl;
        var version = select.dataset.version || "1.1.1";

        if (!layerName || !serviceURL) {
            setStatus(status, "Connect to a WMS service and select a layer first.", "err");
            return;
        }

        var title = nameInput.value.trim();

        if (!title) {
            if (select.options[select.selectedIndex]) {
                title = select.options[select.selectedIndex].textContent;
            } else {
                title = layerName;
            }
        }

        var source = new ol.source.TileWMS({
            url: serviceURL,
            params: {
                LAYERS: layerName,
                STYLES: "",
                FORMAT: "image/png",
                TRANSPARENT: true,
                VERSION: version,
                TILED: true
            },
            crossOrigin: "anonymous",
            transition: 0
        });

        var layer = new ol.layer.Tile({
            source: source,
            visible: true,
            opacity: CONFIG.defaultOpacity,
            properties: {
                stage16External: true,
                stage16ExternalType: "WMS",
                stage16ExternalBaseMap: true,
                title: title
            }
        });

        var added = addExternalBaseMap(layer, {
            type: "WMS",
            name: layerName,
            title: title,
            url: serviceURL,
            layer: layerName,
            version: version
        });

        if (added) {
            setStatus(status, "✓ Added “" + title + "”.", "ok");
        }
    }

    // =========================================================
    // WMTS — CONNECT
    // =========================================================
    function connectWMTS() {
        var input = document.getElementById("stage16-wmts-url");
        var status = document.getElementById("stage16-wmts-status");
        var select = document.getElementById("stage16-wmts-layer");
        var url = normalizeCapabilitiesURL(input.value, "WMTS");

        if (!url) {
            setStatus(status, "Please enter a WMTS URL.", "err");
            return;
        }

        setStatus(status, "Connecting…");

        fetchText(url)
            .then(function (text) {
                var parser = new ol.format.WMTSCapabilities();
                var caps = parser.read(text);

                if (!caps || !caps.Contents || !caps.Contents.Layer ||
                    !caps.Contents.Layer.length) {
                    throw new Error("No WMTS layers found.");
                }

                wmtsCapabilities = caps;

                select.innerHTML = "";

                caps.Contents.Layer.forEach(function (layer) {
                    var option = document.createElement("option");
                    option.value = layer.Identifier;
                    option.textContent = layer.Title || layer.Identifier;
                    select.appendChild(option);
                });

                select.dataset.serviceUrl = url;
                populateMatrixSets();

                setStatus(
                    status,
                    "✓ " + caps.Contents.Layer.length + " WMTS layers found.",
                    "ok"
                );
            })
            .catch(function (error) {
                console.error("🌐 Stage 16 WMTS:", error);
                setStatus(status, "✕ " + error.message, "err");
            });
    }

    function populateMatrixSets() {
        var layerSelect = document.getElementById("stage16-wmts-layer");
        var matrixSelect = document.getElementById("stage16-wmts-matrix");

        matrixSelect.innerHTML = '<option value="">Auto</option>';

        if (!wmtsCapabilities) {
            return;
        }

        var identifier = layerSelect.value;

        var layer = wmtsCapabilities.Contents.Layer.find(function (l) {
            return l.Identifier === identifier;
        });

        if (!layer || !layer.TileMatrixSetLink) {
            return;
        }

        layer.TileMatrixSetLink.forEach(function (link) {
            var option = document.createElement("option");
            option.value = link.TileMatrixSet;
            option.textContent = link.TileMatrixSet;
            matrixSelect.appendChild(option);
        });
    }

    // =========================================================
    // WMTS — ADD
    // =========================================================
    function addWMTSLayer() {
        var select = document.getElementById("stage16-wmts-layer");
        var matrixSelect = document.getElementById("stage16-wmts-matrix");
        var status = document.getElementById("stage16-wmts-status");
        var nameInput = document.getElementById("stage16-wmts-name");

        var layerName = select.value;
        var url = select.dataset.serviceUrl;
        var matrixSet = matrixSelect.value;

        if (!layerName || !url || !wmtsCapabilities) {
            setStatus(status, "Connect to a WMTS service and select a layer first.", "err");
            return;
        }

        var title = nameInput.value.trim();

        if (!title) {
            if (select.options[select.selectedIndex]) {
                title = select.options[select.selectedIndex].textContent;
            } else {
                title = layerName;
            }
        }

        try {
            var opts = { layer: layerName };

            if (matrixSet) {
                opts.matrixSet = matrixSet;
            }

            var options = ol.source.WMTS.optionsFromCapabilities(
                wmtsCapabilities,
                opts
            );

            if (!options) {
                throw new Error("Unable to build a WMTS source.");
            }

            options.crossOrigin = "anonymous";

            var layer = new ol.layer.Tile({
                source: new ol.source.WMTS(options),
                visible: true,
                opacity: CONFIG.defaultOpacity,
                properties: {
                    stage16External: true,
                    stage16ExternalType: "WMTS",
                    stage16ExternalBaseMap: true,
                    title: title
                }
            });

            var matrixValue = "";
            if (matrixSet) {
                matrixValue = matrixSet;
            }

            var added = addExternalBaseMap(layer, {
                type: "WMTS",
                name: layerName,
                title: title,
                url: url,
                layer: layerName,
                matrixSet: matrixValue
            });

            if (added) {
                setStatus(status, "✓ Added “" + title + "”.", "ok");
            }

        } catch (error) {
            console.error("🌐 Stage 16 WMTS:", error);
            setStatus(status, "✕ " + error.message, "err");
        }
    }

    // =========================================================
    // XYZ — ADD
    // =========================================================
    function addXYZLayer(url, name) {
        var status = document.getElementById("stage16-xyz-status");

        url = String(url || "").trim();

        if (!url) {
            if (status) {
                setStatus(status, "Please enter an XYZ tile URL.", "err");
            }
            return;
        }

        if (url.indexOf("{x}") < 0 || url.indexOf("{y}") < 0 || url.indexOf("{z}") < 0) {
            if (status) {
                setStatus(status, "URL must contain {x}, {y} and {z} placeholders.", "err");
            }
            return;
        }

        var title = String(name || "").trim();

        if (!title) {
            title = "XYZ Base Map";
        }

        var layer = new ol.layer.Tile({
            source: new ol.source.XYZ({
                url: url,
                crossOrigin: "anonymous",
                tileSize: CONFIG.tileSize,
                transition: 0
            }),
            visible: true,
            opacity: CONFIG.defaultOpacity,
            properties: {
                stage16External: true,
                stage16ExternalType: "XYZ",
                stage16ExternalBaseMap: true,
                title: title
            }
        });

        var added = addExternalBaseMap(layer, {
            type: "XYZ",
            name: title,
            title: title,
            url: url
        });

        if (added && status) {
            setStatus(status, "✓ Added “" + title + "”.", "ok");
        }
    }

    // =========================================================
    // REGISTRATION & Z-INDEX
    // =========================================================
    function addExternalBaseMap(layer, metadata) {
        var duplicate = externalLayers.some(function (item) {
            var sameType = item.metadata.type === metadata.type;
            var sameUrl = item.metadata.url === metadata.url;
            var itemLayer = item.metadata.layer || "";
            var metaLayer = metadata.layer || "";
            var sameLayer = itemLayer === metaLayer;

            return sameType && sameUrl && sameLayer;
        });

        if (duplicate) {
            alert("This external base map has already been added.");
            return false;
        }

        mapRef.addLayer(layer);

        var item = {
            id: "stage16-" + Date.now() + "-" +
                Math.random().toString(36).substring(2, 8),
            layer: layer,
            metadata: metadata
        };

        layer.set("stage16Id", item.id);
        externalLayers.push(item);

        positionExternalLayer(layer);
        activateExternalBaseMap(item);
        saveExternalLayers();
        refreshLayerManager();

        return true;
    }

    function isQGIS2WebBaseLayer(layer) {
        if (!layer || layer.get("stage16External")) {
            return false;
        }

        var type = layer.get("type");

        if (type === "base") {
            return true;
        }

        if (layer.get("isBaseLayer") === true) {
            return true;
        }

        if (layer.get("baseLayer") === true) {
            return true;
        }

        return false;
    }

    function isOverlayLayer(layer) {
        if (!layer) {
            return false;
        }

        if (layer.get("stage16External")) {
            return false;
        }

        if (isQGIS2WebBaseLayer(layer)) {
            return false;
        }

        return true;
    }

    function calculateExternalZIndex() {
        var all = mapRef.getLayers().getArray();

        var highestBase = -Infinity;
        var lowestOverlay = Infinity;

        all.forEach(function (layer) {
            var z = layer.getZIndex() || 0;

            if (isQGIS2WebBaseLayer(layer)) {
                highestBase = Math.max(highestBase, z);
            } else if (isOverlayLayer(layer)) {
                lowestOverlay = Math.min(lowestOverlay, z);
            }
        });

        if (lowestOverlay !== Infinity) {
            return lowestOverlay - CONFIG.vectorGap;
        }

        if (highestBase !== -Infinity) {
            return highestBase + CONFIG.baseMapGap;
        }

        return 1;
    }

    function positionExternalLayer(layer) {
        if (!layer) {
            return;
        }

        layer.setZIndex(calculateExternalZIndex());
    }

    function repositionAllExternalLayers() {
        externalLayers.forEach(function (item) {
            positionExternalLayer(item.layer);
        });
    }

    function activateExternalBaseMap(item) {
        if (!item) {
            return;
        }

        activeExternalBaseMap = item;

        externalLayers.forEach(function (other) {
            other.layer.setVisible(other.id === item.id);
        });

        positionExternalLayer(item.layer);
        saveExternalLayers();
        refreshLayerManager();
    }

    function deactivateExternalBaseMap() {
        if (!activeExternalBaseMap) {
            return;
        }

        activeExternalBaseMap.layer.setVisible(false);
        activeExternalBaseMap = null;
        saveExternalLayers();
        refreshLayerManager();
    }

    function removeExternalLayer(item) {
        if (!item) {
            return;
        }

        var wasActive = false;

        if (activeExternalBaseMap && activeExternalBaseMap.id === item.id) {
            wasActive = true;
        }

        try {
            mapRef.removeLayer(item.layer);
        } catch (e) {
            // ignore
        }

        var index = externalLayers.indexOf(item);

        if (index >= 0) {
            externalLayers.splice(index, 1);
        }

        if (wasActive) {
            activeExternalBaseMap = null;

            if (externalLayers.length) {
                activateExternalBaseMap(externalLayers[externalLayers.length - 1]);
            }
        }

        repositionAllExternalLayers();
        saveExternalLayers();
        refreshLayerManager();
    }

    // =========================================================
    // LAYER MANAGER UI
    // =========================================================
    function refreshLayerManager() {
        var container = document.getElementById("stage16-layer-list");
        var counter = document.getElementById("stage16-count");

        if (counter) {
            counter.textContent = String(externalLayers.length);
        }

        if (!container) {
            return;
        }

        container.innerHTML = "";

        if (!externalLayers.length) {
            container.innerHTML =
                '<div class="stage16-empty">' +
                'No external base maps yet.<br>' +
                'Add one from the WMS, WMTS or XYZ tab.' +
                '</div>';
            return;
        }

        externalLayers.forEach(function (item) {
            var active = false;

            if (activeExternalBaseMap && activeExternalBaseMap.id === item.id) {
                active = true;
            }

            var type = item.metadata.type;
            var name = item.metadata.title || item.metadata.name || type;

            var row = document.createElement("div");
            row.className = "stage16-layer-row";

            if (active) {
                row.className = row.className + " active";
            }

            var checkedAttr = "";
            if (active) {
                checkedAttr = "checked";
            }

            var eyeIcon = "◌";
            if (item.layer.getVisible()) {
                eyeIcon = "👁";
            }

            row.innerHTML = `
                <div class="stage16-layer-top">
                    <label class="stage16-layer-name">
                        <input type="radio" name="stage16-active-base-map" ${checkedAttr}>
                        <span title="${escapeHTML(name)}">${escapeHTML(name)}</span>
                    </label>
                    <span class="stage16-type">${escapeHTML(type)}</span>
                </div>
                <div class="stage16-layer-controls">
                    <button class="stage16-small" data-action="visibility"
                            type="button" title="Show / Hide">
                        ${eyeIcon}
                    </button>
                    <input type="range" min="0" max="1" step="0.05"
                           value="${item.layer.getOpacity()}"
                           class="stage16-opacity" title="Opacity">
                    <span class="stage16-opacity-value">${Math.round(item.layer.getOpacity() * 100)}%</span>
                    <button class="stage16-small stage16-delete" data-action="remove"
                            type="button" title="Remove">🗑</button>
                </div>
            `;

            row.querySelector("input[type='radio']")
                .addEventListener("change", function () {
                    if (this.checked) {
                        activateExternalBaseMap(item);
                    }
                });

            row.querySelector("[data-action='visibility']")
                .addEventListener("click", function () {
                    if (item.layer.getVisible()) {
                        if (activeExternalBaseMap &&
                            activeExternalBaseMap.id === item.id) {
                            deactivateExternalBaseMap();
                        } else {
                            item.layer.setVisible(false);
                            saveExternalLayers();
                            refreshLayerManager();
                        }
                    } else {
                        activateExternalBaseMap(item);
                    }
                });

            var slider = row.querySelector(".stage16-opacity");
            var value = row.querySelector(".stage16-opacity-value");

            slider.addEventListener("input", function () {
                var v = Number(slider.value);
                item.layer.setOpacity(v);
                value.textContent = Math.round(v * 100) + "%";
            });

            slider.addEventListener("change", saveExternalLayers);

            row.querySelector("[data-action='remove']")
                .addEventListener("click", function () {
                    removeExternalLayer(item);
                });

            container.appendChild(row);
        });
    }

    function escapeHTML(value) {
        if (value === null || value === undefined) {
            value = "";
        }

        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // =========================================================
    // PERSISTENCE
    // =========================================================
    function saveExternalLayers() {
        try {
            var data = externalLayers.map(function (item) {
                var isActive = false;

                if (activeExternalBaseMap && activeExternalBaseMap.id === item.id) {
                    isActive = true;
                }

                return {
                    id: item.id,
                    metadata: item.metadata,
                    opacity: item.layer.getOpacity(),
                    visible: item.layer.getVisible(),
                    active: isActive
                };
            });

            localStorage.setItem(CONFIG.storageKey, JSON.stringify(data));
        } catch (e) {
            // storage unavailable
        }
    }

    function restoreExternalLayers() {
        var saved = [];

        try {
            saved = JSON.parse(localStorage.getItem(CONFIG.storageKey) || "[]");
        } catch (e) {
            saved = [];
        }

        if (!Array.isArray(saved) || !saved.length) {
            refreshLayerManager();
            return;
        }

        var tasks = saved.map(function (entry) {
            return restoreOne(entry).catch(function (error) {
                console.warn("🌐 Stage 16: could not restore a layer —", error.message);
                return null;
            });
        });

        Promise.all(tasks).then(function () {
            var activeEntry = saved.find(function (e) {
                return e && e.active;
            });

            if (activeEntry) {
                var match = externalLayers.find(function (item) {
                    return item.id === activeEntry.id;
                });

                if (match) {
                    activateExternalBaseMap(match);
                }
            }

            refreshLayerManager();
        });
    }

    function restoreOne(entry) {
        return new Promise(function (resolve, reject) {
            if (!entry || !entry.metadata) {
                reject(new Error("bad entry"));
                return;
            }

            var meta = entry.metadata;
            var opacity = CONFIG.defaultOpacity;

            if (typeof entry.opacity === "number") {
                opacity = entry.opacity;
            }

            function finish(source) {
                var layer = new ol.layer.Tile({
                    source: source,
                    visible: false,
                    opacity: opacity,
                    properties: {
                        stage16External: true,
                        stage16ExternalType: meta.type,
                        stage16ExternalBaseMap: true,
                        title: meta.title || meta.name
                    }
                });

                mapRef.addLayer(layer);

                var itemId = entry.id;
                if (!itemId) {
                    itemId = "stage16-" + Date.now();
                }

                var item = {
                    id: itemId,
                    layer: layer,
                    metadata: meta
                };

                layer.set("stage16Id", item.id);
                externalLayers.push(item);
                positionExternalLayer(layer);

                resolve(item);
            }

            // ---- XYZ ----
            if (meta.type === "XYZ") {
                finish(new ol.source.XYZ({
                    url: meta.url,
                    crossOrigin: "anonymous",
                    tileSize: CONFIG.tileSize,
                    transition: 0
                }));
                return;
            }

            // ---- WMS ----
            if (meta.type === "WMS") {
                finish(new ol.source.TileWMS({
                    url: meta.url,
                    params: {
                        LAYERS: meta.layer,
                        STYLES: "",
                        FORMAT: "image/png",
                        TRANSPARENT: true,
                        VERSION: meta.version || "1.1.1",
                        TILED: true
                    },
                    crossOrigin: "anonymous",
                    transition: 0
                }));
                return;
            }

            // ---- WMTS (needs capabilities again) ----
            if (meta.type === "WMTS") {
                fetchText(meta.url)
                    .then(function (text) {
                        var caps = new ol.format.WMTSCapabilities().read(text);
                        var opts = { layer: meta.layer };

                        if (meta.matrixSet) {
                            opts.matrixSet = meta.matrixSet;
                        }

                        var options = ol.source.WMTS.optionsFromCapabilities(caps, opts);

                        if (!options) {
                            throw new Error("WMTS options failed");
                        }

                        options.crossOrigin = "anonymous";
                        finish(new ol.source.WMTS(options));
                    })
                    .catch(reject);
                return;
            }

            reject(new Error("Unknown type: " + meta.type));
        });
    }

    // =========================================================
    // MAP OBSERVER
    // =========================================================
    function observeMapLayers() {
        try {
            mapRef.getLayers().on("add", function () {
                setTimeout(repositionAllExternalLayers, 50);
            });

            mapRef.getLayers().on("remove", function () {
                setTimeout(repositionAllExternalLayers, 50);
            });
        } catch (e) {
            // noop
        }
    }

    // =========================================================
    // PUBLIC API
    // =========================================================
    window.Stage16 = {
        open: openPanel,
        close: closePanel,
        toggle: togglePanel,
        addXYZ: addXYZLayer,
        getLayers: function () {
            return externalLayers.slice();
        },
        removeAll: function () {
            externalLayers.slice().forEach(removeExternalLayer);
        },
        repositionPanel: positionPanel
    };

    // =========================================================
    // INITIALIZE
    // =========================================================
    function initialize() {
        injectCSS();
        createButton();
        createPanel();
        closePanel();

        registerWithToolManager();
        bindGlobalEvents();

        waitForMap(function () {
            observeMapLayers();
            restoreExternalLayers();
            console.log("🌐 Stage 16 v4.2 — External Base Map Services READY.");
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize);
    } else {
        initialize();
    }

})();