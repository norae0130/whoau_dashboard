"use client";

import { useEffect, useState } from "react";
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
  const [filterCat, setFilterCat] = useState("all");
  const [filterSeason, setFilterSeason] = useState("all");

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
  // G열 시즌은 숫자(1,2,3,4)이므로 숫자 정렬
  const seasonOptions = Array.from(new Set(sellThrough.map((d) => d.seasonName)))
    .sort((a, b) => parseInt(a) - parseInt(b));
  const categoryOptions = Array.from(new Set(sellThrough.map((d) => d.categoryCode))).sort();

  const categorySummary = sellThrough.map((d) => {
    const last = d.points.filter((p) => p.cumulativeSales > 0).slice(-1)[0];
    return { ...d, latestRate: last?.sellThroughRate ?? 0, latestSales: last?.cumulativeSales ?? 0 };
  });

  const filteredSummary = categorySummary.filter((d) => {
    const cm = filterCat === "all" || d.categoryCode === filterCat;
    const sm = filterSeason === "all" || d.seasonName === filterSeason;
    return cm && sm;
  });

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mb-6">
        <p className="text-xs text-gray-400 font-medium tracking-widest uppercase mb-1">Who.A.U MD Dashboard</p>
        <h1 className="text-2xl font-semibold text-gray-900">리오더 의사결정 시스템</h1>
        <p className="text-sm text-gray-500 mt-1">기상청 ASOS × 카테고리 정판율 × AI 예측</p>
      </div>

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

      {/* 날씨 탭 */}
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

      {/* 정판율 탭 */}
      {tab === "sellrate" && (
        <div>
          {sheetsLoading && <LoadingSpinner text="구글 시트에서 데이터 불러오는 중..." />}
          {sheetsError && <ErrorBox message={sheetsError} sub="구글 시트가 공개(뷰어) 설정인지 확인해 주세요." />}
          {!sheetsLoading && !sheetsError && sellThrough.length > 0 && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <MetricCard label="총 카테고리 수" value={`${categoryOptions.length}개`} />
                <MetricCard label="전체 발주액 합계"
                  value={`${(sellThrough.reduce((s, d) => s + d.orderAmt, 0) / 100000000).toFixed(1)}억`} sub="KRW" />
                <MetricCard label="70%↑ 카테고리"
                  value={`${categorySummary.filter((d) => d.latestRate >= 70).length}개`} sub="리오더 권장" />
                <MetricCard label="평균 정판율"
                  value={`${(categorySummary.reduce((s, d) => s + d.latestRate, 0) / Math.max(1, categorySummary.length)).toFixed(1)}%`}
                  sub="누적 기준" />
              </div>

              <div className="flex flex-wrap gap-3 mb-4">
                <select value={filterSeason} onChange={(e) => setFilterSeason(e.target.value)}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
                  <option value="all">전체 시즌</option>
                  {seasonOptions.map((s) => <option key={s} value={s}>시즌 {s}</option>)}
                </select>
                <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
                  <option value="all">전체 카테고리</option>
                  {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div className="bg-white rounded-xl border border-gray-100 p-4 mb-6">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">누적 정판율 추이</p>
                <p className="text-xs text-gray-400 mb-3">실선 = 2024 · 점선 = 2023 · 주황 기준선 = 70%</p>
                <SellThroughChart data={sellThrough} selectedCategory={filterCat} selectedSeason={filterSeason} />
              </div>

              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {["연도","시즌","카테고리","발주액","누적판매액","정판율","리오더 판단"].map((h, i) => (
                        <th key={h} className={`px-4 py-3 text-xs font-medium text-gray-400 ${i >= 3 ? "text-right" : "text-left"} ${i === 6 ? "text-center" : ""}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSummary.map((d) => (
                      <tr key={`${d.year}_${d.seasonNo}_${d.categoryCode}`}
                        className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-gray-600">{d.year}</td>
                        <td className="px-4 py-3 text-gray-600">{d.seasonName}</td>
                        <td className="px-4 py-3 font-medium">{d.categoryCode} <span className="text-gray-400 text-xs">{d.categoryName}</span></td>
                        <td className="px-4 py-3 text-right text-gray-600">{(d.orderAmt / 10000).toLocaleString()}만</td>
                        <td className="px-4 py-3 text-right text-gray-600">{(d.latestSales / 10000).toLocaleString()}만</td>
                        <td className="px-4 py-3 text-right font-semibold" style={{ color: rateColor(d.latestRate) }}>
                          {d.latestRate.toFixed(1)}%
                        </td>
                        <td className="px-4 py-3 text-center"><ReorderBadge rate={d.latestRate} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-gray-400">
                출처: 스판재(발주액) × 매출상세(주차별 정상판매액) · 정판율 = 누적 정상판매액 ÷ 발주액[정상가+예판가]
              </p>
            </>
          )}
        </div>
      )}

      {/* 예측 탭 */}
      {tab === "predict" && (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
          <p className="text-sm text-gray-500">🔮 AI 예측은 다음 단계에서 활성화됩니다.</p>
        </div>
      )}
    </main>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-xl font-semibold text-gray-900">{value}</p>
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
