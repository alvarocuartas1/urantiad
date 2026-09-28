"""Administrative commands.

Usage:
    uv run python -m app.cli create-admin [--username admin] [--full-name "Administrador"]
"""

import argparse
import sys
from getpass import getpass

from pydantic import ValidationError

from app.core.database import SessionLocal
from app.core.errors import AppError
from app.services import user_service


def create_admin_command(username: str | None, full_name: str | None) -> int:
    username = username or input("Usuario: ")
    full_name = full_name or input("Nombre completo: ")
    password = getpass("Contraseña (mínimo 8 caracteres): ")
    if password != getpass("Confirme la contraseña: "):
        print("Las contraseñas no coinciden.", file=sys.stderr)
        return 1

    with SessionLocal() as db:
        try:
            user = user_service.create_admin(db, username, full_name, password)
        except ValidationError as exc:
            for error in exc.errors():
                field = ".".join(str(part) for part in error["loc"])
                print(f"{field}: {error['msg']}", file=sys.stderr)
            return 1
        except AppError as exc:
            print(exc.detail, file=sys.stderr)
            return 1
    print(f"Administrador '{user.username}' creado correctamente.")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="app.cli", description="Comandos de URANTIAD.")
    commands = parser.add_subparsers(dest="command", required=True)
    create_admin = commands.add_parser("create-admin", help="Crea un usuario administrador.")
    create_admin.add_argument("--username")
    create_admin.add_argument("--full-name")

    args = parser.parse_args(argv)
    if args.command == "create-admin":
        return create_admin_command(args.username, args.full_name)
    return 1


if __name__ == "__main__":
    sys.exit(main())
