// ============================================================================
// plotReportTool.js - QGIS2WEB Plot Report Tool (Usable/Mobile-Friendly Build)
// ============================================================================
// Fixes requested (minimal but complete):
// 1) QR Telugu not displaying -> UTF-8 qrcode-generator
// 2) Select tool meaningful -> Pointer/Move tool
// 3) Zoom controls + mouse wheel + pinch zoom
// 4) Text editing works -> Edit Text modal (works on mobile)
// 5) Line/Arrow improved -> TWO CLICKS (start/end) + live preview
// 6) "Table data" -> Plot Details added as TEXT block from attributes
// 7) Undo/Redo improved -> dedup + page-aware history
// 8) Save templates fixed -> localStorage + fallback download + import
// 9) Element layers tool in top panel -> toggles layer manager panel
// 10) Properties panel minimize button
// 11) Designer always on top (z-index)
// 12) Adds essential tools: Arrow, Duplicate, Bring Front/Back, New Page
// 13) Layer detection kept (your map/layer listing logic)
// 14) Mobile friendly + gestures
// 15) Map selection -> adds DragBox rectangular selection (button + Shift-drag)
// ============================================================================

(function () {
  'use strict';

  // --------------------------------------------------------------------------
  // Dependencies
  // --------------------------------------------------------------------------
  const DependencyLoader = {
    loaded: {},
    loadScript(url, id) {
      return new Promise((resolve) => {
        if (this.loaded[id] || document.getElementById('prt-dep-' + id)) return resolve();
        const s = document.createElement('script');
        s.src = url;
        s.id = 'prt-dep-' + id;
        s.onload = () => { this.loaded[id] = true; resolve(); };
        s.onerror = () => { console.warn('[PRT] Failed to load:', url); resolve(); };
        document.head.appendChild(s);
      });
    },
    async loadAll() {
      await this.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', 'jspdf');
      await this.loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', 'html2canvas');
      // IMPORTANT: UTF-8 capable QR library
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

  // --------------------------------------------------------------------------
  // Styles
  // --------------------------------------------------------------------------
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

  .prt-main-btn{
    position:fixed; bottom:20px; right:20px; z-index:10000;
    width:56px; height:56px; border-radius:50%;
    background:var(--prt-primary); color:#fff; border:none; cursor:pointer;
    box-shadow:var(--prt-shadow-lg);
    display:flex; align-items:center; justify-content:center;
    transition:var(--prt-transition);
  }
  .prt-main-btn:hover{background:var(--prt-primary-dark); transform:scale(1.07)}
  .prt-main-btn svg{width:28px;height:28px;fill:#fff}

  .prt-panel{
    position:fixed; top:0; right:-420px; width:400px; max-width:100vw; height:100vh;
    background:#fff; z-index:10001; box-shadow:-4px 0 20px rgba(0,0,0,.15);
    transition:right .3s ease; display:flex; flex-direction:column; overflow:hidden;
  }
  .prt-panel.open{right:0}
  @media(max-width:480px){.prt-panel{width:100vw; right:-100vw}}
  .prt-panel-header{
    background:var(--prt-primary); color:#fff; padding:16px 20px;
    display:flex; align-items:center; justify-content:space-between; flex-shrink:0;
  }
  .prt-panel-header h2{margin:0;font-size:18px;font-weight:700}
  .prt-panel-close{background:none;border:none;color:#fff;font-size:24px;cursor:pointer;opacity:.85}
  .prt-panel-close:hover{opacity:1}
  .prt-panel-body{flex:1; overflow:auto; padding:20px}

  .prt-form-group{margin-bottom:16px}
  .prt-form-group label{display:block;font-size:13px;font-weight:700;color:var(--prt-gray-700);margin-bottom:6px}
  .prt-select,.prt-input,.prt-textarea{
    width:100%; padding:10px 12px; border:1px solid var(--prt-gray-300); border-radius:var(--prt-radius);
    font-size:14px; color:var(--prt-gray-800); background:#fff; box-sizing:border-box;
  }
  .prt-textarea{resize:vertical; min-height:80px}
  .prt-select:focus,.prt-input:focus,.prt-textarea:focus{outline:none;border-color:var(--prt-primary);box-shadow:0 0 0 3px var(--prt-primary-light)}

  .prt-btn{
    display:inline-flex; align-items:center; justify-content:center; gap:8px;
    padding:10px 20px; border:none; border-radius:var(--prt-radius);
    font-size:14px; font-weight:600; cursor:pointer; transition:var(--prt-transition);
    white-space:nowrap;
  }
  .prt-btn-primary{background:var(--prt-primary);color:#fff}
  .prt-btn-primary:hover{background:var(--prt-primary-dark)}
  .prt-btn-outline{background:#fff;color:var(--prt-gray-700);border:1px solid var(--prt-gray-300)}
  .prt-btn-outline:hover{background:var(--prt-gray-50)}
  .prt-btn-success{background:var(--prt-success);color:#fff}
  .prt-btn-success:hover{background:#15803d}
  .prt-btn-danger{background:var(--prt-danger);color:#fff}
  .prt-btn-danger:hover{background:#b91c1c}
  .prt-btn-block{width:100%}
  .prt-btn-sm{padding:6px 12px;font-size:12px}

  .prt-selection-bar{
    position:fixed; top:0; left:0; right:0; z-index:200020;
    background:var(--prt-gray-900); color:#fff; padding:10px 14px;
    display:flex; align-items:center; justify-content:space-between; gap:10px;
    transform:translateY(-110%); transition:transform .3s ease;
    box-shadow:var(--prt-shadow-lg);
  }
  .prt-selection-bar.visible{transform:translateY(0)}
  .prt-selection-bar-info{display:flex;align-items:center;gap:10px;font-size:14px;min-width:0}
  .prt-selection-bar-info span:first-child{white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .prt-selection-count{background:var(--prt-primary);padding:2px 10px;border-radius:12px;font-weight:800}
  .prt-selection-bar-actions{display:flex;gap:8px;flex-shrink:0}
  .prt-selection-confirm,.prt-selection-cancel,.prt-selection-toolbtn{
    width:36px;height:36px;border-radius:50%;
    border:none;cursor:pointer;color:#fff;font-size:16px;font-weight:900;
    display:flex;align-items:center;justify-content:center;transition:.15s;
  }
  .prt-selection-confirm{background:var(--prt-success)}
  .prt-selection-cancel{background:var(--prt-danger)}
  .prt-selection-toolbtn{background:#475569}
  .prt-selection-confirm:hover{background:#15803d;transform:scale(1.1)}
  .prt-selection-cancel:hover{background:#b91c1c;transform:scale(1.1)}
  .prt-selection-toolbtn:hover{background:#64748b;transform:scale(1.05)}
  .prt-selection-toolbtn.active{background:var(--prt-warning);color:#111827}

  .prt-sketch-preview{
    border:1px solid var(--prt-gray-200); border-radius:var(--prt-radius);
    background:#fff; padding:8px; margin-bottom:16px;
    min-height:200px; display:flex; align-items:center; justify-content:center; overflow:hidden;
  }
  .prt-sketch-preview svg{max-width:100%;max-height:400px}

  .prt-attr-table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:12px}
  .prt-attr-table th,.prt-attr-table td{padding:6px 10px;border-bottom:1px solid var(--prt-gray-200);text-align:left}
  .prt-attr-table th{background:var(--prt-gray-50);font-weight:700;color:var(--prt-gray-600);width:40%}

  .prt-toast{
    position:fixed; bottom:80px; left:50%; transform:translateX(-50%) translateY(100px);
    background:var(--prt-gray-800); color:#fff; padding:10px 20px; border-radius:10px;
    z-index:200030; transition:transform .3s ease; box-shadow:var(--prt-shadow-lg);
    max-width:92vw; text-align:center;
  }
  .prt-toast.visible{transform:translateX(-50%) translateY(0)}

  /* --- Designer (TOPMOST) --- */
  .prt-designer-overlay{
    position:fixed; inset:0; z-index:200000; background:var(--prt-gray-100);
    display:none; flex-direction:column;
  }
  .prt-designer-overlay.open{display:flex}
  .prt-designer-toolbar{background:#fff;border-bottom:1px solid var(--prt-gray-200);box-shadow:var(--prt-shadow);z-index:2}
  .prt-toolbar-main{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 12px;flex-wrap:wrap}
  .prt-toolbar-title{font-weight:800;color:var(--prt-gray-800)}
  .prt-toolbar-toggle{background:#fff;border:1px solid var(--prt-gray-300);border-radius:10px;padding:6px 10px;cursor:pointer;font-size:13px;color:var(--prt-gray-600)}
  .prt-toolbar-toggle:hover{background:var(--prt-gray-50)}
  .prt-toolbar-tools{display:flex;flex-wrap:wrap;gap:4px;padding:8px 12px 12px;border-top:1px solid var(--prt-gray-100);max-height:320px;overflow:hidden;transition:max-height .3s,opacity .3s,padding .3s;opacity:1}
  .prt-toolbar-tools.collapsed{max-height:0;opacity:0;padding-top:0;padding-bottom:0;border-top:none}
  .prt-tool-btn{display:flex;flex-direction:column;align-items:center;justify-content:center;width:56px;height:52px;border:1px solid var(--prt-gray-200);border-radius:10px;background:#fff;cursor:pointer;color:var(--prt-gray-600);font-size:9px;gap:2px;padding:4px}
  .prt-tool-btn:hover{background:var(--prt-gray-50);border-color:var(--prt-gray-400)}
  .prt-tool-btn.active{background:var(--prt-primary-light);border-color:var(--prt-primary);color:var(--prt-primary)}
  .prt-tool-btn svg{width:18px;height:18px}
  .prt-tool-separator{width:1px;height:52px;background:var(--prt-gray-200);margin:0 4px}

  .prt-zoom-box{display:inline-flex;align-items:center;gap:6px;padding:4px 8px;border:1px solid var(--prt-gray-200);border-radius:12px;background:#fff}
  .prt-zoom-label{min-width:52px;text-align:center;color:var(--prt-gray-600);font-size:12px}

  .prt-designer-canvas-area{flex:1;overflow:auto;display:flex;align-items:center;justify-content:center;padding:14px;background:var(--prt-gray-200);position:relative;touch-action:none}
  .prt-page-canvas{background:#fff;box-shadow:var(--prt-shadow-lg);position:relative;overflow:visible;transform-origin:0 0}
  .prt-page-canvas.crosshair{cursor:crosshair}

  .prt-canvas-element{position:absolute;cursor:move;transform-origin:center center}
  .prt-canvas-element.selected{outline:2px solid var(--prt-primary);outline-offset:2px}
  .prt-resize-handle{position:absolute;width:10px;height:10px;background:var(--prt-primary);border:2px solid #fff;border-radius:3px;display:none;z-index:10}
  .prt-canvas-element.selected .prt-resize-handle{display:block}
  .prt-resize-handle.nw{top:-6px;left:-6px;cursor:nw-resize}
  .prt-resize-handle.ne{top:-6px;right:-6px;cursor:ne-resize}
  .prt-resize-handle.sw{bottom:-6px;left:-6px;cursor:sw-resize}
  .prt-resize-handle.se{bottom:-6px;right:-6px;cursor:se-resize}

  .prt-rotation-handle{position:absolute;top:-28px;left:calc(50% - 7px);width:14px;height:14px;background:var(--prt-warning);border:2px solid #fff;border-radius:50%;display:none;z-index:11;cursor:grab}
  .prt-rotation-line{position:absolute;top:-15px;left:50%;width:1px;height:15px;background:var(--prt-primary);display:none;z-index:10}
  .prt-canvas-element.selected .prt-rotation-handle,
  .prt-canvas-element.selected .prt-rotation-line{display:block}

  .prt-text-element{width:100%;height:100%;padding:4px;box-sizing:border-box;white-space:pre-wrap;overflow:hidden}
  .prt-line-element,.prt-sketch-element,.prt-qr-element{width:100%;height:100%;pointer-events:none}
  .prt-line-element svg,.prt-sketch-element svg{width:100%;height:100%;overflow:visible}
  .prt-rect-element{width:100%;height:100%;box-sizing:border-box}
  .prt-qr-element img{width:100%;height:100%;object-fit:contain;image-rendering:pixelated}

  .prt-props-panel{position:absolute;bottom:12px;right:12px;background:#fff;border-radius:12px;box-shadow:var(--prt-shadow-lg);padding:12px;width:300px;max-height:55vh;overflow:auto;z-index:6;display:none}
  .prt-props-panel.visible{display:block}
  @media(max-width:768px){.prt-props-panel{left:12px;right:12px;width:auto}}
  .prt-props-header{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}
  .prt-props-min-btn{border:1px solid var(--prt-gray-200);background:#fff;border-radius:10px;padding:6px 10px;cursor:pointer;font-size:12px}
  .prt-props-panel.minimized .prt-props-body{display:none}
  .prt-props-row{display:flex;align-items:center;gap:8px;margin-bottom:6px}
  .prt-props-row label{width:72px;font-size:12px;color:var(--prt-gray-500);flex-shrink:0}
  .prt-props-row input,.prt-props-row select{flex:1;padding:6px 8px;border:1px solid var(--prt-gray-300);border-radius:8px;font-size:12px}

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
  .prt-checkbox-group{max-height:190px;overflow:auto;border:1px solid var(--prt-gray-200);border-radius:10px;padding:10px}
  .prt-checkbox-item{display:flex;align-items:center;gap:8px;padding:4px 0;font-size:13px}

  @media(max-width:768px){
    .prt-tool-btn{width:64px;height:58px;font-size:10px}
    .prt-toolbar-main{gap:6px}
    .prt-zoom-box{width:100%;justify-content:space-between}
  }
  `;

  // --------------------------------------------------------------------------
  // Icons
  // --------------------------------------------------------------------------
  const ICONS = {
    plot: `<svg viewBox="0 0 24 24"><path d="M3 3h18v18H3V3zm2 2v14h14V5H5zm2 2h4v4H7V7zm6 0h4v2h-4V7zm0 4h4v2h-4v-2zm-6 4h10v2H7v-2z"/></svg>`,
    close: '✕',
    check: '✓',
    cancel: '✕',
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
    details: `<svg viewBox="0 0 24 24"><path d="M4 4h16v2H4V4zm0 4h16v2H4V8zm0 4h10v2H4v-2zm0 4h16v2H4v-2z"/></svg>`
  };

  // --------------------------------------------------------------------------
  // Utils
  // --------------------------------------------------------------------------
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
      children.forEach(c => {
        if (typeof c === 'string') el.appendChild(document.createTextNode(c));
        else if (c) el.appendChild(c);
      });
      return el;
    },

    showToast(msg, duration = 3000) {
      let toast = document.querySelector('.prt-toast');
      if (!toast) {
        toast = Utils.createElement('div', { className: 'prt-toast' });
        document.body.appendChild(toast);
      }
      toast.textContent = msg;
      toast.classList.add('visible');
      clearTimeout(toast._timeout);
      toast._timeout = setTimeout(() => toast.classList.remove('visible'), duration);
    },

    escapeXml(s) {
      return String(s ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },

    formatArea(areaM2) {
      if (areaM2 >= 10000) return (areaM2 / 10000).toFixed(4) + ' ha';
      return areaM2.toFixed(2) + ' m²';
    },
    formatLength(lengthM) {
      if (lengthM >= 1000) return (lengthM / 1000).toFixed(3) + ' km';
      if (lengthM < 1) return (lengthM * 100).toFixed(0) + ' cm';
      return lengthM.toFixed(2) + ' m';
    },

    clone(obj) { return JSON.parse(JSON.stringify(obj)); },

    mm2px(mm) { return mm * 96 / 25.4; },
    px2mm(px) { return px * 25.4 / 96; },

    hasComplexScript(text) {
      return /[\u0C00-\u0C7F\u0900-\u097F\u0B80-\u0BFF\u0A80-\u0AFF]/.test(String(text || ''));
    },

    safeLocalStorageAvailable() {
      try {
        const k = '__prt_test__';
        localStorage.setItem(k, '1');
        localStorage.removeItem(k);
        return true;
      } catch (_) {
        return false;
      }
    },

    downloadJson(filename, obj) {
      const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 200);
    },

    /**
     * Telugu-safe QR generation (UTF‑8) using qrcode-generator.
     */
    generateQRDataUrlUtf8(text, targetSizePx = 180) {
      if (typeof qrcode === 'undefined') return null;

      // Enable UTF‑8 encoding
      if (qrcode.stringToBytesFuncs && qrcode.stringToBytesFuncs['UTF-8']) {
        qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
      }

      const qr = qrcode(0, 'M');
      qr.addData(text);
      qr.make();

      const modules = qr.getModuleCount();
      const marginModules = 4;
      const totalModules = modules + marginModules * 2;
      const cell = Math.max(2, Math.floor(targetSizePx / totalModules));
      const size = totalModules * cell;

      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, size, size);

      ctx.fillStyle = '#000';
      for (let r = 0; r < modules; r++) {
        for (let c = 0; c < modules; c++) {
          if (qr.isDark(r, c)) {
            ctx.fillRect((c + marginModules) * cell, (r + marginModules) * cell, cell, cell);
          }
        }
      }
      return canvas.toDataURL('image/png');
    }
  };

  // --------------------------------------------------------------------------
  // Page sizes
  // --------------------------------------------------------------------------
  const PAGE_SIZES = {
    'A4 Portrait': { w: 210, h: 297 },
    'A4 Landscape': { w: 297, h: 210 },
    'A3 Portrait': { w: 297, h: 420 },
    'A3 Landscape': { w: 420, h: 297 },
    'A2 Portrait': { w: 420, h: 594 },
    'A2 Landscape': { w: 594, h: 420 },
    'Letter Portrait': { w: 215.9, h: 279.4 },
    'Legal Portrait': { w: 215.9, h: 355.6 },
    'Tabloid Portrait': { w: 279.4, h: 431.8 },
    'Custom': { w: 210, h: 297 }
  };

  // --------------------------------------------------------------------------
  // Undo/Redo manager
  // --------------------------------------------------------------------------
  class UndoRedoManager {
    constructor(maxHistory = 120) {
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
    undo() {
      if (this.pointer > 0) {
        this.pointer--;
        this._notify();
        return Utils.clone(this.history[this.pointer]);
      }
      return null;
    }
    redo() {
      if (this.pointer < this.history.length - 1) {
        this.pointer++;
        this._notify();
        return Utils.clone(this.history[this.pointer]);
      }
      return null;
    }
    canUndo() { return this.pointer > 0; }
    canRedo() { return this.pointer < this.history.length - 1; }
    onChange(cb) { this.onChangeCallbacks.push(cb); }
    _notify() { this.onChangeCallbacks.forEach(cb => cb()); }
    clear() { this.history = []; this.pointer = -1; this._notify(); }
  }

  // --------------------------------------------------------------------------
  // Sketch renderer (supports basic options)
  // --------------------------------------------------------------------------
  class SketchRenderer {
    constructor() {
      this.padding = 60;
      this.dimOffsetBase = 18;
      this.dimOffsetStep = 16;
      this.fontSize = 10;
      this.strokeWidth = 1.5;
      this.dimStrokeWidth = 0.6;
    }

    render(polygonsData, width = 520, height = 420, opts = {}) {
      const options = {
        showDimensions: opts.showDimensions ?? true,
        showVertices: opts.showVertices ?? true,
        showNorth: opts.showNorth ?? true,
        showScale: opts.showScale ?? true,
        showLabels: opts.showLabels ?? true,
        ...opts
      };

      if (!polygonsData?.length) return this._emptySVG(width, height);

      let all = [];
      polygonsData.forEach(p => (p.coords || []).forEach(r => r.forEach(c => all.push(c))));
      if (!all.length) return this._emptySVG(width, height);

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      all.forEach(([x, y]) => { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); });

      const dataW = maxX - minX || 1;
      const dataH = maxY - minY || 1;
      const pad = this.padding;
      const availW = width - 2 * pad;
      const availH = height - 2 * pad;
      const scale = Math.min(availW / dataW, availH / dataH);

      const offX = pad + (availW - dataW * scale) / 2;
      const offY = pad + (availH - dataH * scale) / 2;

      const tx = x => offX + (x - minX) * scale;
      const ty = y => offY + (maxY - y) * scale;

      const colors = ['#2563eb', '#dc2626', '#16a34a', '#9333ea', '#ea580c', '#0891b2'];
      const placed = [];
      let svg = '';

      polygonsData.forEach((poly, idx) => {
        const color = colors[idx % colors.length];

        (poly.coords || []).forEach(ring => {
          if (!ring || ring.length < 3) return;
          let r = ring.slice();
          if (r.length > 3 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r.pop();

          const pts = r.map(c => [tx(c[0]), ty(c[1])]);
          if (pts.length < 3) return;

          const pathD = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ') + ' Z';
          svg += `<path d="${pathD}" fill="${color}15" stroke="${color}" stroke-width="${this.strokeWidth}" stroke-linejoin="round"/>`;

          const centroid = this._centroidPx(pts);

          if (options.showDimensions) {
            for (let i = 0; i < pts.length; i++) {
              const p1 = pts[i];
              const p2 = pts[(i + 1) % pts.length];
              const gp1 = r[i];
              const gp2 = r[(i + 1) % r.length];

              const dist = this._geoDist(gp1, gp2);
              if (dist < 0.01) continue;

              const label = Utils.formatLength(dist);
              svg += this._dimExterior(p1, p2, label, centroid, placed);
            }
          }

          if (options.showVertices) {
            pts.forEach(p => {
              svg += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.4" fill="${color}" stroke="#fff" stroke-width="0.8"/>`;
            });
          }
        });

        if (options.showLabels && poly.coords?.[0]?.length > 2) {
          const gcent = this._centroidGeo(poly.coords[0]);
          const cx = tx(gcent[0]);
          const cy = ty(gcent[1]);
          const area = Math.abs(this._polygonArea(poly.coords[0]));
          const name = poly.properties?.name || poly.properties?.id || poly.properties?.OBJECTID || `Plot ${idx + 1}`;
          svg += `<text x="${cx.toFixed(1)}" y="${(cy - 6).toFixed(1)}" text-anchor="middle" font-size="${this.fontSize + 2}" font-weight="700" fill="${color}">${Utils.escapeXml(name)}</text>`;
          svg += `<text x="${cx.toFixed(1)}" y="${(cy + 10).toFixed(1)}" text-anchor="middle" font-size="${this.fontSize}" fill="#475569">${Utils.formatArea(area)}</text>`;
        }
      });

      if (options.showNorth) {
        svg += `<g transform="translate(${width - 28},${26})"><polygon points="0,-14 -5,5 0,1 5,5" fill="#334155" stroke="#fff" stroke-width="0.5"/><text x="0" y="-17" text-anchor="middle" font-size="9" font-weight="700" fill="#334155">N</text></g>`;
      }
      if (options.showScale) {
        svg += this._scaleBar(16, height - 14, scale);
      }

      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
        <rect width="${width}" height="${height}" fill="white"/>
        ${svg}
      </svg>`;
    }

    _dimExterior(p1, p2, label, centroid, placed) {
      const mx = (p1[0] + p2[0]) / 2;
      const my = (p1[1] + p2[1]) / 2;
      const dx = p2[0] - p1[0];
      const dy = p2[1] - p1[1];
      const len = Math.hypot(dx, dy);
      if (len < 12) return '';

      let nx = -dy / len;
      let ny = dx / len;

      const testOut = Math.hypot(mx + nx * 10 - centroid[0], my + ny * 10 - centroid[1]);
      const testIn = Math.hypot(mx - nx * 10 - centroid[0], my - ny * 10 - centroid[1]);
      if (testOut < testIn) { nx = -nx; ny = -ny; }

      const labelW = label.length * 6 + 10;
      const labelH = this.fontSize + 6;

      let offset = this.dimOffsetBase;
      for (let tier = 0; tier < 8; tier++) {
        offset = this.dimOffsetBase + tier * this.dimOffsetStep;
        const cx = mx + nx * offset;
        const cy = my + ny * offset;
        let collides = false;
        for (const b of placed) {
          if (Math.abs(cx - b.x) < (labelW + b.w) / 2 && Math.abs(cy - b.y) < (labelH + b.h) / 2) { collides = true; break; }
        }
        if (!collides) { placed.push({ x: cx, y: cy, w: labelW, h: labelH }); break; }
      }

      const o1 = [p1[0] + nx * offset, p1[1] + ny * offset];
      const o2 = [p2[0] + nx * offset, p2[1] + ny * offset];
      const om = [(o1[0] + o2[0]) / 2, (o1[1] + o2[1]) / 2];

      let angle = Math.atan2(dy, dx) * 180 / Math.PI;
      if (angle > 90) angle -= 180;
      if (angle < -90) angle += 180;

      const as = 4;
      const adx = dx / len;
      const ady = dy / len;
      const lw = label.length * 5.5 + 6;
      const lh = this.fontSize + 4;

      return `
        <line x1="${p1[0].toFixed(1)}" y1="${p1[1].toFixed(1)}" x2="${o1[0].toFixed(1)}" y2="${o1[1].toFixed(1)}" stroke="#94a3b8" stroke-width="${this.dimStrokeWidth}" stroke-dasharray="2,2"/>
        <line x1="${p2[0].toFixed(1)}" y1="${p2[1].toFixed(1)}" x2="${o2[0].toFixed(1)}" y2="${o2[1].toFixed(1)}" stroke="#94a3b8" stroke-width="${this.dimStrokeWidth}" stroke-dasharray="2,2"/>
        <line x1="${o1[0].toFixed(1)}" y1="${o1[1].toFixed(1)}" x2="${o2[0].toFixed(1)}" y2="${o2[1].toFixed(1)}" stroke="#334155" stroke-width="${this.dimStrokeWidth}"/>
        <polygon points="${o1[0].toFixed(1)},${o1[1].toFixed(1)} ${(o1[0] + adx * as - ny * as * 0.4).toFixed(1)},${(o1[1] + ady * as + nx * as * 0.4).toFixed(1)} ${(o1[0] + adx * as + ny * as * 0.4).toFixed(1)},${(o1[1] + ady * as - nx * as * 0.4).toFixed(1)}" fill="#334155"/>
        <polygon points="${o2[0].toFixed(1)},${o2[1].toFixed(1)} ${(o2[0] - adx * as - ny * as * 0.4).toFixed(1)},${(o2[1] - ady * as + nx * as * 0.4).toFixed(1)} ${(o2[0] - adx * as + ny * as * 0.4).toFixed(1)},${(o2[1] - ady * as - nx * as * 0.4).toFixed(1)}" fill="#334155"/>
        <g transform="rotate(${angle.toFixed(1)}, ${om[0].toFixed(1)}, ${om[1].toFixed(1)})">
          <rect x="${(om[0] - lw / 2).toFixed(1)}" y="${(om[1] - lh / 2).toFixed(1)}" width="${lw}" height="${lh}" fill="white" stroke="#cbd5e1" stroke-width="0.5" rx="2"/>
          <text x="${om[0].toFixed(1)}" y="${(om[1] + this.fontSize / 3.5).toFixed(1)}" text-anchor="middle" font-size="${this.fontSize}" fill="#1e293b">${Utils.escapeXml(label)}</text>
        </g>
      `;
    }

    _scaleBar(x, y, scale) {
      const px100 = 100 * scale;
      let barLenM = 100;
      if (px100 > 300) barLenM = 50;
      if (px100 > 600) barLenM = 20;
      if (px100 < 50) barLenM = 500;
      if (px100 < 20) barLenM = 1000;

      const barPx = barLenM * scale;
      const label = barLenM >= 1000 ? (barLenM / 1000) + ' km' : barLenM + ' m';
      return `<g transform="translate(${x},${y})">
        <line x1="0" y1="0" x2="${barPx.toFixed(1)}" y2="0" stroke="#334155" stroke-width="2"/>
        <line x1="0" y1="-4" x2="0" y2="4" stroke="#334155" stroke-width="1"/>
        <line x1="${barPx.toFixed(1)}" y1="-4" x2="${barPx.toFixed(1)}" y2="4" stroke="#334155" stroke-width="1"/>
        <text x="${(barPx / 2).toFixed(1)}" y="-6" text-anchor="middle" font-size="9" fill="#334155">${label}</text>
      </g>`;
    }

    _centroidPx(pts) {
      let cx = 0, cy = 0;
      pts.forEach(p => { cx += p[0]; cy += p[1]; });
      return [cx / pts.length, cy / pts.length];
    }

    _centroidGeo(ring) {
      let cx = 0, cy = 0;
      ring.forEach(([x, y]) => { cx += x; cy += y; });
      return [cx / ring.length, cy / ring.length];
    }

    _polygonArea(ring) {
      let area = 0;
      for (let i = 0; i < ring.length; i++) {
        const j = (i + 1) % ring.length;
        area += ring[i][0] * ring[j][1];
        area -= ring[j][0] * ring[i][1];
      }
      return area / 2;
    }

    _geoDist(p1, p2) {
      if (Math.abs(p1[0]) <= 180 && Math.abs(p1[1]) <= 90) {
        return this._haversine(p1[1], p1[0], p2[1], p2[0]);
      }
      return Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    }

    _haversine(lat1, lon1, lat2, lon2) {
      const R = 6371000;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    _emptySVG(w, h) {
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
        <rect width="${w}" height="${h}" fill="#f9fafb"/>
        <text x="${w / 2}" y="${h / 2}" text-anchor="middle" font-size="14" fill="#9ca3af">No polygons selected</text>
      </svg>`;
    }
  }

  // --------------------------------------------------------------------------
  // Designer (multi-page + 2-click line/arrow + wheel/pinch zoom + templates)
  // --------------------------------------------------------------------------
  class DesignerCanvas {
    constructor(tool) {
      this.tool = tool;

      // multi-page
      this.pages = []; // [{elements:[]}]
      this.currentPageIndex = 0;

      this.selectedElement = null;
      this.activeTool = null;

      this.undoRedo = new UndoRedoManager(140);
      this._lastHistoryHash = null;

      this.pageSize = 'A4 Portrait';
      this.pageDims = { ...PAGE_SIZES['A4 Portrait'] };

      this.fitScale = 1;
      this.zoom = 1;
      this.scale = 1;

      this.toolsCollapsed = false;

      // line/arrow two-click state
      this._lineFirstClick = null; // {x,y, elementId}
      this._linePreviewElId = null;

      // drag state (move/resize/rotate)
      this.dragState = null;

      // UI refs
      this.overlay = null;
      this.canvasArea = null;
      this.canvas = null;
      this.toolsPanel = null;
      this.toggleBtn = null;
      this.zoomLabel = null;
      this.pageSelect = null;

      this.propsPanel = null;
      this.propsMinimized = false;

      this.layerManagerEl = null;
      this.layerManagerVisible = false;

      // pinch zoom
      this._pinch = null;

      this._boundKeyHandler = this._handleKeyDown.bind(this);
      this._boundWheelHandler = this._onWheel.bind(this);
      this._boundTouchStart = this._onPinchStart.bind(this);
      this._boundTouchMove = this._onPinchMove.bind(this);
      this._boundTouchEnd = this._onPinchEnd.bind(this);
    }

    get elements() {
      return this.pages[this.currentPageIndex]?.elements || [];
    }
    set elements(v) {
      this.pages[this.currentPageIndex].elements = v;
    }

    open(sketchSVG, polygonsData) {
      this.sketchSVG = sketchSVG;
      this.polygonsData = polygonsData;

      this.pages = [{ elements: [] }];
      this.currentPageIndex = 0;

      this.selectedElement = null;
      this.activeTool = null;

      this.undoRedo.clear();
      this._lastHistoryHash = null;

      this._buildUI();
      this._fitToScreen();
      this._addDefaultElementsToCurrentPage();
      this._commitHistory('open');

      document.addEventListener('keydown', this._boundKeyHandler);

      // zoom interactions
      this.canvasArea.addEventListener('wheel', this._boundWheelHandler, { passive: false });

      // pinch gestures for mobile
      this.canvasArea.addEventListener('touchstart', this._boundTouchStart, { passive: false });
      this.canvasArea.addEventListener('touchmove', this._boundTouchMove, { passive: false });
      this.canvasArea.addEventListener('touchend', this._boundTouchEnd, { passive: false });
      this.canvasArea.addEventListener('touchcancel', this._boundTouchEnd, { passive: false });

      if (window.innerWidth < 768) {
        this.toolsCollapsed = true;
        this.toolsPanel.classList.add('collapsed');
        this.toggleBtn.innerHTML = `Tools ▶`;
      }
    }

    close() {
      document.removeEventListener('keydown', this._boundKeyHandler);
      if (this.canvasArea) {
        this.canvasArea.removeEventListener('wheel', this._boundWheelHandler);
        this.canvasArea.removeEventListener('touchstart', this._boundTouchStart);
        this.canvasArea.removeEventListener('touchmove', this._boundTouchMove);
        this.canvasArea.removeEventListener('touchend', this._boundTouchEnd);
        this.canvasArea.removeEventListener('touchcancel', this._boundTouchEnd);
      }
      this.overlay?.remove();
      this.overlay = null;
    }

    // ---------------- UI ----------------
    _buildUI() {
      this.overlay?.remove();

      this.overlay = Utils.createElement('div', { className: 'prt-designer-overlay open' });

      const toolbar = Utils.createElement('div', { className: 'prt-designer-toolbar' });
      const toolbarMain = Utils.createElement('div', { className: 'prt-toolbar-main' });

      const backBtn = Utils.createElement('button', {
        className: 'prt-btn prt-btn-outline prt-btn-sm',
        innerHTML: '← Back',
        onClick: () => this.close()
      });

      const title = Utils.createElement('span', { className: 'prt-toolbar-title', textContent: 'Report Designer' });

      // Page controls (New page + selector)
      const pageBox = Utils.createElement('div', { className: 'prt-zoom-box' });
      this.pageSelect = Utils.createElement('select', { className: 'prt-select', style: { width: '140px', padding: '6px 8px', fontSize: '12px' } });
      this._refreshPageSelect();
      this.pageSelect.addEventListener('change', () => {
        this._switchPage(parseInt(this.pageSelect.value, 10) || 0);
      });

      const newPageBtn = Utils.createElement('button', {
        className: 'prt-btn prt-btn-outline prt-btn-sm',
        textContent: '+ Page',
        onClick: () => this._addNewPage()
      });

      const delPageBtn = Utils.createElement('button', {
        className: 'prt-btn prt-btn-outline prt-btn-sm',
        textContent: 'Del',
        onClick: () => this._deleteCurrentPage()
      });

      pageBox.appendChild(Utils.createElement('span', { className: 'prt-zoom-label', textContent: 'Page' }));
      pageBox.appendChild(this.pageSelect);
      pageBox.appendChild(newPageBtn);
      pageBox.appendChild(delPageBtn);

      this.toggleBtn = Utils.createElement('button', {
        className: 'prt-toolbar-toggle',
        innerHTML: `Tools ${ICONS.chevron}`,
        onClick: () => this._toggleTools()
      });

      // Zoom controls
      this.zoomLabel = Utils.createElement('span', { className: 'prt-zoom-label', textContent: '100%' });
      const zoomBox = Utils.createElement('div', { className: 'prt-zoom-box' }, [
        Utils.createElement('button', { className: 'prt-btn prt-btn-outline prt-btn-sm', textContent: '−', onClick: () => this._setZoom(this.zoom - 0.1) }),
        this.zoomLabel,
        Utils.createElement('button', { className: 'prt-btn prt-btn-outline prt-btn-sm', textContent: '+', onClick: () => this._setZoom(this.zoom + 0.1) }),
        Utils.createElement('button', { className: 'prt-btn prt-btn-outline prt-btn-sm', textContent: 'Fit', onClick: () => this._fitToScreen() }),
      ]);

      const pdfBtn = Utils.createElement('button', {
        className: 'prt-btn prt-btn-success prt-btn-sm',
        innerHTML: `${ICONS.pdf} PDF`,
        onClick: () => this._generatePDF()
      });

      toolbarMain.append(backBtn, title, pageBox, this.toggleBtn, zoomBox, pdfBtn);
      toolbar.appendChild(toolbarMain);

      // Tools panel
      this.toolsPanel = Utils.createElement('div', { className: 'prt-toolbar-tools' });

      const toolDefs = [
        { id: 'pointer', icon: ICONS.select, label: 'Move', action: () => this._setTool(null) },
        { separator: true },
        { id: 'text', icon: ICONS.text, label: 'Text', action: () => this._setTool('text') },
        { id: 'line', icon: ICONS.line, label: 'Line', action: () => this._setTool('line') },
        { id: 'arrow', icon: ICONS.line, label: 'Arrow', action: () => this._setTool('arrow') },
        { id: 'rect', icon: ICONS.rect, label: 'Rect', action: () => this._setTool('rect') },
        { id: 'sketch', icon: ICONS.sketch, label: 'Sketch', action: () => this._addSketchElement() },
        { id: 'details', icon: ICONS.details, label: 'Details', action: () => this._addPlotDetailsAsText() },
        { id: 'qr', icon: ICONS.qr, label: 'QR', action: () => this._openQRModal() },
        { separator: true },
        { id: 'undo', icon: ICONS.undo, label: 'Undo', action: () => this._undo() },
        { id: 'redo', icon: ICONS.redo, label: 'Redo', action: () => this._redo() },
        { id: 'dup', icon: ICONS.template, label: 'Dup', action: () => this._duplicateSelected() },
        { id: 'front', icon: ICONS.template, label: 'Front', action: () => this._bringToFront() },
        { id: 'back', icon: ICONS.template, label: 'Back', action: () => this._sendToBack() },
        { id: 'delete', icon: ICONS.delete, label: 'Del', action: () => this._deleteSelected() },
        { separator: true },
        { id: 'layers', icon: ICONS.template, label: 'Layers', action: () => this._toggleLayerManager() },
        { id: 'page', icon: ICONS.page, label: 'Size', action: () => this._openPageModal() },
        { id: 'loadtpl', icon: ICONS.template, label: 'Load', action: () => this._openTemplateModal() },
        { id: 'savetpl', icon: ICONS.save, label: 'Save', action: () => this._saveTemplate() },
      ];

      toolDefs.forEach(t => {
        if (t.separator) {
          this.toolsPanel.appendChild(Utils.createElement('div', { className: 'prt-tool-separator' }));
          return;
        }
        this.toolsPanel.appendChild(Utils.createElement('button', {
          className: 'prt-tool-btn',
          'data-tool': t.id,
          innerHTML: `${t.icon}<span>${t.label}</span>`,
          onClick: t.action
        }));
      });

      toolbar.appendChild(this.toolsPanel);
      this.overlay.appendChild(toolbar);

      // Canvas area
      this.canvasArea = Utils.createElement('div', { className: 'prt-designer-canvas-area' });
      this.canvas = Utils.createElement('div', { className: 'prt-page-canvas' });
      this.canvasArea.appendChild(this.canvas);

      // Layer manager (hidden until tool)
      this.layerManagerEl = Utils.createElement('div', { className: 'prt-layer-manager', style: { display: 'none' } });
      this.canvasArea.appendChild(this.layerManagerEl);

      // Properties panel
      this.propsPanel = Utils.createElement('div', { className: 'prt-props-panel' });
      this.canvasArea.appendChild(this.propsPanel);

      this.overlay.appendChild(this.canvasArea);
      document.body.appendChild(this.overlay);

      // Canvas events
      this.canvas.addEventListener('mousedown', (e) => this._canvasMouseDown(e));
      this.canvas.addEventListener('touchstart', (e) => this._canvasTouchStart(e), { passive: false });

      document.addEventListener('mousemove', (e) => this._canvasMouseMove(e));
      document.addEventListener('mouseup', () => this._handlePointerUp());

      document.addEventListener('touchmove', (e) => this._canvasTouchMove(e), { passive: false });
      document.addEventListener('touchend', () => this._handlePointerUp());

      this.canvas.addEventListener('click', (e) => { if (e.target === this.canvas) this._selectElement(null); });

      this.undoRedo.onChange(() => this._updateUndoRedoButtons());
    }

    _refreshPageSelect() {
      if (!this.pageSelect) return;
      this.pageSelect.innerHTML = '';
      this.pages.forEach((_, i) => {
        const opt = Utils.createElement('option', { value: String(i), textContent: `Page ${i + 1}` });
        if (i === this.currentPageIndex) opt.selected = true;
        this.pageSelect.appendChild(opt);
      });
    }

    _switchPage(i) {
      i = Math.max(0, Math.min(this.pages.length - 1, i));
      if (i === this.currentPageIndex) return;
      this.currentPageIndex = i;
      this._refreshPageSelect();
      this._selectElement(null);
      this._renderAll();
      this._buildLayerManager();
      this._commitHistory('switch-page');
    }

    _addNewPage() {
      this.pages.push({ elements: [] });
      this.currentPageIndex = this.pages.length - 1;
      this._refreshPageSelect();
      // optional: add a blank border/title
      this._addPageFrameDefaults();
      this._renderAll();
      this._commitHistory('new-page');
      Utils.showToast('New page added');
    }

    _deleteCurrentPage() {
      if (this.pages.length <= 1) return Utils.showToast('At least one page required');
      this.pages.splice(this.currentPageIndex, 1);
      this.currentPageIndex = Math.max(0, this.currentPageIndex - 1);
      this._refreshPageSelect();
      this._selectElement(null);
      this._renderAll();
      this._commitHistory('delete-page');
      Utils.showToast('Page deleted');
    }

    _addPageFrameDefaults() {
      const pW = Utils.mm2px(this.pageDims.w);
      const pH = Utils.mm2px(this.pageDims.h);
      this._addElement({ type: 'rect', name: 'Border', x: 10, y: 10, width: pW - 20, height: pH - 20, strokeColor: '#111827', strokeWidth: 2, fillColor: 'transparent' });
      this._addElement({ type: 'text', name: 'Title', x: 20, y: 15, width: pW - 40, height: 32, text: 'LPM SKETCH REPORT', fontSize: 22, fontWeight: 'bold', textAlign: 'center', color: '#111827' });
    }

    // ---------------- Zoom (wheel + pinch + buttons) ----------------
    _fitToScreen() {
      const area = this.canvasArea;
      const aW = area.clientWidth - 40;
      const aH = area.clientHeight - 40;
      const pW = Utils.mm2px(this.pageDims.w);
      const pH = Utils.mm2px(this.pageDims.h);

      this.fitScale = Math.min(aW / pW, aH / pH, 1);
      this.zoom = 1;
      this._applyScale();
      this._renderAll();
    }

    _setZoom(z) {
      this.zoom = Math.max(0.2, Math.min(3, z));
      this._applyScale();
      this._renderAll();
    }

    _applyScale() {
      const pW = Utils.mm2px(this.pageDims.w);
      const pH = Utils.mm2px(this.pageDims.h);
      this.scale = this.fitScale * this.zoom;
      this.canvas.style.width = (pW * this.scale) + 'px';
      this.canvas.style.height = (pH * this.scale) + 'px';
      if (this.zoomLabel) this.zoomLabel.textContent = Math.round(this.zoom * 100) + '%';
    }

    _onWheel(e) {
      // Zoom with mouse wheel, ctrl+wheel also works
      e.preventDefault();
      const delta = Math.sign(e.deltaY);
      const step = (e.ctrlKey || e.metaKey) ? 0.05 : 0.1;
      this._setZoom(this.zoom + (delta > 0 ? -step : step));
    }

    _onPinchStart(e) {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      const [t1, t2] = e.touches;
      this._pinch = {
        startDist: Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY),
        startZoom: this.zoom
      };
    }

    _onPinchMove(e) {
      if (!this._pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const [t1, t2] = e.touches;
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const ratio = dist / (this._pinch.startDist || 1);
      this._setZoom(this._pinch.startZoom * ratio);
    }

    _onPinchEnd() {
      this._pinch = null;
    }

    // ---------------- Tools ----------------
    _toggleTools() {
      this.toolsCollapsed = !this.toolsCollapsed;
      this.toolsPanel.classList.toggle('collapsed', this.toolsCollapsed);
      this.toggleBtn.innerHTML = this.toolsCollapsed ? `Tools ▶` : `Tools ${ICONS.chevron}`;
    }

    _setTool(tool) {
      this.activeTool = tool;
      this._lineFirstClick = null;
      this._linePreviewElId = null;

      this.canvas.querySelectorAll('.prt-tool-btn').forEach(b => b.classList.remove('active'));
      const key = tool || 'pointer';
      const btn = this.overlay.querySelector(`[data-tool="${key}"]`);
      if (btn) btn.classList.add('active');

      this.canvas.classList.toggle('crosshair', !!tool);

      if (window.innerWidth < 768 && tool) {
        this.toolsCollapsed = true;
        this.toolsPanel.classList.add('collapsed');
        this.toggleBtn.innerHTML = `Tools ▶`;
      }

      if (tool === 'line' || tool === 'arrow') {
        Utils.showToast('Line/Arrow: click start point, click end point');
      }
    }

    // ---------------- Elements per page ----------------
    _addDefaultElementsToCurrentPage() {
      const pW = Utils.mm2px(this.pageDims.w);
      const pH = Utils.mm2px(this.pageDims.h);

      this._addElement({ type: 'rect', name: 'Border', x: 10, y: 10, width: pW - 20, height: pH - 20, strokeColor: '#111827', strokeWidth: 2, fillColor: 'transparent' });
      this._addElement({ type: 'text', name: 'Title', x: 20, y: 15, width: pW - 40, height: 32, text: 'LPM SKETCH REPORT', fontSize: 22, fontWeight: 'bold', textAlign: 'center', color: '#111827' });
      this._addElement({ type: 'text', name: 'Date', x: 20, y: 45, width: pW - 40, height: 18, text: 'Generated on ' + new Date().toLocaleDateString('en-IN'), fontSize: 11, fontWeight: 'normal', textAlign: 'center', color: '#64748b' });

      const sketchH = Math.min(pH * 0.55, pW * 0.7);
      this._addElement({ type: 'sketch', name: 'Sketch', x: 30, y: 70, width: pW - 60, height: sketchH, svgContent: this.sketchSVG, sketchOptions: { showDimensions: true, showVertices: true, showNorth: true, showScale: true, showLabels: true } });

      this._addElement({ type: 'line', name: 'Divider', x: 20, y: 70 + sketchH + 10, width: pW - 40, height: 10, strokeColor: '#cbd5e1', strokeWidth: 2, rotation: 0 });

      this._addPlotDetailsAsText(70 + sketchH + 20);
    }

    _addElement(data) {
      const el = {
        id: Utils.uid(),
        name: data.name || data.type,
        rotation: data.rotation || 0,
        visible: data.visible ?? true,
        locked: data.locked ?? false,
        ...data
      };
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
          left: (el.x * s) + 'px',
          top: (el.y * s) + 'px',
          width: (el.width * s) + 'px',
          height: (Math.max(el.height, 4) * s) + 'px',
          transform: `rotate(${el.rotation || 0}deg)`,
          pointerEvents: el.locked ? 'none' : 'auto'
        }
      });

      ['nw', 'ne', 'sw', 'se'].forEach(pos => wrapper.appendChild(Utils.createElement('div', { className: `prt-resize-handle ${pos}`, 'data-handle': pos })));
      wrapper.appendChild(Utils.createElement('div', { className: 'prt-rotation-line' }));
      wrapper.appendChild(Utils.createElement('div', { className: 'prt-rotation-handle', 'data-rotate-drag': 'true' }));

      if (el.type === 'text') {
        wrapper.appendChild(Utils.createElement('div', {
          className: 'prt-text-element',
          textContent: el.text || '',
          style: {
            fontSize: (el.fontSize || 14) * s + 'px',
            fontWeight: el.fontWeight || 'normal',
            textAlign: el.textAlign || 'left',
            color: el.color || '#111827'
          }
        }));
        wrapper.addEventListener('dblclick', () => { if (!el.locked) this._openTextEditModal(el); });
      }

      if (el.type === 'line' || el.type === 'arrow') {
        const stroke = el.strokeColor || '#111827';
        const sw = (el.strokeWidth || 2) * s;
        const marker = el.type === 'arrow'
          ? `<marker id="m_${el.id}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <polygon points="0,0 8,4 0,8" fill="${stroke}"/>
            </marker>`
          : '';
        wrapper.appendChild(Utils.createElement('div', {
          className: 'prt-line-element',
          innerHTML: `<svg viewBox="0 0 ${el.width * s} ${Math.max(4, el.height) * s}" preserveAspectRatio="none">
            <defs>${marker}</defs>
            <line x1="0" y1="50%" x2="100%" y2="50%" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"
              ${el.type === 'arrow' ? `marker-end="url(#m_${el.id})"` : ''}/>
          </svg>`
        }));
      }

      if (el.type === 'rect') {
        wrapper.appendChild(Utils.createElement('div', {
          className: 'prt-rect-element',
          style: {
            border: `${(el.strokeWidth || 2) * s}px solid ${el.strokeColor || '#111827'}`,
            background: el.fillColor || 'transparent'
          }
        }));
      }

      if (el.type === 'sketch') {
        const sketchDiv = Utils.createElement('div', { className: 'prt-sketch-element', innerHTML: el.svgContent || '' });
        const svg = sketchDiv.querySelector('svg');
        if (svg) { svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%'); }
        wrapper.appendChild(sketchDiv);
      }

      if (el.type === 'qr') {
        const qrDiv = Utils.createElement('div', { className: 'prt-qr-element' });
        if (el.qrDataUrl) qrDiv.appendChild(Utils.createElement('img', { src: el.qrDataUrl }));
        wrapper.appendChild(qrDiv);
      }

      this.canvas.appendChild(wrapper);
    }

    _selectElement(el) {
      this.canvas.querySelectorAll('.prt-canvas-element.selected').forEach(e => e.classList.remove('selected'));
      this.selectedElement = el;
      if (el) {
        this.canvas.querySelector(`[data-el-id="${el.id}"]`)?.classList.add('selected');
        this._showProperties(el);
      } else {
        this._hideProperties();
      }
      this._buildLayerManager();
    }

    // ---------------- Properties ----------------
    _showProperties(el) {
      this.propsPanel.innerHTML = '';
      this.propsPanel.classList.add('visible');
      this.propsPanel.classList.toggle('minimized', this.propsMinimized);

      const header = Utils.createElement('div', { className: 'prt-props-header' });
      header.appendChild(Utils.createElement('strong', { textContent: el.name || el.type }));

      const btnRow = Utils.createElement('div', { style: { display: 'flex', gap: '6px' } });
      btnRow.appendChild(Utils.createElement('button', {
        className: 'prt-props-min-btn',
        textContent: this.propsMinimized ? 'Expand' : 'Minimize',
        onClick: () => { this.propsMinimized = !this.propsMinimized; this._showProperties(el); }
      }));
      btnRow.appendChild(Utils.createElement('button', {
        className: 'prt-props-min-btn',
        textContent: 'Close',
        onClick: () => this._selectElement(null)
      }));
      header.appendChild(btnRow);
      this.propsPanel.appendChild(header);

      const body = Utils.createElement('div', { className: 'prt-props-body' });
      this.propsPanel.appendChild(body);

      const addRow = (label, inputEl) => {
        const row = Utils.createElement('div', { className: 'prt-props-row' });
        row.appendChild(Utils.createElement('label', { textContent: label }));
        row.appendChild(inputEl);
        body.appendChild(row);
      };

      const numInput = (value, onChange) => {
        const i = Utils.createElement('input', { type: 'number', value: String(value) });
        i.step = '1';
        i.addEventListener('change', () => onChange(+i.value));
        return i;
      };

      addRow('X', numInput(Math.round(el.x), v => { el.x = v; this._renderElement(el); this._commitHistory('prop'); }));
      addRow('Y', numInput(Math.round(el.y), v => { el.y = v; this._renderElement(el); this._commitHistory('prop'); }));
      addRow('W', numInput(Math.round(el.width), v => { el.width = v; if (el.type === 'sketch') this._regenSketch(el); this._renderElement(el); this._commitHistory('prop'); }));
      addRow('H', numInput(Math.round(el.height), v => { el.height = v; if (el.type === 'sketch') this._regenSketch(el); this._renderElement(el); this._commitHistory('prop'); }));
      addRow('Rot', numInput(el.rotation || 0, v => { el.rotation = v; this._renderElement(el); this._commitHistory('prop'); }));

      // visibility / lock
      const vis = Utils.createElement('select', {});
      vis.appendChild(Utils.createElement('option', { value: '1', textContent: 'Yes' }));
      vis.appendChild(Utils.createElement('option', { value: '0', textContent: 'No' }));
      vis.value = el.visible ? '1' : '0';
      vis.addEventListener('change', () => { el.visible = vis.value === '1'; this._renderAll(); this._commitHistory('vis'); });
      addRow('Visible', vis);

      const lock = Utils.createElement('select', {});
      lock.appendChild(Utils.createElement('option', { value: '0', textContent: 'No' }));
      lock.appendChild(Utils.createElement('option', { value: '1', textContent: 'Yes' }));
      lock.value = el.locked ? '1' : '0';
      lock.addEventListener('change', () => { el.locked = lock.value === '1'; this._renderAll(); this._commitHistory('lock'); });
      addRow('Locked', lock);

      if (el.type === 'text') {
        addRow('Font', numInput(el.fontSize || 14, v => { el.fontSize = v; this._renderElement(el); this._commitHistory('prop'); }));

        const color = Utils.createElement('input', { type: 'color', value: el.color || '#111827' });
        color.addEventListener('change', () => { el.color = color.value; this._renderElement(el); this._commitHistory('prop'); });
        addRow('Color', color);

        const align = Utils.createElement('select', {});
        ['left', 'center', 'right'].forEach(a => align.appendChild(Utils.createElement('option', { value: a, textContent: a })));
        align.value = el.textAlign || 'left';
        align.addEventListener('change', () => { el.textAlign = align.value; this._renderElement(el); this._commitHistory('prop'); });
        addRow('Align', align);

        const weight = Utils.createElement('select', {});
        ['normal', 'bold'].forEach(w => weight.appendChild(Utils.createElement('option', { value: w, textContent: w })));
        weight.value = el.fontWeight || 'normal';
        weight.addEventListener('change', () => { el.fontWeight = weight.value; this._renderElement(el); this._commitHistory('prop'); });
        addRow('Weight', weight);

        body.appendChild(Utils.createElement('button', {
          className: 'prt-btn prt-btn-primary prt-btn-sm prt-btn-block',
          textContent: 'Edit Text',
          onClick: () => this._openTextEditModal(el)
        }));
      }

      if (el.type === 'line' || el.type === 'arrow' || el.type === 'rect') {
        const stroke = Utils.createElement('input', { type: 'color', value: el.strokeColor || '#111827' });
        stroke.addEventListener('change', () => { el.strokeColor = stroke.value; this._renderElement(el); this._commitHistory('prop'); });
        addRow('Stroke', stroke);

        addRow('StrokeW', numInput(el.strokeWidth || 2, v => { el.strokeWidth = v; this._renderElement(el); this._commitHistory('prop'); }));
      }

      if (el.type === 'rect') {
        const fill = Utils.createElement('input', { type: 'color', value: (el.fillColor && el.fillColor !== 'transparent') ? el.fillColor : '#ffffff' });
        fill.addEventListener('change', () => { el.fillColor = fill.value; this._renderElement(el); this._commitHistory('prop'); });
        addRow('Fill', fill);

        const noFill = Utils.createElement('select', {});
        noFill.appendChild(Utils.createElement('option', { value: '0', textContent: 'Fill' }));
        noFill.appendChild(Utils.createElement('option', { value: '1', textContent: 'Transparent' }));
        noFill.value = (el.fillColor === 'transparent') ? '1' : '0';
        noFill.addEventListener('change', () => { el.fillColor = (noFill.value === '1') ? 'transparent' : (fill.value || '#ffffff'); this._renderElement(el); this._commitHistory('prop'); });
        addRow('No Fill', noFill);
      }

      // Sketch controls (requested #3)
      if (el.type === 'sketch') {
        const opts = el.sketchOptions || (el.sketchOptions = {});
        const mkToggle = (label, key) => {
          const sel = Utils.createElement('select', {});
          sel.appendChild(Utils.createElement('option', { value: '1', textContent: 'On' }));
          sel.appendChild(Utils.createElement('option', { value: '0', textContent: 'Off' }));
          sel.value = (opts[key] ?? true) ? '1' : '0';
          sel.addEventListener('change', () => {
            opts[key] = sel.value === '1';
            this._regenSketch(el);
            this._renderElement(el);
            this._commitHistory('sketch-opt');
          });
          addRow(label, sel);
        };

        mkToggle('Dims', 'showDimensions');
        mkToggle('Vertices', 'showVertices');
        mkToggle('North', 'showNorth');
        mkToggle('Scale', 'showScale');
        mkToggle('Labels', 'showLabels');

        body.appendChild(Utils.createElement('button', {
          className: 'prt-btn prt-btn-outline prt-btn-sm prt-btn-block',
          textContent: 'Regenerate sketch',
          onClick: () => { this._regenSketch(el); this._renderElement(el); this._commitHistory('sketch-regen'); }
        }));
      }

      body.appendChild(Utils.createElement('button', {
        className: 'prt-btn prt-btn-danger prt-btn-sm prt-btn-block',
        textContent: 'Delete Element',
        style: { marginTop: '10px' },
        onClick: () => this._deleteSelected()
      }));
    }

    _hideProperties() {
      this.propsPanel.classList.remove('visible');
    }

    _openTextEditModal(el) {
      const backdrop = Utils.createElement('div', { className: 'prt-modal-backdrop' });
      const modal = Utils.createElement('div', { className: 'prt-modal' });

      const header = Utils.createElement('div', { className: 'prt-modal-header' });
      header.appendChild(Utils.createElement('h3', { textContent: 'Edit Text' }));
      header.appendChild(Utils.createElement('button', { className: 'prt-panel-close', textContent: '✕', onClick: () => backdrop.remove() }));
      modal.appendChild(header);

      const body = Utils.createElement('div', { className: 'prt-modal-body' });
      const ta = Utils.createElement('textarea', { className: 'prt-textarea', rows: '10' });
      ta.value = el.text || '';
      body.appendChild(ta);
      modal.appendChild(body);

      const footer = Utils.createElement('div', { className: 'prt-modal-footer' });
      footer.appendChild(Utils.createElement('button', { className: 'prt-btn prt-btn-outline', textContent: 'Cancel', onClick: () => backdrop.remove() }));
      footer.appendChild(Utils.createElement('button', {
        className: 'prt-btn prt-btn-primary',
        textContent: 'Apply',
        onClick: () => {
          el.text = ta.value;
          this._renderElement(el);
          this._commitHistory('text');
          backdrop.remove();
        }
      }));
      modal.appendChild(footer);

      backdrop.appendChild(modal);
      document.body.appendChild(backdrop);
    }

    // ---------------- Layer manager tool ----------------
    _toggleLayerManager() {
      this.layerManagerVisible = !this.layerManagerVisible;
      this.layerManagerEl.style.display = this.layerManagerVisible ? 'flex' : 'none';
      if (this.layerManagerVisible) this._buildLayerManager();
    }

    _buildLayerManager() {
      if (!this.layerManagerVisible) return;

      const lm = this.layerManagerEl;
      lm.innerHTML = '';

      const hdr = Utils.createElement('div', { className: 'prt-lm-header' });
      hdr.appendChild(Utils.createElement('span', { textContent: `Layers (Page ${this.currentPageIndex + 1})` }));
      hdr.appendChild(Utils.createElement('button', { className: 'prt-lm-btn', textContent: '✕', onClick: () => this._toggleLayerManager() }));
      lm.appendChild(hdr);

      const body = Utils.createElement('div', { className: 'prt-lm-body' });

      [...this.elements].reverse().forEach((el, revIdx) => {
        const actualIndex = this.elements.length - 1 - revIdx;

        const item = Utils.createElement('div', {
          className: 'prt-lm-item' + (this.selectedElement?.id === el.id ? ' selected' : ''),
          onClick: () => this._selectElement(el)
        });

        item.appendChild(Utils.createElement('span', {
          textContent: el.name || el.type,
          style: { flex: '1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
        }));

        const controls = Utils.createElement('div', { className: 'prt-lm-controls' });
        controls.appendChild(Utils.createElement('button', { className: 'prt-lm-btn', textContent: el.visible ? '👁' : '🚫', onClick: (e) => { e.stopPropagation(); el.visible = !el.visible; this._renderAll(); this._commitHistory('vis'); } }));
        controls.appendChild(Utils.createElement('button', { className: 'prt-lm-btn', textContent: el.locked ? '🔒' : '🔓', onClick: (e) => { e.stopPropagation(); el.locked = !el.locked; this._renderAll(); this._commitHistory('lock'); } }));
        controls.appendChild(Utils.createElement('button', {
          className: 'prt-lm-btn', textContent: '▲',
          onClick: (e) => {
            e.stopPropagation();
            if (actualIndex < this.elements.length - 1) {
              this.elements.splice(actualIndex, 1);
              this.elements.splice(actualIndex + 1, 0, el);
              this._renderAll();
              this._commitHistory('reorder');
            }
          }
        }));
        controls.appendChild(Utils.createElement('button', {
          className: 'prt-lm-btn', textContent: '▼',
          onClick: (e) => {
            e.stopPropagation();
            if (actualIndex > 0) {
              this.elements.splice(actualIndex, 1);
              this.elements.splice(actualIndex - 1, 0, el);
              this._renderAll();
              this._commitHistory('reorder');
            }
          }
        }));
        item.appendChild(controls);

        body.appendChild(item);
      });

      lm.appendChild(body);
    }

    // ---------------- Canvas interactions ----------------
    _canvasMouseDown(e) {
      const pos = this._getCanvasPos(e);
      this._handlePointerDown(pos, e);
    }

    _canvasTouchStart(e) {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      const pos = this._getCanvasPosTouch(e.touches[0]);
      this._handlePointerDown(pos, e.touches[0]);
    }

    _canvasMouseMove(e) {
      const pos = this._getCanvasPos(e);
      this._handlePointerMove(pos, e);
    }

    _canvasTouchMove(e) {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      const pos = this._getCanvasPosTouch(e.touches[0]);
      this._handlePointerMove(pos, e.touches[0]);
    }

    _handlePointerDown(pos, e) {
      const s = this.scale;

      // Rotate
      if (this.selectedElement) {
        const rotHandle = e.target?.closest?.('[data-rotate-drag="true"]');
        if (rotHandle) {
          const rect = this.canvas.getBoundingClientRect();
          const cx = rect.left + (this.selectedElement.x + this.selectedElement.width / 2) * s;
          const cy = rect.top + (this.selectedElement.y + this.selectedElement.height / 2) * s;
          this.dragState = {
            type: 'rotate',
            element: this.selectedElement,
            centerX: cx,
            centerY: cy,
            startRotation: this.selectedElement.rotation || 0,
            startMouseAngle: Math.atan2(e.clientY - cy, e.clientX - cx)
          };
          return;
        }
      }

      // Resize
      if (this.selectedElement) {
        const handle = e.target?.closest?.('.prt-resize-handle');
        if (handle) {
          this.dragState = {
            type: 'resize',
            handle: handle.dataset.handle,
            element: this.selectedElement,
            startX: pos.x, startY: pos.y,
            origX: this.selectedElement.x, origY: this.selectedElement.y,
            origW: this.selectedElement.width, origH: this.selectedElement.height
          };
          return;
        }
      }

      // Move existing element
      const elDom = e.target?.closest?.('.prt-canvas-element');
      if (elDom && !this.activeTool) {
        const elId = elDom.dataset.elId;
        const el = this.elements.find(x => x.id === elId);
        if (el && !el.locked) {
          this._selectElement(el);
          this.dragState = {
            type: 'move',
            element: el,
            startX: pos.x, startY: pos.y,
            origX: el.x, origY: el.y
          };
          return;
        }
      }

      // Tool placement
      if (this.activeTool) {
        const cx = pos.x / s;
        const cy = pos.y / s;

        if (this.activeTool === 'text') {
          const el = this._addElement({
            type: 'text', name: 'Text',
            x: cx, y: cy, width: 260, height: 60,
            text: 'Tap “Edit Text” in properties…',
            fontSize: 14, fontWeight: 'normal', textAlign: 'left', color: '#111827'
          });
          this._selectElement(el);
          this._commitHistory('add-text');
          this._setTool(null);
          return;
        }

        if (this.activeTool === 'rect') {
          const el = this._addElement({
            type: 'rect', name: 'Rectangle',
            x: cx, y: cy, width: 160, height: 120,
            strokeColor: '#111827', strokeWidth: 2, fillColor: 'transparent'
          });
          this._selectElement(el);
          this._commitHistory('add-rect');
          this._setTool(null);
          return;
        }

        // TWO-CLICK Line/Arrow
        if (this.activeTool === 'line' || this.activeTool === 'arrow') {
          if (!this._lineFirstClick) {
            // first click: create preview element
            const el = this._addElement({
              type: this.activeTool,
              name: this.activeTool === 'arrow' ? 'Arrow' : 'Line',
              x: cx, y: cy,
              width: 2, height: 10,
              strokeColor: '#111827', strokeWidth: 2,
              rotation: 0
            });
            this._lineFirstClick = { x: cx, y: cy };
            this._linePreviewElId = el.id;
            this._selectElement(el);
            return;
          } else {
            // second click: finalize
            const el = this.elements.find(e => e.id === this._linePreviewElId);
            if (el) {
              const dx = cx - this._lineFirstClick.x;
              const dy = cy - this._lineFirstClick.y;
              const dist = Math.max(2, Math.hypot(dx, dy));
              const ang = Math.atan2(dy, dx) * 180 / Math.PI;

              el.width = dist;
              el.height = 10;
              el.rotation = Math.round(ang);
              this._renderElement(el);
              this._commitHistory('add-line');
            }
            this._lineFirstClick = null;
            this._linePreviewElId = null;
            this._setTool(null);
            return;
          }
        }
      }
    }

    _handlePointerMove(pos, e) {
      const s = this.scale;

      // If placing line/arrow (between first and second click), update preview
      if ((this.activeTool === 'line' || this.activeTool === 'arrow') && this._lineFirstClick && this._linePreviewElId) {
        const el = this.elements.find(x => x.id === this._linePreviewElId);
        if (el) {
          const cx = pos.x / s;
          const cy = pos.y / s;
          const dx = cx - this._lineFirstClick.x;
          const dy = cy - this._lineFirstClick.y;
          const dist = Math.max(2, Math.hypot(dx, dy));
          const ang = Math.atan2(dy, dx) * 180 / Math.PI;
          el.width = dist;
          el.height = 10;
          el.rotation = Math.round(ang);
          this._renderElement(el);
        }
      }

      if (!this.dragState) return;

      if (this.dragState.type === 'move') {
        const el = this.dragState.element;
        el.x = this.dragState.origX + (pos.x - this.dragState.startX) / s;
        el.y = this.dragState.origY + (pos.y - this.dragState.startY) / s;
        this._updateElementPosition(el);
        return;
      }

      if (this.dragState.type === 'resize') {
        const el = this.dragState.element;
        const dx = (pos.x - this.dragState.startX) / s;
        const dy = (pos.y - this.dragState.startY) / s;
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
        const diffDeg = (angle - this.dragState.startMouseAngle) * 180 / Math.PI;
        el.rotation = Math.round(this.dragState.startRotation + diffDeg);
        this._updateElementPosition(el);
      }
    }

    _handlePointerUp() {
      if (!this.dragState) return;
      const el = this.dragState.element;
      if (el?.type === 'sketch' && this.dragState.type === 'resize') this._regenSketch(el);
      this.dragState = null;
      this._commitHistory('pointer-up');
    }

    _updateElementPosition(el) {
      const dom = this.canvas.querySelector(`[data-el-id="${el.id}"]`);
      if (!dom) return;
      const s = this.scale;
      dom.style.left = (el.x * s) + 'px';
      dom.style.top = (el.y * s) + 'px';
      dom.style.width = (el.width * s) + 'px';
      dom.style.height = (Math.max(el.height, 4) * s) + 'px';
      dom.style.transform = `rotate(${el.rotation || 0}deg)`;
    }

    _getCanvasPos(e) {
      const rect = this.canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    _getCanvasPosTouch(t) {
      const rect = this.canvas.getBoundingClientRect();
      return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    }

    // ---------------- Sketch regeneration ----------------
    _regenSketch(el) {
      if (!this.polygonsData) return;
      const renderer = new SketchRenderer();
      const opts = el.sketchOptions || {};
      el.svgContent = renderer.render(this.polygonsData, el.width, el.height, opts);
      this._renderElement(el);
    }

    _regenSketchDebounced(el) {
      clearTimeout(el._regenTimer);
      el._regenTimer = setTimeout(() => this._regenSketch(el), 150);
    }

    _addSketchElement() {
      const pW = Utils.mm2px(this.pageDims.w);
      const el = this._addElement({
        type: 'sketch', name: 'Sketch',
        x: 30, y: 90, width: pW - 60, height: 280,
        svgContent: this.sketchSVG,
        sketchOptions: { showDimensions: true, showVertices: true, showNorth: true, showScale: true, showLabels: true }
      });
      this._selectElement(el);
      this._commitHistory('add-sketch');
    }

    // ---------------- Details as TEXT ----------------
    _buildPlotDetailsText() {
      if (!this.polygonsData?.length) return 'PLOT DETAILS\n(no data)';
      let text = 'PLOT DETAILS\n';
      this.polygonsData.forEach((poly, i) => {
        if (this.polygonsData.length > 1) text += `\n--- PLOT ${i + 1} ---\n`;
        const props = poly.properties || {};
        Object.keys(props).forEach(k => {
          if (k === 'geometry') return;
          const v = props[k];
          if (v == null || typeof v === 'object') return;
          text += `${k}: ${v}\n`;
        });
      });
      return text.trim();
    }

    _addPlotDetailsAsText(customY) {
      if (!this.polygonsData?.length) return;

      const pW = Utils.mm2px(this.pageDims.w);
      const pH = Utils.mm2px(this.pageDims.h);
      const y = customY ?? (pH - 220);

      const el = this._addElement({
        type: 'text', name: 'Plot Details',
        x: 30, y,
        width: pW - 60,
        height: Math.max(160, pH - y - 30),
        text: this._buildPlotDetailsText(),
        fontSize: 11, fontWeight: 'normal', textAlign: 'left', color: '#111827',
        binding: 'plotDetails'
      });

      this._selectElement(el);
      this._commitHistory('add-details');
    }

    // ---------------- QR Modal (Telugu-safe) ----------------
    _openQRModal() {
      this._setTool(null);

      const backdrop = Utils.createElement('div', { className: 'prt-modal-backdrop' });
      const modal = Utils.createElement('div', { className: 'prt-modal' });

      const header = Utils.createElement('div', { className: 'prt-modal-header' });
      header.appendChild(Utils.createElement('h3', { textContent: 'Generate QR Code' }));
      header.appendChild(Utils.createElement('button', { className: 'prt-panel-close', textContent: '✕', onClick: () => backdrop.remove() }));
      modal.appendChild(header);

      const body = Utils.createElement('div', { className: 'prt-modal-body' });
      body.appendChild(Utils.createElement('label', { textContent: 'Include:', style: { display: 'block', fontWeight: '800', marginBottom: '8px', color: '#334155' } }));

      const group = Utils.createElement('div', { className: 'prt-checkbox-group' });
      const coordItem = Utils.createElement('div', { className: 'prt-checkbox-item' });
      const coordCb = Utils.createElement('input', { type: 'checkbox', id: 'qr-coords', checked: 'true' });
      coordItem.append(coordCb, Utils.createElement('label', { for: 'qr-coords', textContent: 'Coordinates' }));
      group.appendChild(coordItem);

      const props = this.polygonsData?.[0]?.properties || {};
      Object.keys(props).forEach(k => {
        if (k === 'geometry' || typeof props[k] === 'object') return;
        const item = Utils.createElement('div', { className: 'prt-checkbox-item' });
        const cb = Utils.createElement('input', { type: 'checkbox', 'data-attr': k, checked: 'true' });
        item.append(cb, Utils.createElement('label', { textContent: k }));
        group.appendChild(item);
      });

      body.appendChild(group);

      body.appendChild(Utils.createElement('label', { textContent: 'Extra note (Telugu allowed):', style: { display: 'block', fontWeight: '800', marginTop: '12px', marginBottom: '6px', color: '#334155' } }));
      const note = Utils.createElement('textarea', { className: 'prt-textarea', rows: '3', placeholder: 'Optional…' });
      body.appendChild(note);

      body.appendChild(Utils.createElement('label', { textContent: 'QR size (px):', style: { display: 'block', fontWeight: '800', marginTop: '12px', marginBottom: '6px', color: '#334155' } }));
      const sizeInput = Utils.createElement('input', { className: 'prt-input', type: 'number', value: '180', min: '80', max: '600' });
      body.appendChild(sizeInput);

      modal.appendChild(body);

      const footer = Utils.createElement('div', { className: 'prt-modal-footer' });
      footer.appendChild(Utils.createElement('button', { className: 'prt-btn prt-btn-outline', textContent: 'Cancel', onClick: () => backdrop.remove() }));
      footer.appendChild(Utils.createElement('button', {
        className: 'prt-btn prt-btn-primary',
        textContent: 'Add',
        onClick: () => {
          const data = this._buildQRData(group, note.value);
          const size = parseInt(sizeInput.value) || 180;
          const url = Utils.generateQRDataUrlUtf8(data, size);
          if (!url) return Utils.showToast('QR failed: library missing?');

          const pW = Utils.mm2px(this.pageDims.w);
          const el = this._addElement({
            type: 'qr', name: 'QR Code',
            x: pW - size - 30, y: 20,
            width: size, height: size,
            qrData: data,
            qrDataUrl: url
          });
          this._selectElement(el);
          this._commitHistory('add-qr');
          backdrop.remove();
        }
      }));
      modal.appendChild(footer);

      backdrop.appendChild(modal);
      document.body.appendChild(backdrop);
    }

    _buildQRData(group, noteText) {
      const data = { ts: new Date().toISOString() };

      if (group.querySelector('#qr-coords')?.checked && this.polygonsData) {
        data.coords = this.polygonsData.map(p => {
          const ring = p.coords?.[0] || [];
          return ring.map(c => [Number(c[0].toFixed(6)), Number(c[1].toFixed(6))]);
        });
      }

      const attrs = {};
      group.querySelectorAll('[data-attr]').forEach(cb => {
        if (!cb.checked) return;
        const k = cb.dataset.attr;
        attrs[k] = this.polygonsData?.[0]?.properties?.[k];
      });
      if (Object.keys(attrs).length) data.attributes = attrs;

      if (noteText?.trim()) data.note = noteText.trim();
      return JSON.stringify(data);
    }

    // ---------------- Arrange ----------------
    _bringToFront() {
      if (!this.selectedElement) return;
      const idx = this.elements.findIndex(e => e.id === this.selectedElement.id);
      if (idx < 0) return;
      const [el] = this.elements.splice(idx, 1);
      this.elements.push(el);
      this._renderAll();
      this._commitHistory('front');
    }

    _sendToBack() {
      if (!this.selectedElement) return;
      const idx = this.elements.findIndex(e => e.id === this.selectedElement.id);
      if (idx < 0) return;
      const [el] = this.elements.splice(idx, 1);
      this.elements.unshift(el);
      this._renderAll();
      this._commitHistory('back');
    }

    _duplicateSelected() {
      if (!this.selectedElement) return;
      const c = { ...this.selectedElement, id: Utils.uid(), x: this.selectedElement.x + 12, y: this.selectedElement.y + 12, name: (this.selectedElement.name || this.selectedElement.type) + ' copy' };
      this.elements.push(c);
      this._renderElement(c);
      this._selectElement(c);
      this._commitHistory('dup');
    }

    _deleteSelected() {
      if (!this.selectedElement) return;
      const id = this.selectedElement.id;
      this.elements = this.elements.filter(e => e.id !== id);
      this.canvas.querySelector(`[data-el-id="${id}"]`)?.remove();
      this._selectElement(null);
      this._commitHistory('delete');
    }

    // ---------------- History (page-aware) ----------------
    _commitHistory(reason) {
      const state = {
        pageSize: this.pageSize,
        pageDims: this.pageDims,
        currentPageIndex: this.currentPageIndex,
        pages: this.pages.map(p => ({
          elements: p.elements.map(e => {
            const c = { ...e };
            // keep sketch content to avoid heavy history? use placeholder and regenerate
            if (c.type === 'sketch') c.svgContent = '__SKETCH__';
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
      this.pageSize = state.pageSize || 'A4 Portrait';
      this.pageDims = state.pageDims || { ...PAGE_SIZES[this.pageSize] };
      this.pages = (state.pages || [{ elements: [] }]).map(p => ({ elements: p.elements || [] }));
      this.currentPageIndex = Math.max(0, Math.min(this.pages.length - 1, state.currentPageIndex || 0));

      // regenerate sketch placeholders
      this.pages.forEach(p => {
        p.elements.forEach(el => {
          if (el.type === 'sketch' && el.svgContent === '__SKETCH__') {
            const r = new SketchRenderer();
            el.svgContent = r.render(this.polygonsData, el.width, el.height, el.sketchOptions || {});
          }
          if (el.type === 'qr' && el.qrDataUrl === '__QR__') {
            el.qrDataUrl = el.qrData ? Utils.generateQRDataUrlUtf8(el.qrData, Math.round(el.width || 180)) : '';
          }
          if (el.binding === 'plotDetails') {
            el.text = this._buildPlotDetailsText();
          }
        });
      });

      this._refreshPageSelect();
      this._fitToScreen();
      this._selectElement(null);
      this._renderAll();
      this._buildLayerManager();
    }

    _undo() {
      const st = this.undoRedo.undo();
      if (!st) return;
      this._restoreFromState(st);
    }

    _redo() {
      const st = this.undoRedo.redo();
      if (!st) return;
      this._restoreFromState(st);
    }

    _updateUndoRedoButtons() {
      const undoBtn = this.overlay?.querySelector('[data-tool="undo"]');
      const redoBtn = this.overlay?.querySelector('[data-tool="redo"]');
      if (undoBtn) undoBtn.style.opacity = this.undoRedo.canUndo() ? '1' : '0.35';
      if (redoBtn) redoBtn.style.opacity = this.undoRedo.canRedo() ? '1' : '0.35';
    }

    // ---------------- Templates (fixed + fallback download + import) ----------------
    _saveTemplate() {
      const tpl = {
        pageSize: this.pageSize,
        pageDims: this.pageDims,
        pages: this.pages.map(p => ({
          elements: p.elements.map(e => {
            const c = { ...e };
            if (c.type === 'sketch') c.svgContent = '__SKETCH__';
            if (c.type === 'qr') c.qrDataUrl = '__QR__';
            return c;
          })
        }))
      };

      const name = prompt('Template name:', 'Template ' + new Date().toLocaleString());
      if (!name) return;

      // localStorage if available, else download
      if (Utils.safeLocalStorageAvailable()) {
        const list = JSON.parse(localStorage.getItem('prt_templates') || '[]');
        list.push({ name, date: new Date().toISOString(), data: tpl });
        localStorage.setItem('prt_templates', JSON.stringify(list));
        Utils.showToast('Template saved');
      } else {
        Utils.downloadJson(`plot-template-${Date.now()}.json`, { name, date: new Date().toISOString(), data: tpl });
        Utils.showToast('localStorage blocked; template downloaded');
      }
    }

    _openTemplateModal() {
      const backdrop = Utils.createElement('div', { className: 'prt-modal-backdrop' });
      const modal = Utils.createElement('div', { className: 'prt-modal' });

      const header = Utils.createElement('div', { className: 'prt-modal-header' });
      header.appendChild(Utils.createElement('h3', { textContent: 'Templates' }));
      header.appendChild(Utils.createElement('button', { className: 'prt-panel-close', textContent: '✕', onClick: () => backdrop.remove() }));
      modal.appendChild(header);

      const body = Utils.createElement('div', { className: 'prt-modal-body' });

      const importBtn = Utils.createElement('button', {
        className: 'prt-btn prt-btn-outline prt-btn-block',
        textContent: 'Import Template JSON',
        onClick: () => this._importTemplateFile()
      });
      body.appendChild(importBtn);

      const list = Utils.safeLocalStorageAvailable()
        ? JSON.parse(localStorage.getItem('prt_templates') || '[]')
        : [];

      if (!list.length) {
        body.appendChild(Utils.createElement('p', {
          textContent: Utils.safeLocalStorageAvailable()
            ? 'No templates saved yet.'
            : 'localStorage not available. Use Import Template JSON.',
          style: { color: '#64748b', marginTop: '12px' }
        }));
      } else {
        list.forEach((t, idx) => {
          const row = Utils.createElement('div', {
            style: { display: 'flex', justifyContent: 'space-between', gap: '10px', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '10px', marginTop: '10px' }
          });

          row.appendChild(Utils.createElement('div', {
            innerHTML: `<strong>${Utils.escapeXml(t.name)}</strong><br><small style="color:#94a3b8">${new Date(t.date).toLocaleString()}</small>`
          }));

          const btns = Utils.createElement('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } });
          btns.appendChild(Utils.createElement('button', {
            className: 'prt-btn prt-btn-primary prt-btn-sm',
            textContent: 'Load',
            onClick: () => { this._loadTemplate(t.data); backdrop.remove(); }
          }));
          btns.appendChild(Utils.createElement('button', {
            className: 'prt-btn prt-btn-danger prt-btn-sm',
            textContent: 'Delete',
            onClick: () => {
              list.splice(idx, 1);
              localStorage.setItem('prt_templates', JSON.stringify(list));
              row.remove();
            }
          }));

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
      inp.type = 'file';
      inp.accept = 'application/json,.json';
      inp.onchange = async () => {
        const f = inp.files?.[0];
        if (!f) return;
        try {
          const text = await f.text();
          const parsed = JSON.parse(text);
          const tpl = parsed.data || parsed; // support wrapped format
          this._loadTemplate(tpl);
          Utils.showToast('Template imported');
        } catch (e) {
          console.error(e);
          Utils.showToast('Invalid template JSON');
        }
      };
      inp.click();
    }

    _loadTemplate(tpl) {
      this.pageSize = tpl.pageSize || 'A4 Portrait';
      this.pageDims = tpl.pageDims || { ...PAGE_SIZES[this.pageSize] };
      this.pages = (tpl.pages || [{ elements: [] }]).map(p => ({ elements: p.elements || [] }));
      this.currentPageIndex = 0;

      // resolve placeholders
      this.pages.forEach(p => {
        p.elements.forEach(el => {
          el.id = Utils.uid();
          if (el.type === 'sketch' && el.svgContent === '__SKETCH__') {
            const r = new SketchRenderer();
            el.svgContent = r.render(this.polygonsData, el.width, el.height, el.sketchOptions || {});
          }
          if (el.type === 'qr' && el.qrDataUrl === '__QR__') {
            el.qrDataUrl = el.qrData ? Utils.generateQRDataUrlUtf8(el.qrData, Math.round(el.width || 180)) : '';
          }
          if (el.binding === 'plotDetails') {
            el.text = this._buildPlotDetailsText();
          }
        });
      });

      this._refreshPageSelect();
      this._fitToScreen();
      this._selectElement(null);
      this._renderAll();
      this._commitHistory('load-template');
      Utils.showToast('Template loaded');
    }

    // ---------------- Page size modal ----------------
    _openPageModal() {
      const backdrop = Utils.createElement('div', { className: 'prt-modal-backdrop' });
      const modal = Utils.createElement('div', { className: 'prt-modal' });

      const header = Utils.createElement('div', { className: 'prt-modal-header' });
      header.appendChild(Utils.createElement('h3', { textContent: 'Page Setup' }));
      header.appendChild(Utils.createElement('button', { className: 'prt-panel-close', textContent: '✕', onClick: () => backdrop.remove() }));
      modal.appendChild(header);

      const body = Utils.createElement('div', { className: 'prt-modal-body' });
      const sel = Utils.createElement('select', { className: 'prt-select' });
      Object.keys(PAGE_SIZES).forEach(name => {
        const opt = Utils.createElement('option', { value: name, textContent: `${name} (${PAGE_SIZES[name].w}×${PAGE_SIZES[name].h} mm)` });
        if (name === this.pageSize) opt.selected = true;
        sel.appendChild(opt);
      });
      body.appendChild(Utils.createElement('label', { textContent: 'Page size:', style: { fontWeight: '800', display: 'block', marginBottom: '6px' } }));
      body.appendChild(sel);

      const customWrap = Utils.createElement('div', { style: { marginTop: '12px', display: this.pageSize === 'Custom' ? 'block' : 'none' } });
      const wInput = Utils.createElement('input', { className: 'prt-input', type: 'number', value: this.pageDims.w });
      const hInput = Utils.createElement('input', { className: 'prt-input', type: 'number', value: this.pageDims.h, style: { marginTop: '8px' } });
      customWrap.appendChild(Utils.createElement('label', { textContent: 'Custom width (mm):', style: { fontWeight: '800', display: 'block', marginBottom: '6px' } }));
      customWrap.appendChild(wInput);
      customWrap.appendChild(Utils.createElement('label', { textContent: 'Custom height (mm):', style: { fontWeight: '800', display: 'block', marginTop: '10px', marginBottom: '6px' } }));
      customWrap.appendChild(hInput);
      body.appendChild(customWrap);

      sel.addEventListener('change', () => { customWrap.style.display = sel.value === 'Custom' ? 'block' : 'none'; });

      modal.appendChild(body);

      const footer = Utils.createElement('div', { className: 'prt-modal-footer' });
      footer.appendChild(Utils.createElement('button', { className: 'prt-btn prt-btn-outline', textContent: 'Cancel', onClick: () => backdrop.remove() }));
      footer.appendChild(Utils.createElement('button', {
        className: 'prt-btn prt-btn-primary',
        textContent: 'Apply',
        onClick: () => {
          this.pageSize = sel.value;
          this.pageDims = sel.value === 'Custom'
            ? { w: parseFloat(wInput.value) || 210, h: parseFloat(hInput.value) || 297 }
            : { ...PAGE_SIZES[sel.value] };

          this._fitToScreen();
          this._renderAll();
          this._commitHistory('page-size');
          backdrop.remove();
        }
      }));
      modal.appendChild(footer);

      backdrop.appendChild(modal);
      document.body.appendChild(backdrop);
    }

    // ---------------- Keyboard ----------------
    _handleKeyDown(e) {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key.toLowerCase() === 'z') { e.preventDefault(); this._undo(); }
      if (ctrl && e.key.toLowerCase() === 'y') { e.preventDefault(); this._redo(); }
      if (ctrl && e.key.toLowerCase() === 's') { e.preventDefault(); this._saveTemplate(); }

      if (e.key === 'Escape') {
        this._lineFirstClick = null;
        this._linePreviewElId = null;
        this._setTool(null);
        this._selectElement(null);
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectedElement) {
        e.preventDefault();
        this._deleteSelected();
      }
    }

    // ---------------- PDF generation (multi-page, Telugu-safe raster) ----------------
    async _generatePDF() {
      try {
        if (!window.jspdf) return Utils.showToast('jsPDF not loaded');
        const { jsPDF } = window.jspdf;

        const orientation = this.pageDims.w > this.pageDims.h ? 'landscape' : 'portrait';
        const pdf = new jsPDF({ orientation, unit: 'mm', format: [this.pageDims.w, this.pageDims.h] });

        for (let pIndex = 0; pIndex < this.pages.length; pIndex++) {
          if (pIndex > 0) pdf.addPage([this.pageDims.w, this.pageDims.h], orientation);

          // Temporarily render this page to DOM for element rasterization
          const savedIndex = this.currentPageIndex;
          this.currentPageIndex = pIndex;
          this._refreshPageSelect();
          this._renderAll();

          for (const el of this.elements.filter(e => e.visible)) {
            const img = await this._elementToImage(el, 3);
            if (!img?.dataUrl) continue;

            const mmX = Utils.px2mm(img.placeX);
            const mmY = Utils.px2mm(img.placeY);
            const mmW = Utils.px2mm(img.placeW);
            const mmH = Utils.px2mm(img.placeH);
            pdf.addImage(img.dataUrl, 'PNG', mmX, mmY, mmW, mmH);
          }

          // restore selection
          this.currentPageIndex = savedIndex;
          this._refreshPageSelect();
        }

        pdf.save('plot-report.pdf');
        Utils.showToast('PDF generated');
        this._renderAll();
      } catch (e) {
        console.error(e);
        Utils.showToast('PDF failed');
      }
    }

    async _elementToImage(el, scale = 3) {
      const rot = ((el.rotation || 0) % 360 + 360) % 360;
      const w = Math.max(2, el.width);
      const h = Math.max(2, el.height);

      const rad = rot * Math.PI / 180;
      const bw = rot === 0 ? w : Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad));
      const bh = rot === 0 ? h : Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad));

      const container = document.createElement('div');
      container.style.position = 'fixed';
      container.style.left = '-9999px';
      container.style.top = '0';
      container.style.width = bw + 'px';
      container.style.height = bh + 'px';
      container.style.background = 'transparent';

      const inner = document.createElement('div');
      inner.style.position = 'absolute';
      inner.style.left = ((bw - w) / 2) + 'px';
      inner.style.top = ((bh - h) / 2) + 'px';
      inner.style.width = w + 'px';
      inner.style.height = h + 'px';
      inner.style.transform = `rotate(${rot}deg)`;
      inner.style.transformOrigin = 'center center';

      if (el.type === 'text') {
        const d = document.createElement('div');
        d.style.width = '100%';
        d.style.height = '100%';
        d.style.whiteSpace = 'pre-wrap';
        d.style.wordBreak = 'break-word';
        d.style.padding = '4px';
        d.style.boxSizing = 'border-box';
        d.style.fontSize = (el.fontSize || 14) + 'px';
        d.style.fontWeight = el.fontWeight || 'normal';
        d.style.textAlign = el.textAlign || 'left';
        d.style.color = el.color || '#111827';
        d.style.fontFamily = "'Noto Sans Telugu','Noto Sans',Arial,sans-serif";
        d.textContent = el.text || '';
        inner.appendChild(d);
      } else if (el.type === 'sketch') {
        const d = document.createElement('div');
        d.style.width = '100%';
        d.style.height = '100%';
        d.innerHTML = el.svgContent || '';
        const svg = d.querySelector('svg');
        if (svg) { svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%'); }
        inner.appendChild(d);
      } else if (el.type === 'qr') {
        const img = document.createElement('img');
        img.src = el.qrDataUrl || '';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'contain';
        img.style.imageRendering = 'pixelated';
        inner.appendChild(img);
      } else if (el.type === 'rect') {
        const d = document.createElement('div');
        d.style.width = '100%';
        d.style.height = '100%';
        d.style.boxSizing = 'border-box';
        d.style.border = `${(el.strokeWidth || 2)}px solid ${el.strokeColor || '#111827'}`;
        d.style.background = (el.fillColor && el.fillColor !== 'transparent') ? el.fillColor : 'transparent';
        inner.appendChild(d);
      } else if (el.type === 'line' || el.type === 'arrow') {
        const stroke = el.strokeColor || '#111827';
        const sw = el.strokeWidth || 2;
        const marker = el.type === 'arrow'
          ? `<marker id="m" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <polygon points="0,0 8,4 0,8" fill="${stroke}"/>
            </marker>`
          : '';
        inner.innerHTML = `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
            <defs>${marker}</defs>
            <line x1="0" y1="${h / 2}" x2="${w}" y2="${h / 2}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"
              ${el.type === 'arrow' ? `marker-end="url(#m)"` : ''}/>
          </svg>`;
      }

      container.appendChild(inner);
      document.body.appendChild(container);

      try { await document.fonts.ready; } catch (_) {}
      await new Promise(r => setTimeout(r, 50));

      let dataUrl = null;
      try {
        if (typeof html2canvas === 'undefined') throw new Error('html2canvas missing');
        const canvas = await html2canvas(container, { scale, backgroundColor: null, useCORS: true, logging: false });
        dataUrl = canvas.toDataURL('image/png');
      } catch (e) {
        console.warn('[PRT] elementToImage failed', e);
      } finally {
        container.remove();
      }

      const centerX = el.x + w / 2;
      const centerY = el.y + h / 2;

      return {
        dataUrl,
        placeX: centerX - bw / 2,
        placeY: centerY - bh / 2,
        placeW: bw,
        placeH: bh
      };
    }
  }

  // --------------------------------------------------------------------------
  // MapSelector with rectangular selection (DragBox) + button toggle
  // --------------------------------------------------------------------------
  class MapSelector {
    constructor(tool) {
      this.tool = tool;
      this.map = null;
      this.selectedFeatures = [];
      this.sourceLayer = null;

      this.selectionLayer = null;
      this.highlightSource = null;

      this.bar = null;
      this.countEl = null;

      this.boxMode = false; // toggled by UI (needed for mobile); also supports Shift-drag
      this.dragBox = null;
      this._dragPanInteraction = null;
    }

    start(layerName) {
      this.map = this._findMap();
      if (!this.map) { Utils.showToast('Could not find OpenLayers map'); return; }

      this.sourceLayer = this._findLayer(layerName);
      if (!this.sourceLayer) { Utils.showToast(`Layer "${layerName}" not found`); return; }

      this.selectedFeatures = [];
      this._createHighlightLayer();
      this._createClickSelect();
      this._createDragBoxSelect();
      this._showSelectionBar();
    }

    stop() {
      this._removeClickSelect();
      this._removeDragBoxSelect();
      this._removeHighlightLayer();
      this._hideSelectionBar();
    }

    _findMap() {
      if (window.map && window.map instanceof ol.Map) return window.map;
      const allMaps = Object.values(window).filter(v => { try { return v instanceof ol.Map; } catch (e) { return false; } });
      if (allMaps.length) return allMaps[0];
      if (typeof map !== 'undefined' && map?.getView) return map;
      return null;
    }

    _findLayer(name) {
      let found = null;
      const scan = (layer) => {
        if (!layer || found) return;
        if (layer.getLayers) {
          layer.getLayers().forEach(sub => scan(sub));
          return;
        }
        const title = layer.get && (layer.get('title') || layer.get('name') || '');
        if (title === name) found = layer;
      };
      this.map.getLayers().forEach(l => scan(l));
      return found;
    }

    _realSource(layer) {
      let src = layer?.getSource?.();
      // unwrap vectorImage/cluster-ish sources that have getSource()
      let guard = 0;
      while (src && typeof src.getSource === 'function' && guard++ < 5) src = src.getSource();
      return src;
    }

    _createHighlightLayer() {
      this.highlightSource = new ol.source.Vector();
      this.selectionLayer = new ol.layer.Vector({
        source: this.highlightSource,
        style: new ol.style.Style({
          fill: new ol.style.Fill({ color: 'rgba(37, 99, 235, 0.25)' }),
          stroke: new ol.style.Stroke({ color: '#2563eb', width: 3 })
        }),
        zIndex: 999999
      });
      this.map.addLayer(this.selectionLayer);
    }

    _removeHighlightLayer() {
      if (this.selectionLayer) {
        this.map.removeLayer(this.selectionLayer);
        this.selectionLayer = null;
      }
      this.highlightSource = null;
    }

    _toggleFeature(feature) {
      const uid = ol.getUid(feature);
      const idx = this.selectedFeatures.findIndex(f => ol.getUid(f) === uid);
      if (idx >= 0) {
        this.selectedFeatures.splice(idx, 1);
        this.highlightSource.getFeatures().forEach(hf => {
          if (hf.get('_srcUid') === uid) this.highlightSource.removeFeature(hf);
        });
      } else {
        this.selectedFeatures.push(feature);
        const clone = feature.clone();
        clone.set('_srcUid', uid);
        this.highlightSource.addFeature(clone);
      }
      this._updateCount();
    }

    _createClickSelect() {
      const self = this;
      this._clickHandler = function (evt) {
        // If boxMode enabled, ignore click (so user can drag a rectangle)
        if (self.boxMode) return;

        self.map.forEachFeatureAtPixel(evt.pixel, (feature, layer) => {
          if (!feature || layer !== self.sourceLayer) return;
          const geom = feature.getGeometry?.();
          const t = geom?.getType?.();
          if (t !== 'Polygon' && t !== 'MultiPolygon') return;
          self._toggleFeature(feature);
        }, { layerFilter: l => l === self.sourceLayer, hitTolerance: 6 });
      };

      this._pointerHandler = (evt) => {
        const hit = self.map.hasFeatureAtPixel(evt.pixel, { layerFilter: l => l === self.sourceLayer, hitTolerance: 6 });
        self.map.getTargetElement().style.cursor = self.boxMode ? 'crosshair' : (hit ? 'pointer' : '');
      };

      this.map.on('click', this._clickHandler);
      this.map.on('pointermove', this._pointerHandler);
    }

    _removeClickSelect() {
      if (this._clickHandler) this.map.un('click', this._clickHandler);
      if (this._pointerHandler) this.map.un('pointermove', this._pointerHandler);
      this._clickHandler = null;
      this._pointerHandler = null;
      if (this.map) this.map.getTargetElement().style.cursor = '';
    }

    _createDragBoxSelect() {
      const self = this;

      // Find DragPan to disable when boxMode enabled (mobile friendly)
      const interactions = this.map.getInteractions().getArray();
      this._dragPanInteraction = interactions.find(i => i instanceof ol.interaction.DragPan) || null;

      this.dragBox = new ol.interaction.DragBox({
        condition: function (evt) {
          // Shift-drag always works, OR explicit boxMode
          return self.boxMode || ol.events.condition.shiftKeyOnly(evt);
        }
      });

      this.map.addInteraction(this.dragBox);

      this.dragBox.on('boxend', function () {
        const extent = self.dragBox.getGeometry().getExtent();
        const src = self._realSource(self.sourceLayer);
        if (!src || typeof src.getFeaturesInExtent !== 'function') {
          Utils.showToast('Layer source does not support box select');
          return;
        }

        const feats = src.getFeaturesInExtent(extent) || [];
        feats.forEach(f => {
          const g = f.getGeometry?.();
          if (!g) return;
          const t = g.getType?.();
          if (t !== 'Polygon' && t !== 'MultiPolygon') return;
          // Add selection (not toggle) for box
          const uid = ol.getUid(f);
          const exists = self.selectedFeatures.some(x => ol.getUid(x) === uid);
          if (!exists) self._toggleFeature(f);
        });
      });

      this.dragBox.on('boxstart', function () {
        // cursor feedback
        try { self.map.getTargetElement().style.cursor = 'crosshair'; } catch (_) {}
      });
    }

    _removeDragBoxSelect() {
      if (this.dragBox) {
        try { this.map.removeInteraction(this.dragBox); } catch (_) {}
        this.dragBox = null;
      }
      // ensure pan restored
      if (this._dragPanInteraction) this._dragPanInteraction.setActive(true);
    }

    _showSelectionBar() {
      this.bar?.remove();

      this.bar = Utils.createElement('div', { className: 'prt-selection-bar' });
      const info = Utils.createElement('div', { className: 'prt-selection-bar-info' });
      info.appendChild(Utils.createElement('span', { textContent: 'Select plots (Shift-drag for box)' }));
      this.countEl = Utils.createElement('span', { className: 'prt-selection-count', textContent: '0 selected' });
      info.appendChild(this.countEl);

      const actions = Utils.createElement('div', { className: 'prt-selection-bar-actions' });

      const boxBtn = Utils.createElement('button', {
        className: 'prt-selection-toolbtn',
        title: 'Toggle Box Selection',
        textContent: '▭',
        onClick: () => {
          this.boxMode = !this.boxMode;
          boxBtn.classList.toggle('active', this.boxMode);

          // Disable map panning when boxMode enabled (so drag draws rectangle)
          if (this._dragPanInteraction) this._dragPanInteraction.setActive(!this.boxMode);

          Utils.showToast(this.boxMode ? 'Box mode ON: drag to select' : 'Box mode OFF: click to select');
        }
      });

      const clearBtn = Utils.createElement('button', {
        className: 'prt-selection-toolbtn',
        title: 'Clear selection',
        textContent: '⟲',
        onClick: () => {
          this.selectedFeatures = [];
          this.highlightSource?.clear();
          this._updateCount();
        }
      });

      const cancelBtn = Utils.createElement('button', {
        className: 'prt-selection-cancel',
        title: 'Cancel',
        innerHTML: ICONS.cancel,
        onClick: () => { this.stop(); this.tool.showPanel('initial'); }
      });

      const confirmBtn = Utils.createElement('button', {
        className: 'prt-selection-confirm',
        title: 'Confirm',
        innerHTML: ICONS.check,
        onClick: () => {
          if (!this.selectedFeatures.length) return Utils.showToast('Select at least one polygon');
          const data = this._extractData();
          this.stop();
          this.tool.onSelectionConfirmed(data);
        }
      });

      actions.append(boxBtn, clearBtn, cancelBtn, confirmBtn);
      this.bar.append(info, actions);

      document.body.appendChild(this.bar);
      requestAnimationFrame(() => this.bar.classList.add('visible'));
    }

    _hideSelectionBar() {
      if (!this.bar) return;
      this.bar.classList.remove('visible');
      setTimeout(() => this.bar?.remove(), 300);
      this.bar = null;
    }

    _updateCount() {
      if (this.countEl) this.countEl.textContent = `${this.selectedFeatures.length} selected`;
    }

    _extractData() {
      const mapProj = this.map.getView().getProjection();
      return this.selectedFeatures.map((feature, idx) => {
        const geom = feature.getGeometry();
        let coords = [];

        if (geom.getType() === 'Polygon') {
          coords = geom.getCoordinates().map(ring =>
            ring.map(c => {
              try { return ol.proj.toLonLat(c, mapProj); } catch (_) { return c; }
            })
          );
        } else if (geom.getType() === 'MultiPolygon') {
          geom.getCoordinates().forEach(poly => {
            poly.forEach(ring => {
              coords.push(ring.map(c => {
                try { return ol.proj.toLonLat(c, mapProj); } catch (_) { return c; }
              }));
            });
          });
        }

        const props = feature.getProperties();
        const properties = {};
        Object.entries(props).forEach(([k, v]) => {
          if (k === 'geometry') return;
          if (v == null || typeof v === 'object') return;
          properties[k] = v;
        });

        return { coords, properties, index: idx };
      });
    }
  }

  // --------------------------------------------------------------------------
  // Main tool
  // --------------------------------------------------------------------------
  class PlotReportTool {
    constructor() {
      this.panel = null;
      this.mainBtn = null;

      this.mapSelector = new MapSelector(this);
      this.sketchRenderer = new SketchRenderer();
      this.designer = new DesignerCanvas(this);

      this.selectedLayer = null;
      this.polygonsData = null;
      this.sketchSVG = null;

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
      this.mainBtn = Utils.createElement('button', {
        className: 'prt-main-btn',
        innerHTML: ICONS.plot,
        title: 'Plot Report Tool',
        onClick: () => this.showPanel('initial')
      });
      document.body.appendChild(this.mainBtn);
    }

    showPanel(state) {
      this._hidePanel();
      this.panel = Utils.createElement('div', { className: 'prt-panel' });

      if (state === 'initial') this._buildInitialPanel();
      if (state === 'preview') this._buildPreviewPanel();

      document.body.appendChild(this.panel);
      requestAnimationFrame(() => this.panel.classList.add('open'));
    }

    _hidePanel() {
      if (!this.panel) return;
      this.panel.classList.remove('open');
      setTimeout(() => this.panel?.remove(), 300);
      this.panel = null;
    }

    _buildInitialPanel() {
      const header = Utils.createElement('div', { className: 'prt-panel-header' });
      header.appendChild(Utils.createElement('h2', { textContent: 'Plot Report Tool' }));
      header.appendChild(Utils.createElement('button', { className: 'prt-panel-close', textContent: ICONS.close, onClick: () => this._hidePanel() }));
      this.panel.appendChild(header);

      const body = Utils.createElement('div', { className: 'prt-panel-body' });

      const layerGroup = Utils.createElement('div', { className: 'prt-form-group' });
      layerGroup.appendChild(Utils.createElement('label', { textContent: 'Select Layer' }));

      const layerSelect = Utils.createElement('select', { className: 'prt-select' });
      layerSelect.appendChild(Utils.createElement('option', { value: '', textContent: '-- Choose a layer --' }));

      const layers = this._getMapLayers();
      layers.forEach(l => layerSelect.appendChild(Utils.createElement('option', { value: l.name, textContent: l.name })));

      layerGroup.appendChild(layerSelect);
      body.appendChild(layerGroup);

      body.appendChild(Utils.createElement('p', {
        textContent: 'Select a polygon layer and press Start. Tip: Shift + drag for rectangular selection (or use the box button).',
        style: { fontSize: '13px', color: '#6b7280', lineHeight: '1.5' }
      }));

      body.appendChild(Utils.createElement('button', {
        className: 'prt-btn prt-btn-primary prt-btn-block',
        innerHTML: `${ICONS.select} Start Map Selection`,
        onClick: () => {
          const layerName = layerSelect.value;
          if (!layerName) return Utils.showToast('Please select a layer first');
          this.selectedLayer = layerName;
          this._hidePanel();
          this.mapSelector.start(layerName);
        }
      }));

      this.panel.appendChild(body);
    }

    _buildPreviewPanel() {
      const header = Utils.createElement('div', { className: 'prt-panel-header' });
      header.appendChild(Utils.createElement('h2', { textContent: 'Sketch Preview' }));
      header.appendChild(Utils.createElement('button', { className: 'prt-panel-close', textContent: ICONS.close, onClick: () => this._hidePanel() }));
      this.panel.appendChild(header);

      const body = Utils.createElement('div', { className: 'prt-panel-body' });

      const preview = Utils.createElement('div', { className: 'prt-sketch-preview' });
      preview.innerHTML = this.sketchSVG || '<p>No sketch available</p>';
      body.appendChild(preview);

      const count = this.polygonsData?.length || 0;
      body.appendChild(Utils.createElement('p', {
        innerHTML: `<strong>${count}</strong> polygon${count !== 1 ? 's' : ''} selected`,
        style: { fontSize: '14px', color: '#374151', margin: '0 0 10px' }
      }));

      if (this.polygonsData?.length) {
        const props = this.polygonsData[0].properties || {};
        const table = Utils.createElement('table', { className: 'prt-attr-table' });
        Object.entries(props).forEach(([k, v]) => {
          if (v == null || k === 'geometry' || typeof v === 'object') return;
          const tr = Utils.createElement('tr');
          tr.appendChild(Utils.createElement('th', { textContent: k }));
          tr.appendChild(Utils.createElement('td', { textContent: String(v) }));
          table.appendChild(tr);
        });
        body.appendChild(table);
      }

      body.appendChild(Utils.createElement('button', {
        className: 'prt-btn prt-btn-primary prt-btn-block',
        innerHTML: `${ICONS.template} Open Report Designer`,
        onClick: () => {
          this._hidePanel();
          this.designer.open(this.sketchSVG, this.polygonsData);
        }
      }));

      body.appendChild(Utils.createElement('button', {
        className: 'prt-btn prt-btn-outline prt-btn-block',
        textContent: '← Select Different Plots',
        style: { marginTop: '8px' },
        onClick: () => this.showPanel('initial')
      }));

      this.panel.appendChild(body);
    }

    _getMapLayers() {
      const layers = [];
      try {
        const map = this.mapSelector._findMap();
        if (!map) return layers;

        const scan = (layer) => {
          if (!layer) return;
          if (layer.getLayers) {
            layer.getLayers().forEach(sub => scan(sub));
            return;
          }
          const name = layer.get('title') || layer.get('name') || '';
          if (name && layer instanceof ol.layer.Vector) layers.push({ name, layer });
        };
        map.getLayers().forEach(l => scan(l));
      } catch (e) {
        console.warn('[PRT] Layer fetch error:', e);
      }
      return layers;
    }

    onSelectionConfirmed(polygonsData) {
      this.polygonsData = polygonsData;
      this.sketchSVG = this.sketchRenderer.render(polygonsData, 520, 420, {
        showDimensions: true, showVertices: true, showNorth: true, showScale: true, showLabels: true
      });
      this.showPanel('preview');
    }
  }

  // --------------------------------------------------------------------------
  // Init
  // --------------------------------------------------------------------------
  function initPlotReportTool() {
    if (typeof ol === 'undefined') {
      console.warn('[PRT] OpenLayers not found. Retrying...');
      setTimeout(initPlotReportTool, 1000);
      return;
    }
    window.plotReportTool = new PlotReportTool();
    console.log('[PRT] Plot Report Tool loaded');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(initPlotReportTool, 500));
  } else {
    setTimeout(initPlotReportTool, 500);
  }

})();