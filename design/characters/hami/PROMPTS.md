# 함이 이미지 생성 프롬프트

현재 외형 기준과 채택된 요청만 관리합니다. README는 사용 가이드, 이 문서는 재생성 템플릿·실제 장면 지시·선택 결과입니다. 미채택 후보와 폐기한 프롬프트는 제거했습니다.

## 1. 턴어라운드 생성 원문

입력: `images/hami-user-reference.png`
출력: [투명 턴어라운드](images/hami-turnaround-transparent.png)

```text
Use case: stylized-concept. Asset type: character design turnaround reference sheet for a Korean community mobile web service named Wolgyeham. Using the supplied ORIGINAL character image as the identity reference, create a clean high-resolution 360-degree turnaround sheet of ONLY this same mascot, Hami. Preserve the pear-shaped warm white floating ghost/mail spirit body, the small curved tail, two small flipper arms, friendly dark rounded eyes, subtle rosy cheeks, and the small vertical indigo postage stamp with a gold crescent fixed on the upper forehead. Preserve soft matte 3D clay shading on the character itself. Do NOT redesign it as a box, robot, animal or physical mailbox.

Eight evenly spaced orthographic or near-orthographic full-body views in a spacious 4-column by 2-row layout: top row front (0), front three-quarter (45), right profile (90), back three-quarter (135); bottom row back (180), opposite back three-quarter (225), left profile (270), opposite front three-quarter (315). Consistent geometry, stamp stays on the FRONT only, eyes on front only, no stamp or face on back, same scale and eye/body proportions in every view. Both eyes open with a modest closed smile in front view, neutral relaxed arms, no wink. The tail belongs to the same physical side across every rotation, not mirrored between views. All eight characters fully inside their cells with generous empty padding, no overlap or cropping.

CRITICAL OUTPUT: a genuinely TRANSPARENT PNG with an alpha channel. Every pixel outside the eight complete character silhouettes must be fully transparent. No white background, no colored background, no black background, no checkerboard painted into the image. The white characters are solid OPAQUE figurines, not translucent ghosts: preserve their complete white bodies and stamp borders. Clean smooth antialiased edges with no white matte fringe, detached specks or missing parts.

ZERO cast shadows, ZERO ground shadows, ZERO contact shadows, ZERO drop shadows, no floor, no platform, no glow or halo behind or beneath any figure. No separate envelope, no props, no scene, no confetti, no arrows, no labels, no text, no UI, no watermark. The reference background, envelope, yellow lines and floor shadow are NOT part of the character and must not appear. Soft dimensional self-shading within the character is allowed, but absolutely no shadow outside its silhouette. This is a character introduction and multi-view identity reference sheet, not an environment render, 3D model or animation. Distinct readable silhouettes, crisp high quality.
```

## 2. 개별 포즈 공통 프롬프트

아래 `{SCENE}`를 3절의 해당 장면 지시로 치환한 전체 문장이 실제 생성 요청입니다. 공통 문장을 포즈마다 복제하지 않고 한 곳에서 유지합니다. 기본 참조는 `images/hami-turnaround-transparent.png`입니다.

```text
Use case: stylized-concept. Create ONE Hami mascot illustration for a Korean mobile web service, using the attached eight-view turnaround as the CANONICAL CHARACTER IDENTITY, not as a rigid pose to copy. Preserve its warm-white pear-shaped floating body, short fingerless flipper arms, curled tail, round dark eyes, small friendly mouth, pink cheeks, and front-only vertical indigo postage stamp with a gold crescent and white scalloped border. Keep the reference's proportions and soft matte clay material. The character should be recognizably the same Hami seen from the requested angle.
Art direction: a carefully composed moment of action, with natural body orientation, purposeful gaze, and readable overlap between character and prop. Do not default to a straight-on passport portrait. Use the view specified below; do not add human fingers, feet or a new costume.
Props: cream (#F6EFE1 family), indigo/navy and pale gold accents only. Soft dimensional self-shading within the character and prop. No floor, external cast/contact/drop shadow, glow or halo. No text, UI, watermark or additional characters.
Output: 1:1 square PNG, genuine transparent alpha background, opaque character and prop. Whole intended silhouette fully visible with comfortable clear padding. Use approximately 80 percent of canvas for the main composition so the action reads at small UI sizes. No painted checkerboard or background rectangle.
{SCENE}
```

