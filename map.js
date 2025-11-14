// Import Mapbox as an ESM module
import mapboxgl from "https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm";
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";

// Check that Mapbox GL JS is loaded
console.log("Mapbox GL JS Loaded:", mapboxgl);

// Set your Mapbox access token here
mapboxgl.accessToken =
  "pk.eyJ1IjoiamVjMDYxIiwiYSI6ImNtaHR2NGFzMjFsbnIybHB4NjFtejQ1OTQifQ.Wke4y1Q61UkqXBTMTHCytA";

// Bluebikes station data URL
const INPUT_BLUEBIKES_CSV_URL =
  "https://dsc106.com/labs/lab07/data/bluebikes-stations.json";

// Bluebikes traffic data URL
const TRAFFIC_CSV_URL =
  "https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv";

// Initialize the map
const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/streets-v12",
  center: [-71.09415, 42.36027],
  zoom: 12,
  minZoom: 5,
  maxZoom: 18,
});

// Define a Helper Function to Convert Coordinates
function getCoords(station) {
  const point = new mapboxgl.LngLat(+station.lon, +station.lat); // Convert lon/lat to Mapbox LngLat
  const { x, y } = map.project(point); // Project to pixel coordinates
  return { cx: x, cy: y }; // Return as object for use in SVG attributes
}

// Helper function to format time
function formatTime(minutes) {
  const date = new Date(0, 0, 0, 0, minutes); // Set hours & minutes
  return date.toLocaleString("en-US", { timeStyle: "short" }); // Format as HH:MM AM/PM
}

// Helper function to get minutes since midnight
function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}

// Function to compute station traffic
function computeStationTraffic(stations, trips) {
  // Compute departures
  const departures = d3.rollup(
    trips,
    (v) => v.length,
    (d) => d.start_station_id
  );

  // Compute arrivals
  const arrivals = d3.rollup(
    trips,
    (v) => v.length,
    (d) => d.end_station_id
  );

  // Update each station
  return stations.map((station) => {
    let id = station.short_name;
    station.arrivals = arrivals.get(id) ?? 0;
    station.departures = departures.get(id) ?? 0;
    station.totalTraffic = station.arrivals + station.departures;
    return station;
  });
}

// Function to filter trips by time
function filterTripsbyTime(trips, timeFilter) {
  return timeFilter === -1
    ? trips // If no filter is applied (-1), return all trips
    : trips.filter((trip) => {
        // Convert trip start and end times to minutes since midnight
        const startedMinutes = minutesSinceMidnight(trip.started_at);
        const endedMinutes = minutesSinceMidnight(trip.ended_at);

        // Include trips that started or ended within 60 minutes of the selected time
        return (
          Math.abs(startedMinutes - timeFilter) <= 60 ||
          Math.abs(endedMinutes - timeFilter) <= 60
        );
      });
}

