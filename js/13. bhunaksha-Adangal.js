/* ============================================================
   Adangal TOOL — Enhanced with Caching v2.1
   Web Map Survey | QGIS2Web + OpenLayers
   Version: 2.1
   ------------------------------------------------------------
   Sections:
   1. View Cached Village Data  (lookup from IndexedDB)
   2. Cache Village Data        (bulk fetch + store in IndexedDB)
   3. Import / Export           (CSV / JSON with Telugu support)
   ------------------------------------------------------------
   Improvements:
   - Persistent job state survives page reload (localStorage)
   - Dynamic fetch delay based on network speed
   - Telugu / Unicode font support in export & display
   ============================================================ */

(function () {
    'use strict';

    // ----------------------------------------------------------
    // CONFIGURATION
    // ----------------------------------------------------------
    var API_URL         = 'https://bhunaksha-ap-proxy.gsaikiran11.workers.dev/';
    var TOOL_ID         = 'bhunaksha-compact-tool';
    var STYLE_ID        = 'bhunaksha-compact-style';
    var DB_NAME         = 'AdangalCacheDB';
    var DB_STORE        = 'parcels';
    var DB_VER          = 1;
    var REQUEST_TIMEOUT = 25000;
    var JOB_STATE_KEY   = 'adangal_cache_job_state';

    // Dynamic speed config
    var MIN_DELAY_MS    = 150;
    var MAX_DELAY_MS    = 3000;
    var DEFAULT_DELAY   = 400;
    var SPEED_WINDOW    = 8;   // rolling window for avg response time

    if (document.getElementById(TOOL_ID)) return;

    // ----------------------------------------------------------
    // FIELD DEFINITIONS
    // ----------------------------------------------------------
    var FIELD_DEFINITIONS = [
        { key:'villageName',        label:'Village Name',         aliases:['Village Name','Village','గ్రామం పేరు'] },
        { key:'villageCode',        label:'Village Code',         aliases:['Village Code','VillageCode','Village ID'] },
        { key:'oldSurveyNo',        label:'Old Sy.No.',           aliases:['Old Survey No.','Old Survey No','Old Sy.No.','Old Sy No','Old Survey Number','Old Sy.No'] },
        { key:'lpmNo',              label:'LPM No.',              aliases:['LPM No.','LP No.','LPM Number','LP Number','Plot No.','Plot Number'] },
        { key:'extent',             label:'Extent',               aliases:['Extent in Acres','Extent (Acres)','Extent','Area'] },
        { key:'landNature',         label:'Land Nature',          aliases:['Land Nature','Nature of Land'] },
        { key:'landClassification', label:'Land Classification',  aliases:['Land Classification','Classification of Land'] },
        { key:'kathaNo',            label:'Katha No.',            aliases:['Khata No.','Khata No','Katha No.','Katha No','Khata Number','Katha Number'] },
        { key:'pattadarName',       label:'Name of the Pattadar', aliases:['Name of the Pattadar','Pattadar Name','Pattadar','Owner Name'] },
        { key:'fatherName',         label:'Father/Husband Name',  aliases:['Father/ Husband Name','Father / Husband Name','Father/Husband Name','Father Name','Husband Name','Father or Husband Name'] }
    ];

    // ----------------------------------------------------------
    // STYLES (with Telugu / Unicode font support)
    // ----------------------------------------------------------
    var css = `
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Telugu:wght@400;500;600;700&display=swap');

    #${TOOL_ID} {
        font-family: 'Noto Sans Telugu', Arial, Helvetica, sans-serif;
        color:#202124; font-size:14px;
    }
    #${TOOL_ID} * { box-sizing: border-box; }

    #${TOOL_ID} .bn-open {
        position:fixed; left:12px; bottom:64px; z-index:17010;
        width:49px; height:49px; border:0; border-radius:50%;
        background:#1f6feb; color:#fff; font-size:23px; line-height:1;
        box-shadow:0 3px 12px rgba(0,0,0,.28); cursor:pointer;
        display:flex; align-items:center; justify-content:center;
        -webkit-tap-highlight-color:transparent;
    }
    #${TOOL_ID} .bn-open:active { transform:scale(.96); }

    #${TOOL_ID} .bn-panel {
        position:fixed; left:12px; bottom:122px; z-index:50000;
        width:min(390px,calc(100vw - 24px));
        max-height:min(80vh,700px);
        display:none; flex-direction:column;
        background:#fff; border:1px solid #d9e0e8; border-radius:13px;
        box-shadow:0 5px 24px rgba(0,0,0,.25); overflow:hidden;
    }
    #${TOOL_ID} .bn-panel.bn-visible { display:flex; }

    #${TOOL_ID} .bn-header {
        flex-shrink:0; padding:11px 12px; background:#1f6feb; color:#fff;
        display:flex; align-items:center; justify-content:space-between; gap:8px;
    }
    #${TOOL_ID} .bn-heading { font-size:15px; font-weight:700; line-height:1.3; }
    #${TOOL_ID} .bn-subheading { font-size:11px; opacity:.9; margin-top:3px; }
    #${TOOL_ID} .bn-close {
        flex-shrink:0; width:32px; height:32px; border:0; border-radius:8px;
        color:#fff; background:rgba(255,255,255,.17); font-size:21px; cursor:pointer;
    }

    #${TOOL_ID} .bn-tabs {
        display:flex; background:#f3f6fa; border-bottom:1px solid #e0e4e9; flex-shrink:0;
    }
    #${TOOL_ID} .bn-tab {
        flex:1; padding:10px 6px; border:0; background:transparent;
        font-size:11.5px; font-weight:700; color:#596579; cursor:pointer;
        border-bottom:3px solid transparent; font-family:inherit;
    }
    #${TOOL_ID} .bn-tab.bn-tab-active { color:#1f6feb; border-bottom-color:#1f6feb; background:#fff; }

    #${TOOL_ID} .bn-body {
        padding:12px; overflow-y:auto; overscroll-behavior:contain;
        font-family:'Noto Sans Telugu', Arial, Helvetica, sans-serif;
    }
    #${TOOL_ID} .bn-section { display:none; }
    #${TOOL_ID} .bn-section.bn-section-active { display:block; }

    #${TOOL_ID} .bn-label { display:block; font-size:12px; font-weight:700; margin:0 0 5px; color:#3c4654; }
    #${TOOL_ID} .bn-input, #${TOOL_ID} .bn-select {
        display:block; width:100%; min-width:0; height:41px; padding:9px 10px;
        border:1px solid #cbd3dd; border-radius:8px; background:#fff;
        color:#202124; font-size:14px; outline:none; font-family:inherit;
    }
    #${TOOL_ID} .bn-input:focus, #${TOOL_ID} .bn-select:focus {
        border-color:#1f6feb; box-shadow:0 0 0 2px rgba(31,111,235,.12);
    }

    #${TOOL_ID} .bn-fields { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px; }
    #${TOOL_ID} .bn-field { min-width:0; }
    #${TOOL_ID} .bn-field-full { grid-column:1 / -1; }

    #${TOOL_ID} .bn-btn {
        width:100%; min-height:41px; border:0; border-radius:8px; padding:10px;
        color:#fff; background:#1f6feb; font-size:14px; font-weight:700;
        cursor:pointer; font-family:inherit;
    }
    #${TOOL_ID} .bn-btn:disabled { opacity:.5; cursor:not-allowed; }
    #${TOOL_ID} .bn-btn-green  { background:#188038; }
    #${TOOL_ID} .bn-btn-red    { background:#c5221f; }
    #${TOOL_ID} .bn-btn-orange { background:#e8710a; }

    #${TOOL_ID} .bn-btn-row { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-top:10px; }
    #${TOOL_ID} .bn-btn-row .bn-btn { font-size:12px; min-height:38px; padding:8px; }

    #${TOOL_ID} .bn-status {
        display:none; margin-top:10px; padding:9px 10px; border-radius:7px;
        font-size:12px; line-height:1.45; overflow-wrap:anywhere;
    }
    #${TOOL_ID} .bn-status.bn-info    { display:block; color:#174ea6; background:#e8f0fe; }
    #${TOOL_ID} .bn-status.bn-error   { display:block; color:#a32121; background:#fce8e6; }
    #${TOOL_ID} .bn-status.bn-success { display:block; color:#137333; background:#e6f4ea; }
    #${TOOL_ID} .bn-status.bn-warn    { display:block; color:#7c4d12; background:#fef7e0; }

    #${TOOL_ID} .bn-result {
        display:none; margin-top:12px; border:1px solid #e0e4e9;
        border-radius:9px; overflow:hidden;
    }
    #${TOOL_ID} .bn-result.bn-result-visible { display:block; }
    #${TOOL_ID} .bn-result-title {
        padding:10px; background:#f3f6fa; border-bottom:1px solid #e0e4e9;
        font-weight:700; font-size:13px;
    }
    #${TOOL_ID} .bn-detail {
        display:grid; grid-template-columns:minmax(115px,42%) minmax(0,1fr);
        gap:8px; padding:8px 10px; border-bottom:1px solid #edf0f3;
        line-height:1.4; font-size:12px;
    }
    #${TOOL_ID} .bn-detail:last-child { border-bottom:0; }
    #${TOOL_ID} .bn-detail-label { color:#596579; font-weight:600; overflow-wrap:anywhere; }
    #${TOOL_ID} .bn-detail-value {
        color:#202124; font-weight:500; overflow-wrap:anywhere; white-space:pre-wrap;
        font-family:'Noto Sans Telugu', Arial, Helvetica, sans-serif;
    }

    #${TOOL_ID} .bn-actions { display:grid; grid-template-columns:1fr; gap:8px; margin-top:10px; padding:0 10px 10px; }

    #${TOOL_ID} .bn-progress {
        margin-top:12px; padding:10px; border:1px solid #e0e4e9;
        border-radius:9px; background:#fafbfc; font-size:12px;
    }
    #${TOOL_ID} .bn-progress-bar {
        width:100%; height:8px; background:#e0e4e9; border-radius:4px;
        overflow:hidden; margin:8px 0;
    }
    #${TOOL_ID} .bn-progress-fill {
        height:100%; background:#1f6feb; width:0%; transition:width .2s;
    }
    #${TOOL_ID} .bn-stats {
        display:grid; grid-template-columns:repeat(4,1fr); gap:6px;
        margin-top:8px; font-size:11px;
    }
    #${TOOL_ID} .bn-stat {
        text-align:center; padding:6px 4px; background:#fff;
        border:1px solid #e0e4e9; border-radius:6px;
    }
    #${TOOL_ID} .bn-stat-num { font-weight:700; font-size:14px; display:block; }
    #${TOOL_ID} .bn-stat-ok   { color:#137333; }
    #${TOOL_ID} .bn-stat-err  { color:#a32121; }
    #${TOOL_ID} .bn-stat-tot  { color:#174ea6; }
    #${TOOL_ID} .bn-stat-spd  { color:#7c4d12; }

    #${TOOL_ID} .bn-speed-info {
        margin-top:8px; padding:6px 8px; background:#fef7e0;
        border-radius:6px; font-size:11px; color:#7c4d12;
        display:flex; justify-content:space-between; align-items:center;
    }

    #${TOOL_ID} .bn-log {
        margin-top:8px; max-height:140px; overflow-y:auto;
        background:#fff; border:1px solid #e0e4e9; border-radius:6px;
        padding:6px; font-family:ui-monospace,Menlo,Consolas,monospace;
        font-size:10.5px; line-height:1.45;
    }
    #${TOOL_ID} .bn-log-item { padding:2px 4px; border-bottom:1px dashed #eef0f3; }
    #${TOOL_ID} .bn-log-item:last-child { border-bottom:0; }
    #${TOOL_ID} .bn-log-ok  { color:#137333; }
    #${TOOL_ID} .bn-log-err { color:#a32121; }
    #${TOOL_ID} .bn-log-info{ color:#174ea6; }

    #${TOOL_ID} .bn-db-info {
        margin-top:10px; padding:8px 10px; background:#f3f6fa;
        border-radius:7px; font-size:11px; color:#596579;
    }

    #${TOOL_ID} .bn-resume-banner {
        margin-bottom:10px; padding:10px; background:#fef7e0;
        border:1px solid #f5c542; border-radius:8px; font-size:12px;
        color:#7c4d12; line-height:1.45;
    }
    #${TOOL_ID} .bn-resume-banner strong { color:#5d3a08; }
    #${TOOL_ID} .bn-resume-actions { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px; }
    #${TOOL_ID} .bn-resume-actions .bn-btn { font-size:12px; min-height:34px; padding:6px 8px; }

    #${TOOL_ID} .bn-footer { padding-top:9px; font-size:10px; line-height:1.4; color:#687386; text-align:center; }

    @media (max-width:420px) {
        #${TOOL_ID} .bn-panel { left:8px; bottom:112px; width:calc(100vw - 16px); max-height:78vh; }
        #${TOOL_ID} .bn-open { left:10px; bottom:60px; }
        #${TOOL_ID} .bn-body { padding:10px; }
        #${TOOL_ID} .bn-detail { grid-template-columns:minmax(105px,42%) minmax(0,1fr); padding:8px; }
        #${TOOL_ID} .bn-stats { grid-template-columns:repeat(2,1fr); }
    }
    @media (max-height:520px) {
        #${TOOL_ID} .bn-panel { max-height:82vh; bottom:65px; }
    }
    `;

    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);

    // ----------------------------------------------------------
    // BUILD UI
    // ----------------------------------------------------------
    var root = document.createElement('div');
    root.id = TOOL_ID;
    root.innerHTML = `
        <button type="button" class="bn-open" title="Adangal"
                aria-label="Open Adangal" aria-expanded="false">🗺️</button>

        <section class="bn-panel" aria-label="Adangal tool">
            <div class="bn-header">
                <div>
                    <div class="bn-heading">Adangal</div>
                    <div class="bn-subheading">Land parcel cache &amp; lookup</div>
                </div>
                <button type="button" class="bn-close" aria-label="Close" title="Close">×</button>
            </div>

            <div class="bn-tabs">
                <button type="button" class="bn-tab bn-tab-active" data-tab="view">🔎 View</button>
                <button type="button" class="bn-tab" data-tab="cache">💾 Cache</button>
                <button type="button" class="bn-tab" data-tab="io">🔁 Import/Export</button>
            </div>

            <div class="bn-body">

                <!-- SECTION 1: VIEW CACHED -->
                <div class="bn-section bn-section-active" data-section="view">
                    <div class="bn-fields">
                        <div class="bn-field">
                            <label class="bn-label" for="bn-v-village">Village Code</label>
                            <input id="bn-v-village" class="bn-input" type="text"
                                   inputmode="numeric" autocomplete="off" placeholder="e.g. 1306007">
                        </div>
                        <div class="bn-field">
                            <label class="bn-label" for="bn-v-plot">Parcel / LPM No.</label>
                            <input id="bn-v-plot" class="bn-input" type="text"
                                   autocomplete="off" placeholder="e.g. 2272">
                        </div>
                    </div>
                    <button type="button" class="bn-btn bn-view-btn">🔎 Fetch from Cache</button>
                    <div class="bn-status" data-status="view" role="status" aria-live="polite"></div>

                    <div class="bn-result" data-result="view">
                        <div class="bn-result-title">Land Details</div>
                        <div class="bn-details"></div>
                        <div class="bn-actions">
                            <button type="button" class="bn-btn bn-btn-green bn-copy-btn">📋 Copy Details</button>
                        </div>
                    </div>

                    <div class="bn-db-info" data-db-info>Cached records: …</div>
                </div>

                <!-- SECTION 2: CACHE VILLAGE -->
                <div class="bn-section" data-section="cache">
                    <div class="bn-resume-banner" data-resume-banner style="display:none;">
                        <strong>⚡ Previous job found!</strong><br>
                        <span data-resume-info></span>
                        <div class="bn-resume-actions">
                            <button type="button" class="bn-btn bn-btn-green bn-resume-job-btn">▶ Resume Job</button>
                            <button type="button" class="bn-btn bn-btn-red bn-discard-job-btn">🗑 Discard</button>
                        </div>
                    </div>

                    <div class="bn-fields">
                        <div class="bn-field bn-field-full">
                            <label class="bn-label" for="bn-c-village">Village Code</label>
                            <input id="bn-c-village" class="bn-input" type="text"
                                   inputmode="numeric" autocomplete="off" placeholder="e.g. 1306007">
                        </div>
                        <div class="bn-field">
                            <label class="bn-label" for="bn-c-from">From Parcel</label>
                            <input id="bn-c-from" class="bn-input" type="number"
                                   min="1" autocomplete="off" placeholder="1">
                        </div>
                        <div class="bn-field">
                            <label class="bn-label" for="bn-c-to">To Parcel</label>
                            <input id="bn-c-to" class="bn-input" type="number"
                                   min="1" autocomplete="off" placeholder="500">
                        </div>
                    </div>

                    <div class="bn-btn-row">
                        <button type="button" class="bn-btn bn-btn-green bn-start-btn">▶ Start</button>
                        <button type="button" class="bn-btn bn-btn-orange bn-pause-btn" disabled>⏸ Pause</button>
                        <button type="button" class="bn-btn bn-btn-red bn-stop-btn" disabled>⏹ Stop</button>
                    </div>

                    <div class="bn-status" data-status="cache" role="status" aria-live="polite"></div>

                    <div class="bn-progress" style="display:none;" data-progress>
                        <div><strong>Progress:</strong> <span data-prog-text>0 / 0</span></div>
                        <div class="bn-progress-bar"><div class="bn-progress-fill" data-prog-fill></div></div>
                        <div class="bn-stats">
                            <div class="bn-stat"><span class="bn-stat-num bn-stat-tot" data-stat-total>0</span>Total</div>
                            <div class="bn-stat"><span class="bn-stat-num bn-stat-ok"  data-stat-ok>0</span>Success</div>
                            <div class="bn-stat"><span class="bn-stat-num bn-stat-err" data-stat-fail>0</span>Failed</div>
                            <div class="bn-stat"><span class="bn-stat-num bn-stat-spd" data-stat-speed>—</span>Speed</div>
                        </div>
                        <div class="bn-speed-info" data-speed-info>
                            <span>Delay: <strong data-delay-val>${DEFAULT_DELAY}</strong>ms</span>
                            <span>Avg: <strong data-avg-time>—</strong>ms</span>
                            <span>ETA: <strong data-eta>—</strong></span>
                        </div>
                        <div class="bn-log" data-log></div>
                    </div>
                </div>

                <!-- SECTION 3: IMPORT / EXPORT -->
                <div class="bn-section" data-section="io">
                    <div class="bn-fields">
                        <div class="bn-field bn-field-full">
                            <label class="bn-label" for="bn-io-format">Format</label>
                            <select id="bn-io-format" class="bn-select">
                                <option value="json">JSON</option>
                                <option value="csv">CSV (UTF-8 with Telugu support)</option>
                            </select>
                        </div>
                    </div>

                    <button type="button" class="bn-btn bn-btn-green bn-export-btn">⬇ Export Cached Data</button>

                    <div style="height:10px;"></div>

                    <label class="bn-label">Import File (.json / .csv)</label>
                    <input type="file" class="bn-input bn-import-file" accept=".json,.csv,application/json,text/csv">
                    <div style="height:8px;"></div>
                    <button type="button" class="bn-btn bn-import-btn">⬆ Import into Cache</button>

                    <div class="bn-status" data-status="io" role="status" aria-live="polite"></div>

                    <button type="button" class="bn-btn bn-btn-red bn-clear-btn" style="margin-top:14px;">🗑 Clear All Cached Data</button>

                    <div class="bn-db-info" data-db-info-io>Cached records: …</div>
                </div>

                <div class="bn-footer">
                    Data retrieved via the Adangal service &amp; cached locally in IndexedDB.
                </div>
            </div>
        </section>
    `;
    document.body.appendChild(root);

    // ----------------------------------------------------------
    // SHORT-HAND REFS
    // ----------------------------------------------------------
    var $ = function (s, c) { return (c || root).querySelector(s); };
    var $$ = function (s, c) { return Array.from((c || root).querySelectorAll(s)); };

    var openButton = $('.bn-open');
    var panel      = $('.bn-panel');
    var closeButton= $('.bn-close');

    // ----------------------------------------------------------
    // TOOL MANAGER REGISTRATION
    // ----------------------------------------------------------
    (function registerTool() {
        var config = {
            id:'bhunaksha', name:'Adangal', icon:'🗺️',
            selector:'#bhunaksha-compact-tool .bn-open',
            defaults:{ bottom:64, left:12 }, visible:true
        };
        if (window.MapToolManager && typeof window.MapToolManager.register === 'function') {
            window.MapToolManager.register(config);
        } else {
            window.MapToolRegistry = window.MapToolRegistry || [];
            if (!window.MapToolRegistry.some(function (i) { return i && i.id === config.id; })) {
                window.MapToolRegistry.push(config);
            }
        }
    })();

    // ----------------------------------------------------------
    // PANEL + TABS
    // ----------------------------------------------------------
    function openPanel()  { panel.classList.add('bn-visible'); openButton.setAttribute('aria-expanded','true'); refreshDbInfo(); checkResumableJob(); }
    function closePanel() { panel.classList.remove('bn-visible'); openButton.setAttribute('aria-expanded','false'); }

    openButton.addEventListener('click', function () {
        panel.classList.contains('bn-visible') ? closePanel() : openPanel();
    });
    closeButton.addEventListener('click', closePanel);

    $$('.bn-tab').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var name = btn.getAttribute('data-tab');
            $$('.bn-tab').forEach(function (b) { b.classList.toggle('bn-tab-active', b === btn); });
            $$('.bn-section').forEach(function (s) {
                s.classList.toggle('bn-section-active', s.getAttribute('data-section') === name);
            });
            refreshDbInfo();
            if (name === 'cache') checkResumableJob();
        });
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && panel.classList.contains('bn-visible')) closePanel();
    });

    // ----------------------------------------------------------
    // STATUS HELPERS
    // ----------------------------------------------------------
    function setStatus(section, msg, type) {
        var box = $('[data-status="' + section + '"]');
        if (!box) return;
        box.textContent = msg;
        box.className = 'bn-status bn-' + (type || 'info');
    }
    function clearStatus(section) {
        var box = $('[data-status="' + section + '"]');
        if (!box) return;
        box.textContent = ''; box.className = 'bn-status';
    }

    // ----------------------------------------------------------
    // TEXT HELPERS
    // ----------------------------------------------------------
    function normalizeWhitespace(v) {
        return String(v == null ? '' : v).replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
    }
    function stripHtml(v) {
        var t = document.createElement('div');
        t.innerHTML = String(v == null ? '' : v);
        t.querySelectorAll('script,style,iframe,object,embed').forEach(function (e) { e.remove(); });
        return normalizeWhitespace(t.textContent || t.innerText || '');
    }
    function safeValue(v) {
        if (v == null) return '';
        if (typeof v === 'object') return normalizeWhitespace(v.value != null ? v.value : v.name != null ? v.name : '');
        return normalizeWhitespace(v);
    }
    function normalizeKey(k) {
        return String(k == null ? '' : k).toLowerCase().replace(/[^a-z0-9]/g,'');
    }

    // ----------------------------------------------------------
    // PARSERS
    // ----------------------------------------------------------
    function findObjectValue(obj, aliases) {
        if (!obj || typeof obj !== 'object') return '';
        var wanted = aliases.map(normalizeKey);
        var keys = Object.keys(obj);
        for (var i = 0; i < keys.length; i++) {
            if (wanted.indexOf(normalizeKey(keys[i])) !== -1) return safeValue(obj[keys[i]]);
        }
        for (var j = 0; j < keys.length; j++) {
            var child = obj[keys[j]];
            if (child && typeof child === 'object' && !Array.isArray(child)) {
                var n = findObjectValue(child, aliases);
                if (n) return n;
            }
        }
        return '';
    }
    function parseJsonRecord(json) {
        var record = {}; var source = json;
        if (Array.isArray(source)) source = source.length ? source[0] : {};
        if (source && typeof source === 'object') {
            ['data','result','record','details','parcel','plot','response'].forEach(function (w) {
                if (source[w] != null) {
                    var n = source[w];
                    if (Array.isArray(n)) n = n.length ? n[0] : {};
                    if (n && typeof n === 'object') { source = n; }
                }
            });
        }
        FIELD_DEFINITIONS.forEach(function (f) { record[f.key] = findObjectValue(source, f.aliases); });
        return record;
    }
    function parseTextRecord(raw) {
        var record = {};
        var prepared = String(raw == null ? '' : raw)
            .replace(/<\s*br\s*\/?\s*>/gi,'\n')
            .replace(/<\/\s*(?:div|p|tr|li|h[1-6])\s*>/gi,'\n')
            .replace(/<\/\s*td\s*>/gi,' | ')
            .replace(/<\/\s*th\s*>/gi,' | ');
        var text = stripHtml(prepared).replace(/\r/g,'\n');
        var aliases = [];
        FIELD_DEFINITIONS.forEach(function (f) {
            f.aliases.forEach(function (a) { aliases.push({ key:f.key, alias:a }); });
        });
        aliases.sort(function (a, b) { return b.alias.length - a.alias.length; });
        var labelAlt = aliases.map(function (i) { return i.alias.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }).join('|');
        var exp = new RegExp('(?:^|[\\n|;])\\s*(' + labelAlt + ')\\s*:\\s*([\\s\\S]*?)(?=(?:\\n|\\|)\\s*(?:' + labelAlt + ')\\s*:|$)','gim');
        var m;
        while ((m = exp.exec(text)) !== null) {
            var ml = normalizeKey(m[1]); var val = normalizeWhitespace(m[2]);
            var fm = aliases.find(function (i) { return normalizeKey(i.alias) === ml; });
            if (fm && val && !record[fm.key]) record[fm.key] = val;
        }
        return record;
    }
    function hasUsefulDetails(r) {
        if (!r) return false;
        return FIELD_DEFINITIONS.some(function (f) { return Boolean(r[f.key]); });
    }
    function parseResponse(raw) {
        var text = String(raw == null ? '' : raw).trim();
        if (!text) throw new Error('Empty response.');
        var record = null;
        try {
            var json = JSON.parse(text);
            record = parseJsonRecord(json);
            if (!hasUsefulDetails(record)) {
                var msg = '';
                if (typeof json === 'string') msg = json;
                else if (json && typeof json === 'object') {
                    msg = [json.message,json.text,json.details,json.data]
                        .filter(function (v) { return typeof v === 'string'; }).join('\n');
                }
                if (msg) record = parseTextRecord(msg);
            }
        } catch (e) { record = parseTextRecord(text); }
        if (!record || !hasUsefulDetails(record)) {
            var clean = stripHtml(text);
            if (/not found|no record|no data|invalid/i.test(clean)) throw new Error(clean.slice(0,300));
            throw new Error('No land details found.');
        }
        FIELD_DEFINITIONS.forEach(function (f) { record[f.key] = safeValue(record[f.key]); });
        return record;
    }

    // ----------------------------------------------------------
    // INDEXEDDB
    // ----------------------------------------------------------
    var _dbPromise = null;
    function openDB() {
        if (_dbPromise) return _dbPromise;
        _dbPromise = new Promise(function (resolve, reject) {
            var req = indexedDB.open(DB_NAME, DB_VER);
            req.onupgradeneeded = function (e) {
                var db = e.target.result;
                if (!db.objectStoreNames.contains(DB_STORE)) {
                    var store = db.createObjectStore(DB_STORE, { keyPath:'id' });
                    store.createIndex('villageCode','villageCode',{ unique:false });
                }
            };
            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () { reject(req.error); };
        });
        return _dbPromise;
    }
    function makeId(v, p) { return String(v).trim() + '::' + String(p).trim(); }

    async function dbPut(record) {
        var db = await openDB();
        return new Promise(function (resolve, reject) {
            var tx = db.transaction(DB_STORE,'readwrite');
            tx.objectStore(DB_STORE).put(record);
            tx.oncomplete = function () { resolve(true); };
            tx.onerror = function () { reject(tx.error); };
        });
    }
    async function dbGet(id) {
        var db = await openDB();
        return new Promise(function (resolve, reject) {
            var tx = db.transaction(DB_STORE,'readonly');
            var req = tx.objectStore(DB_STORE).get(id);
            req.onsuccess = function () { resolve(req.result || null); };
            req.onerror = function () { reject(req.error); };
        });
    }
    async function dbGetAll() {
        var db = await openDB();
        return new Promise(function (resolve, reject) {
            var tx = db.transaction(DB_STORE,'readonly');
            var req = tx.objectStore(DB_STORE).getAll();
            req.onsuccess = function () { resolve(req.result || []); };
            req.onerror = function () { reject(req.error); };
        });
    }
    async function dbCount() {
        var db = await openDB();
        return new Promise(function (resolve, reject) {
            var tx = db.transaction(DB_STORE,'readonly');
            var req = tx.objectStore(DB_STORE).count();
            req.onsuccess = function () { resolve(req.result || 0); };
            req.onerror = function () { reject(req.error); };
        });
    }
    async function dbClear() {
        var db = await openDB();
        return new Promise(function (resolve, reject) {
            var tx = db.transaction(DB_STORE,'readwrite');
            tx.objectStore(DB_STORE).clear();
            tx.oncomplete = function () { resolve(true); };
            tx.onerror = function () { reject(tx.error); };
        });
    }
    async function refreshDbInfo() {
        try {
            var n = await dbCount();
            var txt = 'Cached records in IndexedDB: ' + n;
            var a = $('[data-db-info]');    if (a) a.textContent = txt;
            var b = $('[data-db-info-io]'); if (b) b.textContent = txt;
        } catch (e) { /* ignore */ }
    }

    // ----------------------------------------------------------
    // PERSISTENT JOB STATE (localStorage)
    // ----------------------------------------------------------
    function saveJobState(state) {
        try { localStorage.setItem(JOB_STATE_KEY, JSON.stringify(state)); }
        catch (e) { /* quota etc. */ }
    }
    function loadJobState() {
        try {
            var raw = localStorage.getItem(JOB_STATE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    }
    function clearJobState() {
        try { localStorage.removeItem(JOB_STATE_KEY); } catch (e) { /* */ }
    }

    // ----------------------------------------------------------
    // NETWORK FETCH (single parcel) with timing
    // ----------------------------------------------------------
    async function fetchParcel(village, plot, signal) {
        var url = new URL(API_URL);
        url.searchParams.set('village', village);
        url.searchParams.set('plot', plot);

        var ctrl = new AbortController();
        var onAbort = function () { ctrl.abort(); };
        if (signal) signal.addEventListener('abort', onAbort);
        var timeoutId = setTimeout(function () { ctrl.abort(); }, REQUEST_TIMEOUT);
        var startTime = performance.now();

        try {
            var res = await fetch(url.href, {
                method:'GET', mode:'cors', cache:'no-store', signal:ctrl.signal,
                headers:{ 'Accept':'application/json, text/plain, text/html, */*' }
            });
            var raw = await res.text();
            var elapsed = Math.round(performance.now() - startTime);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            var record = parseResponse(raw);
            return { record:record, elapsed:elapsed };
        } finally {
            clearTimeout(timeoutId);
            if (signal) signal.removeEventListener('abort', onAbort);
        }
    }

    // ----------------------------------------------------------
    // ADAPTIVE SPEED CONTROLLER
    // ----------------------------------------------------------
    function createSpeedController() {
        var samples = [];
        var currentDelay = DEFAULT_DELAY;
        var consecutiveErrors = 0;

        return {
            recordSuccess: function (ms) {
                consecutiveErrors = 0;
                samples.push(ms);
                if (samples.length > SPEED_WINDOW) samples.shift();
                this.recalc();
            },
            recordError: function () {
                consecutiveErrors++;
                // Back off on errors
                if (consecutiveErrors >= 3) {
                    currentDelay = Math.min(currentDelay * 1.5, MAX_DELAY_MS);
                }
            },
            recalc: function () {
                if (!samples.length) return;
                var avg = samples.reduce(function (a, b) { return a + b; }, 0) / samples.length;
                // Fast network → shorter delay; slow → longer
                if (avg < 300)       currentDelay = MIN_DELAY_MS;
                else if (avg < 600)  currentDelay = 250;
                else if (avg < 1000) currentDelay = 400;
                else if (avg < 2000) currentDelay = 800;
                else if (avg < 4000) currentDelay = 1500;
                else                 currentDelay = MAX_DELAY_MS;
            },
            getDelay: function () { return Math.round(currentDelay); },
            getAvg: function () {
                if (!samples.length) return null;
                return Math.round(samples.reduce(function (a, b) { return a + b; }, 0) / samples.length);
            }
        };
    }

    // ============================================================
    // SECTION 1 — VIEW CACHED DATA
    // ============================================================
    var viewBtn     = $('.bn-view-btn');
    var vVillage    = $('#bn-v-village');
    var vPlot       = $('#bn-v-plot');
    var viewResult  = $('[data-result="view"]');
    var viewDetails = $('.bn-details', viewResult);
    var copyBtn     = $('.bn-copy-btn');
    var currentCopyText = '';

    function renderDetails(record) {
        viewDetails.replaceChildren();
        FIELD_DEFINITIONS.forEach(function (f) {
            var row = document.createElement('div'); row.className = 'bn-detail';
            var l = document.createElement('div'); l.className = 'bn-detail-label'; l.textContent = f.label;
            var v = document.createElement('div'); v.className = 'bn-detail-value'; v.textContent = record[f.key] || 'Not available';
            row.appendChild(l); row.appendChild(v);
            viewDetails.appendChild(row);
        });
        currentCopyText = FIELD_DEFINITIONS.map(function (f) {
            return f.label + ': ' + (record[f.key] || 'Not available');
        }).join('\n');
        viewResult.classList.add('bn-result-visible');
    }

    viewBtn.addEventListener('click', async function () {
        clearStatus('view');
        viewResult.classList.remove('bn-result-visible');
        var v = normalizeWhitespace(vVillage.value);
        var p = normalizeWhitespace(vPlot.value);
        if (!v || !p) { setStatus('view','Enter Village Code and Parcel Number.','error'); return; }
        try {
            var rec = await dbGet(makeId(v, p));
            if (!rec) { setStatus('view','No cached record for ' + v + ' / ' + p + '. Use Cache tab to fetch.','error'); return; }
            renderDetails(rec);
            setStatus('view','Loaded from cache (saved ' + new Date(rec.cachedAt).toLocaleString() + ').','success');
        } catch (e) { setStatus('view','Error: ' + (e.message || e),'error'); }
    });

    [vVillage, vPlot].forEach(function (i) {
        i.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); viewBtn.click(); } });
    });

    async function copyText(text) {
        if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return; }
        var ta = document.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly',''); ta.style.cssText='position:fixed;opacity:0';
        document.body.appendChild(ta); ta.select();
        try { if (!document.execCommand('copy')) throw new Error(); } finally { ta.remove(); }
    }
    copyBtn.addEventListener('click', async function () {
        if (!currentCopyText) return;
        try { await copyText(currentCopyText); setStatus('view','Copied to clipboard.','success'); }
        catch (e) { setStatus('view','Could not copy. Select and copy manually.','error'); }
    });

    // ============================================================
    // SECTION 2 — CACHE VILLAGE DATA (with persistence + adaptive speed)
    // ============================================================
    var startBtn    = $('.bn-start-btn');
    var pauseBtn    = $('.bn-pause-btn');
    var stopBtn     = $('.bn-stop-btn');
    var cVillage    = $('#bn-c-village');
    var cFrom       = $('#bn-c-from');
    var cTo         = $('#bn-c-to');
    var progBox     = $('[data-progress]');
    var progText    = $('[data-prog-text]');
    var progFill    = $('[data-prog-fill]');
    var statTot     = $('[data-stat-total]');
    var statOk      = $('[data-stat-ok]');
    var statFail    = $('[data-stat-fail]');
    var statSpeed   = $('[data-stat-speed]');
    var delayVal    = $('[data-delay-val]');
    var avgTime     = $('[data-avg-time]');
    var etaDisplay  = $('[data-eta]');
    var logBox      = $('[data-log]');
    var resumeBanner= $('[data-resume-banner]');
    var resumeInfo  = $('[data-resume-info]');
    var resumeJobBtn= $('.bn-resume-job-btn');
    var discardBtn  = $('.bn-discard-job-btn');

    var cacheJob = {
        running:false, paused:false, stopRequested:false,
        village:'', from:0, to:0, current:0,
        total:0, ok:0, fail:0, abortCtrl:null, speed:null
    };

    function logLine(msg, type) {
        var el = document.createElement('div');
        el.className = 'bn-log-item bn-log-' + (type || 'info');
        el.textContent = '[' + new Date().toLocaleTimeString() + '] ' + msg;
        logBox.appendChild(el);
        // Keep log manageable
        while (logBox.children.length > 500) logBox.removeChild(logBox.firstChild);
        logBox.scrollTop = logBox.scrollHeight;
    }

    function formatETA(seconds) {
        if (!Number.isFinite(seconds) || seconds < 0) return '—';
        if (seconds < 60) return Math.ceil(seconds) + 's';
        if (seconds < 3600) return Math.floor(seconds/60) + 'm ' + Math.ceil(seconds%60) + 's';
        return Math.floor(seconds/3600) + 'h ' + Math.floor((seconds%3600)/60) + 'm';
    }

    function updateProgress() {
        var done = cacheJob.ok + cacheJob.fail;
        var remaining = cacheJob.total - done;
        progText.textContent = done + ' / ' + cacheJob.total +
            (cacheJob.running ? (cacheJob.paused ? ' (paused)' : ' …') : ' ✓');
        progFill.style.width = cacheJob.total ? ((done / cacheJob.total) * 100).toFixed(1) + '%' : '0%';
        statTot.textContent  = cacheJob.total;
        statOk.textContent   = cacheJob.ok;
        statFail.textContent = cacheJob.fail;

        // Speed info
        if (cacheJob.speed) {
            var d = cacheJob.speed.getDelay();
            var a = cacheJob.speed.getAvg();
            delayVal.textContent = d;
            avgTime.textContent  = a != null ? a : '—';
            statSpeed.textContent = a != null ? (a + 'ms') : '—';

            // ETA calculation
            if (a != null && remaining > 0 && cacheJob.running && !cacheJob.paused) {
                var perItem = a + d; // response time + delay
                var etaSec = (remaining * perItem) / 1000;
                etaDisplay.textContent = formatETA(etaSec);
            } else {
                etaDisplay.textContent = cacheJob.running && cacheJob.paused ? 'paused' : '—';
            }
        }
    }

    function setCacheButtons(state) {
        if (state === 'idle') {
            startBtn.disabled = false; startBtn.textContent = '▶ Start';
            pauseBtn.disabled = true;  pauseBtn.textContent = '⏸ Pause';
            stopBtn.disabled  = true;
            cVillage.disabled = false; cFrom.disabled = false; cTo.disabled = false;
        } else if (state === 'running') {
            startBtn.disabled = true;  startBtn.textContent = '▶ Running…';
            pauseBtn.disabled = false; pauseBtn.textContent = '⏸ Pause';
            stopBtn.disabled  = false;
            cVillage.disabled = true; cFrom.disabled = true; cTo.disabled = true;
        } else if (state === 'paused') {
            startBtn.disabled = false; startBtn.textContent = '▶ Resume';
            pauseBtn.disabled = true;  pauseBtn.textContent = '⏸ Paused';
            stopBtn.disabled  = false;
            cVillage.disabled = true; cFrom.disabled = true; cTo.disabled = true;
        }
    }

    function sleep(ms, signal) {
        return new Promise(function (resolve) {
            var t = setTimeout(resolve, ms);
            if (signal) signal.addEventListener('abort', function () { clearTimeout(t); resolve(); }, { once:true });
        });
    }

    async function waitWhilePaused() {
        while (cacheJob.paused && !cacheJob.stopRequested) {
            await sleep(200);
        }
    }

    function persistJobState() {
        saveJobState({
            village: cacheJob.village,
            from:    cacheJob.from,
            to:      cacheJob.to,
            current: cacheJob.current,
            ok:      cacheJob.ok,
            fail:    cacheJob.fail,
            total:   cacheJob.total,
            paused:  true,
            savedAt: Date.now()
        });
    }

    function checkResumableJob() {
        var saved = loadJobState();
        if (!saved || !saved.village || !saved.current) {
            resumeBanner.style.display = 'none';
            return;
        }
        if (cacheJob.running) {
            resumeBanner.style.display = 'none';
            return;
        }

        var done = saved.ok + saved.fail;
        var remaining = saved.total - done;
        if (remaining <= 0) {
            clearJobState();
            resumeBanner.style.display = 'none';
            return;
        }

        resumeInfo.textContent = 'Village: ' + saved.village +
            ' | Range: ' + saved.from + '–' + saved.to +
            ' | Done: ' + done + '/' + saved.total +
            ' | Next: parcel ' + saved.current +
            ' | Saved: ' + new Date(saved.savedAt).toLocaleString();
        resumeBanner.style.display = 'block';
    }

    async function runCacheJob() {
        cacheJob.running = true;
        cacheJob.paused = false;
        cacheJob.stopRequested = false;
        cacheJob.abortCtrl = new AbortController();
        if (!cacheJob.speed) cacheJob.speed = createSpeedController();

        setCacheButtons('running');
        progBox.style.display = 'block';
        resumeBanner.style.display = 'none';
        updateProgress();
        persistJobState();

        for (var i = cacheJob.current; i <= cacheJob.to; i++) {
            if (cacheJob.stopRequested) break;

            // Pause handling
            if (cacheJob.paused) {
                cacheJob.current = i;
                persistJobState();
                await waitWhilePaused();
                if (cacheJob.stopRequested) break;
            }

            cacheJob.current = i;
            var plot = String(i);

            try {
                var result = await fetchParcel(cacheJob.village, plot, cacheJob.abortCtrl.signal);
                var rec = result.record;
                rec.id          = makeId(cacheJob.village, plot);
                rec.villageCode = rec.villageCode || cacheJob.village;
                rec.lpmNo       = rec.lpmNo || plot;
                rec.cachedAt    = Date.now();
                await dbPut(rec);
                cacheJob.ok++;
                cacheJob.speed.recordSuccess(result.elapsed);
                logLine('✓ ' + plot + ' saved (' + result.elapsed + 'ms)', 'ok');
            } catch (err) {
                cacheJob.fail++;
                cacheJob.speed.recordError();
                var msg = (err && err.message) ? err.message : String(err);
                logLine('✗ ' + plot + ' — ' + msg.slice(0, 140), 'err');
            }

            cacheJob.current = i + 1;
            updateProgress();

            // Save state every 10 parcels
            if ((cacheJob.ok + cacheJob.fail) % 10 === 0) {
                persistJobState();
            }

            // Dynamic delay
            if (i < cacheJob.to && !cacheJob.stopRequested) {
                await sleep(cacheJob.speed.getDelay(), cacheJob.abortCtrl.signal);
            }
        }

        cacheJob.running = false;
        cacheJob.paused = false;
        setCacheButtons('idle');

        var done = cacheJob.ok + cacheJob.fail;

        if (cacheJob.stopRequested) {
            // Keep state so it can be resumed
            persistJobState();
            setStatus('cache',
                'Stopped at parcel ' + (cacheJob.current) + '. ' +
                done + ' processed · ' + cacheJob.ok + ' ok · ' + cacheJob.fail + ' failed. ' +
                'Job state saved — you can resume anytime.', 'warn');
        } else {
            // Completed
            clearJobState();
            setStatus('cache',
                'Completed! ' + done + ' processed · ' + cacheJob.ok + ' ok · ' + cacheJob.fail + ' failed.', 'success');
        }
        refreshDbInfo();
        checkResumableJob();
    }

    function startNewJob() {
        var v = normalizeWhitespace(cVillage.value);
        var fromN = parseInt(cFrom.value, 10);
        var toN   = parseInt(cTo.value, 10);
        if (!v) { setStatus('cache','Enter Village Code.','error'); return; }
        if (!Number.isFinite(fromN) || !Number.isFinite(toN) || fromN < 1 || toN < fromN) {
            setStatus('cache','Enter a valid range (From ≤ To).','error'); return;
        }
        if ((toN - fromN + 1) > 20000) {
            setStatus('cache','Range too large (max 20,000 per job).','error'); return;
        }

        cacheJob.village = v;
        cacheJob.from = fromN; cacheJob.to = toN; cacheJob.current = fromN;
        cacheJob.total = toN - fromN + 1;
        cacheJob.ok = 0; cacheJob.fail = 0;
        cacheJob.speed = createSpeedController();

        logBox.replaceChildren();
        clearStatus('cache');
        setStatus('cache','Caching ' + cacheJob.total + ' parcels for village ' + v + '…','info');
        logLine('Job started: village=' + v + ', range=' + fromN + '–' + toN, 'info');

        runCacheJob();
    }

    function resumeSavedJob(saved) {
        cacheJob.village = saved.village;
        cacheJob.from    = saved.from;
        cacheJob.to      = saved.to;
        cacheJob.current = saved.current;
        cacheJob.ok      = saved.ok || 0;
        cacheJob.fail    = saved.fail || 0;
        cacheJob.total   = saved.total;
        cacheJob.speed   = createSpeedController();

        cVillage.value = saved.village;
        cFrom.value    = saved.from;
        cTo.value      = saved.to;

        logBox.replaceChildren();
        clearStatus('cache');
        var done = cacheJob.ok + cacheJob.fail;
        setStatus('cache','Resuming from parcel ' + cacheJob.current + ' (' + done + '/' + cacheJob.total + ' already done)…','info');
        logLine('Resumed: village=' + saved.village + ', continuing from parcel ' + cacheJob.current, 'info');

        runCacheJob();
    }

    startBtn.addEventListener('click', function () {
        // If paused in-memory, resume
        if (cacheJob.paused && cacheJob.running) {
            cacheJob.paused = false;
            setCacheButtons('running');
            logLine('Resumed by user', 'info');
            updateProgress();
            return;
        }
        // If not running, start fresh
        if (!cacheJob.running) {
            startNewJob();
        }
    });

    pauseBtn.addEventListener('click', function () {
        if (!cacheJob.running || cacheJob.paused) return;
        cacheJob.paused = true;
        setCacheButtons('paused');
        persistJobState();
        logLine('Paused by user — state saved', 'info');
        updateProgress();
    });

    stopBtn.addEventListener('click', function () {
        if (!cacheJob.running && !cacheJob.paused) return;
        cacheJob.stopRequested = true;
        cacheJob.paused = false;
        if (cacheJob.abortCtrl) cacheJob.abortCtrl.abort();
        logLine('Stop requested — state will be saved', 'info');
    });

    resumeJobBtn.addEventListener('click', function () {
        var saved = loadJobState();
        if (!saved) { setStatus('cache','No saved job found.','error'); return; }
        resumeSavedJob(saved);
    });

    discardBtn.addEventListener('click', function () {
        clearJobState();
        resumeBanner.style.display = 'none';
        setStatus('cache','Saved job discarded.','info');
    });

    // Save state before page unload
    window.addEventListener('beforeunload', function () {
        if (cacheJob.running) {
            cacheJob.paused = true;
            persistJobState();
        }
    });

    // Also save on visibility change (tab switch, phone lock screen)
    document.addEventListener('visibilitychange', function () {
        if (document.hidden && cacheJob.running) {
            persistJobState();
        }
    });

    // ============================================================
    // SECTION 3 — IMPORT / EXPORT (with Telugu / Unicode support)
    // ============================================================
    var ioFormat   = $('#bn-io-format');
    var exportBtn  = $('.bn-export-btn');
    var importFile = $('.bn-import-file');
    var importBtn  = $('.bn-import-btn');
    var clearBtn   = $('.bn-clear-btn');

    function toCSV(rows) {
        var cols = ['id','cachedAt'];
        FIELD_DEFINITIONS.forEach(function (f) { if (cols.indexOf(f.key) === -1) cols.push(f.key); });

        var esc = function (s) {
            if (s == null) return '';
            var str = String(s);
            // Always quote to preserve Telugu and special chars
            return '"' + str.replace(/"/g, '""') + '"';
        };

        // Header with readable labels
        var headerLabels = cols.map(function (c) {
            if (c === 'id') return 'ID';
            if (c === 'cachedAt') return 'Cached At';
            var fd = FIELD_DEFINITIONS.find(function (f) { return f.key === c; });
            return fd ? fd.label : c;
        });

        var lines = [headerLabels.map(esc).join(',')];
        // Also include raw key header as second row for re-import
        lines.push(cols.map(esc).join(','));

        rows.forEach(function (r) {
            lines.push(cols.map(function (c) { return esc(r[c]); }).join(','));
        });
        return lines.join('\r\n');
    }

    function parseCSV(text) {
        // Handle BOM
        if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

        var rows = []; var cur = []; var field = ''; var inQ = false;
        for (var i = 0; i < text.length; i++) {
            var ch = text[i];
            if (inQ) {
                if (ch === '"') {
                    if (text[i + 1] === '"') { field += '"'; i++; }
                    else inQ = false;
                } else field += ch;
            } else {
                if (ch === '"') inQ = true;
                else if (ch === ',') { cur.push(field); field = ''; }
                else if (ch === '\n') { cur.push(field); rows.push(cur); cur = []; field = ''; }
                else if (ch === '\r') { /* skip */ }
                else field += ch;
            }
        }
        if (field.length || cur.length) { cur.push(field); rows.push(cur); }
        if (rows.length < 2) return [];

        // Detect header format: check if second row looks like field keys
        var firstRow  = rows[0];
        var secondRow = rows[1];

        var headers;
        var dataStart;

        var keyMatch = FIELD_DEFINITIONS.filter(function (f) {
            return secondRow.some(function (c) { return normalizeKey(c) === normalizeKey(f.key); });
        });

        if (keyMatch.length >= 3) {
            // second row is key header, data starts at row 3
            headers = secondRow;
            dataStart = 2;
        } else {
            // Try first row as key header
            var firstKeyMatch = FIELD_DEFINITIONS.filter(function (f) {
                return firstRow.some(function (c) { return normalizeKey(c) === normalizeKey(f.key); });
            });
            if (firstKeyMatch.length >= 3) {
                headers = firstRow;
                dataStart = 1;
            } else {
                // Try label-based matching on first row
                headers = firstRow.map(function (h) {
                    var clean = normalizeWhitespace(h);
                    var fd = FIELD_DEFINITIONS.find(function (f) {
                        return f.label.toLowerCase() === clean.toLowerCase() ||
                               f.aliases.some(function (a) { return a.toLowerCase() === clean.toLowerCase(); });
                    });
                    return fd ? fd.key : clean;
                });
                dataStart = 1;
            }
        }

        return rows.slice(dataStart)
            .filter(function (r) { return r.some(function (c) { return c !== ''; }); })
            .map(function (r) {
                var o = {};
                headers.forEach(function (h, idx) { o[h] = r[idx] != null ? r[idx] : ''; });
                return o;
            });
    }

    function downloadBlob(filename, content, mime) {
        var blob = new Blob([content], { type: mime });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click();
        setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 200);
    }

    exportBtn.addEventListener('click', async function () {
        clearStatus('io');
        try {
            var rows = await dbGetAll();
            if (!rows.length) { setStatus('io','No cached data to export.','error'); return; }
            var fmt = ioFormat.value;
            var ts = new Date().toISOString().replace(/[:.]/g, '-');
            if (fmt === 'csv') {
                // UTF-8 BOM for proper Telugu rendering in Excel
                var BOM = '\uFEFF';
                var csvContent = BOM + toCSV(rows);
                downloadBlob('adangal-cache-' + ts + '.csv', csvContent, 'text/csv;charset=utf-8');
            } else {
                downloadBlob('adangal-cache-' + ts + '.json', JSON.stringify(rows, null, 2), 'application/json;charset=utf-8');
            }
            setStatus('io', 'Exported ' + rows.length + ' records as ' + fmt.toUpperCase() + '.', 'success');
        } catch (e) {
            setStatus('io', 'Export failed: ' + (e.message || e), 'error');
        }
    });

    importBtn.addEventListener('click', async function () {
        clearStatus('io');
        var file = importFile.files && importFile.files[0];
        if (!file) { setStatus('io','Choose a .json or .csv file.','error'); return; }

        try {
            // Read with UTF-8 encoding for Telugu
            var text = await new Promise(function (resolve, reject) {
                var reader = new FileReader();
                reader.onload = function () { resolve(reader.result); };
                reader.onerror = function () { reject(new Error('File read error')); };
                reader.readAsText(file, 'UTF-8');
            });

            var rows;
            var isJson = /\.json$/i.test(file.name) || file.type.indexOf('json') !== -1;

            if (isJson) {
                var parsed = JSON.parse(text);
                rows = Array.isArray(parsed) ? parsed : [parsed];
            } else {
                rows = parseCSV(text);
            }
            if (!rows.length) { setStatus('io','File has no records.','error'); return; }

            var imported = 0, skipped = 0;
            for (var i = 0; i < rows.length; i++) {
                var r = rows[i] || {};
                var rec = {};
                FIELD_DEFINITIONS.forEach(function (f) {
                    if (r[f.key] != null && r[f.key] !== '') rec[f.key] = String(r[f.key]);
                });
                var village = r.villageCode || rec.villageCode || '';
                var plot = r.lpmNo || rec.lpmNo || '';
                if (!village || !plot) { skipped++; continue; }
                rec.villageCode = String(village);
                rec.lpmNo = String(plot);
                rec.id = r.id || makeId(village, plot);
                rec.cachedAt = r.cachedAt ? Number(r.cachedAt) || Date.now() : Date.now();
                try { await dbPut(rec); imported++; } catch (e) { skipped++; }
            }
            setStatus('io', 'Imported ' + imported + ' records' + (skipped ? ' · ' + skipped + ' skipped' : '') + '.', 'success');
            refreshDbInfo();
            importFile.value = '';
        } catch (e) {
            setStatus('io', 'Import failed: ' + (e.message || e), 'error');
        }
    });

    clearBtn.addEventListener('click', async function () {
        if (!confirm('Delete ALL cached parcel records from this browser?')) return;
        try {
            await dbClear();
            clearJobState();
            setStatus('io', 'All cached data cleared.', 'success');
            refreshDbInfo();
        } catch (e) {
            setStatus('io', 'Clear failed: ' + (e.message || e), 'error');
        }
    });

    // ----------------------------------------------------------
    // INITIAL STATE
    // ----------------------------------------------------------
    setCacheButtons('idle');
    refreshDbInfo();
    checkResumableJob();

    console.log('[Adangal] Tool v2.1 loaded — persistent cache + adaptive speed + Telugu support.');
})();
