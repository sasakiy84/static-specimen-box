"""ブラウザテストの入出力を MuPDF と Tesseract で検査する。"""

import argparse
from io import BytesIO
from pathlib import Path
import subprocess

import pymupdf
from PIL import Image


def render(page):
    pixmap = page.get_pixmap(matrix=pymupdf.Matrix(3, 3), alpha=False)
    return Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)


def ocr(image, executable):
    data = BytesIO()
    image.save(data, format="PNG")
    result = subprocess.run(
        [executable, "stdin", "stdout", "-l", "eng", "--psm", "11"],
        input=data.getvalue(), capture_output=True, check=True,
    )
    return result.stdout.decode()


def check_black_region(image, box):
    width, height = image.size
    area = image.crop(tuple(round(value * side) for value, side in zip(box, (width, height, width, height))))
    assert area.getextrema() == ((0, 0), (0, 0), (0, 0))


def check_export(original, tesseract):
    with pymupdf.open(original) as source, pymupdf.open(original.with_name("exported.pdf")) as output:
        secrets = ("SECRET ALPHA 832", "SECRET ROTATED 902", "SECRET INVISIBLE 744")
        assert all(secret in "".join(page.get_text() for page in source) for secret in secrets)
        assert source.metadata["author"] == "SECRET METADATA 077"
        assert source.embfile_count() == 1
        assert list(source[0].widgets())
        assert list(source[0].annots())

        assert len(output) == 3
        assert output.embfile_count() == 0
        assert not any(output.metadata[key] for key in (
            "author", "title", "subject", "keywords", "creator", "producer",
        ))
        assert not output.get_xml_metadata()
        for page in output:
            assert not list(page.annots())
            assert not list(page.widgets())
            assert not page.get_links()

        first, second, third = output
        assert not first.get_images() and not second.get_images()
        assert len(third.get_images()) == 1
        assert " ".join(first.get_text().split()) == "KEEP HEADER KEEP FOOTER Left Right"
        assert second.get_text().strip() == "KEEP ROTATED"
        assert third.get_text().strip() == "KEEP LAST PAGE"
        assert not any(secret in "".join(page.get_text() for page in output) for secret in secrets)

        check_black_region(render(first), (.125, .209, .592, .411))
        check_black_region(render(second), (.074, .104, .366, .696))
        assert "SECRET ALPHA" in ocr(render(source[0]), tesseract)
        assert "SECRET ROTATED 902" in ocr(render(source[1]).rotate(90, expand=True), tesseract)
        assert "SECRET" not in ocr(render(first), tesseract) + ocr(render(second).rotate(90, expand=True), tesseract)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("original", type=Path, help="ブラウザテストが出力した input.pdf")
    parser.add_argument("--tesseract", default="tesseract")
    args = parser.parse_args()
    check_export(args.original, args.tesseract)
    print("MuPDF の構造・文字抽出・描画と Tesseract の OCR 検査に合格しました。")
