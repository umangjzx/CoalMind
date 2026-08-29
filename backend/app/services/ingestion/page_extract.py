"""Turn document bytes into a list of `Page`s with word-level geometry.

Strategy per PDF page:
  1. Try the embedded text layer via pdfplumber (fast, exact coordinates, unit = pt).
  2. If the page has essentially no extractable text, rasterize it and run Tesseract
     OCR (`image_to_data`) to recover words + pixel boxes + per-word OCR confidence.

Image files (png/jpg/tiff) go straight to OCR. Everything downstream only sees
`Page`/`Word` and never has to care which path produced them — except that
`Word.ocr_conf` is < 1.0 for OCR output, which the extractor uses to damp confidence.
"""

from __future__ import annotations

import io
from dataclasses import dataclass, field

from app.core.config import get_settings
from app.core.logging import get_logger

log = get_logger(__name__)

# a page with fewer than this many text-layer chars is treated as "needs OCR"
_MIN_TEXT_CHARS = 20
_OCR_DPI = 200

# cache of Tesseract lang strings we've already proven usable on this host
_LANG_OK: dict[str, str] = {}


def _ocr_lang() -> str:
    """Resolve the configured OCR language string, degrading to a subset that is
    actually installed (e.g. ``eng+hin`` -> ``eng`` when the Hindi pack is absent).
    """
    want = (get_settings().ocr_languages or "eng").strip() or "eng"
    if want in _LANG_OK:
        return _LANG_OK[want]
    try:
        import pytesseract

        have = set(pytesseract.get_languages(config=""))
        usable = [c for c in want.split("+") if c in have] or ["eng"]
        got = "+".join(usable)
        if got != want:
            log.warning("OCR languages %r not all installed; using %r", want, got)
    except Exception as exc:  # noqa: BLE001 — never let language probing break ingest
        log.warning("could not probe Tesseract languages (%s); using 'eng'", exc)
        got = "eng"
    _LANG_OK[want] = got
    return got


@dataclass(slots=True)
class Word:
    text: str
    x0: float
    y0: float
    x1: float
    y1: float
    ocr_conf: float = 1.0  # 1.0 for text-layer words; 0..1 for OCR words


@dataclass(slots=True)
class Page:
    page_no: int  # 1-based
    width: float
    height: float
    unit: str  # "pt" (pdf text layer) | "px" (ocr)
    source_kind: str  # "pdf_text" | "ocr"
    text: str
    words: list[Word] = field(default_factory=list)
    dpi: int | None = None

    def lines(self) -> list[str]:
        return [ln for ln in self.text.splitlines() if ln.strip()]


def extract_pages(data: bytes, content_type: str, *, filename: str = "") -> list[Page]:
    kind = _guess_kind(content_type, filename)
    if kind == "pdf":
        return _pdf_pages(data)
    if kind == "image":
        return [_ocr_image(data, page_no=1)]
    # docx/xlsx/txt fallbacks are added alongside their parsers in a later pass;
    # for now treat unknown as plain text.
    text = data.decode("utf-8", errors="replace")
    return [Page(1, 0.0, 0.0, "pt", "pdf_text", text, [])]


def _guess_kind(content_type: str, filename: str) -> str:
    ct = (content_type or "").lower()
    fn = filename.lower()
    if "pdf" in ct or fn.endswith(".pdf"):
        return "pdf"
    if ct.startswith("image/") or fn.endswith((".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp")):
        return "image"
    return "text"


def _pdf_pages(data: bytes) -> list[Page]:
    import pdfplumber

    pages: list[Page] = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for i, p in enumerate(pdf.pages, start=1):
            raw = p.extract_text() or ""
            if len(raw.strip()) >= _MIN_TEXT_CHARS:
                words = [
                    Word(w["text"], float(w["x0"]), float(w["top"]),
                         float(w["x1"]), float(w["bottom"]))
                    for w in p.extract_words(use_text_flow=True, keep_blank_chars=False)
                ]
                pages.append(
                    Page(i, float(p.width), float(p.height), "pt", "pdf_text", raw, words)
                )
            else:
                log.info("page %d has no text layer -> OCR", i)
                try:
                    im = p.to_image(resolution=_OCR_DPI).original
                    pages.append(_ocr_pil(im, page_no=i))
                except Exception as exc:  # noqa: BLE001
                    log.warning("OCR failed on page %d: %s", i, exc)
                    pages.append(Page(i, float(p.width), float(p.height), "pt", "pdf_text", "", []))
    return pages


def _ocr_image(data: bytes, *, page_no: int) -> Page:
    from PIL import Image

    return _ocr_pil(Image.open(io.BytesIO(data)), page_no=page_no)


def _ocr_pil(im, *, page_no: int) -> Page:
    import pytesseract
    from PIL import Image

    if im.mode != "RGB":
        im = im.convert("RGB")
    lang = _ocr_lang()
    try:
        data = pytesseract.image_to_data(
            im, lang=lang, output_type=pytesseract.Output.DICT
        )
    except pytesseract.TesseractError as exc:
        # a lang pack that get_languages() listed but that still fails to load
        log.warning("OCR with lang=%r failed (%s); retrying with 'eng'", lang, exc)
        _LANG_OK[(get_settings().ocr_languages or "eng").strip()] = "eng"
        data = pytesseract.image_to_data(
            im, lang="eng", output_type=pytesseract.Output.DICT
        )
    words: list[Word] = []
    line_parts: dict[tuple, list[str]] = {}
    for j, txt in enumerate(data["text"]):
        txt = (txt or "").strip()
        if not txt:
            continue
        try:
            conf = max(0.0, float(data["conf"][j])) / 100.0
        except (ValueError, TypeError):
            conf = 0.0
        x, y, w, h = (data["left"][j], data["top"][j], data["width"][j], data["height"][j])
        words.append(Word(txt, float(x), float(y), float(x + w), float(y + h), ocr_conf=conf))
        key = (data["block_num"][j], data["par_num"][j], data["line_num"][j])
        line_parts.setdefault(key, []).append(txt)
    text = "\n".join(" ".join(parts) for _, parts in sorted(line_parts.items()))
    w_px, h_px = (im.size if isinstance(im, Image.Image) else (0, 0))
    return Page(page_no, float(w_px), float(h_px), "px", "ocr", text, words, dpi=_OCR_DPI)
