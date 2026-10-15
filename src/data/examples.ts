// 예시 질문 — Discord 공식 문의 채널에서 자주 나온 유형을 익명화·일반화해 다시 쓴 것
export const EXAMPLE_QUESTIONS: readonly { readonly label: string; readonly text: string }[] = [
  {
    label: '심사 기간 중 월드 수정',
    text: '글로벌 개발 콘테스트에 출품했습니다. 심사 기간 중에 월드 설명이나 썸네일 이미지를 수정해도 되나요? 버그 핫픽스도 가능한지 궁금합니다.',
  },
  {
    label: '메이플 IP 2차 창작 범위',
    text: '메이플스토리 리소스와 캐릭터를 활용해 스토리를 변형한 2차 창작 월드를 만들려고 합니다. IP 사용 가능 범위와 주의할 점을 알려주세요.',
  },
  {
    label: 'PC 가로 / 모바일 세로',
    text: 'PC 버전은 가로 모드, 모바일 버전은 세로 모드로 개발하고 싶습니다. WorldOrientation 을 Responsive 로 바꾸면 이렇게 나눠서 설정할 수 있나요?',
  },
  {
    label: '유저 저장 데이터 확인',
    text: '유저들의 재화와 진행도를 분석하려고 합니다. DataStorage 에 저장된 유저 데이터를 운영 중에 조회하거나 확인할 수 있는 도구나 방법이 있나요?',
  },
  {
    label: '스폰한 몬스터가 안 보임',
    text: '스크립트에서 _SpawnService:SpawnByModelId 로 몬스터를 스폰했는데 화면에 보이지 않습니다. 어떤 부분을 확인해야 할까요?',
  },
  {
    label: 'HttpService 호출 한도',
    text: '랭킹 데이터를 외부 서버로 보내려고 HttpService 를 쓰려고 합니다. 호출 한도나 제한 사항이 어떻게 되나요?',
  },
  {
    label: 'AI Toolkit 업데이트',
    text: 'AI Toolkit 과 maplestory-skill-maker 를 최신 버전으로 업데이트하는 방법을 알려주세요.',
  },
  {
    label: 'English · asset usage',
    text: 'Can I use MapleStory 2D game assets in my world for the Global Creator Challenge? Are there any restrictions?',
  },
];
