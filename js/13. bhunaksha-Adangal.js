
/* ============================================================
   Adangal TOOL
   Web Map Survey | QGIS2Web + OpenLayers
   Version: 1.0
   ------------------------------------------------------------
   Features:
   - Search using Village Code + LPM / Plot Number
   - Connects to the existing Adangal Cloudflare Worker
   - Displays land details in a fixed order
   - Copy formatted land details
   - Open parcel coordinates in Google Maps
   - Mobile-friendly interface
   - Register with MapToolManager v3.6
   - No external JavaScript libraries required
   ============================================================ */

(function () {
    'use strict';

    // ----------------------------------------------------------
    // CONFIGURATION
    // ----------------------------------------------------------

    var API_URL =
        'https://bhunaksha-ap-proxy.gsaikiran11.workers.dev/';

    var TOOL_ID = 'bhunaksha-compact-tool';

    var STYLE_ID = 'bhunaksha-compact-style';

    var REQUEST_TIMEOUT = 25000;

    // Avoid creating the tool more than once.
    if (document.getElementById(TOOL_ID)) {
        return;
    }

    // ----------------------------------------------------------
    // STYLES
    // ----------------------------------------------------------

    var css = `
    #${TOOL_ID} {
        font-family: Arial, Helvetica, sans-serif;
        color: #202124;
        font-size: 14px;
    }

    #${TOOL_ID} * {
        box-sizing: border-box;
    }

    #${TOOL_ID} .bn-open {
        position: fixed;
        left: 12px;
        bottom: 64px;
        z-index: 17010;
        width: 49px;
        height: 49px;
        border: 0;
        border-radius: 50%;
        background: #1f6feb;
        color: white;
        font-size: 23px;
        line-height: 1;
        box-shadow: 0 3px 12px rgba(0,0,0,.28);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        -webkit-tap-highlight-color: transparent;
    }

    #${TOOL_ID} .bn-open:active {
        transform: scale(.96);
    }

    #${TOOL_ID} .bn-panel {
        position: fixed;
        left: 12px;
        bottom: 122px;
        z-index: 50000;
        width: min(350px, calc(100vw - 24px));
        max-height: min(72vh, 620px);
        display: none;
        flex-direction: column;
        background: #fff;
        border: 1px solid #d9e0e8;
        border-radius: 13px;
        box-shadow: 0 5px 24px rgba(0,0,0,.25);
        overflow: hidden;
    }

    #${TOOL_ID} .bn-panel.bn-visible {
        display: flex;
    }

    #${TOOL_ID} .bn-header {
        flex-shrink: 0;
        padding: 11px 12px;
        background: #1f6feb;
        color: white;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
    }

    #${TOOL_ID} .bn-heading {
        font-size: 15px;
        font-weight: 700;
        line-height: 1.3;
    }

    #${TOOL_ID} .bn-subheading {
        font-size: 11px;
        opacity: .9;
        margin-top: 3px;
    }

    #${TOOL_ID} .bn-close {
        flex-shrink: 0;
        width: 32px;
        height: 32px;
        border: 0;
        border-radius: 8px;
        color: white;
        background: rgba(255,255,255,.17);
        font-size: 21px;
        cursor: pointer;
    }

    #${TOOL_ID} .bn-body {
        padding: 12px;
        overflow-y: auto;
        overscroll-behavior: contain;
    }

    #${TOOL_ID} .bn-label {
        display: block;
        font-size: 12px;
        font-weight: 700;
        margin: 0 0 5px;
        color: #3c4654;
    }

    #${TOOL_ID} .bn-input {
        display: block;
        width: 100%;
        min-width: 0;
        height: 41px;
        padding: 9px 10px;
        border: 1px solid #cbd3dd;
        border-radius: 8px;
        background: #fff;
        color: #202124;
        font-size: 14px;
        outline: none;
    }

    #${TOOL_ID} .bn-input:focus {
        border-color: #1f6feb;
        box-shadow: 0 0 0 2px rgba(31,111,235,.12);
    }

    #${TOOL_ID} .bn-fields {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        margin-bottom: 10px;
    }

    #${TOOL_ID} .bn-field {
        min-width: 0;
    }

    #${TOOL_ID} .bn-search {
        width: 100%;
        min-height: 41px;
        border: 0;
        border-radius: 8px;
        padding: 10px;
        color: white;
        background: #1f6feb;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
    }

    #${TOOL_ID} .bn-search:disabled {
        opacity: .6;
        cursor: wait;
    }

    #${TOOL_ID} .bn-status {
        display: none;
        margin-top: 10px;
        padding: 9px 10px;
        border-radius: 7px;
        font-size: 12px;
        line-height: 1.45;
        overflow-wrap: anywhere;
    }

    #${TOOL_ID} .bn-status.bn-info {
        display: block;
        color: #174ea6;
        background: #e8f0fe;
    }

    #${TOOL_ID} .bn-status.bn-error {
        display: block;
        color: #a32121;
        background: #fce8e6;
    }

    #${TOOL_ID} .bn-status.bn-success {
        display: block;
        color: #137333;
        background: #e6f4ea;
    }

    #${TOOL_ID} .bn-result {
        display: none;
        margin-top: 12px;
        border: 1px solid #e0e4e9;
        border-radius: 9px;
        overflow: hidden;
    }

    #${TOOL_ID} .bn-result.bn-result-visible {
        display: block;
    }

    #${TOOL_ID} .bn-result-title {
        padding: 10px;
        background: #f3f6fa;
        border-bottom: 1px solid #e0e4e9;
        font-weight: 700;
        font-size: 13px;
    }

    #${TOOL_ID} .bn-detail {
        display: grid;
        grid-template-columns: minmax(115px, 42%) minmax(0, 1fr);
        gap: 8px;
        padding: 8px 10px;
        border-bottom: 1px solid #edf0f3;
        line-height: 1.4;
        font-size: 12px;
    }

    #${TOOL_ID} .bn-detail:last-child {
        border-bottom: 0;
    }

    #${TOOL_ID} .bn-detail-label {
        color: #596579;
        font-weight: 600;
        overflow-wrap: anywhere;
    }

    #${TOOL_ID} .bn-detail-value {
        color: #202124;
        font-weight: 500;
        overflow-wrap: anywhere;
        white-space: pre-wrap;
    }

    #${TOOL_ID} .bn-actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-top: 10px;
    }

    #${TOOL_ID} .bn-action {
        min-height: 38px;
        padding: 8px;
        border: 1px solid #cbd3dd;
        border-radius: 8px;
        background: #fff;
        color: #202124;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
    }

    #${TOOL_ID} .bn-action-primary {
        background: #188038;
        border-color: #188038;
        color: white;
    }

    #${TOOL_ID} .bn-action:disabled {
        opacity: .5;
        cursor: not-allowed;
    }

    #${TOOL_ID} .bn-footer {
        padding-top: 9px;
        font-size: 10px;
        line-height: 1.4;
        color: #687386;
        text-align: center;
    }

    @media (max-width: 420px) {
        #${TOOL_ID} .bn-panel {
            left: 8px;
            bottom: 112px;
            width: calc(100vw - 16px);
            max-height: 75vh;
        }

        #${TOOL_ID} .bn-open {
            left: 10px;
            bottom: 60px;
        }

        #${TOOL_ID} .bn-body {
            padding: 10px;
        }

        #${TOOL_ID} .bn-detail {
            grid-template-columns: minmax(105px, 42%) minmax(0, 1fr);
            padding: 8px;
        }
    }

    @media (max-height: 520px) {
        #${TOOL_ID} .bn-panel {
            max-height: 82vh;
            bottom: 65px;
        }
    }
    `;

    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);

    // ----------------------------------------------------------
    // BUILD USER INTERFACE
    // ----------------------------------------------------------

    var root = document.createElement('div');
    root.id = TOOL_ID;

    root.innerHTML = `
        <button
            type="button"
            class="bn-open"
            title="Adangal"
            aria-label="Open Adangal"
            aria-expanded="false">🗺️</button>

        <section class="bn-panel" aria-label="Adangal search">
            <div class="bn-header">
                <div>
                    <div class="bn-heading">Adangal</div>
                    <div class="bn-subheading">Land parcel details lookup</div>
                </div>
                <button type="button" class="bn-close"
                    aria-label="Close panel" title="Close">×</button>
            </div>

            <div class="bn-body">
                <div class="bn-fields">
                    <div class="bn-field">
                        <label class="bn-label" for="bn-village">
                            Village Code
                        </label>
                        <input
                            id="bn-village"
                            class="bn-input"
                            type="text"
                            inputmode="numeric"
                            autocomplete="off"
                            placeholder="e.g. 1306007">
                    </div>

                    <div class="bn-field">
                        <label class="bn-label" for="bn-plot">
                            LPM / Plot No.
                        </label>
                        <input
                            id="bn-plot"
                            class="bn-input"
                            type="text"
                            autocomplete="off"
                            placeholder="e.g. 2272">
                    </div>
                </div>

                <button type="button" class="bn-search">
                    🔍 Search Land Details
                </button>

                <div class="bn-status" role="status" aria-live="polite"></div>

                <div class="bn-result">
                    <div class="bn-result-title">Land Details</div>
                    <div class="bn-details"></div>

                    <div class="bn-actions">
                        <button type="button"
                            class="bn-action bn-action-primary bn-copy">
                            📋 Copy Details
                        </button>

                        <button type="button"
                            class="bn-action bn-map">
                            📍 Google Maps
                        </button>
                    </div>
                </div>

                <div class="bn-footer">
                    Data is retrieved through the configured Adangal
                    service. Verify official records before relying on them.
                </div>
            </div>
        </section>
    `;

    document.body.appendChild(root);

    var openButton = root.querySelector('.bn-open');
    var panel = root.querySelector('.bn-panel');
    var closeButton = root.querySelector('.bn-close');
    var villageInput = root.querySelector('#bn-village');
    var plotInput = root.querySelector('#bn-plot');
    var searchButton = root.querySelector('.bn-search');
    var statusBox = root.querySelector('.bn-status');
    var resultBox = root.querySelector('.bn-result');
    var detailsBox = root.querySelector('.bn-details');
    var copyButton = root.querySelector('.bn-copy');
    var mapButton = root.querySelector('.bn-map');

    var currentDetails = null;
    var currentMapUrl = '';
    var currentCopyText = '';
    var requestController = null;

    // ----------------------------------------------------------
    // TOOL MANAGER REGISTRATION
    // ----------------------------------------------------------

    (function registerBhuNakshaTool() {
        var config = {
            id: 'bhunaksha',
            name: 'Adangal',
            icon: '🗺️',
            selector: '#bhunaksha-compact-tool .bn-open',
            defaults: {
                bottom: 64,
                left: 12
            },
            visible: true
        };

        if (
            window.MapToolManager &&
            typeof window.MapToolManager.register === 'function'
        ) {
            window.MapToolManager.register(config);
        } else {
            window.MapToolRegistry = window.MapToolRegistry || [];

            var exists = window.MapToolRegistry.some(function (item) {
                return item && item.id === config.id;
            });

            if (!exists) {
                window.MapToolRegistry.push(config);
            }
        }
    })();

    // ----------------------------------------------------------
    // PANEL CONTROLS
    // ----------------------------------------------------------

    function openPanel() {
        panel.classList.add('bn-visible');
        openButton.setAttribute('aria-expanded', 'true');
        villageInput.focus({ preventScroll: true });
    }

    function closePanel() {
        panel.classList.remove('bn-visible');
        openButton.setAttribute('aria-expanded', 'false');
    }

    openButton.addEventListener('click', function () {
        if (panel.classList.contains('bn-visible')) {
            closePanel();
        } else {
            openPanel();
        }
    });

    closeButton.addEventListener('click', closePanel);

    // ----------------------------------------------------------
    // STATUS DISPLAY
    // ----------------------------------------------------------

    function setStatus(message, type) {
        statusBox.textContent = message;
        statusBox.className = 'bn-status bn-' + (type || 'info');
    }

    function clearStatus() {
        statusBox.textContent = '';
        statusBox.className = 'bn-status';
    }

    function clearResults() {
        currentDetails = null;
        currentMapUrl = '';
        currentCopyText = '';
        detailsBox.replaceChildren();
        resultBox.classList.remove('bn-result-visible');
        copyButton.disabled = true;
        mapButton.disabled = true;
    }

    // ----------------------------------------------------------
    // SAFE TEXT HELPERS
    // ----------------------------------------------------------

    function normalizeWhitespace(value) {
        return String(value == null ? '' : value)
            .replace(/\u00a0/g, ' ')
            .replace(/[ \t]+/g, ' ')
            .trim();
    }

    function decodeHtmlText(value) {
        var el = document.createElement('textarea');
        el.innerHTML = String(value == null ? '' : value);
        return el.value;
    }

    function stripHtml(value) {
        var temp = document.createElement('div');
        temp.innerHTML = String(value == null ? '' : value);

        temp.querySelectorAll(
            'script,style,iframe,object,embed'
        ).forEach(function (el) {
            el.remove();
        });

        return normalizeWhitespace(temp.textContent || temp.innerText || '');
    }

    function safeValue(value) {
        if (value == null) return '';
        if (typeof value === 'object') {
            return normalizeWhitespace(
                value.value != null ? value.value :
                value.name != null ? value.name : ''
            );
        }
        return normalizeWhitespace(value);
    }

    // ----------------------------------------------------------
    // MAP URL EXTRACTION
    // ----------------------------------------------------------

    function extractMapUrl(raw) {
        var text = String(raw == null ? '' : raw);

        // Look for an existing Google Maps URL in returned HTML/text.
        var match = text.match(
            /https?:\/\/(?:www\.)?google\.com\/maps\?[^"'<> \s]*/i
        );

        if (match) {
            var url = decodeHtmlText(match[0])
                .replace(/&amp;/gi, '&')
                .replace(/[),.;]+$/, '');

            try {
                var parsed = new URL(url);
                if (
                    parsed.protocol === 'https:' &&
                    parsed.hostname === 'www.google.com'
                ) {
                    return parsed.href;
                }
            } catch (e) {
                // Try extracting coordinates below.
            }
        }

        // Find coordinates embedded in an API response.
        var latMatch = text.match(
            /(?:latitude|lat)\s*["']?\s*[:=]\s*["']?(-?\d{1,2}\.\d+)/i
        );

        var lonMatch = text.match(
            /(?:longitude|lon|lng)\s*["']?\s*[:=]\s*["']?(-?\d{1,3}\.\d+)/i
        );

        if (latMatch && lonMatch) {
            var lat = Number(latMatch[1]);
            var lon = Number(lonMatch[1]);

            if (
                Number.isFinite(lat) &&
                Number.isFinite(lon) &&
                lat >= -90 && lat <= 90 &&
                lon >= -180 && lon <= 180
            ) {
                return 'https://www.google.com/maps?q=' +
                    encodeURIComponent(lat + ',' + lon);
            }
        }

        // Support coordinates in a Google Maps query.
        var coords = text.match(
            /maps\?q=(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/i
        );

        if (coords) {
            return 'https://www.google.com/maps?q=' +
                encodeURIComponent(coords[1] + ',' + coords[2]);
        }

        return '';
    }

    // ----------------------------------------------------------
    // FIELD NORMALIZATION
    // ----------------------------------------------------------

    var FIELD_DEFINITIONS = [
        {
            key: 'villageName',
            label: 'Village Name',
            aliases: [
                'Village Name',
                'Village',
                'గ్రామం పేరు'
            ]
        },
        {
            key: 'villageCode',
            label: 'Village Code',
            aliases: [
                'Village Code',
                'VillageCode',
                'Village ID'
            ]
        },
        {
            key: 'oldSurveyNo',
            label: 'Old Sy.No.',
            aliases: [
                'Old Survey No.',
                'Old Survey No',
                'Old Sy.No.',
                'Old Sy No',
                'Old Survey Number',
                'Old Sy.No'
            ]
        },
        {
            key: 'lpmNo',
            label: 'LPM No.',
            aliases: [
                'LPM No.',
                'LP No.',
                'LPM Number',
                'LP Number',
                'Plot No.',
                'Plot Number'
            ]
        },
        {
            key: 'extent',
            label: 'Extent',
            aliases: [
                'Extent in Acres',
                'Extent (Acres)',
                'Extent',
                'Area'
            ]
        },
        {
            key: 'landNature',
            label: 'Land Nature',
            aliases: [
                'Land Nature',
                'Nature of Land'
            ]
        },
        {
            key: 'landClassification',
            label: 'Land Classification',
            aliases: [
                'Land Classification',
                'Classification of Land'
            ]
        },
        {
            key: 'kathaNo',
            label: 'Katha No.',
            aliases: [
                'Khata No.',
                'Khata No',
                'Katha No.',
                'Katha No',
                'Khata Number',
                'Katha Number'
            ]
        },
        {
            key: 'pattadarName',
            label: 'Name of the Pattadar',
            aliases: [
                'Name of the Pattadar',
                'Pattadar Name',
                'Pattadar',
                'Owner Name'
            ]
        },
        {
            key: 'fatherName',
            label: 'Father/Husband Name',
            aliases: [
                'Father/ Husband Name',
                'Father / Husband Name',
                'Father/Husband Name',
                'Father Name',
                'Husband Name',
                'Father or Husband Name'
            ]
        }
    ];

    function normalizeKey(key) {
        return String(key == null ? '' : key)
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '');
    }

    function findObjectValue(obj, aliases) {
        if (!obj || typeof obj !== 'object') return '';

        var wanted = aliases.map(normalizeKey);

        // Direct keys first.
        var keys = Object.keys(obj);

        for (var i = 0; i < keys.length; i++) {
            if (wanted.indexOf(normalizeKey(keys[i])) !== -1) {
                return safeValue(obj[keys[i]]);
            }
        }

        // Search nested objects when the API wraps its result.
        for (var j = 0; j < keys.length; j++) {
            var child = obj[keys[j]];

            if (child && typeof child === 'object' && !Array.isArray(child)) {
                var nested = findObjectValue(child, aliases);
                if (nested) return nested;
            }
        }

        return '';
    }

    function parseJsonRecord(json) {
        var record = {};

        var source = json;

        // Common API wrapper formats.
        if (Array.isArray(source)) {
            source = source.length ? source[0] : {};
        }

        if (source && typeof source === 'object') {
            var wrappers = [
                'data',
                'result',
                'record',
                'details',
                'parcel',
                'plot',
                'response'
            ];

            for (var i = 0; i < wrappers.length; i++) {
                if (source[wrappers[i]] != null) {
                    var nested = source[wrappers[i]];

                    if (Array.isArray(nested)) {
                        nested = nested.length ? nested[0] : {};
                    }

                    if (nested && typeof nested === 'object') {
                        source = nested;
                        break;
                    }
                }
            }
        }

        FIELD_DEFINITIONS.forEach(function (field) {
            record[field.key] = findObjectValue(source, field.aliases);
        });

        return record;
    }

    // ----------------------------------------------------------
    // PLAIN TEXT / HTML RESPONSE PARSER
    // ----------------------------------------------------------

    function parseTextRecord(raw) {
        var record = {};
        var source = String(raw == null ? '' : raw);

        // Replace HTML line breaks and table cells with separators.
        var prepared = source
            .replace(/<\s*br\s*\/?\s*>/gi, '\n')
            .replace(/<\/\s*(?:div|p|tr|li|h[1-6])\s*>/gi, '\n')
            .replace(/<\/\s*td\s*>/gi, ' | ')
            .replace(/<\/\s*th\s*>/gi, ' | ');

        var text = stripHtml(prepared)
            .replace(/\r/g, '\n')
            .replace(/[ \t]+\n/g, '\n')
            .replace(/\n[ \t]+/g, '\n');

        // Field labels are matched longest-first to avoid matching
        // "Extent" inside "Extent in Acres".
        var aliases = [];

        FIELD_DEFINITIONS.forEach(function (field) {
            field.aliases.forEach(function (alias) {
                aliases.push({
                    key: field.key,
                    alias: alias
                });
            });
        });

        aliases.sort(function (a, b) {
            return b.alias.length - a.alias.length;
        });

        var labelAlternation = aliases.map(function (item) {
            return item.alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }).join('|');

        var expression = new RegExp(
            '(?:^|[\\n|;])\\s*(' + labelAlternation +
            ')\\s*:\\s*([\\s\\S]*?)(?=(?:\\n|\\|)\\s*(?:' +
            labelAlternation + ')\\s*:|$)',
            'gim'
        );

        var match;

        while ((match = expression.exec(text)) !== null) {
            var matchedLabel = normalizeKey(match[1]);
            var value = normalizeWhitespace(match[2]);

            var fieldMatch = aliases.find(function (item) {
                return normalizeKey(item.alias) === matchedLabel;
            });

            if (fieldMatch && value && !record[fieldMatch.key]) {
                record[fieldMatch.key] = value;
            }
        }

        return record;
    }

    // ----------------------------------------------------------
    // API RESPONSE HANDLING
    // ----------------------------------------------------------

    function hasUsefulDetails(record) {
        if (!record) return false;

        return FIELD_DEFINITIONS.some(function (field) {
            return Boolean(record[field.key]);
        });
    }

    function parseResponse(raw) {
        var text = String(raw == null ? '' : raw).trim();

        if (!text) {
            throw new Error('The server returned an empty response.');
        }

        var mapUrl = extractMapUrl(text);
        var record = null;

        try {
            var json = JSON.parse(text);
            record = parseJsonRecord(json);

            // JSON may contain HTML/text in a message field.
            if (!hasUsefulDetails(record)) {
                var message = '';

                if (typeof json === 'string') {
                    message = json;
                } else if (json && typeof json === 'object') {
                    message = [
                        json.message,
                        json.text,
                        json.details,
                        json.data
                    ].filter(function (v) {
                        return typeof v === 'string';
                    }).join('\n');
                }

                if (message) {
                    record = parseTextRecord(message);
                }
            }
        } catch (e) {
            // Non-JSON response: parse as plain text or HTML.
            record = parseTextRecord(text);
        }

        if (!record || !hasUsefulDetails(record)) {
            var cleanText = stripHtml(text);

            if (
                /not found|no record|no data|invalid village|invalid plot|error|failed/i
                    .test(cleanText)
            ) {
                throw new Error(cleanText.slice(0, 450));
            }

            throw new Error(
                'Could not identify land details in the server response. ' +
                'Check the API response format and Worker logs.'
            );
        }

        FIELD_DEFINITIONS.forEach(function (field) {
            record[field.key] = safeValue(record[field.key]);
        });

        return {
            record: record,
            mapUrl: mapUrl,
            raw: text
        };
    }

    // ----------------------------------------------------------
    // RENDER LAND DETAILS
    // ----------------------------------------------------------

    function buildCopyText(record) {
        return FIELD_DEFINITIONS.map(function (field) {
            return field.label + ': ' +
                (record[field.key] || 'Not available');
        }).join('\n');
    }

    function renderDetails(record, mapUrl) {
        detailsBox.replaceChildren();

        FIELD_DEFINITIONS.forEach(function (field) {
            var row = document.createElement('div');
            row.className = 'bn-detail';

            var label = document.createElement('div');
            label.className = 'bn-detail-label';
            label.textContent = field.label;

            var value = document.createElement('div');
            value.className = 'bn-detail-value';
            value.textContent = record[field.key] || 'Not available';

            row.appendChild(label);
            row.appendChild(value);
            detailsBox.appendChild(row);
        });

        currentDetails = record;
        currentMapUrl = mapUrl || '';
        currentCopyText = buildCopyText(record);

        copyButton.disabled = false;
        mapButton.disabled = !currentMapUrl;

        resultBox.classList.add('bn-result-visible');
    }

    // ----------------------------------------------------------
    // SEARCH
    // ----------------------------------------------------------

    function validateInputs() {
        var village = normalizeWhitespace(villageInput.value);
        var plot = normalizeWhitespace(plotInput.value);

        if (!village) {
            throw new Error('Please enter the Village Code.');
        }

        if (!plot) {
            throw new Error('Please enter the LPM / Plot Number.');
        }

        if (village.length > 40 || plot.length > 80) {
            throw new Error('Please check the entered Village Code and Plot Number.');
        }

        return {
            village: village,
            plot: plot
        };
    }

    async function searchLand() {
        var values;

        try {
            values = validateInputs();
        } catch (error) {
            clearResults();
            setStatus(error.message, 'error');
            return;
        }

        if (requestController) {
            requestController.abort();
        }

        requestController = new AbortController();

        var controller = requestController;
        var timeoutId = setTimeout(function () {
            controller.abort();
        }, REQUEST_TIMEOUT);

        clearResults();
        setStatus('Searching Adangal…', 'info');

        searchButton.disabled = true;
        searchButton.textContent = '⏳ Searching…';

        try {
            var url = new URL(API_URL);
            url.searchParams.set('village', values.village);
            url.searchParams.set('plot', values.plot);

            var response = await fetch(url.href, {
                method: 'GET',
                mode: 'cors',
                cache: 'no-store',
                signal: controller.signal,
                headers: {
                    'Accept': 'application/json, text/plain, text/html, */*'
                }
            });

            var raw = await response.text();

            if (!response.ok) {
                throw new Error(
                    'Server error (' + response.status + '). ' +
                    'Please try again later.'
                );
            }

            var parsed = parseResponse(raw);

            renderDetails(parsed.record, parsed.mapUrl);

            setStatus('Land details loaded successfully.', 'success');
        } catch (error) {
            if (error && error.name === 'AbortError') {
                setStatus(
                    'The request timed out or was cancelled. ' +
                    'Check your internet connection and try again.',
                    'error'
                );
            } else {
                setStatus(
                    error && error.message
                        ? error.message
                        : 'Unable to retrieve land details.',
                    'error'
                );
            }
        } finally {
            clearTimeout(timeoutId);

            if (requestController === controller) {
                requestController = null;
            }

            searchButton.disabled = false;
            searchButton.textContent = '🔍 Search Land Details';
        }
    }

    searchButton.addEventListener('click', searchLand);

    [villageInput, plotInput].forEach(function (input) {
        input.addEventListener('keydown', function (event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                searchLand();
            }
        });
    });

    // ----------------------------------------------------------
    // COPY DETAILS
    // ----------------------------------------------------------

    async function copyText(text) {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return;
        }

        // Fallback for browsers without Clipboard API access.
        var textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        textarea.style.pointerEvents = 'none';

        document.body.appendChild(textarea);
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);

        var successful = false;

        try {
            successful = document.execCommand('copy');
        } finally {
            textarea.remove();
        }

        if (!successful) {
            throw new Error('Copy is not supported by this browser.');
        }
    }

    copyButton.addEventListener('click', async function () {
        if (!currentDetails) return;

        try {
            await copyText(currentCopyText);
            setStatus('Land details copied to clipboard.', 'success');
        } catch (error) {
            setStatus(
                'Unable to copy automatically. Please select and copy the details manually.',
                'error'
            );
        }
    });

    // ----------------------------------------------------------
    // GOOGLE MAPS
    // ----------------------------------------------------------

    mapButton.addEventListener('click', function () {
        if (!currentMapUrl) {
            setStatus(
                'Coordinates or a Google Maps link were not found in the response.',
                'error'
            );
            return;
        }

        window.open(currentMapUrl, '_blank', 'noopener,noreferrer');
    });

    // ----------------------------------------------------------
    // KEYBOARD / ESCAPE SUPPORT
    // ----------------------------------------------------------

    document.addEventListener('keydown', function (event) {
        if (
            event.key === 'Escape' &&
            panel.classList.contains('bn-visible')
        ) {
            closePanel();
        }
    });

    // Initial button states.
    copyButton.disabled = true;
    mapButton.disabled = true;

    console.log('[Adangal] Tool loaded successfully.');

})();
