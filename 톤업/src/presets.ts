export interface Preset {
  id: string;
  title: string;
  category: string;
  draft: string;
  suggestedTone: "polite" | "friendly" | "concise" | "confident" | "soft";
  suggestedFormat: "email" | "messenger" | "document";
  suggestedContext?: string;
}

export const PRESETS: Preset[] = [
  {
    id: "report_submit",
    title: "📊 보고서 전달",
    category: "업무 보고",
    draft: "요청하신 마케팅 결과 보고서 다 썼음 첨부파일 보셈 오타나 문제 있으면 알려줘요",
    suggestedTone: "confident",
    suggestedFormat: "email",
    suggestedContext: "타 부서 협업 담당자에게 보고서 공유",
  },
  {
    id: "proposal_refuse",
    title: "🙅‍♂️ 파트너사 제안 거절",
    category: "협력사 소통",
    draft: "보내주신 제안서 봤는데 우리 조건이랑 안 맞아서 이번엔 같이 못 할 것 같습니다 수고하세요",
    suggestedTone: "soft",
    suggestedFormat: "email",
    suggestedContext: "향후 협업 가능성을 열어두며 정중하게 거절",
  },
  {
    id: "schedule_delay",
    title: "⏳ 개발 일정 지연 양해",
    category: "업무 조정",
    draft: "서버 쪽에 에러 터져서 원래 금요일까지 주기로 한 거 다음주 화요일은 되어야 끝날 것 같은데 미안해요",
    suggestedTone: "soft",
    suggestedFormat: "messenger",
    suggestedContext: "기획자에게 솔직하고 정중하게 지연 사실과 사유 설명",
  },
  {
    id: "feedback_request",
    title: "💬 시안 피드백 요청",
    category: "업무 보고",
    draft: "디자인 시안 나왔는데 보고 맘에 드는지 어떤지 보고 피드백 빨리 좀 주세요 수정해야 함",
    suggestedTone: "friendly",
    suggestedFormat: "messenger",
    suggestedContext: "협업 디자이너/개발자 그룹 채팅방에 부드럽게 재촉",
  },
];
