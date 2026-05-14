"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { CategorySellThrough } from "@/app/api/sheets/route";

type Props = {
  data: CategorySellThrough[];
  selectedCategory: string;
  selectedSeason: string;
};

const COLORS_2023 = ["#378ADD", "#1D9E75", "#D85A30", "#D4537E", "#888780", "#534AB7"];
const COLORS_2024 = ["#185FA5", "#0F6E56", "#993C1D", "#993556", "#444441", "#3C3489"];

export default function SellThroughChart({ data, selectedCategory, selectedSeason }: Props) {
  // 선택 필터 적용
  const filtered = data.filter((d) => {
    const catMatch = selectedCategory === "all" || d.categoryCode === selectedCategory;
    const seasonMatch = selectedSeason === "all" || d.seasonName === selectedSeason;
    return catMatch && seasonMatch;
  });

  // 주차 레이블 수집 (전체 union)
  const allWeeks = Array.from(
    new Set(filtered.flatMap((d) => d.points.map((p) => p.weekLabel)))
  ).sort();

  // 차트 데이터: 주차별로 각 시리즈 값 매핑
  const chartData = allWeeks.map((week) => {
    const point: Record<string, number | string> = { week };
    filtered.forEach((series) => {
      const key = `${series.year}_${series.categoryCode}_${series.seasonName}`;
      const found = series.points.find((p) => p.weekLabel === week);
      point[key] = found?.sellThroughRate ?? 0;
    });
    return point;
  });

  // 시리즈별 색상
  const catCodes = Array.from(new Set(filtered.map((d) => d.categoryCode)));

  return (
    <ResponsiveContainer width="100%" height={340}>
      <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.15)" />
        <XAxis
          dataKey="week"
          tick={{ fontSize: 10 }}
          interval={Math.floor(allWeeks.length / 8)}
          angle={-30}
          textAnchor="end"
          height={40}
        />
        <YAxis
          tickFormatter={(v) => `${v}%`}
          tick={{ fontSize: 11 }}
          domain={[0, 120]}
          ticks={[0, 20, 40, 60, 70, 80, 100, 120]}
        />
        <Tooltip
          formatter={(value: number, name: string) => {
            const [year, code, season] = name.split("_");
            return [`${value.toFixed(1)}%`, `${year} ${season} ${code}`];
          }}
        />
        <ReferenceLine y={70} stroke="#D85A30" strokeDasharray="6 4" strokeWidth={1.5}
          label={{ value: "리오더 기준 70%", position: "insideTopRight", fontSize: 11, fill: "#D85A30" }}
        />

        {filtered.map((series) => {
          const key = `${series.year}_${series.categoryCode}_${series.seasonName}`;
          const catIdx = catCodes.indexOf(series.categoryCode);
          const color = series.year === 2023
            ? COLORS_2023[catIdx % COLORS_2023.length]
            : COLORS_2024[catIdx % COLORS_2024.length];
          const dash = series.year === 2023 ? "5 3" : "0";

          return (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              name={key}
              stroke={color}
              strokeDasharray={dash}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          );
        })}

        <Legend
          formatter={(value: string) => {
            const [year, code, season] = value.split("_");
            return `${year} ${season} ${code}`;
          }}
          wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
