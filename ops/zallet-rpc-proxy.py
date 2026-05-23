#!/usr/bin/env python3
"""Small zallet JSON-RPC proxy with a read-only wallet DB fallback.

zallet 0.1.0-alpha.3 can broadcast Orchard memo transactions successfully while
`z_viewtransaction` fails on some wallet schemas. The web app runs on Railway and
cannot read the wallet SQLite file directly, so this proxy runs next to zallet,
forwards normal RPC calls, and answers `z_viewtransaction` from wallet.db only
when the upstream zallet response hits that known alpha fetch bug.
"""

from __future__ import annotations

import argparse
import binascii
import json
import sqlite3
import sys
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any


BUG_MARKERS = ("no such column: tx", "Invalid memo data", "InvalidUtf8")
MEMO_LEN = 512


def expand_memo(memo: bytes) -> str:
    if len(memo) > MEMO_LEN:
        raise ValueError(f"memo length {len(memo)} exceeds {MEMO_LEN}")
    return memo.ljust(MEMO_LEN, b"\x00").hex()


def txid_to_db_bytes(txid_hex: str) -> bytes:
    raw = bytes.fromhex(txid_hex)
    if len(raw) != 32:
        raise ValueError(f"txid decoded to {len(raw)} bytes; expected 32")
    return raw[::-1]


def fetch_from_wallet_db(wallet_db: str, txid_hex: str) -> dict[str, Any]:
    db_txid = txid_to_db_bytes(txid_hex)
    query = """
        SELECT mined_height, memo
        FROM (
          SELECT t.mined_height AS mined_height, sn.output_index AS output_index, sn.memo AS memo
          FROM transactions t
          JOIN sent_notes sn ON sn.transaction_id = t.id_tx
          WHERE t.txid = ?
          UNION ALL
          SELECT t.mined_height AS mined_height, orn.action_index AS output_index, orn.memo AS memo
          FROM transactions t
          JOIN orchard_received_notes orn ON orn.transaction_id = t.id_tx
          WHERE t.txid = ?
        )
        WHERE memo IS NOT NULL
          AND length(memo) > 0
          AND substr(memo, 1, 2) = x'5A43'
        ORDER BY output_index ASC
        LIMIT 1
    """
    with sqlite3.connect(f"file:{wallet_db}?mode=ro", uri=True) as conn:
        row = conn.execute(query, (db_txid, db_txid)).fetchone()

    if row is None:
        raise LookupError("wallet DB fallback did not find a ZecTime memo")

    height, memo = row
    if height is None:
        raise LookupError("wallet DB fallback found tx before mined height")
    if height < 0:
        raise LookupError(f"wallet DB fallback returned negative mined height {height}")

    return {
        "status": "mined",
        "height": int(height),
        "outputs": [{"pool": "orchard", "memo": expand_memo(memo)}],
    }


def rpc_error(request_id: Any, message: str, code: int = -20) -> bytes:
    return json.dumps(
        {"jsonrpc": "2.0", "id": request_id, "result": None, "error": {"code": code, "message": message}},
        separators=(",", ":"),
    ).encode("utf-8")


class ProxyHandler(BaseHTTPRequestHandler):
    upstream_url: str
    wallet_db: str
    max_body_bytes: int

    def log_message(self, fmt: str, *args: Any) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def do_POST(self) -> None:
        try:
            length = int(self.headers.get("content-length", "0"))
        except ValueError:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b"invalid Content-Length")
            return
        if length < 0 or length > self.max_body_bytes:
            self.send_response(413)
            self.end_headers()
            self.wfile.write(b"request body too large")
            return
        request_body = self.rfile.read(length)
        try:
            request_json = json.loads(request_body)
        except json.JSONDecodeError:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b"invalid JSON")
            return

        upstream_status, upstream_body = self.forward(request_body)
        response_body = upstream_body

        if self.should_fallback(request_json, upstream_body):
            response_body = self.wallet_fallback(request_json)
            upstream_status = 200

        self.send_response(upstream_status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(response_body)))
        self.end_headers()
        self.wfile.write(response_body)

    def forward(self, body: bytes) -> tuple[int, bytes]:
        headers = {"content-type": "application/json"}
        auth = self.headers.get("authorization")
        if auth:
            headers["authorization"] = auth

        request = urllib.request.Request(
            self.upstream_url,
            data=body,
            headers=headers,
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                return response.status, response.read()
        except urllib.error.HTTPError as error:
            return error.code, error.read()
        except urllib.error.URLError as error:
            return 502, rpc_error(None, f"upstream zallet unavailable: {error}")

    def should_fallback(self, request_json: Any, upstream_body: bytes) -> bool:
        if not isinstance(request_json, dict):
            return False
        if request_json.get("method") != "z_viewtransaction":
            return False

        try:
            response_json = json.loads(upstream_body)
        except json.JSONDecodeError:
            return False

        error = response_json.get("error")
        if not isinstance(error, dict):
            return False

        message = str(error.get("message", ""))
        return any(marker in message for marker in BUG_MARKERS)

    def wallet_fallback(self, request_json: dict[str, Any]) -> bytes:
        request_id = request_json.get("id")
        params = request_json.get("params")
        if not isinstance(params, list) or not params or not isinstance(params[0], str):
            return rpc_error(request_id, "z_viewtransaction requires txid param", -32602)

        try:
            result = fetch_from_wallet_db(self.wallet_db, params[0])
            return json.dumps(
                {"jsonrpc": "2.0", "id": request_id, "result": result, "error": None},
                separators=(",", ":"),
            ).encode("utf-8")
        except (binascii.Error, ValueError, LookupError, sqlite3.Error) as error:
            return rpc_error(request_id, f"wallet DB fallback failed: {error}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--listen", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=29232)
    parser.add_argument("--upstream", default="http://127.0.0.1:28232/")
    parser.add_argument("--wallet-db", default="/media/zebra-ssd/zallet-data/wallet.db")
    parser.add_argument("--max-body-bytes", type=int, default=1024 * 1024)
    parser.add_argument(
        "--allow-remote",
        action="store_true",
        help="Allow non-loopback listen addresses. Use only behind a firewall or private tunnel.",
    )
    args = parser.parse_args()

    if not args.allow_remote and not is_loopback_bind(args.listen):
        parser.error("refusing non-loopback --listen without --allow-remote")
    if args.max_body_bytes < 1:
        parser.error("--max-body-bytes must be positive")

    ProxyHandler.upstream_url = args.upstream
    ProxyHandler.wallet_db = args.wallet_db
    ProxyHandler.max_body_bytes = args.max_body_bytes
    server = ThreadingHTTPServer((args.listen, args.port), ProxyHandler)
    print(
        f"zallet RPC proxy listening on {args.listen}:{args.port}, upstream={args.upstream}",
        flush=True,
    )
    server.serve_forever()


def is_loopback_bind(host: str) -> bool:
    return host in {"127.0.0.1", "::1", "localhost"}


if __name__ == "__main__":
    main()
