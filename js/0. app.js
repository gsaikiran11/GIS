// ============================================================
// OPENLAYERS MAP
// STAGE 2 - LAYER MANAGER
// ============================================================

// ------------------------------------------------------------
// GITHUB SETTINGS
// ------------------------------------------------------------

const GITHUB_OWNER = "gsaikiran11";
const GITHUB_REPO = "webmapsurvey";
const GITHUB_BRANCH = "main";
const GITHUB_LAYER_FOLDER = "layers";

// ------------------------------------------------------------
// PROJECTIONS
// ------------------------------------------------------------

const DATA_PROJECTION = "EPSG:32643";   // UTM Zone 43N
const MAP_PROJECTION = "EPSG:3857";      // OpenLayers map

// ------------------------------------------------------------
// BASE LAYERS
// ------------------------------------------------------------

// OpenStreetMap
const osmLayer = new ol.layer.Tile({
    title: "OpenStreetMap",
    type: "base",
    visible: true,
    zIndex: -1000,
    source: new ol.source.XYZ({
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        attributions: '&copy; OpenStreetMap contributors'
    })
});

// Google Hybrid
const googleHybridLayer = new ol.layer.Tile({
    title: "Google Hybrid",
    type: "base",
    visible: false,
    zIndex: -1000,
    source: new ol.source.XYZ({
        url: "https://mt1.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}",
        attributions: "© Google"
    })
});

// ------------------------------------------------------------
// MAP
// ------------------------------------------------------------

const map = new ol.Map({

    target: "map",

    layers: [
        osmLayer,
        googleHybridLayer
    ],

    view: new ol.View({

        projection: MAP_PROJECTION,

        center: ol.proj.fromLonLat([
            78.0,
            15.8
        ]),

        zoom: 7

    }),

    controls: ol.control.defaults.defaults().extend([

        new ol.control.ScaleLine(),

        new ol.control.FullScreen()

    ])

});

// ------------------------------------------------------------
// VECTOR LAYER ARRAY
// ------------------------------------------------------------

let vectorLayers = [];

// ============================================================
// 🗂️ LAYER MANAGER v3.8 — SOLID WHITE BUTTON THEME
// ============================================================
// ✔ Solid White Button Background across all states (Idle, Hover, Open)
// ✔ Professional SVG Layers Stack Icon (inherits theme colors)
// ✔ Auto-saves layer order, opacity, visibility, and base map
// ✔ Local Folder Access via Native File System Access API
// ✔ Remembers folder access across browser reloads (IndexedDB)
// ✔ Delete (🗑️) button ONLY on local/imported layers
// ✔ Server layers always load fresh from 'layers/' directory
// ✔ Disconnect button clears local folder + resets
// ============================================================

