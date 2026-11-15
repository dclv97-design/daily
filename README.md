# 데일리 — 주식 분석 + 마이 노트 (iPhone 홈 화면 앱)

시작 화면에서 두 앱 중 하나를 골라 들어갑니다.

- **주식 분석**
  - 평일 06:50(한국 시간)에 GitHub Actions가 자동으로 분석합니다.
  - 내용: 성향 맞춤 발굴, 고변동 발굴, 보유 종목 점검
  - 결과는 암호화해서 올리고, 끝나면 아이폰으로 푸시 알림을 보냅니다.
- **마이 노트**
  - 기능: 했어야 할 말, 대화 장전, 행동 실험, 판단 노트(채점·적중률), 좋음 앨범, 나를 정의하는 문장
  - 모든 기록은 **아이폰에만** 저장됩니다(서버로 보내지 않음).

```
daily-app/
├─ docs/                 ← 아이폰에서 여는 웹앱 (GitHub Pages로 공개)
│  └─ data/              ← 매일 생성되는 암호화된 분석 결과
├─ engine/               ← 매일 분석을 돌리는 Node 스크립트
└─ .github/workflows/    ← 06:50 자동 실행 설정
```

> 보유 종목 원본(`holdings.json`)과 마이 노트 초기 데이터(`note-seed.json`)는 옆의 **daily-app-private** 폴더에 따로 있습니다. 이 폴더는 **GitHub에 올리지 마세요.**

---

## 처음 설정 (약 20~30분, 한 번만)

계정 생성, API 키 발급, 비밀값 입력은 직접 하셔야 하는 단계입니다.

### 1. GitHub 저장소 만들기
1. https://github.com 에 가입하거나 로그인합니다.
2. 오른쪽 위 **+ → New repository**를 누르고 아래처럼 만듭니다.
   - 이름: 예) `daily`
   - **Public** 선택 (무료 GitHub Pages는 공개 저장소에서만 됩니다)
   - **Add a README**는 체크하지 않습니다.
3. 데이터가 공개되지 않는 이유는 다음과 같습니다.
   - 분석 결과는 암호화되어 올라갑니다.
   - 보유 종목은 Secret(비공개 값)으로 들어갑니다.
   - 마이 노트는 아이폰에만 저장됩니다.
   - 공개되는 것은 코드뿐입니다.

