# 이펙트·2.5D 조사 (2026-11-03, Round 9 준비)

사용자 요청: "이펙트도 너무 구리고. 2.5D로 업글하긴 너무 어려우려나? 이펙트 효과 그런거 어캐 넣는지 연구조사해서 배워." + 디시 글(픽셀fx 만드는 클코 스킬) 검토.

## 결론
- **pixelfx(patch-gg/pixelfx)는 쓸 만하다. 채택.** MIT, 의존성 0, 순수 JS로 픽셀 버퍼에 그림 → 우리 렌더러(저해상도 캔버스 → 정수 확대)와 구조가 같다. 로컬에서 `node tools/render.mjs explosions/small-explosion`로 설치 없이 렌더 확인함(불꽃 → 연기 → 잔불, 빛 레이어).
- **완전한 2.5D(3D 모델·카메라 기울기)는 안 한다.** 도트 서바이버에서 "2.5D 느낌"은 ① 높이와 그림자(공·드롭볼·점프에 발밑 그림자, 높이에 따라 그림자 작아짐) ② 빛 레이어(additive glow: 뜨거운 것은 빛나고, 바닥에 빛 웅덩이) ③ 바닥에 눕힌 타원 링(far half는 캐릭터 뒤, near half는 앞) ④ 피격 정지(hit stop)·흔들림·잔상으로 낸다. pixelfx 코어가 ①~④의 도구(`Lights`, `band`, `Particles`, hit stop 데이터)를 그대로 준다.

## pixelfx 구조 (확인한 것)
- 이펙트 1개 = 파일 1개 `src/fx/<분류>/<이름>.js`. 두 종류: **simulated**(`create(o)` → `update(dt)`/`draw(p)`, 파티클·파편·빛을 120Hz로 시뮬) / **pure**(`draw(p, t, o)`: 시간의 함수, 루프 이음새 없음).
- 프레임 = `{ w, h, color: Uint32Array, light: Uint32Array }`. `composite(frame, rgba, bg=null)`은 **투명 배경을 지원**해 우리 월드 캔버스 위에 오버레이로 얹을 수 있다(빛은 알파 있는 색으로 변환돼 어두운 배경에서 additive처럼 읽힘).
- 좌표는 이펙트 로컬(0,0 = 발밑/충돌점), `opts.x/y/flip/angle`로 배치. `createFx`가 매 draw마다 `opts.x/y`를 읽으므로 움직이는 대상에 붙일 수 있다.
- 기준 캐릭터 24×38px. 우리 사람 스프라이트는 13×16 월드px = HD 캔버스에서 26×32 → **HD 캔버스(312×676) 좌표계에 그대로 그리면 크기가 맞는다.**
- 핵심 코드 `src/core` 15파일 ≈ 130KB(ES 모듈). 게임은 `<script>` 전역 방식이라 **esbuild로 IIFE 번들 1개(`js/pixelfx.js`)** 를 만들어 쓴다(개발 의존성만 추가, 런타임 의존성 없음).
- 비용: 312×676 = 21만 픽셀 합성/프레임. JS 루프 1~2ms 예상 → 이펙트가 있는 사각 영역만 합성하면 더 싸다.
- 품질 기준(AUTHORING.md "The bar"): 면 채우기 대신 1px 테두리·링·궤적·스파크 + 빛; 연기는 반투명 원(디더 격자 금지); 스파크는 속도로 늘어나고 바닥에 튀김; 예비 동작 → 흰 히어로 프레임 1~2장 + 플레어 → 확산 → 유지(반짝임) → 긴 소멸; 바닥 링은 납작한 타원, 뒤 절반은 캐릭터 뒤.
- 만드는 순서(원 저자 Hugo Duprez 방법): 참고 이펙트 코드 읽기 → 한 줄로 아트 방향 → 초안 5~10개 렌더 → 눈으로 고르고 최악부터 고치기 → 최소 3회 반복 → `tools/check.mjs`(번짐·이음새·시드 없는 난수·2ms 초과) 통과.

## 우리 게임 적용 계획
1. `js/pixelfx.js` 번들: core + 쓸 이펙트(impacts/hit-spark·crit-hit·ground-slam, explosions/small-explosion·cartoon-pow, projectiles/cannonball·muzzle, lightning/zap-hit·chain-lightning, holy/heal, shadow/black-hole, status/stun 등)와 우리 전용 이펙트(SIUU 폭발, 신의 손 충격, 드롭볼 낙하, 알까기 지그재그, 발롱도르 진화).
2. `Renderer.fxLayer`: 저해상도 캔버스와 같은 크기의 pixelfx 프레임 + ImageData + 오프스크린 캔버스. World가 `w.pfx`에 `{ mod, x, y, follow }`를 넣으면 레이어가 매 프레임 갱신·합성 → `drawFx` 뒤, 비네트 앞에 `drawImage`.
3. 2.5D 요소: 공·드롭볼 높이별 그림자, 피격 정지(크리티컬 0.05s, 보스 강타 0.1s), 보스 강타 때 바닥 빛 웅덩이, 바닥 링을 타원(sy≈0.16)으로.
4. 검수: 실제 휴대폰 크기 화면 캡처로 전후 비교, 프레임당 그리기 시간 측정(목표 < 4ms).

## 출처
- https://github.com/patch-gg/pixelfx (README, docs/AUTHORING.md) — 2026-11-03 열람
- https://www.spritefusion.com/blog/how-to-make-good-pixel-art-effects-with-claude — 원 방법론
- https://gall.dcinside.com/mgallery/board/view/?id=ai_utilize&no=164493 — 소개 글(내용은 저장소 링크와 샘플 gif뿐)
