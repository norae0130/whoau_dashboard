// 날씨 데이터 유틸리티
// 일별 데이터 → 주별 집계, 카테고리 판매 반응 계산

export type DailyWeather = {
  date: string;     // "2023-01-15"
  minTemp: number;
  maxTemp: number;
  avgTemp: number;
  rain: number;
  snow: number;
};

export type WeeklyWeather = {
  week: number;         // 1-52
  year: number;
  label: string;        // "2023 W01"
  startDate: string;
  avgMinTemp: number;
  avgMaxTemp: number;
  coldDays: number;     // 최저기온 0°C 미만 일수
  harshDays: number;    // 최저기온 -10°C 미만 일수
};

// ISO 주차 계산
function getISOWeek(dateStr: string): { week: number; year: number } {
  const d = new Date(dateStr);
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const startOfWeek1 = new Date(jan4);
  startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const diff = d.getTime() - startOfWeek1.getTime();
  const week = Math.floor(diff / (7 * 86400000)) + 1;
  return { week: Math.max(1, Math.min(52, week)), year: d.getFullYear() };
}

// 일별 → 주별 집계
export function aggregateWeekly(data: DailyWeather[]): WeeklyWeather[] {
  const map = new Map<string, DailyWeather[]>();

  for (const row of data) {
    const { week, year } = getISOWeek(row.date);
    const key = `${year}-W${String(week).padStart(2, "0")}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  }

  const result: WeeklyWeather[] = [];
  for (const [label, rows] of Array.from(map.entries())) {
    const [yearStr] = label.split("-W");
    const week = parseInt(label.split("W")[1]);
    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

    result.push({
      week,
      year: parseInt(yearStr),
      label,
      startDate: rows[0].date,
      avgMinTemp: Math.round(avg(rows.map((r) => r.minTemp)) * 10) / 10,
      avgMaxTemp: Math.round(avg(rows.map((r) => r.maxTemp)) * 10) / 10,
      coldDays: rows.filter((r) => r.minTemp < 0).length,
      harshDays: rows.filter((r) => r.minTemp < -10).length,
    });
  }

  return result.sort((a, b) => a.year - b.year || a.week - b.week);
}

// 최저기온 기준 카테고리별 판매 지수 추정
// (실제 판매 데이터 연동 전 시뮬레이션용 — 실 데이터로 교체 예정)
export function estimateCategorySalesIndex(avgMinTemp: number): Record<string, number> {
  const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

  return {
    // 아우터: 기온 낮을수록 강세, 0°C 이하에서 피크
    outer: clamp(100 - Math.max(0, avgMinTemp) * 5),
    // 패딩: 영하권에서 급등
    padding: clamp(avgMinTemp < 0 ? 95 - avgMinTemp * 2 : Math.max(0, 40 - avgMinTemp * 8)),
    // 니트: 0~10°C 구간 피크
    knit: clamp(avgMinTemp < -5 ? 70 : avgMinTemp < 10 ? 85 - Math.abs(avgMinTemp - 3) * 2 : Math.max(20, 85 - avgMinTemp * 5)),
    // 팬츠: 비교적 안정
    pants: clamp(65 + (avgMinTemp < 0 ? 10 : avgMinTemp > 15 ? -10 : 0)),
    // 원피스: 기온 높을수록 강세
    dress: clamp(Math.max(5, Math.min(95, 20 + avgMinTemp * 4))),
    // 액세서리: 완만한 겨울 강세
    acc: clamp(65 + (avgMinTemp < 5 ? 10 : 0)),
  };
}

// 두 연도 데이터 비교 요약
export function compareYears(data2023: WeeklyWeather[], data2024: WeeklyWeather[]) {
  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  return {
    avgMinTemp2023: Math.round(avg(data2023.map((w) => w.avgMinTemp)) * 10) / 10,
    avgMinTemp2024: Math.round(avg(data2024.map((w) => w.avgMinTemp)) * 10) / 10,
    coldDays2023: data2023.reduce((s, w) => s + w.coldDays, 0),
    coldDays2024: data2024.reduce((s, w) => s + w.coldDays, 0),
    harshDays2023: data2023.reduce((s, w) => s + w.harshDays, 0),
    harshDays2024: data2024.reduce((s, w) => s + w.harshDays, 0),
  };
}
