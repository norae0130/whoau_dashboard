import { NextResponse } from "next/server";

// 구글 시트 ID
const ORDER_SHEET_ID = "1eq7iBEls068Tws15MAqgGFeEdPJrBHVAuSkEnjISrrs";
const SALES_SHEET_ID = "1O4g28nT-Tmf1G7F9GifeXD8EmgyAdII7n1ASVUbT1zM";

// 공개 시트 CSV 다운로드 URL
function csvUrl(sheetId: string, gid = "0") {
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
}

// CSV 파싱 (쉼표+따옴표 처리)
function parseCsv(text: string): string[][] {
  return text.split("\n").map((line) => {
    const cols: string[] = [];
    let cur = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuote = !inQuote;
      } else if (ch === "," && !inQuote) {
        cols.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    cols.push(cur.trim());
    return cols;
  });
}

// 숫자 파싱 (KRW 콤마 제거)
function toNum(v: string): number {
  return parseFloat(v.replace(/,/g, "").replace(/[^0-9.-]/g, "")) || 0;
}

export type OrderRow = {
  year: number;
  seasonNo: number;
  seasonName: string;
  categoryCode: string;
  categoryName: string;
  orderAmt: number; // J열: 발주액[정상가+예판가]
};

export type WeekSales = {
  weekLabel: string; // "2023-36"
  sales: number;
};

export type SalesRow = {
  year: number;
  seasonNo: number;
  seasonName: string;
  categoryCode: string;
  categoryName: string;
  weekSales: WeekSales[];
};

export type SellThroughPoint = {
  weekLabel: string;
  cumulativeSales: number;
  sellThroughRate: number; // %
};

export type CategorySellThrough = {
  year: number;
  seasonNo: number;
  seasonName: string;
  categoryCode: string;
  categoryName: string;
  orderAmt: number;
  points: SellThroughPoint[]; // 누적 정판율 시계열
};

async function fetchOrderData(): Promise<OrderRow[]> {
  const res = await fetch(csvUrl(ORDER_SHEET_ID), { next: { revalidate: 1800 } });
  const text = await res.text();
  const rows = parseCsv(text);

  // 스판재: 6행(index 5)부터 데이터 시작
  // F=연도(index 5), G=시즌(index 6), J=아이템소분류(index 9), N=발주액[정상가+예판가](index 13)
  const result: OrderRow[] = [];
  for (let i = 5; i < rows.length; i++) {
    const r = rows[i];
    const year = parseInt(r[5]);
    if (isNaN(year) || year < 2000) continue;
    const orderAmt = toNum(r[13]);
    if (orderAmt === 0) continue;

    result.push({
      year,
      seasonNo: parseInt(r[6]) || 0,
      seasonName: r[6] || "",
      categoryCode: r[9] || "",
      categoryName: r[9] || "",
      orderAmt,
    });
  }
  return result;
}

async function fetchSalesData(): Promise<{ weekLabels: string[]; rows: SalesRow[] }> {
  const res = await fetch(csvUrl(SALES_SHEET_ID), { next: { revalidate: 1800 } });
  const text = await res.text();
  const rows = parseCsv(text);

  // 매상세: 4행(index 3)에 주차 헤더(K열=index 10부터 "2023-36" 형식)
  // 데이터는 7행(index 6)부터
  // F=연도(index 5), G=시즌(index 6), J=아이템소분류(index 9)
  // K열(index 10)~: 주차별 정상판매액

  const headerRow = rows[3] || [];
  const weekLabels: string[] = [];
  for (let c = 10; c < headerRow.length; c++) {
    const val = headerRow[c]?.trim();
    if (val && /^\d{4}-\d{2}$/.test(val)) weekLabels.push(val);
  }

  const salesRows: SalesRow[] = [];
  for (let i = 6; i < rows.length; i++) {
    const r = rows[i];
    const year = parseInt(r[5]);
    if (isNaN(year) || year < 2000) continue;
    const categoryCode = r[9]?.trim();
    if (!categoryCode) continue;

    const weekSales: WeekSales[] = weekLabels.map((label, idx) => ({
      weekLabel: label,
      sales: toNum(r[10 + idx] || "0"),
    }));

    // 판매액이 하나라도 있는 행만 포함
    if (weekSales.every((w) => w.sales === 0)) continue;

    salesRows.push({
      year,
      seasonNo: parseInt(r[6]) || 0,
      seasonName: r[6] || "",
      categoryCode,
      categoryName: categoryCode,
      weekSales,
    });
  }

  return { weekLabels, rows: salesRows };
}

// 발주액 + 판매액 매칭 → 누적 정판율 계산
function computeSellThrough(
  orders: OrderRow[],
  salesRows: SalesRow[],
  weekLabels: string[]
): CategorySellThrough[] {
  // 발주액 집계: year+seasonNo+categoryCode 키
  const orderMap = new Map<string, { orderAmt: number; seasonName: string; categoryName: string; seasonNo: number }>();
  for (const o of orders) {
    const key = `${o.year}_${o.seasonNo}_${o.categoryCode}`;
    const prev = orderMap.get(key);
    orderMap.set(key, {
      orderAmt: (prev?.orderAmt || 0) + o.orderAmt,
      seasonName: o.seasonName,
      categoryName: o.categoryName,
      seasonNo: o.seasonNo,
    });
  }

  // 판매액 집계: 같은 키로 주차별 합산
  const salesMap = new Map<string, number[]>();
  for (const s of salesRows) {
    const key = `${s.year}_${s.seasonNo}_${s.categoryCode}`;
    const existing = salesMap.get(key) || Array(weekLabels.length).fill(0);
    s.weekSales.forEach((ws, idx) => {
      existing[idx] = (existing[idx] || 0) + ws.sales;
    });
    salesMap.set(key, existing);
  }

  // 누적 정판율 계산
  const result: CategorySellThrough[] = [];
  for (const [key, orderInfo] of Array.from(orderMap.entries())) {
    const [yearStr, , ] = key.split("_");
    const year = parseInt(yearStr);
    const weeklyAmts = salesMap.get(key) || [];
    const orderAmt = orderInfo.orderAmt;

    // 누적합 계산
    let cumulative = 0;
    const points: SellThroughPoint[] = weekLabels
      .map((label, idx) => {
        cumulative += weeklyAmts[idx] || 0;
        return {
          weekLabel: label,
          cumulativeSales: cumulative,
          sellThroughRate: orderAmt > 0 ? Math.round((cumulative / orderAmt) * 1000) / 10 : 0,
        };
      })
      .filter((p) => p.cumulativeSales > 0 || weekLabels.indexOf(p.weekLabel) === 0);

    result.push({
      year,
      seasonNo: orderInfo.seasonNo,
      seasonName: orderInfo.seasonName,
      categoryCode: key.split("_")[2],
      categoryName: orderInfo.categoryName,
      orderAmt,
      points,
    });
  }

  return result.sort((a, b) => a.year - b.year || a.seasonNo - b.seasonNo || a.categoryCode.localeCompare(b.categoryCode));
}

export async function GET() {
  try {
    const [orders, { weekLabels, rows: salesRows }] = await Promise.all([
      fetchOrderData(),
      fetchSalesData(),
    ]);

    const sellThrough = computeSellThrough(orders, salesRows, weekLabels);

    return NextResponse.json({
      weekLabels,
      sellThrough,
      meta: {
        orderRowCount: orders.length,
        salesRowCount: salesRows.length,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
