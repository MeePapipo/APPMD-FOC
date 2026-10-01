/**
 * One account's product x month matrix as a landscape A4 PDF. Font setup and
 * the Thai-safe text wrapper are shared with the FOC summary (./pdf.tsx); see
 * there for why every string goes through `T`.
 */
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { AccountMatrix, Measure } from "@/lib/dashboard/focAccountMatrix";
import { MATRIX_HEADERS, matrixTable, type EntitlementLite } from "@/lib/dashboard/focExports";
import { FONT_FAMILY, T, ensureFont } from "./pdf";

const BRAND = "#0b41cd";
const INK = "#121212";
const MUTED = "#706b69";
const LINE = "#ddd9d5";
const WARN_TINT = "#fdf3e6";
const WARN_INK = "#9b5400";

const styles = StyleSheet.create({
  page: { fontFamily: FONT_FAMILY, fontSize: 7, color: INK, paddingHorizontal: 24, paddingVertical: 28 },
  title: { backgroundColor: BRAND, color: "#ffffff", fontSize: 13, fontWeight: "bold", padding: 8, marginBottom: 10 },
  info: { flexDirection: "row", marginBottom: 2 },
  infoLabel: { width: 60, color: MUTED, fontSize: 8 },
  infoValue: { flex: 1, fontWeight: "bold", fontSize: 8 },
  headRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: LINE, paddingBottom: 3, marginTop: 10 },
  headCell: { color: MUTED, fontSize: 6 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: LINE, paddingVertical: 3 },
  cell: { fontSize: 6.5 },
  empty: { fontSize: 8, color: MUTED, paddingVertical: 8 },
});

// code, product, entitled, %, status, prior, Jan..Dec, YTD
const COLS = [1.1, 3, 0.8, 0.7, 0.7, 1, ...Array<number>(12).fill(0.85), 1.1];
const HEADS = ["Code", "Product", "Entitled", "Given %", "Status", "Prior yr", ...MATRIX_HEADERS.slice(6, 18), "YTD"];

export type AccountPdfInput = {
  name: string;
  number: string | null;
  team: string | null;
  rep: string | null;
  matrix: AccountMatrix;
  entitlement: EntitlementLite[];
  measure: Measure;
};

function MatrixDocument({ input }: { input: AccountPdfInput }) {
  const table = matrixTable(input.matrix, input.entitlement, input.measure);
  const unit = input.measure === "qty" ? "FOC + Bonus quantity" : "FOC + Bonus cost (THB)";
  const info: [string, string][] = [
    ["Account", input.name],
    ["Team / rep", [input.team, input.rep].filter(Boolean).join(" · ") || "—"],
    ["Year", String(input.matrix.year)],
    ["Measure", unit],
  ];
  return (
    <Document title={`${input.name} — FOC ${input.matrix.year}`} author="FOC Calculator">
      <Page size="A4" orientation="landscape" style={styles.page}>
        <T style={styles.title}>FOC + Bonus by product and month</T>
        {info.map(([label, value]) => (
          <View key={label} style={styles.info}>
            <T style={styles.infoLabel}>{label}</T>
            <T style={styles.infoValue}>{value}</T>
          </View>
        ))}
        <T style={{ fontSize: 6, color: MUTED, marginTop: 3 }}>
          Quota = what the account may be given for the year, worked out from the reagents it bought; Given % and Status compare it with YTD given.
        </T>

        <View style={styles.headRow}>
          {HEADS.map((label, i) => (
            <T key={i} style={[styles.headCell, { flex: COLS[i], paddingRight: 3, textAlign: i >= 2 && i !== 4 ? "right" : "left" }]}>{label}</T>
          ))}
        </View>
        {input.matrix.rows.length === 0 && <T style={styles.empty}>— nothing given in this year or the year before —</T>}
        {table.map((cells, r) => {
          const isTotal = r === table.length - 1;
          const alert = cells[4] === "Alert";
          return (
            <View key={r} style={[styles.row, alert ? { backgroundColor: WARN_TINT } : {}]} wrap={false}>
              {cells.map((cell, i) => {
                // The "Given %" cell reads better with its sign of meaning.
                const text = typeof cell === "number" ? (i === 3 ? `${cell}%` : cell) : cell;
                return (
                  <T
                    key={i}
                    style={[
                      styles.cell,
                      { flex: COLS[i], paddingRight: 3, textAlign: i >= 2 && i !== 4 ? "right" : "left" },
                      isTotal || (alert && i === 4) ? { fontWeight: "bold" } : {},
                      alert && i === 4 ? { color: WARN_INK } : {},
                    ]}
                  >
                    {text}
                  </T>
                );
              })}
            </View>
          );
        })}

        <Text
          style={{ position: "absolute", bottom: 14, left: 24, right: 24, fontSize: 6, color: MUTED }}
          render={({ pageNumber, totalPages }) => `${input.name} · ${input.matrix.year} · ${pageNumber}/${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}

export async function buildAccountMatrixPdf(input: AccountPdfInput): Promise<Buffer> {
  ensureFont();
  return renderToBuffer(<MatrixDocument input={input} />);
}
