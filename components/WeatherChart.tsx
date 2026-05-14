"use client";

import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { WeeklyWeather, estimateCategorySalesIndex } from "@/lib/weather";

type Props = {
  data2023: WeeklyWeather[];
  data2024: WeeklyWeather[];
  selectedCategory: string;
  showYear: "both" | "2023" | "2024";
};

export default function WeatherChart({ data2023, data2024, selectedCategory, showYear }: Props) {
  // 주차 기준으로 병합
  const maxWeeks = Math.max(data2023.length, data2024.length);
  const chartData = Array.from({ length: maxWeeks }, (_, i) => {
    const w23 = data2023[i];
    const w24 = data2024[i];
    const salesIdx23 = w23 ? estimateCategorySalesIndex(w23.avgMinTemp)[selectedCategory] : null;
    const salesIdx24 = w24 ? estimateCategorySalesIndex(w24.avgMinTemp)[selectedCategory] : null;

    return {
      label: `W${String((w23 ?? w24)?.week ?? i + 1).padStart(2, "0")}`,
      minTemp2023: w23?.avgMinTemp ?? null,
      minTemp2024: w24?.avgMinTemp ?? null,
      sales2023: salesIdx23,
      sales2024: salesIdx24,
    };
  });

  const CAT_NAMES: Record<string, string> = {
    outer: "아우터", padding: "패딩", knit: "니트", pants: "팬츠", dress: "원피스", acc: "액세서리",
  };

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.15)" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={3} />
        <YAxis
          yAxisId="temp"
          domain={[-15, 35]}
          tick={{ fontSize: 11 }}
          tickFormatter={(v) => `${v}°`}
          label={{ value: "최저기온(°C)", angle: -90, position: "insideLeft", fontSize: 11, dy: 40 }}
        />
        <YAxis
          yAxisId="sales"
          orientation="right"
          domain={[0, 110]}
          tick={{ fontSize: 11 }}
          tickFormatter={(v) => `${v}`}
          label={{ value: "판매 지수", angle: 90, position: "insideRight", fontSize: 11, dy: -30 }}
        />
        <Tooltip
          formatter={(value: number, name: string) => {
            if (name.includes("기온")) return [`${value}°C`, name];
            return [`${value}`, name];
          }}
        />
        <ReferenceLine yAxisId="temp" y={0} stroke="rgba(216,90,48,0.4)" strokeDasharray="4 4" />

        {showYear !== "2024" && (
          <Line yAxisId="temp" type="monotone" dataKey="minTemp2023" name="2023 최저기온" stroke="#378ADD" dot={false} strokeWidth={2} />
        )}
        {showYear !== "2023" && (
          <Line yAxisId="temp" type="monotone" dataKey="minTemp2024" name="2024 최저기온" stroke="#D85A30" dot={false} strokeWidth={2} />
        )}
        {showYear !== "2024" && (
          <Bar yAxisId="sales" dataKey="sales2023" name={`2023 ${CAT_NAMES[selectedCategory]} 판매지수`} fill="rgba(55,138,221,0.3)" />
        )}
        {showYear !== "2023" && (
          <Bar yAxisId="sales" dataKey="sales2024" name={`2024 ${CAT_NAMES[selectedCategory]} 판매지수`} fill="rgba(216,90,48,0.3)" />
        )}

        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
