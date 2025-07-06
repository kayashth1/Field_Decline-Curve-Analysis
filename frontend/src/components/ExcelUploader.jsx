import React, { useState } from "react";
import * as XLSX from "xlsx";
import Plot from "react-plotly.js";
import axios from "axios";
import { Button, FileUpload } from "@chakra-ui/react";
import { HiUpload } from "react-icons/hi";
import ExportExcel from "./ExportExcel";

function ExcelUploader() {
  const [data, setData] = useState([]);
  const [plotData, setPlotData] = useState({ x: [], y: [] });
  const [displayDates, setDisplayDates] = useState([]);
  const [selectedPoints, setSelectedPoints] = useState([]);
  const [declineCurve, setDeclineCurve] = useState([]);
  const [NpObserved, setNpObserved] = useState([]);
  const [PNpObserved, setPNpObserved] = useState([]);
  const [NpExtrapolated, setNpExtrapolated] = useState([]);
  const [cutoff_q, setCutoff_q] = useState(5);
  const [declineType, setDeclineType] = useState("exponential");

  const handleCutoff_q = (e) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value)) {
      setCutoff_q(value);
    } else {
      setCutoff_q("");
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const binaryStr = evt.target.result;
      const workbook = XLSX.read(binaryStr, { type: "binary" });

      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      const dates = [];
      const flowRates = [];

      jsonData.forEach((row) => {
        let parsedDate = null;

        const rawDate = row.Date;

        if (typeof rawDate === "number") {
          const jsDate = XLSX.SSF.parse_date_code(rawDate);
          parsedDate = new Date(jsDate.y, jsDate.m - 1, jsDate.d);
        } else if (typeof rawDate === "string") {
          const tryDate = new Date(rawDate);
          if (!isNaN(tryDate.getTime())) {
            parsedDate = tryDate;
          }
        }

        if (parsedDate) {
          const iso = parsedDate.toLocaleDateString("en-CA");
          dates.push(iso);
          flowRates.push(Number(row.FlowRate || 0));
        }
      });

      if (dates.length === 0 || flowRates.length === 0) {
        alert(
          "Failed to parse Excel file. Check column headers and date format."
        );
        return;
      }

      setData(jsonData);
      setDisplayDates(dates);
      setPlotData({ x: dates, y: flowRates });
      setSelectedPoints([]);
      setDeclineCurve([]);

      let cumulative = 0;
      const np = flowRates.map((val) => {
        cumulative += val;
        return cumulative / 1_000_000;
      });
      setNpObserved(np);
      setPNpObserved(np);
      setNpExtrapolated([]);
    };

    reader.readAsBinaryString(file);
  };

  const handlePointClick = (data) => {
    const point = data.points[0];
    const dateClicked = point.x;
    const yVal = point.y;
    const index = displayDates.indexOf(dateClicked);
    setSelectedPoints((prev) => {
      if (prev.length >= 2) return [{ t: index, q: yVal }];
      return [...prev, { t: index, q: yVal }];
    });
  };

  const handleCalculateDecline = async (t1, q1, t2, q2) => {
    try {
      const res = await axios.post(
        `${import.meta.env.VITE_API_BASE_URL}/calculate`,
        {
          t1,
          q1,
          t2,
          q2,
          original_q: plotData.y,
          decline_type: declineType,
          start_date: displayDates[0],
          qf: cutoff_q,
        }
      );

      setDeclineCurve(res.data);
      console.log("Decline curve response:", res.data);
      const extrapolated = res.data.curve || [];

      let cumulative = 0;
      for (let i = 0; i <= t1; i++) {
        cumulative += plotData.y[i];
      }
      const Np1 = cumulative / 1_000_000; // MMbbl

      const npObs = [];
      let obsCumulative = 0;
      for (let i = 0; i <= t1; i++) {
        obsCumulative += plotData.y[i];
        npObs.push(obsCumulative / 1_000_000);
      }
      setNpObserved(npObs);

      let npExtra = [];
      let cumulativeEx = Np1 * 1_000_000; // back to bbl
      for (let i = 0; i < extrapolated.length; i++) {
        cumulativeEx += extrapolated[i].qt;
        npExtra.push(cumulativeEx / 1_000_000);
      }
      setNpExtrapolated(npExtra);
    } catch (err) {
      console.error("Error calling backend:", err);
    }
  };

  return (
    <div className="min-h-screen bg-blue-100 py-8 px-4 flex justify-center ">
      <div className="w-full p-6  flex flex-col items-center justify-center ">
        <h1 className="text-4xl font-bold text-center text-gray-800 tracking-wide mb-2">
          Upload Excel File
        </h1>
        <h2 className="text-sm text-gray-600 italic mt-2">
           Note: Excel file should have two columns named{" "}
          <span className="font-medium text-black">Date</span> &{" "}
          <span className="font-medium text-black">FlowRate.</span>.
        </h2>
        <select
          className="border-2 border-gray-300 rounded-md px-4 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-200 mb-2"
          value={declineType}
          onChange={(e) => setDeclineType(e.target.value)}
        >
          <option value="exponential">Exponential</option>
          <option value="hyperbolic">Hyperbolic</option>
          <option value="harmonic">Harmonic</option>
        </select>
        <div className="mb-6 flex justify-center">
          <FileUpload.Root onChange={handleFileUpload} accept=".xlsx, .xls">
            <FileUpload.HiddenInput />
            <FileUpload.Trigger asChild>
              <Button
                size="sm"
                className="flex items-center gap-4 bg-white mt-6"
              >
                <HiUpload /> Upload file
              </Button>
            </FileUpload.Trigger>
          </FileUpload.Root>
        </div>

        {plotData.x.length > 0 && (
          <div className="w-full mt-6 flex flex-col items-center justify-center">
            <h3 className="text-lg font-semibold text-gray-700 text-center mb-5">
              Flow Rate vs Time Decline Plot
            </h3>
            <Plot
              data={[
                {
                  x: plotData.x,
                  y: plotData.y,
                  type: "scatter",
                  mode: "lines+markers",
                  marker: { color: "blue", dash: "spline" },
                  name: "Original Data",
                },
                declineCurve.curve &&
                  declineCurve.curve.length > 0 && {
                    x: declineCurve.curve.map((pt) => {
                      const baseDate = new Date(displayDates[0]);
                      const newDate = new Date(baseDate);
                      newDate.setDate(newDate.getDate() + pt.t);
                      return newDate.toISOString().split("T")[0];
                    }),
                    y: declineCurve.curve.map((pt) => pt.qt),
                    mode: "lines+markers",
                    selected: { marker: { color: "green" } },
                    line: { color: "red", shape: "spline" },
                    name: "Exponential Decline",
                  },
              ].filter(Boolean)}
              layout={{
                width: 1000,
                height: 500,
                title: "Flow Rate Decline Curve",
                xaxis: { title: { text: "Date(t) " } },
                yaxis: { title: { text: "Flow Rate (Q) bbl/day" } },
              }}
              onClick={handlePointClick}
              onSelected={(event) => {
                const points = event?.points;
                if (!points || points.length < 2) return;

                const sorted = points.sort(
                  (a, b) => new Date(a.x) - new Date(b.x)
                );

                const t1 = plotData.x.indexOf(sorted[0].x);
                const q1 = sorted[0].y;
                const t2 = plotData.x.indexOf(sorted[sorted.length - 1].x);
                const q2 = sorted[sorted.length - 1].y;

                setSelectedPoints([
                  { t: t1, q: q1 },
                  { t: t2, q: q2 },
                ]);

                handleCalculateDecline(t1, q1, t2, q2);
              }}
            />
          </div>
        )}
        {plotData.y.length > 0 && NpObserved.length > 0 && (
          <div className="w-full mt-10 flex flex-col items-center justify-center">
            <h3 className="text-lg font-semibold text-gray-700 text-center mb-5">
              Flow Rate vs Cumulative Production
            </h3>
            <Plot
              data={[
                {
                  x: PNpObserved,
                  y: plotData.y,
                  type: "scatter",
                  mode: "markers+lines",
                  marker: { color: "green" },
                  name: "Observed Q vs Np",
                },
                NpExtrapolated.length > 0 && {
                  x: NpExtrapolated,
                  y: declineCurve.curve.map((pt) => pt.qt),
                  type: "scatter",
                  mode: "lines",
                  line: { color: "red", dash: "spline" },
                  name: "Extrapolated Q vs Np",
                },
              ].filter(Boolean)}
              layout={{
                width: 1000,
                height: 500,
                title: "Flow Rate vs Cumulative Production",
                xaxis: { title: { text: "Cumulative Production (Np) bbl" } },
                yaxis: { title: { text: "Flow Rate (Q) bbl/day" } },
              }}
            />
          </div>
        )}

        {selectedPoints.length > 0 && (
          <div className="mt-6 w-full">
            <h3 className="font-semibold text-gray-700 mb-2 text-center">
              Selected Points:
            </h3>
            <div className="flex flex-col gap-2 items-center">
              {selectedPoints.map((pt, idx) => (
                <p
                  key={idx}
                  className="border border-blue-300 px-4 py-2 rounded-md text-sm"
                >
                  Point {idx + 1}: (t = {pt.t}, q = {pt.q})
                </p>
              ))}
            </div>
          </div>
        )}

        {selectedPoints.length === 2 && (
          <div className="mt-6 flex flex-col items-center gap-4 w-full">
            <Button
              colorScheme="blue"
              onClick={() =>
                handleCalculateDecline(
                  selectedPoints[0].t,
                  selectedPoints[0].q,
                  selectedPoints[1].t,
                  selectedPoints[1].q
                )
              }
            >
              Calculate Decline
            </Button>
            <div className="mb-4 flex items-center justify-center flex-col">
              <label className="text-sm text-gray-700 font-medium">
                Cutoff Flow Rate (qf):
              </label>
              <input
                type="number"
                value={cutoff_q}
                onChange={handleCutoff_q}
                placeholder="Enter qf (e.g., 5)"
                className="border-b-2 border-black focus:outline-none px-2 py-1 text-center"
              />
            </div>

            {declineCurve.Np_observed && (
              <div className="text-center text-sm text-gray-700 space-y-2">
                <p>
                  Cumulative Observed:{" "}
                  <strong>{declineCurve.Np_observed.toFixed(2)}</strong>
                </p>
                <p>
                  Cumulative Extrapolated:{" "}
                  <strong>{declineCurve.Np_extrapolated.toFixed(2)}</strong>
                </p>
                <div className="mt-4 bg-blue-50 border border-blue-400 text-blue-900 font-bold text-lg px-6 py-4 rounded-lg shadow-md">
                  Total Cumulative (Np): {declineCurve.Np_total.toFixed(2)}{" "}
                  MMbbl
                </div>
                <div className="mt-2 text-sm text-gray-700 font-medium">
                  {declineCurve.t_final !== null ? (
                    <span>
                      <span className="text-black font-bold">
                        Abandonment Time (t):
                      </span>{" "}
                      {declineCurve.date_final}
                    </span>
                  ) : null}
                </div>
                <ExportExcel data={declineCurve.curve} fileName={"DCA_Data"}/>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ExcelUploader;
