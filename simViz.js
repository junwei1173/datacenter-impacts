const mapBounds = { minLon: -77.4818, maxLon: -77.409, minLat: 38.9961, maxLat: 39.0527 };
var isSimMode = false;
var dataCenters = [];
var simData = [];
var simulatedCenterID = 1;
var selectedCenterId = null;
var medianMW = 0;

export function applySimulationViz(data) {
    dataCenters = data;

    medianMW = calculateRobustMedian(data);

    resetSimData();
    
    setupToggle();
    updateViz();
    updateInventoryUI();
}


function parseMW(str) {
    if (!str || !String(str).trim() || String(str).trim().toLowerCase() === "unknown") return null;
    const clean = String(str).replace(/,/g, "").trim();
    const parts = clean.split(/[-–]/).map(s => parseFloat(s)).filter(n => !isNaN(n));
    if (parts.length >= 2) return (parts[0] + parts[1]) / 2;
    if (parts.length === 1) return parts[0];
    return null;
}


function getFacilityMW(d) {
    // 1. Try parsing explicit MW
    const parsed = parseMW(d.mw);
    if (parsed !== null && parsed > 0) return parsed;
    
    // 2. Try Size Rank
    if (d.sizerank && d.sizerank !== "Unknown" && sizeToMW.has(d.sizerank)) {
        return sizeToMW.get(d.sizerank);
    }
    
    // 3. Try Acreage (Safely checks both 'acres' and 'property_size_acres')
    const acresStr = d.property_size_acres || d.acres;
    if (acresStr && !isNaN(acresStr) && Number(acresStr) > 0) {
        const est = estimateMwFromAcres(acresStr);
        if (est !== null) return est;
    }
    
    // 4. Ultimate Fallback
    return medianMW;
}

function estimateMwFromAcres(acres) {
    const rawAcres = Number(acres);
    if (isNaN(rawAcres) || rawAcres <= 0) return null;

    const sqFt = rawAcres * 43560;
    const whiteSpaceSqFt = sqFt * 0.50; // Assume 50% is usable server floor
    const totalWatts = whiteSpaceSqFt * 100; // 100 watts per usable sq ft

    return totalWatts / 1000000; // Convert to Megawatts
}

//Calculates median using the data supplied values, or estimated acres of the data center
function calculateRobustMedian(data) {
    const validMWs = [];

    data.forEach(d => {
        // Use our new safe parser instead of Number()
        const parsedMW = parseMW(d.mw);

        if (parsedMW !== null && parsedMW > 0) {
            validMWs.push(parsedMW);
        } else {
            const acresStr = d.property_size_acres || d.acres;
            if (acresStr && !isNaN(acresStr) && Number(acresStr) > 0) {
                const estimatedMW = estimateMwFromAcres(acresStr);
                if (estimatedMW !== null) validMWs.push(estimatedMW);
            }
        }
    });

    if (validMWs.length === 0) return 26;
    validMWs.sort((a, b) => a - b);
    const mid = Math.floor(validMWs.length / 2);
    
    return validMWs.length % 2 !== 0 
        ? validMWs[mid] 
        : (validMWs[mid - 1] + validMWs[mid]) / 2;
}

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

const simCategoryBounds = {
    "Small": { min: 1, max: 10 },
    "Medium": { min: 11, max: 50 },
    "Large": { min: 51, max: 99 },
    "Hyperscale": { min: 100, max: 999 },
    "Mega Campus": { min: 1000, max: 2000 }
};

function getCategoryFromMW(mw) {
    if (mw <= 10) return "Small";
    if (mw <= 50) return "Medium";
    if (mw <= 99) return "Large";
    if (mw <= 999) return "Hyperscale";
    return "Mega Campus";
}

function resetSimData() {
    simData = dataCenters
        .filter(d => 
            d.long && d.lat && 
            +d.long >= mapBounds.minLon && +d.long <= mapBounds.maxLon &&
            +d.lat >= mapBounds.minLat && +d.lat <= mapBounds.maxLat
        )
        .map(d => {
            let centerMW = getFacilityMW(d); 

            return {
                id: `SIM-${d.id}`, 
                name: d.facility_name,
                long: +d.long,
                lat: +d.lat,
                mw: centerMW,
                status: d.status,
                type: getCategoryFromMW(centerMW)
            };
        });
}