### 2. 파일 올리기
- **쉬운 방법:** [GitHub Desktop](https://desktop.github.com)을 설치합니다. 저장소를 내 PC로 Clone한 뒤, `daily-app` 폴더 **안의 내용 전부**를 그 폴더에 복사하고 Commit → Push 합니다.
- **웹으로 올리기:** 저장소 페이지에서 **Add file → Upload files**를 누르고, `daily-app` 폴더 안의 `docs`, `engine`, `.github`, `README.md`, `.gitignore`를 끌어다 놓습니다.
  - 올린 뒤 저장소에 `.github/workflows/daily.yml`이 보이는지 꼭 확인하세요.
  - 안 보이면 **Add file → Create new file**을 누르고, 이름에 `.github/workflows/daily.yml`을 입력한 뒤 파일 내용을 붙여넣습니다.

### 3. Anthropic API 키 발급
1. https://console.anthropic.com 에서 로그인합니다.
2. 결제 수단을 등록합니다(사용량만큼 과금).
3. **API Keys**에서 키를 만듭니다. 키는 한 번만 보이니 바로 복사해 두세요.

### 4. Secret(비공개 값) 넣기
저장소 **Settings → Secrets and variables → Actions → New repository secret**에서 하나씩 추가합니다.

| 이름 | 넣을 값 |
|---|---|
| `ANTHROPIC_API_KEY` | 3단계에서 만든 키 |
| `DATA_PASSPHRASE` | 직접 정한 긴 암호(예: 단어 4~5개를 이은 문장). 아이폰 앱에도 같은 값을 입력합니다 |
| `HOLDINGS_JSON` | `daily-app-private/holdings.json` 파일 내용 전체 (보유 종목을 공개 저장소에 올리지 않기 위해 Secret에 넣습니다) |

`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `PUSH_SUBSCRIPTION`은 8단계(알림)에서 추가합니다.

### 5. Actions 쓰기 권한 켜기
**Settings → Actions → General → Workflow permissions**에서 **Read and write permissions**를 선택하고 Save를 누릅니다.

### 6. GitHub Pages 켜기
**Settings → Pages → Build and deployment**에서 아래처럼 설정하고 Save를 누릅니다.
- Source: **Deploy from a branch**
- Branch: **main**, 폴더: **/docs**

1~2분 뒤 `https://<GitHub아이디>.github.io/<저장소이름>/` 주소가 생깁니다.

### 7. 첫 분석 실행
1. **Actions** 탭에서 **daily-analysis**를 고릅니다.
2. **Run workflow**를 누릅니다.
3. 3~10분 뒤 초록색 체크가 뜨면 성공입니다. 빨간색이면 로그를 열어 확인합니다(아래 문제 해결 참고).

### 8. 아이폰에 설치하고 알림 켜기
1. 아이폰 **Safari**에서 6단계 주소를 엽니다.
2. 공유 버튼 → **홈 화면에 추가**를 누릅니다.
3. 홈 화면의 **데일리** 아이콘으로 엽니다. 이후 단계는 모두 이 아이콘으로 연 상태에서 해야 합니다.
4. 시작 화면 아래 **설정**에서 다음을 진행합니다.
   1. **주식 데이터 암호**에 `DATA_PASSPHRASE`와 같은 값을 입력하고 저장합니다.
   2. **알림 키 만들기**를 누르고, 나온 두 값을 GitHub Secret `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`에 각각 넣습니다.
   3. **알림 허용하고 연결하기**를 누르고 허용합니다. 나온 연결 정보를 Secret `PUSH_SUBSCRIPTION`에 넣습니다.
5. Actions에서 **Run workflow**를 한 번 더 실행하면 알림이 오는지 확인할 수 있습니다.

iOS 16.4 이상, 그리고 홈 화면에 추가한 앱에서만 웹 알림이 됩니다.

### 9. (선택) 마이 노트에 지금까지 정리한 문장 넣기
`daily-app-private/note-seed.json`에는 대화에서 정리한 세 문장, 못 참는 것 → 지키고 싶은 것, 버퍼 문장, 친구와의 행동 실험 1건이 들어 있습니다.
1. 이 파일을 AirDrop이나 iCloud Drive로 아이폰에 옮깁니다.
2. 앱의 **설정 → 백업 불러오기**에서 고릅니다.

---

## 평소에 쓰는 법

- **보유 종목이 바뀌면:** GitHub Secret `HOLDINGS_JSON`의 값을 새 내용으로 바꿉니다(Settings → Secrets and variables → Actions → HOLDINGS_JSON → Update). 다음 날 아침 분석부터 반영됩니다.
  - 한국 종목은 `code`(6자리)와 `cost`(원화 총 매수금액)를 씁니다.
  - 미국 종목은 `ticker`와 `costKRW`(원화 환산 총 매수금액)를 씁니다.
  - 형식은 `engine/config/holdings.example.json`을 참고하세요.
- **발굴 대상·기준을 바꾸려면:** `engine/config/universe.json`을 수정합니다.
  - 들어 있는 것: 익숙한 종목 목록, 미국 대형주 목록, 변동성·위치·하락 진정·유동성 기준
- **마이 노트 백업:** 기기를 바꾸거나 Safari 데이터를 지우면 노트가 사라집니다. 가끔 **설정 → 백업 파일 저장**으로 파일을 남겨 두세요.
- **앱 화면을 고친 뒤:** `docs/sw.js`의 `VERSION` 값을 바꿔야 아이폰에 새 화면이 바로 반영됩니다(예: `v1` → `v2`).

## 비용과 한계

- **GitHub Actions와 Pages:** 공개 저장소는 무료입니다.
- **Claude API:** 하루 1회 실행되며, 한 번에 웹 검색을 최대 20회 하는 호출 1건입니다.
  - 추정 비용은 하루 $0.3~0.8, 월 $10 안팎입니다. 정확한 금액은 Anthropic Console의 Usage에서 첫 주에 꼭 확인하세요.
  - 줄이려면 `engine/lib/claude.mjs`의 `max_uses`를 낮춥니다.
  - API 키가 없어도 분석은 돌아갑니다. 이 경우 촉매와 이벤트가 "미확인"으로 나오고, 고변동 발굴은 비어 있습니다.
- **실행 시각:** GitHub는 예약 실행을 몇 분에서 수십 분 늦게 시작할 수 있습니다. 6:50에 시작해도 7시를 넘겨 도착할 수 있습니다.
- **시세 데이터:** 네이버·야후의 공개 차트 주소를 씁니다. 공식 API가 아니라서 바뀌거나 막힐 수 있습니다. 그러면 해당 종목이 "시세를 가져오지 못한 종목"으로 표시됩니다.
- **변동성:** 미국 종목은 optioncharts.io의 30일 내재변동성을 씁니다. 못 가져오면 60일 역사적 변동성(HV)으로 대신합니다.
- **수급:** 외국인·기관 수급은 가져오지 않습니다.

## 문제 해결

| 증상 | 확인할 것 |
|---|---|
| Actions가 빨간색, 로그에 `DATA_PASSPHRASE is not set` | Secret 이름 철자 확인 |
| 로그에 `push: failed (410 ...)` | 알림 연결이 만료됨. 앱 설정에서 **다시 연결하기** → `PUSH_SUBSCRIPTION` 갱신 |
| `git push` 단계 실패 | 5단계(Read and write permissions) 확인 |
| 앱에서 "암호가 맞지 않습니다" | 앱에 입력한 암호와 `DATA_PASSPHRASE`가 같은지 확인 |
| 앱에서 "아직 분석 결과가 없습니다" | 7단계를 실행했는지, Pages가 켜졌는지 확인 |
| 알림 버튼이 안 눌림 | Safari가 아니라 홈 화면 아이콘으로 열었는지 확인 |

## 참고

이 앱은 정보 제공 도구입니다. 매수·매도를 지시하지 않으며, 확률은 주가가 특정 방향으로 기울지 않는다고 가정한 통계적 근사치입니다.

Claude 데스크톱 앱의 예약 작업("평일 06:50 종목 분석")과 내용이 겹칩니다. 이 앱이 잘 돌아가는 것을 확인한 뒤 그 예약 작업은 꺼도 됩니다.
