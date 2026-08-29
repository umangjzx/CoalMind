"""Ingestion layer: raw document bytes -> classified, page-segmented text with
word-level bounding boxes (PDF text layer, or Tesseract OCR when there is none).
"""

from app.services.ingestion.classifier import classify
from app.services.ingestion.page_extract import Page, Word, extract_pages

__all__ = ["Page", "Word", "extract_pages", "classify"]
