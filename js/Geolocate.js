
//---------------------------------------------------------------------------------------------------------------------------------
  //============== Geolocate Viewer (matches provided reference) ==============

let isTracking = false;

// Add geolocate button to map controls
const geolocateButton = document.createElement('button');
geolocateButton.className = 'geolocate-button';
geolocateButton.title = 'My Location';

const geolocateControl = document.createElement('div');
geolocateControl.className = 'ol-unselectable ol-control geolocate';
geolocateControl.appendChild(geolocateButton);
map.getTargetElement().appendChild(geolocateControl);

// Create OL features
const accuracyFeature = new ol.Feature();
const positionFeature = new ol.Feature();
const wedgeFeature = new ol.Feature();

const geolocateSource = new ol.source.Vector({
  features: [accuracyFeature, wedgeFeature, positionFeature]
});
const geolocateLayer = new ol.layer.Vector({ source: geolocateSource });

// Set up geolocation
const geolocation = new ol.Geolocation({
  projection: map.getView().getProjection(),
  trackingOptions: { enableHighAccuracy: true }
});
geolocation.setTracking(true);

// Draw accuracy circle
geolocation.on('change:accuracyGeometry', function () {
  accuracyFeature.setGeometry(geolocation.getAccuracyGeometry());
  accuracyFeature.setStyle(
    new ol.style.Style({
      fill: new ol.style.Fill({ color: 'rgba(51,153,204,0.15)' }),
      stroke: new ol.style.Stroke({ color: '#3399CC', width: 2 }),
    })
  );
});

// Google Maps-style double ring marker
function doubleRingStyle() {
  return [
    new ol.style.Style({
      image: new ol.style.Circle({
        radius: 20,
        fill: new ol.style.Fill({ color: 'rgba(0,0,0,0)' }),
        stroke: new ol.style.Stroke({ color: '#3399CC', width: 2 }),
      }),
    }),
	  new ol.style.Style({
      image: new ol.style.Circle({
        radius: 19,
        fill: new ol.style.Fill({ color: 'rgba(0,0,0,0)' }),
        stroke: new ol.style.Stroke({ color: '#fff', width: 1 }),
      })
    }),
	  new ol.style.Style({
      image: new ol.style.Circle({
        radius: 21,
        fill: new ol.style.Fill({ color: 'rgba(0,0,0,0)' }),
        stroke: new ol.style.Stroke({ color: '#fff', width: 1 }),
      })
    }),
    new ol.style.Style({
      image: new ol.style.Circle({
        radius: 4,
        fill: new ol.style.Fill({ color: 'rgba(0,0,0,0)' }),
        stroke: new ol.style.Stroke({ color: '#fff', width: 1 }),
      })
    }),
    new ol.style.Style({
      image: new ol.style.Circle({
        radius: 3,
        fill: new ol.style.Fill({ color: '#3399CC' })
      })
    }),
  ];
}

// Place marker and update wedge on geolocation change
geolocation.on('change:position', function () {
  const pos = geolocation.getPosition();
  positionFeature.setGeometry(pos ? new ol.geom.Point(pos) : null);
  positionFeature.setStyle(doubleRingStyle());
  updateWedge();
});

// Wedge (sector) style and orientation
let heading = 0;
let fov = Math.PI / 3; // ~30 degrees

function updateWedge() {
  const pos = geolocation.getPosition();
  if (!pos) { wedgeFeature.setGeometry(null); return; }
  // const radius = 20; // meters
	const resolution = map.getView().getResolution(); // meters/pixel
const wedgePixelLength = 18; // wedge length in pixels
const radius = wedgePixelLength * resolution; // meters
  const coords = [pos];
  // Fix direction: 0 deg device heading = north/up on map
  const angleOffset = Math.PI / 2;
  const centerHeading = heading + angleOffset;
  const a1 = centerHeading - fov / 2;
  const a2 = centerHeading + fov / 2;
  for (let i = 0; i <= 40; i++) {
    const angle = a1 + ((a2 - a1) * i) / 40;
    coords.push([
      pos[0] + radius * Math.cos(angle),
      pos[1] + radius * Math.sin(angle)
    ]);
  }
  coords.push(pos); // close sector

  wedgeFeature.setGeometry(new ol.geom.Polygon([coords]));
  wedgeFeature.setStyle(
    new ol.style.Style({
      fill: new ol.style.Fill({ color: 'rgba(255,153,0,0.3)' }),
      stroke: new ol.style.Stroke({ color: 'rgba(255,153,0,0.99)', width: 0 })
    })
  );
}

// Listen to device orientation: ensures heading north = wedge up
if ('ondeviceorientationabsolute' in window) {
  window.addEventListener('deviceorientationabsolute', function (event) {
    if (event.alpha !== null) {
      heading = (event.alpha * Math.PI) / 180;
      updateWedge();
    }
  }, true);
} else {
  window.addEventListener('deviceorientation', function (event) {
    if (event.webkitCompassHeading !== undefined) {
      heading = (event.webkitCompassHeading * Math.PI) / 180;
      updateWedge();
    } else if (event.alpha !== null) {
      heading = (event.alpha * Math.PI) / 180;
      updateWedge();
    }
  }, true);
}

// Geolocate layer toggle logic
function handleGeolocate() {
  if (isTracking) {
    map.removeLayer(geolocateLayer);
    isTracking = false;
  } else if (geolocation.getTracking()) {
    map.addLayer(geolocateLayer);
    const pos = geolocation.getPosition();
    if (pos) map.getView().setCenter(pos);
    isTracking = true;
  }
}
geolocateButton.addEventListener('click', handleGeolocate);
geolocateButton.addEventListener('touchstart', handleGeolocate);

//============== End Geolocate Viewer ==============