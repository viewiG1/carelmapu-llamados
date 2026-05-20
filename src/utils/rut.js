export function normalizeText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function normalizeRut(value = "") {
  return String(value).replace(/[^0-9kK]/g, "").toUpperCase();
}

export function formatRut(body = "", dv = "") {
  const cleanBody = normalizeRut(body);
  const cleanDv = normalizeRut(dv);

  if (!cleanBody) {
    return "";
  }

  const formattedBody = cleanBody.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return cleanDv ? `${formattedBody}-${cleanDv}` : formattedBody;
}

export function titleCase(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .trim()
    .normalize("NFC")
    .toLocaleLowerCase("es")
    .split(" ")
    .map((word) =>
      word ? word[0].toLocaleUpperCase("es") + word.slice(1) : "",
    )
    .join(" ");
}

export function formatChileanMobile(value = "") {
  const digits = String(value).replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  if (digits.startsWith("569") && digits.length === 11) {
    return `+56 9 ${digits.slice(3)}`;
  }

  if (digits.startsWith("9") && digits.length === 9) {
    return `+56 9 ${digits.slice(1)}`;
  }

  return value ? String(value).trim() : "";
}
