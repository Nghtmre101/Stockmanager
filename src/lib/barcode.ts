/**
 * Tiny Code 128-B encoder that renders to inline SVG.
 * Used for product labels: thin bars only, no human readable digits.
 */

const PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

const START_B = 104;
const STOP = 106;

/** Bar/space width sequence for a Code128-B payload. */
function encode(value: string): number[] {
  const chars = [...value].filter((c) => {
    const code = c.charCodeAt(0);
    return code >= 32 && code <= 126;
  });
  const codes = [START_B, ...chars.map((c) => c.charCodeAt(0) - 32)];
  const checksum =
    codes.reduce((sum, code, i) => sum + code * (i === 0 ? 1 : i), 0) % 103;
  const all = [...codes, checksum, STOP];
  return all.flatMap((code) => [...PATTERNS[code]].map(Number));
}

/**
 * Inline SVG barcode. `module` is the width of one narrow bar in mm,
 * `height` the bar height in mm. Bars start black and alternate.
 */
export function barcodeSVG(value: string, opts?: { module?: number; height?: number }): string {
  const clean = String(value ?? "").trim();
  if (!clean) return "";
  const module = opts?.module ?? 0.26;
  const height = opts?.height ?? 9;
  const widths = encode(clean);
  const total = widths.reduce((a, b) => a + b, 0);
  let x = 0;
  const bars: string[] = [];
  widths.forEach((w, i) => {
    if (i % 2 === 0) {
      bars.push(
        `<rect x="${(x * module).toFixed(3)}" y="0" width="${(w * module).toFixed(3)}" height="${height}" fill="#000"/>`,
      );
    }
    x += w;
  });
  const widthMm = total * module;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${widthMm.toFixed(2)}mm" height="${height}mm" viewBox="0 0 ${widthMm.toFixed(2)} ${height}" shape-rendering="crispEdges">${bars.join("")}</svg>`;
}
