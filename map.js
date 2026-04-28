(function () {
  "use strict";

  // State names
  const STATE_ABBR = {
    AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",
    CO:"Colorado",CT:"Connecticut",DE:"Delaware",FL:"Florida",GA:"Georgia",
    HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",
    KS:"Kansas",KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",
    MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",MS:"Mississippi",
    MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",
    NJ:"New Jersey",NM:"New Mexico",NY:"New York",NC:"North Carolina",
    ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",
    RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",
    TX:"Texas",UT:"Utah",VT:"Vermont",VA:"Virginia",WA:"Washington",
    WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming",DC:"District of Columbia"
  };

  // Operational level - orange shade
  const STATUS_LEVEL = {
    "Operating":                             1.00,
    "Expanding":                             0.82,
    "Approved/Permitted/Under construction": 0.64,
    "Proposed":                              0.46,
    "Suspended":                             0.28,
    "Cancelled":                             0.14,
    "Unknown":                               0.08
  };
  const STATUS_ORDER = Object.keys(STATUS_LEVEL);

  function dcColor(status) {
    const level = STATUS_LEVEL[status] ?? 0.08;
    return d3.interpolateOranges(0.15 + level * 0.82);
  }

  // MW parser - handles ranges like "100-200" and "150–1,000"
  function parseMW(str) {
    if (!str || !str.trim() || str.trim().toLowerCase() === "unknown") return null;
    const clean = str.replace(/,/g, "").trim();
    const parts = clean.split(/[-–]/).map(s => parseFloat(s)).filter(n => !isNaN(n));
    if (parts.length >= 2) return (parts[0] + parts[1]) / 2;
    if (parts.length === 1) return parts[0];
    return null;
  }

  // MW estimation
  // IMPUTED_MW:
  // The majority of non-reporting facilities are smaller/unknown DCs,
  // so the lower usage (26 MW) is more representative than the median
  // (150 MW, skewed by gaint campuses) for our purposes.
  const IMPUTED_MW = 26;

  // CAPACITY_FACTOR: nameplate - average grid draw.
  // Accounts for  significant redundancy headroom baked
  // into nameplate figures. Calibrated so PA's 98 DCs ~13.9% of PA grid
  // -> ~$178/yr increase (target $150–$200/yr for PA).
  const CAPACITY_FACTOR = 0.08;
  const HOURS_PER_YEAR  = 8760;

  // Max fraction of a state's grid that DCs can be credited with consuming.
  // Some states have enormous "Proposed" projects (e.g. 10,000 MW in WY)
  // that would exceed the entire state grid on paper. Cap at 75%.
  const MAX_GRID_SHARE = 0.75;

  // State electricity grids (EIA 2022, TWh - stored as MWh)
  const STATE_GRID_MWH = {
    "Alabama":114e6,"Alaska":6e6,"Arizona":74e6,"Arkansas":48e6,
    "California":258e6,"Colorado":51e6,"Connecticut":29e6,"Delaware":11e6,
    "Florida":239e6,"Georgia":140e6,"Hawaii":9e6,"Idaho":27e6,
    "Illinois":136e6,"Indiana":100e6,"Iowa":57e6,"Kansas":44e6,
    "Kentucky":84e6,"Louisiana":87e6,"Maine":12e6,"Maryland":57e6,
    "Massachusetts":49e6,"Michigan":102e6,"Minnesota":64e6,"Mississippi":44e6,
    "Missouri":82e6,"Montana":17e6,"Nebraska":32e6,"Nevada":32e6,
    "New Hampshire":10e6,"New Jersey":72e6,"New Mexico":21e6,"New York":149e6,
    "North Carolina":120e6,"North Dakota":17e6,"Ohio":143e6,"Oklahoma":56e6,
    "Oregon":44e6,"Pennsylvania":127e6,"Rhode Island":8e6,
    "South Carolina":82e6,"South Dakota":12e6,"Tennessee":95e6,"Texas":456e6,
    "Utah":30e6,"Vermont":5e6,"Virginia":120e6,"Washington":85e6,
    "West Virginia":33e6,"Wisconsin":64e6,"Wyoming":13e6
  };

  // State average monthly residential electricity bill (EIA 2022)
  const STATE_AVG_BILL = {
    "Alabama":133,"Alaska":125,"Arizona":121,"Arkansas":109,"California":114,
    "Colorado":82,"Connecticut":164,"Delaware":105,"Florida":116,"Georgia":112,
    "Hawaii":168,"Idaho":82,"Illinois":90,"Indiana":101,"Iowa":88,
    "Kansas":103,"Kentucky":101,"Louisiana":107,"Maine":96,"Maryland":119,
    "Massachusetts":137,"Michigan":95,"Minnesota":87,"Mississippi":120,
    "Missouri":102,"Montana":85,"Nebraska":89,"Nevada":97,
    "New Hampshire":108,"New Jersey":107,"New Mexico":77,"New York":111,
    "North Carolina":107,"North Dakota":88,"Ohio":97,"Oklahoma":107,
    "Oregon":90,"Pennsylvania":107,"Rhode Island":120,"South Carolina":119,
    "South Dakota":92,"Tennessee":111,"Texas":132,"Utah":78,"Vermont":99,
    "Virginia":110,"Washington":98,"West Virginia":99,"Wisconsin":89,"Wyoming":88
  };
  const US_AVG_BILL = 144; // national average (EIA)

  // Economic constants
  const ELEC_USD_PER_MWH = 70; // commercial rate
  const CO2_KG_PER_MWH   = 386; // US average grid intensity

  // CO2 equivalence factors (EPA)
  const CO2_T_PER_FLIGHT  = 0.24;  // 1-way cross-country flight per passenger
  const CO2_T_PER_BARREL  = 0.43;  // per barrel of crude oil burned
  const CO2_T_PER_COAL_T  = 2.42;  // per metric tonne of bituminous coal

  // Formatters
  function fmt(n, dec = 0) {
    return n.toLocaleString("en-US", {
      minimumFractionDigits: dec,
      maximumFractionDigits: dec
    });
  }

  function fmtEnergy(mwh) {
    if (mwh <= 0)   return "—";
    if (mwh >= 1e9) return fmt(mwh / 1e9, 2) + " PWh";
    if (mwh >= 1e6) return fmt(mwh / 1e6, 2) + " TWh";
    if (mwh >= 1e3) return fmt(mwh / 1e3, 1) + " GWh";
    return fmt(mwh, 0) + " MWh";
  }

  function fmtCO2(t) {
    if (t <= 0)   return "—";
    if (t >= 1e9) return fmt(t / 1e9, 2) + " Gt";
    if (t >= 1e6) return fmt(t / 1e6, 2) + " Mt";
    if (t >= 1e3) return fmt(t / 1e3, 1) + " kt";
    return fmt(t, 0) + " t";
  }

  function fmtLarge(n) {
    if (n <= 0)    return "—";
    if (n >= 1e12) return fmt(n / 1e12, 2) + "T";
    if (n >= 1e9)  return fmt(n / 1e9,  2) + "B";
    if (n >= 1e6)  return fmt(n / 1e6,  2) + "M";
    if (n >= 1e3)  return fmt(n / 1e3,  1) + "K";
    return fmt(n, 0);
  }

  // Stats computation (state scope)
  // stateName: full state name string, or null for a single-DC view
  // allStateData: pre built map used for US-level pop weighted average
  function computeStats(centers, stateName) {
    const totalMW    = centers.reduce((s, d) => s + (parseMW(d.mw) ?? IMPUTED_MW), 0);
    const annualMWh  = totalMW * HOURS_PER_YEAR * CAPACITY_FACTOR;
    const co2Tonnes  = annualMWh * CO2_KG_PER_MWH / 1000;
    const costUSD    = annualMWh * ELEC_USD_PER_MWH;

    // Bill increase
    const gridMWh  = STATE_GRID_MWH[stateName]  ?? 50e6; // fallback median state mwh
    const avgBill  = STATE_AVG_BILL[stateName]   ?? US_AVG_BILL;

    const rawShare    = annualMWh / gridMWh;
    const capped      = rawShare > MAX_GRID_SHARE;
    const gridShare   = Math.min(rawShare, MAX_GRID_SHARE);
    const avgBillYr   = avgBill * 12;
    const billDelta   = avgBillYr * gridShare;   // annual dollar increase

    // Calc explanation
    const imputed   = centers.filter(d => parseMW(d.mw) === null).length;
    const reported  = centers.length - imputed;
    let calcText =
      `${reported} DCs with reported MW + ${imputed} imputed @ ${IMPUTED_MW} MW\n` +
      `Total nameplate: ${fmt(Math.round(totalMW))} MW\n` +
      `× ${(CAPACITY_FACTOR * 100).toFixed(0)}% capacity factor × 8,760 hrs\n` +
      `= ${fmtEnergy(annualMWh)} DC annual energy (est.)\n` +
      `÷ ${fmtEnergy(gridMWh)} ${stateName ?? "state"} grid\n` +
      `= ${(rawShare * 100).toFixed(1)}% of grid`;
    if (capped) calcText += ` (capped at ${(MAX_GRID_SHARE * 100).toFixed(0)}% — proposed\nmegaprojects exceed current grid capacity)`;
    calcText +=
      `\n× avg annual bill ($${avgBill}/mo × 12 = $${avgBillYr})\n` +
      `= $${billDelta.toFixed(0)} / yr est. increase`;

    // CO2 equivalents
    const flights    = co2Tonnes / CO2_T_PER_FLIGHT;
    const oilBarrels = co2Tonnes / CO2_T_PER_BARREL;
    const coalTonnes = co2Tonnes / CO2_T_PER_COAL_T;

    return { count: centers.length, totalMW, annualMWh, co2Tonnes, costUSD,
             gridShare, rawShare, capped, billDelta, calcText,
             flights, oilBarrels, coalTonnes };
  }

  // US level pop weighted bill average
  // Builds one stats object whose billDelta is the population-weighted mean
  // of all state-level billDeltas.
  function computeUsStats(allCenters, statePopMap) {
    // First build per-state stats
    const byState = new Map();
    allCenters.forEach(d => {
      const n = d._stateName;
      if (!byState.has(n)) byState.set(n, []);
      byState.get(n).push(d);
    });

    let totalPop = 0, weightedBill = 0;
    byState.forEach((centers, name) => {
      const s   = computeStats(centers, name);
      const pop = statePopMap.get(name) || 0;
      weightedBill += s.billDelta * pop;
      totalPop     += pop;
    });
    const usBillDelta = totalPop > 0 ? weightedBill / totalPop : 0;

    // Aggregate totals
    const totalMW    = allCenters.reduce((s, d) => s + (parseMW(d.mw) ?? IMPUTED_MW), 0);
    const annualMWh  = totalMW * HOURS_PER_YEAR * CAPACITY_FACTOR;
    const co2Tonnes  = annualMWh * CO2_KG_PER_MWH / 1000;
    const costUSD    = annualMWh * ELEC_USD_PER_MWH;
    const flights    = co2Tonnes / CO2_T_PER_FLIGHT;
    const oilBarrels = co2Tonnes / CO2_T_PER_BARREL;
    const coalTonnes = co2Tonnes / CO2_T_PER_COAL_T;

    const imputed  = allCenters.filter(d => parseMW(d.mw) === null).length;
    const reported = allCenters.length - imputed;
    const calcText =
      `${reported} DCs with reported MW + ${imputed} imputed @ ${IMPUTED_MW} MW\n` +
      `Total nameplate: ${fmt(Math.round(totalMW))} MW\n` +
      `Bill increase is a population-weighted average\nacross all 50 states using each state's grid\nsize and average annual residential bill.`;

    return { count: allCenters.length, totalMW, annualMWh, co2Tonnes, costUSD,
             billDelta: usBillDelta, calcText, capped: false,
             flights, oilBarrels, coalTonnes };
  }

  // Sidebar updater
  function updateSidebar(title, s, detail) {
    const el = id => document.getElementById(id);

    el("sb-scope").textContent  = title;
    el("sb-detail").textContent = detail || "";

    el("sb-count").textContent = fmt(s.count);

    el("sb-bill-increase").textContent =
      s.billDelta < 0.5 ? "< $1 / yr" : `$${Math.round(s.billDelta)} / yr`;
    el("sb-bill-calc").textContent = s.calcText;

    el("sb-cost").textContent = s.costUSD > 0
      ? (s.costUSD >= 1e9
          ? `$${fmt(s.costUSD / 1e9, 2)}B / yr`
          : `$${fmt(s.costUSD / 1e6, 1)}M / yr`)
      : "—";

    el("sb-co2").textContent     = `${fmtCO2(s.co2Tonnes)} CO₂ / yr`;
    el("sb-eq-flights").textContent  = fmtLarge(s.flights);
    el("sb-eq-barrels").textContent  = fmtLarge(s.oilBarrels);
    el("sb-eq-coal").textContent     = fmtLarge(s.coalTonnes);

    el("sb-energy").textContent = s.annualMWh > 0
      ? `${fmtEnergy(s.annualMWh)} / yr` : "—";

    el("sb-mw").textContent = s.totalMW > 0
      ? `${fmt(Math.round(s.totalMW))} MW` : "—";

    // Status breakdown
    const counts = new Map();
    // counts built from raw centers stored in s._centers
    (s._centers || []).forEach(d =>
      counts.set(d.status, (counts.get(d.status) || 0) + 1));
    const bEl = document.getElementById("sb-status-breakdown");
    bEl.innerHTML = "";
    STATUS_ORDER.forEach(status => {
      const n = counts.get(status) || 0;
      if (!n) return;
      const row = document.createElement("div");
      row.className = "status-row";
      row.innerHTML =
        `<span class="status-dot" style="background:${dcColor(status)}"></span>` +
        `<span class="status-label">${status}</span>` +
        `<span class="status-count">${n}</span>`;
      bEl.appendChild(row);
    });
  }

  // Legend 
  function addLegend(svg, W, H) {
    const PAD   = 14;
    const ROW_H = 18;
    const N     = STATUS_ORDER.length;
    const BOX_H = 18 + N * ROW_H + 24 + 20;
    const BOX_W = 198;
    const lx = W - BOX_W - PAD;
    const ly = H - BOX_H - PAD;

    const g = svg.append("g")
      .attr("class", "map-legend")
      .attr("transform", `translate(${lx},${ly})`)
      .attr("pointer-events", "none");

    g.append("rect")
      .attr("width", BOX_W).attr("height", BOX_H).attr("rx", 7)
      .attr("fill", "rgba(255,252,248,0.93)")
      .attr("stroke", "#d4c8be").attr("stroke-width", 1);

    g.append("text").attr("x", 10).attr("y", 14)
      .attr("font-size", "9.5px").attr("font-weight", "700")
      .attr("fill", "#7a5520").attr("letter-spacing", "0.05em")
      .text("DATA CENTER STATUS");

    STATUS_ORDER.forEach((status, i) => {
      const y = 22 + i * ROW_H;
      g.append("circle").attr("cx", 16).attr("cy", y).attr("r", 5)
        .attr("fill", dcColor(status))
        .attr("stroke", "rgba(255,255,255,0.7)").attr("stroke-width", 1);
      const label = status.length > 30 ? status.slice(0, 29) + "…" : status;
      g.append("text").attr("x", 28).attr("y", y + 4)
        .attr("font-size", "9px").attr("fill", "#3a2a18").text(label);
    });

    const capY = 22 + N * ROW_H + 12;
    g.append("circle").attr("cx", 16).attr("cy", capY).attr("r", 3.8)
      .attr("fill", "white").attr("stroke", "#4a3828").attr("stroke-width", 1.5);
    g.append("text").attr("x", 28).attr("y", capY + 4)
      .attr("font-size", "9px").attr("fill", "#3a2a18").text("State Capital");

    g.append("text").attr("x", 10).attr("y", capY + 17)
      .attr("font-size", "8.5px").attr("fill", "#8a7060").attr("font-style", "italic")
      .text("State shading = # of data centers");
  }

  // Main
  Promise.all([
    d3.json("./topo.json"),
    d3.csv("./data_centers.csv"),
    d3.csv("./states.csv"),
    d3.csv("./cities.csv")
  ]).then(([topology, data_centers, states, cities]) => {

    // Attach full state name to each DC
    data_centers.forEach(d => { d._stateName = STATE_ABBR[d.state] || d.state; });

    // Population map: full name - number
    const statePopMap = new Map();
    states.forEach(s => statePopMap.set(s.State, +s.Population));

    const topo = topojson.feature(topology, topology.objects.states);

    // Per-state DC count - red colour scale
    const stateDCCount = new Map();
    topo.features.forEach(f => stateDCCount.set(f.properties.name, 0));
    data_centers.forEach(d =>
      stateDCCount.set(d._stateName, (stateDCCount.get(d._stateName) || 0) + 1));
    const maxDC = d3.max(stateDCCount.values());
    const redScale = d3.scaleSequential()
      .domain([0, Math.sqrt(maxDC)])
      .interpolator(t => d3.interpolateReds(0.08 + t * 0.88));
    const stateColor = name =>
      redScale(Math.sqrt(stateDCCount.get(name) || 0));

    // Pre-compute US level stats once
    const usStats = computeUsStats(data_centers, statePopMap);
    usStats._centers = data_centers;

    // Initial sidebar
    updateSidebar("United States", usStats, "Hover or click a state / data center");

    // SVG setup
    const svgEl = document.getElementById("map");
    const W = svgEl.clientWidth  || 900;
    const H = svgEl.clientHeight || 600;

    const projection = d3.geoAlbersUsa()
      .scale(W * 1.15)
      .translate([W * 0.47, H * 0.50]);

    const path = d3.geoPath(projection);
    const svg  = d3.select("#map");
    const g    = svg.append("g");

    let currentK = 1;

    // Click-to-lock state
    let lockedEl   = null;
    let lockedType = null; // 'state' | 'dc'

    function applyHighlight(el, type) {
      if (type === "state") {
        d3.select(el).raise()
          .attr("stroke", "#5a0808")
          .attr("stroke-width", 2.2 / currentK + "px")
          .attr("filter", "drop-shadow(0 0 5px rgba(100,0,0,0.4))");
      } else {
        d3.select(el).raise()
          .attr("r", 8 / currentK)
          .attr("stroke", "white")
          .attr("stroke-width", 2 / currentK + "px")
          .attr("opacity", 1)
          .attr("filter", "drop-shadow(0 0 4px rgba(180,60,0,0.55))");
      }
    }

    function clearHighlight(el, type) {
      if (!el) return;
      if (type === "state") {
        d3.select(el)
          .attr("stroke", "#b08878")
          .attr("stroke-width", 0.7 / currentK + "px")
          .attr("filter", null);
      } else {
        d3.select(el)
          .attr("r", 4 / currentK)
          .attr("stroke", "rgba(255,255,255,0.7)")
          .attr("stroke-width", 1 / currentK + "px")
          .attr("opacity", 0.88)
          .attr("filter", null);
      }
    }

    function lock(el, type, title, stats, detail) {
      if (lockedEl === el) { unlock(); return; }
      clearHighlight(lockedEl, lockedType);
      lockedEl   = el;
      lockedType = type;
      applyHighlight(el, type);
      updateSidebar(title, stats, detail + " 📌");
    }

    function unlock() {
      clearHighlight(lockedEl, lockedType);
      lockedEl   = null;
      lockedType = null;
      updateSidebar("United States", usStats,
        "Hover or click a state / data center");
    }

    // Click on bare SVG background - unlock
    svg.on("click", event => {
      if (event.target === svgEl) unlock();
    });

    // Draw states
    g.append("g").attr("class", "states-g")
      .selectAll("path")
      .data(topo.features)
      .join("path")
        .attr("d", path)
        .attr("fill", d => stateColor(d.properties.name))
        .attr("stroke", "#b08878")
        .attr("stroke-width", "0.7px")
        .style("cursor", "pointer")
        .on("mouseenter", function (event, d) {
          if (lockedEl) return;
          d3.select(this).raise()
            .attr("stroke", "#6a2010")
            .attr("stroke-width", 1.8 / currentK + "px");
          const name = d.properties.name;
          const dcs  = data_centers.filter(dc => dc._stateName === name);
          const s    = computeStats(dcs, name);
          s._centers = dcs;
          const pop  = statePopMap.get(name);
          updateSidebar(name, s,
            pop ? pop.toLocaleString("en-US") + " residents" : "State");
        })
        .on("mouseleave", function () {
          if (lockedEl) return;
          d3.select(this)
            .attr("stroke", "#b08878")
            .attr("stroke-width", 0.7 / currentK + "px");
          updateSidebar("United States", usStats,
            "Hover or click a state / data center");
        })
        .on("click", function (event, d) {
          event.stopPropagation();
          const name = d.properties.name;
          const dcs  = data_centers.filter(dc => dc._stateName === name);
          const s    = computeStats(dcs, name);
          s._centers = dcs;
          const pop  = statePopMap.get(name);
          lock(this, "state", name, s,
            pop ? pop.toLocaleString("en-US") + " residents" : "State");
        });

    // Draw data center dots
    g.append("g").attr("class", "dc-g")
      .selectAll("circle")
      .data(data_centers)
      .join("circle")
        .attr("class", "dc-dot")
        .attr("cx", d => { const c = projection([+d.long, +d.lat]); return c ? c[0] : -9999; })
        .attr("cy", d => { const c = projection([+d.long, +d.lat]); return c ? c[1] : -9999; })
        .attr("r", 4)
        .attr("fill", d => dcColor(d.status))
        .attr("stroke", "rgba(255,255,255,0.7)")
        .attr("stroke-width", "1px")
        .attr("opacity", 0.88)
        .style("cursor", "pointer")
        .on("mouseenter", function (event, d) {
          if (lockedEl) return;
          d3.select(this).raise()
            .attr("r", 7 / currentK).attr("opacity", 1)
            .attr("stroke", "white").attr("stroke-width", 1.5 / currentK + "px");
          const s    = computeStats([d], d._stateName);
          s._centers = [d];
          const mw   = parseMW(d.mw);
          updateSidebar(d.facility_name, s,
            `${d.city}, ${d.state} · ${d.status}` +
            (mw ? ` · ${fmt(mw)} MW` : ` · MW imputed @ ${IMPUTED_MW} MW`));
        })
        .on("mouseleave", function () {
          if (lockedEl) return;
          d3.select(this)
            .attr("r", 4 / currentK).attr("opacity", 0.88)
            .attr("stroke-width", 1 / currentK + "px");
          updateSidebar("United States", usStats,
            "Hover or click a state / data center");
        })
        .on("click", function (event, d) {
          event.stopPropagation();
          const s    = computeStats([d], d._stateName);
          s._centers = [d];
          const mw   = parseMW(d.mw);
          lock(this, "dc", d.facility_name, s,
            `${d.city}, ${d.state} · ${d.status}` +
            (mw ? ` · ${fmt(mw)} MW` : ` · MW imputed @ ${IMPUTED_MW} MW`));
        })
        .append("title")
          .text(d =>
            `${d.facility_name}\n${d.city}, ${d.state}\n${d.status}` +
            (d.mw ? `\n${d.mw} MW` : `\nMW unknown (est. ${IMPUTED_MW} MW)`));

    // Draw state capitals
    const cityG = g.append("g").attr("class", "cities-g");

    cityG.selectAll("circle").data(cities).join("circle")
      .attr("class", "city-dot")
      .attr("cx", d => { const c = projection([+d.longitude, +d.latitude]); return c ? c[0] : -9999; })
      .attr("cy", d => { const c = projection([+d.longitude, +d.latitude]); return c ? c[1] : -9999; })
      .attr("r", 3)
      .attr("fill", "white").attr("stroke", "#4a3828").attr("stroke-width", "1.3px")
      .attr("pointer-events", "none");

    cityG.selectAll("text").data(cities).join("text")
      .attr("class", "city-label")
      .attr("x", d => { const c = projection([+d.longitude, +d.latitude]); return c ? c[0] + 5 : -9999; })
      .attr("y", d => { const c = projection([+d.longitude, +d.latitude]); return c ? c[1] + 3 : -9999; })
      .text(d => d.description)
      .attr("font-size", "8px").attr("fill", "#2a1a10")
      .attr("pointer-events", "none")
      .attr("paint-order", "stroke")
      .attr("stroke", "rgba(255,252,248,0.88)").attr("stroke-width", "2.5px")
      .attr("stroke-linejoin", "round");

    // Legend
    addLegend(svg, W, H);

    // Zoom
    const zoom = d3.zoom()
      .scaleExtent([1, 8])
      .on("zoom", event => {
        currentK = event.transform.k;
        g.attr("transform", event.transform);

        g.selectAll(".dc-dot")
          .attr("r", function () {
            return (this === lockedEl ? 8 : 4) / currentK;
          })
          .attr("stroke-width", 1 / currentK + "px");

        g.selectAll(".city-dot")
          .attr("r", 3 / currentK)
          .attr("stroke-width", 1.3 / currentK + "px");

        g.selectAll(".city-label")
          .attr("font-size", 8 / currentK + "px");

        g.selectAll(".states-g path")
          .attr("stroke-width", function () {
            return (this === lockedEl ? 2.2 : 0.7) / currentK + "px";
          });
      });

    svg.call(zoom);

  }).catch(err => console.error("Map load error:", err));

})();