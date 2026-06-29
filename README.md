# 노수베스트

실시간 토론 커뮤니티 MVP입니다. 프론트엔드는 React/Vite, 로컬 API는 Express로 구성되어 있고, Supabase 설정이 있으면 앱 상태를 Supabase Postgres에 저장합니다. 설정이 없으면 `data/state.json` 파일 저장소로 자동 전환됩니다.

## 실행

```powershell
npm install
npm run dev
```

프론트엔드: http://127.0.0.1:5173/

프로덕션 빌드 산출물을 Express API 서버가 함께 서빙하는 단일 서버 실행:

```powershell
npm run build
$env:NODE_ENV="production"
$env:SERVE_STATIC_APP="true"
npm start
```

API 상태 확인:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:4000/api/health
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:4000/api/status
```

로컬 MVP 스모크 테스트:

```powershell
npm run verify
```

`verify`는 Express 서버 문법 검사, 프론트엔드 빌드, 관리형 로컬 smoke, 독립 인증 smoke, 저장소 시드 복구 smoke, 서버 lifecycle smoke를 순서대로 실행합니다. `smoke`는 임시 `DATA_DIR`과 임시 API/Vite 포트를 띄운 뒤 API 헬스체크, API host/허용 Origin 런타임 계약, 기본 보안 헤더, 허용/차단 CORS 세션 헤더와 preflight, 상태 응답의 기본 컬렉션/비밀값 숨김, 상태 참조 무결성, 비로그인 운영 API 차단, 운영자 세션의 런칭 준비도/필수 env 요약과 Markdown 런칭 리포트 계약, Vite 프록시 헬스체크, 프론트엔드 첫 화면 HTML을 함께 확인하고 서버를 종료합니다. 이미 실행 중인 `npm run dev` 서버만 직접 점검하려면 `npm run smoke:api`를 사용합니다.

`smoke:lifecycle`은 별도 API 프로세스를 띄워 `/api/health`의 `runtime.process` 메타데이터(pid, uptime, shutdown grace)를 확인한 뒤 graceful shutdown 요청을 보내 Socket.IO/HTTP 서버와 토론 clock timer가 정상 종료되는지 검증합니다. 실제 운영 프로세스는 SIGTERM/SIGINT도 같은 shutdown 경로로 처리합니다.

운영 탭의 런칭 준비도 카드는 누락 env 초안뿐 아니라 `check:release-env` → `release:promotion-refresh` → `release:promotion-refresh:strict` → `start:release` 순서의 최종 handoff 명령과 실패 시 복구 명령, 런칭 증적 패키지(JSON/Markdown)를 함께 제공합니다. 또한 promotion gate가 release preflight, full smoke, strict evidence, launch rehearsal, promotion refresh report 산출물의 존재/신선도/성공 여부를 요약해 최종 승격 가능/보류 사유를 화면과 readiness JSON에 동시에 노출합니다.

릴리스 전 전체 검증은 더 오래 걸리지만 배포/브라우저/음성 플로우까지 한 번에 확인합니다.

```powershell
npm run smoke:full
npm run release:evidence:strict
npm run release:promotion-refresh
npm run release:rehearse
```

`smoke:full`은 `verify`, `smoke:deploy`, `smoke:browser:managed`, `smoke:voice:managed`를 순서대로 실행하고 각 단계가 끝날 때 소요 시간과 성공/실패 지점을 출력합니다. 실행 결과는 기본적으로 `output/smoke-full-report.json`과 `output/smoke-full-report.md`에 단계별 성공 여부, 실패 지점, 소요 시간을 남깁니다. JSON 경로는 `SMOKE_FULL_REPORT_PATH`, Markdown 경로는 `SMOKE_FULL_MARKDOWN_PATH`로 바꿀 수 있습니다. `release:evidence:strict`는 최신 `smoke:release-preflight`와 `smoke:full` 산출물을 묶어 `output/launch-evidence-package.json`과 `output/launch-evidence-package.md`를 만들며, 전체 smoke가 없거나 오래되면 실패시켜 최종 승격 전 누락 증적을 드러냅니다. `release:promotion-refresh`는 full smoke, strict evidence, rehearsal smoke를 다시 묶은 `output/promotion-gate-refresh-report.json`과 `.md`를 남기며, 이 리포트가 다른 gate 산출물보다 오래되면 readiness가 pending으로 표시합니다. `release:rehearse`는 실제 `RELEASE_ENV_PATH` 기준으로 env guard, full smoke, strict evidence, release dry-run을 한 번에 실행하고 `output/launch-rehearsal-report.json`과 `.md`를 남깁니다. 운영 readiness의 promotion gate는 기본 24시간(`LAUNCH_ARTIFACT_MAX_AGE_HOURS`) 안의 산출물만 최종 승격 증적으로 인정합니다.

배포 직전 실제 운영 환경변수 파일은 handoff JSON의 최종 순서와 같은 흐름으로 점검합니다. 처음 초안이 필요할 때만 `npm.cmd run init:release-env`를 먼저 실행합니다. `release:promotion-refresh`는 로컬 증적을 최신화하고, `release:promotion-refresh:strict`가 실제 운영 env 리허설을 통과해야 최종 시작으로 넘어갑니다.

```powershell
$env:RELEASE_ENV_PATH="C:\secure\nosu-best\deploy\.env.production"; npm.cmd run check:release-env
npm.cmd run release:promotion-refresh
npm.cmd run release:promotion-refresh:strict
$env:RELEASE_ENV_PATH="C:\secure\nosu-best\deploy\.env.production"; npm.cmd run start:release
```

`check:release-env:json` runs the same production env guard and prints a secret-safe JSON report with `ok`, `status`, `errors`, `warnings`, `missingKeys`, `placeholderKeys`, `wrongValues`, and a compact `summary` for CI logs or launch evidence. The guard also validates release identity controls (`RELEASE_VERSION`, `RELEASE_COMMIT`, `RELEASE_CHANNEL`, `RELEASE_BUILD_TIME`) and operational numeric controls such as `API_PORT`, `SHUTDOWN_GRACE_MS`, rate limits, phone-code TTL/resend windows, and audit-log retention.

`smoke:release-preflight` starts the guarded release server with a temporary production env, verifies `/api/health`, provider diagnostics, static app serving, public-origin CORS, and demo-auth shutdown, then writes `output/release-preflight-report.json` and `.md` with runtime and provider readiness sections for launch evidence.

`release:evidence` writes a non-strict launch evidence package from the available release preflight and full-smoke artifacts, so `verify` can keep a current partial package without requiring the slower browser/voice suite every time. Use `release:evidence:strict` only after `smoke:full`; it fails when required launch artifacts are missing, failed, or older than the latest preflight.

`release:promotion-refresh` runs `smoke:full`, regenerates strict evidence, refreshes the rehearsal smoke contract, and writes `output/promotion-gate-refresh-report.json` plus `.md`. It is the local one-command way to reduce the promotion gate to only real-env rehearsal work, but it is not final launch approval. The refresh report includes a Local vs Strict section so operators can distinguish "local evidence is ready" from "real production-env rehearsal has passed." `release:promotion-refresh:strict` runs the real production-env rehearsal path for the final public launch decision.

The admin readiness panel also exports a launch handoff package (`nosu-best-launch-handoff-*.json`) with go/no-go status, final command order, failure recovery commands, required artifacts, and the operator checklist for release approval.

`release:rehearse` is the final promotion rehearsal. It validates the real production env (`RELEASE_ENV_PATH` or `deploy/.env.production`), runs `smoke:full`, regenerates strict launch evidence, then runs `start:release --dry-run` so the startup guard is proven without leaving a server process behind. `verify` uses the lighter `smoke:release-rehearsal` mode to keep the rehearsal report contract current from existing preflight/evidence artifacts.

`start:release`는 기본적으로 `deploy/.env.production`을 읽고 `check:release-env`를 먼저 통과한 뒤 `node server/index.js`를 시작합니다. 다른 위치의 운영 env를 쓰려면 `RELEASE_ENV_PATH`를 지정합니다. 실제 서버를 띄우지 않고 실행 직전 요약만 확인하려면 `node scripts/start-release.mjs --dry-run`을 사용할 수 있고, 이 경로는 `verify`의 `smoke:release-start`에 포함됩니다.

`init:release-env`는 기존 파일을 덮어쓰지 않고 `deploy/.env.production` 초안을 만듭니다. 루트 `.env.production`은 Vite 빌드가 자동으로 읽을 수 있으므로 서버 배포 env는 `deploy/` 아래에 분리합니다. `replace-with-*` 값을 실제 도메인, 릴리스 커밋 SHA/빌드 시각, Supabase, SOLAPI, OpenAI 키로 바꾼 뒤 `check:release-env`를 실행합니다. `check:release-env`는 기본적으로 `deploy/.env.production`을 읽고, `NODE_ENV=production`, `API_HOST=0.0.0.0`, HTTPS `ALLOWED_ORIGINS`, `RELEASE_COMMIT`/`RELEASE_BUILD_TIME`, 데모/익명 쓰기 비활성화, SMS/Supabase/OpenAI 필수 키, 정규화 저장소 모드, `SHUTDOWN_GRACE_MS`, rate limit, 전화번호 인증 제한값이 실제 배포값인지 확인합니다. `verify`에는 실제 secret 없이 생성기와 체커 동작만 검증하는 `smoke:release-env`가 포함됩니다.

인증 플로우만 빠르게 검증하는 독립 smoke:

```powershell
npm run smoke:auth
npm run smoke:storage
```

`smoke:auth`는 임시 `DATA_DIR`과 파일 저장소로 별도 API 서버를 띄워 회원가입, `GET /api/auth/session`의 익명/로그인 세션 판별, 로그인 rate limit 429/Retry-After 응답, 세션/CSRF가 필요한 전화번호 인증번호 요청/검증, 로그아웃 CSRF와 쿠키 만료, 개발용 인증번호 노출, 비밀번호 재설정, 이전 비밀번호 차단, 새 비밀번호 로그인을 확인한 뒤 임시 상태 폴더와 서버를 정리합니다. 실제 Supabase나 로컬 `data/state.json`을 오염시키지 않습니다.

`smoke:storage`는 임시 `DATA_DIR`에 채널이 비어 있는 오래된 저장 상태를 만든 뒤 운영자 세션으로 `POST /api/admin/seed-demo-state`를 실행해 기본 유저/방/텍스트 토론/`NB-2046` 음성 초대 채널과 감사 로그가 복구되는지 확인합니다. 이어서 운영 공지 API가 인증/CSRF를 요구하고 공지 게시/해제와 감사 로그를 남기는지, `GET /api/admin/audit-export`가 admin 전용으로 감사 로그 JSON/CSV를 내려주고 비밀번호 secret을 노출하지 않는지, `GET /api/admin/state-export`가 운영자에게만 허용되고 백업 JSON에 비밀번호 해시/솔트와 서버 secret이 포함되지 않는지도 확인합니다. 마지막으로 `POST /api/admin/state-export/validate`가 인증/CSRF를 요구하고, `POST /api/admin/state-export/secure`가 admin 전용 확인 문구와 감사 로그를 요구하며 credential 포함 보안 백업을 내려주는지 확인한 뒤, `POST /api/admin/state-restore`가 redacted 백업을 거부하고 보안 백업으로 저장소를 복구하며 감사 로그와 저장소 점검 결과를 남기는지 검증합니다.

빌드된 앱을 Express 단일 서버로 서빙하는 배포 smoke:

```powershell
npm run smoke:static
npm run smoke:deploy
```

`smoke:static`/`smoke:deploy`는 임시 포트에서 `NODE_ENV=production`, `SERVE_STATIC_APP=true`, 데모 인증/익명 상태 쓰기 비활성화, 공개 `ALLOWED_ORIGINS` 설정으로 서버를 띄워 `/`, 프론트 딥링크 fallback, 빌드 asset, `/api/health`, 알 수 없는 API의 JSON 404를 확인한 뒤 서버를 종료합니다. 또한 허용/차단 Origin CORS, production 데모 로그인 차단, 운영자 로그인 후 `security`/`static_app`/`origins`/`voice_permissions` 런칭 준비도 필수 항목이 열린 상태로 남지 않는지도 함께 확인합니다.

브라우저 플로우 smoke:

```powershell
npm run smoke:browser
npm run smoke:browser:managed
```

음성 토론 채널은 초대 코드 입장 후 로비 표시, 참가자 2명 노출, 마이크/손들기 상태 저장, 1:1 음성 연결 버튼 활성 조건까지 함께 확인합니다.

두 참가자의 실제 음성 연결 시그널링만 빠르게 확인하려면 실행 중인 `npm run dev` 화면에 대해 fake microphone 기반 스모크를 실행합니다.

```powershell
npm run smoke:voice
npm run smoke:voice:managed
```

`smoke:voice`는 Playwright Chromium의 fake media 장치를 사용해 `u_seojun`이 `NB-2046` 초대 코드로 음성 채널에 입장하고, 별도 브라우저 세션의 `u_yeonwoo`와 1:1 음성 연결이 `connected` 상태가 되는지 확인한 뒤 데모 상태를 정리합니다. `smoke:voice:managed`는 임시 파일 저장소와 임시 API/Vite 서버를 자동으로 띄워 같은 음성 시그널링 플로우를 격리 실행합니다.

`smoke:browser`는 실행 중인 `npm run dev` 화면에서 운영자 데모 로그인, 운영 탭 런칭 준비도 카드 표시와 런칭 리포트 다운로드, 오래된 빈 채널 저장소 상태 주입 후 `데모 시드 복구` 버튼으로 유저/방/채널 복구 확인, 감사 로그 JSON/CSV 반출, 일반/보안 백업 다운로드, 보안 백업 검증과 복구 버튼 활성화 조건, 참가자 데모 로그인, 프로필 세션 카드의 현재 사용자/만료 상태와 `GET /api/auth/session` 새로고침 응답, 아레나 진입, 주제 방/채널 카드/채널 인스펙터 표시, 채널 딥링크 재방문, 초대 코드 입장, 양쪽 참가자 준비, 토론 시작, 양측 기조 발언, 크로스파이어 턴 넘기기, 투표 단계 진입, 관전자 투표, 로컬 AI 판정, 결과/리플레이/종료 아카이브 표시, 결과 공유 복사, 승자 알림, 지갑 보상 원장, 랭킹 전적 반영, 정리 후 로그인 화면 복귀를 Playwright Chromium으로 확인합니다. 테스트 시작/종료 시 운영자 데모로 서버 상태를 초기화합니다. `smoke:browser:managed`는 임시 파일 저장소와 임시 API/Vite 서버를 자동으로 띄워 같은 브라우저 플로우를 격리 실행합니다. 처음 실행할 때 브라우저가 없다면 `npx playwright install chromium`을 한 번 실행합니다.

운영 탭 구간에서는 env 초안 다운로드, 배포 런북 명령 노출, 런칭 증적 패키지 다운로드, 운영 상황 스냅샷(JSON/Markdown) 저장도 함께 확인해, 배포 직전 체크리스트와 장애/점검 공유 자료가 브라우저에서 실제로 실행 가능한 상태인지 검증합니다.

운영 공지 전용 브라우저 smoke는 `npm run smoke:notice:managed`로 실행합니다. 임시 서버에서 자동 해제 시간이 있는 운영 공지를 게시한 뒤 로그인 전 공용 운영 상태 카드, 로그인 후 상단 공지 배너와 운영 상태 배지가 같은 점검 상태와 만료 정보를 표시하는지 확인합니다.

## 현재 구현된 백엔드 기능

- `GET /api/state`: 앱 상태 조회. 사용자 비밀번호와 해시 값은 응답에서 숨깁니다.
- `PUT /api/state`: 앱 상태 저장. 기존 사용자 비밀번호/해시 값은 서버가 보존합니다.
- `GET /api/health`: API, 실시간 서버, 저장소, SMS/AI 설정과 함께 배포 점검에 필요한 `runtime.apiHost`, `runtime.allowedOrigins`, `runtime.release`, `runtime.rateLimits`, `runtime.providerDiagnostics`, `runtime.process` 요약을 반환합니다. SIGTERM/SIGINT 처리 중에는 `503`과 `ok=false`로 내려가는 중임을 알립니다.
- `GET /api/status`: 로그인 전 화면에 표시할 수 있는 공용 운영 상태를 반환합니다. API 서비스명, 정상/주의/점검 라벨, 활성 운영 공지, 실시간 연결 수, 저장소 모드, 릴리스 식별자, 정적 앱/프로세스 생명주기 요약만 포함하고 secret이나 provider 키는 노출하지 않습니다.
- Express 단일 서버 배포: `SERVE_STATIC_APP=true`이면 `dist/`의 Vite 빌드 결과를 API 서버가 함께 서빙하고, 프론트 딥링크는 `dist/index.html`로 fallback합니다. `/api/*` 오타는 앱 HTML이 아니라 JSON 404를 반환합니다.
- 음성 토론 권한 정책: production 정적 서빙에서도 `Permissions-Policy`가 `microphone=(self)`를 포함해 같은 출처의 마이크 접근을 허용합니다. 카메라와 위치 권한은 계속 차단합니다.
- `Socket.IO /socket.io`: 상태 변경 실시간 브로드캐스트. 채팅, 투표, 프로필, 채널 변경이 다른 브라우저에 자동 반영됩니다.
- `POST /api/auth/login`: 아이디/비밀번호 로그인.
- `POST /api/auth/signup`: 아이디/비밀번호/닉네임/전화번호 기반 계정 생성.
- `GET /api/auth/session`: 현재 브라우저의 서명 세션 쿠키를 확인해 로그인 여부, 안전한 사용자 요약, CSRF 토큰, 세션 만료 시각을 `no-store` 응답으로 반환합니다.
- `POST /api/auth/social`: Supabase OAuth 미설정 시 사용하는 Google, Apple, Naver, Kakao 간편 로그인 MVP fallback.
- `POST /api/auth/oauth/session`: Supabase Auth OAuth 세션을 서버에서 검증하고 노수베스트 계정으로 생성/로그인합니다.
- `POST /api/auth/password-reset/request-code`: 아이디와 전화번호 확인 후 비밀번호 재설정 인증번호를 발급합니다.
- `POST /api/auth/password-reset/confirm`: 인증번호 검증 후 비밀번호를 재설정하고 새 세션을 발급합니다.
- `POST /api/auth/phone/change`: 인증된 사용자의 전화번호를 변경하고 재인증 대기 상태로 전환합니다.
- `POST /api/auth/phone/request-code`: 로그인 세션 기준 전화번호 인증번호 발급. 개발 모드에서는 응답의 `devCode`로 확인할 수 있고, `SMS_PROVIDER=solapi` 설정 시 SOLAPI 문자로 실제 발송합니다.
- `POST /api/auth/phone/verify`: 발급된 인증번호 검증. 만료, 재발송 제한, 시도 횟수 제한, 인증된 번호 중복 방지를 적용합니다.
- `POST /api/auth/password`: 현재 비밀번호 확인 후 새 비밀번호 저장.
- `POST /api/auth/account/deactivate`: 현재 계정을 탈퇴 처리합니다. 기존 토론 기록 보존을 위해 물리 삭제 대신 로그인 차단과 프로필 익명화를 적용합니다.
- `GET /api/admin/readiness`: 운영자용 런칭 준비도 점검. 저장소, SMS, AI 판정, 보안 스위치, Auth/SMS 남용 방지 한도, 실시간 연결 상태를 체크리스트로 반환하고 `runtime.providerDiagnostics`로 SMS/OAuth/AI/storage provider 상태를 secret 없이 함께 반환합니다. `launch` 요약에 런칭 가능/보류 판단, 막힌 항목, 다음 액션, 필수 env 목록, `.env.production` 초안, 배포 런북 명령, Markdown/JSON 리포트 파일명, 런칭 증적 체크리스트, promotion gate 산출물 상태를 함께 제공합니다. 운영 탭의 env 초안 저장/명령 복사/리포트 저장/증적 패키지 저장 버튼으로 현재 blocker/warning, promotion gate next action, 배포 전 기록을 남길 수 있습니다.
- 준비도 항목은 `phase`, `priority`, `required`를 함께 반환합니다. 운영 탭은 이를 이용해 필수 미완료, 권장 확인, 저장소/인증/배포/음성 토론 단계별 진행률을 보여줍니다.
- `POST /api/admin/service-notice`: 운영자/운영진이 점검, 장애, 정책 변경 공지를 게시하거나 내립니다. 공지는 수동 해제 또는 1/4/24/72시간 자동 해제 만료 시간을 둘 수 있고, 만료된 공지는 공용 상태와 로그인 후 배너에서 자동으로 사라집니다. 활성 공지는 모든 로그인 사용자에게 상단 배너로 표시되고 파일 저장소, Supabase 스냅샷, Supabase 정규 `app_settings.service_notice`에 함께 저장되며 감사 로그에 남습니다.
- 운영 상황 스냅샷: 운영 탭에서 현재 공용 서비스 상태, 릴리스 식별자, 활성 공지, readiness 요약, 저장소 점검 결과, 열린 신고/활성 제재, 최근 감사 로그를 JSON/Markdown으로 저장해 점검 공유나 장애 대응 기록으로 남길 수 있습니다.
- `GET /api/admin/storage-check`: 운영자용 저장소 점검. Supabase 설정, 저장 모드, 정규 테이블 row 수를 확인합니다.
- `GET /api/admin/state-export`: 운영자용 상태 백업 다운로드. 파일 저장소와 Supabase 모드 모두에서 현재 앱 상태, 저장소 메타데이터, 주요 row 수를 JSON으로 내려주며 비밀번호 해시/솔트는 제외합니다.
- `GET /api/admin/audit-export`: admin 전용 감사 로그 반출. 최근 운영 조치 이력을 JSON 배열과 CSV 문자열로 내려주며 `no-store` 응답과 `nosu-best-audit-*.json`/`.csv` 파일명을 제공합니다.
- `POST /api/admin/state-export/validate`: 운영자용 백업 파일 점검. 다운로드한 JSON 또는 동일한 state shape를 쓰기 없이 검사해 필수 배열, 활성 운영자 계정, 중복 ID, 비밀번호 secret 포함 여부, 현재 저장소와 비교한 row 수를 반환합니다. redacted 백업은 전체 복구 전에 비밀번호 재설정 또는 외부 인증 전환이 필요하다는 경고를 냅니다.
- `POST /api/admin/state-export/secure`: admin 전용 비상 보안 백업 다운로드. 요청 본문에 `confirmation: "EXPORT FULL BACKUP"`이 정확히 들어와야 하며, CSRF 검증과 감사 로그를 거친 뒤 비밀번호 해시/솔트를 포함한 restorable state JSON을 `no-store` 응답으로 내려줍니다. 파일은 암호화된 저장소에만 보관하고 일반 공유/이슈/로그에 첨부하지 마세요.
- `POST /api/admin/state-restore`: admin 전용 전체 상태 복구. 요청 본문에 `confirmation: "RESTORE FULL BACKUP"`과 `state-export/secure`로 내려받은 보안 백업 JSON이 필요합니다. 비밀번호 secret이 제거된 일반 백업은 거부하고, 현재 admin 계정이 백업 안에도 admin으로 존재할 때만 저장소를 교체한 뒤 복구 감사 로그와 저장소 점검 결과를 반환합니다.
- `POST /api/admin/sync-normalized`: 현재 앱 상태를 Supabase 정규 테이블로 동기화합니다.
- `POST /api/admin/seed-demo-state`: 현재 저장소가 비어 있거나 데모 토론 데이터가 깨졌을 때 운영자가 1차 MVP 기본 상태를 다시 시드합니다. 실행 후 저장소 점검 결과와 새 상태를 함께 반환하고 감사 로그를 남깁니다.
- 운영 보안 스위치: `NODE_ENV=production`에서는 데모 계정 전환과 익명 상태 쓰기가 기본 비활성화됩니다. 개발 중에만 `ENABLE_DEMO_AUTH`, `ENABLE_OPEN_STATE_WRITE`로 다시 열 수 있습니다.
- 배포 Origin 점검: 운영 준비도에서 `API_HOST`와 `ALLOWED_ORIGINS`가 실제 배포 도메인 기준으로 설정됐는지 확인합니다.
- 기본 HTTP 보안 헤더: API 응답에서 `X-Powered-By`를 숨기고 nosniff, frame deny, referrer, permissions policy 헤더를 설정하며 운영 준비도에서 점검합니다.
- 기본 rate limit: 로그인, 가입, 간편 로그인, 전화 인증, 비밀번호 변경, 채팅, 신고 요청을 IP/계정 기준으로 제한합니다.
- 운영 감사 로그: 방/채널/권한/제재/신고/프로필 운영 조치와 Supabase 동기화 이력을 최근 항목 중심으로 기록합니다. admin은 운영 탭에서 JSON/CSV로 내려받아 배포 전 점검 또는 사고 대응 기록으로 보관할 수 있습니다.

## 1차 MVP 토론 룰

- 준비: 참가자 2명이 입장하고 각자 찬성/반대 스탠스를 선택합니다.
- 기조 발언: A 90초, B 90초 순서로 발언합니다.
- 크로스파이어: 각자 5분 체스 클락을 가지고 `턴 넘기기`로 발언권을 넘깁니다.
- 최종 변론: A 60초, B 60초 순서로 마무리 발언합니다.
- 판정: 관전자 투표와 AI 분석을 합산해 승자를 정합니다.
- 보상: 1차 MVP에서는 법적 리스크를 줄이기 위해 패자 코인 차감 없이 승자에게 플랫폼 보상만 지급합니다.

## 추가 MVP 기능

- 채널 상태 필터: 전체, 참가 대기, 토론 진행, 투표/판정, 종료를 빠르게 걸러봅니다.
- 채널 딥링크: 선택한 주제 방/채널이 URL에 반영되고 채널 상세에서 공유 링크를 복사할 수 있습니다.
- 실시간 여론 게이지: 관전자가 참가자에게 공감을 누를 수 있습니다. 최종 승패에는 반영하지 않습니다.
- 신고/운영 큐: 채널, 토론 발언, 관전 채팅을 신고하고 운영자가 처리할 수 있습니다.
- 운영자 강제 종료: 문제 채널을 즉시 종료 상태로 바꿀 수 있습니다.
- AI 세부 판정: 논리성, 근거, 반박, 주제 적합성, 태도 점수를 계산합니다.
- 실제 AI 판정 API: `OPENAI_API_KEY`가 있으면 OpenAI API로 판정하고, 없거나 실패하면 로컬 판정으로 대체합니다.
- 기본 랭킹: 승수, AI 평점, 투표 신뢰도, 코인을 합산해 토론러 TOP 5를 보여줍니다.
- 종료 토론 아카이브: 끝난 토론의 승자, 투표 수, 발언 로그, 리플레이 하이라이트를 다시 볼 수 있습니다.
- 결과 공유 카드: 종료된 토론의 승자, 투표 수, AI 요약, 점수표를 공유용 텍스트로 복사할 수 있습니다.
- 음성 대기실: 음성 토론 채널에서 참가자별 마이크, 음소거, 손들기, 발언권 상태를 실시간으로 확인합니다.
- 토론 로그 내보내기: 참가자 발언, 관전 채팅, 투표, AI 판정을 전체 복사하거나 TXT 파일로 저장합니다.
- 운영 저장소 점검: 운영 탭에서 Supabase 연결, 정규 테이블 상태, 예상/실제 row 수를 확인하고 동기화할 수 있습니다.
- 전화번호 인증번호 발급: 고정 코드 대신 서버가 6자리 인증번호를 발급하고 5분 만료, 재발송 제한, 오입력 제한을 적용합니다.
- WebRTC 음성 시그널링: 음성 토론 참가자가 1대1 음성 연결을 시작할 수 있도록 Socket.IO 기반 offer/answer/ICE candidate 전달을 지원합니다.
- 채널 나가기: 대기 중 참가자는 참가를 취소할 수 있고, 관전자는 관전 퇴장으로 시청자 목록과 공감 상태에서 빠질 수 있습니다.

## AI 판정 설정

`.env.local`에 `OPENAI_API_KEY`가 있으면 `POST /api/ai/judge`가 OpenAI API를 사용합니다. 로컬 검증이나 비용 없는 smoke가 필요하면 `AI_JUDGE_FORCE_LOCAL=true`로 fallback 판정을 강제할 수 있고, 브라우저 smoke는 비운영 환경에서 요청 단위 `forceLocal` 판정을 사용합니다.

```env
OPENAI_API_KEY=...
OPENAI_JUDGE_MODEL=gpt-4o-mini
```

키가 없거나 호출에 실패해도 1차 MVP가 멈추지 않도록 서버가 로컬 판정 로직으로 자동 대체합니다.

## Supabase 연결

기존 Supabase 프로젝트를 그대로 써도 됩니다. 노수베스트 테이블은 모두 `nb_` 접두사를 붙여 생성하므로, 기존 프로젝트의 일반 `users`, `rooms` 같은 테이블과 충돌하지 않습니다.

1. Supabase Dashboard의 SQL Editor에서 `supabase/schema.sql` 내용을 실행합니다.
2. `.env.example`을 참고해서 프로젝트 루트에 `.env.local`을 만듭니다.
3. `SUPABASE_URL`과 `SUPABASE_SERVICE_ROLE_KEY`를 채웁니다.
4. `npm run dev`를 다시 실행합니다.

`.env.local` 예시:

```env
API_PORT=4000
API_HOST=127.0.0.1
ALLOWED_ORIGINS=http://127.0.0.1:5173,http://localhost:5173
DATA_DIR=./data
SHUTDOWN_GRACE_MS=8000
RELEASE_VERSION=0.1.0
RELEASE_COMMIT=local
RELEASE_CHANNEL=development
RELEASE_BUILD_TIME=
ENABLE_DEMO_AUTH=true
ENABLE_OPEN_STATE_WRITE=true
RATE_LIMIT_AUTH_WINDOW_SECONDS=600
RATE_LIMIT_LOGIN_MAX=8
RATE_LIMIT_SIGNUP_MAX=5
RATE_LIMIT_SOCIAL_MAX=12
RATE_LIMIT_DEMO_MAX=40
RATE_LIMIT_PHONE_REQUEST_MAX=5
RATE_LIMIT_PHONE_VERIFY_MAX=10
RATE_LIMIT_PASSWORD_MAX=6
RATE_LIMIT_WRITE_WINDOW_SECONDS=60
RATE_LIMIT_MESSAGE_MAX=30
RATE_LIMIT_REPORT_MAX=10
MAX_AUDIT_LOGS=300
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_TABLE_PREFIX=nb_
SUPABASE_STORAGE_MODE=snapshot
SUPABASE_STATE_TABLE=nb_app_state
APP_STATE_ID=default
PHONE_CODE_TTL_SECONDS=300
PHONE_CODE_RESEND_SECONDS=30
PHONE_CODE_MAX_ATTEMPTS=5
PHONE_CODE_HIDE_DEBUG=false # production 기본값은 true입니다. SMS 연동 전 개발 중에만 false로 둡니다.
PHONE_CODE_SMS_TEMPLATE=[노수베스트] 인증번호는 {{code}}입니다. {{ttlMinutes}}분 안에 입력해주세요.
SMS_PROVIDER=dev
SOLAPI_API_KEY=your-solapi-api-key
SOLAPI_API_SECRET=your-solapi-api-secret
SOLAPI_SENDER_NUMBER=01000000000
SOLAPI_API_BASE_URL=https://api.solapi.com
```

`SUPABASE_SERVICE_ROLE_KEY`는 서버 전용 키입니다. 브라우저 코드나 Git에 올리면 안 됩니다.

배포 환경에서는 `API_HOST=0.0.0.0`으로 서버가 외부 요청을 받을 수 있게 하고, `ALLOWED_ORIGINS`에는 실제 프론트엔드 도메인만 쉼표로 구분해 넣습니다.

## 실제 간편 로그인 OAuth

`VITE_SUPABASE_URL`과 `VITE_SUPABASE_ANON_KEY`가 있으면 로그인 화면의 Google, Apple, Naver, Kakao 버튼은 Supabase Auth OAuth 흐름을 먼저 사용합니다. OAuth 완료 후 프론트가 받은 Supabase access token을 `POST /api/auth/oauth/session`으로 보내고, 서버가 `supabase.auth.getUser(accessToken)`으로 검증한 뒤 노수베스트 계정 세션 쿠키를 발급합니다.

필요한 설정:

1. Supabase Dashboard > Authentication > Providers에서 사용할 OAuth provider를 활성화합니다.
2. 각 provider 콘솔에 로컬/배포 redirect URL을 등록합니다. 로컬은 `http://127.0.0.1:5173`을 사용합니다.
3. 서버에는 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`를 넣고, 프론트에는 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`를 넣습니다.
4. OAuth 계정도 전화번호 인증이 필수입니다. provider가 전화번호를 주지 않으면 기존 전화번호 인증 화면으로 이어집니다.

Supabase SDK 타입 기준으로 Google, Apple, Kakao는 기본 OAuth provider로 연결됩니다. Naver는 프로젝트 설정에서 바로 열리지 않으면 별도 Naver OAuth callback API를 추가해야 합니다.

## SMS 인증 발송

로컬 개발에서는 `SMS_PROVIDER=dev`, `PHONE_CODE_HIDE_DEBUG=false`를 사용하면 응답의 `devCode`로 인증번호를 확인할 수 있습니다. 운영 환경에서는 `PHONE_CODE_HIDE_DEBUG`의 기본값이 `true`라서 인증번호가 응답에 노출되지 않습니다.

실제 문자 발송은 SOLAPI를 지원합니다.

1. SOLAPI 콘솔에서 API Key/Secret을 발급합니다.
2. 문자 발신번호를 SOLAPI에 사전 등록합니다.
3. 서버 환경변수에 `SMS_PROVIDER=solapi`, `SOLAPI_API_KEY`, `SOLAPI_API_SECRET`, `SOLAPI_SENDER_NUMBER`를 설정합니다.
4. `/api/health`에서 `smsProvider: "solapi"`, `smsConfigured: true`, `phoneDebugCodeExposed: false`인지 확인합니다.

SOLAPI 문서 기준으로 메시지 API는 `POST /messages/v4/send-many/detail`을 사용하고, 인증은 `HMAC-SHA256 apiKey=..., date=..., salt=..., signature=...` 헤더 방식입니다.

## Supabase 정규화 테이블

현재 앱은 빠른 MVP 개발을 위해 `nb_app_state` JSON 저장을 기본값으로 사용합니다. 실제 서비스 전환을 위해 `nb_` 접두사가 붙은 정규화 테이블 스키마와 읽기/쓰기 모드도 준비되어 있습니다.

1. Supabase SQL Editor에서 `supabase/normalized-schema.sql`을 실행합니다.
2. 서버에 `SUPABASE_URL`과 `SUPABASE_SERVICE_ROLE_KEY`가 설정되어 있어야 합니다.
3. 정규화 테이블을 실제 저장소로 쓰려면 `.env.local`에 아래 값을 추가합니다.

```env
SUPABASE_TABLE_PREFIX=nb_
SUPABASE_STORAGE_MODE=normalized
```

이 모드에서는 `GET /api/state`, `PUT /api/state`, 로그인, 회원가입, 채널/메시지/투표/코인 변경이 `nb_users`, `nb_rooms`, `nb_channels`, `nb_debate_messages`, `nb_spectator_messages`, `nb_votes`, `nb_reactions`, `nb_reports`, `nb_coin_ledger`, `nb_app_settings` 테이블을 읽고 씁니다. Supabase 설정이 없으면 기존처럼 `data/state.json` 파일 저장소로 자동 전환됩니다.

현재 앱 상태를 테이블 row 형태로 확인합니다.

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:4000/api/admin/normalized-export
```

운영자 세션으로 현재 저장소와 정규 테이블 상태를 점검합니다.

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:4000/api/admin/storage-check
```

Supabase 정규화 테이블로 현재 상태를 동기화합니다.

```powershell
Invoke-WebRequest -UseBasicParsing -Method Post http://127.0.0.1:4000/api/admin/sync-normalized
```

정규화 테이블은 `nb_users`, `nb_user_claims`, `nb_rooms`, `nb_channels`, `nb_channel_participants`, `nb_channel_spectators`, `nb_debate_messages`, `nb_spectator_messages`, `nb_votes`, `nb_reactions`, `nb_reports`, `nb_coin_ledger`, `nb_app_settings`로 나뉩니다. `normalized-export`는 비밀번호 해시/솔트를 응답에 포함하지 않습니다.
