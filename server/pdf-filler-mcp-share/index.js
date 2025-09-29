#!/usr/bin/env node

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");
const { PDFDocument } = require("pdf-lib");
const pdfParse = require("pdf-parse");
const fs = require("fs/promises");
const path = require("path");
const { homedir } = require("os");

const DEFAULT_TIMEOUT_MS = Number.parseInt(process.env.PDF_FILLER_TOOL_TIMEOUT_MS || "120000", 10);
const MAX_TEXT_CHARS = Number.parseInt(process.env.PDF_FILER_MAX_TEXT_CHARS || "200000", 10);
const RESPONSE_VERSION = "2025-09-26";
const DEFAULT_PDF_DIR = path.join(homedir(), "Documents");
const PROFILES_DIR = path.join(homedir(), ".pdf-filler-profiles");
const MAX_BULK_RESULT_ENTRIES = 100;

let pdfjsLib = null;
let createCanvas = null;

function loadImageDependencies() {
  if (!pdfjsLib || !createCanvas) {
    try {
      pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");
      const canvas = require("canvas");
      createCanvas = canvas.createCanvas;
      console.error("[PDF Filler] Image dependencies loaded successfully");
    } catch (error) {
      console.error("[PDF Filler] Failed to load image dependencies:", error.message);
      throw new Error("Image extraction is not available. Canvas dependencies could not be loaded.");
    }
  }
}

function requireString(value, fieldName) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`'${fieldName}' must be a non-empty string.`);
  }
  return value.trim();
}

function requireObject(value, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`'${fieldName}' must be an object.`);
  }
  return value;
}

function requireArray(value, fieldName) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`'${fieldName}' must be a non-empty array.`);
  }
  return value;
}

function resolvePath(inputPath) {
  if (typeof inputPath !== "string" || inputPath.trim().length === 0) {
    throw new Error("Path must be a non-empty string.");
  }
  const trimmed = inputPath.trim();
  if (trimmed.startsWith("~")) {
    return path.join(homedir(), trimmed.slice(1));
  }
  return path.resolve(trimmed);
}

async function ensureDirectory(inputPath, { createIfMissing = false, label = "Directory" } = {}) {
  const resolved = resolvePath(inputPath);
  try {
    const stats = await fs.stat(resolved);
    if (!stats.isDirectory()) {
      throw new Error(`${label} '${resolved}' is not a directory.`);
    }
    await fs.access(resolved);
  } catch (error) {
    if (error.code === "ENOENT" && createIfMissing) {
      await fs.mkdir(resolved, { recursive: true });
    } else if (error.code === "ENOENT") {
      throw new Error(`${label} '${resolved}' does not exist.`);
    } else {
      throw new Error(`${label} '${resolved}' is not accessible: ${error.message}`);
    }
  }
  return resolved;
}

async function ensureFileReadable(inputPath, label) {
  const resolved = resolvePath(inputPath);
  try {
    const stats = await fs.stat(resolved);
    if (!stats.isFile()) {
      throw new Error(`${label} '${resolved}' is not a file.`);
    }
    await fs.access(resolved);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`${label} '${resolved}' was not found.`);
    }
    throw new Error(`${label} '${resolved}' is not accessible: ${error.message}`);
  }
  return resolved;
}

function sanitizeProfileName(name) {
  const safe = requireString(name, "profile_name")
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!safe) {
    throw new Error("Profile name must contain at least one letter or number after sanitization.");
  }
  return safe;
}

function buildSuccess(action, data, meta = {}, extraContent = []) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          status: "ok",
          action,
          version: RESPONSE_VERSION,
          meta,
          data,
        }, null, 2),
      },
      ...extraContent,
    ],
  };
}

function buildError(action, error, meta = {}) {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof Error && error.stack) {
    console.error(`[tool:${action}] stack trace:\n${error.stack}`);
  }
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          status: "error",
          action,
          version: RESPONSE_VERSION,
          meta,
          error: {
            message,
          },
        }, null, 2),
      },
    ],
  };
}

