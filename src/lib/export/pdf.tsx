/**
 * Renders the "ใบสรุปของแถม (FOC Summary)" as a PDF, mirroring the XLSX
 * layout (see ./xlsx.ts) and the v1 workbook's sheet 2.
 *
 * Thai text is the whole reason for the font work below: @react-pdf ships only
 * the 14 standard PDF fonts, none of which carry Thai glyphs, so without a
 * registered TTF every label renders as blank boxes.
 */
import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
// `Style` is consumed by @react-pdf/renderer's own typings but not re-exported
// from it, so it has to come from the shared types package directly.
import type { Style } from "@react-pdf/types";
import {
  ADDITIONAL_FOC_HEADERS,
  FOC_ITEM_HEADERS,
  REAGENT_HEADERS,
  formatThaiDate,
  type SubmissionDoc,
} from "./submission-doc";
import { MissingThaiFontError, findThaiFont } from "./thai-font";

export { MissingThaiFontError, findThaiFont };

const BRAND = "#0b41cd";
const INK = "#121212";
const MUTED = "#706b69";
const LINE = "#ddd9d5";
const NET_TINT = "#d1fadf";
// Amber, mirroring the app's --warning-tint / --warning. This file cannot read
// the CSS tokens, so the pair is restated here (and again in xlsx.ts).
const WARN_TINT = "#fdf3e6";
const WARN_INK = "#9b5400";

/** The font family in use, as a stylesheet value. */
const FONT_FAMILY = "ThaiBody";

let fontReady = false;

/** Registered once per process; re-registering on every request leaks handles. */
function ensureFont(): void {
  if (fontReady) return;
  const found = findThaiFont();
  if (!found) throw new MissingThaiFontError();

  // A missing Bold face is a degradation, not a failure: registering Regular
  // under both weights keeps every Thai glyph on the page, where refusing to
  // render would lose the whole document over a typographic nicety.
  if (!found.bold) {
    console.warn(
      `[pdf] ${found.family}-Bold.ttf not found — headings will render at regular weight.`,
    );
  }
  Font.register({
    family: FONT_FAMILY,
    fonts: [
      { src: found.regular },
      { src: found.bold ?? found.regular, fontWeight: "bold" },
    ],
  });
  // Thai has no inter-word spaces, so @react-pdf's default hyphenation splits
  // words at arbitrary points. Disabling it keeps runs of Thai intact.
  Font.registerHyphenationCallback((word) => [word]);
  fontReady = true;
}

const styles = StyleSheet.create({
  page: { fontFamily: FONT_FAMILY, fontSize: 7, color: INK, paddingHorizontal: 24, paddingVertical: 28 },
  title: { backgroundColor: BRAND, color: "#ffffff", fontSize: 13, fontWeight: "bold", padding: 8, marginBottom: 12 },
  infoRow: { flexDirection: "row", marginBottom: 2 },
  infoLabel: { width: 70, color: MUTED, fontSize: 8 },
  infoValue: { flex: 1, fontWeight: "bold", fontSize: 8 },
  void: { marginTop: 6, color: "#a30014", fontWeight: "bold", fontSize: 9 },
  overGive: {
    marginTop: 8,
    backgroundColor: WARN_TINT,
    color: WARN_INK,
    fontWeight: "bold",
    fontSize: 8,
    padding: 5,
  },
  overGiveNote: { color: WARN_INK, fontSize: 7, paddingHorizontal: 5, paddingBottom: 5, backgroundColor: WARN_TINT },
  section: { marginTop: 14, marginBottom: 4, backgroundColor: "#f5f9ff", color: BRAND, fontWeight: "bold", fontSize: 9, padding: 4 },
  headRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: LINE, paddingBottom: 3 },
  headCell: { color: MUTED, fontSize: 6 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: LINE, paddingVertical: 3 },
  cell: { fontSize: 6.5 },
  empty: { fontSize: 7, color: MUTED, fontStyle: "italic", paddingVertical: 4 },
  totalRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 8, gap: 12 },
  totalLabel: { fontSize: 9, fontWeight: "bold" },
  totalValue: { fontSize: 10, fontWeight: "bold", width: 80, textAlign: "right" },
  comment: { fontSize: 6, color: MUTED, marginTop: 1 },
});

const money = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });

/**
 * Rewrites SARA AM (ำ, U+0E33) as its two components, nikhahit + sara aa.
 *
 * @react-pdf's shaper expands SARA AM internally but still emits the composed
 * glyph alongside the expansion, so "จำนวน" came out as "จำานวน" — a doubled
 * vowel — and the extra glyph pushed the real last character out of its
 * column, which is what looked like plain clipping. Feeding it the decomposed
 * form gives the shaper one unambiguous representation; the two marks render
 * as the same ำ the reader expects.
 *
 * Every string that reaches the page goes through this.
 */