## 3. 채택한 장면 지시

### tip-saved

출력: [이미지](images/tip-saved.png)
참조: `hami-turnaround-transparent.png`

```text
ACTION: Hami gently lowers one large cream note into an OPEN shallow indigo archive tray. Freeze the moment just before the note rests inside. BODY AND GAZE: turn the body toward the tray, lean slightly forward, extend the nearer flipper with the note, look at the note with a modest satisfied expression. CAMERA: attractive front three-quarter view, slightly elevated so the inside and front face of the tray are both visible. COMPOSITION: Hami toward the upper-right and the tray across the lower-left foreground, connected by the reaching arm and diagonal note. Make a compact balanced triangular silhouette. The tray must be LARGE and simple, roughly half the composition width, with rounded corners, low straight walls, one broad open cavity and no lid. No ballot slot, markings, tick or celebration. The note and tray must remain distinct when the entire image is shown at 34 CSS pixels. UI MEANING: a useful tip is saved in the building's shared place.
```

### hami-mini

출력: [이미지](images/hami-mini.png)
참조: `hami-turnaround-transparent.png`

```text
ASSET OVERRIDE: This is a MINI ICON, not a full-body illustration. Show ONLY the head and upper body of the same Hami, facing front. Entire rounded head and forehead stamp must stay inside the square with a little clear margin. Use a clean deliberate bust-shaped lower silhouette, no ragged crop. Enlarge the face within the canvas so the eyes, blush and crescent stamp remain recognizable at 24–40 CSS pixels. No curled tail, no prop, no scene, minimal or no arms. Keep the same soft matte white material and gentle closed smile; simplify fine shading and details for small-size readability, never redesign the identity.
```

### bell

출력: [이미지](images/bell.png)
참조: `hami-turnaround-transparent.png`

```text
ACTION: Hami quietly cradles one small pale-gold bell with both flippers. BODY AND GAZE: relaxed gentle three-quarter turn, friendly calm expression, eyes softly directed toward the bell. CAMERA: mild three-quarter view, eye level. COMPOSITION: clear loop handle and large simple bell below the face, fully visible tail. No ringing motion, sound lines, red dot, urgency, confetti or checkmark. UI MEANING: optional notification choice, not permission already granted.
```

### clipboard

출력: [이미지](images/clipboard.png)
참조: `hami-turnaround-transparent.png`

```text
ACTION: Hami supports a cream clipboard with an indigo clip in one flipper and brings a short indigo pencil toward its blank surface with the other, just before writing. BODY AND GAZE: turn toward the clipboard and look at the pencil tip with a gently attentive expression. CAMERA: attractive mild three-quarter view so the board's surface and thickness are visible. COMPOSITION: pencil, clipboard and face form a readable triangle; do not hide the face or stamp. Rounded flippers without human fingers. No writing, checks, badges or approval marks. UI MEANING: preparing building guidance, not a completed inspection or verified ownership.
```

### lost

출력: [이미지](images/lost.png)
참조: `hami-turnaround-transparent.png`

```text
ACTION: Hami gently opens one empty flipper and tilts its head slightly as if asking where something went. BODY AND GAZE: mild inquisitive expression with a small neutral mouth, no panic, no tears, no exaggerated distress. CAMERA: mild front three-quarter view. COMPOSITION: simple uncluttered full-body silhouette with clear face and stamp, no props, text, question marks or error symbols. UI MEANING: unavailable building, expired link or loading failure; the interface text will explain the next action.
```

### wave

출력: [이미지](images/wave.png)
참조: `hami-turnaround-transparent.png`

