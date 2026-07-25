# Global Connects Lead Engine — common developer commands.
# Usage: `make <target>` from the backend/ directory.

.DEFAULT_GOAL := help
.PHONY: help install test run seed migrate migration docker docker-down lint clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

install: ## Install Python dependencies
	pip install -r requirements.txt

test: ## Run the test suite (SQLite, no external services)
	python3 -m pytest -q

run: ## Run the API locally with autoreload (SQLite by default)
	DATABASE_URL=$${DATABASE_URL:-sqlite:///./leadengine.db} \
		python3 -m uvicorn app.main:app --reload

seed: ## Load the sample leads
	DATABASE_URL=$${DATABASE_URL:-sqlite:///./leadengine.db} \
		python3 -m scripts.seed

migrate: ## Apply Alembic migrations (upgrade head)
	DATABASE_URL=$${DATABASE_URL:-sqlite:///./leadengine.db} \
		python3 -m alembic upgrade head

migration: ## Autogenerate a migration: make migration m="add x"
	DATABASE_URL=$${DATABASE_URL:-sqlite:///./leadengine.db} \
		python3 -m alembic revision --autogenerate -m "$(m)"

docker: ## Build and start Postgres + API via docker-compose
	docker compose up --build

docker-down: ## Stop and remove docker-compose services
	docker compose down

clean: ## Remove local caches and dev databases
	rm -rf .pytest_cache **/__pycache__ *.db