function setupToggle() {
    d3.select("#map-toggle").property("checked", isSimMode);
    d3.select("#toggle-label").text(isSimMode ? "Simulation" : "Real Map");
    d3.select("#sim-controls").style("display", isSimMode ? "flex" : "none");
    d3.select("#real-controls").style("display", isSimMode ? "none" : "block");

    d3.select("#map-toggle").on("change", function(event) {
        isSimMode = event.target.checked;
        selectedCenterId = null;

        d3.select("#dc-detail-overlay").style("display", "none");

        d3.select("#toggle-label").text(isSimMode ? "Simulation" : "Real Map");
        d3.select("#sim-controls").style("display", isSimMode ? "flex" : "none");
        d3.select("#real-controls").style("display", isSimMode ? "none" : "block");

        updateViz();
    });

    d3.select("#add-dc-btn").on("click", function() {
        const lonOffset = (Math.random() - 0.5) * 0.03;
        const latOffset = (Math.random() - 0.5) * 0.03;

        simData.push({
            id: `DC-${Date.now()}`,
            name: 'Simulated Center ' + simulatedCenterID, 
            // Spawn near the center of Ashburn
            long: -77.445 + lonOffset, 
            lat: 39.024 + latOffset,
            mw: 25,
            status: "Custom",
            type: "Medium"
        });
        simulatedCenterID++;
        
        updateViz();
        updateInventoryUI();
    });

    d3.selectAll(".status-filter").on("change", function() {
        selectedCenterId = null;
        updateViz(); 
    });

    d3.select("#reset-dc-btn").on("click", function() {
        selectedCenterId = null;
        simulatedCenterID = 1;
        resetSimData();
        updateViz();
        updateInventoryUI();
    });

    d3.select("#clear-dc-btn").on("click", function() {
        simData = []; // Simply empties the array
        selectedCenterId = null;
        simulatedCenterID = 1;
        updateViz();
        updateInventoryUI();
    });

    d3.selectAll(".btn-danger-outline").on("click", function() {
        const statusToRemove = d3.select(this).attr("data-clear");
        
        // Keep everything EXCEPT the status the user just clicked
        simData = simData.filter(d => d.status !== statusToRemove);
        
        selectedCenterId = null;
        updateViz();
        updateInventoryUI();
    });

    document.getElementById("back-to-national").addEventListener("click", () => {
        const nationalMap = document.getElementById('map_container');
        const localMap = document.querySelector('.viz-container');

        // 1. Fade out the simulation map
        localMap.style.opacity = '0';

        // 2. Wait for fade, swap displays, and fade the national map back in
        setTimeout(() => {
            localMap.style.display = 'none';
            nationalMap.style.display = 'flex'; // Restores the national map's flexbox layout

            setTimeout(() => {
                nationalMap.style.opacity = '1';
            }, 50);
        }, 500);
    });

    d3.select("#close-detail-btn").on("click", () => {
        d3.select("#dc-detail-overlay").style("display", "none");
        selectedCenterId = null;
        
        // Remove map highlight
        d3.select("#viz2").selectAll(".node")
          .attr("stroke", "#fff")
          .attr("stroke-width", 3);
    });
}

