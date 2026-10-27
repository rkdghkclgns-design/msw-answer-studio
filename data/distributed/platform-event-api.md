# 개요
플랫폼 이벤트 API 명세(운영 배포 문서). PlatformEventService 의 SetProgressAndWait 메서드로 이벤트 유저(profileCode)의 이벤트(eventId) 미션(missionCode) 진행도(progressValue)를 설정합니다.
- ServerOnly 입니다.
- 권한이 필요합니다.
- 퍼블리싱 환경에서만 동작합니다.
- 반환값은 ResultCode(PlatformEventProgressResult) 입니다.

# 멤버
PlatformEventService.SetProgressAndWait — int SetProgressAndWait(string profileCode, string eventId, string missionCode, int progressValue) [ServerOnly]
비고: ServerOnly, 권한이 필요합니다, 퍼블리싱 환경에서만 동작합니다. 반환값: int ResultCode.

# 파라미터
- profileCode: 이벤트 유저의 프로필코드
- eventId: 이벤트 Id (개발실에서 eventId(string)를 전달하면 크리에이터가 스크립트에 입력)
- missionCode: 미션 코드 (개발실에서 missionCode(string)를 전달하면 크리에이터가 스크립트에 입력)
- progressValue: 미션 진행도

# 미션 진행도 동기화 방식
유저의 미션 진행도는 월드 DB에 저장되어 관리되어야 합니다.

예를 들어 "특정 몬스터 5마리 잡기" 미션의 경우, 몬스터를 한 마리 잡을 때마다 progressValue.set(1)을 반복 호출하는 것이 아닙니다.

대신, 월드 DB에 기록된 몬스터 처치 횟수(1, 2, ... 5)에 맞춰 progressValue 값을 순차적으로 set(1), set(2), ... , set(5)와 같이 동기화해야 합니다.

# 호출 예시
명세에 실린 예시입니다. 서버에서 SetProgressAndWait 를 호출하고, 결과 코드를 클라이언트 UI 텍스트에 표시합니다.

```lua
-- [Server only]
-- void Server(string profileCode, integer count)
local status = _PlatformEventService:SetProgressAndWait(profileCode, "eventId", "missionCode", count)
self:ClientLog(tostring(status))

-- [Client]
-- void ClientLog(string arg1)
local text = _EntityService:GetEntityByPath("/ui/DefaultGroup/UIText")
text.TextComponent.Text = arg1
```

# ResultCode (PlatformEventProgressResult)
| 값 | 설명 |
|---|---|
| -1 | 알 수 없는 에러 |
| 0 | 업데이트 수행됨 |
| 1 | 미션이 이미 완료됨 |
| 2 | 새로운 진행도가 이전 진행도보다 높지 않음 |
| 3 | 새로운 진행도가 이전 진행도와 동일함 |
| 4 | 더 최신 요청이 이미 처리됨 |
| 100 | 이벤트 타입이 유효하지 않음 |
| 101 | 이벤트를 찾을 수 없음 |
| 102 | 미션을 찾을 수 없음 |
| 200 | 유저가 이벤트 참여 조건을 충족하지 않음 |
| 500 | 미션 데이터 생성 실패 |
| 501 | 내부 오류 발생 |
| 10000 | 퍼블리싱 환경에서 실행되지 않음 |
| 10001 | 인자가 유효하지 않음 |

# 잘못된 파라미터 호출과 크리티컬 리포트
잘못된 파라메터로 SetProgress API 호출 시 크리티컬 리포트에 기록됩니다.

확인 위치: 월드 만들기 상세 정보 > 더보기[⋯] 버튼 > 월드 관리 > 크리티컬 리포트

- 잘못된 eventId로 호출 시: 응답 코드 101, 크리티컬 리포트 기록 EVENT_NOT_FOUND
- 잘못된 missionCode로 호출 시: 응답 코드 102, 크리티컬 리포트 기록 MISSION_NOT_FOUND

# API 설정 시 유의사항
- 이벤트 진행 중 메이플W측과의 합의 없이 독단적으로 이벤트 API를 수정하거나 중단하지 않아야 합니다.
- 이벤트 종료 후 관련 API 호출부는 삭제해야 합니다.
- API 호출과 관련된 내역을 월드 자체적으로도 log로 기록하기를 권장합니다. (유저 문의 등 이슈 발생 시 대응을 위함)
