const map = L.map('map').setView([21.2106, 81.6255], 16);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: 'Map data © OpenStreetMap contributors'
}).addTo(map);

const iconOptions = (url, size) =>
  L.icon({ iconUrl: url, iconSize: size, iconAnchor: [size[0] / 2, size[1]] });

const liveIcon = iconOptions('https://cdn-icons-png.flaticon.com/512/709/709586.png', [24, 24]);

const gates = {
  main_gate: L.latLng(21.21056194503953, 81.62557840625605),
  back_gate: L.latLng(21.206362861076894, 81.62904195414458),
  nayak_ji: L.latLng(21.207, 81.627)
};

let liveMarker, destinationCoord, watchId, routeControl;
let instructions = [], spokenInstructions = new Set(), hasArrived = false;

function showMessage(msg, isError = false) {
  const status = document.getElementById("status");
  status.innerText = msg;
  status.style.color = isError ? "red" : "green";
}

async function startRoute() {
  const plotInput = document.getElementById('search').value.trim();
  const startChoice = document.getElementById('startPoint').value;

  if (!plotInput || !gates[startChoice]) {
    showMessage("Please select a valid plot and gate.", true);
    return;
  }

  const data = await fetchPlotData();
  const plot = data.find(p => p.plot_number === plotInput);

  if (!plot) {
    showMessage("Plot not found.", true);
    return;
  }

  destinationCoord = L.latLng(plot.lat, plot.lng);
  const startPoint = gates[startChoice];

  cleanupTracking();
  showMessage("Calculating route...");

  liveMarker = L.marker(startPoint, {
    icon: iconOptions('https://cdn-icons-png.flaticon.com/512/684/684908.png', [30, 30])
  }).addTo(map).bindPopup("Start Point").openPopup();

  const destinationMarker = L.marker(destinationCoord, {
    icon: iconOptions('https://cdn-icons-png.flaticon.com/512/252/252025.png', [30, 30])
  }).addTo(map).bindPopup(`Destination: ${plot.plot_number}`).openPopup();

  map.setView(startPoint, 16);

  routeControl = L.Routing.control({
    waypoints: [startPoint, destinationCoord],
    routeWhileDragging: false,
    addWaypoints: false,
    draggableWaypoints: false,
    show: false,
    createMarker: () => null,
    lineOptions: { styles: [{ color: 'red', weight: 4 }] }
  }).addTo(map);

  routeControl.on('routesfound', e => {
    instructions = e.routes[0].instructions
      .filter(i => i.lat && i.lng)
      .map((i, idx) => ({ text: i.text, latlng: L.latLng(i.lat, i.lng), id: idx }));

    renderInstructionList();
    showMessage(`Route to plot ${plot.plot_number} ready.`);
    speak(`Starting route to plot ${plot.plot_number}.`);
    beginTracking();
  });
}

function cleanupTracking() {
  if (liveMarker) map.removeLayer(liveMarker);
  if (routeControl) map.removeControl(routeControl);

  instructions = [];
  spokenInstructions.clear();
  hasArrived = false;

  document.getElementById('distance').innerText = '';
  document.getElementById('instructionList').innerHTML = '';

  if (watchId) navigator.geolocation.clearWatch(watchId);
}

function speak(text) {
  if (speechSynthesis.speaking) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-IN';
  speechSynthesis.speak(u);
}

function beginTracking() {
  if (!navigator.geolocation) {
    showMessage("Geolocation not supported.", true);
    return;
  }

  let previousCoords = null;

  watchId = navigator.geolocation.watchPosition(
    ({ coords }) => {
      const currentLoc = L.latLng(coords.latitude, coords.longitude);

      // ✅ YOUR SNIPPET INSERTED HERE
      if (!liveMarker) {
        liveMarker = L.marker(currentLoc, {
          icon: iconOptions('https://cdn-icons-png.flaticon.com/512/709/709586.png', [24, 24])
        }).addTo(map);
      } else {
        liveMarker.setLatLng(currentLoc);
      }

      map.setView(currentLoc, map.getZoom(), { animate: true });

      const dist = map.distance(currentLoc, destinationCoord).toFixed(0);
      document.getElementById('distance').innerText = `Remaining: ${dist} meters`;

      instructions.forEach(inst => {
        if (!spokenInstructions.has(inst.id) && map.distance(currentLoc, inst.latlng) < 20) {
          speak(inst.text);
          spokenInstructions.add(inst.id);
        }
      });

      if (!hasArrived && dist < 15) {
        speak("You've reached your destination!");
        showMessage("Arrived at destination.");
        hasArrived = true;
        navigator.geolocation.clearWatch(watchId);
      }

      if (previousCoords && map.distance(currentLoc, previousCoords) > 10) {
        const line = routeControl._line;
        if (line && !line.getBounds().contains(currentLoc)) {
          showMessage("You are off route. Recalculating...");
          speak("You went off route. Recalculating path.");
          routeControl.setWaypoints([currentLoc, destinationCoord]);
        }
      }

      previousCoords = currentLoc;
    },
    err => showMessage("Location error: " + err.message, true),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
}

async function fetchPlotData() {
  try {
    const res = await fetch('plots.json');
    return await res.json();
  } catch {
    showMessage("Failed to load plot data.", true);
    return [];
  }
}

function renderInstructionList() {
  const ul = document.getElementById("instructionList");
  instructions.forEach(inst => {
    const li = document.createElement("li");
    li.innerText = inst.text;
    ul.appendChild(li);
  });
}

function stopNavigation() {
  cleanupTracking();
  showMessage("Navigation stopped by user.");
}
