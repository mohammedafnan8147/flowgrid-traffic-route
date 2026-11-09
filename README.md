# FlowGrid Traffic Route

A synthetic traffic-routing and simulation demo using Dijkstra, A*, Yen K-shortest paths, and ant colony search.

## Public demo

This repository is configured for Render. Its build step extracts the FlowGrid source archive and starts the Python web server. Traffic and road conditions are simulated; no live traffic data is used.

## Source

The complete FlowGrid source, frontend, tests, screenshots, and documentation are in flowgrid-source.zip. Extract the archive to inspect or run it locally. Python 3.10+ is required for the standard-library runtime.

To run locally after extraction, run python backend/run.py from the extracted project directory and open http://127.0.0.1:8787.
