# 멍평 — 강아지가 보는 얼굴 균형

웹캠으로 얼굴을 인식해 **삼등분 비율**(1:1:1 또는 동안 비율 1:1:0.8)과 **좌우 대칭**을 재고, 결과에 따라 시바견이 반응합니다. 모든 분석은 브라우저 안에서만 돌고 영상은 어디로도 보내지 않습니다.

## 실행

```bash
npm install
npm run dev      # 처음 실행할 때 MediaPipe 모델(약 3.7MB)을 public/models에 받아옵니다
```

카메라는 `http://localhost`이나 HTTPS에서만 켜집니다.

### 카메라 없이 모션 확인

- `?scene=high` / `?scene=mid` / `?scene=low`: 모션만 재생합니다
- `?scene=mid&t=6000`: 6초 지점에서 멈춘 화면을 봅니다
- `?scene=low&demo`: 자막, 모션, 결과 카드까지 전체 흐름을 샘플 수치로 재생합니다

### 디버그 모드 (`?debug`)

측정 기준은 사용자에게 보이지 않습니다. 주소 뒤에 `?debug`를 붙였을 때만 카메라 위에 삼등분 선과 중심선이 그려지고, 결과가 나올 때 비율, 점수, 등급이 브라우저 콘솔에 표로 찍힙니다. `HAIRLINE_CORRECTION`이나 등급 기준점을 조정할 때 쓰세요.

## 판정 기준 (`src/analysis.ts`)

| 항목 | 방법 |
|---|---|
| 삼등분 | 헤어라인(추정) → 미간(9) → 코밑(2) → 턱끝(152). 고개 기울기(roll)는 눈꼬리 선으로 보정합니다 |
| 비율 점수 | (상/중, 하/중)이 1:1:1과 1:1:0.8 중 가까운 쪽에서 얼마나 떨어졌는지로 계산합니다. 거리 0.6에서 0점 |
| 대칭 점수 | 좌우 대응점 11쌍의 중심선 거리 차이와 높이 차이를 얼굴 폭으로 나눕니다. 10%에서 0점 |
| 총점 | 두 점수의 평균. 65점 이상은 high, 40점 이상은 mid, 그 아래는 low |

측정은 정면을 본 상태(yaw ±10°, pitch ±12°)로 연속 24프레임을 모아 중앙값으로 계산합니다.

**보정값**: MediaPipe의 맨 윗점(10)은 실제 헤어라인보다 이마 중간쯤에 있어서, 상안부에 `HAIRLINE_CORRECTION = 1.4`를 곱합니다. 이 값은 평균 얼굴 1장으로 맞춘 것이라 더 많은 얼굴로 다시 조정하는 편이 좋습니다.

## 구조

```
assets/
  figma/     Figma에서 export한 원본 이미지 (Figma 레이어 이름 그대로, 사이트에 쓰는 것만)
  motion/    Figma 모션 JSON (pass-by / approach-retreat / approach-pee)
public/
  images/    웹용 이미지 (assets/figma에서 생성, 커밋되어 있음)
    background.webp
    dog/       강아지 스프라이트
    effects/   쉬 웅덩이, 볼터치
scripts/
  build-images.mjs   assets/figma → public/images 변환 (npm run images)
  setup-assets.mjs   MediaPipe wasm·모델 준비 (dev/build 전에 자동 실행)
src/
  analysis.ts        삼등분, 대칭, 점수, 등급 계산 (순수 함수, 테스트 포함)
  faceTracker.ts     웹캠과 MediaPipe Face Landmarker
  guideOverlay.ts    카메라 위 삼등분 선과 중심선 (?debug에서만)
  main.ts            전체 흐름 (카메라 → 측정 → 자막 → 모션 → 결과 → 다시하기)
  motion/
    timeline.ts      키프레임 샘플링 (hold, linear, cubic-bezier)
    scenes.ts        모션 노드 ↔ Figma 레이어(이미지) 매핑과 배치
    dogStage.ts      1920×1350 무대를 화면에 맞춰 렌더링
```

### 이미지 바꾸기

1. Figma에서 같은 레이어 이름으로 다시 export해서 `assets/figma/`의 파일을 덮어씁니다.
2. `npm run images`로 `public/images/`를 다시 만듭니다.
3. 새 레이어를 추가했다면 `scripts/build-images.mjs`의 목록과 `src/motion/scenes.ts`의 `SPRITES`에 한 줄씩 추가합니다.
