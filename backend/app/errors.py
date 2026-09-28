"""Format des erreurs ({detail, errors: [{field, message}]}) et traduction des messages Pydantic."""

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("braise.api")


class ApiError(Exception):
    def __init__(
        self,
        status_code: int,
        detail: str,
        errors: list[dict[str, str]] | None = None,
        **extra: Any,
    ) -> None:
        self.status_code = status_code
        self.detail = detail
        self.errors = errors
        self.extra = extra

    def payload(self) -> dict[str, Any]:
        body: dict[str, Any] = {"detail": self.detail}
        if self.errors is not None:
            body["errors"] = self.errors
        body.update(self.extra)
        return body


def field_error(field: str, message: str, detail: str = "invalid") -> ApiError:
    return ApiError(422, detail, errors=[{"field": field, "message": message}])


_MESSAGES = {
    "missing": "Ce champ est requis.",
    "string_type": "Texte attendu.",
    "int_type": "Nombre entier attendu.",
    "int_parsing": "Nombre entier attendu.",
    "int_from_float": "Nombre entier attendu.",
    "float_parsing": "Nombre attendu.",
    "float_type": "Nombre attendu.",
    "decimal_parsing": "Nombre attendu.",
    "decimal_type": "Nombre attendu.",
    "bool_parsing": "Valeur oui/non attendue.",
    "bool_type": "Valeur oui/non attendue.",
    "enum": "Valeur non reconnue.",
    "list_type": "Liste attendue.",
    "json_invalid": "JSON invalide.",
    "model_attributes_type": "Objet attendu.",
    "dict_type": "Objet attendu.",
}


def _message(err: dict[str, Any]) -> str:
    kind = err.get("type", "")
    ctx = err.get("ctx") or {}
    if kind == "string_too_short":
        return (
            "Ce champ ne peut pas être vide."
            if ctx.get("min_length") == 1
            else f"Au moins {ctx.get('min_length')} caractères."
        )
    if kind == "string_too_long":
        return f"{ctx.get('max_length')} caractères au maximum."
    if kind == "too_short":
        return f"Au moins {ctx.get('min_length')} élément(s)."
    if kind == "too_long":
        return f"{ctx.get('max_length')} éléments au maximum."
    if kind == "greater_than_equal":
        return "Doit être positif." if str(ctx.get("ge")) == "0" else f"Doit être supérieur ou égal à {ctx.get('ge')}."
    if kind == "greater_than":
        return f"Doit être supérieur à {ctx.get('gt')}."
    if kind == "less_than_equal":
        return f"Doit être inférieur ou égal à {ctx.get('le')}."
    if kind == "less_than":
        return f"Doit être inférieur à {ctx.get('lt')}."
    if kind == "string_pattern_mismatch" and ctx.get("pattern", "").startswith("^[^@"):
        return "Adresse e-mail invalide."
    if kind == "value_error":
        message = str(ctx.get("error") or err.get("msg", ""))
        if "email" in message.lower():
            return "Adresse e-mail invalide."
        return message.removeprefix("Value error, ")
    return _MESSAGES.get(kind, err.get("msg", "Valeur invalide."))


def _field(loc: tuple[Any, ...]) -> str:
    parts = list(loc)
    if parts and parts[0] in ("body", "query", "path", "header", "form"):
        parts = parts[1:]
    # Pydantic glisse parfois le nom du type dans loc (unions, validateurs), on ne garde que les champs
    parts = [
        p for p in parts if not (isinstance(p, str) and (p[:1].isupper() or "[" in p or p.startswith("function-")))
    ]
    return ".".join(str(p) for p in parts) or "body"


def validation_errors(exc: RequestValidationError) -> list[dict[str, str]]:
    seen: set[str] = set()
    errors: list[dict[str, str]] = []
    for err in exc.errors():
        field = _field(tuple(err.get("loc", ())))
        if field in seen:
            continue
        seen.add(field)
        errors.append({"field": field, "message": _message(err)})
    return errors


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(exc.payload(), status_code=exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse({"detail": "invalid", "errors": validation_errors(exc)}, status_code=422)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return JSONResponse({"detail": exc.detail}, status_code=exc.status_code, headers=getattr(exc, "headers", None))

    @app.exception_handler(IntegrityError)
    async def _integrity(_: Request, exc: IntegrityError) -> JSONResponse:
        logger.warning("Conflit d'intégrité : %s", exc.orig)
        return JSONResponse({"detail": "Conflit avec des données existantes."}, status_code=409)
