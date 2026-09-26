# Carelmapu Llamados

Aplicación en React + Vite para buscar alumnos por RUT, marcar llamado telefónico, elegir fecha de examen y exportar resultados.

## Requisitos

- Node.js 18 o superior
- Dos archivos Excel en `public/`:
  - `Nomina Laboral Carelmapu.xlsx`
  - `Nomina Continuidad Carelmapu.xlsx`

## Variables de entorno

Usa `.env` basado en `.env.example`:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
VITE_EXPORT_PASSWORD=
VITE_CONTACT_PHONE=
VITE_ESTABLECIMIENTO=
```

`VITE_*` se usa en la app del navegador.
`SUPABASE_*` se usa en el script de importación.

`VITE_EXPORT_PASSWORD` es la clave que protege la descarga (Excel/PDF) y la
revelación de datos personales en la tabla de registros. Si no se define, se usa
`carelmapu2026` por defecto. **Cámbiala en producción.**

> Nota de seguridad: esta clave vive en el navegador, así que es un disuasivo
> (evita descargas accidentales o miradas casuales), no una barrera infranqueable.
> Para seguridad real hay que proteger los datos en el servidor con políticas RLS
> de Supabase y autenticación.

`VITE_CONTACT_PHONE` es el número que aparece dentro del mensaje de confirmación
("...o llamando al X"). Ej: `+56 9 1234 5678`.

`VITE_ESTABLECIMIENTO` es el nombre del colegio que firma el mensaje. Por defecto
`Colegio de Adultos Carelmapu de Conchalí`.

## Contacto por WhatsApp y correo

En la ficha del alumno y en la tabla de registros hay botones de **WhatsApp** y
**correo** que abren un chat/redacción con el mensaje de confirmación ya escrito
(la persona solo presiona enviar):

- **WhatsApp**: usa enlaces `wa.me`. Funciona con número personal, sin cuenta
  Business ni API. Es semi-manual (un envío por persona), que además es lo más
  seguro para no arriesgar bloqueos por envío masivo automático.
- **Correo**: abre la redacción de Gmail (`mail.google.com`) con destinatario,
  asunto y cuerpo precargados, ideal para el Gmail institucional.

En la tabla, los botones de contacto solo se activan al desbloquear con la clave
(mismo criterio que la censura de datos personales).

## Instalar

```bash
npm install
```

## Ejecutar

```bash
npm run dev
```

## Verificar

```bash
npm run lint
npm run build
```

## Supabase

La app puede funcionar con Excel local o leer desde Supabase si la tabla `alumnos` ya está poblada.

### Tablas recomendadas

`alumnos`

- `id` uuid primary key
- `origen` text not null
- `id_excel` text
- `rut` text
- `dv` text
- `nombres` text
- `apellido_paterno` text
- `apellido_materno` text
- `celular` text
- `telefono_fijo` text
- `correo` text
- `pais` text
- `nacionalidad` text
- `nivel_certificar` text
- `estado_tipo` text
- `nombre_establecimiento` text
- unique `(origen, rut, dv)`

`seguimientos`

- `id` uuid primary key
- `origen` text not null
- `rut` text not null
- `dv` text not null
- `nombres` text
- `apellido_paterno` text
- `apellido_materno` text
- `llamado_por_telefono` boolean
- `fecha_examen` text
- `guardado` boolean
- unique `(origen, rut, dv)`

## Importar nóminas a Supabase

1. Crea las tablas.
2. Agrega las variables de entorno.
3. Ejecuta:

```bash
npm run import:nominas
```

Ese script lee los Excel locales, normaliza los campos y hace `upsert` en `alumnos`.

## Notas

- La app mantiene un modo local si Supabase no está configurado.
- El guardado intenta sincronizar con `seguimientos` y si falla, conserva el estado local.
