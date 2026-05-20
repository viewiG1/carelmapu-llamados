import { normalizeRut, normalizeText } from "./rut";

const SHEET_NAMES = {
  laboral: "Nomina General Laboral",
  continuidad: "Nomina General Continuidad",
};

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
    id: rowMap[normalizeText("ID")] ?? "",
    rut,
    dv,
    rutCompleto: `${rut}${dv}`.toUpperCase(),
    nombres: rowMap[normalizeText("NOMBRES")] ?? "",
    apellidoPaterno: rowMap[normalizeText("APELLIDO PATERNO")] ?? "",
    apellidoMaterno: rowMap[normalizeText("APELLIDO MATERNO")] ?? "",
    celular: rowMap[normalizeText("CELULAR")] ?? "",
    telefonoFijo: rowMap[normalizeText("TELEFONO FIJO")] ?? "",
    correoElectronico: rowMap[normalizeText("CORREO ELECTRONICO")] ?? "",
    pais: rowMap[normalizeText("PAIS")] ?? "",
    nacionalidad: rowMap[normalizeText("NACIONALIDAD")] ?? "",
    nivelACertificar: rowMap[normalizeText("NIVEL A CERTIFICAR")] ?? "",
    estadoTipo: rowMap[normalizeText("ESTADO TIPO")] ?? "",
    nombreEstablecimiento: rowMap[normalizeText("NOMBRE ESTABLECIMIENTO")] ?? "",
    tipo,
    raw: rowMap,
  };
}

async function loadNominasByTipo(url, tipo) {
  const XLSX = await import("xlsx");
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`No se pudo cargar la nómina de ${tipo} (${response.status}).`);
  }

  const buffer = await response.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });

  const sheetName = SHEET_NAMES[tipo];
  const sheet = workbook.Sheets[sheetName];

  if (!sheet) {
    throw new Error(`No se encontró la hoja "${sheetName}" en el archivo.`);
  }

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const headerRowIndex = findHeaderRow(rows);

  if (headerRowIndex === -1) {
    throw new Error("No se encontraron los encabezados correctos en el Excel.");
  }

  const headers = rows[headerRowIndex].map((header) => normalizeText(header));

  return rows
    .slice(headerRowIndex + 1)
    .filter((row) => row.some((cell) => normalizeText(cell)))
    .map((row) => buildAlumno(buildRowMap(headers, row), tipo));
}

export async function loadNominas() {
  try {
    const laboral = await loadNominasByTipo(
      "/Nomina Laboral Carelmapu.xlsx",
      "laboral"
    );
    const continuidad = await loadNominasByTipo(
      "/Nomina Continuidad Carelmapu.xlsx",
      "continuidad"
    );

    return { laboral, continuidad };
  } catch (err) {
    throw new Error(
      `Error al cargar nóminas: ${err instanceof Error ? err.message : "Error desconocido"}`,
      { cause: err },
    );
  }
}

export function findAlumnoByRut(laboral, continuidad, rut) {
  const query = normalizeRut(rut);

  if (!query) {
    return null;
  }

  const enLaboral = laboral.find(
    (alumno) => alumno.rutCompleto === query || alumno.rut === query
  );
  const enContinuidad = continuidad.find(
    (alumno) => alumno.rutCompleto === query || alumno.rut === query
  );

  if (enLaboral && enContinuidad) {
    return { ambos: true, laboral: enLaboral, continuidad: enContinuidad };
  }

  return enLaboral || enContinuidad || null;
}
