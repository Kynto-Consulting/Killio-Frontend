import { HyperFormula } from 'hyperformula';

// Common spreadsheet functions with Spanish descriptions
const COMMON_FUNCTIONS: Record<string, { description: string; parameters: string[] }> = {
    'SUM': {
        description: 'Suma todos los números en un rango de celdas.',
        parameters: ['numero1', '[numero2]', '...']
    },
    'AVERAGE': {
        description: 'Calcula el promedio (media aritmética) de los argumentos.',
        parameters: ['numero1', '[numero2]', '...']
    },
    'COUNT': {
        description: 'Cuenta cuántas celdas en un rango contienen números.',
        parameters: ['valor1', '[valor2]', '...']
    },
    'MAX': {
        description: 'Devuelve el valor máximo de un conjunto de valores.',
        parameters: ['numero1', '[numero2]', '...']
    },
    'MIN': {
        description: 'Devuelve el valor mínimo de un conjunto de valores.',
        parameters: ['numero1', '[numero2]', '...']
    },
    'IF': {
        description: 'Comprueba si se cumple una condición y devuelve un valor si es VERDADERO y otro si es FALSO.',
        parameters: ['prueba_logica', 'valor_si_verdadero', '[valor_si_falso]']
    },
    'VLOOKUP': {
        description: 'Busca un valor en la primera columna de la izquierda de una tabla y devuelve un valor en la misma fila de una columna especificada.',
        parameters: ['valor_buscado', 'matriz_tabla', 'indicador_columnas', '[rango]']
    },
    'CONCATENATE': {
        description: 'Une varios elementos de texto en uno solo.',
        parameters: ['texto1', '[texto2]', '...']
    },
    'TODAY': {
        description: 'Devuelve la fecha actual.',
        parameters: []
    },
    'NOW': {
        description: 'Devuelve la fecha y hora actuales.',
        parameters: []
    }
};

class SheetEngine {
    private static instance: SheetEngine;
    private hf: HyperFormula;

    private constructor() {
        this.hf = HyperFormula.buildEmpty({
            licenseKey: 'gpl-v3',
            dateFormats: ['DD/MM/YYYY'],
            language: 'enGB',
        });
    }

    public static getInstance(): SheetEngine {
        if (!SheetEngine.instance) {
            SheetEngine.instance = new SheetEngine();
        }
        return SheetEngine.instance;
    }

    public updateSheet(sheetId: string, data: string[][]) {
        const sanitizedData = data.map(row =>
            row.map(cell => {
                if (typeof cell === 'string' && cell.startsWith('=') && cell.includes(';')) {
                    return cell.replace(/;/g, ',');
                }
                return cell;
            })
        );

        if (this.hf.doesSheetExist(sheetId)) {
            const id = this.hf.getSheetId(sheetId)!;
            this.hf.setSheetContent(id, sanitizedData);
        } else {
            this.hf.addSheet(sheetId);
            const id = this.hf.getSheetId(sheetId)!;
            this.hf.setSheetContent(id, sanitizedData);
        }
    }

    public getComputedValue(sheetId: string, row: number, col: number): string {
        if (!this.hf.doesSheetExist(sheetId)) return '';
        const val = this.hf.getCellValue({ sheet: this.hf.getSheetId(sheetId)!, row, col });
        if (val === null || val === undefined) return '';
        if (typeof val === 'object' && val !== null && 'type' in val && (val as any).type === 'ERROR') {
            return (val as any).value || '#ERROR';
        }
        return String(val);
    }

    public getComputedData(sheetId: string, rows: number, cols: number): string[][] {
        if (!this.hf.doesSheetExist(sheetId)) return [];
        const result: string[][] = [];
        for (let r = 0; r < rows; r++) {
            const rowData: string[] = [];
            for (let c = 0; c < cols; c++) {
                rowData.push(this.getComputedValue(sheetId, r, c));
            }
            result.push(rowData);
        }
        return result;
    }

    public getFunctionsWithMetadata() {
        const allFunctions = HyperFormula.getRegisteredFunctionNames('enGB');
        return allFunctions.map(name => ({
            name,
            ...(COMMON_FUNCTIONS[name] || { description: '', parameters: [] })
        })).sort((a, b) => (a.description ? -1 : 1) || a.name.localeCompare(b.name));
    }
}

export const sheetEngine = SheetEngine.getInstance();
