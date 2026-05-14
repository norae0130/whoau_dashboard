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
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";

type WeekPoint = {
  week: string;        // "2023-36"
  minTemp: number | null;
  sellRate: number | null; // 2개년 평균 정판율 %
};

type Props = {
  data: WeekPoint[];
};

export default function WeatherSellChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={340}>
      <ComposedChart data={data} margin={{ top: 8, right: 24, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.12)" />
        <XAxis
          dataKey="week"
          tick={{ fontSize: 10 }}
          interval={Math.max(1, Math.floor(data.length / 10))}
          angle={-30}
          textAnchor="end"
          height={44}
        />

        {/* 왼쪽 Y축: 최저기온 */}
        <YAxis
          yAxisId="temp"
          domain={[-15, 35]}
          tickFormatter={(v) => `${v}°`}
          tick={{ fontSize: 11 }}
          label={{ value: "최저기온(°C)", angle: -90, position: "insideLeft", fontSize: 11, dy: 45 }}
          width={52}
        />

        {/* 오른쪽 Y축: 정판율 */}
        <YAxis
          yAxisId="rate"
          orientation="right"
          domain={[0, 110]}
          tickFormatter={(v) => `${v}%`}
          tick={{ fontSize: 11 }}
          label={{ value: "정판율(%)", angle: 90, position: "insideRight", fontSize: 11, dy: -30 }}
          width={52}
        />

        <Tooltip
          formatter={(value: number, name: string) => {
            if (name === "최저기온") return [`${value}°C`, name];
            return [`${Number(value).toFixed(1)}%`, name];
          }}
          labelStyle={{ fontSize: 12, fontWeight: 500 }}
          contentStyle={{ fontSize: 12 }}
        />

        <ReferenceLine yAxisId="temp" y={0} stroke="rgba(216,90,48,0.35)" strokeDasharray="4 4" />
        <ReferenceLine yAxisId="rate" y={70} stroke="#D85A30" strokeDasharray="6 3" strokeWidth={1.5}
          label={{ value: "70%", position: "insideTopRight", fontSize: 10, fill: "#D85A30" }} />

        {/* 정판율 막대 */}
        <Bar
          yAxisId="rate"
          dataKey="sellRate"
          name="2개년 평균 정판율"
          fill="rgba(29,158,117,0.45)"
          stroke="rgba(29,158,117,0.7)"
          strokeWidth={0.5}
          radius={[2, 2, 0, 0]}
          maxBarSize={18}
        />

        {/* 최저기온 선 */}
        <Line
          yAxisId="temp"
          type="monotone"
          dataKey="minTemp"
          name="최저기온"
          stroke="#378ADD"
          strokeWidth={2}
          dot={false}
          connectNulls
        />

        <Legend
          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
          formatter={(v) => v}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
