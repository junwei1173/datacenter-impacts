const mapBounds = { minLon: -77.4818, maxLon: -77.409, minLat: 38.9961, maxLat: 39.0527 };
var isSimMode = false;
var dataCenters = [];
var simData = [];

const colorScale = d3.scaleOrdinal()
    .domain(["Expanding", "Operating", "Approved/Permitted/Under construction", "Proposed"])
    .range(["#660000", "#cc0000", "#ff3333", "#ff9999"]);

const sizeToMW = new Map([
        ['Mega campus (>1,000 MW)', 1000],
        ['Hyperscale (100-999 MW)', 500],
        ['Large (51-99 MW)', 75],
        ['Medium (11-50 MW)', 25],
        ['Small (0-10 MW)', 5],
        ['Unknown', 0]
    ]);

const mwScale = d3.scaleSqrt()
    .domain([0, 1200]) // Minimum and Maximum MW from your UI
    .range([12, 38]);

export function applySimulationViz(data) {
    dataCenters = data;
    



    setupToggle();
    updateViz();
}

function setupToggle() {
    d3.select("#map-toggle").property("checked", false);

    d3.select("#map-toggle").on("change", function(event) {
        isSimMode = event.target.checked;
        d3.select("#toggle-label").text(isSimMode ? "Simulation" : "Real Map");
        d3.select("#sim-controls").style("display", isSimMode ? "block" : "none");

        
        updateViz();
    });

    // NEW: Listen for the Add Button click
    d3.select("#add-dc-btn").on("click", function() {
        // Generate a slight random offset so dots don't hide behind each other
        const lonOffset = (Math.random() - 0.5) * 0.03;
        const latOffset = (Math.random() - 0.5) * 0.03;

        simData.push({
            id: `DC-${Date.now()}`,
            // Spawn near the center of Ashburn
            long: -77.445 + lonOffset, 
            lat: 39.024 + latOffset,
            mw: 50,
        });
        
        updateViz();
        updateInventoryUI();
    });
}

function updateViz() {
    const svg = d3.select("#viz2");
    const viewWidth = 1280, viewHeight = 1280;
    
    svg.attr("viewBox", `0 0 ${viewWidth} ${viewHeight}`)
       .attr("preserveAspectRatio", "xMidYMid meet");

    if (svg.select("image").empty()) {
        svg.append("image")
           .attr("xlink:href", "./ashburnMap.png")
           .attr("width", viewWidth).attr("height", viewHeight);
    }

    const xScale = d3.scaleLinear().domain([mapBounds.minLon, mapBounds.maxLon]).range([0, viewWidth]);
    const yScale = d3.scaleLinear().domain([mapBounds.maxLat, mapBounds.minLat]).range([0, viewHeight]);

    // Filter real data to ensure no NaN errors and keep it within bounds
    const filteredRealData = dataCenters.filter(d => 
        d.long && d.lat && 
        +d.long >= mapBounds.minLon && +d.long <= mapBounds.maxLon &&
        +d.lat >= mapBounds.minLat && +d.lat <= mapBounds.maxLat
    );

    const currentData = isSimMode ? simData : filteredRealData;

    renderNodes(svg, currentData, xScale, yScale);
    calculateTotals(currentData);
}

function renderNodes(svg, data, xScale, yScale) {
    // Bulletproof data join using our unique IDs
    const nodes = svg.selectAll(".node").data(data, d => d.id);
    
    nodes.exit().remove();

    const enter = nodes.enter().append("circle").attr("class", "node");

    enter.merge(nodes)
        .transition().duration(400)
        .attr("cx", d => xScale(+d.long))
        .attr("cy", d => yScale(+d.lat))
        .attr("r", d => isSimMode ? mwScale(d.mw) : mwScale(sizeToMW.get(d.sizerank)))
        .attr("fill", d => isSimMode ? "#00d4ff" : colorScale(d.status))
        .attr("stroke", "#fff").attr("stroke-width", 2)
        .attr("opacity", 0.9);
}

// --- UI AND MATH UPDATES ---
function updateInventoryUI() {
    const list = d3.select("#dc-inventory");
    list.selectAll("*").remove();

    simData.forEach((dc, i) => {
        const card = list.append("div").attr("class", "dc-card");
        
        const header = card.append("div").attr("class", "card-header")
            .on("click", function() {
                const body = d3.select(this.nextSibling);
                body.classed("open", !body.classed("open"));
            });
        
        header.append("span").text(`Facility ${i + 1}`);
        header.append("span").text("▼").style("font-size", "0.6rem");

        const body = card.append("div").attr("class", "card-body");
        const sizeLabel = body.append("label")
            .text(`Size: ${dc.mw} MW`)
            .style("display", "block").style("font-size", "0.8rem");
        
        body.append("input")
            .attr("type", "range").attr("min", "10").attr("max", "200").attr("value", dc.mw)
            .style("width", "100%")
            .on("input", function(event) {
                dc.mw = +event.target.value;
                sizeLabel.text(`Size: ${dc.mw} MW`);
                updateViz(); // Live update map while sliding
            });

        body.append("button")
            .text("Remove Facility")
            .style("margin-top", "10px").style("display", "block").style("cursor", "pointer")
            .on("click", () => {
                simData.splice(i, 1);
                updateViz();
                updateInventoryUI();
            });
    });
}

function calculateTotals(data) {
    // Using 40MW as a placeholder average for real-world facilities
    const totalMW = isSimMode ? data.reduce((s, d) => s + d.mw, 0) : data.length * 40;
    
    // Maintain precision for math, format strings only at the end
    const annualTW = totalMW * 0.00876; 
    const waterGallons = Math.round(annualTW * 500); 

    d3.select("#energy-val").text(`${annualTW.toFixed(2)} TW / yr`);
    d3.select("#cost-val").text(`${waterGallons.toLocaleString()} M Gal / yr`);
}