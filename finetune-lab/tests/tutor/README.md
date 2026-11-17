# Teaching-tutor tests

Playwright and API checks for the local teaching tutor.

- MiniMax is always mocked (`mock_minimax.py` on 127.0.0.1:8799). Never point these tests at a real API or log a real key.
- The teaching service (127.0.0.1:8787) should use a test secrets path via `YISUAN_TUTOR_SECRETS`, not a personal key.
- The frontend must talk only to 127.0.0.1:8787 (`/tutor-api`).

Run the API tests:

    python test_tutor_api.py

Run the Playwright suite (Python 3.12 + Playwright), after Vite is on 5173 and the teaching service is on 8787:

    python e2e_tutor.py
