// ============================================================================
// plotReportTool.js — QGIS2WEB Plot Report Tool (v3.0 — Complete Rewrite)
// ============================================================================
// MAJOR CHANGES vs v2:
//  ✅ FIXED: Dimension/area calculations now use UTM projection (accurate meters)
//  ✅ FIXED: Event listener leaks, timer pollution, history bloat
//  ✅ FIXED: PDF z-order, template validation, QR data in history
//  ✅ PDF export preserves vector geometry and text; raster sources remain embedded images
//  ✅ NEW: Plugin architecture — register features at bottom of file
//  ✅ NEW: Full sketch control (stroke, fill, labels, dim styles, units)
//  ✅ NEW: CAD sketch editing (vertices, snapping, points, lines, polygons)
//  ✅ NEW: Responsive mobile layout and zoom up to 1600%
//  ✅ NEW: Multi-polygon layout prompt (combined vs one-per-page)
//  ✅ NEW: Collapsible properties panel with sliders & live preview
//  ✅ NEW: Attribute picker for Insert Details
//  ✅ NEW: Configurable projection selector
//  ✅ NEW: Built-in plugins — Image, Scale Bar, North Arrow
// ============================================================================

(function () {
  'use strict';

  // ==========================================================================
  // GLOBAL CONFIG (user-configurable)
  // ==========================================================================
  const CONFIG = {
    defaultDataProjection: 'EPSG:32643',  // UTM Zone 43N (India 72°–78°E)
    projectionOptions: [
      { code: 'EPSG:32642', name: 'UTM 42N (India West)' },
      { code: 'EPSG:32643', name: 'UTM 43N (India Central)' },
      { code: 'EPSG:32644', name: 'UTM 44N (India East)' },
      { code: 'EPSG:32645', name: 'UTM 45N (India NE)' },
      { code: 'EPSG:3857',  name: 'Web Mercator' },
      { code: 'EPSG:4326',  name: 'WGS84 (Lon/Lat)' }
    ],
    historyLimit: 140,
    historyDebounceMs: 400
  };

  let CURRENT_PROJECTION = CONFIG.defaultDataProjection;

  // ==========================================================================
  // DEPENDENCY LOADER
  // ==========================================================================
  const DependencyLoader = {
    loaded: {},
    loadScript(url, id) {
      return new Promise((resolve) => {
        if (this.loaded[id] || document.getElementById('prt-dep-' + id)) return resolve();
        const s = document.createElement('script');
        s.src = url;
        s.id = 'prt-dep-' + id;
        s.onload = () => { this.loaded[id] = true; resolve(); };
        s.onerror = () => { console.warn('[PRT] Failed:', url); resolve(); };
        document.head.appendChild(s);
      });
    },
    async loadAll() {
      await this.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', 'jspdf');
      await this.loadScript('https://cdn.jsdelivr.net/npm/svg2pdf.js@2.5.0/dist/svg2pdf.umd.min.js', 'svg2pdf');
      await this.loadScript('https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js', 'qrcode-generator');
      this._injectFonts();
    },
    _injectFonts() {
      const style = document.createElement('style');
      style.textContent = `
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Telugu:wght@400;700&family=Noto+Sans:wght@400;700&display=swap');
        .prt-panel, .prt-toast, .prt-modal, .prt-text-element, .prt-table-element {
          font-family: 'Noto Sans Telugu','Noto Sans',Arial,sans-serif !important;
        }

      `;
      document.head.appendChild(style);
    }
  };

  // ==========================================================================
  // STYLES
  // ==========================================================================
  const STYLES = `
  :root{
    --prt-primary:#2563eb; --prt-primary-dark:#1d4ed8; --prt-primary-light:#dbeafe;
    --prt-danger:#dc2626; --prt-success:#16a34a; --prt-warning:#f59e0b;
    --prt-gray-50:#f9fafb; --prt-gray-100:#f3f4f6; --prt-gray-200:#e5e7eb; --prt-gray-300:#d1d5db;
    --prt-gray-400:#9ca3af; --prt-gray-500:#6b7280; --prt-gray-600:#4b5563; --prt-gray-700:#374151;
    --prt-gray-800:#1f2937; --prt-gray-900:#111827;
    --prt-shadow:0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
    --prt-shadow-lg:0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
    --prt-radius:8px; --prt-transition:all 0.2s ease;
  }
  .prt-main-btn{position:fixed;bottom:20px;right:20px;z-index:10000;width:56px;height:56px;border-radius:50%;background:var(--prt-primary);color:#fff;border:none;cursor:pointer;box-shadow:var(--prt-shadow-lg);display:flex;align-items:center;justify-content:center;transition:var(--prt-transition)}
  .prt-main-btn:hover{background:var(--prt-primary-dark);transform:scale(1.07)}
  .prt-main-btn svg{width:28px;height:28px;fill:#fff}
  .prt-panel{position:fixed;top:0;right:-420px;width:400px;max-width:100vw;height:100vh;background:#fff;z-index:2147483100!important;box-shadow:-4px 0 20px rgba(0,0,0,.15);transition:right .3s ease;display:flex;flex-direction:column;overflow:hidden}
  .prt-panel.open{right:0}
  @media(max-width:480px){.prt-panel{width:100vw;right:-100vw}}
  .prt-panel-header{background:var(--prt-primary);color:#fff;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
  .prt-panel-header h2{margin:0;font-size:18px;font-weight:700}
  .prt-panel-close{background:none;border:none;color:#fff;font-size:24px;cursor:pointer;opacity:.85}
  .prt-panel-close:hover{opacity:1}
  .prt-panel-body{flex:1;overflow:auto;padding:20px}
  .prt-form-group{margin-bottom:16px}
  .prt-form-group label{display:block;font-size:13px;font-weight:700;color:var(--prt-gray-700);margin-bottom:6px}
  .prt-select,.prt-input,.prt-textarea{width:100%;padding:10px 12px;border:1px solid var(--prt-gray-300);border-radius:var(--prt-radius);font-size:14px;color:var(--prt-gray-800);background:#fff;box-sizing:border-box}
  .prt-textarea{resize:vertical;min-height:80px}
  .prt-select:focus,.prt-input:focus,.prt-textarea:focus{outline:none;border-color:var(--prt-primary);box-shadow:0 0 0 3px var(--prt-primary-light)}
  .prt-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:10px 20px;border:none;border-radius:var(--prt-radius);font-size:14px;font-weight:600;cursor:pointer;transition:var(--prt-transition);white-space:nowrap}
  .prt-btn-primary{background:var(--prt-primary);color:#fff}
  .prt-btn-primary:hover{background:var(--prt-primary-dark)}
  .prt-btn-outline{background:#fff;color:var(--prt-gray-700);border:1px solid var(--prt-gray-300)}
  .prt-btn-outline:hover{background:var(--prt-gray-50)}
  .prt-btn-success{background:var(--prt-success);color:#fff}
  .prt-btn-success:hover{background:#15803d}
  .prt-btn-danger{background:var(--prt-danger);color:#fff}
  .prt-btn-danger:hover{background:#b91c1c}
  .prt-btn-block{width:100%}
  .prt-panel-body .prt-btn svg{display:block;width:20px;height:20px;flex-shrink:0;fill:currentColor}
  .prt-btn-sm{padding:6px 12px;font-size:12px}
  .prt-selection-bar{position:fixed;top:0;left:0;right:0;z-index:200020;background:var(--prt-gray-900);color:#fff;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px;transform:translateY(-110%);transition:transform .3s ease;box-shadow:var(--prt-shadow-lg)}
  .prt-selection-bar.visible{transform:translateY(0)}
  .prt-selection-bar-info{display:flex;align-items:center;gap:10px;font-size:14px;min-width:0}
  .prt-selection-bar-info span:first-child{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .prt-selection-count{background:var(--prt-primary);padding:2px 10px;border-radius:12px;font-weight:800}
  .prt-selection-bar-actions{display:flex;gap:8px;flex-shrink:0}
  .prt-selection-confirm,.prt-selection-cancel,.prt-selection-toolbtn{width:36px;height:36px;border-radius:50%;border:none;cursor:pointer;color:#fff;font-size:16px;font-weight:900;display:flex;align-items:center;justify-content:center;transition:.15s}
  .prt-selection-confirm{background:var(--prt-success)}
  .prt-selection-cancel{background:var(--prt-danger)}
  .prt-selection-toolbtn{background:#475569}
  .prt-selection-confirm:hover{background:#15803d;transform:scale(1.1)}
  .prt-selection-cancel:hover{background:#b91c1c;transform:scale(1.1)}
  .prt-selection-toolbtn:hover{background:#64748b;transform:scale(1.05)}
  .prt-selection-toolbtn.active{background:var(--prt-warning);color:#111827}
  body.prt-polygon-selection #feature-info-popup,body.prt-polygon-selection .ol-popup,body.prt-polygon-selection .ol-tooltip,body.prt-polygon-selection .feature-popup,body.prt-polygon-selection .popup-content,body.prt-polygon-selection .prt-toast{visibility:hidden!important;pointer-events:none!important}
  .prt-sketch-preview{border:1px solid var(--prt-gray-200);border-radius:var(--prt-radius);background:#fff;padding:8px;margin-bottom:16px;min-height:200px;display:flex;align-items:center;justify-content:center;overflow:hidden}
  .prt-sketch-preview svg{max-width:100%;max-height:400px}
  .prt-attr-table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:12px}
  .prt-attr-table th,.prt-attr-table td{padding:6px 10px;border-bottom:1px solid var(--prt-gray-200);text-align:left}
  .prt-attr-table th{background:var(--prt-gray-50);font-weight:700;color:var(--prt-gray-600);width:40%}
  .prt-toast{position:fixed;top:calc(env(safe-area-inset-top,0px) + 12px);left:50%;transform:translateX(-50%) translateY(-16px);background:rgba(31,41,55,.62);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);color:#fff;padding:9px 16px;border:1px solid rgba(255,255,255,.2);border-radius:10px;z-index:200030;transition:transform .2s ease,opacity .2s ease;box-shadow:0 4px 14px rgba(0,0,0,.12);max-width:92vw;text-align:center;opacity:0;pointer-events:none}
  .prt-toast.visible{transform:translateX(-50%) translateY(0);opacity:1}
  .prt-designer-overlay{position:fixed;inset:0;z-index:200000;background:var(--prt-gray-100);display:none;flex-direction:column;height:100dvh}
  .prt-designer-overlay.open{display:flex}
  .prt-designer-toolbar{background:#fff;border-bottom:1px solid var(--prt-gray-200);box-shadow:var(--prt-shadow);z-index:8;flex-shrink:0}
  .prt-toolbar-main{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 10px;flex-wrap:nowrap}
  .prt-toolbar-title{font-weight:800;color:var(--prt-gray-800)}
  .prt-toolbar-toggle{background:#fff;border:1px solid var(--prt-gray-300);border-radius:10px;padding:6px 10px;cursor:pointer;font-size:13px;color:var(--prt-gray-600)}
  .prt-toolbar-toggle:hover{background:var(--prt-gray-50)}
  .prt-designer-workspace{flex:1;min-height:0;display:flex;position:relative;overflow:hidden}
  .prt-toolbar-tools{width:0;min-width:0;flex:0 0 0;box-sizing:border-box;display:flex;flex-direction:column;align-items:stretch;gap:5px;padding:0;overflow-x:hidden;overflow-y:auto;background:#fff;border-right:1px solid var(--prt-gray-200);transition:flex-basis .2s,width .2s,padding .2s;z-index:5}
  .prt-toolbar-tools:not(.collapsed){width:190px;flex-basis:190px;padding:10px 8px}
  .prt-tool-btn{display:flex;flex:0 0 auto;align-self:stretch;box-sizing:border-box;flex-direction:row;align-items:center;justify-content:flex-start;width:100%;max-width:100%;min-width:0;min-height:42px;border:1px solid var(--prt-gray-200);border-radius:8px;background:#fff;cursor:pointer;color:var(--prt-gray-600);font-size:12px;gap:10px;padding:6px 10px;text-align:left}
  .prt-tool-btn span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .prt-tool-btn:hover{background:var(--prt-gray-50);border-color:var(--prt-gray-400)}
  .prt-tool-btn.active{background:var(--prt-primary-light);border-color:var(--prt-primary);color:var(--prt-primary)}
  .prt-tool-btn svg{width:18px;height:18px;flex-shrink:0}
  .prt-tool-separator{height:1px;width:100%;background:var(--prt-gray-200);margin:3px 0}
  .prt-zoom-box{display:inline-flex;align-items:center;gap:6px;padding:4px 8px;border:1px solid var(--prt-gray-200);border-radius:12px;background:#fff}
  .prt-zoom-label{min-width:52px;text-align:center;color:var(--prt-gray-600);font-size:12px}
  .prt-designer-canvas-area{flex:1;min-width:0;min-height:0;overflow:auto;display:flex;align-items:flex-start;justify-content:flex-start;padding:14px;background:var(--prt-gray-200);position:relative;touch-action:pan-x pan-y;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
  .prt-page-canvas{background:#fff;box-shadow:var(--prt-shadow-lg);position:relative;overflow:visible;transform-origin:0 0;flex:0 0 auto;margin:auto}
  .prt-page-canvas.crosshair{cursor:crosshair}
  .prt-canvas-element{position:absolute;cursor:move;transform-origin:center center}
  .prt-canvas-element.selected{outline:2px solid var(--prt-primary);outline-offset:2px}
  .prt-resize-handle{position:absolute;width:18px;height:18px;background:var(--prt-primary);border:2px solid #fff;border-radius:4px;display:none;z-index:20;touch-action:none}
  .prt-canvas-element.selected .prt-resize-handle{display:block}
  .prt-resize-handle.nw{top:-6px;left:-6px;cursor:nw-resize}
  .prt-resize-handle.ne{top:-6px;right:-6px;cursor:ne-resize}
  .prt-resize-handle.sw{bottom:-6px;left:-6px;cursor:sw-resize}
  .prt-resize-handle.se{bottom:-6px;right:-6px;cursor:se-resize}
  .prt-rotation-handle{position:absolute;top:-28px;left:calc(50% - 7px);width:14px;height:14px;background:var(--prt-warning);border:2px solid #fff;border-radius:50%;display:none;z-index:11;cursor:grab}
  .prt-rotation-line{position:absolute;top:-15px;left:50%;width:1px;height:15px;background:var(--prt-primary);display:none;z-index:10}
  .prt-canvas-element.selected .prt-rotation-handle,.prt-canvas-element.selected .prt-rotation-line{display:block}
  .prt-text-element{width:100%;height:100%;padding:4px;box-sizing:border-box;white-space:pre-wrap;overflow:hidden}
  .prt-line-element,.prt-sketch-element,.prt-qr-element{width:100%;height:100%;pointer-events:none}.prt-line-element{overflow:visible}.prt-canvas-element[data-line-shape="true"]{transform:none!important;overflow:visible}.prt-canvas-element[data-line-shape="true"] .prt-resize-handle{width:22px;height:22px}
  .prt-line-element svg,.prt-sketch-element svg{width:100%;height:100%;overflow:visible}
  .prt-sketch-edit-handle{fill:#f59e0b;stroke:#fff;stroke-width:1.5;cursor:grab;pointer-events:all}
  .prt-sketch-edit-handle:active{cursor:grabbing}
  .prt-sketch-edit-hit{fill:transparent;stroke:transparent;pointer-events:all;touch-action:none;-webkit-tap-highlight-color:transparent}
  [data-prt-dimension-key]{cursor:grab}
  [data-prt-dimension-key]:active{cursor:grabbing}
  .prt-rect-element{width:100%;height:100%;box-sizing:border-box}
  .prt-qr-element img{width:100%;height:100%;object-fit:contain;image-rendering:pixelated}
  .prt-image-element img{width:100%;height:100%;object-fit:contain}
  .prt-props-panel{position:absolute;inset:0 0 0 auto;box-sizing:border-box;background:#fff;border-left:1px solid var(--prt-gray-200);box-shadow:var(--prt-shadow-lg);width:0;max-width:88vw;overflow:hidden;z-index:8;display:flex;flex-direction:column;min-height:0;transition:width .2s}
  .prt-props-panel.visible{display:flex}
  .prt-props-panel.expanded{width:300px;flex-shrink:0}
  .prt-props-rail{position:absolute;z-index:9;right:0;top:50%;transform:translateY(-50%);width:28px;height:58px;border:1px solid var(--prt-gray-300);border-right:0;border-radius:10px 0 0 10px;background:#fff;color:var(--prt-gray-700);box-shadow:var(--prt-shadow);cursor:pointer;font-size:20px;line-height:1}
  .prt-props-rail:hover{background:var(--prt-primary-light);color:var(--prt-primary)}
  .prt-cad-dock{position:absolute;z-index:10;bottom:10px;left:50%;transform:translateX(-50%);width:min(760px,calc(100% - 24px));background:#fff;border:1px solid var(--prt-gray-300);border-radius:14px;box-shadow:var(--prt-shadow-lg);overflow:hidden}
  .prt-cad-dock-header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 12px;background:linear-gradient(180deg,#fff,#f8fafc);cursor:grab;touch-action:none;user-select:none}
  .prt-cad-dock-header.dragging{cursor:grabbing}
  .prt-cad-dock-hint{margin-left:auto;color:var(--prt-gray-500);font-size:11px;font-weight:500;white-space:nowrap}
  .prt-cad-dock-header .prt-toolbar-toggle{touch-action:manipulation}
  .prt-sketch-draft-actions{position:absolute;z-index:11;top:10px;left:50%;transform:translateX(-50%);display:flex;gap:10px;padding:6px;background:#fff;border:1px solid var(--prt-gray-300);border-radius:14px;box-shadow:var(--prt-shadow-lg)}
  .prt-sketch-draft-actions[hidden]{display:none}
  .prt-sketch-draft-action{display:flex;align-items:center;justify-content:center;width:42px;height:42px;border:0;border-radius:12px;color:#fff;font-size:24px;font-weight:700;line-height:1;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
  .prt-sketch-draft-action:disabled{opacity:.35;cursor:default}
  .prt-sketch-draft-undo,.prt-sketch-draft-redo{background:#334155}
  .prt-sketch-draft-cancel{background:var(--prt-danger)}
  .prt-sketch-draft-confirm{background:var(--prt-success)}
  .prt-cad-tools{display:grid;grid-template-columns:repeat(auto-fit,minmax(128px,1fr));align-content:start;align-items:stretch;gap:7px;padding:10px;border-top:1px solid var(--prt-gray-200);max-height:210px;overflow:auto}
  .prt-cad-tools>.prt-btn{min-height:36px;border-radius:9px}
  .prt-cad-tools>[data-cad-mode]{min-width:0}
  .prt-cad-tools>.prt-btn.active,.prt-cad-tools>.prt-btn.prt-btn-primary{box-shadow:0 0 0 2px var(--prt-primary-light)}
  .prt-cad-snap-controls{grid-column:1/-1;display:flex;align-items:center;gap:4px;position:relative}
  .prt-cad-snap-options{grid-column:1/-1}
  .prt-cad-snap-options[hidden]{display:none}
  .prt-cad-snap-options .prt-input{grid-column:1/-1}
  .prt-cad-snap-options>[data-cad-snap-mode]{min-height:34px}
  .prt-grip-control{display:grid;gap:6px;padding:10px 0 4px;border-top:1px solid var(--prt-gray-200)}
  .prt-grip-control-heading{display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--prt-gray-700)}
  .prt-grip-control input{width:100%;accent-color:var(--prt-primary)}
  .prt-cad-lock{grid-column:1/-1}
  .prt-dimension-editor{position:absolute;z-index:12;top:10px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:6px;max-width:calc(100% - 20px);padding:7px;background:#fff;border:1px solid var(--prt-gray-300);border-radius:12px;box-shadow:var(--prt-shadow-lg)}
  .prt-dimension-editor[hidden]{display:none}
  .prt-dimension-editor input{width:min(220px,38vw);min-width:100px;padding:8px;border:1px solid var(--prt-gray-300);border-radius:8px}
  .prt-dimension-editor button{width:38px;height:38px;border:0;border-radius:9px;color:#fff;font-size:20px;font-weight:700;cursor:pointer}
  .prt-dimension-editor .prt-dimension-editor-apply{background:var(--prt-primary);font-size:16px}
  .prt-cad-tools.collapsed{display:none}
  .prt-cad-tools .prt-btn.active{background:var(--prt-primary-light);color:var(--prt-primary);border-color:var(--prt-primary)}
  .prt-dimension-node{fill:#fff;stroke:#7c3aed;stroke-width:1.5;cursor:crosshair;pointer-events:all}
  .prt-dimension-node-hit{fill:transparent;stroke:transparent;pointer-events:all;touch-action:none}
  .prt-dimension-node:hover{fill:#ddd6fe}
  .prt-dimension-label{cursor:text;pointer-events:all}
  .prt-dimension-editor button:disabled{opacity:.35;cursor:not-allowed}
  .prt-page-canvas.cad-touch-active{touch-action:none}
  .prt-designer-overlay.prt-pinch-active .prt-canvas-element{pointer-events:none!important}
  .prt-touch-magnifier{position:fixed;z-index:200040;width:132px;height:132px;border:3px solid #2563eb;border-radius:50%;overflow:hidden;background:#fff;box-shadow:0 4px 16px rgba(0,0,0,.35);pointer-events:none;display:none}
  .prt-touch-magnifier.visible{display:block}
  .prt-touch-magnifier svg{width:100%;height:100%}
  .prt-touch-magnifier:after{content:"";position:absolute;left:50%;top:50%;width:14px;height:14px;border:1px solid rgba(220,38,38,.9);border-radius:50%;transform:translate(-50%,-50%);box-shadow:0 0 0 1px #fff}
  .prt-cad-vertex-editor{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;flex:1 0 100%;min-width:0;padding:8px 0;border-top:1px solid var(--prt-gray-200)}
  .prt-cad-vertex-editor strong,.prt-cad-vertex-editor .prt-cad-wide{grid-column:1/-1}
  .prt-cad-vertex-editor .prt-input{box-sizing:border-box;min-width:0;width:100%;min-height:38px;padding:6px 8px;font-size:13px}
  .prt-cad-nudge{display:grid;grid-template-columns:repeat(3,40px);grid-template-rows:repeat(3,38px);justify-content:center;gap:4px}
  .prt-cad-nudge button{padding:0!important;min-height:38px!important}
  @media(max-width:768px){
    .prt-cad-dock{bottom:4px;width:calc(100% - 12px);max-height:42dvh;display:flex;flex-direction:column}
    .prt-cad-tools{grid-template-columns:repeat(2,minmax(0,1fr));align-content:start;gap:6px;padding:8px;max-height:36dvh;overflow-y:auto;overscroll-behavior:contain}
    .prt-cad-tools .prt-btn{min-height:46px;padding:8px 10px;white-space:normal;line-height:1.2;touch-action:manipulation}
    .prt-designer-overlay .prt-cad-tools .prt-btn{min-height:46px}
    .prt-cad-vertex-editor .prt-input{min-height:44px;font-size:16px}
    .prt-sketch-draft-action{width:54px;height:54px}
    .prt-designer-overlay .prt-tool-btn{min-height:46px}
    .prt-designer-overlay .prt-resize-handle{width:24px;height:24px}
    .prt-designer-overlay .prt-resize-handle.nw{top:-9px;left:-9px}
    .prt-designer-overlay .prt-resize-handle.ne{top:-9px;right:-9px}
    .prt-designer-overlay .prt-resize-handle.sw{bottom:-9px;left:-9px}
    .prt-designer-overlay .prt-resize-handle.se{bottom:-9px;right:-9px}
    .prt-designer-overlay .prt-rotation-handle{width:22px;height:22px;left:calc(50% - 11px);top:-34px}
  }
  @media(max-width:480px){
    .prt-cad-dock{max-height:46dvh}
    .prt-cad-tools{max-height:40dvh}
  }
  @media(max-width:768px){.prt-toolbar-main{box-sizing:border-box;width:calc(100% - 5px);min-width:0;padding:5px;gap:4px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));grid-template-areas:"back tools spacer pdf" "page page zoom zoom"}.prt-toolbar-title{display:none}.prt-back-btn{grid-area:back;justify-self:start}.prt-toolbar-toggle{grid-area:tools;justify-self:start}.prt-pdf-btn{grid-area:pdf;justify-self:end}.prt-page-box{grid-area:page;width:100%;min-width:0;justify-content:flex-start}.prt-page-box>.prt-zoom-label{display:none}.prt-page-box .prt-select{width:auto!important;flex:1;min-width:50px}.prt-page-box .prt-btn{padding:6px 7px}.prt-zoom-box{grid-area:zoom;justify-content:flex-end;gap:3px;padding:3px 4px;min-width:0}.prt-page-box{grid-area:page}.prt-designer-canvas-area{padding:4px}.prt-toolbar-tools:not(.collapsed){position:absolute;top:0;bottom:0;left:0;width:min(220px,82vw);flex-basis:min(220px,82vw);box-shadow:var(--prt-shadow-lg)}.prt-props-panel.expanded{width:min(320px,88vw)}.prt-selection-bar{padding:8px;gap:6px}.prt-selection-bar-info{font-size:12px}.prt-selection-confirm,.prt-selection-cancel,.prt-selection-toolbtn{width:40px;height:40px}}
  @media(max-width:480px){.prt-designer-toolbar{flex-shrink:0}.prt-toolbar-main{box-sizing:border-box;width:100%;min-width:0;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));grid-template-areas:"back tools spacer pdf" "page page zoom zoom";justify-content:stretch;overflow:visible}.prt-back-btn{grid-area:back}.prt-toolbar-toggle{grid-area:tools}.prt-pdf-btn{grid-area:pdf}.prt-page-box{grid-area:page;width:100%;min-width:0;justify-content:flex-start}.prt-page-box .prt-zoom-label{min-width:auto}.prt-page-box .prt-select{width:auto!important;flex:1;min-width:50px}.prt-page-box .prt-btn{padding:6px 7px}.prt-zoom-box{gap:3px;padding:3px 4px;flex-shrink:0;grid-area:zoom;justify-content:flex-end}.prt-page-box{grid-area:page}.prt-zoom-label{min-width:42px;font-size:11px}.prt-toolbar-tools:not(.collapsed){width:min(220px,82vw);flex-basis:min(220px,82vw)}.prt-tool-btn{min-height:40px;font-size:11px}.prt-tool-btn svg{width:16px;height:16px}.prt-cad-dock{bottom:6px;width:calc(100% - 12px)}.prt-cad-tools{max-height:30dvh;gap:4px;padding:6px}.prt-cad-tools .prt-btn{min-height:38px}.prt-grip-control{padding-top:8px}.prt-layer-manager{max-width:calc(100vw - 16px)}}
  @media(max-width:480px){.prt-toolbar-main{width:calc(100% - 5px)}}
  .prt-props-header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;background:var(--prt-gray-100);border-bottom:1px solid var(--prt-gray-200);flex-shrink:0;cursor:move}
  .prt-props-min-btn{border:1px solid var(--prt-gray-200);background:#fff;border-radius:8px;padding:4px 8px;cursor:pointer;font-size:11px}
  .prt-props-panel.minimized .prt-props-body{display:none}
  .prt-props-body{overflow-y:auto;overflow-x:hidden;padding:0;flex:1;min-width:0;min-height:0;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;touch-action:pan-y}
  .prt-props-body>*{max-width:100%;box-sizing:border-box}
  .prt-props-section{border-bottom:1px solid var(--prt-gray-100)}
  .prt-props-section-header{padding:8px 12px;background:var(--prt-gray-50);font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--prt-gray-600);cursor:pointer;display:flex;justify-content:space-between;align-items:center}
  .prt-props-section-content{padding:10px 12px;display:block;min-width:0}
  .prt-props-section.collapsed .prt-props-section-content{display:none}
  .prt-props-row{display:flex;align-items:center;gap:8px;margin-bottom:6px}
  .prt-props-row label{width:72px;font-size:12px;color:var(--prt-gray-600);flex-shrink:0}
  .prt-props-row input,.prt-props-row select{flex:1;padding:6px 8px;border:1px solid var(--prt-gray-300);border-radius:6px;font-size:12px;min-width:0}
  .prt-props-panel .prt-btn-block{box-sizing:border-box;max-width:100%;white-space:normal}
  .prt-props-row input[type="range"]{padding:0}
  .prt-props-row input[type="color"]{padding:2px;height:28px}
  .prt-props-slider-row{display:flex;align-items:center;gap:6px}
  .prt-props-slider-row input[type=range]{flex:1}
  .prt-props-slider-row span{min-width:34px;text-align:right;font-size:11px;color:var(--prt-gray-500)}
  .prt-swatch-row{display:flex;gap:4px;flex-wrap:wrap;margin-top:4px}
  .prt-swatch{width:20px;height:20px;border-radius:4px;border:1px solid var(--prt-gray-300);cursor:pointer}
  .prt-swatch:hover{transform:scale(1.1)}
  .prt-layer-manager{position:absolute;top:12px;left:12px;background:#fff;border-radius:12px;box-shadow:var(--prt-shadow-lg);width:280px;max-height:55vh;overflow:hidden;z-index:7;display:flex;flex-direction:column}
  @media(max-width:768px){.prt-layer-manager{left:12px;right:12px;width:auto;max-height:45vh}}
  .prt-lm-header{background:var(--prt-gray-100);padding:8px 12px;border-bottom:1px solid var(--prt-gray-200);display:flex;align-items:center;justify-content:space-between;font-weight:800;font-size:12px}
  .prt-lm-body{flex:1;overflow:auto}
  .prt-lm-item{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 12px;border-bottom:1px solid var(--prt-gray-100);cursor:pointer;font-size:12px}
  .prt-lm-item.selected{background:var(--prt-primary-light)}
  .prt-lm-controls{display:flex;gap:4px;flex-shrink:0}
  .prt-lm-btn{background:none;border:none;cursor:pointer;padding:2px 6px;font-size:12px;color:var(--prt-gray-600)}
  .prt-lm-btn:hover{color:var(--prt-primary)}
  .prt-modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:200010;display:flex;align-items:center;justify-content:center;padding:16px}
  .prt-modal{background:#fff;border-radius:14px;width:100%;max-width:560px;max-height:90vh;overflow:auto;box-shadow:var(--prt-shadow-lg)}
  .prt-modal-header{padding:14px 18px;border-bottom:1px solid var(--prt-gray-200);display:flex;align-items:center;justify-content:space-between}
  .prt-modal-body{padding:18px}
  .prt-modal-footer{padding:12px 18px;border-top:1px solid var(--prt-gray-200);display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap}
  .prt-checkbox-group{max-height:260px;overflow:auto;border:1px solid var(--prt-gray-200);border-radius:10px;padding:10px}
  .prt-checkbox-item{display:flex;align-items:center;gap:8px;padding:4px 0;font-size:13px}
  .prt-attr-row{display:grid;grid-template-columns:28px 1fr 1fr;gap:6px;align-items:center;padding:4px 0;font-size:13px;border-bottom:1px dashed var(--prt-gray-200)}
  .prt-attr-row input[type=text]{padding:4px 6px;border:1px solid var(--prt-gray-300);border-radius:6px;font-size:12px;width:100%}
  .prt-layout-card{border:2px solid var(--prt-gray-300);border-radius:10px;padding:16px;cursor:pointer;flex:1;text-align:center;transition:var(--prt-transition)}
  .prt-layout-card:hover{border-color:var(--prt-primary);background:var(--prt-primary-light)}
  .prt-layout-card.selected{border-color:var(--prt-primary);background:var(--prt-primary-light)}
  .prt-layout-card svg{width:60px;height:60px;margin-bottom:8px}
  @media(max-width:768px){
    .prt-tool-btn{width:100%;height:auto;font-size:10px}
    .prt-toolbar-main{gap:6px}
    .prt-zoom-box{width:100%;justify-content:space-between}
  }
  `;

  // ==========================================================================
  // ICONS
  // ==========================================================================
  const ICONS = {
    plot: `<svg viewBox="0 0 24 24"><path d="M3 3h18v18H3V3zm2 2v14h14V5H5zm2 2h4v4H7V7zm6 0h4v2h-4V7zm0 4h4v2h-4v-2zm-6 4h10v2H7v-2z"/></svg>`,
    close: '✕', check: '✓', cancel: '✕',
    text: `<svg viewBox="0 0 24 24"><path d="M5 4v3h5.5v12h3V7H19V4z"/></svg>`,
    line: `<svg viewBox="0 0 24 24"><line x1="4" y1="20" x2="20" y2="4" stroke="currentColor" stroke-width="2"/></svg>`,
    rect: `<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"/></svg>`,
    sketch: `<svg viewBox="0 0 24 24"><path d="M21 16V4H3v18h18zM5 6h14v8H5V6zm0 10h14v4H5v-4z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`,
    qr: `<svg viewBox="0 0 24 24"><path d="M3 3h8v8H3V3zm2 2v4h4V5H5zm8-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm8-2h2v2h-2v-2zm4 0h2v2h-2v-2zm-4 4h2v2h-2v-2zm4 0h2v2h-2v-2zm-4 4h6v2h-6v-2z"/></svg>`,
    undo: `<svg viewBox="0 0 24 24"><path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>`,
    redo: `<svg viewBox="0 0 24 24"><path d="M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z"/></svg>`,
    save: `<svg viewBox="0 0 24 24"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg>`,
    pdf: `<svg viewBox="0 0 24 24"><path d="M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8.5 7.5c0 .83-.67 1.5-1.5 1.5H9v2H7.5V7H10c.83 0 1.5.67 1.5 1.5v1zm5 2c0 .83-.67 1.5-1.5 1.5h-2.5V7H15c.83 0 1.5.67 1.5 1.5v3zm4-3H19v1h1.5V11H19v2h-1.5V7h3v1.5z"/></svg>`,
    delete: `<svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`,
    template: `<svg viewBox="0 0 24 24"><path d="M4 4h7V2H4c-1.1 0-2 .9-2 2v7h2V4zm6 9l-4 5h12l-3-4-2.03 2.71L10 13zm7-4.5c0-.83-.67-1.5-1.5-1.5S14 7.67 14 8.5s.67 1.5 1.5 1.5S17 9.33 17 8.5zM20 2h-7v2h7v7h2V4c0-1.1-.9-2-2-2zm0 18h-7v2h7c1.1 0 2-.9 2-2v-7h-2v7zM4 13H2v7c0 1.1.9 2 2 2h7v-2H4v-7z"/></svg>`,
    chevron: `<svg viewBox="0 0 24 24" width="12" height="12"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/></svg>`,
    select: `<svg viewBox="0 0 24 24"><path d="M3 5h2V3c-1.1 0-2 .9-2 2zm0 8h2v-2H3v2zm4 8h2v-2H7v2zM3 9h2V7H3v2zm10-6h-2v2h2V3zm6 0v2h2c0-1.1-.9-2-2-2zM5 21v-2H3c0 1.1.9 2 2 2zm-2-4h2v-2H3v2zM9 3H7v2h2V3zm2 18h2v-2h-2v2zm8-8h2v-2h-2v2zm0 8c1.1 0 2-.9 2-2h-2v2zm0-12h2V7h-2v2zm0 8h2v-2h-2v2zm-4 4h2v-2h-2v2zm0-16h2V3h-2v2z"/></svg>`,
    page: `<svg viewBox="0 0 24 24"><path d="M8 16h8v2H8zm0-4h8v2H8zm6-10H6c-1.1 0-2 .9-2 2v16c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/></svg>`,
    details: `<svg viewBox="0 0 24 24"><path d="M4 4h16v2H4V4zm0 4h16v2H4V8zm0 4h10v2H4v-2zm0 4h16v2H4v-2z"/></svg>`,
    settings: `<svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94 0 .31.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>`,
    image: `<svg viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>`,
    scalebar: `<svg viewBox="0 0 24 24"><path d="M2 10h4v4H2zm5 0h4v4H7zm5 0h10v4H12zM2 7h20v2H2z"/></svg>`,
    north: `<svg viewBox="0 0 24 24"><path d="M12 2L5 20l7-5 7 5z"/></svg>`,
  };

  // ==========================================================================
  // UNIT SYSTEM (Metric + Imperial — matches Measure Tool)
  // ==========================================================================
  const UNITS = {
    length: {
      m:  { label: 'm',  factor: 1 },
      km: { label: 'km', factor: 0.001 },
      ft: { label: 'ft', factor: 3.280839895 },
      yd: { label: 'yd', factor: 1.093613298 },
      mi: { label: 'mi', factor: 1/1609.344 }
    },
    area: {
      m2:   { label: 'm²',    factor: 1 },
      km2:  { label: 'km²',   factor: 1/1000000 },
      ha:   { label: 'ha',    factor: 1/10000 },
      acre: { label: 'acres', factor: 1/4046.8564224 },
      ft2:  { label: 'ft²',   factor: 10.763910417 },
      yd2:  { label: 'yd²',   factor: 1.195990046 }
    },
    convertLength(valueM, unit) {
      const u = this.length[unit] || this.length.m;
      return valueM * u.factor;
    },
    convertArea(valueM2, unit) {
      const u = this.area[unit] || this.area.m2;
      return valueM2 * u.factor;
    },
    formatLength(valueM, unit = 'auto') {
      if (unit === 'auto') {
        if (valueM >= 1000) return (valueM/1000).toFixed(3) + ' km';
        if (valueM < 1) return (valueM*100).toFixed(0) + ' cm';
        return valueM.toFixed(2) + ' m';
      }
      const u = this.length[unit] || this.length.m;
      const converted = valueM * u.factor;
      return converted.toFixed(converted < 10 ? 2 : 1) + ' ' + u.label;
    },
    formatArea(valueM2, unit = 'auto') {
      if (unit === 'auto') {
        if (valueM2 >= 10000) return (valueM2/10000).toFixed(4) + ' ha';
        return valueM2.toFixed(2) + ' m²';
      }
      const u = this.area[unit] || this.area.m2;
      const converted = valueM2 * u.factor;
      return converted.toFixed(converted < 10 ? 3 : 2) + ' ' + u.label;
    }
  };

  // ==========================================================================
  // PROJECTION HELPER (CRITICAL FIX — accurate measurements)
  // ==========================================================================
  const Projection = {
    getMapProjection() {
      try {
        const map = window.map || window.plotReportTool?.mapSelector?.map;
        if (map?.getView) return map.getView().getProjection().getCode();
      } catch(_){}
      return 'EPSG:3857';
    },
    toDataProj(coord, fromProj) {
      try {
        return ol.proj.transform(coord, fromProj || this.getMapProjection(), CURRENT_PROJECTION);
      } catch (_) { return coord; }
    },
    toLonLat(coord, fromProj) {
      try {
        return ol.proj.transform(coord, fromProj || this.getMapProjection(), 'EPSG:4326');
      } catch (_) { return coord; }
    },
    distance(c1, c2) {
      const dx = c2[0] - c1[0], dy = c2[1] - c1[1];
      const length = Math.sqrt(dx*dx + dy*dy);
      if (!length) return 0;
      try {
        return ol.proj.getPointResolution(CURRENT_PROJECTION, length, [(c1[0]+c2[0])/2,(c1[1]+c2[1])/2], 'm');
      } catch (e) {
        console.error('[PRT] Could not calculate sketch edge length:', e);
        return length;
      }
    },
    coordinateDistance(meters, coordinate) {
      try {
        const metersPerUnit=ol.proj.getPointResolution(CURRENT_PROJECTION,1,coordinate,'m');
        if(Number.isFinite(metersPerUnit)&&metersPerUnit>0)return meters/metersPerUnit;
      } catch(e) {
        console.error('[PRT] Could not convert sketch length to projection units:',e);
      }
      return meters;
    },
    polygonAreaM2(ring) {
      // ring is already in projected meters
      if (ring.length < 3) return 0;
      let area = 0;
      for (let i = 0; i < ring.length; i++) {
        const j = (i+1) % ring.length;
        area += ring[i][0] * ring[j][1];
        area -= ring[j][0] * ring[i][1];
      }
      return Math.abs(area / 2);
    }
  };

  // ==========================================================================
  // UTILS
  // ==========================================================================
  const Utils = {
    uid: () => 'prt_' + Math.random().toString(36).slice(2, 10),
    createElement(tag, attrs = {}, children = []) {
      const el = document.createElement(tag);
      for (const [k, v] of Object.entries(attrs)) {
        if (k === 'className') el.className = v;
        else if (k === 'innerHTML') el.innerHTML = v;
        else if (k === 'textContent') el.textContent = v;
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else el.setAttribute(k, v);
      }
      children.forEach(c => { if (typeof c === 'string') el.appendChild(document.createTextNode(c)); else if (c) el.appendChild(c); });
      return el;
    },
    showToast(msg, duration = 3000) {
      let toast = document.querySelector('.prt-toast');
      if (!toast) { toast = Utils.createElement('div', { className: 'prt-toast' }); document.body.appendChild(toast); }
      toast.textContent = msg;
      toast.classList.add('visible');
      clearTimeout(toast._timeout);
      toast._timeout = setTimeout(() => toast.classList.remove('visible'), duration);
    },
    escapeXml(s) {
      return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    },
    clone(obj) { return JSON.parse(JSON.stringify(obj)); },
    mm2px(mm) { return mm * 96 / 25.4; },
    px2mm(px) { return px * 25.4 / 96; },
    debounce(fn, ms) {
      let t; return function(...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
    },
    safeLocalStorageAvailable() {
      try { const k='__prt__'; localStorage.setItem(k,'1'); localStorage.removeItem(k); return true; } catch(_){ return false; }
    },
    downloadJson(filename, obj) {
      const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 200);
    },
    generateQRDataUrlUtf8(text, targetSizePx = 180) {
      if (typeof qrcode === 'undefined') return null;
      if (qrcode.stringToBytesFuncs && qrcode.stringToBytesFuncs['UTF-8']) {
        qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
      }
      const qr = qrcode(0, 'M');
      qr.addData(text); qr.make();
      const modules = qr.getModuleCount();
      const marginModules = 4;
      const totalModules = modules + marginModules * 2;
      const cell = Math.max(2, Math.floor(targetSizePx / totalModules));
      const size = totalModules * cell;
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#000';
      for (let r = 0; r < modules; r++) {
        for (let c = 0; c < modules; c++) {
          if (qr.isDark(r, c)) ctx.fillRect((c+marginModules)*cell, (r+marginModules)*cell, cell, cell);
        }
      }
      return canvas.toDataURL('image/png');
    }
  };

  // ==========================================================================
  // PAGE SIZES
  // ==========================================================================
  const PAGE_SIZES = {
    'A4 Portrait':   { w: 210, h: 297 },
    'A4 Landscape':  { w: 297, h: 210 },
    'A3 Portrait':   { w: 297, h: 420 },
    'A3 Landscape':  { w: 420, h: 297 },
    'A2 Portrait':   { w: 420, h: 594 },
    'A2 Landscape':  { w: 594, h: 420 },
    'Letter Portrait': { w: 215.9, h: 279.4 },
    'Legal Portrait':  { w: 215.9, h: 355.6 },
    'Custom': { w: 210, h: 297 }
  };

  // ==========================================================================
  // UNDO/REDO
  // ==========================================================================
  class UndoRedoManager {
    constructor(maxHistory = CONFIG.historyLimit) {
      this.history = [];
      this.pointer = -1;
      this.maxHistory = maxHistory;
      this.onChangeCallbacks = [];
    }
    push(state) {
      this.history = this.history.slice(0, this.pointer + 1);
      this.history.push(Utils.clone(state));
      if (this.history.length > this.maxHistory) this.history.shift();
      this.pointer = this.history.length - 1;
      this._notify();
    }
    undo() { if (this.pointer > 0) { this.pointer--; this._notify(); return Utils.clone(this.history[this.pointer]); } return null; }
    redo() { if (this.pointer < this.history.length - 1) { this.pointer++; this._notify(); return Utils.clone(this.history[this.pointer]); } return null; }
    canUndo() { return this.pointer > 0; }
    canRedo() { return this.pointer < this.history.length - 1; }
    onChange(cb) { this.onChangeCallbacks.push(cb); }
    _notify() { this.onChangeCallbacks.forEach(cb => cb()); }
    clear() { this.history = []; this.pointer = -1; this._notify(); }
  }

  // ==========================================================================
  // SKETCH RENDERER (FULL CONTROL + CORRECT UTM MEASUREMENTS)
  // ==========================================================================
  class SketchRenderer {
    constructor() {
      this.padding = 60;
      this.dimOffsetBase = 18;
      this.dimOffsetStep = 16;
    }

    render(polygonsData, width = 520, height = 420, opts = {}) {
      const options = {
        // Visibility
        showDimensions: opts.showDimensions ?? true,
        showVertices:   opts.showVertices   ?? true,
        showNorth:      opts.showNorth      ?? true,
        showScale:      opts.showScale      ?? true,
        showLabels:     opts.showLabels     ?? true,
        showAreaInLabel: opts.showAreaInLabel ?? true,
        // Boundary
        strokeColor:   opts.strokeColor   ?? null, // null = auto color-cycle
        strokeWidth:   opts.strokeWidth   ?? 1.5,
        strokeDash:    opts.strokeDash    ?? 'solid', // solid|dashed|dotted|dashdot
        // Fill
        fillColor:     opts.fillColor     ?? null,
        fillOpacity:   opts.fillOpacity   ?? 0.08,
        // Dimensions
        dimStyle:      opts.dimStyle      ?? 'arrows', // arrows|text|ticks|none
        lengthUnit:    opts.lengthUnit    ?? 'auto',
        areaUnit:      opts.areaUnit      ?? 'auto',
        dimFontSize:   opts.dimFontSize   ?? 10,
        dimColor:      opts.dimColor      ?? '#1e293b',
        dimBackground: opts.dimBackground ?? '#ffffff',
        labelColor:    opts.labelColor    ?? null,
        labelWeight:   opts.labelWeight   ?? 'normal',
        // Labels
        labelFields:   opts.labelFields   ?? null, // array of field names
        labelFontSize: opts.labelFontSize ?? 12,
        // Vertex
        vertexSize:    opts.vertexSize    ?? 2.4,
        vertexShape:   opts.vertexShape   ?? 'circle', // circle|square|cross|triangle
        vertexColor:   opts.vertexColor   ?? null,
        showDimensionNodes: opts.showDimensionNodes ?? false
      };

      if (!polygonsData?.length) return this._emptySVG(width, height);

      // All measurements use projected coords (coordsProj field)
      let all = [];
      polygonsData.forEach(p => (p.coordsProj || p.coords || []).forEach(r => r.forEach(c => all.push(c))));
      if (!all.length) return this._emptySVG(width, height);

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      all.forEach(([x, y]) => { minX = Math.min(minX,x); minY = Math.min(minY,y); maxX = Math.max(maxX,x); maxY = Math.max(maxY,y); });

      const dataW = maxX - minX || 1;
      const dataH = maxY - minY || 1;
      const pad = this.padding;
      const availW = width - 2*pad;
      const availH = height - 2*pad;
      const scale = Math.min(availW/dataW, availH/dataH);
      const offX = pad + (availW - dataW*scale)/2;
      const offY = pad + (availH - dataH*scale)/2;

      const tx = x => offX + (x - minX) * scale;
      const ty = y => offY + (maxY - y) * scale;

      const colors = ['#2563eb','#dc2626','#16a34a','#9333ea','#ea580c','#0891b2'];
      const placed = [];
      let svg = '';

      const dashArray = {
        solid: '', dashed: '8,4', dotted: '2,3', dashdot: '8,3,2,3'
      }[options.strokeDash] || '';

      polygonsData.forEach((poly, idx) => {
        const autoColor = colors[idx % colors.length];
        const stroke = options.strokeColor || autoColor;
        const fill = options.fillColor || autoColor;
        const vxColor = options.vertexColor || stroke;

        const ringsProj = poly.coordsProj || poly.coords || [];
        ringsProj.forEach((ring) => {
          const isLine = poly.geometryType === 'LineString';
          const isPoint = poly.geometryType === 'Point';
          if (!ring || ring.length < (isPoint ? 1 : isLine ? 2 : 3)) return;
          if (isPoint) {
            const [px, py] = [tx(ring[0][0]), ty(ring[0][1])];
            svg += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${Math.max(3, options.vertexSize*1.5)}" fill="${stroke}" stroke="#fff" stroke-width="1"/>`;
            return;
          }
          let r = ring.slice();
          const closed = !isLine && r.length > 3 && r[0][0] === r[r.length-1][0] && r[0][1] === r[r.length-1][1];
          if (closed) r.pop();

          const pts = r.map(c => [tx(c[0]), ty(c[1])]);
          if (pts.length < (isLine ? 2 : 3)) return;

          const pathD = pts.map((p,i) => (i?'L':'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ') + (isLine ? '' : ' Z');
          const fillAttr = isLine ? 'fill="none"' : `fill="${fill}" fill-opacity="${options.fillOpacity}"`;
          const dashAttr = dashArray ? ` stroke-dasharray="${dashArray}"` : '';
          svg += `<path d="${pathD}" ${fillAttr} stroke="${stroke}" stroke-width="${options.strokeWidth}"${dashAttr} stroke-linejoin="round"/>`;

          const centroid = isLine ? [pts.reduce((a,p)=>a+p[0],0)/pts.length, pts.reduce((a,p)=>a+p[1],0)/pts.length] : this._centroidPx(pts);

          if (ringsProj.indexOf(ring) === 0 && Array.isArray(poly.triangulationDiagonals)) {
            poly.triangulationDiagonals.forEach(([a,b], diagonalIndex) => {
              const p1=[tx(a[0]),ty(a[1])],p2=[tx(b[0]),ty(b[1])];
              svg += `<line x1="${p1[0].toFixed(1)}" y1="${p1[1].toFixed(1)}" x2="${p2[0].toFixed(1)}" y2="${p2[1].toFixed(1)}" stroke="#7c3aed" stroke-width="1.2" stroke-dasharray="5,3"/>`;
              if (options.showDimensions && options.dimStyle !== 'none') {
                const key = `diag:${diagonalIndex}`;
                const nodes=poly.dimensionNodes?.[key]||[a,b];
                const length = Projection.distance(nodes[0],nodes[1]);
                const label = poly.hiddenDimensions?.includes(key) ? null : poly.dimensionLabels?.[key] ?? UNITS.formatLength(length, options.lengthUnit);
                if(label!==null)svg += this._renderDimension([tx(nodes[0][0]),ty(nodes[0][1])],[tx(nodes[1][0]),ty(nodes[1][1])],label,centroid,placed,options,key,poly.dimensionOffsets?.[key],idx);
                if(options.showDimensionNodes&&label!==null)svg+=this._renderDimensionNodes([tx(nodes[0][0]),ty(nodes[0][1])],[tx(nodes[1][0]),ty(nodes[1][1])],key,idx,options.handleHitRadius,options.handleVisibleRadius);
              }
            });
          }
          if (!isLine && options.showDimensions && options.dimStyle !== 'none') {
            for (let i = 0; i < pts.length; i++) {
              const p1 = pts[i], p2 = pts[(i+1)%pts.length];
              const gp1 = r[i], gp2 = r[(i+1)%r.length];
              const labelKey = `${idx}:${ringsProj.indexOf(ring)}:${i}`;
              const nodes=poly.dimensionNodes?.[labelKey]||[gp1,gp2];
              const distM = Projection.distance(nodes[0], nodes[1]);
              if (distM < 0.01) continue;
              if (poly.hiddenDimensions?.includes(labelKey)) continue;
              const label = poly.dimensionLabels?.[labelKey] ?? UNITS.formatLength(distM, options.lengthUnit);
              svg += this._renderDimension([tx(nodes[0][0]),ty(nodes[0][1])], [tx(nodes[1][0]),ty(nodes[1][1])], label, centroid, placed, options, labelKey, poly.dimensionOffsets?.[labelKey],idx);
              if(options.showDimensionNodes)svg+=this._renderDimensionNodes([tx(nodes[0][0]),ty(nodes[0][1])],[tx(nodes[1][0]),ty(nodes[1][1])],labelKey,idx,options.handleHitRadius,options.handleVisibleRadius);
            }
          }

          if (ringsProj.indexOf(ring) === 0 && options.showDimensions && options.dimStyle !== 'none') {
            (poly.extraDimensions||[]).forEach(dimension => {
              const p1=[tx(dimension.a[0]),ty(dimension.a[1])],p2=[tx(dimension.b[0]),ty(dimension.b[1])];
              const key=`manual:${dimension.id}`;
              if(poly.hiddenDimensions?.includes(key))return;
              const nodes=poly.dimensionNodes?.[key]||[dimension.a,dimension.b];
              const length=Projection.distance(nodes[0],nodes[1]);
              const label=poly.dimensionLabels?.[key]??dimension.label??UNITS.formatLength(length,options.lengthUnit);
              svg+=this._renderDimension([tx(nodes[0][0]),ty(nodes[0][1])],[tx(nodes[1][0]),ty(nodes[1][1])],label,centroid,placed,options,key,poly.dimensionOffsets?.[key],idx);
              if(options.showDimensionNodes)svg+=this._renderDimensionNodes([tx(nodes[0][0]),ty(nodes[0][1])],[tx(nodes[1][0]),ty(nodes[1][1])],key,idx,options.handleHitRadius,options.handleVisibleRadius);
            });
          }

          if (options.showVertices) {
            pts.forEach(p => { svg += this._vertexShape(p[0], p[1], options.vertexSize, options.vertexShape, vxColor); });
          }
        });

        if (poly.geometryType !== 'LineString' && poly.geometryType !== 'Point' && options.showLabels && ringsProj[0]?.length > 2) {
          const gcent = this._centroidGeo(ringsProj[0]);
          const cx = tx(gcent[0]), cy = ty(gcent[1]);
          const areaM2 = Projection.polygonAreaM2(ringsProj[0]);

          let labelLines = [];
          const plotLabel=poly.label==null?'':String(poly.label).trim();
          if(plotLabel)labelLines.push(plotLabel);
          if (options.labelFields && options.labelFields.length) {
            options.labelFields.forEach(f => {
              if (f === '__area__') {
                labelLines.push(UNITS.formatArea(areaM2, options.areaUnit));
              } else {
                const v = poly.properties?.[f];
                if (v != null && String(v)!==plotLabel) labelLines.push(String(v));
              }
            });
          } else {
            const name = poly.properties?.name || poly.properties?.id || poly.properties?.OBJECTID || `Plot ${idx+1}`;
            if(String(name)!==plotLabel)labelLines.push(String(name));
            if (options.showAreaInLabel) labelLines.push(UNITS.formatArea(areaM2, options.areaUnit));
          }

          labelLines.forEach((line, li) => {
            const y = cy - 6 + li * (options.labelFontSize + 2);
            const weight = options.labelWeight === 'bold' ? 700 : 400;
            const sz = li === 0 ? options.labelFontSize : options.labelFontSize - 2;
            const col = options.labelColor || (li === 0 ? stroke : '#475569');
            svg += `<text x="${cx.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" font-size="${sz}" font-weight="${weight}" fill="${col}">${Utils.escapeXml(line)}</text>`;
          });
        }
      });

      if (options.showNorth) {
        svg += `<g transform="translate(${width-28},${26})"><polygon points="0,-14 -5,5 0,1 5,5" fill="#334155" stroke="#fff" stroke-width="0.5"/><text x="0" y="-17" text-anchor="middle" font-size="9" font-weight="700" fill="#334155">N</text></g>`;
      }
      if (options.showScale) {
        svg += this._scaleBar(16, height-14, scale, options.lengthUnit);
      }

      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="white"/>${svg}</svg>`;
    }

    _vertexShape(x, y, size, shape, color) {
      const s = size;
      switch(shape) {
        case 'square': return `<rect x="${(x-s).toFixed(1)}" y="${(y-s).toFixed(1)}" width="${(2*s).toFixed(1)}" height="${(2*s).toFixed(1)}" fill="${color}" stroke="#fff" stroke-width="0.8"/>`;
        case 'cross':  return `<path d="M${(x-s).toFixed(1)},${y.toFixed(1)} L${(x+s).toFixed(1)},${y.toFixed(1)} M${x.toFixed(1)},${(y-s).toFixed(1)} L${x.toFixed(1)},${(y+s).toFixed(1)}" stroke="${color}" stroke-width="1.5"/>`;
        case 'triangle': return `<polygon points="${x.toFixed(1)},${(y-s).toFixed(1)} ${(x-s).toFixed(1)},${(y+s*0.7).toFixed(1)} ${(x+s).toFixed(1)},${(y+s*0.7).toFixed(1)}" fill="${color}" stroke="#fff" stroke-width="0.8"/>`;
        default: return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${s.toFixed(1)}" fill="${color}" stroke="#fff" stroke-width="0.8"/>`;
      }
    }

    _renderDimension(p1, p2, label, centroid, placed, options, labelKey, customOffset, polygonIndex) {
      const mx = (p1[0]+p2[0])/2, my = (p1[1]+p2[1])/2;
      const dx = p2[0]-p1[0], dy = p2[1]-p1[1];
      const len = Math.hypot(dx, dy);
      if (len < 12) return '';

      let nx = -dy/len, ny = dx/len;
      const testOut = Math.hypot(mx+nx*10-centroid[0], my+ny*10-centroid[1]);
      const testIn  = Math.hypot(mx-nx*10-centroid[0], my-ny*10-centroid[1]);
      if (testOut < testIn) { nx = -nx; ny = -ny; }

      const fontSize = options.dimFontSize;
      const labelW = label.length * 6 + 10;
      const labelH = fontSize + 6;

      let offset = this.dimOffsetBase;
      for (let tier = 0; tier < 8; tier++) {
        offset = this.dimOffsetBase + tier * this.dimOffsetStep;
        const cx = mx + nx*offset, cy = my + ny*offset;
        let collides = false;
        for (const b of placed) {
          if (Math.abs(cx-b.x) < (labelW+b.w)/2 && Math.abs(cy-b.y) < (labelH+b.h)/2) { collides = true; break; }
        }
        if (!collides) { placed.push({x:cx,y:cy,w:labelW,h:labelH}); break; }
      }

      const o1 = [p1[0]+nx*offset, p1[1]+ny*offset];
      const o2 = [p2[0]+nx*offset, p2[1]+ny*offset];
      const shift=Array.isArray(customOffset)?customOffset:[0,0];
      o1[0]+=shift[0];o1[1]+=shift[1];o2[0]+=shift[0];o2[1]+=shift[1];
      const om = [(o1[0]+o2[0])/2, (o1[1]+o2[1])/2];
      let angle = Math.atan2(dy, dx) * 180/Math.PI;
      if (angle > 90) angle -= 180;
      if (angle < -90) angle += 180;

      const lw = label.length * 5.5 + 6;
      const lh = fontSize + 4;

      const keyAttr = labelKey ? ` data-prt-dimension-key="${Utils.escapeXml(labelKey)}" data-prt-polygon="${polygonIndex}"` : '';
      let dimSvg = `<g${keyAttr}>`;
      dimSvg += `<line x1="${o1[0].toFixed(1)}" y1="${o1[1].toFixed(1)}" x2="${o2[0].toFixed(1)}" y2="${o2[1].toFixed(1)}" stroke="transparent" stroke-width="14" pointer-events="stroke"/>`;
      // Extension lines (always)
      dimSvg += `<line x1="${p1[0].toFixed(1)}" y1="${p1[1].toFixed(1)}" x2="${o1[0].toFixed(1)}" y2="${o1[1].toFixed(1)}" stroke="#94a3b8" stroke-width="0.6" stroke-dasharray="2,2"/>`;
      dimSvg += `<line x1="${p2[0].toFixed(1)}" y1="${p2[1].toFixed(1)}" x2="${o2[0].toFixed(1)}" y2="${o2[1].toFixed(1)}" stroke="#94a3b8" stroke-width="0.6" stroke-dasharray="2,2"/>`;

      if (options.dimStyle === 'arrows') {
        const as = 4, adx = dx/len, ady = dy/len;
        dimSvg += `<line x1="${o1[0].toFixed(1)}" y1="${o1[1].toFixed(1)}" x2="${o2[0].toFixed(1)}" y2="${o2[1].toFixed(1)}" stroke="#334155" stroke-width="0.6"/>`;
        dimSvg += `<polygon points="${o1[0].toFixed(1)},${o1[1].toFixed(1)} ${(o1[0]+adx*as-ny*as*0.4).toFixed(1)},${(o1[1]+ady*as+nx*as*0.4).toFixed(1)} ${(o1[0]+adx*as+ny*as*0.4).toFixed(1)},${(o1[1]+ady*as-nx*as*0.4).toFixed(1)}" fill="#334155"/>`;
        dimSvg += `<polygon points="${o2[0].toFixed(1)},${o2[1].toFixed(1)} ${(o2[0]-adx*as-ny*as*0.4).toFixed(1)},${(o2[1]-ady*as+nx*as*0.4).toFixed(1)} ${(o2[0]-adx*as+ny*as*0.4).toFixed(1)},${(o2[1]-ady*as-nx*as*0.4).toFixed(1)}" fill="#334155"/>`;
      } else if (options.dimStyle === 'ticks') {
        dimSvg += `<line x1="${o1[0].toFixed(1)}" y1="${o1[1].toFixed(1)}" x2="${o2[0].toFixed(1)}" y2="${o2[1].toFixed(1)}" stroke="#334155" stroke-width="0.6"/>`;
        const tx = 3;
        dimSvg += `<line x1="${(o1[0]-ny*tx).toFixed(1)}" y1="${(o1[1]+nx*tx).toFixed(1)}" x2="${(o1[0]+ny*tx).toFixed(1)}" y2="${(o1[1]-nx*tx).toFixed(1)}" stroke="#334155" stroke-width="1"/>`;
        dimSvg += `<line x1="${(o2[0]-ny*tx).toFixed(1)}" y1="${(o2[1]+nx*tx).toFixed(1)}" x2="${(o2[0]+ny*tx).toFixed(1)}" y2="${(o2[1]-nx*tx).toFixed(1)}" stroke="#334155" stroke-width="1"/>`;
      }
      // text-only: no line, no arrow, just label

      // Label
      dimSvg += `<g transform="rotate(${angle.toFixed(1)}, ${om[0].toFixed(1)}, ${om[1].toFixed(1)})">
        <rect x="${(om[0]-lw/2).toFixed(1)}" y="${(om[1]-lh/2).toFixed(1)}" width="${lw}" height="${lh}" fill="${options.dimBackground}" stroke="#cbd5e1" stroke-width="0.5" rx="2"/>
        <text class="prt-dimension-label" data-prt-dimension-text="true" x="${om[0].toFixed(1)}" y="${(om[1]+fontSize/3.5).toFixed(1)}" text-anchor="middle" font-size="${fontSize}" fill="${options.dimColor}">${Utils.escapeXml(label)}</text>
      </g></g>`;
      return dimSvg;
    }

    _renderDimensionNodes(p1,p2,key,polygonIndex,hitRadius=40,visibleRadius=7) {
      const attr=`data-prt-dimension-key="${Utils.escapeXml(key)}" data-prt-polygon="${polygonIndex}"`;
      const handle=(point,node)=>`<circle class="prt-dimension-node-hit" data-prt-dimension-node="${node}" ${attr} cx="${point[0].toFixed(1)}" cy="${point[1].toFixed(1)}" r="4" stroke-width="${hitRadius*2}"/><circle class="prt-dimension-node" data-prt-dimension-node="${node}" ${attr} cx="${point[0].toFixed(1)}" cy="${point[1].toFixed(1)}" r="${visibleRadius}" pointer-events="none"/>`;
      return handle(p1,'a')+handle(p2,'b');
    }

    _scaleBar(x, y, scale, unit) {
      const px100 = 100 * scale;
      let barLenM = 100;
      if (px100 > 300) barLenM = 50;
      if (px100 > 600) barLenM = 20;
      if (px100 < 50) barLenM = 500;
      if (px100 < 20) barLenM = 1000;
      const barPx = barLenM * scale;
      const label = UNITS.formatLength(barLenM, unit);
      return `<g transform="translate(${x},${y})"><line x1="0" y1="0" x2="${barPx.toFixed(1)}" y2="0" stroke="#334155" stroke-width="2"/><line x1="0" y1="-4" x2="0" y2="4" stroke="#334155" stroke-width="1"/><line x1="${barPx.toFixed(1)}" y1="-4" x2="${barPx.toFixed(1)}" y2="4" stroke="#334155" stroke-width="1"/><text x="${(barPx/2).toFixed(1)}" y="-6" text-anchor="middle" font-size="9" fill="#334155">${label}</text></g>`;
    }

    _centroidPx(pts) { let cx=0,cy=0; pts.forEach(p=>{cx+=p[0];cy+=p[1];}); return [cx/pts.length, cy/pts.length]; }
    _centroidGeo(ring) { let cx=0,cy=0; ring.forEach(([x,y])=>{cx+=x;cy+=y;}); return [cx/ring.length, cy/ring.length]; }
    _emptySVG(w, h) { return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#f9fafb"/><text x="${w/2}" y="${h/2}" text-anchor="middle" font-size="14" fill="#9ca3af">No polygons selected</text></svg>`; }
  }

  // ==========================================================================
  // PLUGIN REGISTRY (copy-paste extensibility)
  // ==========================================================================
  const PluginRegistry = {
    plugins: [],
    register(plugin) {
      if (!plugin || !plugin.name) { console.warn('[PRT] Plugin missing name'); return; }
      this.plugins.push(plugin);
      // If tool is already initialized, wire plugin immediately
      if (window.plotReportTool?.designer) {
        try { plugin.onInit?.(window.plotReportTool); } catch(e) { console.error('[PRT] Plugin init failed:', plugin.name, e); }
        window.plotReportTool.designer._refreshPluginTools?.();
      }
    },
    getAll() { return this.plugins.slice(); },
    getByElementType(type) { return this.plugins.find(p => p.elementType === type); }
  };

  // ==========================================================================
  // DESIGNER CANVAS
  // ==========================================================================
  class DesignerCanvas {
    constructor(tool) {
      this.tool = tool;
      this.pages = [];
      this.currentPageIndex = 0;
      this.selectedElement = null;
      this.activeTool = null;
      this.undoRedo = new UndoRedoManager();
      this._lastHistoryHash = null;
      this.pageSize = 'A4 Portrait';
      this.pageDims = { ...PAGE_SIZES['A4 Portrait'] };
      this.fitScale = 1; this.zoom = 1; this.scale = 1;
      this.toolsCollapsed = false;
      this._lineFirstClick = null;
      this._linePreviewElId = null;
      this.dragState = null;
      this.overlay = null; this.canvasArea = null; this.canvas = null;
      this.toolsPanel = null; this.toggleBtn = null; this.zoomLabel = null; this.pageSelect = null;
      this.propsPanel = null; this.propsMinimized = false;
      this.layerManagerEl = null; this.layerManagerVisible = false;
      this.sketchEditMode = null;
      this.vertexEditElementId = null;
      this.sketchDraft = null;
      this.selectedVertex = null;
      this._pinch = null;
      this._pinchActive = false;
      this._touchStartSelection = null;
      this._touchInteractionActive = false;
      this._cadTouchDrawing = null;
      this._cadTouchPreview = null;
      this._touchMagnifier = null;
      this.snapEnabled = true;
      this.snapModes = { vertices:true, edges:true, intersections:true, grid:false };
      this.snapTolerance = 24;
      this.snapGridMeters = 1;
      this.gripSize = 7;
      this.cadMovementLocked = false;
      this.vertexSelect = null;
      this.vertexXInput = null;
      this.vertexYInput = null;
      this.vertexStepInput = null;
      this.vertexLengthInput = null;
      this.vertexAngleInput = null;
      this.snapToleranceInput = null;
      this.snapModeButtons = {};
      this.gripSizeInput = null;
      this.gripSizeValue = null;
      this.dimensionEditor = null;
      this.dimensionEditorInput = null;
      this.dimensionEdit = null;
      this._regenTimers = new WeakMap();
      this.cadToggleBtn = null; this.cadToolsPanel = null; this.cadDraftActions = null; this.propsRailBtn = null;
      this.propsExpanded = false; this.cadExpanded = false;
      this._historyDebouncer = Utils.debounce((reason) => this._commitHistoryNow(reason), CONFIG.historyDebounceMs);

      // Bound handlers (needed for proper removal)
      this._bound = {
        key: this._handleKeyDown.bind(this),
        wheel: this._onWheel.bind(this),
        touchStart: this._onPinchStart.bind(this),
        touchMove: this._onPinchMove.bind(this),
        touchEnd: this._onPinchEnd.bind(this),
        docMouseMove: (e) => this._canvasMouseMove(e),
        docMouseUp: () => this._handlePointerUp(),
        docTouchMove: (e) => this._canvasTouchMove(e),
        docTouchEnd: (e) => this._canvasTouchEnd(e),
        docTouchCancel: () => this._cancelCanvasTouch()
      };
    }

    get elements() { return this.pages[this.currentPageIndex]?.elements || []; }
    set elements(v) { this.pages[this.currentPageIndex].elements = v; }

    open(sketchSVG, polygonsData, mode = 'combined') {
      this.sketchSVG = sketchSVG;
      this.polygonsData = polygonsData;
      this.pages = [{ elements: [] }];
      this.currentPageIndex = 0;
      this.selectedElement = null;
      this.activeTool = null;
      this.sketchEditMode = null;
      this.vertexEditElementId = null;
      this.sketchDraft = null;
      this.selectedVertex = null;
      this._pinch = null;
      this._pinchActive = false;
      this._touchStartSelection = null;
      this._cadTouchDrawing = null;
      this._cadTouchPreview = null;
      this.propsMinimized = false;
      this.toolsCollapsed = window.innerWidth < 768;
      this.propsExpanded = false;
      this.cadExpanded = false;
      this.undoRedo.clear();
      this._lastHistoryHash = null;

      this._buildUI();
      this._fitToScreen();

      if (mode === 'perPolygon' && polygonsData.length > 1) {
        // Create one page per polygon
        const renderer = new SketchRenderer();
        polygonsData.forEach((poly, i) => {
          if (i > 0) this.pages.push({ elements: [] });
          this.currentPageIndex = i;
          const singleSVG = renderer.render([poly], 520, 420, {});
          this._addDefaultElementsToCurrentPage(singleSVG, [poly]);
        });
        this.currentPageIndex = 0;
        this._refreshPageSelect();
      } else {
        this._addDefaultElementsToCurrentPage(sketchSVG, polygonsData);
      }

      this._commitHistoryNow('open');

      // Attach listeners
      document.addEventListener('keydown', this._bound.key);
      this.canvasArea.addEventListener('wheel', this._bound.wheel, { passive: false });
      this.canvasArea.addEventListener('touchstart', this._bound.touchStart, { passive: false });
      this.canvasArea.addEventListener('touchmove', this._bound.touchMove, { passive: false });
      this.canvasArea.addEventListener('touchend', this._bound.touchEnd, { passive: false });
      this.canvasArea.addEventListener('touchcancel', this._bound.touchEnd, { passive: false });
      document.addEventListener('mousemove', this._bound.docMouseMove);
      document.addEventListener('mouseup', this._bound.docMouseUp);
      document.addEventListener('touchmove', this._bound.docTouchMove, { passive: false });
      document.addEventListener('touchend', this._bound.docTouchEnd);
      document.addEventListener('touchcancel', this._bound.docTouchCancel);

      if (window.innerWidth < 768) {
        this.toolsCollapsed = true;
        this.toolsPanel.classList.add('collapsed');
      }

      // Init plugins
      PluginRegistry.getAll().forEach(p => { try { p.onInit?.(this.tool); } catch(_){} });
      this._refreshPluginTools();
    }

    close() {
      if(this._cadTouchDrawing)clearTimeout(this._cadTouchDrawing.timer);
      this._cancelDimensionEdit();
      this._cadTouchDrawing=null;
      this._cadTouchPreview=null;
      this._hideTouchMagnifier();
      this._pinch=null;
      this._pinchActive=false;
      // Remove all document-level listeners (BUG FIX #1)
      document.removeEventListener('keydown', this._bound.key);
      document.removeEventListener('mousemove', this._bound.docMouseMove);
      document.removeEventListener('mouseup', this._bound.docMouseUp);
      document.removeEventListener('touchmove', this._bound.docTouchMove);
      document.removeEventListener('touchend', this._bound.docTouchEnd);
      document.removeEventListener('touchcancel', this._bound.docTouchCancel);
      if (this.canvasArea) {
        this.canvasArea.removeEventListener('wheel', this._bound.wheel);
        this.canvasArea.removeEventListener('touchstart', this._bound.touchStart);
        this.canvasArea.removeEventListener('touchmove', this._bound.touchMove);
        this.canvasArea.removeEventListener('touchend', this._bound.touchEnd);
        this.canvasArea.removeEventListener('touchcancel', this._bound.touchEnd);
      }
      this.overlay?.remove();
      this.overlay = null;
    }

    // ---------- UI ----------
    _buildUI() {
      this.overlay?.remove();
      this.overlay = Utils.createElement('div', { className: 'prt-designer-overlay open' });

      const toolbar = Utils.createElement('div', { className: 'prt-designer-toolbar' });
      const toolbarMain = Utils.createElement('div', { className: 'prt-toolbar-main' });

      const backBtn = Utils.createElement('button', { className: 'prt-btn prt-btn-outline prt-btn-sm prt-back-btn', innerHTML: '← Back', onClick: () => this.close() });
      const title = Utils.createElement('span', { className: 'prt-toolbar-title', textContent: 'Report Designer' });
      this.toggleBtn = Utils.createElement('button', { className: 'prt-toolbar-toggle', textContent:'☰ Tools', onClick: () => this._toggleTools() });

      const pageBox = Utils.createElement('div', { className: 'prt-zoom-box prt-page-box' });
      this.pageSelect = Utils.createElement('select', { className: 'prt-select', style: { width: '140px', padding:'6px 8px', fontSize:'12px' } });
      this._refreshPageSelect();
      this.pageSelect.addEventListener('change', () => this._switchPage(parseInt(this.pageSelect.value, 10) || 0));
      const newPageBtn = Utils.createElement('button', { className: 'prt-btn prt-btn-outline prt-btn-sm', textContent: '+ Page', onClick: () => this._addNewPage() });
      const delPageBtn = Utils.createElement('button', { className: 'prt-btn prt-btn-outline prt-btn-sm', textContent: 'Del', onClick: () => this._deleteCurrentPage() });
      pageBox.appendChild(Utils.createElement('span', { className: 'prt-zoom-label', textContent: 'Page' }));
      pageBox.appendChild(this.pageSelect); pageBox.appendChild(newPageBtn); pageBox.appendChild(delPageBtn);

      this.zoomLabel = Utils.createElement('span', { className: 'prt-zoom-label', textContent: '100%' });
      const zoomBox = Utils.createElement('div', { className: 'prt-zoom-box' }, [
        Utils.createElement('button', { className:'prt-btn prt-btn-outline prt-btn-sm', textContent:'−', onClick:() => this._setZoom(this.zoom/1.12) }),
        this.zoomLabel,
        Utils.createElement('button', { className:'prt-btn prt-btn-outline prt-btn-sm', textContent:'+', onClick:() => this._setZoom(this.zoom*1.12) }),
        Utils.createElement('button', { className:'prt-btn prt-btn-outline prt-btn-sm', textContent:'Fit', onClick:() => this._fitToScreen() }),
      ]);

      const pdfBtn = Utils.createElement('button', { className:'prt-btn prt-btn-success prt-btn-sm prt-pdf-btn', innerHTML:`${ICONS.pdf} PDF`, onClick:() => this._generatePDF() });

      toolbarMain.append(backBtn, this.toggleBtn, title, pageBox, zoomBox, pdfBtn);
      toolbar.appendChild(toolbarMain);

      const workspace = Utils.createElement('div', { className:'prt-designer-workspace' });
      this.toolsPanel = Utils.createElement('div', { className: 'prt-toolbar-tools' });
      this.toolsPanel.classList.toggle('collapsed',this.toolsCollapsed);
      this._buildToolsPanel();
      workspace.appendChild(this.toolsPanel);

      this.canvasArea = Utils.createElement('div', { className: 'prt-designer-canvas-area' });
      this.canvas = Utils.createElement('div', { className: 'prt-page-canvas' });
      this.canvasArea.appendChild(this.canvas);

      this.layerManagerEl = Utils.createElement('div', { className: 'prt-layer-manager', style: { display: 'none' } });
      this.canvasArea.appendChild(this.layerManagerEl);
      workspace.appendChild(this.canvasArea);

      this.propsPanel = Utils.createElement('div', { className: 'prt-props-panel' });
      workspace.appendChild(this.propsPanel);
      this.propsRailBtn = Utils.createElement('button', {
        className:'prt-props-rail', type:'button', textContent:'‹',
        title:'Open properties', 'aria-label':'Open properties',
        onClick:() => this._toggleProperties()
      });
      workspace.appendChild(this.propsRailBtn);
      this._buildCADPanel(workspace);

      this.overlay.appendChild(toolbar);
      this.overlay.appendChild(workspace);
      this._touchMagnifier=Utils.createElement('div',{className:'prt-touch-magnifier','aria-hidden':'true'});
      this.overlay.appendChild(this._touchMagnifier);
      document.body.appendChild(this.overlay);

      this.canvas.addEventListener('mousedown', (e) => this._canvasMouseDown(e));
      this.canvas.addEventListener('touchstart', (e) => this._canvasTouchStart(e), { passive: false });
      this.canvas.addEventListener('click', (e) => { if (!this._pinchActive&&e.target === this.canvas) this._selectElement(null); });
      this.canvas.addEventListener('dblclick', (e) => {
        const dimensionText=e.target?.closest?.('[data-prt-dimension-text]');
        if(dimensionText) {
          const dimension=dimensionText.closest('[data-prt-dimension-key]');
          if(dimension&&this.selectedElement?.type==='sketch') {
            e.preventDefault();
            this._openDimensionEditor(
              dimension.dataset.prtDimensionKey,
              Number(dimension.dataset.prtPolygon),
              dimensionText.textContent||''
            );
            return;
          }
        }
        if (this.sketchEditMode === 'draw-polygon' || this.sketchEditMode === 'draw-line') {
          e.preventDefault();
          this._finishSketchGeometry(this.sketchEditMode === 'draw-polygon' ? 'Polygon' : 'LineString');
        }
      });

      this.undoRedo.onChange(() => this._updateUndoRedoButtons());
      this._updatePanelButtons();
    }

    _buildToolsPanel() {
      this.toolsPanel.innerHTML = '';

      const builtInTools = [
        { id:'pointer', icon:ICONS.select, label:'Move', action:() => this._setTool(null) },
        { separator:true },
        { id:'text',    icon:ICONS.text,    label:'Text',    action:() => this._setTool('text') },
        { id:'line',    icon:ICONS.line,    label:'Line',    action:() => this._setTool('line') },
        { id:'arrow',   icon:ICONS.line,    label:'Arrow',   action:() => this._setTool('arrow') },
        { id:'rect',    icon:ICONS.rect,    label:'Rect',    action:() => this._setTool('rect') },
        { id:'border',  icon:ICONS.rect,    label:'Border',  action:() => this._addPageBorder() },
        { id:'divider', icon:ICONS.line,    label:'Divider', action:() => this._addPageDivider() },
        { id:'sketch',  icon:ICONS.sketch,  label:'Sketch',  action:() => this._addSketchElement() },
        { id:'details', icon:ICONS.details, label:'Details', action:() => this._openDetailsModal() },
        { id:'qr',      icon:ICONS.qr,      label:'QR',      action:() => this._openQRModal() },
        { separator:true },
      ];

      // Add plugin toolbar entries
      const pluginTools = PluginRegistry.getAll().filter(p => p.toolbar).map(p => ({
        id: `plugin_${p.name}`,
        icon: p.toolbar.icon || ICONS.template,
        label: p.toolbar.label || p.name,
        action: () => { try { p.toolbar.action?.(this); } catch(e) { console.error(e); } }
      }));
      if (pluginTools.length) { pluginTools.push({ separator:true }); }

      const utilityTools = [
        { id:'undo',   icon:ICONS.undo,     label:'Undo',   action:() => this._undo() },
        { id:'redo',   icon:ICONS.redo,     label:'Redo',   action:() => this._redo() },
        { id:'dup',    icon:ICONS.template, label:'Dup',    action:() => this._duplicateSelected() },
        { id:'front',  icon:ICONS.template, label:'Front',  action:() => this._bringToFront() },
        { id:'back',   icon:ICONS.template, label:'Back',   action:() => this._sendToBack() },
        { id:'delete', icon:ICONS.delete,   label:'Del',    action:() => this._deleteSelected() },
        { separator:true },
        { id:'layers',  icon:ICONS.template, label:'Layers', action:() => this._toggleLayerManager() },
        { id:'page',    icon:ICONS.page,     label:'Size',   action:() => this._openPageModal() },
        { id:'proj',    icon:ICONS.settings, label:'Proj',   action:() => this._openProjectionModal() },
        { id:'loadtpl', icon:ICONS.template, label:'Load',   action:() => this._openTemplateModal() },
        { id:'savetpl', icon:ICONS.save,     label:'Save',   action:() => this._saveTemplate() },
      ];

      const allTools = [...builtInTools, ...pluginTools, ...utilityTools];
      allTools.forEach(t => {
        if (t.separator) { this.toolsPanel.appendChild(Utils.createElement('div', { className:'prt-tool-separator' })); return; }
        this.toolsPanel.appendChild(Utils.createElement('button', {
          className:'prt-tool-btn', 'data-tool':t.id,
          innerHTML: `${t.icon}<span>${t.label}</span>`, onClick: t.action
        }));
      });
      this.toolsPanel.appendChild(Utils.createElement('div',{className:'prt-tool-separator'}));
      const gripControl=Utils.createElement('label',{className:'prt-grip-control'});
      const gripHeading=Utils.createElement('span',{className:'prt-grip-control-heading'});
      gripHeading.append(
        Utils.createElement('strong',{textContent:'Boundary grip size'}),
        this.gripSizeValue=Utils.createElement('output',{textContent:String(this.gripSize)})
      );
      this.gripSizeInput=Utils.createElement('input',{
        type:'range',min:'4',max:'18',step:'1',value:String(this.gripSize),
        'aria-label':'Boundary grip size'
      });
      this.gripSizeInput.addEventListener('input',()=>{
        this.gripSize=Number(this.gripSizeInput.value);
        this.gripSizeValue.textContent=String(this.gripSize);
        this.elements.forEach(element=>{
          if(element.type==='sketch')this._regenSketch(element);
        });
      });
      gripControl.append(gripHeading,this.gripSizeInput);
      this.toolsPanel.appendChild(gripControl);
    }

    _buildCADPanel(workspace) {
      const dock=Utils.createElement('div',{className:'prt-cad-dock'});
      const header=Utils.createElement('div',{className:'prt-cad-dock-header'});
      header.appendChild(Utils.createElement('strong',{textContent:'CAD sketch editing',style:{fontSize:'12px',color:'#374151'}}));
      header.appendChild(Utils.createElement('span',{className:'prt-cad-dock-hint',textContent:'Drag to move'}));
      this.cadToggleBtn=Utils.createElement('button',{
        className:'prt-toolbar-toggle',
        textContent:'CAD tools ▴',
        'aria-expanded':'false',
        onClick:()=>this._toggleCAD()
      });
      header.appendChild(this.cadToggleBtn);
      dock.appendChild(header);
      this._makeCADDockDraggable(dock,header);
      this.cadToolsPanel=Utils.createElement('div',{className:'prt-cad-tools collapsed'});
      const actions=[
        ['Select / Move','select'],
        ['Edit vertices','edit-vertices'],
        ['Add vertex','add-vertex'],
        ['Delete vertex','delete-vertex'],
        ['Delete drawn feature','delete-feature'],
        ['Draw point','draw-point'],
        ['Draw line','draw-line'],
        ['Draw polygon','draw-polygon'],
        ['Edit dimensions','edit-dimensions'],
        ['Draw dimension','draw-dimension'],
        ['Delete dimension','delete-dimension']
      ];
      actions.forEach(([label,mode])=>{
        const button=Utils.createElement('button',{
          className:'prt-btn prt-btn-outline prt-btn-sm',
          textContent:label,
          'data-cad-mode':mode,
          onClick:()=>this._activateCADMode(mode)
        });
        this.cadToolsPanel.appendChild(button);
      });
      const snapControls=Utils.createElement('div',{className:'prt-cad-snap-controls'});
      snapControls.appendChild(Utils.createElement('button',{
        className:`prt-btn prt-btn-sm ${this.snapEnabled?'prt-btn-primary':'prt-btn-outline'}`,
        textContent:'Snap',
        title:'Toggle snapping',
        'aria-pressed':String(this.snapEnabled),
        'data-cad-snap':'true',
        onClick:()=>{
          this.snapEnabled=!this.snapEnabled;
          this._updateCADPanel();
        }
      }));
      const snapSettingsButton=Utils.createElement('button',{
        className:'prt-btn prt-btn-outline prt-btn-sm',
        textContent:'⚙',
        title:'Snapping settings',
        'aria-label':'Snapping settings',
        'aria-expanded':'false',
        'data-cad-snap-settings':'true',
        onClick:()=>{
          snapOptions.hidden=!snapOptions.hidden;
          snapSettingsButton.setAttribute('aria-expanded',String(!snapOptions.hidden));
        }
      });
      snapControls.appendChild(snapSettingsButton);
      this.cadToolsPanel.appendChild(snapControls);
      const snapOptions=Utils.createElement('div',{className:'prt-cad-vertex-editor prt-cad-snap-options'});
      snapOptions.hidden=true;
      snapOptions.appendChild(Utils.createElement('strong',{textContent:'Snapping types'}));
      [['vertices','Vertices'],['edges','Edges'],['intersections','Intersections'],['grid','Grid']].forEach(([mode,label])=>{
        const button=Utils.createElement('button',{
          className:'prt-btn prt-btn-outline prt-btn-sm',
          textContent:label,
          'data-cad-snap-mode':mode,
          'aria-pressed':String(!!this.snapModes[mode]),
          onClick:()=>{
            this.snapModes[mode]=!this.snapModes[mode];
            this._updateCADPanel();
          }
        });
        this.snapModeButtons[mode]=button;
        snapOptions.appendChild(button);
      });
      const toleranceControl=Utils.createElement('label',{className:'prt-cad-wide',style:{display:'grid',gap:'4px',fontSize:'12px',color:'#475569'}});
      toleranceControl.appendChild(Utils.createElement('span',{textContent:'Snapping tolerance (screen pixels)'}));
      this.snapToleranceInput=Utils.createElement('input',{
        className:'prt-input prt-cad-wide',
        type:'number',min:'4',max:'80',step:'1',value:String(this.snapTolerance),
        placeholder:'Snap tolerance (screen pixels)',
        'aria-label':'Snap tolerance in screen pixels'
      });
      this.snapToleranceInput.addEventListener('change',()=>{
        const value=Number(this.snapToleranceInput.value);
        if(!Number.isFinite(value)||value<4||value>80) {
          this.snapToleranceInput.value=String(this.snapTolerance);
          return Utils.showToast('Snap tolerance must be between 4 and 80 pixels');
        }
        this.snapTolerance=value;
      });
      toleranceControl.appendChild(this.snapToleranceInput);
      snapOptions.appendChild(toleranceControl);
      this.cadToolsPanel.appendChild(snapOptions);
      this.cadToolsPanel.appendChild(Utils.createElement('button',{
        className:'prt-btn prt-btn-outline prt-btn-sm prt-cad-lock',
        textContent:'Lock all layer movement',
        'data-cad-lock':'true',
        onClick:()=>this._toggleCADBoundaryLock()
      }));
      this.cadToolsPanel.appendChild(Utils.createElement('button',{
        className:'prt-btn prt-btn-outline prt-btn-sm',
        textContent:'Triangulate polygons',
        'data-cad-triangulate':'true',
        onClick:()=>this._triangulateSketch()
      }));
      const vertexEditor=Utils.createElement('div',{className:'prt-cad-vertex-editor'});
      vertexEditor.appendChild(Utils.createElement('strong',{textContent:'Vertex tools'}));
      this.vertexSelect=Utils.createElement('select',{
        className:'prt-select prt-cad-wide',
        'aria-label':'Select polygon vertex'
      });
      this.vertexSelect.appendChild(Utils.createElement('option',{value:'',textContent:'Select a vertex'}));
      this.vertexSelect.addEventListener('change',()=>this._selectCADVertex(this.vertexSelect.value));
      vertexEditor.appendChild(this.vertexSelect);
      this.vertexXInput=Utils.createElement('input',{className:'prt-input',type:'number',step:'any','aria-label':'Vertex X coordinate'});
      this.vertexYInput=Utils.createElement('input',{className:'prt-input',type:'number',step:'any','aria-label':'Vertex Y coordinate'});
      this.vertexXInput.placeholder='X coordinate';
      this.vertexYInput.placeholder='Y coordinate';
      vertexEditor.append(this.vertexXInput,this.vertexYInput);
      vertexEditor.appendChild(Utils.createElement('button',{
        className:'prt-btn prt-btn-primary prt-btn-sm prt-cad-wide',
        textContent:'Apply coordinates (projection units)',
        onClick:()=>this._applyVertexCoordinates()
      }));
      vertexEditor.appendChild(Utils.createElement('button',{
        className:'prt-btn prt-btn-danger prt-btn-sm prt-cad-wide',
        textContent:'Delete selected vertex',
        onClick:()=>this._deleteSelectedCADVertex()
      }));
      const nudge=Utils.createElement('div',{className:'prt-cad-nudge prt-cad-wide','aria-label':'Nudge selected vertex'});
      [['↑',0,1,2,1],['←',-1,0,1,2],['↓',0,-1,2,3],['→',1,0,3,2]].forEach(([label,dx,dy,column,row])=>{
        const button=Utils.createElement('button',{
          className:'prt-btn prt-btn-outline prt-btn-sm',
          textContent:label,
          style:{gridColumn:String(column),gridRow:String(row)},
          'aria-label':`Nudge ${label}`,
          onClick:()=>this._nudgeSelectedVertex(Number(dx),Number(dy))
        });
        nudge.appendChild(button);
      });
      this.vertexStepInput=Utils.createElement('input',{
        className:'prt-input',type:'number',min:'0.001',step:'0.1',value:'1',
        'aria-label':'Nudge distance in meters'
      });
      this.vertexStepInput.style.gridColumn='2';
      this.vertexStepInput.style.gridRow='2';
      nudge.appendChild(this.vertexStepInput);
      vertexEditor.appendChild(nudge);
      this.vertexLengthInput=Utils.createElement('input',{
        className:'prt-input',type:'number',min:'0.001',step:'0.01',
        placeholder:'Segment length (m)','aria-label':'Incoming segment length in meters'
      });
      this.vertexAngleInput=Utils.createElement('input',{
        className:'prt-input',type:'number',step:'0.1',
        placeholder:'Bearing from +X (°)','aria-label':'Incoming segment bearing from positive X in degrees'
      });
      vertexEditor.append(this.vertexLengthInput,this.vertexAngleInput);
      vertexEditor.appendChild(Utils.createElement('button',{
        className:'prt-btn prt-btn-outline prt-btn-sm prt-cad-wide',
        textContent:'Apply length and bearing to incoming edge',
        onClick:()=>this._applyVertexConstraint()
      }));
      this.cadToolsPanel.appendChild(vertexEditor);
      this.cadToolsPanel.appendChild(Utils.createElement('button',{
        className:'prt-btn prt-btn-success prt-btn-sm',
        textContent:'Finish polygon',
        'data-cad-finish':'true',
        style:{display:'none'},
        onClick:()=>this._finishSketchGeometry(
          this.sketchEditMode==='draw-line'?'LineString':
            this.sketchEditMode==='draw-point'?'Point':'Polygon'
        )
      }));
      dock.appendChild(this.cadToolsPanel);
      workspace.appendChild(dock);
      this.cadDraftActions=Utils.createElement('div',{
        className:'prt-sketch-draft-actions',
        hidden:true,
        'aria-label':'Finish sketch drawing'
      },[
        Utils.createElement('button',{
          className:'prt-sketch-draft-action prt-sketch-draft-undo',
          type:'button',
          textContent:'↶',
          title:'Undo last point',
          'aria-label':'Undo last point',
          'data-sketch-draft-undo':'true',
          onClick:()=>this._undoLastSketchPoint()
        }),
        Utils.createElement('button',{
          className:'prt-sketch-draft-action prt-sketch-draft-redo',
          type:'button',
          textContent:'↷',
          title:'Redo last point',
          'aria-label':'Redo last point',
          'data-sketch-draft-redo':'true',
          onClick:()=>this._redoSketchPoint()
        }),
        Utils.createElement('button',{
          className:'prt-sketch-draft-action prt-sketch-draft-cancel',
          type:'button',
          textContent:'×',
          title:'Cancel drawing',
          'aria-label':'Cancel drawing',
          onClick:()=>this._cancelSketchDraft()
        }),
        Utils.createElement('button',{
          className:'prt-sketch-draft-action prt-sketch-draft-confirm',
          type:'button',
          textContent:'✓',
          title:'Finish drawing',
          'aria-label':'Finish drawing',
          onClick:()=>this._finishSketchGeometry(
            this.sketchEditMode==='draw-line'?'LineString':
              this.sketchEditMode==='draw-point'?'Point':'Polygon'
          )
        })
      ]);
      workspace.appendChild(this.cadDraftActions);
      this.dimensionEditor=Utils.createElement('div',{
        className:'prt-dimension-editor',
        hidden:true,
        'aria-label':'Edit dimension text'
      });
      this.dimensionEditorInput=Utils.createElement('input',{
        type:'text',
        'aria-label':'Dimension text',
        placeholder:'Dimension text'
      });
      this.dimensionEditorInput.addEventListener('keydown',event=>{
        if(event.key==='Enter'){event.preventDefault();this._saveDimensionEdit();}
        if(event.key==='Escape'){event.preventDefault();this._cancelDimensionEdit();}
      });
      this.dimensionEditor.append(
        this.dimensionEditorInput,
        Utils.createElement('button',{
          className:'prt-dimension-editor-cancel',
          type:'button',textContent:'×',title:'Cancel',
          'aria-label':'Cancel dimension edit',
          onClick:()=>this._cancelDimensionEdit()
        }),
        Utils.createElement('button',{
          className:'prt-dimension-editor-apply',
          type:'button',textContent:'↔',title:'Apply this length to the sketch (unit-aware)',
          'aria-label':'Apply dimension length to sketch',
          onClick:()=>this._applyEditedDimensionLength()
        }),
        Utils.createElement('button',{
          className:'prt-dimension-editor-save',
          type:'button',textContent:'✓',title:'Save dimension text',
          'aria-label':'Save dimension text',
          onClick:()=>this._saveDimensionEdit()
        })
      );
      this.dimensionEditor.querySelector('.prt-dimension-editor-cancel').style.background='var(--prt-danger)';
      this.dimensionEditor.querySelector('.prt-dimension-editor-save').style.background='var(--prt-success)';
      this.dimensionEditorApplyButton=this.dimensionEditor.querySelector('.prt-dimension-editor-apply');
      workspace.appendChild(this.dimensionEditor);
    }

    _makeCADDockDraggable(dock,header) {
      let drag=null;
      header.addEventListener('pointerdown',event=>{
        if(event.button!==0||event.target.closest('button'))return;
        const workspace=dock.parentElement;
        if(!workspace)return;
        const workspaceRect=workspace.getBoundingClientRect();
        const dockRect=dock.getBoundingClientRect();
        drag={
          pointerId:event.pointerId,
          startX:event.clientX,
          startY:event.clientY,
          left:dockRect.left-workspaceRect.left,
          top:dockRect.top-workspaceRect.top,
          width:dockRect.width,
          height:dockRect.height,
          workspaceWidth:workspaceRect.width,
          workspaceHeight:workspaceRect.height
        };
        dock.style.left=`${drag.left}px`;
        dock.style.top=`${drag.top}px`;
        dock.style.right='auto';
        dock.style.bottom='auto';
        dock.style.transform='none';
        header.classList.add('dragging');
        header.setPointerCapture(event.pointerId);
        event.preventDefault();
      });
      header.addEventListener('pointermove',event=>{
        if(!drag||event.pointerId!==drag.pointerId)return;
        const left=Math.max(0,Math.min(
          drag.workspaceWidth-drag.width,
          drag.left+event.clientX-drag.startX
        ));
        const top=Math.max(0,Math.min(
          drag.workspaceHeight-drag.height,
          drag.top+event.clientY-drag.startY
        ));
        dock.style.left=`${left}px`;
        dock.style.top=`${top}px`;
      });
      const finishDrag=event=>{
        if(!drag||event.pointerId!==drag.pointerId)return;
        if(header.hasPointerCapture(event.pointerId))header.releasePointerCapture(event.pointerId);
        drag=null;
        header.classList.remove('dragging');
      };
      header.addEventListener('pointerup',finishDrag);
      header.addEventListener('pointercancel',finishDrag);
    }

    _activateCADMode(mode) {
      const el=this.selectedElement;
      if (!el || el.type!=='sketch') {
        this._toggleCAD();
        return Utils.showToast('Select a sketch element first');
      }
      if (mode==='select') {
        this._setSketchEditMode(null,el);
        this._setTool(null);
      } else {
        this._setSketchEditMode(this.sketchEditMode===mode?null:mode,el);
      }
      this._updateCADPanel();
      if(window.innerWidth<768&&this.sketchEditMode) {
        this.cadExpanded=false;
        this.cadToolsPanel.classList.add('collapsed');
        this._updatePanelButtons();
      }
    }

    _updateCADPanel() {
      if (!this.cadToolsPanel) return;
      this.cadToolsPanel.querySelectorAll('[data-cad-mode]').forEach(button => {
        button.classList.toggle('active',button.dataset.cadMode===this.sketchEditMode);
      });
      const finish=this.cadToolsPanel.querySelector('[data-cad-finish]');
      const canFinishDraft=!!this.sketchDraft&&['draw-line','draw-polygon','draw-point'].includes(this.sketchEditMode);
      if (finish) {
        finish.style.display=canFinishDraft?'':'none';
        finish.textContent=this.sketchEditMode==='draw-line'?'Finish line':
          this.sketchEditMode==='draw-point'?'Finish point':'Finish polygon';
      }
      if(this.cadDraftActions)this.cadDraftActions.hidden=!canFinishDraft;
      const draftUndo=this.cadDraftActions?.querySelector('[data-sketch-draft-undo]');
      const draftRedo=this.cadDraftActions?.querySelector('[data-sketch-draft-redo]');
      if(draftUndo)draftUndo.disabled=!this.sketchDraft?.points?.length;
      if(draftRedo)draftRedo.disabled=!this.sketchDraft?.redoPoints?.length;
      const snap=this.cadToolsPanel.querySelector('[data-cad-snap]');
      if (snap) {
        snap.setAttribute('aria-pressed',String(this.snapEnabled));
        snap.classList.toggle('prt-btn-primary',this.snapEnabled);
        snap.classList.toggle('prt-btn-outline',!this.snapEnabled);
      }
      Object.entries(this.snapModeButtons).forEach(([mode,button])=>{
        button.classList.toggle('prt-btn-primary',!!this.snapModes[mode]);
        button.classList.toggle('prt-btn-outline',!this.snapModes[mode]);
        button.setAttribute('aria-pressed',String(!!this.snapModes[mode]));
      });
      const lock=this.cadToolsPanel.querySelector('[data-cad-lock]');
      if(lock) {
        lock.textContent=this.cadMovementLocked?'Unlock all layer movement':'Lock all layer movement';
        lock.classList.toggle('prt-btn-primary',this.cadMovementLocked);
        lock.classList.toggle('prt-btn-outline',!this.cadMovementLocked);
        lock.setAttribute('aria-pressed',String(this.cadMovementLocked));
      }
      const triangulate=this.cadToolsPanel.querySelector('[data-cad-triangulate]');
      if(triangulate)triangulate.textContent=(this.selectedElement?.polygonsRef||[]).some(poly=>poly.triangulationDiagonals?.length)?'Remove diagonals':'Triangulate polygons';
      this._refreshCADVertexList();
    }

    _refreshCADVertexList() {
      if(!this.vertexSelect)return;
      const el=this.selectedElement?.type==='sketch'?this.selectedElement:null;
      const selected=this.selectedVertex;
      this.vertexSelect.innerHTML='';
      this.vertexSelect.appendChild(Utils.createElement('option',{value:'',textContent:'Select a vertex'}));
      (el?.polygonsRef||[]).forEach((poly,polygonIndex)=>{
        (poly.coordsProj||poly.coords||[]).forEach((ring,ringIndex)=>{
          const closed=poly.geometryType!=='LineString'&&poly.geometryType!=='Point'&&ring.length>3&&
            ring[0][0]===ring[ring.length-1][0]&&ring[0][1]===ring[ring.length-1][1];
          const count=ring.length-(closed?1:0);
          for(let vertexIndex=0;vertexIndex<count;vertexIndex++) {
            const value=`${polygonIndex}:${ringIndex}:${vertexIndex}`;
            this.vertexSelect.appendChild(Utils.createElement('option',{
              value,
              textContent:`Feature ${polygonIndex+1} · Ring ${ringIndex+1} · Vertex ${vertexIndex+1}`
            }));
          }
        });
      });
      if(selected) {
        const key=`${selected.polygonIndex}:${selected.ringIndex}:${selected.vertexIndex}`;
        if([...this.vertexSelect.options].some(option=>option.value===key))this.vertexSelect.value=key;
        else this.selectedVertex=null;
      }
      const active=!!this.selectedVertex&&!!this.vertexSelect.value;
      [this.vertexXInput,this.vertexYInput,this.vertexStepInput,this.vertexLengthInput,this.vertexAngleInput]
        .forEach(input=>{if(input)input.disabled=!el||(!active&&input!==this.vertexStepInput);});
    }

    _selectCADVertex(value) {
      if(!value) {
        this.selectedVertex=null;
        this._refreshCADVertexList();
        return;
      }
      const [polygonIndex,ringIndex,vertexIndex]=value.split(':').map(Number);
      const poly=this.selectedElement?.polygonsRef?.[polygonIndex];
      const ring=poly?.coordsProj?.[ringIndex]||poly?.coords?.[ringIndex];
      const coordinate=ring?.[vertexIndex];
      if(!coordinate)return;
      this.selectedVertex={polygonIndex,ringIndex,vertexIndex};
      this.vertexXInput.value=String(coordinate[0]);
      this.vertexYInput.value=String(coordinate[1]);
      this._renderElement(this.selectedElement);
      const closed=poly.geometryType!=='LineString'&&poly.geometryType!=='Point'&&ring.length>3&&
        ring[0][0]===ring[ring.length-1][0]&&ring[0][1]===ring[ring.length-1][1];
      const count=ring.length-(closed?1:0);
      const previousIndex=vertexIndex===0?(closed?count-1:-1):vertexIndex-1;
      if(previousIndex>=0) {
        const previous=ring[previousIndex];
        this.vertexLengthInput.value=String(Projection.distance(previous,coordinate).toFixed(3));
        this.vertexAngleInput.value=String((Math.atan2(coordinate[1]-previous[1],coordinate[0]-previous[0])*180/Math.PI).toFixed(2));
      } else {
        this.vertexLengthInput.value='';
        this.vertexAngleInput.value='';
      }
      this._refreshCADVertexList();
    }

    _getSelectedCADVertex() {
      const selected=this.selectedVertex,el=this.selectedElement;
      const poly=selected&&el?.polygonsRef?.[selected.polygonIndex];
      const ring=poly?.coordsProj?.[selected.ringIndex]||poly?.coords?.[selected.ringIndex];
      const coordinate=ring?.[selected.vertexIndex];
      return selected&&poly&&ring&&coordinate?{...selected,el,poly,ring,coordinate}:null;
    }

    _applyVertexCoordinates() {
      const vertex=this._getSelectedCADVertex();
      const x=Number(this.vertexXInput?.value),y=Number(this.vertexYInput?.value);
      if(!vertex)return Utils.showToast('Select a vertex first');
      if(!Number.isFinite(x)||!Number.isFinite(y))return Utils.showToast('Enter valid X and Y coordinates');
      this._setSketchVertex(vertex.el,vertex.polygonIndex,vertex.ringIndex,vertex.vertexIndex,[x,y]);
      this._commitGeometryChange(vertex.el,'vertex-coordinate');
      this._selectCADVertex(`${vertex.polygonIndex}:${vertex.ringIndex}:${vertex.vertexIndex}`);
    }

    _deleteSelectedCADVertex() {
      const vertex=this._getSelectedCADVertex();
      if(!vertex)return Utils.showToast('Select a vertex first');
      const closed=vertex.poly.geometryType!=='LineString'&&vertex.poly.geometryType!=='Point'&&vertex.ring.length>3&&
        vertex.ring[0][0]===vertex.ring[vertex.ring.length-1][0]&&vertex.ring[0][1]===vertex.ring[vertex.ring.length-1][1];
      const uniqueCount=vertex.ring.length-(closed?1:0);
      const minimum=vertex.poly.geometryType==='LineString'?2:vertex.poly.geometryType==='Point'?1:3;
      if(vertex.poly.geometryType!=='Point'&&uniqueCount<=minimum) {
        return Utils.showToast(`Geometry must keep at least ${minimum} vertices`);
      }
      this.selectedVertex=null;
      this._deleteSketchVertex(vertex.el,{dataset:{
        polygon:String(vertex.polygonIndex),ring:String(vertex.ringIndex),vertex:String(vertex.vertexIndex)
      }});
      this._updateCADPanel();
    }

    _nudgeSelectedVertex(dx,dy) {
      const vertex=this._getSelectedCADVertex();
      const meters=Number(this.vertexStepInput?.value);
      if(!vertex)return Utils.showToast('Select a vertex first');
      if(!Number.isFinite(meters)||meters<=0)return Utils.showToast('Nudge distance must be greater than zero');
      const units=Projection.coordinateDistance(meters,vertex.coordinate);
      const coordinate=[vertex.coordinate[0]+dx*units,vertex.coordinate[1]+dy*units];
      this._setSketchVertex(vertex.el,vertex.polygonIndex,vertex.ringIndex,vertex.vertexIndex,coordinate);
      this._commitGeometryChange(vertex.el,'vertex-nudge');
      this._selectCADVertex(`${vertex.polygonIndex}:${vertex.ringIndex}:${vertex.vertexIndex}`);
    }

    _applyVertexConstraint() {
      const vertex=this._getSelectedCADVertex();
      if(!vertex)return Utils.showToast('Select a vertex first');
      const {poly,ring,vertexIndex}=vertex;
      const closed=poly.geometryType!=='LineString'&&poly.geometryType!=='Point'&&ring.length>3&&
        ring[0][0]===ring[ring.length-1][0]&&ring[0][1]===ring[ring.length-1][1];
      const count=ring.length-(closed?1:0);
      const previousIndex=vertexIndex===0?(closed?count-1:-1):vertexIndex-1;
      if(previousIndex<0)return Utils.showToast('The first line vertex has no incoming edge');
      const origin=ring[previousIndex];
      const length=Number(this.vertexLengthInput.value),angle=Number(this.vertexAngleInput.value);
      if(!Number.isFinite(length)||length<=0||!Number.isFinite(angle)) {
        return Utils.showToast('Enter a positive length and a valid bearing');
      }
      const units=Projection.coordinateDistance(length,origin),radians=angle*Math.PI/180;
      const coordinate=[origin[0]+units*Math.cos(radians),origin[1]+units*Math.sin(radians)];
      this._setSketchVertex(vertex.el,vertex.polygonIndex,vertex.ringIndex,vertexIndex,coordinate);
      this._commitGeometryChange(vertex.el,'vertex-constraint');
      this._selectCADVertex(`${vertex.polygonIndex}:${vertex.ringIndex}:${vertexIndex}`);
    }

    _toggleCADBoundaryLock() {
      this.cadMovementLocked=!this.cadMovementLocked;
      this._updateCADPanel();
      Utils.showToast(this.cadMovementLocked?'Movement locked for all report layers':'Movement unlocked for all report layers');
    }

    _undoLastSketchPoint() {
      if(!this.sketchDraft?.points?.length)return;
      const draft=this.sketchDraft;
      if(!Array.isArray(draft.redoPoints))draft.redoPoints=[];
      draft.redoPoints.push(draft.points.pop());
      this._cadTouchPreview=null;
      this._renderElement(draft.element);
      this._updateCADPanel();
    }

    _redoSketchPoint() {
      const draft=this.sketchDraft;
      if(!draft?.redoPoints?.length)return;
      draft.points.push(draft.redoPoints.pop());
      this._renderElement(draft.element);
      this._updateCADPanel();
    }

    _validateSketchGeometry(geometryType,points) {
      const errors=[];
      const closed=geometryType==='Polygon'&&points.length>1&&
        Math.hypot(points[0][0]-points[points.length-1][0],points[0][1]-points[points.length-1][1])<1e-8;
      const ring=closed?points.slice(0,-1):points.slice();
      const minimum=geometryType==='Polygon'?3:geometryType==='LineString'?2:1;
      if(ring.length<minimum)errors.push(`Needs at least ${minimum} distinct vertices`);
      const segmentCount=geometryType==='Polygon'?ring.length:ring.length-1;
      for(let index=0;index<segmentCount;index++) {
        const next=ring[(index+1)%ring.length];
        if(geometryType!=='Point'&&next&&Math.hypot(ring[index][0]-next[0],ring[index][1]-next[1])<1e-8) {
          errors.push('Contains duplicate consecutive vertices');
          break;
        }
      }
      if(geometryType!=='Point') {
        for(let i=0;i<ring.length;i++)for(let j=i+1;j<ring.length;j++) {
          if(Math.hypot(ring[i][0]-ring[j][0],ring[i][1]-ring[j][1])<1e-8) {
            errors.push('Contains repeated vertices');
            return errors;
          }
        }
      }
      if(geometryType==='Polygon'&&ring.length>=3) {
        let twiceArea=0;
        for(let index=0;index<ring.length;index++) {
          const a=ring[index],b=ring[(index+1)%ring.length];
          twiceArea+=a[0]*b[1]-b[0]*a[1];
        }
        if(Math.abs(twiceArea)<1e-8)errors.push('Polygon area is zero');
        const orientation=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
        const onSegment=(a,b,p)=>p[0]>=Math.min(a[0],b[0])-1e-10&&p[0]<=Math.max(a[0],b[0])+1e-10&&
          p[1]>=Math.min(a[1],b[1])-1e-10&&p[1]<=Math.max(a[1],b[1])+1e-10;
        const intersects=(a,b,c,d)=>{
          const o1=orientation(a,b,c),o2=orientation(a,b,d),o3=orientation(c,d,a),o4=orientation(c,d,b);
          if(((o1>0&&o2<0)||(o1<0&&o2>0))&&((o3>0&&o4<0)||(o3<0&&o4>0)))return true;
          return (Math.abs(o1)<1e-10&&onSegment(a,b,c))||(Math.abs(o2)<1e-10&&onSegment(a,b,d))||
            (Math.abs(o3)<1e-10&&onSegment(c,d,a))||(Math.abs(o4)<1e-10&&onSegment(c,d,b));
        };
        for(let i=0;i<ring.length;i++)for(let j=i+1;j<ring.length;j++) {
          if(j===i+1||(i===0&&j===ring.length-1))continue;
          if(intersects(ring[i],ring[(i+1)%ring.length],ring[j],ring[(j+1)%ring.length])) {
            errors.push('Boundary self-intersects');
            return errors;
          }
        }
      }
      return errors;
    }

    _validateSketch() {
      const el=this.selectedElement?.type==='sketch'?this.selectedElement:null;
      if(!el)return Utils.showToast('Select a sketch element first');
      const issues=[];
      (el.polygonsRef||[]).forEach((poly,index)=>{
        const type=poly.geometryType==='LineString'?'LineString':poly.geometryType==='Point'?'Point':'Polygon';
        (poly.coordsProj||poly.coords||[]).forEach((ring,ringIndex)=>{
          this._validateSketchGeometry(type,ring).forEach(issue=>issues.push(`Plot ${index+1}, ring ${ringIndex+1}: ${issue}`));
        });
      });
      if(issues.length)Utils.showToast(`Geometry issues: ${issues.slice(0,2).join('; ')}${issues.length>2?` (+${issues.length-2} more)`:''}`);
      else Utils.showToast('Sketch geometry is valid');
    }

    _getDimensionSegments(el) {
      const segments=[];
      (el?.polygonsRef||[]).forEach((poly,polygonIndex)=>{
        if (poly.geometryType==='LineString'||poly.geometryType==='Point') return;
        (poly.coordsProj||poly.coords||[]).forEach((ring,ringIndex)=>{
          const closed=ring.length>3&&ring[0][0]===ring[ring.length-1][0]&&ring[0][1]===ring[ring.length-1][1];
          const count=ring.length-(closed?1:0);
          for(let index=0;index<count;index++){
            const a=ring[index],b=ring[(index+1)%count];
            segments.push({key:`${polygonIndex}:${ringIndex}:${index}`,polygonIndex,ringIndex,index,poly,ring,a,b,
              length:Projection.distance(a,b)});
          }
        });
      });
      return segments;
    }

    _openDimensionEditor(key,polygonIndex,label) {
      const el=this.selectedElement;
      if(el?.type!=='sketch'||!this.dimensionEditor)return;
      const poly=el.polygonsRef?.[polygonIndex];
      if(!poly)return;
      this.dimensionEdit={element:el,key,polygonIndex};
      this.dimensionEditorInput.value=label;
      const isEdge=this._getDimensionSegments(el).some(segment=>segment.key===key);
      this.dimensionEditorApplyButton.disabled=!isEdge;
      this.dimensionEditorApplyButton.title=isEdge
        ?'Apply the numeric value as a length to the sketch'
        :'Length can only be applied to a polygon edge';
      this.dimensionEditor.hidden=false;
      this.dimensionEditorInput.focus();
      this.dimensionEditorInput.select();
    }

    _cancelDimensionEdit() {
      if(this.dimensionEditor)this.dimensionEditor.hidden=true;
      this.dimensionEdit=null;
    }

    _saveDimensionEdit() {
      const edit=this.dimensionEdit,el=edit?.element;
      const poly=el?.polygonsRef?.[edit.polygonIndex];
      if(!poly)return this._cancelDimensionEdit();
      const label=this.dimensionEditorInput.value.trim();
      if(!poly.dimensionLabels)poly.dimensionLabels={};
      if(label)poly.dimensionLabels[edit.key]=label;
      else delete poly.dimensionLabels[edit.key];
      this._regenSketch(el);
      this._commitHistory('dimension-label');
      this._cancelDimensionEdit();
    }

    _applyEditedDimensionLength() {
      const edit=this.dimensionEdit,el=edit?.element;
      if(!el||this.dimensionEditorApplyButton.disabled)return;
      const input=this.dimensionEditorInput.value.trim().replace(/,/g,'');
      const parsed=input.match(/^([+-]?(?:\d+\.?\d*|\.\d+))\s*(km|m|cm|mm|ft|feet|yd|mi)?$/i);
      if(!parsed)return Utils.showToast('Enter a numeric length with an optional unit (m, km, ft, yd, mi)');
      const factors={km:1000,m:1,cm:0.01,mm:0.001,ft:0.3048,feet:0.3048,yd:0.9144,mi:1609.344};
      const target=Number(parsed[1])*(factors[(parsed[2]||'m').toLowerCase()]||1);
      if(!Number.isFinite(target)||target<=0)return Utils.showToast('Enter a length greater than zero');
      const segment=this._getDimensionSegments(el).find(item=>item.key===edit.key);
      if(!segment)return Utils.showToast('Only polygon edge dimensions can change sketch geometry');
      if(segment.length<1e-8)return Utils.showToast('Cannot resize a zero-length edge');
      const ring=segment.ring;
      const closed=ring.length>3&&ring[0][0]===ring[ring.length-1][0]&&ring[0][1]===ring[ring.length-1][1];
      const count=ring.length-(closed?1:0),endIndex=(segment.index+1)%count;
      const start=segment.a,end=segment.b;
      const coordinateLength=Math.hypot(end[0]-start[0],end[1]-start[1]);
      const targetCoordinateLength=Projection.coordinateDistance(target,start);
      const factor=targetCoordinateLength/coordinateLength;
      const updated=[start[0]+(end[0]-start[0])*factor,start[1]+(end[1]-start[1])*factor];
      ring[endIndex]=updated;
      if(closed&&endIndex===0)ring[ring.length-1]=updated.slice();
      if(segment.poly.dimensionLabels)delete segment.poly.dimensionLabels[segment.key];
      delete segment.poly.triangulationDiagonals;
      this._syncSketchCoordinates(segment.poly,segment.ringIndex);
      this._cancelDimensionEdit();
      this._commitGeometryChange(el,'dimension-length');
      Utils.showToast(`Edge changed to ${UNITS.formatLength(target,'m')}`);
    }

    _triangulateSketch() {
      const el=this.selectedElement;
      if(el?.type!=='sketch')return Utils.showToast('Select a sketch element first');
      const polygons=el.polygonsRef||[];
      if(polygons.some(poly=>poly.triangulationDiagonals?.length)){
        polygons.forEach(poly=>delete poly.triangulationDiagonals);
        this._regenSketch(el);
        this._commitHistory('remove-triangulation');
        this._updateCADPanel();
        Utils.showToast('Triangulation diagonals removed');
        return;
      }
      let triangulated=0,skipped=0;
      for(const poly of polygons){
        if(poly.geometryType==='LineString'||poly.geometryType==='Point')continue;
        const rings=poly.coordsProj||poly.coords||[];
        const diagonals=[];
        rings.forEach(ring=>{
          const closed=ring.length>3&&ring[0][0]===ring[ring.length-1][0]&&ring[0][1]===ring[ring.length-1][1];
          const points=ring.slice(0,ring.length-(closed?1:0));
          const ringDiagonals=this._triangulateRing(points);
          if(ringDiagonals)diagonals.push(...ringDiagonals);
        });
        if(!diagonals.length){skipped++;continue;}
        poly.triangulationDiagonals=diagonals;
        triangulated++;
      }
      if(!triangulated)return Utils.showToast('No polygon triangles could be drawn');
      this._regenSketch(el);
      this._commitHistory('triangulate');
      this._updateCADPanel();
      Utils.showToast(`Triangulated ${triangulated} polygon${triangulated===1?'':'s'}${skipped?`; skipped ${skipped} unsupported`:''}`);
    }

    _triangulateRing(points) {
      if(points.length<4)return [];
      const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
      let area=0;
      points.forEach((point,index)=>{const next=points[(index+1)%points.length];area+=point[0]*next[1]-next[0]*point[1];});
      const orientation=area>=0?1:-1,vertices=points.map((_,index)=>index),triangles=[];
      const inside=(p,a,b,c)=>{
        const e=1e-9;
        return cross(a,b,p)*orientation>=-e&&cross(b,c,p)*orientation>=-e&&cross(c,a,p)*orientation>=-e;
      };
      let guard=vertices.length*vertices.length;
      while(vertices.length>3&&guard-->0){
        let bestEar=null,bestFallback=null;
        for(let i=0;i<vertices.length;i++){
          const prev=vertices[(i+vertices.length-1)%vertices.length],curr=vertices[i],next=vertices[(i+1)%vertices.length];
          const signedArea=cross(points[prev],points[curr],points[next]);
          const triangleArea=signedArea*orientation;
          if(Math.abs(signedArea)>1e-10&&(!bestFallback||Math.abs(signedArea)>bestFallback.area)) {
            bestFallback={position:i,prev,curr,next,area:Math.abs(signedArea)};
          }
          if(triangleArea<=1e-10)continue;
          if(vertices.some(index=>index!==prev&&index!==curr&&index!==next&&inside(points[index],points[prev],points[curr],points[next])))continue;
          if(!bestEar||triangleArea>bestEar.area)bestEar={position:i,prev,curr,next,area:triangleArea};
        }
        const triangle=bestEar||bestFallback;
        if(!triangle)break;
        triangles.push([triangle.prev,triangle.curr,triangle.next]);
        vertices.splice(triangle.position,1);
      }
      if(vertices.length===3&&Math.abs(cross(points[vertices[0]],points[vertices[1]],points[vertices[2]]))>1e-10) {
        triangles.push(vertices.slice());
      }
      if(!triangles.length)return null;
      const boundary=new Set(points.map((_,index)=>`${Math.min(index,(index+1)%points.length)}:${Math.max(index,(index+1)%points.length)}`));
      const diagonalMap=new Map();
      triangles.forEach(triangle=>{
        for(let i=0;i<3;i++){
          const a=triangle[i],b=triangle[(i+1)%3],key=`${Math.min(a,b)}:${Math.max(a,b)}`;
          if(!boundary.has(key))diagonalMap.set(key,[points[a].slice(),points[b].slice()]);
        }
      });
      return [...diagonalMap.values()];
    }

    _elementLocalFromCanvasPos(el,pos) {
      const pageX=pos.x/this.scale,pageY=pos.y/this.scale;
      const rotation=-(Number(el.rotation)||0)*Math.PI/180;
      const dx=pageX-(el.x+el.width/2),dy=pageY-(el.y+el.height/2);
      return [
        dx*Math.cos(rotation)-dy*Math.sin(rotation)+el.width/2,
        dx*Math.sin(rotation)+dy*Math.cos(rotation)+el.height/2
      ];
    }

    _sketchDimensionNodes(el,polygonIndex,key) {
      const poly=(el.polygonsRef||[])[polygonIndex];
      if(!poly)return null;
      if(poly.dimensionNodes?.[key])return poly.dimensionNodes[key];
      if(key.startsWith('manual:')) {
        const dimension=poly.extraDimensions?.find(item=>item.id===key.slice(7));
        return dimension?[dimension.a,dimension.b]:null;
      }
      if(key.startsWith('diag:'))return poly.triangulationDiagonals?.[Number(key.slice(5))]||null;
      const [featureIndex,ringIndex,edgeIndex]=key.split(':').map(Number);
      if(featureIndex!==polygonIndex)return null;
      const ring=(poly.coordsProj||poly.coords||[])[ringIndex];
      if(!ring)return null;
      const closed=ring.length>3&&ring[0][0]===ring[ring.length-1][0]&&ring[0][1]===ring[ring.length-1][1];
      const count=ring.length-(closed?1:0);
      return edgeIndex>=0&&edgeIndex<count?[ring[edgeIndex],ring[(edgeIndex+1)%count]]:null;
    }

    _setSketchDimensionNode(el,polygonIndex,key,nodeIndex,coordinate) {
      const poly=(el.polygonsRef||[])[polygonIndex],nodes=this._sketchDimensionNodes(el,polygonIndex,key);
      if(!poly||!nodes||!coordinate?.every(Number.isFinite))return;
      const copy=nodes.map(point=>point.slice());
      copy[nodeIndex]=coordinate.slice();
      if(!poly.dimensionNodes)poly.dimensionNodes={};
      poly.dimensionNodes[key]=copy;
      this._moveSketchDimensionHandle(el,polygonIndex,key,nodeIndex,coordinate);
    }

    _moveSketchDimensionHandle(el,polygonIndex,key,nodeIndex,coordinate) {
      const transform=this._getSketchTransform(el);
      if(!transform)return;
      const [x,y]=this._sketchCoordinateToLocal(coordinate,transform);
      const wrapper=this.canvas.querySelector(`[data-el-id="${el.id}"]`);
      wrapper?.querySelectorAll('[data-prt-dimension-node]').forEach(handle=>{
        if(handle.dataset.prtDimensionKey!==key||Number(handle.dataset.prtPolygon)!==polygonIndex||
          handle.dataset.prtDimensionNode!==(nodeIndex?'b':'a'))return;
        handle.setAttribute('cx',String(x));
        handle.setAttribute('cy',String(y));
      });
    }

    _addManualSketchDimension(el,a,b) {
      if(Math.hypot(b[0]-a[0],b[1]-a[1])<1e-8)return Utils.showToast('Dimension points must be different');
      const poly=(el.polygonsRef||[]).find(item=>item.geometryType!=='LineString'&&item.geometryType!=='Point');
      if(!poly)return Utils.showToast('No polygon is available for this dimension');
      if(!Array.isArray(poly.extraDimensions))poly.extraDimensions=[];
      poly.extraDimensions.push({id:Utils.uid(),a:a.slice(),b:b.slice()});
      this.sketchDraft=null;
      this.sketchEditMode=null;
      this.vertexEditElementId=null;
      this._regenSketch(el);
      this._updateCADPanel();
      this._commitHistory('dimension-add');
    }

    _deleteSketchDimension(el,polygonIndex,key) {
      const poly=(el.polygonsRef||[])[polygonIndex];
      if(!poly||!key)return;
      if(key.startsWith('manual:')) {
        const id=key.slice(7);
        const dimensions=poly.extraDimensions||[];
        const index=dimensions.findIndex(dimension=>dimension.id===id);
        if(index<0)return;
        dimensions.splice(index,1);
      } else {
        if(!Array.isArray(poly.hiddenDimensions))poly.hiddenDimensions=[];
        if(!poly.hiddenDimensions.includes(key))poly.hiddenDimensions.push(key);
      }
      if(poly.dimensionNodes)delete poly.dimensionNodes[key];
      if(poly.dimensionOffsets)delete poly.dimensionOffsets[key];
      if(poly.dimensionLabels)delete poly.dimensionLabels[key];
      this._regenSketch(el);
      this._commitHistory('dimension-delete');
    }

    _refreshPluginTools() { if (this.toolsPanel) this._buildToolsPanel(); }

    _refreshPageSelect() {
      if (!this.pageSelect) return;
      this.pageSelect.innerHTML = '';
      this.pages.forEach((_, i) => {
        const opt = Utils.createElement('option', { value: String(i), textContent: `Page ${i+1}` });
        if (i === this.currentPageIndex) opt.selected = true;
        this.pageSelect.appendChild(opt);
      });
    }

    _switchPage(i) {
      i = Math.max(0, Math.min(this.pages.length-1, i));
      if (i === this.currentPageIndex) return;
      this.currentPageIndex = i;
      this._refreshPageSelect();
      this._selectElement(null);
      this._renderAll();
      this._buildLayerManager();
      this._commitHistoryNow('switch-page');
    }

    _addNewPage() {
      this.pages.push({ elements: [] });
      this.currentPageIndex = this.pages.length - 1;
      this._refreshPageSelect();
      this._addDefaultElementsToCurrentPage(this.sketchSVG, this.polygonsData);
      this._renderAll();
      this._commitHistoryNow('new-page');
      Utils.showToast('New page added');
    }

    _deleteCurrentPage() {
      if (this.pages.length <= 1) return Utils.showToast('At least one page required');
      this.pages.splice(this.currentPageIndex, 1);
      this.currentPageIndex = Math.max(0, this.currentPageIndex - 1);
      this._refreshPageSelect();
      this._selectElement(null);
      this._renderAll();
      this._commitHistoryNow('delete-page');
      Utils.showToast('Page deleted');
    }

    _addDefaultElementsToCurrentPage(sketchSVG, polygonsData) {
      const pW = Utils.mm2px(this.pageDims.w);
      const pH = Utils.mm2px(this.pageDims.h);
      this._addElement({ type:'rect', name:'Border', x:10, y:10, width:pW-20, height:pH-20, strokeColor:'#111827', strokeWidth:2, fillColor:'transparent' });
      this._addElement({ type:'text', name:'Title', x:20, y:15, width:pW-40, height:32, text:'LPM SKETCH REPORT', fontSize:22, fontWeight:'bold', textAlign:'center', color:'#111827' });
      this._addElement({ type:'text', name:'Date', x:20, y:45, width:pW-40, height:18, text:'Generated on ' + new Date().toLocaleDateString('en-IN'), fontSize:11, fontWeight:'normal', textAlign:'center', color:'#64748b' });

      const sketchH = Math.min(pH*0.55, pW*0.7);
      this._addElement({
        type:'sketch', name:'Sketch', x:30, y:70, width:pW-60, height:sketchH,
        svgContent: sketchSVG,
        polygonsRef: polygonsData,
        sketchOptions: { showDimensions:true, showVertices:true, showNorth:true, showScale:true, showLabels:true,
                        strokeWidth:1.5, strokeDash:'solid', fillOpacity:0.08, dimStyle:'arrows',
                        lengthUnit:'auto', areaUnit:'auto', dimFontSize:10, labelFontSize:12,
                        vertexSize:2.4, vertexShape:'circle' }
      });

      this._addElement({ type:'line', name:'Divider', x:20, y:70+sketchH+10, width:pW-40, height:10, strokeColor:'#cbd5e1', strokeWidth:2, rotation:0 });
      this._addDefaultDetailsText(70+sketchH+20, polygonsData);
    }

    _addDefaultDetailsText(customY, polygonsData) {
      if (!polygonsData?.length) return;
      const pW = Utils.mm2px(this.pageDims.w);
      const pH = Utils.mm2px(this.pageDims.h);
      const y = customY ?? (pH-220);
      const allKeys = this._collectAttrKeys(polygonsData);
      const defaultSelection = allKeys.map(k => ({ key: k, label: k, visible: true }));

      this._addElement({
        type:'text', name:'Plot Details',
        x:30, y, width:pW-60, height:Math.max(160, pH-y-30),
        text: this._buildDetailsText(polygonsData, defaultSelection),
        fontSize:11, fontWeight:'normal', textAlign:'left', color:'#111827',
        binding:'plotDetails',
        detailsConfig: defaultSelection,
        polygonsRef: polygonsData
      });
    }

    _collectAttrKeys(polygonsData) {
      const keys = new Set();
      polygonsData.forEach(p => {
        Object.keys(p.properties || {}).forEach(k => {
          if (k === 'geometry') return;
          const v = p.properties[k];
          if (v == null || typeof v === 'object') return;
          keys.add(k);
        });
      });
      return [...keys];
    }

    _buildDetailsText(polygonsData, config) {
      if (!polygonsData?.length) return 'PLOT DETAILS\n(no data)';
      let text = 'PLOT DETAILS\n';
      polygonsData.forEach((poly, i) => {
        if (polygonsData.length > 1) text += `\n--- PLOT ${i+1} ---\n`;
        config.filter(c => c.visible).forEach(c => {
          const v = poly.properties?.[c.key];
          if (v == null) return;
          text += `${c.label}: ${v}\n`;
        });
      });
      return text.trim();
    }

    _addElement(data) {
      const el = { id:Utils.uid(), name:data.name||data.type, rotation:data.rotation||0, visible:data.visible??true, locked:data.locked??false, ...data };
      this.elements.push(el);
      this._renderElement(el);
      this._buildLayerManager();
      return el;
    }

    _renderAll() {
      this.canvas.querySelectorAll('.prt-canvas-element').forEach(e => e.remove());
      this.elements.forEach(el => this._renderElement(el));
    }

    _renderElement(el) {
      const old = this.canvas.querySelector(`[data-el-id="${el.id}"]`);
      if (old) old.remove();
      if (!el.visible) return;

      const s = this.scale;
      const wrapper = Utils.createElement('div', {
        className: 'prt-canvas-element' + (this.selectedElement?.id === el.id ? ' selected' : ''),
        'data-el-id': el.id,
        style: {
          left: (el.x*s)+'px', top:(el.y*s)+'px',
          width:(el.width*s)+'px', height:(Math.max(el.height,4)*s)+'px',
          transform:(el.type==='line'||el.type==='arrow')?'none':`rotate(${el.rotation||0}deg)`,
          pointerEvents: el.locked ? 'none' : 'auto'
        }
      });

      ['nw','ne','sw','se'].forEach(pos => wrapper.appendChild(Utils.createElement('div', { className:`prt-resize-handle ${pos}`, 'data-handle': pos })));
      wrapper.appendChild(Utils.createElement('div', { className:'prt-rotation-line' }));
      wrapper.appendChild(Utils.createElement('div', { className:'prt-rotation-handle', 'data-rotate-drag':'true' }));

      // Try plugin renderer first
      const plugin = PluginRegistry.getByElementType(el.type);
      if (plugin?.renderDOM) {
        try {
          const content = plugin.renderDOM(el, s);
          if (content) wrapper.appendChild(content);
        } catch(e) { console.error('[PRT] Plugin renderDOM error:', e); }
      } else {
        // Built-in renderers
        if (el.type === 'text') {
          wrapper.appendChild(Utils.createElement('div', {
            className: 'prt-text-element', textContent: el.text || '',
            style: { fontSize:(el.fontSize||14)*s+'px', fontWeight:el.fontWeight||'normal', textAlign:el.textAlign||'left', color:el.color||'#111827' }
          }));
          wrapper.addEventListener('dblclick', () => { if (!el.locked) this._openTextEditModal(el); });
        }
        if (el.type === 'line' || el.type === 'arrow') {
          const stroke = el.strokeColor || '#111827';
          const sw = (el.strokeWidth||2) * s;
          const marker = el.type === 'arrow'
            ? `<marker id="m_${el.id}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><polygon points="0,0 8,4 0,8" fill="${stroke}"/></marker>` : '';
          wrapper.dataset.lineShape = 'true';
          const w = Math.max(4, el.width) * s, h = Math.max(4, el.height) * s;
          const x1 = Math.abs(el.lineDX || 0) < 0.001 ? w/2 : (el.lineDX < 0 ? w : 0);
          const x2 = Math.abs(el.lineDX || 0) < 0.001 ? w/2 : (el.lineDX < 0 ? 0 : w);
          const y1 = (el.lineDY || 0) < 0 ? h : (Math.abs(el.lineDY || 0) < 0.001 ? h/2 : 0);
          const y2 = (el.lineDY || 0) < 0 ? 0 : (Math.abs(el.lineDY || 0) < 0.001 ? h/2 : h);
          wrapper.appendChild(Utils.createElement('div', {
            className:'prt-line-element',
            innerHTML:`<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="overflow:visible"><defs>${marker}</defs><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" vector-effect="non-scaling-stroke" ${el.type==='arrow'?`marker-end="url(#m_${el.id})"`:''}/></svg>`
          }));
        }
        if (el.type === 'rect') {
          wrapper.appendChild(Utils.createElement('div', {
            className:'prt-rect-element',
            style:{ border:`${(el.strokeWidth||2)*s}px solid ${el.strokeColor||'#111827'}`, background: el.fillColor||'transparent' }
          }));
        }
        if (el.type === 'sketch') {
          const sketchDiv = Utils.createElement('div', { className:'prt-sketch-element', innerHTML: el.svgContent||'' });
          const svg = sketchDiv.querySelector('svg');
          if (svg) {
            svg.setAttribute('width','100%'); svg.setAttribute('height','100%');
            if (this.vertexEditElementId === el.id) this._appendSketchVertexHandles(svg, el);
          else this._appendCADVertexSelection(svg,el);
          if (this.sketchDraft?.element?.id === el.id) this._appendSketchDraft(svg, el);
          }
          wrapper.appendChild(sketchDiv);
        }
        if (el.type === 'qr') {
          const qrDiv = Utils.createElement('div', { className:'prt-qr-element' });
          if (el.qrDataUrl) qrDiv.appendChild(Utils.createElement('img', { src: el.qrDataUrl }));
          wrapper.appendChild(qrDiv);
        }
      }

      this.canvas.appendChild(wrapper);
    }

    _selectElement(el) {
      if(this.dimensionEdit?.element?.id!==el?.id)this._cancelDimensionEdit();
      if(this.selectedElement?.id!==el?.id)this.selectedVertex=null;
      if (this.vertexEditElementId && el?.id !== this.vertexEditElementId) {
        this.canvas.querySelectorAll(`[data-el-id="${this.vertexEditElementId}"] .prt-sketch-edit-handle`).forEach(handle => handle.remove());
        this.vertexEditElementId = null;
        this.sketchEditMode = null;
        this.sketchDraft = null;
      }
      this.canvas.querySelectorAll('.prt-canvas-element.selected').forEach(e => e.classList.remove('selected'));
      this.selectedElement = el;
      if (el) {
        this.canvas.querySelector(`[data-el-id="${el.id}"]`)?.classList.add('selected');
        this._showProperties(el, this.propsExpanded);
      } else { this._hideProperties(); }
      this._buildLayerManager();
      this._updateCADPanel();
    }

    // ---------- Properties Panel (collapsible sections, sliders, swatches) ----------
    _showProperties(el, expand = this.propsExpanded) {
      this.propsPanel.innerHTML = '';
      this.propsPanel.classList.add('visible');
      this.propsPanel.classList.toggle('minimized', this.propsMinimized);
      this._setPropertiesExpanded(expand);

      const header = Utils.createElement('div', { className: 'prt-props-header' });
      header.appendChild(Utils.createElement('strong', { textContent: el.name || el.type, style:{fontSize:'13px'} }));
      const btnRow = Utils.createElement('div', { style:{ display:'flex', gap:'4px' } });
      btnRow.appendChild(Utils.createElement('button', { className:'prt-props-min-btn', textContent: this.propsMinimized?'▢':'—', onClick:() => { this.propsMinimized = !this.propsMinimized; this._showProperties(el); } }));
      btnRow.appendChild(Utils.createElement('button', { className:'prt-props-min-btn', textContent:'✕', onClick:() => this._selectElement(null) }));
      header.appendChild(btnRow);
      this.propsPanel.appendChild(header);

      const body = Utils.createElement('div', { className: 'prt-props-body' });
      this.propsPanel.appendChild(body);

      // Section: Position & Size
      this._addPropsSection(body, 'Position & Size', (content) => {
        this._addNumRow(content, 'X', Math.round(el.x), v => { el.x = v; this._renderElement(el); this._commitHistory('prop'); });
        this._addNumRow(content, 'Y', Math.round(el.y), v => { el.y = v; this._renderElement(el); this._commitHistory('prop'); });
        this._addNumRow(content, 'Width',  Math.round(el.width),  v => { el.width = v;  if (el.type==='sketch') this._regenSketch(el); this._renderElement(el); this._commitHistory('prop'); });
        this._addNumRow(content, 'Height', Math.round(el.height), v => { el.height = v; if (el.type==='sketch') this._regenSketch(el); this._renderElement(el); this._commitHistory('prop'); });
        this._addSliderRow(content, 'Rotation', el.rotation||0, -180, 180, 1, v => { el.rotation = v; this._renderElement(el); this._commitHistory('prop'); }, '°');
      });

      // Section: Visibility
      this._addPropsSection(body, 'Visibility & Lock', (content) => {
        this._addSelectRow(content, 'Visible', el.visible?'1':'0', [['1','Yes'],['0','No']], v => { el.visible = v==='1'; this._renderAll(); this._commitHistory('vis'); });
        this._addSelectRow(content, 'Locked', el.locked?'1':'0', [['0','No'],['1','Yes']], v => { el.locked = v==='1'; this._renderAll(); this._commitHistory('lock'); });
      });

      // Section: Appearance (type-specific)
      if (el.type === 'text') {
        this._addPropsSection(body, 'Text Appearance', (content) => {
          this._addSliderRow(content, 'Font Size', el.fontSize||14, 6, 72, 1, v => { el.fontSize = v; this._renderElement(el); this._commitHistory('prop'); }, 'px');
          this._addColorRow(content, 'Color', el.color||'#111827', v => { el.color = v; this._renderElement(el); this._commitHistory('prop'); });
          this._addSelectRow(content, 'Align', el.textAlign||'left', [['left','Left'],['center','Center'],['right','Right']], v => { el.textAlign = v; this._renderElement(el); this._commitHistory('prop'); });
          this._addSelectRow(content, 'Weight', el.fontWeight||'normal', [['normal','Normal'],['bold','Bold']], v => { el.fontWeight = v; this._renderElement(el); this._commitHistory('prop'); });
          content.appendChild(Utils.createElement('button', { className:'prt-btn prt-btn-primary prt-btn-sm prt-btn-block', textContent:'Edit Text', style:{marginTop:'8px'}, onClick:() => this._openTextEditModal(el) }));
          if (el.binding === 'plotDetails') {
            content.appendChild(Utils.createElement('button', { className:'prt-btn prt-btn-outline prt-btn-sm prt-btn-block', textContent:'Configure Attributes', style:{marginTop:'6px'}, onClick:() => this._openDetailsConfigModal(el) }));
          }
        });
      }

      if (el.type === 'line' || el.type === 'arrow' || el.type === 'rect') {
        this._addPropsSection(body, 'Stroke', (content) => {
          this._addColorRow(content, 'Color', el.strokeColor||'#111827', v => { el.strokeColor = v; this._renderElement(el); this._commitHistory('prop'); });
          this._addSliderRow(content, 'Width', el.strokeWidth||2, 0.5, 20, 0.5, v => { el.strokeWidth = v; this._renderElement(el); this._commitHistory('prop'); }, 'px');
        });
      }
      if (el.type === 'rect') {
        this._addPropsSection(body, 'Fill', (content) => {
          const curFill = (el.fillColor && el.fillColor !== 'transparent') ? el.fillColor : '#ffffff';
          this._addColorRow(content, 'Color', curFill, v => { el.fillColor = v; this._renderElement(el); this._commitHistory('prop'); });
          this._addSelectRow(content, 'Mode', el.fillColor==='transparent'?'1':'0', [['0','Filled'],['1','Transparent']], v => { el.fillColor = (v==='1') ? 'transparent' : curFill; this._renderElement(el); this._commitHistory('prop'); });
        });
      }

      if (el.type === 'sketch') {
        this._buildSketchProperties(body, el);
      }

      // Plugin properties
      const plugin = PluginRegistry.getByElementType(el.type);
      if (plugin?.properties) {
        try { plugin.properties(el, body, this); } catch(e) { console.error('[PRT] Plugin properties error:', e); }
      }

      // Section: Delete
      const delSection = Utils.createElement('div', { className:'prt-props-section' });
      const delContent = Utils.createElement('div', { className:'prt-props-section-content' });
      delContent.appendChild(Utils.createElement('button', {
        className:'prt-btn prt-btn-danger prt-btn-sm prt-btn-block',
        textContent:'Delete Element', onClick:() => this._deleteSelected()
      }));
      delSection.appendChild(delContent);
      body.appendChild(delSection);
    }

    _buildSketchProperties(body, el) {
      const opts = el.sketchOptions || (el.sketchOptions = {});
      const regen = () => { this._regenSketch(el); this._renderElement(el); this._commitHistory('sketch-opt'); };

      this._addPropsSection(body, 'Sketch — Visibility', (content) => {
        const mk = (label, key) => this._addSelectRow(content, label, (opts[key]??true)?'1':'0', [['1','Show'],['0','Hide']], v => { opts[key] = v==='1'; regen(); });
        mk('Dimensions', 'showDimensions');
        mk('Vertices', 'showVertices');
        mk('North', 'showNorth');
        mk('Scale', 'showScale');
        mk('Labels', 'showLabels');
      });

      this._addPropsSection(body, 'Sketch — Boundary', (content) => {
        this._addColorRow(content, 'Stroke', opts.strokeColor||'#2563eb', v => { opts.strokeColor = v; regen(); });
        this._addSliderRow(content, 'Width', opts.strokeWidth||1.5, 0.2, 6, 0.1, v => { opts.strokeWidth = v; regen(); }, 'px');
        this._addSelectRow(content, 'Dash', opts.strokeDash||'solid', [['solid','Solid'],['dashed','Dashed'],['dotted','Dotted'],['dashdot','Dash-Dot']], v => { opts.strokeDash = v; regen(); });
      });

      this._addPropsSection(body, 'Sketch — Fill', (content) => {
        this._addColorRow(content, 'Color', opts.fillColor||'#2563eb', v => { opts.fillColor = v; regen(); });
        this._addSliderRow(content, 'Opacity', (opts.fillOpacity??0.08)*100, 0, 100, 1, v => { opts.fillOpacity = v/100; regen(); }, '%');
      });

      this._addPropsSection(body, 'Sketch — Dimensions', (content) => {
        this._addSelectRow(content, 'Style', opts.dimStyle||'arrows', [['arrows','Arrows'],['ticks','Ticks'],['text','Text only'],['none','None']], v => { opts.dimStyle = v; regen(); });
        this._addSelectRow(content, 'Length Unit', opts.lengthUnit||'auto', [['auto','Auto'],['m','Meters'],['km','Kilometers'],['ft','Feet'],['yd','Yards'],['mi','Miles']], v => { opts.lengthUnit = v; regen(); });
        this._addSelectRow(content, 'Area Unit', opts.areaUnit||'auto', [['auto','Auto'],['m2','m²'],['km2','km²'],['ha','Hectares'],['acre','Acres'],['ft2','ft²'],['yd2','yd²']], v => { opts.areaUnit = v; regen(); });
        this._addSliderRow(content, 'Font Size', opts.dimFontSize||10, 6, 24, 1, v => { opts.dimFontSize = v; regen(); }, 'px');
        this._addColorRow(content, 'Text Color', opts.dimColor||'#1e293b', v => { opts.dimColor = v; regen(); });
        this._addColorRow(content, 'Label Fill', opts.dimBackground||'#ffffff', v => { opts.dimBackground = v; regen(); });
      });

      this._addPropsSection(body, 'Sketch — Labels', (content) => {
        this._addSliderRow(content, 'Font Size', opts.labelFontSize||12, 6, 32, 1, v => { opts.labelFontSize = v; regen(); }, 'px');
        this._addColorRow(content, 'Text Color', opts.labelColor||'#334155', v => { opts.labelColor = v; regen(); });
        this._addSelectRow(content, 'Weight', opts.labelWeight||'normal', [['normal','Normal'],['bold','Bold']], v => { opts.labelWeight = v; regen(); });
        content.appendChild(Utils.createElement('button', {
          className:'prt-btn prt-btn-outline prt-btn-sm prt-btn-block',
          textContent:'Configure Label Fields', style:{marginTop:'6px'},
          onClick:() => this._openLabelFieldsModal(el)
        }));
      });

      const labelPolygons=(el.polygonsRef||[]).filter(poly=>poly.geometryType!=='LineString'&&poly.geometryType!=='Point');
      if(labelPolygons.length) {
        this._addPropsSection(body,'Sketch — Plot labels',(content)=>{
          content.appendChild(Utils.createElement('p',{
            textContent:'Edit the text shown inside each polygon.',
            style:{margin:'0 0 8px',fontSize:'12px',color:'#64748b'}
          }));
          labelPolygons.forEach(poly=>{
            const polygonIndex=(el.polygonsRef||[]).indexOf(poly);
            const fallback=poly.properties?.name||poly.properties?.id||poly.properties?.OBJECTID||`Plot ${polygonIndex+1}`;
            const row=Utils.createElement('div',{className:'prt-props-row'});
            row.appendChild(Utils.createElement('label',{textContent:`Plot ${polygonIndex+1}`}));
            const input=Utils.createElement('input',{
              type:'text',
              value:String(poly.label??fallback),
              'aria-label':`Label for plot ${polygonIndex+1}`
            });
            input.addEventListener('input',()=>{
              if(input.value.trim())poly.label=input.value;
              else delete poly.label;
              this._regenSketch(el);
            });
            input.addEventListener('change',()=>this._commitHistory('plot-label'));
            row.appendChild(input);
            content.appendChild(row);
          });
        });
      }

      this._addPropsSection(body, 'Sketch — Vertices', (content) => {
        this._addSliderRow(content, 'Size', opts.vertexSize||2.4, 0.5, 10, 0.1, v => { opts.vertexSize = v; regen(); }, 'px');
        this._addSelectRow(content, 'Shape', opts.vertexShape||'circle', [['circle','Circle'],['square','Square'],['cross','Cross'],['triangle','Triangle']], v => { opts.vertexShape = v; regen(); });
        this._addColorRow(content, 'Color', opts.vertexColor||'#2563eb', v => { opts.vertexColor = v; regen(); });
      });
    }

    _openLabelFieldsModal(el) {
      const polys = el.polygonsRef || this.polygonsData || [];
      const keys = this._collectAttrKeys(polys);
      const currentFields = el.sketchOptions?.labelFields || null;

      const backdrop = Utils.createElement('div', { className: 'prt-modal-backdrop' });
      const modal = Utils.createElement('div', { className: 'prt-modal' });
      const header = Utils.createElement('div', { className: 'prt-modal-header' });
      header.appendChild(Utils.createElement('h3', { textContent: 'Label Fields' }));
      header.appendChild(Utils.createElement('button', { className: 'prt-panel-close', textContent:'✕', onClick:() => backdrop.remove() }));
      modal.appendChild(header);

      const body = Utils.createElement('div', { className: 'prt-modal-body' });
      body.appendChild(Utils.createElement('p', { textContent:'Select which fields to display inside each polygon:', style:{fontSize:'13px', color:'#64748b'} }));

      const group = Utils.createElement('div', { className: 'prt-checkbox-group' });
      const options = [{key:'__area__', label:'(Area)'}, ...keys.map(k => ({key:k, label:k}))];
      options.forEach(o => {
        const item = Utils.createElement('div', { className: 'prt-checkbox-item' });
        const cb = Utils.createElement('input', { type:'checkbox' });
        if (currentFields) cb.checked = currentFields.includes(o.key); else cb.checked = (o.key === '__area__');
        cb.dataset.key = o.key;
        item.append(cb, Utils.createElement('label', { textContent: o.label }));
        group.appendChild(item);
      });
      body.appendChild(group);
      modal.appendChild(body);

      const footer = Utils.createElement('div', { className: 'prt-modal-footer' });
      footer.appendChild(Utils.createElement('button', { className:'prt-btn prt-btn-outline', textContent:'Cancel', onClick:() => backdrop.remove() }));
      footer.appendChild(Utils.createElement('button', {
        className:'prt-btn prt-btn-primary', textContent:'Apply',
        onClick:() => {
          const selected = Array.from(group.querySelectorAll('input:checked')).map(cb => cb.dataset.key);
          el.sketchOptions.labelFields = selected;
          this._regenSketch(el); this._renderElement(el); this._commitHistory('label-fields');
          backdrop.remove();
        }
      }));
      modal.appendChild(footer);
      backdrop.appendChild(modal);
      document.body.appendChild(backdrop);
    }

    // Property widgets
    _addPropsSection(parent, title, builder) {
      const section = Utils.createElement('div', { className:'prt-props-section' });
      const header = Utils.createElement('div', { className:'prt-props-section-header', textContent: title });
      header.appendChild(Utils.createElement('span', { textContent:'▾' }));
      const content = Utils.createElement('div', { className:'prt-props-section-content' });
      header.addEventListener('click', () => { section.classList.toggle('collapsed'); header.querySelector('span').textContent = section.classList.contains('collapsed') ? '▸' : '▾'; });
      section.appendChild(header);
      section.appendChild(content);
      parent.appendChild(section);
      builder(content);
    }
    _addNumRow(parent, label, value, onChange) {
      const row = Utils.createElement('div', { className:'prt-props-row' });
      row.appendChild(Utils.createElement('label', { textContent: label }));
      const i = Utils.createElement('input', { type:'number', value: String(value) });
      i.step = '1';
      i.addEventListener('change', () => onChange(+i.value));
      row.appendChild(i);
      parent.appendChild(row);
    }
    _addSliderRow(parent, label, value, min, max, step, onChange, unit = '') {
      const row = Utils.createElement('div', { className:'prt-props-row' });
      row.appendChild(Utils.createElement('label', { textContent: label }));
      const sliderWrap = Utils.createElement('div', { className:'prt-props-slider-row', style:{flex:'1'} });
      const slider = Utils.createElement('input', { type:'range', min, max, step, value });
      const span = Utils.createElement('span', { textContent: value + unit });
      slider.addEventListener('input', () => { const v = parseFloat(slider.value); span.textContent = v + unit; onChange(v); });
      sliderWrap.append(slider, span);
      row.appendChild(sliderWrap);
      parent.appendChild(row);
    }
    _addColorRow(parent, label, value, onChange) {
      const row = Utils.createElement('div', { className:'prt-props-row' });
      row.appendChild(Utils.createElement('label', { textContent: label }));
      const i = Utils.createElement('input', { type:'color', value });
      i.addEventListener('change', () => onChange(i.value));
      row.appendChild(i);
      parent.appendChild(row);
      // Swatches
      const presets = ['#000000','#374151','#2563eb','#dc2626','#16a34a','#f59e0b','#9333ea','#ffffff'];
      const sw = Utils.createElement('div', { className:'prt-swatch-row' });
      presets.forEach(c => {
        const chip = Utils.createElement('div', { className:'prt-swatch', style:{background:c} });
        chip.addEventListener('click', () => { i.value = c; onChange(c); });
        sw.appendChild(chip);
      });
      parent.appendChild(sw);
    }
    _addSelectRow(parent, label, value, options, onChange) {
      const row = Utils.createElement('div', { className:'prt-props-row' });
      row.appendChild(Utils.createElement('label', { textContent: label }));
      const sel = Utils.createElement('select');
      options.forEach(([v, l]) => sel.appendChild(Utils.createElement('option', { value: v, textContent: l })));
      sel.value = value;
      sel.addEventListener('change', () => onChange(sel.value));
      row.appendChild(sel);
      parent.appendChild(row);
    }

    _hideProperties() {
      this.propsPanel.classList.remove('visible');
      this._setPropertiesExpanded(false);
    }

    _openTextEditModal(el) {
      const backdrop = Utils.createElement('div', { className:'prt-modal-backdrop' });
      const modal = Utils.createElement('div', { className:'prt-modal' });
      const header = Utils.createElement('div', { className:'prt-modal-header' });
      header.appendChild(Utils.createElement('h3', { textContent:'Edit Text' }));
      header.appendChild(Utils.createElement('button', { className:'prt-panel-close', textContent:'✕', onClick:() => backdrop.remove() }));
      modal.appendChild(header);
      const body = Utils.createElement('div', { className:'prt-modal-body' });
      const ta = Utils.createElement('textarea', { className:'prt-textarea', rows:'10' });
      ta.value = el.text || '';
      body.appendChild(ta);
      modal.appendChild(body);
      const footer = Utils.createElement('div', { className:'prt-modal-footer' });
      footer.appendChild(Utils.createElement('button', { className:'prt-btn prt-btn-outline', textContent:'Cancel', onClick:() => backdrop.remove() }));
      footer.appendChild(Utils.createElement('button', { className:'prt-btn prt-btn-primary', textContent:'Apply', onClick:() => { el.text = ta.value; this._renderElement(el); this._commitHistory('text'); backdrop.remove(); } }));
      modal.appendChild(footer);
      backdrop.appendChild(modal);
      document.body.appendChild(backdrop);
    }

    // ---------- Details Modal (attribute picker + rename) ----------
    _openDetailsModal() {
      // Called from the "Details" toolbar button — adds a new details text block
      const polys = this.polygonsData;
      if (!polys?.length) return Utils.showToast('No polygon data');
      const allKeys = this._collectAttrKeys(polys);
      const config = allKeys.map(k => ({ key:k, label:k, visible:true }));
      this._renderDetailsPickerModal(config, polys, (finalConfig) => {
        const pW = Utils.mm2px(this.pageDims.w);
        const pH = Utils.mm2px(this.pageDims.h);
        const el = this._addElement({
          type:'text', name:'Plot Details', x:30, y:pH-220, width:pW-60, height:180,
          text: this._buildDetailsText(polys, finalConfig),
          fontSize:11, fontWeight:'normal', textAlign:'left', color:'#111827',
          binding:'plotDetails', detailsConfig: finalConfig, polygonsRef: polys
        });
        this._selectElement(el);
        this._commitHistory('add-details');
      });
    }

    _openDetailsConfigModal(el) {
      // Reconfigure existing details element
      const polys = el.polygonsRef || this.polygonsData;
      const allKeys = this._collectAttrKeys(polys);
      let config = el.detailsConfig?.slice() || allKeys.map(k => ({ key:k, label:k, visible:true }));
      // Add any newly-discovered keys
      allKeys.forEach(k => { if (!config.find(c => c.key === k)) config.push({ key:k, label:k, visible:true }); });

      this._renderDetailsPickerModal(config, polys, (finalConfig) => {
        el.detailsConfig = finalConfig;
        el.text = this._buildDetailsText(polys, finalConfig);
        this._renderElement(el);
        this._commitHistory('details-config');
      });
    }

    _renderDetailsPickerModal(config, polys, onApply) {
      const backdrop = Utils.createElement('div', { className:'prt-modal-backdrop' });
      const modal = Utils.createElement('div', { className:'prt-modal' });
      const header = Utils.createElement('div', { className:'prt-modal-header' });
      header.appendChild(Utils.createElement('h3', { textContent:'Configure Details' }));
      header.appendChild(Utils.createElement('button', { className:'prt-panel-close', textContent:'✕', onClick:() => backdrop.remove() }));
      modal.appendChild(header);
      const body = Utils.createElement('div', { className:'prt-modal-body' });

      body.appendChild(Utils.createElement('p', { textContent:'Pick which attributes to show, and optionally rename labels:', style:{fontSize:'13px', color:'#64748b', marginBottom:'10px'} }));

      // Header row
      const grid = Utils.createElement('div', { style:{display:'grid',gridTemplateColumns:'28px 1fr 1fr',gap:'6px',fontSize:'11px',fontWeight:'700',color:'#64748b',marginBottom:'6px'} });
      grid.append(Utils.createElement('span',{textContent:'✓'}), Utils.createElement('span',{textContent:'Attribute'}), Utils.createElement('span',{textContent:'Display Label'}));
      body.appendChild(grid);

      const container = Utils.createElement('div', { className:'prt-checkbox-group' });
      config.forEach((c, i) => {
        const row = Utils.createElement('div', { className:'prt-attr-row' });
        const cb = Utils.createElement('input', { type:'checkbox' });
        cb.checked = !!c.visible;
        cb.addEventListener('change', () => { config[i].visible = cb.checked; refreshPreview(); });
        const keyLabel = Utils.createElement('span', { textContent: c.key, style:{fontSize:'12px', color:'#334155'} });
        const labelInput = Utils.createElement('input', { type:'text', value: c.label });
        labelInput.addEventListener('input', () => { config[i].label = labelInput.value; refreshPreview(); });
        row.append(cb, keyLabel, labelInput);
        container.appendChild(row);
      });
      body.appendChild(container);

      body.appendChild(Utils.createElement('div', { textContent:'Preview:', style:{fontSize:'11px', fontWeight:'700', color:'#64748b', marginTop:'12px', marginBottom:'4px'} }));
      const preview = Utils.createElement('pre', { style:{background:'#f8fafc', border:'1px solid #e5e7eb', borderRadius:'8px', padding:'10px', fontSize:'11px', color:'#334155', maxHeight:'120px', overflow:'auto', whiteSpace:'pre-wrap'} });
      body.appendChild(preview);

      const refreshPreview = () => { preview.textContent = this._buildDetailsText(polys, config); };
      refreshPreview();
      modal.appendChild(body);

      const footer = Utils.createElement('div', { className:'prt-modal-footer' });
      footer.appendChild(Utils.createElement('button', { className:'prt-btn prt-btn-outline', textContent:'Select All', onClick:() => { config.forEach(c => c.visible = true); container.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = true); refreshPreview(); } }));
      footer.appendChild(Utils.createElement('button', { className:'prt-btn prt-btn-outline', textContent:'None', onClick:() => { config.forEach(c => c.visible = false); container.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = false); refreshPreview(); } }));
      footer.appendChild(Utils.createElement('button', { className:'prt-btn prt-btn-primary', textContent:'Apply', onClick:() => { onApply(config); backdrop.remove(); } }));
      modal.appendChild(footer);
      backdrop.appendChild(modal);
      document.body.appendChild(backdrop);
    }

    // ---------- Layer Manager ----------
    _toggleLayerManager() {
      this.layerManagerVisible = !this.layerManagerVisible;
      this.layerManagerEl.style.display = this.layerManagerVisible ? 'flex' : 'none';
      if (this.layerManagerVisible) this._buildLayerManager();
    }
    _buildLayerManager() {
      if (!this.layerManagerVisible) return;
      const lm = this.layerManagerEl;
      lm.innerHTML = '';
      const hdr = Utils.createElement('div', { className:'prt-lm-header' });
      hdr.appendChild(Utils.createElement('span', { textContent:`Layers (Page ${this.currentPageIndex+1})` }));
      hdr.appendChild(Utils.createElement('button', { className:'prt-lm-btn', textContent:'✕', onClick:() => this._toggleLayerManager() }));
      lm.appendChild(hdr);
      const body = Utils.createElement('div', { className:'prt-lm-body' });
      [...this.elements].reverse().forEach((el, revIdx) => {
        const actualIndex = this.elements.length-1-revIdx;
        const item = Utils.createElement('div', { className:'prt-lm-item' + (this.selectedElement?.id===el.id?' selected':''), onClick:() => this._selectElement(el) });
        item.appendChild(Utils.createElement('span', { textContent:el.name||el.type, style:{flex:'1', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'} }));
        const controls = Utils.createElement('div', { className:'prt-lm-controls' });
        controls.appendChild(Utils.createElement('button', { className:'prt-lm-btn', textContent: el.visible?'👁':'🚫', onClick:(e) => { e.stopPropagation(); el.visible = !el.visible; this._renderAll(); this._commitHistory('vis'); } }));
        controls.appendChild(Utils.createElement('button', { className:'prt-lm-btn', textContent: el.locked?'🔒':'🔓', onClick:(e) => { e.stopPropagation(); el.locked = !el.locked; this._renderAll(); this._commitHistory('lock'); } }));
        controls.appendChild(Utils.createElement('button', { className:'prt-lm-btn', textContent:'▲', onClick:(e) => { e.stopPropagation(); if (actualIndex<this.elements.length-1) { this.elements.splice(actualIndex,1); this.elements.splice(actualIndex+1,0,el); this._renderAll(); this._commitHistory('reorder'); } } }));
        controls.appendChild(Utils.createElement('button', { className:'prt-lm-btn', textContent:'▼', onClick:(e) => { e.stopPropagation(); if (actualIndex>0) { this.elements.splice(actualIndex,1); this.elements.splice(actualIndex-1,0,el); this._renderAll(); this._commitHistory('reorder'); } } }));
        item.appendChild(controls);
        body.appendChild(item);
      });
      lm.appendChild(body);
    }

    // ---------- Zoom ----------
    _fitToScreen() {
      const area = this.canvasArea;
      const aW = area.clientWidth - 40;
      const aH = area.clientHeight - 40;
      const pW = Utils.mm2px(this.pageDims.w);
      const pH = Utils.mm2px(this.pageDims.h);
      this.fitScale = Math.min(aW/pW, aH/pH, 1);
      this.zoom = 1;
      this._applyScale();
      this._renderAll();
    }
    _setZoom(z) { this.zoom = Math.max(0.2, Math.min(16, z)); this._applyScale(); this._renderAll(); }
    _applyScale() {
      const pW = Utils.mm2px(this.pageDims.w);
      const pH = Utils.mm2px(this.pageDims.h);
      this.scale = this.fitScale * this.zoom;
      this.canvas.style.width = (pW*this.scale)+'px';
      this.canvas.style.height = (pH*this.scale)+'px';
      if (this.zoomLabel) this.zoomLabel.textContent = Math.round(this.zoom*100)+'%';
    }
    _onWheel(e) { e.preventDefault(); const factor = (e.ctrlKey||e.metaKey) ? 1.05 : 1.12; this._setZoom(this.zoom * (e.deltaY>0 ? 1/factor : factor)); }
    _onPinchStart(e) {
      if(e.touches.length!==2)return;
      e.preventDefault();
      e.stopPropagation();
      this._pinchActive=true;
      this.overlay?.classList.add('prt-pinch-active');
      this._cancelActivePointerDrag();
      if(this.selectedElement?.id!==this._touchStartSelection?.id) {
        this._selectElement(this._touchStartSelection);
      }
      if(this._cadTouchDrawing)clearTimeout(this._cadTouchDrawing.timer);
      this._cadTouchDrawing=null;
      const previewElement=this._cadTouchPreview?.element;
      this._cadTouchPreview=null;
      if(previewElement)this._renderElement(previewElement);
      this._hideTouchMagnifier();
      const [t1,t2]=e.touches;
      const centerX=(t1.clientX+t2.clientX)/2,centerY=(t1.clientY+t2.clientY)/2;
      const canvasRect=this.canvas.getBoundingClientRect();
      this._pinch={
        startDist:Math.hypot(t2.clientX-t1.clientX,t2.clientY-t1.clientY),
        startZoom:this.zoom,
        startCenterX:centerX,
        startCenterY:centerY,
        focusX:(centerX-canvasRect.left)/this.scale,
        focusY:(centerY-canvasRect.top)/this.scale
      };
    }
    _onPinchMove(e) {
      if(!this._pinch||e.touches.length!==2)return;
      e.preventDefault();
      const [t1,t2]=e.touches;
      const centerX=(t1.clientX+t2.clientX)/2,centerY=(t1.clientY+t2.clientY)/2;
      const dist=Math.hypot(t2.clientX-t1.clientX,t2.clientY-t1.clientY);
      this._setZoom(this._pinch.startZoom*(dist/(this._pinch.startDist||1)));
      const canvasRect=this.canvas.getBoundingClientRect();
      const desiredLeft=centerX-this._pinch.focusX*this.scale;
      const desiredTop=centerY-this._pinch.focusY*this.scale;
      this.canvasArea.scrollLeft+=canvasRect.left-desiredLeft;
      this.canvasArea.scrollTop+=canvasRect.top-desiredTop;
    }
    _onPinchEnd(e) {
      if(e?.touches?.length===2)return;
      this._pinch=null;
    }

    _cancelActivePointerDrag() {
      const drag=this.dragState;
      if(!drag)return;
      const el=drag.element;
      if(drag.type==='sketch-vertex'&&drag.startCoordinate) {
        this._setSketchVertex(el,drag.polygonIndex,drag.ringIndex,drag.vertexIndex,drag.startCoordinate);
      } else if(drag.type==='dimension-node'&&drag.startCoordinate) {
        this._setSketchDimensionNode(el,drag.polygonIndex,drag.key,drag.nodeIndex,drag.startCoordinate);
      } else if(drag.type==='dimension') {
        const poly=el?.polygonsRef?.[drag.polygonIndex];
        if(poly) {
          if(!poly.dimensionOffsets)poly.dimensionOffsets={};
          poly.dimensionOffsets[drag.key]=drag.origOffset.slice();
          this._regenSketch(el);
        }
      } else if(drag.type==='move') {
        el.x=drag.origX;el.y=drag.origY;
      } else if(drag.type==='resize') {
        el.x=drag.origX;el.y=drag.origY;el.width=drag.origW;el.height=drag.origH;
      } else if(drag.type==='rotate') {
        el.rotation=drag.startRotation;
      }
      this.dragState=null;
      if(el)this._renderElement(el);
    }

    // ---------- Tools ----------
    _toggleTools() { this.toolsCollapsed = !this.toolsCollapsed; this.toolsPanel.classList.toggle('collapsed', this.toolsCollapsed); this._updatePanelButtons(); }
    _toggleProperties() {
      this._setPropertiesExpanded(!this.propsExpanded);
    }
    _setPropertiesExpanded(expanded) {
      this.propsExpanded=expanded;
      if (this.propsPanel) {
        this.propsPanel.classList.toggle('expanded',expanded);
        const width=expanded ? (window.innerWidth<=768 ? Math.min(320,window.innerWidth*0.88) : 300) : 0;
        this.propsPanel.style.width=`${width}px`;
        this.propsPanel.style.maxWidth=window.innerWidth<=768?'88vw':'300px';
        if(this.propsRailBtn) {
          this.propsRailBtn.style.right=`${width}px`;
          this.propsRailBtn.textContent=expanded?'›':'‹';
          this.propsRailBtn.title=expanded?'Collapse properties':'Open properties';
          this.propsRailBtn.setAttribute('aria-label',expanded?'Collapse properties':'Open properties');
          this.propsRailBtn.setAttribute('aria-expanded',String(expanded));
        }
      }
      this._updatePanelButtons();
    }
    _toggleCAD() {
      this.cadExpanded=!this.cadExpanded;
      this.cadToolsPanel.classList.toggle('collapsed',!this.cadExpanded);
      this._updatePanelButtons();
    }
    _updatePanelButtons() {
      if (this.toggleBtn) this.toggleBtn.textContent=this.toolsCollapsed?'☰ Tools':'‹ Tools';
      if (this.propsRailBtn) {
        this.propsRailBtn.textContent=this.propsExpanded?'›':'‹';
        this.propsRailBtn.setAttribute('aria-expanded',String(this.propsExpanded));
      }
      if (this.cadToggleBtn) {
        this.cadToggleBtn.textContent=this.cadExpanded?'CAD tools ▾':'CAD tools ▴';
        this.cadToggleBtn.setAttribute('aria-expanded',String(this.cadExpanded));
      }
    }
    _setTool(tool) {
      this.activeTool = tool;
      this._lineFirstClick = null; this._linePreviewElId = null;
      this.canvas.querySelectorAll('.prt-tool-btn').forEach(b => b.classList.remove('active'));
      const key = tool || 'pointer';
      const btn = this.overlay.querySelector(`[data-tool="${key}"]`);
      if (btn) btn.classList.add('active');
      this.canvas.classList.toggle('crosshair', !!tool);
      if (window.innerWidth < 768 && tool) {
        this.toolsCollapsed=true;
        this.toolsPanel.classList.add('collapsed');
        this._updatePanelButtons();
      }
      if (tool === 'line' || tool === 'arrow') Utils.showToast('Click start point, then end point');
    }

    // ---------- Canvas interactions ----------
    _canvasMouseDown(e) { const pos = this._getCanvasPos(e); this._handlePointerDown(pos, e); }
    _canvasTouchStart(e) {
      if(this._pinchActive)return;
      if (e.touches.length!==1) return;
      this._touchInteractionActive=!!e.target?.closest?.('.prt-page-canvas');
      this._touchStartSelection=this.selectedElement;
      if(this.sketchEditMode||this.activeTool)e.preventDefault();
      const pos=this._getCanvasPosTouch(e.touches[0]);
      if (this._isCADPointPlacementMode() && e.target?.closest?.(`[data-el-id="${this.selectedElement?.id}"]`)) {
        this._beginCADTouchDrawing(pos,e);
        return;
      }
      this._handlePointerDown(pos,e);
    }
    _canvasMouseMove(e) { const pos = this._getCanvasPos(e); this._handlePointerMove(pos, e); }
    _canvasTouchMove(e) {
      if(this._pinchActive)return;
      if(e.touches.length!==1)return;
      const target=e.target?.closest?.('.prt-page-canvas');
      if((!target&&!this._touchInteractionActive)||(!this.dragState&&!this.sketchEditMode&&!this.activeTool))return;
      e.preventDefault();
      const pos=this._getCanvasPosTouch(e.touches[0]);
      if (this._cadTouchDrawing) {
        this._cadTouchDrawing.currentPos=pos;
        if (this._cadTouchDrawing.longPressed) this._updateCADTouchPreview(pos);
        return;
      }
      this._handlePointerMove(pos,e.touches[0]);
    }

    _isCADPointPlacementMode() {
      return ['add-vertex','draw-line','draw-polygon','draw-point','draw-dimension'].includes(this.sketchEditMode);
    }

    _beginCADTouchDrawing(pos,e) {
      const drawing={startPos:pos,currentPos:pos,startEvent:e,longPressed:false,timer:null};
      drawing.timer=setTimeout(()=>{
        if(this._cadTouchDrawing!==drawing)return;
        drawing.longPressed=true;
        this._updateCADTouchPreview(drawing.currentPos);
      },350);
      this._cadTouchDrawing=drawing;
    }

    _updateCADTouchPreview(pos) {
      const el=this.selectedElement;
      if(!el||el.type!=='sketch')return;
      const projected=this._pageToSketchCoordinate(el,pos.x/this.scale,pos.y/this.scale);
      if(!projected)return;
      this._cadTouchPreview={
        element:el,
        coordinate:this.snapEnabled?this._snapSketchCoordinate(el,projected):projected
      };
      this._renderElement(el);
      this._updateTouchMagnifier(pos,el,this._cadTouchPreview.coordinate);
    }

    _updateTouchMagnifier(pos,el,coordinate) {
      if(!this._touchMagnifier||!el||!coordinate)return;
      const source=this.canvas.querySelector(`[data-el-id="${el.id}"] .prt-sketch-element svg`);
      if(!source)return;
      const transform=this._getSketchTransform(el);
      if(!transform)return;
      const [localX,localY]=this._sketchCoordinateToLocal(coordinate,transform);
      const viewBox=source.viewBox.baseVal;
      const zoom=3, width=viewBox.width/zoom, height=viewBox.height/zoom;
      const clone=source.cloneNode(true);
      clone.setAttribute('viewBox',`${localX-width/2} ${localY-height/2} ${width} ${height}`);
      clone.setAttribute('width','132');clone.setAttribute('height','132');
      this._touchMagnifier.replaceChildren(clone);
      const canvasRect=this.canvas.getBoundingClientRect();
      const clientX=canvasRect.left+pos.x,clientY=canvasRect.top+pos.y;
      const left=Math.max(8,Math.min(window.innerWidth-140,clientX-66));
      const top=Math.max(8,Math.min(window.innerHeight-140,clientY-154));
      this._touchMagnifier.style.left=`${left}px`;
      this._touchMagnifier.style.top=`${top}px`;
      this._touchMagnifier.classList.add('visible');
    }

    _hideTouchMagnifier() {
      this._touchMagnifier?.classList.remove('visible');
      this._touchMagnifier?.replaceChildren();
    }

    _canvasTouchEnd(e) {
      if(this._pinchActive) {
        if(e.touches?.length)return;
        this._pinchActive=false;
        this.overlay?.classList.remove('prt-pinch-active');
        this._touchStartSelection=null;
        this._cadTouchDrawing=null;
        this._cadTouchPreview=null;
        this._hideTouchMagnifier();
        this._handlePointerUp();
        this._touchInteractionActive=false;
        return;
      }
      const drawing=this._cadTouchDrawing;
      if(drawing) {
        clearTimeout(drawing.timer);
        this._cadTouchDrawing=null;
        this._cadTouchPreview=null;
        if(drawing.longPressed) {
          const touch=e.changedTouches?.[0];
          const pos=touch?this._getCanvasPosTouch(touch):drawing.currentPos;
          this._handlePointerDown(pos,drawing.startEvent);
        } else {
          this._handlePointerDown(drawing.startPos,drawing.startEvent);
        }
        if(this.selectedElement)this._renderElement(this.selectedElement);
      }
      this._hideTouchMagnifier();
      this._handlePointerUp();
      this._touchInteractionActive=false;
      this._touchStartSelection=null;
    }

    _cancelCanvasTouch() {
      if(this._cadTouchDrawing)clearTimeout(this._cadTouchDrawing.timer);
      this._cadTouchDrawing=null;
      this._pinch=null;
      this._pinchActive=false;
      this.overlay?.classList.remove('prt-pinch-active');
      this._touchStartSelection=null;
      const previewElement=this._cadTouchPreview?.element;
      this._cadTouchPreview=null;
      this._hideTouchMagnifier();
      if(previewElement)this._renderElement(previewElement);
      this._handlePointerUp();
      this._touchInteractionActive=false;
    }

    _handlePointerDown(pos, e) {
      if(this._pinchActive)return;
      const s = this.scale;
      if (this.selectedElement?.type === 'sketch' && !this.selectedElement.locked && !this.cadMovementLocked) {
        const el = this.selectedElement;
        if(this.sketchEditMode==='delete-feature') {
          const target=e.target?.closest?.('.prt-canvas-element');
          if(target?.dataset.elId===el.id) {
            e.preventDefault();
            const coordinate=this._pageToSketchCoordinate(el,pos.x/s,pos.y/s);
            if(coordinate)this._deleteSketchFeatureAt(el,coordinate);
          }
          return;
        }
        const dimensionNode=e.target?.closest?.('[data-prt-dimension-node]');
        if(dimensionNode&&this.sketchEditMode==='edit-dimensions') {
          e.preventDefault();
          this.dragState={
            type:'dimension-node',
            element:el,
            polygonIndex:Number(dimensionNode.dataset.prtPolygon),
            key:dimensionNode.dataset.prtDimensionKey,
            nodeIndex:dimensionNode.dataset.prtDimensionNode==='b'?1:0,
            startCoordinate:this._sketchDimensionNodes(el,Number(dimensionNode.dataset.prtPolygon),dimensionNode.dataset.prtDimensionKey)?.[dimensionNode.dataset.prtDimensionNode==='b'?1:0]?.slice(),
            transform:this._getSketchTransform(el)
          };
          return;
        }
        const dimensionHandle=e.target?.closest?.('[data-prt-dimension-key]');
        if(dimensionHandle&&this.sketchEditMode==='delete-dimension') {
          e.preventDefault();
          this._deleteSketchDimension(el,Number(dimensionHandle.dataset.prtPolygon),dimensionHandle.dataset.prtDimensionKey);
          return;
        }
        if(dimensionHandle&&this.sketchEditMode==='edit-dimensions') {
          e.preventDefault();
          const local=this._elementLocalFromCanvasPos(el,pos);
          const poly=(el.polygonsRef||[])[Number(dimensionHandle.dataset.prtPolygon)];
          this.dragState={
            type:'dimension',
            element:el,
            polygonIndex:Number(dimensionHandle.dataset.prtPolygon),
            key:dimensionHandle.dataset.prtDimensionKey,
            startX:local[0],
            startY:local[1],
            origOffset:poly?.dimensionOffsets?.[dimensionHandle.dataset.prtDimensionKey]?.slice()||[0,0]
          };
          return;
        }
        const vertexHandle = ['edit-vertices','delete-vertex'].includes(this.sketchEditMode)
          ? this._findNearestSketchVertexHandle(el,pos) || e.target?.closest?.('[data-prt-vertex]')
          : e.target?.closest?.('[data-prt-vertex]');
        if (vertexHandle && this.sketchEditMode === 'edit-vertices') {
          e.preventDefault();
          const polygonIndex=Number(vertexHandle.dataset.polygon);
          const ringIndex=Number(vertexHandle.dataset.ring);
          const vertexIndex=Number(vertexHandle.dataset.vertex);
          const ring=(el.polygonsRef||[])[polygonIndex]?.coordsProj?.[ringIndex]||
            (el.polygonsRef||[])[polygonIndex]?.coords?.[ringIndex];
          this.dragState = {
            type:'sketch-vertex',
            element:el,
            polygonIndex,
            ringIndex,
            vertexIndex,
            startCoordinate:ring?.[vertexIndex]?.slice(),
            transform:this._getSketchTransform(el)
          };
          return;
        }
        if (vertexHandle && this.sketchEditMode === 'delete-vertex') {
          e.preventDefault();
          this._deleteSketchVertex(el, vertexHandle);
          return;
        }
        if (['add-vertex','draw-polygon','draw-line','draw-point','draw-dimension'].includes(this.sketchEditMode)) {
          const target = e.target?.closest?.('.prt-canvas-element');
          if (target?.dataset.elId === el.id) {
            e.preventDefault();
            const pageX = pos.x/s, pageY = pos.y/s;
            const projected = this._pageToSketchCoordinate(el, pageX, pageY);
            if (!projected) return;
            const snapped=this.snapEnabled?this._snapSketchCoordinate(el,projected):projected;
            if (this.sketchEditMode === 'add-vertex') {
              this._addSketchVertex(el, snapped);
            } else if (this.sketchEditMode === 'draw-point') {
              this.sketchDraft={element:el,points:[snapped],redoPoints:[]};
              this._renderElement(el);
              this._updateCADPanel();
            } else if(this.sketchEditMode==='draw-dimension') {
              if(!this.sketchDraft)this.sketchDraft={element:el,points:[snapped]};
              else this._addManualSketchDimension(el,this.sketchDraft.points[0],snapped);
              this._renderElement(el);
            } else {
              if (!this.sketchDraft) this.sketchDraft = { element:el, points:[],redoPoints:[] };
              this.sketchDraft.points.push(snapped);
              this.sketchDraft.redoPoints=[];
              this._renderElement(el);
              Utils.showToast(`${this.sketchEditMode==='draw-line'?'Line':'Polygon'} point ${this.sketchDraft.points.length} added; double-click to finish`);
              this._updateCADPanel();
            }
            return;
          }
        }
      }
      if(this.selectedElement?.type==='sketch'&&this.sketchEditMode)return;
      if (this.selectedElement) {
        const rotHandle = e.target?.closest?.('[data-rotate-drag="true"]');
        if (rotHandle&&!this.cadMovementLocked) {
          const rect = this.canvas.getBoundingClientRect();
          const cx = rect.left + (this.selectedElement.x + this.selectedElement.width/2)*s;
          const cy = rect.top + (this.selectedElement.y + this.selectedElement.height/2)*s;
          this.dragState = { type:'rotate', element:this.selectedElement, centerX:cx, centerY:cy, startRotation:this.selectedElement.rotation||0, startMouseAngle: Math.atan2(e.clientY-cy, e.clientX-cx) };
          return;
        }
        const handle = e.target?.closest?.('.prt-resize-handle');
        if (handle&&!this.cadMovementLocked) {
          this.dragState = { type:'resize', handle:handle.dataset.handle, element:this.selectedElement, startX:pos.x, startY:pos.y, origX:this.selectedElement.x, origY:this.selectedElement.y, origW:this.selectedElement.width, origH:this.selectedElement.height };
          return;
        }
      }
      const elDom = e.target?.closest?.('.prt-canvas-element');
      if (elDom && !this.activeTool) {
        const el = this.elements.find(x => x.id === elDom.dataset.elId);
        if (el && !el.locked) {
          this._selectElement(el);
          if(!this.cadMovementLocked) {
            this.dragState = { type:'move', element:el, startX:pos.x, startY:pos.y, origX:el.x, origY:el.y };
          }
          return;
        }
      }
      if (this.activeTool) {
        const cx = pos.x/s, cy = pos.y/s;
        if (this.activeTool === 'text') {
          const el = this._addElement({ type:'text', name:'Text', x:cx, y:cy, width:260, height:60, text:'Tap "Edit Text" in properties…', fontSize:14, fontWeight:'normal', textAlign:'left', color:'#111827' });
          this._selectElement(el); this._commitHistory('add-text'); this._setTool(null); return;
        }
        if (this.activeTool === 'rect') {
          const el = this._addElement({ type:'rect', name:'Rectangle', x:cx, y:cy, width:160, height:120, strokeColor:'#111827', strokeWidth:2, fillColor:'transparent' });
          this._selectElement(el); this._commitHistory('add-rect'); this._setTool(null); return;
        }
        if (this.activeTool === 'line' || this.activeTool === 'arrow') {
          if (!this._lineFirstClick) {
            const el = this._addElement({ type:this.activeTool, name:this.activeTool==='arrow'?'Arrow':'Line', x:cx, y:cy, width:4, height:4, lineDX:0, lineDY:0, strokeColor:'#111827', strokeWidth:2, rotation:0 });
            this._lineFirstClick = { x:cx, y:cy };
            this._linePreviewElId = el.id;
            this._selectElement(el);
            return;
          } else {
            const el = this.elements.find(e => e.id === this._linePreviewElId);
            if (el) {
              const a = this._lineFirstClick, dx = cx-a.x, dy = cy-a.y;
              el.x = Math.min(a.x,cx); el.y = Math.min(a.y,cy);
              el.width = Math.max(4,Math.abs(dx)); el.height = Math.max(4,Math.abs(dy));
              el.lineDX = dx; el.lineDY = dy; el.rotation = 0;
              this._renderElement(el); this._commitHistory('add-line');
            }
            this._lineFirstClick = null; this._linePreviewElId = null; this._setTool(null); return;
          }
        }
      }
    }

    _findNearestSketchVertexHandle(el,pos) {
      const wrapper=this.canvas.querySelector(`[data-el-id="${el.id}"]`);
      const canvasRect=this.canvas.getBoundingClientRect();
      const targetX=canvasRect.left+pos.x,targetY=canvasRect.top+pos.y;
      let nearest=null,bestDistance=32;
      wrapper?.querySelectorAll('.prt-sketch-edit-hit[data-prt-vertex]').forEach(handle=>{
        const rect=handle.getBoundingClientRect();
        const distance=Math.hypot(rect.left+rect.width/2-targetX,rect.top+rect.height/2-targetY);
        if(distance<=bestDistance){bestDistance=distance;nearest=handle;}
      });
      return nearest;
    }

    _handlePointerMove(pos, e) {
      const s = this.scale;
      if ((this.activeTool==='line' || this.activeTool==='arrow') && this._lineFirstClick && this._linePreviewElId) {
        const el = this.elements.find(x => x.id === this._linePreviewElId);
        if (el) {
          const cx = pos.x/s, cy = pos.y/s, a = this._lineFirstClick;
          const dx = cx-a.x, dy = cy-a.y;
          el.x = Math.min(a.x,cx); el.y = Math.min(a.y,cy);
          el.width = Math.max(4,Math.abs(dx)); el.height = Math.max(4,Math.abs(dy));
          el.lineDX = dx; el.lineDY = dy; el.rotation = 0;
          this._renderElement(el);
        }
      }
      if (!this.dragState) return;
      if(this.dragState.type==='dimension-node') {
        const drag=this.dragState,el=drag.element;
        const projected=this._pageToSketchCoordinate(el,pos.x/s,pos.y/s,drag.transform);
        if(projected) {
          const snapped=this.snapEnabled?this._snapSketchCoordinate(el,projected,null,drag.startCoordinate):projected;
          this._setSketchDimensionNode(el,drag.polygonIndex,drag.key,drag.nodeIndex,snapped);
        }
        return;
      }
      if(this.dragState.type==='dimension') {
        const drag=this.dragState,el=drag.element,poly=(el.polygonsRef||[])[drag.polygonIndex];
        if(!poly)return;
        const local=this._elementLocalFromCanvasPos(el,pos);
        if(!poly.dimensionOffsets)poly.dimensionOffsets={};
        poly.dimensionOffsets[drag.key]=[
          drag.origOffset[0]+local[0]-drag.startX,
          drag.origOffset[1]+local[1]-drag.startY
        ];
        this._regenSketch(el);
        return;
      }
      if (this.dragState.type === 'sketch-vertex') {
        const d = this.dragState, el = d.element;
        const projected = this._pageToSketchCoordinate(el, pos.x/s, pos.y/s, d.transform);
        if (!projected) return;
        const coordinate = this.snapEnabled ? this._snapSketchCoordinate(el, projected, d) : projected;
        this._setSketchVertex(el, d.polygonIndex, d.ringIndex, d.vertexIndex, coordinate);
        this._moveSketchVertexHandle(el,d.polygonIndex,d.ringIndex,d.vertexIndex,coordinate);
        if(typeof e.identifier==='number')this._updateTouchMagnifier(pos,el,coordinate);
        return;
      }
      if (this.dragState.type === 'move') {
        const el = this.dragState.element;
        el.x = this.dragState.origX + (pos.x - this.dragState.startX)/s;
        el.y = this.dragState.origY + (pos.y - this.dragState.startY)/s;
        this._updateElementPosition(el);
        return;
      }
      if (this.dragState.type === 'resize') {
        const el = this.dragState.element;
        const dx = (pos.x - this.dragState.startX)/s, dy = (pos.y - this.dragState.startY)/s;
        const h = this.dragState.handle;
        if (h.includes('e')) el.width = Math.max(20, this.dragState.origW + dx);
        if (h.includes('w')) { el.x = this.dragState.origX + dx; el.width = Math.max(20, this.dragState.origW - dx); }
        if (h.includes('s')) el.height = Math.max(10, this.dragState.origH + dy);
        if (h.includes('n')) { el.y = this.dragState.origY + dy; el.height = Math.max(10, this.dragState.origH - dy); }
        this._updateElementPosition(el);
        if (el.type === 'sketch') this._regenSketchDebounced(el);
        return;
      }
      if (this.dragState.type === 'rotate') {
        const el = this.dragState.element;
        const angle = Math.atan2(e.clientY - this.dragState.centerY, e.clientX - this.dragState.centerX);
        const diffDeg = (angle - this.dragState.startMouseAngle) * 180/Math.PI;
        el.rotation = Math.round(this.dragState.startRotation + diffDeg);
        this._updateElementPosition(el);
      }
    }

    _handlePointerUp() {
      this._touchInteractionActive=false;
      if (!this.dragState) return;
      const el = this.dragState.element;
      if (el?.type === 'sketch' && this.dragState.type === 'resize') this._regenSketch(el);
      if (el?.type === 'sketch' && this.dragState.type === 'sketch-vertex') this._commitGeometryChange(el, 'vertex-edit');
      if (el?.type === 'sketch' && this.dragState.type === 'dimension-node') {
        this._regenSketch(el);
        this._commitHistory('dimension-node');
      }
      if (el?.type === 'sketch' && this.dragState.type === 'dimension') this._commitHistory('dimension-move');
      this.dragState = null;
      if (el && this.selectedElement?.id === el.id) this._showProperties(el, this.propsExpanded);
      this._commitHistory('pointer-up');
    }

    _updateElementPosition(el) {
      const dom = this.canvas.querySelector(`[data-el-id="${el.id}"]`);
      if (!dom) return;
      const s = this.scale;
      dom.style.left = (el.x*s)+'px'; dom.style.top = (el.y*s)+'px';
      dom.style.width = (el.width*s)+'px'; dom.style.height = (Math.max(el.height,4)*s)+'px';
      dom.style.transform = (el.type==='line'||el.type==='arrow') ? 'none' : `rotate(${el.rotation||0}deg)`;
    }
    _getCanvasPos(e) { const rect = this.canvas.getBoundingClientRect(); return { x: e.clientX-rect.left, y: e.clientY-rect.top }; }
    _getCanvasPosTouch(t) { const rect = this.canvas.getBoundingClientRect(); return { x: t.clientX-rect.left, y: t.clientY-rect.top }; }

    // ---------- Sketch regen (uses WeakMap, no pollution) ----------
    _regenSketch(el) {
      if (!el.polygonsRef) return;
      const renderer = new SketchRenderer();
      const options={
        ...(el.sketchOptions||{}),
        handleHitRadius:Math.max(28,this.gripSize*4)/this.scale,
        handleVisibleRadius:this.gripSize/this.scale,
        showDimensionNodes:this.sketchEditMode==='edit-dimensions'&&this.selectedElement?.id===el.id
      };
      el.svgContent = renderer.render(el.polygonsRef, el.width, el.height, options);
      this._renderElement(el);
    }

    _setSketchEditMode(mode, el) {
      if (mode && (!el || el.type !== 'sketch')) return;
      this._cancelDimensionEdit();
      const propertiesWasExpanded=this.propsExpanded;
      if(this._cadTouchDrawing)clearTimeout(this._cadTouchDrawing.timer);
      this._cadTouchDrawing=null;
      this._cadTouchPreview=null;
      this._hideTouchMagnifier();
      this.sketchEditMode = mode;
      this.canvas?.classList.toggle('cad-touch-active',!!mode);
      this.vertexEditElementId = ['edit-vertices','delete-vertex'].includes(mode) ? el.id : null;
      this.sketchDraft = null;
      this.activeTool = null;
      this._regenSketch(el);
      this._showProperties(el, propertiesWasExpanded);
      this._updateCADPanel();
      if(mode==='delete-feature')Utils.showToast('Tap a drawn point, line, or polygon to delete it');
      else if (mode && !['edit-dimensions','draw-dimension'].includes(mode)) Utils.showToast(mode === 'draw-polygon' ? 'Tap sketch points; use the check mark to finish' : `${mode.replace('-', ' ')} mode`);
    }

    _getSketchTransform(el) {
      const polygons = el.polygonsRef || this.polygonsData || [];
      const points = [];
      polygons.forEach(poly => (poly.coordsProj || poly.coords || []).forEach(ring => ring.forEach(point => points.push(point))));
      if (!points.length) return null;
      const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      const dataW = maxX-minX || 1, dataH = maxY-minY || 1;
      const availW = el.width-120, availH = el.height-120;
      const scale = Math.min(availW/dataW, availH/dataH);
      return {
        minX, maxY, scale,
        offX:60+(availW-dataW*scale)/2,
        offY:60+(availH-dataH*scale)/2
      };
    }

    _sketchCoordinateToLocal(coordinate, transform) {
      return [transform.offX+(coordinate[0]-transform.minX)*transform.scale,
        transform.offY+(transform.maxY-coordinate[1])*transform.scale];
    }

    _moveSketchVertexHandle(el,polygonIndex,ringIndex,vertexIndex,coordinate) {
      const transform=this._getSketchTransform(el);
      if(!transform)return;
      const [x,y]=this._sketchCoordinateToLocal(coordinate,transform);
      const wrapper=this.canvas.querySelector(`[data-el-id="${el.id}"]`);
      wrapper?.querySelectorAll(`[data-polygon="${polygonIndex}"][data-ring="${ringIndex}"][data-vertex="${vertexIndex}"]`).forEach(handle=>{
        handle.setAttribute('cx',String(x));
        handle.setAttribute('cy',String(y));
      });
    }

    _pageToSketchCoordinate(el, pageX, pageY, transform = this._getSketchTransform(el)) {
      if (!transform || !Number.isFinite(transform.scale) || transform.scale === 0) return null;
      const rotation = -(Number(el.rotation)||0)*Math.PI/180;
      const cx = el.x+el.width/2, cy = el.y+el.height/2;
      const dx = pageX-cx, dy = pageY-cy;
      const localX = dx*Math.cos(rotation)-dy*Math.sin(rotation)+el.width/2;
      const localY = dx*Math.sin(rotation)+dy*Math.cos(rotation)+el.height/2;
      return [
        (localX-transform.offX)/transform.scale+transform.minX,
        transform.maxY-(localY-transform.offY)/transform.scale
      ];
    }

    _appendSketchVertexHandles(svg, el) {
      const transform = this._getSketchTransform(el);
      if (!transform) return;
      const ns = 'http://www.w3.org/2000/svg';
      (el.polygonsRef || this.polygonsData || []).forEach((poly, polygonIndex) => {
        (poly.coordsProj || poly.coords || []).forEach((ring, ringIndex) => {
          const isClosed = poly.geometryType !== 'LineString' && poly.geometryType !== 'Point' && ring.length > 3 && ring[0][0] === ring[ring.length-1][0] && ring[0][1] === ring[ring.length-1][1];
          const count = ring.length-(isClosed?1:0);
          for (let vertexIndex=0; vertexIndex<count; vertexIndex++) {
            const [x,y] = this._sketchCoordinateToLocal(ring[vertexIndex], transform);
            const hitTarget=document.createElementNS(ns,'circle');
            hitTarget.setAttribute('cx',String(x));
            hitTarget.setAttribute('cy',String(y));
            hitTarget.setAttribute('r',String(28/this.scale));
            hitTarget.setAttribute('class','prt-sketch-edit-hit');
            hitTarget.setAttribute('data-prt-vertex','true');
            hitTarget.setAttribute('data-polygon',String(polygonIndex));
            hitTarget.setAttribute('data-ring',String(ringIndex));
            hitTarget.setAttribute('data-vertex',String(vertexIndex));
            svg.appendChild(hitTarget);
            const marker = document.createElementNS(ns, 'circle');
            marker.setAttribute('cx', String(x));
            marker.setAttribute('cy', String(y));
            const selected=this.selectedVertex?.polygonIndex===polygonIndex&&
              this.selectedVertex?.ringIndex===ringIndex&&this.selectedVertex?.vertexIndex===vertexIndex;
            marker.setAttribute('r', String((selected?this.gripSize+3:this.gripSize)/this.scale));
            marker.setAttribute('class', 'prt-sketch-edit-handle');
            if(selected)marker.setAttribute('fill','#dc2626');
            marker.setAttribute('pointer-events','none');
            svg.appendChild(marker);
          }
        });
      });
    }

    _appendCADVertexSelection(svg,el) {
      const selected=this.selectedVertex,transform=this._getSketchTransform(el);
      if(!selected||!transform)return;
      const ring=(el.polygonsRef||[])[selected.polygonIndex]?.coordsProj?.[selected.ringIndex]||
        (el.polygonsRef||[])[selected.polygonIndex]?.coords?.[selected.ringIndex];
      const coordinate=ring?.[selected.vertexIndex];
      if(!coordinate)return;
      const [x,y]=this._sketchCoordinateToLocal(coordinate,transform);
      const marker=document.createElementNS('http://www.w3.org/2000/svg','circle');
      marker.setAttribute('cx',String(x));marker.setAttribute('cy',String(y));
      marker.setAttribute('r',String((this.gripSize+5)/this.scale));
      marker.setAttribute('fill','rgba(220,38,38,.22)');
      marker.setAttribute('stroke','#dc2626');
      marker.setAttribute('stroke-width',String(2/this.scale));
      marker.setAttribute('pointer-events','none');
      svg.appendChild(marker);
    }

    _appendSketchDraft(svg, el) {
      const draft=this.sketchDraft, transform=this._getSketchTransform(el);
      const hasDraft=draft?.element.id===el.id;
      const preview=this._cadTouchPreview?.element.id===el.id?this._cadTouchPreview.coordinate:null;
      if ((!hasDraft&&!preview) || !transform || (!draft?.points.length&&!preview)) return;
      const ns='http://www.w3.org/2000/svg';
      const points=(hasDraft?draft.points:[]).map(point=>this._sketchCoordinateToLocal(point,transform));
      if(preview)points.push(this._sketchCoordinateToLocal(preview,transform));
      if(!points.length)return;
      const path=document.createElementNS(ns,'path');
      const closed=this.sketchEditMode==='draw-polygon' && points.length>2;
      path.setAttribute('d',points.map((point,index)=>`${index?'L':'M'} ${point[0]} ${point[1]}`).join(' ')+(closed?' Z':''));
      path.setAttribute('fill',closed?'rgba(37,99,235,0.12)':'none');
      path.setAttribute('stroke','#2563eb');
      path.setAttribute('stroke-width',String(2/this.scale));
      path.setAttribute('stroke-dasharray',`${5/this.scale} ${3/this.scale}`);
      path.setAttribute('pointer-events','none');
      svg.appendChild(path);
      points.forEach(([x,y])=>{
        const marker=document.createElementNS(ns,'circle');
        marker.setAttribute('cx',String(x)); marker.setAttribute('cy',String(y));
        marker.setAttribute('r',String(4/this.scale)); marker.setAttribute('fill','#2563eb');
        marker.setAttribute('pointer-events','none'); svg.appendChild(marker);
      });
    }

    _syncSketchCoordinates(poly, ringIndex) {
      if (!Array.isArray(poly.coordsProj)) poly.coordsProj = poly.coords || [];
      const projectedRing = poly.coordsProj[ringIndex];
      if (!projectedRing) return;
      if (!Array.isArray(poly.coords)) poly.coords = [];
      try {
        poly.coords[ringIndex] = projectedRing.map(c => ol.proj.transform(c, CURRENT_PROJECTION, 'EPSG:4326'));
      } catch (e) {
        console.error('[PRT] Could not update sketch longitude/latitude coordinates:', e);
      }
    }

    _setSketchVertex(el, polygonIndex, ringIndex, vertexIndex, coordinate) {
      const polygons = el.polygonsRef || this.polygonsData || [];
      const poly = polygons[polygonIndex];
      const ring = poly?.coordsProj?.[ringIndex] || poly?.coords?.[ringIndex];
      if (!ring || vertexIndex >= ring.length) return;
      const closed = poly.geometryType !== 'LineString' && poly.geometryType !== 'Point' && ring.length > 3 && ring[0][0] === ring[ring.length-1][0] && ring[0][1] === ring[ring.length-1][1];
      ring[vertexIndex] = coordinate.slice();
      if (closed && vertexIndex === 0) ring[ring.length-1] = coordinate.slice();
      if (closed && vertexIndex === ring.length-1) ring[0] = coordinate.slice();
      this._syncSketchCoordinates(poly, ringIndex);
      el.svgContent = new SketchRenderer().render(polygons, el.width, el.height, el.sketchOptions||{});
    }

    _snapSketchCoordinate(el, coordinate, except = null, excludePoint = null) {
      const transform = except?.transform || this._getSketchTransform(el);
      if (!transform || transform.scale === 0 || !this.snapEnabled) return coordinate;
      const tolerance=this.snapTolerance;
      const nearest={vertex:null,intersection:null,edge:null,grid:null};
      const distances={vertex:tolerance,intersection:tolerance,edge:tolerance,grid:tolerance};
      const consider=(point,type)=>{
        if(excludePoint&&Math.hypot(point[0]-excludePoint[0],point[1]-excludePoint[1])<1e-8)return;
        const distance=Math.hypot(
          (point[0]-coordinate[0])*transform.scale,
          (point[1]-coordinate[1])*transform.scale
        )*this.scale;
        if(distance<distances[type]) {
          distances[type]=distance;
          nearest[type]=point;
        }
      };
      const segments=[];
      (el.polygonsRef||[]).forEach((poly,polygonIndex)=>{
        (poly.coordsProj||poly.coords||[]).forEach((ring,ringIndex)=>{
          const closed=poly.geometryType!=='LineString'&&poly.geometryType!=='Point'&&ring.length>3&&ring[0][0]===ring[ring.length-1][0]&&ring[0][1]===ring[ring.length-1][1];
          const count=ring.length-(closed?1:0);
          if(this.snapModes.vertices)ring.slice(0,count).forEach((point,vertexIndex)=>{
            if(except&&polygonIndex===except.polygonIndex&&ringIndex===except.ringIndex&&vertexIndex===except.vertexIndex)return;
            consider(point,'vertex');
          });
          const segmentCount=poly.geometryType==='Point'?0:poly.geometryType==='LineString'?count-1:count;
          for(let index=0;index<segmentCount;index++){
            const a=ring[index],b=ring[(index+1)%count];
            segments.push({a,b});
            const dx=b[0]-a[0],dy=b[1]-a[1],length2=dx*dx+dy*dy;
            if(length2<=1e-16||!this.snapModes.edges)continue;
            const t=Math.max(0,Math.min(1,((coordinate[0]-a[0])*dx+(coordinate[1]-a[1])*dy)/length2));
            consider([a[0]+t*dx,a[1]+t*dy],'edge');
            consider([(a[0]+b[0])/2,(a[1]+b[1])/2],'edge');
          }
        });
        if(this.snapModes.edges)(poly.triangulationDiagonals||[]).forEach(([a,b])=>{
          segments.push({a,b});
          const dx=b[0]-a[0],dy=b[1]-a[1],length2=dx*dx+dy*dy;
          if(length2>1e-16){
            const t=Math.max(0,Math.min(1,((coordinate[0]-a[0])*dx+(coordinate[1]-a[1])*dy)/length2));
            consider([a[0]+t*dx,a[1]+t*dy],'edge');
          }
        });
        if(this.snapModes.vertices)(poly.extraDimensions||[]).forEach(dimension=>{
          consider(dimension.a,'vertex');consider(dimension.b,'vertex');
        });
      });
      if(this.snapModes.intersections) {
        const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
        const searchRadius=tolerance/Math.max(transform.scale*this.scale,1e-12);
        const nearby=segments.filter(({a,b})=>
          Math.max(a[0],b[0])>=coordinate[0]-searchRadius&&Math.min(a[0],b[0])<=coordinate[0]+searchRadius&&
          Math.max(a[1],b[1])>=coordinate[1]-searchRadius&&Math.min(a[1],b[1])<=coordinate[1]+searchRadius
        );
        for(let i=0;i<nearby.length;i++)for(let j=i+1;j<nearby.length;j++) {
          const first=nearby[i],second=nearby[j];
          const r=[first.b[0]-first.a[0],first.b[1]-first.a[1]];
          const s=[second.b[0]-second.a[0],second.b[1]-second.a[1]];
          const denominator=cross(r,s);
          if(Math.abs(denominator)<1e-12)continue;
          const offset=[second.a[0]-first.a[0],second.a[1]-first.a[1]];
          const t=cross(offset,s)/denominator,u=cross(offset,r)/denominator;
          if(t>=0&&t<=1&&u>=0&&u<=1)consider([first.a[0]+t*r[0],first.a[1]+t*r[1]],'intersection');
        }
      }
      if(this.snapModes.grid) {
        const gridUnits=Projection.coordinateDistance(this.snapGridMeters,coordinate);
        if(Number.isFinite(gridUnits)&&gridUnits>0) {
          consider([
            Math.round(coordinate[0]/gridUnits)*gridUnits,
            Math.round(coordinate[1]/gridUnits)*gridUnits
          ],'grid');
        }
      }
      return (nearest.vertex||nearest.intersection||nearest.edge||nearest.grid||coordinate).slice();
    }

    _deleteSketchVertex(el, handle) {
      const polygons = el.polygonsRef || this.polygonsData || [];
      const polygonIndex = Number(handle.dataset.polygon), ringIndex = Number(handle.dataset.ring), vertexIndex = Number(handle.dataset.vertex);
      const poly = polygons[polygonIndex], ring = poly?.coordsProj?.[ringIndex] || poly?.coords?.[ringIndex];
      if (!ring) return;
      if (poly.geometryType === 'Point') {
        polygons.splice(polygonIndex, 1);
        const globalIndex=this.polygonsData?.indexOf(poly) ?? -1;
        if (globalIndex>=0 && polygons!==this.polygonsData) this.polygonsData.splice(globalIndex,1);
        this._commitGeometryChange(el, 'point-delete');
        return;
      }
      const closed = poly.geometryType !== 'LineString' && poly.geometryType !== 'Point' && ring.length > 3 && ring[0][0] === ring[ring.length-1][0] && ring[0][1] === ring[ring.length-1][1];
      const uniqueCount = ring.length-(closed?1:0);
      const minimum=poly.geometryType==='LineString'?2:poly.geometryType==='Point'?1:3;
      if (uniqueCount <= minimum) return Utils.showToast(`Geometry must keep at least ${minimum} vertices`);
      ring.splice(vertexIndex, 1);
      if (closed) ring[ring.length-1] = ring[0].slice();
      this._syncSketchCoordinates(poly, ringIndex);
      this._commitGeometryChange(el, 'vertex-delete');
    }

    _deleteSketchFeatureAt(el, coordinate) {
      const polygons=el.polygonsRef||this.polygonsData||[];
      const transform=this._getSketchTransform(el);
      if(!transform)return;
      const pixelScale=Math.abs(transform.scale*this.scale);
      const tolerance=16/Math.max(pixelScale,1e-9);
      const pointInRing=(point,ring)=>{
        let inside=false;
        for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
          const a=ring[i],b=ring[j];
          if((a[1]>point[1])!==(b[1]>point[1])&&
            point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
        }
        return inside;
      };
      let candidate=null,candidateDistance=Infinity;
      for(let polygonIndex=polygons.length-1;polygonIndex>=0;polygonIndex--) {
        const poly=polygons[polygonIndex];
        if(!poly?._prtDrawnFeature)continue;
        let distance=Infinity;
        for(const ring of poly.coordsProj||poly.coords||[]) {
          if(!ring?.length)continue;
          if(poly.geometryType==='Point') {
            distance=Math.min(distance,Math.hypot(coordinate[0]-ring[0][0],coordinate[1]-ring[0][1]));
            continue;
          }
          const closed=poly.geometryType!=='LineString'&&ring.length>3&&
            ring[0][0]===ring[ring.length-1][0]&&ring[0][1]===ring[ring.length-1][1];
          const count=ring.length-(closed?1:0);
          const segmentCount=poly.geometryType==='LineString'?count-1:count;
          for(let index=0;index<segmentCount;index++) {
            const a=ring[index],b=ring[(index+1)%count],dx=b[0]-a[0],dy=b[1]-a[1];
            const t=Math.max(0,Math.min(1,((coordinate[0]-a[0])*dx+(coordinate[1]-a[1])*dy)/(dx*dx+dy*dy||1)));
            distance=Math.min(distance,Math.hypot(coordinate[0]-(a[0]+t*dx),coordinate[1]-(a[1]+t*dy)));
          }
          if(poly.geometryType!=='LineString'&&ring.length>=3&&pointInRing(coordinate,ring))distance=0;
        }
        if(distance<candidateDistance) {
          candidate=poly;
          candidateDistance=distance;
        }
        if(distance===0)break;
      }
      if(!candidate||candidateDistance>tolerance) {
        Utils.showToast('Tap a drawn feature to delete it');
        return;
      }
      for(const features of new Set([el.polygonsRef,this.polygonsData])) {
        if(!Array.isArray(features))continue;
        const index=features.indexOf(candidate);
        if(index>=0)features.splice(index,1);
      }
      this._commitGeometryChange(el,'feature-delete');
      Utils.showToast(`${candidate.geometryType==='Polygon'?'Polygon':candidate.geometryType==='LineString'?'Line':'Point'} deleted`);
    }

    _addSketchVertex(el, coordinate) {
      const polygons = el.polygonsRef || this.polygonsData || [];
      const transform = this._getSketchTransform(el);
      const tolerance = 24/(this.scale*Math.abs(transform?.scale||1));
      let best = null, bestDistance = tolerance;
      polygons.forEach((poly, polygonIndex) => (poly.coordsProj || poly.coords || []).forEach((ring, ringIndex) => {
        if (poly.geometryType === 'Point') return;
        const closed = poly.geometryType !== 'LineString' && ring.length > 3 && ring[0][0] === ring[ring.length-1][0] && ring[0][1] === ring[ring.length-1][1];
        const count = ring.length-(closed?1:0);
        const segmentCount=poly.geometryType==='LineString'?count-1:count;
        for (let i=0;i<segmentCount;i++) {
          const a=ring[i], b=ring[(i+1)%count], dx=b[0]-a[0], dy=b[1]-a[1];
          const t=Math.max(0,Math.min(1,((coordinate[0]-a[0])*dx+(coordinate[1]-a[1])*dy)/(dx*dx+dy*dy||1)));
          const point=[a[0]+t*dx,a[1]+t*dy], distance=Math.hypot(point[0]-coordinate[0],point[1]-coordinate[1]);
          if (distance<bestDistance) { bestDistance=distance; best={polygonIndex,ringIndex,index:i+1,point}; }
        }
      }));
      if (!best) return Utils.showToast('Tap close to a polygon edge to add a vertex');
      const poly=polygons[best.polygonIndex], ring=(poly.coordsProj||poly.coords)[best.ringIndex];
      ring.splice(best.index,0,best.point);
      this._syncSketchCoordinates(poly,best.ringIndex);
      this._commitGeometryChange(el,'vertex-add');
    }

    _cancelSketchDraft() {
      const draft=this.sketchDraft;
      if(!draft)return;
      this.sketchDraft=null;
      this._renderElement(draft.element);
      this._updateCADPanel();
    }

    _finishSketchGeometry(geometryType = 'Polygon') {
      const draft=this.sketchDraft;
      const minimum=geometryType==='Polygon'?3:geometryType==='Point'?1:2;
      const label=geometryType==='Polygon'?'polygon':geometryType==='Point'?'point':'line';
      if (!draft || draft.points.length<minimum) return Utils.showToast(`Draw at least ${minimum} ${label} point${minimum===1?'':'s'}`);
      const points=draft.points.slice();
      const first=points[0], last=points[points.length-1];
      if (geometryType!=='Point'&&Math.hypot(first[0]-last[0],first[1]-last[1])<1e-8) points.pop();
      if (geometryType==='Polygon') {
        points.push(points[0].slice());
      }
      const validation=this._validateSketchGeometry(geometryType,points);
      if(validation.length)return Utils.showToast(`Cannot finish geometry: ${validation[0]}`);
      if (geometryType!=='Point'&&points.length-(geometryType==='Polygon'?1:0)<minimum) {
        return Utils.showToast(`Draw at least ${minimum} distinct points`);
      }
      this.sketchDraft=null;
      this._addSketchGeometry(draft.element,geometryType,points);
      Utils.showToast(`${geometryType==='Polygon'?'Polygon':geometryType==='Point'?'Point':'Line'} added`);
    }

    _addSketchGeometry(el, geometryType, points) {
      const poly={
        geometryType,
        _prtDrawnFeature:true,
        coordsProj:[points.map(c=>c.slice())],
        coords:[points.map(c => {
          try { return ol.proj.transform(c,CURRENT_PROJECTION,'EPSG:4326'); }
          catch(e) { console.error('[PRT] Could not transform new sketch geometry:',e); return c.slice(); }
        })],
        properties:{name:`${geometryType==='Polygon'?'Plot':geometryType==='LineString'?'Line':'Point'} ${(el.polygonsRef||[]).length+1}`}
      };
      const polygons=el.polygonsRef || this.polygonsData || [];
      polygons.push(poly);
      if (this.polygonsData && !this.polygonsData.includes(poly)) this.polygonsData.push(poly);
      this._commitGeometryChange(el,`draw-${geometryType.toLowerCase()}`);
    }

    _commitGeometryChange(sourceElement, reason) {
      const updated=new Set();
      for (const page of this.pages) for (const el of page.elements) {
        if (el.type==='sketch' && el.polygonsRef && !updated.has(el)) {
          el.svgContent=new SketchRenderer().render(el.polygonsRef,el.width,el.height,el.sketchOptions||{});
          updated.add(el);
        }
        if (el.binding==='plotDetails') el.text=this._buildDetailsText(el.polygonsRef||this.polygonsData,el.detailsConfig||[]);
      }
      if (this.polygonsData) this.sketchSVG=new SketchRenderer().render(this.polygonsData,520,420,{});
      this._renderAll();
      if (sourceElement) this._showProperties(sourceElement,this.propsExpanded);
      this._updateCADPanel();
      this._commitHistory(reason);
    }
    _regenSketchDebounced(el) {
      const existingTimer = this._regenTimers.get(el);
      if (existingTimer) clearTimeout(existingTimer);
      this._regenTimers.set(el, setTimeout(() => this._regenSketch(el), 150));
    }
    _addSketchElement() {
      const pW = Utils.mm2px(this.pageDims.w);
      const el = this._addElement({
        type:'sketch', name:'Sketch', x:30, y:90, width:pW-60, height:280,
        svgContent: this.sketchSVG, polygonsRef: this.polygonsData,
        sketchOptions: { showDimensions:true, showVertices:true, showNorth:true, showScale:true, showLabels:true,
                        strokeWidth:1.5, strokeDash:'solid', fillOpacity:0.08, dimStyle:'arrows',
                        lengthUnit:'auto', areaUnit:'auto', dimFontSize:10, labelFontSize:12,
                        vertexSize:2.4, vertexShape:'circle' }
      });
      this._selectElement(el); this._commitHistory('add-sketch');
    }

    _addPageBorder() {
      const pW=Utils.mm2px(this.pageDims.w),pH=Utils.mm2px(this.pageDims.h);
      const el=this._addElement({
        type:'rect',name:'Border',x:10,y:10,width:pW-20,height:pH-20,
        strokeColor:'#111827',strokeWidth:2,fillColor:'transparent'
      });
      this._selectElement(el);
      this._commitHistory('add-border');
    }

    _addPageDivider() {
      const pW=Utils.mm2px(this.pageDims.w),pH=Utils.mm2px(this.pageDims.h);
      const width=pW-40;
      const el=this._addElement({
        type:'line',name:'Divider',x:20,y:pH/2-2,width,height:4,
        lineDX:width,lineDY:0,strokeColor:'#cbd5e1',strokeWidth:2,rotation:0
      });
      this._selectElement(el);
      this._commitHistory('add-divider');
    }

    // ---------- QR Modal ----------
    _openQRModal() {
      this._setTool(null);
      const backdrop = Utils.createElement('div', { className:'prt-modal-backdrop' });
      const modal = Utils.createElement('div', { className:'prt-modal' });
      const header = Utils.createElement('div', { className:'prt-modal-header' });
      header.appendChild(Utils.createElement('h3', { textContent:'Generate QR Code' }));
      header.appendChild(Utils.createElement('button', { className:'prt-panel-close', textContent:'✕', onClick:() => backdrop.remove() }));
      modal.appendChild(header);
      const body = Utils.createElement('div', { className:'prt-modal-body' });
      body.appendChild(Utils.createElement('label', { textContent:'Include:', style:{display:'block', fontWeight:'800', marginBottom:'8px', color:'#334155'} }));
      const group = Utils.createElement('div', { className:'prt-checkbox-group' });
      const coordItem = Utils.createElement('div', { className:'prt-checkbox-item' });
      const coordCb = Utils.createElement('input', { type:'checkbox', id:'qr-coords', checked:'true' });
      coordItem.append(coordCb, Utils.createElement('label', { for:'qr-coords', textContent:'Coordinates (Lon/Lat)' }));
      group.appendChild(coordItem);
      const props = this.polygonsData?.[0]?.properties || {};
      Object.keys(props).forEach(k => {
        if (k==='geometry' || typeof props[k]==='object') return;
        const item = Utils.createElement('div', { className:'prt-checkbox-item' });
        const cb = Utils.createElement('input', { type:'checkbox', 'data-attr':k, checked:'true' });
        item.append(cb, Utils.createElement('label', { textContent: k }));
        group.appendChild(item);
      });
      body.appendChild(group);
      body.appendChild(Utils.createElement('label', { textContent:'Extra note:', style:{display:'block', fontWeight:'800', marginTop:'12px', marginBottom:'6px', color:'#334155'} }));
      const note = Utils.createElement('textarea', { className:'prt-textarea', rows:'3', placeholder:'Optional…' });
      body.appendChild(note);
      body.appendChild(Utils.createElement('label', { textContent:'QR size (px):', style:{display:'block', fontWeight:'800', marginTop:'12px', marginBottom:'6px', color:'#334155'} }));
      const sizeInput = Utils.createElement('input', { className:'prt-input', type:'number', value:'180', min:'80', max:'600' });
      body.appendChild(sizeInput);
      modal.appendChild(body);
      const footer = Utils.createElement('div', { className:'prt-modal-footer' });
      footer.appendChild(Utils.createElement('button', { className:'prt-btn prt-btn-outline', textContent:'Cancel', onClick:() => backdrop.remove() }));
      footer.appendChild(Utils.createElement('button', { className:'prt-btn prt-btn-primary', textContent:'Add', onClick:() => {
        const data = this._buildQRData(group, note.value);
        const size = parseInt(sizeInput.value) || 180;
        const url = Utils.generateQRDataUrlUtf8(data, size);
        if (!url) return Utils.showToast('QR failed');
        const pW = Utils.mm2px(this.pageDims.w);
        const el = this._addElement({ type:'qr', name:'QR Code', x:pW-size-30, y:20, width:size, height:size, qrData:data, qrDataUrl:url });
        this._selectElement(el); this._commitHistory('add-qr'); backdrop.remove();
      } }));
      modal.appendChild(footer);
      backdrop.appendChild(modal);
      document.body.appendChild(backdrop);
    }
    _buildQRData(group, noteText) {
      const data = { ts: new Date().toISOString() };
      if (group.querySelector('#qr-coords')?.checked && this.polygonsData) {
        data.coords = this.polygonsData.map(p => (p.coords?.[0] || []).map(c => [Number(c[0].toFixed(6)), Number(c[1].toFixed(6))]));
      }
      const attrs = {};
      group.querySelectorAll('[data-attr]').forEach(cb => { if (cb.checked) attrs[cb.dataset.attr] = this.polygonsData?.[0]?.properties?.[cb.dataset.attr]; });
      if (Object.keys(attrs).length) data.attributes = attrs;
      if (noteText?.trim()) data.note = noteText.trim();
      return JSON.stringify(data);
    }

    // ---------- Arrange / Duplicate / Delete ----------
    _bringToFront() { if (!this.selectedElement) return; const idx = this.elements.findIndex(e => e.id === this.selectedElement.id); if (idx<0) return; const [el] = this.elements.splice(idx,1); this.elements.push(el); this._renderAll(); this._commitHistory('front'); }
    _sendToBack() { if (!this.selectedElement) return; const idx = this.elements.findIndex(e => e.id === this.selectedElement.id); if (idx<0) return; const [el] = this.elements.splice(idx,1); this.elements.unshift(el); this._renderAll(); this._commitHistory('back'); }
    _duplicateSelected() { if (!this.selectedElement) return; const c = { ...this.selectedElement, id:Utils.uid(), x:this.selectedElement.x+12, y:this.selectedElement.y+12, name:(this.selectedElement.name||this.selectedElement.type)+' copy' }; this.elements.push(c); this._renderElement(c); this._selectElement(c); this._commitHistory('dup'); }
    _deleteSelected() { if (!this.selectedElement) return; const id = this.selectedElement.id; this.elements = this.elements.filter(e => e.id !== id); this.canvas.querySelector(`[data-el-id="${id}"]`)?.remove(); this._selectElement(null); this._commitHistory('delete'); }

    // ---------- History (debounced, deduped) ----------
    _commitHistory(reason) { this._historyDebouncer(reason); }
    _commitHistoryNow(reason) {
      const polygonArrays = new Map(), polygonObjects = new Map();
      const clonePolygonArray = (polygons) => {
        if (!Array.isArray(polygons)) return polygons;
        if (polygonArrays.has(polygons)) return polygonArrays.get(polygons);
        const copy=[];
        polygonArrays.set(polygons,copy);
        polygons.forEach(poly => {
          if (!poly || typeof poly !== 'object') { copy.push(poly); return; }
          if (polygonObjects.has(poly)) { copy.push(polygonObjects.get(poly)); return; }
          const clone={
            ...poly,
            coords:poly.coords?.map(ring=>ring.map(c=>c.slice())),
            coordsProj:poly.coordsProj?.map(ring=>ring.map(c=>c.slice())),
            properties:poly.properties ? {...poly.properties} : poly.properties,
            dimensionLabels:poly.dimensionLabels ? {...poly.dimensionLabels} : poly.dimensionLabels,
            dimensionOffsets:poly.dimensionOffsets ? Object.fromEntries(Object.entries(poly.dimensionOffsets).map(([key,offset])=>[key,offset.slice()])) : poly.dimensionOffsets,
            dimensionNodes:poly.dimensionNodes ? Object.fromEntries(Object.entries(poly.dimensionNodes).map(([key,nodes])=>[key,nodes.map(point=>point.slice())])) : poly.dimensionNodes,
            hiddenDimensions:poly.hiddenDimensions?.slice(),
            extraDimensions:poly.extraDimensions?.map(dimension=>({...dimension,a:dimension.a.slice(),b:dimension.b.slice()})),
            triangulationDiagonals:poly.triangulationDiagonals?.map(([a,b])=>[a.slice(),b.slice()])
          };
          polygonObjects.set(poly,clone);
          copy.push(clone);
        });
        return copy;
      };
      const state = {
        pageSize: this.pageSize, pageDims: this.pageDims,
        currentPageIndex: this.currentPageIndex,
        polygonsData: clonePolygonArray(this.polygonsData),
        pages: this.pages.map(p => ({
          elements: p.elements.map(e => {
            const c = { ...e };
            if (e.polygonsRef) c.polygonsRef = clonePolygonArray(e.polygonsRef);
            if (c.type === 'sketch') c.svgContent = '__SKETCH__';
            if (c.type === 'qr') c.qrDataUrl = '__QR__'; // don't store big base64
            if (c.type === 'image' && c.imageData) c.imageData = '__IMAGE__';
            return c;
          })
        }))
      };
      const hash = JSON.stringify(state);
      if (hash === this._lastHistoryHash) return;
      this._lastHistoryHash = hash;
      this.undoRedo.push(state);
      this._buildLayerManager();
    }

    _restoreFromState(state) {
      try {
        this.pageSize = state.pageSize || 'A4 Portrait';
        this.pageDims = state.pageDims || { ...PAGE_SIZES[this.pageSize] };
        const polygonArrays = new Map(), polygonObjects = new Map();
        const clonePolygonArray = (polygons) => {
          if (!Array.isArray(polygons)) return polygons;
          if (polygonArrays.has(polygons)) return polygonArrays.get(polygons);
          const copy=[];
          polygonArrays.set(polygons,copy);
          polygons.forEach(poly => {
            if (!poly || typeof poly !== 'object') { copy.push(poly); return; }
            if (polygonObjects.has(poly)) { copy.push(polygonObjects.get(poly)); return; }
            const clone={
              ...poly,
              coords:poly.coords?.map(ring=>ring.map(c=>c.slice())),
              coordsProj:poly.coordsProj?.map(ring=>ring.map(c=>c.slice())),
              properties:poly.properties ? {...poly.properties} : poly.properties,
              dimensionLabels:poly.dimensionLabels ? {...poly.dimensionLabels} : poly.dimensionLabels,
              dimensionOffsets:poly.dimensionOffsets ? Object.fromEntries(Object.entries(poly.dimensionOffsets).map(([key,offset])=>[key,offset.slice()])) : poly.dimensionOffsets,
              dimensionNodes:poly.dimensionNodes ? Object.fromEntries(Object.entries(poly.dimensionNodes).map(([key,nodes])=>[key,nodes.map(point=>point.slice())])) : poly.dimensionNodes,
              hiddenDimensions:poly.hiddenDimensions?.slice(),
              extraDimensions:poly.extraDimensions?.map(dimension=>({...dimension,a:dimension.a.slice(),b:dimension.b.slice()})),
              triangulationDiagonals:poly.triangulationDiagonals?.map(([a,b])=>[a.slice(),b.slice()])
            };
            polygonObjects.set(poly,clone);
            copy.push(clone);
          });
          return copy;
        };
        if (state.polygonsData) {
          this.polygonsData=clonePolygonArray(state.polygonsData);
          this.sketchSVG=new SketchRenderer().render(this.polygonsData,520,420,{});
        }
        this.pages = (state.pages || [{ elements: [] }]).map(p => ({
          elements:(p.elements||[]).map(el=>({
            ...el,
            ...(el.polygonsRef ? {polygonsRef:clonePolygonArray(el.polygonsRef)} : {})
          }))
        }));
        this.currentPageIndex = Math.max(0, Math.min(this.pages.length-1, state.currentPageIndex || 0));
        this.pages.forEach(p => {
          p.elements.forEach(el => {
            if (el.type === 'sketch' && el.svgContent === '__SKETCH__') {
              const r = new SketchRenderer();
              el.svgContent = r.render(el.polygonsRef || this.polygonsData, el.width, el.height, el.sketchOptions || {});
            }
            if (el.type === 'qr' && el.qrDataUrl === '__QR__') {
              el.qrDataUrl = el.qrData ? Utils.generateQRDataUrlUtf8(el.qrData, Math.round(el.width||180)) : '';
            }
            if (el.binding === 'plotDetails') {
              el.text = this._buildDetailsText(el.polygonsRef || this.polygonsData, el.detailsConfig || []);
            }
          });
        });
        this._refreshPageSelect();
        this._fitToScreen();
        this._selectElement(null);
        this._renderAll();
        this._buildLayerManager();
      } catch (e) { console.error('[PRT] Restore failed:', e); Utils.showToast('Restore failed'); }
    }

    _undo() { const st = this.undoRedo.undo(); if (st) this._restoreFromState(st); }
    _redo() { const st = this.undoRedo.redo(); if (st) this._restoreFromState(st); }
    _updateUndoRedoButtons() {
      const undoBtn = this.overlay?.querySelector('[data-tool="undo"]');
      const redoBtn = this.overlay?.querySelector('[data-tool="redo"]');
      if (undoBtn) undoBtn.style.opacity = this.undoRedo.canUndo() ? '1' : '0.35';
      if (redoBtn) redoBtn.style.opacity = this.undoRedo.canRedo() ? '1' : '0.35';
    }

    // ---------- Templates (validated) ----------
    _saveTemplate() {
      const tpl = {
        version: 3,
        pageSize: this.pageSize, pageDims: this.pageDims,
        pages: this.pages.map(p => ({
          elements: p.elements.map(e => {
            const c = { ...e };
            if (c.type === 'sketch') c.svgContent = '__SKETCH__';
            if (c.type === 'qr') c.qrDataUrl = '__QR__';
            if (c.type === 'image') c.imageData = '__IMAGE__';
            return c;
          })
        }))
      };
      const name = prompt('Template name:', 'Template ' + new Date().toLocaleString());
      if (!name) return;
      if (Utils.safeLocalStorageAvailable()) {
        const list = JSON.parse(localStorage.getItem('prt_templates') || '[]');
        list.push({ name, date: new Date().toISOString(), data: tpl });
        localStorage.setItem('prt_templates', JSON.stringify(list));
        Utils.showToast('Template saved');
      } else {
        Utils.downloadJson(`plot-template-${Date.now()}.json`, { name, date: new Date().toISOString(), data: tpl });
        Utils.showToast('Template downloaded');
      }
    }
    _openTemplateModal() {
      const backdrop = Utils.createElement('div', { className:'prt-modal-backdrop' });
      const modal = Utils.createElement('div', { className:'prt-modal' });
      const header = Utils.createElement('div', { className:'prt-modal-header' });
      header.appendChild(Utils.createElement('h3', { textContent:'Templates' }));
      header.appendChild(Utils.createElement('button', { className:'prt-panel-close', textContent:'✕', onClick:() => backdrop.remove() }));
      modal.appendChild(header);
      const body = Utils.createElement('div', { className:'prt-modal-body' });
      const importBtn = Utils.createElement('button', { className:'prt-btn prt-btn-outline prt-btn-block', textContent:'Import Template JSON', onClick:() => this._importTemplateFile() });
      body.appendChild(importBtn);
      const list = Utils.safeLocalStorageAvailable() ? JSON.parse(localStorage.getItem('prt_templates') || '[]') : [];
      if (!list.length) {
        body.appendChild(Utils.createElement('p', { textContent: Utils.safeLocalStorageAvailable()?'No templates saved yet.':'localStorage not available. Use Import.', style:{color:'#64748b', marginTop:'12px'} }));
      } else {
        list.forEach((t, idx) => {
          const row = Utils.createElement('div', { style:{display:'flex', justifyContent:'space-between', gap:'10px', padding:'10px', border:'1px solid #e5e7eb', borderRadius:'10px', marginTop:'10px'} });
          row.appendChild(Utils.createElement('div', { innerHTML:`<strong>${Utils.escapeXml(t.name)}</strong><br><small style="color:#94a3b8">${new Date(t.date).toLocaleString()}</small>` }));
          const btns = Utils.createElement('div', { style:{display:'flex', gap:'6px', flexWrap:'wrap'} });
          btns.appendChild(Utils.createElement('button', { className:'prt-btn prt-btn-primary prt-btn-sm', textContent:'Load', onClick:() => { this._loadTemplate(t.data); backdrop.remove(); } }));
          btns.appendChild(Utils.createElement('button', { className:'prt-btn prt-btn-danger prt-btn-sm', textContent:'Delete', onClick:() => { list.splice(idx,1); localStorage.setItem('prt_templates', JSON.stringify(list)); row.remove(); } }));
          row.appendChild(btns);
          body.appendChild(row);
        });
      }
      modal.appendChild(body);
      backdrop.appendChild(modal);
      document.body.appendChild(backdrop);
    }
    _importTemplateFile() {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'application/json,.json';
      inp.onchange = async () => {
        const f = inp.files?.[0]; if (!f) return;
        try {
          const text = await f.text();
          const parsed = JSON.parse(text);
          const tpl = parsed.data || parsed;
          if (!tpl || !Array.isArray(tpl.pages)) throw new Error('Invalid template structure');
          this._loadTemplate(tpl); Utils.showToast('Template imported');
        } catch (e) { console.error(e); Utils.showToast('Invalid template JSON'); }
      };
      inp.click();
    }
    _loadTemplate(tpl) {
      try {
        if (!tpl || !Array.isArray(tpl.pages)) throw new Error('Invalid template');
        this.pageSize = tpl.pageSize || 'A4 Portrait';
        this.pageDims = tpl.pageDims || { ...PAGE_SIZES[this.pageSize] };
        this.pages = tpl.pages.map(p => ({ elements: (p.elements || []).map(e => ({ ...e, id: Utils.uid() })) }));
        this.currentPageIndex = 0;
        this.pages.forEach(p => {
          p.elements.forEach(el => {
            if (el.type === 'sketch' && el.svgContent === '__SKETCH__') {
              el.polygonsRef = this.polygonsData;
              const r = new SketchRenderer();
              el.svgContent = r.render(this.polygonsData, el.width, el.height, el.sketchOptions || {});
            }
            if (el.type === 'qr' && el.qrDataUrl === '__QR__') {
              el.qrDataUrl = el.qrData ? Utils.generateQRDataUrlUtf8(el.qrData, Math.round(el.width||180)) : '';
            }
            if (el.binding === 'plotDetails') {
              el.polygonsRef = this.polygonsData;
              el.text = this._buildDetailsText(this.polygonsData, el.detailsConfig || []);
            }
          });
        });
        this._refreshPageSelect(); this._fitToScreen(); this._selectElement(null); this._renderAll(); this._commitHistoryNow('load-template');
        Utils.showToast('Template loaded');
      } catch (e) { console.error('[PRT] Template load failed:', e); Utils.showToast('Invalid template'); }
    }

    // ---------- Page Modal ----------
    _openPageModal() {
      const backdrop = Utils.createElement('div', { className:'prt-modal-backdrop' });
      const modal = Utils.createElement('div', { className:'prt-modal' });
      const header = Utils.createElement('div', { className:'prt-modal-header' });
      header.appendChild(Utils.createElement('h3', { textContent:'Page Setup' }));
      header.appendChild(Utils.createElement('button', { className:'prt-panel-close', textContent:'✕', onClick:() => backdrop.remove() }));
      modal.appendChild(header);
      const body = Utils.createElement('div', { className:'prt-modal-body' });
      const sel = Utils.createElement('select', { className:'prt-select' });
      Object.keys(PAGE_SIZES).forEach(name => { const opt = Utils.createElement('option', { value:name, textContent:`${name} (${PAGE_SIZES[name].w}×${PAGE_SIZES[name].h} mm)` }); if (name === this.pageSize) opt.selected = true; sel.appendChild(opt); });
      body.appendChild(Utils.createElement('label', { textContent:'Page size:', style:{fontWeight:'800', display:'block', marginBottom:'6px'} }));
      body.appendChild(sel);
      const customWrap = Utils.createElement('div', { style:{marginTop:'12px', display: this.pageSize==='Custom'?'block':'none'} });
      const wInput = Utils.createElement('input', { className:'prt-input', type:'number', value:this.pageDims.w });
      const hInput = Utils.createElement('input', { className:'prt-input', type:'number', value:this.pageDims.h, style:{marginTop:'8px'} });
      customWrap.appendChild(Utils.createElement('label', { textContent:'Custom width (mm):', style:{fontWeight:'800', display:'block', marginBottom:'6px'} }));
      customWrap.appendChild(wInput);
      customWrap.appendChild(Utils.createElement('label', { textContent:'Custom height (mm):', style:{fontWeight:'800', display:'block', marginTop:'10px', marginBottom:'6px'} }));
      customWrap.appendChild(hInput);
      body.appendChild(customWrap);
      sel.addEventListener('change', () => { customWrap.style.display = sel.value==='Custom'?'block':'none'; });
      modal.appendChild(body);
      const footer = Utils.createElement('div', { className:'prt-modal-footer' });
      footer.appendChild(Utils.createElement('button', { className:'prt-btn prt-btn-outline', textContent:'Cancel', onClick:() => backdrop.remove() }));
      footer.appendChild(Utils.createElement('button', { className:'prt-btn prt-btn-primary', textContent:'Apply', onClick:() => {
        this.pageSize = sel.value;
        this.pageDims = sel.value==='Custom' ? { w: parseFloat(wInput.value)||210, h: parseFloat(hInput.value)||297 } : { ...PAGE_SIZES[sel.value] };
        this._fitToScreen(); this._renderAll(); this._commitHistoryNow('page-size'); backdrop.remove();
      } }));
      modal.appendChild(footer);
      backdrop.appendChild(modal);
      document.body.appendChild(backdrop);
    }

    // ---------- Projection Modal ----------
    _openProjectionModal() {
      const backdrop = Utils.createElement('div', { className:'prt-modal-backdrop' });
      const modal = Utils.createElement('div', { className:'prt-modal' });
      const header = Utils.createElement('div', { className:'prt-modal-header' });
      header.appendChild(Utils.createElement('h3', { textContent:'Measurement Projection' }));
      header.appendChild(Utils.createElement('button', { className:'prt-panel-close', textContent:'✕', onClick:() => backdrop.remove() }));
      modal.appendChild(header);
      const body = Utils.createElement('div', { className:'prt-modal-body' });
      body.appendChild(Utils.createElement('p', { textContent:'Choose the projection used for distance and area calculations. UTM zones give accurate meters for your region.', style:{fontSize:'13px', color:'#64748b'} }));
      const sel = Utils.createElement('select', { className:'prt-select' });
      CONFIG.projectionOptions.forEach(o => { const opt = Utils.createElement('option', { value:o.code, textContent:`${o.code} — ${o.name}` }); if (o.code === CURRENT_PROJECTION) opt.selected = true; sel.appendChild(opt); });
      body.appendChild(sel);
      body.appendChild(Utils.createElement('label', { textContent:'Or enter custom EPSG code:', style:{fontWeight:'800', display:'block', marginTop:'12px', marginBottom:'6px'} }));
      const customInput = Utils.createElement('input', { className:'prt-input', type:'text', placeholder:'e.g. EPSG:32644', value: CURRENT_PROJECTION });
      body.appendChild(customInput);
      modal.appendChild(body);
      const footer = Utils.createElement('div', { className:'prt-modal-footer' });
      footer.appendChild(Utils.createElement('button', { className:'prt-btn prt-btn-outline', textContent:'Cancel', onClick:() => backdrop.remove() }));
      footer.appendChild(Utils.createElement('button', { className:'prt-btn prt-btn-primary', textContent:'Apply', onClick:() => {
        const newProj = customInput.value.trim() || sel.value;
        try { ol.proj.get(newProj); } catch(_) { return Utils.showToast('Invalid projection code'); }
        CURRENT_PROJECTION = newProj;
        // Re-project all polygon data
        if (this.polygonsData) {
          const mapProj = Projection.getMapProjection();
          this.polygonsData.forEach(p => {
            p.coordsProj = (p.coords || []).map(ring => ring.map(c => {
              try { return ol.proj.transform(c, 'EPSG:4326', newProj); } catch(_){ return c; }
            }));
          });
        }
        // Regenerate all sketches
        this.pages.forEach(p => p.elements.forEach(el => { if (el.type === 'sketch') this._regenSketch(el); }));
        this._renderAll(); this._commitHistoryNow('projection-change');
        Utils.showToast(`Projection: ${newProj}`); backdrop.remove();
      } }));
      modal.appendChild(footer);
      backdrop.appendChild(modal);
      document.body.appendChild(backdrop);
    }

    // ---------- Keyboard ----------
    _handleKeyDown(e) {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key.toLowerCase() === 'z') { e.preventDefault(); this._undo(); }
      if (ctrl && e.key.toLowerCase() === 'y') { e.preventDefault(); this._redo(); }
      if (ctrl && e.key.toLowerCase() === 's') { e.preventDefault(); this._saveTemplate(); }
      if (e.key === 'Escape') { if (this._linePreviewElId) { const pending=this.elements.find(x=>x.id===this._linePreviewElId); if (pending) { this.selectedElement=pending; this._deleteSelected(); } } this._lineFirstClick = null; this._linePreviewElId = null; this._setTool(null); this._selectElement(null); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectedElement && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault(); this._deleteSelected();
      }
    }

    // ============================================================
    // VECTOR PDF GENERATION
    // ============================================================
    async _generatePDF() {
      const savedIndex = this.currentPageIndex;
      const savedSelected = this.selectedElement;
      try {
        if (!window.jspdf) return Utils.showToast('jsPDF not loaded');
        if (typeof window.jspdf.jsPDF?.API?.svg !== 'function') {
          throw new Error('SVG-to-PDF renderer did not load');
        }
        const { jsPDF } = window.jspdf;
        Utils.showToast('Generating vector PDF…', 2000);

        const orientation = this.pageDims.w > this.pageDims.h ? 'landscape' : 'portrait';
        const pdf = new jsPDF({ orientation, unit:'mm', format:[this.pageDims.w, this.pageDims.h] });
        this._selectElement(null);

        for (let pIndex = 0; pIndex < this.pages.length; pIndex++) {
          if (pIndex > 0) pdf.addPage([this.pageDims.w, this.pageDims.h], orientation);
          this.currentPageIndex = pIndex;
          this._refreshPageSelect();
          const pageSvg = this._createPageSVG(this.pages[pIndex]);
          await this._rasterizePDFText(pageSvg);
          await pdf.svg(pageSvg, { x:0, y:0, width:this.pageDims.w, height:this.pageDims.h });
        }
        pdf.save('plot-report.pdf');
        Utils.showToast('PDF ready');
      } catch (e) {
        console.error('[PRT] PDF error:', e);
        Utils.showToast(`PDF failed: ${e.message || 'vector export error'}`);
      } finally {
        this.currentPageIndex = savedIndex;
        this._refreshPageSelect();
        this._renderAll();
        if (savedSelected) this._selectElement(this.elements.find(e => e.id === savedSelected.id) || null);
      }
    }

    _createPageSVG(page) {
      if (!page) throw new Error('Report page is missing');
      const ns = 'http://www.w3.org/2000/svg';
      const pW = Utils.mm2px(this.pageDims.w);
      const pH = Utils.mm2px(this.pageDims.h);
      const svg = document.createElementNS(ns, 'svg');
      svg.setAttribute('xmlns', ns);
      svg.setAttribute('width', `${this.pageDims.w}mm`);
      svg.setAttribute('height', `${this.pageDims.h}mm`);
      svg.setAttribute('viewBox', `0 0 ${pW} ${pH}`);
      svg.setAttribute('font-family', "'Noto Sans Telugu','Noto Sans',Arial,sans-serif");
      const background = document.createElementNS(ns, 'rect');
      background.setAttribute('width', String(pW));
      background.setAttribute('height', String(pH));
      background.setAttribute('fill', '#ffffff');
      svg.appendChild(background);

      page.elements.filter(el => el.visible).forEach(el => {
        const w = Math.max(2, Number(el.width) || 2);
        const h = Math.max(2, Number(el.height) || 2);
        const group = document.createElementNS(ns, 'g');
        group.setAttribute('transform', `translate(${el.x + w/2} ${el.y + h/2}) rotate(${el.rotation||0}) translate(${-w/2} ${-h/2})`);
        this._appendPDFElement(group, el, w, h, ns);
        svg.appendChild(group);
      });
      return svg;
    }

    async _rasterizePDFText(svg) {
      const groups=Array.from(svg.children).filter(node=>node.localName==='g');
      const needsTeluguRasterization=text=>/[\u0c00-\u0c7f]/u.test(text.textContent||'');
      if(!groups.some(group=>Array.from(group.querySelectorAll('text')).some(needsTeluguRasterization)))return;
      svg.style.cssText='position:fixed;left:-100000px;top:0;opacity:0;pointer-events:none;';
      document.body.appendChild(svg);
      try {
        const textNodes=groups.flatMap(group=>Array.from(group.querySelectorAll('text')).filter(needsTeluguRasterization));
        const fontLoads=textNodes.map(text=>{
          const style=getComputedStyle(text);
          return document.fonts.load(style.font, text.textContent||' ');
        });
        await Promise.all(fontLoads);
        await document.fonts.ready;

        const resolution=2;
        for(const group of groups) {
          const texts=Array.from(group.querySelectorAll('text')).filter(needsTeluguRasterization);
          if(!texts.length)continue;
          const groupMatrix=group.getScreenCTM();
          if(!groupMatrix)throw new Error('Could not measure text in PDF page');
          const groupInverse=groupMatrix.inverse();
          const runs=[];
          let bounds=null;
          const includeBounds=(x,y)=>{
            if(!bounds)bounds={minX:x,minY:y,maxX:x,maxY:y};
            else {
              bounds.minX=Math.min(bounds.minX,x);bounds.minY=Math.min(bounds.minY,y);
              bounds.maxX=Math.max(bounds.maxX,x);bounds.maxY=Math.max(bounds.maxY,y);
            }
          };
          for(const text of texts) {
            const textMatrix=text.getScreenCTM();
            if(!textMatrix)continue;
            const matrix=groupInverse.multiply(textMatrix);
            const box=text.getBBox();
            const corners=[
              new DOMPoint(box.x,box.y),new DOMPoint(box.x+box.width,box.y),
              new DOMPoint(box.x,box.y+box.height),new DOMPoint(box.x+box.width,box.y+box.height)
            ].map(point=>point.matrixTransform(matrix));
            corners.forEach(point=>includeBounds(point.x,point.y));
            let characterIndex=0;
            const walker=document.createTreeWalker(text,NodeFilter.SHOW_TEXT);
            while(walker.nextNode()) {
              const node=walker.currentNode,content=node.nodeValue||'';
              if(content.trim()) {
                let position;
                try { position=text.getStartPositionOfChar(characterIndex); }
                catch { position={x:Number(text.getAttribute('x'))||0,y:Number(text.getAttribute('y'))||0}; }
                runs.push({text:content,position,matrix,style:getComputedStyle(node.parentElement||text),element:node.parentElement||text});
              }
              characterIndex+=content.length;
            }
          }
          if(!bounds||!runs.length)continue;
          const padding=2;
          const x=bounds.minX-padding,y=bounds.minY-padding;
          const width=Math.max(1,bounds.maxX-bounds.minX+padding*2);
          const height=Math.max(1,bounds.maxY-bounds.minY+padding*2);
          const canvas=document.createElement('canvas');
          canvas.width=Math.ceil(width*resolution);
          canvas.height=Math.ceil(height*resolution);
          const context=canvas.getContext('2d');
          if(!context)throw new Error('Could not create PDF text canvas');
          for(const run of runs) {
            const m=run.matrix,style=run.style;
            context.setTransform(resolution*m.a,resolution*m.b,resolution*m.c,resolution*m.d,resolution*(m.e-x),resolution*(m.f-y));
            context.font=style.font;
            context.textAlign='left';
            context.textBaseline='alphabetic';
            context.direction=style.direction;
            if('letterSpacing' in context)context.letterSpacing=style.letterSpacing;
            let inheritedOpacity=1;
            for(let parent=run.element;parent&&parent!==group;parent=parent.parentElement) {
              inheritedOpacity*=Number(getComputedStyle(parent).opacity||1);
            }
            const opacity=inheritedOpacity*Number(style.opacity||1);
            if(style.fill&&style.fill!=='none') {
              context.fillStyle=style.fill;
              context.globalAlpha=opacity*Number(style.fillOpacity||1);
              context.fillText(run.text,run.position.x,run.position.y);
            }
            if(style.stroke&&style.stroke!=='none'&&Number(style.strokeWidth)>0) {
              context.strokeStyle=style.stroke;
              context.lineWidth=Number(style.strokeWidth);
              context.globalAlpha=opacity*Number(style.strokeOpacity||1);
              context.strokeText(run.text,run.position.x,run.position.y);
            }
          }
          const image=document.createElementNS(svg.namespaceURI,'image');
          image.setAttribute('x',String(x));image.setAttribute('y',String(y));
          image.setAttribute('width',String(width));image.setAttribute('height',String(height));
          image.setAttribute('href',canvas.toDataURL('image/png'));
          image.setAttribute('preserveAspectRatio','none');
          group.appendChild(image);
          texts.forEach(text=>text.remove());
        }
      } finally {
        svg.removeAttribute('style');
      }
    }

    _appendPDFElement(group, el, w, h, ns) {
      const add = (name, attrs, parent = group) => {
        const node = document.createElementNS(ns, name);
        Object.entries(attrs).forEach(([key, value]) => {
          if (value !== undefined && value !== null) node.setAttribute(key, String(value));
        });
        parent.appendChild(node);
        return node;
      };

      if (el.type === 'text') {
        const fontSize = Number(el.fontSize) || 14;
        const anchor = el.textAlign === 'center' ? 'middle' : el.textAlign === 'right' ? 'end' : 'start';
        const x = el.textAlign === 'center' ? w/2 : el.textAlign === 'right' ? w-4 : 4;
        const text = add('text', { x, y:fontSize+4, fill:el.color||'#111827', 'font-size':fontSize, 'font-weight':el.fontWeight||'normal', 'text-anchor':anchor, 'xml:space':'preserve' });
        String(el.text||'').split('\n').forEach((line, i) => {
          const span = add('tspan', { x, dy:i===0 ? 0 : fontSize*1.2 }, text);
          span.textContent = line || ' ';
        });
        return;
      }
      if (el.type === 'rect') {
        add('rect', { x:0, y:0, width:w, height:h, fill:el.fillColor && el.fillColor!=='transparent' ? el.fillColor : 'none', stroke:el.strokeColor||'#111827', 'stroke-width':el.strokeWidth||2 });
        return;
      }
      if (el.type === 'line' || el.type === 'arrow') {
        const dx = Number(el.lineDX) || 0, dy = Number(el.lineDY) || 0;
        const x1 = Math.abs(dx)<0.001 ? w/2 : dx<0 ? w : 0;
        const x2 = Math.abs(dx)<0.001 ? w/2 : dx<0 ? 0 : w;
        const y1 = dy<0 ? h : Math.abs(dy)<0.001 ? h/2 : 0;
        const y2 = dy<0 ? 0 : Math.abs(dy)<0.001 ? h/2 : h;
        const stroke = el.strokeColor||'#111827';
        add('line', { x1, y1, x2, y2, stroke, 'stroke-width':el.strokeWidth||2, 'stroke-linecap':'round' });
        if (el.type === 'arrow') {
          const angle = Math.atan2(y2-y1, x2-x1), size = Math.max(6, Number(el.strokeWidth||2)*4);
          const p1 = [x2-size*Math.cos(angle-Math.PI/6), y2-size*Math.sin(angle-Math.PI/6)];
          const p2 = [x2-size*Math.cos(angle+Math.PI/6), y2-size*Math.sin(angle+Math.PI/6)];
          add('path', { d:`M ${p1[0]} ${p1[1]} L ${x2} ${y2} L ${p2[0]} ${p2[1]}`, fill:'none', stroke, 'stroke-width':el.strokeWidth||2 });
        }
        return;
      }
      if (el.type === 'sketch') {
        const parsed = new DOMParser().parseFromString(el.svgContent||'', 'image/svg+xml');
        const source = parsed.documentElement;
        if (source.localName !== 'svg' || parsed.querySelector('parsererror')) throw new Error('Sketch SVG is invalid');
        const nested = add('svg', { x:0, y:0, width:w, height:h, viewBox:source.getAttribute('viewBox')||`0 0 ${w} ${h}`, preserveAspectRatio:'none' });
        Array.from(source.childNodes).forEach(node => nested.appendChild(document.importNode(node, true)));
        return;
      }

      if (el.type === 'qr') {
        if (el.qrDataUrl) add('image', { x:0, y:0, width:w, height:h, href:el.qrDataUrl, preserveAspectRatio:'xMidYMid meet' });
        return;
      }
      const plugin = PluginRegistry.getByElementType(el.type);
      if (plugin?.renderPDF) {
        const rendered = plugin.renderPDF(el);
        const sourceSvg = rendered?.matches?.('svg') ? rendered : rendered?.querySelector?.('svg');
        if (sourceSvg) {
          const nested = add('svg', { x:0, y:0, width:w, height:h, viewBox:sourceSvg.getAttribute('viewBox')||`0 0 ${w} ${h}`, preserveAspectRatio:sourceSvg.getAttribute('preserveAspectRatio')||'none' });
          Array.from(sourceSvg.childNodes).forEach(node => nested.appendChild(document.importNode(node, true)));
          return;
        }
        const image = rendered?.matches?.('img') ? rendered : rendered?.querySelector?.('img');
        if (image?.src) {
          add('image', { x:0, y:0, width:w, height:h, href:image.src, preserveAspectRatio:'xMidYMid meet' });
          return;
        }
      }
      throw new Error(`Unsupported report element: ${el.type}`);
    }

  }

  // ==========================================================================
  // MAP SELECTOR (with multi-polygon prompt)
  // ==========================================================================
  class MapSelector {
    constructor(tool) {
      this.tool = tool; this.map = null; this.selectedFeatures = []; this.sourceLayer = null;
      this.isActive=false;
      this.selectionLayer = null; this.highlightSource = null;
      this.bar = null; this.countEl = null;
      this.boxMode = false; this.dragBox = null; this._dragPanInteraction = null;
      this._hiddenPopups = []; this._popupObserver = null; this._backHandler = null;
      this._popupFlags = null; this._popupMapHandler = null;
    }
    start(layerName) {
      if(this.isActive)this.stop();
      this.map = this._findMap();
      if (!this.map) { Utils.showToast('Could not find OpenLayers map'); return false; }
      this.sourceLayer = this._findLayer(layerName);
      if (!this.sourceLayer) { Utils.showToast(`Layer "${layerName}" not found`); return false; }
      this.selectedFeatures = [];
      this.boxMode=false;
      this.isActive=true;
      this._suppressPopups(true);
      this._installBackButtonHandler();
      this._createHighlightLayer();
      this._createClickSelect();
      this._createDragBoxSelect();
      this._showSelectionBar();
      return true;
    }
    stop() {
      this.isActive=false;
      this._removeClickSelect();
      this._removeDragBoxSelect();
      this._removeHighlightLayer();
      this._suppressPopups(false);
      this._removeBackButtonHandler();
      this._hideSelectionBar();
    }
    _suppressPopups(suppress) {
      const selectors = '#feature-info-popup,#popup,#popup-content,.ol-popup,.ol-popup-content,.ol-tooltip,.feature-popup,.feature-popup-content,.popup-content,.ol-overlay-container .popup,.leaflet-popup';
      if (suppress) {
        if(this._popupObserver)return;
        this._popupFlags={
          prtPolygonSelectionActive:window.prtPolygonSelectionActive,
          msdDivisionActive:window.msdDivisionActive,
          stage14MeasureActive:window.stage14MeasureActive,
          s16PickerActive:window.s16PickerActive
        };
        window.prtPolygonSelectionActive=true;
        if(typeof window.closeFeaturePopup==='function')window.closeFeaturePopup();
        this.map?.getOverlays?.().forEach(overlay=>overlay.setPosition(undefined));
        this._popupMapHandler=()=>{
          this.map?.getOverlays?.().forEach(overlay=>overlay.setPosition(undefined));
          if(typeof window.closeFeaturePopup==='function')window.closeFeaturePopup();
        };
        this.map?.on('singleclick',this._popupMapHandler);
        document.body.classList.add('prt-polygon-selection');
        this._hiddenPopups = [];
        const hide = (el) => {
          if (!el || el.closest('.prt-selection-bar') || this._hiddenPopups.some(x => x.el === el)) return;
          this._hiddenPopups.push({el, visibility:el.style.visibility, pointerEvents:el.style.pointerEvents});
          el.style.visibility = 'hidden'; el.style.pointerEvents = 'none';
        };
        document.querySelectorAll(selectors).forEach(hide);
        this._popupObserver = new MutationObserver(() => document.querySelectorAll(selectors).forEach(hide));
        this._popupObserver.observe(document.body, {childList:true,subtree:true});
      } else {
        if(this._popupMapHandler)this.map?.un('singleclick',this._popupMapHandler);
        this._popupMapHandler=null;
        if(this._popupFlags) {
          window.prtPolygonSelectionActive=this._popupFlags.prtPolygonSelectionActive;
          window.msdDivisionActive=this._popupFlags.msdDivisionActive;
          window.stage14MeasureActive=this._popupFlags.stage14MeasureActive;
          window.s16PickerActive=this._popupFlags.s16PickerActive;
        } else {
          window.prtPolygonSelectionActive=false;
        }
        this._popupFlags=null;
        document.body.classList.remove('prt-polygon-selection');
        if (this._popupObserver) this._popupObserver.disconnect();
        this._popupObserver = null;
        this._hiddenPopups.forEach(x => { if (x.el?.isConnected) { x.el.style.visibility=x.visibility; x.el.style.pointerEvents=x.pointerEvents; } });
        this._hiddenPopups = [];
        if(typeof window.closeFeaturePopup==='function')window.closeFeaturePopup();
      }
    }
    _installBackButtonHandler() {
      if (this._backHandler) return;
      try { history.pushState({prtPolygonSelection:true}, '', location.href); } catch (_) {}
      this._backHandler = () => {
        if (!this.bar) return;
        this.stop();
        this.tool._hidePanel();
      };
      window.addEventListener('popstate', this._backHandler);
    }
    _removeBackButtonHandler() {
      if (this._backHandler) window.removeEventListener('popstate', this._backHandler);
      this._backHandler = null;
    }
    _findMap() {
      if (window.map && window.map instanceof ol.Map) return window.map;
      const allMaps = Object.values(window).filter(v => { try { return v instanceof ol.Map; } catch(e) { return false; } });
      if (allMaps.length) return allMaps[0];
      if (typeof map !== 'undefined' && map?.getView) return map;
      return null;
    }
    _findLayer(name) {
      let found = null;
      const scan = (layer) => {
        if (!layer || found) return;
        if (layer.getLayers) { layer.getLayers().forEach(sub => scan(sub)); return; }
        const title = layer.get && (layer.get('title') || layer.get('name') || '');
        if (title === name) found = layer;
      };
      this.map.getLayers().forEach(l => scan(l));
      return found;
    }
    _realSource(layer) {
      let src = layer?.getSource?.();
      let guard = 0;
      while (src && typeof src.getSource === 'function' && guard++ < 5) src = src.getSource();
      return src;
    }
    _createHighlightLayer() {
      this.highlightSource = new ol.source.Vector();
      this.selectionLayer = new ol.layer.Vector({
        source: this.highlightSource,
        style: new ol.style.Style({
          fill: new ol.style.Fill({ color:'rgba(37, 99, 235, 0.25)' }),
          stroke: new ol.style.Stroke({ color:'#2563eb', width:3 })
        }),
        zIndex: 999999
      });
      this.map.addLayer(this.selectionLayer);
    }
    _removeHighlightLayer() {
      if (this.selectionLayer) { this.map.removeLayer(this.selectionLayer); this.selectionLayer = null; }
      this.highlightSource = null;
    }
    _toggleFeature(feature) {
      const uid = ol.getUid(feature);
      const idx = this.selectedFeatures.findIndex(f => ol.getUid(f) === uid);
      if (idx >= 0) {
        this.selectedFeatures.splice(idx, 1);
        this.highlightSource.getFeatures().forEach(hf => { if (hf.get('_srcUid') === uid) this.highlightSource.removeFeature(hf); });
      } else {
        this.selectedFeatures.push(feature);
        const clone = feature.clone(); clone.set('_srcUid', uid);
        this.highlightSource.addFeature(clone);
      }
      this._updateCount();
    }
    _createClickSelect() {
      const self = this;
      this._clickHandler = function(evt) {
        if (self.boxMode) return;
        self.map.forEachFeatureAtPixel(evt.pixel, (feature, layer) => {
          if (!feature || layer !== self.sourceLayer) return;
          const t = feature.getGeometry?.()?.getType?.();
          if (t !== 'Polygon' && t !== 'MultiPolygon') return;
          self._toggleFeature(feature);
        }, { layerFilter: l => l === self.sourceLayer, hitTolerance: 10 });
      };
      this._pointerHandler = (evt) => {
        const hit = self.map.hasFeatureAtPixel(evt.pixel, { layerFilter: l => l === self.sourceLayer, hitTolerance: 10 });
        self.map.getTargetElement().style.cursor = self.boxMode ? 'crosshair' : (hit ? 'pointer' : '');
      };
      this.map.on('click', this._clickHandler);
      this.map.on('pointermove', this._pointerHandler);
    }
    _removeClickSelect() {
      if (this._clickHandler) this.map.un('click', this._clickHandler);
      if (this._pointerHandler) this.map.un('pointermove', this._pointerHandler);
      this._clickHandler = null; this._pointerHandler = null;
      if (this.map) this.map.getTargetElement().style.cursor = '';
    }
    _createDragBoxSelect() {
      const self = this;
      const interactions = this.map.getInteractions().getArray();
      this._dragPanInteraction = interactions.find(i => i instanceof ol.interaction.DragPan) || null;
      this.dragBox = new ol.interaction.DragBox({ condition: function(evt) { return self.boxMode || ol.events.condition.shiftKeyOnly(evt); } });
      this.map.addInteraction(this.dragBox);
      this.dragBox.on('boxend', function() {
        const extent = self.dragBox.getGeometry().getExtent();
        const src = self._realSource(self.sourceLayer);
        if (!src || typeof src.getFeaturesInExtent !== 'function') { Utils.showToast('Layer does not support box select'); return; }
        const feats = src.getFeaturesInExtent(extent) || [];
        feats.forEach(f => {
          const t = f.getGeometry?.()?.getType?.();
          if (t !== 'Polygon' && t !== 'MultiPolygon') return;
          const uid = ol.getUid(f);
          if (!self.selectedFeatures.some(x => ol.getUid(x) === uid)) self._toggleFeature(f);
        });
      });
      this.dragBox.on('boxstart', function() { try { self.map.getTargetElement().style.cursor = 'crosshair'; } catch(_){} });
    }
    _removeDragBoxSelect() {
      if (this.dragBox) { try { this.map.removeInteraction(this.dragBox); } catch(_){} this.dragBox = null; }
      if (this._dragPanInteraction) this._dragPanInteraction.setActive(true);
    }
    _showSelectionBar() {
      this.bar?.remove();
      this.bar = Utils.createElement('div', { className:'prt-selection-bar' });
      const info = Utils.createElement('div', { className:'prt-selection-bar-info' });
      info.appendChild(Utils.createElement('span', { textContent:'Select plots (Shift-drag for box)' }));
      this.countEl = Utils.createElement('span', { className:'prt-selection-count', textContent:'0 selected' });
      info.appendChild(this.countEl);
      const actions = Utils.createElement('div', { className:'prt-selection-bar-actions' });
      const boxBtn = Utils.createElement('button', { className:'prt-selection-toolbtn', title:'Box Select', textContent:'▭', onClick:() => {
        this.boxMode = !this.boxMode;
        boxBtn.classList.toggle('active', this.boxMode);
        if (this._dragPanInteraction) this._dragPanInteraction.setActive(!this.boxMode);
      } });
      const clearBtn = Utils.createElement('button', { className:'prt-selection-toolbtn', title:'Clear', textContent:'⟲', onClick:() => { this.selectedFeatures = []; this.highlightSource?.clear(); this._updateCount(); } });
      const cancelBtn = Utils.createElement('button', { className:'prt-selection-cancel', title:'Cancel', innerHTML:ICONS.cancel, onClick:() => { this.stop(); this.tool.showPanel('initial'); } });
      const confirmBtn = Utils.createElement('button', { className:'prt-selection-confirm', title:'Confirm', innerHTML:ICONS.check, onClick:() => {
        if (!this.selectedFeatures.length) return Utils.showToast('Select at least one polygon');
        const data = this._extractData();
        this.stop();
        if (data.length > 1) {
          this._showLayoutPrompt(data);
        } else {
          this.tool.onSelectionConfirmed(data, 'combined');
        }
      } });
      actions.append(boxBtn, clearBtn, cancelBtn, confirmBtn);
      this.bar.append(info, actions);
      document.body.appendChild(this.bar);
      requestAnimationFrame(() => this.bar.classList.add('visible'));
    }
    _hideSelectionBar() {
      if (!this.bar) return;
      const bar=this.bar;
      bar.classList.remove('visible');
      setTimeout(() => bar.remove(), 300);
      this.bar = null;
    }
    _updateCount() { if (this.countEl) this.countEl.textContent = `${this.selectedFeatures.length} selected`; }

    _showLayoutPrompt(data) {
      const backdrop = Utils.createElement('div', { className:'prt-modal-backdrop' });
      const modal = Utils.createElement('div', { className:'prt-modal' });
      const header = Utils.createElement('div', { className:'prt-modal-header' });
      header.appendChild(Utils.createElement('h3', { textContent:`${data.length} plots selected — choose layout` }));
      header.appendChild(Utils.createElement('button', { className:'prt-panel-close', textContent:'✕', onClick:() => backdrop.remove() }));
      modal.appendChild(header);
      const body = Utils.createElement('div', { className:'prt-modal-body', style:{display:'flex', gap:'12px'} });

      const combined = Utils.createElement('div', { className:'prt-layout-card' });
      combined.innerHTML = `<svg viewBox="0 0 60 60" fill="none" stroke="#2563eb" stroke-width="2"><rect x="4" y="4" width="52" height="52" rx="2"/><polygon points="12,20 28,14 40,24 36,42 20,38"/><polygon points="38,30 50,32 48,46 36,44"/></svg><div style="font-weight:800">Combined</div><div style="font-size:11px;color:#64748b">All plots on one sketch, one page</div>`;
      combined.onclick = () => { backdrop.remove(); this.tool.onSelectionConfirmed(data, 'combined'); };

      const perPage = Utils.createElement('div', { className:'prt-layout-card' });
      perPage.innerHTML = `<svg viewBox="0 0 60 60" fill="none" stroke="#2563eb" stroke-width="2"><rect x="4" y="4" width="36" height="48" rx="2"/><rect x="20" y="12" width="36" height="48" rx="2"/><polygon points="12,20 28,16 30,36 16,32"/></svg><div style="font-weight:800">One per Page</div><div style="font-size:11px;color:#64748b">${data.length} pages, one plot each</div>`;
      perPage.onclick = () => { backdrop.remove(); this.tool.onSelectionConfirmed(data, 'perPolygon'); };

      body.append(combined, perPage);
      modal.appendChild(body);
      backdrop.appendChild(modal);
      document.body.appendChild(backdrop);
    }

    _extractData() {
      const mapProj = this.map.getView().getProjection().getCode();
      return this.selectedFeatures.map((feature, idx) => {
        const geom = feature.getGeometry();
        let coords = [];        // LonLat (for display/QR)
        let coordsProj = [];    // projected meters (for measurements) — CRITICAL FIX

        const rings = [];
        if (geom.getType() === 'Polygon') {
          rings.push(...geom.getCoordinates());
        } else if (geom.getType() === 'MultiPolygon') {
          geom.getCoordinates().forEach(poly => poly.forEach(ring => rings.push(ring)));
        }

        rings.forEach(ring => {
          const lonLatRing = ring.map(c => { try { return ol.proj.toLonLat(c, mapProj); } catch(_){ return c; } });
          const projRing = ring.map(c => { try { return ol.proj.transform(c, mapProj, CURRENT_PROJECTION); } catch(_){ return c; } });
          coords.push(lonLatRing);
          coordsProj.push(projRing);
        });

        const props = feature.getProperties();
        const properties = {};
        Object.entries(props).forEach(([k, v]) => {
          if (k === 'geometry') return;
          if (v == null || typeof v === 'object') return;
          properties[k] = v;
        });
        return { coords, coordsProj, properties, index: idx };
      });
    }
  }

  // ==========================================================================
  // MAIN TOOL
  // ==========================================================================
  class PlotReportTool {
    constructor() {
      this.panel = null; this.mainBtn = null;
      this.mapSelector = new MapSelector(this);
      this.sketchRenderer = new SketchRenderer();
      this.designer = new DesignerCanvas(this);
      this.selectedLayer = null; this.polygonsData = null; this.sketchSVG = null;
      this._init();
    }
    async _init() {
      const style = document.createElement('style');
      style.textContent = STYLES;
      document.head.appendChild(style);
      await DependencyLoader.loadAll();
      this._createMainButton();
    }
    _createMainButton() {
      this.mainBtn = Utils.createElement('button', { className:'prt-main-btn', innerHTML:ICONS.plot, title:'Plot Report Tool', onClick:() => {
        if(this.mapSelector.isActive) {
          this.mapSelector.stop();
          this.showPanel('initial');
          return;
        }
        this.showPanel('initial');
      } });
      document.body.appendChild(this.mainBtn);
    }
    showPanel(state) {
      this._hidePanel();
      this.panel = Utils.createElement('div', { className:'prt-panel' });
      if (state === 'initial') this._buildInitialPanel();
      if (state === 'preview') this._buildPreviewPanel();
      document.body.appendChild(this.panel);
      const panel=this.panel;
      requestAnimationFrame(()=>{if(this.panel===panel)panel.classList.add('open');});
    }
    _hidePanel() {
      const panel=this.panel;
      if(!panel)return;
      panel.classList.remove('open');
      setTimeout(()=>panel.remove(),300);
      this.panel=null;
    }
    _buildInitialPanel() {
      const header = Utils.createElement('div', { className:'prt-panel-header' });
      header.appendChild(Utils.createElement('h2', { textContent:'Plot Report Tool' }));
      header.appendChild(Utils.createElement('button', { className:'prt-panel-close', textContent:ICONS.close, onClick:() => this._hidePanel() }));
      this.panel.appendChild(header);
      const body = Utils.createElement('div', { className:'prt-panel-body' });
      const layerGroup = Utils.createElement('div', { className:'prt-form-group' });
      layerGroup.appendChild(Utils.createElement('label', { textContent:'Select Layer' }));
      const layerSelect = Utils.createElement('select', { className:'prt-select' });
      layerSelect.appendChild(Utils.createElement('option', { value:'', textContent:'-- Choose a layer --' }));
      const layers = this._getMapLayers();
      layers.forEach(l => layerSelect.appendChild(Utils.createElement('option', { value:l.name, textContent:l.name })));
      layerGroup.appendChild(layerSelect);
      body.appendChild(layerGroup);

      const projGroup = Utils.createElement('div', { className:'prt-form-group' });
      projGroup.appendChild(Utils.createElement('label', { textContent:'Measurement Projection' }));
      const projSelect = Utils.createElement('select', { className:'prt-select' });
      CONFIG.projectionOptions.forEach(o => { const opt = Utils.createElement('option', { value:o.code, textContent:`${o.code} — ${o.name}` }); if (o.code === CURRENT_PROJECTION) opt.selected = true; projSelect.appendChild(opt); });
      projSelect.addEventListener('change', () => { CURRENT_PROJECTION = projSelect.value; Utils.showToast(`Projection: ${CURRENT_PROJECTION}`); });
      projGroup.appendChild(projSelect);
      body.appendChild(projGroup);

      body.appendChild(Utils.createElement('p', { textContent:'Select a polygon layer and press Start. Shift-drag for rectangular selection.', style:{fontSize:'13px', color:'#6b7280', lineHeight:'1.5'} }));
      body.appendChild(Utils.createElement('button', { className:'prt-btn prt-btn-primary prt-btn-block', innerHTML:`${ICONS.select} Start Map Selection`, onClick:() => {
        const layerName = layerSelect.value;
        if (!layerName) return Utils.showToast('Select a layer first');
        this.selectedLayer = layerName;
        if(this.mapSelector.start(layerName))this._hidePanel();
      } }));
      this.panel.appendChild(body);
    }
    _buildPreviewPanel() {
      const header = Utils.createElement('div', { className:'prt-panel-header' });
      header.appendChild(Utils.createElement('h2', { textContent:'Sketch Preview' }));
      header.appendChild(Utils.createElement('button', { className:'prt-panel-close', textContent:ICONS.close, onClick:() => this._hidePanel() }));
      this.panel.appendChild(header);
      const body = Utils.createElement('div', { className:'prt-panel-body' });
      const preview = Utils.createElement('div', { className:'prt-sketch-preview' });
      preview.innerHTML = this.sketchSVG || '<p>No sketch available</p>';
      body.appendChild(preview);
      const count = this.polygonsData?.length || 0;
      body.appendChild(Utils.createElement('p', { innerHTML:`<strong>${count}</strong> polygon${count!==1?'s':''} selected`, style:{fontSize:'14px', color:'#374151', margin:'0 0 10px'} }));
      if (this.polygonsData?.length) {
        const props = this.polygonsData[0].properties || {};
        const table = Utils.createElement('table', { className:'prt-attr-table' });
        Object.entries(props).forEach(([k, v]) => {
          if (v == null || k === 'geometry' || typeof v === 'object') return;
          const tr = Utils.createElement('tr');
          tr.appendChild(Utils.createElement('th', { textContent: k }));
          tr.appendChild(Utils.createElement('td', { textContent: String(v) }));
          table.appendChild(tr);
        });
        body.appendChild(table);
      }
      body.appendChild(Utils.createElement('button', { className:'prt-btn prt-btn-primary prt-btn-block', innerHTML:`${ICONS.template} Open Report Designer`, onClick:() => { this._hidePanel(); this.designer.open(this.sketchSVG, this.polygonsData, this._layoutMode || 'combined'); } }));
      body.appendChild(Utils.createElement('button', { className:'prt-btn prt-btn-outline prt-btn-block', textContent:'← Select Different Plots', style:{marginTop:'8px'}, onClick:() => this.showPanel('initial') }));
      this.panel.appendChild(body);
    }
    _getMapLayers() {
      const layers = [];
      try {
        const map = this.mapSelector._findMap();
        if (!map) return layers;
        const scan = (layer) => {
          if (!layer) return;
          if (layer.getLayers) { layer.getLayers().forEach(sub => scan(sub)); return; }
          const name = layer.get('title') || layer.get('name') || '';
          if (name && layer instanceof ol.layer.Vector) layers.push({ name, layer });
        };
        map.getLayers().forEach(l => scan(l));
      } catch (e) { console.warn('[PRT] Layer fetch error:', e); }
      return layers;
    }
    onSelectionConfirmed(polygonsData, layoutMode = 'combined') {
      this.polygonsData = polygonsData;
      this._layoutMode = layoutMode;
      this.sketchSVG = this.sketchRenderer.render(polygonsData, 520, 420, {});
      this.showPanel('preview');
    }
  }

  // ==========================================================================
  // INIT
  // ==========================================================================
  function initPlotReportTool() {
    if (typeof ol === 'undefined') { console.warn('[PRT] Waiting for OpenLayers...'); setTimeout(initPlotReportTool, 1000); return; }
    window.plotReportTool = new PlotReportTool();
    // Expose plugin API
    window.PlotReportTool = { registerPlugin: (p) => PluginRegistry.register(p) };
    console.log('[PRT] v3.0 loaded. Register plugins via window.PlotReportTool.registerPlugin({...})');
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(initPlotReportTool, 500));
  } else {
    setTimeout(initPlotReportTool, 500);
  }

  // ==========================================================================
  // ========================  BUILT-IN PLUGINS  ==============================
  // ==========================================================================
  // Each plugin is standalone — delete any to remove the feature.
  // Add new plugins at the very bottom using the same pattern.
  // ==========================================================================

  // --- PLUGIN: IMAGE / PHOTO ---
  function registerImagePlugin() {
    if (!window.PlotReportTool) { setTimeout(registerImagePlugin, 300); return; }
    window.PlotReportTool.registerPlugin({
      name: 'image',
      elementType: 'image',
      toolbar: {
        icon: ICONS.image,
        label: 'Image',
        action: (designer) => {
          const inp = document.createElement('input');
          inp.type = 'file'; inp.accept = 'image/*';
          inp.onchange = async () => {
            const f = inp.files?.[0]; if (!f) return;
            const reader = new FileReader();
            reader.onload = () => {
              const pW = Utils.mm2px(designer.pageDims.w);
              const el = designer._addElement({
                type: 'image', name: 'Image',
                x: 40, y: 100, width: 200, height: 150,
                imageData: reader.result, objectFit: 'contain'
              });
              designer._selectElement(el);
              designer._commitHistory('add-image');
            };
            reader.readAsDataURL(f);
          };
          inp.click();
        }
      },
      renderDOM: (el, scale) => {
        const d = document.createElement('div');
        d.className = 'prt-image-element';
        d.style.cssText = 'width:100%;height:100%;pointer-events:none;';
        const img = document.createElement('img');
        img.src = el.imageData || '';
        img.style.cssText = `width:100%;height:100%;object-fit:${el.objectFit||'contain'};`;
        d.appendChild(img);
        return d;
      },
      renderPDF: (el) => {
        const d = document.createElement('div');
        d.style.cssText = 'width:100%;height:100%;';
        const img = document.createElement('img');
        img.src = el.imageData || '';
        img.style.cssText = `width:100%;height:100%;object-fit:${el.objectFit||'contain'};`;
        d.appendChild(img);
        return d;
      },
      properties: (el, body, designer) => {
        designer._addPropsSection(body, 'Image', (content) => {
          designer._addSelectRow(content, 'Fit', el.objectFit||'contain', [['contain','Contain'],['cover','Cover'],['fill','Stretch']], v => { el.objectFit = v; designer._renderElement(el); designer._commitHistory('prop'); });
          content.appendChild(Utils.createElement('button', { className:'prt-btn prt-btn-outline prt-btn-sm prt-btn-block', textContent:'Replace Image', style:{marginTop:'6px'}, onClick:() => {
            const inp = document.createElement('input'); inp.type='file'; inp.accept='image/*';
            inp.onchange = () => { const f=inp.files?.[0]; if (!f) return; const r=new FileReader(); r.onload=()=>{ el.imageData=r.result; designer._renderElement(el); designer._commitHistory('img-replace'); }; r.readAsDataURL(f); };
            inp.click();
          } }));
        });
      }
    });
  }

  // --- PLUGIN: SCALE BAR ---
  function registerScaleBarPlugin() {
    if (!window.PlotReportTool) { setTimeout(registerScaleBarPlugin, 300); return; }
    window.PlotReportTool.registerPlugin({
      name: 'scalebar',
      elementType: 'scalebar',
      toolbar: {
        icon: ICONS.scalebar, label: 'ScaleBar',
        action: (designer) => {
          const el = designer._addElement({
            type:'scalebar', name:'Scale Bar',
            x:40, y:200, width:160, height:30,
            scaleUnit:'m', scaleLength:100, scaleColor:'#111827'
          });
          designer._selectElement(el);
          designer._commitHistory('add-scalebar');
        }
      },
      renderDOM: (el, scale) => {
        const d = document.createElement('div');
        d.style.cssText = 'width:100%;height:100%;pointer-events:none;';
        d.innerHTML = buildScaleBarSVG(el);
        return d;
      },
      renderPDF: (el) => {
        const d = document.createElement('div');
        d.style.cssText = 'width:100%;height:100%;';
        d.innerHTML = buildScaleBarSVG(el);
        return d;
      },
      properties: (el, body, designer) => {
        designer._addPropsSection(body, 'Scale Bar', (content) => {
          designer._addSelectRow(content, 'Unit', el.scaleUnit||'m', [['m','Meters'],['km','Kilometers'],['ft','Feet'],['mi','Miles']], v => { el.scaleUnit=v; designer._renderElement(el); designer._commitHistory('prop'); });
          designer._addNumRow(content, 'Length', el.scaleLength||100, v => { el.scaleLength=v; designer._renderElement(el); designer._commitHistory('prop'); });
          designer._addColorRow(content, 'Color', el.scaleColor||'#111827', v => { el.scaleColor=v; designer._renderElement(el); designer._commitHistory('prop'); });
        });
      }
    });
    function buildScaleBarSVG(el) {
      const w = el.width, h = el.height, color = el.scaleColor || '#111827';
      const label = el.scaleLength + ' ' + (el.scaleUnit || 'm');
      const barY = h * 0.6;
      return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" preserveAspectRatio="none">
        <line x1="4" y1="${barY}" x2="${w-4}" y2="${barY}" stroke="${color}" stroke-width="2"/>
        <line x1="4" y1="${barY-5}" x2="4" y2="${barY+5}" stroke="${color}" stroke-width="2"/>
        <line x1="${(w-4)/2}" y1="${barY-3}" x2="${(w-4)/2}" y2="${barY+3}" stroke="${color}" stroke-width="1.5"/>
        <line x1="${w-4}" y1="${barY-5}" x2="${w-4}" y2="${barY+5}" stroke="${color}" stroke-width="2"/>
        <text x="${w/2}" y="${barY-8}" text-anchor="middle" font-size="11" fill="${color}" font-family="Arial">${label}</text>
      </svg>`;
    }
  }

  // --- PLUGIN: NORTH ARROW ---
  function registerNorthArrowPlugin() {
    if (!window.PlotReportTool) { setTimeout(registerNorthArrowPlugin, 300); return; }
    window.PlotReportTool.registerPlugin({
      name: 'northarrow',
      elementType: 'northarrow',
      toolbar: {
        icon: ICONS.north, label: 'North',
        action: (designer) => {
          const el = designer._addElement({
            type:'northarrow', name:'North Arrow',
            x:30, y:30, width:60, height:80,
            arrowStyle:'classic', arrowColor:'#111827'
          });
          designer._selectElement(el);
          designer._commitHistory('add-north');
        }
      },
      renderDOM: (el) => { const d = document.createElement('div'); d.style.cssText='width:100%;height:100%;pointer-events:none;'; d.innerHTML = buildNorthSVG(el); return d; },
      renderPDF: (el) => { const d = document.createElement('div'); d.style.cssText='width:100%;height:100%;'; d.innerHTML = buildNorthSVG(el); return d; },
      properties: (el, body, designer) => {
        designer._addPropsSection(body, 'North Arrow', (content) => {
          designer._addSelectRow(content, 'Style', el.arrowStyle||'classic', [['classic','Classic'],['simple','Simple'],['compass','Compass']], v => { el.arrowStyle=v; designer._renderElement(el); designer._commitHistory('prop'); });
          designer._addColorRow(content, 'Color', el.arrowColor||'#111827', v => { el.arrowColor=v; designer._renderElement(el); designer._commitHistory('prop'); });
        });
      }
    });
    function buildNorthSVG(el) {
      const w = el.width, h = el.height, color = el.arrowColor || '#111827';
      const style = el.arrowStyle || 'classic';
      if (style === 'simple') {
        return `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
          <polygon points="30,8 20,55 30,45 40,55" fill="${color}"/>
          <text x="30" y="72" text-anchor="middle" font-size="12" font-weight="bold" fill="${color}" font-family="Arial">N</text>
        </svg>`;
      }
      if (style === 'compass') {
        return `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
          <circle cx="30" cy="40" r="28" fill="none" stroke="${color}" stroke-width="1.5"/>
          <polygon points="30,14 24,42 30,38 36,42" fill="${color}"/>
          <polygon points="30,66 24,38 30,42 36,38" fill="none" stroke="${color}" stroke-width="1"/>
          <text x="30" y="12" text-anchor="middle" font-size="10" font-weight="bold" fill="${color}">N</text>
          <text x="30" y="78" text-anchor="middle" font-size="8" fill="${color}">S</text>
          <text x="54" y="43" text-anchor="middle" font-size="8" fill="${color}">E</text>
          <text x="6" y="43" text-anchor="middle" font-size="8" fill="${color}">W</text>
        </svg>`;
      }
      // classic
      return `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
        <polygon points="30,10 18,55 30,45" fill="${color}"/>
        <polygon points="30,10 42,55 30,45" fill="none" stroke="${color}" stroke-width="1.5"/>
        <text x="30" y="72" text-anchor="middle" font-size="12" font-weight="bold" fill="${color}" font-family="Arial">N</text>
      </svg>`;
    }
  }

  // --- PLUGIN: MINI LOCATION MAP (OSM tiles) ---
  function registerMiniMapPlugin() {
    if (!window.PlotReportTool) { setTimeout(registerMiniMapPlugin, 300); return; }
    window.PlotReportTool.registerPlugin({
      name: 'minimap',
      elementType: 'minimap',
      renderDOM: (el) => {
        const d = document.createElement('div');
        d.style.cssText='width:100%;height:100%;pointer-events:none;background:#f3f4f6;overflow:hidden;position:relative;';
        if (el._tileImgData) {
          const img = document.createElement('img');
          img.src = el._tileImgData;
          img.style.cssText='width:100%;height:100%;object-fit:cover;';
          d.appendChild(img);
        } else {
          d.innerHTML = `<div style="padding:10px;color:#64748b;font-size:11px;text-align:center;height:100%;display:flex;align-items:center;justify-content:center;">Loading map tile…</div>`;
          renderMiniMapTile(el).then(() => {
            // Re-render after tile loads
            if (window.plotReportTool?.designer) window.plotReportTool.designer._renderElement(el);
          });
        }
        if (el.showMarker) {
          const marker = document.createElement('div');
          marker.style.cssText='position:absolute;left:50%;top:50%;width:16px;height:16px;background:#dc2626;border:2px solid #fff;border-radius:50%;transform:translate(-50%,-50%);box-shadow:0 2px 4px rgba(0,0,0,.3);';
          d.appendChild(marker);
        }
        return d;
      },
      renderPDF: (el) => {
        const d = document.createElement('div');
        d.style.cssText='width:100%;height:100%;background:#f3f4f6;overflow:hidden;position:relative;';
        if (el._tileImgData) {
          const img = document.createElement('img');
          img.src = el._tileImgData;
          img.style.cssText='width:100%;height:100%;object-fit:cover;';
          d.appendChild(img);
        }
        if (el.showMarker) {
          const marker = document.createElement('div');
          marker.style.cssText='position:absolute;left:50%;top:50%;width:16px;height:16px;background:#dc2626;border:2px solid #fff;border-radius:50%;transform:translate(-50%,-50%);';
          d.appendChild(marker);
        }
        return d;
      },
      properties: (el, body, designer) => {
        designer._addPropsSection(body, 'Mini Map', (content) => {
          designer._addSliderRow(content, 'Zoom', el.zoom||13, 8, 18, 1, v => { el.zoom=v; el._tileImgData=null; renderMiniMapTile(el).then(() => designer._renderElement(el)); designer._commitHistory('prop'); });
          designer._addSelectRow(content, 'Marker', el.showMarker?'1':'0', [['1','Show'],['0','Hide']], v => { el.showMarker=v==='1'; designer._renderElement(el); designer._commitHistory('prop'); });
          designer._addSelectRow(content, 'Basemap', el.showBasemap?'1':'0', [['1','OSM'],['0','Blank']], v => { el.showBasemap=v==='1'; if (v==='1') { el._tileImgData=null; renderMiniMapTile(el).then(() => designer._renderElement(el)); } else { el._tileImgData=null; designer._renderElement(el); } designer._commitHistory('prop'); });
          content.appendChild(Utils.createElement('button', { className:'prt-btn prt-btn-outline prt-btn-sm prt-btn-block', textContent:'Reload Tile', style:{marginTop:'6px'}, onClick:() => { el._tileImgData=null; renderMiniMapTile(el).then(() => designer._renderElement(el)); } }));
        });
      }
    });

    async function renderMiniMapTile(el) {
      if (!el.showBasemap) return;
      // Compute OSM tile for center at given zoom
      const z = el.zoom || 13;
      const lon = Math.max(-180,Math.min(180,Number(el.centerLon)||0));
      const lat = Math.max(-85.05112878,Math.min(85.05112878,Number(el.centerLat)||0));
      const n = Math.pow(2, z);
      const xtile = Math.max(0,Math.min(n-1,Math.floor((lon + 180) / 360 * n)));
      const ytile = Math.max(0,Math.min(n-1,Math.floor((1 - Math.log(Math.tan(lat*Math.PI/180) + 1/Math.cos(lat*Math.PI/180)) / Math.PI) / 2 * n)));
      // Fetch 3x3 tile grid for better coverage
      const canvas = document.createElement('canvas');
      canvas.width = 768; canvas.height = 768;
      const ctx = canvas.getContext('2d');
      const promises = [];
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          promises.push(new Promise(resolve => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => { ctx.drawImage(img, (dx+1)*256, (dy+1)*256); resolve(); };
            img.onerror = () => resolve();
            img.src = `https://tile.openstreetmap.org/${z}/${xtile+dx}/${ytile+dy}.png`;
          }));
        }
      }
      await Promise.all(promises);
      try { el._tileImgData = canvas.toDataURL('image/jpeg', 0.85); } catch(_) { el._tileImgData = null; }
    }
  }

  // Register all built-in plugins after init
  setTimeout(() => {
    registerImagePlugin();
    registerScaleBarPlugin();
    registerNorthArrowPlugin();
    registerMiniMapPlugin();
  }, 800);

})();