function updateViz() {
    const svg = d3.select("#viz2");
    const viewWidth = 1280, viewHeight = 1280;
    
    svg.attr("viewBox", `0 0 ${viewWidth} ${viewHeight}`)
       .attr("preserveAspectRatio", "xMidYMid slice");

    if (svg.select("image").empty()) {
        svg.append("image")
           .attr("xlink:href", "./ashburnMap.png")
           .attr("width", viewWidth).attr("height", viewHeight)
    }

    const xScale = d3.scaleLinear().domain([mapBounds.minLon, mapBounds.maxLon]).range([0, viewWidth]);
    const yScale = d3.scaleLinear().domain([mapBounds.maxLat, mapBounds.minLat]).range([0, viewHeight]);

    svg.on("click", function(event) {
        // Only trigger if we clicked the map image itself, not a data point
        if (event.target.tagName !== "circle") {
            selectedCenterId = null;
            
            // Remove highlight from all map dots
            svg.selectAll(".node")
                .attr("stroke", "#fff")
                .attr("stroke-width", 3);
                
            // Close all sidebar cards
            d3.selectAll(".card-body").classed("open", false);
            d3.selectAll(".dc-card").style("border-color", "var(--line)");
        }
    });

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
        .attr("r", d => mwScale(d.mw))
        .attr("fill", d => d.status != "Custom" ? colorScale(d.status) : "orange")
        .attr("stroke", d => d.id === selectedCenterId ? "#000" : "#fff")
        .attr("stroke-width", d => d.id === selectedCenterId ? 6 : 3)
        .attr("opacity", 0.7);
    
    enter.merge(nodes)
        .style("cursor", "pointer") // Gives the user a visual cue
        .on("click", function(event, d) {
            event.stopPropagation(); // Prevents the background click from firing
            
            selectedCenterId = d.id;

            // 1. Instantly highlight the map dot
            svg.selectAll(".node")
                .attr("stroke", node => node.id === selectedCenterId ? "#000" : "#fff")
                .attr("stroke-width", node => node.id === selectedCenterId ? 6 : 3);
            d3.select(this).raise();

            // 2. Reset the sidebar UI (close everything)
            d3.selectAll(".card-body").classed("open", false);
            d3.selectAll(".dc-card").style("border-color", "var(--line)");

            // 3. Open the specific card and smoothly scroll it into view
            const targetCard = d3.select(`#card-${d.id}`);
            if (!targetCard.empty()) {
                targetCard.style("border-color", "var(--forest)");
                targetCard.select(".card-body").classed("open", true);
                
                // The magic scroll command! 
                targetCard.node().scrollIntoView({ behavior: "smooth", block: "center" });
            }
        });

    enter.merge(nodes)
        .style("cursor", "pointer")
        .on("click", function(event, d) {
            event.stopPropagation(); 
            
            selectedCenterId = d.id;

            // 1. Instantly highlight the map dot
            svg.selectAll(".node")
                .attr("stroke", node => node.id === selectedCenterId ? "#000" : "#fff")
                .attr("stroke-width", node => node.id === selectedCenterId ? 6 : 3);
            d3.select(this).raise();

            if (isSimMode) {
                // SIMULATION MODE: Handle sidebar list scrolling
                d3.selectAll(".card-body").classed("open", false);
                d3.selectAll(".dc-card").style("border-color", "var(--line)");

                const targetCard = d3.select(`#card-${d.id}`);
                if (!targetCard.empty()) {
                    targetCard.style("border-color", "var(--forest)");
                    targetCard.select(".card-body").classed("open", true);
                    targetCard.node().scrollIntoView({ behavior: "smooth", block: "center" });
                }
            } else {
                // REAL MAP MODE: Handle the new overlay
                showRealDataOverlay(d);
            }
        });
}

// ... Place this helper function anywhere at the bottom of your simViz.js file:
function showRealDataOverlay(d) {
    const overlay = d3.select("#dc-detail-overlay");
    overlay.style("display", "flex"); 
    
    // Name
    d3.select("#detail-name").text(d.facility_name || d.name || "Unknown Facility");
    // Address
    d3.select("#detail-address").text(d.address || "Address unavailable");
    
    // Status Tag
    const statusColor = colorScale(d.status) || "gray";
    d3.select("#detail-status")
      .text(statusRemap.get(d.status) || d.status)
      .style("background", statusColor)
      .style("color", "white"); 
      
    // Figure out the MW logically
    let isEstimate = parseMW(d.mw) === null;
    let mwVal = getFacilityMW(d);
    
    d3.select("#detail-mw").text(isEstimate ? `Est. ${mwVal} MW` : `${mwVal} MW`)
    d3.select("#detail-city").text(d.city || "Ashburn");
    d3.select("#detail-size").text(d.property_size_acres || "-");

    // Single-node resource math
    const annualTW = mwVal * 0.00876 * 0.85; 
    const waterGallons = Math.round(annualTW * 500); 

    d3.select("#detail-energy").text(`${annualTW.toFixed(2)} TW / yr`);
    d3.select("#detail-water").text(`${waterGallons.toLocaleString()} M Gal / yr`);
}

