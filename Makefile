# Convenience wrapper around scripts/dev.py (Linux/macOS/WSL).
# On Windows without `make`, use:  python scripts/dev.py <task>
.PHONY: up down migrate seed corpus api web test lint bootstrap

up:        ; python scripts/dev.py up
down:      ; python scripts/dev.py down
migrate:   ; python scripts/dev.py migrate
seed:      ; python scripts/dev.py seed
corpus:    ; python scripts/dev.py corpus
api:       ; python scripts/dev.py api
web:       ; python scripts/dev.py web
test:      ; python scripts/dev.py test
lint:      ; python scripts/dev.py lint
bootstrap: ; python scripts/dev.py bootstrap