(function () {

    "use strict";

    // --------------------------------------------------------
    // CLEANUP
    // --------------------------------------------------------
    [".layer-switcher", "#lm3-btn", "#lm3-panel", "#lm3-toast"].forEach(function (sel) {
        var el = document.querySelector(sel);
        if (el) el.remove();
    });
    var oldCss = document.getElementById("lm3-css");
    if (oldCss) oldCss.remove();

    // --------------------------------------------------------
    // CONFIG & STATE
    // --------------------------------------------------------
    var DB_NAME = "LM3_FileSystemDB";
    var DB_STORE = "folder_handles";
    var DB_KEY = "active_gis_folder";
    var STATE_KEY = "lm3-ui-state";

    var DATA_PROJ = typeof DATA_PROJECTION !== "undefined" ? DATA_PROJECTION : "EPSG:4326";
    var MAP_PROJ = typeof MAP_PROJECTION !== "undefined" ? MAP_PROJECTION : "EPSG:3857";

    var saveDebounceTmr = null;
    var pendingSave = false;

    // --------------------------------------------------------
    // CSS (Pure Light Theme with Solid White Trigger Button)
    // --------------------------------------------------------
    var css = document.createElement("style");
    css.id = "lm3-css";
    css.textContent = `
/* === TRIGGER BUTTON — Solid White Theme === */
#lm3-btn.layer-switcher {
    position: fixed; top: 78px; right: 12px;
    width: 44px; height: 44px;
    background: #ffffff !important; /* Strictly white */
    color: var(--ui-text, #1d2430);
    border: 1px solid var(--ui-border, #d7dce3);
    border-radius: 50%;
    box-shadow: 0 1px 4px rgba(16,24,40,0.16);
    cursor: pointer; z-index: 52000;
    display: flex; align-items: center; justify-content: center;
    -webkit-tap-highlight-color: transparent;
    user-select: none; box-sizing: border-box; padding: 0;
    transition: background .15s ease, border-color .15s ease, transform .15s ease, color .15s;
}
#lm3-btn.layer-switcher:hover {
    background: #f8fafc !important; /* Subtle off-white hover */
    border-color: var(--ui-accent, #1f6feb);
    color: var(--ui-accent, #1f6feb);
    transform: scale(1.08);
}
#lm3-btn.layer-switcher.open {
    background: #ffffff !important; /* Retains solid white background */
    border-color: var(--ui-accent, #1f6feb);
    color: var(--ui-accent, #1f6feb);
}
#lm3-btn svg {
    width: 20px; height: 20px;
    stroke: currentColor;
    fill: none;
    transition: stroke 0.15s;
    pointer-events: none;
}
#lm3-btn-badge {
    position: absolute; top: -4px; right: -4px;
    background: #ef4444; color: #fff; font-size: 9px; font-weight: 800;
    padding: 2px 6px; border-radius: 10px; min-width: 18px;
    text-align: center; line-height: 1.3;
    box-shadow: 0 1px 3px rgba(0,0,0,.25);
    font-family: -apple-system, system-ui, sans-serif; pointer-events: none;
}

/* === FLOATING PANEL === */
#lm3-panel {
    position: fixed; width: 320px; max-width: calc(100vw - 20px);
    max-height: calc(100vh - 100px);
    background: #fff; border: 1px solid #dce1e8; border-radius: 12px;
    box-shadow: 0 10px 36px rgba(0,0,0,.18), 0 2px 6px rgba(0,0,0,.08);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    font-size: 12px; color: #1e293b; z-index: 52500; box-sizing: border-box;
    display: none; flex-direction: column; overflow: hidden;
    user-select: none; animation: lm3-in .18s ease;
}
#lm3-panel.show { display: flex; }
#lm3-panel * { box-sizing: border-box; }
@keyframes lm3-in {
    from { opacity: 0; transform: translateY(-6px) scale(.98); }
    to { opacity: 1; transform: translateY(0) scale(1); }
}

.lm3-ph {
    display: flex; align-items: center; gap: 9px;
    padding: 11px 13px; background: #f8fafc;
    border-bottom: 1px solid #e2e8f0; flex-shrink: 0; min-height: 46px;
    position: relative;
}
.lm3-ph svg {
    width: 18px; height: 18px;
    stroke: #1f6feb;
    fill: none;
}
.lm3-ph-title { flex: 1; font-size: 14px; font-weight: 700; color: #0f172a; letter-spacing: -.01em; }
.lm3-ph-n {
    font-size: 10px; font-weight: 700; color: #fff; background: #1f6feb;
    padding: 2px 8px; border-radius: 10px; min-width: 22px;
    text-align: center; line-height: 1.4;
}
.lm3-ph-close {
    width: 28px; height: 28px; border: none; background: transparent;
    cursor: pointer; font-size: 18px; color: #64748b; border-radius: 6px;
    display: flex; align-items: center; justify-content: center; line-height: 1;
    -webkit-tap-highlight-color: transparent; transition: all .12s;
}
.lm3-ph-close:hover { background: #e2e8f0; color: #0f172a; }

/* AUTO-SAVE INDICATOR */
.lm3-savedot {
    position: absolute; bottom: 4px; right: 44px;
    font-size: 9px; font-weight: 700; color: #16a34a;
    opacity: 0; transition: opacity .2s;
    pointer-events: none;
    display: flex; align-items: center; gap: 3px;
}
.lm3-savedot.show { opacity: 1; }

/* TOOLBAR */
.lm3-tb {
    display: flex; gap: 5px; padding: 7px 10px;
    background: #fff; border-bottom: 1px solid #e2e8f0; flex-shrink: 0;
}
.lm3-tb-btn {
    flex: 1; min-height: 32px; padding: 6px 8px;
    border: 1px solid #e2e8f0; border-radius: 7px;
    background: #fff; color: #475569;
    font-size: 11px; font-weight: 700; cursor: pointer;
    display: flex; align-items: center; justify-content: center; gap: 4px;
    transition: all .12s; -webkit-tap-highlight-color: transparent;
    white-space: nowrap; font-family: inherit;
}
.lm3-tb-btn:hover { background: #f1f5f9; border-color: #cbd5e1; color: #0f172a; }
.lm3-tb-btn:active { transform: scale(.97); }
.lm3-tb-btn.primary { background: #2563eb; border-color: #2563eb; color: #fff; }
.lm3-tb-btn.primary:hover { background: #1d4ed8; color: #fff; }
.lm3-tb-btn.danger { color: #dc2626; border-color: #fecaca; }
.lm3-tb-btn.danger:hover { background: #fef2f2; border-color: #dc2626; }
.lm3-tb-btn:disabled { opacity: .4; cursor: default; pointer-events: none; }

.lm3-fbar {
    padding:6px 12px; background:#eff6ff;
    border-bottom: 1px solid #bfdbfe;
    font-size:10px; font-weight:600; color:#1e40af;
    display:none; align-items:center; justify-content:space-between;
    flex-shrink:0; line-height:1.4;
}
.lm3-fbar.show { display: flex; }
.lm3-fbar-name {
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px;
}

.lm3-scroll {
    flex: 1; overflow-y: auto;
    -webkit-overflow-scrolling: touch; overscroll-behavior: contain;
    scrollbar-width: thin; scrollbar-color: #cbd5e1 transparent;
}
.lm3-scroll::-webkit-scrollbar { width: 6px; }
.lm3-scroll::-webkit-scrollbar-track { background: transparent; }
.lm3-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }

/* SECTIONS */
.lm3-sh {
    display: flex; align-items: center; gap: 6px;
    padding: 8px 13px; background: #f8fafc;
    border-bottom: 1px solid #e2e8f0;
    font-size: 10px; font-weight: 800; color: #64748b;
    text-transform: uppercase; letter-spacing: .06em;
    position: sticky; top: 0; z-index: 2; cursor: pointer;
    -webkit-tap-highlight-color: transparent; transition: background .1s;
}
.lm3-sh:hover { background: #f1f5f9; }
.lm3-sh-chev {
    font-size: 8px; color: #94a3b8; transition: transform .2s;
    width: 12px; display: flex; align-items: center; justify-content: center;
}
.lm3-sh.closed .lm3-sh-chev { transform: rotate(-90deg); }
.lm3-sh-title { flex: 1; }
.lm3-sh-cnt { font-size: 10px; font-weight: 700; color: #94a3b8; }
.lm3-sh-btn {
    width: 24px; height: 24px; border: none; background: transparent;
    cursor: pointer; font-size: 12px; color: #94a3b8; border-radius: 5px;
    display: flex; align-items: center; justify-content: center;
    -webkit-tap-highlight-color: transparent; transition: all .12s;
}
.lm3-sh-btn:hover { background: #e2e8f0; color: #0f172a; }

.lm3-sb { display: flex; flex-direction: column; }
.lm3-sh.closed + .lm3-sb { display: none; }

/* BASE MAP ROW */
.lm3-br {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 15px; cursor: pointer;
    border-bottom: 1px solid #f1f5f9; min-height: 42px;
    -webkit-tap-highlight-color: transparent; transition: background .1s;
}
.lm3-br:hover { background: #f8fafc; }
.lm3-br.on { background: #eff6ff; }
.lm3-br:last-child { border-bottom: none; }
.lm3-dot {
    width: 16px; height: 16px; border: 2px solid #cbd5e1; border-radius: 50%;
    flex-shrink: 0; display: flex; align-items: center; justify-content: center;
    transition: border-color .15s;
}
.lm3-br.on .lm3-dot { border-color: #1f6feb; }
.lm3-br.on .lm3-dot::after {
    content: ''; width: 8px; height: 8px; background: #1f6feb; border-radius: 50%;
}
.lm3-br-name { flex: 1; font-size: 12.5px; font-weight: 600; color: #1e293b; }

/* VECTOR ROW */
.lm3-vr {
    display: flex; flex-direction: column;
    padding: 8px 8px 8px 11px;
    border-bottom: 1px solid #f1f5f9; background: #fff; transition: background .1s;
}
.lm3-vr:last-child { border-bottom: none; }
.lm3-vr:hover { background: #fafbfd; }
.lm3-vr.off { opacity: .5; }
.lm3-vr.off:hover { opacity: .7; }
.lm3-vr-top { display: flex; align-items: center; gap: 6px; }

.lm3-eye {
    width: 26px; height: 26px; border: none; background: transparent;
    cursor: pointer; font-size: 13px; color: #b0b8c4; border-radius: 6px;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    -webkit-tap-highlight-color: transparent; transition: all .12s;
}
.lm3-eye:hover { background: #f1f5f9; }
.lm3-eye:active { transform: scale(.9); }
.lm3-eye.on { color: #1f6feb; }

.lm3-vr-info { flex: 1; min-width: 0; }
.lm3-vr-name {
    font-size: 12px; font-weight: 700; color: #0f172a;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.35;
}
.lm3-vr-meta {
    font-size: 9px; color: #94a3b8; font-weight: 600;
    margin-top: 1px; letter-spacing: .02em;
    display: flex; align-items: center; gap: 4px;
}
.lm3-tag {
    padding: 1px 4px; border-radius: 3px; font-size: 8px; font-weight: 800;
}
.lm3-tag.local { background: #dbeafe; color: #1e40af; }
.lm3-tag.server { background: #f1f5f9; color: #475569; }

.lm3-btns { display: flex; gap: 1px; flex-shrink: 0; }
.lm3-b {
    width: 24px; height: 24px; border: none; background: transparent;
    cursor: pointer; font-size: 10.5px; color: #94a3b8; border-radius: 5px;
    display: flex; align-items: center; justify-content: center;
    -webkit-tap-highlight-color: transparent; transition: all .12s;
}
.lm3-b:hover { background: #f1f5f9; color: #1e293b; }
.lm3-b:active { transform: scale(.88); }
.lm3-b:disabled { opacity: .2; cursor: default; pointer-events: none; }
.lm3-b.del:hover { background: #fef2f2; color: #dc2626; }

/* OPACITY */
.lm3-op { display: none; align-items: center; gap: 8px; padding: 6px 2px 2px 32px; }
.lm3-op.show { display: flex; }
.lm3-op input[type="range"] {
    flex: 1; height: 14px; cursor: pointer;
    -webkit-appearance: none; appearance: none; background: transparent;
}
.lm3-op input[type="range"]::-webkit-slider-runnable-track {
    height: 4px; background: #e2e8f0; border-radius: 2px;
}
.lm3-op input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none; width: 14px; height: 14px;
    background: #1f6feb; border-radius: 50%; margin-top: -5px;
    cursor: pointer; box-shadow: 0 1px 3px rgba(31,111,235,.3);
}
.lm3-op input[type="range"]::-moz-range-track {
    height: 4px; background: #e2e8f0; border-radius: 2px; border: none;
}
.lm3-op input[type="range"]::-moz-range-thumb {
    width: 14px; height: 14px; background: #1f6feb;
    border-radius: 50%; cursor: pointer; border: none;
}
.lm3-op-val {
    font-size: 10px; font-weight: 700; color: #64748b;
    min-width: 30px; text-align: right; font-variant-numeric: tabular-nums;
}

.lm3-empty {
    padding: 20px 14px; text-align: center;
    color: #b0b8c4; font-size: 11.5px; font-style: italic;
}

#lm3-toast {
    position: fixed; bottom: 80px; left: 50%;
    transform: translateX(-50%) translateY(10px);
    background: #0f172a; color: #fff;
    font-weight: 700; font-size: 11.5px;
    padding: 9px 18px; border-radius: 8px;
    box-shadow: 0 6px 20px rgba(0,0,0,.28);
    z-index: 61000; opacity: 0;
    transition: opacity .2s, transform .2s;
    pointer-events: none;
    font-family: -apple-system, system-ui, sans-serif;
    white-space: nowrap; max-width: 90vw; overflow: hidden; text-overflow: ellipsis;
}
#lm3-toast.sh { opacity: 1; transform: translateX(-50%) translateY(0); }

@media (max-width: 640px) {
    #lm3-panel { width: calc(100vw - 20px); }
    .lm3-ph { min-height: 50px; padding: 12px 15px; }
    .lm3-ph-title { font-size: 15px; }
    .lm3-ph-close { width: 34px; height: 34px; font-size: 20px; }
    .lm3-tb-btn { min-height: 38px; font-size: 12px; }
    .lm3-br { min-height: 46px; padding: 12px 15px; }
    .lm3-vr { padding: 10px 8px 10px 11px; }
    .lm3-eye { width: 30px; height: 30px; font-size: 15px; }
    .lm3-b { width: 28px; height: 28px; font-size: 12px; }
    .lm3-vr-name { font-size: 13px; }
}
    `;
    document.head.appendChild(css);

    // --------------------------------------------------------
    // SVG VECTOR LAYERS STACK ICON
    // --------------------------------------------------------
    var LAYERS_SVG_MARKUP = [
        '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">',
        '  <polygon points="12 2 2 7 12 12 22 7 12 2"/>',
        '  <polyline points="2 17 12 22 22 17"/>',
        '  <polyline points="2 12 12 17 22 12"/>',
        '</svg>'
    ].join("");

    // --------------------------------------------------------
    // BUILD TRIGGER BUTTON
    // --------------------------------------------------------
    var btn = document.createElement("button");
    btn.id = "lm3-btn";
    btn.className = "layer-switcher";
    btn.type = "button";
    btn.title = "Layers";
    btn.innerHTML = LAYERS_SVG_MARKUP + '<span id="lm3-btn-badge">0</span>';
    document.body.appendChild(btn);

    var badgeEl = document.getElementById("lm3-btn-badge");

    // --------------------------------------------------------
    // BUILD PANEL
    // --------------------------------------------------------
    var panel = document.createElement("div");
    panel.id = "lm3-panel";
    panel.innerHTML = [
        '<div class="lm3-ph">',
        '  <span class="lm3-ph-icon">' + LAYERS_SVG_MARKUP + '</span>',
        '  <span class="lm3-ph-title">Layers</span>',
        '  <span class="lm3-ph-n" id="lm3n">0</span>',
        '  <button type="button" class="lm3-ph-close" id="lm3close" title="Close">×</button>',
        '  <span class="lm3-savedot" id="lm3savedot">⚙ saved</span>',
        '</div>',
        '<div class="lm3-tb">',
        '  <button type="button" class="lm3-tb-btn primary" id="lm3openfolder">📁 Open Folder</button>',
        '  <button type="button" class="lm3-tb-btn danger" id="lm3clearfolder" disabled>🧹 Disconnect</button>',
        '</div>',
        '<div class="lm3-fbar" id="lm3fbar">',
        '  <span class="lm3-fbar-name" id="lm3fname">📁 Connected Folder</span>',
        '  <span style="font-size:9px;color:#2563eb;cursor:pointer;" id="lm3reloadfolder">🔄 Reload</span>',
        '</div>',
        '<div class="lm3-scroll" id="lm3sc"></div>'
    ].join("");
    document.body.appendChild(panel);

    var countEl = document.getElementById("lm3n");
    var scrollEl = document.getElementById("lm3sc");
    var closeBtn = document.getElementById("lm3close");
    var openFolderBtn = document.getElementById("lm3openfolder");
    var clearFolderBtn = document.getElementById("lm3clearfolder");
    var fbarEl = document.getElementById("lm3fbar");
    var fnameEl = document.getElementById("lm3fname");
    var reloadFolderBtn = document.getElementById("lm3reloadfolder");
    var saveDotEl = document.getElementById("lm3savedot");

    var toast = document.createElement("div");
    toast.id = "lm3-toast";
    document.body.appendChild(toast);

    var toastTmr = null;
    function showToast(m) {
        clearTimeout(toastTmr);
        toast.textContent = m;
        toast.classList.add("sh");
        toastTmr = setTimeout(function () { toast.classList.remove("sh"); }, 2600);
    }

    // ========================================================
    // AUTO-SAVE STATE SYSTEM
    // ========================================================

    function captureState() {
        var state = {
            v: 1,
            savedAt: Date.now(),
            base: null,
            layers: []
        };

        if (typeof osmLayer !== "undefined" && osmLayer.getVisible()) {
            state.base = "osm";
        } else if (typeof googleHybridLayer !== "undefined" && googleHybridLayer.getVisible()) {
            state.base = "google";
        }

        vectorLayers.forEach(function (l, idx) {
            state.layers.push({
                name: lName(l),
                visible: l.getVisible(),
                opacity: l.getOpacity(),
                order: idx
            });
        });

        return state;
    }

    function autoSave() {
        clearTimeout(saveDebounceTmr);
        pendingSave = true;
        saveDebounceTmr = setTimeout(function () {
            try {
                var state = captureState();
                localStorage.setItem(STATE_KEY, JSON.stringify(state));
                pendingSave = false;
                flashSaveDot();
            } catch (e) {
                console.warn("lm3: autosave failed", e);
                pendingSave = false;
            }
        }, 300);
    }

    function flashSaveDot() {
        if (!saveDotEl) return;
        saveDotEl.classList.add("show");
        setTimeout(function () {
            saveDotEl.classList.remove("show");
        }, 900);
    }

    function readSavedState() {
        try {
            var raw = localStorage.getItem(STATE_KEY);
            if (!raw) return null;
            var parsed = JSON.parse(raw);
            if (!parsed || !Array.isArray(parsed.layers)) return null;
            return parsed;
        } catch (e) {
            try { localStorage.removeItem(STATE_KEY); } catch (e2) {}
            return null;
        }
    }

    function applySavedState() {
        var state = readSavedState();
        if (!state) return false;

        if (state.base === "osm") {
            if (typeof osmLayer !== "undefined") osmLayer.setVisible(true);
            if (typeof googleHybridLayer !== "undefined") googleHybridLayer.setVisible(false);
        } else if (state.base === "google") {
            if (typeof osmLayer !== "undefined") osmLayer.setVisible(false);
            if (typeof googleHybridLayer !== "undefined") googleHybridLayer.setVisible(true);
        }

        if (state.layers && state.layers.length) {
            var orderMap = {};
            state.layers.forEach(function (sl, i) {
                orderMap[sl.name] = { order: typeof sl.order === "number" ? sl.order : i, visible: sl.visible, opacity: sl.opacity };
            });

            vectorLayers.forEach(function (l) {
                var saved = orderMap[lName(l)];
                if (!saved) return;
                if (typeof saved.visible === "boolean") l.setVisible(saved.visible);
                if (typeof saved.opacity === "number") l.setOpacity(saved.opacity);
            });

            vectorLayers.sort(function (a, b) {
                var sa = orderMap[lName(a)];
                var sb = orderMap[lName(b)];
                var oa = sa ? sa.order : 9999;
                var ob = sb ? sb.order : 9999;
                return oa - ob;
            });

            rebuildMap();
        }

        return true;
    }

    // ========================================================
    // INDEXEDDB — FOLDER HANDLE PERSISTENCE
    // ========================================================
    function openIDB() {
        return new Promise(function (resolve, reject) {
            var req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = function (e) {
                var db = e.target.result;
                if (!db.objectStoreNames.contains(DB_STORE)) {
                    db.createObjectStore(DB_STORE);
                }
            };
            req.onsuccess = function (e) { resolve(e.target.result); };
            req.onerror = function (e) { reject(e); };
        });
    }
    async function storeDirectoryHandle(handle) {
        try {
            var db = await openIDB();
            var tx = db.transaction(DB_STORE, "readwrite");
            tx.objectStore(DB_STORE).put(handle, DB_KEY);
            return true;
        } catch (e) { return false; }
    }
    async function getStoredDirectoryHandle() {
        try {
            var db = await openIDB();
            return new Promise(function (resolve) {
                var tx = db.transaction(DB_STORE, "readonly");
                var req = tx.objectStore(DB_STORE).get(DB_KEY);
                req.onsuccess = function () { resolve(req.result || null); };
                req.onerror = function () { resolve(null); };
            });
        } catch (e) { return null; }
    }
    async function removeStoredDirectoryHandle() {
        try {
            var db = await openIDB();
            var tx = db.transaction(DB_STORE, "readwrite");
            tx.objectStore(DB_STORE).delete(DB_KEY);
            return true;
        } catch (e) { return false; }
    }

    // ========================================================
    // LOCAL FOLDER ACCESS
    // ========================================================
    async function pickLocalFolder() {
        if (!('showDirectoryPicker' in window)) {
            alert("Your browser doesn't support the File System Access API.\nUse Chrome, Edge, or Brave.");
            return;
        }
        try {
            var dirHandle = await window.showDirectoryPicker({ mode: "read" });
            if (!dirHandle) return;
            await storeDirectoryHandle(dirHandle);
            showToast("📂 Loading from: " + dirHandle.name);
            await loadLayersFromDirectoryHandle(dirHandle);
            autoSave();
        } catch (err) {
            if (err.name !== "AbortError") {
                console.error(err);
                showToast("❌ Could not open folder");
            }
        }
    }

    async function verifyPermission(handle) {
        var opts = { mode: 'read' };
        if ((await handle.queryPermission(opts)) === 'granted') return true;
        if ((await handle.requestPermission(opts)) === 'granted') return true;
        return false;
    }

    async function loadLayersFromDirectoryHandle(dirHandle) {
        try {
            if (!(await verifyPermission(dirHandle))) {
                showToast("⚠ Permission denied");
                return;
            }
            fnameEl.textContent = "📁 " + dirHandle.name;
            fbarEl.classList.add("show");
            clearFolderBtn.disabled = false;

            var format = new ol.format.GeoJSON({
                dataProjection: DATA_PROJ,
                featureProjection: MAP_PROJ
            });
            var count = 0;

            for await (var entry of dirHandle.values()) {
                if (entry.kind === "file" && entry.name.toLowerCase().endsWith(".geojson")) {
                    var layerName = entry.name.replace(/\.geojson$/i, "");
                    if (vectorLayers.some(function (l) { return lName(l) === layerName; })) continue;

                    var file = await entry.getFile();
                    var text = await file.text();
                    var geojson = JSON.parse(text);
                    var features = format.readFeatures(geojson);
                    var src = new ol.source.Vector({ features: features });

                    var layer = new ol.layer.Vector({ source: src, visible: true });
                    layer.set("title", layerName);
                    layer.set("name", layerName);
                    layer.set("isLocal", true);
                    vectorLayers.push(layer);
                    count++;
                }
            }

            if (count > 0) {
                rebuildMap();
                applySavedState();
                render();
                showToast("✓ Loaded " + count + " local layers");
            } else {
                showToast("ℹ No new .geojson files found");
            }
        } catch (e) {
            console.error(e);
            showToast("❌ Failed to read folder");
        }
    }

    async function disconnectFolder() {
        if (!confirm("Disconnect local folder?\n\nAll local layers will be removed. Server layers will remain.")) return;
        await removeStoredDirectoryHandle();
        var remaining = [];
        vectorLayers.forEach(function (layer) {
            if (layer.get("isLocal") === true || layer.get("imported") === true) {
                try { map.removeLayer(layer); } catch (e) {}
                try { layer.getSource().clear(true); } catch (e) {}
            } else {
                remaining.push(layer);
            }
        });
        vectorLayers.length = 0;
        remaining.forEach(function (l) { vectorLayers.push(l); });
        fbarEl.classList.remove("show");
        clearFolderBtn.disabled = true;
        rebuildMap();
        render();
        autoSave();
        showToast("🧹 Folder disconnected");
    }

    openFolderBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        pickLocalFolder();
    });
    clearFolderBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        disconnectFolder();
    });
    reloadFolderBtn.addEventListener("click", async function (e) {
        e.stopPropagation();
        var handle = await getStoredDirectoryHandle();
        if (handle) await loadLayersFromDirectoryHandle(handle);
        else showToast("⚠ No active folder");
    });

    // --------------------------------------------------------
    // HELPERS
    // --------------------------------------------------------
    function lName(l) {
        return l.get("title") || l.get("name") || "Unnamed";
    }
    function fCount(l) {
        try { return l.getSource().getFeatures().length; }
        catch (e) { return 0; }
    }
    function isLocalLayer(l) {
        return l.get("isLocal") === true || l.get("imported") === true;
    }
    function mkBtn(text, title, cls) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "lm3-b" + (cls ? " " + cls : "");
        b.textContent = text;
        b.title = title;
        return b;
    }

    // --------------------------------------------------------
    // DELETE LAYER (ONLY LOCAL/IMPORTED)
    // --------------------------------------------------------
    function deleteLayer(layer) {
        var name = lName(layer);
        var idx = vectorLayers.indexOf(layer);
        if (idx === -1) {
            showToast("⚠ Not found");
            render();
            return;
        }
        if (!window.confirm('Remove "' + name + '" from map view?')) return;
        vectorLayers.splice(idx, 1);
        try { map.removeLayer(layer); } catch (e) {}
        try {
            var src = layer.getSource();
            if (src && typeof src.clear === "function") src.clear(true);
        } catch (e) {}
        render();
        autoSave();
        showToast("🗑️ Removed: " + name);
    }

    // --------------------------------------------------------
    // RENDER
    // --------------------------------------------------------
    function render() {
        scrollEl.innerHTML = "";
        renderBase();
        renderVector();
        var n = vectorLayers.length;
        countEl.textContent = String(n);
        badgeEl.textContent = String(n);
        badgeEl.style.display = n > 0 ? "block" : "none";
        if (isOpen) requestAnimationFrame(positionPanel);
    }

    function renderBase() {
        var sh = document.createElement("div");
        sh.className = "lm3-sh";
        sh.innerHTML = '<span class="lm3-sh-chev">▶</span><span class="lm3-sh-title">Base Maps</span>';
        sh.addEventListener("click", function () { sh.classList.toggle("closed"); });
        scrollEl.appendChild(sh);

        var sb = document.createElement("div");
        sb.className = "lm3-sb";

        var bases = [];
        if (typeof osmLayer !== "undefined") bases.push({ layer: osmLayer, name: "OpenStreetMap" });
        if (typeof googleHybridLayer !== "undefined") bases.push({ layer: googleHybridLayer, name: "Google Hybrid" });

        bases.forEach(function (b) {
            var row = document.createElement("div");
            row.className = "lm3-br" + (b.layer.getVisible() ? " on" : "");
            row.innerHTML = '<div class="lm3-dot"></div><div class="lm3-br-name">' + b.name + '</div>';
            row.addEventListener("click", function () {
                bases.forEach(function (bb) { bb.layer.setVisible(false); });
                b.layer.setVisible(true);
                render();
                autoSave();
            });
            sb.appendChild(row);
        });
        scrollEl.appendChild(sb);
    }

    function renderVector() {
        var sh = document.createElement("div");
        sh.className = "lm3-sh";
        sh.innerHTML = [
            '<span class="lm3-sh-chev">▶</span>',
            '<span class="lm3-sh-title">Map Layers</span>',
            '<span class="lm3-sh-cnt">' + vectorLayers.length + '</span>',
            '<button type="button" class="lm3-sh-btn" id="lm3ta" title="Toggle all">👁</button>'
        ].join("");
        sh.addEventListener("click", function (e) {
            if (e.target.closest("#lm3ta")) return;
            sh.classList.toggle("closed");
        });
        scrollEl.appendChild(sh);

        sh.querySelector("#lm3ta").addEventListener("click", function (e) {
            e.stopPropagation();
            var allVis = vectorLayers.every(function (l) { return l.getVisible(); });
            vectorLayers.forEach(function (l) { l.setVisible(!allVis); });
            render();
            autoSave();
        });

        var sb = document.createElement("div");
        sb.className = "lm3-sb";

        if (vectorLayers.length === 0) {
            sb.innerHTML = '<div class="lm3-empty">No layers loaded</div>';
        } else {
            vectorLayers.forEach(function (layer, idx) {
                sb.appendChild(buildRow(layer, idx));
            });
        }
        scrollEl.appendChild(sb);
    }

    function buildRow(layer, idx) {
        var vis = layer.getVisible();
        var op = Math.round(layer.getOpacity() * 100);
        var fc = fCount(layer);
        var name = lName(layer);
        var isLocal = isLocalLayer(layer);

        var row = document.createElement("div");
        row.className = "lm3-vr" + (vis ? "" : " off");

        var top = document.createElement("div");
        top.className = "lm3-vr-top";

        // Eye toggle
        var eye = document.createElement("button");
        eye.type = "button";
        eye.className = "lm3-eye" + (vis ? " on" : "");
        eye.textContent = vis ? "👁" : "🚫";
        eye.title = vis ? "Hide" : "Show";
        eye.addEventListener("click", function (e) {
            e.stopPropagation();
            layer.setVisible(!layer.getVisible());
            render();
            autoSave();
        });

        var tagHtml = isLocal
            ? '<span class="lm3-tag local">LOCAL</span>'
            : '<span class="lm3-tag server">SERVER</span>';

        var info = document.createElement("div");
        info.className = "lm3-vr-info";
        info.innerHTML =
            '<div class="lm3-vr-name" title="' + name + '">' + name + '</div>' +
            '<div class="lm3-vr-meta">' +
                '<span>' + fc + ' feature' + (fc !== 1 ? 's' : '') + '</span>' +
                tagHtml +
            '</div>';

        var btns = document.createElement("div");
        btns.className = "lm3-btns";

        var zb = mkBtn("🔍", "Zoom to layer");
        zb.addEventListener("click", function (e) {
            e.stopPropagation();
            zoomTo(layer);
        });

        var ub = mkBtn("↑", "Move up");
        if (idx === 0) ub.disabled = true;
        ub.addEventListener("click", function (e) {
            e.stopPropagation();
            swap(idx, idx - 1);
        });

        var db = mkBtn("↓", "Move down");
        if (idx === vectorLayers.length - 1) db.disabled = true;
        db.addEventListener("click", function (e) {
            e.stopPropagation();
            swap(idx, idx + 1);
        });

        var ob = mkBtn("◐", "Opacity");
        ob.addEventListener("click", function (e) {
            e.stopPropagation();
            var opRow = row.querySelector(".lm3-op");
            opRow.classList.toggle("show");
            if (isOpen) requestAnimationFrame(positionPanel);
        });

        btns.appendChild(zb);
        btns.appendChild(ub);
        btns.appendChild(db);
        btns.appendChild(ob);

        if (isLocal) {
            var delb = mkBtn("🗑️", "Remove local layer", "del");
            delb.addEventListener("click", function (e) {
                e.preventDefault();
                e.stopPropagation();
                deleteLayer(layer);
            });
            btns.appendChild(delb);
        }

        top.appendChild(eye);
        top.appendChild(info);
        top.appendChild(btns);
        row.appendChild(top);

        var opRow = document.createElement("div");
        opRow.className = "lm3-op";
        var slider = document.createElement("input");
        slider.type = "range";
        slider.min = "0";
        slider.max = "100";
        slider.value = String(op);
        var valSpan = document.createElement("span");
        valSpan.className = "lm3-op-val";
        valSpan.textContent = op + "%";

        slider.addEventListener("input", function () {
            var v = parseInt(slider.value, 10);
            layer.setOpacity(v / 100);
            valSpan.textContent = v + "%";
            autoSave();
        });
        slider.addEventListener("click", function (e) { e.stopPropagation(); });

        opRow.appendChild(slider);
        opRow.appendChild(valSpan);
        row.appendChild(opRow);

        return row;
    }

    function zoomTo(layer) {
        var src = layer.getSource();
        if (!src) return;
        var ext = src.getExtent();
        if (!ext || ext[0] === Infinity) {
            showToast("⚠ Empty layer");
            return;
        }
        map.getView().fit(ext, {
            padding: [60, 60, 60, 60],
            duration: 600,
            maxZoom: 19
        });
    }

    function swap(i, j) {
        if (j < 0 || j >= vectorLayers.length) return;
        var tmp = vectorLayers[i];
        vectorLayers[i] = vectorLayers[j];
        vectorLayers[j] = tmp;
        rebuildMap();
        render();
        autoSave();
    }

    function rebuildMap() {
        vectorLayers.forEach(function (l) {
            try { map.removeLayer(l); } catch (e) {}
        });
        for (var i = vectorLayers.length - 1; i >= 0; i--) {
            map.addLayer(vectorLayers[i]);
        }
    }

    // --------------------------------------------------------
    // PANEL POSITION & TOGGLE LOGIC
    // --------------------------------------------------------
    function positionPanel() {
        var r = btn.getBoundingClientRect();
        var vw = window.innerWidth, vh = window.innerHeight;
        var pw = panel.offsetWidth || 320;
        var ph = Math.min(panel.scrollHeight || 400, vh - 100);
        var gap = 8, left, top;

        if (r.right - pw >= 10) left = r.right - pw;
        else if (r.left + pw <= vw - 10) left = r.left;
        else left = Math.max(10, Math.min(vw - pw - 10, r.left));

        if (vh - r.bottom >= ph + gap) top = r.bottom + gap;
        else if (r.top >= ph + gap) top = r.top - ph - gap;
        else top = Math.max(10, Math.min(vh - ph - 10, r.bottom + gap));

        if (vw <= 640) {
            left = 10;
            top = Math.max(10, Math.min(vh - ph - 10, r.bottom + gap));
        }

        panel.style.left = left + "px";
        panel.style.top = top + "px";
    }

    var isOpen = false;
    function openPanel() {
        isOpen = true;
        btn.classList.add("open");
        panel.classList.add("show");
        requestAnimationFrame(positionPanel);
    }
    function closePanel() {
        isOpen = false;
        btn.classList.remove("open");
        panel.classList.remove("show");
    }

    btn.addEventListener("click", function (e) {
        e.stopPropagation();
        if (isOpen) closePanel(); else openPanel();
    });
    closeBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        closePanel();
    });
    document.addEventListener("click", function (e) {
        if (!isOpen) return;
        if (e.target.closest("#lm3-panel")) return;
        if (e.target.closest("#lm3-btn")) return;
        closePanel();
    });
    window.addEventListener("resize", function () {
        if (isOpen) positionPanel();
    });
    new MutationObserver(function () {
        if (isOpen) positionPanel();
    }).observe(btn, { attributes: true, attributeFilter: ["style", "class"] });

    window.addEventListener("beforeunload", function () {
        if (pendingSave) {
            try {
                var state = captureState();
                localStorage.setItem(STATE_KEY, JSON.stringify(state));
            } catch (e) {}
        }
    });

    // ========================================================
    // SERVER GEOJSON AUTO-LOADER
    // ========================================================
    async function loadGeoJSON(fileUrl, layerName) {
        try {
            if (vectorLayers.some(function (l) { return lName(l) === layerName; })) return null;

            var response = await fetch(fileUrl);
            if (!response.ok) throw new Error("HTTP " + response.status);
            var geojson = await response.json();
            var format = new ol.format.GeoJSON({
                dataProjection: DATA_PROJ,
                featureProjection: MAP_PROJ
            });
            var features = format.readFeatures(geojson);
            var source = new ol.source.Vector({ features: features });
            var layer = new ol.layer.Vector({ source: source, visible: false });
            layer.set("title", layerName);
            layer.set("name", layerName);
            layer.set("file", fileUrl);
            layer.set("isServer", true);
            layer.set("isLocal", false);
            vectorLayers.push(layer);
            rebuildMap();
            render();
            return layer;
        } catch (error) {
            console.error(error);
            return null;
        }
    }

    async function getLocalGeoJSONFiles() {
        try {
            var response = await fetch("layers/");
            if (!response.ok) throw new Error();
            var html = await response.text();
            var doc = new DOMParser().parseFromString(html, "text/html");
            return [...new Set(Array.from(doc.querySelectorAll("a"))
                .map(function (a) { return a.getAttribute("href"); })
                .filter(function (h) { return h && h.toLowerCase().endsWith(".geojson"); }))];
        } catch (e) { return []; }
    }
    async function getGitHubGeoJSONFiles() {
        try {
            var url = "https://api.github.com/repos/" + GITHUB_OWNER + "/" +
                GITHUB_REPO + "/contents/" + GITHUB_LAYER_FOLDER + "?ref=" + GITHUB_BRANCH;
            var response = await fetch(url);
            if (!response.ok) throw new Error();
            var files = await response.json();
            return files
                .filter(function (f) { return f.type === "file" && f.name.toLowerCase().endsWith(".geojson"); })
                .map(function (f) { return { name: f.name, url: f.download_url }; });
        } catch (e) { return []; }
    }

    async function initLayers() {
        var host = window.location.hostname;
        if (host.endsWith("github.io")) {
            var ghFiles = await getGitHubGeoJSONFiles();
            for (var f of ghFiles) {
                await loadGeoJSON(f.url, f.name.replace(/\.geojson$/i, ""));
            }
        } else {
            var localFiles = await getLocalGeoJSONFiles();
            for (var lf of localFiles) {
                var fn = lf.split("/").pop();
                await loadGeoJSON("layers/" + fn, fn.replace(/\.geojson$/i, ""));
            }
        }

        var savedHandle = await getStoredDirectoryHandle();
        if (savedHandle) {
            fnameEl.textContent = "📁 " + savedHandle.name;
            fbarEl.classList.add("show");
            clearFolderBtn.disabled = false;
            if ((await savedHandle.queryPermission({ mode: 'read' })) === 'granted') {
                await loadLayersFromDirectoryHandle(savedHandle);
            } else {
                showToast("👉 Click '🔄 Reload' to re-enable folder");
            }
        }

        applySavedState();
        render();

        if (vectorLayers.length > 0) {
            var firstSrc = vectorLayers[0].getSource();
            if (firstSrc) {
                var ext = firstSrc.getExtent();
                if (ext && ext[0] !== Infinity) {
                    map.getView().fit(ext, {
                        padding: [50, 50, 50, 50],
                        duration: 800,
                        maxZoom: 18
                    });
                }
            }
        }
    }

    // ========================================================
    // PUBLIC API
    // ========================================================
    window.createLayerSwitcher = function () {};
    window.createBaseLayerControls = function () { render(); };
    window.addOverlayToSwitcher = function () { render(); autoSave(); };
    window.zoomToLayer = zoomTo;
    window.moveLayerUp = function (l) {
        var i = vectorLayers.indexOf(l);
        if (i > 0) swap(i, i - 1);
    };
    window.moveLayerDown = function (l) {
        var i = vectorLayers.indexOf(l);
        if (i < vectorLayers.length - 1) swap(i, i + 1);
    };
    window.rebuildMapOrder = rebuildMap;
    window.rebuildLayerManager = render;
    window.loadGeoJSON = loadGeoJSON;
    window.lm3Refresh = render;
    window.lm3AutoSave = autoSave;
    window.lm3ResetState = function () {
        if (!confirm("Reset all auto-saved settings?")) return;
        try { localStorage.removeItem(STATE_KEY); } catch (e) {}
        showToast("↺ Settings reset. Refresh to see defaults.");
    };

    // ========================================================
    // HANDSHAKE — MAP TOOL MANAGER v3.5 Compatibility
    // ========================================================
    (function registerWithToolManager() {
        var toolConfig = {
            id: 'layers',
            name: 'Layer Switcher',
            icon: '🗂️',
            selector: '#lm3-btn',
            defaults: { top: 78, right: 12 },
            visible: true
        };

        if (window.MapToolManager && typeof window.MapToolManager.register === 'function') {
            window.MapToolManager.register(toolConfig);
            return;
        }

        window.MapToolRegistry = window.MapToolRegistry || [];
        var alreadyQueued = window.MapToolRegistry.some(function (c) {
            return c && c.id === 'layers';
        });
        if (!alreadyQueued) {
            window.MapToolRegistry.push(toolConfig);
        }

        var retries = 0;
        var retryTmr = setInterval(function () {
            if (window.MapToolManager && typeof window.MapToolManager.register === 'function') {
                window.MapToolManager.register(toolConfig);
                clearInterval(retryTmr);
            }
            if (++retries > 20) clearInterval(retryTmr);
        }, 500);
    })();

    // ========================================================
    // START
    // ========================================================
    render();
    initLayers();

    console.log("🗂️ Layer Manager v3.8 — Polished + Handshake Enabled");

})();