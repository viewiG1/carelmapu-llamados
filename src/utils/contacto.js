// Utilidades para contactar alumnos por WhatsApp (wa.me) y correo (Gmail).
// No requieren API ni cuenta Business: generan enlaces con el mensaje ya escrito
// y la persona solo tiene que presionar "enviar".

const viteEnv =
  typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {};

// Número al que se pide confirmar asistencia (aparece dentro del mensaje).
export const CONTACT_PHONE = viteEnv.VITE_CONTACT_PHONE || "+56 9 XXXX XXXX";

// Nombre del establecimiento para la firma del mensaje.
const ESTABLECIMIENTO =
  viteEnv.VITE_ESTABLECIMIENTO || "Colegio de Adultos Carelmapu de Conchalí";

// Convierte un celular chileno a formato internacional para wa.me (solo dígitos,
// con código de país 56 y sin "+"). Devuelve "" si no hay dígitos utilizables.
export function toWhatsappNumber(celular = "") {
  const digits = String(celular).replace(/\D/g, "");
  if (!digits) {
    return "";
  }
  if (digits.startsWith("569") && digits.length === 11) {
    return digits;
  }
  if (digits.startsWith("56") && digits.length === 11) {
    return digits;
  }
  if (digits.startsWith("9") && digits.length === 9) {
    return `56${digits}`;
  }
  if (digits.length === 8) {
    return `569${digits}`;
  }
  return digits;
}

function primerNombreDe(nombre = "") {
  return String(nombre).trim().split(/\s+/)[0] || "";
}

// Mensaje para WhatsApp: admite *negrita* y saltos de línea.
export function mensajeWhatsapp({ nombre = "", turnos = "" } = {}) {
  const primerNombre = primerNombreDe(nombre);
  const saludo = primerNombre ? `Hola ${primerNombre},` : "Hola,";
  const lineaExamen = turnos ? `\n\n*Su examen:* ${turnos}` : "";

  return (
    `${saludo}` +
    `\n\nLe escribimos del *${ESTABLECIMIENTO}*.` +
    lineaExamen +
    `\n\nPor favor *confirme su asistencia*:` +
    `\n- Respondiendo este mensaje` +
    `\n- O llamando al ${CONTACT_PHONE}` +
    `\n\nMuchas gracias.`
  );
}

// Cuerpo para correo (Gmail solo acepta texto): bien estructurado con
// saltos de línea, saludo, datos destacados, pasos y firma.
export function cuerpoCorreo({ nombre = "", turnos = "" } = {}) {
  const primerNombre = primerNombreDe(nombre);
  const saludo = primerNombre ? `Estimado/a ${primerNombre}:` : "Estimado/a:";
  const bloqueExamen = turnos
    ? `\n\nFecha y turno de su examen:\n${turnos}`
    : "";

  return (
    `${saludo}` +
    `\n\nLe saludamos cordialmente desde el ${ESTABLECIMIENTO}.` +
    `\n\nEl motivo de este correo es confirmar su asistencia a su examen.` +
    bloqueExamen +
    `\n\nLe pedimos por favor confirmar su asistencia:` +
    `\n   •  Respondiendo a este correo, o` +
    `\n   •  Llamando al ${CONTACT_PHONE}` +
    `\n\nSu participación es muy importante para nosotros.` +
    `\n\nAtentamente,` +
    `\n${ESTABLECIMIENTO}`
  );
}

// Enlace wa.me con el mensaje precargado. "" si el celular no sirve.
export function whatsappUrl(celular, mensaje) {
  const numero = toWhatsappNumber(celular);
  if (!numero) {
    return "";
  }
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}

// Enlace de redacción de Gmail con destinatario, asunto y cuerpo precargados.
export function gmailUrl(correo, asunto, cuerpo) {
  const destino = String(correo || "").trim();
  if (!destino) {
    return "";
  }
  const params = new URLSearchParams({
    view: "cm",
    fs: "1",
    to: destino,
    su: asunto,
    body: cuerpo,
  });
  return `https://mail.google.com/mail/?${params.toString()}`;
}

export const ASUNTO_CONFIRMACION =
  "Confirmación de asistencia a examen - Carelmapu";
