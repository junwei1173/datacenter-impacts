import { applySimulationViz } from "./simViz.js";

d3.csv("./fractrackerDataCenter.csv").then((data) => {
    // Clean and assign unique IDs to real-world data immediately
    let dataCenters = data.map((d, i) => {
        d.id = `RW-${i}`;
        return d;
    });
    applySimulationViz(dataCenters);
}).catch(err => console.error("Error loading data:", err));

