import { useEffect, useMemo, useState } from "react";
import {
  findAlumnoByRut,
  guardarSeguimientoAlumno,
  loadSeguimientos,
  loadNominas,
} from "./utils/nomina";
import { formatChileanMobile, formatRut, titleCase } from "./utils/rut";
import { getCountryFlagUrl, getCountryName } from "./utils/country";
import {
  ASUNTO_CONFIRMACION,
  cuerpoCorreo,
  gmailUrl,
  mensajeWhatsapp,
  whatsappUrl,
} from "./utils/contacto";

const TURNOS_EXAMEN_POR_DIA = [
  {
    dia: "Viernes 9 de octubre",
    turnos: [
      { id: "viernes-1700", hora: "17:00", cupo: 40 },
      { id: "viernes-1830", hora: "18:30", cupo: 40 },
    ],
  },
  {
    dia: "Sábado 10 de octubre",
    turnos: [
      { id: "sabado-0900", hora: "09:00", cupo: 300 },
      { id: "sabado-1300", hora: "13:00", cupo: 300 },
    ],
  },
  {
    dia: "Domingo 11 de octubre",
    turnos: [
      { id: "domingo-1300", hora: "13:00", cupo: 200 },
      { id: "domingo-1700", hora: "17:00", cupo: 300 },
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
  "carelmapu2026";

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
  const [modalLista, setModalLista] = useState(false);
  const [mostrarRegistros, setMostrarRegistros] = useState(false);
  const [registrosPagina, setRegistrosPagina] = useState(1);
  const [registrosPorPagina, setRegistrosPorPagina] = useState(10);
  const [registrosFiltro, setRegistrosFiltro] = useState("");
  const [registrosFiltroPrograma, setRegistrosFiltroPrograma] = useState("todos");
  const [registrosFiltroLlamado, setRegistrosFiltroLlamado] = useState("todos");
  const [registrosFiltroDia, setRegistrosFiltroDia] = useState("todos");
  const [registrosFiltroHorario, setRegistrosFiltroHorario] = useState("todos");
  const [listaFiltro, setListaFiltro] = useState("");
  const [listaOrden, setListaOrden] = useState({ campo: "nombre", dir: "asc" });
  const [listaPagina, setListaPagina] = useState(1);
  const [listaPorPagina, setListaPorPagina] = useState(100);

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

  const alumnoEnAmbosProgramas = Boolean(alumnoEncontrado?.ambos);

  // Si está en ambos programas y aún no eligió, se muestra Laboral por defecto
  // (el usuario puede cambiar con el conmutador, sin volver a buscar el RUT).
  const tipoEfectivo = alumnoEnAmbosProgramas
    ? tipoSeleccionado || "laboral"
    : tipoSeleccionado;

  const rutSeleccionado = alumnoEncontrado
    ? alumnoEncontrado.ambos
      ? alumnoEncontrado[tipoEfectivo]?.rutCompleto ?? ""
      : alumnoEncontrado.rutCompleto ?? ""
    : "";

  const alumnoActual = alumnoEncontrado
    ? alumnoEncontrado.ambos
      ? alumnoEncontrado[tipoEfectivo]
      : alumnoEncontrado
    : null;

  const seguimientoActual = useMemo(() => {
    if (!alumnoActual) {
      return null;
    }

    const exacto = seguimientosDb.find(
      (seguimiento) =>
        seguimiento.origen === alumnoActual.tipo &&
        seguimiento.rut === alumnoActual.rut &&
        seguimiento.dv === alumnoActual.dv,
    );

    if (exacto) {
      return exacto;
    }

    // Si el alumno está en ambos programas, reutiliza el seguimiento del otro
    // programa para que se muestre lo mismo (llamado y día) sin repetir.
    if (alumnoEnAmbosProgramas) {
      return (
        seguimientosDb.find(
          (seguimiento) =>
            seguimiento.rut === alumnoActual.rut &&
            seguimiento.dv === alumnoActual.dv,
        ) ?? null
      );
    }

    return null;
  }, [alumnoActual, seguimientosDb, alumnoEnAmbosProgramas]);

  const totalLlamados = useMemo(
    () =>
      seguimientosDb.filter(
        (seguimiento) => Boolean(seguimiento.llamado_por_telefono),
      ).length,
    [seguimientosDb],
  );

  const ocupacionPorTurno = useMemo(() => {
    const conteo = {};
    const personasPorTurno = {};
    for (const turno of TURNOS_EXAMEN) {
      conteo[turno.id] = 0;
      personasPorTurno[turno.id] = new Set();
    }

    for (const seguimiento of seguimientosDb) {
      // Un alumno en ambos programas tiene el mismo rut+dv: se cuenta una vez
      // por turno para no duplicar el cupo.
      const persona = `${seguimiento.rut}|${seguimiento.dv}`;
      for (const turnoId of turnosDesdeTexto(seguimiento.fecha_examen)) {
        if (conteo[turnoId] != null && !personasPorTurno[turnoId].has(persona)) {
          personasPorTurno[turnoId].add(persona);
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
          celular: alumno?.celular || "",
          correo: alumno?.correoElectronico || "",
          llamadoPorTelefono: seguimiento.llamado_por_telefono ? "Sí" : "No",
          turnosExamen: seguimiento.fecha_examen || "",
          fechaExamen: seguimiento.fecha_examen || "",
          guardado: "Sí",
        };
      });
  }, [seguimientosDb, alumnos]);

  const alumnosContactoLista = useMemo(() => {
    const segByKey = new Map(
      seguimientosDb.map((seguimiento) => [
        `${seguimiento.origen}|${seguimiento.rut}|${seguimiento.dv}`,
        seguimiento,
      ]),
    );

    return alumnos.map((alumno) => {
      const key = `${alumno.tipo}|${alumno.rut}|${alumno.dv}`;
      const seguimiento = segByKey.get(key);
      const nombre = `${titleCase(alumno.nombres)} ${titleCase(
        alumno.apellidoPaterno,
      )} ${titleCase(alumno.apellidoMaterno)}`
        .replace(/\s+/g, " ")
        .trim();

      return {
        key,
        nombre,
        rut: formatRut(alumno.rut, alumno.dv),
        rutRaw: alumno.rut,
        tipo: alumno.tipo === "laboral" ? "Laboral" : "Continuidad",
        celular: alumno.celular,
        correo: alumno.correoElectronico,
        turnos: seguimiento?.fecha_examen || "",
        contactado: Boolean(seguimiento?.llamado_por_telefono),
      };
    });
  }, [alumnos, seguimientosDb]);

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
      // Si el alumno está en ambos programas, se guarda lo mismo en los dos
      // (laboral y continuidad) para indicar el mismo llamado y día una sola vez.
      const objetivos =
        alumnoEnAmbosProgramas && alumnoEncontrado
          ? [alumnoEncontrado.laboral, alumnoEncontrado.continuidad]
          : alumnoActual
            ? [alumnoActual]
            : [];

      for (const objetivo of objetivos) {
        const saved = await guardarSeguimientoAlumno(objetivo, {
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
      setMensajeAccion(
        alumnoEnAmbosProgramas
          ? "Datos guardados en ambos programas con éxito."
          : "Datos guardados con éxito.",
      );
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
          "Nivel a certificar": registro.periodoCertificacion,
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
      lines.push(`Nivel a certificar: ${registro.periodoCertificacion || "Sin dato"}`);
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
    } else if (accion === "lista") {
      setModalLista(true);
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

  const nivelDe = (alumno) =>
    String(alumno?.nivelACertificar || "").replace(/\s+/g, " ").trim();

  const iniciales = alumnoActual
    ? getInitials(alumnoActual.nombres, alumnoActual.apellidoPaterno)
    : "";

  const progreso = alumnos.length
    ? Math.min(100, Math.round((totalLlamados / alumnos.length) * 100))
    : 0;

  const puedeGuardar = Boolean(llamoPorTelefono && fechaExamen);
  const mensajeEsError = mensajeAccion && !/(éxito|exportad)/i.test(mensajeAccion);

  const horariosDisponibles =
    registrosFiltroDia === "todos"
      ? TURNOS_EXAMEN
      : TURNOS_EXAMEN.filter((turno) => turno.dia === registrosFiltroDia);

  const registrosQuery = registrosFiltro.trim().toLowerCase();
  const registrosSoloDigitos = registrosQuery.replace(/\D/g, "");
  const registrosFiltrados = registrosGuardados.filter((registro) => {
    if (
      registrosFiltroPrograma !== "todos" &&
      registro.tipo.toLowerCase() !== registrosFiltroPrograma
    ) {
      return false;
    }

    if (registrosFiltroLlamado !== "todos") {
      const llamado = registro.llamadoPorTelefono === "Sí";
      if (registrosFiltroLlamado === "si" && !llamado) {
        return false;
      }
      if (registrosFiltroLlamado === "no" && llamado) {
        return false;
      }
    }

    if (registrosFiltroDia !== "todos" || registrosFiltroHorario !== "todos") {
      const turnoIds = turnosDesdeTexto(
        registro.turnosExamen || registro.fechaExamen,
      );

      if (registrosFiltroHorario !== "todos") {
        if (!turnoIds.includes(registrosFiltroHorario)) {
          return false;
        }
      } else if (registrosFiltroDia !== "todos") {
        const enDia = turnoIds.some((id) => {
          const turno = TURNOS_EXAMEN.find((item) => item.id === id);
          return turno?.dia === registrosFiltroDia;
        });
        if (!enDia) {
          return false;
        }
      }
    }

    if (!registrosQuery) {
      return true;
    }

    const nombreMatch = registro.nombres.toLowerCase().includes(registrosQuery);
    const rutDigits = registro.rut.replace(/\D/g, "");
    const rutMatch =
      registro.rut.toLowerCase().includes(registrosQuery) ||
      (registrosSoloDigitos && rutDigits.includes(registrosSoloDigitos));

    return nombreMatch || rutMatch;
  });

  const registrosTotal = registrosFiltrados.length;
  const registrosTodos = registrosPorPagina === 0;
  const registrosTotalPaginas = registrosTodos
    ? 1
    : Math.max(1, Math.ceil(registrosTotal / registrosPorPagina));
  const registrosPaginaActual = Math.min(registrosPagina, registrosTotalPaginas);
  const registrosInicio = registrosTodos
    ? 0
    : (registrosPaginaActual - 1) * registrosPorPagina;
  const registrosPaginados = registrosTodos
    ? registrosFiltrados
    : registrosFiltrados.slice(
        registrosInicio,
        registrosInicio + registrosPorPagina,
      );

  const listaContactados = alumnosContactoLista.filter(
    (item) => item.contactado,
  ).length;
  const listaPendientes = alumnosContactoLista.length - listaContactados;
  const listaQuery = listaFiltro.trim().toLowerCase();
  const listaSoloDigitos = listaQuery.replace(/\D/g, "");
  const listaFiltrada = listaQuery
    ? alumnosContactoLista.filter(
        (item) =>
          item.nombre.toLowerCase().includes(listaQuery) ||
          item.rut.toLowerCase().includes(listaQuery) ||
          (listaSoloDigitos && item.rutRaw.includes(listaSoloDigitos)),
      )
    : alumnosContactoLista;

  const listaOrdenada = [...listaFiltrada].sort((a, b) => {
    const factor = listaOrden.dir === "asc" ? 1 : -1;
    let comp;

    if (listaOrden.campo === "estado") {
      comp = Number(a.contactado) - Number(b.contactado);
    } else if (listaOrden.campo === "tipo") {
      comp = a.tipo.localeCompare(b.tipo, "es");
    } else if (listaOrden.campo === "rut") {
      comp = a.rutRaw.localeCompare(b.rutRaw, "es", { numeric: true });
    } else {
      comp = a.nombre.localeCompare(b.nombre, "es");
    }

    if (comp === 0 && listaOrden.campo !== "nombre") {
      comp = a.nombre.localeCompare(b.nombre, "es");
    }

    return comp * factor;
  });

  const listaTotal = listaOrdenada.length;
  const totalPaginas = Math.max(1, Math.ceil(listaTotal / listaPorPagina));
  const paginaActual = Math.min(listaPagina, totalPaginas);
  const listaInicio = (paginaActual - 1) * listaPorPagina;
  const listaPaginada = listaOrdenada.slice(
    listaInicio,
    listaInicio + listaPorPagina,
  );

  const cambiarOrden = (campo) => {
    setListaOrden((prev) =>
      prev.campo === campo
        ? { campo, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { campo, dir: "asc" },
    );
    setListaPagina(1);
  };

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
          <div className="mt-2.5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">
              Acepta el RUT con o sin puntos y guion. La búsqueda es instantánea.
            </p>
            <button
              type="button"
              onClick={() => solicitarClave("lista")}
              className="btn btn-soft !py-2.5"
            >
              <Icon name={desbloqueado ? "users" : "lock"} size={16} />
              Lista de contacto de alumnos
            </button>
          </div>

          {/* Aviso: alumno en ambos programas (la ficha aparece abajo con el
              conmutador para cambiar entre Laboral y Continuidad). */}
          {alumnoEnAmbosProgramas ? (
            <div className="mt-6 flex items-center gap-2 rounded-2xl border border-cyan-400/25 bg-cyan-400/[0.06] px-5 py-3.5 text-sm text-cyan-100 fade-in-up">
              <Icon name="branch" size={16} />
              <span>
                Alumno inscrito en <b>ambos programas</b>. Abajo puedes cambiar
                entre Laboral y Continuidad; lo que guardes se aplica a los dos.
              </span>
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

              {alumnoEnAmbosProgramas ? (
                <div className="mt-4">
                  <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                    Programa que estás viendo
                  </div>
                  <div className="inline-flex rounded-xl border border-white/10 bg-slate-950/40 p-1">
                    {[
                      { val: "laboral", label: "Laboral" },
                      { val: "continuidad", label: "Continuidad" },
                    ].map(({ val, label }) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setTipoSeleccionado(val)}
                        data-active={tipoEfectivo === val}
                        className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
                          tipoEfectivo === val
                            ? "bg-cyan-400/15 text-cyan-100"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="my-6 h-px bg-white/10" />

              <div className="grid gap-3 sm:grid-cols-2">
                <ProgramaNivelCard
                  programa={tipoDisplay}
                  nivel={periodoCertificacion}
                  otro={
                    alumnoEnAmbosProgramas
                      ? {
                          programa:
                            tipoEfectivo === "laboral" ? "Continuidad" : "Laboral",
                          nivel: nivelDe(
                            alumnoEncontrado[
                              tipoEfectivo === "laboral" ? "continuidad" : "laboral"
                            ],
                          ),
                        }
                      : null
                  }
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

              <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-white">
                    Contactar para confirmar asistencia
                  </div>
                  <div className="mt-0.5 text-xs text-slate-400">
                    Abre WhatsApp con el mensaje ya escrito.
                  </div>
                </div>
                <ContactActions
                  nombre={alumnoVisible}
                  turnos={fechaExamen}
                  celular={alumnoActual.celular}
                  correo={alumnoActual.correoElectronico}
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

                {alumnoEnAmbosProgramas ? (
                  <p className="mt-4 flex items-start gap-2 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.06] px-3.5 py-2.5 text-xs text-cyan-100/90">
                    <Icon name="branch" size={14} />
                    Este alumno está en ambos programas. El llamado y el día se
                    guardarán igual para Laboral y Continuidad.
                  </p>
                ) : null}

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
              <div className="flex items-center gap-2">
                {mostrarRegistros ? (
                  <button
                    type="button"
                    onClick={alternarRevelar}
                    className="btn btn-ghost !py-2 !px-3.5 text-xs"
                  >
                    <Icon name={desbloqueado ? "eyeOff" : "eye"} size={15} />
                    {desbloqueado ? "Ocultar datos" : "Mostrar datos"}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setMostrarRegistros((prev) => !prev)}
                  className="btn btn-soft !py-2 !px-3.5 text-xs"
                >
                  <Icon
                    name={mostrarRegistros ? "chevronUp" : "chevronDown"}
                    size={15}
                  />
                  {mostrarRegistros ? "Ocultar registros" : "Ver registros"}
                </button>
              </div>
            </div>
            {mostrarRegistros && !desbloqueado ? (
              <p className="mb-4 flex items-center gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-3.5 py-2.5 text-xs text-amber-200/90">
                <Icon name="lock" size={14} />
                Información personal censurada. Ingresa la clave para ver nombres y
                RUT completos.
              </p>
            ) : null}
            {mostrarRegistros ? (
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <div className="relative flex-1 sm:min-w-[240px]">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">
                    <Icon name="search" size={16} />
                  </span>
                  <input
                    type="text"
                    value={registrosFiltro}
                    onChange={(event) => {
                      setRegistrosFiltro(event.target.value);
                      setRegistrosPagina(1);
                    }}
                    placeholder="Buscar por nombre o RUT…"
                    className="search-field !py-3 !pl-11 !text-sm"
                    autoComplete="off"
                  />
                </div>
                <select
                  value={registrosFiltroPrograma}
                  onChange={(event) => {
                    setRegistrosFiltroPrograma(event.target.value);
                    setRegistrosPagina(1);
                  }}
                  className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-3 text-sm font-medium text-white outline-none focus:border-cyan-400"
                >
                  <option value="todos">Todos los programas</option>
                  <option value="laboral">Laboral</option>
                  <option value="continuidad">Continuidad</option>
                </select>
                <select
                  value={registrosFiltroLlamado}
                  onChange={(event) => {
                    setRegistrosFiltroLlamado(event.target.value);
                    setRegistrosPagina(1);
                  }}
                  className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-3 text-sm font-medium text-white outline-none focus:border-cyan-400"
                >
                  <option value="todos">Llamado: todos</option>
                  <option value="si">Llamado: sí</option>
                  <option value="no">Llamado: no</option>
                </select>
                <select
                  value={registrosFiltroDia}
                  onChange={(event) => {
                    setRegistrosFiltroDia(event.target.value);
                    setRegistrosFiltroHorario("todos");
                    setRegistrosPagina(1);
                  }}
                  className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-3 text-sm font-medium text-white outline-none focus:border-cyan-400"
                >
                  <option value="todos">Todos los días</option>
                  {TURNOS_EXAMEN_POR_DIA.map((grupo) => (
                    <option key={grupo.dia} value={grupo.dia}>
                      {grupo.dia}
                    </option>
                  ))}
                </select>
                <select
                  value={registrosFiltroHorario}
                  onChange={(event) => {
                    setRegistrosFiltroHorario(event.target.value);
                    setRegistrosPagina(1);
                  }}
                  disabled={registrosFiltroDia === "todos"}
                  title={
                    registrosFiltroDia === "todos"
                      ? "Selecciona un día para habilitar los horarios"
                      : undefined
                  }
                  className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-3 text-sm font-medium text-white outline-none focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <option value="todos">
                    {registrosFiltroDia === "todos"
                      ? "Elige un día primero"
                      : "Todos los horarios"}
                  </option>
                  {registrosFiltroDia === "todos"
                    ? null
                    : horariosDisponibles.map((turno) => (
                        <option key={turno.id} value={turno.id}>
                          {turno.hora}
                        </option>
                      ))}
                </select>
              </div>
            ) : null}
            {mostrarRegistros ? (
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
                  {registrosPaginados.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="rounded-xl bg-white/[0.03] px-3 py-8 text-center text-slate-400"
                      >
                        No hay registros que coincidan con la búsqueda.
                      </td>
                    </tr>
                  ) : null}
                  {registrosPaginados.map((registro, index) => (
                    <tr
                      key={`${registro.rut}-${registrosInicio + index}`}
                      className="text-slate-200"
                    >
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
                      <td className="rounded-r-xl bg-white/[0.03] px-3 py-3">
                        <TurnosBadges
                          texto={registro.turnosExamen || registro.fechaExamen}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            ) : null}
            {mostrarRegistros ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3 text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <span>Mostrar</span>
                  <select
                    value={registrosPorPagina}
                    onChange={(event) => {
                      setRegistrosPorPagina(Number(event.target.value));
                      setRegistrosPagina(1);
                    }}
                    className="rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1.5 font-medium text-white outline-none focus:border-cyan-400"
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={0}>Todos</option>
                  </select>
                  <span>por página</span>
                </div>

                <div className="flex items-center gap-3">
                  <span>
                    {registrosTotal === 0
                      ? "0 registros"
                      : registrosTodos
                        ? `${registrosTotal} de ${registrosTotal}`
                        : `${registrosInicio + 1}–${Math.min(
                            registrosInicio + registrosPorPagina,
                            registrosTotal,
                          )} de ${registrosTotal}`}
                  </span>
                  {!registrosTodos ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          setRegistrosPagina(Math.max(1, registrosPaginaActual - 1))
                        }
                        disabled={registrosPaginaActual <= 1}
                        className="icon-btn !h-9 !w-9 disabled:opacity-35"
                        aria-label="Página anterior"
                      >
                        <Icon name="chevronLeft" size={16} />
                      </button>
                      <span className="min-w-[64px] text-center font-medium text-slate-200">
                        {registrosPaginaActual} / {registrosTotalPaginas}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setRegistrosPagina(
                            Math.min(registrosTotalPaginas, registrosPaginaActual + 1),
                          )
                        }
                        disabled={registrosPaginaActual >= registrosTotalPaginas}
                        className="icon-btn !h-9 !w-9 disabled:opacity-35"
                        aria-label="Página siguiente"
                      >
                        <Icon name="chevronRight" size={16} />
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
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
                    : accionPendiente === "lista"
                      ? "Ingresa la clave para ver la lista de contacto."
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

      {/* ===================== Modal lista de contacto ===================== */}
      {modalLista ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/75 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => setModalLista(false)}
          role="presentation"
        >
          <div
            className="glass flex max-h-[90vh] w-full max-w-4xl flex-col p-5 fade-in-up sm:p-6"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Lista de contacto de alumnos"
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-white">
                  Lista de contacto de alumnos
                </h3>
                <p className="mt-0.5 text-xs text-slate-400">
                  Los alumnos ya contactados quedan bloqueados. Envía WhatsApp a
                  los pendientes.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalLista(false)}
                className="icon-btn"
                aria-label="Cerrar"
                title="Cerrar"
              >
                <Icon name="close" size={18} />
              </button>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="badge badge-muted">
                {alumnosContactoLista.length} en total
              </span>
              <span className="badge badge-ok">{listaContactados} contactados</span>
              <span className="badge badge-warn">{listaPendientes} pendientes</span>
            </div>

            <div className="relative mb-3">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">
                <Icon name="search" size={16} />
              </span>
              <input
                type="text"
                value={listaFiltro}
                onChange={(event) => {
                  setListaFiltro(event.target.value);
                  setListaPagina(1);
                }}
                placeholder="Filtrar por nombre o RUT…"
                className="search-field !py-3 !pl-11 !text-sm"
                autoComplete="off"
              />
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[560px] border-separate border-spacing-y-1.5 text-sm">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <SortHeader label="Alumno" campo="nombre" orden={listaOrden} onSort={cambiarOrden} />
                    <SortHeader label="RUT" campo="rut" orden={listaOrden} onSort={cambiarOrden} />
                    <SortHeader label="Programa" campo="tipo" orden={listaOrden} onSort={cambiarOrden} />
                    <SortHeader label="Estado" campo="estado" orden={listaOrden} onSort={cambiarOrden} />
                    <th className="bg-slate-950/80 px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-400 backdrop-blur">
                      Contacto
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {listaPaginada.length ? (
                    listaPaginada.map((item) => (
                      <tr key={item.key} className="text-slate-200">
                        <td className="rounded-l-xl bg-white/[0.03] px-3 py-2.5 font-medium text-white">
                          {item.nombre || "—"}
                        </td>
                        <td className="bg-white/[0.03] px-3 py-2.5 text-slate-300">
                          {item.rut}
                        </td>
                        <td className="bg-white/[0.03] px-3 py-2.5">
                          <span className="badge badge-muted">{item.tipo}</span>
                        </td>
                        <td className="bg-white/[0.03] px-3 py-2.5">
                          {item.contactado ? (
                            <span className="badge badge-ok">
                              <Icon name="check" size={12} />
                              Contactado
                            </span>
                          ) : (
                            <span className="badge badge-warn">Pendiente</span>
                          )}
                        </td>
                        <td className="rounded-r-xl bg-white/[0.03] px-3 py-2.5">
                          <div className="flex justify-end">
                            <ContactActions
                              nombre={item.nombre}
                              turnos={item.turnos}
                              celular={item.celular}
                              correo={item.correo}
                              disabled={item.contactado}
                              size={16}
                            />
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={5}
                        className="rounded-xl bg-white/[0.03] px-3 py-8 text-center text-slate-400"
                      >
                        No hay alumnos que coincidan con el filtro.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <span>Mostrar</span>
                <select
                  value={listaPorPagina}
                  onChange={(event) => {
                    setListaPorPagina(Number(event.target.value));
                    setListaPagina(1);
                  }}
                  className="rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1.5 font-medium text-white outline-none focus:border-cyan-400"
                >
                  <option value={10}>10</option>
                  <option value={100}>100</option>
                  <option value={500}>500</option>
                </select>
                <span>por página</span>
              </div>

              <div className="flex items-center gap-3">
                <span>
                  {listaTotal === 0
                    ? "0 resultados"
                    : `${listaInicio + 1}–${Math.min(
                        listaInicio + listaPorPagina,
                        listaTotal,
                      )} de ${listaTotal}`}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setListaPagina(Math.max(1, paginaActual - 1))}
                    disabled={paginaActual <= 1}
                    className="icon-btn !h-9 !w-9 disabled:opacity-35"
                    aria-label="Página anterior"
                  >
                    <Icon name="chevronLeft" size={16} />
                  </button>
                  <span className="min-w-[64px] text-center font-medium text-slate-200">
                    {paginaActual} / {totalPaginas}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setListaPagina(Math.min(totalPaginas, paginaActual + 1))
                    }
                    disabled={paginaActual >= totalPaginas}
                    className="icon-btn !h-9 !w-9 disabled:opacity-35"
                    aria-label="Página siguiente"
                  >
                    <Icon name="chevronRight" size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TurnosBadges({ texto }) {
  const turnos = turnosSeleccionadosPorIds(turnosDesdeTexto(texto));
  const items = turnos.length
    ? turnos.map((turno) => ({ dia: turno.dia, hora: turno.hora }))
    : String(texto || "")
        .split("·")
        .map((parte) => parte.trim())
        .filter(Boolean)
        .map((etiqueta) => ({ dia: etiqueta, hora: "" }));

  if (!items.length) {
    return <span className="text-slate-500">—</span>;
  }

  return (
    <div className="flex flex-col gap-1.5">
      {items.map((item, index) => (
        <span
          key={`${item.dia}-${item.hora}-${index}`}
          className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-cyan-400/20 bg-cyan-400/[0.06] px-2.5 py-1"
        >
          <Icon name="clock" size={12} />
          {item.hora ? (
            <span className="text-sm font-semibold text-white">{item.hora}</span>
          ) : null}
          <span className="text-xs text-slate-300">{item.dia}</span>
        </span>
      ))}
    </div>
  );
}

function SortHeader({ label, campo, orden, onSort }) {
  const activo = orden.campo === campo;

  return (
    <th className="bg-slate-950/80 px-3 py-2 text-left backdrop-blur">
      <button
        type="button"
        onClick={() => onSort(campo)}
        className={`inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider transition ${
          activo ? "text-cyan-200" : "text-slate-400 hover:text-slate-200"
        }`}
      >
        {label}
        <span className={activo ? "opacity-100" : "opacity-30"}>
          <Icon
            name={activo && orden.dir === "desc" ? "chevronDown" : "chevronUp"}
            size={13}
          />
        </span>
      </button>
    </th>
  );
}

// Correo desactivado temporalmente. Cambiar a true para volver a mostrar el
// botón de Gmail junto al de WhatsApp.
const GMAIL_HABILITADO = false;

function ContactActions({
  nombre,
  turnos,
  celular,
  correo,
  disabled = false,
  size = 18,
}) {
  const wa = whatsappUrl(celular, mensajeWhatsapp({ nombre, turnos }));
  const mail = gmailUrl(
    correo,
    ASUNTO_CONFIRMACION,
    cuerpoCorreo({ nombre, turnos }),
  );
  const waDisabled = disabled || !wa;
  const mailDisabled = disabled || !mail;

  return (
    <div className="flex items-center gap-2">
      <a
        className={`icon-btn icon-btn-wa ${waDisabled ? "is-disabled" : ""}`}
        href={waDisabled ? undefined : wa}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Enviar WhatsApp"
        title={
          disabled
            ? "Desbloquea para contactar"
            : wa
              ? "Enviar WhatsApp"
              : "Sin celular registrado"
        }
      >
        <Icon name="whatsapp" size={size} />
      </a>
      {GMAIL_HABILITADO ? (
        <a
          className={`icon-btn icon-btn-mail ${mailDisabled ? "is-disabled" : ""}`}
          href={mailDisabled ? undefined : mail}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Enviar correo"
          title={
            disabled
              ? "Desbloquea para contactar"
              : mail
                ? "Enviar correo"
                : "Sin correo registrado"
          }
        >
          <Icon name="mail" size={size} />
        </a>
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

// Separa "2°Nivel Media (3° a 4°)" en "2° Nivel Media" y "3° a 4°".
function partesNivel(nivel = "") {
  const texto = String(nivel).replace(/°\s*/g, "° ").replace(/\s+/g, " ").trim();
  const match = texto.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  return match
    ? { nombre: match[1].trim(), cursos: match[2].trim() }
    : { nombre: texto, cursos: "" };
}

// Bloque principal: qué programa y qué nivel certifica el alumno, juntos y
// rotulados para que no haya dudas de a qué programa corresponde el nivel.
function ProgramaNivelCard({ programa, nivel, otro = null }) {
  const { nombre, cursos } = partesNivel(nivel);

  return (
    <div className="rounded-2xl border border-cyan-400/30 bg-cyan-400/[0.08] p-5 sm:col-span-2">
      <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:gap-8">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            <span className="text-cyan-300">
              <Icon name="branch" />
            </span>
            Programa
          </div>
          <div className="mt-1.5 text-2xl font-bold text-white">
            {programa || "Sin dato"}
          </div>
        </div>
        <div className="sm:border-l sm:border-white/10 sm:pl-8">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            <span className="text-cyan-300">
              <Icon name="award" />
            </span>
            Nivel a certificar
          </div>
          <div className="mt-1.5 text-2xl font-bold text-white">
            {nombre || "Sin dato"}
          </div>
          {cursos ? (
            <div className="mt-0.5 text-sm text-cyan-100/80">Cursos {cursos}</div>
          ) : null}
        </div>
      </div>
      {otro ? (
        <div className="mt-4 border-t border-white/10 pt-3 text-sm text-slate-300">
          También inscrito en <b className="text-white">{otro.programa}</b>:{" "}
          {otro.nivel ? partesNivel(otro.nivel).nombre : "sin nivel"}
          {otro.nivel && partesNivel(otro.nivel).cursos
            ? ` (cursos ${partesNivel(otro.nivel).cursos})`
            : ""}
        </div>
      ) : null}
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
  const filled = name === "whatsapp";
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: filled ? "currentColor" : "none",
    stroke: filled ? "none" : "currentColor",
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
    whatsapp: <path d="M12 3a9 9 0 0 0-7.7 13.6L3 21l4.5-1.2A9 9 0 1 0 12 3Zm-3.3 5c.2 0 .3 0 .5.4l.7 1.6c.1.2 0 .4-.1.5l-.5.6c-.1.2-.2.3 0 .6a7 7 0 0 0 3 2.6c.3.1.4 0 .6-.1l.6-.7c.2-.2.3-.2.5-.1l1.6.8c.2.1.3.2.3.4 0 .8-.6 1.5-1.3 1.6-.6.1-1.3.2-3.4-.7a8 8 0 0 1-3.9-4c-.3-.7-.5-1.5-.5-2.1 0-.9.5-1.5 1.1-1.6h.5Z" />,
    close: <path d="M18 6 6 18M6 6l12 12" />,
    chevronUp: <path d="m6 15 6-6 6 6" />,
    chevronDown: <path d="m6 9 6 6 6-6" />,
    chevronLeft: <path d="m15 18-6-6 6-6" />,
    chevronRight: <path d="m9 18 6-6-6-6" />,
  };

  return (
    <svg {...common} aria-hidden="true">
      {paths[name] ?? null}
    </svg>
  );
}

export default App;
