import React, { useState } from "react";
import * as XLSX from "xlsx";
import Plot from "react-plotly.js";
import axios from "axios";
import { Button, FileUpload } from "@chakra-ui/react";
import { HiUpload } from "react-icons/hi";

function ExcelUploader() {
  const [data, setData] = useState([]);
  const [plotData, setPlotData] = useState({ x: [], y: [] });
  const [displayDates, setDisplayDates] = useState([]);
  const [selectedPoints, setSelectedPoints] = useState([]);
  const [declineCurve, setDeclineCurve] = useState([]);
  const [NpObserved, setNpObserved] = useState([]);
  const [NpExtrapolated, setNpExtrapolated] = useState([]);

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
      alert("Failed to parse Excel file. Check column headers and date format.");
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

 const handleCalculateDecline = async () => {
  const t1 = selectedPoints[0].t;
  const t2 = selectedPoints[1].t;
  const q1 = selectedPoints[0].q;
  const q2 = selectedPoints[1].q;
  console.log("Calculating decline with:",q2);

  try {
    const res = await axios.post(`${import.meta.env.VITE_API_BASE_URL}/calculate`, {
      t1,
      q1,
      t2,
      q2,
      original_q: plotData.y,
    });

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
      <div className="w-full max-w-3xl p-6  flex flex-col items-center ">
        <h2 className="text-2xl font-bold mb-10 text-center text-gray-800">
          Upload Excel File
        </h2>

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
          <div className="w-full mt-6">
            <h3 className="text-lg font-semibold text-gray-700 text-center mb-5">
              Flow Rate Decline Plot
            </h3>
            <Plot
              data={[
                {
                  x: plotData.x,
                  y: plotData.y,
                  type: "scatter",
                  mode: "lines+markers",
                  marker: { color: "blue" },
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
                    type: "scatter",
                    mode: "lines",
                    line: { color: "red", dash: "dash" },
                    name: "Exponential Decline",
                  },
              ].filter(Boolean)}
              layout={{
                width: 800,
                height: 500,
                title: "Flow Rate Decline Curve",
                xaxis: { title: "Date" },
                yaxis: { title: "Flow Rate (Q)" },
              }}
              onClick={handlePointClick}
            />
          </div>
        )}
        {plotData.y.length > 0 && NpObserved.length > 0 && (
  <div className="w-full mt-10">
    <h3 className="text-lg font-semibold text-gray-700 text-center mb-5">
      Flow Rate vs Cumulative Production
    </h3>
    <Plot
      data={[
        {
          x: NpObserved,
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
          line: { color: "red", dash: "dot" },
          name: "Extrapolated Q vs Np",
        },
      ].filter(Boolean)}
      layout={{
        width: 800,
        height: 500,
        title: "Flow Rate vs Cumulative Production",
        xaxis: { title: "Cumulative Production (Np)" },
        yaxis: { title: "Flow Rate (Q)" },
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
            <Button colorScheme="blue" onClick={handleCalculateDecline}>
              Calculate Decline
            </Button>

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
                  OR {declineCurve.Np_total.toFixed(2) / 1000000} MMbbl
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ExcelUploader;
