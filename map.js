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
    let stations = jsonData.data.stations;
    console.log("Stations Array:", stations);

    // Fetch and parse traffic data
    const trips = await d3.csv(TRAFFIC_CSV_URL);
    console.log("Loaded Traffic Data:", trips);

    // Calculate departures and arrivals
    const departures = d3.rollup(
      trips,
      (v) => v.length,
      (d) => d.start_station_id
    );

    const arrivals = d3.rollup(
      trips,
      (v) => v.length,
      (d) => d.end_station_id
    );

    // Add traffic properties to each station
    stations = stations.map((station) => {
      let id = station.short_name;
      station.arrivals = arrivals.get(id) ?? 0;
      station.departures = departures.get(id) ?? 0;
      station.totalTraffic = station.arrivals + station.departures;
      return station;
    });

    console.log("Stations with traffic data:", stations);

    // Create a square root scale for circle radius based on traffic
    const radiusScale = d3
      .scaleSqrt()
      .domain([0, d3.max(stations, (d) => d.totalTraffic)])
      .range([0, 25]);

    // Append circles to the SVG for each station
    const circles = svg
      .selectAll("circle")
      .data(stations)
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
  } catch (error) {
    console.error("Error loading JSON:", error); // Handle errors
  }
});
