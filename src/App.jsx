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
    dia: "Viernes 7 de agosto",
    turnos: [
      { id: "viernes-1700", hora: "17:00", cupo: 40 },
      { id: "viernes-1830", hora: "18:30", cupo: 40 },
    ],
  },
  {
    dia: "Domingo 9 de agosto",
    turnos: [
      { id: "domingo-0900", hora: "09:00", cupo: 200 },
      { id: "domingo-1200", hora: "12:00", cupo: 200 },
    ],
  },
];

const CUPO_TONO = {
  green: { text: "text-emerald-300", bar: "#34d399", label: "Disponible" },
  amber: { text: "text-amber-300", bar: "#fbbf24", label: "Casi lleno" },
  red: { text: "text-rose-300", bar: "#fb7185", label: "Lleno" },
};

function estadoCupo(count, cupo) {
  if (!cupo) {
    return "green";
  }
  if (count >= cupo) {
    return "red";
  }
  if (count / cupo >= 0.8) {
    return "amber";
  }
  return "green";
}

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

function getInitials(nombres = "", apellido = "") {
  const a = String(nombres).trim()[0] || "";
  const b = String(apellido).trim()[0] || "";
  return `${a}${b}`.toUpperCase() || "?";
}

const EXPORT_PASSWORD =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_EXPORT_PASSWORD) ||
  "carelmapu2025";

function maskNombre(nombre = "") {
  const limpio = String(nombre).trim();
  if (!limpio) {
    return "—";
  }

  return limpio
    .split(/\s+/)
    .map((palabra) =>
      palabra ? `${palabra[0]}${"•".repeat(Math.max(palabra.length - 1, 1))}` : "",
    )
    .join(" ");
}

