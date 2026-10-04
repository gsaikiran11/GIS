// ============================================================
// 📋 STAGE 5 — FEATURE INFORMATION POPUP v2.3
// OpenLayers 10.x
//
// Fixed size panel | H+V scrollbars | Smart Text Wrapping (>50 chars)
// Bold labels | Normal values | Click row to copy
// Multi-feature navigation | Mobile bottom sheet | Protected
// ============================================================

(function () {

    "use strict";

    console.log("📋 Starting Stage 5 Popup v2.3...");

    // --------------------------------------------------------
    // CLEANUP OLD INSTANCES
    // --------------------------------------------------------
    var oldPopup = document.getElementById("feature-info-popup");
    if (oldPopup) oldPopup.remove();
    ["stage5-popup-css-v2", "stage5-popup-css-v21", "stage5-popup-css-v22", "stage5-popup-css-v23", "fp-toast"].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.remove();
    });

    // --------------------------------------------------------
    // STATE
    // --------------------------------------------------------
    var ST = {
        features: [],
        activeIdx: 0,
        activeCoord: null,
        highlightLayer: null,
        isMobile: false,
        touchStartY: 0,
        touchCurrentY: 0,
        touchDragging: false
    };

    function detectMobile() {
        ST.isMobile = window.innerWidth <= 640 ||
            ("ontouchstart" in window && window.innerWidth <= 900);
    }
    detectMobile();
    window.addEventListener("resize", detectMobile);

    // --------------------------------------------------------
    // CSS
    // --------------------------------------------------------
    var css = document.createElement("style");
    css.id = "stage5-popup-css-v23";
    css.textContent = `
/* DESKTOP CARD — FIXED SIZE */
#feature-info-popup {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 340px;
    height: 420px;
    max-width: calc(100vw - 24px);
    max-height: calc(100vh - 24px);
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    box-shadow: 0 12px 40px rgba(0,0,0,0.18);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    font-size: 13px;
    color: #1e293b;
    z-index: 54000;
    display: none;
    flex-direction: column;
    overflow: hidden;
    box-sizing: border-box;
    animation: fp-appear 0.16s ease;
}
#feature-info-popup.show { display: flex; }

@keyframes fp-appear {
    from { opacity: 0; transform: translate(-50%, -48%) scale(0.97); }
    to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}

#feature-info-popup * { box-sizing: border-box; }

/* PROTECTION FLAGS */
body.parcel-subdivision-active #feature-info-popup,
body.msd-active #feature-info-popup,
body.s16-picker-active #feature-info-popup {
    display: none !important;
}

/* MOBILE DRAG HANDLE */
.fp-drag-handle {
    display: none;
    justify-content: center;
    padding: 7px 0 3px;
    cursor: grab;
    touch-action: none;
    background: #fff;
    flex-shrink: 0;
}
.fp-drag-handle::before {
    content: "";
    width: 36px;
    height: 4px;
    background: #cbd5e1;
    border-radius: 2px;
}

/* HEADER — PINNED */
.fp-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    background: #f8fafc;
    border-bottom: 1px solid #e2e8f0;
    flex-shrink: 0;
    min-height: 44px;
}
.fp-title-wrap { flex: 1; min-width: 0; }
.fp-title {
    font-size: 13px;
    font-weight: 700;
    color: #0f172a;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.3;
}
.fp-subtitle {
    font-size: 9.5px;
    font-weight: 600;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-top: 1px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.fp-close {
    width: 30px;
    height: 30px;
    border: none;
    background: transparent;
    font-size: 20px;
    cursor: pointer;
    border-radius: 6px;
    color: #64748b;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;
    -webkit-tap-highlight-color: transparent;
    flex-shrink: 0;
    line-height: 1;
}
.fp-close:hover { background: #e2e8f0; color: #0f172a; }
.fp-close:active { background: #cbd5e1; }

/* NAVIGATOR — PINNED */
.fp-nav {
    display: none;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: #eff6ff;
    border-bottom: 1px solid #bfdbfe;
    flex-shrink: 0;
}
.fp-nav.show { display: flex; }
.fp-nav-info {
    flex: 1;
    font-size: 10.5px;
    font-weight: 700;
    color: #1e40af;
}
.fp-nav-btn {
    width: 26px;
    height: 26px;
    border: 1px solid #bfdbfe;
    background: #fff;
    color: #1e40af;
    border-radius: 5px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.12s;
    -webkit-tap-highlight-color: transparent;
    line-height: 1;
}
.fp-nav-btn:hover { background: #dbeafe; }
.fp-nav-btn:active { background: #bfdbfe; transform: scale(0.94); }
.fp-nav-btn:disabled { opacity: 0.35; cursor: not-allowed; }

/* ============================================================
   CONTENT Area with Scrollbars
   ============================================================ */
.fp-content {
    flex: 1;
    min-height: 0;
    min-width: 0;
    overflow: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
    background: #fff;
    scrollbar-width: thin;
    scrollbar-color: #cbd5e1 #f1f5f9;
}
/* Scrollbar custom style */
.fp-content::-webkit-scrollbar {
    width: 6px;
    height: 6px;
}
.fp-content::-webkit-scrollbar-track {
    background: #f1f5f9;
}
.fp-content::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 4px;
}
.fp-content::-webkit-scrollbar-thumb:hover {
    background: #94a3b8;
}
.fp-content::-webkit-scrollbar-corner {
    background: #f1f5f9;
}

/* ROWS */
.fp-row {
    display: flex;
    align-items: baseline;
    gap: 12px;
    padding: 8px 12px;
    border-bottom: 1px solid #f1f5f9;
    min-width: max-content;         /* Grows with text unless class="wrap" */
    cursor: pointer;
    transition: background 0.1s;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
}
.fp-row:hover { background: #f8fafc; }
.fp-row:active { background: #eff6ff; }

/* LABEL (Bold, 120px Column) */
.fp-field {
    width: 120px;
    flex-shrink: 0;
    font-size: 12px;
    font-weight: 700;
    color: #0f172a;
    word-break: break-word;
    line-height: 1.35;
}

/* VALUE (Normal, Monospace for numbers) */
.fp-value {
    font-size: 12px;
    font-weight: 400;
    color: #334155;
    white-space: nowrap;            /* Default: no-wrap, allows horizontal scroll */
    line-height: 1.35;
}
/* Smart Wrap layout if characters > 50 */
.fp-value.wrap {
    white-space: normal !important;  
    word-break: break-word !important;
    max-width: 172px;               /* Constrain cell to force wrapping inside card */
}

.fp-value-empty { color: #cbd5e1; font-style: italic; }

.fp-no-attrs {
    padding: 20px 14px;
    text-align: center;
    color: #94a3b8;
    font-size: 12px;
    font-style: italic;
}

/* ACTIONS — PINNED */
.fp-actions {
    display: flex;
    gap: 6px;
    padding: 8px 10px;
    background: #f8fafc;
    border-top: 1px solid #e2e8f0;
    flex-shrink: 0;
}
.fp-btn {
    flex: 1;
    min-height: 34px;
    padding: 7px 10px;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    background: #fff;
    color: #475569;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.12s;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
}
.fp-btn:hover {
    background: #f1f5f9;
    border-color: #cbd5e1;
    color: #0f172a;
}
.fp-btn:active { transform: scale(0.97); background: #e2e8f0; }

/* TOAST */
#fp-toast {
    position: fixed;
    bottom: 80px;
    left: 50%;
    transform: translateX(-50%) translateY(10px);
    background: #0f172a;
    color: #fff;
    font-weight: 700;
    font-size: 11.5px;
    padding: 8px 16px;
    border-radius: 7px;
    box-shadow: 0 6px 18px rgba(0,0,0,0.25);
    z-index: 60000;
    opacity: 0;
    transition: opacity 0.2s, transform 0.2s;
    pointer-events: none;
    font-family: -apple-system, system-ui, sans-serif;
    white-space: nowrap;
}
#fp-toast.sh {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
}

/* ============================================================
   MOBILE BOTTOM SHEET — FIXED HEIGHT
   ============================================================ */
@media (max-width: 640px) {
    #feature-info-popup {
        top: auto;
        left: 0;
        right: 0;
        bottom: 0;
        transform: none;
        width: 100%;
        height: 60vh;
        max-width: 100%;
        max-height: none;
        border-radius: 16px 16px 0 0;
        border-left: none;
        border-right: none;
        border-bottom: none;
        box-shadow: 0 -6px 30px rgba(0,0,0,0.2);
        padding-bottom: env(safe-area-inset-bottom, 0);
    }
    @keyframes fp-appear {
        from { opacity: 0; transform: translateY(26px); }
        to   { opacity: 1; transform: translateY(0); }
    }
    #feature-info-popup.show { animation: fp-appear 0.2s ease; }
    .fp-drag-handle { display: flex; }
    .fp-header { padding: 9px 14px; min-height: 44px; }
    .fp-title { font-size: 14px; }
    .fp-close { width: 36px; height: 36px; font-size: 22px; }
    .fp-nav-btn { width: 32px; height: 32px; font-size: 14px; }
    .fp-row { padding: 10px 14px; }
    .fp-field { font-size: 13px; width: 110px; }
    .fp-value.wrap { max-width: calc(100vw - 150px); }
    .fp-value { font-size: 13px; }
    .fp-btn { min-height: 40px; font-size: 13px; }
    .fp-actions { padding: 9px 12px; }
    .fp-content::-webkit-scrollbar { width: 6px; height: 6px; }
    #fp-toast { bottom: 100px; }
}

#feature-info-popup.fp-dragging { transition: none; }
    `;
    document.head.appendChild(css);

    // --------------------------------------------------------
    // BUILD HTML
    // --------------------------------------------------------
    var popup = document.createElement("div");
    popup.id = "feature-info-popup";
    popup.innerHTML = [
        '<div class="fp-drag-handle" id="fp-drag"></div>',
        '<div class="fp-header">',
        '  <div class="fp-title-wrap">',
        '    <div class="fp-title" id="fp-title">Feature Information</div>',
        '    <div class="fp-subtitle" id="fp-subtitle"></div>',
        '  </div>',
        '  <button type="button" class="fp-close" id="fp-close" aria-label="Close">×</button>',
        '</div>',
        '<div class="fp-nav" id="fp-nav">',
        '  <button type="button" class="fp-nav-btn" id="fp-prev">‹</button>',
        '  <span class="fp-nav-info" id="fp-nav-info">1 of 1</span>',
        '  <button type="button" class="fp-nav-btn" id="fp-next">›</button>',
        '</div>',
        '<div class="fp-content" id="fp-content"></div>',
        '<div class="fp-actions">',
        '  <button type="button" class="fp-btn" id="fp-copy">📋 Copy All</button>',
        '</div>'
    ].join("");
    document.body.appendChild(popup);

    var toast = document.createElement("div");
    toast.id = "fp-toast";
    document.body.appendChild(toast);

    // --------------------------------------------------------
    // REFERENCES
    // --------------------------------------------------------
    var dragHandle = document.getElementById("fp-drag");
    var titleEl = document.getElementById("fp-title");
    var subtitleEl = document.getElementById("fp-subtitle");
    var closeBtn = document.getElementById("fp-close");
    var navEl = document.getElementById("fp-nav");
    var prevBtn = document.getElementById("fp-prev");
    var nextBtn = document.getElementById("fp-next");
    var navInfoEl = document.getElementById("fp-nav-info");
    var contentEl = document.getElementById("fp-content");
    var copyBtn = document.getElementById("fp-copy");

    // --------------------------------------------------------
    // HIGHLIGHT LAYER
    // --------------------------------------------------------
    function ensureHighlightLayer() {
        if (ST.highlightLayer) return;
        ST.highlightLayer = new ol.layer.Vector({
            source: new ol.source.Vector(),
            zIndex: 29000,
            properties: { __fp: true },
            style: new ol.style.Style({
                stroke: new ol.style.Stroke({ color: "#2563eb", width: 3 }),
                fill: new ol.style.Fill({ color: "rgba(37,99,235,0.15)" }),
                image: new ol.style.Circle({
                    radius: 10,
                    stroke: new ol.style.Stroke({ color: "#2563eb", width: 3 }),
                    fill: new ol.style.Fill({ color: "rgba(37,99,235,0.3)" })
                })
            })
        });
        map.addLayer(ST.highlightLayer);
    }
    function setHighlight(feature) {
        ensureHighlightLayer();
        ST.highlightLayer.getSource().clear();
        if (feature && feature.getGeometry()) {
            ST.highlightLayer.getSource().addFeature(new ol.Feature(feature.getGeometry()));
        }
    }
    function clearHighlight() {
        if (ST.highlightLayer) ST.highlightLayer.getSource().clear();
    }

    // --------------------------------------------------------
    // TOAST + CLIPBOARD
    // --------------------------------------------------------
    var toastTmr = null;
    function showToast(m) {
        clearTimeout(toastTmr);
        toast.textContent = m;
        toast.classList.add("sh");
        toastTmr = setTimeout(function () { toast.classList.remove("sh"); }, 2000);
    }
    function clip(text, label) {
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(function () {
                showToast("📋 " + label + " copied");
            }).catch(function () { fbClip(text, label); });
        } else { fbClip(text, label); }
    }
    function fbClip(text, label) {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.cssText = "position:fixed;left:-9999px;opacity:0;";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        try { document.execCommand("copy"); showToast("📋 " + label + " copied"); }
        catch (e) { showToast("❌ Copy failed"); }
        document.body.removeChild(ta);
    }

    // --------------------------------------------------------
    // HELPERS
    // --------------------------------------------------------
    function getLayerName(layer) {
        if (!layer) return "Unknown Layer";
        return layer.get("title") || layer.get("name") || layer.get("layerName") || "Unnamed Layer";
    }
    function cleanFieldName(name) {
        return String(name)
            .replace(/_/g, " ")
            .replace(/([a-z])([A-Z])/g, "$1 $2")
            .replace(/\b\w/g, function (l) { return l.toUpperCase(); });
    }
    function formatValue(v) {
        if (v === null || v === undefined || v === "") return "";
        if (typeof v === "object") {
            try { return JSON.stringify(v); } catch (e) { return String(v); }
        }
        return String(v);
    }
    function isTechnicalField(key) {
        var ignored = ["geometry", "layerObject", "idO", "bbox", "style", "styleUrl", "__fp"];
        return ignored.indexOf(key) !== -1 || key.indexOf("__") === 0;
    }
    function escHtml(s) {
        var div = document.createElement("div");
        div.textContent = s;
        return div.innerHTML;
    }

    // --------------------------------------------------------
    // PROTECTION
    // --------------------------------------------------------
    function isPopupBlocked() {
        if (window.parcelSubdivisionToolActive === true) return true;
        if (window.stage14MeasureActive === true) return true;
        if (window.msdDivisionActive === true) return true;
        if (window.s16PickerActive === true) return true;
        return false;
    }

    // --------------------------------------------------------
    // RENDER CONTENT
    // --------------------------------------------------------
    function renderContent() {
        var feat = ST.features[ST.activeIdx];
        if (!feat) {
            contentEl.innerHTML = '<div class="fp-no-attrs">No feature selected</div>';
            return;
        }

        var feature = feat.feature;
        var layer = feat.layer;

        titleEl.textContent = "📋 Feature Information";
        subtitleEl.textContent = getLayerName(layer);

        setHighlight(feature);

        var props = feature.getProperties();
        var keys = Object.keys(props).filter(function (k) { return !isTechnicalField(k); });

        if (keys.length === 0) {
            contentEl.innerHTML = '<div class="fp-no-attrs">No attributes available</div>';
            updateNav();
            return;
        }

        var html = "";
        keys.forEach(function (key) {
            var fieldName = cleanFieldName(key);
            var strVal = formatValue(props[key]);
            var valHtml = strVal ? escHtml(strVal) : '<span class="fp-value-empty">—</span>';

            // Smart Wrapping layout if character length > 50
            var isLong = strVal.length > 50;
            var valClass = "fp-value" + (isLong ? " wrap" : "");

            html += '<div class="fp-row" data-copy="' + encodeURIComponent(fieldName + ": " + strVal) + '" data-label="' + escHtml(fieldName) + '">' +
                '<div class="fp-field">' + escHtml(fieldName) + '</div>' +
                '<div class="' + valClass + '">' + valHtml + '</div>' +
                '</div>';
        });

        contentEl.innerHTML = html;

        contentEl.querySelectorAll(".fp-row").forEach(function (row) {
            row.addEventListener("click", function () {
                clip(decodeURIComponent(row.dataset.copy), row.dataset.label);
            });
        });

        updateNav();
    }

    function updateNav() {
        if (ST.features.length > 1) {
            navEl.classList.add("show");
            navInfoEl.textContent = (ST.activeIdx + 1) + " of " + ST.features.length + " features";
            prevBtn.disabled = ST.activeIdx === 0;
            nextBtn.disabled = ST.activeIdx === ST.features.length - 1;
        } else {
            navEl.classList.remove("show");
        }
    }

    // --------------------------------------------------------
    // SHOW / HIDE
    // --------------------------------------------------------
    function showPopup(features, coord) {
        if (isPopupBlocked()) return;
        if (!features || features.length === 0) return;

        ST.features = features;
        ST.activeIdx = 0;
        ST.activeCoord = coord;

        popup.style.transform = "";
        popup.classList.add("show");

        contentEl.scrollTop = 0;
        contentEl.scrollLeft = 0;

        renderContent();
    }

    function closePopup() {
        popup.classList.remove("show");
        popup.style.transform = "";
        ST.features = [];
        ST.activeIdx = 0;
        clearHighlight();
    }

    window.closeFeaturePopup = closePopup;

    // --------------------------------------------------------
    // MAP CLICK
    // --------------------------------------------------------
    map.on("singleclick", function (evt) {
        if (isPopupBlocked()) {
            closePopup();
            return;
        }

        var found = [];
        map.forEachFeatureAtPixel(evt.pixel, function (feature, layer) {
            if (!layer) return;
            if (!(layer instanceof ol.layer.Vector)) return;
            if (layer.get && (layer.get("__fp") || layer.get("__s16") || layer.get("__msd"))) return;
            if (layer === window.stage14MeasureLayer) return;
            if (layer === window.stage14SnapLayer) return;
            if (layer === window.parcelSubdivisionResultLayer) return;
            if (layer === window.parcelSubdivisionDimensionLayer) return;
            found.push({ feature: feature, layer: layer });
        }, {
            hitTolerance: 8,
            layerFilter: function (layer) {
                if (!(layer instanceof ol.layer.Vector)) return false;
                if (!layer.getVisible()) return false;
                if (layer.get && (layer.get("__fp") || layer.get("__s16") || layer.get("__msd"))) return false;
                if (layer === window.stage14MeasureLayer) return false;
                if (layer === window.stage14SnapLayer) return false;
                if (layer === window.parcelSubdivisionResultLayer) return false;
                if (layer === window.parcelSubdivisionDimensionLayer) return false;
                return true;
            }
        });

        if (found.length === 0) {
            closePopup();
            return;
        }
        showPopup(found, evt.coordinate);
    });

    // --------------------------------------------------------
    // BUTTONS
    // --------------------------------------------------------
    closeBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        closePopup();
    });

    prevBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        if (ST.activeIdx > 0) {
            ST.activeIdx--;
            contentEl.scrollTop = 0;
            contentEl.scrollLeft = 0;
            renderContent();
        }
    });
    nextBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        if (ST.activeIdx < ST.features.length - 1) {
            ST.activeIdx++;
            contentEl.scrollTop = 0;
            contentEl.scrollLeft = 0;
            renderContent();
        }
    });

    copyBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        var feat = ST.features[ST.activeIdx];
        if (!feat || !feat.feature) return;
        var props = feat.feature.getProperties();
        var lines = [];
        lines.push("Layer: " + getLayerName(feat.layer));
        lines.push("---");
        Object.keys(props).forEach(function (key) {
            if (isTechnicalField(key)) return;
            lines.push(cleanFieldName(key) + ": " + formatValue(props[key]));
        });
        clip(lines.join("\n"), "All attributes");
    });

    // --------------------------------------------------------
    // KEYBOARD
    // --------------------------------------------------------
    document.addEventListener("keydown", function (e) {
        if (!popup.classList.contains("show")) return;
        if (e.key === "Escape") {
            e.preventDefault();
            closePopup();
        } else if (e.key === "ArrowLeft" && ST.features.length > 1) {
            e.preventDefault();
            if (ST.activeIdx > 0) {
                ST.activeIdx--;
                contentEl.scrollTop = 0;
                contentEl.scrollLeft = 0;
                renderContent();
            }
        } else if (e.key === "ArrowRight" && ST.features.length > 1) {
            e.preventDefault();
            if (ST.activeIdx < ST.features.length - 1) {
                ST.activeIdx++;
                contentEl.scrollTop = 0;
                contentEl.scrollLeft = 0;
                renderContent();
            }
        }
    });

    // --------------------------------------------------------
    // MOBILE DRAG-TO-DISMISS
    // --------------------------------------------------------
    function onTouchStart(e) {
        if (!ST.isMobile) return;
        if (e.touches.length !== 1) return;
        ST.touchStartY = e.touches[0].clientY;
        ST.touchCurrentY = ST.touchStartY;
        ST.touchDragging = true;
        popup.classList.add("fp-dragging");
    }
    function onTouchMove(e) {
        if (!ST.touchDragging) return;
        if (e.touches.length !== 1) return;
        ST.touchCurrentY = e.touches[0].clientY;
        var delta = ST.touchCurrentY - ST.touchStartY;
        if (delta > 0) {
            popup.style.transform = "translateY(" + delta + "px)";
            e.preventDefault();
        }
    }
    function onTouchEnd() {
        if (!ST.touchDragging) return;
        ST.touchDragging = false;
        popup.classList.remove("fp-dragging");
        var delta = ST.touchCurrentY - ST.touchStartY;
        if (delta > 100) {
            closePopup();
        } else {
            popup.style.transform = "";
        }
    }

    dragHandle.addEventListener("touchstart", onTouchStart, { passive: false });
    dragHandle.addEventListener("touchmove", onTouchMove, { passive: false });
    dragHandle.addEventListener("touchend", onTouchEnd);

    document.querySelector(".fp-header").addEventListener("touchstart", function (e) {
        if (!ST.isMobile) return;
        if (e.target.closest(".fp-close")) return;
        onTouchStart(e);
    }, { passive: false });

    popup.addEventListener("click", function (e) {
        e.stopPropagation();
    });

    closePopup();

    console.log("📋 Stage 5 Popup v2.3 READY (wrap >50)");

})();