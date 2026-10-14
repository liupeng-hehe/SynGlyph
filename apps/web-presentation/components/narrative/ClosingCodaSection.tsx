"use client";

import { hexToLab, labToHex } from "@/lib/labColor";
import { wordsForText } from "@/lib/paletteFieldV1";

import { useSmoothScroll } from "./SmoothScrollProvider";

/** Model hues, kept readable on the pale footer but with clearer chroma. */
function softenMineHex(hex: string): string {
  const lab = hexToLab(hex);
  const chroma = Math.hypot(lab.a, lab.b);
  const cap = 52;
  const scale = chroma > cap ? cap / chroma : 1;
  const L = 38 + (lab.L / 100) * 18;
  return labToHex(L, lab.a * scale, lab.b * scale);
}

function MineSentence({ text }: { text: string }) {
  return wordsForText(text).map((word, wordIndex) => {
    if (word.isSpace) {
      return <span key={`s-${wordIndex}`}>{word.glyphs[0]?.text}</span>;
    }
    return (
      <span key={`w-${wordIndex}`} className="closing-coda__word">
        {word.glyphs.map((glyph, index) => {
          if (!glyph.hex) return <span key={index}>{glyph.text}</span>;
          const fill = softenMineHex(glyph.hex);
          return (
            <span key={index} style={{ color: fill, WebkitTextFillColor: fill }}>
              {glyph.text}
            </span>
          );
        })}
      </span>
    );
  });
}

export function ClosingCodaSection() {
  const scroll = useSmoothScroll();

  return (
    <footer id="coda" className="closing-coda" aria-labelledby="coda-title">
      <div className="closing-coda__layout">
        <div className="closing-coda__brand-col">
          <button
            type="button"
            className="closing-coda__brand"
            aria-label="SynGlyph"
            onClick={() => scroll?.scrollTo("opening")}
          >
            <span className="closing-coda__logo" aria-hidden="true" />
          </button>
          <p className="closing-coda__contact m-0 font-body">
            <span className="closing-coda__contact-label">Contact</span>
            <a href="mailto:lvlvmei191@gmail.com">lvlvmei191@gmail.com</a>
          </p>
        </div>
        <div className="closing-coda__copy">
          <h2 id="coda-title" className="closing-coda__title m-0">
            <MineSentence text="The color is not on the page." />
          </h2>
          <p className="closing-coda__body m-0">
            <MineSentence text="It exists between what is seen and what is felt." />
          </p>
          <div className="closing-coda__actions">
            <button
              type="button"
              className="closing-coda__action font-body"
              onClick={() => scroll?.scrollTo("opening")}
            >
              Begin again
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
