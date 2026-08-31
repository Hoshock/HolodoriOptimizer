# 20260831 モバイル UI デザイン調査(UI 再設計の根拠)

プロのデザイナー水準の CSS 事例調査の要点と、そこから決めた本ツールのデザイントークン。陳腐化を許容する時点スナップショット。

## 要点(出典つきの定石)

- **攻略 DB の見た目の正体**: 地は白+1px 薄罫線+影ほぼなし。色は「アクセント 1 色+意味色(属性・レア度)」に限定し、**意味色は小さな面積(バッジ・枠)に濃く**使う。地色には使わない。
- **「AI デザイン」の典型(使用禁止)**: 紫系・パステル多色グラデーション、**カード片側の色ストライプ**(最も分かりやすい AI 生成の徴)、全要素同一の角丸+影、グラスモーフィズム、装飾絵文字、意味のないアニメーション。出典: [Mohit Phogat](https://mohitphogat.medium.com/ai-design-slop-why-every-ai-built-interface-looks-the-same-and-how-to-fix-it-bf874e0b470c) / [925 Studios](https://www.925studios.co/blog/ai-slop-design-tells) / [Impeccable](https://impeccable.style/slop/) ほか。
- **チップの単一/複数の区別**: 同一画面のチップ群はどちらかに統一し、**選択状態は「塗り+先頭チェックマーク」**で色以外でも示す([M3 Chips](https://m3.material.io/components/chips/guidelines)、高さ 32、選択=塗り+✓)。**2〜5 択はセグメンテッドコントロール**([HIG](https://developer.apple.com/design/human-interface-guidelines/segmented-controls) は iPhone で 5 個以下と明記)。15 個の単一選択は横スクロール 1 行チップ(右端を半分見切らせ+端フェード。[Baymard](https://baymard.com/blog/how-to-design-applied-filters))。
- **等高グリッド**: 固定 height は脆い。grid の stretch+可変テキストを `line-clamp` + `min-height`(行数固定)に限定する。内部行まで揃えるなら `subgrid`([CSS-Tricks](https://css-tricks.com/fixed-height-cards-more-fragile-than-they-look/))。
- **モバイルシート**: 作業型の選択はフルスクリーンシート。`100dvh` + `viewport-fit=cover` + フッタに `env(safe-area-inset-bottom)`。背景スクロールは body `position:fixed` +開閉時の scroll 退避/復元で封じる([CSS-Tricks](https://css-tricks.com/prevent-page-scrolling-when-a-modal-is-open/))。**input は 16px 未満にしない**(iOS の自動ズーム)。タップ対象 44px 以上。
- **黄色の扱い**: 黄地+白文字は WCAG 不合格。**淡い黄地+濃色文字**のペアでのみ使う([Stéphanie Walter](https://stephaniewalter.design/blog/yellow-purple-and-the-myth-of-accessibility-limits-color-palettes/))。3 タイプ色とも「淡地+濃文字」方式に統一。
- **60-30-10**: 地 60(無彩)・面 30(白)・アクセント 10(CTA と意味色)。CTA は意味色と競合しないインク色 1 色。
- 順位バッジの金銀銅: 金 #D1AF28 / 銀 #ABA8A8 / 銅 #D18858([makeshop](https://www.support.makeshop.jp/design/?p=25980))。4 位以下は数字のみ(tabular-nums)。

## 採用トークン

`src/style.css` の `:root` が正(bg #F6F4F0 / surface #FFF / ink #23303D / ink-2 #5C6672 / line #E4E0D8 / link #2B5FAB、タイプ 3 色は各「基準/tint/text」の 3 段、radius 6/12/999、影 2 種のみ)。spacing は 8pt グリッド(画面左右 16px・タイル gap 8px・セクション間 32px)、本文 15px・ラベル 13px・入力 16px、スコアは `tabular-nums`。
