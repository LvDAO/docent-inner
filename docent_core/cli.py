import os
import subprocess
from pathlib import Path

import typer

from docent._log_util import get_logger

logger = get_logger(__name__)
app = typer.Typer(add_completion=False)


def _run_worker_process(worker_id: int) -> None:
    """Spawnable worker entrypoint.

    Defined at module top-level so it is picklable under the 'spawn' start method
    used by macOS. Sets WORKER_ID in the environment and executes the worker loop.
    """
    os.environ["WORKER_ID"] = str(worker_id)
    from docent_core._worker import worker as docent_worker

    docent_worker.run()


@app.command(help="Run the server")
def server(
    host: str = typer.Option("0.0.0.0", help="Host address to bind to"),
    port: int = typer.Option(8888, help="Port to bind to"),
    workers: int = typer.Option(1, help="Number of worker processes"),
    reload: bool = typer.Option(False, help="Enable auto-reload on code changes"),
    timeout_graceful_shutdown: int | None = typer.Option(
        None, help="Timeout in seconds for graceful shutdown when reloading"
    ),
):
    # `cd` to the server directory; this is where we run uvicorn from (helps for autoreload)
    file_path = Path(__file__).parent.absolute()
    os.chdir(file_path)

    # Run the server with appropriate arguments
    cmd = ["uvicorn", "docent_core._server.api:asgi_app"]
    if host:
        cmd.extend(["--host", host])
    if port:
        cmd.extend(["--port", str(port)])
    if workers:
        cmd.extend(["--workers", str(workers)])
    if reload:
        cmd.append("--reload")
    if timeout_graceful_shutdown is not None:
        cmd.extend(["--timeout-graceful-shutdown", str(timeout_graceful_shutdown)])

    subprocess.run(cmd, check=True)


@app.command(help="Run a background job runner worker")
def worker(
    workers: int = typer.Option(1, help="Number of worker processes"),
):
    from docent_core._worker import worker as docent_worker

    if workers == 1:
        docent_worker.run()
    else:
        import signal
        import sys
        from multiprocessing import Process

        processes: list[Process] = []

        def signal_handler(signum: int, frame: object):
            logger.info("Stopping workers")
            for p in processes:
                if p.is_alive():
                    p.terminate()
            for p in processes:
                p.join(timeout=5)
                if p.is_alive():
                    p.kill()
            sys.exit(0)

        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)

        logger.info(f"Starting {workers} worker processes")

        for i in range(workers):
            worker_id = i + 1

            p = Process(target=_run_worker_process, args=(worker_id,))
            p.start()
            processes.append(p)
            logger.info(f"Started worker {worker_id} (PID: {p.pid})")

        try:
            for p in processes:
                p.join()
        except KeyboardInterrupt:
            signal_handler(signal.SIGINT, None)


def _get_web_environment(
    backend_url: str, internal_backend_url: str | None, same_origin: bool
) -> dict[str, str]:
    env = os.environ.copy()
    env.pop("NEXT_PUBLIC_INTERNAL_API_HOST", None)
    env["NEXT_PUBLIC_API_HOST"] = "" if same_origin else backend_url
    env["DOCENT_INTERNAL_API_HOST"] = internal_backend_url or backend_url
    return env


@app.command(help="Run the website")
def web(
    backend_url: str = typer.Option(
        "http://localhost:8888",
        help="Backend URL used by the Next.js API proxy",
    ),
    internal_backend_url: str | None = typer.Option(
        None,
        help=(
            "Optional backend URL override for Next.js server-side requests. "
            "Defaults to backend_url."
        ),
    ),
    same_origin: bool = typer.Option(
        True,
        "--same-origin/--cross-origin",
        help="Proxy browser API requests through the web origin",
    ),
    port: int = typer.Option(3000, help="Port to bind to"),
    build: bool = typer.Option(False, help="Build the web app"),
    install: bool = typer.Option(True, help="Install dependencies"),
):
    # `cd` to the web directory; this is where we run bun from
    file_path = Path(__file__).parent / "_web"
    os.chdir(file_path)

    env = _get_web_environment(backend_url, internal_backend_url, same_origin)

    # Install dependencies if requested
    if install:
        subprocess.run(["bun", "install", "--legacy-peer-deps"], check=True)

    # Either build or run in debug mode
    if build:
        subprocess.run(["bun", "run", "build"], env=env, check=True)
        subprocess.run(["bun", "run", "start", "--", "--port", str(port)], env=env, check=True)
    else:
        subprocess.run(["bun", "run", "dev", "--", "--port", str(port)], env=env, check=True)


if __name__ == "__main__":
    app()
