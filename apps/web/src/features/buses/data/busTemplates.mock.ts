import type { BusTemplate, TemplateSeat } from '../types/busTemplate.types';

interface FloorLayout {
  floor: number;
  rows: number[][];
  vipRows?: number[];
}

function generateSeats(templateId: string, layouts: FloorLayout[]): TemplateSeat[] {
  let seatNumber = 1;

  return layouts.flatMap(({ floor, rows, vipRows = [] }) =>
    rows.flatMap((seatColumns, rowIndex) =>
      seatColumns.map((column) => {
        const number = seatNumber;
        seatNumber += 1;

        return {
          id: `${templateId}-${number}`,
          number,
          floor,
          row: rowIndex + 1,
          column,
          seatType: vipRows.includes(rowIndex + 1) ? 'vip' : 'normal',
        };
      }),
    ),
  );
}

function createTemplate(
  id: string,
  name: string,
  layouts: FloorLayout[],
  columns: number,
  hasBathroom: boolean,
): BusTemplate {
  const seats = generateSeats(id, layouts);

  return {
    id,
    name,
    floors: layouts.length,
    hasBathroom,
    rows: Math.max(...layouts.map(({ rows }) => rows.length)),
    columns,
    seats,
  };
}

const standardFourSeatRow = [1, 2, 4, 5];

export const busTemplates: BusTemplate[] = [
  createTemplate(
    'standard-2x2',
    'Bus estándar 2+2',
    [
      {
        floor: 1,
        rows: Array.from({ length: 7 }, () => standardFourSeatRow),
        vipRows: [1, 2],
      },
    ],
    5,
    true,
  ),
  createTemplate(
    'executive',
    'Bus ejecutivo',
    [
      {
        floor: 1,
        rows: [[1, 4, 5], [1, 4, 5], ...Array.from({ length: 5 }, () => standardFourSeatRow)],
        vipRows: [1, 2, 3],
      },
    ],
    5,
    true,
  ),
  createTemplate(
    'double-decker',
    'Bus de dos pisos',
    [
      {
        floor: 1,
        rows: Array.from({ length: 3 }, () => standardFourSeatRow),
        vipRows: [1],
      },
      {
        floor: 2,
        rows: Array.from({ length: 8 }, () => standardFourSeatRow),
      },
    ],
    5,
    true,
  ),
  createTemplate(
    'minibus',
    'Buseta',
    [
      {
        floor: 1,
        rows: Array.from({ length: 5 }, () => [1, 2, 4]),
      },
    ],
    4,
    false,
  ),
];
