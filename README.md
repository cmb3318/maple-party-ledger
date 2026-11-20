# 단풍수첩

메이플스토리(KMS) 캐릭터별 보스 배정, 격파 상태, 결정석 수입을 보는 다크 모드 웹 앱입니다. 같은 기록을 캐릭터별, 파티별, 보스별로 볼 수 있습니다. 데이터는 현재 브라우저에 저장합니다.

## 사용

**캐릭터 추가**에서 닉네임을 조회하면 이미지와 월드·직업·레벨을 가져옵니다. 조회를 이용할 수 없다면 이름으로 등록하고 나중에 같은 닉네임을 다시 조회할 수 있습니다.

**보스 일괄 편집**에서 갈 보스를 고르고 표에서 난이도·파티·인원을 바로 바꿀 수 있습니다. 같은 설정을 여러 보스에 적용하려면 왼쪽에 있는 일괄 체크 칸을 선택하고 위쪽에서 설정을 적용하세요. 지원하지 않는 난이도는 유지하고, 인원은 각 보스의 입장 한도까지만 적용합니다. **다른 캐릭터에도 복사**에서 여러 캐릭터를 골라 목록을 합치거나, 체크한 행만 맞추거나, 전체 목록을 맞출 수 있습니다. 복사 대상의 메모와 격파 기록은 유지됩니다. 캐릭터마다 구성이 다르면 **저장 후 다음 캐릭터**로 이어서 편집할 수 있습니다.

**파티별 보기**에는 파티마다 갈 보스가, **보스별 보기**에는 보스마다 가는 캐릭터와 파티가 표시됩니다. 어느 보기에서 격파를 체크하든 하나의 기록에 반영됩니다.

세 보기의 보스 행에서 난이도·파티·인원을 바로 변경할 수 있습니다. 파티를 만들거나 편집할 때 색을 고르면 세 보기, 일괄 편집, 파티 필터에서 같은 색으로 표시됩니다. 검색과 **격파 숨기기**는 표시할 행만 바꾸며 상단 수입 합계는 전체 캐릭터를 기준으로 표시합니다. 개별 카드 또는 화면의 카드를 모두 접을 수 있습니다.

주간 격파 기록은 한국시간 목요일 0시, 월간 보스 검은 마법사는 매월 1일 0시에 새로 시작합니다. 목록, 난이도, 파티 메모는 다음 주기에도 유지됩니다. 기록은 브라우저와 사이트 주소별로 저장됩니다. 사이트 데이터를 지우면 삭제됩니다. 게임 내 격파 기록은 수동으로 체크합니다.

## 결정석 가격

2026년 11월 20일 확인한 일반 KMS 가격입니다. 노멀 스우(835만 메소)와 노멀 데미안(875만 메소)을 포함하고, 1인 가격이 835만 메소보다 낮은 보스는 목록에서 숨깁니다. 가격표는 보스 18종, 49개 난이도의 인원별 1인 몫을 보여 줍니다.

가격은 `public/crystals.js`에 저장합니다. 공식 가격 개편 공지의 변경 가격을 날짜순으로 적용하고, 공지에 가격이 없는 신규 난이도 등은 아래 가격표로 대조했습니다. 메소는 1인 결정석 가격을 참가 인원으로 나눈 정수 몫입니다. 주간 예상은 선택한 주간 보스의 합계, 주간 격파는 격파를 체크한 행의 합계입니다. 검은 마법사는 월간에 별도로 표시합니다. 캐릭터당 12종 처치 제한과 일반 월드 메이플ID당 90개 판매 제한은 선택 목록이 한도를 넘으면 안내합니다. 수익은 목록 합계이며 실제 판매량은 추적하지 않습니다.

- [6월 가격 공지](https://maplestory.nexon.com/News/Update/806), [9월 가격 공지](https://maplestory.nexon.com/News/Update/813), [10월 보스 및 가격 공지](https://maplestory.nexon.com/News/Update/815)
- [메이플스토리 보스 가이드](https://maplestory.nexon.com/guide/n23gameinformation/articles/458), [11월 판매 제한 변경](https://maplestory.nexon.com/News/Update/816), [가격 및 인원 대조표](https://maplescanner.com/boss/crystal)

## 실행 및 테스트

Node.js 22.12 이상이 필요합니다. 저장소 루트에서 다음 명령을 실행하세요.

```sh
npm ci
npm test
npm run dev
```

로컬 실조회는 저장소 루트의 `.dev.vars`에 `NEXON_API_KEY`를 설정한 뒤 개발 서버를 다시 시작하세요. 이 파일은 Git에서 제외됩니다. 키 없이도 직접 등록과 기록 관리가 가능합니다.

## Cloudflare Pages

공개 프로젝트는 `maple-party-ledger-cmb3318`이며 Direct Upload 방식입니다. `public/`에는 정적 화면이, `functions/api/character.js`에는 캐릭터를 조회하는 Pages Function이 있습니다. 배포할 때는 저장소 루트에서 `npm run deploy`를 실행하세요. GitHub에 푸시한 뒤 운영 배포는 별도로 실행합니다. 다른 계정에 사본을 배포할 때는 `wrangler.toml`의 이름을 새 프로젝트 이름으로 바꿔야 합니다.

KMS용 넥슨 앱 키를 Pages 프로젝트의 **Settings → Variables and Secrets → Production**에 암호화된 Secret `NEXON_API_KEY`로 추가하세요. 설정 변경 후 다시 배포하면 적용됩니다. CLI를 사용하려면 `npx wrangler pages secret put NEXON_API_KEY --project-name maple-party-ledger-cmb3318`의 비공개 입력을 사용하세요. 키는 소스, 브라우저 저장소, 공개 응답에 포함되지 않습니다.

캐릭터 조회는 서버에서 이름 → OCID → character/basic 순으로 호출합니다. 넥슨 앱 키는 요청 헤더에만 넣고 OCID를 클라이언트에 반환하지 않습니다. 브라우저는 응답의 공식 character_image URL을 이용합니다. 서버는 성공한 조회를 엣지에 5분 캐시하고, 실행 인스턴스별로 같은 IP의 캐시 미스 요청을 분당 12회까지 받습니다. 이는 계정 전체에 적용되는 전역 한도가 아닙니다. 조회 한도 초과·점검·키 누락·시간 초과에도 로컬 기록을 사용할 수 있습니다. 저장한 외형은 30일이 지나면 기록을 열 때 표시 대상에서 제외하며, 같은 닉네임으로 재조회해 갱신할 수 있습니다.

## 공식 참고 자료

- [KMS 캐릭터 API](https://openapi.nexon.com/ko/game/maplestory/) 및 [인증·에러·출처 표기](https://openapi.nexon.com/ko/guide/request-api/)
- [캐릭터 외형 이미지 사용법](https://openapi.nexon.com/ko/support/notice/2702543/)
- [보스 파티 모집 대상 및 난이도](https://maplestory.nexon.com/News/Update/816), [주간 초기화](https://maplestory.nexon.com/News/Update/790), [검은 마법사 월간 초기화](https://gi.maplestory.nexon.com/Guide/GameInformation/Boss/BlackMagician)
- [Cloudflare Pages 암호화된 Secret](https://developers.cloudflare.com/pages/functions/bindings/#secrets) 및 [직접 배포](https://developers.cloudflare.com/pages/get-started/direct-upload/)

Data based on NEXON Open API. 게임 데이터의 권리는 각 권리자에게 있습니다. 풍경과 목록의 표식은 이 앱을 위해 만든 픽셀 일러스트입니다.
