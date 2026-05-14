"use client";

import { useEffect, useState, useMemo } from "react";
import { aggregateWeekly, compareYears, WeeklyWeather } from "@/lib/weather";
import WeatherChart from "@/components/WeatherChart";
import SellThroughChart from "@/components/SellThroughChart";
import { CategorySellThrough } from "@/app/api/sheets/route";

const WEATHER_CATEGORIES = [
  { key: "outer", label: "아우터" },
  { key: "padding", label: "패딩" },
  { key: "knit", label: "니트" },
  { key: "pants", label: "팬츠" },
  { key: "dress", label: "원피스" },
  { key: "acc", label: "액세서리" },
];

type Tab = "weather" | "sellrate" | "predict";

export default function DashboardPage() {
  const [tab, setTab] = useState<Tab>("weather");

  // 날씨
  const [weekly2023, setWeekly2023] = useState<WeeklyWeather[]>([]);
  const [weekly2024, setWeekly2024] = useState<WeeklyWeather[]>([]);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [weatherError, setWeatherError] = useState("");
  const [selectedCat, setSelectedCat] = useState("outer");
  const [showYear, setShowYear] = useState<"both" | "2023" | "2024">("both");

  // 정판율
  const [sellThrough, setSellThrough] = useState<CategorySellThrough[]>([]);
  const [sheetsLoading, setSheetsLoading] = useState(false);
  const [sheetsError, setSheetsError] = useState("");

  // 3단계 필터
  const [filterYear, setFilterYear] = useState("all");
  const [filterSeason, setFilterSeason] = useState("all");
  const [filterCat, setFilterCat] = useState("all");

  // 날씨 로드
  useEffect(() => {
    async function load() {
      setWeatherLoading(true);
      try {
        const [r23, r24] = await Promise.all([
          fetch("/api/weather?startDt=20230101&endDt=20231231"),
          fetch("/api/weather?startDt=20240101&endDt=20241231"),
        ]);
        const [j23, j24] = await Promise.all([r23.json(), r24.json()]);
        if (j23.error) throw new Error(`2023: ${j23.error}`);
        if (j24.error) throw new Error(`2024: ${j24.error}`);
        setWeekly2023(aggregateWeekly(j23.data));
        setWeekly2024(aggregateWeekly(j24.data));
      } catch (e: unknown) {
        setWeatherError(e instanceof Error ? e.message : "날씨 데이터 로딩 실패");
      } finally {
        setWeatherLoading(false);
      }
    }
    load();
  }, []);

  // 정판율 로드
  useEffect(() => {
    if (tab !== "sellrate" || sellThrough.length > 0) return;
    async function load() {
      setSheetsLoading(true);
      setSheetsError("");
      try {
        const res = await fetch("/api/sheets");
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        setSellThrough(json.sellThrough);
      } catch (e: unknown) {
        setSheetsError(e instanceof Error ? e.message : "구글 시트 데이터 로딩 실패");
      } finally {
        setSheetsLoading(false);
      }
    }
    load();
  }, [tab, sellThrough.length]);

  const summary = weekly2023.length && weekly2024.length ? compareYears(weekly2023, weekly2024) : null;

  // ── 3단계 연동 필터 옵션 ──
  // 1단계: 연도 옵션 (전체 데이터 기준)
  const yearOptions = useMemo(() =>
    Array.from(new Set(sellThrough.map((d) => String(d.year)))).sort(),
    [sellThrough]
  );

  // 2단계: 시즌 옵션 (연도 필터 적용 후)
  const seasonOptions = useMemo(() => {
    const base = filterYear === "all" ? sellThrough : sellThrough.filter((d) => String(d.year) === filterYear);
    return Array.from(new Set(base.map((d) => d.seasonName)))
      .sort((a, b) => parseInt(a) - parseInt(b));
  }, [sellThrough, filterYear]);

  // 3단계: 카테고리 옵션 (연도+시즌 필터 적용 후)
  const categoryOptions = useMemo(() => {
    const base = sellThrough.filter((d) => {
      const ym = filterYear === "all" || String(d.year) === filterYear;
      const sm = filterSeason === "all" || d.seasonName === filterSeason;
      return ym && sm;
    });
    return Array.from(new Set(base.map((d) => d.categoryCode))).sort();
  }, [sellThrough, filterYear, filterSeason]);

  // 필터 변경 시 하위 필터 초기화
  const handleYearChange = (v: string) => {
    setFilterYear(v);
    setFilterSeason("all");
    setFilterCat("all");
  };
  const handleSeasonChange = (v: string) => {
    setFilterSeason(v);
    setFilterCat("all");
  };

  // 최종 필터 적용 데이터
  const filteredData = useMemo(() =>
    sellThrough.filter((d) => {
      const ym = filterYear === "all" || String(d.year) === filterYear;
      const sm = filterSeason === "all" || d.seasonName === filterSeason;
      const cm = filterCat === "all" || d.categoryCode === filterCat;
      return ym && sm && cm;
    }),
    [sellThrough, filterYear, filterSeason, filterCat]
  );

  // 테이블용 요약 (최신 누적 정판율)
  const tableSummary = useMemo(() =>
    filteredData.map((d) => {
      const last = d.points.filter((p) => p.cumulativeSales > 0).slice(-1)[0];
      return {
        ...d,
        latestRate: last?.sellThroughRate ?? 0,
        latestSales: last?.cumulativeSales ?? 0,
      };
    }),
    [filteredData]
  );

  // 요약 지표
  const totalOrder = filteredData.reduce((s, d) => s + d.orderAmt, 0);
  const totalSales = tableSummary.reduce((s, d) => s + d.latestSales, 0);
  const overallRate = totalOrder > 0 ? (totalSales / totalOrder) * 100 : 0;
  const reorderCount = tableSummary.filter((d) => d.latestRate >= 70).length;

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
        {([ ["weather","🌡 날씨 분석"], ["sellrate","📊 정판율"], ["predict","🔮 시즌 예측"] ] as [Tab, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg border border-b-0 transition-colors ${
              tab === key ? "bg-white border-gray-200 text-gray-900 -mb-px" : "bg-transparent border-transparent text-gray-500 hover:text-gray-700"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── 날씨 탭 ── */}
      {tab === "weather" && (
        <div>
          {weatherLoading && <LoadingSpinner text="기상청 ASOS 데이터 불러오는 중..." />}
          {weatherError && <ErrorBox message={weatherError} sub=".env.local의 WEATHER_API_KEY를 확인해 주세요." />}
          {!weatherLoading && !weatherError && (
            <>
              {summary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                  <MetricCard label="2023 연평균 최저기온" value={`${summary.avgMinTemp2023}°C`} />
                  <MetricCard label="2024 연평균 최저기온" value={`${summary.avgMinTemp2024}°C`}
                    sub={`전년 대비 ${summary.avgMinTemp2024 > summary.avgMinTemp2023 ? "+" : ""}${(summary.avgMinTemp2024 - summary.avgMinTemp2023).toFixed(1)}°C`} />
                  <MetricCard label="영하일수 (2023/2024)" value={`${summary.coldDays2023} / ${summary.coldDays2024}일`} />
                  <MetricCard label="한파일수 (2023/2024)" value={`${summary.harshDays2023} / ${summary.harshDays2024}일`} sub="최저기온 -10°C 미만" />
                </div>
              )}
              <div className="flex flex-wrap gap-3 mb-4">
                <select value={showYear} onChange={(e) => setShowYear(e.target.value as "both"|"2023"|"2024")}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
                  <option value="both">2023 + 2024 비교</option>
                  <option value="2023">2023년만</option>
                  <option value="2024">2024년만</option>
                </select>
                <select value={selectedCat} onChange={(e) => setSelectedCat(e.target.value)}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
                  {WEATHER_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
                  주간 최저기온 × {WEATHER_CATEGORIES.find((c) => c.key === selectedCat)?.label} 판매 지수
                </p>
                <WeatherChart data2023={weekly2023} data2024={weekly2024} selectedCategory={selectedCat} showYear={showYear} />
              </div>
              <p className="mt-4 text-xs text-gray-400">데이터 출처: 기상청 기상자료개방포털 ASOS (서울 관측소 108)</p>
            </>
          )}
        </div>
      )}

      {/* ── 정판율 탭 ── */}
      {tab === "sellrate" && (
        <div>
          {sheetsLoading && <LoadingSpinner text="구글 시트에서 데이터 불러오는 중..." />}
          {sheetsError && <ErrorBox message={sheetsError} sub="구글 시트가 공개(뷰어) 설정인지 확인해 주세요." />}

          {!sheetsLoading && !sheetsError && sellThrough.length > 0 && (
            <>
              {/* 3단계 필터 */}
              <div className="bg-white rounded-xl border border-gray-100 p-4 mb-5">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">필터</p>
                <div className="flex flex-wrap gap-3">
                  {/* 1단계: 연도 */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-400">연도</label>
                    <select value={filterYear} onChange={(e) => handleYearChange(e.target.value)}
                      className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white min-w-[100px]">
                      <option value="all">전체</option>
                      {yearOptions.map((y) => <option key={y} value={y}>{y}년</option>)}
                    </select>
                  </div>

                  {/* 2단계: 시즌 */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-400">시즌</label>
                    <select value={filterSeason} onChange={(e) => handleSeasonChange(e.target.value)}
                      className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white min-w-[110px]">
                      <option value="all">전체</option>
                      {seasonOptions.map((s) => <option key={s} value={s}>시즌 {s}</option>)}
                    </select>
                  </div>

                  {/* 3단계: 카테고리 */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-400">카테고리</label>
                    <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)}
                      className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white min-w-[130px]">
                      <option value="all">전체</option>
                      {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  {/* 필터 초기화 */}
                  <div className="flex flex-col gap-1 justify-end">
                    <button onClick={() => { handleYearChange("all"); }}
                      className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-3 py-2 bg-white transition-colors">
                      초기화
                    </button>
                  </div>
                </div>
              </div>

              {/* 요약 지표 — 필터 적용 결과 기준 */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                <MetricCard label="조회 카테고리" value={`${tableSummary.length}개`} />
                <MetricCard
                  label="발주액 합계"
                  value={totalOrder >= 100000000
                    ? `${(totalOrder / 100000000).toFixed(1)}억`
                    : `${(totalOrder / 10000).toLocaleString()}만`}
                  sub="KRW"
                />
                <MetricCard
                  label="누적 판매액"
                  value={totalSales >= 100000000
                    ? `${(totalSales / 100000000).toFixed(1)}억`
                    : `${(totalSales / 10000).toLocaleString()}만`}
                  sub="KRW"
                />
                <MetricCard
                  label="종합 정판율"
                  value={`${overallRate.toFixed(1)}%`}
                  sub={`리오더 권장 ${reorderCount}개`}
                  highlight={overallRate >= 70 ? "green" : overallRate >= 50 ? "amber" : "red"}
                />
              </div>

              {/* 누적 정판율 차트 */}
              {filteredData.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 p-4 mb-5">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">누적 정판율 추이</p>
                  <p className="text-xs text-gray-400 mb-3">
                    실선 = 2024 · 점선 = 2023 · <span style={{color:"#D85A30"}}>— 70% 기준선</span>
                  </p>
                  <SellThroughChart
                    data={filteredData}
                    selectedCategory={filterCat}
                    selectedSeason={filterSeason}
                  />
                </div>
              )}

              {/* 테이블 */}
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">카테고리별 정판율</p>
                  <p className="text-xs text-gray-400">{tableSummary.length}개 항목</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">연도</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">시즌</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">카테고리</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">발주액</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">누적판매액</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">정판율</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">진행바</th>
                        <th className="text-center px-4 py-3 text-xs font-medium text-gray-500">리오더</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableSummary.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">
                            조건에 맞는 데이터가 없습니다.
                          </td>
                        </tr>
                      ) : (
                        tableSummary
                          .sort((a, b) => b.latestRate - a.latestRate)
                          .map((d) => (
                            <tr key={`${d.year}_${d.seasonNo}_${d.categoryCode}`}
                              className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                              <td className="px-4 py-3 text-gray-500">{d.year}</td>
                              <td className="px-4 py-3 text-gray-500">시즌 {d.seasonName}</td>
                              <td className="px-4 py-3 font-medium text-gray-900">{d.categoryCode}</td>
                              <td className="px-4 py-3 text-right text-gray-500 tabular-nums">
                                {d.orderAmt >= 100000000
                                  ? `${(d.orderAmt / 100000000).toFixed(1)}억`
                                  : `${(d.orderAmt / 10000).toLocaleString()}만`}
                              </td>
                              <td className="px-4 py-3 text-right text-gray-500 tabular-nums">
                                {d.latestSales >= 100000000
                                  ? `${(d.latestSales / 100000000).toFixed(1)}억`
                                  : `${(d.latestSales / 10000).toLocaleString()}만`}
                              </td>
                              <td className="px-4 py-3 text-right font-semibold tabular-nums"
                                style={{ color: rateColor(d.latestRate) }}>
                                {d.latestRate.toFixed(1)}%
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-end gap-2">
                                  <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                    <div className="h-full rounded-full transition-all"
                                      style={{
                                        width: `${Math.min(100, d.latestRate)}%`,
                                        background: rateColor(d.latestRate),
                                      }} />
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <ReorderBadge rate={d.latestRate} />
                              </td>
                            </tr>
                          ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="mt-3 text-xs text-gray-400">
                정판율 = 누적 정상판매액 ÷ 발주액[정상가+예판가] · 출처: 스판재 × 매출상세 구글 시트
              </p>
            </>
          )}
        </div>
      )}

      {/* ── 예측 탭 ── */}
      {tab === "predict" && (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
          <p className="text-sm text-gray-500">🔮 AI 예측은 다음 단계에서 활성화됩니다.</p>
        </div>
      )}
    </main>
  );
}

// ── 공통 컴포넌트 ──

function MetricCard({ label, value, sub, highlight }: {
  label: string; value: string; sub?: string; highlight?: "green"|"amber"|"red";
}) {
  const colors = { green: "#3B6D11", amber: "#854F0B", red: "#A32D2D" };
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-xl font-semibold" style={{ color: highlight ? colors[highlight] : undefined }}>
        {value}
      </p>
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

function ErrorBox({ message, sub }: { message: string; sub?: string }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
      <strong>오류:</strong> {message}
      {sub && <p className="mt-1 text-xs text-red-500">{sub}</p>}
    </div>
  );
}

function rateColor(rate: number) {
  if (rate >= 70) return "#3B6D11";
  if (rate >= 50) return "#854F0B";
  return "#A32D2D";
}

function ReorderBadge({ rate }: { rate: number }) {
  if (rate >= 70) return <span className="text-xs font-medium px-2 py-1 rounded-md bg-green-50 text-green-800">리오더 권장</span>;
  if (rate >= 50) return <span className="text-xs font-medium px-2 py-1 rounded-md bg-amber-50 text-amber-800">조건부 검토</span>;
  return <span className="text-xs font-medium px-2 py-1 rounded-md bg-red-50 text-red-800">리오더 보류</span>;
}