```text
ACTION: Hami turns its body slightly and raises one flipper in a gentle welcoming wave toward the viewer. BODY AND GAZE: friendly closed smile and natural eye contact, relaxed other flipper. CAMERA: front three-quarter view rather than straight front. COMPOSITION: whole curled tail visible, arm separated clearly from head, simple silhouette, no props or confetti. UI MEANING: welcoming someone to the demonstration.
```

### tray-empty

출력: [이미지](images/tray-empty.png)
참조: `hami-turnaround-transparent.png + tip-saved.png`

```text
INPUT ROLES: image 1 is the canonical Hami turnaround for identity. Image 2 is tip-saved ONLY as the exact archive-tray prop reference. Match that same indigo open rectangular tray: same low thick walls, softly rounded corners, broad open interior, raised rim and matte finish. Do not copy the note or the note-insertion pose.
ACTION: Hami gently holds the EMPTY tray with both flippers and tilts its opening toward the viewer so it is clearly empty. BODY AND GAZE: calm welcoming mild three-quarter pose, looking softly toward the viewer without pressure or sadness. CAMERA: slightly elevated front three-quarter, compatible with tip-saved's tray perspective. COMPOSITION: large readable empty tray in front of the lower body, face and stamp unobscured, full tail and tray visible. No note, letter, paper, lid, slot, markings or check. UI MEANING: the same shared place is ready to hold future tips; currently it is empty.
```

### qr-sign

출력: [스마트폰을 가리키는 함이](images/qr-sign.png)

파일명은 로파이 연결을 위해 유지합니다. 현재 소품은 작은 상단 노치·평평한 남색 테두리·세로 화면을 가진 아이폰 13 느낌의 스마트폰입니다. 화면의 4×4 추상 격자는 실제 QR이 아닙니다.

새 생성 시에는 공통 프롬프트에 “스마트폰을 한 팔로 받치고 반대 팔로 화면을 가리키는 사선 구도, 화면에 4×4 남색 타일, 브랜드·문구·실제 QR 없음”을 장면 지시로 넣습니다. 아래는 현재 채택된 스마트폰 이미지의 실제 수정 요청입니다. 입력은 직전 안내판 생성 결과였으며 해당 미채택 파일은 정리했습니다.

<details>
<summary>현재 스마트폰 이미지의 실제 수정 프롬프트</summary>

```text
Edit the supplied Hami illustration. Preserve Hami's exact identity, three-quarter angle, face, cheerful expression, stamp, body, curled tail, and pointing gesture. Change ONLY the object being held and pointed at: replace the square cream sign with a simple modern smartphone seen from the FRONT at a very mild three-quarter angle.

The phone should have the familiar silhouette of an iPhone 13: a tall portrait rounded rectangle, flat slim dark-navy sides, thin dark bezel and a small centered top notch. It must clearly look like a phone rather than a sign or tablet. No Apple logo, no brand text, no camera cluster on the visible front. Keep the model stylized and simple in the same soft clay-rendered material as the mascot.

Show a warm cream screen with one sparse abstract 4-by-4 arrangement of broad navy tiles in its middle, suggesting an entry code interface without any real scannable QR. No QR finder patterns, no dense modules, no letters, numbers or real app interface. Hami's supporting flipper naturally holds the phone edge, and the pointing flipper indicates the SCREEN without covering it. Preserve the overall attractive composition while leaving the entire phone, whole character, forehead stamp and tail inside the square with clear padding.

Deliver a 1:1 square PNG with genuine transparent alpha background. Character and phone opaque. No ground, floor, external shadow, halo, glow, extra props, text or watermark. Soft dimensional shading only within Hami and the phone.
```

</details>

### splash-screen

출력: [스플래시 전체 화면](images/hami-splash-screen.png)
참조: 사용자 스플래시 구도 + `hami-turnaround-transparent.png` + `house.png`

