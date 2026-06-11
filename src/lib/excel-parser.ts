import * as XLSX from "xlsx";

export interface ExcelImportRow {
  subsecretaria: string;
  area: string;
  responsable: string;
  cuit: string;
  dni: string;
  apellido_nombre: string;
  fecha_nacimiento: string | null;
  cbu: string | null;
  tarjeta_activa_nro: string | null;
  telefono: string | null;
  email: string | null;
  nacionalidad: string | null;
  codigo_postal: string | null;
  provincia: string | null;
  departamento: string | null;
  localidad: string | null;
  barrio: string | null;
  calle: string | null;
  nro: string | null;
  piso: string | null;
  depto: string | null;
  lote: string | null;
  manzana: string | null;
  importe_mensual: number;
  importe_tarjeta_activa: number;
  importe_total: number;
}

export interface ValidationError {
  row: number;
  field: string;
  message: string;
  severity: "error" | "warning";
}

export interface ParseResult {
  data: ExcelImportRow[];
  errors: ValidationError[];
  summary: {
    totalRows: number;
    validRows: number;
    errorRows: number;
    totalAmount: number;
  };
}

// Convert Excel serial date to string (YYYY-MM-DD)
function parseExcelDate(value: any): string | null {
  if (!value) return null;
  
  if (value instanceof Date) {
    return value.toISOString().split("T")[0];
  }

  if (typeof value === "number") {
    // Excel base date is Dec 30, 1899 (due to Leap Year bug in Lotus 1-2-3)
    const date = new Date((value - 25569) * 86400 * 1000);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split("T")[0];
    }
  }

  if (typeof value === "string") {
    // Check YYYY-MM-DD or DD/MM/YYYY
    const cleanStr = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleanStr)) {
      return cleanStr;
    }
    const parts = cleanStr.split(/[-/]/);
    if (parts.length === 3) {
      if (parts[2].length === 4) {
        // DD/MM/YYYY
        return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
      } else if (parts[0].length === 4) {
        // YYYY/MM/DD
        return `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
      }
    }
  }

  return null;
}

// Clean document strings (remove dots, dashes, spaces)
function cleanDocString(value: any): string {
  if (!value) return "";
  return String(value).replace(/[^0-9]/g, "");
}

export async function parsePeopleExcel(
  file: File,
  type: "becarios" | "monotributistas"
): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) {
          reject(new Error("No se pudo leer el archivo"));
          return;
        }

        const workbook = XLSX.read(data, { type: "binary", cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert sheet to array of arrays
        const rows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });
        
        if (rows.length < 2) {
          resolve({
            data: [],
            errors: [{ row: 0, field: "archivo", message: "El archivo está vacío o no tiene el formato correcto", severity: "error" }],
            summary: { totalRows: 0, validRows: 0, errorRows: 0, totalAmount: 0 }
          });
          return;
        }

        // Header mapping
        // We know Row 0 contains title info, Row 1 contains the headers
        const headers = rows[1]?.map(h => String(h || "").trim()) || [];
        
        // Find positions of key columns
        const colIndices = {
          subsecretaria: headers.indexOf("subsecretaria"),
          area: headers.indexOf("area"),
          responsable: headers.indexOf("responsable"),
          cuit: headers.indexOf("CUIT"),
          dni: headers.indexOf("DNI"),
          apellido_nombre: headers.indexOf("APELLIDO_NOMBRE"),
          fecha_nacimiento: headers.indexOf("FECHA NAC."),
          cbu: headers.indexOf("CBU"),
          tarjeta_activa_nro: headers.indexOf("TAR ACT."),
          telefono: headers.indexOf("TELÉFONO"),
          email: headers.indexOf("EMAIL"),
          nacionalidad: headers.indexOf("nacionalidad"),
          codigo_postal: headers.indexOf("codigo postal"),
          provincia: headers.indexOf("provincia"),
          departamento: headers.indexOf("DEPARTAMENTO"),
          localidad: headers.indexOf("LOCALIDAD"),
          barrio: headers.indexOf("BARRIO"),
          calle: headers.indexOf("CALLE"),
          nro: headers.indexOf("NRO"),
          piso: headers.indexOf("PISO"),
          depto: headers.indexOf("DEPTO"),
          lote: headers.indexOf("LOTE"),
          manzana: headers.indexOf("MANZANA"),
          importe_mensual: headers.findIndex(h => h.startsWith("IMPORTE MENSUAL")),
          importe_tarjeta_activa: headers.indexOf("importe tarjeta activa")
        };

        // Basic format check
        if (colIndices.apellido_nombre === -1 || colIndices.dni === -1 || colIndices.importe_mensual === -1) {
          resolve({
            data: [],
            errors: [{ row: 1, field: "cabecera", message: "El archivo no tiene las columnas requeridas (APELLIDO_NOMBRE, DNI, IMPORTE MENSUAL)", severity: "error" }],
            summary: { totalRows: 0, validRows: 0, errorRows: 0, totalAmount: 0 }
          });
          return;
        }

        const parsedData: ExcelImportRow[] = [];
        const errors: ValidationError[] = [];
        const seenDnis = new Set<string>();
        const seenCuils = new Set<string>();

        // Data starts from Row 2 (0-indexed index 2)
        for (let i = 2; i < rows.length; i++) {
          const row = rows[i];
          // Skip entirely empty rows
          if (!row || row.length === 0 || row.every(cell => cell === null || cell === undefined || String(cell).trim() === "")) {
            continue;
          }

          const rowNum = i + 1; // 1-indexed for user visibility
          
          const getValue = (idx: number): any => (idx !== -1 && idx < row.length ? row[idx] : null);

          const rawDni = String(getValue(colIndices.dni) || "").trim();
          const cleanDni = cleanDocString(rawDni);

          const rawCuit = String(getValue(colIndices.cuit) || "").trim();
          const cleanCuit = cleanDocString(rawCuit);

          const apellidoNombre = String(getValue(colIndices.apellido_nombre) || "").trim();
          const subsecretaria = String(getValue(colIndices.subsecretaria) || "").trim();
          const area = String(getValue(colIndices.area) || "").trim();
          const responsable = String(getValue(colIndices.responsable) || "").trim();

          const rawImporte = getValue(colIndices.importe_mensual);
          const importeMensual = typeof rawImporte === "number" ? rawImporte : parseFloat(String(rawImporte || "0").replace(/[^0-9.]/g, "")) || 0;
          
          // Validation checks
          let hasRowErrors = false;

          if (!apellidoNombre) {
            errors.push({ row: rowNum, field: "APELLIDO_NOMBRE", message: "El nombre es obligatorio", severity: "error" });
            hasRowErrors = true;
          }

          if (!cleanDni) {
            errors.push({ row: rowNum, field: "DNI", message: "El DNI es obligatorio", severity: "error" });
            hasRowErrors = true;
          } else if (cleanDni.length < 7 || cleanDni.length > 8) {
            errors.push({ row: rowNum, field: "DNI", message: `Formato de DNI inválido (${cleanDni})`, severity: "warning" });
          }

          // DNI uniqueness in file
          if (cleanDni && seenDnis.has(cleanDni)) {
            errors.push({ row: rowNum, field: "DNI", message: `DNI duplicado dentro del archivo (${cleanDni}). Se omitirá este registro.`, severity: "error" });
            hasRowErrors = true;
          } else if (cleanDni) {
            seenDnis.add(cleanDni);
          }

          if (cleanCuit) {
            if (cleanCuit.length !== 11) {
              errors.push({ row: rowNum, field: "CUIT", message: `Formato de CUIT/CUIL inválido (${cleanCuit})`, severity: "warning" });
            }
            if (seenCuils.has(cleanCuit)) {
              errors.push({ row: rowNum, field: "CUIT", message: `CUIT duplicado dentro del archivo (${cleanCuit}). Se omitirá este registro.`, severity: "error" });
              hasRowErrors = true;
            } else {
              seenCuils.add(cleanCuit);
            }
          }

          if (!subsecretaria) {
            errors.push({ row: rowNum, field: "subsecretaria", message: "La subsecretaría es obligatoria", severity: "error" });
            hasRowErrors = true;
          }

          if (!area) {
            errors.push({ row: rowNum, field: "area", message: "El área es obligatoria", severity: "error" });
            hasRowErrors = true;
          }

          if (importeMensual <= 0) {
            errors.push({ row: rowNum, field: "IMPORTE", message: "El importe mensual debe ser mayor a 0", severity: "error" });
            hasRowErrors = true;
          }

          if (hasRowErrors) {
            continue;
          }

          // Calculate Activa (10%) and Total
          const calculatedActiva = Math.round(importeMensual * 0.10 * 100) / 100;
          const calculatedTotal = Math.round((importeMensual + calculatedActiva) * 100) / 100;

          parsedData.push({
            subsecretaria,
            area,
            responsable: responsable || "Sin Asignar",
            cuit: cleanCuit || cleanDni.padStart(11, "20"), // fallback clean CUIL format
            dni: cleanDni,
            apellido_nombre: apellidoNombre,
            fecha_nacimiento: parseExcelDate(getValue(colIndices.fecha_nacimiento)),
            cbu: String(getValue(colIndices.cbu) || "").trim() || null,
            tarjeta_activa_nro: String(getValue(colIndices.tarjeta_activa_nro) || "").trim() || null,
            telefono: String(getValue(colIndices.telefono) || "").trim() || null,
            email: String(getValue(colIndices.email) || "").trim() || null,
            nacionalidad: String(getValue(colIndices.nacionalidad) || "").trim() || null,
            codigo_postal: String(getValue(colIndices.codigo_postal) || "").trim() || null,
            provincia: String(getValue(colIndices.provincia) || "").trim() || null,
            departamento: String(getValue(colIndices.departamento) || "").trim() || null,
            localidad: String(getValue(colIndices.localidad) || "").trim() || null,
            barrio: String(getValue(colIndices.barrio) || "").trim() || null,
            calle: String(getValue(colIndices.calle) || "").trim() || null,
            nro: String(getValue(colIndices.nro) || "").trim() || null,
            piso: String(getValue(colIndices.piso) || "").trim() || null,
            depto: String(getValue(colIndices.depto) || "").trim() || null,
            lote: String(getValue(colIndices.lote) || "").trim() || null,
            manzana: String(getValue(colIndices.manzana) || "").trim() || null,
            importe_mensual: importeMensual,
            importe_tarjeta_activa: calculatedActiva,
            importe_total: calculatedTotal
          });
        }

        const totalRows = parsedData.length + errors.filter(err => err.severity === "error").length;
        const totalAmount = parsedData.reduce((acc, row) => acc + row.importe_total, 0);

        resolve({
          data: parsedData,
          errors,
          summary: {
            totalRows,
            validRows: parsedData.length,
            errorRows: errors.filter(err => err.severity === "error").length,
            totalAmount
          }
        });
      } catch (err: any) {
        reject(new Error("Error al procesar el archivo Excel: " + err.message));
      }
    };
    reader.onerror = () => reject(new Error("Error de lectura del archivo"));
    reader.readAsBinaryString(file);
  });
}
