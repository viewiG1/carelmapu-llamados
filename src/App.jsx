import { useEffect, useMemo, useState } from "react";
import {
  findAlumnoByRut,
  guardarSeguimientoAlumno,
  loadSeguimientos,
  loadNominas,
} from "./utils/nomina";
import { formatChileanMobile, formatRut, titleCase } from "./utils/rut";
import { getCountryFlagUrl, getCountryName } from "./utils/country";

const TURNOS_EXAMEN_POR_DIA = [
  {
    dia: "Viernes 5 de junio",
    turnos: [{ id: "viernes-1700", hora: "17:00" }],
  },
  {
    dia: "Sábado 6 de junio",
    turnos: [
      { id: "sabado-0900", hora: "09:00" },
      { id: "sabado-1300", hora: "13:00" },
      { id: "sabado-1700", hora: "17:00" },
    ],
  },
  {
    dia: "Domingo 7 de junio",
    turnos: [
      { id: "domingo-0900", hora: "09:00" },
      { id: "domingo-1300", hora: "13:00" },
      { id: "domingo-1700", hora: "17:00" },
    ],
  },
];

const TURNOS_EXAMEN = TURNOS_EXAMEN_POR_DIA.flatMap((grupo) =>
  grupo.turnos.map((turno) => ({
    ...turno,
    dia: grupo.dia,
    etiqueta: `${grupo.dia} ${turno.hora}`,
  })),
);

function turnosDesdeTexto(texto) {
  const value = String(texto || "");
  return TURNOS_EXAMEN.filter((turno) => value.includes(turno.etiqueta)).map(
    (turno) => turno.id,
  );
}

function turnosSeleccionadosPorIds(ids) {
  const seleccionados = new Set(ids || []);
  return TURNOS_EXAMEN.filter((turno) => seleccionados.has(turno.id));
}

function formatearTurnosExamen(turnos) {
  return turnos.map((turno) => turno.etiqueta).join(" · ");
}

