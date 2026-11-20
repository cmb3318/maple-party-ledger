# 단풍수첩

메이플스토리(KMS) 캐릭터별로 보스 파티의 난이도, 파티 메모와 격파 여부를 기록하는 한국어 웹 앱입니다. 로그인 없이 같은 브라우저에서 기록을 다시 열 수 있습니다. 모바일에서도 캐릭터 전환, 보스 선택, 격파 체크를 지원합니다.

## 사용

닉네임을 입력하고 **조회하고 추가**를 누르면 캐릭터 이미지와 월드·직업·레벨을 가져옵니다. 넥슨 조회를 이용할 수 없을 때는 **이름으로 직접 추가**를 선택하세요. 같은 이름을 나중에 다시 조회하면 이전 체크리스트에 프로필이 연결됩니다. **목록 편집**으로 원정 대상을 고르고, 각 행에서 난이도, 메모와 격파 상태를 바꿀 수 있습니다.

주간 격파 기록은 한국시간 목요일 0시, 월간 보스 검은 마법사는 매월 1일 0시에 새로 시작합니다. 목록, 난이도, 파티 메모는 다음 주기에도 유지됩니다. 기록은 브라우저와 사이트 주소별로 저장됩니다. 사이트 데이터를 지우면 삭제됩니다. 게임 내 격파 기록은 수동으로 체크합니다.

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
