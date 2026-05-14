"use client";

import { useEffect, useState } from "react";
import { aggregateWeekly, compareYears, WeeklyWeather } from "@/lib/weather";
import WeatherChart from "@/components/WeatherChart";

const CATEGORIES = [
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
  const [weekly2023, setWeekly2023] = useState<WeeklyWeather[]>([]);
  const [weekly2024, setWeekly2024] = useState<WeeklyWeather[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedCat, setSelectedCat] = useState("outer");
  const [showYear, setShowYear] = useState<"both" | "2023" | "2024">("both");

  useEffect(() => {
    async function load() {
      setLoading(true);
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
        setError(e instanceof Error ? e.message : "데이터 로딩 실패");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const summary = weekly2023.length && weekly2024.length ? compareYears(weekly2023, weekly2024) : null;

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
        {([["weather","🌡 날씨 분석"],["sellrate","📊 정판율"],["predict","🔮 시즌 예측"]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg border border-b-0 transition-colors ${
              tab === key
                ? "bg-white border-gray-200 text-gray-900 -mb-px"
                : "bg-transparent border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 로딩 / 에러 */}
      {loading && (
        <div className="flex items-center gap-3 py-12 justify-center text-gray-400">
          <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">기상청 ASOS 데이터 불러오는 중...</span>
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          <strong>오류:</strong> {error}
          <p className="mt-1 text-xs text-red-500">.env.local의 WEATHER_API_KEY를 확인해 주세요.</p>
        </div>
      )}

      {/* 날씨 탭 */}
      {!loading && !error && tab === "weather" && (
        <div>
          {/* 요약 지표 */}
          {summary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {[
                { label: "2023 연평균 최저기온", value: `${summary.avgMinTemp2023}°C` },
                { label: "2024 연평균 최저기온", value: `${summary.avgMinTemp2024}°C`,
                  sub: `전년 대비 ${summary.avgMinTemp2024 > summary.avgMinTemp2023 ? "+" : ""}${(summary.avgMinTemp2024 - summary.avgMinTemp2023).toFixed(1)}°C` },
                { label: "영하일수 (2023/2024)", value: `${summary.coldDays2023} / ${summary.coldDays2024}일` },
                { label: "한파일수 (2023/2024)", value: `${summary.harshDays2023} / ${summary.harshDays2024}일`,
                  sub: "최저기온 -10°C 미만" },
              ].map((m) => (
                <div key={m.label} className="bg-white rounded-xl border border-gray-100 p-4">
                  <p className="text-xs text-gray-400 mb-1">{m.label}</p>
                  <p className="text-xl font-semibold text-gray-900">{m.value}</p>
                  {m.sub && <p className="text-xs text-gray-400 mt-0.5">{m.sub}</p>}
                </div>
              ))}
            </div>
          )}

          {/* 필터 */}
          <div className="flex flex-wrap gap-3 mb-4">
            <select
              value={showYear}
              onChange={(e) => setShowYear(e.target.value as typeof showYear)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white"
            >
              <option value="both">2023 + 2024 비교</option>
              <option value="2023">2023년만</option>
              <option value="2024">2024년만</option>
            </select>
            <select
              value={selectedCat}
              onChange={(e) => setSelectedCat(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white"
            >
              {CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
              주간 최저기온 × {CATEGORIES.find((c) => c.key === selectedCat)?.label} 판매 지수
            </p>
            <WeatherChart
              data2023={weekly2023}
              data2024={weekly2024}
              selectedCategory={selectedCat}
              showYear={showYear}
            />
          </div>

          <p className="mt-4 text-xs text-gray-400">
            데이터 출처: 기상청 기상자료개방포털 ASOS (서울 관측소 108) · 판매 지수는 온도 기반 추정값 (실 판매 데이터 연동 시 자동 교체)
          </p>
        </div>
      )}

      {/* 정판율 탭 — 다음 단계에서 판매 데이터 연동 */}
      {tab === "sellrate" && (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
          <p className="text-sm text-gray-500">📋 정판율 분석은 ERP/판매 데이터 연동 후 활성화됩니다.</p>
          <p className="text-xs text-gray-400 mt-2">CSV 업로드 또는 API 연동 방식 중 선택해 주세요.</p>
        </div>
      )}

      {/* 예측 탭 */}
      {tab === "predict" && (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
          <p className="text-sm text-gray-500">🔮 AI 예측은 판매 데이터 연동 후 활성화됩니다.</p>
        </div>
      )}
    </main>
  );
}
