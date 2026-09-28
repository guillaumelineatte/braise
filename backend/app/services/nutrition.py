"""Vérif des macros : kcal estimées = 4 x protéines + 4 x glucides + 9 x lipides."""

from decimal import ROUND_HALF_UP, Decimal

WARN_DEVIATION_PCT = 15.0
BLOCK_DEVIATION_PCT = 40.0


def estimate_calories(protein: Decimal, carbs: Decimal, fat: Decimal) -> Decimal:
    return (4 * protein + 4 * carbs + 9 * fat).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)


def compute_nutrition(
    calories: Decimal | None,
    protein: Decimal | None,
    carbs: Decimal | None,
    fat: Decimal | None,
) -> tuple[Decimal | None, float | None]:
    """(kcal estimées, écart en %). Écart négatif = les macros donnent moins que la valeur saisie."""
    if protein is None or carbs is None or fat is None:
        return None, None
    estimated = estimate_calories(protein, carbs, fat)
    if calories is None or calories == 0:
        return estimated, None
    deviation = (estimated - calories) / calories * 100
    return estimated, float(deviation.quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))


def nutrition_warning(
    calories: Decimal | None,
    protein: Decimal | None,
    carbs: Decimal | None,
    fat: Decimal | None,
) -> tuple[Decimal, float] | None:
    estimated, deviation = compute_nutrition(calories, protein, carbs, fat)
    if estimated is None or deviation is None or abs(deviation) <= WARN_DEVIATION_PCT:
        return None
    return estimated, deviation
