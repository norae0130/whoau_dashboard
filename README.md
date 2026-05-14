# Who.A.U MD Dashboard

리오더 의사결정 시스템 — 기상청 ASOS × 카테고리 정판율 × AI 예측

---

## 로컬 실행

### 1. 의존성 설치
```bash
npm install
```

### 2. API 키 설정
프로젝트 루트에 `.env.local` 파일 생성:
```
WEATHER_API_KEY=공공데이터포털에서_발급받은_키
```

> ⚠️ `.env.local`은 절대 GitHub에 올리면 안 됩니다. `.gitignore`에 포함되어 있습니다.

### 3. 개발 서버 실행
```bash
npm run dev
```
→ http://localhost:3000 열기

---

## Vercel 배포

### 1. GitHub에 올리기
```bash
git init
git add .
git commit -m "initial commit"
# GitHub에서 새 repo 만들고:
git remote add origin https://github.com/YOUR_ID/whoau-dashboard.git
git push -u origin main
```

### 2. Vercel 연결
1. https://vercel.com 접속 → GitHub 로그인
2. "New Project" → whoau-dashboard repo 선택
3. **Environment Variables** 섹션에서:
   - `WEATHER_API_KEY` = 공공데이터포털 API 키
4. Deploy 클릭

### 3. 공공데이터포털 허용 도메인 추가
배포 후 Vercel이 제공하는 도메인(예: `whoau-dashboard.vercel.app`)을
공공데이터포털 → 마이페이지 → 활용 신청 관리 → 해당 API → 상세보기 → 허용 도메인에 추가

---

## API 구조

| 엔드포인트 | 설명 |
|---|---|
| `GET /api/weather?startDt=20230101&endDt=20231231` | 기상청 ASOS 일별 데이터 조회 |

---

## 다음 단계
- [ ] ERP 판매 데이터 CSV 업로드 연동 (`/api/sales`)
- [ ] 정판율 주별 차트 활성화
- [ ] Claude AI 리오더 예측 패널 연동