async function runWithTimeout(action, fn, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const started = Date.now();
  let timeoutId;
  try {
    const result = await Promise.race([
      (async () => {
        const value = await fn();
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        return value;
      })(),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`Timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
    console.error(`[tool:${action}] completed in ${Date.now() - started}ms`);
    return result;
  } catch (error) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    console.error(`[tool:${action}] failed after ${Date.now() - started}ms: ${error.message}`);
    throw error;
  }
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values.map((value) => value.trim().replace(/^"|"$/g, ""));
}

function parseCSV(content) {
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    throw new Error("CSV must include a header row and at least one data row.");
  }

  const headers = parseCsvLine(lines[0]);
  if (headers.length === 0) {
    throw new Error("CSV header row is empty.");
  }
  if (headers.some((header) => header.length === 0)) {
    throw new Error("CSV headers must not be empty.");
  }

  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const rowValues = parseCsvLine(lines[i]);
    if (rowValues.length !== headers.length) {
      throw new Error(`CSV row ${i + 1} has ${rowValues.length} values but ${headers.length} headers.`);
    }
    const record = {};
    headers.forEach((header, index) => {
      record[header] = rowValues[index];
    });
    records.push(record);
  }

  return records;
}

function describeField(field) {
  const name = field.getName();
  const constructorName = field.constructor?.name || "Unknown";
  const info = {
    name,
    type: "unknown",
    value: "",
  };

  try {
    if (constructorName.includes("TextField")) {
      info.type = "text";
      info.value = field.getText() || "";
    } else if (constructorName.includes("CheckBox")) {
      info.type = "checkbox";
      info.value = field.isChecked();
    } else if (constructorName.includes("RadioGroup")) {
      info.type = "radio";
      info.value = field.getSelected() || "";
      info.options = field.getOptions?.() || [];
    } else if (constructorName.includes("Dropdown")) {
      info.type = "dropdown";
      info.value = field.getSelected() || "";
      info.options = field.getOptions?.() || [];
    }
  } catch (error) {
    info.error = error.message;
  }

  return info;
}

function applyValueToField(field, value) {
  const fieldType = field.constructor?.name || "Unknown";
  const stringValue = value == null ? "" : String(value);

  if (fieldType.includes("TextField")) {
    field.setText(stringValue);
    return;
  }

  if (fieldType.includes("CheckBox")) {
    const normalized = typeof value === "string" ? value.toLowerCase().trim() : value;
    const shouldCheck = normalized === true || normalized === "true" || normalized === "yes" || normalized === "1";
    if (shouldCheck) {
      field.check();
    } else {
      field.uncheck();
    }
    return;
  }

  if (fieldType.includes("RadioGroup") || fieldType.includes("Dropdown")) {
    if (!stringValue) {
      field.clear?.();
    } else {
      field.select(stringValue);
    }
    return;
  }

  throw new Error(`Unsupported field type '${fieldType}'`);
}

async function fillPdfFields(resolvedPdfPath, fieldData, password = undefined) {
  const pdfBytes = await fs.readFile(resolvedPdfPath);

  let pdfDoc;
  try {
    pdfDoc = await PDFDocument.load(pdfBytes, password ? { password } : undefined);
  } catch (error) {
    if (error.message?.toLowerCase().includes("password")) {
      throw new Error("PDF is password protected. Provide the correct 'password' parameter.");
    }
    throw new Error(`Failed to load PDF: ${error.message}`);
  }

  const form = pdfDoc.getForm();
  const filledFields = [];
  const warnings = [];

  for (const [fieldName, rawValue] of Object.entries(fieldData)) {
    try {
      const field = form.getField(fieldName);
      applyValueToField(field, rawValue);
      filledFields.push(fieldName);
    } catch (error) {
      warnings.push({
        field: fieldName,
        message: error.message || String(error),
      });
    }
  }

  return { pdfDoc, filledFields, warnings };
}

async function loadProfileData(profileName) {
  const safeName = sanitizeProfileName(profileName);
  const profilePath = path.join(PROFILES_DIR, `${safeName}.json`);
  const resolvedProfilePath = await ensureFileReadable(profilePath, "Profile");
  try {
    const fileContent = await fs.readFile(resolvedProfilePath, "utf8");
    return {
      profilePath: resolvedProfilePath,
      data: JSON.parse(fileContent),
    };
  } catch (error) {
    if (error.name === "SyntaxError") {
      throw new Error(`Profile '${safeName}' contains invalid JSON.`);
    }
    throw new Error(`Failed to load profile '${safeName}': ${error.message}`);
  }
}

const toolDefinitions = [
  {
    name: "list_pdfs",
    description: "List PDF files in a directory.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        directory: {
          type: "string",
          description: "Directory to search (default: ~/Documents).",
        },
      },
    },
  },
  {
    name: "read_pdf_fields",
    description: "Read all form fields from a PDF file.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        pdf_path: {
          type: "string",
          description: "Path to the PDF file.",
        },
        password: {
          type: "string",
          description: "Password for encrypted PDFs.",
        },
      },
      required: ["pdf_path"],
    },
  },
  {
    name: "fill_pdf",
    description: "Fill a PDF form and save it to disk.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        pdf_path: {
          type: "string",
          description: "Path to the source PDF file.",
        },
        output_path: {
          type: "string",
          description: "Path for the filled PDF output file.",
        },
        field_data: {
          type: "object",
          description: "Field names and values to apply.",
        },
        password: {
          type: "string",
          description: "Password for encrypted PDFs.",
        },
      },
      required: ["pdf_path", "output_path", "field_data"],
    },
  },
  {
    name: "bulk_fill_from_csv",
    description: "Fill multiple PDFs using data from a CSV file.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        pdf_path: {
          type: "string",
          description: "Path to the template PDF file.",
        },
        csv_path: {
          type: "string",
          description: "Path to the CSV file containing data.",
        },
        output_directory: {
          type: "string",
          description: "Directory where filled PDFs will be written.",
        },
        filename_column: {
          type: "string",
          description: "CSV column to use for output filenames.",
        },
        password: {
          type: "string",
          description: "Password for encrypted PDFs.",
        },
      },
      required: ["pdf_path", "csv_path", "output_directory"],
    },
  },
  {
    name: "save_profile",
    description: "Save form data as a reusable profile.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        profile_name: {
          type: "string",
          description: "Name for the profile (letters, numbers, dash, underscore).",
        },
        field_data: {
          type: "object",
          description: "Field names and values to persist.",
        },
      },
      required: ["profile_name", "field_data"],
    },
  },
  {
    name: "load_profile",
    description: "Load a saved profile's data.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        profile_name: {
          type: "string",
          description: "Name of the profile to load.",
        },
      },
      required: ["profile_name"],
    },
  },
  {
    name: "list_profiles",
    description: "List saved profile names.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
  },
  {
    name: "fill_with_profile",
    description: "Fill a PDF using a saved profile with optional overrides.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        pdf_path: {
          type: "string",
          description: "Path to the PDF file.",
        },
        output_path: {
          type: "string",
          description: "Path for the filled PDF output file.",
        },
        profile_name: {
          type: "string",
          description: "Profile name to load.",
        },
        additional_data: {
          type: "object",
          description: "Additional fields to override the profile with.",
        },
        password: {
          type: "string",
          description: "Password for encrypted PDFs.",
        },
      },
      required: ["pdf_path", "output_path", "profile_name"],
    },
  },
  {
    name: "extract_to_csv",
    description: "Extract form data from PDFs and write to a CSV file.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        pdf_paths: {
          type: "array",
          items: { type: "string" },
          description: "Absolute or relative PDF file paths.",
        },
        output_csv: {
          type: "string",
          description: "Destination CSV file path.",
        },
      },
      required: ["pdf_paths", "output_csv"],
    },
  },
  {
    name: "validate_pdf",
    description: "Validate whether PDF form fields are filled.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        pdf_path: {
          type: "string",
          description: "Path to the PDF file.",
        },
        password: {
          type: "string",
          description: "Password for encrypted PDFs.",
        },
      },
      required: ["pdf_path"],
    },
  },
  {
    name: "read_pdf_content",
    description: "Extract text content from a PDF file, including metadata.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        pdf_path: {
          type: "string",
          description: "Path to the PDF file.",
        },
      },
      required: ["pdf_path"],
    },
  },
  {
    name: "get_pdf_resource_uri",
    description: "Create a resource URI for a PDF that Claude can stream via the Resources API.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        pdf_path: {
          type: "string",
          description: "Path to the PDF file.",
        },
      },
      required: ["pdf_path"],
    },
  },
];

const server = new Server(
  {
    name: "pdf-filler",
    version: "0.3.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: toolDefinitions,
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  try {
    switch (name) {
      case "list_pdfs":
        return await runWithTimeout(name, async () => {
          const providedDir = args.directory ? requireString(args.directory, "directory") : DEFAULT_PDF_DIR;
          let directory;
          try {
            directory = await ensureDirectory(providedDir, { label: "PDF directory" });
          } catch (error) {
            if (!args.directory) {
              throw new Error(`${error.message} Provide a 'directory' argument to override the default.`);
            }
            throw error;
          }

          const entries = await fs.readdir(directory, { withFileTypes: true });
          const pdfs = entries
            .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf"))
            .map((entry) => path.join(directory, entry.name))
            .sort((a, b) => a.localeCompare(b));

          return buildSuccess(name, {
            directory,
            pdf_count: pdfs.length,
            pdfs,
          });
        });

      case "read_pdf_fields":
        return await runWithTimeout(name, async () => {
          const pdfPath = requireString(args.pdf_path, "pdf_path");
          const password = args.password !== undefined ? requireString(args.password, "password") : undefined;
          const resolvedPdfPath = await ensureFileReadable(pdfPath, "PDF");
          const pdfBytes = await fs.readFile(resolvedPdfPath);

          let pdfDoc;
          try {
            pdfDoc = await PDFDocument.load(pdfBytes, password ? { password } : undefined);
          } catch (error) {
            if (error.message?.toLowerCase().includes("password")) {
              throw new Error("PDF is password protected. Provide the correct 'password' parameter.");
            }
            throw new Error(`Failed to load PDF: ${error.message}`);
          }

          const form = pdfDoc.getForm();
          const fields = form.getFields().map(describeField);

          return buildSuccess(name, {
            pdf_path: resolvedPdfPath,
            field_count: fields.length,
            fields,
          });
        });

      case "fill_pdf":
        return await runWithTimeout(name, async () => {
          const pdfPath = requireString(args.pdf_path, "pdf_path");
          const outputPath = requireString(args.output_path, "output_path");
          const fieldData = requireObject(args.field_data, "field_data");
          const password = args.password !== undefined ? requireString(args.password, "password") : undefined;

          const resolvedPdfPath = await ensureFileReadable(pdfPath, "PDF");
          const resolvedOutputPath = resolvePath(outputPath);
          await ensureDirectory(path.dirname(resolvedOutputPath), {
            createIfMissing: true,
            label: "Output directory",
          });

          const { pdfDoc, filledFields, warnings } = await fillPdfFields(resolvedPdfPath, fieldData, password);
          const filledPdfBytes = await pdfDoc.save();
          await fs.writeFile(resolvedOutputPath, filledPdfBytes);

          return buildSuccess(name, {
            pdf_path: resolvedPdfPath,
            output_path: resolvedOutputPath,
            filled_field_count: filledFields.length,
            filled_fields: filledFields,
            warnings,
          });
        });

      case "bulk_fill_from_csv":
        return await runWithTimeout(name, async () => {
          const pdfPath = requireString(args.pdf_path, "pdf_path");
          const csvPath = requireString(args.csv_path, "csv_path");
          const outputDirectory = requireString(args.output_directory, "output_directory");
          const filenameColumn = args.filename_column ? requireString(args.filename_column, "filename_column") : undefined;
          const password = args.password !== undefined ? requireString(args.password, "password") : undefined;

          const resolvedPdfPath = await ensureFileReadable(pdfPath, "Template PDF");
          const resolvedCsvPath = await ensureFileReadable(csvPath, "CSV file");
          const resolvedOutputDir = await ensureDirectory(outputDirectory, {
            createIfMissing: true,
            label: "Output directory",
          });

          const csvContent = await fs.readFile(resolvedCsvPath, "utf8");
          const records = parseCSV(csvContent);

          const results = [];
          let successCount = 0;
          let failureCount = 0;

          for (let i = 0; i < records.length; i++) {
            const record = records[i];
            let filename;
            if (filenameColumn) {
              const columnValue = record[filenameColumn];
              if (!columnValue) {
                filename = `row-${i + 1}.pdf`;
              } else {
                filename = `${columnValue}`
                  .trim()
                  .replace(/[^a-z0-9-_]+/gi, "-")
                  .replace(/-+/g, "-")
                  .replace(/^-|-$/g, "") || `row-${i + 1}`;
                filename = `${filename}.pdf`;
              }
            } else {
              filename = `filled-${i + 1}.pdf`;
            }

            const outputPath = path.join(resolvedOutputDir, filename);

            try {
              const { pdfDoc, filledFields, warnings } = await fillPdfFields(resolvedPdfPath, record, password);
              const filledPdfBytes = await pdfDoc.save();
              await fs.writeFile(outputPath, filledPdfBytes);
              successCount++;
              results.push({
                row: i + 1,
                filename: outputPath,
                status: "ok",
                filled_fields: filledFields,
                warnings,
              });
            } catch (error) {
              failureCount++;
              results.push({
                row: i + 1,
                filename: outputPath,
                status: "error",
                error: error.message,
              });
            }
          }

          const limitedResults = results.length > MAX_BULK_RESULT_ENTRIES
            ? results.slice(0, MAX_BULK_RESULT_ENTRIES)
            : results;

          return buildSuccess(name, {
            pdf_path: resolvedPdfPath,
            csv_path: resolvedCsvPath,
            output_directory: resolvedOutputDir,
            total_rows: records.length,
            successes: successCount,
            failures: failureCount,
            results: limitedResults,
            truncated: results.length > limitedResults.length,
          });
        });

      case "save_profile":
        return await runWithTimeout(name, async () => {
          const profileName = sanitizeProfileName(args.profile_name);
          const fieldData = requireObject(args.field_data, "field_data");
          await ensureDirectory(PROFILES_DIR, { createIfMissing: true, label: "Profiles directory" });
          const profilePath = path.join(PROFILES_DIR, `${profileName}.json`);
          await fs.writeFile(profilePath, JSON.stringify(fieldData, null, 2));
          return buildSuccess(name, {
            profile_name: profileName,
            profile_path: profilePath,
          });
        });

      case "load_profile":
        return await runWithTimeout(name, async () => {
          const { profilePath, data } = await loadProfileData(args.profile_name);
          return buildSuccess(name, {
            profile_path: profilePath,
            field_data: data,
          });
        });

      case "list_profiles":
        return await runWithTimeout(name, async () => {
          await ensureDirectory(PROFILES_DIR, { createIfMissing: true, label: "Profiles directory" });
          const entries = await fs.readdir(PROFILES_DIR, { withFileTypes: true });
          const profiles = entries
            .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
            .map((entry) => entry.name.replace(/\.json$/, ""))
            .sort();
          return buildSuccess(name, {
            profile_directory: PROFILES_DIR,
            profiles,
            profile_count: profiles.length,
          });
        });

      case "fill_with_profile":
        return await runWithTimeout(name, async () => {
          const pdfPath = requireString(args.pdf_path, "pdf_path");
          const outputPath = requireString(args.output_path, "output_path");
          const profileName = requireString(args.profile_name, "profile_name");
          const additionalData = args.additional_data ? requireObject(args.additional_data, "additional_data") : {};
          const password = args.password !== undefined ? requireString(args.password, "password") : undefined;

          const resolvedPdfPath = await ensureFileReadable(pdfPath, "PDF");
          const resolvedOutputPath = resolvePath(outputPath);
          await ensureDirectory(path.dirname(resolvedOutputPath), {
            createIfMissing: true,
            label: "Output directory",
          });

          const { data: profileData, profilePath } = await loadProfileData(profileName);
          const mergedData = { ...profileData, ...additionalData };

          const { pdfDoc, filledFields, warnings } = await fillPdfFields(resolvedPdfPath, mergedData, password);
          const filledPdfBytes = await pdfDoc.save();
          await fs.writeFile(resolvedOutputPath, filledPdfBytes);

          return buildSuccess(name, {
            pdf_path: resolvedPdfPath,
            output_path: resolvedOutputPath,
            profile_name: sanitizeProfileName(profileName),
            profile_path: profilePath,
            filled_field_count: filledFields.length,
            filled_fields: filledFields,
            warnings,
          });
        });

      case "extract_to_csv":
        return await runWithTimeout(name, async () => {
          const pdfPaths = requireArray(args.pdf_paths, "pdf_paths").map((pdfPath) => requireString(pdfPath, "pdf_paths[]"));
          const outputCsv = requireString(args.output_csv, "output_csv");
          const resolvedOutputCsv = resolvePath(outputCsv);
          await ensureDirectory(path.dirname(resolvedOutputCsv), {
            createIfMissing: true,
            label: "CSV output directory",
          });

          const resolvedPdfPaths = [];
          for (const pdfPath of pdfPaths) {
            const resolvedPath = await ensureFileReadable(pdfPath, "PDF");
            resolvedPdfPaths.push(resolvedPath);
          }

          const allData = [];
          const allFieldNames = new Set();

          for (const resolvedPdfPath of resolvedPdfPaths) {
            const pdfBytes = await fs.readFile(resolvedPdfPath);
            const pdfDoc = await PDFDocument.load(pdfBytes);
            const form = pdfDoc.getForm();
            const fields = form.getFields();

            const rowData = {
              _filename: path.basename(resolvedPdfPath),
              _path: resolvedPdfPath,
            };

            for (const field of fields) {
              const fieldName = field.getName();
              allFieldNames.add(fieldName);
              try {
                const descriptor = describeField(field);
                rowData[fieldName] = descriptor.value;
              } catch (error) {
                rowData[fieldName] = "";
              }
            }

            allData.push(rowData);
          }

          const headers = ["_filename", "_path", ...Array.from(allFieldNames).sort()];
          const csvLines = [headers.join(",")];

          for (const row of allData) {
            const values = headers.map((header) => {
              const value = row[header] ?? "";
              const escaped = String(value).replace(/"/g, '""');
              return `"${escaped}"`;
            });
            csvLines.push(values.join(","));
          }

          await fs.writeFile(resolvedOutputCsv, csvLines.join("\n"));

          return buildSuccess(name, {
            output_csv: resolvedOutputCsv,
            pdf_count: resolvedPdfPaths.length,
            field_count: allFieldNames.size,
            rows: allData.length,
          });
        });

      case "validate_pdf":
        return await runWithTimeout(name, async () => {
          const pdfPath = requireString(args.pdf_path, "pdf_path");
          const password = args.password !== undefined ? requireString(args.password, "password") : undefined;
          const resolvedPdfPath = await ensureFileReadable(pdfPath, "PDF");
          const pdfBytes = await fs.readFile(resolvedPdfPath);

          let pdfDoc;
          try {
            pdfDoc = await PDFDocument.load(pdfBytes, password ? { password } : undefined);
          } catch (error) {
            if (error.message?.toLowerCase().includes("password")) {
              throw new Error("PDF is password protected. Provide the correct 'password' parameter.");
            }
            throw new Error(`Failed to load PDF: ${error.message}`);
          }

          const form = pdfDoc.getForm();
          const fields = form.getFields();
          const validation = {
            total_fields: fields.length,
            filled_fields: 0,
            empty_fields: 0,
            may_require_attention: [],
            empty_field_names: [],
          };

          for (const field of fields) {
            const fieldName = field.getName();
            const descriptor = describeField(field);
            const isEmpty = descriptor.type === "checkbox"
              ? false
              : descriptor.value === undefined || descriptor.value === null || String(descriptor.value).trim().length === 0;

            if (isEmpty) {
              validation.empty_fields++;
              validation.empty_field_names.push(fieldName);
            } else {
              validation.filled_fields++;
            }

            const lowerName = fieldName.toLowerCase();
            if (isEmpty && (lowerName.includes("required") || lowerName.includes("must") || fieldName.includes("*"))) {
              validation.may_require_attention.push(fieldName);
            }
          }

          if (validation.empty_field_names.length > 50) {
            validation.empty_field_names = validation.empty_field_names.slice(0, 50);
            validation.empty_fields_truncated = true;
          }

          return buildSuccess(name, {
            pdf_path: resolvedPdfPath,
            validation,
          });
        });

      case "read_pdf_content":
        return await runWithTimeout(name, async () => {
          const pdfPath = requireString(args.pdf_path, "pdf_path");
          const resolvedPdfPath = await ensureFileReadable(pdfPath, "PDF");

          const stats = await fs.stat(resolvedPdfPath);
          const fileName = path.basename(resolvedPdfPath);
          const fileSizeKB = Number((stats.size / 1024).toFixed(2));

          const pdfBuffer = await fs.readFile(resolvedPdfPath);

          let pdfData;
          try {
            const originalError = console.error;
            console.error = () => {};
            pdfData = await pdfParse(pdfBuffer);
            console.error = originalError;
          } catch (error) {
            throw new Error(`Failed to extract text: ${error.message}`);
          }

          const pdfDoc = await PDFDocument.load(pdfBuffer);
          const pageCount = pdfDoc.getPages().length;

          const fullText = pdfData.text || "";
          const truncated = fullText.length > MAX_TEXT_CHARS;
          const text = truncated ? fullText.slice(0, MAX_TEXT_CHARS) : fullText;

          const data = {
            pdf_path: resolvedPdfPath,
            metadata: {
              name: fileName,
              size_kb: fileSizeKB,
              page_count: pageCount,
              text_characters: fullText.length,
              truncated_at: truncated ? MAX_TEXT_CHARS : null,
            },
            text,
          };

          if (fullText.trim().length === 0) {
            loadImageDependencies();
            const targetSizeKB = 375;
            const scaleFactor = Math.min(1.5, Math.max(1, Math.sqrt(targetSizeKB / Math.max(fileSizeKB, 1))));
            const imageBuffer = await convertPdfPageToImage(pdfBuffer, 1, scaleFactor);
            const imageMeta = {
              size_kb: Number((imageBuffer.length / 1024).toFixed(2)),
              scale: Number(scaleFactor.toFixed(2)),
            };
            return buildSuccess(name, { ...data, text: "", image_summary: imageMeta }, [
              {
                type: "image",
                data: imageBuffer.toString("base64"),
                mimeType: "image/png",
              },
            ]);
          }

          return buildSuccess(name, data);
        });

      case "get_pdf_resource_uri":
        return await runWithTimeout(name, async () => {
          const pdfPath = requireString(args.pdf_path, "pdf_path");
          const resolvedPdfPath = await ensureFileReadable(pdfPath, "PDF");
          const stats = await fs.stat(resolvedPdfPath);
          const fileName = path.basename(resolvedPdfPath);
          const fileSizeKB = Number((stats.size / 1024).toFixed(2));
          const resourceUri = `pdf://${encodeURI(resolvedPdfPath)}`;
          return buildSuccess(name, {
            resource_uri: resourceUri,
            pdf_path: resolvedPdfPath,
            metadata: {
              name: fileName,
              size_kb: fileSizeKB,
            },
          });
        });

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return buildError(name, error);
  }
});

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  console.error("[Resources] list requested");
  return {
    resources: [],
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  console.error(`[Resources] read requested for ${uri}`);

  if (!uri.startsWith("pdf://")) {
    throw new Error(`Unsupported resource URI: ${uri}`);
  }

  const decodedPath = decodeURI(uri.slice("pdf://".length));
  const resolvedPath = await ensureFileReadable(decodedPath, "PDF resource");
  const pdfBytes = await fs.readFile(resolvedPath);

  return {
    contents: [
      {
        uri,
        mimeType: "application/pdf",
        blob: pdfBytes.toString("base64"),
      },
    ],
  };
});

async function main() {
  await ensureDirectory(PROFILES_DIR, { createIfMissing: true, label: "Profiles directory" });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("PDF Filler MCP server running...");
}

main().catch((error) => {
  console.error("[PDF Filler] Fatal error:", error);
  console.error("[PDF Filler] Stack trace:", error.stack);
  process.exit(1);
});
