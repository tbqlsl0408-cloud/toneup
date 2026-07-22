import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Lazy initialization of GoogleGenAI SDK to prevent startup crashes if GEMINI_API_KEY is not set
let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("Gemini API 키가 설정되지 않았습니다. Settings > Secrets에서 GEMINI_API_KEY를 설정해 주세요.");
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

app.use(express.json());

// Helper function to call Gemini with retry and fallback to handle high demand (503) or rate limits (429)
async function callGeminiWithRetryAndFallback(contents: string, systemInstruction: string, temperature = 0.7) {
  const modelsToTry = ["gemini-3.5-flash", "gemini-3.1-flash-lite"];
  const maxRetriesPerModel = 3;

  for (const model of modelsToTry) {
    for (let attempt = 1; attempt <= maxRetriesPerModel; attempt++) {
      try {
        console.log(`[Gemini API] Attempting generation using model: ${model} (Attempt ${attempt}/${maxRetriesPerModel})`);
        const ai = getAiClient();
        const response = await ai.models.generateContent({
          model: model,
          contents: contents,
          config: {
            systemInstruction: systemInstruction,
            temperature: temperature,
          },
        });
        
        if (response && response.text) {
          return response.text;
        }
        throw new Error("No text returned from Gemini API");
      } catch (error: any) {
        console.error(`[Gemini API] Error on model ${model} (Attempt ${attempt}):`, error);
        
        const isTransient = error?.status === "UNAVAILABLE" || 
                            error?.statusCode === 503 || 
                            error?.message?.includes("503") || 
                            error?.message?.includes("high demand") || 
                            error?.message?.includes("UNAVAILABLE") ||
                            error?.status === "RESOURCE_EXHAUSTED" ||
                            error?.statusCode === 429 ||
                            error?.message?.includes("429");

        // If it's a transient error (like 503/429) and we have retries left, delay and retry
        if (isTransient && attempt < maxRetriesPerModel) {
          const delay = Math.pow(2, attempt) * 500; // 1000ms, 2000ms
          console.log(`[Gemini API] Transient error detected. Retrying ${model} in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          // If not transient, or we exhausted retries for this model, proceed to the next model
          console.warn(`[Gemini API] Switch to next model or stop attempts for ${model}`);
          break;
        }
      }
    }
  }
  
  throw new Error("모든 AI 모델(gemini-3.5-flash 및 gemini-3.1-flash-lite)이 현재 많은 요청을 받고 있어 일시적으로 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.");
}

// API: Convert informal text into polished business/professional tone
app.post("/api/convert", async (req, res) => {
  const { text, tone, format, context } = req.body;

  if (!text || typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ error: "변환할 텍스트를 입력해주세요." });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({
      error: "Gemini API 키가 설정되지 않았습니다. Settings > Secrets에서 설정해 주세요.",
    });
  }

  // Tone descriptions
  const toneMap: Record<string, string> = {
    polite: "정중하고 정성스러운 말투 (비즈니스 메일, 파트너사 공문, 격식 있는 메신저 대화에 어울림)",
    friendly: "친근하고 상냥한 말투 (팀 내 메신저, 사내 커뮤니케이션, 자연스럽고 따뜻함)",
    concise: "간결하고 명확한 말투 (빠른 핵심 전달, 요약형 보고, 불필요한 수식어구 제거)",
    confident: "당당하고 논리적인 말투 (기획서 제안, 발표, 자신감 넘치는 업무 보고)",
    soft: "부드럽고 사려 깊은 거절/양해 말투 (일정 지연 안내, 요청 거절, 죄송함과 대안 제시)",
  };

  const selectedToneDescription = toneMap[tone] || toneMap.polite;

  // Format descriptions
  const formatMap: Record<string, string> = {
    email: "이메일 (제목과 인삿말, 본문, 끝인사, 서명이 정형화된 형태)",
    messenger: "메신저 (제목 없이 친절하고 가벼운 줄바꿈이 가미된 대화체 형태)",
    document: "공식 문서/보고서 (개조식 형태나 개괄, 항목 구분이 명확한 서술체 형태)",
  };

  const selectedFormatDescription = formatMap[format] || formatMap.messenger;

  const systemInstruction = `
너는 한국의 대기업 및 트렌디한 IT 기업에서 일하는 10년 차 마케팅·콘텐츠·업무 실무자 및 커뮤니케이션 전문가이다.
입력된 초안이나 대충 쓴 메모를 자연스럽고 가독성이 높은 고품질의 비즈니스 문장으로 교정 및 다듬어라.

[선택된 조건]
· 변환할 어조(Tone): ${selectedToneDescription}
· 결과물 형태(Format): ${selectedFormatDescription}
${context ? `· 추가 참고 맥락: ${context}` : ""}

[필수 교정 규칙]
1. 느낌표나 이모지를 적절하게 조절해라. 메신저나 이메일에서 너무 가벼워 보이지 않도록 '!'는 필요한 곳에만 1개 정도, 😊나 👍 같은 가벼운 이모지는 분위기를 부드럽게 만들기 위해 최대 1개까지만 허용한다. ('!!'나 'ㅠㅠ', 'ㅋㅋ' 등은 절대 사용 금지)
2. 올바른 비즈니스 어미를 사용해라. ("~드려요", "~겠습니닷", "~해주세염" 같은 오타나 과도한 구어체는 깔끔하게 "~드립니다", "~부탁드립니다", "~코자 합니다" 등으로 변경한다.)
3. 캐주얼하거나 상스러운 표현은 프로페셔널하게 순화해라. (예: "들고 갈게요" -> "지참하여 방문하겠습니다", "빨리 해주셈" -> "바쁘시겠지만 가급적 빠른 시일 내에 확인해 주시면 감사하겠습니다.")
4. 맞춤법, 띄어쓰기, 한글 맞춤법 표준 규정을 철저히 지킨다.
5. 비즈니스 대화에 필요한 '쿠션어'를 자연스럽게 덧붙인다. (예: "바쁘신 와중에 번거롭게 해드려 죄송합니다만", "모쪼록 너른 양해를 부탁드립니다", "덕분에 진행이 원활했습니다" 등)
6. 굽신대거나 필요 이상으로 저자세를 취하는 비굴한 표현은 없애고, 당당하고 정중한 프로페셔널의 톤을 유지해라.
7. 답변에는 오직 변환 완료된 결과물 텍스트(제목, 본문 등 실제 전송할 내용)만 출력해라. "다음은 변환 결과입니다:", 큰따옴표, 머리말, 부가 설명 등은 절대로 적지 말고 순수 비즈니스 메시지 텍스트만 리턴해라.
`;

  try {
    const resultText = await callGeminiWithRetryAndFallback(text, systemInstruction);
    return res.json({ result: resultText.trim() });
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    return res.status(500).json({
      error: "텍스트 변환 도중 에러가 발생했습니다: " + (error.message || error),
    });
  }
});

// Setup Vite or static serving
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    // Development mode
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production mode
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
