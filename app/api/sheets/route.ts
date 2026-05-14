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

  // 5행(index 4)부터 데이터 시작
  // A=연도, B=시즌No, C=시즌명, D=카테고리코드, E=카테고리명, J=발주액[정상가+예판가]
  const result: OrderRow[] = [];
  for (let i = 4; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0] || !r[9]) continue; // 연도나 J열 없으면 스킵
    const year = parseInt(r[0]);
    if (isNaN(year)) continue;

    result.push({
      year,
      seasonNo: parseInt(r[1]) || 0,
      seasonName: r[2] || "",
      categoryCode: r[3] || "",
      categoryName: r[4] || "",
      orderAmt: toNum(r[9]),
    });
  }
  return result;
}

async function fetchSalesData(): Promise<{ weekLabels: string[]; rows: SalesRow[] }> {
  const res = await fetch(csvUrl(SALES_SHEET_ID), { next: { revalidate: 1800 } });
  const text = await res.text();
  const rows = parseCsv(text);

  // 4행(index 3): 달력연도/주 헤더 (K열=index 10부터)
  // 5행(index 4): "정상판매액" 레이블
  // 6행(index 5): KRW 단위
  // 7행(index 6)부터: 데이터
  // E=연도(index 4), F=시즌No(index 5), G=시즌명(index 6), H=카테고리코드(index 7), I=카테고리명(index 8)
  // K열(index 10)~: 주차별 정상판매액

  const headerRow = rows[3] || [];
  // 주차 레이블 수집 (index 10부터)
  const weekLabels: string[] = [];
  for (let c = 10; c < headerRow.length; c++) {
    if (headerRow[c]) weekLabels.push(headerRow[c]);
  }

  const salesRows: SalesRow[] = [];
  for (let i = 6; i < rows.length; i++) {
    const r = rows[i];
    if (!r[4]) continue;
    const year = parseInt(r[4]);
    if (isNaN(year)) continue;

    const weekSales: WeekSales[] = weekLabels.map((label, idx) => ({
      weekLabel: label,
      sales: toNum(r[10 + idx] || "0"),
    }));

    salesRows.push({
      year,
      seasonNo: parseInt(r[5]) || 0,
      seasonName: r[6] || "",
      categoryCode: r[7] || "",
      categoryName: r[8] || "",
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
