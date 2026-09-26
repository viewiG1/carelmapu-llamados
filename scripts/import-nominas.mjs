import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import XLSX from "xlsx";

import { normalizeRut, normalizeText } from "../src/utils/rut.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

function loadEnvFile(filePath) {
  return fs
    .readFile(filePath, "utf8")
    .then((content) => {
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) {
          continue;
        }

        const eqIndex = trimmed.indexOf("=");
        if (eqIndex === -1) {
          continue;
        }

        const key = trimmed.slice(0, eqIndex).trim();
        const value = trimmed.slice(eqIndex + 1).trim();
        if (!(key in process.env)) {
          process.env[key] = value.replace(/^["']|["']$/g, "");
        }
      }
    })
    .catch(() => {});
}

function getCellText(value) {
  if (value == null) {
    return "";
  }

  return String(value).trim();
}

function findHeaderRow(rows) {
  return rows.findIndex((row) => {
    const normalized = row.map((cell) => normalizeText(cell));
    return (
      normalized.includes(normalizeText("RUT ALUMNO")) &&
      normalized.includes(normalizeText("DV")) &&
      normalized.includes(normalizeText("NIVEL A CERTIFICAR"))
    );
  });
}

function buildRowMap(headers, row) {
  return headers.reduce((acc, header, index) => {
    if (!header) {
      return acc;
    }

    acc[header] = getCellText(row[index]);
    return acc;
  }, {});
}

function buildAlumno(rowMap, tipo) {
  const rut = normalizeRut(rowMap[normalizeText("RUT ALUMNO")]);
  const dv = normalizeRut(rowMap[normalizeText("DV")]);

  return {
    origen: tipo,
    id_excel: rowMap[normalizeText("ID")] ?? "",
    rut,
    dv,
    nombres: rowMap[normalizeText("NOMBRES")] ?? "",
    apellido_paterno: rowMap[normalizeText("APELLIDO PATERNO")] ?? "",
    apellido_materno: rowMap[normalizeText("APELLIDO MATERNO")] ?? "",
    celular: rowMap[normalizeText("CELULAR")] ?? "",
    telefono_fijo: rowMap[normalizeText("TELEFONO FIJO")] ?? "",
    correo: rowMap[normalizeText("CORREO ELECTRONICO")] ?? "",
    pais: rowMap[normalizeText("PAIS")] ?? "",
    nacionalidad: rowMap[normalizeText("NACIONALIDAD")] ?? "",
    nivel_certificar: rowMap[normalizeText("NIVEL A CERTIFICAR")] ?? "",
    estado_tipo: rowMap[normalizeText("ESTADO TIPO")] ?? "",
    nombre_establecimiento: rowMap[normalizeText("NOMBRE ESTABLECIMIENTO")] ?? "",
  };
}

async function loadNominaFromFile(fileName, tipo, sheetNames) {
  const filePath = path.join(projectRoot, "public", fileName);
  try {
    await fs.access(filePath);
  } catch {
    if (tipo === "continuidad") {
      console.warn(`No se encontró ${fileName}; se omite la importación de continuidad.`);
      return [];
    }

    throw new Error(`No se encontró el archivo ${fileName} en public/.`);
  }

  const buffer = await fs.readFile(filePath);
  const workbook = XLSX.read(buffer, { type: "buffer" });

  const sheetName = sheetNames.find((candidate) => workbook.Sheets[candidate]);

  if (!sheetName) {
    throw new Error(
      `No se encontró una hoja compatible en ${fileName}. Busqué: ${sheetNames.join(", ")}.`,
    );
  }

  const sheet = workbook.Sheets[sheetName];

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const headerRowIndex = findHeaderRow(rows);

  if (headerRowIndex === -1) {
    throw new Error(`No se encontraron los encabezados correctos en ${fileName}.`);
  }

  const headers = rows[headerRowIndex].map((header) => normalizeText(header));

  return rows
    .slice(headerRowIndex + 1)
    .filter((row) => row.some((cell) => normalizeText(cell)))
    .map((row) => buildAlumno(buildRowMap(headers, row), tipo));
}

async function main() {
  await loadEnvFile(path.join(projectRoot, ".env"));

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Faltan SUPABASE_URL (o VITE_SUPABASE_URL) y SUPABASE_SERVICE_ROLE_KEY en el entorno.",
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const laboral = await loadNominaFromFile(
    "Nomina Laboral Carelmapu.xlsx",
    "laboral",
    [
      "Nómina Laboral",
      "Nomina Laboral",
      "Nomina General",
      "Nomina General Laboral",
      "Nomina General | BL | ML",
    ],
  );
  const continuidad = await loadNominaFromFile(
    "Nomina Continuidad Carelmapu.xlsx",
    "continuidad",
    [
      "Nomina Continuidad",
      "Nómina Continuidad",
      "Nomina General",
      "Nomina General Continuidad",
    ],
  );

  const combinados = [...laboral, ...continuidad];

  // Dedup por (origen, rut, dv): el upsert no puede tocar la misma fila dos
  // veces en una sola operación. Nos quedamos con la última aparición.
  const porClave = new Map();
  let sinRut = 0;
  for (const alumno of combinados) {
    if (!alumno.rut) {
      sinRut += 1;
      continue;
    }
    porClave.set(`${alumno.origen}|${alumno.rut}|${alumno.dv}`, alumno);
  }

  const alumnos = [...porClave.values()];
  const duplicados = combinados.length - sinRut - alumnos.length;

  if (sinRut) {
    console.warn(`Se omitieron ${sinRut} fila(s) sin RUT.`);
  }
  if (duplicados) {
    console.warn(`Se combinaron ${duplicados} fila(s) duplicada(s) por (origen, rut, dv).`);
  }

  const { error } = await supabase.from("alumnos").upsert(alumnos, {
    onConflict: "origen,rut,dv",
  });

  if (error) {
    throw new Error(`No se pudieron importar los alumnos: ${error.message}`);
  }

  console.log(`Importación lista: ${alumnos.length} alumnos subidos a Supabase.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
