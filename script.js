//Base script
const revealItems = document.querySelectorAll('.reveal');
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
      }
    });
  },
  {
    threshold: 0.2,
    rootMargin: '0px 0px -8% 0px'
  }
);
revealItems.forEach((item) => observer.observe(item));

Promise.all([
  d3.csv("./fractrackerDataCenter.csv"),
  d3.json("./topo.json")
]).then((data) => {
    let dataCenters = data[0];
    let topology = data[1];



    //VIZ 1
    const svg = d3.select("#viz1");

    // Get the actual width and height in pixels
    const width = svg.node().getBoundingClientRect().width;
    const height = svg.node().getBoundingClientRect().height;
    // Select and size the SVG
    // const svg = d3.select("#viz1")
    //     .attr("viewBox", `0 0 ${width} ${height}`) // Makes it responsive
    //     .append("g");

    console.log(width, height);

    // Get the features - ensure "states" matches your JSON key
    const states = topojson.feature(topology, topology.objects.states).features;

    const projection = d3.geoAlbersUsa()
        .scale(800) // Lower scale slightly to fit container
        .translate([width / 2, height / 2]);

    const path = d3.geoPath().projection(projection);

    svg.selectAll("path")
        .data(states)
        .enter()
        .append("path")
        .attr("d", path)
        .attr("fill", "#222") // Use a dark gray/black
        .attr("stroke", "#555")
        .attr("stroke-width", 0.5);
        
    console.log("Map rendered with " + states.length + " features.");
}).catch(err => {
    console.error("Error loading the JSON:", err);
});