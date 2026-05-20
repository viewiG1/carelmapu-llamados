import { supabase } from "../lib/supabase";
import { loadNominas } from "./nomina";

function mapAlumno(alumno) {
  return {
    origen: alumno.tipo,
    id_excel: alumno.id,
    rut: alumno.rut,
    dv: alumno.dv,
    nombres: alumno.nombres,
    apellido_paterno: alumno.apellidoPaterno,
    apellido_materno: alumno.apellidoMaterno,
    celular: alumno.celular,
    telefono_fijo: alumno.telefonoFijo,
    correo: alumno.correoElectronico,
    pais: alumno.pais,
    nacionalidad: alumno.nacionalidad,
    nivel_certificar: alumno.nivelACertificar,
    estado_tipo: alumno.estadoTipo,
    nombre_establecimiento: alumno.nombreEstablecimiento,
  };
}

export async function importarNominasASupabase() {
  const { laboral, continuidad } = await loadNominas();

  const alumnos = [...laboral, ...continuidad].map(mapAlumno);

  const { data, error } = await supabase
    .from("alumnos")
    .upsert(alumnos, {
      onConflict: "origen,rut,dv",
    })
    .select();

  if (error) {
    console.error("Error importando alumnos:", error);
    throw error;
  }

  console.log("Alumnos importados:", data.length);
  return data;
}