map.on("load", async () => {
  map.addSource("boston_route", {
    type: "geojson",
    data: "https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson",
  });

  map.addLayer({
    id: "bike-lanes",
    type: "line",
    source: "boston_route",
    paint: {
      "line-color": "#32D400", // Bright green line
      "line-width": 5, // Thicker
      "line-opacity": 0.6, // Slightly transparent
    },
  });

  // Select the SVG element inside the map container
  const svg = d3.select("#map").select("svg");

  // Create a tooltip div
  const tooltip = d3
    .select("body")
    .append("div")
    .attr("class", "tooltip")
    .style("position", "absolute")
    .style("visibility", "hidden")
    .style("background-color", "rgba(255, 255, 255, 0.95)")
    .style("border", "1px solid #ccc")
    .style("border-radius", "4px")
    .style("padding", "8px 12px")
    .style("font-size", "12px")
    .style("pointer-events", "none")
    .style("z-index", "10000")
    .style("box-shadow", "0 2px 4px rgba(0,0,0,0.2)")
    .style("max-width", "200px");

  try {
    const jsonurl = INPUT_BLUEBIKES_CSV_URL;

    // Await JSON fetch
    const jsonData = await d3.json(jsonurl);

    console.log("Loaded JSON Data:", jsonData); // Log to verify structure

    // Access the nested stations array
    const allStations = jsonData.data.stations;
    console.log("Stations Array:", allStations);

    // Fetch and parse traffic data with date parsing
    const trips = await d3.csv(TRAFFIC_CSV_URL, (trip) => {
      trip.started_at = new Date(trip.started_at);
      trip.ended_at = new Date(trip.ended_at);
      return trip;
    });
    console.log("Loaded Traffic Data:", trips);

    // Compute station traffic using the helper function
    const stations = computeStationTraffic(allStations, trips);
    console.log("Stations with traffic data:", stations);

    // Create a square root scale for circle radius based on traffic
    const radiusScale = d3
      .scaleSqrt()
      .domain([0, d3.max(stations, (d) => d.totalTraffic)])
      .range([0, 15]);

    // Append circles to the SVG for each station
    const circles = svg
      .selectAll("circle")
      .data(stations, (d) => d.short_name) // Use station short_name as the key
      .enter()
      .append("circle")
      .attr("r", (d) => radiusScale(d.totalTraffic)) // Radius based on traffic
      .attr("fill", "steelblue") // Circle fill color
      .attr("stroke", "white") // Circle border color
      .attr("stroke-width", 1) // Circle border thickness
      .attr("opacity", 0.8) // Circle opacity
      .attr("cx", (d) => getCoords(d).cx) // Set initial x-position
      .attr("cy", (d) => getCoords(d).cy) // Set initial y-position
      .on("mouseover", function (event, d) {
        console.log("Mouseover triggered", d); // Debug log
        tooltip
          .style("visibility", "visible")
          .style("display", "block")
          .html(
            `<strong>${d.name || "Station"}</strong><br/>${
              d.totalTraffic
            } trips (${d.departures} departures, ${d.arrivals} arrivals)`
          );
      })
      .on("mousemove", function (event) {
        tooltip
          .style("top", event.pageY - 10 + "px")
          .style("left", event.pageX + 10 + "px");
      })
      .on("mouseenter", function (event, d) {
        console.log("Mouseenter triggered", d); // Debug log
      })
      .on("mouseout", function () {
        tooltip.style("visibility", "hidden");
      });

    // Function to update circle positions when the map moves/zooms
    function updatePositions() {
      circles
        .attr("cx", (d) => getCoords(d).cx) // Set the x-position using projected coordinates
        .attr("cy", (d) => getCoords(d).cy); // Set the y-position using projected coordinates
    }

    // Initial position update when map loads
    updatePositions();

    // Reposition markers on map interactions
    map.on("move", updatePositions); // Update during map movement
    map.on("zoom", updatePositions); // Update during zooming
    map.on("resize", updatePositions); // Update on window resize
    map.on("moveend", updatePositions); // Final adjustment after movement ends

    // Select slider and display elements
    const timeSlider = document.getElementById("time-slider");
    const selectedTime = document.getElementById("time-display");
    const anyTimeLabel = document.getElementById("any-time");

    // Function to update time display and filter data
    function updateTimeDisplay() {
      let timeFilter = Number(timeSlider.value); // Get slider value

      if (timeFilter === -1) {
        selectedTime.textContent = ""; // Clear time display
        anyTimeLabel.style.display = "block"; // Show "(any time)"
      } else {
        selectedTime.textContent = formatTime(timeFilter); // Display formatted time
        anyTimeLabel.style.display = "none"; // Hide "(any time)"
      }

      // Call updateScatterPlot to reflect the changes on the map
      updateScatterPlot(timeFilter);
    }

    // Function to update scatterplot based on time filter
    function updateScatterPlot(timeFilter) {
      // Get only the trips that match the selected time filter
      const filteredTrips = filterTripsbyTime(trips, timeFilter);

      // Recompute station traffic based on the filtered trips
      const filteredStations = computeStationTraffic(
        allStations,
        filteredTrips
      );

      // Update the domain based on filtered data
      const maxTraffic = d3.max(filteredStations, (d) => d.totalTraffic) || 1;
      radiusScale.domain([0, maxTraffic]);

      // Adjust radius scale range based on filtering
      // Scale the range proportionally to the filtered data's max relative to original max
      if (timeFilter === -1) {
        radiusScale.range([0, 15]);
      } else {
        // Use a smaller range that scales with the actual filtered data
        // This prevents huge circles when traffic is low (like at dawn)
        const originalMax = d3.max(stations, (d) => d.totalTraffic);
        const scaleFactor = Math.max(
          0.3,
          Math.min(1, maxTraffic / originalMax)
        );
        const maxRadius = 8 + scaleFactor * 12; // Range from 8 to 20 based on data
        radiusScale.range([1, maxRadius]);
      }

      // Update the scatterplot by adjusting the radius of circles
      circles
        .data(filteredStations, (d) => d.short_name) // Ensure D3 tracks elements correctly
        .join("circle")
        .attr("r", (d) => radiusScale(d.totalTraffic)); // Update circle sizes
    }

    // Bind slider input event to update function
    timeSlider.addEventListener("input", updateTimeDisplay);
    updateTimeDisplay(); // Initial call to set up the display
  } catch (error) {
    console.error("Error loading JSON:", error); // Handle errors
  }
});
