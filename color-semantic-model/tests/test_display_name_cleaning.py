"""Tests for display name cleaning."""

from __future__ import annotations

from colorrec.colorspace import clean_display_name, is_weird_display_name


def test_deep_purple_duplicate_hex() -> None:
    assert clean_display_name("Deep Purple #6F5B72 #6F5B72", "#6F5B72") == "Deep Purple"


def test_periwinkle_paren_hex() -> None:
    assert clean_display_name("Periwinkle (#B07BE3) #B07BE3", "#B07BE3") == "Periwinkle"


def test_hex_code_with_semantic_paren() -> None:
    assert clean_display_name("F9D7A7 (Fuchsia Pinkish Beige)", "#F9D7A7") == "Fuchsia Pinkish Beige"


def test_glued_name_hex() -> None:
    assert clean_display_name("Teal3DCA98", "#3DCA98") == "Teal"


def test_remove_hexadecimal_label() -> None:
    assert clean_display_name("Wine Red (Hexadecimal) #B85282", "#B85282") == "Wine Red"


def test_is_weird_display_name() -> None:
    assert is_weird_display_name("Deep Purple #6F5B72 #6F5B72")
    assert not is_weird_display_name("cloud blue")
