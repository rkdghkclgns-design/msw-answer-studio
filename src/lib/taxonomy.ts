// Discord 공식 문의 채널(creation-qa · support) 분석으로 도출한 질문 유형과 유형별 답변 방식

export const CATEGORIES = [
  { id: 'contest_ops', label: '콘테스트 운영·출품·심사', form: 'short', guide: '콘테스트 정책·FAQ·공지 근거로 1~3문장 결론. 심사 배점·불이익·실격 여부는 "심사의 공정성을 위해" 개별 판정하지 않음.' },
  { id: 'policy_ip', label: '약관·IP·리소스 사용 권한', form: 'policy', guide: '판단 기준(축)을 먼저 세우고 약관·운영정책·IP 가이드 조항 번호를 인용해 해당할 소지가 있는지 안내. 허용/불허를 확정하지 않으며 최종 판단·개별 허락은 공식 메일/고객센터로 안내.' },
  { id: 'world_release', label: '월드 배포·공개 설정·월드 정보', form: 'long', guide: '공개/비공개 출시, 월드 정보 수정, 배포 오류를 문서 근거로 설명하고 절차를 메뉴 경로(A > B)로 안내.' },
  { id: 'scripting_api', label: '스크립트·API 사용법', form: 'long', guide: 'API 레퍼런스 시그니처·실행 공간(Server/Client) 근거로 설명. 예시 코드는 출처에 있는 API만 사용하고 짧게.' },
  { id: 'data_limits', label: 'DataStorage·서비스 호출 한도', form: 'long', guide: '문서에 명시된 한도·에러 코드만 수치로 말하고, 명시되지 않은 값은 "공식 문서상 확인되지 않습니다" + 보수적 가정 + 실측 방법 + 대체 설계.' },
  { id: 'ui_system', label: 'UI 시스템', form: 'long', guide: 'UI 컴포넌트·이벤트 근거로 원인 추정 후 해결 방안 2~3개.' },
  { id: 'resource_avatar', label: '리소스·RUID·아바타·애니메이션', form: 'long', guide: '리소스 검색/스토리지·RUID·아바타 관련 문서 근거로 방법 안내. 비공식 추출·언패킹은 권하지 않음.' },
  { id: 'rendering_material', label: '렌더링·머티리얼·쉐이더', form: 'long', guide: '렌더러 컴포넌트별 지원 범위와 머티리얼 문서 근거. 검증되지 않은 동작은 단정하지 않음.' },
  { id: 'map_physics_camera', label: '맵·타일·물리·이동·카메라', form: 'long', guide: '맵 타입(TileMapMode)과 Body 컴포넌트 차이를 확인하고 문서 근거로 원인·해결 제시.' },
  { id: 'gameplay_ai', label: '전투·NPC/몬스터 AI', form: 'long', guide: '전투·AI 컴포넌트/BT 문서 근거로 구현 방향 제안.' },
  { id: 'server_multiplayer', label: '서버·인스턴스·멀티플레이·동기화', form: 'long', guide: '서버/클라이언트 실행 공간, 동기화, 인스턴스/룸 문서 근거로 설명.' },
  { id: 'performance_mobile', label: '성능·메모리·모바일', form: 'long', guide: '프로파일러·권장 기준 수치는 문서에 있는 것만 인용. 측정 → 구조 개선 → 대체안 순.' },
  { id: 'localization', label: '다국어·로컬라이징', form: 'long', guide: '로컬라이징 가이드 근거로 절차 안내.' },
  { id: 'monetization_shop', label: '월드 상점·결제·확률형 아이템', form: 'policy', guide: 'WorldShop API와 확률 정보 공개 등 정책 문서를 함께 근거로 제시.' },
  { id: 'tools_mcp', label: '메이커·MCP·AI Toolkit', form: 'long', guide: '메이커 기능·MCP·AI Toolkit 문서와 AI Toolkit 공지 근거. 세팅/연결 문제는 ai-toolkit 토론방 채널도 함께 안내.' },
  { id: 'bug_report', label: '버그 제보·사양 확인', form: 'long', guide: '재진술 → 문서상 의도된 사양인지 근거로 구분 → 아니라면 재현 정보(월드 주소·WorldID·재현 단계·시각·캡처) 요청 및 담당 부서 전달 안내. 수정 일정은 약속하지 않음.' },
  { id: 'account_support', label: '계정·결제·일반 운영 문의', form: 'short', guide: 'FAQ·공지·운영정책 근거로 짧게 안내하고, 개인정보가 필요한 처리는 고객센터로 안내(계정·이메일을 묻지 않음).' },
  { id: 'other', label: '기타', form: 'long', guide: '근거가 있는 범위에서만 답하고 없으면 확인되지 않음을 밝힘.' },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]['id'];

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as unknown as readonly [CategoryId, ...CategoryId[]];

export function categoryLabel(id: string): string {
  return CATEGORIES.find((c) => c.id === id)?.label ?? id;
}