export function thaiSafe(text: string): string {
  return text.replace(/ำ/g, "ํา");
}

/**
 * Every piece of text on the page goes through here rather than through `Text`
 * directly, so no literal can skip the SARA AM fix by being added later.
 */
function T({ children, style }: { children: string | number; style?: Style | Style[] }) {
  return <Text style={style}>{typeof children === "number" ? money(children) : thaiSafe(children)}</Text>;
}

/**
 * Relative column widths, in the same order as the header constants. Verified
 * against the rendered font by `npx tsx scripts/measure-pdf-headers.mts` —
 * a Thai header narrower than its own text is clipped, not wrapped, because
 * Thai has no spaces to break at and hyphenation is disabled.
 */
const REAGENT_COLS = [3.4, 1.3, 1.1, 0.8, 0.6, 1];
const ADDITIONAL_COLS = [3.4, 1.3, 1.1, 1, 0.6, 0.8, 1];
//                  กลุ่ม  desc  matNo dksh pack จำนวน stock  หลังหัก  THB  มูลค่า ปรับ สุทธิ มูลค่าสุทธิ หมายเหตุ
const FOC_COLS = [0.85, 2.8, 1.2, 1, 0.8, 0.6, 0.75, 1.15, 0.7, 0.85, 0.6, 0.7, 0.85, 1.5];

function Row({ cells, widths, cellStyles = [] }: {
  cells: (string | number)[];
  widths: number[];
  cellStyles?: (Style | undefined)[];
}) {
  return (
    <View style={styles.row} wrap={false}>
      {cells.map((cell, index) => (
        <T
          key={index}
          style={[
            styles.cell,
            { flex: widths[index], paddingRight: 3, textAlign: typeof cell === "number" ? "right" : "left" },
            cellStyles[index] ?? {},
          ]}
        >
          {cell}
        </T>
      ))}
    </View>
  );
}

// Not `fixed`: that repeats the header on every page, and with three tables on
// one document all three headers stacked up at the top of page 2 above rows
// they did not belong to.
function HeadRow({ labels, widths }: { labels: readonly string[]; widths: number[] }) {
  return (
    <View style={styles.headRow}>
      {labels.map((label, index) => (
        <T key={label} style={[styles.headCell, { flex: widths[index], paddingRight: 3 }]}>
          {label}
        </T>
      ))}
    </View>
  );
}

/**
 * A titled table.
 *
 * `keepTogether` moves the whole section to the next page rather than letting
 * it split — right for the short sections, where a heading alone at the foot
 * of a page with its rows overleaf reads as an empty section. The long FOC
 * items table has to be allowed to split, so it relies on `minPresenceAhead`
 * to at least keep its heading with the first rows.
 */
function Section({ title, labels, widths, keepTogether = false, children }: {
  title: string;
  labels: readonly string[];
  widths: number[];
  keepTogether?: boolean;
  children: React.ReactNode;
}) {
  const heading = (
    <>
      <T style={styles.section}>{title}</T>
      <HeadRow labels={labels} widths={widths} />
    </>
  );
  if (keepTogether) {
    return (
      <View wrap={false}>
        {heading}
        {children}
      </View>
    );
  }
  return (
    <>
      <View minPresenceAhead={70}>{heading}</View>
      {children}
    </>
  );
}

