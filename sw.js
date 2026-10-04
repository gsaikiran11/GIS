// ============================================================
// WEB MAP SURVEY — PWA SERVICE WORKER
// QGIS2WEB + OPENLAYERS
// GitHub Pages: /GIS/
// ============================================================

const APP_PREFIX = "GIS";
const VERSION = "v2";

const CACHE_NAME = `${APP_PREFIX}-${VERSION}`;
const APP_ROOT = "/GIS/";


// ============================================================
// APPLICATION SHELL
// ============================================================
//
// Only essential files need to be listed here.
//
// Other JS/CSS/images requested by the application are
// cached automatically by the fetch handler.
//

const PRECACHE = [
    "/GIS/",
    "/GIS/index.html",
    "/GIS/0. app.js",
    "/GIS/style.css",
    "/GIS/manifest.json"
];


// ============================================================
// INSTALL
// ============================================================

self.addEventListener("install", (event) => {

    event.waitUntil(

        caches.open(CACHE_NAME)
            .then(async (cache) => {

                await Promise.allSettled(

                    PRECACHE.map(async (url) => {

                        try {

                            const response = await fetch(
                                url,
                                {
                                    cache: "no-cache"
                                }
                            );

                            if (response.ok) {

                                await cache.put(
                                    url,
                                    response
                                );

                            } else {

                                console.warn(
                                    "[GIS SW] Precache failed:",
                                    url,
                                    response.status
                                );

                            }

                        } catch (error) {

                            console.warn(
                                "[GIS SW] Could not precache:",
                                url,
                                error
                            );

                        }

                    })

                );

            })
    );

    // Activate the new worker immediately.
    self.skipWaiting();

});


// ============================================================
// ACTIVATE
// ============================================================

self.addEventListener("activate", (event) => {

    event.waitUntil(

        caches.keys()
            .then((cacheNames) => {

                return Promise.all(

                    cacheNames.map((cacheName) => {

                        // Delete only old GIS caches.
                        if (
                            cacheName.startsWith(
                                `${APP_PREFIX}-`
                            ) &&
                            cacheName !== CACHE_NAME
                        ) {

                            console.log(
                                "[GIS SW] Deleting old cache:",
                                cacheName
                            );

                            return caches.delete(
                                cacheName
                            );

                        }

                        return Promise.resolve();

                    })

                );

            })
            .then(() => {

                // Take control of existing pages.
                return self.clients.claim();

            })

    );

});


// ============================================================
// FETCH
// ============================================================

self.addEventListener("fetch", (event) => {

    const request = event.request;

    // Service worker only handles GET.
    if (request.method !== "GET") {
        return;
    }

    const url = new URL(request.url);


    // ========================================================
    // HTML / PAGE NAVIGATION
    // ========================================================
    //
    // Network first:
    //
    // Online  → newest index.html
    // Offline → cached index.html
    //
    // This prevents GitHub Pages updates from being stuck
    // behind an old cached index.html.
    //

    if (
        request.mode === "navigate" ||
        request.destination === "document"
    ) {

        event.respondWith(
            networkFirst(request)
        );

        return;
    }


    // ========================================================
    // LOCAL GIS FILES
    // ========================================================
    //
    // JS, CSS, images, fonts, JSON, GeoJSON, etc.
    //
    // Cache first:
    //
    // Cache → Network → Offline failure
    //
    // Once your GIS loads a resource, it becomes available
    // for subsequent offline use.
    //

    if (
        url.origin === location.origin &&
        url.pathname.startsWith(APP_ROOT)
    ) {

        event.respondWith(
            cacheFirst(request)
        );

        return;
    }


    // ========================================================
    // EXTERNAL RESOURCES
    // ========================================================
    //
    // Examples:
    //
    // OpenStreetMap tiles
    // satellite tiles
    // WMS
    // WFS
    // Bhuvan
    // Bhunaksha
    // other external GIS services
    //
    // Network first, cached fallback.
    //

    event.respondWith(
        networkWithCacheFallback(request)
    );

});


// ============================================================
// NETWORK FIRST
// ============================================================

async function networkFirst(request) {

    const cache =
        await caches.open(CACHE_NAME);

    try {

        const response =
            await fetch(
                request,
                {
                    cache: "no-cache"
                }
            );

        if (
            response &&
            response.ok
        ) {

            await safeCachePut(
                cache,
                request,
                response
            );

        }

        return response;

    } catch (error) {

        console.warn(
            "[GIS SW] Network unavailable:",
            request.url
        );

        const cached =
            await cache.match(request);

        if (cached) {
            return cached;
        }

        // Final fallback to application shell.
        const index =
            await cache.match(
                "/GIS/index.html"
            );

        if (index) {
            return index;
        }

        return new Response(
            `
            <!DOCTYPE html>

            <html>

            <head>

                <meta charset="UTF-8">

                <meta
                    name="viewport"
                    content="width=device-width,
                    initial-scale=1.0"
                >

                <title>
                    Web Map Survey - Offline
                </title>

            </head>

            <body>

                <h2>
                    Web Map Survey
                </h2>

                <p>
                    The map is currently offline.
                </p>

                <p>
                    Please connect to the internet
                    and open the application once.
                </p>

            </body>

            </html>
            `,
            {
                status: 503,
                headers: {
                    "Content-Type": "text/html"
                }
            }
        );

    }

}


// ============================================================
// CACHE FIRST
// ============================================================

async function cacheFirst(request) {

    const cache =
        await caches.open(CACHE_NAME);

    const cached =
        await cache.match(request);

    if (cached) {

        return cached;

    }

    try {

        const response =
            await fetch(request);

        if (
            response &&
            (
                response.ok ||
                response.type === "opaque"
            )
        ) {

            await safeCachePut(
                cache,
                request,
                response
            );

        }

        return response;

    } catch (error) {

        console.warn(
            "[GIS SW] Resource unavailable:",
            request.url
        );

        throw error;

    }

}


// ============================================================
// NETWORK WITH CACHE FALLBACK
// ============================================================

async function networkWithCacheFallback(request) {

    const cache =
        await caches.open(CACHE_NAME);

    try {

        const response =
            await fetch(request);

        if (
            response &&
            (
                response.ok ||
                response.type === "opaque"
            )
        ) {

            await safeCachePut(
                cache,
                request,
                response
            );

        }

        return response;

    } catch (error) {

        const cached =
            await cache.match(request);

        if (cached) {

            return cached;

        }

        throw error;

    }

}


// ============================================================
// SAFE CACHE WRITE
// ============================================================

async function safeCachePut(
    cache,
    request,
    response
) {

    try {

        await cache.put(
            request,
            response.clone()
        );

    } catch (error) {

        // Some external servers don't allow their responses
        // to be cached. Do not let that break the map.

        console.warn(
            "[GIS SW] Cache write skipped:",
            request.url
        );

    }

}
