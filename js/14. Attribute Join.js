/* ============================================================
   JOIN ATTRIBUTES TOOL v4.3
   Web Map Survey | QGIS2WEB | OpenLayers 10.x

   - Uses Web Map Survey's actual vectorLayers registry
   - Layer dropdown shows only Layer Switcher registered layers
   - Joined output is registered with vectorLayers and switcher
   - CSV / TSV / TXT / Excel import
   - Single and composite join keys
   - First / Last / Aggregate / Manual duplicate handling
   - Unmatched original features retained
   - Separate joined vector layer
   - Original layer style reused
   - GeoJSON export with selectable CRS
   - Default CRS: MAP, EPSG:4326, EPSG:3857, EPSG:32643, EPSG:32644
   - Search for additional EPSG codes
   - Automatic SheetJS and Proj4js loading (CDN + local fallback)
   - Light theme and mobile-first responsive layout
   - Excel heading normalization (line breaks, tabs, extra spaces)
   - Manual field pairing only; no automatic field matching

   Save as: join-attributes-tool.js
   ============================================================ */

(function () {
    "use strict";

    if (window.__JOIN_ATTRIBUTES_TOOL_V43__) return;
    window.__JOIN_ATTRIBUTES_TOOL_V43__ = true;

    const TOOL_ID = "join-attributes";
    const BUTTON_ID = "jat-join-button";
    const MODAL_ID = "jat-join-modal";

    let mapInstance = null;
    let sourceLayer = null;
    let importedRows = [];
    let importedHeaders = [];
    let sourceFields = [];
    let joinPairs = [];
    let duplicateSelections = {};
    let joinedFeatures = [];
    let joinedLayer = null;
    let sheetJSLoading = null;
    let proj4Loading = null;

    const $ = id => document.getElementById(id);

    function getOl() {
        return window.ol || (typeof ol !== "undefined" ? ol : null);
    }

    // QGIS2Web map is a lexical global in this project, not window.map.
    function getMap() {
        try {
            if (typeof map !== "undefined" && map &&
                typeof map.getLayers === "function" &&
                typeof map.getView === "function") return map;
        } catch (e) {}

        if (window.map &&
            typeof window.map.getLayers === "function" &&
            typeof window.map.getView === "function") return window.map;

        return null;
    }

    function notify(message, type) {
        const old = $("jat-toast");
        if (old) old.remove();

        const toast = document.createElement("div");
        toast.id = "jat-toast";
        toast.textContent = message;
        toast.style.cssText = `
            position:fixed;left:50%;bottom:20px;transform:translateX(-50%);
            z-index:1000001;max-width:92vw;padding:11px 16px;border-radius:9px;
            background:${type === "error" ? "#b42318" : "#24364f"};
            color:#fff;font:14px Arial,sans-serif;box-shadow:0 4px 18px #0003;
        `;

        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3500);
    }

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, ch => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[ch]);
    }

    function loadScript(url) {
        return new Promise((resolve, reject) => {
            const existing = [...document.scripts].find(s => s.src === url);

            if (existing) {
                if (existing.dataset.loaded === "yes") return resolve();

                existing.addEventListener("load", resolve, { once: true });
                existing.addEventListener("error", reject, { once: true });
                return;
            }

            const script = document.createElement("script");
            script.src = url;
            script.async = true;

            script.onload = () => {
                script.dataset.loaded = "yes";
                resolve();
            };

            script.onerror = () => {
                script.remove();
                reject(new Error("Could not load " + url));
            };

            document.head.appendChild(script);
        });
    }

    async function ensureSheetJS() {
        if (window.XLSX) return window.XLSX;
        if (sheetJSLoading) return sheetJSLoading;

        sheetJSLoading = (async () => {
            for (const url of [
                "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js",
                "./xlsx.full.min.js"
            ]) {
                try {
                    await loadScript(url);
                    if (window.XLSX) return window.XLSX;
                } catch (e) {}
            }

            throw new Error(
                "Excel library unavailable. Place xlsx.full.min.js beside this tool."
            );
        })();

        try {
            return await sheetJSLoading;
        } catch (e) {
            sheetJSLoading = null;
            throw e;
        }
    }

    async function ensureProj4() {
        if (window.proj4) return window.proj4;
        if (proj4Loading) return proj4Loading;

        proj4Loading = (async () => {
            for (const url of [
                "https://cdnjs.cloudflare.com/ajax/libs/proj4js/2.11.0/proj4.min.js",
                "./proj4.min.js"
            ]) {
                try {
                    await loadScript(url);
                    if (window.proj4) return window.proj4;
                } catch (e) {}
            }

            throw new Error(
                "Proj4js unavailable. Place proj4.min.js beside this tool."
            );
        })();

        try {
            return await proj4Loading;
        } catch (e) {
            proj4Loading = null;
            throw e;
        }
    }

    function getProjectionCode(projection) {
        return projection?.getCode?.() || projection?.code_ || "";
    }

    function getMapProjection() {
        return getMap()?.getView?.()?.getProjection?.() || null;
    }

    function defineUTM(code) {
        const olLib = getOl();
        const proj4Lib = window.proj4;

        if (!olLib || !proj4Lib) return false;

        const match = String(code).toUpperCase().match(/^EPSG:(326|327)(\d{2})$/);
        if (!match) return false;

        const zone = Number(match[2]);
        if (zone < 1 || zone > 60) return false;

        const south = match[1] === "327";

        const definition =
            `+proj=utm +zone=${zone} ${south ? "+south " : ""}` +
            "+datum=WGS84 +units=m +no_defs +type=crs";

        proj4Lib.defs(code, definition);
        olLib.proj.proj4.register(proj4Lib);

        return !!olLib.proj.get(code);
    }

    async function ensureProjection(code) {
        const olLib = getOl();

        if (!olLib) throw new Error("OpenLayers is not available.");

        if (olLib.proj.get(code)) return olLib.proj.get(code);

        // Any WGS84 UTM zone can be generated locally.
        if (/^EPSG:(326|327)\d{2}$/i.test(code)) {
            await ensureProj4();

            if (defineUTM(code)) {
                return olLib.proj.get(code);
            }
        }

        // Other EPSG definitions are fetched from EPSG.io.
        const match = String(code).toUpperCase().match(/^EPSG:(\d+)$/);

        if (!match) {
            throw new Error("Enter a valid EPSG code, e.g. EPSG:32645.");
        }

        const proj4Lib = await ensureProj4();

        const response = await fetch(
            "https://epsg.io/" + match[1] + ".proj4",
            { cache: "force-cache" }
        );

        if (!response.ok) {
            throw new Error("CRS not found or internet unavailable.");
        }

        const definition = (await response.text()).trim();

        if (!definition || definition.startsWith("<")) {
            throw new Error("No projection definition was returned for " + code);
        }

        proj4Lib.defs(code, definition);
        olLib.proj.proj4.register(proj4Lib);

        const projection = olLib.proj.get(code);

        if (!projection) {
            throw new Error("Could not register " + code);
        }

        return projection;
    }

    /*
      IMPORTANT:
      vectorLayers is the real Web Map Survey Layer Switcher registry.
      Do not enumerate map.getLayers() here: that includes temporary,
      helper and dummy vector layers that are not listed in the switcher.
    */
    function getVectorLayers() {
        const mapInstance = getMap();
        if (!mapInstance) return [];

        let registry = null;

        try {
            if (typeof vectorLayers !== "undefined" &&
                Array.isArray(vectorLayers)) {
                registry = vectorLayers;
            }
        } catch (e) {}

        if (!registry && Array.isArray(window.vectorLayers)) {
            registry = window.vectorLayers;
        }

        if (!registry) return [];

        const mapLayers = mapInstance.getLayers().getArray();
        const seen = new Set();
        const result = [];

        registry.forEach((layer, index) => {
            if (!layer || typeof layer.getSource !== "function") return;
            if (seen.has(layer) || !mapLayers.includes(layer)) return;

            const source = layer.getSource();

            if (!source ||
                typeof source.getFeatures !== "function" ||
                typeof source.addFeatures !== "function") return;

            seen.add(layer);

            result.push({
                layer,
                source,
                name: layer.get("title") ||
                      layer.get("name") ||
                      `Vector layer ${index + 1}`
            });
        });

        return result;
    }

    function getFeatureFields(layer) {
        const features = layer.getSource().getFeatures();
        const fields = new Set();

        features.slice(0, 150).forEach(feature => {
            Object.keys(feature.getProperties()).forEach(key => {
                if (key !== feature.getGeometryName()) {
                    fields.add(key);
                }
            });
        });

        return [...fields].sort((a, b) => a.localeCompare(b));
    }

    function parseDelimited(text) {
        text = String(text || "").replace(/^\uFEFF/, "");

        const candidates = [",", "\t", ";", "|"];
        let delimiter = ",";
        let best = -1;
        const firstLine = text.split(/\r?\n/)[0] || "";

        candidates.forEach(candidate => {
            let count = 0;
            let quoted = false;

            for (let i = 0; i < firstLine.length; i++) {
                if (firstLine[i] === '"') {
                    if (quoted && firstLine[i + 1] === '"') {
                        i++;
                    } else {
                        quoted = !quoted;
                    }
                } else if (firstLine[i] === candidate && !quoted) {
                    count++;
                }
            }

            if (count > best) {
                best = count;
                delimiter = candidate;
            }
        });

        const rows = [];
        let row = [];
        let cell = "";
        let quoted = false;

        for (let i = 0; i < text.length; i++) {
            const ch = text[i];

            if (ch === '"') {
                if (quoted && text[i + 1] === '"') {
                    cell += '"';
                    i++;
                } else {
                    quoted = !quoted;
                }
            } else if (ch === delimiter && !quoted) {
                row.push(cell);
                cell = "";
            } else if ((ch === "\n" || ch === "\r") && !quoted) {
                if (ch === "\r" && text[i + 1] === "\n") i++;

                row.push(cell);

                if (row.some(v => v !== "")) {
                    rows.push(row);
                }

                row = [];
                cell = "";
            } else {
                cell += ch;
            }
        }

        row.push(cell);

        if (row.some(v => v !== "")) {
            rows.push(row);
        }

        if (rows.length < 2) {
            throw new Error("File needs a header row and at least one data row.");
        }

        const headers = rows[0].map((v, i) =>
            String(v || `Column_${i + 1}`).trim()
        );

        const data = rows.slice(1).map(values => {
            const object = {};

            headers.forEach((header, i) => {
                object[header] = String(values[i] ?? "").trim();
            });

            return object;
        });

        return { headers, data };
    }

    // Normalize column headings once, at import time.
    // This keeps dropdown option values and row-object property names identical.
    // Example: "LP\nNumber", "LP\tNumber" and " LP   Number " become "LP Number".
    function normalizeImportedHeaders(headers, rows) {
        const originalHeaders = headers.map((header, index) =>
            String(header ?? "")
                .replace(/\uFEFF/g, "")
                .replace(/[\s\u00A0]+/g, " ")
                .trim() || `Column_${index + 1}`
        );

        // Avoid silently overwriting data if two original headings normalize
        // to the same name (for example, "LP\nNumber" and "LP Number").
        const used = new Map();

        const normalizedHeaders = originalHeaders.map(header => {
            const count = (used.get(header) || 0) + 1;
            used.set(header, count);

            return count === 1 ? header : `${header}_${count}`;
        });

        const data = rows.map(row => {
            const normalizedRow = {};

            headers.forEach((originalHeader, index) => {
                normalizedRow[normalizedHeaders[index]] =
                    row[originalHeader] ?? "";
            });

            return normalizedRow;
        });

        return {
            headers: normalizedHeaders,
            data
        };
    }

    async function readFile(file) {
        const extension = file.name.split(".").pop().toLowerCase();
        let table;

        if (["xlsx", "xls"].includes(extension)) {
            const XLSX = await ensureSheetJS();

            const workbook = XLSX.read(
                await file.arrayBuffer(),
                { type: "array" }
            );

            const sheetName = workbook.SheetNames[0];

            if (!sheetName) {
                throw new Error("No worksheet found.");
            }

            const rows = XLSX.utils.sheet_to_json(
                workbook.Sheets[sheetName],
                {
                    defval: "",
                    raw: false
                }
            );

            if (!rows.length) {
                throw new Error("The worksheet is empty.");
            }

            table = {
                headers: Object.keys(rows[0]),
                data: rows
            };
        } else {
            table = parseDelimited(await file.text());
        }

        return normalizeImportedHeaders(table.headers, table.data);
    }

    function normalizeKey(value) {
        return String(value ?? "").trim().toLowerCase();
    }

    function makeKey(row, fields) {
        return fields.map(field => normalizeKey(row[field])).join("¦");
    }

    function clearResults() {
        joinedFeatures = [];
        joinedLayer = null;

        if ($("jat-export")) {
            $("jat-export").disabled = true;
        }

        if ($("jat-preview-area")) {
            $("jat-preview-area").innerHTML = "";
        }

        if ($("jat-status")) {
            $("jat-status").textContent = "";
        }
    }

    function buildUI() {
        if ($(MODAL_ID)) return;

        const button = document.createElement("button");
        button.id = BUTTON_ID;
        button.type = "button";
        button.textContent = "🔗 Join Attributes";

        button.style.cssText = `
            position:fixed;left:12px;bottom:90px;z-index:99990;
            border:0;border-radius:9px;padding:11px 14px;
            background:#ffffff;color:#24364f;border:1px solid #cbd5e1;
            font:600 14px Arial,sans-serif;cursor:pointer;
            box-shadow:0 2px 9px #0002;touch-action:manipulation;
        `;

        button.addEventListener("click", openModal);
        document.body.appendChild(button);

        const modal = document.createElement("div");
        modal.id = MODAL_ID;

        modal.style.cssText = `
            display:none;position:fixed;inset:0;z-index:999999;
            background:#0007;align-items:center;justify-content:center;
            padding:12px;box-sizing:border-box;
        `;

        modal.innerHTML = `
          <div id="jat-panel" style="
            width:min(760px,100%);max-height:94vh;overflow:auto;
            background:#fff;color:#1e293b;border:1px solid #dbe3ec;
            border-radius:14px;box-shadow:0 12px 40px #0004;
            font:14px Arial,sans-serif;
          ">
            <div id="jat-header" style="
              position:sticky;top:0;background:#fff;color:#1e293b;
              padding:13px 16px;display:flex;align-items:center;
              justify-content:space-between;z-index:5;
              border-bottom:1px solid #e2e8f0;
            ">
              <strong style="font-size:16px">🔗 Join Attributes</strong>
              <button id="jat-close" type="button" aria-label="Close" style="
                border:0;background:#f1f5f9;color:#334155;
                font-size:23px;width:40px;height:40px;border-radius:8px;
                cursor:pointer
              ">×</button>
            </div>

            <div id="jat-content" style="padding:14px;display:grid;gap:11px">
              <section>
                <label><b>1. Select layer from Layer Switcher</b></label>
                <select id="jat-layer" style="width:100%;margin-top:7px"></select>
                <small>Only vector layers registered in the Web Map Survey Layer Switcher are listed.</small>
              </section>

              <section>
                <b>2. Import CSV / TSV / Excel</b>
                <input id="jat-file" type="file" accept=".csv,.tsv,.txt,.xlsx,.xls"
                  style="display:block;width:100%;margin-top:7px">
                <div id="jat-file-info" style="margin-top:7px;color:#64748b">No table loaded.</div>
              </section>

              <section>
                <b>3. Configure join fields</b>
                <div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:8px">
                  <button id="jat-add-pair" type="button" class="jat-btn">+ Add join field</button>
                </div>
                <div id="jat-pairs" style="display:grid;gap:8px;margin-top:9px"></div>
                <small>Use multiple pairs for a composite join key.</small>
              </section>

              <section>
                <b>4. Duplicate matching rows</b>
                <select id="jat-duplicate-mode" style="width:100%;margin-top:7px">
                  <option value="first">Use first matching row</option>
                  <option value="last">Use last matching row</option>
                  <option value="aggregate">Aggregate duplicate values</option>
                  <option value="manual">Choose matching row manually</option>
                </select>
                <div id="jat-manual" style="margin-top:8px"></div>
              </section>

              <section>
                <b>5. Export CRS</b>
                <select id="jat-crs" style="width:100%;margin-top:7px">
                  <option value="MAP">Same as map</option>
                  <option value="EPSG:4326">WGS 84 — EPSG:4326</option>
                  <option value="EPSG:3857">Web Mercator — EPSG:3857</option>
                  <option value="EPSG:32643">WGS 84 / UTM 43N — EPSG:32643</option>
                  <option value="EPSG:32644">WGS 84 / UTM 44N — EPSG:32644</option>
                </select>

                <div class="jat-search-row" style="display:flex;gap:7px;margin-top:8px">
                  <input id="jat-crs-search" type="text"
                    placeholder="Search another CRS, e.g. EPSG:32645"
                    style="flex:1;min-width:0">
                  <button id="jat-crs-find" type="button" class="jat-btn">Find</button>
                </div>

                <div id="jat-crs-result" style="margin-top:7px;overflow-wrap:anywhere"></div>

                <small style="display:block;margin-top:5px">
                  UTM WGS 84 zones can be registered offline. Other EPSG definitions may require internet.
                </small>

                <small id="jat-map-crs" style="display:block;margin-top:5px;color:#64748b"></small>
              </section>

              <section>
                <b>6. Join and export</b>

                <div class="jat-actions" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:9px">
                  <button id="jat-preview" type="button" class="jat-btn">Preview join</button>
                  <button id="jat-create" type="button" class="jat-btn jat-primary">Create joined layer</button>
                  <button id="jat-export" type="button" class="jat-btn" disabled>Export GeoJSON</button>
                </div>

                <div id="jat-status" style="margin-top:10px;line-height:1.5;color:#334155"></div>
              </section>

              <div id="jat-preview-area" style="overflow:auto;max-height:280px"></div>
            </div>
          </div>
        `;

        document.body.appendChild(modal);

        const style = document.createElement("style");
        style.id = "jat-light-mobile-style";

        style.textContent = `
          #jat-panel, #jat-panel * { box-sizing:border-box; }
          #jat-panel { background:#fff!important;color:#1e293b!important; }

          #jat-panel section {
            min-width:0;padding:12px;border:1px solid #e2e8f0;
            border-radius:10px;background:#fff;
          }

          #jat-panel input,#jat-panel select {
            min-height:44px;padding:10px 11px;border:1px solid #cbd5e1;
            border-radius:8px;background:#fff;color:#1e293b;
            font:14px Arial,sans-serif;max-width:100%;
          }

          #jat-panel input:focus,#jat-panel select:focus {
            outline:none;border-color:#3982d6;box-shadow:0 0 0 2px #3982d622;
          }

          #jat-panel button {
            min-height:42px;
            touch-action:manipulation;
          }

          #jat-panel .jat-btn {
            border:1px solid #cbd5e1;background:#f8fafc;color:#263b59;
            padding:10px 12px;border-radius:8px;cursor:pointer;
            font:600 13px Arial,sans-serif;
          }

          #jat-panel .jat-btn:hover {
            background:#edf4fc;border-color:#94a3b8;
          }

          #jat-panel .jat-primary {
            background:#2563a9;color:#fff;border-color:#2563a9;
          }

          #jat-panel .jat-primary:hover {
            background:#1d4f89;
          }

          #jat-panel small {
            display:block;color:#64748b;line-height:1.5;margin-top:5px;
          }

          #jat-panel table {
            border-collapse:collapse;width:100%;font-size:12px;
          }

          #jat-panel th,#jat-panel td {
            padding:8px;border:1px solid #e2e8f0;text-align:left;
            white-space:nowrap;max-width:190px;overflow:hidden;text-overflow:ellipsis;
          }

          #jat-panel th {
            background:#f1f5f9;color:#1e293b;position:sticky;top:0;
          }

          #jat-panel #jat-crs-result {
            color:#2563a9;
          }

          @media(max-width:650px) {
            #jat-join-modal {
              padding:0!important;align-items:flex-end!important;
            }

            #jat-panel {
              width:100%!important;max-width:100%!important;
              max-height:95dvh!important;height:auto;
              border-radius:16px 16px 0 0!important;
              overflow-y:auto;-webkit-overflow-scrolling:touch;
              padding-bottom:env(safe-area-inset-bottom,0px);
            }

            #jat-header { padding:10px 13px!important; }
            #jat-content { padding:10px!important;gap:9px!important; }
            #jat-panel section { padding:10px; }

            #jat-panel input,#jat-panel select {
              min-height:46px;font-size:16px;
            }

            #jat-panel .jat-btn {
              min-height:44px;padding:10px;font-size:13px;
            }

            #jat-pairs > div {
              grid-template-columns:minmax(0,1fr) minmax(0,1fr) 38px!important;
              gap:5px!important;
            }

            #jat-pairs select {
              min-width:0;font-size:13px!important;
            }

            #jat-panel table { font-size:11px; }
          }

          @media(max-width:380px) {
            #jat-pairs > div {
              grid-template-columns:1fr!important;
            }

            #jat-pairs button { width:100%; }

            #jat-panel .jat-actions {
              display:grid!important;grid-template-columns:1fr 1fr;
            }

            #jat-panel #jat-create {
              grid-column:1/-1;grid-row:1;
            }
          }
        `;

        document.head.appendChild(style);

        $("jat-close").onclick = closeModal;

        modal.addEventListener("click", e => {
            if (e.target === modal) closeModal();
        });

        $("jat-layer").onchange = onLayerChange;
        $("jat-file").onchange = onFileChange;
        $("jat-add-pair").onclick = () => addPairRow();
        $("jat-duplicate-mode").onchange = updateManualUI;
        $("jat-preview").onclick = previewJoin;
        $("jat-create").onclick = createJoinedLayer;
        $("jat-export").onclick = exportGeoJSON;
        $("jat-crs-find").onclick = searchCRS;

        $("jat-crs-search").onkeydown = e => {
            if (e.key === "Enter") searchCRS();
        };

        refreshLayerOptions();
        refreshMapCRSLabel();

        // Start with an empty pairing list. Users add only the fields they need.
        joinPairs = [];
        renderPairRows();
    }

    function refreshLayerOptions() {
        const select = $("jat-layer");
        if (!select) return;

        const layers = getVectorLayers();
        const previous = select.value;

        select.innerHTML = "";

        if (!layers.length) {
            select.innerHTML =
                `<option value="">No switcher-listed vector layers found</option>`;

            sourceLayer = null;
            sourceFields = [];
            renderPairRows();
            return;
        }

        layers.forEach((item, index) => {
            const option = document.createElement("option");
            option.value = String(index);
            option.textContent = item.name;
            select.appendChild(option);
        });

        if (previous && Number(previous) < layers.length) {
            select.value = previous;
        }

        onLayerChange();
    }

    function onLayerChange() {
        const layers = getVectorLayers();
        const index = Number($("jat-layer")?.value || 0);

        sourceLayer = layers[index]?.layer || null;
        sourceFields = sourceLayer ? getFeatureFields(sourceLayer) : [];

        // Field pairs belong to the selected source layer.
        // Do not carry old pairs over.
        joinPairs = [];

        renderPairRows();
        clearResults();
    }

    function refreshMapCRSLabel() {
        const code = getProjectionCode(getMapProjection());

        if ($("jat-map-crs")) {
            $("jat-map-crs").textContent =
                "Current map CRS: " + (code || "Unknown");
        }
    }

    function openModal() {
        mapInstance = getMap();

        if (!mapInstance) {
            notify("Could not find the QGIS2Web OpenLayers map.", "error");
            return;
        }

        buildUI();

        // Re-read the authoritative switcher registry every time the tool opens.
        refreshLayerOptions();
        refreshMapCRSLabel();

        $(MODAL_ID).style.display = "flex";
    }

    function closeModal() {
        if ($(MODAL_ID)) {
            $(MODAL_ID).style.display = "none";
        }
    }

    async function onFileChange(event) {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            $("jat-file-info").textContent = "Reading " + file.name + "...";

            const result = await readFile(file);

            importedHeaders = result.headers;
            importedRows = result.data;
            duplicateSelections = {};

            // Never auto-match or prepopulate fields after importing a table.
            // The pairing list remains empty until the user presses Add join field.
            joinPairs = [];

            $("jat-file-info").textContent =
                `${file.name} — ${importedRows.length.toLocaleString()} rows, ` +
                `${importedHeaders.length} columns`;

            renderPairRows();
            clearResults();

            notify("Table imported successfully.");
        } catch (error) {
            importedRows = [];
            importedHeaders = [];

            $("jat-file-info").textContent = "Import failed.";

            notify(error.message || String(error), "error");
        }
    }

    function addPairRow(sourceValue, tableValue) {
        joinPairs.push({
            source: sourceValue || "",
            table: tableValue || ""
        });

        renderPairRows();
    }

    function renderPairRows() {
        const container = $("jat-pairs");
        if (!container) return;

        container.innerHTML = "";

        if (!joinPairs.length) {
            const empty = document.createElement("div");

            empty.textContent = importedHeaders.length
                ? "No join fields added. Tap + Add join field to choose the fields manually."
                : "Import a table, then tap + Add join field to configure your join.";

            empty.style.cssText =
                "padding:10px;border:1px dashed #cbd5e1;border-radius:8px;" +
                "color:#64748b;background:#f8fafc;line-height:1.45";

            container.appendChild(empty);
            return;
        }

        joinPairs.forEach((pair, index) => {
            const row = document.createElement("div");

            row.style.cssText =
                "display:grid;grid-template-columns:1fr 1fr auto;" +
                "gap:6px;align-items:center";

            const sourceSelect = document.createElement("select");

            sourceSelect.innerHTML =
                `<option value="">Layer field</option>` +
                sourceFields.map(field =>
                    `<option value="${escapeHTML(field)}">${escapeHTML(field)}</option>`
                ).join("");

            sourceSelect.value = pair.source;

            const tableSelect = document.createElement("select");

            tableSelect.innerHTML =
                `<option value="">Table field</option>` +
                importedHeaders.map(field =>
                    `<option value="${escapeHTML(field)}">${escapeHTML(field)}</option>`
                ).join("");

            tableSelect.value = pair.table;

            sourceSelect.onchange = () => {
                pair.source = sourceSelect.value;
                clearResults();
            };

            tableSelect.onchange = () => {
                pair.table = tableSelect.value;
                clearResults();
            };

            const remove = document.createElement("button");

            remove.type = "button";
            remove.textContent = "×";
            remove.title = "Remove join field";

            remove.style.cssText =
                "border:0;background:#fee2e2;color:#991b1b;" +
                "border-radius:7px;padding:7px 11px;cursor:pointer";

            remove.onclick = () => {
                joinPairs.splice(index, 1);
                renderPairRows();
                clearResults();
            };

            row.append(sourceSelect, tableSelect, remove);
            container.appendChild(row);
        });
    }

    function getValidPairs() {
        return joinPairs.filter(pair => pair.source && pair.table);
    }

    function buildLookup() {
        const pairs = getValidPairs();

        if (!pairs.length) {
            throw new Error("Select at least one pair of join fields.");
        }

        if (!importedRows.length) {
            throw new Error("Import a CSV or Excel table first.");
        }

        const lookup = new Map();

        importedRows.forEach((row, index) => {
            const key = makeKey(
                row,
                pairs.map(pair => pair.table)
            );

            if (!key.replace(/¦/g, "")) return;

            if (!lookup.has(key)) {
                lookup.set(key, []);
            }

            lookup.get(key).push({ row, index });
        });

        return { pairs, lookup };
    }

    function aggregateRows(rows) {
        const result = {};

        importedHeaders.forEach(field => {
            const values = rows
                .map(row => String(row[field] ?? "").trim())
                .filter(Boolean);

            const numeric =
                values.length &&
                values.every(value => Number.isFinite(Number(value)));

            result[field] = numeric
                ? values.reduce((sum, value) => sum + Number(value), 0)
                : [...new Set(values)].join(", ");
        });

        return result;
    }

    function chooseTableRow(key, matches, mode) {
        if (mode === "last") {
            return matches[matches.length - 1].row;
        }

        if (mode === "aggregate") {
            return aggregateRows(matches.map(item => item.row));
        }

        if (mode === "manual") {
            const selected = duplicateSelections[key] ?? 0;

            return matches[
                Math.min(selected, matches.length - 1)
            ].row;
        }

        return matches[0].row;
    }

    function updateManualUI() {
        const area = $("jat-manual");
        if (!area) return;

        area.innerHTML = "";

        if ($("jat-duplicate-mode").value !== "manual") {
            return;
        }

        try {
            const { lookup } = buildLookup();

            const duplicates = [...lookup.entries()]
                .filter(([, rows]) => rows.length > 1);

            if (!duplicates.length) {
                area.textContent = "No duplicate keys found.";
                return;
            }

            const wrapper = document.createElement("div");

            wrapper.style.cssText =
                "max-height:190px;overflow:auto;border:1px solid #e2e8f0;" +
                "border-radius:8px;padding:8px";

            duplicates.forEach(([key, matches]) => {
                const line = document.createElement("div");

                line.style.cssText =
                    "display:grid;grid-template-columns:1fr 145px;gap:7px;" +
                    "padding:6px 0;border-bottom:1px solid #eee";

                const label = document.createElement("span");

                label.textContent = key.replace(/¦/g, " | ");
                label.style.cssText =
                    "overflow:hidden;text-overflow:ellipsis";

                const select = document.createElement("select");

                matches.forEach((match, index) => {
                    const option = document.createElement("option");

                    option.value = String(index);
                    option.textContent = `Row ${match.index + 2}`;

                    select.appendChild(option);
                });

                select.value = String(duplicateSelections[key] ?? 0);

                select.onchange = () => {
                    duplicateSelections[key] = Number(select.value);
                    clearResults();
                };

                line.append(label, select);
                wrapper.appendChild(line);
            });

            area.appendChild(wrapper);
        } catch (error) {
            area.textContent = error.message;
        }
    }

    function buildJoinedProperties(originalProperties, tableRow) {
        const result = { ...originalProperties };

        importedHeaders.forEach(field => {
            let outputField = field;

            if (Object.prototype.hasOwnProperty.call(result, outputField)) {
                outputField = "joined_" + field;
            }

            const base = outputField;
            let suffix = 2;

            while (Object.prototype.hasOwnProperty.call(result, outputField)) {
                outputField = base + "_" + suffix++;
            }

            result[outputField] = tableRow[field] ?? "";
        });

        return result;
    }

    function createJoinedFeatureObjects() {
        const olLib = getOl();

        if (!olLib) {
            throw new Error("OpenLayers is not available.");
        }

        if (!sourceLayer) {
            throw new Error("Select a Layer Switcher vector layer.");
        }

        const { pairs, lookup } = buildLookup();
        const mode = $("jat-duplicate-mode").value;

        const sourceFieldsForKey = pairs.map(pair => pair.source);
        const output = [];

        let matched = 0;
        let unmatched = 0;

        sourceLayer.getSource().getFeatures().forEach(feature => {
            const properties = feature.getProperties();

            const key = makeKey(properties, sourceFieldsForKey);
            const matches = lookup.get(key);

            const tableRow = matches?.length
                ? chooseTableRow(key, matches, mode)
                : null;

            if (tableRow) {
                matched++;
            } else {
                unmatched++;
            }

            const newFeature = new olLib.Feature();

            const geometry = feature.getGeometry();

            if (geometry) {
                newFeature.setGeometry(geometry.clone());
            }

            const outputProperties = tableRow
                ? buildJoinedProperties(properties, tableRow)
                : { ...properties };

            delete outputProperties[feature.getGeometryName()];

            newFeature.setProperties(outputProperties);

            if (feature.getId() !== undefined) {
                newFeature.setId(feature.getId());
            }

            output.push(newFeature);
        });

        return {
            features: output,
            matched,
            unmatched
        };
    }

    function renderPreview(features) {
        const area = $("jat-preview-area");

        if (!features.length) {
            area.innerHTML = "No features to preview.";
            return;
        }

        const fields = Object.keys(
            features[0].getProperties()
        ).slice(0, 8);

        area.innerHTML = `
          <b style="display:block;margin:6px 0">
            Preview — first ${Math.min(6, features.length)} features
          </b>

          <table>
            <thead>
              <tr>
                ${fields.map(field =>
                    `<th>${escapeHTML(field)}</th>`
                ).join("")}
              </tr>
            </thead>

            <tbody>
              ${features.slice(0, 6).map(feature => {
                  const properties = feature.getProperties();

                  return `<tr>${
                      fields.map(field =>
                          `<td title="${escapeHTML(properties[field])}">` +
                          `${escapeHTML(properties[field])}</td>`
                      ).join("")
                  }</tr>`;
              }).join("")}
            </tbody>
          </table>
        `;
    }

    function previewJoin() {
        try {
            updateManualUI();

            const result = createJoinedFeatureObjects();

            joinedFeatures = result.features;

            renderPreview(joinedFeatures);

            $("jat-status").textContent =
                `Preview ready. Matched: ${result.matched.toLocaleString()} | ` +
                `Unmatched (retained): ${result.unmatched.toLocaleString()}`;

            notify("Join preview created.");
        } catch (error) {
            notify(error.message || String(error), "error");
        }
    }

    // Register with the exact Web Map Survey layer-switcher architecture.
    function registerJoinedLayerInSwitcher(layer) {
        let registry = null;

        try {
            if (typeof vectorLayers !== "undefined" &&
                Array.isArray(vectorLayers)) {
                registry = vectorLayers;
            }
        } catch (e) {}

        if (!registry && Array.isArray(window.vectorLayers)) {
            registry = window.vectorLayers;
        }

        if (!registry) {
            throw new Error("Web Map Survey vectorLayers registry was not found.");
        }

        if (!registry.includes(layer)) {
            registry.push(layer);
        }

        // Prefer the Layer Manager's own renderer.
        if (typeof window.rebuildLayerManager === "function") {
            window.rebuildLayerManager();
        } else {
            try {
                if (typeof rebuildLayerManager === "function") {
                    rebuildLayerManager();
                } else if (typeof window.addOverlayToSwitcher === "function") {
                    window.addOverlayToSwitcher(layer);
                } else if (typeof addOverlayToSwitcher === "function") {
                    addOverlayToSwitcher(layer);
                }
            } catch (e) {
                console.warn(
                    "[Join Attributes] Switcher registration:",
                    e
                );
            }
        }

        // A second refresh accommodates manager code that schedules its own UI.
        requestAnimationFrame(() => {
            try {
                if (typeof window.rebuildLayerManager === "function") {
                    window.rebuildLayerManager();
                } else if (typeof rebuildLayerManager === "function") {
                    rebuildLayerManager();
                }
            } catch (e) {}
        });
    }

    function createJoinedLayer() {
        try {
            const olLib = getOl();

            mapInstance = getMap();

            if (!mapInstance) {
                throw new Error("Map not found.");
            }

            if (!sourceLayer) {
                throw new Error("Select a Layer Switcher vector layer.");
            }

            const result = createJoinedFeatureObjects();

            joinedFeatures = result.features;

            const vectorSource = new olLib.source.Vector({
                features: joinedFeatures
            });

            const originalName =
                sourceLayer.get("title") ||
                sourceLayer.get("name") ||
                "Layer";

            const name = originalName + " — Joined";

            joinedLayer = new olLib.layer.Vector({
                source: vectorSource,
                style: sourceLayer.getStyle?.() || undefined
            });

            joinedLayer.set("title", name);
            joinedLayer.set("name", name);
            joinedLayer.set("file", name);
            joinedLayer.set("joinAttributesOutput", true);
            joinedLayer.set("type", "vector");
            joinedLayer.set("isLocal", true);
            joinedLayer.setVisible(true);

            // Add to map and the authoritative Layer Switcher registry.
            mapInstance.addLayer(joinedLayer);

            registerJoinedLayerInSwitcher(joinedLayer);

            $("jat-export").disabled = false;

            $("jat-status").textContent =
                `Created "${name}". Features: ${joinedFeatures.length.toLocaleString()} | ` +
                `Matched: ${result.matched.toLocaleString()} | ` +
                `Unmatched retained: ${result.unmatched.toLocaleString()}`;

            renderPreview(joinedFeatures);

            notify("Joined layer added to the map and Layer Switcher.");
        } catch (error) {
            console.error("[Join Attributes] Create layer:", error);
            notify(error.message || String(error), "error");
        }
    }

    async function getExportProjection() {
        const selected = $("jat-crs").value;
        const mapProjection = getMapProjection();

        if (!mapProjection) {
            throw new Error("Map projection is unavailable.");
        }

        if (selected === "MAP") {
            return mapProjection;
        }

        return await ensureProjection(selected);
    }

    async function searchCRS() {
        const input = $("jat-crs-search");
        const result = $("jat-crs-result");

        let value = input.value.trim().toUpperCase();

        if (!value) {
            result.textContent = "Enter an EPSG code, e.g. EPSG:32645.";
            return;
        }

        const code = value.startsWith("EPSG:")
            ? value
            : "EPSG:" + value;

        if (!/^EPSG:\d+$/.test(code)) {
            result.textContent = "Please enter a valid EPSG code.";
            return;
        }

        result.textContent = "Checking " + code + "...";

        try {
            const projection = await ensureProjection(code);
            const select = $("jat-crs");

            let option = [...select.options].find(
                item => item.value === code
            );

            if (!option) {
                option = document.createElement("option");
                option.value = code;
                option.textContent =
                    code + " — " + (projection.getUnits?.() || "CRS");

                select.appendChild(option);
            }

            select.value = code;

            result.textContent = code + " is available and selected.";

            notify("CRS added: " + code);
        } catch (error) {
            result.textContent = error.message || String(error);
        }
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.href = url;
        link.download = filename;

        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }

    async function exportGeoJSON() {
        try {
            if (!joinedFeatures.length) {
                throw new Error(
                    "Create the joined layer or preview the join first."
                );
            }

            const olLib = getOl();
            const mapProjection = getMapProjection();

            $("jat-status").textContent = "Preparing GeoJSON export...";

            const targetProjection = await getExportProjection();

            const format = new olLib.format.GeoJSON();

            const geojson = format.writeFeatures(joinedFeatures, {
                featureProjection: mapProjection,
                dataProjection: targetProjection,
                decimals: 8
            });

            const blob = new Blob([geojson], {
                type: "application/geo+json;charset=utf-8"
            });

            const sourceName =
                sourceLayer?.get("title") ||
                sourceLayer?.get("name") ||
                "joined_layer";

            const safeName = String(sourceName)
                .replace(/[^\w-]+/g, "_")
                .replace(/^_+|_+$/g, "");

            const filename =
                (safeName || "joined_layer") + "_joined.geojson";

            if (window.showSaveFilePicker) {
                try {
                    const handle = await window.showSaveFilePicker({
                        suggestedName: filename,
                        types: [{
                            description: "GeoJSON",
                            accept: {
                                "application/geo+json": [".geojson", ".json"]
                            }
                        }]
                    });

                    const writable = await handle.createWritable();

                    await writable.write(blob);
                    await writable.close();

                } catch (error) {
                    if (error.name === "AbortError") {
                        $("jat-status").textContent = "Export cancelled.";
                        return;
                    }

                    throw error;
                }
            } else {
                downloadBlob(blob, filename);
            }

            $("jat-status").textContent =
                "GeoJSON exported using " +
                getProjectionCode(targetProjection) + ".";

            notify("GeoJSON export completed.");

        } catch (error) {
            $("jat-status").textContent = error.message || String(error);
            notify(error.message || String(error), "error");
        }
    }

    function registerTool() {
        const config = {
            id: TOOL_ID,
            name: "Join Attributes",
            icon: "🔗",
            selector: "#" + BUTTON_ID,
            defaults: {
                top: 460,
                left: 12
            },
            visible: true
        };

        try {
            if (window.MapToolManager &&
                typeof window.MapToolManager.register === "function") {
                window.MapToolManager.register(config);
            }
        } catch (error) {
            console.warn(
                "[Join Attributes] Tool Manager registration:",
                error
            );
        }
    }

    function initialize() {
        if (!getOl()) {
            console.warn(
                "[Join Attributes] OpenLayers not detected yet."
            );

            setTimeout(initialize, 1000);
            return;
        }

        buildUI();
        registerTool();

        console.log(
            "[Join Attributes] v4.3 initialized; manual field pairing; " +
            "normalized import headers; using vectorLayers switcher registry."
        );
    }

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            initialize,
            { once: true }
        );
    } else {
        initialize();
    }

})();
