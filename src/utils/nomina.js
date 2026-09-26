import { normalizeRut, normalizeText } from "./rut";
import { supabase } from "../lib/supabase";

const SHEET_NAMES = {
  laboral: [
    "Nómina Laboral",
    "Nomina Laboral",
    "Nomina General",
    "Nomina General Laboral",
    "Nomina General | BL | ML",
  ],
  continuidad: [
    "Nomina Continuidad",
    "Nómina Continuidad",
    "Nomina General",
    "Nomina General Continuidad",
  ],
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

function pickValue(row, keys) {
  for (const key of keys) {
    const value = row?.[key];
    if (value != null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }

  return "";
}

function mapDbAlumnoRow(row, tipoFallback = "") {
  const origen = pickValue(row, ["origen"]).toLowerCase();
  const rut = normalizeRut(
    pickValue(row, ["rut", "RUT", "RUT ALUMNO", "rut_alumno"]),
  );
  const dv = normalizeRut(pickValue(row, ["dv", "DV"]));
  const tipo = origen || tipoFallback || "";

  return {
    id: pickValue(row, ["id"]),
    origen: tipo,
    rut,
    dv,
    rutCompleto: `${rut}${dv}`.toUpperCase(),
    nombres: pickValue(row, ["nombres", "NOMBRES"]),
    apellidoPaterno: pickValue(row, ["apellido_paterno", "APELLIDO PATERNO"]),
    apellidoMaterno: pickValue(row, ["apellido_materno", "APELLIDO MATERNO"]),
    celular: pickValue(row, ["celular", "CELULAR"]),
    telefonoFijo: pickValue(row, ["telefono_fijo", "TELEFONO FIJO"]),
    correoElectronico: pickValue(row, ["correo", "CORREO ELECTRONICO"]),
    pais: pickValue(row, ["pais", "PAIS"]),
    nacionalidad: pickValue(row, ["nacionalidad", "NACIONALIDAD"]),
    nivelACertificar: pickValue(row, ["nivel_certificar", "NIVEL A CERTIFICAR"]),
    estadoTipo: pickValue(row, ["estado_tipo", "ESTADO TIPO"]),
    nombreEstablecimiento: pickValue(row, [
      "nombre_establecimiento",
      "NOMBRE ESTABLECIMIENTO",
    ]),
    tipo,
    raw: row,
  };
}

// Supabase/PostgREST devuelve como máximo 1000 filas por consulta. Paginamos
// con .range() para traer todas las filas de una tabla.
async function fetchAllRows(tabla) {
  const PAGE_SIZE = 1000;
  const todas = [];
  let desde = 0;

  for (;;) {
    const { data, error } = await supabase
      .from(tabla)
      .select("*")
      .range(desde, desde + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`No se pudo leer ${tabla} desde Supabase: ${error.message}`);
    }

    if (!data?.length) {
      break;
    }

    todas.push(...data);

    if (data.length < PAGE_SIZE) {
      break;
    }

    desde += PAGE_SIZE;
  }

  return todas;
}

async function loadNominasDesdeSupabase() {
  if (!supabase) {
    return null;
  }

  const data = await fetchAllRows("alumnos");

  if (!data?.length) {
    return null;
  }

  const laboral = data
    .filter((row) => normalizeText(row.origen || row.tipo) === normalizeText("laboral"))
    .map((row) => mapDbAlumnoRow(row, "laboral"));

  const continuidad = data
    .filter(
      (row) => normalizeText(row.origen || row.tipo) === normalizeText("continuidad"),
    )
    .map((row) => mapDbAlumnoRow(row, "continuidad"));

  if (!laboral.length && !continuidad.length) {
    return null;
  }

  return { laboral, continuidad };
}

async function loadNominasByTipo(url, tipo) {
  const XLSX = await import("xlsx");
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`No se pudo cargar la nómina de ${tipo} (${response.status}).`);
  }

  const buffer = await response.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });

  const sheetName = SHEET_NAMES[tipo].find((candidate) => workbook.Sheets[candidate]);
  const sheet = workbook.Sheets[sheetName];

  if (!sheet) {
    throw new Error(
      `No se encontró una hoja compatible para ${tipo} en el archivo.`,
    );
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
    try {
      const supabaseNominas = await loadNominasDesdeSupabase();

      if (supabaseNominas) {
        return supabaseNominas;
      }
    } catch (supabaseErr) {
      console.warn("No se pudo cargar desde Supabase, usando Excel local.", supabaseErr);
    }

    const laboral = await loadNominasByTipo("/Nomina Laboral Carelmapu.xlsx", "laboral");
    const continuidad = await loadNominasByTipo(
      "/Nomina Continuidad Carelmapu.xlsx",
      "continuidad",
    ).catch((err) => {
      console.warn("No se pudo cargar la nómina de continuidad, se continúa solo con laboral.", err);
      return [];
    });

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

function looksLikeUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || ""),
  );
}

async function resolveAlumnoId(alumno) {
  if (looksLikeUuid(alumno.id)) {
    return alumno.id;
  }

  if (!supabase) {
    return "";
  }

  const { data, error } = await supabase
    .from("alumnos")
    .select("id")
    .eq("origen", alumno.tipo)
    .eq("rut", alumno.rut)
    .eq("dv", alumno.dv)
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo resolver el alumno en Supabase: ${error.message}`);
  }

  return data?.id || "";
}

export async function guardarSeguimientoAlumno(alumno, seguimiento) {
  if (!supabase) {
    return null;
  }

  const alumnoId = await resolveAlumnoId(alumno);

  const payload = {
    alumno_id: alumnoId || null,
    origen: alumno.tipo,
    rut: alumno.rut,
    dv: alumno.dv,
    llamado_por_telefono: Boolean(seguimiento.llamadoPorTelefono),
    fecha_examen: seguimiento.fechaExamen || null,
    guardado: Boolean(seguimiento.guardado),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("seguimientos")
    .upsert(payload, { onConflict: "origen,rut,dv" })
    .select();

  if (error) {
    throw new Error(`No se pudo guardar el seguimiento en Supabase: ${error.message}`);
  }

  return data?.[0] ?? null;
}

export async function loadSeguimientoAlumno(alumno) {
  if (!supabase) {
    return null;
  }

  const { data: byOrigin, error: errorByOrigin } = await supabase
    .from("seguimientos")
    .select("*")
    .eq("origen", alumno.tipo)
    .eq("rut", alumno.rut)
    .eq("dv", alumno.dv)
    .maybeSingle();

  if (errorByOrigin) {
    throw new Error(
      `No se pudo leer el seguimiento desde Supabase: ${errorByOrigin.message}`,
    );
  }

  if (byOrigin) {
    return byOrigin;
  }

  const alumnoId = await resolveAlumnoId(alumno);
  if (!alumnoId) {
    return null;
  }

  const { data: byAlumnoId, error: errorByAlumnoId } = await supabase
    .from("seguimientos")
    .select("*")
    .eq("alumno_id", alumnoId)
    .maybeSingle();

  if (errorByAlumnoId) {
    throw new Error(
      `No se pudo leer el seguimiento desde Supabase: ${errorByAlumnoId.message}`,
    );
  }

  return byAlumnoId || null;
}

export async function loadSeguimientos() {
  if (!supabase) {
    return [];
  }

  return fetchAllRows("seguimientos");
}
