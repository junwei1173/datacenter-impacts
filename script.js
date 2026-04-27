import { applySimulationViz } from "./simViz.js";

Promise.all([
    d3.csv("./fractrackerDataCenter.csv"), 
    d3.json("./topo.json")
]).then((data) => {
    // Clean and assign unique IDs to real-world data immediately
    let dataCenters = data[0].map((d, i) => {
        d.id = `RW-${i}`; 
        return d;
    });
    applySimulationViz(dataCenters);
    renderNationalMap(data[1]);
}).catch(err => console.error("Error loading data:", err));

// --- VIZ 1: NATIONAL MAP ---
function renderNationalMap(topology) {
    const svg = d3.select("#viz1");
    const width = svg.node().getBoundingClientRect().width || window.innerWidth;
    const height = svg.node().getBoundingClientRect().height || window.innerHeight;

    const states = topojson.feature(topology, topology.objects.states).features;
    const projection = d3.geoAlbersUsa().scale(800).translate([width / 2, height / 2]);
    const path = d3.geoPath().projection(projection);

    svg.selectAll("path")
        .data(states).enter().append("path")
        .attr("d", path).attr("fill", "#222")
        .attr("stroke", "#555").attr("stroke-width", 0.5);
}

