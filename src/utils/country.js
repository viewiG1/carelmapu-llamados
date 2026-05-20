import { titleCase } from "./rut";

const COUNTRY_CODES = {
  CHILE: "cl",
  VENEZUELA: "ve",
  PERU: "pe",
  PERÚ: "pe",
  HAITI: "ht",
  HAITÍ: "ht",
  COLOMBIA: "co",
  ECUADOR: "ec",
  BOLIVIA: "bo",
  ARGENTINA: "ar",
  PARAGUAY: "py",
  URUGUAY: "uy",
  BRASIL: "br",
  CUBA: "cu",
  MEXICO: "mx",
  MÉXICO: "mx",
  CANADA: "ca",
  CANADÁ: "ca",
  CHINA: "cn",
};

export function getCountryCode(country = "") {
  const normalized = String(country)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();

  return COUNTRY_CODES[normalized] ?? "";
}

export function getCountryName(country = "") {
  const cleanCountry = titleCase(country);
  return cleanCountry || "Sin dato";
}

export function getCountryFlagUrl(country = "") {
  const code = getCountryCode(country);

  if (!code) {
    return "";
  }

  return `https://flagcdn.com/w40/${code}.png`;
}
