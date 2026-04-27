//Base script
const revealItems = document.querySelectorAll(".reveal");
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("in-view");
      }
    });
  },
  {
    threshold: 0.2,
    rootMargin: "0px 0px -8% 0px",
  },
);
revealItems.forEach((item) => observer.observe(item));

Promise.all([d3.csv("./fractrackerDataCenter.csv"), d3.json("./topo.json")])
  .then((data) => {
    let dataCenters = data[0];
    let topology = data[1];
    //VIZ 1
    const svg = d3.select("#viz1");

    // Get the actual width and height in pixels
    const width = svg.node().getBoundingClientRect().width;
    const height = svg.node().getBoundingClientRect().height;

    console.log(width, height);

    // Get the features - ensure "states" matches your JSON key
    const states = topojson.feature(topology, topology.objects.states).features;

    const projection = d3
      .geoAlbersUsa()
      .scale(800) // Lower scale slightly to fit container
      .translate([width / 2, height / 2]);

    const path = d3.geoPath().projection(projection);

    svg
      .selectAll("path")
      .data(states)
      .enter()
      .append("path")
      .attr("d", path)
      .attr("fill", "#222") // Use a dark gray/black
      .attr("stroke", "#555")
      .attr("stroke-width", 0.5);


    renderSimViz(dataCenters);
    console.log("Map rendered with " + states.length + " features.");
  })
  .catch((err) => {
    console.error("Error loading the JSON:", err);
  });

//VIZ 2
const simVizID = "#viz2";

// Use the exact numbers from your screenshot
const mapBounds = {
    minLon: -77.4818,
    maxLon: -77.409,
    minLat: 38.9961,
    maxLat: 39.0527
};

function renderSimViz(dataCenters) {
  //dataCenters.forEach((d) => console.log(d.status));
    const svg = d3.select("#viz2");
    
    // 1. Define the internal resolution (matching your image size)
    const viewWidth = 1280;
    const viewHeight = 1280;

    // 2. Set the viewBox - this is the secret to no stretching
    svg.attr("viewBox", `0 0 ${viewWidth} ${viewHeight}`)
       .attr("preserveAspectRatio", "xMidYMid meet"); // Keeps it centered and proportional

    svg.selectAll("*").remove();

    // 3. Add the background image (it fits perfectly now)
    svg.append("image")
        .attr("xlink:href", "./ashburnMap.png")
        .attr("width", viewWidth)
        .attr("height", viewHeight);



    //SCALES
    const xScale = d3.scaleLinear()
        .domain([mapBounds.minLon, mapBounds.maxLon])
        .range([0, viewWidth]);

    const yScale = d3.scaleLinear()
        .domain([mapBounds.maxLat, mapBounds.minLat])
        .range([0, viewHeight]);
      
    const colorScale = d3.scaleOrdinal()
        .domain(["Expanding", "Operating", "Approved/Permitted/Under construction", "Proposed"])
        .range(["#660000", "#cc0000", "#ff3333", "#ff9999"]);
    
    svg.selectAll(".node")
        .data(dataCenters)
        .enter()
        .append("circle")
        .attr("cx", d => xScale(+d.long))
        .attr("cy", d => yScale(+d.lat))
        .attr("r", 20)
        .attr("fill", d => colorScale(d.status))
        .attr("opacity", 0.8)
        .attr("stroke", "black");
}
