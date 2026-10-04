// ============================================================
// 🧰 MAP TOOL MANAGER v3.5 - STABLE
// Drag · Show/Hide · Persist · Dynamic Registration Handshake
//
// v3.5 CHANGELOG
//  ✔ Updated 'coords' selector to recognize Coordinate HUD v5.x
//  ✔ Updated default position to bottom-left (matches new HUD)
//  ✔ Legacy '.coordinates-readout' kept as fallback selector
//  ✔ All v3.4 features retained
// ============================================================

(function () {
    'use strict';

    /* ================================================================
       STORAGE KEYS & AUTO-LOAD CONFIG
       ================================================================ */
    var POS_KEY = 'map-ctrl-positions-v3';
    var VIS_KEY = 'map-ctrl-visibility-v3';

    var JS_FOLDER_PATH = 'js/';

    var STATIC_FALLBACK_FILES = [
        'stage6-attribute-search.js',
        'stage14-measure-tool.js',
        'stage16-external-basemaps.js',
        'stage17-advanced-export.js',
        'gis-import-tool.js'
    ];

    /* ================================================================
       BUILT-IN CONTROL REGISTRY
       ================================================================ */
    var CONTROLS = [
        { id: 'zoom',          name: 'Zoom',             icon: '🔍', selector: '.ol-zoom',                                                   defaults: { top: 12,  left: 12 },  visible: true },
        { id: 'measure',       name: 'Measure',          icon: '📏', selector: '#stage14-control, #stage14-measure-button',                   defaults: { top: 132, left: 12 },  visible: true },
        { id: 'geolocate',     name: 'My Location',      icon: '📍', selector: '.ol-control.geolocate',                                      defaults: { top: 184, left: 12 },  visible: true },
        { id: 'style-btn',     name: 'Style Editor',     icon: '🎨', selector: '#dynamic-style-open-button, .dynamic-style-control',         defaults: { top: 236, left: 12 },  visible: true },
        { id: 'search',        name: 'Search',           icon: '🔎', selector: '#stage6-search-button, #btn-search',                         defaults: { top: 288, left: 12 },  visible: true },
        { id: 'msd',           name: 'Polygon Division', icon: '✂️', selector: '#msd-toggle-btn',                                            defaults: { top: 340, left: 12 },  visible: true },
        { id: 'stage17',       name: 'Export Layers',    icon: '📤', selector: '#stage17-export-button',                                     defaults: { top: 392, left: 12 },  visible: true },
        { id: 'import',        name: 'Import GIS Data',  icon: '📂', selector: '#gis-import-button',                                         defaults: { top: 444, left: 12 },  visible: true },
        { id: 'north',         name: 'North Arrow',      icon: '🧭', selector: '.stage15-north-symbol',                                      defaults: { top: 12,  right: 12 }, visible: true },
        { id: 'layers',        name: 'Layer Switcher',   icon: '📑', selector: '.layer-switcher',                                            defaults: { top: 78,  right: 12 }, visible: true },
        { id: 'stage16',       name: 'External Maps',    icon: '🌐', selector: '#stage16-map-services-button',                               defaults: { top: 136, right: 12 }, visible: true },
        /* ★ UPDATED selector + default position for Coordinate HUD v5.x */
        { id: 'coords',        name: 'Coordinate HUD',   icon: '📐', selector: '#stage16-coordinate-hud, .s16-root, .coordinates-readout',    defaults: { bottom: 14, left: 14 }, visible: true }
    ];

    /* Merge anything that registered before we loaded */
    (window.MapToolRegistry || []).forEach(function (cfg) {
        if (!cfg || !cfg.id) return;
        var exists = CONTROLS.some(function (c) { return c.id === cfg.id; });
        if (!exists) CONTROLS.push(cfg);
    });

    window.MapToolRegistry = CONTROLS;

    /* ================================================================
       STATE
       ================================================================ */
    var editMode = false;
    var panelOpen = false;
    var positions = {};
    var visibility = {};
    var elements = new Map();
    var drag = null;

    var toggleBtn, panel;

    /* ================================================================
       DYNAMIC LOADER ENGINE
       ================================================================ */
    function loadScripts(files) {
        var existingScripts = Array.from(document.querySelectorAll('script')).map(function (s) {
            return (s.getAttribute('src') || '').toLowerCase();
        });

        files.forEach(function (file) {
            var fullPath = (file.indexOf('/') === -1) ? (JS_FOLDER_PATH + file) : file;
            var lowPath = fullPath.toLowerCase();

            var alreadyLoaded = existingScripts.some(function (src) {
                return src.indexOf(lowPath) !== -1 || lowPath.indexOf(src) !== -1;
            });

            if (!alreadyLoaded) {
                var s = document.createElement('script');
                s.src = fullPath;
                s.async = true;
                document.head.appendChild(s);
            }
        });
    }

    function autoHarvestTools() {
        fetch(JS_FOLDER_PATH)
            .then(function (res) {
                if (!res.ok) throw new Error("Directory indexing unavailable");
                return res.text();
            })
            .then(function (html) {
                var regex = /href="([^"]+\.js)"/gi;
                var match, files = [];
                while ((match = regex.exec(html)) !== null) {
                    var f = match[1];
                    if (f.indexOf('map-tool-manager') === -1) {
                        files.push(f);
                    }
                }
                if (files.length > 0) {
                    loadScripts(files);
                } else {
                    loadScripts(STATIC_FALLBACK_FILES);
                }
            })
            .catch(function () {
                loadScripts(STATIC_FALLBACK_FILES);
            });
    }

    /* ================================================================
       CSS INJECTION
       ================================================================ */
    function injectCSS() {
        if (document.getElementById('map-tool-manager-css')) return;

        var style = document.createElement('style');
        style.id = 'map-tool-manager-css';
        style.textContent = `

.map-control-hidden {
    display: none !important;
    visibility: hidden !important;
    pointer-events: none !important;
}

body.drag-edit-mode .map-control-hidden {
    display: flex !important;
    visibility: visible !important;
    pointer-events: auto !important;
    opacity: .3 !important;
    filter: grayscale(1);
}

body.drag-edit-mode .map-control-hidden:hover { opacity: .55 !important; }

.draggable-control { touch-action: none; user-select: none; }

body.drag-edit-mode .draggable-control {
    outline: 2px dashed var(--ui-accent, #1f6feb) !important;
    outline-offset: 3px;
    cursor: grab !important;
    transform: none !important;
    animation: none !important;
}

body.drag-edit-mode .draggable-control:hover { transform: none !important; }

body.drag-edit-mode .draggable-control > *:not(.ctrl-badge) {
    pointer-events: none !important;
}

.draggable-control.is-dragging {
    z-index: 100000 !important;
    opacity: .9 !important;
    transform: none !important;
    transition: none !important;
    cursor: grabbing !important;
    box-shadow: 0 8px 32px rgba(16,24,40,.35) !important;
}

.ctrl-badge {
    position: absolute;
    top: -8px; right: -8px;
    width: 20px; height: 20px;
    border-radius: 50%;
    border: 2px solid #fff;
    display: none;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    line-height: 1;
    font-family: system-ui, sans-serif;
    cursor: pointer;
    z-index: 100002;
    box-shadow: 0 1px 4px rgba(0,0,0,.28);
    transition: transform .1s ease;
    pointer-events: auto !important;
}

.ctrl-badge:hover { transform: scale(1.22); }
.ctrl-badge--visible { background: #dc2626; color: #fff; }
.ctrl-badge--hidden  { background: #16a34a; color: #fff; }
body.drag-edit-mode .ctrl-badge { display: flex; }

#toolbar-toggle {
    position: fixed;
    bottom: 12px; left: 12px;
    z-index: 99990;
    width: 44px; height: 44px;
    display: flex; align-items: center; justify-content: center;
    background: var(--ui-bg, #fff);
    color: var(--ui-text, #1d2430);
    border: 1px solid var(--ui-border, #d7dce3);
    border-radius: 50%;
    box-shadow: 0 1px 4px rgba(16,24,40,.16);
    cursor: pointer;
    font-size: 20px;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
    transition: background .15s ease, border-color .15s ease, transform .15s ease;
}

#toolbar-toggle:hover {
    background: var(--ui-bg-hover, #eef1f5);
    border-color: var(--ui-accent, #1f6feb);
    transform: scale(1.08);
}

#toolbar-toggle.active {
    background: var(--ui-accent, #1f6feb);
    border-color: var(--ui-accent, #1f6feb);
    color: #fff;
}

#tool-manager-panel {
    position: fixed;
    bottom: 66px; left: 12px;
    z-index: 56000;
    width: 264px;
    max-width: calc(100vw - 24px);
    max-height: calc(100vh - 100px);
    background: var(--ui-bg, #fff);
    border: 1px solid var(--ui-border, #d7dce3);
    border-radius: 10px;
    box-shadow: 0 4px 18px rgba(16,24,40,.18);
    font-family: var(--ui-font, "Segoe UI", Roboto, system-ui, sans-serif);
    box-sizing: border-box;
    display: none;
    flex-direction: column;
    overflow: hidden;
}

#tool-manager-panel.open { display: flex; animation: tm-up .18s ease; }

@keyframes tm-up {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
}

#tool-manager-panel * { box-sizing: border-box; }

.tm-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 12px;
    background: linear-gradient(135deg, var(--ui-accent, #1f6feb), var(--ui-accent-dark, #1657b0));
    color: #fff; font-size: 13px; font-weight: 700;
    flex-shrink: 0;
}

.tm-close {
    width: 24px; height: 24px;
    display: flex; align-items: center; justify-content: center;
    background: rgba(255,255,255,.18);
    border: none; border-radius: 5px;
    color: #fff; font-size: 15px; cursor: pointer;
}

.tm-close:hover { background: rgba(255,255,255,.34); }

.tm-body { flex: 1; overflow-y: auto; padding: 8px 10px; min-height: 0; }

.tm-tool-row {
    display: flex; align-items: center; gap: 8px;
    padding: 7px 8px; margin-bottom: 4px;
    border: 1px solid var(--ui-border-soft, #e9edf2);
    border-radius: 7px;
    background: var(--ui-bg-subtle, #f5f7fa);
}

.tm-tool-row:hover { background: var(--ui-bg-hover, #eef1f5); }

.tm-switch { position: relative; width: 36px; height: 20px; flex-shrink: 0; cursor: pointer; }
.tm-switch input { position: absolute; opacity: 0; width: 0; height: 0; }

.tm-switch-track {
    position: absolute; inset: 0;
    background: var(--ui-border-strong, #aeb6c2);
    border-radius: 10px; transition: background .2s ease;
}

.tm-switch input:checked + .tm-switch-track { background: var(--ui-accent, #1f6feb); }

.tm-switch-thumb {
    position: absolute; top: 2px; left: 2px;
    width: 16px; height: 16px;
    background: #fff; border-radius: 50%;
    box-shadow: 0 1px 3px rgba(0,0,0,.22);
    transition: transform .2s ease;
}

.tm-switch input:checked ~ .tm-switch-thumb { transform: translateX(16px); }

.tm-tool-icon {
    width: 24px; height: 24px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: 14px; border-radius: 5px;
    background: var(--ui-bg, #fff);
    border: 1px solid var(--ui-border-soft, #e9edf2);
}

.tm-tool-name {
    flex: 1; font-size: 12px; font-weight: 600;
    color: var(--ui-text, #1d2430);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.tm-tool-row.is-hidden .tm-tool-name { color: #8b93a1; text-decoration: line-through; }
.tm-tool-row.is-hidden .tm-tool-icon { opacity: .4; }
.tm-tool-row.missing .tm-tool-name   { font-style: italic; color: #8b93a1; }

.tm-footer {
    display: flex; gap: 6px; padding: 8px 10px;
    border-top: 1px solid var(--ui-border-soft, #e9edf2);
    background: var(--ui-bg-subtle, #f5f7fa);
    flex-shrink: 0;
}

.tm-footer-btn {
    flex: 1; height: 30px;
    display: flex; align-items: center; justify-content: center;
    border: 1px solid var(--ui-border, #d7dce3);
    border-radius: 7px;
    background: var(--ui-bg, #fff);
    color: var(--ui-text, #1d2430);
    font-family: inherit; font-size: 10.5px; font-weight: 700;
    cursor: pointer; white-space: nowrap;
}

.tm-footer-btn:hover { background: var(--ui-bg-hover, #eef1f5); border-color: var(--ui-accent, #1f6feb); }
.tm-footer-btn--accent { background: var(--ui-accent, #1f6feb); border-color: var(--ui-accent, #1f6feb); color: #fff; }
.tm-footer-btn--accent:hover { background: var(--ui-accent-dark, #1657b0); }
.tm-footer-btn--danger { color: #dc2626; border-color: rgba(220,38,38,.3); }
.tm-footer-btn--danger:hover { background: rgba(220,38,38,.08); border-color: #dc2626; }

#drag-mode-banner {
    position: fixed; top: 0; left: 0; right: 0;
    height: 34px;
    display: none; align-items: center; justify-content: center; gap: 8px;
    background: linear-gradient(135deg, var(--ui-accent, #1f6feb), var(--ui-accent-dark, #1657b0));
    color: #fff;
    font-family: var(--ui-font, system-ui, sans-serif);
    font-size: 12px; font-weight: 700;
    z-index: 100003;
    box-shadow: 0 2px 12px rgba(31,111,235,.35);
    user-select: none;
    padding: 0 10px;
    text-align: center;
}

body.drag-edit-mode #drag-mode-banner { display: flex; }

.banner-dot {
    width: 8px; height: 8px; background: #fff; border-radius: 50%;
    animation: tm-pulse 1.2s ease infinite;
}

@keyframes tm-pulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }

@media (max-width: 600px) {
    #toolbar-toggle { width: 40px; height: 40px; font-size: 18px; bottom: 8px; left: 8px; }
    #tool-manager-panel { bottom: 56px; left: 8px; width: calc(100vw - 16px); }
    #drag-mode-banner { font-size: 10.5px; height: 32px; }
}
        `;

        document.head.appendChild(style);
    }

    /* ================================================================
       STORAGE
       ================================================================ */
    function loadState() {
        try { positions = JSON.parse(localStorage.getItem(POS_KEY) || '{}'); }
        catch (e) { positions = {}; }

        try { visibility = JSON.parse(localStorage.getItem(VIS_KEY) || '{}'); }
        catch (e) { visibility = {}; }

        if (visibility['style-control'] !== undefined && visibility['style-btn'] === undefined) {
            visibility['style-btn'] = visibility['style-control'];
        }
        delete visibility['style-control'];

        if (positions['style-control'] && !positions['style-btn']) {
            positions['style-btn'] = positions['style-control'];
        }
        delete positions['style-control'];
    }

    function savePositions() {
        try { localStorage.setItem(POS_KEY, JSON.stringify(positions)); } catch (e) {}
    }

    function saveVisibility() {
        try { localStorage.setItem(VIS_KEY, JSON.stringify(visibility)); } catch (e) {}
    }

    function emit(name, detail) {
        document.dispatchEvent(new CustomEvent(name, { detail: detail }));
    }

    function findElement(cfg) {
        var list = cfg.selector.split(',');
        for (var i = 0; i < list.length; i++) {
            var el = document.querySelector(list[i].trim());
            if (el) return el;
        }
        return null;
    }

    function discover() {
        elements.clear();
        CONTROLS.forEach(function (cfg) {
            var el = findElement(cfg);
            if (el) elements.set(cfg.id, { el: el, cfg: cfg });
        });
    }

    function getPos(cfg) {
        return positions[cfg.id] || Object.assign({}, cfg.defaults);
    }

    function applyPos(el, pos) {
        el.style.removeProperty('top');
        el.style.removeProperty('left');
        el.style.removeProperty('right');
        el.style.removeProperty('bottom');

        if (pos.top !== undefined)
            el.style.setProperty('top', pos.top + 'px', 'important');

        if (pos.left !== undefined)
            el.style.setProperty('left', pos.left + 'px', 'important');

        if (pos.right !== undefined) {
            el.style.setProperty('right', pos.right + 'px', 'important');
            el.style.setProperty('left', 'auto', 'important');
        }

        if (pos.bottom !== undefined) {
            el.style.setProperty('bottom', pos.bottom + 'px', 'important');
            el.style.setProperty('top', 'auto', 'important');
        }

        el.style.setProperty('position', 'fixed', 'important');
        el.style.setProperty('margin', '0', 'important');
    }

    function applyAllPositions() {
        elements.forEach(function (entry) {
            applyPos(entry.el, getPos(entry.cfg));
        });
    }

    function isVisible(id) {
        if (visibility[id] !== undefined) return visibility[id];
        var cfg = CONTROLS.find(function (c) { return c.id === id; });
        return cfg ? cfg.visible !== false : true;
    }

    function paintVisibility(el, show) {
        if (show) {
            el.classList.remove('map-control-hidden');
            el.style.removeProperty('display');
        } else {
            el.classList.add('map-control-hidden');
            if (!editMode) el.style.setProperty('display', 'none', 'important');
            else el.style.removeProperty('display');
        }
    }

    function setVisible(id, show) {
        visibility[id] = show;
        saveVisibility();

        var entry = elements.get(id);
        if (entry) {
            paintVisibility(entry.el, show);
            updateBadge(entry.el, id);
        }

        emit('maptool:visibility', { id: id, visible: show });
        refreshPanel();
    }

    function applyAllVisibility() {
        elements.forEach(function (entry, id) {
            paintVisibility(entry.el, isVisible(id));
        });
    }

    function ptr(e) {
        if (e.touches && e.touches.length)
            return { x: e.touches[0].clientX, y: e.touches[0].clientY };
        return { x: e.clientX, y: e.clientY };
    }

    function onStart(e) {
        if (!editMode) return;

        var el = e.currentTarget;
        var id = el.dataset.ctrlId;
        if (!id) return;

        e.preventDefault();
        e.stopPropagation();

        el.classList.add('is-dragging');
        el.style.setProperty('z-index', '100000', 'important');
        el.dataset.moved = '0';

        var suppress = function (ev) {
            if (el.dataset.moved === '1') {
                ev.stopImmediatePropagation();
                ev.preventDefault();
            }
            el.dataset.moved = '0';
            el.removeEventListener('click', suppress, true);
        };
        el.addEventListener('click', suppress, true);

        var p = ptr(e);
        var r = el.getBoundingClientRect();

        drag = { id: id, el: el, ox: p.x - r.left, oy: p.y - r.top, moved: false };

        document.addEventListener('mousemove', onMove, { passive: false });
        document.addEventListener('mouseup', onEnd);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onEnd);
    }

    function onMove(e) {
        if (!drag) return;
        e.preventDefault();

        drag.moved = true;
        drag.el.dataset.moved = '1';

        var p = ptr(e);
        var el = drag.el;
        var r = el.getBoundingClientRect();

        var vw = window.innerWidth;
        var vh = window.innerHeight;

        var nl = Math.max(0, Math.min(p.x - drag.ox, vw - r.width));
        var nt = Math.max(0, Math.min(p.y - drag.oy, vh - r.height));

        el.style.setProperty('top', nt + 'px', 'important');
        el.style.setProperty('left', nl + 'px', 'important');
        el.style.setProperty('right', 'auto', 'important');
        el.style.setProperty('bottom', 'auto', 'important');
    }

    function onEnd() {
        if (!drag) return;

        var el = drag.el;
        var id = drag.id;

        el.classList.remove('is-dragging');
        el.style.removeProperty('z-index');

        if (drag.moved) {
            var r = el.getBoundingClientRect();
            var vw = window.innerWidth;
            var vh = window.innerHeight;

            var fl = r.left, fr = vw - r.right;
            var ft = r.top,  fb = vh - r.bottom;

            var pos = {};
            if (fr < fl) pos.right = Math.round(fr); else pos.left = Math.round(fl);
            if (fb < ft) pos.bottom = Math.round(fb); else pos.top = Math.round(ft);

            positions[id] = pos;
            savePositions();
            applyPos(el, pos);

            emit('maptool:moved', { id: id, position: pos });
        }

        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onEnd);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onEnd);

        drag = null;
    }

    function updateBadge(el, id) {
        var badge = el.querySelector('.ctrl-badge');
        if (!badge) return;

        if (isVisible(id)) {
            badge.className = 'ctrl-badge ctrl-badge--visible';
            badge.textContent = '✕';
            badge.title = 'Hide this tool';
        } else {
            badge.className = 'ctrl-badge ctrl-badge--hidden';
            badge.textContent = '✓';
            badge.title = 'Show this tool';
        }
    }

    function enterEdit() {
        editMode = true;
        document.body.classList.add('drag-edit-mode');
        discover();

        elements.forEach(function (entry) {
            var el = entry.el;
            var id = entry.cfg.id;

            el.dataset.ctrlId = id;
            el.classList.add('draggable-control');
            el.style.removeProperty('display');

            if (!el.querySelector('.ctrl-badge')) {
                var badge = document.createElement('span');
                badge.className = 'ctrl-badge';
                badge.addEventListener('mousedown', function (ev) { ev.stopPropagation(); });
                badge.addEventListener('touchstart', function (ev) { ev.stopPropagation(); }, { passive: true });
                badge.addEventListener('click', function (ev) {
                    ev.preventDefault();
                    ev.stopPropagation();
                    setVisible(id, !isVisible(id));
                });
                el.appendChild(badge);
            }

            updateBadge(el, id);

            el.addEventListener('mousedown', onStart);
            el.addEventListener('touchstart', onStart, { passive: false });
        });

        toggleBtn.classList.add('active');
        toggleBtn.textContent = '🔓';
        emit('maptool:editmode', { active: true });
    }

    function exitEdit() {
        editMode = false;
        document.body.classList.remove('drag-edit-mode');

        elements.forEach(function (entry) {
            var el = entry.el;
            el.removeEventListener('mousedown', onStart);
            el.removeEventListener('touchstart', onStart);
            el.classList.remove('draggable-control');

            var badge = el.querySelector('.ctrl-badge');
            if (badge) badge.remove();
        });

        applyAllVisibility();

        toggleBtn.classList.remove('active');
        toggleBtn.textContent = '⚙️';
        emit('maptool:editmode', { active: false });
    }

    function openPanel()  { panelOpen = true;  panel.classList.add('open'); refreshPanel(); }
    function closePanel() { panelOpen = false; panel.classList.remove('open'); }
    function togglePanel(){ panelOpen ? closePanel() : openPanel(); }

    function refreshPanel() {
        var body = panel && panel.querySelector('.tm-body');
        if (!body) return;

        body.innerHTML = '';

        CONTROLS.forEach(function (cfg) {
            var exists = elements.has(cfg.id);
            var vis = isVisible(cfg.id);

            var row = document.createElement('div');
            row.className = 'tm-tool-row' +
                (vis ? '' : ' is-hidden') +
                (exists ? '' : ' missing');

            var sw = document.createElement('label');
            sw.className = 'tm-switch';

            var inp = document.createElement('input');
            inp.type = 'checkbox';
            inp.checked = vis;
            inp.disabled = !exists;
            inp.addEventListener('change', function () {
                setVisible(cfg.id, this.checked);
            });

            var track = document.createElement('span');
            track.className = 'tm-switch-track';

            var thumb = document.createElement('span');
            thumb.className = 'tm-switch-thumb';

            sw.appendChild(inp);
            sw.appendChild(track);
            sw.appendChild(thumb);

            var icon = document.createElement('span');
            icon.className = 'tm-tool-icon';
            icon.textContent = cfg.icon || '•';

            var name = document.createElement('span');
            name.className = 'tm-tool-name';
            name.textContent = exists ? cfg.name : cfg.name + ' (not loaded)';

            row.appendChild(sw);
            row.appendChild(icon);
            row.appendChild(name);
            body.appendChild(row);
        });
    }

    function buildUI() {
        toggleBtn = document.createElement('button');
        toggleBtn.id = 'toolbar-toggle';
        toggleBtn.type = 'button';
        toggleBtn.textContent = '⚙️';
        toggleBtn.title = 'Tool Manager';
        toggleBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (editMode) { exitEdit(); closePanel(); }
            else { discover(); togglePanel(); }
        });
        document.body.appendChild(toggleBtn);

        panel = document.createElement('div');
        panel.id = 'tool-manager-panel';
        panel.innerHTML =
            '<div class="tm-header">' +
            '  <span>⚙️ Tool Manager</span>' +
            '  <button class="tm-close" id="tm-close-btn" type="button">✕</button>' +
            '</div>' +
            '<div class="tm-body"></div>' +
            '<div class="tm-footer">' +
            '  <button class="tm-footer-btn tm-footer-btn--accent" id="tm-edit-btn" type="button">✋ Positions</button>' +
            '  <button class="tm-footer-btn" id="tm-showall-btn" type="button">👁 All</button>' +
            '  <button class="tm-footer-btn tm-footer-btn--danger" id="tm-reset-btn" type="button">↺ Reset</button>' +
            '</div>';
        document.body.appendChild(panel);

        var banner = document.createElement('div');
        banner.id = 'drag-mode-banner';
        banner.innerHTML =
            '<span class="banner-dot"></span>' +
            'EDIT MODE — drag to move · ✕ hides · ✓ shows · 🔓 to finish';
        document.body.appendChild(banner);

        document.getElementById('tm-close-btn')
            .addEventListener('click', closePanel);

        document.getElementById('tm-edit-btn')
            .addEventListener('click', function () { closePanel(); enterEdit(); });

        document.getElementById('tm-showall-btn')
            .addEventListener('click', function () {
                CONTROLS.forEach(function (c) { setVisible(c.id, true); });
            });

        document.getElementById('tm-reset-btn')
            .addEventListener('click', function () {
                if (!confirm('Reset all tool positions and visibility?')) return;

                positions = {};
                visibility = {};
                try {
                    localStorage.removeItem(POS_KEY);
                    localStorage.removeItem(VIS_KEY);
                } catch (e) {}

                discover();
                applyAllPositions();
                applyAllVisibility();

                elements.forEach(function (entry) {
                    updateBadge(entry.el, entry.cfg.id);
                });

                refreshPanel();
            });

        panel.addEventListener('click', function (e) { e.stopPropagation(); });
    }

    function init() {
        injectCSS();
        buildUI();
        loadState();

        autoHarvestTools();

        discover();
        applyAllPositions();
        applyAllVisibility();
    }

    if (document.readyState === 'loading') {
        document.addEventListener("DOMContentLoaded", function () { setTimeout(init, 250); });
    } else {
        setTimeout(init, 250);
    }

    var pending = null;
    new MutationObserver(function () {
        if (editMode) return;
        clearTimeout(pending);
        pending = setTimeout(function () {
            discover();
            applyAllPositions();
            applyAllVisibility();
            if (panelOpen) refreshPanel();
        }, 200);
    }).observe(document.body, { childList: true, subtree: true });

    window.addEventListener('resize', function () {
        elements.forEach(function (entry) {
            var el = entry.el;
            var r = el.getBoundingClientRect();
            var vw = window.innerWidth, vh = window.innerHeight;

            if (r.right > vw || r.bottom > vh || r.left < 0 || r.top < 0) {
                applyPos(el, getPos(entry.cfg));
            }
        });
    });

    window.MapToolManager = {
        register: function (cfg) {
            if (!cfg || !cfg.id) return;
            
            var existingIdx = -1;
            for (var i = 0; i < CONTROLS.length; i++) {
                if (CONTROLS[i].id === cfg.id) {
                    existingIdx = i;
                    break;
                }
            }
            
            if (existingIdx !== -1) {
                CONTROLS[existingIdx].selector = cfg.selector;
                CONTROLS[existingIdx].defaults = cfg.defaults;
                if (cfg.icon) CONTROLS[existingIdx].icon = cfg.icon;
                if (cfg.name) CONTROLS[existingIdx].name = cfg.name;
            } else {
                CONTROLS.push(cfg);
            }
            
            discover();
            applyAllPositions();
            applyAllVisibility();
            if (panelOpen) refreshPanel();
        },
        openPanel: openPanel,
        closePanel: closePanel,
        enterEditMode: enterEdit,
        exitEditMode: exitEdit,
        showTool: function (id) { setVisible(id, true); },
        hideTool: function (id) { setVisible(id, false); },
        isVisible: isVisible,
        getPositions: function () { return JSON.parse(JSON.stringify(positions)); },
        setPosition: function (id, pos) {
            positions[id] = pos;
            savePositions();
            var e = elements.get(id);
            if (e) { applyPos(e.el, pos); emit('maptool:moved', { id: id, position: pos }); }
        },
        refresh: function () {
            discover();
            applyAllPositions();
            applyAllVisibility();
            if (panelOpen) refreshPanel();
        }
    };

})();