// ============================================================
// 📍 STAGE 16 — COORDINATE HUD v5.7
// ============================================================
// Light Theme | Fixed Width 268px | Pill Tabs Side-by-Side
// Full Converter | Unit Converter | Snapping Picker
// Popup Blocker (passive — does NOT swallow click events)
// Mobile-First | Tool Manager Handshake | z-index 55000
//
// COORDINATE PIPELINE:
//   Map View = EPSG:3857 (Web Mercator)
//   → ol.proj.transform() via proj4
//   → EPSG:4326 (WGS84 Lat/Lon)
//   → EPSG:32643 (UTM Zone 43N)
//   → EPSG:32644 (UTM Zone 44N)
//
// SNAPPING:
//   Vertex priority: 8px | Edge tolerance: 15px
//   Works with Point, LineString, Polygon, Multi* geometries
// ============================================================

(function () {

    "use strict";

    // --------------------------------------------------------
    // CLEANUP PREVIOUS VERSIONS
    // --------------------------------------------------------
    [".s16-root", ".s16-hud-root", ".coordinates-readout"].forEach(function (sel) {
        var el = document.querySelector(sel);
        if (el) el.remove();
    });
    ["s16-v5-css", "s16-v5-toast", "s16-v4-toast"].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.remove();
    });

    // --------------------------------------------------------
    // WAIT FOR MAP
    // --------------------------------------------------------
    if (typeof map === "undefined" || !map || !map.getView) {
        setTimeout(arguments.callee, 500);
        return;
    }

    // --------------------------------------------------------
    // CONFIG
    // --------------------------------------------------------
    var SNAP_TOLERANCE_PX = 15;
    var SNAP_VERTEX_PRIORITY = 8;

    // --------------------------------------------------------
    // STATE
    // --------------------------------------------------------
    var S = {
        expanded: false,
        tab: null,
        pickerActive: false,
        pickerCoord: null,
        snappedCoord: null,
        isSnapped: false,
        pinLayer: null,
        snapLayer: null,
        mapClickKey: null,
        moveKey: null,
        toastTmr: null,
        lastC: null,
        popupBlocked: false,
        popupKillTimer: null,
        snapEnabled: true
    };

    // --------------------------------------------------------
    // PROJECTIONS
    // --------------------------------------------------------
    function regProj(code, def) {
        try {
            if (typeof proj4 !== "undefined" && !proj4.defs(code)) {
                proj4.defs(code, def);
                if (ol.proj.proj4 && ol.proj.proj4.register) {
                    ol.proj.proj4.register(proj4);
                }
            }
        } catch (e) {}
    }
    regProj("EPSG:32643", "+proj=utm +zone=43 +datum=WGS84 +units=m +no_defs");
    regProj("EPSG:32644", "+proj=utm +zone=44 +datum=WGS84 +units=m +no_defs");

    function txf(c, from, to) {
        return ol.proj.transform(c, from, to);
    }

    function dd2dms(dd) {
        var neg = dd < 0;
        dd = Math.abs(dd);
        var dg = Math.floor(dd);
        var mf = (dd - dg) * 60;
        var mn = Math.floor(mf);
        var sc = parseFloat(((mf - mn) * 60).toFixed(4));
        return { d: neg ? -dg : dg, m: mn, s: sc };
    }

    function dms2dd(dg, mn, sc) {
        var sign = dg < 0 ? -1 : 1;
        return sign * (Math.abs(dg) + mn / 60 + sc / 3600);
    }

    function fmtDms(o, isLon) {
        var dir = isLon ? (o.d >= 0 ? "E" : "W") : (o.d >= 0 ? "N" : "S");
        return Math.abs(o.d) + "\u00B0 " + o.m + "\u2032 " + o.s.toFixed(2) + "\u2033 " + dir;
    }

    // --------------------------------------------------------
    // STYLES
    // --------------------------------------------------------
    var css = document.createElement("style");
    css.id = "s16-v5-css";
    css.textContent = [
        ".s16-root{",
        "  width:268px;min-width:268px;max-width:268px;",
        "  max-height:calc(100vh - 28px);",
        "  background:#fff;color:#1e293b;",
        "  border:1px solid #cbd5e1;border-radius:12px;",
        "  box-shadow:0 4px 24px rgba(0,0,0,0.12),0 1px 4px rgba(0,0,0,0.06);",
        "  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;",
        "  z-index:55000;box-sizing:border-box;user-select:none;",
        "  display:flex;flex-direction:column;overflow:hidden;",
        "  transition:border-color .2s,box-shadow .2s;",
        "}",
        ".s16-root.pk{border-color:#ef4444;box-shadow:0 0 0 2px rgba(239,68,68,.15),0 4px 24px rgba(0,0,0,.12);}",

        ".s16-bar{display:flex;align-items:center;padding:10px 12px;gap:8px;cursor:pointer;",
        "  -webkit-tap-highlight-color:transparent;touch-action:manipulation;min-height:48px;",
        "  border-bottom:1px solid transparent;transition:background .1s;}",
        ".s16-bar:active{background:#f8fafc;}",
        ".s16-root.exp .s16-bar{border-bottom-color:#e2e8f0;}",
        ".s16-bic{font-size:16px;flex-shrink:0;}",
        ".s16-bd{flex:1;min-width:0;overflow:hidden;}",
        ".s16-brow{display:flex;justify-content:space-between;align-items:baseline;gap:4px;margin-bottom:1px;}",
        ".s16-brow:last-child{margin-bottom:0;}",
        ".s16-blb{font-size:8px;font-weight:700;color:#94a3b8;text-transform:uppercase;",
        "  letter-spacing:.05em;flex-shrink:0;width:40px;}",
        ".s16-bvl{font-family:'SF Mono','Cascadia Code',Consolas,monospace;font-variant-numeric:tabular-nums;",
        "  font-size:10px;font-weight:600;color:#0f172a;text-align:right;flex:1;",
        "  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
        ".s16-chv{font-size:9px;color:#94a3b8;flex-shrink:0;transition:transform .25s;line-height:1;}",
        ".s16-chv.up{transform:rotate(180deg);}",

        ".s16-tbx{display:none;flex-direction:column;flex:1;min-height:0;overflow:hidden;}",
        ".s16-tbx.op{display:flex;}",

        ".s16-tbs{display:flex;gap:4px;padding:8px 10px;background:#f8fafc;",
        "  border-bottom:1px solid #e2e8f0;flex-shrink:0;}",
        ".s16-tbn{flex:1;padding:7px 4px;text-align:center;font-size:10px;font-weight:700;",
        "  color:#64748b;cursor:pointer;background:#fff;border:1px solid #e2e8f0;border-radius:8px;",
        "  transition:all .15s;-webkit-tap-highlight-color:transparent;touch-action:manipulation;",
        "  min-height:34px;display:flex;align-items:center;justify-content:center;gap:3px;",
        "  box-shadow:0 1px 2px rgba(0,0,0,.04);}",
        ".s16-tbn:active{background:#f1f5f9;transform:scale(.97);}",
        ".s16-tbn.on{color:#fff;background:#2563eb;border-color:#2563eb;",
        "  box-shadow:0 2px 6px rgba(37,99,235,.25);}",

        ".s16-psc{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;}",
        ".s16-pan{display:none;padding:12px;}",
        ".s16-pan.vi{display:block;}",

        ".s16-flb{font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;",
        "  letter-spacing:.04em;margin-bottom:4px;display:block;}",
        ".s16-fin{width:100%;box-sizing:border-box;padding:8px 10px;background:#f8fafc;",
        "  border:1px solid #e2e8f0;border-radius:8px;color:#1e293b;",
        "  font-family:'SF Mono',Consolas,monospace;font-size:12px;outline:none;",
        "  margin-bottom:8px;transition:border-color .15s;min-height:38px;-webkit-appearance:none;}",
        ".s16-fin:focus{border-color:#2563eb;background:#fff;}",
        ".s16-fin::placeholder{color:#94a3b8;}",
        ".s16-fsl{width:100%;box-sizing:border-box;padding:8px 28px 8px 10px;background:#f8fafc;",
        "  border:1px solid #e2e8f0;border-radius:8px;color:#1e293b;font-size:11px;outline:none;",
        "  margin-bottom:8px;cursor:pointer;min-height:38px;-webkit-appearance:none;appearance:none;",
        "  background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'%3E%3Cpath fill='%2394a3b8' d='M5 7L1 3h8z'/%3E%3C/svg%3E\");",
        "  background-repeat:no-repeat;background-position:right 10px center;}",
        ".s16-fsl:focus{border-color:#2563eb;}",
        ".s16-fir{display:flex;gap:6px;margin-bottom:8px;}",
        ".s16-fir .s16-fin,.s16-fir .s16-fsl{flex:1;margin-bottom:0;}",

        ".s16-fbt{width:100%;padding:9px;border:none;border-radius:8px;font-weight:700;",
        "  font-size:11px;cursor:pointer;transition:background .12s,transform .08s;",
        "  margin-bottom:6px;min-height:38px;-webkit-tap-highlight-color:transparent;",
        "  touch-action:manipulation;}",
        ".s16-fbt:active{transform:scale(.98);}",
        ".s16-fb1{background:#2563eb;color:#fff;}",
        ".s16-fb1:active{background:#1d4ed8;}",
        ".s16-fb3{background:#ef4444;color:#fff;}",
        ".s16-fb3:active{background:#dc2626;}",
        ".s16-fb4{background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;}",
        ".s16-fb4:active{background:#e2e8f0;}",

        ".s16-rcd{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;",
        "  padding:10px 12px;margin-bottom:6px;cursor:pointer;",
        "  transition:border-color .12s,background .12s;",
        "  -webkit-tap-highlight-color:transparent;touch-action:manipulation;position:relative;}",
        ".s16-rcd:active{border-color:#2563eb;background:#eff6ff;}",
        ".s16-rcl{font-size:8px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.04em;}",
        ".s16-rcv{font-family:'SF Mono',Consolas,monospace;font-variant-numeric:tabular-nums;",
        "  font-size:12px;font-weight:700;color:#0f172a;margin-top:3px;",
        "  word-break:break-all;line-height:1.4;}",
        ".s16-rch{position:absolute;top:8px;right:10px;font-size:12px;color:#cbd5e1;}",

        ".s16-cgr{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;",
        "  padding:10px 12px;margin-bottom:8px;}",
        ".s16-cgt{font-size:8px;font-weight:700;color:#64748b;text-transform:uppercase;",
        "  letter-spacing:.04em;margin-bottom:5px;padding-bottom:4px;border-bottom:1px solid #e2e8f0;}",
        ".s16-crw{display:flex;justify-content:space-between;align-items:baseline;",
        "  padding:4px 0;cursor:pointer;transition:background .1s;border-radius:4px;}",
        ".s16-crw:active{background:#eff6ff;}",
        ".s16-crn{font-size:9px;color:#64748b;font-weight:600;}",
        ".s16-crv{font-family:'SF Mono',Consolas,monospace;font-variant-numeric:tabular-nums;",
        "  font-size:10px;font-weight:700;color:#0f172a;text-align:right;",
        "  max-width:55%;word-break:break-all;}",

        ".s16-pki{background:#fef2f2;border:1px solid #fecaca;border-radius:10px;",
        "  padding:10px 12px;font-size:11px;color:#dc2626;margin-bottom:10px;",
        "  text-align:center;font-weight:700;line-height:1.4;}",
        ".s16-snap-info{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;",
        "  padding:6px 10px;font-size:10px;color:#16a34a;font-weight:700;",
        "  margin-bottom:8px;text-align:center;}",
        ".s16-snap-toggle{display:flex;align-items:center;justify-content:space-between;",
        "  padding:8px 10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;",
        "  margin-bottom:8px;cursor:pointer;-webkit-tap-highlight-color:transparent;}",
        ".s16-snap-toggle:active{background:#f1f5f9;}",
        ".s16-snap-lbl{font-size:10px;font-weight:700;color:#475569;}",
        ".s16-snap-sw{width:34px;height:18px;border-radius:9px;background:#cbd5e1;",
        "  position:relative;transition:background .2s;flex-shrink:0;}",
        ".s16-snap-sw.on{background:#16a34a;}",
        ".s16-snap-sw::after{content:'';position:absolute;top:2px;left:2px;width:14px;height:14px;",
        "  border-radius:50%;background:#fff;transition:transform .2s;",
        "  box-shadow:0 1px 2px rgba(0,0,0,.15);}",
        ".s16-snap-sw.on::after{transform:translateX(16px);}",

        ".s16-utb{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;",
        "  margin-top:6px;overflow:hidden;}",
        ".s16-urw{display:flex;justify-content:space-between;align-items:center;",
        "  padding:8px 12px;cursor:pointer;transition:background .1s;",
        "  -webkit-tap-highlight-color:transparent;touch-action:manipulation;",
        "  border-bottom:1px solid #f1f5f9;}",
        ".s16-urw:last-child{border-bottom:none;}",
        ".s16-urw:active{background:#eff6ff;}",
        ".s16-unn{font-size:10px;color:#64748b;font-weight:600;}",
        ".s16-uvl{font-family:'SF Mono',Consolas,monospace;font-variant-numeric:tabular-nums;",
        "  font-size:12px;font-weight:700;color:#0f172a;}",

        "#s16-v5-toast{position:fixed;bottom:70px;left:50%;",
        "  transform:translateX(-50%) translateY(10px);background:#0f172a;color:#fff;",
        "  font-weight:700;font-size:11px;padding:8px 18px;border-radius:8px;",
        "  box-shadow:0 4px 16px rgba(0,0,0,.2);z-index:57000;opacity:0;",
        "  transition:opacity .2s,transform .2s;pointer-events:none;",
        "  font-family:-apple-system,system-ui,sans-serif;white-space:nowrap;}",
        "#s16-v5-toast.sh{opacity:1;transform:translateX(-50%) translateY(0);}",

        "@media(max-width:480px){",
        "  .s16-root{width:256px;min-width:256px;max-width:256px;max-height:62vh;border-radius:14px;}",
        "  .s16-bar{padding:9px 10px;}",
        "  .s16-bvl{font-size:9.5px;}",
        "  .s16-pan{padding:10px;}",
        "  .s16-tbs{padding:6px 8px;gap:3px;}",
        "  .s16-tbn{font-size:9px;min-height:32px;padding:6px 3px;}",
        "}"
    ].join("\n");
    document.head.appendChild(css);

    // --------------------------------------------------------
    // BUILD HTML
    // --------------------------------------------------------
    var root = document.createElement("div");
    root.className = "s16-root";
    root.id = "stage16-coordinate-hud";
    root.style.position = "fixed";
    root.style.bottom = "14px";
    root.style.left = "14px";

    root.innerHTML = [
        '<div class="s16-bar" id="s16bar">',
        '  <span class="s16-bic">📍</span>',
        '  <div class="s16-bd">',
        '    <div class="s16-brow">',
        '      <span class="s16-blb">UTM</span>',
        '      <span class="s16-bvl" id="s16bu">E:— N:—</span>',
        '    </div>',
        '    <div class="s16-brow">',
        '      <span class="s16-blb">LL</span>',
        '      <span class="s16-bvl" id="s16bl">—</span>',
        '    </div>',
        '  </div>',
        '  <span class="s16-chv" id="s16ch">▼</span>',
        '</div>',
        '<div class="s16-tbx" id="s16tx">',
        '  <div class="s16-tbs" id="s16ts">',
        '    <button class="s16-tbn" data-t="conv">📐 Convert</button>',
        '    <button class="s16-tbn" data-t="unit">📏 Units</button>',
        '    <button class="s16-tbn" data-t="pick">📍 Pick</button>',
        '  </div>',
        '  <div class="s16-psc">',

        '    <div class="s16-pan" id="s16pc">',
        '      <label class="s16-flb">Input System</label>',
        '      <select class="s16-fsl" id="s16cf">',
        '        <option value="ll">Lat, Lon (WGS84)</option>',
        '        <option value="utm43">E, N (UTM 43N)</option>',
        '        <option value="utm44">E, N (UTM 44N)</option>',
        '        <option value="merc">X, Y (EPSG:3857)</option>',
        '        <option value="dms">DMS (Deg Min Sec)</option>',
        '      </select>',
        '      <div id="s16cdd">',
        '        <label class="s16-flb">Coordinates</label>',
        '        <div class="s16-fir">',
        '          <input class="s16-fin" id="s16c1" inputmode="decimal" placeholder="Val 1">',
        '          <input class="s16-fin" id="s16c2" inputmode="decimal" placeholder="Val 2">',
        '        </div>',
        '      </div>',
        '      <div id="s16cdm" style="display:none;">',
        '        <label class="s16-flb">Lat: Deg Min Sec</label>',
        '        <div class="s16-fir">',
        '          <input class="s16-fin" id="s16d1" inputmode="decimal" placeholder="D">',
        '          <input class="s16-fin" id="s16d2" inputmode="decimal" placeholder="M">',
        '          <input class="s16-fin" id="s16d3" inputmode="decimal" placeholder="S">',
        '        </div>',
        '        <label class="s16-flb">Lon: Deg Min Sec</label>',
        '        <div class="s16-fir">',
        '          <input class="s16-fin" id="s16d4" inputmode="decimal" placeholder="D">',
        '          <input class="s16-fin" id="s16d5" inputmode="decimal" placeholder="M">',
        '          <input class="s16-fin" id="s16d6" inputmode="decimal" placeholder="S">',
        '        </div>',
        '      </div>',
        '      <button class="s16-fbt s16-fb1" id="s16cg">Convert</button>',
        '      <button class="s16-fbt s16-fb4" id="s16cc">↗ Use Cursor Position</button>',
        '      <div id="s16cr"></div>',
        '    </div>',

        '    <div class="s16-pan" id="s16pu">',
        '      <label class="s16-flb">Type</label>',
        '      <select class="s16-fsl" id="s16ut">',
        '        <option value="len">Length / Distance</option>',
        '        <option value="area">Area</option>',
        '      </select>',
        '      <label class="s16-flb">Value &amp; Unit</label>',
        '      <div class="s16-fir">',
        '        <input class="s16-fin" id="s16uv" type="number" inputmode="decimal" step="any" placeholder="Value">',
        '        <select class="s16-fsl" id="s16uf"></select>',
        '      </div>',
        '      <div id="s16ur"></div>',
        '    </div>',

        '    <div class="s16-pan" id="s16pp">',
        '      <div id="s16ps"></div>',
        '      <div class="s16-snap-toggle" id="s16snapt">',
        '        <span class="s16-snap-lbl">🧲 Snap to Features</span>',
        '        <div class="s16-snap-sw on" id="s16snapsw"></div>',
        '      </div>',
        '      <button class="s16-fbt s16-fb3" id="s16pg">📍 Pick Location on Map</button>',
        '      <div id="s16pr"></div>',
        '    </div>',

        '  </div>',
        '</div>'
    ].join("");
    document.body.appendChild(root);

    var toast = document.createElement("div");
    toast.id = "s16-v5-toast";
    document.body.appendChild(toast);

    // --------------------------------------------------------
    // ELEMENT REFERENCES
    // --------------------------------------------------------
    var barEl = document.getElementById("s16bar");
    var chevEl = document.getElementById("s16ch");
    var tboxEl = document.getElementById("s16tx");
    var buEl = document.getElementById("s16bu");
    var blEl = document.getElementById("s16bl");

    var cfEl = document.getElementById("s16cf");
    var cddEl = document.getElementById("s16cdd");
    var cdmEl = document.getElementById("s16cdm");
    var c1El = document.getElementById("s16c1");
    var c2El = document.getElementById("s16c2");
    var d1 = document.getElementById("s16d1");
    var d2 = document.getElementById("s16d2");
    var d3 = document.getElementById("s16d3");
    var d4 = document.getElementById("s16d4");
    var d5 = document.getElementById("s16d5");
    var d6 = document.getElementById("s16d6");
    var cgBtn = document.getElementById("s16cg");
    var ccBtn = document.getElementById("s16cc");
    var crDiv = document.getElementById("s16cr");

    var utSel = document.getElementById("s16ut");
    var uvInp = document.getElementById("s16uv");
    var ufSel = document.getElementById("s16uf");
    var urDiv = document.getElementById("s16ur");

    var psDiv = document.getElementById("s16ps");
    var pgBtn = document.getElementById("s16pg");
    var prDiv = document.getElementById("s16pr");
    var snapToggle = document.getElementById("s16snapt");
    var snapSw = document.getElementById("s16snapsw");

    var stopP = function (e) { e.stopPropagation(); };
    [cfEl, c1El, c2El, d1, d2, d3, d4, d5, d6, utSel, uvInp, ufSel].forEach(function (el) {
        el.addEventListener("click", stopP);
        el.addEventListener("touchstart", stopP);
        el.addEventListener("mousedown", stopP);
    });

    // --------------------------------------------------------
    // TOAST + CLIPBOARD
    // --------------------------------------------------------
    function showToast(m) {
        clearTimeout(S.toastTmr);
        toast.textContent = m;
        toast.classList.add("sh");
        S.toastTmr = setTimeout(function () {
            toast.classList.remove("sh");
        }, 2200);
    }

    function clip(text, label) {
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(function () {
                showToast("📋 " + label + " copied!");
            }).catch(function () {
                fbClip(text, label);
            });
        } else {
            fbClip(text, label);
        }
    }

    function fbClip(text, label) {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.cssText = "position:fixed;left:-9999px;opacity:0;";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        try {
            document.execCommand("copy");
            showToast("📋 " + label + " copied!");
        } catch (e) {
            showToast("❌ Copy failed");
        }
        document.body.removeChild(ta);
    }

    // --------------------------------------------------------
    // POPUP BLOCKER — PASSIVE (does not intercept events)
    // --------------------------------------------------------
    function killAllPopups() {
        try {
            map.getOverlays().forEach(function (ov) {
                ov.setPosition(undefined);
            });
        } catch (e) {}

        ["feature-info-popup", "popup", "ol-popup"].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.style.display = "none";
        });

        [".ol-popup", ".feature-popup", ".popup-container"].forEach(function (sel) {
            document.querySelectorAll(sel).forEach(function (el) {
                el.style.display = "none";
            });
        });
    }

    function blockPopups() {
        if (S.popupBlocked) return;

        window.msdDivisionActive = true;
        window.stage14MeasureActive = true;
        window.s16PickerActive = true;

        if (typeof window.closeFeaturePopup === "function") {
            try { window.closeFeaturePopup(); } catch (e) {}
        }
        killAllPopups();

        S.popupKillTimer = setInterval(function () {
            if (S.pickerActive) killAllPopups();
        }, 80);

        S.popupBlocked = true;
    }

    function unblockPopups() {
        if (!S.popupBlocked) return;

        if (S.popupKillTimer) {
            clearInterval(S.popupKillTimer);
            S.popupKillTimer = null;
        }

        window.msdDivisionActive = false;
        window.stage14MeasureActive = false;
        window.s16PickerActive = false;
        S.popupBlocked = false;
    }

    // --------------------------------------------------------
    // PIN + SNAP LAYERS
    // --------------------------------------------------------
    function ensureLayers() {
        if (!S.pinLayer) {
            S.pinLayer = new ol.layer.Vector({
                source: new ol.source.Vector(),
                zIndex: 30000,
                properties: { __s16: true },
                style: [
                    new ol.style.Style({
                        image: new ol.style.Circle({
                            radius: 16,
                            stroke: new ol.style.Stroke({ color: "rgba(239,68,68,0.2)", width: 2 })
                        })
                    }),
                    new ol.style.Style({
                        image: new ol.style.Circle({
                            radius: 7,
                            fill: new ol.style.Fill({ color: "#ef4444" }),
                            stroke: new ol.style.Stroke({ color: "#fff", width: 2.5 })
                        })
                    })
                ]
            });
            map.addLayer(S.pinLayer);
        }
        if (!S.snapLayer) {
            S.snapLayer = new ol.layer.Vector({
                source: new ol.source.Vector(),
                zIndex: 30001,
                properties: { __s16: true },
                style: [
                    new ol.style.Style({
                        image: new ol.style.Circle({
                            radius: 12,
                            stroke: new ol.style.Stroke({ color: "rgba(22,163,74,0.3)", width: 2 })
                        })
                    }),
                    new ol.style.Style({
                        image: new ol.style.Circle({
                            radius: 5,
                            fill: new ol.style.Fill({ color: "#16a34a" }),
                            stroke: new ol.style.Stroke({ color: "#fff", width: 2 })
                        })
                    })
                ]
            });
            map.addLayer(S.snapLayer);
        }
    }

    function setPin(c) {
        ensureLayers();
        S.pinLayer.getSource().clear();
        if (c) S.pinLayer.getSource().addFeature(new ol.Feature(new ol.geom.Point(c)));
    }

    function clearPin() {
        if (S.pinLayer) S.pinLayer.getSource().clear();
    }

    function setSnapIndicator(c) {
        ensureLayers();
        S.snapLayer.getSource().clear();
        if (c) S.snapLayer.getSource().addFeature(new ol.Feature(new ol.geom.Point(c)));
    }

    function clearSnapIndicator() {
        if (S.snapLayer) S.snapLayer.getSource().clear();
    }

    // --------------------------------------------------------
    // SNAPPING ENGINE
    // --------------------------------------------------------
    function getVectorLayers() {
        var layers = [];
        map.getLayers().forEach(function (l) {
            if (!l) return;
            if (l.get && (l.get("__s16") || l.get("__msd"))) return;
            if (l instanceof ol.layer.Vector) {
                layers.push(l);
            } else if (l instanceof ol.layer.Group) {
                l.getLayers().forEach(function (gl) {
                    if (gl instanceof ol.layer.Vector && !(gl.get && gl.get("__s16"))) {
                        layers.push(gl);
                    }
                });
            }
        });
        return layers;
    }

    function distPx(c1, c2) {
        var p1 = map.getPixelFromCoordinate(c1);
        var p2 = map.getPixelFromCoordinate(c2);
        if (!p1 || !p2) return Infinity;
        var dx = p1[0] - p2[0];
        var dy = p1[1] - p2[1];
        return Math.sqrt(dx * dx + dy * dy);
    }

    function nearestPtSeg(p, a, b) {
        var dx = b[0] - a[0];
        var dy = b[1] - a[1];
        var l2 = dx * dx + dy * dy;
        if (l2 === 0) return a.slice();
        var t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2;
        t = Math.max(0, Math.min(1, t));
        return [a[0] + t * dx, a[1] + t * dy];
    }

    function extractCoords(geom) {
        var verts = [];
        var segs = [];
        var type = geom.getType();

        function ring(r) {
            for (var i = 0; i < r.length; i++) {
                verts.push(r[i]);
                if (i < r.length - 1) segs.push([r[i], r[i + 1]]);
            }
        }
        function line(c) {
            for (var i = 0; i < c.length; i++) {
                verts.push(c[i]);
                if (i < c.length - 1) segs.push([c[i], c[i + 1]]);
            }
        }

        if (type === "Point") {
            verts.push(geom.getCoordinates());
        } else if (type === "MultiPoint") {
            geom.getCoordinates().forEach(function (c) { verts.push(c); });
        } else if (type === "LineString") {
            line(geom.getCoordinates());
        } else if (type === "MultiLineString") {
            geom.getCoordinates().forEach(line);
        } else if (type === "Polygon") {
            geom.getCoordinates().forEach(ring);
        } else if (type === "MultiPolygon") {
            geom.getPolygons().forEach(function (p) {
                p.getCoordinates().forEach(ring);
            });
        }
        return { vertices: verts, segments: segs };
    }

    function findSnap(mc) {
        if (!S.snapEnabled) return null;

        var layers = getVectorLayers();
        var bv = null, bvd = Infinity;
        var be = null, bed = Infinity;

        var ext = map.getView().calculateExtent(map.getSize());
        var buf = map.getView().getResolution() * SNAP_TOLERANCE_PX * 2;
        var se = [ext[0] - buf, ext[1] - buf, ext[2] + buf, ext[3] + buf];

        layers.forEach(function (layer) {
            if (!layer.getVisible()) return;
            var src = layer.getSource();
            if (!src) return;

            var feats;
            try {
                feats = src.getFeaturesInExtent(se);
            } catch (e) {
                try { feats = src.getFeatures(); } catch (e2) { return; }
            }
            if (!feats) return;

            feats.forEach(function (f) {
                var g = f.getGeometry();
                if (!g) return;
                var d = extractCoords(g);

                d.vertices.forEach(function (v) {
                    var dd = distPx(mc, v);
                    if (dd < bvd) { bvd = dd; bv = v.slice(); }
                });

                d.segments.forEach(function (s) {
                    var np = nearestPtSeg(mc, s[0], s[1]);
                    var dd = distPx(mc, np);
                    if (dd < bed) { bed = dd; be = np; }
                });
            });
        });

        if (bv && bvd <= SNAP_VERTEX_PRIORITY) return { coord: bv, type: "vertex", dist: bvd };
        if (bv && bvd <= SNAP_TOLERANCE_PX) return { coord: bv, type: "vertex", dist: bvd };
        if (be && bed <= SNAP_TOLERANCE_PX) return { coord: be, type: "edge", dist: bed };
        return null;
    }

    // --------------------------------------------------------
    // COMPACT BAR UPDATE
    // --------------------------------------------------------
    function updateBar(c) {
        if (!c || c.length < 2) return;
        S.lastC = c;
        try {
            var utm = txf(c, "EPSG:3857", "EPSG:32643");
            var ll = txf(c, "EPSG:3857", "EPSG:4326");
            buEl.textContent = "E:" + utm[0].toFixed(2) + " N:" + utm[1].toFixed(2);
            blEl.textContent = ll[1].toFixed(6) + "\u00B0N " + ll[0].toFixed(6) + "\u00B0E";
            window.stage16LastCoordinate = {
                utm43n: { easting: utm[0], northing: utm[1] },
                latlon: { latitude: ll[1], longitude: ll[0] }
            };
        } catch (e) {}
    }

    // --------------------------------------------------------
    // EXPAND / COLLAPSE
    // --------------------------------------------------------
    barEl.addEventListener("click", function () {
        S.expanded = !S.expanded;
        if (S.expanded) {
            tboxEl.classList.add("op");
            chevEl.classList.add("up");
            root.classList.add("exp");
            if (!S.tab) openTab("conv");
        } else {
            tboxEl.classList.remove("op");
            chevEl.classList.remove("up");
            root.classList.remove("exp");
        }
    });
    tboxEl.addEventListener("click", stopP);
    tboxEl.addEventListener("touchstart", stopP);

    // --------------------------------------------------------
    // TABS
    // --------------------------------------------------------
    function openTab(t) {
        S.tab = t;
        document.querySelectorAll(".s16-tbn").forEach(function (b) {
            b.classList.toggle("on", b.dataset.t === t);
        });
        document.getElementById("s16pc").classList.toggle("vi", t === "conv");
        document.getElementById("s16pu").classList.toggle("vi", t === "unit");
        document.getElementById("s16pp").classList.toggle("vi", t === "pick");
        if (t === "unit") fillUnits();
        if (t === "pick" && S.pickerCoord) renderPick(S.pickerCoord);
    }

    document.getElementById("s16ts").addEventListener("click", function (e) {
        var btn = e.target.closest(".s16-tbn");
        if (!btn) return;
        e.stopPropagation();
        openTab(btn.dataset.t);
    });

    // ========================================================
    // CONVERTER
    // ========================================================
    cfEl.addEventListener("change", function () {
        var m = cfEl.value;
        cddEl.style.display = m === "dms" ? "none" : "block";
        cdmEl.style.display = m === "dms" ? "block" : "none";
        if (m === "ll") {
            c1El.placeholder = "Latitude";
            c2El.placeholder = "Longitude";
        } else if (m === "utm43" || m === "utm44") {
            c1El.placeholder = "Easting";
            c2El.placeholder = "Northing";
        } else if (m === "merc") {
            c1El.placeholder = "X";
            c2El.placeholder = "Y";
        }
    });
    cfEl.dispatchEvent(new Event("change"));

    cgBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        var m = cfEl.value;
        var c3;
        try {
            if (m === "dms") {
                var lat = dms2dd(parseFloat(d1.value) || 0, parseFloat(d2.value) || 0, parseFloat(d3.value) || 0);
                var lon = dms2dd(parseFloat(d4.value) || 0, parseFloat(d5.value) || 0, parseFloat(d6.value) || 0);
                if (!lat && !lon) { showToast("⚠ Enter DMS values"); return; }
                c3 = txf([lon, lat], "EPSG:4326", "EPSG:3857");
            } else {
                var v1 = parseFloat(c1El.value);
                var v2 = parseFloat(c2El.value);
                if (isNaN(v1) || isNaN(v2)) { showToast("⚠ Enter valid numbers"); return; }
                if (m === "ll") c3 = txf([v2, v1], "EPSG:4326", "EPSG:3857");
                else if (m === "utm43") c3 = txf([v1, v2], "EPSG:32643", "EPSG:3857");
                else if (m === "utm44") c3 = txf([v1, v2], "EPSG:32644", "EPSG:3857");
                else c3 = [v1, v2];
            }
            renderConv(c3);
        } catch (err) {
            crDiv.innerHTML = '<div style="color:#ef4444;font-size:11px;padding:6px;">⚠ ' + err.message + '</div>';
        }
    });

    ccBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        if (!S.lastC) { showToast("⚠ Move cursor on map first"); return; }
        renderConv(S.lastC);
    });

    function renderConv(c3) {
        var ll = txf(c3, "EPSG:3857", "EPSG:4326");
        var u43 = txf(c3, "EPSG:3857", "EPSG:32643");
        var u44 = txf(c3, "EPSG:3857", "EPSG:32644");
        var latD = dd2dms(ll[1]);
        var lonD = dd2dms(ll[0]);

        var groups = [
            {
                title: "GEOGRAPHIC (WGS84)",
                rows: [
                    { n: "Decimal", v: ll[1].toFixed(8) + ", " + ll[0].toFixed(8), c: ll[1].toFixed(8) + ", " + ll[0].toFixed(8) },
                    { n: "DMS Lat", v: fmtDms(latD, false), c: fmtDms(latD, false) },
                    { n: "DMS Lon", v: fmtDms(lonD, true), c: fmtDms(lonD, true) },
                    { n: "Lat", v: ll[1].toFixed(8) + "\u00B0", c: String(ll[1].toFixed(8)) },
                    { n: "Lon", v: ll[0].toFixed(8) + "\u00B0", c: String(ll[0].toFixed(8)) }
                ]
            },
            {
                title: "UTM PROJECTIONS",
                rows: [
                    { n: "43N E", v: u43[0].toFixed(3), c: u43[0].toFixed(3) },
                    { n: "43N N", v: u43[1].toFixed(3), c: u43[1].toFixed(3) },
                    { n: "43N Both", v: u43[0].toFixed(3) + ", " + u43[1].toFixed(3), c: u43[0].toFixed(3) + ", " + u43[1].toFixed(3) },
                    { n: "44N E", v: u44[0].toFixed(3), c: u44[0].toFixed(3) },
                    { n: "44N N", v: u44[1].toFixed(3), c: u44[1].toFixed(3) },
                    { n: "44N Both", v: u44[0].toFixed(3) + ", " + u44[1].toFixed(3), c: u44[0].toFixed(3) + ", " + u44[1].toFixed(3) }
                ]
            },
            {
                title: "WEB / LINKS",
                rows: [
                    { n: "3857", v: c3[0].toFixed(2) + ", " + c3[1].toFixed(2), c: c3[0].toFixed(2) + ", " + c3[1].toFixed(2) },
                    { n: "Google Maps", v: "Open \u2192", c: "https://maps.google.com/?q=" + ll[1].toFixed(6) + "," + ll[0].toFixed(6), link: true }
                ]
            }
        ];

        var html = "";
        groups.forEach(function (g) {
            html += '<div class="s16-cgr"><div class="s16-cgt">' + g.title + '</div>';
            g.rows.forEach(function (r) {
                html += '<div class="s16-crw" data-c="' + encodeURIComponent(r.c) + '" data-n="' + r.n + '"' +
                    (r.link ? ' data-lk="1"' : '') + '>' +
                    '<span class="s16-crn">' + r.n + '</span>' +
                    '<span class="s16-crv">' + r.v + '</span></div>';
            });
            html += '</div>';
        });
        crDiv.innerHTML = html;
        bindRows(crDiv);
    }

    // ========================================================
    // UNIT CONVERTER
    // ========================================================
    var LU = {
        m: { n: "Meters", f: 1 },
        km: { n: "Kilometers", f: 1000 },
        cm: { n: "Centimeters", f: 0.01 },
        mm: { n: "Millimeters", f: 0.001 },
        ft: { n: "Feet", f: 0.3048 },
        inch: { n: "Inches", f: 0.0254 },
        yd: { n: "Yards", f: 0.9144 },
        mi: { n: "Miles", f: 1609.344 },
        nm: { n: "Nautical Mi", f: 1852 }
    };

    var AU = {
        sqm: { n: "m\u00B2", f: 1 },
        sqkm: { n: "km\u00B2", f: 1e6 },
        sqft: { n: "sq.ft.", f: 0.09290304 },
        sqyd: { n: "sq.yd.", f: 0.83612736 },
        ac: { n: "Acres", f: 4046.8564224 },
        ct: { n: "Cents", f: 40.468564224 },
        gt: { n: "Guntas", f: 101.17141056 },
        ha: { n: "Hectares", f: 10000 },
        sqmi: { n: "sq.mi.", f: 2589988.11 }
    };

    function fillUnits() {
        var u = utSel.value === "len" ? LU : AU;
        var h = "";
        for (var k in u) h += '<option value="' + k + '">' + u[k].n + '</option>';
        ufSel.innerHTML = h;
        urDiv.innerHTML = "";
    }

    utSel.addEventListener("change", function (e) { e.stopPropagation(); fillUnits(); });
    uvInp.addEventListener("input", doUnit);
    ufSel.addEventListener("change", function (e) { e.stopPropagation(); doUnit(); });

    function doUnit() {
        var v = parseFloat(uvInp.value);
        if (isNaN(v)) { urDiv.innerHTML = ""; return; }
        var u = utSel.value === "len" ? LU : AU;
        var base = v * u[ufSel.value].f;
        var html = '<div class="s16-utb">';
        for (var k in u) {
            var cv = base / u[k].f;
            var ds = cv < 0.001 ? cv.toExponential(3) :
                     cv < 1 ? cv.toFixed(6) :
                     cv < 10000 ? cv.toFixed(4) : cv.toFixed(2);
            html += '<div class="s16-urw" data-c="' + cv + ' ' + u[k].n + '" data-n="' + u[k].n + '">' +
                '<span class="s16-unn">' + u[k].n + '</span>' +
                '<span class="s16-uvl">' + ds + '</span></div>';
        }
        html += '</div>';
        urDiv.innerHTML = html;
        urDiv.querySelectorAll(".s16-urw").forEach(function (r) {
            r.addEventListener("click", function (e) {
                e.stopPropagation();
                clip(r.dataset.c, r.dataset.n);
            });
        });
    }

    // ========================================================
    // PICKER WITH SNAPPING
    // ========================================================
    snapToggle.addEventListener("click", function (e) {
        e.stopPropagation();
        S.snapEnabled = !S.snapEnabled;
        snapSw.classList.toggle("on", S.snapEnabled);
    });

    pgBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        if (S.pickerActive) cancelPick();
        else startPick();
    });

    function startPick() {
        S.pickerActive = true;
        S.isSnapped = false;
        S.snappedCoord = null;

        root.classList.add("pk");
        pgBtn.textContent = "✕ Cancel Picking";
        pgBtn.className = "s16-fbt s16-fb4";
        psDiv.innerHTML = '<div class="s16-pki">🎯 Tap on the map' +
            (S.snapEnabled ? '<br><span style="font-size:10px;color:#16a34a;">🧲 Snap ON — green dot = snapped</span>' : '') +
            '</div>';
        prDiv.innerHTML = "";
        map.getTargetElement().style.cursor = "crosshair";

        blockPopups();

        if (window.innerWidth <= 640 && S.expanded) {
            S.expanded = false;
            tboxEl.classList.remove("op");
            chevEl.classList.remove("up");
            root.classList.remove("exp");
        }

        S.moveKey = map.on("pointermove", function (evt) {
            if (evt.dragging) return;
            if (!S.snapEnabled) { clearSnapIndicator(); return; }
            var snap = findSnap(evt.coordinate);
            if (snap) {
                setSnapIndicator(snap.coord);
                S.snappedCoord = snap.coord;
                S.isSnapped = true;
            } else {
                clearSnapIndicator();
                S.snappedCoord = null;
                S.isSnapped = false;
            }
        });

        S.mapClickKey = map.on("click", function (evt) {
            if (!S.pickerActive) return;

            var fc;
            if (S.snapEnabled && S.snappedCoord) {
                fc = S.snappedCoord.slice();
            } else if (S.snapEnabled) {
                var sn = findSnap(evt.coordinate);
                fc = sn ? sn.coord.slice() : evt.coordinate.slice();
            } else {
                fc = evt.coordinate.slice();
            }

            S.pickerCoord = fc;
            setPin(fc);
            clearSnapIndicator();

            killAllPopups();
            setTimeout(killAllPopups, 10);
            setTimeout(killAllPopups, 100);
            setTimeout(killAllPopups, 300);

            finishPick();
        });
    }

    function finishPick() {
        S.pickerActive = false;
        root.classList.remove("pk");
        map.getTargetElement().style.cursor = "";

        if (S.mapClickKey) { ol.Observable.unByKey(S.mapClickKey); S.mapClickKey = null; }
        if (S.moveKey) { ol.Observable.unByKey(S.moveKey); S.moveKey = null; }
        clearSnapIndicator();

        setTimeout(function () {
            killAllPopups();
            unblockPopups();
        }, 400);

        pgBtn.textContent = "📍 Pick New Location";
        pgBtn.className = "s16-fbt s16-fb3";
        psDiv.innerHTML = "";

        if (!S.expanded) {
            S.expanded = true;
            tboxEl.classList.add("op");
            chevEl.classList.add("up");
            root.classList.add("exp");
        }
        openTab("pick");
        renderPick(S.pickerCoord);
    }

    function cancelPick() {
        S.pickerActive = false;
        root.classList.remove("pk");
        map.getTargetElement().style.cursor = "";

        if (S.mapClickKey) { ol.Observable.unByKey(S.mapClickKey); S.mapClickKey = null; }
        if (S.moveKey) { ol.Observable.unByKey(S.moveKey); S.moveKey = null; }
        clearSnapIndicator();
        unblockPopups();

        pgBtn.textContent = "📍 Pick Location on Map";
        pgBtn.className = "s16-fbt s16-fb3";
        psDiv.innerHTML = "";
    }

    function renderPick(c3) {
        if (!c3) { prDiv.innerHTML = ""; return; }

        var ll = txf(c3, "EPSG:3857", "EPSG:4326");
        var u43 = txf(c3, "EPSG:3857", "EPSG:32643");
        var u44 = txf(c3, "EPSG:3857", "EPSG:32644");
        var latD = dd2dms(ll[1]);
        var lonD = dd2dms(ll[0]);

        var snapNote = S.isSnapped ? '<div class="s16-snap-info">🧲 Snapped to feature</div>' : '';

        var items = [
            { l: "UTM 43N", v: "E: " + u43[0].toFixed(3) + "<br>N: " + u43[1].toFixed(3), c: u43[0].toFixed(3) + ", " + u43[1].toFixed(3) },
            { l: "UTM 44N", v: "E: " + u44[0].toFixed(3) + "<br>N: " + u44[1].toFixed(3), c: u44[0].toFixed(3) + ", " + u44[1].toFixed(3) },
            { l: "Decimal Degrees", v: ll[1].toFixed(8) + "\u00B0, " + ll[0].toFixed(8) + "\u00B0", c: ll[1].toFixed(8) + ", " + ll[0].toFixed(8) },
            { l: "DMS", v: fmtDms(latD, false) + "<br>" + fmtDms(lonD, true), c: fmtDms(latD, false) + ", " + fmtDms(lonD, true) },
            { l: "EPSG:3857", v: c3[0].toFixed(2) + ", " + c3[1].toFixed(2), c: c3[0].toFixed(2) + ", " + c3[1].toFixed(2) },
            { l: "Google Maps", v: "Open \u2192", c: "https://maps.google.com/?q=" + ll[1].toFixed(6) + "," + ll[0].toFixed(6), link: true }
        ];

        var html = snapNote;
        items.forEach(function (r) {
            html += '<div class="s16-rcd" data-c="' + encodeURIComponent(r.c) + '" data-n="' + r.l + '"' +
                (r.link ? ' data-lk="1"' : '') + '>' +
                '<span class="s16-rch">📋</span>' +
                '<div class="s16-rcl">' + r.l + '</div>' +
                '<div class="s16-rcv">' + r.v + '</div></div>';
        });
        html += '<button class="s16-fbt s16-fb4" id="s16pclr">🗑️ Clear Pin</button>';
        prDiv.innerHTML = html;
        bindCards(prDiv);

        var cl = document.getElementById("s16pclr");
        if (cl) {
            cl.addEventListener("click", function (e) {
                e.stopPropagation();
                S.pickerCoord = null;
                S.isSnapped = false;
                clearPin();
                prDiv.innerHTML = "";
            });
        }
    }

    // --------------------------------------------------------
    // SHARED CLICK BINDERS
    // --------------------------------------------------------
    function bindRows(container) {
        container.querySelectorAll(".s16-crw").forEach(function (el) {
            el.addEventListener("click", function (e) {
                e.stopPropagation();
                var val = decodeURIComponent(el.dataset.c);
                if (el.dataset.lk === "1") window.open(val, "_blank");
                else clip(val, el.dataset.n);
            });
        });
    }

    function bindCards(container) {
        container.querySelectorAll(".s16-rcd").forEach(function (el) {
            el.addEventListener("click", function (e) {
                e.stopPropagation();
                var val = decodeURIComponent(el.dataset.c);
                if (el.dataset.lk === "1") window.open(val, "_blank");
                else clip(val, el.dataset.n);
            });
        });
    }

    // ========================================================
    // CURSOR TRACKING
    // ========================================================
    map.on("pointermove", function (evt) {
        if (!S.pickerActive) updateBar(evt.coordinate);
    });
    map.on("pointerdown", function (evt) {
        if (!S.pickerActive) updateBar(evt.coordinate);
    });
    map.on("pointerdrag", function (evt) {
        if (!S.pickerActive) updateBar(evt.coordinate);
    });

    updateBar(map.getView().getCenter());

    // ========================================================
    // PUBLIC API
    // ========================================================
    window.stage16CoordinateElement = root;
    window.stage16UpdateCoordinates = updateBar;

    window.stage16SetPosition = function (pos) {
        root.style.top = "auto";
        root.style.bottom = "auto";
        root.style.left = "auto";
        root.style.right = "auto";

        if (typeof pos === "object") {
            if (pos.top) root.style.top = pos.top;
            if (pos.bottom) root.style.bottom = pos.bottom;
            if (pos.left) root.style.left = pos.left;
            if (pos.right) root.style.right = pos.right;
            return;
        }

        switch (pos) {
            case "top-left":
                root.style.top = "14px"; root.style.left = "14px"; break;
            case "top-right":
                root.style.top = "14px"; root.style.right = "14px"; break;
            case "bottom-right":
                root.style.bottom = "14px"; root.style.right = "14px"; break;
            default:
                root.style.bottom = "14px"; root.style.left = "14px";
        }
    };

    // ========================================================
    // MAP TOOL MANAGER HANDSHAKE
    // ========================================================
    (function registerWithToolManager() {
        var tc = {
            id: "coords",
            name: "Coordinate HUD",
            icon: "📐",
            selector: "#stage16-coordinate-hud",
            defaults: { bottom: 14, left: 14 },
            visible: true
        };

        if (window.MapToolManager && typeof window.MapToolManager.register === "function") {
            window.MapToolManager.register(tc);
            return;
        }

        window.MapToolRegistry = window.MapToolRegistry || [];
        var queued = window.MapToolRegistry.some(function (c) {
            return c && c.id === "coords";
        });
        if (!queued) window.MapToolRegistry.push(tc);

        var retries = 0;
        var tmr = setInterval(function () {
            if (window.MapToolManager && typeof window.MapToolManager.register === "function") {
                window.MapToolManager.register(tc);
                clearInterval(tmr);
            }
            if (++retries > 20) clearInterval(tmr);
        }, 500);
    })();

    console.log("✅ Stage 16 — Coordinate HUD v5.7 loaded");
    console.log("   Pipeline: EPSG:3857 → proj4 → WGS84 / UTM43N / UTM44N");
    console.log("   Snapping: vertex " + SNAP_VERTEX_PRIORITY + "px, edge " + SNAP_TOLERANCE_PX + "px");

})();