function maskRut(rut = "") {
  const limpio = String(rut).trim();
  if (!limpio) {
    return "—";
  }
  if (limpio.length <= 4) {
    return "••••";
  }

  return `${limpio.slice(0, 2)}•••••${limpio.slice(-2)}`;
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
  const [desbloqueado, setDesbloqueado] = useState(false);
  const [modalClave, setModalClave] = useState(false);
  const [claveInput, setClaveInput] = useState("");
  const [claveError, setClaveError] = useState("");
  const [accionPendiente, setAccionPendiente] = useState(null);

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

  const alumnoEnAmbosProgramas = Boolean(alumnoEncontrado?.ambos);

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

  const ocupacionPorTurno = useMemo(() => {
    const conteo = {};
    for (const turno of TURNOS_EXAMEN) {
      conteo[turno.id] = 0;
    }

    for (const seguimiento of seguimientosDb) {
      for (const turnoId of turnosDesdeTexto(seguimiento.fecha_examen)) {
        if (conteo[turnoId] != null) {
          conteo[turnoId] += 1;
        }
      }
    }

    return conteo;
  }, [seguimientosDb]);

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
        .replace(/[̀-ͯ]/g, "")
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

  const ejecutarAccion = (accion) => {
    if (accion === "excel") {
      handleExportExcel();
    } else if (accion === "pdf") {
      handleExportPdf();
    }
  };

  const solicitarClave = (accion) => {
    if (desbloqueado) {
      ejecutarAccion(accion);
      return;
    }

    setAccionPendiente(accion);
    setClaveInput("");
    setClaveError("");
    setModalClave(true);
  };

  const confirmarClave = (event) => {
    if (event) {
      event.preventDefault();
    }

    if (claveInput === EXPORT_PASSWORD) {
      setDesbloqueado(true);
      setModalClave(false);
      setClaveError("");
      const accion = accionPendiente;
      setAccionPendiente(null);
      ejecutarAccion(accion);
    } else {
      setClaveError("Clave incorrecta. Inténtalo nuevamente.");
    }
  };

  const cerrarModalClave = () => {
    setModalClave(false);
    setAccionPendiente(null);
    setClaveInput("");
    setClaveError("");
  };

  const alternarRevelar = () => {
    if (desbloqueado) {
      setDesbloqueado(false);
      return;
    }
    solicitarClave("revelar");
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

  const iniciales = alumnoActual
    ? getInitials(alumnoActual.nombres, alumnoActual.apellidoPaterno)
    : "";

  const progreso = alumnos.length
    ? Math.min(100, Math.round((totalLlamados / alumnos.length) * 100))
    : 0;

  const puedeGuardar = Boolean(llamoPorTelefono && fechaExamen);
  const mensajeEsError = mensajeAccion && !/(éxito|exportad)/i.test(mensajeAccion);

  return (
    <div className="min-h-screen px-4 py-6 text-slate-100 sm:px-6 lg:px-10">
      <div className="mx-auto w-full max-w-6xl">
        {/* ===================== Header ===================== */}
        <header className="glass mb-6 px-5 py-5 sm:px-7 sm:py-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="brand-mark">C</div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-cyan-300/80">
                  Colegio de Adultos
                </p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-[26px]">
                  Carelmapu de Conchalí
                </h1>
                <p className="mt-0.5 text-sm text-slate-400">
                  Gestión de llamados y turnos de examen
                </p>
              </div>
            </div>

            <div className="w-full max-w-md lg:w-auto lg:min-w-[360px]">
              <div className="grid grid-cols-3 gap-2.5">
                <StatPill
                  label="Cargados"
                  value={alumnos.length}
                  icon={<Icon name="users" />}
                />
                <StatPill
                  label="Llamados"
                  value={totalLlamados}
                  icon={<Icon name="phone" />}
                  tone="ok"
                />
                <StatPill
                  label="Pendientes"
                  value={faltan}
                  icon={<Icon name="clock" />}
                  tone="warn"
                />
              </div>
              <div className="mt-3.5">
                <div className="mb-1.5 flex items-center justify-between text-xs text-slate-400">
                  <span>Avance de llamados</span>
                  <span className="font-semibold text-cyan-200">{progreso}%</span>
                </div>
                <div className="progress" role="progressbar" aria-valuenow={progreso} aria-valuemin={0} aria-valuemax={100}>
                  <div className="progress-fill" style={{ width: `${progreso}%` }} />
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* ===================== Búsqueda ===================== */}
        <section className="glass mb-6 px-5 py-6 sm:px-7 fade-in-up">
          <label htmlFor="rut" className="mb-2.5 block text-sm font-semibold text-slate-200">
            Buscar alumno por RUT
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
              <Icon name="search" />
            </span>
            <input
              id="rut"
              type="text"
              value={rutBuscado}
              onChange={handleRutChange}
              placeholder="12.345.678-9, 123456789 o 12345678"
              className="search-field"
              autoComplete="off"
            />
          </div>
          <p className="mt-2.5 text-xs text-slate-500">
            Acepta el RUT con o sin puntos y guion. La búsqueda es instantánea.
          </p>

          {/* Selector de programa (alumno en ambos) */}
          {alumnoEncontrado?.ambos && !tipoSeleccionado ? (
            <div className="mt-6 rounded-2xl border border-cyan-400/25 bg-cyan-400/[0.06] p-5 fade-in-up">
              <div className="mb-1 flex items-center gap-2 text-base font-semibold text-white">
                <Icon name="branch" />
                Alumno inscrito en ambos programas
              </div>
              <p className="mb-4 text-sm text-slate-300">
                Selecciona con cuál programa quieres trabajar:
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { val: "laboral", label: "Laboral", desc: "Programa laboral" },
                  { val: "continuidad", label: "Continuidad", desc: "Continuidad de estudios" },
                ].map(({ val, label, desc }) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setTipoSeleccionado(val)}
                    data-active={tipoSeleccionado === val}
                    className="chip"
                  >
                    <div className="text-sm font-semibold text-white">{label}</div>
                    <div className="mt-0.5 text-xs text-slate-400">{desc}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        {error ? (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-5 py-4 text-sm text-rose-200 fade-in-up">
            <Icon name="alert" />
            <span>{error}</span>
          </div>
        ) : null}

        {/* ===================== Estado de carga ===================== */}
        {cargando ? (
          <section className="glass px-6 py-14 text-center fade-in-up">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center">
              <div className="loader-ring" />
            </div>
            <p className="text-base font-medium text-slate-200">
              Cargando la nómina de alumnos…
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Leyendo desde Supabase o los Excel locales.
            </p>
          </section>
        ) : null}

        {/* ===================== Workspace ===================== */}
        {!cargando && alumnoActual ? (
          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr] fade-in-up-2">
            {/* Perfil del alumno */}
            <section className="glass p-6 sm:p-7">
              <div className="flex items-start gap-4">
                <div className="avatar">{iniciales}</div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-xl font-bold text-white">
                    {alumnoVisible || "Alumno"}
                  </h2>
                  <p className="mt-0.5 text-sm text-slate-400">
                    {formatRut(alumnoActual.rut, alumnoActual.dv)}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="badge badge-brand">
                      <span className="badge-dot" />
                      {programaDisplay || "Programa sin dato"}
                    </span>
                    {alumnoEnAmbosProgramas ? (
                      <span className="badge badge-muted">En ambos programas</span>
                    ) : null}
                    {guardado ? (
                      <span className="badge badge-ok">
                        <Icon name="check" size={12} />
                        Guardado
                      </span>
                    ) : (
                      <span className="badge badge-warn">Sin guardar</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="my-6 h-px bg-white/10" />

              <div className="grid gap-3 sm:grid-cols-2">
                <InfoCard
                  label="Nivel a certificar"
                  value={alumnoActual.nivelACertificar || "Sin dato"}
                  icon={<Icon name="award" />}
                  accent
                  span={2}
                />
                <InfoCard
                  label="Celular"
                  value={formatChileanMobile(alumnoActual.celular) || "Sin dato"}
                  icon={<Icon name="phone" />}
                />
                <InfoCard
                  label="Teléfono fijo"
                  value={alumnoActual.telefonoFijo || "Sin dato"}
                  icon={<Icon name="phone" />}
                />
                <InfoCard
                  label="Correo"
                  value={alumnoActual.correoElectronico || "Sin dato"}
                  icon={<Icon name="mail" />}
                  span={2}
                />
                <InfoCard
                  label="Nacionalidad"
                  value={
                    titleCase(alumnoActual.nacionalidad || alumnoActual.pais) ||
                    "Sin dato"
                  }
                  icon={<Icon name="globe" />}
                />
                <InfoCard
                  label="País"
                  value={
                    <CountryDisplay
                      country={alumnoActual.pais || alumnoActual.nacionalidad}
                    />
                  }
                  icon={<Icon name="flag" />}
                />
              </div>
            </section>

            {/* Panel de acción */}
            <aside className="flex flex-col gap-5">
              <section className="glass p-6">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
                  Acciones de seguimiento
                </h3>

                {/* Toggle llamado */}
                <label className="mt-4 flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3.5">
                  <span className="text-sm">
                    <span className="block font-medium text-white">
                      Llamó por teléfono
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-400">
                      Requerido antes de guardar
                    </span>
                  </span>
                  <span className="switch">
                    <input
                      type="checkbox"
                      checked={llamoPorTelefono}
                      onChange={handleLlamadoChange}
                    />
                    <span className="switch-track" />
                    <span className="switch-thumb" />
                  </span>
                </label>

                {/* Turnos */}
                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-white">
                      Turnos de examen
                    </span>
                    <span className="text-xs text-slate-500">
                      {turnosSeleccionados.length} seleccionado
                      {turnosSeleccionados.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="space-y-2.5">
                    {TURNOS_EXAMEN_POR_DIA.map((grupo) => {
                      const usadosDia = grupo.turnos.reduce(
                        (acc, turno) => acc + (ocupacionPorTurno[turno.id] || 0),
                        0,
                      );
                      const cupoDia = grupo.turnos.reduce(
                        (acc, turno) => acc + (turno.cupo || 0),
                        0,
                      );

                      return (
                        <div
                          key={grupo.dia}
                          className="rounded-2xl border border-white/10 bg-slate-950/40 p-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                              {grupo.dia}
                            </div>
                            <span
                              className={`text-[11px] font-semibold ${
                                CUPO_TONO[estadoCupo(usadosDia, cupoDia)].text
                              }`}
                            >
                              {usadosDia}/{cupoDia}
                            </span>
                          </div>
                          <div className="mt-2.5 grid grid-cols-2 gap-2">
                            {grupo.turnos.map((turno) => {
                              const activo = turnosSeleccionadosIds.includes(turno.id);
                              const usados = ocupacionPorTurno[turno.id] || 0;
                              const tono = estadoCupo(usados, turno.cupo);
                              const cupoInfo = CUPO_TONO[tono];
                              const lleno = tono === "red";
                              const pct = turno.cupo
                                ? Math.min(100, Math.round((usados / turno.cupo) * 100))
                                : 0;
                              const bloqueado = lleno && !activo;

                              return (
                                <button
                                  type="button"
                                  key={turno.id}
                                  onClick={() => handleTurnoExamenChange(turno.id)}
                                  data-active={activo}
                                  disabled={bloqueado}
                                  title={
                                    bloqueado
                                      ? "Turno lleno, no se pueden asignar más alumnos"
                                      : undefined
                                  }
                                  className="chip !py-2.5 !px-3 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <div className="flex items-center justify-between gap-1.5">
                                    <span className="flex items-center gap-1.5">
                                      {activo ? <Icon name="check" size={13} /> : null}
                                      <span className="text-sm font-semibold text-white">
                                        {turno.hora}
                                      </span>
                                    </span>
                                    <span className={`text-[11px] font-semibold ${cupoInfo.text}`}>
                                      {usados}/{turno.cupo}
                                    </span>
                                  </div>
                                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                                    <div
                                      className="h-full rounded-full transition-all"
                                      style={{ width: `${pct}%`, background: cupoInfo.bar }}
                                    />
                                  </div>
                                  <div className={`mt-1 text-[10px] font-medium ${cupoInfo.text}`}>
                                    {cupoInfo.label}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-2.5 text-xs text-slate-500">
                    Puedes marcar uno o varios turnos. Cada turno tiene un cupo máximo.
                  </p>
                </div>

                {/* Guardar */}
                <button
                  type="button"
                  onClick={handleGuardar}
                  disabled={!puedeGuardar}
                  className="btn btn-primary mt-5 w-full"
                >
                  <Icon name="check" size={16} />
                  {botonGuardarTexto}
                </button>

                {mensajeAccion ? (
                  <p
                    className={`mt-3 flex items-start gap-2 text-sm ${
                      mensajeEsError ? "text-amber-300" : "text-emerald-300"
                    }`}
                  >
                    <Icon name={mensajeEsError ? "alert" : "check"} size={15} />
                    <span>{mensajeAccion}</span>
                  </p>
                ) : guardado ? (
                  <p className="mt-3 text-xs text-slate-400">
                    Este alumno ya tiene un seguimiento guardado; el botón actualiza
                    el mismo registro.
                  </p>
                ) : null}
              </section>

              {/* Exportar */}
              <section className="glass p-6">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
                    Exportar
                  </h3>
                  <span
                    className={`badge ${desbloqueado ? "badge-ok" : "badge-warn"}`}
                  >
                    <Icon name={desbloqueado ? "unlock" : "lock"} size={12} />
                    {desbloqueado ? "Desbloqueado" : "Protegido"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => solicitarClave("excel")}
                    disabled={!registrosGuardados.length}
                    className="btn btn-soft"
                  >
                    <Icon name={desbloqueado ? "download" : "lock"} size={16} />
                    Excel
                  </button>
                  <button
                    type="button"
                    onClick={() => solicitarClave("pdf")}
                    disabled={!registrosGuardados.length}
                    className="btn btn-ghost"
                  >
                    <Icon name={desbloqueado ? "document" : "lock"} size={16} />
                    PDF
                  </button>
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  {desbloqueado
                    ? "Sesión desbloqueada. Puedes descargar y ver los datos completos."
                    : "La descarga y los datos completos requieren clave."}
                </p>
              </section>
            </aside>
          </div>
        ) : null}

        {/* ===================== Sin resultados ===================== */}
        {!cargando && rutBuscado && !alumnoEncontrado ? (
          <section className="glass px-6 py-14 text-center fade-in-up">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800/60 text-slate-400">
              <Icon name="searchX" size={26} />
            </div>
            <p className="text-base font-semibold text-white">
              No encontramos un alumno con ese RUT
            </p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-slate-400">
              Revisa los dígitos y el dígito verificador (DV), y prueba nuevamente.
            </p>
          </section>
        ) : null}

        {/* ===================== Estado inicial ===================== */}
        {!cargando && !rutBuscado && !alumnoEncontrado ? (
          <section className="glass px-6 py-16 text-center fade-in-up">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-300">
              <Icon name="search" size={26} />
            </div>
            <p className="text-base font-semibold text-white">
              Escribe un RUT para comenzar
            </p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-slate-400">
              Busca al alumno, marca si lo llamaste, asigna sus turnos de examen y
              guarda el seguimiento.
            </p>
          </section>
        ) : null}

        {/* ===================== Registros guardados ===================== */}
        {!cargando && registrosGuardados.length ? (
          <section className="glass mt-6 p-6 sm:p-7 fade-in-up">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <h3 className="text-lg font-bold text-white">Registros guardados</h3>
                <span className="badge badge-muted">
                  {registrosGuardados.length} en total
                </span>
              </div>
              <button
                type="button"
                onClick={alternarRevelar}
                className="btn btn-ghost !py-2 !px-3.5 text-xs"
              >
                <Icon name={desbloqueado ? "eyeOff" : "eye"} size={15} />
                {desbloqueado ? "Ocultar datos" : "Mostrar datos"}
              </button>
            </div>
            {!desbloqueado ? (
              <p className="mb-4 flex items-center gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-3.5 py-2.5 text-xs text-amber-200/90">
                <Icon name="lock" size={14} />
                Información personal censurada. Ingresa la clave para ver nombres y
                RUT completos.
              </p>
            ) : null}
            <div className="-mx-2 overflow-x-auto">
              <table className="w-full min-w-[640px] border-separate border-spacing-y-1.5 px-2 text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                    <th className="px-3 pb-1 font-semibold">Alumno</th>
                    <th className="px-3 pb-1 font-semibold">RUT</th>
                    <th className="px-3 pb-1 font-semibold">Programa</th>
                    <th className="px-3 pb-1 font-semibold">Llamado</th>
                    <th className="px-3 pb-1 font-semibold">Turnos</th>
                  </tr>
                </thead>
                <tbody>
                  {registrosGuardados.map((registro, index) => (
                    <tr key={`${registro.rut}-${index}`} className="text-slate-200">
                      <td className="rounded-l-xl bg-white/[0.03] px-3 py-3 font-medium text-white">
                        {desbloqueado
                          ? registro.nombres || "—"
                          : maskNombre(registro.nombres)}
                      </td>
                      <td className="bg-white/[0.03] px-3 py-3 text-slate-300">
                        {desbloqueado ? registro.rut : maskRut(registro.rut)}
                      </td>
                      <td className="bg-white/[0.03] px-3 py-3">
                        <span className="badge badge-muted">{registro.tipo}</span>
                      </td>
                      <td className="bg-white/[0.03] px-3 py-3">
                        {registro.llamadoPorTelefono === "Sí" ? (
                          <span className="badge badge-ok">Sí</span>
                        ) : (
                          <span className="badge badge-warn">No</span>
                        )}
                      </td>
                      <td className="rounded-r-xl bg-white/[0.03] px-3 py-3 text-xs text-slate-400">
                        {registro.turnosExamen || registro.fechaExamen || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <footer className="mt-8 pb-4 text-center text-xs text-slate-600">
          Colegio de Adultos Carelmapu de Conchalí · Panel interno de gestión
        </footer>
      </div>

      {/* ===================== Modal de clave ===================== */}
      {modalClave ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm"
          onClick={cerrarModalClave}
          role="presentation"
        >
          <div
            className="glass w-full max-w-sm p-6 fade-in-up"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Ingresar clave de acceso"
          >
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-300">
                <Icon name="lock" size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Acceso protegido</h3>
                <p className="text-xs text-slate-400">
                  {accionPendiente === "revelar"
                    ? "Ingresa la clave para ver los datos."
                    : "Ingresa la clave para descargar."}
                </p>
              </div>
            </div>

            <form onSubmit={confirmarClave}>
              <input
                type="password"
                autoFocus
                value={claveInput}
                onChange={(event) => {
                  setClaveInput(event.target.value);
                  setClaveError("");
                }}
                placeholder="Clave de acceso"
                className="search-field !pl-4 !text-base"
              />
              {claveError ? (
                <p className="mt-2 flex items-center gap-1.5 text-sm text-rose-300">
                  <Icon name="alert" size={14} />
                  {claveError}
                </p>
              ) : null}

              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={cerrarModalClave}
                  className="btn btn-ghost flex-1"
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary flex-1">
                  <Icon name="unlock" size={16} />
                  Desbloquear
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StatPill({ label, value, icon, tone = "brand" }) {
  const toneClass =
    tone === "ok"
      ? "text-emerald-300"
      : tone === "warn"
        ? "text-amber-300"
        : "text-cyan-300";

  return (
    <div className="glass-soft flex flex-col gap-1 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
        <span className={toneClass}>{icon}</span>
        {label}
      </div>
      <div className="text-xl font-bold text-white">{value}</div>
    </div>
  );
}

function InfoCard({ label, value, icon, accent = false, span = 1 }) {
  return (
    <div
      className={[
        "rounded-2xl border p-4",
        accent
          ? "border-cyan-400/30 bg-cyan-400/[0.08]"
          : "border-white/10 bg-white/[0.03]",
        span === 2 ? "sm:col-span-2" : "",
      ].join(" ")}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
        {icon ? <span className={accent ? "text-cyan-300" : "text-slate-500"}>{icon}</span> : null}
        {label}
      </div>
      <div className="mt-1.5 break-words text-base font-medium leading-6 text-white">
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
          className="h-5 w-7 rounded-[3px] object-cover ring-1 ring-white/15"
        />
      ) : null}
      <span>{name}</span>
    </span>
  );
}

function Icon({ name, size = 16 }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };

  const paths = {
    search: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
    searchX: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3M9 9l4 4m0-4-4 4" /></>,
    phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.5 2.1L8 9.6a16 16 0 0 0 6 6l1.1-1.1a2 2 0 0 1 2.1-.5c.9.3 1.8.5 2.7.6a2 2 0 0 1 1.7 2Z" />,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    check: <path d="M20 6 9 17l-5-5" />,
    alert: <><path d="M12 9v4m0 4h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></>,
    mail: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m2 7 10 6 10-6" /></>,
    globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18Z" /></>,
    flag: <><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1Z" /><path d="M4 22v-7" /></>,
    award: <><circle cx="12" cy="8" r="5" /><path d="M8.2 12.5 7 22l5-3 5 3-1.2-9.5" /></>,
    download: <><path d="M12 3v12m0 0 4-4m-4 4-4-4" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></>,
    document: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M9 13h6M9 17h6" /></>,
    branch: <><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="9" r="3" /><path d="M18 12a6 6 0 0 1-6 6H6" /></>,
    lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
    unlock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 7.5-1.9" /></>,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>,
    eyeOff: <><path d="M9.9 5.2A9.7 9.7 0 0 1 12 5c6.5 0 10 7 10 7a13.2 13.2 0 0 1-2.4 3.1M6.1 6.1A13.3 13.3 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 4-.9M3 3l18 18M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>,
  };

  return (
    <svg {...common} aria-hidden="true">
      {paths[name] ?? null}
    </svg>
  );
}

export default App;