// --- UI AND MATH UPDATES ---
function updateInventoryUI() {
    const list = d3.select("#dc-inventory");
    list.selectAll("*").remove();

    simData.forEach((dc, i) => {
        const card = list.append("div")
        .attr("class", "dc-card")
        .attr("id", `card-${dc.id}`) // <-- Unique HTML ID
        .style("border-color", dc.id === selectedCenterId ? "var(--forest)" : "var(--line)");
        
        const header = card.append("div").attr("class", "card-header")
            .on("click", function() {
                const body = d3.select(this.nextSibling);
                const isNowOpen = !body.classed("open");
                
                // 1. Close all other cards to keep the UI clean (Optional, but highly recommended)
                d3.selectAll(".card-body").classed("open", false);
                d3.selectAll(".dc-card").style("border-color", "var(--line)");

                // 2. Set the variables and highlight the specific card in the list
                if (isNowOpen) {
                    body.classed("open", true);
                    card.style("border-color", "var(--forest)"); // Green border for active card
                    selectedCenterId = dc.id;                    // Set the global tracking ID
                } else {
                    selectedCenterId = null;                     // Deselect if closing the card
                }

                // 3. Instantly update the map dots without doing a full re-render
                const svg = d3.select("#viz2");
                svg.selectAll(".node")
                    .attr("stroke", d => d.id === selectedCenterId ? "#000" : "#fff")
                    .attr("stroke-width", d => d.id === selectedCenterId ? 6 : 3);
                    
                if (selectedCenterId) {
                    svg.selectAll(".node").filter(d => d.id === selectedCenterId).raise();
                }
            });
        
        const titleSpan = header.append("span").text(`${dc.name}`);
        header.append("span").text("▼").style("font-size", "0.6rem");

        const body = card.append("div").attr("class", "card-body");

        // 1. Setup Category Dropdown
        body.append("label")
            .text("Facility Tier")
            .style("display", "block").style("font-size", "0.75rem").style("margin-top", "0.5rem").style("color", "var(--moss)");
            
        const typeSelect = body.append("select")
            .style("width", "100%")
            .style("margin-bottom", "0.8rem")
            .style("padding", "0.3rem")
            .style("border", "1px solid var(--line)")
            .style("border-radius", "4px")
            .style("font-family", "inherit");

        Object.keys(simCategoryBounds).forEach(cat => {
            typeSelect.append("option")
                .attr("value", cat)
                .text(cat)
                .property("selected", dc.type === cat);
        });

        // 2. Setup Dynamic Slider
        const sizeLabel = body.append("label")
            .text(`Size: ${dc.mw} MW`)
            .style("display", "block").style("font-size", "0.75rem").style("color", "var(--moss)");
        
        const sliderInput = body.append("input")
            .attr("type", "range")
            .attr("min", simCategoryBounds[dc.type].min)
            .attr("max", simCategoryBounds[dc.type].max)
            .property("value", dc.mw)
            .style("width", "100%")
            .style("margin-bottom", "0.5rem");

        // 3. Dropdown Listener (Updates bounds and snaps MW if out of bounds)
        typeSelect.on("change", function() {
            dc.type = this.value;
            const bounds = simCategoryBounds[dc.type];
            
            if (dc.mw < bounds.min) dc.mw = bounds.min;
            if (dc.mw > bounds.max) dc.mw = bounds.max;
            
            sliderInput.attr("min", bounds.min).attr("max", bounds.max).property("value", dc.mw);
            sizeLabel.text(`Size: ${dc.mw} MW`);
            titleSpan.text(`${dc.type} Facility`);
            
            updateViz();
        });

        // 4. Slider Listener
        sliderInput.on("input", function(event) {
            dc.mw = +event.target.value;
            sizeLabel.text(`Size: ${dc.mw} MW`);
            updateViz(); 
        });

        // 5. Remove Button
        body.append("button")
            .text("Remove Data Center")
            .attr("class", "btn-danger-outline")
            .style("width", "100%").style("margin-top", "0.5rem")
            .on("click", () => {
                if (selectedCenterId === dc.id) selectedCenterId = null;

                simData.splice(i, 1);
                updateViz();
                updateInventoryUI();
            });
    });
}

function calculateTotals(data) {
    const totalAnnualTW = data.reduce((sum, d) => {
        const mwVal = getFacilityMW(d); 
        
        // Dynamic utilization based on facility size
        let utilization = 0.50; 
        if (mwVal >= 100) utilization = 0.85; 
        else if (mwVal >= 50) utilization = 0.65; 

        const facilityTW = mwVal * 0.00876 * utilization;
        return sum + facilityTW;
    }, 0);
    
    // 1. Water Calculation
    const waterGallons = Math.round(totalAnnualTW * 500); 

    // 2. Conversion for Standard Math
    const totalAnnualMWh = totalAnnualTW * 1000000; 

    // 3. CO2 Calculation (386 kg per MWh)
    const co2Tonnes = (totalAnnualMWh * 386) / 1000;
    const co2MegaTonnes = co2Tonnes / 1000000; // Converted to Megatonnes for clean UI

    // 4. VA Bill Increase Calculation
    const vaGridMWh = 120000000; // Virginia's total grid capacity from map.js
    const vaAvgBillYr = 110 * 12; // $110/mo * 12 months
    const gridShare = totalAnnualMWh / vaGridMWh;
    const billDelta = gridShare * vaAvgBillYr;

    // Update the UI
    d3.select("#energy-val").text(`${totalAnnualTW.toFixed(2)} TW / yr`);
    d3.select("#water-val").text(`${waterGallons.toLocaleString()} M Gal / yr`);
    d3.select("#co2-val").text(`${co2MegaTonnes.toFixed(2)} Mt / yr`);
    d3.select("#bill-val").text(`+$${Math.round(billDelta)} / yr`);
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