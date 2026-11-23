"""ブラウザテストの入出力を MuPDF と Tesseract で検査する。"""

import argparse
from io import BytesIO
from pathlib import Path
import subprocess

import pymupdf
from PIL import Image


def ocr(image, executable, language="eng"):
    data = BytesIO()
    image.save(data, format="PNG")
    result = subprocess.run(
        [executable, "stdin", "stdout", "-l", language, "--psm", "11"],
        input=data.getvalue(), capture_output=True, check=True,
    )
    return result.stdout.decode()


def image_resource(document, page):
    images = page.get_images(full=True)
    assert len(images) == 1
    return Image.open(BytesIO(document.extract_image(images[0][0])["image"])).convert("RGB")


def check_black_region(image, box):
    width, height = image.size
    area = image.crop(tuple(round(value * side) for value, side in zip(box, (width, height, width, height))))
    assert area.getextrema() == ((0, 0), (0, 0), (0, 0))


def check_export(original, tesseract):
    with pymupdf.open(original) as source, pymupdf.open(original.with_name("exported.pdf")) as output:
        assert "SECRET ALPHA 832" in source[0].get_text()
        assert source.metadata["author"] == "SECRET METADATA 077"
        assert source.embfile_count() == 1
        assert list(source[0].widgets())
        assert list(source[0].annots())
        original_scan = image_resource(source, source[1])
        assert "SECRET SCAN 907" in ocr(original_scan, tesseract)
        assert "山田花子" in "".join(ocr(original_scan, tesseract, "jpn").split())

        assert len(output) == 3
        assert output.embfile_count() == 0
        assert not any(output.metadata[key] for key in (
            "author", "title", "subject", "keywords", "creator", "producer",
        ))
        assert not output.get_xml_metadata()
        for page in output:
            assert not page.get_text().strip()
            assert not list(page.annots())
            assert not list(page.widgets())
            assert not page.get_links()

        first, second, third = (image_resource(output, page) for page in output)
        check_black_region(first, (.104, .209, .886, .411))
        check_black_region(second, (.074, .104, .366, .696))
        second = second.rotate(90, expand=True)
        text1 = ocr(first, tesseract)
        text2 = ocr(second, tesseract)
        text3 = ocr(third, tesseract)
        assert "KEEP HEADER" in text1 and "KEEP FOOTER" in text1
        assert "KEEP ROTATED" in text2
        assert "KEEP LAST PAGE" in text3
        assert "SECRET" not in text1 + text2 + text3
        assert "山田花子" not in "".join(ocr(second, tesseract, "jpn").split())


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("original", type=Path, help="ブラウザテストが出力した input.pdf")
    parser.add_argument("--tesseract", default="tesseract")
    args = parser.parse_args()
    check_export(args.original, args.tesseract)
    print("MuPDF の構造・画素検査と、Tesseract の日英 OCR 検査に合格しました。")