function SummaryDocument({ doc }: { doc: SubmissionDoc }) {
  return (
    <Document title={`${doc.fileStem} — ใบสรุปของแถม`} author="FOC Calculator">
      <Page size="A4" orientation="landscape" style={styles.page}>
        <T style={styles.title}>ใบสรุปของแถม (FOC Summary)</T>

        {([
          ["Account", `${doc.accountNumber} — ${doc.accountName}`],
          ["ผู้แทนขาย", doc.repEmail],
          ["วันที่", formatThaiDate(doc.createdAt)],
          ["System", doc.systemsLabel],
        ] as const).map(([label, value]) => (
          <View key={label} style={styles.infoRow}>
            <T style={styles.infoLabel}>{label}</T>
            <T style={styles.infoValue}>{value}</T>
          </View>
        ))}
        {doc.status === "VOID" && <T style={styles.void}>ใบนี้ถูกยกเลิก (VOID)</T>}
        {/* Sits above the tables, in the approver's reading path, because the
            highlighted cells are otherwise 11 columns into a landscape grid. */}
        {doc.overGive.lineCount > 0 && (
          <>
            <T style={styles.overGive}>
              {`Extra Bonus: ${doc.overGive.lineCount} รายการ · +${doc.overGive.packs} หน่วย · ${doc.overGive.value.toLocaleString()} THB`}
            </T>
            <T style={styles.overGiveNote}>
              ปริมาณที่ไฮไลต์สีเหลืองสูงกว่าที่สูตรคำนวณหลังหักสินค้าคงเหลือ — โปรดพิจารณาความจำเป็นก่อนอนุมัติ
            </T>
          </>
        )}

        <Section title="น้ำยาหลักที่สั่ง (Main Reagent)" labels={REAGENT_HEADERS} widths={REAGENT_COLS} keepTogether>
          {doc.reagents.map((reagent) => (
            <Row
              key={reagent.materialNo}
              widths={REAGENT_COLS}
              cells={[
                reagent.description,
                reagent.materialNo,
                reagent.dkshCode ?? "—",
                reagent.tests,
                reagent.qty,
                reagent.value,
              ]}
            />
          ))}
          {doc.reagents.length === 0 && <T style={styles.empty}>— ไม่มีน้ำยาหลักในใบนี้ —</T>}
          <View style={styles.totalRow}>
            <T style={styles.totalLabel}>รวมมูลค่าน้ำยา</T>
            <T style={styles.totalValue}>{doc.reagentTotal}</T>
          </View>
        </Section>

        <Section title="ของแถม (FOC Items)" labels={FOC_ITEM_HEADERS} widths={FOC_COLS}>
        {doc.focItems.map((item) => (
          <Row
            key={item.materialNo}
            widths={FOC_COLS}
            // Index 10 is ปรับ (+/-), 11 is จำนวนสุทธิ. An over-given line turns
            // both amber so the approver's eye lands on the quantity that
            // exceeds the formula, not just on the one that ships.
            cellStyles={[
              undefined, undefined, undefined, undefined, undefined, undefined, undefined,
              undefined, undefined, undefined,
              item.overGiveQty > 0
                ? { backgroundColor: WARN_TINT, color: WARN_INK, fontWeight: "bold" }
                : undefined,
              item.overGiveQty > 0
                ? { backgroundColor: WARN_TINT, color: WARN_INK, fontWeight: "bold" }
                : { backgroundColor: NET_TINT, fontWeight: "bold" },
            ]}
            cells={[
              item.group,
              item.description,
              item.materialNo,
              item.dkshCode ?? "—",
              item.packText ?? "—",
              item.calculatedQty,
              item.stockOnHand ?? "—",
              item.afterStockQty,
              item.unitPrice ?? "—",
              item.grossValue,
              item.adjustedQty === 0 ? "—" : item.adjustedQty,
              item.finalQty,
              item.finalValue,
              item.adjustComment ?? "",
            ]}
          />
        ))}
        {doc.focItems.length === 0 && <T style={styles.empty}>— ไม่มีของแถมในใบนี้ —</T>}
        </Section>

        {doc.additionalFocItems.length > 0 && (
          <Section
            title="ของแถมเพิ่มเติม (Third party FOC)"
            labels={ADDITIONAL_FOC_HEADERS}
            widths={ADDITIONAL_COLS}
            keepTogether
          >
            {doc.additionalFocItems.map((item) => (
              <Row
                key={item.materialNo}
                widths={ADDITIONAL_COLS}
                cells={[
                  item.description,
                  item.materialNo,
                  item.dkshCode ?? "—",
                  item.packText ?? "—",
                  item.qty,
                  item.unitPrice ?? "—",
                  item.value,
                ]}
              />
            ))}
            <View style={styles.totalRow}>
              <T style={styles.totalLabel}>รวมของแถมเพิ่มเติม</T>
              <T style={styles.totalValue}>{doc.additionalFocTotal}</T>
            </View>
          </Section>
        )}

        {/* The closing figures must not be orphaned from the table they sum. */}
        <View minPresenceAhead={40}>
          <View style={styles.totalRow}>
            <T style={styles.totalLabel}>รวมมูลค่า FOC</T>
            <T style={styles.totalValue}>{doc.focTotal}</T>
          </View>
          <View style={styles.totalRow}>
            <T style={styles.totalLabel}>คิดเป็น % ของยอดขาย</T>
            <T style={styles.totalValue}>{`${(doc.focPct * 100).toFixed(2)}%`}</T>
          </View>
        </View>

        <Text
          style={{ position: "absolute", bottom: 14, left: 24, right: 24, fontSize: 6, color: MUTED }}
          render={({ pageNumber, totalPages }) => `${doc.fileStem} · หน้า ${pageNumber}/${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}

export async function buildSubmissionPdf(doc: SubmissionDoc): Promise<Buffer> {
  ensureFont();
  return renderToBuffer(<SummaryDocument doc={doc} />);
}