개별 포즈가 아니라 00 화면 전용 9:19.5 합성입니다. design의 파일이 원본이고, 로파이는 `lofi/assets/splash/00-splash-art.png`에 같은 바이트의 현재 사용본만 둡니다.

```text
Use case: precise-object-edit
Asset type: mobile splash screen artwork for a 390×844 point (9:19.5) interface
Input images: Image 1 is the exact edit target and composition reference. Image 2 is the canonical Hami identity/turnaround reference. Image 3 is the canonical Hami house pose and prop reference.
Primary request: Rebuild Image 1 as a complete 9:19.5 vertical splash artwork. Preserve its soft sky-blue dreamy city-and-cloud composition, status bar, centered Wolgyeham brand, headline hierarchy, subtitle, moon and star accents. Replace only the central mascot with canonical Hami from Images 2 and 3.
Subject: one canonical Hami, warm white rounded ghost-like body, short flipper arms, curled tail, dark rounded eyes, pale pink cheeks, navy scalloped forehead stamp with gold crescent on the front, holding the same cream house-shaped card from Image 3 and waving gently. Full silhouette visible. Identity and proportions must match the references, not a generic ghost.
Composition: exact 9:19.5 portrait. Keep safe margins for iPhone status bar. Brand near upper quarter, headline and subtitle above the mascot, mascot centered in the middle-lower area, cloud city behind it, generous cloud space at the bottom. Extend the original scene vertically rather than stretching it. No cropping of headline, mascot, tail, or house prop.
Text (verbatim, Korean): "월계함"; "건물이 기억해요."; "집주인의 안내를 다음 세입자에게 이어주는 생활안내 서비스"; status time "9:41". Preserve correct Korean spelling exactly. No other text.
Style: polished soft 3D clay illustration, airy pastel blue sky, diffused cloud edges, warm glowing windows, navy and moon-gold brand accents.
Constraints: retain the exact overall visual idea of Image 1; use one Hami only; no envelope; canonical stamp shape and placement; no duplicated limbs; no watermark; no app buttons; no extra text.
```

## 4. 확정 선택

| 선택 | 파일 | 이유 |
|---|---|---|
| 기존 유지 | folder, guide, house, moving | 사용자 선택 |
| 기존 유지 | envelope | 작은 화면에서 단순한 봉투가 더 명확함 |
| 새 이미지 적용 | tip-saved, bell, clipboard, wave | 저장·선택·작성·환영 동작의 구분 |
| 신규 추가 | hami-mini, tray-empty, qr-sign, lost | 작은 자리·빈 상태·QR 진입·예외 장면 |
| 새 합성 적용 | hami-splash-screen | 정식 함이 외형을 반영한 00 전용 전체 화면 |
| 미채택 | house-ask | 거주 재확인은 house를 함께 쓰기로 결정 |

기존 유지 5종은 이번 새 프롬프트의 결과라고 표시하지 않습니다. 해당 이미지를 기준으로 유지하며, 이번에 생성했으나 선택하지 않은 후보의 요청은 보관하지 않습니다.

## 5. 검토와 전달

- 개별 포즈 13종은 모두 1254×1254 RGBA PNG이며 실제 투명 픽셀이 있습니다. 전체 실루엣과 소품을 확인했습니다.
- 스플래시 합성은 1170×2532 RGB PNG이며 390×844 HTML과 같은 9:19.5 비율입니다.
- 흰색·연한 남색 카드 위에서 비교했고, mini는 24/40, tip-saved는 34 크기로 확인했습니다.
- tip-saved와 tray-empty는 같은 남색 보관함을 공유합니다.
- design 원본과 lofi/assets/hami 사본의 바이트 일치를 확인합니다. lofi에는 확정 포즈 13장만 둡니다. 스플래시는 design 원본과 `lofi/assets/splash`의 현재 사용본이 바이트가 같아야 합니다.
- 파일명에 candidate를 남기지 않습니다. 13종의 화면 배치는 [README 4절](README.md#4-화면별-포즈)과 lofi/board.html의 ‘함이 에셋 배치’가 기준입니다.