function App() {
  const [alumnos, setAlumnos] = useState([]);
  const [nominaLaboral, setNominaLaboral] = useState([]);
  const [nominaContinuidad, setNominaContinuidad] = useState([]);
  const [rutBuscado, setRutBuscado] = useState("");
  const [tipoSeleccionado, setTipoSeleccionado] = useState(null);
  const [llamadosPorRut, setLlamadosPorRut] = useState({});
  const [turnosSeleccionadosPorRut, setTurnosSeleccionadosPorRut] = useState({});
  const [guardadoPorRut, setGuardadoPorRut] = useState({});
  const [seguimientosDb, setSeguimientosDb] = useState([]);
  const [mensajeAccion, setMensajeAccion] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    const cargarNomina = async () => {
      try {
        setCargando(true);
        setError("");
        const [nominas, seguimientos] = await Promise.all([
          loadNominas(),
          loadSeguimientos().catch((err) => {
            console.warn("No se pudieron cargar los seguimientos desde Supabase.", err);
            return [];
          }),
        ]);

        if (mounted) {
          setNominaLaboral(nominas.laboral);
          setNominaContinuidad(nominas.continuidad);
          setAlumnos([...nominas.laboral, ...nominas.continuidad]);
          setSeguimientosDb(seguimientos);
        }
      } catch (err) {
        if (mounted) {
          setError(
            err instanceof Error
              ? err.message
              : "No se pudo cargar las nóminas.",
          );
        }
      } finally {
        if (mounted) {
          setCargando(false);
        }
      }
    };

    cargarNomina();

    return () => {
      mounted = false;
    };
  }, []);

  const alumnoEncontrado = useMemo(
    () => findAlumnoByRut(nominaLaboral, nominaContinuidad, rutBuscado),
    [nominaLaboral, nominaContinuidad, rutBuscado],
  );

  const rutSeleccionado = alumnoEncontrado
    ? alumnoEncontrado.ambos
      ? tipoSeleccionado
        ? alumnoEncontrado[tipoSeleccionado]?.rutCompleto ?? ""
        : ""
      : alumnoEncontrado.rutCompleto ?? ""
    : "";

  const alumnoActual = alumnoEncontrado
    ? alumnoEncontrado.ambos
      ? tipoSeleccionado
        ? alumnoEncontrado[tipoSeleccionado]
        : null
      : alumnoEncontrado
    : null;

  const seguimientoActual = useMemo(() => {
    if (!alumnoActual) {
      return null;
    }

    return (
      seguimientosDb.find(
        (seguimiento) =>
          seguimiento.origen === alumnoActual.tipo &&
          seguimiento.rut === alumnoActual.rut &&
          seguimiento.dv === alumnoActual.dv,
      ) ?? null
    );
  }, [alumnoActual, seguimientosDb]);

  const totalLlamados = useMemo(
    () =>
      seguimientosDb.filter(
        (seguimiento) => Boolean(seguimiento.llamado_por_telefono),
      ).length,
    [seguimientosDb],
  );

  const llamadoLocal = rutSeleccionado ? llamadosPorRut[rutSeleccionado] : undefined;
  const turnosLocal = rutSeleccionado ? turnosSeleccionadosPorRut[rutSeleccionado] : undefined;
  const guardadoLocal = rutSeleccionado ? guardadoPorRut[rutSeleccionado] : undefined;
  const tieneTurnosLocales = Array.isArray(turnosLocal);

  const llamoPorTelefono =
    typeof llamadoLocal === "boolean"
      ? llamadoLocal
      : Boolean(seguimientoActual?.llamado_por_telefono);

  const turnosGuardados = turnosDesdeTexto(seguimientoActual?.fecha_examen);
  const turnosSeleccionadosIds = tieneTurnosLocales ? turnosLocal : turnosGuardados;
  const turnosSeleccionados = turnosSeleccionadosPorIds(turnosSeleccionadosIds);
  const turnosExamenTexto = formatearTurnosExamen(turnosSeleccionados);
  const fechaExamen = tieneTurnosLocales
    ? turnosExamenTexto
    : turnosExamenTexto || seguimientoActual?.fecha_examen || "";

  const guardado =
    typeof guardadoLocal === "boolean"
      ? guardadoLocal
      : Boolean(seguimientoActual?.guardado);

  const faltan = Math.max(alumnos.length - totalLlamados, 0);

  const registrosGuardados = useMemo(() => {
    return seguimientosDb
      .filter((seguimiento) => Boolean(seguimiento.guardado))
      .map((seguimiento) => {
        const alumno = alumnos.find(
          (item) =>
            item.tipo === seguimiento.origen &&
            item.rut === seguimiento.rut &&
            item.dv === seguimiento.dv,
        );

        const nombres = alumno
          ? `${titleCase(alumno.nombres)} ${titleCase(
              alumno.apellidoPaterno,
            )} ${titleCase(alumno.apellidoMaterno)}`
              .replace(/\s+/g, " ")
              .trim()
          : "";

        return {
          tipo: seguimiento.origen === "laboral" ? "Laboral" : "Continuidad",
          programa: `Programa ${
            seguimiento.origen === "laboral" ? "Laboral" : "Continuidad"
          }`,
          periodoCertificacion: alumno
            ? String(alumno.nivelACertificar || "").replace(/\s+/g, " ").trim()
            : "",
          rut: formatRut(seguimiento.rut, seguimiento.dv),
          nombres,
          llamadoPorTelefono: seguimiento.llamado_por_telefono ? "Sí" : "No",
          turnosExamen: seguimiento.fecha_examen || "",
          fechaExamen: seguimiento.fecha_examen || "",
          guardado: "Sí",
        };
      });
  }, [seguimientosDb, alumnos]);

  const handleRutChange = (event) => {
    setRutBuscado(event.target.value);
    setTipoSeleccionado(null);
  };

  const handleLlamadoChange = (event) => {
    if (!rutSeleccionado) {
      return;
    }

    const checked = event.target.checked;

    setLlamadosPorRut((prev) => ({
      ...prev,
      [rutSeleccionado]: checked,
    }));
  };

  const handleTurnoExamenChange = (turnoId) => {
    if (!rutSeleccionado) {
      return;
    }

    setMensajeAccion("");
    setTurnosSeleccionadosPorRut((prev) => {
      const actuales = Array.isArray(prev[rutSeleccionado])
        ? prev[rutSeleccionado]
        : turnosSeleccionadosIds;
      const next = actuales.includes(turnoId)
        ? actuales.filter((id) => id !== turnoId)
        : [...actuales, turnoId];

      return {
        ...prev,
        [rutSeleccionado]: next,
      };
    });
  };

  const handleGuardar = async () => {
    if (!rutSeleccionado) {
      return;
    }

    if (!llamoPorTelefono || !fechaExamen) {
      setMensajeAccion(
        "Marca 'Llamó por teléfono' y selecciona al menos un turno antes de guardar.",
      );
      return;
    }

    setGuardadoPorRut((prev) => ({
      ...prev,
      [rutSeleccionado]: true,
    }));

    try {
      if (alumnoActual) {
        const saved = await guardarSeguimientoAlumno(alumnoActual, {
          llamadoPorTelefono: llamoPorTelefono,
          fechaExamen,
          guardado: true,
        });
        if (saved) {
          setSeguimientosDb((prev) => {
            const next = prev.filter(
              (seguimiento) =>
                !(
                  seguimiento.origen === saved.origen &&
                  seguimiento.rut === saved.rut &&
                  seguimiento.dv === saved.dv
                ),
            );

            return [...next, saved];
          });
        }
      }
      setMensajeAccion("Datos guardados con éxito.");
    } catch (err) {
      setMensajeAccion(
        err instanceof Error
          ? `Guardado local OK, pero no se pudo sincronizar con Supabase: ${err.message}`
          : "Guardado local OK, pero no se pudo sincronizar con Supabase.",
      );
    }

    setTimeout(() => {
      setMensajeAccion("");
    }, 1500);
  };

  const botonGuardarTexto = guardado ? "Actualizar" : "Guardar";

  const handleExportExcel = async () => {
    if (!registrosGuardados.length) {
      setMensajeAccion("No hay registros guardados para exportar.");
      return;
    }

    try {
      const XLSX = await import("xlsx");
      const worksheet = XLSX.utils.json_to_sheet(
        registrosGuardados.map((registro) => ({
          Tipo: registro.tipo,
          Programa: registro.programa,
          "Periodo certificará": registro.periodoCertificacion,
          RUT: registro.rut,
          "Nombre completo": registro.nombres,
          "Llamó por teléfono": registro.llamadoPorTelefono,
          "Turnos examen": registro.turnosExamen || registro.fechaExamen,
          Guardado: registro.guardado,
        })),
      );
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Resultados");

      const fileName = `resultados-carelmapu-${new Date()
        .toISOString()
        .slice(0, 10)}.xlsx`;
      XLSX.writeFile(workbook, fileName);
      setMensajeAccion("Resultados exportados a Excel.");
    } catch (err) {
      setMensajeAccion(
        err instanceof Error
          ? `No se pudo exportar a Excel: ${err.message}`
          : "No se pudo exportar a Excel.",
      );
    }
  };

  const handleExportPdf = () => {
    if (!registrosGuardados.length) {
      setMensajeAccion("No hay registros guardados para exportar.");
      return;
    }

    const escapePdfText = (value = "") =>
      String(value)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\\/g, "\\\\")
        .replace(/\(/g, "\\(")
        .replace(/\)/g, "\\)");

    const lines = [];
    lines.push("Resultados guardados - Carelmapu");
    lines.push("");

    registrosGuardados.forEach((registro, index) => {
      lines.push(`${index + 1}. ${registro.nombres}`);
      lines.push(`RUT: ${registro.rut}`);
      lines.push(`Programa: ${registro.programa}`);
      lines.push(`Periodo certificara: ${registro.periodoCertificacion || "Sin dato"}`);
      lines.push(`Llamo por telefono: ${registro.llamadoPorTelefono}`);
      lines.push(`Turnos examen: ${registro.turnosExamen || registro.fechaExamen || "Sin dato"}`);
      lines.push("");
    });

    const pageWidth = 842;
    const pageHeight = 595;
    const marginX = 48;
    const marginTop = 48;
    const fontSize = 12;
    const lineHeight = 16;
    const maxLinesPerPage = Math.floor((pageHeight - marginTop * 2) / lineHeight);

    const chunks = [];
    for (let i = 0; i < lines.length; i += maxLinesPerPage) {
      chunks.push(lines.slice(i, i + maxLinesPerPage));
    }

    const objectMap = new Map();
    const orderedObjects = [];
    const addObject = (number, content) => {
      objectMap.set(number, content);
      orderedObjects.push(number);
    };

    const catalogObj = 1;
    const pagesObj = 2;
    const fontObj = 3;
    const firstPageObj = 4;

    const pageNumbers = chunks.map((_, index) => firstPageObj + index * 2);
    const contentNumbers = chunks.map((_, index) => firstPageObj + index * 2 + 1);

    addObject(catalogObj, `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`);
    addObject(
      pagesObj,
      `<< /Type /Pages /Kids [${pageNumbers
        .map((number) => `${number} 0 R`)
        .join(" ")}] /Count ${pageNumbers.length} >>`,
    );
    addObject(fontObj, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`);

    chunks.forEach((chunk, index) => {
      const contentNumber = contentNumbers[index];
      const pageNumber = pageNumbers[index];
      const contentLines = [
        "BT",
        `/F1 ${fontSize} Tf`,
        `${marginX} ${pageHeight - marginTop} Td`,
        ...chunk.map((line, lineIndex) =>
          lineIndex === 0
            ? `(${escapePdfText(line)}) Tj`
            : `0 -${lineHeight} Td (${escapePdfText(line)}) Tj`,
        ),
        "ET",
      ];
      const contentStream = contentLines.join("\n");

      addObject(
        contentNumber,
        `<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream`,
      );
      addObject(
        pageNumber,
        `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontObj} 0 R >> >> /Contents ${contentNumber} 0 R >>`,
      );
    });

    let offset = "%PDF-1.4\n".length;
    const xrefEntries = ["0000000000 65535 f "];
    const pdfObjectStrings = orderedObjects
      .sort((a, b) => a - b)
      .map((number) => `${number} 0 obj\n${objectMap.get(number)}\nendobj\n`);

    pdfObjectStrings.forEach((objectString) => {
      xrefEntries.push(String(offset).padStart(10, "0") + " 00000 n ");
      offset += objectString.length;
    });

    const xrefStart = offset;
    const pdf = [
      "%PDF-1.4\n",
      pdfObjectStrings.join(""),
      `xref\n0 ${orderedObjects.length + 1}\n`,
      `${xrefEntries.join("\n")}\n`,
      `trailer\n<< /Size ${orderedObjects.length + 1} /Root ${catalogObj} 0 R >>\n`,
      `startxref\n${xrefStart}\n%%EOF`,
    ].join("");

    const blob = new Blob([pdf], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `resultados-carelmapu-${new Date()
      .toISOString()
      .slice(0, 10)}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
    setMensajeAccion("Resultados exportados a PDF.");
  };

  const alumnoVisible = alumnoActual
    ? `${titleCase(alumnoActual.nombres)} ${titleCase(
        alumnoActual.apellidoPaterno,
      )} ${titleCase(alumnoActual.apellidoMaterno)}`
        .replace(/\s+/g, " ")
        .trim()
    : "";

  const tipoDisplay = alumnoActual
    ? alumnoActual.tipo === "laboral"
      ? "Laboral"
      : "Continuidad"
    : "";

  const periodoCertificacion = alumnoActual
    ? String(alumnoActual.nivelACertificar || "").replace(/\s+/g, " ").trim()
    : "";

  const programaDisplay = alumnoActual
    ? `Programa ${tipoDisplay}${periodoCertificacion ? ` ${periodoCertificacion}` : ""}`
    : "";

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-7xl items-center">
        <div className="relative w-full overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-2xl shadow-cyan-950/30 backdrop-blur-xl">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.18),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.15),transparent_28%)]" />

          <div className="relative z-10 p-6 sm:p-8 lg:p-10">
            <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.35em] text-cyan-300/80">
                  Colegio de Adultos
                </p>
                <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  Carelmapu de Conchalí
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                  Busca alumnos por RUT desde los Excel de nómina en
                  <code>public/</code>, revisa su nivel a certificar y marca
                  si ya llamó por teléfono.
                </p>
              </div>

              {alumnoEncontrado ? (
                <div className="grid grid-cols-3 gap-3 text-center text-sm">
                  <div className="rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3">
                    <div className="text-slate-400">Cargados</div>
                    <div className="mt-1 text-xl font-semibold text-white">
                      {alumnos.length}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3">
                    <div className="text-slate-400">Llamados</div>
                    <div className="mt-1 text-xl font-semibold text-white">
                      {totalLlamados}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3">
                    <div className="text-slate-400">Pendientes</div>
                    <div className="mt-1 text-xl font-semibold text-white">
                      {faltan}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mb-8">
              <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-300">
                    RUT del alumno
                  </span>
                  <input
                    type="text"
                    value={rutBuscado}
                    onChange={handleRutChange}
                    placeholder="12.345.678-9, 123456789 o 12345678"
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-5 py-4 text-lg text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30"
                  />
                </label>
              </div>

              {alumnoEncontrado?.ambos && !tipoSeleccionado ? (
                <div className="mt-6 rounded-2xl border border-cyan-400/30 bg-cyan-400/10 p-5 text-sm fade-in-up">
                  <div className="mb-4 text-base font-semibold text-white">
                    Alumno encontrado en ambos programas
                  </div>
                  <div className="mb-3 text-slate-300">
                    Selecciona cuál programa:
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      { val: "laboral", label: "Laboral" },
                      { val: "continuidad", label: "Continuidad" },
                    ].map(({ val, label }) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setTipoSeleccionado(val)}
                        className={[
                          "rounded-2xl border px-4 py-3 text-left text-sm font-medium transition",
                          tipoSeleccionado === val
                            ? "border-cyan-400 bg-cyan-500/20 text-white"
                            : "border-white/10 bg-slate-900 text-slate-200 hover:border-cyan-300/40",
                        ].join(" ")}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {alumnoActual ? (
                <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start fade-in-up">
                  <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-3 text-sm">
                    <div>
                      <div className="text-xs text-emerald-300">{tipoDisplay}</div>
                      <div className="font-semibold text-emerald-200">
                        {programaDisplay || "Programa sin dato"}
                      </div>
                    </div>
                  </div>
                  <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-slate-950/60 px-5 py-4 text-sm text-slate-200">
                    <input
                      type="checkbox"
                      checked={llamoPorTelefono}
                      onChange={handleLlamadoChange}
                      className="mt-1 h-5 w-5 rounded border-slate-600 bg-slate-900 text-cyan-500 focus:ring-cyan-400"
                    />
                    <span className="leading-5">
                      Llamó por teléfono
                      <span className="mt-1 block text-xs text-slate-400">
                        Requerido antes de guardar.
                      </span>
                    </span>
                  </label>

                  <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5 text-sm text-slate-200">
                    <div className="mb-3 text-sm font-medium text-white">
                      Turnos de examen
                    </div>
                    <div className="space-y-3">
                      {TURNOS_EXAMEN_POR_DIA.map((grupo) => (
                        <div
                          key={grupo.dia}
                          className="rounded-2xl border border-white/10 bg-slate-900/60 p-3"
                        >
                          <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
                            {grupo.dia}
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {grupo.turnos.map((turno) => {
                              const activo = turnosSeleccionadosIds.includes(turno.id);

                              return (
                                <button
                                  type="button"
                                  key={turno.id}
                                  onClick={() => handleTurnoExamenChange(turno.id)}
                                  className={[
                                    "rounded-2xl border px-4 py-3 text-left text-sm transition",
                                    activo
                                      ? "border-cyan-400 bg-cyan-500/20 text-white shadow-sm shadow-cyan-500/10"
                                      : "border-white/10 bg-slate-950 text-slate-200 hover:border-cyan-300/40 hover:bg-slate-900/90",
                                  ].join(" ")}
                                >
                                  <div className="font-semibold">{turno.hora}</div>
                                  <div className="text-xs text-slate-400">
                                    Disponible
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="mt-3 text-xs text-cyan-200/80">
                      Puedes marcar uno o varios turnos. Al guardar se actualiza el mismo seguimiento.
                    </p>
                    <p className="mt-3 text-xs text-slate-400">
                      Requerido antes de guardar.
                    </p>
                  </div>

                  <div className="flex flex-col gap-3">
                    <button
                      type="button"
                      onClick={handleGuardar}
                      className="inline-flex items-center justify-center rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
                    >
                      {botonGuardarTexto}
                    </button>
                    <button
                      type="button"
                      onClick={handleExportExcel}
                      disabled={!registrosGuardados.length}
                      className="inline-flex items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-500/15 px-5 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-500"
                    >
                      Exportar a Excel
                    </button>
                    <button
                      type="button"
                      onClick={handleExportPdf}
                      disabled={!registrosGuardados.length}
                      className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:text-slate-500"
                    >
                      Exportar a PDF
                    </button>
                    {mensajeAccion ? (
                      <p
                        className={
                          mensajeAccion.includes("éxito")
                            ? "text-sm text-emerald-300"
                            : "text-sm text-amber-300"
                        }
                      >
                        {mensajeAccion}
                      </p>
                    ) : null}
                    {guardado ? (
                      <p className="text-xs text-slate-400">
                        Este alumno ya tiene un seguimiento guardado; este
                        botón actualiza el mismo registro.
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            {error ? (
              <div className="mb-8 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            ) : null}

            {(rutBuscado || alumnoEncontrado) ? (
              <div className="grid gap-6 xl:grid-cols-[1.45fr_0.95fr] fade-in-up">
                <section className="rounded-3xl border border-white/10 bg-slate-950/60 p-6 shadow-lg shadow-black/20">
                  <div className="mb-5 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-white">
                      Datos del alumno
                    </h2>
                  </div>

                {cargando ? (
                  <div className="rounded-3xl border border-dashed border-white/10 bg-slate-950/70 px-5 py-10 text-slate-400 shadow-inner smooth-card">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-900/80">
                      <div className="loader-ring" />
                    </div>
                    <div className="text-center text-base font-medium text-slate-200">
                      Cargando la nómina desde el Excel...
                    </div>
                  </div>
                ) : alumnoEncontrado ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <InfoCard label="Nombre completo" value={alumnoVisible} />
                    <InfoCard
                      label="RUT"
                      value={formatRut(alumnoActual.rut, alumnoActual.dv)}
                    />
                    <InfoCard
                      label="Nivel a certificar"
                      value={alumnoActual.nivelACertificar || "Sin dato"}
                      accent
                    />
                    <InfoCard
                      label="Celular"
                      value={
                        formatChileanMobile(alumnoActual.celular) || "Sin dato"
                      }
                    />
                    <InfoCard
                      label="Teléfono fijo"
                      value={alumnoActual.telefonoFijo || "Sin dato"}
                    />
                    <InfoCard
                      label="Correo"
                      value={alumnoActual.correoElectronico || "Sin dato"}
                    />
                    <InfoCard
                      label="Nacionalidad"
                      value={titleCase(
                        alumnoActual.nacionalidad || alumnoActual.pais,
                      ) || "Sin dato"}
                    />
                    <InfoCard
                      label="País"
                      value={
                        <CountryDisplay
                          country={alumnoActual.pais || alumnoActual.nacionalidad}
                        />
                      }
                    />
                  </div>
                ) : rutBuscado ? (
                  <div className="rounded-2xl border border-dashed border-white/10 px-5 py-10 text-slate-400">
                    No encontramos un alumno con ese RUT. Revisa los dígitos,
                    el DV y prueba nuevamente.
                  </div>
                ) : null}
              </section>

              {alumnoEncontrado ? (
                <aside className="rounded-3xl border border-white/10 bg-slate-950/60 p-6 shadow-lg shadow-black/20">
                  <h2 className="text-lg font-semibold text-white">
                    Resumen operativo
                  </h2>
                  <div className="mt-5 space-y-4">
                    <StatRow label="Alumno encontrado" value="Sí" />
                    <StatRow
                      label="Llamado marcado"
                      value={llamoPorTelefono ? "Sí" : "No"}
                    />
                    <StatRow
                      label="RUT buscado"
                      value={rutBuscado.trim() || "Sin búsqueda"}
                    />
                    <StatRow
                      label="Periodo certificará"
                      value={periodoCertificacion || "Sin dato"}
                    />
                    <StatRow
                      label="Guardado"
                      value={guardado ? "Sí" : "No"}
                    />
                    <StatRow
                      label="Turnos examen"
                      value={fechaExamen || "No seleccionados"}
                    />
                    <StatRow
                      label="Registros guardados"
                      value={registrosGuardados.length}
                    />
                  </div>
                </aside>
              ) : null}
            </div>
          ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoCard({ label, value, accent = false, span = 1 }) {
  return (
    <div
      className={[
        "rounded-2xl border p-4",
        accent
          ? "border-cyan-400/30 bg-cyan-400/10"
          : "border-white/10 bg-white/5",
        span === 2 ? "md:col-span-2" : "",
      ].join(" ")}
    >
      <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
        {label}
      </div>
      <div className="mt-2 text-base font-medium leading-6 text-white">
        {value}
      </div>
    </div>
  );
}

function CountryDisplay({ country }) {
  const name = getCountryName(country);
  const flagUrl = getCountryFlagUrl(country);

  if (name === "Sin dato") {
    return <span className="text-slate-400">{name}</span>;
  }

  return (
    <span className="inline-flex items-center gap-2">
      {flagUrl ? (
        <img
          src={flagUrl}
          alt={`Bandera de ${name}`}
          className="h-5 w-7 rounded-[2px] object-cover ring-1 ring-white/10"
        />
      ) : null}
      <span>{name}</span>
    </span>
  );
}

function StatRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
      <span className="text-sm text-slate-300">{label}</span>
      <span className="text-sm font-medium text-white">{value}</span>
    </div>
  );
}

export default App;
