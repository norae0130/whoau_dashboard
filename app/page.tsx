"use client";

import { useEffect, useState, useMemo } from "react";
import { aggregateWeekly, compareYears, WeeklyWeather } from "@/lib/weather";
import WeatherSellChart from "@/components/WeatherSellChart";
import { CategorySellThrough } from "@/app/api/sheets/route";

type Tab = "weather" | "predict";

export default function DashboardPage() {
  const [tab, setTab] = useState<Tab>("weather");

  // 날씨 데이터
  const [weekly2023, setWeekly2023] = useState<WeeklyWeather[]>([]);
  const [weekly2024, setWeekly2024] = useState<WeeklyWeather[]>([]);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [weatherError, setWeatherError] = useState("");

  // 정판율 데이터 (구글 시트)
  const [sellThrough, setSellThrough] = useState<CategorySellThrough[]>([]);
  const [sheetsLoading, setSheetsLoading] = useState(true);
  const [sheetsError, setSheetsError] = useState("");

  // 필터
  const [filterYear, setFilterYear] = useState("all");
  const [filterSeason, setFilterSeason] = useState("all");
  const [filterCat, setFilterCat] = useState("all");

  // 날씨 + 정판율 동시 로드
  useEffect(() => {
    async function loadWeather() {
      setWeatherLoading(true);
      try {
        const [r23, r24] = await Promise.all([
          fetch("/api/weather?startDt=20230101&endDt=20231231"),
          fetch("/api/weather?startDt=20240101&endDt=20241231"),
        ]);
        const [j23, j24] = await Promise.all([r23.json(), r24.json()]);
        if (j23.error) throw new Error(j23.error);
        if (j24.error) throw new Error(j24.error);
        setWeekly2023(aggregateWeekly(j23.data));
        setWeekly2024(aggregateWeekly(j24.data));
      } catch (e: unknown) {
        setWeatherError(e instanceof Error ? e.message : "날씨 데이터 로딩 실패");
      } finally {
        setWeatherLoading(false);
      }
    }

    async function loadSheets() {
      setSheetsLoading(true);
      try {
        const res = await fetch("/api/sheets");
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        setSellThrough(json.sellThrough);
      } catch (e: unknown) {
        setSheetsError(e instanceof Error ? e.message : "구글 시트 로딩 실패");
      } finally {
        setSheetsLoading(false);
      }
    }

    loadWeather();
    loadSheets();
  }, []);

  const summary = weekly2023.length && weekly2024.length
    ? compareYears(weekly2023, weekly2024) : null;

  // ── 연동 필터 옵션 ──
  const yearOptions = useMemo(() =>
    Array.from(new Set(sellThrough.map((d) => String(d.year)))).sort(),
    [sellThrough]
  );

  const seasonOptions = useMemo(() => {
    const base = filterYear === "all" ? sellThrough
      : sellThrough.filter((d) => String(d.year) === filterYear);
    return Array.from(new Set(base.map((d) => d.seasonName)))
      .sort((a, b) => parseInt(a) - parseInt(b));
  }, [sellThrough, filterYear]);

  const categoryOptions = useMemo(() => {
    const base = sellThrough.filter((d) => {
      const ym = filterYear === "all" || String(d.year) === filterYear;
      const sm = filterSeason === "all" || d.seasonName === filterSeason;
      return ym && sm;
    });
    return Array.from(new Set(base.map((d) => d.categoryCode))).sort();
  }, [sellThrough, filterYear, filterSeason]);

  const handleYearChange = (v: string) => { setFilterYear(v); setFilterSeason("all"); setFilterCat("all"); };
  const handleSeasonChange = (v: string) => { setFilterSeason(v); setFilterCat("all"); };

  // ── 차트 데이터 합성 ──
  // 필터에 맞는 정판율 데이터 추출
  const filteredST = useMemo(() =>
    sellThrough.filter((d) => {
      const ym = filterYear === "all" || String(d.year) === filterYear;
      const sm = filterSeason === "all" || d.seasonName === filterSeason;
      const cm = filterCat === "all" || d.categoryCode === filterCat;
      return ym && sm && cm;
    }),
    [sellThrough, filterYear, filterSeason, filterCat]
  );

  // 주차별 정판율 평균 맵 구성
  const sellRateByWeek = useMemo(() => {
    const map = new Map<string, { sum: number; cnt: number }>();
    for (const series of filteredST) {
      for (const pt of series.points) {
        const prev = map.get(pt.weekLabel) ?? { sum: 0, cnt: 0 };
        map.set(pt.weekLabel, {
          sum: prev.sum + pt.sellThroughRate,
          cnt: prev.cnt + 1,
        });
      }
    }
    const result = new Map<string, number>();
    for (const [week, { sum, cnt }] of Array.from(map.entries())) {
      result.set(week, Math.round((sum / cnt) * 10) / 10);
    }
    return result;
  }, [filteredST]);

  // 날씨 주차 데이터와 정판율 병합
  // 날씨는 두 연도 평균 최저기온 사용 (filterYear에 따라 분기)
  const chartData = useMemo(() => {
    const useYear = filterYear !== "all" ? parseInt(filterYear) : null;
    const weatherSrc = useYear === 2023 ? weekly2023
      : useYear === 2024 ? weekly2024
      : (() => {
          // 두 연도 평균
          const map = new Map<number, number[]>();
          for (const w of [...weekly2023, ...weekly2024]) {
            const prev = map.get(w.week) ?? [];
            prev.push(w.avgMinTemp);
            map.set(w.week, prev);
          }
          return Array.from(map.entries()).map(([week, temps]) => ({
            week,
            year: 0,
            label: `W${String(week).padStart(2, "0")}`,
            startDate: "",
            avgMinTemp: Math.round(temps.reduce((a, b) => a + b, 0) / temps.length * 10) / 10,
            avgMaxTemp: 0,
            coldDays: 0,
            harshDays: 0,
          } as WeeklyWeather));
        })();

    return weatherSrc.map((w) => {
      // 주차 레이블: "YYYY-WW" 형식으로 정판율 맵 키와 매칭
      // 정판율 맵은 "2023-36" 형식 → 해당 연도-주차로 찾기
      const yr = useYear ?? 2024;
      const weekKey = `${yr}-${String(w.week).padStart(2, "0")}`;
      const rate = sellRateByWeek.get(weekKey) ?? null;
      return {
        week: `W${String(w.week).padStart(2, "0")}`,
        minTemp: w.avgMinTemp,
        sellRate: rate,
      };
    });
  }, [weekly2023, weekly2024, filterYear, sellRateByWeek]);

  // 테이블 요약
  const tableSummary = useMemo(() =>
    filteredST.map((d) => {
      const last = d.points.filter((p) => p.cumulativeSales > 0).slice(-1)[0];
      return { ...d, latestRate: last?.sellThroughRate ?? 0, latestSales: last?.cumulativeSales ?? 0 };
    }).sort((a, b) => b.latestRate - a.latestRate),
    [filteredST]
  );

  const totalOrder = filteredST.reduce((s, d) => s + d.orderAmt, 0);
  const totalSales = tableSummary.reduce((s, d) => s + d.latestSales, 0);
  const overallRate = totalOrder > 0 ? (totalSales / totalOrder) * 100 : 0;

  const isLoading = weatherLoading || sheetsLoading;
  const hasError = weatherError || sheetsError;

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      {/* 헤더 */}
      <div className="mb-6">
        <p className="text-xs text-gray-400 font-medium tracking-widest uppercase mb-1">Who.A.U MD Dashboard</p>
        <h1 className="text-2xl font-semibold text-gray-900">리오더 의사결정 시스템</h1>
        <p className="text-sm text-gray-500 mt-1">기상청 ASOS × 카테고리 정판율 × AI 예측</p>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {([ ["weather","🌡 날씨 × 정판율"], ["predict","🔮 시즌 예측"] ] as [Tab, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg border border-b-0 transition-colors ${
              tab === key ? "bg-white border-gray-200 text-gray-900 -mb-px"
              : "bg-transparent border-transparent text-gray-500 hover:text-gray-700"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── 날씨 × 정판율 탭 ── */}
      {tab === "weather" && (
        <div>
          {isLoading && <LoadingSpinner text="기상청 · 구글 시트 데이터 불러오는 중..." />}
          {hasError && <ErrorBox message={weatherError || sheetsError} />}

          {!isLoading && !hasError && (
            <>
              {/* 요약 지표 */}
              {summary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                  <MetricCard label="2023 연평균 최저기온" value={`${summary.avgMinTemp2023}°C`} />
                  <MetricCard label="2024 연평균 최저기온" value={`${summary.avgMinTemp2024}°C`}
                    sub={`전년比 ${summary.avgMinTemp2024 > summary.avgMinTemp2023 ? "+" : ""}${(summary.avgMinTemp2024 - summary.avgMinTemp2023).toFixed(1)}°C`} />
                  <MetricCard label="종합 정판율" value={`${overallRate.toFixed(1)}%`}
                    highlight={overallRate >= 70 ? "green" : overallRate >= 50 ? "amber" : "red"} />
                  <MetricCard label="리오더 권장" value={`${tableSummary.filter(d => d.latestRate >= 70).length}개`}
                    sub={`전체 ${tableSummary.length}개 중`} />
                </div>
              )}

              {/* 3단계 필터 */}
              <div className="bg-white rounded-xl border border-gray-100 p-4 mb-5">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">필터</p>
                <div className="flex flex-wrap gap-3 items-end">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-400">연도</label>
                    <select value={filterYear} onChange={(e) => handleYearChange(e.target.value)}
                      className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white min-w-[100px]">
                      <option value="all">전체</option>
                      {yearOptions.map((y) => <option key={y} value={y}>{y}년</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-400">시즌</label>
                    <select value={filterSeason} onChange={(e) => handleSeasonChange(e.target.value)}
                      className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white min-w-[110px]">
                      <option value="all">전체</option>
                      {seasonOptions.map((s) => <option key={s} value={s}>시즌 {s}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-400">아이템소분류</label>
                    <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)}
                      className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white min-w-[130px]">
                      <option value="all">전체</option>
                      {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <button onClick={() => handleYearChange("all")}
                    className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-3 py-2 bg-white transition-colors">
                    초기화
                  </button>
                </div>
              </div>

              {/* 통합 차트 */}
              <div className="bg-white rounded-xl border border-gray-100 p-4 mb-5">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                    주간 최저기온 × 누적 정판율
                  </p>
                  <p className="text-xs text-gray-400">
                    파란선 = 최저기온 · 초록막대 = 정판율(2개년 평균) · 주황선 = 70% 기준
                  </p>
                </div>
                <WeatherSellChart data={chartData} />
              </div>

              {/* 카테고리별 테이블 */}
              {tableSummary.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">카테고리별 정판율</p>
                    <p className="text-xs text-gray-400">{tableSummary.length}개 항목 · 정판율 높은 순</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50">
                          {["연도","시즌","카테고리","발주액","누적판매액","정판율","","리오더"].map((h, i) => (
                            <th key={i} className={`px-4 py-3 text-xs font-medium text-gray-500 ${i >= 3 ? "text-right" : "text-left"} ${i === 7 ? "text-center" : ""}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {tableSummary.map((d) => (
                          <tr key={`${d.year}_${d.seasonNo}_${d.categoryCode}`}
                            className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 text-gray-500">{d.year}</td>
                            <td className="px-4 py-3 text-gray-500">시즌 {d.seasonName}</td>
                            <td className="px-4 py-3 font-medium text-gray-900">{d.categoryCode}</td>
                            <td className="px-4 py-3 text-right text-gray-500 tabular-nums">
                              {fmtKRW(d.orderAmt)}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-500 tabular-nums">
                              {fmtKRW(d.latestSales)}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold tabular-nums"
                              style={{ color: rateColor(d.latestRate) }}>
                              {d.latestRate.toFixed(1)}%
                            </td>
                            <td className="px-4 py-3 w-24">
                              <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full rounded-full"
                                  style={{ width: `${Math.min(100, d.latestRate)}%`, background: rateColor(d.latestRate) }} />
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <ReorderBadge rate={d.latestRate} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <p className="mt-3 text-xs text-gray-400">
                정판율 = 누적 정상판매액 ÷ 발주액[정상가+예판가] · 날씨: 기상청 ASOS 서울 관측소
              </p>
            </>
          )}
        </div>
      )}

      {/* ── 예측 탭 ── */}
      {tab === "predict" && (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
          <p className="text-sm text-gray-500">🔮 AI 시즌 예측은 다음 단계에서 활성화됩니다.</p>
        </div>
      )}
    </main>
  );
}

// ── 유틸 ──
function fmtKRW(v: number) {
  if (v >= 100000000) return `${(v / 100000000).toFixed(1)}억`;
  if (v >= 10000) return `${(v / 10000).toLocaleString()}만`;
  return v.toLocaleString();
}

function rateColor(rate: number) {
  if (rate >= 70) return "#3B6D11";
  if (rate >= 50) return "#854F0B";
  return "#A32D2D";
}

// ── 공통 컴포넌트 ──
function MetricCard({ label, value, sub, highlight }: {
  label: string; value: string; sub?: string; highlight?: "green" | "amber" | "red";
}) {
  const colors = { green: "#3B6D11", amber: "#854F0B", red: "#A32D2D" };
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-xl font-semibold" style={{ color: highlight ? colors[highlight] : undefined }}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function LoadingSpinner({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 py-12 justify-center text-gray-400">
      <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
      <span className="text-sm">{text}</span>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
      <strong>오류:</strong> {message}
    </div>
  );
}

function ReorderBadge({ rate }: { rate: number }) {
  if (rate >= 70) return <span className="text-xs font-medium px-2 py-1 rounded-md bg-green-50 text-green-800">리오더 권장</span>;
  if (rate >= 50) return <span className="text-xs font-medium px-2 py-1 rounded-md bg-amber-50 text-amber-800">조건부 검토</span>;
  return <span className="text-xs font-medium px-2 py-1 rounded-md bg-red-50 text-red-800">리오더 보류</span>;
}
