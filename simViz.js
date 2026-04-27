const mapBounds = { minLon: -77.4818, maxLon: -77.409, minLat: 38.9961, maxLat: 39.0527 };
var isSimMode = true;
var dataCenters = [];
var simData = [];

const colorScale = d3.scaleOrdinal()
    .domain(["Expanding", "Operating", "Approved/Permitted/Under construction", "Proposed"])
    .range(["#660000", "#cc0000", "#ff3333", "#ff9999"]);

const statusRemap = new Map([
    ["Expanding", "Expanding"], 
    ["Operating", "Operating"], 
    ["Approved/Permitted/Under construction", "In Construction"], 
    ["Proposed", "Proposed"]
    ]);

const sizeToMW = new Map([
        ['Mega campus (>1,000 MW)', 1000],
        ['Hyperscale (100-999 MW)', 500],
        ['Large (51-99 MW)', 75],
        ['Medium (11-50 MW)', 25],
        ['Small (0-10 MW)', 5],
        ['Unknown', 0]
    ]);

const mwScale = d3.scaleSqrt()
    .domain([0, 1000]) // Minimum and Maximum MW from your UI
    .range([12, 42]);

export function applySimulationViz(data) {
    dataCenters = data;
    
    setupToggle();
    updateViz();
}

function setupToggle() {
    d3.select("#map-toggle").property("checked", isSimMode);
    d3.select("#toggle-label").text(isSimMode ? "Simulation" : "Real Map");
    d3.select("#sim-controls").style("display", isSimMode ? "block" : "none");
    d3.select("#real-controls").style("display", isSimMode ? "none" : "block");

    d3.select("#map-toggle").on("change", function(event) {
        isSimMode = event.target.checked;
        d3.select("#toggle-label").text(isSimMode ? "Simulation" : "Real Map");
        d3.select("#sim-controls").style("display", isSimMode ? "block" : "none");
        d3.select("#real-controls").style("display", isSimMode ? "none" : "block");

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

    d3.selectAll(".status-filter").on("change", function() {
        // Any time ANY filter toggle changes, re-run the viz
        updateViz(); 
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

    // FILTER 1: Geographic Bounds (Removes empty coordinates and out-of-bounds dots)
    let filteredRealData = dataCenters.filter(d => 
        d.long && d.lat && 
        +d.long >= mapBounds.minLon && +d.long <= mapBounds.maxLon &&
        +d.lat >= mapBounds.minLat && +d.lat <= mapBounds.maxLat
    );

    // FILTER 2: Status Toggles (Checks which switches are turned 'on')
    const activeFilters = Array.from(document.querySelectorAll('.status-filter:checked')).map(cb => cb.value);
    filteredRealData = filteredRealData.filter(d => activeFilters.includes(d.status));

    // SELECT DATASET: Simulation Array vs Final Filtered CSV Data
    const currentData = isSimMode ? simData : filteredRealData;

    renderNodes(svg, currentData, xScale, yScale);

    if (!isSimMode) {
        renderStatusChart(filteredRealData);
    }


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
        .attr("fill", d => isSimMode ? "#cc0000" : colorScale(d.status))
        .attr("stroke", "#fff").attr("stroke-width", 3)
        .attr("opacity", 0.7);
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

function renderStatusChart(data) {
    const counts = colorScale.domain().map(status => ({
        status: status,
        count: data.filter(d => d.status === status).length
    })).filter(d => d.count > 0); 

    const svg = d3.select("#status-pie");
    svg.selectAll("*").remove();

    // Set up a wide viewBox to accommodate long text labels
    const viewWidth = 400;
    const viewHeight = 220;
    svg.attr("viewBox", `0 0 ${viewWidth} ${viewHeight}`)
       .attr("preserveAspectRatio", "xMidYMid meet");

    // The radius is constrained by the height so it doesn't overlap top/bottom
    const radius = Math.min(viewWidth, viewHeight) / 2 - 20;

    const g = svg.append("g")
        .attr("transform", `translate(${viewWidth / 2}, ${viewHeight / 2})`);

    const pie = d3.pie().value(d => d.count).sort(null);

    // Primary arc for the colored slices
    const arc = d3.arc()
        .innerRadius(radius * 0.4) // Creates the donut hole
        .outerRadius(radius * 0.8);

    // Invisible secondary arc for positioning the elbows of the lines
    const outerArc = d3.arc()
        .innerRadius(radius * 0.9)
        .outerRadius(radius * 0.9);

    const pieData = pie(counts);

    // 1. Draw Slices
    g.selectAll("path")
        .data(pieData)
        .enter().append("path")
        .attr("d", arc)
        .attr("fill", d => colorScale(d.data.status))
        .attr("stroke", "#fff")
        .attr("stroke-width", 2)
        .transition().duration(500)
        .attrTween("d", function(d) {
            const i = d3.interpolate({startAngle: 0, endAngle: 0}, d);
            return function(t) { return arc(i(t)); };
        });

    // 2. Draw Polylines
    g.selectAll("polyline")
        .data(pieData)
        .enter().append("polyline")
        .attr("class", "polyline")
        .attr("points", function(d) {
            const posA = arc.centroid(d);      // Start inside the slice
            const posB = outerArc.centroid(d); // Bend at the outer ring
            const posC = outerArc.centroid(d); // End horizontally for the text
            
            // Calculate if the slice is on the right or left side of the chart
            const midangle = d.startAngle + (d.endAngle - d.startAngle) / 2;
            // Stretch the line left or right depending on which half it's on
            posC[0] = radius * 0.95 * (midangle < Math.PI ? 1 : -1); 
            
            return [posA, posB, posC];
        });

    // 3. Draw Labels
    g.selectAll("text")
        .data(pieData)
        .enter().append("text")
        .text(d => {
            const name = statusRemap.get(d.data.status);
            return `${name} (${d.data.count})`;
        })
        .attr("transform", function(d) {
            const pos = outerArc.centroid(d);
            const midangle = d.startAngle + (d.endAngle - d.startAngle) / 2;
            // Push the text slightly past the end of the line
            pos[0] = radius * 1.0 * (midangle < Math.PI ? 1 : -1);
            return `translate(${pos})`;
        })
        .style("text-anchor", function(d) {
            // Anchor text to start on the right side, and end on the left side
            const midangle = d.startAngle + (d.endAngle - d.startAngle) / 2;
            return (midangle < Math.PI ? "start" : "end");
        })
        .style("font-size", "0.9rem")
        .style("font-weight", "600")
        .style("fill", "var(--forest-deep)")
        .style("alignment-baseline", "middle");
}