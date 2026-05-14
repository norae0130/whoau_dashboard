import { NextRequest, NextResponse } from "next/server";

// 기상청 기상자료개방포털 ASOS (지상 종관기상관측) API
// 서울 관측소 코드: 108
const ASOS_BASE = "https://apis.data.go.kr/1360000/AsosDalyInfoService/getWthrDataList";
const STATION_ID = "108"; // 서울

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const startDt = searchParams.get("startDt"); // e.g. "20230101"
  const endDt = searchParams.get("endDt");     // e.g. "20231231"

  if (!startDt || !endDt) {
    return NextResponse.json({ error: "startDt, endDt 파라미터가 필요합니다." }, { status: 400 });
  }

  const apiKey = process.env.WEATHER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "API 키가 설정되지 않았습니다." }, { status: 500 });
  }

  // 기상청 ASOS는 한 번에 최대 365건 → 연도별로 두 번 호출
  const url = new URL(ASOS_BASE);
  url.searchParams.set("serviceKey", apiKey);
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", "366");
  url.searchParams.set("dataType", "JSON");
  url.searchParams.set("dataCd", "ASOS");
  url.searchParams.set("dateCd", "DAY");
  url.searchParams.set("startDt", startDt);
  url.searchParams.set("endDt", endDt);
  url.searchParams.set("stnIds", STATION_ID);

  try {
    const res = await fetch(url.toString(), { next: { revalidate: 3600 } }); // 1시간 캐시
    if (!res.ok) throw new Error(`기상청 API 오류: ${res.status}`);

    const json = await res.json();

    // 응답 구조: response.body.items.item[]
    const items = json?.response?.body?.items?.item;
    if (!items || !Array.isArray(items)) {
      return NextResponse.json({ error: "데이터 없음", raw: json }, { status: 502 });
    }

    // 필요한 필드만 추출
    const data = items.map((row: Record<string, string>) => ({
      date: row.tm,           // "2023-01-01"
      minTemp: parseFloat(row.minTa ?? "0"),   // 일 최저기온 (°C)
      maxTemp: parseFloat(row.maxTa ?? "0"),   // 일 최고기온
      avgTemp: parseFloat(row.avgTa ?? "0"),   // 일 평균기온
      rain: parseFloat(row.sumRn ?? "0"),      // 일 강수량 (mm)
      snow: parseFloat(row.ddMes ?? "0"),      // 신적설 (cm)
    }));

    return NextResponse.json({ data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
