const fs = require("fs");
const { parse } = require("papaparse");

const getCSVData = (filename, encoding = "utf-8") => {
  const file = fs.readFileSync(filename, encoding);
  let csvData = [];

  parse(file, {
    complete: (results) => {
      csvData = results.data || [];
    },
  });

  return csvData.filter(Boolean);
};

const csv2obj = (csvData) => {
  const headers = csvData[0];
  const rows = csvData.slice(1);

  return rows.map((row) => {
    return row.reduce(
      (obj, element, i) => ({
        ...obj,
        [`${headers[i]}`.replace(/\s/g, "_").toLowerCase()]: element,
      }),
      {}
    );
  });
};

module.exports = { csv2obj, getCSVData };
